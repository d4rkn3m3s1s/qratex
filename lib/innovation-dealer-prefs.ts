import { prisma } from '@/lib/prisma';

const SETTINGS_KEY = 'innovationDealerPrefs';

export type DealerInnovationPrefs = {
  /** Personel/masa performans API — varsayılan açık */
  staffTableInsights: boolean;
};

const defaults: DealerInnovationPrefs = {
  staffTableInsights: true,
};

function mergePrefs(raw: unknown): DealerInnovationPrefs {
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const o = raw as Record<string, unknown>;
  return {
    staffTableInsights:
      typeof o.staffTableInsights === 'boolean' ? o.staffTableInsights : defaults.staffTableInsights,
  };
}

export async function getDealerInnovationPrefs(dealerId: string): Promise<DealerInnovationPrefs> {
  const row = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEY },
    select: { value: true },
  });
  const map = (row?.value as Record<string, unknown>) || {};
  const entry = map[dealerId];
  return mergePrefs(entry);
}

export async function saveDealerInnovationPrefs(
  dealerId: string,
  patch: Partial<DealerInnovationPrefs>
): Promise<DealerInnovationPrefs> {
  const row = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEY },
    select: { value: true },
  });
  const map = {
    ...((row?.value as Record<string, unknown>) || {}),
  };
  const cur = mergePrefs(map[dealerId]);
  const next = { ...cur, ...patch };
  map[dealerId] = next;
  await prisma.settings.upsert({
    where: { key: SETTINGS_KEY },
    create: {
      key: SETTINGS_KEY,
      category: 'admin',
      value: map as object,
    },
    update: { value: map as object },
  });
  return next;
}
