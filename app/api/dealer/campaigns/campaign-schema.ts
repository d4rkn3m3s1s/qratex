/**
 * Kampanya oluşturma/güncelleme doğrulaması — POST ve PATCH aynı kuralları kullanır.
 *
 * P0-35: "E-posta" kanalı sahteydi (hiçbir e-posta gönderilmiyor, push da atlanıyordu).
 * Gerçek pazarlama e-postası teslimi kurulana kadar yalnız 'notification' kabul edilir;
 * 'email' gelirse kullanıcıya nedenini söyleyen Türkçe bir hata döner.
 */
import { z } from 'zod';
import { EMAIL_CHANNEL_UNAVAILABLE_MESSAGE } from '@/lib/marketing-delivery';

export const CAMPAIGN_SEGMENTS = ['vip', 'loyal', 'active', 'risk', 'all'] as const;

const channelSchema = z
  .string({ invalid_type_error: 'Geçersiz kanal' })
  .refine((v) => v === 'notification', { message: EMAIL_CHANNEL_UNAVAILABLE_MESSAGE });

const titleSchema = z
  .string({ invalid_type_error: 'Başlık metin olmalı' })
  .trim()
  .min(1, 'Başlık boş olamaz')
  .max(200, 'Başlık en fazla 200 karakter olabilir');
const messageSchema = z
  .string({ invalid_type_error: 'Mesaj metin olmalı' })
  .trim()
  .min(1, 'Mesaj boş olamaz')
  .max(5000, 'Mesaj en fazla 5000 karakter olabilir');
const segmentSchema = z.enum(CAMPAIGN_SEGMENTS, { errorMap: () => ({ message: 'Geçersiz hedef segment' }) });

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
