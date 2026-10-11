/**
 * Rozetler merkezi — EŞİKLER sekmesi (karakter kategori eşiği + min. yorum uzunluğu).
 *
 *  - Okuma cache'siz ve fail-closed (`readCategoryThresholdsStrict`): okunamazsa hata görünür,
 *    "override yok" sanılıp üzerine yazılmaz (P0-28).
 *  - Yazma: zod aralık doğrulaması (THRESHOLD_LIMITS, sessiz atma yok → 400 + alan hatası),
 *    varsayılana eşit değer override sayılmaz, `baseVersion` ile çakışma (409), yazma + denetim
 *    tek transaction, ardından runtime cache temizliği.
 *  - Etki önizlemesi: tek toplu SQL (kullanıcı × kategori sayımı, mevcut ve taslak uzunluk
 *    şartıyla) + sahip olunan karakterler → kaç kullanıcı hazır olur/geriler, kaç ek rozet ve
 *    tahmini puan. Yazma yok.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import {
  CATEGORY_THRESHOLDS_SETTING_CATEGORY,
  CATEGORY_THRESHOLDS_SETTING_KEY,
  clearCategoryThresholdsCache,
  normalizeCategoryThresholds,
  readCategoryThresholdsStrict,
} from '@/lib/character-thresholds';
import {
  CATEGORY_BY_KEY,
  CHARACTER_CATEGORIES,
  categoryMinReviewLength,
  categoryThreshold,
  type CharacterCategory,
} from '@/lib/character-categories';
import { CHARACTER_PROFILES, inactiveCharacterIds } from '@/lib/character-badges';
import { badgeRewardPoints } from '@/lib/badge-reward-points';
import { isVersionConflictError, versionFromDate, writeVersionedSetting } from '@/lib/settings-version';
import type {
  ThresholdCategoryRow,
  ThresholdHistoryPage,
  ThresholdImpact,
  ThresholdImpactRow,
  ThresholdOverrides,
  ThresholdsState,
} from './contract';

type RequestLike = { headers: { get(name: string): string | null } } | null | undefined;
export const THRESHOLD_AUDIT_ACTION = 'UPDATE_CATEGORY_THRESHOLDS';

function rowFor(cat: CharacterCategory, overrides: ThresholdOverrides): ThresholdCategoryRow {
  const known = new Set(CHARACTER_PROFILES.map((p) => p.badgeId));
  return {
    key: cat.key,
    name: cat.name,
    emoji: cat.emoji,
    accent: cat.accent,
    description: cat.description,
    characterCount: cat.characterIds.filter((id) => known.has(id)).length,
    defaultThreshold: categoryThreshold(cat),
    defaultMinReviewLength: categoryMinReviewLength(cat),
    effectiveThreshold: categoryThreshold(cat, overrides),
    effectiveMinReviewLength: categoryMinReviewLength(cat, overrides),
  };
}

function actorLabel(row: { actorSnapshot: Prisma.JsonValue | null; user: { name: string | null; email: string | null } | null }): string | null {
  if (row.user) return row.user.name || row.user.email;
  const s = row.actorSnapshot && typeof row.actorSnapshot === 'object' && !Array.isArray(row.actorSnapshot) ? (row.actorSnapshot as Record<string, unknown>) : null;
  if (!s) return null;
  return (typeof s.name === 'string' && s.name) || (typeof s.email === 'string' && s.email) || null;
}

export async function getThresholdsState(): Promise<ThresholdsState> {
  const [{ overrides, updatedAt }, last] = await Promise.all([
    readCategoryThresholdsStrict(),
    prisma.auditLog.findFirst({
      where: { action: THRESHOLD_AUDIT_ACTION },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  return {
    categories: CHARACTER_CATEGORIES.map((c) => rowFor(c, overrides)),
    overrides,
    version: versionFromDate(updatedAt),
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    lastChange: last ? { at: last.createdAt.toISOString(), actor: actorLabel(last) } : null,
  };
}

/**
 * Taslak override tablosunu temizler: bilinmeyen kategori → 400 (sessiz atma yok), varsayılana
 * eşit değer → override değildir (kod varsayılanı ileride değişirse donmuş kalmasın).
 */
export function cleanOverrides(draft: ThresholdOverrides): ThresholdOverrides {
  const unknown = Object.keys(draft).filter((k) => !CATEGORY_BY_KEY[k]);
  if (unknown.length) {
    throw new ApiError('VALIDATION', 'Bilinmeyen kategori.', {
      details: unknown.map((k) => ({ path: `overrides.${k}`, message: `“${k}” adlı bir kategori yok.` })),
    });
  }
  const out: ThresholdOverrides = {};
  for (const [key, entry] of Object.entries(draft)) {
    const cat = CATEGORY_BY_KEY[key];
    const e: { threshold?: number; minReviewLength?: number } = {};
    if (typeof entry.threshold === 'number' && entry.threshold !== categoryThreshold(cat)) e.threshold = entry.threshold;
    if (typeof entry.minReviewLength === 'number' && entry.minReviewLength !== categoryMinReviewLength(cat)) e.minReviewLength = entry.minReviewLength;
    if (Object.keys(e).length) out[key] = e;
  }
  return out;
}

export async function saveThresholds(
  input: { overrides: ThresholdOverrides; baseVersion: string; revertOf?: string },
  actor: AuditActor,
  request?: RequestLike
): Promise<ThresholdsState> {
  const cleaned = cleanOverrides(input.overrides);
  try {
    await prisma.$transaction(async (tx) => {
      const written = await writeVersionedSetting(tx, {
        key: CATEGORY_THRESHOLDS_SETTING_KEY,
        value: cleaned as Prisma.InputJsonValue,
        category: CATEGORY_THRESHOLDS_SETTING_CATEGORY,
        baseVersion: input.baseVersion,
      });
      await tx.auditLog.create({
        data: auditEntry(
          actor,
          {
            action: THRESHOLD_AUDIT_ACTION,
            entity: 'Settings',
            entityId: written.id,
            oldData: normalizeCategoryThresholds(written.previous),
            newData: input.revertOf ? { ...cleaned, __revertOf: input.revertOf } : cleaned,
          },
          request
        ),
      });
    });
  } catch (e) {
    if (isVersionConflictError(e)) {
      throw new ApiError('VERSION_CONFLICT', 'Eşikler siz düzenlerken başka bir yönetici tarafından değiştirildi. Güncel hali yükleyip tekrar deneyin.', {
        status: 409,
      });
    }
    throw e;
  }
  clearCategoryThresholdsCache();
  return getThresholdsState();
}

// ───────────────────────────── Etki önizlemesi ─────────────────────────────

type CountRow = { uid: string; cat: string; cur: number; nxt: number };

function minLenCase(lens: Array<[string, number]>): Prisma.Sql {
  if (lens.length === 0) return Prisma.sql`0`;
  return Prisma.sql`CASE "characterCategory" ${Prisma.join(
    lens.map(([k, v]) => Prisma.sql`WHEN ${k} THEN ${v}::int`),
    ' '
  )} ELSE 0 END`;
}

/** Bir (kullanıcı, kategori) için bugünkü sayımla açılabilecek rozet sayısı. */
export function revealableCount(counted: number, threshold: number, taken: number, available: number): number {
  if (available <= 0 || threshold <= 0) return 0;
  return Math.min(available, Math.max(0, Math.floor((counted - taken * threshold) / threshold)));
}

export function bucketOf(counted: number, threshold: number, taken: number, ready: boolean): number {
  if (ready) return 4;
  const frac = threshold > 0 ? Math.max(0, counted - taken * threshold) / threshold : 0;
  return Math.min(3, Math.floor(frac * 4));
}

export async function previewThresholdImpact(draftRaw: ThresholdOverrides): Promise<ThresholdImpact> {
  const draft = cleanOverrides(draftRaw);
  const { overrides: current } = await readCategoryThresholdsStrict();
  const curLens = CHARACTER_CATEGORIES.map((c) => [c.key, categoryMinReviewLength(c, current)] as [string, number]);
  const nxtLens = CHARACTER_CATEGORIES.map((c) => [c.key, categoryMinReviewLength(c, draft)] as [string, number]);

  const charIds = CHARACTER_PROFILES.map((p) => p.badgeId);
  const [counts, owned, inactive] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT "customerId" AS uid, "characterCategory" AS cat,
        (COUNT(*) FILTER (WHERE char_length(btrim("text")) >= ${minLenCase(curLens)}))::int AS cur,
        (COUNT(*) FILTER (WHERE char_length(btrim("text")) >= ${minLenCase(nxtLens)}))::int AS nxt
      FROM "ConsumptionReview"
      WHERE "characterCategory" IS NOT NULL AND "deletedAt" IS NULL AND "text" IS NOT NULL
      GROUP BY 1, 2
    `),
    prisma.userBadge.findMany({ where: { badgeId: { in: charIds } }, select: { userId: true, badgeId: true } }),
    inactiveCharacterIds(),
  ]);

  const ownedByUser = new Map<string, Set<string>>();
  for (const o of owned) {
    let s = ownedByUser.get(o.userId);
    if (!s) ownedByUser.set(o.userId, (s = new Set()));
    s.add(o.badgeId);
  }

  const rows = new Map<string, ThresholdImpactRow>();
  const avgReward = new Map<string, number>();
  for (const c of CHARACTER_CATEGORIES) {
    rows.set(c.key, { key: c.key, readyNow: 0, readyAfter: 0, newlyReady: 0, regressed: 0, extraReveals: 0, extraPointsEstimate: 0, histogram: [0, 0, 0, 0, 0], users: 0 });
    const pts = c.characterIds.map((id) => badgeRewardPoints(id)).filter((p) => p > 0);
    avgReward.set(c.key, pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0);
  }

  const users = new Set<string>();
  for (const r of counts) {
    const cat = CATEGORY_BY_KEY[r.cat];
    const row = rows.get(r.cat);
    if (!cat || !row) continue;
    users.add(r.uid);
    const mine = ownedByUser.get(r.uid);
    const taken = cat.characterIds.filter((id) => mine?.has(id)).length;
    const available = cat.characterIds.filter((id) => !mine?.has(id) && !inactive.has(id)).length;
    const thCur = categoryThreshold(cat, current);
    const thNxt = categoryThreshold(cat, draft);
    const nowN = revealableCount(Number(r.cur), thCur, taken, available);
    const nxtN = revealableCount(Number(r.nxt), thNxt, taken, available);
    row.users++;
    if (nowN > 0) row.readyNow++;
    if (nxtN > 0) row.readyAfter++;
    if (nowN === 0 && nxtN > 0) row.newlyReady++;
    if (nowN > 0 && nxtN === 0) row.regressed++;
    row.extraReveals += nxtN - nowN;
    if (available > 0) row.histogram[bucketOf(Number(r.nxt), thNxt, taken, nxtN > 0)]++;
  }
  for (const row of rows.values()) row.extraPointsEstimate = row.extraReveals * (avgReward.get(row.key) ?? 0);

  return { rows: [...rows.values()], computedAt: new Date().toISOString(), usersScanned: users.size };
}

// ───────────────────────────── Geçmiş ─────────────────────────────

export async function getThresholdHistory(page: number, size = 10): Promise<ThresholdHistoryPage> {
  const where = { action: THRESHOLD_AUDIT_ACTION };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      select: { id: true, createdAt: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  return {
    total,
    page,
    size,
    items: rows.map((r) => {
      const nd = r.newData && typeof r.newData === 'object' && !Array.isArray(r.newData) ? (r.newData as Record<string, unknown>) : {};
      return {
        id: r.id,
        at: r.createdAt.toISOString(),
        actor: actorLabel(r),
        before: normalizeCategoryThresholds(r.oldData),
        after: normalizeCategoryThresholds(r.newData),
        revertOf: typeof nd.__revertOf === 'string' ? nd.__revertOf : null,
      };
    }),
  };
}
