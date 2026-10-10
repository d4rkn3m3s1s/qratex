/**
 * An Motoru — sunucu tarafı "an kutusu" (spec §1 · Yakalama).
 *
 * Müşterinin büyük anları (seviye, lig, rozet) `CustomerMoment` tablosuna, kazanımla AYNI
 * transaction içinde yazılır. İstemci (`MomentHost`) görülmemiş anları çekip oynatır ve
 * "görüldü" işaretler → hiçbir an kaybolmaz (cron/çevrim dışı dahil), hiçbiri iki kez oynamaz.
 *
 * "Tam bir kez" garantisi: `@@unique([userId, dedupeKey])` + `createMany({ skipDuplicates })`
 * (`ON CONFLICT DO NOTHING`). Anahtarlar:
 *   - `level:<to>`
 *   - `league:<seasonKey>:<toKey>`  (bir lige sezon içinde İLK girişte bir kez)
 *   - `badge:<badgeId>`
 *
 * An yazımı ASLA kazanımı bozmaz: hata yutulur + loglanır. Transaction içinde çağrıldığında
 * yazım bir SAVEPOINT içinde yapılır — Postgres hatası (ör. tablo henüz canlıda yok) yalnız
 * savepoint'e geri sarılır, çağıranın kredi transaction'ı İPTAL OLMAZ.
 */
import type { Prisma } from '@prisma/client';
import { getLeagueRules, DEFAULT_LEAGUE_RULES, type LeagueRule } from '@/lib/league-rules';
import type { BadgeMomentPayload, LeagueUpPayload, LevelUpPayload, MomentInput } from './types';
import { isMomentKind } from './types';

/** Kök Prisma istemcisi ya da transaction istemcisi (yalnız kullanılan yüzey). */
export type MomentsDb = Pick<Prisma.TransactionClient, 'customerMoment'> & {
  $transaction?: unknown;
  $executeRawUnsafe?: (query: string, ...values: unknown[]) => Promise<number>;
};

const MAX_DEDUPE_KEY_LEN = 200;
const MAX_ITEMS_PER_CALL = 20;
const SAVEPOINT = 'qratex_moments';

// ───────────────────────────── Dedupe anahtarları ─────────────────────────────

/**
 * Lig sezon anahtarı. Bugün sezon kavramı yok → sabit `s0` ("ömür boyu bir kez" davranışı).
 * F4.4'te lig sezon XP'ye geçince YALNIZ bu üretici değişir (ör. `2027-s1`); böylece yeni
 * sezonda aynı lige yeniden yükselmek tekrar kutlanır (yol haritası §5.3).
 */
export const DEFAULT_LEAGUE_SEASON_KEY = 's0';

export function currentLeagueSeasonKey(): string {
  return DEFAULT_LEAGUE_SEASON_KEY;
}

export function levelMomentKey(toLevel: number): string {
  return `level:${Math.floor(toLevel)}`;
}

export function leagueMomentKey(seasonKey: string, toKey: string): string {
  return `league:${seasonKey}:${toKey}`;
}

export function badgeMomentKey(badgeId: string): string {
  return `badge:${badgeId}`;
}

// ───────────────────────────── Yazım ─────────────────────────────

function isTransactionClient(db: MomentsDb): boolean {
  return typeof db.$transaction !== 'function';
}

function sanitize(items: readonly MomentInput[]): MomentInput[] {
  const seen = new Set<string>();
  const out: MomentInput[] = [];
  for (const item of items) {
    if (!item || !isMomentKind(item.kind)) continue;
    const key = typeof item.dedupeKey === 'string' ? item.dedupeKey : '';
    if (!key || key.length > MAX_DEDUPE_KEY_LEN || seen.has(key)) continue;
    if (!item.payload || typeof item.payload !== 'object') continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_ITEMS_PER_CALL) break;
  }
  return out;
}

/**
 * Transaction içindeyse işlemi SAVEPOINT ile sarar: hata yalnız savepoint'e geri sarılır,
 * dış transaction kullanılabilir kalır. Kök istemcide (otomatik commit) doğrudan çalışır.
 */
async function withSavepoint<T>(db: MomentsDb, fn: () => Promise<T>): Promise<T> {
  const exec = db.$executeRawUnsafe;
  if (!isTransactionClient(db) || typeof exec !== 'function') return fn();
  await exec.call(db, `SAVEPOINT ${SAVEPOINT}`);
  try {
    const result = await fn();
    await exec.call(db, `RELEASE SAVEPOINT ${SAVEPOINT}`);
    return result;
  } catch (err) {
    try {
      await exec.call(db, `ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      await exec.call(db, `RELEASE SAVEPOINT ${SAVEPOINT}`);
    } catch (rollbackErr) {
      console.error('[moments] savepoint geri sarılamadı:', rollbackErr);
    }
    throw err;
  }
}

/**
 * Anları yazar. Aynı `(userId, dedupeKey)` zaten varsa sessizce atlanır.
 * Asla fırlatmaz; yazılan YENİ satır sayısını döndürür (hata → 0).
 */
export async function recordMoments(db: MomentsDb, userId: string, items: readonly MomentInput[]): Promise<number> {
  if (typeof userId !== 'string' || userId.length === 0) return 0;
  const clean = sanitize(items ?? []);
  if (clean.length === 0) return 0;

  try {
    const res = await withSavepoint(db, () =>
      db.customerMoment.createMany({
        data: clean.map((item) => ({
          userId,
          kind: item.kind,
          payload: item.payload as unknown as Prisma.InputJsonObject,
          dedupeKey: item.dedupeKey,
        })),
        skipDuplicates: true,
      })
    );
    return typeof res?.count === 'number' ? res.count : 0;
  } catch (err) {
    console.error('[moments] an kaydı yazılamadı:', { userId, kinds: clean.map((i) => i.kind) }, err);
    return 0;
  }
}

export interface BadgeMomentSource {
  id: string;
  name: string;
  icon?: string | null;
  rarity?: string | null;
  color?: string | null;
  hiddenUntilEarned?: boolean | null;
}

export function badgeMomentPayload(badge: BadgeMomentSource): BadgeMomentPayload {
  return {
    badgeId: badge.id,
    name: badge.name,
    icon: badge.icon ?? '',
    rarity: badge.rarity || 'common',
    color: badge.color ?? null,
    hidden: badge.hiddenUntilEarned === true,
  };
}

/**
 * Rozet anı. `userBadge` GERÇEKTEN yeni oluşturulduktan hemen sonra, aynı transaction
 * içinde çağrılır (rozet verme servisi `awardBadge` tek çağıran olmalı — yol haritası §5.3).
 */
export async function recordBadgeMoment(db: MomentsDb, userId: string, badge: BadgeMomentSource): Promise<number> {
  if (!badge || typeof badge.id !== 'string' || badge.id.length === 0) return 0;
  return recordMoments(db, userId, [
    { kind: 'badge', dedupeKey: badgeMomentKey(badge.id), payload: badgeMomentPayload(badge) },
  ]);
}

// ───────────────────────────── Lig yükselme algılama ─────────────────────────────

/**
 * Puanın düştüğü lig sırası: `minPoints <= points` olan EN YÜKSEK kural. Son kademe açık
 * uçludur (üst sınırı aşan kullanıcı en alt lige "düşmez") ve kurallar arasındaki boşluklar
 * alt lige sayılır — böylece sahte `league_up` üretilmez.
 */
export function leagueIndexAt(points: number, rules: readonly LeagueRule[]): number {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  let idx = 0;
  for (let i = 0; i < rules.length; i++) {
    if (p >= rules[i].minPoints) idx = i;
  }
  return idx;
}

/** Önce/sonra bakiyesine göre lig yükselişi; yoksa null. Kurallar minPoints'e göre sıralanır. */
export function detectLeagueUp(
  beforePoints: number,
  afterPoints: number,
  rules: readonly LeagueRule[]
): { from: LeagueRule; to: LeagueRule } | null {
  const list = [...(rules.length ? rules : DEFAULT_LEAGUE_RULES)].sort((a, b) => a.minPoints - b.minPoints);
  if (!(afterPoints > beforePoints)) return null;
  const fromIdx = leagueIndexAt(beforePoints, list);
  const toIdx = leagueIndexAt(afterPoints, list);
  if (toIdx <= fromIdx) return null;
  return { from: list[fromIdx], to: list[toIdx] };
}

// ───────────────────────────── creditPointsAndXp kancası ─────────────────────────────

export interface CreditMomentContext {
  userId: string;
  /** Bu çağrıda eklenen puan (≥ 0). */
  pointsAdded: number;
  /** Artış SONRASI bakiye (atomik update dönüşü). */
  pointsAfter: number;
  /** Artış SONRASI toplam XP. */
  xpAfter: number;
  /** Artış öncesi kayıtlı seviye. */
  levelBefore: number;
  levelAfter: number;
  /** Seviye bump'ını BU çağrı mı yaptı (yarış-güvenli). */
  isLevelUp: boolean;
}

/**
 * `creditPointsAndXp` içinden çağrılır: seviye atlama ve lig yükselme anlarını yakalar.
 * Asla fırlatmaz. An yalnız seviye/lig değiştiğinde yazılır (nadir); lig kuralları
 * cache'li okunur (ek sorgu yalnız cache soğukken).
 */
export async function captureCreditMoments(
  db: MomentsDb & { settings?: unknown },
  ctx: CreditMomentContext
): Promise<number> {
  try {
    const items: MomentInput[] = [];

    if (ctx.isLevelUp && ctx.levelAfter > ctx.levelBefore) {
      const payload: LevelUpPayload = { from: ctx.levelBefore, to: ctx.levelAfter, xp: ctx.xpAfter };
      items.push({ kind: 'level_up', dedupeKey: levelMomentKey(ctx.levelAfter), payload });
    }

    if (ctx.pointsAdded > 0) {
      let rules: LeagueRule[];
      try {
        rules = await getLeagueRules(db as Parameters<typeof getLeagueRules>[0]);
      } catch (err) {
        console.warn('[moments] lig kuralları okunamadı, varsayılanlar kullanılıyor:', err);
        rules = DEFAULT_LEAGUE_RULES;
      }
      const before = Math.max(0, ctx.pointsAfter - ctx.pointsAdded);
      const up = detectLeagueUp(before, ctx.pointsAfter, rules);
      if (up) {
        const payload: LeagueUpPayload = {
          fromKey: up.from.key,
          fromName: up.from.name,
          toKey: up.to.key,
          toName: up.to.name,
          points: ctx.pointsAfter,
        };
        items.push({
          kind: 'league_up',
          dedupeKey: leagueMomentKey(currentLeagueSeasonKey(), up.to.key),
          payload,
        });
      }
    }

    if (items.length === 0) return 0;
    return await recordMoments(db, ctx.userId, items);
  } catch (err) {
    console.error('[moments] kredi anları yakalanamadı:', err);
    return 0;
  }
}

// ───────────────────────────── Temizlik ─────────────────────────────

export const SEEN_MOMENT_RETENTION_DAYS = 30;
export const UNSEEN_MOMENT_RETENTION_DAYS = 90;

/** db-cleanup cron'u: görülmüş anlar 30 gün, görülmemişler 90 gün sonra silinir. */
export async function cleanupMoments(
  db: Pick<Prisma.TransactionClient, 'customerMoment'>,
  now: Date = new Date()
): Promise<{ seen: number; unseen: number }> {
  const day = 24 * 60 * 60 * 1000;
  const seenCutoff = new Date(now.getTime() - SEEN_MOMENT_RETENTION_DAYS * day);
  const unseenCutoff = new Date(now.getTime() - UNSEEN_MOMENT_RETENTION_DAYS * day);
  const seen = await db.customerMoment.deleteMany({
    where: { seenAt: { not: null, lt: seenCutoff } },
  });
  const unseen = await db.customerMoment.deleteMany({
    where: { seenAt: null, createdAt: { lt: unseenCutoff } },
  });
  return { seen: seen.count, unseen: unseen.count };
}
