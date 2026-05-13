/**
 * Public notification payload for GET /api/notifications.
 * Strips internal DB fields and JSON keys not intended for the client.
 */

import { clampTakeParam } from '@/lib/api-http';

const NOTIFICATION_DATA_PUBLIC_KEYS = new Set<string>([
  'type',
  'reviewId',
  'consumptionId',
  'consumptionReviewId',
  'feedbackId',
  'remedyOfferId',
  'rating',
  'pointsEarned',
  'xpEarned',
  'points',
  'xp',
  'prizeId',
  'prizeType',
  'prizeValue',
  'prizeLabel',
  'spinDate',
  'dailyLimit',
  'badgeId',
  'badgeName',
  'badgeIcon',
  'rewardId',
  'rewardName',
  'couponCode',
  'cost',
  'code',
  'questId',
  'questName',
  'module',
  'nudgeType',
  'ctaPath',
  'cta',
  'bonusAmount',
]);

export const NOTIFICATION_LIST_DEFAULT_LIMIT = 10;
export const NOTIFICATION_LIST_MAX_LIMIT = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeNotificationData(data: unknown): Record<string, string | number | boolean | null> | undefined {
  if (data == null) return undefined;
  if (!isPlainObject(data)) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of NOTIFICATION_DATA_PUBLIC_KEYS) {
    if (!(key in data)) continue;
    const v = data[key];
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type NotificationDbRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  data: unknown;
  createdAt: Date;
};

export type PublicNotificationDto = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, string | number | boolean | null>;
};

export function toPublicNotification(row: NotificationDbRow): PublicNotificationDto {
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  const data = sanitizeNotificationData(row.data);
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    isRead: row.isRead,
    createdAt,
    ...(data ? { data } : {}),
  };
}

export function clampNotificationListLimit(raw: string | null): number {
  return clampTakeParam(raw, NOTIFICATION_LIST_DEFAULT_LIMIT, NOTIFICATION_LIST_MAX_LIMIT);
}
