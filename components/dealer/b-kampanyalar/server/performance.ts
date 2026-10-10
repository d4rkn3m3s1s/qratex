/**
 * Kampanya performansı — GERÇEK huni: gönderildi → açıldı → ziyaret etti → harcadı.
 *
 * Eski ekran kampanya başlığından türetilen bir anahtarla `Feedback.utmCampaign`'i `contains` ile
 * eşliyordu; o alanı hiçbir istemci doldurmadığı için metrikler üretimde hep 0/—/%0'dı ve pencere
 * gönderim tarihinden bağımsız "son 30 gün"dü (denetim Bulgu 1, 3, 4).
 *
 * Şimdi:
 *  - Alıcılar: gönderim kaydındaki KESİN liste (eski gönderimlerde uygulama içi bildirimlerden).
 *  - Açıldı: uygulama içi bildirimin okunması (`readAt`) ∪ push'a dokunup izlenen bağlantıyı açma.
 *  - Ziyaret: alıcının bu işletmede tüketimi ya da QR geri bildirimi, [gönderim, gönderim + N gün).
 *  - Harcama: aynı penceredeki tüketim tutarları.
 *  - Kıyas: alıcıların gönderim ÖNCESİ aynı uzunluktaki dönemi; kontrol grubu seçildiyse
 *    ileti almayan eşdeğer grup (artış = ziyaret oranı farkı, yüzde puanı).
 *  - Gün kovaları İstanbul takvimine göre.
 */
import { prisma } from '@/lib/prisma';
import { addDays, dayDiff, istanbulDay } from '@/components/ds/page/date-range';
import {
  avgRating,
  groupOutcome,
  MIN_SAMPLE,
  pct,
  pointsDelta,
  wasSent,
  type ActivityEvent,
  type AttributionWindow,
  type GroupOutcome,
} from '../domain';
import type { CampaignPerformance, FunnelStep, OutcomeDto, TimelinePoint } from '../types';
import { chunk, loadOwnedCampaign, toCampaignDto } from './common';
import { readSendRecord } from './snapshot';

const DAY_MS = 86_400_000;
const ID_CHUNK = 2000;
export const PUSH_OPEN_EVENT = 'campaign_push_open';

function toOutcome(o: GroupOutcome): OutcomeDto {
  return {
    size: o.size,
    visitors: o.visitors,
    visitRate: pct(o.visitors, o.size),
    spenders: o.spenders,
    spend: o.spend,
    spendPerMember: o.size > 0 ? Math.round((o.spend / o.size) * 100) / 100 : null,
    avgRating: avgRating(o),
    ratingCount: o.ratingCount,
  };
}

async function loadActivity(dealerId: string, userIds: readonly string[], from: Date, to: Date): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];
  for (const part of chunk(userIds, ID_CHUNK)) {
    const [consumptions, feedbacks, reviews] = await Promise.all([
      prisma.consumption.findMany({
        where: { dealerId, customerId: { in: part }, createdAt: { gte: from, lt: to } },
        select: { customerId: true, amount: true, createdAt: true },
      }),
      prisma.feedback.findMany({
        where: { qrCode: { dealerId }, deletedAt: null, userId: { in: part }, createdAt: { gte: from, lt: to } },
        select: { userId: true, rating: true, createdAt: true },
      }),
      prisma.consumptionReview.findMany({
        where: { consumption: { dealerId }, deletedAt: null, customerId: { in: part }, createdAt: { gte: from, lt: to } },
        select: { customerId: true, rating: true, createdAt: true },
      }),
    ]);
    for (const c of consumptions) {
      events.push({ userId: c.customerId, at: c.createdAt.getTime(), amount: c.amount ?? null, rating: null });
    }
    for (const f of feedbacks) {
      if (f.userId) events.push({ userId: f.userId, at: f.createdAt.getTime(), amount: null, rating: f.rating });
    }
    for (const r of reviews) {
      events.push({ userId: r.customerId, at: r.createdAt.getTime(), amount: null, rating: r.rating, visit: false });
    }
  }
  return events;
}

async function legacyRecipients(campaignId: string, sentAt: Date): Promise<string[]> {
  const rows = await prisma.notification.findMany({
    where: {
      type: 'campaign',
      createdAt: { gte: new Date(sentAt.getTime() - 60 * 60 * 1000) },
      data: { path: ['campaignId'], equals: campaignId },
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

async function openedUsers(campaignId: string, recipients: readonly string[], sentAt: Date): Promise<{ inAppDelivered: number; opened: Set<string> }> {
  const opened = new Set<string>();
  let inAppDelivered = 0;
  const since = new Date(sentAt.getTime() - 60 * 60 * 1000);
  const recipientSet = new Set(recipients);
  for (const part of chunk(recipients, ID_CHUNK)) {
    const rows = await prisma.notification.findMany({
      where: { type: 'campaign', userId: { in: part }, createdAt: { gte: since }, data: { path: ['campaignId'], equals: campaignId } },
      select: { userId: true, readAt: true },
    });
    inAppDelivered += rows.length;
    for (const r of rows) if (r.readAt) opened.add(r.userId);
  }
  const pushOpens = await prisma.analyticsEvent.findMany({
    where: { event: PUSH_OPEN_EVENT, createdAt: { gte: since }, data: { path: ['campaignId'], equals: campaignId } },
    select: { userId: true },
  });
  for (const e of pushOpens) if (e.userId && recipientSet.has(e.userId)) opened.add(e.userId);
  return { inAppDelivered, opened };
}

function buildTimeline(
  recipients: ReadonlySet<string>,
  events: readonly ActivityEvent[],
  sentAt: Date,
  from: Date,
  to: Date
): TimelinePoint[] {
  const sendDay = istanbulDay(sentAt);
  const firstDay = istanbulDay(from);
  const lastDay = istanbulDay(new Date(to.getTime() - 1));
  const days: TimelinePoint[] = [];
  const index = new Map<string, { visitors: Set<string>; spend: number }>();
  for (let d = firstDay; dayDiff(d, lastDay) >= 0; d = addDays(d, 1)) {
    index.set(d, { visitors: new Set(), spend: 0 });
    if (index.size > 80) break;
  }
  for (const e of events) {
    if (!recipients.has(e.userId) || e.visit === false) continue;
    const bucket = index.get(istanbulDay(e.at));
    if (!bucket) continue;
    bucket.visitors.add(e.userId);
    if (e.amount != null && e.amount > 0) bucket.spend += e.amount;
  }
  for (const [day, b] of index) {
    days.push({ day, offset: dayDiff(sendDay, day), visitors: b.visitors.size, spend: Math.round(b.spend * 100) / 100 });
  }
  return days;
}

export async function campaignPerformance(
  dealerId: string,
  campaignId: string,
  window: AttributionWindow,
  now: Date = new Date()
): Promise<CampaignPerformance> {
  const campaign = await loadOwnedCampaign(dealerId, campaignId);
  const dto = toCampaignDto(campaign);
  const base: CampaignPerformance = {
    campaign: dto,
    state: 'not-sent',
    window,
    windowComplete: false,
    daysElapsed: 0,
    delivery: null,
    funnel: [],
    after: null,
    before: null,
    control: null,
    liftPoints: null,
    timeline: [],
    minSample: MIN_SAMPLE,
    computedAt: now.toISOString(),
  };
  if (!wasSent(campaign) || !campaign.sentAt) return base;

  const sentAt = campaign.sentAt;
  const record = await readSendRecord(campaign.id);
  let recipients: string[];
  let holdout: string[] = [];
  let source: 'snapshot' | 'notifications';
  if (record.snapshot) {
    recipients = record.snapshot.recipients;
    holdout = record.snapshot.holdout;
    source = 'snapshot';
  } else {
    recipients = await legacyRecipients(campaign.id, sentAt);
    source = 'notifications';
  }
  const elapsedMs = Math.max(0, now.getTime() - sentAt.getTime());
  const daysElapsed = Math.floor(elapsedMs / DAY_MS);
  if (recipients.length === 0) return { ...base, state: 'legacy', daysElapsed };

  const windowEnd = new Date(sentAt.getTime() + window * DAY_MS);
  const afterEnd = new Date(Math.min(windowEnd.getTime(), now.getTime()));
  const beforeStart = new Date(sentAt.getTime() - window * DAY_MS);

  const recipientSet = new Set(recipients);
  const holdoutSet = new Set(holdout);
  const [events, opens] = await Promise.all([
    loadActivity(dealerId, [...recipients, ...holdout], beforeStart, afterEnd),
    openedUsers(campaign.id, recipients, sentAt),
  ]);

  const after = groupOutcome(recipientSet, events, sentAt.getTime(), afterEnd.getTime());
  const before = groupOutcome(recipientSet, events, beforeStart.getTime(), sentAt.getTime());
  const control = holdoutSet.size > 0 ? groupOutcome(holdoutSet, events, sentAt.getTime(), afterEnd.getTime()) : null;

  const reach = recipients.length;
  const funnel: FunnelStep[] = [
    { key: 'sent', count: reach, rate: 100 },
    { key: 'opened', count: opens.opened.size, rate: pct(opens.opened.size, reach) },
    { key: 'visited', count: after.visitors, rate: pct(after.visitors, reach) },
    { key: 'spent', count: after.spenders, rate: pct(after.spenders, reach) },
  ];

  const afterDto = toOutcome(after);
  const controlDto = control ? { ...toOutcome(control), pct: record.snapshot?.holdoutPct ?? 0 } : null;

  return {
    ...base,
    state: 'ready',
    windowComplete: now.getTime() >= windowEnd.getTime(),
    daysElapsed,
    delivery: {
      source,
      reach,
      inAppDelivered: opens.inAppDelivered,
      pushAttempted: record.snapshot?.push.length ?? 0,
      pushDelivered: record.push?.delivered ?? null,
      optedOut: record.snapshot ? record.snapshot.optedOutCount : null,
      frequencyCapped: record.snapshot ? record.snapshot.frequencyCappedCount : null,
      truncated: record.snapshot ? record.snapshot.truncatedCount : null,
      trigger: record.snapshot?.trigger ?? null,
    },
    funnel,
    after: afterDto,
    before: toOutcome(before),
    control: controlDto,
    liftPoints: controlDto ? pointsDelta(afterDto.visitRate, controlDto.visitRate) : null,
    timeline: buildTimeline(recipientSet, events, sentAt, beforeStart, afterEnd),
  };
}
