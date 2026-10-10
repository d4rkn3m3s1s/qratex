/**
 * Kampanya oluşturma/güncelleme doğrulaması — POST ve PATCH aynı kuralları kullanır.
 *
 * P0-35: "E-posta" kanalı sahteydi (hiçbir e-posta gönderilmiyor, push da atlanıyordu).
 * Gerçek pazarlama e-postası teslimi kurulana kadar yalnız 'notification' kabul edilir;
 * 'email' gelirse kullanıcıya nedenini söyleyen Türkçe bir hata döner.
 *
 * Dalga 2: kitle anahtarları tek kaynaktan (`components/dealer/b-kampanyalar/domain.ts`,
 * bayi-yerel segment kuralı). Eski "sadık = aktif" çakışması yok.
 */
import { z } from 'zod';
import { EMAIL_CHANNEL_UNAVAILABLE_MESSAGE } from '@/lib/marketing-delivery';
import { CAMPAIGN_SEGMENT_KEYS, MESSAGE_MAX, TITLE_MAX } from '@/components/dealer/b-kampanyalar/domain';

export const CAMPAIGN_SEGMENTS = CAMPAIGN_SEGMENT_KEYS;

const channelSchema = z
  .string({ invalid_type_error: 'Geçersiz kanal' })
  .refine((v) => v === 'notification', { message: EMAIL_CHANNEL_UNAVAILABLE_MESSAGE });

const titleSchema = z
  .string({ invalid_type_error: 'Başlık metin olmalı' })
  .trim()
  .min(1, 'Başlık boş olamaz')
  .max(TITLE_MAX, `Başlık en fazla ${TITLE_MAX} karakter olabilir`);
const messageSchema = z
  .string({ invalid_type_error: 'Mesaj metin olmalı' })
  .trim()
  .min(1, 'Mesaj boş olamaz')
  .max(MESSAGE_MAX, `Mesaj en fazla ${MESSAGE_MAX} karakter olabilir`);
const segmentSchema = z.enum(CAMPAIGN_SEGMENT_KEYS, { errorMap: () => ({ message: 'Geçersiz hedef kitle' }) });

export const campaignCreateSchema = z.object({
  title: titleSchema,
  message: messageSchema,
  targetSegment: segmentSchema,
  channel: channelSchema.default('notification'),
});

/** PATCH: yalnız gönderilen alanlar doğrulanır; bilinmeyen alanlar yok sayılır. */
export const campaignUpdateSchema = z.object({
  title: titleSchema.optional(),
  message: messageSchema.optional(),
  targetSegment: segmentSchema.optional(),
  channel: channelSchema.optional(),
});
