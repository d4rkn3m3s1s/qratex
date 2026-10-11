/**
 * Admin geri bildirim akışı — QR `Feedback` ∪ `ConsumptionReview` TEK SQL akışında.
 *
 * Eski uç her kaynaktan en yeni 100 satırı bellekte birleştiriyordu (5. sayfadan sonrası
 * yanlış/boş, arama istemcide yeniden süzülüyordu). Burada iki tablo ortak kolonlarla
 * `UNION ALL` edilir; filtre, arama, sıralama ve sayfalama veritabanında yapılır. Sayaçlar
 * ve KPI'lar tek bir `COUNT(*) FILTER` sorgusundan gelir.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  FEED_DEFAULT_VIEW,
  FEED_EXPORT_MAX_ROWS,
  FEED_VIEWS,
  FRAUD_FLAG_THRESHOLD,
  feedKey,
  normalizeStringList,
  parseFeedSort,
  resolveWindow,
  searchPattern,
  type DealerOption,
  type FeedFilters,
  type FeedItem,
  type FeedPage,
  type FeedQuery,
  type FeedSentiment,
  type FeedSource,
  type FeedStats,
  type FeedView,
} from './contract';

/* ───────────────────────── Birleşik kaynak ───────────────────────── */

function sentimentCase(alias: string, analyzedCol: string): Prisma.Sql {
  const a = Prisma.raw(alias);
  const an = Prisma.raw(analyzedCol);
  return Prisma.sql`CASE
      WHEN lower(${a}."sentiment") IN ('positive', 'neutral', 'negative') THEN lower(${a}."sentiment")
      WHEN ${a}."text" IS NOT NULL AND btrim(${a}."text") <> '' AND ${a}.${an} IS NULL THEN 'pending'
      WHEN ${a}."rating" <= 2 THEN 'negative'
      WHEN ${a}."rating" >= 4 THEN 'positive'
      ELSE 'neutral'
    END`;
}

const QR_SOURCE = Prisma.sql`
  SELECT 'qr'::text AS source, f."id" AS id, f."createdAt" AS at, f."rating" AS rating, f."text" AS body,
         ${sentimentCase('f', '"aiProcessedAt"')} AS s,
         q."dealerId" AS dealer_id, COALESCE(NULLIF(btrim(d."businessName"), ''), d."name", '—') AS dealer_name,
         q."name" AS place, f."userId" AS user_id, u."name" AS user_name, u."email" AS user_email,
         (f."dealerReply" IS NOT NULL AND btrim(f."dealerReply") <> '') AS replied,
         f."dealerRepliedAt" AS replied_at,
         f."isToxic" AS is_toxic, f."trustFlagged" AS trust_flagged, f."fraudScore" AS fraud_score,
         f."isPublic" AS is_public, f."deletedAt" AS deleted_at, f."topics" AS topics, f."npsScore" AS nps
    FROM "Feedback" f
    JOIN "QRCode" q ON q."id" = f."qrCodeId"
    JOIN "User" d ON d."id" = q."dealerId"
    LEFT JOIN "User" u ON u."id" = f."userId"`;

const REVIEW_SOURCE = Prisma.sql`
  SELECT 'consumption'::text AS source, r."id" AS id, r."createdAt" AS at, r."rating" AS rating, r."text" AS body,
         ${sentimentCase('r', '"analyzedAt"')} AS s,
         c."dealerId" AS dealer_id, COALESCE(NULLIF(btrim(d."businessName"), ''), d."name", '—') AS dealer_name,
         p."name" AS place, r."customerId" AS user_id, u."name" AS user_name, u."email" AS user_email,
         (r."dealerReply" IS NOT NULL AND btrim(r."dealerReply") <> '') AS replied,
         r."dealerRepliedAt" AS replied_at,
         false AS is_toxic, false AS trust_flagged, NULL::double precision AS fraud_score,
         true AS is_public, r."deletedAt" AS deleted_at, NULL::jsonb AS topics, NULL::integer AS nps
    FROM "ConsumptionReview" r
    JOIN "Consumption" c ON c."id" = r."consumptionId"
    JOIN "User" d ON d."id" = c."dealerId"
    LEFT JOIN "Product" p ON p."id" = c."productId"
    LEFT JOIN "User" u ON u."id" = r."customerId"`;

/** Kaynak filtresi CTE'de uygulanır: istenmeyen tablo hiç taranmaz. */
export function feedCte(source: FeedSource | undefined): Prisma.Sql {
  if (source === 'qr') return QR_SOURCE;
  if (source === 'consumption') return REVIEW_SOURCE;
  return Prisma.sql`${QR_SOURCE} UNION ALL ${REVIEW_SOURCE}`;
}

const FLAGGED = Prisma.sql`(e.is_toxic OR e.trust_flagged OR COALESCE(e.fraud_score, 0) >= ${FRAUD_FLAG_THRESHOLD})`;

/** Görünüm (sekme) koşulu. Çöp kutusu dışındaki her görünüm silinmemiş kayıtlardır. */
export function viewCond(view: FeedView): Prisma.Sql {
  switch (view) {
    case 'trash':
      return Prisma.sql`e.deleted_at IS NOT NULL`;
    case 'all':
      return Prisma.sql`e.deleted_at IS NULL`;
    case 'unreplied':
      return Prisma.sql`e.deleted_at IS NULL AND NOT e.replied`;
    case 'flagged':
      return Prisma.sql`e.deleted_at IS NULL AND ${FLAGGED}`;
    case 'hidden':
      return Prisma.sql`e.deleted_at IS NULL AND NOT e.is_public`;
    case 'attention':
    default:
      return Prisma.sql`e.deleted_at IS NULL AND ((e.rating <= 2 AND NOT e.replied) OR ${FLAGGED})`;
  }
}

/** Görünüm DIŞINDAKİ filtreler (sekme sayaçları da bunlara duyarlıdır). */
export function filterConds(f: FeedFilters, today?: string): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [];
  const pattern = searchPattern(f.q);
  if (pattern) {
    conds.push(Prisma.sql`(e.body ILIKE ${pattern} OR e.user_name ILIKE ${pattern} OR e.user_email ILIKE ${pattern}
      OR e.dealer_name ILIKE ${pattern} OR e.place ILIKE ${pattern} OR e.id = ${f.q!.trim()})`);
  }
  if (f.sentiment) conds.push(Prisma.sql`e.s = ${f.sentiment}`);
  if (f.rating?.length) conds.push(Prisma.sql`e.rating = ANY(${f.rating.map(Number)}::int[])`);
  if (f.dealer) conds.push(Prisma.sql`e.dealer_id = ${f.dealer}`);
  if (f.flags?.length) {
    const parts: Prisma.Sql[] = [];
    if (f.flags.includes('toxic')) parts.push(Prisma.sql`e.is_toxic`);
    if (f.flags.includes('trust')) parts.push(Prisma.sql`e.trust_flagged`);
    if (f.flags.includes('fraud')) parts.push(Prisma.sql`COALESCE(e.fraud_score, 0) >= ${FRAUD_FLAG_THRESHOLD}`);
    conds.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }
  const w = resolveWindow(f, today);
  if (w) conds.push(Prisma.sql`e.at >= ${w.from} AND e.at < ${w.to}`);
  return conds;
}

function whereSql(conds: Prisma.Sql[]): Prisma.Sql {
  return conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
}

function orderSql(sort: string | undefined): Prisma.Sql {
  const s = parseFeedSort(sort);
  const dir = Prisma.raw(s.desc ? 'DESC' : 'ASC');
  if (s.id === 'rating') return Prisma.sql`ORDER BY e.rating ${dir}, e.at DESC, e.id DESC`;
  return Prisma.sql`ORDER BY e.at ${dir}, e.id ${dir}`;
}

/* ───────────────────────── Satır eşleme ───────────────────────── */

interface RawRow {
  source: string;
  id: string;
  at: Date;
  rating: number;
  body: string | null;
  s: string;
  dealer_id: string;
  dealer_name: string;
  place: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  replied: boolean;
  is_toxic: boolean;
  trust_flagged: boolean;
  fraud_score: number | null;
  is_public: boolean;
  deleted_at: Date | null;
  topics: unknown;
}

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0) || 0);
const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

export function toFeedItem(r: RawRow, previewLen = 280): FeedItem {
  const source = (r.source === 'consumption' ? 'consumption' : 'qr') as FeedSource;
  const body = r.body ?? null;
  return {
    key: feedKey(source, r.id),
    id: r.id,
    source,
    createdAt: iso(r.at)!,
    rating: num(r.rating),
    text: body && body.length > previewLen ? `${body.slice(0, previewLen - 1)}…` : body,
    sentiment: (['positive', 'neutral', 'negative', 'pending'].includes(r.s) ? r.s : 'neutral') as FeedSentiment,
    dealerId: r.dealer_id,
    dealerName: r.dealer_name,
    place: r.place,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    replied: !!r.replied,
    isToxic: !!r.is_toxic,
    trustFlagged: !!r.trust_flagged,
    fraudScore: r.fraud_score == null ? null : Number(r.fraud_score),
    isPublic: r.is_public !== false,
    deletedAt: iso(r.deleted_at),
    topics: normalizeStringList(r.topics).slice(0, 6),
  };
}

/* ───────────────────────── Sorgular ───────────────────────── */

export async function listFeed(q: FeedQuery, today?: string): Promise<FeedPage> {
  const view = q.view ?? FEED_DEFAULT_VIEW;
  const conds = [viewCond(view), ...filterConds(q, today)];
  const where = whereSql(conds);
  const cte = feedCte(q.source);
  const offset = (q.page - 1) * q.size;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH e AS (${cte})
      SELECT e.* FROM e ${where} ${orderSql(q.sort)}
      LIMIT ${q.size} OFFSET ${offset}`),
    prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`WITH e AS (${cte}) SELECT COUNT(*)::bigint AS n FROM e ${where}`),
  ]);
  return { items: rows.map((r) => toFeedItem(r)), total: num(count[0]?.n), page: q.page, size: q.size };
}

export async function getFeedStats(f: FeedFilters, today?: string): Promise<FeedStats> {
  const where = whereSql(filterConds(f, today));
  const live = Prisma.sql`e.deleted_at IS NULL`;
  const viewCols = FEED_VIEWS.map((v) => Prisma.sql`COUNT(*) FILTER (WHERE ${viewCond(v)})::bigint AS ${Prisma.raw(`"v_${v}"`)}`);
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    WITH e AS (${feedCte(f.source)})
    SELECT ${Prisma.join(viewCols, ', ')},
           COUNT(*) FILTER (WHERE ${live})::bigint AS total,
           AVG(e.rating) FILTER (WHERE ${live})::float8 AS avg_rating,
           COUNT(*) FILTER (WHERE ${live} AND e.s = 'negative')::bigint AS negative,
           COUNT(*) FILTER (WHERE ${live} AND e.s = 'pending')::bigint AS pending,
           COUNT(*) FILTER (WHERE ${live} AND e.replied)::bigint AS replied,
           AVG(EXTRACT(EPOCH FROM (e.replied_at - e.at)) / 3600.0)
             FILTER (WHERE ${live} AND e.replied AND e.replied_at IS NOT NULL AND e.replied_at >= e.at)::float8 AS reply_hours,
           COUNT(*) FILTER (WHERE ${live} AND e.nps IS NOT NULL)::bigint AS nps_n,
           COUNT(*) FILTER (WHERE ${live} AND e.nps >= 9)::bigint AS nps_pro,
           COUNT(*) FILTER (WHERE ${live} AND e.nps <= 6)::bigint AS nps_det,
           COUNT(*) FILTER (WHERE ${live} AND e.rating = 1)::bigint AS r1,
           COUNT(*) FILTER (WHERE ${live} AND e.rating = 2)::bigint AS r2,
           COUNT(*) FILTER (WHERE ${live} AND e.rating = 3)::bigint AS r3,
           COUNT(*) FILTER (WHERE ${live} AND e.rating = 4)::bigint AS r4,
           COUNT(*) FILTER (WHERE ${live} AND e.rating = 5)::bigint AS r5
      FROM e ${where}`);
  return toStats(rows[0] ?? {});
}

export function toStats(r: Record<string, unknown>): FeedStats {
  const views = Object.fromEntries(FEED_VIEWS.map((v) => [v, num(r[`v_${v}`])])) as FeedStats['views'];
  const npsN = num(r.nps_n);
  const avg = r.avg_rating == null ? null : Number(r.avg_rating);
  const hours = r.reply_hours == null ? null : Number(r.reply_hours);
  return {
    views,
    total: num(r.total),
    avgRating: avg == null || !Number.isFinite(avg) ? null : Math.round(avg * 100) / 100,
    negative: num(r.negative),
    pending: num(r.pending),
    replied: num(r.replied),
    avgReplyHours: hours == null || !Number.isFinite(hours) ? null : Math.round(hours * 10) / 10,
    nps: { value: npsN > 0 ? Math.round(((num(r.nps_pro) - num(r.nps_det)) / npsN) * 100) : null, n: npsN },
    distribution: { '1': num(r.r1), '2': num(r.r2), '3': num(r.r3), '4': num(r.r4), '5': num(r.r5) },
  };
}

/** Aranabilir bayi seçici: ad/işletme adıyla en fazla 20 sonuç; `id` ile tekil çözüm (seçili çip etiketi). */
export async function searchDealerOptions(q: string | undefined, id: string | undefined): Promise<DealerOption[]> {
  const pick = (d: { id: string; businessName: string | null; name: string | null }): DealerOption => ({
    id: d.id,
    name: d.businessName?.trim() || d.name || '—',
  });
  if (id) {
    const d = await prisma.user.findFirst({ where: { id, role: 'DEALER' }, select: { id: true, businessName: true, name: true } });
    return d ? [pick(d)] : [];
  }
  const t = (q ?? '').trim();
  const rows = await prisma.user.findMany({
    where: {
      role: 'DEALER',
      ...(t.length >= 1
        ? { OR: [{ businessName: { contains: t, mode: 'insensitive' } }, { name: { contains: t, mode: 'insensitive' } }] }
        : {}),
    },
    select: { id: true, businessName: true, name: true },
    orderBy: [{ businessName: 'asc' }, { name: 'asc' }],
    take: 20,
  });
  return rows.map(pick);
}

/* ───────────────────────── CSV ───────────────────────── */

export const EXPORT_HEADER = [
  'Kimlik',
  'Kaynak',
  'Tarih (İstanbul)',
  'Puan',
  'Duygu',
  'Bayi',
  'QR / Ürün',
  'Müşteri',
  'E-posta',
  'Yorum',
  'Bayi yanıtladı',
  'Toksik',
  'Güven işaretli',
  'Sahte skoru',
  'Yayında',
  'Silinme',
] as const;

const TR_DT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function exportRow(i: FeedItem): unknown[] {
  return [
    i.id,
    i.source === 'qr' ? 'QR' : 'Tüketim',
    TR_DT.format(new Date(i.createdAt)),
    i.rating,
    { positive: 'Olumlu', neutral: 'Nötr', negative: 'Olumsuz', pending: 'Analiz bekliyor' }[i.sentiment],
    i.dealerName,
    i.place ?? '',
    i.userName ?? '',
    i.userEmail ?? '',
    i.text ?? '',
    i.replied ? 'Evet' : 'Hayır',
    i.isToxic ? 'Evet' : 'Hayır',
    i.trustFlagged ? 'Evet' : 'Hayır',
    i.fraudScore == null ? '' : i.fraudScore.toFixed(2),
    i.isPublic ? 'Evet' : 'Hayır',
    i.deletedAt ? TR_DT.format(new Date(i.deletedAt)) : '',
  ];
}

/** Dışa aktarım: tüm metin (kırpılmadan), en fazla FEED_EXPORT_MAX_ROWS satır. */
export async function exportFeed(q: Omit<FeedQuery, 'page' | 'size'>, today?: string): Promise<FeedItem[]> {
  const view = q.view ?? FEED_DEFAULT_VIEW;
  const where = whereSql([viewCond(view), ...filterConds(q, today)]);
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH e AS (${feedCte(q.source)})
    SELECT e.* FROM e ${where} ${orderSql(q.sort)} LIMIT ${FEED_EXPORT_MAX_ROWS}`);
  return rows.map((r) => toFeedItem(r, 100_000));
}
