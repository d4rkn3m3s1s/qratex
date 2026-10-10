/** React Query anahtarları — sunucu (SSR ön-yükleme) ve istemci ORTAK; 'use client' DEĞİL. */
import type { CurationFilter, WallRange } from '@/lib/dealer/voc-wall/config';

export const VOC_ROOT = ['dealer', 'voc-wall'] as const;
export const overviewKey = (range: WallRange, qrCodeId: string | null) => [...VOC_ROOT, 'overview', range, qrCodeId ?? 'all'] as const;
export const curationKey = (filter: CurationFilter, page: number, qrCodeId: string | null) =>
  [...VOC_ROOT, 'items', filter, page, qrCodeId ?? 'all'] as const;
export const previewKey = [...VOC_ROOT, 'preview'] as const;
export const displaysKey = [...VOC_ROOT, 'displays'] as const;

