/**
 * Sunucu tarafı kod ve rastgelelik üretimi (node `crypto`; istemci bundle'ına girmez).
 */
import { randomBytes, randomInt } from 'crypto';
import { DAILY_BOX_MAX_POINTS, DAILY_BOX_MIN_POINTS, rewardKind } from './rules';
import type { RewardKind } from './types';

const CODE_PREFIX: Record<RewardKind, string> = { coupon: 'KPN', digital: 'DJT', physical: 'ODL', other: 'ODL' };

/** Benzersiz ödül kodu: tür öneki + 8 hex + zaman parçası (UserReward.code @unique son savunma). */
export function generateRewardCode(type: unknown, now: Date = new Date()): string {
  const prefix = CODE_PREFIX[rewardKind(type)];
  const random = randomBytes(4).toString('hex').toUpperCase();
  const stamp = now.getTime().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${random}-${stamp}`;
}

/** Günlük kutu puanı — kriptografik rastgele (test için `rand` enjekte edilebilir). */
export function dailyBoxPoints(rand: (min: number, maxExclusive: number) => number = randomInt): number {
  return rand(DAILY_BOX_MIN_POINTS, DAILY_BOX_MAX_POINTS + 1);
}
