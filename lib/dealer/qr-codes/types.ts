/**
 * QR kodlar ve şubeler — DTO'lar ve sorgu anahtarları (istemci + sunucu ortak, JSON'a serileşir).
 * Sayıları sunucu hesaplar; istemci yalnız biçimler.
 */
import type { QrLink, QrListFilters, QrStatus } from './rules';

export const QR_QUERY_ROOT = ['dealer', 'qr-codes'] as const;
export const qrListKey = (f: QrListFilters) => [...QR_QUERY_ROOT, 'list', f] as const;
export const QR_SUMMARY_KEY = [...QR_QUERY_ROOT, 'summary'] as const;
export const QR_LOCATIONS_KEY = [...QR_QUERY_ROOT, 'locations'] as const;
export const qrDetailKey = (id: string) => [...QR_QUERY_ROOT, 'detail', id] as const;

export interface QrLocationRef {
  id: string;
  name: string;
  isActive: boolean;
}

export interface QrStatsDto {
  /** Son `QR_STATS_DAYS` gündeki tekilleştirilmiş tarama (qr_scanned). */
  scans: number;
  /** Aynı penceredeki (silinmemiş) geri bildirim. */
  feedbacks: number;
  /** feedbacks / scans × 100; tarama yoksa null. */
  conversion: number | null;
  /** Aynı penceredeki ortalama puan; geri bildirim yoksa null. */
  avgRating: number | null;
  /** Son `QR_SPARK_DAYS` günün günlük taramaları (İstanbul günleri, eskiden yeniye). */
  spark: number[];
}

export interface QrItemDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: QrStatus;
  isActive: boolean;
  expiringSoon: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  location: QrLocationRef | null;
  /** Kanonik (NEXT_PUBLIC_APP_URL) geri bildirim adresi — basılı QR'ın içeriği. */
  targetUrl: string;
  /** Tüm zamanlar (silinmemiş) geri bildirim sayısı. */
  feedbackTotal: number;
  linkCount: number;
  stats: QrStatsDto;
}

export interface QrListDto {
  items: QrItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: QrListFilters;
  generatedAt: string;
}

export interface QuotaDto {
  used: number;
  /** null = sınırsız. */
  limit: number | null;
  planName: string;
}

export interface QrSummaryDto {
  counts: Record<'all' | 'active' | 'paused' | 'expiring' | 'expired' | 'revoked' | 'archived', number>;
  quota: QuotaDto;
  branchQuota: QuotaDto;
  scans7: number;
  scansPrev7: number;
  /** Son 14 günün günlük taramaları (İstanbul). */
  scanSeries: number[];
  scans30: number;
  feedbacks30: number;
  conversion30: number | null;
  /** 30 günde en az 3 yorum alan kodlar arasında ortalaması en düşük olan. */
  lowest: { id: string; name: string; avgRating: number; feedbacks: number } | null;
  businessName: string;
  generatedAt: string;
}

export interface QrDailyPoint {
  day: string;
  scans: number;
  feedbacks: number;
}

export interface QrHistoryEntry {
  id: string;
  code: string;
  revokedAt: string | null;
  createdAt: string;
  feedbackTotal: number;
}

export interface QrDetailDto {
  item: QrItemDto;
  links: QrLink[];
  /** Son 30 gün, gün gün (İstanbul). */
  daily: QrDailyPoint[];
  /** 30 günde taramaların bağlantı (segment) kırılımı; `null` anahtar = düz QR. */
  bySegment: Array<{ segment: string | null; scans: number }>;
  /** Bu kodun yenilediği eski kodlar (yeniden eskiye). */
  predecessors: QrHistoryEntry[];
  /** Bu kod yenilendiyse yerine geçen kod. */
  successor: { id: string; code: string; name: string } | null;
  businessName: string;
  generatedAt: string;
}

export interface LocationDto {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  liveQrCount: number;
  feedbacks30: number;
}

export interface LocationsDto {
  items: LocationDto[];
  quota: QuotaDto;
}
