import { prisma } from '@/lib/prisma';

export const INNOVATION_PLATFORM_SETTINGS_KEY = 'innovationPlatform';

export type AbCampaignExperiment = {
  id: string;
  name: string;
  variantA: string;
  variantB: string;
  active: boolean;
  /** Deney boyutu — raporda dimension olarak AnalyticsEvent.data’ya yazılır */
  dimension?: 'copy' | 'push_title' | 'push_hour' | 'banner_image';
  pushTitleA?: string;
  pushTitleB?: string;
  pushHourA?: string;
  pushHourB?: string;
  bannerImageUrlA?: string;
  bannerImageUrlB?: string;
  /** B varyantına düşen trafik yüzdesi (1–99); yoksa platform varsayılanı */
  splitPercentB?: number;
  impressionsA?: number;
  impressionsB?: number;
  conversionsA?: number;
  conversionsB?: number;
};

export type InnovationPlatformConfig = {
  features: {
    tablePulse: boolean;
    flashOffers: boolean;
    weeklyBrief: boolean;
    segmentProposals: boolean;
    remedyTimeline: boolean;
    partnerDigestApi: boolean;
    staffTableInsights: boolean;
    nearbyRadar: boolean;
  };
  referral: {
    maxInvitesPerReferrerLifetime: number;
    maxRedemptionsPerReferralCodePerMonth: number;
  };
  compliance: {
    retentionDaysPersonalData: number;
    deletionRequestContactEmail: string;
    auditLogUrl?: string;
  };
  /** POS / rezervasyon webhook — Inngest saatlik tetikler */
  partnerDigest: {
    webhookUrl?: string;
    webhookSecret?: string;
    webhookEnabled?: boolean;
  };
  campaignAb: {
    defaultSplitPercentForB: number;
    experiments: AbCampaignExperiment[];
  };
};

export const defaultInnovationPlatformConfig: InnovationPlatformConfig = {
  features: {
    tablePulse: true,
    flashOffers: true,
    weeklyBrief: true,
    segmentProposals: true,
    remedyTimeline: true,
    partnerDigestApi: true,
    staffTableInsights: true,
    nearbyRadar: true,
  },
  referral: {
    maxInvitesPerReferrerLifetime: 100,
    maxRedemptionsPerReferralCodePerMonth: 30,
  },
  compliance: {
    retentionDaysPersonalData: 730,
    deletionRequestContactEmail: 'kvkk@example.com',
    auditLogUrl: '/admin/audit',
  },
  partnerDigest: {
    webhookUrl: '',
    webhookSecret: '',
    webhookEnabled: false,
  },
  campaignAb: {
    defaultSplitPercentForB: 50,
    experiments: [],
  },
};

function mergeDeep<T extends Record<string, unknown>>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
      out[k] = mergeDeep(out[k] as Record<string, unknown>, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export async function getInnovationPlatformConfig(): Promise<InnovationPlatformConfig> {
  const row = await prisma.settings.findUnique({
    where: { key: INNOVATION_PLATFORM_SETTINGS_KEY },
    select: { value: true },
  });
  if (!row?.value || typeof row.value !== 'object') {
    return { ...defaultInnovationPlatformConfig };
  }
  return mergeDeep(
    { ...defaultInnovationPlatformConfig },
    row.value as Record<string, unknown>
  );
}

export async function saveInnovationPlatformConfig(
  patch: Partial<InnovationPlatformConfig>
): Promise<InnovationPlatformConfig> {
  const current = await getInnovationPlatformConfig();
  const next = mergeDeep(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  await prisma.settings.upsert({
    where: { key: INNOVATION_PLATFORM_SETTINGS_KEY },
    create: {
      key: INNOVATION_PLATFORM_SETTINGS_KEY,
      category: 'admin',
      value: next as object,
    },
    update: { value: next as object },
  });
  return next as unknown as InnovationPlatformConfig;
}
