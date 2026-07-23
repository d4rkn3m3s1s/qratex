import { prisma } from '@/lib/prisma';

/**
 * "Sen Seversin" öneri motoru — co-occurrence tabanlı.
 *
 * Yaklaşım (keşif kararı): ürün verisi seyrek (Consumption.productId çoğu zaman null),
 * bu yüzden çok katmanlı graceful fallback:
 *   1) Ürün seviyesi: kullanıcının tükettiği ürünlerle BİRLİKTE tüketilen ürünler.
 *   2) Kategori seviyesi: kullanıcının sevdiği kategorilerdeki popüler ürünler.
 *   3) Dealer seviyesi: kullanıcının ziyaret ettiği dealer'larda popüler ürünler.
 * Saf Prisma aggregation — LLM/embedding gerekmez (açıklama katmanı ayrı, opsiyonel).
 */

export type Recommendation = {
  productId: string;
  name: string;
  price: number | null;
  image: string | null;
  dealerId: string;
  dealerName: string;
  categoryName: string;
  score: number;
  reason: string; // co-occurrence gerekçesi (LLM açıklaması ayrı alanda zenginleştirilebilir)
};

/** Kategori adını normalize eder (dealer-bazlı kategoriler için — kahve/coffee vb.). */
export function normalizeCategoryLabel(value: string): string {
  const text = value.toLowerCase();
  if (text.includes('kahve') || text.includes('coffee')) return 'kahve';
  if (text.includes('tatlı') || text.includes('tatli') || text.includes('dessert')) return 'tatlı';
  if (
    text.includes('yemek') ||
    text.includes('food') ||
    text.includes('restoran') ||
    text.includes('restaurant')
  ) {
    return 'yemek';
  }
  return text.trim();
}

const LOOKBACK_DAYS = 120;
const MAX_RESULTS = 8;

/**
 * Bir müşteri için ürün önerileri döndürür. Yeterli veri yoksa boş dizi döner
 * (çağıran taraf "yeterli veri yok" durumunu ele almalı).
 */
export async function getRecommendations(userId: string, limit = MAX_RESULTS): Promise<Recommendation[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // 1) Kullanıcının tüketim geçmişi (ürün + kategori + dealer).
  const myConsumptions = await prisma.consumption.findMany({
    where: { customerId: userId, createdAt: { gte: since } },
    select: {
      dealerId: true,
      productId: true,
      product: { select: { id: true, categoryId: true, category: { select: { name: true } } } },
    },
    take: 500,
    orderBy: { createdAt: 'desc' },
  });

  if (myConsumptions.length === 0) return [];

  const myProductIds = new Set(myConsumptions.map((c) => c.productId).filter((x): x is string => !!x));
  const myDealerIds = new Set(myConsumptions.map((c) => c.dealerId));
  const myCategories = new Set(
    myConsumptions
      .map((c) => c.product?.category?.name)
      .filter((x): x is string => !!x)
      .map(normalizeCategoryLabel)
  );

  // Puan toplama: aday productId → { score, reason }
  const scores = new Map<string, { score: number; reason: string }>();
  const bump = (pid: string, add: number, reason: string) => {
    const cur = scores.get(pid);
    if (cur) cur.score += add;
    else scores.set(pid, { score: add, reason });
  };

  // 2) ÜRÜN CO-OCCURRENCE: benim tükettiğim ürünleri tüketen DİĞER müşterilerin
  //    başka ürünlerini bul (birlikte tüketim). productId'si olan tüketimler üzerinden.
  if (myProductIds.size > 0) {
    // Aynı ürünleri tüketen diğer müşteriler
    const peers = await prisma.consumption.findMany({
      where: {
        productId: { in: [...myProductIds] },
        customerId: { not: userId },
        createdAt: { gte: since },
      },
      select: { customerId: true },
      take: 2000,
    });
    const peerIds = [...new Set(peers.map((p) => p.customerId))];
    if (peerIds.length > 0) {
      const peerConsumptions = await prisma.consumption.findMany({
        where: {
          customerId: { in: peerIds },
          productId: { notIn: [...myProductIds] },
          createdAt: { gte: since },
        },
        select: { productId: true },
        take: 3000,
      });
      for (const pc of peerConsumptions) {
        if (pc.productId) bump(pc.productId, 3, 'Senin sevdiğin ürünleri tüketenler bunu da tercih etti');
      }
    }
  }

  // 3) KATEGORİ FALLBACK: sevdiğim kategorilerdeki popüler ürünler.
  if (myCategories.size > 0) {
    const catProducts = await prisma.product.findMany({
      where: { isActive: true, category: { is: { name: { not: undefined } } } },
      select: {
        id: true,
        category: { select: { name: true } },
        _count: { select: { consumptions: true } },
      },
      take: 500,
    });
    for (const p of catProducts) {
      const cat = p.category?.name ? normalizeCategoryLabel(p.category.name) : '';
      if (cat && myCategories.has(cat) && !myProductIds.has(p.id)) {
        bump(p.id, 1 + Math.min(2, p._count.consumptions / 5), `Sevdiğin "${cat}" kategorisinde popüler`);
      }
    }
  }

  // 4) DEALER FALLBACK: ziyaret ettiğim dealer'larda popüler (henüz tatmadığım) ürünler.
  if (myDealerIds.size > 0) {
    const dealerProducts = await prisma.product.findMany({
      where: { isActive: true, dealerId: { in: [...myDealerIds] }, id: { notIn: [...myProductIds] } },
      select: { id: true, _count: { select: { consumptions: true } } },
      take: 300,
    });
    for (const p of dealerProducts) {
      bump(p.id, 0.5 + Math.min(1.5, p._count.consumptions / 8), 'Ziyaret ettiğin işletmede popüler');
    }
  }

  if (scores.size === 0) return [];

  // En yüksek skorlu adayları ürün detaylarıyla döndür.
  const topIds = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit).map(([id]) => id);
  const products = await prisma.product.findMany({
    where: { id: { in: topIds }, isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      image: true,
      dealerId: true,
      dealer: { select: { businessName: true, name: true } },
      category: { select: { name: true } },
    },
  });

  const result: Recommendation[] = products
    .map((p) => {
      const s = scores.get(p.id)!;
      return {
        productId: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
        dealerId: p.dealerId ?? '',
        dealerName: p.dealer?.businessName || p.dealer?.name || 'İşletme',
        categoryName: p.category?.name || '',
        score: Math.round(s.score * 10) / 10,
        reason: s.reason,
      };
    })
    .sort((a, b) => b.score - a.score);

  return result;
}

/**
 * Hibrit katman: co-occurrence önerilerine LLM ile tek bir KİŞİSEL başlık cümlesi üretir.
 * LLM yoksa/başarısızsa kural-tabanlı bir fallback döner (öneriler yine çalışır — LLM
 * yalnızca "süsleme"). Cost-guard'a takılırsa da fallback kullanılır.
 */
export async function buildRecommendationHeadline(
  recommendations: Recommendation[]
): Promise<string> {
  const fallback = recommendations.length
    ? `Zevkine göre ${recommendations.length} öneri hazırladık — beğeneceğini düşünüyoruz!`
    : 'Birkaç ziyaret sonrası sana özel öneriler burada belirecek.';
  if (recommendations.length === 0) return fallback;

  try {
    const { runChatCompletion } = await import('@/lib/ai-engine');
    const items = recommendations
      .slice(0, 5)
      .map((r) => `- ${r.name} (${r.categoryName || 'ürün'}, ${r.dealerName})`)
      .join('\n');
    const res = await runChatCompletion({
      system:
        'Sen bir sadakat uygulamasının sıcak, kısa konuşan asistanısın. Kullanıcıya önerilen ' +
        'ürünlere bakıp TEK bir samimi Türkçe cümle yaz (max 90 karakter). Emoji kullanabilirsin. ' +
        'Ürün adı sayma, genel bir "sen seversin" hissi ver.',
      user: `Önerilen ürünler:\n${items}\n\nKısa kişisel başlık cümlesi:`,
      temperature: 0.7,
      maxTokens: 60,
    });
    const text = typeof res === 'string' ? res : res?.content ?? '';
    const clean = text.trim().replace(/^["']|["']$/g, '');
    return clean.length >= 8 ? clean : fallback;
  } catch {
    return fallback;
  }
}
