import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import {
  fullPrefsForUI,
  sanitizeNotificationPrefs,
  NOTIFICATION_GROUP_KEYS,
  type NotificationPrefs,
} from '@/lib/notification-prefs';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const defaultSettings = {
  notifications: {
    emailBadge: true,
    emailQuest: true,
    emailReward: true,
    emailReply: true,
    pushBadge: true,
    pushQuest: true,
    pushReward: true,
  },
  preferences: {
    language: 'tr',
    theme: 'dark',
    showProfile: true,
    showLeaderboard: true,
    highContrast: false,
    reduceAnimations: false,
    colorblindMode: false,
  },
} as const;

const notificationsPatchSchema = z
  .object({
    emailBadge: z.boolean().optional(),
    emailQuest: z.boolean().optional(),
    emailReward: z.boolean().optional(),
    emailReply: z.boolean().optional(),
    pushBadge: z.boolean().optional(),
    pushQuest: z.boolean().optional(),
    pushReward: z.boolean().optional(),
  })
  .strict();

const preferencesPatchSchema = z
  .object({
    language: z.enum(['tr', 'en']).optional(),
    theme: z.enum(['dark', 'light']).optional(),
    showProfile: z.boolean().optional(),
    showLeaderboard: z.boolean().optional(),
    // Erişilebilirlik (önceden şemada yoktu → strict mod bunları reddedip kalıcı
    // olmalarını engelliyordu; renk körü modu + diğer ikisi artık kaydedilir).
    highContrast: z.boolean().optional(),
    reduceAnimations: z.boolean().optional(),
    colorblindMode: z.boolean().optional(),
  })
  .strict();

// Tür bazında bildirim tercihleri (tür × kanal). Her grup için app/email/push boolean.
// Yalnızca bilinen gruplar kabul edilir; geçersiz gruplar/kanallar sanitize ile atılır.
const channelPrefSchema = z
  .object({ app: z.boolean().optional(), email: z.boolean().optional(), push: z.boolean().optional() })
  .strict();
const notificationPrefsSchema = z
  .object(
    Object.fromEntries(
      NOTIFICATION_GROUP_KEYS.map((k) => [k, channelPrefSchema.optional()]),
    ),
  )
  .partial()
  .strict();

const patchBodySchema = z
  .object({
    notifications: notificationsPatchSchema.optional(),
    preferences: preferencesPatchSchema.optional(),
    notificationPrefs: notificationPrefsSchema.optional(),
  })
  .strict();

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const userId = session.user.id;
    const settingsKey = `user_settings_${userId}`;

    // Bildirim tercihleri (tür × kanal) User.notificationPrefs'te saklanır → ayrıca çek.
    const [settings, user] = await Promise.all([
      prisma.settings.findUnique({ where: { key: settingsKey } }),
      prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } }),
    ]);

    // UI her grup için app+email dolu (eksikler AÇIK) tam tablo bekler.
    const notificationPrefs = fullPrefsForUI(user?.notificationPrefs ?? null);

    if (!settings) {
      return NextResponse.json(
        {
          success: true,
          data: { ...defaultSettings, notificationPrefs },
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const raw = settings.value as Record<string, unknown> | null;
    const notifParsed = notificationsPatchSchema.safeParse(raw?.notifications ?? {});
    const prefParsed = preferencesPatchSchema.safeParse(raw?.preferences ?? {});

    return NextResponse.json(
      {
        success: true,
        data: {
          notifications: {
            ...defaultSettings.notifications,
            ...(notifParsed.success ? notifParsed.data : {}),
          },
          preferences: {
            ...defaultSettings.preferences,
            ...(prefParsed.success ? prefParsed.data : {}),
          },
          notificationPrefs,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Settings fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Ayarlar yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const userId = session.user.id;
    const settingsKey = `user_settings_${userId}`;
    const body = await request.json().catch(() => ({}));
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Geçersiz ayar gövdesi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const existing = await prisma.settings.findUnique({
      where: { key: settingsKey },
    });

    const existingRaw = (existing?.value as Record<string, unknown> | undefined) ?? {};
    const baseNotif = notificationsPatchSchema.safeParse(existingRaw.notifications ?? {});
    const basePref = preferencesPatchSchema.safeParse(existingRaw.preferences ?? {});

    const mergedNotifications = {
      ...defaultSettings.notifications,
      ...(baseNotif.success ? baseNotif.data : {}),
      ...(parsed.data.notifications ?? {}),
    };
    const mergedPreferences = {
      ...defaultSettings.preferences,
      ...(basePref.success ? basePref.data : {}),
      ...(parsed.data.preferences ?? {}),
    };

    const newValue = {
      notifications: mergedNotifications,
      preferences: mergedPreferences,
    };

    const settings = await prisma.settings.upsert({
      where: { key: settingsKey },
      update: {
        value: newValue,
      },
      create: {
        key: settingsKey,
        value: newValue,
        category: 'user',
      },
    });

    if (parsed.data.preferences?.language) {
      await prisma.user.updateMany({
        where: { id: userId },
        data: { preferredLanguage: parsed.data.preferences.language },
      });
    }

    // Bildirim tercihleri (tür × kanal) → User.notificationPrefs. Mevcutla BİRLEŞTİR
    // (kısmi güncelleme desteklenir) ve sanitize et (geçersiz grup/kanal atılır).
    let notificationPrefsOut: Record<string, { app: boolean; email: boolean }> | undefined;
    if (parsed.data.notificationPrefs) {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { notificationPrefs: true },
      });
      const existingPrefs = sanitizeNotificationPrefs(current?.notificationPrefs ?? {});
      const incoming = sanitizeNotificationPrefs(parsed.data.notificationPrefs);
      // Grup bazında sığ birleştirme: gelen grup, mevcut grubun üstüne yazılır.
      const merged: NotificationPrefs = { ...existingPrefs };
      for (const [group, entry] of Object.entries(incoming)) {
        if (entry) merged[group] = { ...(merged[group] ?? {}), ...entry };
      }
      await prisma.user.updateMany({
        where: { id: userId },
        // sanitize çıktısı undefined değer üretmez → Prisma Json girişi için güvenli cast.
        data: { notificationPrefs: merged as object },
      });
      notificationPrefsOut = fullPrefsForUI(merged);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...(settings.value as Record<string, unknown>),
          ...(notificationPrefsOut ? { notificationPrefs: notificationPrefsOut } : {}),
        },
        message: 'Ayarlar güncellendi',
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Settings update error:', error);
    return NextResponse.json(
      { success: false, error: 'Ayarlar güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
