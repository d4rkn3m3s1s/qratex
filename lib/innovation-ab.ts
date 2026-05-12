import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { AbCampaignExperiment, InnovationPlatformConfig } from '@/lib/innovation-config';

function hashSeed(s: string): number {
  const h = createHash('sha256').update(s, 'utf8').digest();
  return h.readUInt32BE(0) % 100;
}

export function pickAbVariant(
  config: InnovationPlatformConfig,
  experimentId: string,
  stickySeed: string
): { variant: 'A' | 'B'; experiment: AbCampaignExperiment | null } {
  const exp = config.campaignAb.experiments.find((e) => e.id === experimentId && e.active);
  const pctB = Math.min(
    99,
    Math.max(1, exp?.splitPercentB ?? config.campaignAb.defaultSplitPercentForB)
  );
  const bucket = hashSeed(`${stickySeed}:${experimentId}`);
  const variant: 'A' | 'B' = bucket < pctB ? 'B' : 'A';
  return { variant, experiment: exp ?? null };
}

export async function recordInnovationAbEvent(
  userId: string | null,
  experimentId: string,
  variant: 'A' | 'B',
  kind: 'impression' | 'conversion',
  extra?: { dimension?: string }
) {
  const event = kind === 'impression' ? 'innovation_ab_impression' : 'innovation_ab_conversion';
  await prisma.analyticsEvent.create({
    data: {
      ...(userId ? { userId } : {}),
      event,
      category: 'innovation_ab',
      data: { experimentId, variant, ...extra } as object,
    },
  });
}
