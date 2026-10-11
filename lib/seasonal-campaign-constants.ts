/**
 * Sezon kampanyası sabitleri — DB'siz (istemci paketine güvenle girer). Seçici ve şema
 * `lib/seasonal-campaign-live` bunları buradan yeniden dışa aktarır.
 */
export const SEASONAL_CAMPAIGN_TYPES = ['BIRTHDAY', 'ANNIVERSARY', 'SEASONAL', 'SPECIAL'] as const;
export type SeasonalCampaignType = (typeof SEASONAL_CAMPAIGN_TYPES)[number];

/** Kullanıcı kimliği gerektiren (kişiye özel) kampanya türleri. */
export const TARGETED_CAMPAIGN_TYPES: ReadonlySet<string> = new Set(['BIRTHDAY', 'ANNIVERSARY']);

/** Kampanya puan bütçesi sınırları (conditions.budgetPoints). */
export const SEASONAL_BUDGET_MIN = 100;
export const SEASONAL_BUDGET_MAX = 10_000_000;
