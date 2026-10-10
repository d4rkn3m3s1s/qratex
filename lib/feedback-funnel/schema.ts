/**
 * QR geri bildirim hunisinin gövde şemaları ve sözleşme tipleri (saf; istemci + sunucu).
 */
import { z } from 'zod';
import { INPUT_LIMITS } from '@/lib/input-limits';
import { MAX_QUICK_TAGS } from './quick-tags';
import { ATTRIBUTION_SOURCES, MAX_FEEDBACK_PHOTOS } from './constants';

export { ATTRIBUTION_SOURCES, MAX_FEEDBACK_PHOTOS, type AttributionSource } from './constants';

const shortParam = z
  .string()
  .trim()
  .max(120)
  .regex(/^[\p{L}\p{N} ._:/@+-]*$/u, 'Geçersiz kampanya parametresi.')
  .optional();

export const attributionSchema = z.object({
  source: z.enum(ATTRIBUTION_SOURCES).optional(),
  utmSource: shortParam,
  utmCampaign: shortParam,
  utmMedium: shortParam,
  segment: z.string().trim().max(40).regex(/^[A-Za-z0-9_-]*$/).optional(),
});
export type AttributionInput = z.infer<typeof attributionSchema>;

const ratingSchema = z
  .number({ required_error: 'Lütfen 1-5 arasında bir puan seçin.', invalid_type_error: 'Lütfen 1-5 arasında bir puan seçin.' })
  .int('Lütfen 1-5 arasında bir puan seçin.')
  .min(1, 'Lütfen 1-5 arasında bir puan seçin.')
  .max(5, 'Lütfen 1-5 arasında bir puan seçin.');

export const submitFeedbackSchema = z.object({
  rating: ratingSchema,
  text: z
    .string({ invalid_type_error: 'Yorum metin olmalı.' })
    .max(INPUT_LIMITS.feedbackText, `Yorum en fazla ${INPUT_LIMITS.feedbackText} karakter olabilir.`)
    .optional(),
  tags: z.array(z.string().max(40)).max(MAX_QUICK_TAGS * 2).optional(),
  npsScore: z.number().int().min(0, 'NPS 0-10 arası olmalı.').max(10, 'NPS 0-10 arası olmalı.').nullable().optional(),
  staffId: z.string().trim().min(1).max(64).nullable().optional(),
  media: z.array(z.string().url().max(500)).max(MAX_FEEDBACK_PHOTOS, `En fazla ${MAX_FEEDBACK_PHOTOS} fotoğraf eklenebilir.`).optional(),
  attribution: attributionSchema.optional(),
});
export type SubmitFeedbackBody = z.infer<typeof submitFeedbackSchema>;

export const claimFeedbackSchema = z.object({
  token: z.string().min(20).max(1024),
});

export const scanBeaconSchema = attributionSchema;

/** Gönderim sonrası ödül durumu (sunucu otoriter). */
export type FeedbackRewardResult =
  | {
      status: 'credited' | 'capped';
      points: number;
      xp: number;
      /** Tavan öncesi istenen puan (çarpanlar dahil). */
      requested: number;
      level: number;
      leveledUp: boolean;
      /** Seviye içi ilerleme (yüzde 0-100) ve bir sonraki seviyeye kalan XP. */
      levelProgressPct: number;
      xpToNextLevel: number;
      /** Klan gücüne aktarılan pay (klan üyesi değilse 0). */
      squadContribution: number;
    }
  /** Bayi/personel kendi işletmesine: kayıt alındı, işaretlendi, ödül yok. */
  | { status: 'conflict' }
  /** Oturumsuz gönderim: hesaba bağlanınca alınabilecek ödül. */
  | { status: 'claimable'; points: number; xp: number; claimToken: string; expiresAt: string }
  /** Oturumsuz, ama bağlama belirteci üretilemedi (yapılandırma eksik) — dürüstçe ödülsüz. */
  | { status: 'guest' };

export type SubmitFeedbackResult = {
  feedbackId: string;
  createdAt: string;
  reward: FeedbackRewardResult;
};

export type ClaimFeedbackResult = {
  feedbackId: string;
  reward: Extract<FeedbackRewardResult, { status: 'credited' | 'capped' }>;
};
