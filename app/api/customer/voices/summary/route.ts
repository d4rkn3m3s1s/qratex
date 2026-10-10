/**
 * GET /api/customer/voices/summary — "Sesin" özeti: gerçek toplamlar (count/aggregate),
 * geri bildirim kovasındaki gerçek puan kredisi, bekleyen aksiyonlar (yorum bekleyen
 * tüketim, açık telafi) ve — `customer_ai_insights` modülü açıksa — kayıtlı AI analizinden
 * duygu dağılımı ve konular. Bayi triyaj metrikleri (kaybetme riski, efor, aciliyet) YOK.
 * GET'te LLM çağrısı yok.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getVoiceSummary } from '@/lib/customer-voices/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.voices.summary', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => ok(await getVoiceSummary(user.id))
);
