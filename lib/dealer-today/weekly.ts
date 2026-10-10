/**
 * Bugün → Haftalık rapor sekmesi + arşiv (eski `/dealer/weekly-brief`, operations-brief'in
 * "Haftalık Stratejik Özet" paneli ve copilot'un dönem özeti burada birleşir).
 *
 * Denetim (dealer_weekly-brief.md, dealer_operations-brief.md):
 *  - Haftanın sayıları artık KAYITLARDAN deterministik hesaplanır (İstanbul Pazartesi-Pazar);
 *    eski sayfa yalnız cron'un sabit playbook cümlesini "AI özeti" diye gösteriyordu (SAHTE).
 *  - Cron'un kural tabanlı önerisi (DealerWeeklyBrief.recommendedAction) gösterilir ama
 *    "Otomatik öneri (kural tabanlı)" olarak dürüstçe etiketlenir.
 *  - AI anlatısı yalnız bu sayıları yorumlar; GET'te LLM YOK (önbellekten okunur), üretim ayrı
 *    POST ucundadır (lib/dealer-today/narrative.ts).
 *  - Hata görünür: sorgu hatası fırlatılır, "henüz özet yok" boş durumuna dönüşmez.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addDays, dayToUTCDate, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import { buildThemes, buildWeeklyMetrics, isWeekKey, latestCompletedWeek, pct, toInt, weekStartOf, weightedAvg, type WeekTotals } from './core';
import { isNarrativeAvailable, readNarrative } from './narrative';
import type { FeedbackSource, WeeklyArchivePage, WeeklyArchiveRow, WeeklyReport } from './types';

type Db = typeof prisma;

/** En fazla bu kadar geriye gidilebilir (2 yıl). */
export const WEEKLY_MAX_BACK_WEEKS = 104;
export const WEEKLY_ARCHIVE_PAGE = 8;

export class WeeklyRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeeklyRangeError';
  }
}

function resolveWeek(week: string | null | undefined, now: Date): { week: string; current: string } {
  const current = weekStartOf(istanbulDay(now));
  const target = week ?? latestCompletedWeek(now);
  if (!isWeekKey(target)) throw new WeeklyRangeError('Hafta bir Pazartesi tarihi (YYYY-AA-GG) olmalı.');
  if (target > current) throw new WeeklyRangeError('Gelecek bir hafta için rapor yok.');
  if (target < addDays(current, -7 * WEEKLY_MAX_BACK_WEEKS)) throw new WeeklyRangeError('Bu hafta arşiv sınırının dışında.');
  return { week: target, current };
}

type TotalsRow = { cur: boolean; src: FeedbackSource; n: number | bigint; sum: number | bigint | null; neg: number | bigint; replied: number | bigint };

function emptyTotals(): WeekTotals {
  return { n: 0, sum: 0, negative: 0, replied: 0, consumptions: 0 };
}

/** Bayinin bir haftası (+ önceki hafta) için deterministik toplamlar. */
async function weekTotals(db: Db, dealerId: string, week: string) {
  const start = istanbulDayStart(week);
  const end = istanbulDayStart(addDays(week, 7));
  const prevStart = istanbulDayStart(addDays(week, -7));
  const [rows, csCur, csPrev] = await Promise.all([
    db.$queryRaw<TotalsRow[]>(Prisma.sql`
      SELECT (u.ts >= ${start}) AS cur, u.src,
             COUNT(*)::int AS n,
             COALESCE(SUM(u.rating), 0)::int AS sum,
             COUNT(*) FILTER (WHERE u.rating <= 2)::int AS neg,
             COUNT(*) FILTER (WHERE u.replied)::int AS replied
      FROM (
        SELECT 'qr' AS src, f."createdAt" AS ts, f.rating, (f."dealerReply" IS NOT NULL) AS replied
        FROM "Feedback" f
        INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
        WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL AND f."createdAt" >= ${prevStart} AND f."createdAt" < ${end}
        UNION ALL
        SELECT 'consumption' AS src, cr."createdAt" AS ts, cr.rating, (cr."dealerReply" IS NOT NULL) AS replied
        FROM "ConsumptionReview" cr
        INNER JOIN "Consumption" c ON c.id = cr."consumptionId"
        WHERE c."dealerId" = ${dealerId} AND cr."deletedAt" IS NULL AND cr."createdAt" >= ${prevStart} AND cr."createdAt" < ${end}
      ) u
      GROUP BY 1, 2
    `),
    db.consumption.count({ where: { dealerId, createdAt: { gte: start, lt: end } } }),
    db.consumption.count({ where: { dealerId, createdAt: { gte: prevStart, lt: start } } }),
  ]);
  const cur = emptyTotals();
  const prev = emptyTotals();
  const sources: Record<FeedbackSource, number> = { qr: 0, consumption: 0 };
  for (const r of rows) {
    const t = r.cur ? cur : prev;
    t.n += toInt(r.n);
    t.sum += toInt(r.sum);
    t.negative += toInt(r.neg);
    t.replied += toInt(r.replied);
    if (r.cur) sources[r.src] = (sources[r.src] ?? 0) + toInt(r.n);
  }
  cur.consumptions = csCur;
  prev.consumptions = csPrev;
  return { cur, prev, sources, start, end, prevStart };
}

export async function loadWeeklyReport(
  dealerId: string,
  weekParam: string | null,
  opts: { now?: Date; db?: Db } = {}
): Promise<WeeklyReport> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const { week, current } = resolveWeek(weekParam, now);
  const totals = await weekTotals(db, dealerId, week);
  const briefFrom = dayToUTCDate(week);
  const briefTo = dayToUTCDate(addDays(week, 1));

  const [curThemes, prevThemes, brief, narrative, aiAvailable] = await Promise.all([
    db.feedback.findMany({
      where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: totals.start, lt: totals.end } },
      select: { themes: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    db.feedback.findMany({
      where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: totals.prevStart, lt: totals.start } },
      select: { themes: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    // Cron anahtarı = haftanın Pazartesi 00:00 UTC'si (lib/weekly-digest-core.ts).
    db.dealerWeeklyBrief.findFirst({
      where: { dealerId, weekStart: { gte: briefFrom, lt: briefTo } },
      select: { recommendedAction: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    readNarrative(dealerId, week),
    isNarrativeAvailable(dealerId),
  ]);

  const recommendation = brief?.recommendedAction?.trim();
  return {
    week,
    weekEnd: addDays(week, 6),
    isComplete: week < current,
    metrics: buildWeeklyMetrics(totals.cur, totals.prev, now.toISOString()),
    sources: totals.sources,
    themes: buildThemes(curThemes, prevThemes),
    autoRecommendation: recommendation ? { text: recommendation.slice(0, 600), createdAt: brief!.createdAt.toISOString() } : null,
    narrative,
    aiAvailable,
    prevWeek: addDays(week, -7) >= addDays(current, -7 * WEEKLY_MAX_BACK_WEEKS) ? addDays(week, -7) : null,
    nextWeek: week < current ? addDays(week, 7) : null,
  };
}

type ArchiveRow = { week: string; n: number | bigint; sum: number | bigint | null; neg: number | bigint; replied: number | bigint };

/**
 * Tamamlanmış haftaların arşivi (yeni → eski), `before` (Pazartesi, hariç) imleciyle sayfalı.
 * Her hafta sıfır olsa da listelenir (sessiz hafta da bilgi); hesap tek GROUP BY turunda.
 */
export async function loadWeeklyArchive(
  dealerId: string,
  beforeParam: string | null,
  opts: { now?: Date; db?: Db; limit?: number } = {}
): Promise<WeeklyArchivePage> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? WEEKLY_ARCHIVE_PAGE, 1), 26);
  const current = weekStartOf(istanbulDay(now));
  const before = beforeParam ?? current;
  if (!isWeekKey(before) || before > current) throw new WeeklyRangeError('Geçersiz arşiv imleci.');
  const floor = addDays(current, -7 * WEEKLY_MAX_BACK_WEEKS);
  const startWeek = addDays(before, -7 * limit) < floor ? floor : addDays(before, -7 * limit);
  if (startWeek >= before) return { items: [], nextBefore: null };
  const from = istanbulDayStart(startWeek);
  const to = istanbulDayStart(before);
  const LOCAL_WEEK = (col: string) =>
    Prisma.sql`to_char(date_trunc('week', ((${Prisma.raw(col)} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')), 'YYYY-MM-DD')`;

  const [fbRows, csRows, briefs, user] = await Promise.all([
    db.$queryRaw<ArchiveRow[]>(Prisma.sql`
      SELECT u.week, COUNT(*)::int AS n, COALESCE(SUM(u.rating), 0)::int AS sum,
             COUNT(*) FILTER (WHERE u.rating <= 2)::int AS neg,
             COUNT(*) FILTER (WHERE u.replied)::int AS replied
      FROM (
        SELECT ${LOCAL_WEEK('f."createdAt"')} AS week, f.rating, (f."dealerReply" IS NOT NULL) AS replied
        FROM "Feedback" f
        INNER JOIN "QRCode" q ON q.id = f."qrCodeId"
        WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL AND f."createdAt" >= ${from} AND f."createdAt" < ${to}
        UNION ALL
        SELECT ${LOCAL_WEEK('cr."createdAt"')} AS week, cr.rating, (cr."dealerReply" IS NOT NULL) AS replied
        FROM "ConsumptionReview" cr
        INNER JOIN "Consumption" c ON c.id = cr."consumptionId"
        WHERE c."dealerId" = ${dealerId} AND cr."deletedAt" IS NULL AND cr."createdAt" >= ${from} AND cr."createdAt" < ${to}
      ) u
      GROUP BY u.week
    `),
    db.$queryRaw<Array<{ week: string; n: number | bigint }>>(Prisma.sql`
      SELECT ${LOCAL_WEEK('"createdAt"')} AS week, COUNT(*)::int AS n
      FROM "Consumption"
      WHERE "dealerId" = ${dealerId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY 1
    `),
    db.dealerWeeklyBrief.findMany({
      where: { dealerId, weekStart: { gte: dayToUTCDate(startWeek), lt: dayToUTCDate(before) } },
      select: { weekStart: true },
      take: 60,
    }),
    db.user.findUnique({ where: { id: dealerId }, select: { createdAt: true } }),
  ]);

  const fb = new Map(fbRows.map((r) => [r.week, r]));
  const cs = new Map(csRows.map((r) => [r.week, toInt(r.n)]));
  const briefWeeks = new Set(briefs.map((b) => b.weekStart.toISOString().slice(0, 10)));
  const items: WeeklyArchiveRow[] = [];
  for (let wk = addDays(before, -7); wk >= startWeek; wk = addDays(wk, -7)) {
    const r = fb.get(wk);
    const n = toInt(r?.n);
    items.push({
      week: wk,
      feedback: n,
      avgRating: weightedAvg(toInt(r?.sum), n),
      negative: toInt(r?.neg),
      responseRate: pct(toInt(r?.replied), n),
      consumptions: cs.get(wk) ?? 0,
      hasBrief: briefWeeks.has(wk),
    });
  }
  const accountStart = user?.createdAt ?? null;
  const more = startWeek > floor && (!accountStart || from.getTime() > accountStart.getTime());
  return { items, nextBefore: more ? startWeek : null };
}
