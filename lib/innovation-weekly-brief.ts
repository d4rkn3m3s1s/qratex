import { prisma } from '@/lib/prisma';

export type WeeklyBriefResult = {
  topThemes: { theme: string; count: number }[];
  recommendedAction: string;
};

const STOP = new Set([
  've', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'mi', 'mı', 'mu', 'mü', 'için', 'çok', 'gibi', 'ile',
  'the', 'and', 'a', 'an', 'is', 'it', 'to', 'of', 'in',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Son 7 gün QR + tüketim yorumlarından basit tema yoğunluğu + tek aksiyon önerisi.
 */
export async function computeWeeklyBriefForDealer(dealerId: string): Promise<WeeklyBriefResult> {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [feedbacks, reviews] = await Promise.all([
    prisma.feedback.findMany({
      where: {
        createdAt: { gte: since },
        qrCode: { dealerId },
      },
      select: { text: true, rating: true, topics: true },
    }),
    prisma.consumptionReview.findMany({
      where: {
        createdAt: { gte: since },
        consumption: { dealerId },
      },
      select: { text: true, rating: true },
    }),
  ]);

  const freq = new Map<string, number>();

  for (const f of feedbacks) {
    if (Array.isArray(f.topics)) {
      for (const t of f.topics as unknown[]) {
        if (typeof t === 'string') {
          const k = t.slice(0, 40);
          freq.set(k, (freq.get(k) || 0) + 1);
        }
      }
    }
    if (f.text) {
      for (const w of tokenize(f.text)) {
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
  }
  for (const r of reviews) {
    if (r.text) {
      for (const w of tokenize(r.text)) {
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
  }

  const topThemes = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme, count]) => ({ theme, count }));

  const lowRatings =
    feedbacks.filter((f) => f.rating <= 2).length + reviews.filter((r) => r.rating <= 2).length;
  const nps = feedbacks.filter((f) => (f as { npsScore?: number }).npsScore != null).length;

  let recommendedAction =
    'Bu hafta ekibe kısa bir “iyi örnek” paylaşımı yapın; olumlu sesleri görünür kılın.';
  if (lowRatings >= 3) {
    recommendedAction =
      'Düşük puanlı geri bildirimler arttı: telafi kuyruğunu ve açık aksiyonları bugün gözden geçirin; müdür onayı ile net SLA belirleyin.';
  } else if (topThemes[0]?.theme && /bekle|yavaş|kötü|soğuk|ilgisiz/i.test(topThemes[0].theme)) {
    recommendedAction =
      `Yoğun tema: “${topThemes[0].theme}”. Sahaya 15 dk servis hızı kontrolü + garson brifingi önerilir.`;
  } else if (nps === 0 && feedbacks.length > 5) {
    recommendedAction = 'NPS ölçümü az görünüyor; QR çıkışında tek soruluk NPS tetikleyicisini açmayı değerlendirin.';
  }

  return { topThemes, recommendedAction };
}
