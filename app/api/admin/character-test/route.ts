import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { CHARACTER_PROFILES, CATEGORY_BADGE_THRESHOLD, classifyFeedbackCategory } from '@/lib/character-badges';
import { CHARACTER_CATEGORIES, CATEGORY_BY_KEY, charactersInCategory } from '@/lib/character-categories';
import { runChatCompletion } from '@/lib/ai-engine';
import { badgeRewardPoints } from '@/lib/badge-reward-points';
import { mintPoints } from '@/lib/economy';
import { emailLookupFilter } from '@/lib/auth/normalize-email';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  characterTestMutationsEnabled,
  gateCharacterTestMutation,
  isAllowedCharacterTestTarget,
  isMutatingCharacterTestAction,
} from '@/lib/character-test-guard';

export const dynamic = 'force-dynamic';

/**
 * ADMIN-ONLY karakter rozeti TEST aracı.
 *
 * GET  ?userId=me|<id>|<e-posta>  → mevcut durum (kategori sayıları + karakter rozetleri) +
 *                                   `mutationsEnabled` / `targetAllowed` bayrakları.
 * POST { userId, action, ... }    → aksiyon uygula.
 *   Salt-okunur (her ortamda): 'revealPreview', 'classify'.
 *   Veri değiştiren (P0-23 — üretimde kapalı + yalnız test hesabı allowlist'i, bkz.
 *   lib/character-test-guard.ts; her biri AuditLog'a yazılır):
 *   action:'reset'           → karakter rozetlerini sil. Ödül puanı geri ALINMAZ; bunun yerine
 *                              her rozetin ödül anahtarı (`badge:<userId>:<badgeId>`) defterde
 *                              kilitlenir → reveal tekrarı puan çoğaltamaz, bakiye de erimez.
 *   action:'fill', category, n → YALNIZ sentetik yorum üretir (gerçek yorumlara dokunmaz).
 *   action:'clearCategories' → test hesabının yorum kategorilerini temizle.
 *   action:'cleanupTest'     → sentetik test verisini sil.
 */

const CHAR_IDS = CHARACTER_PROFILES.map((c) => c.badgeId);

type TargetUser = { id: string; email: string | null; role: string; isDemo: boolean; name: string | null };

async function findTarget(param: string): Promise<TargetUser | null> {
  const where: Prisma.UserWhereInput = param.includes('@') ? { email: emailLookupFilter(param) } : { id: param };
  return prisma.user.findFirst({
    where,
    select: { id: true, email: true, role: true, isDemo: true, name: true },
  });
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

/** Karakter test aracının oluşturduğu sentetik veriyi işaretler (temizlenebilir olsun). */
const TEST_CONSUMPTION_NOTE = '[KARAKTER-TEST]';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const param = req.nextUrl.searchParams.get('userId');
  let userId = auth.session.user.id;
  let targetAllowed = false;
  if (param && param !== 'me') {
    const target = await findTarget(param);
    if (!target) return json({ success: false, error: 'Kullanıcı bulunamadı' }, 404);
    userId = target.id;
    targetAllowed = isAllowedCharacterTestTarget(target);
  }

  const grouped = await prisma.consumptionReview.groupBy({
    by: ['characterCategory'],
    where: { customerId: userId, characterCategory: { not: null } },
    _count: { _all: true },
  });
  const owned = await prisma.userBadge.findMany({
    where: { userId, badgeId: { in: CHAR_IDS } },
    select: { badgeId: true, earnedAt: true },
  });

  return NextResponse.json(
    {
      success: true,
      userId,
      threshold: CATEGORY_BADGE_THRESHOLD,
      categoryCounts: grouped.map((g) => ({ category: g.characterCategory, count: g._count._all })),
      characterBadges: owned,
      categories: CHARACTER_CATEGORIES.map((c) => ({ key: c.key, name: c.name })),
      mutationsEnabled: characterTestMutationsEnabled(),
      targetAllowed,
    },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');

  // ── Veri değiştiren aksiyonlar: ortam kapısı + açık hedef + allowlist (P0-23) ──
  let userId = auth.session.user.id;
  let target: TargetUser | null = null;
  if (isMutatingCharacterTestAction(action)) {
    const param = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!param || param === 'me') {
      return json({ success: false, error: 'Test hesabının e-postasını ya da kimliğini girin.' }, 400);
    }
    target = await findTarget(param);
    if (!target) return json({ success: false, error: 'Kullanıcı bulunamadı' }, 404);
    const gate = gateCharacterTestMutation(target);
    if (!gate.ok) return json({ success: false, error: gate.error, code: gate.code }, gate.status);
    userId = target.id;
  }
  const auditMeta = getAuditRequestMeta(req);
  const audit = (op: string, data: Record<string, unknown>) =>
    prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: `CHARACTER_TEST_${op.toUpperCase()}`,
        entity: 'User',
        entityId: userId,
        newData: { ...data, targetEmail: target?.email ?? null } as Prisma.InputJsonObject,
        ...auditMeta,
      },
    });

  if (action === 'revealPreview') {
    // DB'ye DOKUNMADAN: bir kategoriden karakter seçip reveal için hazır obje döndür.
    // Admin panelde <CharacterReveal fetchOnOpen={false} character={...}/> ile açılış
    // animasyonunu (rozet nasıl açılıyor) canlı görebilsin — sentetik veri gerekmez.
    const categoryKey = String(body.category ?? '');
    const cat = CATEGORY_BY_KEY[categoryKey];
    if (!cat) {
      return NextResponse.json({ success: false, error: 'Geçersiz kategori' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const list = charactersInCategory(cat.key);
    if (list.length === 0) {
      return NextResponse.json({ success: false, error: 'Kategoride karakter yok' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    // İstenen badgeId varsa onu, yoksa ilk karakteri seç (admin belirli birini görmek isteyebilir).
    const wanted = String(body.badgeId ?? '');
    const picked = list.find((c) => c.badgeId === wanted) ?? list[0];
    // Rozet ikonunu (varsa) Badge tablosundan çek — reveal daha gerçekçi görünür.
    const badge = await prisma.badge.findUnique({ where: { id: picked.badgeId }, select: { icon: true, rarity: true } }).catch(() => null);
    const character = {
      badgeId: picked.badgeId,
      name: picked.name,
      why: `Yorumların ${cat.name} üslubunu taşıyor; tıpkı ${picked.name} gibi. (admin önizleme)`,
      icon: badge?.icon ?? undefined,
      description: picked.trait,
      rarity: badge?.rarity ?? 'epic',
      category: { key: cat.key, name: cat.name, emoji: cat.emoji, accent: cat.accent, description: cat.description },
    };
    return NextResponse.json(
      { success: true, action, character, characters: list.map((c) => ({ badgeId: c.badgeId, name: c.name })) },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  if (action === 'classify') {
    // Canlı test: serbest metni AI ile SINIFLA (kategori) + o kategoride karakter SEÇ.
    // DB'ye hiçbir şey yazmaz — sadece formülün çıktısını gösterir.
    const text = String(body.text ?? '').trim();
    if (text.length < 3) {
      return NextResponse.json({ success: false, error: 'Yorum metni çok kısa' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const categoryKey = await classifyFeedbackCategory(text);
    const cat = categoryKey ? CATEGORY_BY_KEY[categoryKey] : null;
    let character: { badgeId: string; name: string; why: string } | null = null;
    if (cat) {
      const options = charactersInCategory(cat.key).map((c) => `${c.badgeId} = ${c.name}: ${c.trait}`).join('\n');
      try {
        const res = await runChatCompletion({
          system:
            `Kullanıcı "${cat.name}" üslubunda yorum yazdı. Aşağıdaki karakterlerden yazım tarzına EN UYGUN olanı seç. ` +
            'why: kullanıcıyı bu karaktere benzeten OLUMLU, gurur verici tek cümle (en fazla 25 kelime). ' +
            'JSON: {"badgeId":"...","why":"..."}.',
          user: `KARAKTERLER:\n${options}\n\nYORUM:\n"${text}"\n\nJSON:`,
          temperature: 0.3,
          maxTokens: 160,
          jsonMode: true,
        });
        const content = res && typeof res !== 'string' ? res.content : (res as string | null);
        if (content) {
          const parsed = JSON.parse(content) as { badgeId?: string; why?: string };
          const list = charactersInCategory(cat.key);
          const m = list.find((c) => c.badgeId === parsed.badgeId) ?? list[0];
          character = { badgeId: m.badgeId, name: m.name, why: String(parsed.why ?? '').trim() };
        }
      } catch { /* AI yoksa karaktersiz sadece kategori döner */ }
    }
    return NextResponse.json(
      { success: true, action, category: cat ? { key: cat.key, name: cat.name, emoji: cat.emoji } : null, character },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  if (action === 'reset') {
    // Kök neden (P0-23): rozet silinip reveal yeniden açılınca ödül puanı yeniden basılıyordu.
    // awardBadge ödülü `badge:<userId>:<badgeId>` tek-kez anahtarıyla basar; ama bu anahtar
    // defterden ÖNCE kazanılmış (eski) rozetlerde yok. Reset, silinen her rozet için anahtarı
    // 0 puanlık bir defter satırıyla kilitler (zaten varsa dokunmaz): yeniden kazanımda
    // `mintPoints` duplicate döner, ödül ikinci kez basılmaz. Puan geri alınmaz → tekrarlanan
    // reset döngüsü test hesabının bakiyesini de eritmez (önceki ters kayıt her turda düşüyordu).
    const result = await prisma.$transaction(async (tx) => {
      const owned = await tx.userBadge.findMany({
        where: { userId, badgeId: { in: CHAR_IDS } },
        select: { badgeId: true },
      });
      const del = await tx.userBadge.deleteMany({ where: { userId, badgeId: { in: CHAR_IDS } } });
      const locked: string[] = [];
      for (const { badgeId } of owned) {
        if (badgeRewardPoints(badgeId) <= 0) continue;
        const r = await mintPoints(tx, {
          userId,
          points: 0,
          source: 'badge',
          sourceId: badgeId,
          idempotencyKey: `badge:${userId}:${badgeId}`,
          actorId: auth.session.user.id,
          reason: 'Karakter test aracı: ödülü önceden ödenmiş rozet sıfırlandı (tekrar ödül kilidi)',
          meta: { badgeId, via: 'character_test_reset', rewardLock: true },
        });
        if (!r.duplicate) locked.push(badgeId);
      }
      return { deleted: del.count, badgeIds: owned.map((b) => b.badgeId), rewardLocked: locked };
    });
    await audit('reset', result);
    return json({ success: true, action, deleted: result.deleted, rewardLocked: result.rewardLocked.length });
  }

  if (action === 'clearCategories') {
    const upd = await prisma.consumptionReview.updateMany({ where: { customerId: userId }, data: { characterCategory: null } });
    await audit('clear_categories', { cleared: upd.count });
    return json({ success: true, action, cleared: upd.count });
  }

  if (action === 'fill') {
    const category = String(body.category ?? '');
    const valid = CHARACTER_CATEGORIES.some((c) => c.key === category);
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Geçersiz kategori' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    // Hedef doluluk (varsayılan: eşik = bar tam dolar).
    const n = Math.max(1, Math.min(50, Number(body.n) || CATEGORY_BADGE_THRESHOLD));

    // Gerçek yorumlara DOKUNMA (B4): bu kategoride zaten kaç yorum var, eksik kadar sentetik üret.
    const existing = await prisma.consumptionReview.count({ where: { customerId: userId, characterCategory: category } });
    const need = Math.max(0, n - existing);
    let created = 0;
    let failed = 0;
    if (need > 0) {
      const dealerId = auth.session.user.id; // admin (geçerli User FK); işaretli test verisi
      // Tek sentetik test kartı (varsa yeniden kullan). Token tahmin edilemez.
      let card = await prisma.physicalCard.findFirst({ where: { customerId: userId, blockReason: TEST_CONSUMPTION_NOTE }, select: { id: true } });
      if (!card) {
        card = await prisma.physicalCard.create({
          data: { token: `chartest-${randomUUID()}`, customerId: userId, status: 'ACTIVATED', blockReason: TEST_CONSUMPTION_NOTE },
          select: { id: true },
        });
      }
      const cat2 = CATEGORY_BY_KEY[category];
      const sampleText = `${TEST_CONSUMPTION_NOTE} ${cat2?.name ?? category} üslubunda örnek deneyim yorumu — servis, lezzet ve ortam üzerine gözlemler; bar testini doldurmak için üretildi.`;
      for (let i = 0; i < need; i++) {
        try {
          await prisma.$transaction(async (tx) => {
            const consumption = await tx.consumption.create({
              data: { cardId: card!.id, customerId: userId, dealerId, note: TEST_CONSUMPTION_NOTE },
              select: { id: true },
            });
            await tx.consumptionReview.create({
              data: { consumptionId: consumption.id, customerId: userId, rating: 5, text: sampleText, characterCategory: category },
            });
          });
          created++;
        } catch {
          failed++;
        }
      }
    }
    await audit('fill', { category, n, existing, created, failed });

    return json(
      { success: failed === 0, action, category, existing, created, failed, total: existing + created, threshold: CATEGORY_BADGE_THRESHOLD, ...(failed > 0 ? { error: `${failed} sentetik yorum oluşturulamadı` } : {}) },
      failed > 0 && created === 0 ? 500 : 200,
    );
  }

  if (action === 'cleanupTest') {
    // Sentetik test verisini sil (Consumption silinince Review cascade ile gider) + test kartı.
    const del = await prisma.consumption.deleteMany({ where: { customerId: userId, note: TEST_CONSUMPTION_NOTE } });
    const delCard = await prisma.physicalCard.deleteMany({ where: { customerId: userId, blockReason: TEST_CONSUMPTION_NOTE } }).catch(() => ({ count: 0 }));
    await audit('cleanup', { deletedConsumptions: del.count, deletedCards: delCard.count });
    return json({ success: true, action, deletedConsumptions: del.count, deletedCards: delCard.count });
  }

  return NextResponse.json({ success: false, error: 'Bilinmeyen aksiyon' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
}
