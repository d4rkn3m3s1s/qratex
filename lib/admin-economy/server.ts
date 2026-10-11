/**
 * Ekonomi Stüdyosu — sunucu veri katmanı. Sayfa (sunucu ön yükleme) ve BFF uçları aynı
 * fonksiyonları çağırır. Hata YUTULMAZ: çağıran (sayfa) `settle` ile null'a çevirir ve
 * istemci görünür hata gösterir; uçlar defineRoute'un merkezi catch'ine bırakır.
 */
import { Prisma } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  POINTS_MATRIX_SETTING_KEY,
  getDefaultPointsMatrix,
  normalizePointsMatrix,
  type PointsMatrix,
} from '@/lib/points-rules';
import {
  DEFAULT_LEAGUE_RULES,
  LEAGUE_RULES_SETTING_KEY,
  getLeagueMetaFromRules,
  normalizeLeagueRules,
  type LeagueRule,
} from '@/lib/league-rules-core';
import { ADMIN_ADJUST_LIMITS, ECONOMY_CAPS, MAX_SINGLE_MINT, MAX_SINGLE_XP } from '@/lib/economy';
import { lockResource, versionFromDate, VersionConflictError } from '@/lib/settings-version';
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import {
  HISTORY_ACTIONS,
  classifySource,
  deriveLeagueRanges,
  diffJson,
  sourceLabel,
  type CapRow,
  type CapsSnapshot,
  type EconomyFlow,
  type FlowSourceRow,
  type HistoryKind,
  type HistoryPage,
  type LeagueDistribution,
  type LeaguePreview,
  type LeaguesResource,
  type MatrixResource,
  type Multipliers,
  type MultipliersResource,
  type Versioned,
} from './contract';

type Db = typeof prisma;

// ─────────────────────────── Puan matrisi ───────────────────────────

export async function loadMatrixResource(db: Db = prisma): Promise<Versioned<MatrixResource>> {
  const row = await db.settings.findUnique({
    where: { key: POINTS_MATRIX_SETTING_KEY },
    select: { value: true, updatedAt: true },
  });
  return {
    data: { matrix: normalizePointsMatrix(row?.value), defaults: getDefaultPointsMatrix() },
    version: versionFromDate(row?.updatedAt),
  };
}

// ─────────────────────────── Çarpanlar + tavanlar ───────────────────────────

const DEFAULT_MULTIPLIERS: Multipliers = { pointMultiplier: 1, xpMultiplier: 1 };

/** Tüketiciyle (lib/gamification-settings) AYNI satır: en son güncellenen. */
async function readSettingsRow(db: Pick<Db, 'gamificationSettings'>) {
  return db.gamificationSettings.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, xpMultiplier: true, pointMultiplier: true, updatedAt: true },
  });
}

/** Tavan kategorisi → defterde o kovaya yazan kaynaklar (0 puanlı satır = tavana takıldı). */
const CAP_SOURCES: Record<string, readonly string[]> = {
  feedback: ['feedback', 'review'],
  game: ['game', 'game_quest', 'game_streak'],
  dealer_passive: ['dealer_passive', 'consumption'],
  remedy: ['remedy'],
};

const CAP_LABELS: Record<string, string> = {
  feedback: 'Geri bildirim + tüketim yorumu',
  game: 'Mini oyunlar',
  dealer_passive: 'Bayi pasif (tüketim) puanı',
  remedy: 'Telafi puanı',
};

export async function loadCapsSnapshot(db: Db = prisma, now: Date = new Date()): Promise<CapsSnapshot> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const allSources = Object.values(CAP_SOURCES).flat();
  const hits = await db.pointsLedger.groupBy({
    by: ['source'],
    where: { source: { in: allSources }, delta: 0, status: 'posted', createdAt: { gte: since } },
    _count: { _all: true },
  });
  const hitBySource = new Map(hits.map((h) => [h.source, h._count._all]));
  const rows: CapRow[] = Object.keys(CAP_SOURCES).map((category) => {
    const rule = (ECONOMY_CAPS as Record<string, { daily?: number; weekly?: number; perActorDaily?: number; requiresActor?: boolean; description: string }>)[category];
    return {
      category,
      label: CAP_LABELS[category] ?? category,
      daily: rule?.daily ?? null,
      weekly: rule?.weekly ?? null,
      perActorDaily: rule?.perActorDaily ?? null,
      requiresActor: rule?.requiresActor === true,
      description: rule?.description ?? '',
      hits7d: CAP_SOURCES[category].reduce((s, src) => s + (hitBySource.get(src) ?? 0), 0),
    };
  });
  return {
    rows,
    maxSingleMint: MAX_SINGLE_MINT,
    maxSingleXp: MAX_SINGLE_XP,
    adminAdjust: {
      perOperation: ADMIN_ADJUST_LIMITS.perOperation,
      dailyPerUser: ADMIN_ADJUST_LIMITS.dailyPerUser,
      secondApprovalAbove: ADMIN_ADJUST_LIMITS.secondApprovalAbove,
    },
  };
}

export async function loadMultipliersResource(db: Db = prisma): Promise<Versioned<MultipliersResource>> {
  // GET salt okunur: satır yoksa OLUŞTURULMAZ, varsayılan (1×) döner.
  const [row, caps] = await Promise.all([readSettingsRow(db), loadCapsSnapshot(db)]);
  return {
    data: {
      multipliers: row
        ? {
            pointMultiplier: row.pointMultiplier > 0 ? row.pointMultiplier : 1,
            xpMultiplier: row.xpMultiplier > 0 ? row.xpMultiplier : 1,
          }
        : DEFAULT_MULTIPLIERS,
      isDefault: !row,
      caps,
    },
    version: versionFromDate(row?.updatedAt),
  };
}

/** Yükleme/simülasyon için yalnız çarpanlar. */
export async function readMultipliers(db: Db = prisma): Promise<Multipliers> {
  const row = await readSettingsRow(db);
  if (!row) return DEFAULT_MULTIPLIERS;
  return {
    pointMultiplier: row.pointMultiplier > 0 ? row.pointMultiplier : 1,
    xpMultiplier: row.xpMultiplier > 0 ? row.xpMultiplier : 1,
  };
}

/**
 * Çarpanları sürüm kontrolüyle yazar (advisory kilit + baseVersion + aynı tx'te audit).
 * Yalnız iki etkili alan yazılır; diğer (etkisiz) sütunlara dokunulmaz.
 */
export async function saveMultipliers(
  input: Multipliers & { baseVersion: string },
  actor: { userId: string; ipAddress: string | null; userAgent: string | null },
  db: Db = prisma
): Promise<Versioned<Multipliers>> {
  const result = await db.$transaction(async (tx) => {
    await lockResource(tx, 'gamification_settings');
    const current = await readSettingsRow(tx);
    const currentVersion = versionFromDate(current?.updatedAt);
    if (input.baseVersion !== currentVersion) {
      throw new VersionConflictError(currentVersion, [{ key: 'gamification_settings', currentVersion }]);
    }
    const data = { pointMultiplier: input.pointMultiplier, xpMultiplier: input.xpMultiplier };
    const saved = current
      ? await tx.gamificationSettings.update({
          where: { id: current.id },
          data: {
            ...data,
            // @updatedAt her yazımda yenilenir; aynı ms'de iki yazım sürümü eşitlemesin.
            updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
          },
          select: { id: true, pointMultiplier: true, xpMultiplier: true, updatedAt: true },
        })
      : await tx.gamificationSettings.create({
          data,
          select: { id: true, pointMultiplier: true, xpMultiplier: true, updatedAt: true },
        });
    await tx.auditLog.create({
      data: {
        userId: actor.userId,
        action: HISTORY_ACTIONS.multipliers,
        entity: 'GamificationSettings',
        entityId: saved.id,
        oldData: current
          ? ({ pointMultiplier: current.pointMultiplier, xpMultiplier: current.xpMultiplier } as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        newData: data as Prisma.InputJsonValue,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });
    return saved;
  });
  try {
    // Dinamik içe aktarma: tüketici modülü (unstable_cache) yalnız yazımda yüklenir.
    const { GAMIFICATION_SETTINGS_TAG } = await import('@/lib/gamification-settings');
    revalidateTag(GAMIFICATION_SETTINGS_TAG, 'max');
  } catch {
    /* test/edge ortamı: önbellek etiketi yoksa yazım yine geçerli */
  }
  return {
    data: { pointMultiplier: result.pointMultiplier, xpMultiplier: result.xpMultiplier },
    version: versionFromDate(result.updatedAt),
  };
}

// ─────────────────────────── Ligler ───────────────────────────

const LEAGUE_POPULATION = { role: 'CUSTOMER' as const, isDemo: false, anonymizedAt: null };

/**
 * Eşik birleşiminden aralıklar çıkarır ve her aralıktaki müşteri sayısını sayar
 * (en fazla 2 × 7 aralık → ≤ 14 COUNT, N+1 yok).
 */
async function countByBoundaries(db: Db, boundaries: number[]): Promise<Array<{ from: number; to: number | null; count: number }>> {
  const sorted = Array.from(new Set([0, ...boundaries])).sort((a, b) => a - b);
  const intervals = sorted.map((from, i) => ({ from, to: i + 1 < sorted.length ? sorted[i + 1] : null }));
  const counts = await Promise.all(
    intervals.map((iv, i) =>
      db.user.count({
        where: {
          ...LEAGUE_POPULATION,
          points: i === 0 ? (iv.to === null ? undefined : { lt: iv.to }) : iv.to === null ? { gte: iv.from } : { gte: iv.from, lt: iv.to },
        },
      })
    )
  );
  return intervals.map((iv, i) => ({ ...iv, count: counts[i] }));
}

function emptyDist(rules: readonly LeagueRule[]): LeagueDistribution {
  return Object.fromEntries(rules.map((r) => [r.key, 0]));
}

export async function leagueDistribution(rules: LeagueRule[], db: Db = prisma): Promise<{ distribution: LeagueDistribution; total: number }> {
  const parts = await countByBoundaries(db, rules.map((r) => r.minPoints));
  const distribution = emptyDist(rules);
  let total = 0;
  for (const p of parts) {
    const league = getLeagueMetaFromRules(p.from, rules);
    distribution[league.key] = (distribution[league.key] ?? 0) + p.count;
    total += p.count;
  }
  return { distribution, total };
}

export async function previewLeagues(current: LeagueRule[], draft: LeagueRule[], db: Db = prisma): Promise<LeaguePreview> {
  const parts = await countByBoundaries(db, [...current.map((r) => r.minPoints), ...draft.map((r) => r.minPoints)]);
  const cur = emptyDist(current);
  const nxt = emptyDist(draft);
  const idx = (rules: LeagueRule[], key: string) => rules.findIndex((r) => r.key === key);
  let promoted = 0;
  let demoted = 0;
  let unchanged = 0;
  let total = 0;
  for (const p of parts) {
    const a = getLeagueMetaFromRules(p.from, current);
    const b = getLeagueMetaFromRules(p.from, draft);
    cur[a.key] = (cur[a.key] ?? 0) + p.count;
    nxt[b.key] = (nxt[b.key] ?? 0) + p.count;
    const ia = idx(current, a.key);
    const ib = idx(draft, b.key);
    if (ib > ia) promoted += p.count;
    else if (ib < ia) demoted += p.count;
    else unchanged += p.count;
    total += p.count;
  }
  return { current: cur, draft: nxt, promoted, demoted, unchanged, total };
}

export async function loadLeaguesResource(db: Db = prisma): Promise<Versioned<LeaguesResource>> {
  const row = await db.settings.findUnique({
    where: { key: LEAGUE_RULES_SETTING_KEY },
    select: { value: true, updatedAt: true },
  });
  // Eski kayıtlardaki boşluk/çakışma editörde bitişik aralıklara çevrilir (kaydedilince düzelir).
  const rules = deriveLeagueRanges(normalizeLeagueRules(row?.value));
  let distribution: LeagueDistribution | null = null;
  let totalUsers: number | null = null;
  try {
    const d = await leagueDistribution(rules, db);
    distribution = d.distribution;
    totalUsers = d.total;
  } catch (err) {
    // Dağılım yardımcı bilgidir: okunamazsa kurallar yine düzenlenebilir, arayüz "dağılım okunamadı" der.
    console.error('[admin-economy] lig dağılımı okunamadı:', err);
  }
  return { data: { rules, isDefault: !row, distribution, totalUsers }, version: versionFromDate(row?.updatedAt) };
}

export { DEFAULT_LEAGUE_RULES };

/** Kayıtlı kurallar (dağılımsız, önizleme için). */
export async function readSavedLeagueRules(db: Db = prisma): Promise<LeagueRule[]> {
  const row = await db.settings.findUnique({ where: { key: LEAGUE_RULES_SETTING_KEY }, select: { value: true } });
  return deriveLeagueRanges(normalizeLeagueRules(row?.value));
}

// ─────────────────────────── Akış (PointsLedger) ───────────────────────────

const EXCLUDED_FROM_SERIES = ['squad_escrow', 'squad_escrow_refund', 'squad_battle', 'admin_adjust', 'reversal', 'opening_balance', 'demo_seed'];

type GroupRow = { source: string; _sum: { delta: number | null; xpDelta: number | null }; _count: { _all: number } };

function totalsOf(rows: FlowSourceRow[]) {
  const minted = rows.filter((r) => r.kind === 'mint').reduce((s, r) => s + r.points, 0);
  const spent = rows.filter((r) => r.kind === 'sink').reduce((s, r) => s + r.points, 0);
  return { minted, spent, net: minted - spent };
}

function toRows(pos: GroupRow[], neg: GroupRow[]): FlowSourceRow[] {
  const rows: FlowSourceRow[] = [];
  for (const g of pos) {
    rows.push({
      source: g.source,
      // Düzeltme/transfer iki yönde de aynı türdür → aynı kaynak iki satır olur; yönü etikette göster.
      label: classifySource(g.source, 1) === 'mint' ? sourceLabel(g.source) : `${sourceLabel(g.source)} (+)`,
      kind: classifySource(g.source, 1),
      points: g._sum.delta ?? 0,
      count: g._count._all,
      xp: g._sum.xpDelta ?? 0,
    });
  }
  for (const g of neg) {
    const kind = classifySource(g.source, -1);
    rows.push({
      source: g.source,
      label: kind === 'sink' ? sourceLabel(g.source) : `${sourceLabel(g.source)} (−)`,
      kind,
      points: Math.abs(g._sum.delta ?? 0),
      count: g._count._all,
      xp: g._sum.xpDelta ?? 0,
    });
  }
  return rows.sort((a, b) => b.points - a.points);
}

export async function getEconomyFlow(days: number, db: Db = prisma, now: Date = new Date()): Promise<EconomyFlow> {
  const today = istanbulDay(now);
  const fromDay = addDays(today, -(days - 1));
  const prevFromDay = addDays(fromDay, -days);
  const from = istanbulDayStart(fromDay);
  const prevFrom = istanbulDayStart(prevFromDay);
  const base = { status: 'posted', currency: 'POINTS' } as const;

  const group = (gte: Date, lt: Date | null, sign: 'pos' | 'neg') =>
    db.pointsLedger.groupBy({
      by: ['source'],
      where: {
        ...base,
        createdAt: lt ? { gte, lt } : { gte },
        delta: sign === 'pos' ? { gt: 0 } : { lt: 0 },
      },
      _sum: { delta: true, xpDelta: true },
      _count: { _all: true },
    }) as unknown as Promise<GroupRow[]>;

  const [pos, neg, prevPos, prevNeg, supplyAgg, series, pending, voided] = await Promise.all([
    group(from, null, 'pos'),
    group(from, null, 'neg'),
    group(prevFrom, from, 'pos'),
    group(prevFrom, from, 'neg'),
    db.user.aggregate({ _sum: { points: true }, where: { isDemo: false } }),
    db.$queryRaw<Array<{ day: string; mint: bigint | number | null; sink: bigint | number | null }>>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
             SUM(CASE WHEN "delta" > 0 THEN "delta" ELSE 0 END) AS mint,
             SUM(CASE WHEN "delta" < 0 THEN -"delta" ELSE 0 END) AS sink
      FROM "PointsLedger"
      WHERE "status" = 'posted' AND "currency" = 'POINTS' AND "createdAt" >= ${from}
        AND NOT ("source" = ANY(${EXCLUDED_FROM_SERIES}))
      GROUP BY 1
      ORDER BY 1`,
    db.pointsLedger.count({ where: { status: 'pending', createdAt: { gte: from } } }),
    db.pointsLedger.count({ where: { status: 'void', createdAt: { gte: from } } }),
  ]);

  const bySource = toRows(pos, neg);
  const cur = totalsOf(bySource);
  const prev = totalsOf(toRows(prevPos, prevNeg));
  const supply = supplyAgg._sum.points ?? 0;
  const startSupply = supply - cur.net;

  // Boş günleri 0 ile doldur (grafik kesintisiz; "veri yok" ile "0" ayrımı toplamda yapılır).
  const byDay = new Map(series.map((r) => [r.day, { mint: Number(r.mint ?? 0), sink: Number(r.sink ?? 0) }]));
  const filled = Array.from({ length: days }, (_, i) => {
    const day = addDays(fromDay, i);
    const v = byDay.get(day);
    return { day, mint: v?.mint ?? 0, sink: v?.sink ?? 0 };
  });

  return {
    days,
    from: from.toISOString(),
    to: now.toISOString(),
    minted: cur.minted,
    spent: cur.spent,
    net: cur.net,
    previous: prev,
    supply,
    inflationPct: startSupply > 0 ? (cur.net / startSupply) * 100 : null,
    redeemPct: cur.minted > 0 ? (cur.spent / cur.minted) * 100 : null,
    bySource,
    series: filled,
    pending,
    voided,
    asOf: now.toISOString(),
  };
}

// ─────────────────────────── Geçmiş ───────────────────────────

function actorName(row: { user: { name: string | null; email: string | null } | null; actorSnapshot: Prisma.JsonValue | null }): string {
  if (row.user) return row.user.name?.trim() || row.user.email || 'Admin';
  const snap = row.actorSnapshot as { name?: string; email?: string } | null;
  return snap?.name || snap?.email || 'Silinmiş kullanıcı';
}

export async function listHistory(kind: HistoryKind, page: number, size: number, db: Db = prisma): Promise<HistoryPage> {
  const where = { action: HISTORY_ACTIONS[kind] };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      select: {
        id: true,
        createdAt: true,
        oldData: true,
        newData: true,
        actorSnapshot: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  return {
    page,
    size,
    total,
    items: rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actor: actorName(r),
      changes: diffJson(r.oldData, r.newData),
      snapshot: r.newData,
    })),
  };
}

/** Simülasyon için kayıtlı matris (önbelleksiz, admin düşük trafik). */
export async function readSavedMatrix(db: Db = prisma): Promise<PointsMatrix> {
  return (await loadMatrixResource(db)).data.matrix;
}
