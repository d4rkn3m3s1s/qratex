/**
 * Ödül formu modeli — saf (React yok), jest ile test edilir.
 * Sunucu şeması: `createRewardSchema` (lib/validations.ts).
 */
import { createRewardSchema } from '@/lib/validations';

export const REWARD_TYPE_LABELS = {
  physical: 'Fiziksel',
  digital: 'Dijital',
  coupon: 'Kupon',
} as const;

export type RewardType = keyof typeof REWARD_TYPE_LABELS;

export function isRewardType(v: unknown): v is RewardType {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REWARD_TYPE_LABELS, v);
}

/** Sayısal alanlar metin: alan temizlenebilir, "-1" yazarken ara durum "-" korunur. */
export type RewardFormValues = {
  name: string;
  description: string;
  icon: string;
  cost: string;
  stock: string;
  type: RewardType;
  isActive: boolean;
};

export const initialRewardForm: RewardFormValues = {
  name: '',
  description: '',
  icon: '🎁',
  cost: '500',
  stock: '100',
  type: 'digital',
  isActive: true,
};

/**
 * İkon bir görsel mi (kök-göreli yol ya da http(s) URL)? R2'ye yüklenen görseller
 * (P0-39) mutlak `https://…` adres döner; eskiden yalnız `/` kontrol edildiği için
 * bunlar emoji gibi metin olarak basılırdı.
 */
export function isImageIcon(icon: unknown): icon is string {
  if (typeof icon !== 'string') return false;
  const s = icon.trim();
  if (s.startsWith('/') && !s.startsWith('//')) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export type RewardApiPayload = {
  name: string;
  description: string;
  icon: string;
  cost: number;
  stock: number;
  type: RewardType;
  isActive: boolean;
};

export function toRewardPayload(f: RewardFormValues): RewardApiPayload {
  const cost = Number.parseInt(f.cost, 10);
  const stock = Number.parseInt(f.stock, 10);
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    icon: f.icon.trim() || '🎁',
    cost: Number.isFinite(cost) ? cost : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    type: f.type,
    isActive: f.isActive,
  };
}

export function validateRewardPayload(p: RewardApiPayload): string | null {
  const parsed = createRewardSchema.safeParse(p);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message || 'Ödül bilgileri geçersiz';
}

type RewardLike = {
  name: string;
  description: string;
  icon?: string | null;
  cost?: number | null;
  stock: number;
  type?: string | null;
  isActive: boolean;
};

export function rewardToFormValues(r: RewardLike): RewardFormValues {
  return {
    name: r.name ?? '',
    description: r.description ?? '',
    icon: r.icon || '🎁',
    cost: String(typeof r.cost === 'number' && r.cost > 0 ? r.cost : 500),
    stock: String(Number.isFinite(r.stock) ? r.stock : 0),
    type: isRewardType(r.type) ? r.type : 'digital',
    isActive: r.isActive,
  };
}
