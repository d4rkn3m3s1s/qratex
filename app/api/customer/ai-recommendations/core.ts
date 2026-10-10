/**
 * Müşteri AI önerileri — saf çekirdek (Jest ile test edilir, DB/LLM bağımlılığı yok).
 *
 * P0-39 (müşteri · AI öneriler) kök nedenleri:
 *  1. Yanıt sözleşmesi: "yetersiz veri" dalı `stats: { totalFeedbacks }` döndürüyordu; istemci
 *     `stats.topBusinesses.length` okuyup TypeError ile sayfayı çökertiyordu. Artık HER dal
 *     tam şekilli `stats` döndürür + ayrık `status` alanı taşır.
 *  2. Sınırsız LLM: her GET yeni bir ücretli çağrıydı. Artık öneri, geri bildirim külliyatının
 *     parmak izine bağlı önbellekten okunur; LLM yalnız külliyat değişince ve kullanıcı/platform
 *     kotası izin verdikçe çağrılır.
 *  3. AI hata metinleri ("Bir hata oluştu…") başarılı öneri gibi gösterilip önbelleğe
 *     yazılıyordu. Artık hata sonucu ayrıştırılır, önbelleğe yazılmaz.
 */
import { createHash } from 'node:crypto';

/** Kişisel öneri üretmek için gereken en az yazılı geri bildirim. */
export const MIN_FEEDBACKS_FOR_RECOMMENDATIONS = 2;
/** İstatistik ve LLM bağlamı için okunan en yeni kayıt sayısı. */
export const RECOMMENDATION_SAMPLE_SIZE = 50;
/** Önbellek anahtarına girer: istem değişince eski öneriler kendiliğinden geçersizleşir. */
export const RECOMMENDATION_PROMPT_VERSION = 3;
/** Önbellek ömrü (saniye): külliyat değişmedikçe aynı öneri 24 saat sunulur. */
export const RECOMMENDATION_CACHE_TTL_SECONDS = 24 * 60 * 60;

/** LLM kotaları (yalnız önbellek ıskalarında sayılır). */
export const LLM_LIMITS = {
  perUserHour: { max: 4, windowMs: 60 * 60_000 },
  perUserDay: { max: 12, windowMs: 24 * 60 * 60_000 },
  /** Çok hesaplı kötüye kullanıma karşı platform tavanı. */
  platformHour: { max: 600, windowMs: 60 * 60_000 },
} as const;

export interface RecommendationFeedbackRow {
  id: string;
  text: string | null;
  rating: number;
  sentiment: string | null;
  topics: unknown;
  urgency: number | null;
  effortScore: number | null;
  churnRisk: number | null;
  createdAt: Date;
  updatedAt: Date;
  qrCode: { name: string | null; dealer: { businessName: string | null } | null } | null;
}

export type RatingTrend = 'up' | 'down' | 'stable';

/**
 * Yanıttaki istatistik bloğu — her dalda TAM şekil (sıfır/boş varsayılanlarla).
 * `avgUrgency/avgEffort/avgChurnRisk` geriye uyum için tutulur (/customer/nearby okuyor);
 * LLM istemine ARTIK girmez (işletme triyaj metrikleri müşteriye öneri üretmez).
 */
export interface RecommendationStats {
  totalFeedbacks: number;
  avgRating: number;
  sentimentDist: { positive: number; negative: number; neutral: number };
  ratingTrend: RatingTrend;
  ratingTrendValue: number;
  /** Trend hesabının dayandığı karşılaştırma mümkün mü (en az 6 kayıt). */
  trendReliable: boolean;
  avgUrgency: number;
  avgEffort: number;
  avgChurnRisk: number;
  topTopics: { topic: string; count: number }[];
  topBusinesses: { name: string; count: number }[];
}

export type RecommendationsStatus = 'ready' | 'insufficient' | 'rate_limited' | 'unavailable';

/** Uç yanıtının `data` alanı (ve geriye uyum için kök alanları). */
export interface RecommendationsPayload {
  /** `insufficient`: en az `required` yazılı geri bildirim gerekir. */
  status: 'ready' | 'insufficient';
  /** Öneri metninin durumu (hazır / kota / AI hizmeti yok / yetersiz veri). */
  recommendationsStatus: RecommendationsStatus;
  /** Öneri metni; yalnız `recommendationsStatus === 'ready'` iken dolu. */
  recommendations: string | null;
  /** Kullanıcıya gösterilecek Türkçe açıklama (öneri yoksa). */
  message: string | null;
  required: number;
  have: number;
  /** Öneri önbellekten mi geldi. */
  cached: boolean;
  /** Önerinin üretildiği an (ISO). */
  generatedAt: string | null;
  /** Kota dolduysa yeniden deneme süresi (saniye). */
  retryAfterSec: number | null;
  stats: RecommendationStats;
}

export const RECOMMENDATION_MESSAGES = {
  insufficient: (have: number, required: number) => {
    const left = Math.max(0, required - have);
    return have === 0
      ? `Kişisel önerilerin için en az ${required} yazılı geri bildirim bırakman gerekiyor.`
      : `Kişisel önerilerin açılmasına ${left} yazılı geri bildirim kaldı.`;
  },
  rateLimited: 'Önerilerini kısa süre önce yeniledin. Biraz sonra yeniden deneyebilirsin.',
  unavailable: 'AI öneri hizmeti şu anda yanıt vermiyor. İstatistiklerin güncel; öneriler için biraz sonra tekrar dene.',
} as const;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function safeRating(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Boş/boşluk metinli kayıtları eler (Prisma `not: null` boş dizgeyi elemiyor). */
export function hasMeaningfulText(row: Pick<RecommendationFeedbackRow, 'text'>): boolean {
  return typeof row.text === 'string' && row.text.trim().length > 0;
}

/** Duygu yüzdeleri — toplam tam olarak 100 olacak şekilde (en büyük kalan yöntemi). */
export function sentimentPercentages(counts: { positive: number; negative: number; neutral: number }): {
  positive: number;
  negative: number;
  neutral: number;
} {
  const total = counts.positive + counts.negative + counts.neutral;
  if (total <= 0) return { positive: 0, negative: 0, neutral: 0 };
  const keys = ['positive', 'negative', 'neutral'] as const;
  const raw = keys.map((k) => (counts[k] / total) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] = (floored[i] ?? 0) + 1;
    remainder -= 1;
  }
  return { positive: floored[0] ?? 0, negative: floored[1] ?? 0, neutral: floored[2] ?? 0 };
}

/** Boş (sıfır) istatistik — "yetersiz veri" dalında da sözleşme tam kalsın. */
export function emptyStats(totalFeedbacks = 0): RecommendationStats {
  return {
    totalFeedbacks,
    avgRating: 0,
    sentimentDist: { positive: 0, negative: 0, neutral: 0 },
    ratingTrend: 'stable',
    ratingTrendValue: 0,
    trendReliable: false,
    avgUrgency: 0,
    avgEffort: 0,
    avgChurnRisk: 0,
    topTopics: [],
    topBusinesses: [],
  };
}

/** Son kayıtlardan istatistik — feedbacks en yeniden eskiye sıralı gelmeli. */
export function computeRecommendationStats(feedbacks: RecommendationFeedbackRow[]): RecommendationStats {
  const rows = feedbacks.filter(hasMeaningfulText);
  const total = rows.length;
  if (total === 0) return emptyStats(0);

  const ratings = rows.map((f) => safeRating(f.rating)).filter((n): n is number => n !== null);
  const avgRating = round1(mean(ratings));

  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const f of rows) {
    if (f.sentiment === 'positive') counts.positive += 1;
    else if (f.sentiment === 'negative') counts.negative += 1;
    else counts.neutral += 1;
  }

  // Trend: son 10 ile önceki 10 karşılaştırılır; iki tarafta da en az 3 kayıt yoksa "stabil"
  // denir ve `trendReliable=false` döner (eskiden ≤10 kayıtta her zaman "Stabil" yazıyordu).
  const half = Math.min(10, Math.floor(total / 2));
  const recent = rows.slice(0, half).map((f) => f.rating);
  const older = rows.slice(half, half * 2).map((f) => f.rating);
  const trendReliable = recent.length >= 3 && older.length >= 3;
  const trendValue = trendReliable ? mean(recent) - mean(older) : 0;
  const ratingTrend: RatingTrend = !trendReliable ? 'stable' : trendValue > 0.1 ? 'up' : trendValue < -0.1 ? 'down' : 'stable';

  const topicCounts = new Map<string, number>();
  for (const f of rows) {
    if (!Array.isArray(f.topics)) continue;
    for (const t of f.topics) {
      if (typeof t !== 'string' || !t.trim()) continue;
      const key = t.trim();
      topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
    }
  }
  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
    .slice(0, 8)
    .map(([topic, count]) => ({ topic, count }));

  const businessCounts = new Map<string, number>();
  for (const f of rows) {
    const name = (f.qrCode?.dealer?.businessName || f.qrCode?.name || '').trim() || 'İşletme';
    businessCounts.set(name, (businessCounts.get(name) ?? 0) + 1);
  }
  const topBusinesses = [...businessCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const numbers = (pick: (f: RecommendationFeedbackRow) => number | null) =>
    rows.map(pick).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

  return {
    totalFeedbacks: total,
    avgRating,
    sentimentDist: sentimentPercentages(counts),
    ratingTrend,
    ratingTrendValue: Number(trendValue.toFixed(2)),
    trendReliable,
    avgUrgency: mean(numbers((f) => f.urgency)),
    avgEffort: mean(numbers((f) => f.effortScore)),
    avgChurnRisk: mean(numbers((f) => f.churnRisk)),
    topTopics,
    topBusinesses,
  };
}

/**
 * Külliyat parmak izi — yeni/silinen/düzenlenen geri bildirimde değişir, böylece önbellek
 * kendiliğinden geçersizleşir. Kullanıcı kimliği anahtarın ayrı parçasıdır (kiracılar arası
 * çakışma olmaz).
 */
export function corpusFingerprint(feedbacks: Pick<RecommendationFeedbackRow, 'id' | 'updatedAt'>[]): string {
  const h = createHash('sha256');
  h.update(`v${RECOMMENDATION_PROMPT_VERSION}|${feedbacks.length}`);
  for (const f of feedbacks) {
    const at = f.updatedAt instanceof Date ? f.updatedAt.getTime() : new Date(f.updatedAt).getTime();
    h.update(`|${f.id}:${Number.isFinite(at) ? at : 0}`);
  }
  return h.digest('hex').slice(0, 32);
}

export function recommendationCacheKey(userId: string, fingerprint: string): string {
  return `ai-rec:v${RECOMMENDATION_PROMPT_VERSION}:${userId}:${fingerprint}`;
}

/**
 * `askAI` başarısızlıkta kullanıcıya yönelik bir HATA METNİ döndürüyor (ör. "Bir hata
 * oluştu…"). Bu metinler öneri değildir: ayrıştır, gösterme, önbelleğe yazma.
 * `{ ok, text }` biçimine geçilirse de çalışır (ai-engine sözleşme değişikliğine dayanıklı).
 */
const ASK_AI_FAILURE_TEXTS = [
  'AI asistanı şu anda kullanılamıyor.',
  'Bu mesaj güvenlik nedeniyle işlenemiyor.',
  'Bir hata oluştu. Lütfen tekrar deneyin.',
];

export type NormalizedAiResult = { ok: true; text: string } | { ok: false; reason: 'empty' | 'error' };

export function normalizeAskAiResult(raw: unknown): NormalizedAiResult {
  let text: unknown = raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as { ok?: unknown; text?: unknown };
    if (obj.ok === false) return { ok: false, reason: 'error' };
    text = obj.text;
  }
  if (typeof text !== 'string') return { ok: false, reason: 'empty' };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (ASK_AI_FAILURE_TEXTS.some((f) => trimmed === f || trimmed.startsWith(f))) return { ok: false, reason: 'error' };
  // Aşırı uzun/bozuk çıktıyı sınırla (UI'da tek kart).
  return { ok: true, text: trimmed.slice(0, 4000) };
}

/**
 * LLM istemi — TÜKETİCİ bakış açısı. İşletme triyaj metrikleri (aciliyet, efor, kayıp riski)
 * istemde YOK; model kişiye hizmet eden bir asistan olarak konumlanır.
 */
export function buildRecommendationQuestion(stats: RecommendationStats): string {
  const trendText =
    !stats.trendReliable ? 'henüz belirgin değil' : stats.ratingTrend === 'up' ? 'yükseliyor' : stats.ratingTrend === 'down' ? 'düşüyor' : 'dengeli';
  const topics = stats.topTopics.map((t) => t.topic).slice(0, 6).join(', ') || 'belirgin konu yok';
  const places = stats.topBusinesses.map((b) => b.name).slice(0, 5).join(', ') || 'belirgin mekân yok';
  return `Bu soruyu bir İŞLETME SAHİBİ değil, uygulamayı kullanan bir MÜŞTERİ soruyor. Sen onun kişisel deneyim asistanısın.
Görevin: kişinin kendi geri bildirim geçmişine bakarak ona fayda sağlayacak kısa, uygulanabilir öneriler vermek.

Kişinin profili:
- Yazılı geri bildirim sayısı (son ${RECOMMENDATION_SAMPLE_SIZE} içinden): ${stats.totalFeedbacks}
- Ortalama verdiği puan: ${stats.avgRating.toFixed(1)}/5
- Duygu: %${stats.sentimentDist.positive} olumlu, %${stats.sentimentDist.negative} olumsuz
- Memnuniyet eğilimi: ${trendText}
- En çok değindiği konular: ${topics}
- En çok yorum bıraktığı mekânlar: ${places}

Kurallar:
- Tam olarak 5 madde yaz; her madde tek cümle, "- " ile başlasın, Türkçe ve "sen" diliyle.
- İşletmelere yönelik tavsiye ("personel eğitin", "yorumlara yanıt verin" gibi) VERME.
- Kişinin sevdiği şeylere benzer deneyimler, daha faydalı geri bildirim yazma ipuçları ve uygulamadaki ödül/rozet fırsatları gibi kişiye dönük öneriler ver.
- Bir işletme hakkında karalayıcı ya da hukuki yönlendirme yapma; veride olmayan bilgi uydurma.`;
}

/**
 * Üçüncü taraf LLM'e giden metinden iletişim bilgilerini çıkarır (KVKK veri minimizasyonu):
 * e-posta, telefon, TCKN benzeri 11 hane, IBAN ve kart numarası benzeri 13-19 hane.
 */
export function redactContactInfo(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-posta]')
    .replace(/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, '[iban]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[numara]')
    .replace(/(?:\+?90[\s-]?)?\(?0?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, '[telefon]')
    .replace(/\b[1-9]\d{10}\b/g, '[numara]');
}

export function insufficientPayload(stats: RecommendationStats): RecommendationsPayload {
  const have = stats.totalFeedbacks;
  return {
    status: 'insufficient',
    recommendationsStatus: 'insufficient',
    recommendations: null,
    message: RECOMMENDATION_MESSAGES.insufficient(have, MIN_FEEDBACKS_FOR_RECOMMENDATIONS),
    required: MIN_FEEDBACKS_FOR_RECOMMENDATIONS,
    have,
    cached: false,
    generatedAt: null,
    retryAfterSec: null,
    stats,
  };
}
