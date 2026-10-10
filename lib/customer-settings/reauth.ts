/**
 * Hassas işlem için yeniden kimlik doğrulama kararı (denetim B4) — saf.
 *
 * Hesap silme gibi geri dönüşsüz işlemler açık bir oturuma erişmiş herkesin yapabileceği
 * işlemler olmamalı:
 *  - şifresi olan hesap → mevcut şifre,
 *  - 2FA açık hesap → authenticator kodu (şifreye EK),
 *  - ikisi de yoksa (yalnız Google) → oturum son `RECENT_LOGIN_WINDOW_MS` içinde açılmış olmalı;
 *    değilse kullanıcı çıkış yapıp yeniden girer (sağlayıcı yeniden doğrular).
 */
import type { ReauthMethod } from './contract';

export const RECENT_LOGIN_WINDOW_MS = 10 * 60_000;

export function requiredReauthMethods(user: { hasPassword: boolean; twoFactorEnabled: boolean }): ReauthMethod[] {
  const methods: ReauthMethod[] = [];
  if (user.hasPassword) methods.push('password');
  if (user.twoFactorEnabled) methods.push('totp');
  if (methods.length === 0) methods.push('recent-login');
  return methods;
}

export function isRecentLogin(sessionStartedAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!sessionStartedAt) return false;
  const age = now.getTime() - sessionStartedAt.getTime();
  return age >= 0 && age <= RECENT_LOGIN_WINDOW_MS;
}
