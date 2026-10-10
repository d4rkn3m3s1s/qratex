/**
 * Günlük iş yürütücüsü (denetim K2 + Y1 · P0-40).
 *
 * "Tek uyanış, bütçeli iş, görünür sonuç":
 *  - Bütün periyodik işler TEK günlük tetikleyiciden (`/api/cron/daily`) çalışır; Inngest'te
 *    periyodik cron YOKTUR (Neon compute'u günde bir kez uyanır).
 *  - Global son tarih (`deadlineAt`): kalan bütçe işin asgari ihtiyacından azsa iş BAŞLATILMAZ,
 *    `skipped_budget` yazılır. Her işin kendi zaman aşımı vardır; aşarsa `timeout` sayılır.
 *  - Öncelik: ekonomi kapanışları → temizlik/saklama → üretim → teslimat → AI.
 *  - Haftalık/aylık işler "son başarılı koşu, son sınırdan eski mi?" kuralıyla seçilir; böylece
 *    Pazartesi kaçırılan haftalık iş Salı günü telafi edilir, başarılı iş aynı dönemde tekrar
 *    çalışmaz (manuel yeniden tetiklemede yan etki tekrarlanmaz).
 *  - Sonuç: herhangi bir iş `failed`/`timeout` ise genel durum `failed`; bütçe yüzünden atlanan
 *    varsa `partial`. Orkestratör bu ikisinde non-2xx döner ve heartbeat'e "fail" gönderir.
 *
 * Bu modül saf mantıktır (Prisma/Next bağımlılığı yok) — kalıcılık ve HTTP `cron-state.ts` ile
 * `app/api/cron/daily/route.ts`'te.
 */

export type JobCadence =
  | { kind: 'daily' }
  /** weekday: 0=Pazar … 6=Cumartesi (UTC). */
  | { kind: 'weekly'; weekday: number }
  /** day: ayın günü 1-28 (UTC). */
  | { kind: 'monthly'; day: number };

export interface CronJobContext {
  /** Global son tarih (epoch ms). İş uzun döngülerde buna bakıp erken dönebilir. */
  deadlineAt: number;
  /** Bu işin kendi son tarihi (epoch ms) = min(başlangıç + timeoutMs, deadlineAt). */
  jobDeadlineAt: number;
  now: Date;
}

export interface CronJobDefinition {
  name: string;
  /** Küçük sayı önce çalışır. 0 ekonomi · 1 temizlik · 2 üretim · 3 teslimat · 4 AI. */
  priority: number;
  cadence: JobCadence;
  /** İşin en fazla bekleneceği süre. */
  timeoutMs: number;
  /** Kalan bütçe bundan azsa iş başlatılmaz. Varsayılan: min(timeoutMs, 5 sn). */
  minBudgetMs?: number;
  run: (ctx: CronJobContext) => Promise<Response>;
}

export type JobStatus = 'ok' | 'failed' | 'timeout' | 'skipped_not_due' | 'skipped_budget';

export interface JobStateEntry {
  lastRunAt?: string;
  lastStatus?: JobStatus;
  lastOkAt?: string;
  lastError?: string | null;
  lastMs?: number;
  consecutiveFailures?: number;
}

export type RunOverall = 'ok' | 'partial' | 'failed' | 'interrupted';

export interface RunSummary {
  startedAt: string;
  finishedAt: string | null;
  overall: RunOverall;
  ms: number | null;
  failed: string[];
  skippedBudget: string[];
  ran: number;
}

export interface CronState {
  jobs: Record<string, JobStateEntry>;
  /** Sürmekte olan koşu. Fonksiyon öldürülürse `finishedAt` boş kalır → sonraki koşu "kesildi" görür. */
  currentRun?: { startedAt: string; finishedAt?: string | null } | null;
  history?: RunSummary[];
}

export interface JobResult {
  name: string;
  status: JobStatus;
  httpStatus?: number;
  ms: number;
  error?: string;
  /** Alt işin yanıt gövdesi (kısaltılmış). */
  body?: unknown;
}

export const HISTORY_LIMIT = 14;
const MAX_ERROR_LEN = 500;
const MAX_BODY_LEN = 2000;

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Kadansın `now`'dan önceki (ya da eşit) en son sınırı. */
export function cadenceBoundary(cadence: JobCadence, now: Date): Date {
  const today = utcDayStart(now);
  if (cadence.kind === 'daily') return today;
  if (cadence.kind === 'weekly') {
    const back = (today.getUTCDay() - cadence.weekday + 7) % 7;
    return new Date(today.getTime() - back * 86_400_000);
  }
  const day = Math.min(Math.max(1, Math.floor(cadence.day)), 28);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (now.getUTCDate() >= day) return new Date(Date.UTC(y, m, day));
  return new Date(Date.UTC(y, m - 1, day));
}

/**
 * İş bu koşuda çalışmalı mı?
 *  - Son başarılı koşu son sınırdan eskiyse: evet (kaçırılan dönem telafi edilir).
 *  - Hiç başarılı koşu yoksa: günlük iş hemen; haftalık/aylık iş yalnız kendi gününde
 *    (ilk dağıtım gününde yanlış günde haftalık özet gitmesin).
 */
export function isJobDue(job: Pick<CronJobDefinition, 'cadence'>, entry: JobStateEntry | undefined, now: Date): boolean {
  const boundary = cadenceBoundary(job.cadence, now);
  const lastOk = entry?.lastOkAt ? new Date(entry.lastOkAt) : null;
  if (lastOk && !Number.isNaN(lastOk.getTime())) return lastOk.getTime() < boundary.getTime();
  if (job.cadence.kind === 'daily') return true;
  return utcDayStart(now).getTime() === boundary.getTime();
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function compactBody(body: unknown): unknown {
  if (body === undefined) return undefined;
  try {
    const s = JSON.stringify(body);
    if (s === undefined) return undefined;
    return s.length > MAX_BODY_LEN ? { truncated: true, preview: s.slice(0, MAX_BODY_LEN) } : body;
  } catch {
    return { unserializable: true };
  }
}

/** Alt iş yanıtını sınıflandırır: HTTP 2xx VE gövdede `ok:false` / `success:false` yoksa başarılı. */
export async function classifyResponse(res: Response): Promise<{ ok: boolean; httpStatus: number; body: unknown; error?: string }> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const bodySaysFail = obj ? obj.ok === false || obj.success === false : false;
  const ok = res.ok && !bodySaysFail;
  let error: string | undefined;
  if (!ok) {
    const e = obj?.error ?? obj?.message;
    error = typeof e === 'string' && e ? e : `HTTP ${res.status}`;
  }
  return { ok, httpStatus: res.status, body, error };
}

export interface RunCronJobsOptions {
  jobs: CronJobDefinition[];
  state: CronState;
  deadlineAt: number;
  /** Saat (test için). */
  clock?: () => number;
  /** true → kadans kontrolünü atla (manuel zorlama). */
  force?: boolean;
  /** Yalnız bu işleri çalıştır (manuel yeniden deneme). */
  only?: string[] | null;
  /** Her iş bittiğinde (kalıcılık için). Hata fırlatsa da koşu sürer. */
  onJobDone?: (result: JobResult, state: CronState) => Promise<void>;
}

export interface RunCronJobsResult {
  results: JobResult[];
  overall: Exclude<RunOverall, 'interrupted'>;
  state: CronState;
}

const TIMEOUT = Symbol('cron-timeout');

/** İşleri öncelik sırasıyla, bütçe içinde çalıştırır. Asla fırlatmaz. */
export async function runCronJobs(opts: RunCronJobsOptions): Promise<RunCronJobsResult> {
  const clock = opts.clock ?? Date.now;
  const state: CronState = { ...opts.state, jobs: { ...(opts.state.jobs ?? {}) } };
  const ordered = opts.jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => a.j.priority - b.j.priority || a.i - b.i)
    .map((x) => x.j);
  const only = opts.only && opts.only.length ? new Set(opts.only) : null;
  const results: JobResult[] = [];

  for (const job of ordered) {
    if (only && !only.has(job.name)) continue;
    const startMs = clock();
    const now = new Date(startMs);
    const entry = state.jobs[job.name] ?? {};

    if (!opts.force && !isJobDue(job, entry, now)) {
      results.push({ name: job.name, status: 'skipped_not_due', ms: 0 });
      continue;
    }

    const remaining = opts.deadlineAt - startMs;
    const minBudget = job.minBudgetMs ?? Math.min(job.timeoutMs, 5_000);
    let result: JobResult;

    if (remaining < minBudget) {
      result = { name: job.name, status: 'skipped_budget', ms: 0, error: 'Zaman bütçesi doldu; sonraki koşuda denenecek.' };
    } else {
      const waitMs = Math.max(1, Math.min(job.timeoutMs, remaining));
      const ctx: CronJobContext = { deadlineAt: opts.deadlineAt, jobDeadlineAt: startMs + waitMs, now };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          Promise.resolve().then(() => job.run(ctx)),
          new Promise<typeof TIMEOUT>((resolve) => {
            timer = setTimeout(() => resolve(TIMEOUT), waitMs);
          }),
        ]);
        if (outcome === TIMEOUT) {
          result = { name: job.name, status: 'timeout', ms: clock() - startMs, error: `${waitMs} ms içinde bitmedi.` };
        } else {
          const c = await classifyResponse(outcome);
          result = {
            name: job.name,
            status: c.ok ? 'ok' : 'failed',
            httpStatus: c.httpStatus,
            ms: clock() - startMs,
            ...(c.error ? { error: truncate(c.error, MAX_ERROR_LEN) } : {}),
            body: compactBody(c.body),
          };
        }
      } catch (e) {
        result = {
          name: job.name,
          status: 'failed',
          ms: clock() - startMs,
          error: truncate(e instanceof Error ? e.message : String(e), MAX_ERROR_LEN),
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    results.push(result);
    const ok = result.status === 'ok';
    state.jobs[job.name] = {
      ...entry,
      lastRunAt: now.toISOString(),
      lastStatus: result.status,
      lastMs: result.ms,
      lastError: ok ? null : result.error ?? null,
      ...(ok ? { lastOkAt: now.toISOString(), consecutiveFailures: 0 } : {}),
      ...(!ok && result.status !== 'skipped_budget'
        ? { consecutiveFailures: (entry.consecutiveFailures ?? 0) + 1 }
        : {}),
    };
    if (opts.onJobDone) {
      try {
        await opts.onJobDone(result, state);
      } catch {
        /* kalıcılık hatası koşuyu durdurmaz; genel sonuçta görünür (state kaydı sonda tekrar denenir) */
      }
    }
  }

  const hasFail = results.some((r) => r.status === 'failed' || r.status === 'timeout');
  const hasBudget = results.some((r) => r.status === 'skipped_budget');
  const overall: RunCronJobsResult['overall'] = hasFail ? 'failed' : hasBudget ? 'partial' : 'ok';
  return { results, overall, state };
}

/** Koşu özetini geçmişe ekler (en yeni başta, en fazla HISTORY_LIMIT). */
export function appendHistory(state: CronState, summary: RunSummary): CronState {
  const history = [summary, ...(state.history ?? [])].slice(0, HISTORY_LIMIT);
  return { ...state, history };
}

export function summarizeRun(
  startedAt: Date,
  finishedAt: Date,
  overall: RunOverall,
  results: JobResult[]
): RunSummary {
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    overall,
    ms: finishedAt.getTime() - startedAt.getTime(),
    failed: results.filter((r) => r.status === 'failed' || r.status === 'timeout').map((r) => r.name),
    skippedBudget: results.filter((r) => r.status === 'skipped_budget').map((r) => r.name),
    ran: results.filter((r) => r.status !== 'skipped_not_due').length,
  };
}
