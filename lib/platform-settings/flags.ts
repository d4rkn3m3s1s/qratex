/**
 * Platform bayraklarının SUNUCU okuyucuları (kayıt defterindeki `readers`).
 * Her biri hata durumunda kayıt defterindeki varsayılana düşer (DB erişilemezken kimlik
 * akışları çökmez; varsayılanlar "her şey açık, bakım kapalı").
 */
import { prisma } from '@/lib/prisma';
import {
  SETTINGS_KEYS,
  parsePlatformSetting,
  type MaintenanceState,
  type PlatformSettingKey,
  type PlatformSettingValues,
} from '@/lib/platform-settings/registry';

async function readFlag<K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValues[K]> {
  try {
    const row = await prisma.settings.findUnique({ where: { key }, select: { value: true } });
    return parsePlatformSetting(key, row?.value);
  } catch {
    return parsePlatformSetting(key, undefined);
  }
}

/** Yeni kayıtlar açık mı (e-posta kaydı + OAuth ile ilk hesap). */
export function isRegistrationOpen(): Promise<boolean> {
  return readFlag(SETTINGS_KEYS.registrationOpen);
}

/** Google ile giriş yönetici tarafından açık mı (ortam değişkenleri ayrıca gerekir). */
export function isGoogleSignInEnabled(): Promise<boolean> {
  return readFlag(SETTINGS_KEYS.googleAuth);
}

/** Bakım durumu (bakım sayfası metni için). */
export function getMaintenanceState(): Promise<MaintenanceState> {
  return readFlag(SETTINGS_KEYS.maintenance);
}
