/**
 * `GET /api/dealer/settings/ai` — AI bölümü (ayar + kullanım + öğrenme). LLM yok.
 * `PATCH` — AI politikası: ana anahtar, otomatik analiz, uyarılar, haftalık özet e-postası,
 * işletme bağlamı (≤ 1000 karakter, enjeksiyon denetimli). Tek yazma yolu `lib/dealer-settings`
 * → `AISettings`; okuyucu `lib/ai-policy` (analiz hattı, cron, sohbet, otomatik yanıt).
 * `ai_features` modülü kapalıysa 403 MODULE_DISABLED.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { aiPatchSchema } from '@/lib/dealer-settings/contract';
import { loadAiSection } from '@/lib/dealer-settings/load.server';
import { updateDealerAiSettings } from '@/lib/dealer-settings/write.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.settings.ai.get', roles: ['DEALER'], rateLimit: { max: 120, windowMs: 60_000, by: 'user' } },
  async ({ user }) => ok(await loadAiSection(user.id))
);

export const PATCH = defineRoute(
  { name: 'dealer.settings.ai', roles: ['DEALER'], schema: aiPatchSchema, rateLimit: 'mutation', module: 'ai_features' },
  async ({ user, body, request }) => ok(await updateDealerAiSettings(user.id, body, getAuditRequestMeta(request)))
);
