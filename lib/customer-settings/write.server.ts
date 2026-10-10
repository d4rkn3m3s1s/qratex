/**
 * Ayarlar yazma yolları — her yazım tek transaction + kaynağa özel advisory kilit
 * (read-merge-write yarışında kayıp güncelleme yok; denetim B7). Alan bazlı: yalnız
 * gönderilen alan değişir.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lockResource } from '@/lib/settings-version';
import { sanitizeNotificationPrefs, type NotificationChannel, type NotificationPrefs } from '@/lib/notification-prefs';
import type { CustomerPreferences } from './contract';
import {
  applyLegacyNotificationsPatch,
  applyPreferencesPatch,
  readStoredSettings,
  serializeStoredSettings,
  toCustomerPreferences,
  userSettingsKey,
  type StoredUserSettings,
} from './preferences';

type Tx = Prisma.TransactionClient;

async function mutateStoredSettings(
  tx: Tx,
  userId: string,
  mutate: (stored: StoredUserSettings) => StoredUserSettings,
): Promise<StoredUserSettings> {
  const key = userSettingsKey(userId);
  await lockResource(tx, `user-settings:${userId}`);
  const row = await tx.settings.findUnique({ where: { key }, select: { value: true } });
  const next = mutate(readStoredSettings(row?.value ?? null));
  const value = serializeStoredSettings(next) as Prisma.InputJsonValue;
  await tx.settings.upsert({
    where: { key },
    update: { value },
    create: { key, value, category: 'user' },
  });
  return next;
}

export interface PreferencesWriteInput {
  preferences?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
}

/**
 * Tercih + eski bildirim anahtarlarını yazar; `language` gelirse `User.preferredLanguage`
 * de aynı transaction'da güncellenir (e-posta dili ve oturum dili bunu okur).
 */
export async function writeCustomerPreferences(userId: string, input: PreferencesWriteInput): Promise<{
  stored: StoredUserSettings;
  preferences: CustomerPreferences;
}> {
  return prisma.$transaction(async (tx) => {
    const stored = await mutateStoredSettings(tx, userId, (s) => {
      let next = s;
      if (input.preferences) next = applyPreferencesPatch(next, input.preferences);
      if (input.notifications) next = applyLegacyNotificationsPatch(next, input.notifications);
      return next;
    });
    const language = input.preferences?.language;
    let preferredLanguage: string | null = null;
    if (language === 'tr' || language === 'en') {
      await tx.user.update({ where: { id: userId }, data: { preferredLanguage: language }, select: { id: true } });
      preferredLanguage = language;
    } else {
      const u = await tx.user.findUnique({ where: { id: userId }, select: { preferredLanguage: true } });
      preferredLanguage = u?.preferredLanguage ?? null;
    }
    return { stored, preferences: toCustomerPreferences(stored, preferredLanguage) };
  });
}

/** `User.notificationPrefs` içinde tek grup × kanal hücresini yazar (birleştirerek). */
export async function writeNotificationPrefCell(
  userId: string,
  group: string,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<NotificationPrefs> {
  return prisma.$transaction(async (tx) => {
    await lockResource(tx, `notification-prefs:${userId}`);
    const row = await tx.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    const current = sanitizeNotificationPrefs(row?.notificationPrefs ?? {});
    const merged: NotificationPrefs = { ...current, [group]: { ...(current[group] ?? {}), [channel]: enabled } };
    await tx.user.update({
      where: { id: userId },
      data: { notificationPrefs: merged as Prisma.InputJsonObject },
      select: { id: true },
    });
    return merged;
  });
}

/** Grup bazlı çoklu birleştirme (eski `/api/customer/settings` gövdesi). */
export async function mergeNotificationPrefs(userId: string, incoming: NotificationPrefs): Promise<NotificationPrefs> {
  return prisma.$transaction(async (tx) => {
    await lockResource(tx, `notification-prefs:${userId}`);
    const row = await tx.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    const merged: NotificationPrefs = { ...sanitizeNotificationPrefs(row?.notificationPrefs ?? {}) };
    for (const [group, entry] of Object.entries(sanitizeNotificationPrefs(incoming))) {
      if (entry) merged[group] = { ...(merged[group] ?? {}), ...entry };
    }
    await tx.user.update({
      where: { id: userId },
      data: { notificationPrefs: merged as Prisma.InputJsonObject },
      select: { id: true },
    });
    return merged;
  });
}

/** Eski Settings anahtarı: işletme yanıtı e-postası. */
export async function writeReplyEmail(userId: string, enabled: boolean): Promise<void> {
  await prisma.$transaction((tx) =>
    mutateStoredSettings(tx, userId, (s) => applyLegacyNotificationsPatch(s, { emailReply: enabled })),
  );
}
