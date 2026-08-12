import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { prisma } from '@/lib/prisma';
import { CHARACTER_PROFILES, CATEGORY_BADGE_THRESHOLD, classifyFeedbackCategory } from '@/lib/character-badges';
import { CHARACTER_CATEGORIES, CATEGORY_BY_KEY, charactersInCategory } from '@/lib/character-categories';
import { runChatCompletion } from '@/lib/ai-engine';

export const dynamic = 'force-dynamic';

/**
 * ADMIN-ONLY karakter rozeti TEST aracı. Sadece geliştirme/demo içindir:
 * bir kullanıcının karakter rozetlerini sıfırlar ve/veya yorumlarını belirli bir
 * kategoriye atayarak barı istenen doluluğa getirir — böylece reveal akışı
 * tekrar tekrar test edilebilir (canlı DB değişikliği yapar).
 *
 * GET  ?userId=me|<id>            → mevcut durum (kategori sayıları + karakter rozetleri).
 * POST { userId?, action, ... }   → aksiyon uygula.
 *   action:'reset'                → tüm karakter rozetlerini sil (reveal tekrar hazır).
 *   action:'fill', category, n    → kullanıcının n yorumunu <category>'ye ata (bar doldur).
 *   action:'clearCategories'      → tüm yorumların characterCategory'sini temizle.
 */

const CHAR_IDS = CHARACTER_PROFILES.map((c) => c.badgeId);

async function resolveUserId(auth: { session: { user: { id: string } } }, param: string | null): Promise<string> {
  if (!param || param === 'me') return auth.session.user.id;
  // Email verildiyse kullanıcıyı bul (admin demo customer'ı email ile hedefleyebilsin).
  if (param.includes('@')) {
    const u = await prisma.user.findFirst({ where: { email: { equals: param, mode: 'insensitive' } }, select: { id: true } });
    if (u) return u.id;
  }
  return param;
}

/** Karakter test aracının oluşturduğu sentetik veriyi işaretler (temizlenebilir olsun). */
const TEST_CONSUMPTION_NOTE = '[KARAKTER-TEST]';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = await resolveUserId(auth, req.nextUrl.searchParams.get('userId'));

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
    },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const userId = await resolveUserId(auth, body.userId ?? null);
  const action = String(body.action ?? '');

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
    const del = await prisma.userBadge.deleteMany({ where: { userId, badgeId: { in: CHAR_IDS } } });
    return NextResponse.json({ success: true, action, deleted: del.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'clearCategories') {
    const upd = await prisma.consumptionReview.updateMany({ where: { customerId: userId }, data: { characterCategory: null } });
    return NextResponse.json({ success: true, action, cleared: upd.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'fill') {
    const category = String(body.category ?? '');
    const valid = CHARACTER_CATEGORIES.some((c) => c.key === category);
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Geçersiz kategori' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    // Hedef doluluk (varsayılan: eşik = bar tam dolar).
    const n = Math.max(1, Math.min(50, Number(body.n) || CATEGORY_BADGE_THRESHOLD));

    // 1) Önce MEVCUT yorumları bu kategoriye etiketle.
    const fbs = await prisma.consumptionReview.findMany({
      where: { customerId: userId, text: { not: null } },
      select: { id: true }, orderBy: { createdAt: 'asc' }, take: n,
    });
    await prisma.consumptionReview.updateMany({
      where: { id: { in: fbs.map((f) => f.id) } },
      data: { characterCategory: category },
    });

    let created = 0;
    // 2) Yetmezse SENTETİK Consumption+Review üret (demo customer'da bar gerçekten dolsun).
    //    synthetic=false ise sadece mevcutları etiketler (eski davranış).
    const wantSynthetic = body.synthetic !== false; // varsayılan: sentetik AÇIK
    const need = n - fbs.length;
    if (wantSynthetic && need > 0) {
      const dealerId = auth.session.user.id; // admin (geçerli User FK); işaretli test verisi
      // Tek sentetik test kartı (varsa yeniden kullan).
      let card = await prisma.physicalCard.findFirst({ where: { customerId: userId, blockReason: TEST_CONSUMPTION_NOTE }, select: { id: true } });
      if (!card) {
        card = await prisma.physicalCard.create({
          data: { token: `chartest-${userId.slice(0, 8)}-${Math.floor(need)}-${fbs.length}`, customerId: userId, status: 'ACTIVATED', blockReason: TEST_CONSUMPTION_NOTE },
          select: { id: true },
        }).catch(async () => prisma.physicalCard.findFirst({ where: { customerId: userId, blockReason: TEST_CONSUMPTION_NOTE }, select: { id: true } }));
      }
      const cat2 = CATEGORY_BY_KEY[category];
      // Kategoriye uygun kısa örnek metin (min uzunluk şartlı kategoriler için yeterince uzun).
      const sampleText = `${TEST_CONSUMPTION_NOTE} ${cat2?.name ?? category} üslubunda örnek deneyim yorumu — servis, lezzet ve ortam üzerine gözlemler; bar testini doldurmak için üretildi.`;
      for (let i = 0; i < need && card; i++) {
        const consumption = await prisma.consumption.create({
          data: { cardId: card.id, customerId: userId, dealerId, note: TEST_CONSUMPTION_NOTE },
          select: { id: true },
        }).catch(() => null);
        if (!consumption) continue;
        await prisma.consumptionReview.create({
          data: { consumptionId: consumption.id, customerId: userId, rating: 5, text: sampleText, characterCategory: category },
        }).catch(() => {});
        created++;
      }
    }

    return NextResponse.json(
      { success: true, action, category, tagged: fbs.length, created, total: fbs.length + created, threshold: CATEGORY_BADGE_THRESHOLD },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  if (action === 'cleanupTest') {
    // Sentetik test verisini sil (Consumption silinince Review cascade ile gider) + test kartı.
    const del = await prisma.consumption.deleteMany({ where: { customerId: userId, note: TEST_CONSUMPTION_NOTE } });
    const delCard = await prisma.physicalCard.deleteMany({ where: { customerId: userId, blockReason: TEST_CONSUMPTION_NOTE } }).catch(() => ({ count: 0 }));
    return NextResponse.json({ success: true, action, deletedConsumptions: del.count, deletedCards: delCard.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  return NextResponse.json({ success: false, error: 'Bilinmeyen aksiyon' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
}
