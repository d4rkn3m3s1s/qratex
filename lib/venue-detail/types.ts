/**
 * Mekân detayı DTO'ları — sunucu (lib/venue-detail/*) ile istemci adaları
 * (components/customer/m-mekan-detay/*) arasındaki sözleşme. Prisma İÇERMEZ.
 */
import type { OpenState } from '@/lib/places/business-hours';
import type { PlaceCategory } from '@/lib/places/categories';
import type { StampCardState, VisitTierState } from './visits';

export const IMPROVEMENT_TEMPLATE_KEYS = ['tone', 'speed', 'quality', 'value', 'other'] as const;
export type ImprovementTemplateKey = (typeof IMPROVEMENT_TEMPLATE_KEYS)[number];

export const SHARE_CAPTION_KEYS = ['recommend', 'try_it', 'hidden_gem', 'great_service'] as const;
export type ShareCaptionKey = (typeof SHARE_CAPTION_KEYS)[number];

export const SHARE_MOODS = ['great', 'good', 'ok'] as const;
export type ShareMood = (typeof SHARE_MOODS)[number];

/** İyileştirme mesajı sınırları (API zod'u ve istemci sayacı aynı değeri kullanır). */
export const IMPROVEMENT_MESSAGE_MIN = 10;
export const IMPROVEMENT_MESSAGE_MAX = 1000;

export type VenueBranch = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type VenueOffer = {
  id: string;
  title: string;
  body: string;
  offerType: string;
  value: number | null;
  validTo: string;
};

export type VenueHappyHour = {
  id: string;
  name: string;
  multiplier: number;
  startTime: string;
  endTime: string;
  live: boolean;
  /** Bayiye değil platform geneline tanımlı. */
  global: boolean;
};

export type VenueHistoryItem =
  | {
      kind: 'consumption';
      id: string;
      at: string;
      productName: string | null;
      amount: number | null;
      review: {
        id: string;
        rating: number;
        excerpt: string | null;
        dealerReply: string | null;
        dealerRepliedAt: string | null;
      } | null;
    }
  | {
      kind: 'feedback';
      id: string;
      at: string;
      rating: number;
      excerpt: string | null;
      topics: string[];
      dealerReply: string | null;
      dealerRepliedAt: string | null;
    };

export type VenueHistoryPage = {
  items: VenueHistoryItem[];
  nextCursor: string | null;
};

export type VenueImprovementRequest = {
  id: string;
  templateKey: string;
  message: string;
  createdAt: string;
  /** İşletme bildirimi açtı mı (Notification.isRead / readAt). */
  seen: boolean;
  seenAt: string | null;
};

export type VenueShareLink = {
  token: string;
  url: string;
  caption: string | null;
  mood: string;
  viewCount: number;
  expiresAt: string;
};

export type VenueDetail = {
  dealer: {
    id: string;
    name: string;
    logo: string | null;
    description: string | null;
    /** Kontrollü sözlükten (lib/places/categories); ham `businessCategory` sızmaz. */
    category: PlaceCategory | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  branches: VenueBranch[];
  hours: {
    /** `null` = çalışma saati bilinmiyor/çözülemedi → açık/kapalı İDDİA EDİLMEZ. */
    state: OpenState | null;
    /** Pazartesi'den başlayan haftalık tablo (çözülebildiyse). */
    rows: Array<{ day: number; ranges: Array<{ open: string; close: string }> }> | null;
    /** Bayinin yazdığı ham metin (çözülemese de gösterilir). */
    raw: string | null;
  };
  offers: VenueOffer[];
  happyHours: VenueHappyHour[];
  isFavorite: boolean;
  visits: {
    days: number;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    stamps: StampCardState;
    tier: VisitTierState;
  };
  responseTime: { hours: number; sample: number } | null;
  improvement: {
    enabled: boolean;
    eligible: boolean;
    requests: VenueImprovementRequest[];
  };
  share: {
    enabled: boolean;
    links: VenueShareLink[];
  };
  history: VenueHistoryPage;
  generatedAt: string;
};
