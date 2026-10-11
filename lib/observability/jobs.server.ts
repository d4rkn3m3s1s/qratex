/**
 * Arka plan işleri — sunucu yükleyici ve "şimdi çalıştır" eylemi.
 *
 * Çalıştırma kuralları (sunucu otoriter):
 *  - Yalnız kayıt defterindeki iş; yalnız bu dönem için başarılı koşusu OLMAYAN iş
 *    (başarısız/zaman aşımı/bütçe/gecikmiş). Kadans zorlama (`force`) arayüzden YOK: haftalık
 *    mail gibi yan etkiler tekrar etmesin.
 *  - Günlük koşu sürerken (6 dk içinde başlamış, bitmemiş) 409.
 *  - Gerekçe zorunlu; istek ve sonuç denetim kaydına yazılır.
 *  - İş, orkestratörün kendisiyle (`/api/cron/daily?only=<ad>`) çalışır: aynı zaman aşımı,
 *    aynı durum kaydı, aynı Sentry/heartbeat yolu.
 */
import { prisma } from '@/lib/prisma';
import { loadCronState } from '@/lib/cron-state';
import { isJobDue, type CronState } from '@/lib/cron-runner';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import type { JobsView, RunJobResult } from './contract';
import { buildJobsView, type JobDef } from './jobs-core';

async function jobDefs(): Promise<JobDef[]> {
  const { DAILY_JOBS } = await import('@/app/api/cron/daily/jobs');
  return DAILY_JOBS.map((j) => ({ name: j.name, priority: j.priority, cadence: j.cadence, timeoutMs: j.timeoutMs }));
}

function monitors(): JobsView['monitors'] {
  return {
    heartbeatUrl: !!process.env.CRON_HEARTBEAT_URL?.trim(),
    sentryCron: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    cronSecret: !!process.env.CRON_SECRET?.trim(),
  };
}

export async function loadJobsView(now: Date = new Date()): Promise<JobsView> {
  const defs = await jobDefs();
  let state: CronState | null = null;
  try {
    state = await loadCronState();
  } catch (e) {
    console.error('[admin/jobs] cron durumu okunamadı:', e);
  }
  return buildJobsView(defs, state, now, monitors());
}

const RUNNING_GUARD_MS = 6 * 60_000;

export async function runJobNow(
  input: { name: string; reason: string },
  actor: AuditActor,
  request: { headers: { get(name: string): string | null } },
  now: Date = new Date()
): Promise<RunJobResult> {
  const defs = await jobDefs();
  const def = defs.find((d) => d.name === input.name);
  if (!def) throw new ApiError('NOT_FOUND', 'Bu adla kayıtlı bir arka plan işi yok.');
  if (!process.env.CRON_SECRET?.trim()) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'CRON_SECRET tanımlı olmadığı için iş elle çalıştırılamaz.');
  }

  let state: CronState;
  try {
    state = await loadCronState();
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE', 'İş durumu okunamadı; birazdan tekrar deneyin.', { retryable: true });
  }
  const cur = state.currentRun;
  if (cur && !cur.finishedAt && now.getTime() - new Date(cur.startedAt).getTime() < RUNNING_GUARD_MS) {
    throw new ApiError('CONFLICT', 'Günlük koşu şu an sürüyor. Bitince tekrar deneyin.');
  }
  if (!isJobDue(def, state.jobs?.[def.name], now)) {
    throw new ApiError('CONFLICT', 'Bu iş bu dönem için zaten başarıyla çalıştı. Yeniden çalıştırmak yan etkileri (mail, puan, bildirim) tekrarlayabilir.');
  }

  // Atomik claim: aynı işin eşzamanlı ikinci "şimdi çalıştır"ı 409 alır (çift yan etki yok).
  const token = await claimJob(def, now);
  try {
    // Claim sonrası durumu yeniden oku: claim'den hemen önce biten bir koşu işi "yapıldı" yapmış olabilir.
    let fresh: CronState;
    try {
      fresh = await loadCronState();
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'İş durumu okunamadı; birazdan tekrar deneyin.', { retryable: true });
    }
    const fc = fresh.currentRun;
    if (fc && !fc.finishedAt && now.getTime() - new Date(fc.startedAt).getTime() < RUNNING_GUARD_MS) {
      throw new ApiError('CONFLICT', 'Günlük koşu şu an sürüyor. Bitince tekrar deneyin.');
    }
    if (!isJobDue(def, fresh.jobs?.[def.name], now)) {
      throw new ApiError('CONFLICT', 'Bu iş bu dönem için zaten başarıyla çalıştı.');
    }
    return await executeJob(def, input, actor, request);
  } finally {
    await releaseJob(def.name, token);
  }
}

const CLAIM_PREFIX = 'cron_manual_claim:';

/**
 * Settings.key UNIQUE üzerinde atomik claim: `create` yalnız bir çağrıda başarılı olur (P2002 → 409).
 * Süresi geçmiş (öldürülmüş fonksiyondan kalan) claim koşullu `deleteMany` ile temizlenir.
 */
async function claimJob(def: JobDef, now: Date): Promise<string> {
  const key = `${CLAIM_PREFIX}${def.name}`;
  const token = `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  const staleBefore = new Date(now.getTime() - (def.timeoutMs + RUNNING_GUARD_MS));
  await prisma.settings.deleteMany({ where: { key, updatedAt: { lt: staleBefore } } });
  try {
    await prisma.settings.create({ data: { key, value: { token, startedAt: now.toISOString() }, category: 'system' } });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      throw new ApiError('CONFLICT', 'Bu iş şu an zaten çalıştırılıyor. Bitince tekrar deneyin.');
    }
    throw e;
  }
  return token;
}

async function releaseJob(name: string, token: string): Promise<void> {
  try {
    await prisma.settings.deleteMany({ where: { key: `${CLAIM_PREFIX}${name}`, value: { path: ['token'], equals: token } } });
  } catch (e) {
    console.error('[admin/jobs] claim bırakılamadı (süre dolunca temizlenir):', e);
  }
}

async function executeJob(
  def: JobDef,
  input: { name: string; reason: string },
  actor: AuditActor,
  request: { headers: { get(name: string): string | null } }
): Promise<RunJobResult> {
  // Denetim önce (fail-closed): kayıt yazılamazsa iş çalışmaz.
  await prisma.auditLog.create({
    data: auditEntry(actor, { action: 'jobs.run_requested', entity: 'cron_job', entityId: def.name, newData: { reason: input.reason } }, request),
  });

  const { GET } = await import('@/app/api/cron/daily/route');
  const { cronAuthHeader } = await import('@/lib/cron-auth');
  const started = Date.now();
  let result: RunJobResult;
  try {
    const res = await GET(
      new Request(`https://internal/api/cron/daily?only=${encodeURIComponent(def.name)}`, {
        headers: { authorization: cronAuthHeader() },
      })
    );
    let body: { results?: Record<string, { status?: string; ms?: number; error?: string }> } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* gövdesiz */
    }
    const r = body.results?.[def.name];
    result = {
      name: def.name,
      status: (r?.status as RunJobResult['status']) ?? 'not_run',
      ms: typeof r?.ms === 'number' ? r.ms : Date.now() - started,
      error: r?.error ?? (r ? null : `Orkestratör ${res.status} döndürdü; iş çalışmadı.`),
      httpStatus: res.status,
    };
  } catch (e) {
    result = {
      name: def.name,
      status: 'not_run',
      ms: Date.now() - started,
      error: e instanceof Error ? e.message.slice(0, 300) : 'Bilinmeyen hata',
      httpStatus: 500,
    };
  }

  try {
    await prisma.auditLog.create({
      data: auditEntry(
        actor,
        { action: 'jobs.run_finished', entity: 'cron_job', entityId: def.name, newData: { reason: input.reason, ...result } },
        request
      ),
    });
  } catch (e) {
    console.error('[admin/jobs] denetim kaydı yazılamadı:', e);
  }
  return result;
}
