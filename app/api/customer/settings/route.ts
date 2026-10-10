import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import {
  fullPrefsForUI,
  NOTIFICATION_GROUP_KEYS,
} from '@/lib/notification-prefs';
import {
  LegacyNotificationsSchema,
  LegacyPreferencesSchema,
  readStoredSettings,
  toCustomerPreferences,
  toLegacyResponse,
  userSettingsKey,
} from '@/lib/customer-settings/preferences';
import { mergeNotificationPrefs, writeCustomerPreferences } from '@/lib/customer-settings/write.server';

export const dynamic = 'force-dynamic';

/**
 * Eski müşteri ayar ucu — GERİYE UYUM katmanı. Yeni Ayarlar yüzeyi
 * `/api/customer/me/settings/*` uçlarını kullanır; bu uç hâlâ Lig ekranının
 * "Sıralamada görün" anahtarı (`components/customer/m-lig/league-privacy.tsx`) tarafından
 * çağrılır. Mantık `lib/customer-settings` ile ortak (tek kaynak).
 *
 * Denetim düzeltmeleri: yalnız CUSTOMER (rol DB'den), `theme: 'system'` artık 400 vermez
 * (B1), yazımlar alan bazlı + kilitli transaction (B7), okuma hatası varsayılan değer
 * olarak dönmez.
 */

const channelPrefSchema = z
  .object({ app: z.boolean().optional(), email: z.boolean().optional(), push: z.boolean().optional() })
  .strict();
const notificationPrefsSchema = z
  .object(Object.fromEntries(NOTIFICATION_GROUP_KEYS.map((k) => [k, channelPrefSchema.optional()])))
  .partial()
  .strict();

const PatchBody = z
  .object({
    notifications: LegacyNotificationsSchema.optional(),
    preferences: LegacyPreferencesSchema.optional(),
    notificationPrefs: notificationPrefsSchema.optional(),
  })
  .strict();

export const GET = defineRoute(
  { name: 'customer.settings.legacy.get', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    const [row, u] = await Promise.all([
      prisma.settings.findUnique({ where: { key: userSettingsKey(user.id) }, select: { value: true } }),
      prisma.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true, preferredLanguage: true } }),
    ]);
    const stored = readStoredSettings(row?.value ?? null);
    const prefs = toCustomerPreferences(stored, u?.preferredLanguage);
    return ok({ ...toLegacyResponse(stored, prefs), notificationPrefs: fullPrefsForUI(u?.notificationPrefs ?? null) });
  },
);

export const PATCH = defineRoute(
  { name: 'customer.settings.legacy.patch', roles: ['CUSTOMER'], schema: PatchBody, rateLimit: 'mutation' },
  async ({ user, body }) => {
    const { stored, preferences } = await writeCustomerPreferences(user.id, {
      preferences: body.preferences,
      notifications: body.notifications,
    });
    const merged = body.notificationPrefs ? await mergeNotificationPrefs(user.id, body.notificationPrefs) : null;
    return ok({
      ...toLegacyResponse(stored, preferences),
      ...(merged ? { notificationPrefs: fullPrefsForUI(merged) } : {}),
      message: 'Ayarlar güncellendi',
    });
  },
);
