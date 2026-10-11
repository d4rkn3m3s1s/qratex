/**
 * Puan defteri (Cüzdan → Hareketler → Puan) — sunucu servisi.
 *
 * Kaynak: `PointsLedger` (lib/economy'nin yazdığı tek defter) + geçiş dönemindeki eski
 * kredilerin izi olan `points_credited` olayları. Bir olay `data.ledgerId` taşıyorsa zaten
 * defter satırı vardır ve tekrar sayılmaz; taşımıyorsa (geri bildirim, çark, seri gibi
 * henüz `mintPoints`'e taşınmamış yollar) "eski kayıt" olarak listeye girer. Böylece kullanıcı
 * bugün kazandığı geri bildirim puanını da görür; hiçbir satır iki kez görünmez.
 *
 * Gölge ban (`status = 'void'`): kullanıcıya başarı görünür (lib/economy kuralı) → satır
 * normal görünür ama `balanceAfter` gizlenir ve uzlaştırma toplamına katılmaz.
 *
 * Uzlaştırma: `User.points − Σ(listelenen, bakiyeye işlenmiş hareketler)` > 0 ise bu tutar
 * "ayrıntısı listelenmeyen bakiye" olarak dürüstçe gösterilir (defter öncesi bakiye ve
 * henüz defter/olay yazmayan eski yollar). Negatif fark gösterilmez (defter öncesi harcama).
 */
import { Prisma } from '@prisma/client';
import type { prisma as prismaClient } from '@/lib/prisma';
import { decodeCursor, encodeCursor } from '../cursor';
import { istanbulMonthStart } from '../periods';
import { GROUP_SOURCES, groupOfSource, normalizeSource, type SourceGroup } from './sources';
import { consumptionVoiceHref } from '@/lib/navigation/deep-links';

type Db = Pick<typeof prismaClient, '$queryRaw' | 'user' | 'pointsLedger' | 'analyticsEvent'>;

export type PointsDirection = 'all' | 'earn' | 'spend';
export type PointsEntryStatus = 'posted' | 'pending' | 'reversed';

export type PointsEntry = {
  /** `l_<ledgerId>` (defter) ya da `e_<eventId>` (eski kredi olayı). */
  id: string;
  at: string;
  /** İşaretli tutar: + kazanç, − harcama. */
  delta: number;
  xp: number;
  source: string;
  group: SourceGroup | 'other';
  status: PointsEntryStatus;
  balanceAfter: number | null;
  /** Kaynak kaydın kimliği (tüketim, bağış, oyun oturumu …). */
  reference: string | null;
  /** İşlemi tetikleyen İŞLETME adı (yalnız bayi aktörlerde; admin/personel adı sızdırılmaz). */
  dealerName: string | null;
  /** Kaynağa giden müşteri içi bağlantı (biliniyorsa). */
  href: string | null;
  legacy: boolean;
};

export type PointsHistoryPage = {
  items: PointsEntry[];
  nextCursor: string | null;
};

export type PointsOverview = {
  balance: number;
  earnedThisMonth: number;
  spentThisMonth: number;
  pending: number;
  /** > 0 ise "ayrıntısı listelenmeyen bakiye". */
  unlistedBalance: number;
  /** Listelenen en eski hareketin anı (yoksa null). */
  firstEntryAt: string | null;
};

type RawRow = {
  id: string;
  at: Date;
  delta: number;
  xp: number;
  source: string | null;
  status: string | null;
  balance_after: number | null;
  ref: string | null;
  dealer_name: string | null;
  legacy: boolean;
};

export const POINTS_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

/**
 * Defter ∪ eski krediler — tek alt sorgu. Tutar `int` (eski olaylarda sayısal olmayan
 * `points` 0 sayılır ve elenir). Yalnız `POINTS` para birimi (sezon XP satırları hariç).
 */
function unionSql(userId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT 'l_' || l."id" AS id,
           l."createdAt" AS at,
           l."delta" AS delta,
           l."xpDelta" AS xp,
           l."source" AS source,
           l."status" AS status,
           l."balanceAfter" AS balance_after,
           l."sourceId" AS ref,
           CASE WHEN d."role" = 'DEALER' THEN COALESCE(NULLIF(d."businessName", ''), NULLIF(d."name", '')) END AS dealer_name,
           false AS legacy
      FROM "PointsLedger" l
      LEFT JOIN "User" d ON d."id" = l."actorId"
     WHERE l."userId" = ${userId}
       AND l."currency" = 'POINTS'
       AND l."delta" <> 0
    UNION ALL
    SELECT 'e_' || e."id" AS id,
           e."createdAt" AS at,
           CASE WHEN (e."data"->>'points') ~ '^[0-9]{1,9}(\\.[0-9]+)?$'
                THEN floor((e."data"->>'points')::numeric)::int ELSE 0 END AS delta,
           CASE WHEN (e."data"->>'xp') ~ '^[0-9]{1,9}(\\.[0-9]+)?$'
                THEN floor((e."data"->>'xp')::numeric)::int ELSE 0 END AS xp,
           COALESCE(NULLIF(e."data"->>'source', ''), e."category") AS source,
           'posted' AS status,
           NULL::int AS balance_after,
           NULLIF(e."data"->>'sourceId', '') AS ref,
           NULL::text AS dealer_name,
           true AS legacy
      FROM "AnalyticsEvent" e
     WHERE e."userId" = ${userId}
       AND e."event" = 'points_credited'
       AND (e."data"->>'ledgerId') IS NULL
  `;
}

function hrefFor(source: string, ref: string | null): string | null {
  if (!ref) return null;
  const safe = /^[A-Za-z0-9_-]{1,64}$/.test(ref) ? ref : null;
  if (!safe) return null;
  if (source === 'dealer_passive' || source === 'consumption' || source === 'consumption_passive') {
    return consumptionVoiceHref(safe);
  }
  if (source === 'donation') return `/customer/wallet/donate?tab=history&receipt=${safe}`;
  return null;
}

function toEntry(row: RawRow): PointsEntry {
  const source = normalizeSource(row.source);
  const rawStatus = row.status ?? 'posted';
  const isVoid = rawStatus === 'void';
  const status: PointsEntryStatus = rawStatus === 'pending' ? 'pending' : rawStatus === 'reversed' ? 'reversed' : 'posted';
  return {
    id: row.id,
    at: new Date(row.at).toISOString(),
    delta: Number(row.delta) || 0,
    xp: Math.max(0, Number(row.xp) || 0),
    source,
    group: groupOfSource(source),
    status,
    balanceAfter: isVoid || row.balance_after == null ? null : Number(row.balance_after),
    reference: row.ref,
    dealerName: row.dealer_name,
    href: hrefFor(source, row.ref),
    legacy: !!row.legacy,
  };
}

export type PointsHistoryOptions = {
  cursor?: string | null;
  direction?: PointsDirection;
  group?: SourceGroup | null;
  limit?: number;
};

export async function getPointsHistory(db: Db, userId: string, opts: PointsHistoryOptions = {}): Promise<PointsHistoryPage> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.limit ?? POINTS_PAGE_SIZE)));
  const cursor = decodeCursor(opts.cursor);
  const conds: Prisma.Sql[] = [];
  if (cursor) conds.push(Prisma.sql`(t.at, t.id) < (${cursor.at}, ${cursor.id})`);
  if (opts.direction === 'earn') conds.push(Prisma.sql`t.delta > 0`);
  if (opts.direction === 'spend') conds.push(Prisma.sql`t.delta < 0`);
  if (opts.group) conds.push(Prisma.sql`t.source IN (${Prisma.join([...GROUP_SOURCES[opts.group]])})`);
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;

  const rows = await db.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT * FROM (${unionSql(userId)}) t
    ${where}
    ORDER BY t.at DESC, t.id DESC
    LIMIT ${limit + 1}
  `);

  const page = rows.slice(0, limit).map(toEntry);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last ? encodeCursor(last.at, last.id) : null };
}

type OverviewRow = {
  counted: number | bigint | null;
  earned_month: number | bigint | null;
  spent_month: number | bigint | null;
  pending: number | bigint | null;
  first_at: Date | null;
};

export async function getPointsOverview(db: Db, userId: string, now: Date = new Date()): Promise<PointsOverview> {
  const monthStart = istanbulMonthStart(now);
  const [user, rows] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { points: true } }),
    db.$queryRaw<OverviewRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(t.delta) FILTER (WHERE t.status IN ('posted', 'reversed')), 0)::bigint AS counted,
        COALESCE(SUM(t.delta) FILTER (WHERE t.delta > 0 AND t.status <> 'pending' AND t.at >= ${monthStart}), 0)::bigint AS earned_month,
        COALESCE(-SUM(t.delta) FILTER (WHERE t.delta < 0 AND t.status <> 'pending' AND t.at >= ${monthStart}), 0)::bigint AS spent_month,
        COALESCE(SUM(t.delta) FILTER (WHERE t.status = 'pending' AND t.delta > 0), 0)::bigint AS pending,
        MIN(t.at) AS first_at
      FROM (${unionSql(userId)}) t
    `),
  ]);
  const balance = Math.max(0, Number(user?.points ?? 0));
  const r = rows[0];
  const counted = Number(r?.counted ?? 0);
  const unlisted = balance - counted;
  return {
    balance,
    earnedThisMonth: Number(r?.earned_month ?? 0),
    spentThisMonth: Number(r?.spent_month ?? 0),
    pending: Number(r?.pending ?? 0),
    unlistedBalance: unlisted > 0 ? unlisted : 0,
    firstEntryAt: r?.first_at ? new Date(r.first_at).toISOString() : null,
  };
}

const ENTRY_ID_RE = /^(l|e)_([A-Za-z0-9_-]{1,64})$/;

/** Tek hareket (makbuz derin linki `?entry=`). Başkasının kaydı → null (IDOR yok). */
export async function getPointsEntry(db: Db, userId: string, entryId: string): Promise<PointsEntry | null> {
  const m = ENTRY_ID_RE.exec(entryId);
  if (!m) return null;
  const rows = await db.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT * FROM (${unionSql(userId)}) t WHERE t.id = ${entryId} LIMIT 1
  `);
  return rows[0] ? toEntry(rows[0]) : null;
}

/** Bir dönemde kazanılan/harcanan puan (harcama özeti "kazanç bandı"). */
export async function sumPointsInRange(
  db: Pick<Db, '$queryRaw'>,
  userId: string,
  from: Date | null,
  to: Date,
): Promise<{ earned: number; spent: number; earnedFromVisits: number; earnedFromFeedback: number }> {
  const fromCond = from ? Prisma.sql`AND t.at >= ${from}` : Prisma.empty;
  const rows = await db.$queryRaw<
    Array<{ earned: bigint | number | null; spent: bigint | number | null; visits: bigint | number | null; feedback: bigint | number | null }>
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(t.delta) FILTER (WHERE t.delta > 0), 0)::bigint AS earned,
      COALESCE(-SUM(t.delta) FILTER (WHERE t.delta < 0), 0)::bigint AS spent,
      COALESCE(SUM(t.delta) FILTER (WHERE t.delta > 0 AND t.source IN (${Prisma.join([...GROUP_SOURCES.visit])})), 0)::bigint AS visits,
      COALESCE(SUM(t.delta) FILTER (WHERE t.delta > 0 AND t.source IN (${Prisma.join([...GROUP_SOURCES.feedback])})), 0)::bigint AS feedback
    FROM (${unionSql(userId)}) t
    WHERE t.status <> 'pending' AND t.at < ${to} ${fromCond}
  `);
  const r = rows[0];
  return {
    earned: Number(r?.earned ?? 0),
    spent: Number(r?.spent ?? 0),
    earnedFromVisits: Number(r?.visits ?? 0),
    earnedFromFeedback: Number(r?.feedback ?? 0),
  };
}
