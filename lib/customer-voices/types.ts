/**
 * Seslerim (/customer/me/voices) — sunucu ↔ istemci sözleşmesi.
 *
 * Bu dosya Prisma ya da sunucu modülü İÇE AKTARMAZ: istemci bileşenleri de tipleri buradan alır.
 * Tarihler ISO dizgi olarak taşınır (sunucu bileşeninden istemciye serileştirilebilir).
 */
import type { RemedyOption } from '@/lib/remedy-options';

/** `qr` = QR geri bildirimi (Feedback) · `review` = tüketim yorumu (ConsumptionReview). */
export type VoiceKind = 'qr' | 'review';

/** İşletme tarafındaki en ileri adım (yalnız kayıtlı zaman damgalarından türetilir). */
export type VoiceStage = 'sent' | 'viewed' | 'replied';

export const VOICE_TYPE_FILTERS = ['all', 'qr', 'review'] as const;
export type VoiceTypeFilter = (typeof VOICE_TYPE_FILTERS)[number];

/** `awaiting` = henüz yanıt yok · `remedy` = telafi teklifi gelmiş · `low` = 1–2 yıldız. */
export const VOICE_STATUS_FILTERS = ['all', 'replied', 'awaiting', 'remedy', 'low'] as const;
export type VoiceStatusFilter = (typeof VOICE_STATUS_FILTERS)[number];

/** Müşteriye görünen telafi durumları (onay kuyruğu ve reddedilenler asla dönmez). */
export const CUSTOMER_VISIBLE_REMEDY_STATUSES = ['pending', 'accepted', 'expired'] as const;
export type CustomerRemedyStatus = (typeof CUSTOMER_VISIBLE_REMEDY_STATUSES)[number];

export type VoiceBusiness = { id: string; name: string; logo: string | null };

export type VoiceRemedyBrief = {
  id: string;
  status: CustomerRemedyStatus;
  /** Kabul edilmişse insan diliyle seçim ("%20 İndirim", "100 puan"). */
  selectionLabel: string | null;
};

export type VoiceListItem = {
  /** Liste/çekmece anahtarı: `fb-<feedbackId>` ya da `cs-<consumptionId>`. */
  key: string;
  kind: VoiceKind;
  /** Feedback.id ya da ConsumptionReview.id */
  id: string;
  consumptionId: string | null;
  createdAt: string;
  rating: number;
  textPreview: string | null;
  business: VoiceBusiness;
  /** QR noktası ("Masa 4") ya da ürün adı. */
  place: string | null;
  stage: VoiceStage;
  repliedAt: string | null;
  remedy: VoiceRemedyBrief | null;
  /** Bu yorumla defterden kredilenen puan (yalnız defterde kaynağa bağlı kayıt varsa). */
  pointsEarned: number | null;
};

export type VoiceListPage = { items: VoiceListItem[]; nextCursor: string | null };

export type VoiceListParams = {
  type: VoiceTypeFilter;
  status: VoiceStatusFilter;
  q: string;
  cursor: string | null;
  limit: number;
};

export type PendingConsumption = {
  key: string;
  consumptionId: string;
  createdAt: string;
  business: VoiceBusiness;
  product: string | null;
};

export type ReviewRewardPreview = {
  /** Kısa yorumun ödülü (puan/XP). */
  base: { points: number; xp: number };
  /** `threshold` karakter ve üstü yorumun ödülü. */
  detailed: { points: number; xp: number };
  threshold: number;
  /** Bugünkü geri bildirim tavanında kalan puan (gün/hafta tavanlarının küçüğü). */
  remainingToday: number;
};

export type SentimentCounts = { positive: number; neutral: number; negative: number };

export type VoiceSummary = {
  totals: {
    voices: number;
    qr: number;
    reviews: number;
    /** Hiç yorum yoksa null ("0" kötü puan gibi okunmasın). */
    avgRating: number | null;
    replied: number;
    /** 0–100; yorum yoksa null. */
    replyRate: number | null;
  };
  /** Geri bildirim kovasındaki gerçek kredi (points_credited, kategori `feedback`). */
  points: { total: number; thisMonth: number };
  favoritePlace: { business: VoiceBusiness; count: number; avgRating: number } | null;
  pending: {
    reviews: number;
    remedies: number;
    reviewPreview: PendingConsumption[];
    reward: ReviewRewardPreview | null;
  };
  /** "Sesin": AI analizinden kullanıcıya yararlı özet. Modül kapalıysa ya da analiz yoksa null. */
  insights: {
    analyzed: number;
    sentiment: SentimentCounts;
    topTopics: Array<{ key: string; count: number }>;
    /** Konuların hesaplandığı en son analiz edilmiş QR yorumu sayısı. */
    topicSample: number;
  } | null;
};

export type JourneyEventKind =
  | 'submitted'
  | 'viewed'
  | 'replied'
  | 'remedy_offered'
  | 'remedy_accepted'
  | 'remedy_credited'
  | 'remedy_expired';

export type JourneyEvent = {
  id: string;
  kind: JourneyEventKind;
  at: string;
  /** Telafi olaylarında teklifin kimliği. */
  remedyId?: string;
  /** Seçim etiketi ya da kredilenen puan gibi kısa ayrıntı (sunucu üretir, Türkçe). */
  detail?: string | null;
};

export type VoiceRemedyDetail = {
  id: string;
  status: CustomerRemedyStatus;
  message: string;
  offeredAt: string;
  acceptedAt: string | null;
  /** Yalnız `pending` iken dolu: sunucunun kabul edeceği seçenekler. */
  options: RemedyOption[];
  selectionLabel: string | null;
  selectionType: string | null;
  /** Puan türünde hesaba geçen miktar (zaman çizelgesindeki `completed` olayından). */
  creditedPoints: number | null;
};

export type VoiceAnalysis = {
  summary: string | null;
  themes: Array<{ theme: string; sentiment: 'positive' | 'neutral' | 'negative' }>;
  statements: Array<{ statement: string; sentiment: 'positive' | 'neutral' | 'negative' }>;
  topics: string[];
};

export type VoiceDetail = {
  key: string;
  kind: VoiceKind;
  /** Feedback.id ya da (yorum varsa) ConsumptionReview.id; yorumsuz tüketimde null. */
  id: string | null;
  consumptionId: string | null;
  business: VoiceBusiness;
  place: string | null;
  /** Yalnız tüketim: kasadaki işlem bilgisi (makbuz). */
  consumption: {
    createdAt: string;
    amount: number | null;
    note: string | null;
    product: { name: string; category: string | null; icon: string | null } | null;
  } | null;
  /** Kullanıcının sesi; yorumsuz tüketimde null. */
  voice: {
    rating: number;
    text: string | null;
    dimensions: Record<string, number> | null;
    media: string[];
    createdAt: string;
    updatedAt: string;
  } | null;
  /** Moderasyonla kaldırılan yorum (gösterilmez, açıklanır). */
  moderated: boolean;
  reply: { text: string; at: string | null } | null;
  stage: VoiceStage;
  journey: JourneyEvent[];
  /** Bu işletmenin son 90 gündeki medyan yanıt süresi (en az 5 örnek). */
  expectation: { medianHours: number; sample: number } | null;
  remedies: VoiceRemedyDetail[];
  analysis: VoiceAnalysis | null;
  reward: { points: number; xp: number } | null;
  /** Yorum yazma/düzenleme izni ve ödül önizlemesi. */
  composer: { mode: 'create' | 'edit'; reward: ReviewRewardPreview | null } | null;
};

export type CustomerRemedyListItem = {
  id: string;
  status: CustomerRemedyStatus;
  message: string;
  offeredAt: string;
  acceptedAt: string | null;
  business: VoiceBusiness;
  /** Yalnız `pending` iken dolu: sunucunun kabul edeceği seçenekler. */
  options: RemedyOption[];
  selectionLabel: string | null;
  selectionType: string | null;
  creditedPoints: number | null;
  /** Kaynak yorumun Seslerim anahtarı (kişisel tekliflerde null). */
  voiceKey: string | null;
  source: { rating: number; textPreview: string | null } | null;
};
