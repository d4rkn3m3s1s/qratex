/**
 * Kademeli açılış kurallarının sunucu yükleyicisi — modül kapısının (`lib/module-gate.ts`)
 * okuduğu tek yer. 60 sn çapraz istek önbelleği, modül kapısıyla AYNI etiket: yönetim
 * yazınca `revalidateTag('module-gate-settings')` ikisini birden tazeler.
 * FAIL-SAFE: DB erişilemezse kural yok sayılır (modül genel anahtarı geçerli kalır).
 */
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { MODULE_CATALOG } from '@/lib/module-controls';
import { evaluateRollout, parseRolloutMeta, type RolloutDecision, type RolloutRule } from './rollout';

/** `lib/module-gate.ts` → MODULE_GATE_CACHE_TAG ile aynı değer (döngüsel içe aktarmayı önlemek için kopya; testte eşitliği doğrulanır). */
export const ROLLOUT_CACHE_TAG = 'module-gate-settings';

const CATALOG_KEYS = new Set(MODULE_CATALOG.map((m) => m.key));

type SerializedRule = Omit<RolloutRule, 'expiresAt'> & { expiresAt: string | null };

async function loadRules(): Promise<SerializedRule[]> {
  try {
    const rows = await prisma.featureFlag.findMany({
      where: { isEnabled: true, key: { in: [...CATALOG_KEYS] } },
      select: { key: true, isEnabled: true, expiresAt: true, metadata: true },
    });
    return rows
      .map((r) => ({ r, meta: parseRolloutMeta(r.metadata) }))
      .filter(({ meta }) => meta.kind === 'module_rollout' && !meta.archivedAt)
      .map(({ r, meta }) => ({
        key: r.key,
        active: r.isEnabled,
        percent: meta.percent,
        allowUserIds: meta.allowUserIds,
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      }));
  } catch {
    return [];
  }
}

const getRulesCached = cache(() =>
  unstable_cache(loadRules, ['module-rollout-rules'], { revalidate: 60, tags: [ROLLOUT_CACHE_TAG] })()
);

export async function getRolloutRule(moduleKey: string): Promise<RolloutRule | null> {
  if (!CATALOG_KEYS.has(moduleKey)) return null;
  const rules = await getRulesCached();
  const hit = rules.find((r) => r.key === moduleKey);
  return hit ? { ...hit, expiresAt: hit.expiresAt ? new Date(hit.expiresAt) : null } : null;
}

/**
 * Modül kapısı için: `feature_flags` anahtarı kapalıysa (acil durdurma) kurallar yok sayılır.
 * Asla fırlatmaz.
 */
export async function checkModuleRollout(
  moduleKey: string,
  userId: string | null | undefined,
  controls: Record<string, boolean>
): Promise<RolloutDecision> {
  try {
    if (controls.feature_flags === false) return 'pass';
    const rule = await getRolloutRule(moduleKey);
    return evaluateRollout(rule, userId ?? null);
  } catch {
    return 'pass';
  }
}
