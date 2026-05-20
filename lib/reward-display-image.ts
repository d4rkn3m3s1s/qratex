/**
 * Canonical storefront art for known rewards.
 * Overrides legacy seed URLs (wrong/mismatched SVGs) so the customer rewards UI stays consistent.
 */
export const REWARD_DISPLAY_IMAGE_BY_ID: Record<string, string> = {
  'reward-coffee-coupon': '/images/rewards/reward-coffee.webp',
  'reward-discount-10': '/images/rewards/reward-discount.webp',
  'reward-vip-badge': '/images/rewards/reward-vip.webp',
  'reward-donut': '/images/rewards/reward-donut.webp',
};

export function resolveRewardDisplayImage(input: {
  id: string;
  icon?: string | null;
  image?: string | null;
}): string | null {
  const canonical = REWARD_DISPLAY_IMAGE_BY_ID[input.id];
  if (canonical) return canonical;

  const raw = input.image ?? input.icon;
  if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim();
    // next/image requires valid URL or relative path
    const isValidPath = trimmed.startsWith('/') || trimmed.startsWith('http') || trimmed.startsWith('data:');
    return isValidPath ? trimmed : null;
  }
  return null;
}
