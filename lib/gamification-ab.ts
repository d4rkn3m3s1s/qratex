/**
 * Gamification A/B test (madde 43): varyant atama helper.
 * Settings'te "gamification_ab_experiments" ile tanımlı deneyler için kullanıcıya tutarlı varyant döner.
 */

import { prisma } from '@/lib/prisma';

type ExperimentConfig = {
  variants: string[];
  weights?: number[];
};

function hashUserId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h << 5) - h + userId.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Kullanıcı için deney varyantı döner (tutarlı).
 * Settings'te key = "gamification_ab_experiments", value = { [experimentKey]: { variants: ["A","B"], weights?: [0.5,0.5] } }
 */
export async function getVariant(
  userId: string,
  experimentKey: string
): Promise<string | null> {
  const setting = await prisma.settings.findUnique({
    where: { key: 'gamification_ab_experiments' },
    select: { value: true },
  });
  const experiments = (setting?.value as Record<string, ExperimentConfig>) ?? {};
  const config = experiments[experimentKey];
  if (!config?.variants?.length) return null;

  const weights = config.weights ?? config.variants.map(() => 1 / config.variants.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = (hashUserId(userId) % 10000) / 10000 * total;

  for (let i = 0; i < config.variants.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return config.variants[i];
  }
  return config.variants[config.variants.length - 1];
}
