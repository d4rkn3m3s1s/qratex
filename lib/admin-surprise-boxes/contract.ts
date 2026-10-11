/**
 * Admin → Sürpriz kutular (Dalga 2) — istemci + sunucu ortak sözleşme (Prisma yok).
 *
 *  - Kampanya: aynı gönderimde üretilen kutular (`metadata.campaignId`). P0-19 öncesi kutularda
 *    kampanya kimliği yok; onlar "tekil" kayıt olarak kutu kimliğiyle listelenir.
 *  - Otomatik günlük kutular (dayKey dolu) kampanya listesine ve KPI'lara KARIŞMAZ; ayrı sekmede
 *    yalnız istatistik ve olasılık tablosu doğrulaması olarak görünür.
 *  - Olasılık tablosu kurallardan TÜRETİLİR (`lib/wallet-rewards/rules`): elle yazılmış yüzde yok.
 */
import { z } from 'zod';
import { DAILY_BOX_MAX_POINTS, DAILY_BOX_MIN_POINTS, boxTier } from '@/lib/wallet-rewards/rules';
import type { CosmeticRarity } from '@/lib/wallet-rewards/types';
import { SURPRISE_BOX_LIMITS } from '@/lib/admin-surprise-box';

export { SURPRISE_BOX_LIMITS };

export const CAMPAIGN_PAGE_SIZE = 20;
export const CAMPAIGN_STATUS_FILTERS = ['all', 'pending', 'opened'] as const;
export type CampaignStatusFilter = (typeof CAMPAIGN_STATUS_FILTERS)[number];

/** Bu toplam puanın üstündeki gönderimde "GÖNDER" yazarak onay istenir. */
export const TYPED_CONFIRM_POINTS = 10_000;
export const TYPED_CONFIRM_PHRASE = 'GÖNDER';

export const campaignListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().transform((v) => (v && v.length >= 2 ? v : undefined)),
  status: z.enum(CAMPAIGN_STATUS_FILTERS).catch('all').default('all'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(5).max(100).catch(CAMPAIGN_PAGE_SIZE).default(CAMPAIGN_PAGE_SIZE),
});
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;

export const campaignKeySchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{6,100}$/, 'Geçersiz kampanya kimliği') });

export const revokeSchema = z.object({
  reason: z.string().trim().min(3, 'Gerekçe en az 3 karakter olmalı').max(300, 'Gerekçe en fazla 300 karakter olabilir'),
});

export const recipientSearchSchema = z.object({
  q: z.string().trim().min(2, 'En az 2 karakter yazın').max(100),
});

export type CampaignState = 'pending' | 'partial' | 'opened' | 'revoked';

export interface CampaignListItem {
  id: string;
  title: string;
  createdAt: string;
  sender: { id: string; name: string | null } | null;
  recipients: number;
  opened: number;
  pointsPerBox: number;
  totalPoints: number;
  pendingPoints: number;
  couponCode: string | null;
  /** P0-19 öncesi, kampanya kimliği olmayan kutu. */
  legacy: boolean;
  state: CampaignState;
}

export interface CampaignListPage {
  items: CampaignListItem[];
  total: number;
  page: number;
  size: number;
}

export interface TierRow {
  tier: CosmeticRarity;
  expectedPct: number;
  observed: number;
  observedPct: number | null;
}

export interface SurpriseStats {
  moduleEnabled: boolean;
  limits: typeof SURPRISE_BOX_LIMITS;
  remainingToday: number;
  gifts: {
    campaignsMonth: number;
    boxesMonth: number;
    boxes30d: number;
    opened30d: number;
    /** 0–100, örneklem yoksa null. */
    openRate30d: number | null;
    pointsOpened30d: number;
    pendingPoints: number;
    pendingBoxes: number;
  };
  daily: {
    generated30d: number;
    opened30d: number;
    openRate30d: number | null;
    points30d: number;
    /** Son 14 İstanbul günü, eskiden yeniye. */
    series14d: Array<{ day: string; generated: number; opened: number }>;
    tiers: TierRow[];
    /** Gözlenen dağılım beklenenden anlamlı sapıyor mu (ki-kare, p < 0,01). */
    drift: { chiSquare: number; significant: boolean; sample: number } | null;
    pointsRange: { min: number; max: number };
  };
}

export interface CampaignRecipient {
  boxId: string;
  userId: string;
  name: string | null;
  email: string | null;
  openedAt: string | null;
}

export interface CampaignAuditEvent {
  id: string;
  action: string;
  at: string;
  actorName: string | null;
  summary: string | null;
}

export interface CampaignDetail {
  campaign: CampaignListItem & { message: string | null; rewardType: string | null; tier: CosmeticRarity };
  recipients: CampaignRecipient[];
  /** Açılış süresi (saat) medyanı; açılan yoksa null. */
  medianOpenHours: number | null;
  audit: CampaignAuditEvent[];
}

export interface RecipientOption {
  id: string;
  name: string | null;
  email: string;
  blocked: string | null;
}

export interface CouponOption {
  id: string;
  code: string;
  label: string;
  remaining: number | null;
  expiresAt: string | null;
}

export const TIER_LABEL: Record<CosmeticRarity, string> = {
  common: 'Yaygın',
  rare: 'Nadir',
  epic: 'Destansı',
  legendary: 'Efsanevi',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  SURPRISE_BOX_SEND: 'Gönderildi',
  SURPRISE_BOX_REVOKE: 'Açılmamış kutular geri çekildi',
};

export function campaignState(recipients: number, opened: number): CampaignState {
  if (recipients <= 0) return 'revoked';
  if (opened <= 0) return 'pending';
  if (opened >= recipients) return 'opened';
  return 'partial';
}

const TIERS: CosmeticRarity[] = ['common', 'rare', 'epic', 'legendary'];

/**
 * Günlük kutunun beklenen kademe dağılımı: puan [MIN, MAX] aralığında düzgün, kademe
 * `boxTier`'dan. Kurallar değişirse tablo kendiliğinden değişir.
 */
export function expectedDailyTiers(min = DAILY_BOX_MIN_POINTS, max = DAILY_BOX_MAX_POINTS): Record<CosmeticRarity, number> {
  const counts: Record<CosmeticRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const span = max - min + 1;
  for (let p = min; p <= max; p++) counts[boxTier({ points: p })] += 1;
  const out = { ...counts };
  for (const t of TIERS) out[t] = span > 0 ? (counts[t] / span) * 100 : 0;
  return out;
}

/** 3 serbestlik derecesi için ki-kare kritik değeri (p = 0,01). */
const CHI2_CRIT_DF3_P01 = 11.345;

/** Gözlenen kademe sayılarını beklenenle karşılaştırır (en az 50 örnek). */
export function tierTable(observed: Record<CosmeticRarity, number>, expectedPct = expectedDailyTiers()): {
  rows: TierRow[];
  drift: SurpriseStats['daily']['drift'];
} {
  const n = TIERS.reduce((a, t) => a + (observed[t] ?? 0), 0);
  const rows = TIERS.map((t) => ({
    tier: t,
    expectedPct: Math.round(expectedPct[t] * 10) / 10,
    observed: observed[t] ?? 0,
    observedPct: n > 0 ? Math.round(((observed[t] ?? 0) / n) * 1000) / 10 : null,
  }));
  if (n < 50) return { rows, drift: null };
  let chi = 0;
  for (const t of TIERS) {
    const e = (expectedPct[t] / 100) * n;
    if (e > 0) chi += ((observed[t] ?? 0) - e) ** 2 / e;
  }
  return { rows, drift: { chiSquare: Math.round(chi * 100) / 100, significant: chi > CHI2_CRIT_DF3_P01, sample: n } };
}

export function queryString(q: Partial<{ q: string; status: string; page: number; size: number }>): string {
  const sp = new URLSearchParams();
  if (q.q && q.q.trim().length >= 2) sp.set('q', q.q.trim());
  if (q.status && q.status !== 'all') sp.set('status', q.status);
  if (q.page && q.page > 1) sp.set('page', String(q.page));
  if (q.size && q.size !== CAMPAIGN_PAGE_SIZE) sp.set('size', String(q.size));
  return sp.toString();
}
