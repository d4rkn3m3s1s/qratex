import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const defaultSettings = {
  notifications: {
    emailBadge: true,
    emailQuest: true,
    emailReward: true,
    pushBadge: true,
    pushQuest: true,
    pushReward: true,
  },
  preferences: {
    language: 'tr',
    theme: 'dark',
    showProfile: true,
    showLeaderboard: true,
  },
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const settingsKey = `user_settings_${userId}`;

    // Get user settings from Settings model
    const settings = await prisma.settings.findUnique({
      where: { key: settingsKey },
    });

    if (!settings) {
      return NextResponse.json({
        success: true,
        data: defaultSettings,
      });
    }

    const savedSettings = settings.value as typeof defaultSettings;

    return NextResponse.json({
      success: true,
      data: {
        notifications: savedSettings.notifications || defaultSettings.notifications,
        preferences: savedSettings.preferences || defaultSettings.preferences,
      },
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Ayarlar yüklenemedi' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const settingsKey = `user_settings_${userId}`;
    const body = await request.json();
    const { notifications, preferences } = body;

    // Get existing settings
    const existing = await prisma.settings.findUnique({
      where: { key: settingsKey },
    });

    const existingValue = (existing?.value as typeof defaultSettings) || defaultSettings;

    // Merge new settings with existing
    const newValue = {
      notifications: notifications || existingValue.notifications,
      preferences: preferences || existingValue.preferences,
    };

    // Upsert settings
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

    return NextResponse.json({
      success: true,
      data: settings.value,
      message: 'Ayarlar güncellendi',
    });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { success: false, error: 'Ayarlar güncellenemedi' },
      { status: 500 }
    );
  }
}

