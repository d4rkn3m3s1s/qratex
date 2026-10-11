import { prisma } from '@/lib/prisma';

/**
 * Bayi inovasyon tercihleri (Settings deposu, şema değişmeden).
 *
 * Veri modeli B10: eskiden TÜM bayilerin tercihi tek `innovationDealerPrefs` satırında
 * `{ [dealerId]: prefs }` haritasıydı → oku-değiştir-yaz yarışında iki bayinin eşzamanlı
 * kaydından biri diğerini EZİYORDU, satır bayi sayısıyla sınırsız büyüyordu ve anonimleştirilen
 * bayinin kaydı haritada kalıyordu. Artık bayi başına tek satır (`innovation_dealer_prefs_<id>`):
 * yazma tek satırlık atomik upsert, bayiler arası yarış yok, KVKK silmede anahtar ile temizlenir
 * (`lib/gdpr-core.ts#anonymizeUser`). Eski harita yalnız OKUMA yedeği (göç gerektirmez).
 */
const LEGACY_SETTINGS_KEY = 'innovationDealerPrefs';
const KEY_PREFIX = 'innovation_dealer_prefs_';

export const dealerInnovationPrefsKey = (dealerId: string) => `${KEY_PREFIX}${dealerId}`;

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

async function readLegacy(dealerId: string): Promise<unknown> {
  const row = await prisma.settings.findUnique({ where: { key: LEGACY_SETTINGS_KEY }, select: { value: true } });
  const map = row?.value;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  return (map as Record<string, unknown>)[dealerId];
}

export async function getDealerInnovationPrefs(dealerId: string): Promise<DealerInnovationPrefs> {
  const row = await prisma.settings.findUnique({
    where: { key: dealerInnovationPrefsKey(dealerId) },
    select: { value: true },
  });
  if (row) return mergePrefs(row.value);
  return mergePrefs(await readLegacy(dealerId));
}

export async function saveDealerInnovationPrefs(
  dealerId: string,
  patch: Partial<DealerInnovationPrefs>
): Promise<DealerInnovationPrefs> {
  const next = { ...(await getDealerInnovationPrefs(dealerId)), ...patch };
  const key = dealerInnovationPrefsKey(dealerId);
  await prisma.settings.upsert({
    where: { key },
    create: { key, category: 'dealer', value: next as object },
    update: { value: next as object },
  });
  return next;
}
