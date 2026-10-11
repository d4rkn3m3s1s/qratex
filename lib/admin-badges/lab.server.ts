/**
 * Rozetler merkezi — TEST LABORATUVARI (eski /admin/character-test).
 *
 *  - Salt-okunur araçlar her ortamda açık: hedef durum, karakter kataloğu, canlı sınıflandırma
 *    (ÜRETİMLE AYNI seçici: `selectCharacterForSamples`), açılış önizlemesi (müşteri ucuyla
 *    aynı yük biçimi; DB'ye yazmaz).
 *  - Veri değiştiren sandbox araçları üretimde KAPALI ve yalnız test hesabı allowlist'inde
 *    (`lib/character-test-guard.ts`, P0-23 — rapor B2/B3). Her biri denetim kaydı yazar.
 *  - "Barı doldur" hedefi üretimin kullandığı hesapla bulunur: etkin eşik × (alınan + 1),
 *    min. uzunluk şartını karşılayan sentetik metin; gerçek yorumlara dokunmaz (B3/B4).
 *  - Reset ödülü geri ALMAZ; defterde anahtarı kilitler → reveal tekrarı puan çoğaltamaz (B1).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import {
  CHARACTER_PROFILES,
  classifyFeedbackCategory,
  getCategoryProgressDetailed,
  inactiveCharacterIds,
  selectCharacterForSamples,
} from '@/lib/character-badges';
import { CATEGORY_BY_CHARACTER, CATEGORY_BY_KEY, CHARACTER_CATEGORIES, unassignedCharacterIds } from '@/lib/character-categories';
import { badgeRewardPoints } from '@/lib/badge-reward-points';
import { getCharacterRevealText, getCharacterTier } from '@/lib/character-reveal-texts';
import { BADGE_CATALOG } from '@/lib/badge-catalog';
import { mintPoints } from '@/lib/economy';
import { emailLookupFilter } from '@/lib/auth/normalize-email';
import { characterTestMutationsEnabled, gateCharacterTestMutation, isAllowedCharacterTestTarget } from '@/lib/character-test-guard';
import type {
  LabCatalog,
  LabClassifyResult,
  LabRevealCharacter,
  LabSandboxInput,
  LabSandboxResult,
  LabStatus,
  LabTarget,
} from './contract';

type RequestLike = { headers: { get(name: string): string | null } } | null | undefined;

const CHAR_IDS = CHARACTER_PROFILES.map((c) => c.badgeId);
const NAME_BY_ID = new Map(CHARACTER_PROFILES.map((c) => [c.badgeId, c.name]));
/** Sentetik test verisi işareti (temizlenebilir olsun). */
export const TEST_NOTE = '[KARAKTER-TEST]';
const MAX_SYNTHETIC_PER_FILL = 100;

type TargetRow = { id: string; email: string | null; role: string; isDemo: boolean; name: string | null };

export async function findLabTarget(param: string): Promise<TargetRow> {
  const where: Prisma.UserWhereInput = param.includes('@') ? { email: emailLookupFilter(param) } : { id: param };
  const user = await prisma.user.findFirst({ where, select: { id: true, email: true, role: true, isDemo: true, name: true } });
  if (!user) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı. E-postayı ya da kimliği kontrol edin.');
  return user;
}

function toTarget(u: TargetRow): LabTarget {
  return { id: u.id, name: u.name, email: u.email, role: u.role, isDemo: u.isDemo, allowed: isAllowedCharacterTestTarget(u) };
}

/** Hedef seçici: yalnız test hesapları (demo müşteri + allowlist). Gerçek müşteri listelenmez. */
export async function listLabTargets(q?: string): Promise<LabTarget[]> {
  const allow = String(process.env.CHARACTER_TEST_ALLOWLIST ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const or: Prisma.UserWhereInput[] = [{ isDemo: true }];
  for (const e of allow.slice(0, 50)) or.push({ email: emailLookupFilter(e) });
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    OR: or,
    ...(q ? { AND: [{ OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }] } : {}),
  };
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, email: true, role: true, isDemo: true, name: true },
  });
  return rows.map(toTarget).filter((t) => t.allowed);
}

export async function getLabStatus(param: string): Promise<LabStatus> {
  const user = await findLabTarget(param);
  const [categories, owned, consumptions, cards] = await Promise.all([
    getCategoryProgressDetailed(user.id),
    prisma.userBadge.findMany({ where: { userId: user.id, badgeId: { in: CHAR_IDS } }, orderBy: { earnedAt: 'desc' }, select: { badgeId: true, earnedAt: true } }),
    prisma.consumption.count({ where: { customerId: user.id, note: TEST_NOTE } }),
    prisma.physicalCard.count({ where: { customerId: user.id, blockReason: TEST_NOTE } }),
  ]);
  return {
    target: toTarget(user),
    mutationsEnabled: characterTestMutationsEnabled(),
    categories,
    ownedCharacters: owned.map((o) => ({
      badgeId: o.badgeId,
      name: NAME_BY_ID.get(o.badgeId) ?? o.badgeId,
      categoryKey: CATEGORY_BY_CHARACTER[o.badgeId]?.key ?? null,
      earnedAt: o.earnedAt.toISOString(),
    })),
    synthetic: { consumptions, cards },
  };
}

export async function getLabCatalog(): Promise<LabCatalog> {
  const [records, inactive, holders, totalCustomers] = await Promise.all([
    prisma.badge.findMany({ where: { id: { in: CHAR_IDS } }, select: { id: true } }),
    inactiveCharacterIds(),
    prisma.userBadge.groupBy({ by: ['badgeId'], where: { badgeId: { in: CHAR_IDS } }, _count: { _all: true } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
  ]);
  const hasRecord = new Set(records.map((r) => r.id));
  const holderMap = new Map(holders.map((h) => [h.badgeId, h._count._all]));
  const characters = CHARACTER_CATEGORIES.flatMap((cat) =>
    cat.characterIds
      .filter((id) => NAME_BY_ID.has(id))
      .map((id) => ({
        badgeId: id,
        name: NAME_BY_ID.get(id) ?? id,
        categoryKey: cat.key,
        categoryName: cat.name,
        tier: getCharacterTier(id),
        rewardPoints: badgeRewardPoints(id),
        hasRevealText: Boolean(getCharacterRevealText(id)),
        hasRecord: hasRecord.has(id),
        isActive: !inactive.has(id),
        holders: holderMap.get(id) ?? 0,
      }))
  );
  return {
    categories: CHARACTER_CATEGORIES.map((c) => ({ key: c.key, name: c.name, emoji: c.emoji, accent: c.accent })),
    characters,
    unassigned: unassignedCharacterIds().map((id) => NAME_BY_ID.get(id) ?? id),
    totalCustomers,
  };
}

export async function classifyForLab(text: string): Promise<LabClassifyResult> {
  const started = Date.now();
  const clean = text.trim();
  if (clean.length < 8) {
    // Üretim sınıflandırıcısı 8 karakterden kısa yorumu hiç sınıflandırmaz.
    return { category: null, reason: 'too_short', character: null, latencyMs: Date.now() - started };
  }
  const key = await classifyFeedbackCategory(clean);
  const cat = key ? CATEGORY_BY_KEY[key] : null;
  if (!cat) return { category: null, reason: 'unclassified', character: null, latencyMs: Date.now() - started };
  const inactive = await inactiveCharacterIds();
  const sel = await selectCharacterForSamples({ categoryKey: cat.key, samples: [{ text: clean, rating: 5 }], excludeBadgeIds: inactive });
  return {
    category: { key: cat.key, name: cat.name, emoji: cat.emoji },
    reason: 'ok',
    character: sel ? { badgeId: sel.badgeId, name: sel.name, why: sel.why, source: sel.source, ...(sel.aiError ? { aiError: sel.aiError } : {}) } : null,
    latencyMs: Date.now() - started,
  };
}

/** Açılış önizlemesi — `POST /api/customer/character` ile aynı yük biçimi (katalog açıklaması, gerçek oran). */
export async function buildRevealPreview(input: { badgeId: string; why?: string; ratePct?: number | null }): Promise<LabRevealCharacter> {
  const cat = CATEGORY_BY_CHARACTER[input.badgeId];
  const name = NAME_BY_ID.get(input.badgeId);
  if (!cat || !name) throw new ApiError('NOT_FOUND', 'Karakter bulunamadı.');
  const catalog = BADGE_CATALOG.find((b) => b.id === input.badgeId);
  const [record, holders, totalCustomers] = await Promise.all([
    prisma.badge.findUnique({ where: { id: input.badgeId }, select: { icon: true, description: true } }),
    prisma.userBadge.count({ where: { badgeId: input.badgeId } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
  ]);
  const realRate = totalCustomers > 0 ? Math.round((holders / totalCustomers) * 1000) / 10 : null;
  return {
    badgeId: input.badgeId,
    name,
    why: input.why?.trim() || `Yorumların ${cat.name} üslubunu taşıyor; tıpkı ${name} gibi.`,
    icon: record?.icon ?? catalog?.icon,
    description: catalog?.description ?? record?.description ?? undefined,
    rarity: catalog?.rarity ?? 'common',
    holders,
    ratePct: input.ratePct === undefined ? realRate : input.ratePct,
    category: { key: cat.key, name: cat.name, emoji: cat.emoji, accent: cat.accent, description: cat.description },
  };
}

// ───────────────────────────── Sandbox ─────────────────────────────

const SANDBOX_LABEL: Record<LabSandboxInput['action'], string> = {
  fill: 'FILL',
  reset: 'RESET',
  clearCategories: 'CLEAR_CATEGORIES',
  cleanupTest: 'CLEANUP',
};

/** Sentetik yorum metni: kategori adını taşır ve min. uzunluk şartını garanti eder. */
export function syntheticReviewText(categoryName: string, minLen: number): string {
  const base = `${TEST_NOTE} ${categoryName} üslubunda örnek deneyim yorumu — servis, lezzet ve ortam üzerine gözlemler; karakter barı testi için üretildi.`;
  if (base.length >= minLen) return base;
  const filler = ' Ayrıntılı gözlem: sunum, bekleme süresi, fiyat-değer dengesi ve çalışanların ilgisi not edildi.';
  let out = base;
  while (out.length < minLen) out += filler;
  return out;
}

/** Barı tam dolduracak eksik sayılan yorum: etkin eşik × (alınan + 1) − sayılan. */
export function fillNeed(p: { counted: number; taken: number; threshold: number }): number {
  return Math.max(0, p.threshold * (p.taken + 1) - p.counted);
}

export async function runLabSandbox(input: LabSandboxInput, actor: AuditActor, request?: RequestLike): Promise<LabSandboxResult> {
  const target = await findLabTarget(input.user);
  const gate = gateCharacterTestMutation(target);
  if (!gate.ok) throw new ApiError(gate.code, gate.error, { status: gate.status });
  const userId = target.id;
  const audit = (data: Record<string, unknown>) =>
    prisma.auditLog.create({
      data: auditEntry(
        actor,
        { action: `CHARACTER_TEST_${SANDBOX_LABEL[input.action]}`, entity: 'User', entityId: userId, newData: { ...data, targetEmail: target.email } },
        request
      ),
    });

  let counts: Record<string, number> = {};
  let message = '';

  if (input.action === 'fill') {
    const cat = CATEGORY_BY_KEY[input.category];
    if (!cat) throw new ApiError('VALIDATION', 'Geçersiz kategori.', { details: [{ path: 'category', message: 'Geçersiz kategori.' }] });
    const before = (await getCategoryProgressDetailed(userId)).find((c) => c.key === cat.key);
    if (!before) throw new ApiError('VALIDATION', 'Geçersiz kategori.');
    if (before.available === 0) {
      throw new ApiError('CATEGORY_EXHAUSTED', 'Bu kategoride alınabilecek karakter kalmadı (hepsi sahip olunmuş ya da pasif).', { status: 409 });
    }
    const need = fillNeed(before);
    if (need > MAX_SYNTHETIC_PER_FILL) {
      throw new ApiError('FILL_TOO_LARGE', `Bar için ${need} yorum gerekiyor; tek seferde en fazla ${MAX_SYNTHETIC_PER_FILL} sentetik yorum üretilir.`, { status: 409 });
    }
    if (need > 0) {
      const text = syntheticReviewText(cat.name, before.minReviewLength);
      // Tek transaction: ya hepsi ya hiçbiri (yarım dolum + "başarılı" yok — B9).
      await prisma.$transaction(async (tx) => {
        let card = await tx.physicalCard.findFirst({ where: { customerId: userId, blockReason: TEST_NOTE }, select: { id: true } });
        if (!card) {
          card = await tx.physicalCard.create({
            data: { token: `chartest-${randomUUID()}`, customerId: userId, status: 'BLOCKED', blockReason: TEST_NOTE },
            select: { id: true },
          });
        }
        for (let i = 0; i < need; i++) {
          const c = await tx.consumption.create({ data: { cardId: card.id, customerId: userId, dealerId: actor.id ?? userId, note: TEST_NOTE }, select: { id: true } });
          await tx.consumptionReview.create({ data: { consumptionId: c.id, customerId: userId, rating: 5, text, characterCategory: cat.key } });
        }
      });
    }
    counts = { created: need, threshold: before.threshold, targetForNext: before.targetForNext };
    message = need > 0 ? `${need} sentetik yorum eklendi; ${cat.name} barı hazır.` : `${cat.name} barı zaten hazır; yeni yorum eklenmedi.`;
    await audit({ category: cat.key, ...counts });
  } else if (input.action === 'reset') {
    const result = await prisma.$transaction(async (tx) => {
      const owned = await tx.userBadge.findMany({ where: { userId, badgeId: { in: CHAR_IDS } }, select: { badgeId: true } });
      const del = await tx.userBadge.deleteMany({ where: { userId, badgeId: { in: CHAR_IDS } } });
      let locked = 0;
      for (const { badgeId } of owned) {
        if (badgeRewardPoints(badgeId) <= 0) continue;
        const r = await mintPoints(tx, {
          userId,
          points: 0,
          source: 'badge',
          sourceId: badgeId,
          idempotencyKey: `badge:${userId}:${badgeId}`,
          actorId: actor.id,
          reason: 'Rozet test laboratuvarı: ödülü önceden ödenmiş rozet sıfırlandı (tekrar ödül kilidi)',
          meta: { badgeId, via: 'character_test_reset', rewardLock: true },
        });
        if (!r.duplicate) locked++;
      }
      return { deleted: del.count, rewardLocked: locked };
    });
    counts = result;
    message = `${result.deleted} karakter rozeti kaldırıldı; ödül puanı tekrar basılamaz.`;
    await audit(counts);
  } else if (input.action === 'clearCategories') {
    const upd = await prisma.consumptionReview.updateMany({ where: { customerId: userId }, data: { characterCategory: null } });
    counts = { cleared: upd.count };
    message = `${upd.count} yorumun kategori etiketi temizlendi.`;
    await audit(counts);
  } else {
    const result = await prisma.$transaction(async (tx) => {
      const del = await tx.consumption.deleteMany({ where: { customerId: userId, note: TEST_NOTE } });
      const delCard = await tx.physicalCard.deleteMany({ where: { customerId: userId, blockReason: TEST_NOTE } });
      return { deletedConsumptions: del.count, deletedCards: delCard.count };
    });
    counts = result;
    message = `${result.deletedConsumptions} sentetik tüketim ve ${result.deletedCards} test kartı silindi.`;
    await audit(counts);
  }

  return { action: input.action, message, counts, status: await getLabStatus(userId) };
}
