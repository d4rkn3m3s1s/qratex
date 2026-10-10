/**
 * Tara yüzeyi (/customer/scan) — sunucu ve istemci arasında paylaşılan tipler.
 * Saf tip dosyası: sunucu modülleri (app/customer/scan/_server) ve BFF de buradan okur.
 */
import type { ScanSource } from '@/lib/qr-resolve';

export type { ScanSource };

/** QR kodunun durumu (public QR ucu ile aynı sıra: arşiv → pasif → süresi dolmuş → iptal). */
export type VenueStatus = 'ok' | 'inactive' | 'expired' | 'revoked' | 'archived' | 'not_found';

export interface VenueInfo {
  name: string;
  logoUrl: string | null;
  /** Şube adı ya da QR adı ("Masa 5", "Kadıköy"). */
  placeLabel: string | null;
  /** Bu müşterinin bu işletmeye son geri bildirimi (ISO), yoksa null. */
  lastVisitAt: string | null;
}

/** Fiziksel kart durumu (bu müşteri açısından). */
export type CardState = 'unused' | 'mine' | 'taken' | 'blocked' | 'not_found';

export type ScanResolution =
  | { kind: 'venue'; status: 'ok'; code: string; venue: VenueInfo }
  | { kind: 'venue'; status: Exclude<VenueStatus, 'ok'>; code: string }
  | { kind: 'card'; state: CardState; token: string; hasOtherCard: boolean }
  | { kind: 'unknown' };

/** Taban geri bildirim ödülü (sunucudaki puan matrisi + bugünkü tavan). Gösterim içindir, kredi değil. */
export interface ScanRewardInfo {
  basePoints: number;
  detailedPoints: number;
  /** Detaylı ödül için gereken en az karakter. */
  detailThreshold: number;
  /** Bugün (ve bu hafta) geri bildirimden kazanılabilecek kalan puan. */
  remainingToday: number;
}

export interface RecentVenue {
  dealerId: string;
  name: string;
  logoUrl: string | null;
  placeLabel: string | null;
  lastVisitAt: string;
}

export interface ScanSummary {
  reward: ScanRewardInfo;
  balance: number;
  recentVenues: RecentVenue[];
  hasActiveCard: boolean;
}
