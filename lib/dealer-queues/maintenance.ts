/**
 * Gelen Kutusu kuyruklarının günlük bakımı — `/api/cron/inbox-queues` (günlük orkestratör) çağırır.
 *
 *  1. Eski sahte "demo olay" kayıtlarının platform geneli temizliği (D11; GET'ten taşındı).
 *  2. Yanıtlanan yorumun SLA vakası otomatik çözülür (çözüm notu + sistem denetim kaydı).
 *  3. Müşteride 30 günden uzun bekleyen telafi teklifi `expired` olur (zaman çizelgesine yazılır).
 *  4. 24 saatten uzun onay bekleyen taslak varsa bayiye günde en fazla bir hatırlatma.
 *  5. Kriz radarı taraması (son 14 günde yorum alan bayiler; bütçe/son tarih içinde).
 *
 * Her adım bağımsızdır: biri düşerse diğerleri yine çalışır; hata özetle döner (cron 500).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import { purgeLegacyDemoIncidents } from '@/lib/incident-detection';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';
import { runIncidentRadarForDealer } from './radar';
import { SYSTEM_ACTOR, writeQueueAudit } from './audit';
import { REMEDY_AWAITING_WARN_MS, REMEDY_PENDING_TTL_DAYS } from './remedy-core';
import { DAY_MS, istanbulYmd } from './time';

export interface MaintenanceSummary {
  purgedDemo: number;
  slaAutoResolved: number;
  remediesExpired: number;
  remindersSent: number;
  radarDealers: number;
  radarIncidents: number;
  radarSkippedBudget: number;
  errors: Array<{ step: string; message: string }>;
}

const BATCH = 500;
const SAFETY_MS = 4_000;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function autoResolveAnsweredSla(now: Date): Promise<number> {
  const open = await prisma.incident.findMany({
    where: { type: 'negative_feedback_sla_breach', status: { in: ['open', 'assigned', 'in_progress'] } },
    select: { id: true, dealerId: true, metadata: true },
    take: BATCH,
  });
  const byFeedback = new Map<string, { id: string; dealerId: string; metadata: Prisma.JsonValue | null }>();
  for (const i of open) {
    const m = i.metadata && typeof i.metadata === 'object' && !Array.isArray(i.metadata) ? (i.metadata as Record<string, unknown>) : {};
    if (typeof m.feedbackId === 'string') byFeedback.set(m.feedbackId, i);
  }
  if (byFeedback.size === 0) return 0;
  const answered = await prisma.feedback.findMany({
    where: { id: { in: [...byFeedback.keys()] }, dealerRepliedAt: { not: null } },
    select: { id: true, dealerRepliedAt: true },
  });
  let n = 0;
  for (const fb of answered) {
    const inc = byFeedback.get(fb.id);
    if (!inc) continue;
    const base = inc.metadata && typeof inc.metadata === 'object' && !Array.isArray(inc.metadata) ? (inc.metadata as Record<string, unknown>) : {};
    await prisma.$transaction(async (tx) => {
      const res = await tx.incident.updateMany({
        where: { id: inc.id, status: { not: 'resolved' } },
        data: {
          status: 'resolved',
          resolvedAt: fb.dealerRepliedAt ?? now,
          metadata: {
            ...base,
            resolution: { note: 'Yorum yanıtlandı — vaka otomatik kapatıldı.', rootCause: null, by: null, at: now.toISOString() },
          } as Prisma.InputJsonValue,
        },
      });
      if (res.count === 0) return;
      await writeQueueAudit(tx, SYSTEM_ACTOR, [
        {
          action: 'incident.resolved',
          entity: 'Incident',
          entityId: inc.id,
          data: { note: 'Yorum yanıtlandı — vaka otomatik kapatıldı.', auto: true },
        },
      ]);
      n += 1;
    });
  }
  return n;
}

export async function expireStaleRemedies(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - REMEDY_PENDING_TTL_DAYS * DAY_MS);
  const candidates = await prisma.remedyOffer.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    select: {
      id: true,
      timelineEvents: {
        where: { kind: { in: ['published', 'notified'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
    take: BATCH,
  });
  let n = 0;
  for (const c of candidates) {
    const reachedAt = c.timelineEvents[0]?.createdAt;
    // Kuyrukta bekleyip geç yayınlanan teklifin süresi yayın anından sayılır.
    if (reachedAt && reachedAt >= cutoff) continue;
    await prisma.$transaction(async (tx) => {
      const res = await tx.remedyOffer.updateMany({ where: { id: c.id, status: 'pending' }, data: { status: 'expired' } });
      if (res.count === 0) return;
      await appendRemedyTimelineEvent(tx, c.id, 'expired', 'Teklifin süresi doldu', { ttlDays: REMEDY_PENDING_TTL_DAYS });
      n += 1;
    });
  }
  return n;
}

export async function remindStaleDrafts(now: Date): Promise<number> {
  const groups = await prisma.remedyOffer.groupBy({
    by: ['dealerId'],
    where: { status: 'awaiting_dealer_approval', createdAt: { lt: new Date(now.getTime() - REMEDY_AWAITING_WARN_MS) } },
    _count: { _all: true },
  });
  const day = istanbulYmd(now);
  let n = 0;
  for (const g of groups.slice(0, BATCH)) {
    const dedupeKey = `remedy-reminder:${g.dealerId}:${day}`;
    const exists = await prisma.notification.findFirst({
      where: { userId: g.dealerId, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (exists) continue;
    const count = g._count._all;
    await prisma.notification.create({
      data: {
        userId: g.dealerId,
        title: 'Onay bekleyen telafiler',
        message: count === 1 ? '1 telafi taslağı 24 saatten uzun süredir onayınızı bekliyor.' : `${count} telafi taslağı 24 saatten uzun süredir onayınızı bekliyor.`,
        type: 'warning',
        data: { type: 'remedy_reminder', module: 'remedy_offers', ctaPath: '/dealer/inbox/remedy', dedupeKey },
      },
    });
    n += 1;
  }
  return n;
}

async function radarCandidates(now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - 14 * DAY_MS);
  const [qr, cons] = await Promise.all([
    prisma.qRCode.findMany({
      where: { feedbacks: { some: { createdAt: { gte: since }, deletedAt: null } } },
      select: { dealerId: true },
      distinct: ['dealerId'],
      take: 5000,
    }),
    prisma.consumption.findMany({
      where: { createdAt: { gte: since }, review: { isNot: null } },
      select: { dealerId: true },
      distinct: ['dealerId'],
      take: 5000,
    }),
  ]);
  return [...new Set([...qr.map((r) => r.dealerId), ...cons.map((r) => r.dealerId)])];
}

export async function runInboxQueuesMaintenance(deadlineAt: number, now: Date = new Date()): Promise<MaintenanceSummary> {
  const summary: MaintenanceSummary = {
    purgedDemo: 0,
    slaAutoResolved: 0,
    remediesExpired: 0,
    remindersSent: 0,
    radarDealers: 0,
    radarIncidents: 0,
    radarSkippedBudget: 0,
    errors: [],
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.error(`[inbox-queues] ${name}:`, e);
      summary.errors.push({ step: name, message: errMsg(e) });
    }
  };

  let controls: Record<string, boolean> = {};
  try {
    controls = await getModuleControls();
  } catch {
    controls = {};
  }
  const incidentsOn = controls.incidents !== false;
  const remedyOn = controls.remedy_offers !== false;

  await step('purge-demo', async () => {
    summary.purgedDemo = await purgeLegacyDemoIncidents();
  });
  if (incidentsOn) {
    await step('sla-auto-resolve', async () => {
      summary.slaAutoResolved = await autoResolveAnsweredSla(now);
    });
  }
  await step('remedy-expiry', async () => {
    summary.remediesExpired = await expireStaleRemedies(now);
  });
  if (remedyOn) {
    await step('remedy-reminders', async () => {
      summary.remindersSent = await remindStaleDrafts(now);
    });
  }
  if (incidentsOn) {
    await step('radar', async () => {
      const dealers = await radarCandidates(now);
      for (let i = 0; i < dealers.length; i++) {
        if (Date.now() > deadlineAt - SAFETY_MS) {
          summary.radarSkippedBudget = dealers.length - i;
          break;
        }
        try {
          const r = await runIncidentRadarForDealer(dealers[i], { trigger: 'cron', now });
          summary.radarDealers += 1;
          summary.radarIncidents += r.created.length;
        } catch (e) {
          summary.errors.push({ step: `radar:${dealers[i]}`, message: errMsg(e) });
        }
      }
    });
  }
  return summary;
}
