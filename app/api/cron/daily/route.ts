import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { appendHistory, runCronJobs, summarizeRun, type CronState } from '@/lib/cron-runner';
import { loadCronState, saveCronState } from '@/lib/cron-state';
import { finishCronCheckIn, pingHeartbeat, startCronCheckIn } from '@/lib/cron-heartbeat';
import { captureApiError } from '@/lib/capture-api-error';
import { DAILY_JOBS } from './jobs';

export const dynamic = 'force-dynamic';
// Fluid compute ile Hobby'de de 300 sn'ye izin var (iç iş uçları zaten 300 sn kullanıyor).
export const maxDuration = 300;

/** Global bütçe: maxDuration'dan pay bırak (durum kaydı + heartbeat + yanıt). */
const GLOBAL_BUDGET_MS = 270_000;

/**
 * GÜNLÜK CRON ORKESTRATÖRÜ — "tek uyanış, bütçeli iş, görünür sonuç" (P0-40, denetim K2/Y1).
 *
 * TEK UYANIŞ KURALI — Neon faturası sorgu sayısına değil, compute'un UYANIK KALDIĞI SÜREYE
 * bakar. Ayrı ayrı tetiklenen her iş uyuyan compute'u ayrı ayrı uyandırır. Bu yüzden DB'ye
 * dokunan BÜTÜN periyodik işler `./jobs.ts` kayıt defterindedir ve günde bir kez buradan,
 * öncelik sırasıyla, global son tarih içinde çalışır. Inngest'te periyodik cron yoktur.
 *
 * Sözleşme:
 *  - CRON_SECRET fail-closed (yoksa 503, yanlışsa 401).
 *  - Herhangi bir alt iş başarısız / zaman aşımı → HTTP 500 (Vercel cron panelinde kırmızı).
 *    Bütçe yüzünden atlanan iş varsa → HTTP 503. Yalnız hepsi başarılıysa 200.
 *  - Her işin sonucu `Settings[cron_daily_state]`'e iş bitince yazılır; fonksiyon öldürülse bile
 *    biten işlerin izi kalır ve "koşu kesildi" sonraki koşuda raporlanır.
 *  - Sonda dead-man heartbeat (`CRON_HEARTBEAT_URL`, başarısızlıkta `/fail`) + Sentry check-in.
 *
 * Manuel kullanım (Bearer CRON_SECRET):
 *  - `?only=team-task-due,intern-deadline` → yalnız bu işler (kadansa yine uyar).
 *  - `?force=1` → kadans kontrolünü atla (dikkat: haftalık mailler yeniden gider).
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const startedAt = new Date();
  const deadlineAt = startedAt.getTime() + GLOBAL_BUDGET_MS;
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const only = (url.searchParams.get('only') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = only.filter((n) => !DAILY_JOBS.some((j) => j.name === n));
  if (unknown.length) {
    return NextResponse.json({ error: `Bilinmeyen iş: ${unknown.join(', ')}` }, { status: 400 });
  }

  const checkInId = startCronCheckIn();

  // ── Önceki durum + "kesilen koşu" tespiti ───────────────────────
  let state: CronState = { jobs: {} };
  let stateAvailable = true;
  let previousRunInterrupted: string | null = null;
  try {
    state = await loadCronState();
  } catch (e) {
    stateAvailable = false;
    console.error('[CRON daily] durum okunamadı:', e);
  }
  if (state.currentRun && !state.currentRun.finishedAt) {
    previousRunInterrupted = state.currentRun.startedAt;
    state = appendHistory(state, {
      startedAt: state.currentRun.startedAt,
      finishedAt: null,
      overall: 'interrupted',
      ms: null,
      failed: [],
      skippedBudget: [],
      ran: 0,
    });
  }
  state = { ...state, currentRun: { startedAt: startedAt.toISOString(), finishedAt: null } };
  if (stateAvailable) {
    await saveCronState(state).catch((e) => {
      stateAvailable = false;
      console.error('[CRON daily] başlangıç durumu yazılamadı:', e);
    });
  }

  // ── İşler ──────────────────────────────────────────────────────
  const run = await runCronJobs({
    jobs: DAILY_JOBS,
    state,
    deadlineAt,
    force,
    only,
    onJobDone: async (result, s) => {
      if (result.status === 'failed' || result.status === 'timeout') {
        console.error(`[CRON daily] ${result.name} ${result.status}:`, result.error);
        captureApiError(new Error(`cron ${result.name} ${result.status}: ${result.error ?? ''}`), {
          route: '/api/cron/daily',
          job: result.name,
        });
      }
      if (stateAvailable) await saveCronState(s);
    },
  });

  const finishedAt = new Date();
  // Durum deposu yoksa işler çalışmış olsa bile kadans/telafi güvencesi yok → başarılı sayma.
  const overall = !stateAvailable && run.overall === 'ok' ? 'partial' : run.overall;
  const summary = summarizeRun(startedAt, finishedAt, overall, run.results);
  const finalState = appendHistory(
    { ...run.state, currentRun: { startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString() } },
    summary
  );
  let stateSaved = false;
  if (stateAvailable) {
    try {
      await saveCronState(finalState);
      stateSaved = true;
    } catch (e) {
      console.error('[CRON daily] son durum yazılamadı:', e);
    }
  }

  // Durum kaydedilemediyse yarın kadans/telafi bilgisi eksik olur → başarılı sayılmaz.
  const ok = overall === 'ok' && stateSaved;
  const reported = ok ? 'ok' : overall === 'ok' ? 'partial' : overall;
  const heartbeat = await pingHeartbeat(ok, {
    overall: reported,
    failed: summary.failed,
    skippedBudget: summary.skippedBudget,
    ms: summary.ms,
    previousRunInterrupted,
  });
  finishCronCheckIn(checkInId, ok, (summary.ms ?? 0) / 1000);

  const status = ok ? 200 : overall === 'failed' ? 500 : 503;
  return NextResponse.json(
    {
      ok,
      overall: reported,
      ranAt: startedAt.toISOString(),
      tookMs: summary.ms,
      failed: summary.failed,
      skippedBudget: summary.skippedBudget,
      previousRunInterrupted,
      stateSaved,
      heartbeat,
      results: Object.fromEntries(run.results.map((r) => [r.name, r])),
    },
    { status }
  );
}
