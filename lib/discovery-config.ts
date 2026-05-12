import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const DISCOVERY_CONFIG_SETTING_KEY = 'discovery_config';
export const DISCOVERY_CONFIG_CATEGORY = 'growth';

export type DealerLocationConfig = {
  dealerId: string;
  latitude: number;
  longitude: number;
  address?: string;
  categories: string[];
  opensAt?: string;
  closesAt?: string;
  daysOfWeek?: number[];
};

export type SponsoredAnnouncementConfig = {
  id: string;
  title: string;
  description?: string;
  discountRate?: number;
  linkUrl?: string;
  dealerId?: string;
  imageUrl?: string;
  priority: number;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
};

export type DiscoveryConfig = {
  locations: DealerLocationConfig[];
  sponsored: SponsoredAnnouncementConfig[];
  weeklyHighlights: {
    ambienceLabel: string;
    foodLabel: string;
    serviceLabel: string;
  };
};

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  locations: [],
  sponsored: [],
  weeklyHighlights: {
    ambienceLabel: 'En Güzel Ambiyans',
    foodLabel: 'En Güzel Yemek',
    serviceLabel: 'En Güzel Hizmet',
  },
};

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return fallback;
  return value;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'number' ? Math.floor(entry) : Number.NaN))
    .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6);
}

export function normalizeDiscoveryConfig(input: unknown): DiscoveryConfig {
  if (!input || typeof input !== 'object') return DEFAULT_DISCOVERY_CONFIG;
  const raw = input as Record<string, unknown>;

  const locations: DealerLocationConfig[] = [];
  if (Array.isArray(raw.locations)) {
    for (const entry of raw.locations) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const dealerId = typeof row.dealerId === 'string' ? row.dealerId.trim() : '';
      if (!dealerId) continue;
      locations.push({
        dealerId,
        latitude: toFiniteNumber(row.latitude, 0),
        longitude: toFiniteNumber(row.longitude, 0),
        address: typeof row.address === 'string' ? row.address.trim() : undefined,
        categories: toStringArray(row.categories),
        opensAt: typeof row.opensAt === 'string' ? row.opensAt.trim() : undefined,
        closesAt: typeof row.closesAt === 'string' ? row.closesAt.trim() : undefined,
        daysOfWeek: toNumberArray(row.daysOfWeek),
      });
    }
  }

  const sponsored: SponsoredAnnouncementConfig[] = [];
  if (Array.isArray(raw.sponsored)) {
    raw.sponsored.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const row = entry as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!title) return;
      const id = typeof row.id === 'string' && row.id.trim().length > 0 ? row.id.trim() : `sponsored_${index + 1}`;
      sponsored.push({
        id,
        title,
        description: typeof row.description === 'string' ? row.description.trim() : undefined,
        discountRate: toFiniteNumber(row.discountRate, 0),
        linkUrl: typeof row.linkUrl === 'string' ? row.linkUrl.trim() : undefined,
        dealerId: typeof row.dealerId === 'string' ? row.dealerId.trim() : undefined,
        imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl.trim() : undefined,
        priority: Math.max(0, Math.floor(toFiniteNumber(row.priority, 0))),
        isActive: typeof row.isActive === 'boolean' ? row.isActive : true,
        startsAt: typeof row.startsAt === 'string' ? row.startsAt : undefined,
        endsAt: typeof row.endsAt === 'string' ? row.endsAt : undefined,
      });
    });
  }
  sponsored.sort((a, b) => b.priority - a.priority);

  const weeklyRaw =
    raw.weeklyHighlights && typeof raw.weeklyHighlights === 'object'
      ? (raw.weeklyHighlights as Record<string, unknown>)
      : {};

  return {
    locations,
    sponsored,
    weeklyHighlights: {
      ambienceLabel:
        typeof weeklyRaw.ambienceLabel === 'string' && weeklyRaw.ambienceLabel.trim().length > 0
          ? weeklyRaw.ambienceLabel.trim()
          : DEFAULT_DISCOVERY_CONFIG.weeklyHighlights.ambienceLabel,
      foodLabel:
        typeof weeklyRaw.foodLabel === 'string' && weeklyRaw.foodLabel.trim().length > 0
          ? weeklyRaw.foodLabel.trim()
          : DEFAULT_DISCOVERY_CONFIG.weeklyHighlights.foodLabel,
      serviceLabel:
        typeof weeklyRaw.serviceLabel === 'string' && weeklyRaw.serviceLabel.trim().length > 0
          ? weeklyRaw.serviceLabel.trim()
          : DEFAULT_DISCOVERY_CONFIG.weeklyHighlights.serviceLabel,
    },
  };
}

export async function getDiscoveryConfig(): Promise<DiscoveryConfig> {
  const setting = await prisma.settings.findUnique({
    where: { key: DISCOVERY_CONFIG_SETTING_KEY },
    select: { value: true },
  });
  return normalizeDiscoveryConfig(setting?.value);
}

export async function saveDiscoveryConfig(config: DiscoveryConfig) {
  return prisma.settings.upsert({
    where: { key: DISCOVERY_CONFIG_SETTING_KEY },
    update: {
      value: config as Prisma.InputJsonValue,
      category: DISCOVERY_CONFIG_CATEGORY,
    },
    create: {
      key: DISCOVERY_CONFIG_SETTING_KEY,
      value: config as Prisma.InputJsonValue,
      category: DISCOVERY_CONFIG_CATEGORY,
    },
  });
}
