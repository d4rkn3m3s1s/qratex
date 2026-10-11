/**
 * Arka plan işleri görünümü — saf mantık (Prisma/Next yok; test edilir).
 * Kaynak: günlük orkestratörün iş kayıt defteri (`app/api/cron/daily/jobs.ts`) + kalıcı
 * durum (`Settings[cron_daily_state]`, `lib/cron-state.ts`). Uydurma yok: hiç koşmamış iş
 * "Henüz çalışmadı", okunamayan durum "bilinmiyor" görünür.
 */
import { cadenceBoundary, isJobDue, type CronState, type JobCadence, type JobStateEntry } from '@/lib/cron-runner';
import type { HealthStatus, JobHealth, JobRow, JobsView, JobRunSummaryView } from './contract';
import { JOB_HEALTH_META } from './contract';

export type JobDef = { name: string; priority: number; cadence: JobCadence; timeoutMs: number };

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const JOB_GROUP: Record<number, string> = {
  0: 'Ekonomi kapanışları',
  1: 'Temizlik ve saklama',
  2: 'Üretim',
  3: 'Teslimat',
  4: 'AI',
};

/** Ad → okunur Türkçe etiket. Listede olmayan yeni iş adı olduğu gibi gösterilir. */
export const JOB_LABEL: Record<string, string> = {
  'squad-battles': 'Takım savaşlarını kapat',
  'cleanup-counters': 'Sayaç temizliği',
  'db-cleanup': 'Veritabanı temizliği',
  'analytics-event-cleanup': 'Analitik olay saklama',
  'feature-flag-cleanup': 'Süresi biten özellik bayrakları',
  'dealer-flash-offer-expiry': 'Biten flaş teklifler',
  'seasonal-concept-activation': 'Sezon konsepti geçişi',
  'team-daily-maintenance': 'Ekip günlük bakımı',
  'negative-feedback-sla': 'Olumsuz geri bildirim SLA',
  'inbox-queues': 'Gelen kutusu kuyrukları',
  'calculate-clv': 'Müşteri yaşam değeri',
  'churn-intervention': 'Kayıp riski müdahalesi',
  'churn-playbook': 'Kayıp önleme senaryoları',
  'business-of-month': 'Ayın işletmesi',
  'ai-quality-sample': 'AI kalite örneklemi',
  'campaign-dispatch': 'Kampanya gönderimi',
  'intern-deadline': 'Stajyer son tarih hatırlatması',
  'team-task-due': 'Ekip görev hatırlatması',
  'inbox-sync': 'Gelen kutusu eşitleme',
  'customer-reminder-nudges': 'Müşteri hatırlatmaları',
  'team-weekly-reminder': 'Ekip haftalık hatırlatma',
  'weekly-digest': 'Haftalık özet e-postası',
  'partner-digest-webhook': 'Partner özet webhook’u',
  'ai-retry': 'AI analizi yeniden deneme',
};

const WEEKDAY_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function cadenceLabel(c: JobCadence): string {
  if (c.kind === 'daily') return 'Her gün';
  if (c.kind === 'weekly') return `Her ${WEEKDAY_TR[c.weekday] ?? '?'}`;
  return `Her ayın ${c.day}. günü`;
}

function periodMs(c: JobCadence): number {
  return c.kind === 'daily' ? DAY : c.kind === 'weekly' ? 7 * DAY : 31 * DAY;
}

export function nextBoundary(c: JobCadence, now: Date): Date {
  const b = cadenceBoundary(c, now);
  if (c.kind === 'daily') return new Date(b.getTime() + DAY);
  if (c.kind === 'weekly') return new Date(b.getTime() + 7 * DAY);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate()));
}

export function jobHealth(def: JobDef, entry: JobStateEntry | undefined, now: Date): { health: JobHealth; due: boolean } {
  const due = isJobDue(def, entry, now);
  if (!entry?.lastRunAt) return { health: due ? 'never' : 'waiting', due };
  if (!due) return { health: 'ok', due };
  if (entry.lastStatus === 'failed' || entry.lastStatus === 'timeout') return { health: 'failing', due };
  if (entry.lastStatus === 'skipped_budget') return { health: 'budget', due };
  const lastOk = entry.lastOkAt ? new Date(entry.lastOkAt).getTime() : NaN;
  // Bir dönem + 2 sa boyunca başarılı koşu yoksa kaçırılmış sayılır; yoksa bugünkü koşuyu bekliyor.
  if (!Number.isFinite(lastOk) || now.getTime() - lastOk > periodMs(def.cadence) + 2 * HOUR) return { health: 'overdue', due };
  return { health: 'ok', due };
}

export function buildJobRow(def: JobDef, entry: JobStateEntry | undefined, now: Date): JobRow {
  const { health, due } = jobHealth(def, entry, now);
  return {
    name: def.name,
    label: JOB_LABEL[def.name] ?? def.name,
    group: JOB_GROUP[def.priority] ?? `Öncelik ${def.priority}`,
    priority: def.priority,
    cadence: def.cadence,
    cadenceLabel: cadenceLabel(def.cadence),
    timeoutMs: def.timeoutMs,
    lastRunAt: entry?.lastRunAt ?? null,
    lastStatus: entry?.lastStatus ?? null,
    lastOkAt: entry?.lastOkAt ?? null,
    lastError: entry?.lastError ?? null,
    lastMs: typeof entry?.lastMs === 'number' ? entry.lastMs : null,
    consecutiveFailures: entry?.consecutiveFailures ?? 0,
    health,
    healthLabel: JOB_HEALTH_META[health].label,
    due,
    nextBoundaryAt: nextBoundary(def.cadence, now).toISOString(),
  };
}

function relTr(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'bilinmeyen zamanda';
  const m = Math.round(Math.max(0, diff) / 60_000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

export function buildJobsView(defs: JobDef[], state: CronState | null, now: Date, monitors: JobsView['monitors']): JobsView {
  const stateReadable = state !== null;
  const s: CronState = state ?? { jobs: {} };
  const jobs = [...defs]
    .sort((a, b) => a.priority - b.priority)
    .map((d) => buildJobRow(d, s.jobs?.[d.name], now));
  const known = new Set(defs.map((d) => d.name));
  const orphaned = Object.keys(s.jobs ?? {}).filter((n) => !known.has(n)).sort();
  const history = (s.history ?? []) as JobRunSummaryView[];
  const lastRun = history[0] ?? null;
  const running = s.currentRun && !s.currentRun.finishedAt ? { startedAt: s.currentRun.startedAt } : null;

  let overall: HealthStatus = 'ok';
  let overallDetail = '';
  const failing = jobs.filter((j) => j.health === 'failing');
  const lagging = jobs.filter((j) => j.health === 'overdue' || j.health === 'budget');
  if (!stateReadable) {
    overall = 'unknown';
    overallDetail = 'İş durumu okunamadı (veritabanı erişilemiyor).';
  } else if (!lastRun && !running) {
    overall = 'warn';
    overallDetail = 'Kayıtlı günlük koşu yok; tetikleyicinin (cron-job.org / Vercel Cron) kurulu olduğunu doğrulayın.';
  } else if (lastRun && !running && now.getTime() - new Date(lastRun.startedAt).getTime() > 26 * HOUR) {
    overall = 'error';
    overallDetail = `Son günlük koşu ${relTr(lastRun.startedAt, now)}; günlük tetikleme kaçırılmış.`;
  } else if (failing.length > 0) {
    overall = 'error';
    overallDetail = `${failing.length} iş hata veriyor: ${failing.map((j) => j.label).join(', ')}.`;
  } else if (lagging.length > 0) {
    overall = 'warn';
    overallDetail = `${lagging.length} iş gecikti ya da bütçe yüzünden atlandı.`;
  } else if (running) {
    overallDetail = `Günlük koşu sürüyor (${relTr(running.startedAt, now)} başladı).`;
  } else {
    overallDetail = lastRun ? `Son koşu ${relTr(lastRun.startedAt, now)}; tüm işler sorunsuz.` : 'Tüm işler sorunsuz.';
  }

  return { generatedAt: now.toISOString(), stateReadable, overall, overallDetail, running, lastRun, history, jobs, orphaned, monitors };
}
