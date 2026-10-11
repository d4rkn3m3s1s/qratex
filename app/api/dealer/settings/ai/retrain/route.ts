/**
 * `POST /api/dealer/settings/ai/retrain` — öğrenme profilini bayinin düzeltmeleri ve son
 * yorumlarıyla yeniden üretir (LLM çağrısı). Yalnız AI ana anahtarı açıkken (`lib/ai-policy`,
 * fail-closed) ve `ai_features` modülü açıkken; bayi başına 10 dakikada 2 kez.
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { canUseAi, getDealerAiPolicy } from '@/lib/ai-policy';
import { updateAdaptiveProfile } from '@/lib/ai-learning';
import { loadAiSection } from '@/lib/dealer-settings/load.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = defineRoute(
  {
    name: 'dealer.settings.ai.retrain',
    roles: ['DEALER'],
    module: 'ai_features',
    rateLimit: { max: 2, windowMs: 10 * 60_000, by: 'user' },
  },
  async ({ user }) => {
    const policy = await getDealerAiPolicy(user.id, { fresh: true });
    if (!canUseAi(policy)) {
      throw new ApiError('AI_DISABLED', 'AI kapalıyken öğrenme profili güncellenemez. Önce AI motorunu açın.', { status: 403 });
    }
    await updateAdaptiveProfile(user.id);
    return ok(await loadAiSection(user.id));
  }
);
