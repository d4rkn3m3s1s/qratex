/**
 * Ayarlar yüzeyinin saf kuralları (lib/customer-settings):
 *  - tercih okuma/yazma alan bazlı, bilinmeyen anahtarlar korunur, tüketicisiz alanlar yazılmaz (B1, B7)
 *  - bildirim kataloğu yalnız gerçekten uygulanan hücreleri yazdırır (B2)
 *  - avatar izin listesi (B3), yeniden doğrulama kararı (B4), eski sekme takma adları
 */
import {
  applyLegacyNotificationsPatch,
  applyPreferencesPatch,
  isReplyEmailEnabled,
  LegacyPreferencesSchema,
  PreferencesPatchSchema,
  readStoredSettings,
  serializeStoredSettings,
  toCustomerPreferences,
  toLegacyResponse,
} from '@/lib/customer-settings/preferences';
import { CUSTOMER_NOTIFICATION_CATALOG, findWritableCell, visibleCatalog } from '@/lib/customer-settings/notification-catalog';
import { isAllowedCustomerAvatar } from '@/lib/customer-settings/avatar-policy';
import { isRecentLogin, requiredReauthMethods, RECENT_LOGIN_WINDOW_MS } from '@/lib/customer-settings/reauth';
import { deviceLabel } from '@/lib/customer-settings/device-label';
import { resolveSettingsSection } from '@/lib/customer-settings/contract';
import { avatarList } from '@/lib/avatar-options';
import { kindToGroup } from '@/lib/notification-prefs';

describe('tercihler (Settings user_settings_<id>)', () => {
  it('bozuk/eksik saklı değer varsayılanlarla okunur, bilinmeyen üst anahtarlar korunur', () => {
    const stored = readStoredSettings({ preferences: { showLeaderboard: 'evet', textScale: 'dev' }, legacyThing: 1, notifications: { emailReply: false, x: 'y' } });
    const prefs = toCustomerPreferences(stored, null);
    expect(prefs).toMatchObject({ language: 'tr', showLeaderboard: true, a11y: { textScale: 'default', highContrast: false }, a11yStored: true });
    expect(isReplyEmailEnabled(stored)).toBe(false);
    expect(serializeStoredSettings(stored)).toMatchObject({ legacyThing: 1 });
    expect(stored.notifications).toEqual({ emailReply: false });
  });

  it('dil kaynağı User.preferredLanguage (yoksa Settings)', () => {
    expect(toCustomerPreferences(readStoredSettings({ preferences: { language: 'en' } }), null).language).toBe('en');
    expect(toCustomerPreferences(readStoredSettings({ preferences: { language: 'en' } }), 'tr').language).toBe('tr');
  });

  it('yama alan bazlı: yalnız gönderilen alan değişir; tema/showProfile temizlenir', () => {
    const base = readStoredSettings({ preferences: { showLeaderboard: false, highContrast: true, theme: 'dark', showProfile: false } });
    const next = applyPreferencesPatch(base, { textScale: 'xl' });
    expect(next.preferences).toEqual({ showLeaderboard: false, highContrast: true, textScale: 'xl' });
  });

  it('eski bildirim anahtarları yalnız boolean yazar', () => {
    const next = applyLegacyNotificationsPatch(readStoredSettings(null), { emailReply: false, bogus: true, emailBadge: 'x' });
    expect(next.notifications).toEqual({ emailReply: false });
  });

  it('B1: eski şema "system" temasını kabul eder (400 yok); yeni şema bilinmeyen alanı reddeder', () => {
    expect(LegacyPreferencesSchema.safeParse({ theme: 'system', language: 'en' }).success).toBe(true);
    expect(PreferencesPatchSchema.safeParse({ theme: 'dark' }).success).toBe(false);
    expect(PreferencesPatchSchema.safeParse({}).success).toBe(false);
    expect(PreferencesPatchSchema.safeParse({ textScale: 'lg' }).success).toBe(true);
  });

  it('eski GET şekli korunur (m-lig showLeaderboard okur)', () => {
    const stored = readStoredSettings({ preferences: { showLeaderboard: false } });
    const out = toLegacyResponse(stored, toCustomerPreferences(stored, 'tr'));
    expect(out.preferences.showLeaderboard).toBe(false);
    expect(out.notifications.emailReply).toBe(true);
  });
});

describe('bildirim kataloğu (B2: yalnız uygulanan hücreler)', () => {
  it('sahte hücreler yazılamaz', () => {
    expect(findWritableCell('character', 'push', false)).toBeNull();
    expect(findWritableCell('campaign', 'email', false)).toBeNull();
    expect(findWritableCell('reminder', 'push', false)).toBeNull();
    expect(findWritableCell('emailQuest', 'email', false)).toBeNull();
  });

  it('gerçek hücreler yazılabilir; ekip satırı yalnız ekip üyesine', () => {
    expect(findWritableCell('campaign', 'push', false)?.storage).toBe('prefs');
    expect(findWritableCell('reply', 'email', false)?.storage).toBe('legacy-reply');
    expect(findWritableCell('team', 'app', false)).toBeNull();
    expect(findWritableCell('team', 'app', true)?.key).toBe('team');
    expect(visibleCatalog(false).map((r) => r.key)).not.toContain('team');
  });

  it('prefs saklamalı her satır anahtarı bildirim grubu ve tür eşlemesiyle uyumlu', () => {
    for (const row of CUSTOMER_NOTIFICATION_CATALOG.filter((r) => r.storage === 'prefs')) {
      expect(['campaign', 'character', 'reminder', 'team']).toContain(row.key);
    }
    // Gönderenlerin yazdığı türler doğru gruba düşer.
    expect(kindToGroup('surprise-badge')).toBe('campaign');
    expect(kindToGroup('reminder-inactive-feedback')).toBe('reminder');
    expect(kindToGroup('reminder-missing-comment')).toBe('reminder');
  });
});

describe('avatar izin listesi (B3)', () => {
  const customerAvatar = avatarList.find((c) => c.category !== 'Bayi')!.items[0];
  const dealerAvatar = avatarList.find((c) => c.category === 'Bayi')!.items[0];
  it('hazır müşteri avatarı ve mevcut görsel izinli; keyfi URL ve bayi avatarı değil', () => {
    expect(isAllowedCustomerAvatar(customerAvatar, null)).toBe(true);
    expect(isAllowedCustomerAvatar('https://lh3.googleusercontent.com/a/x', 'https://lh3.googleusercontent.com/a/x')).toBe(true);
    expect(isAllowedCustomerAvatar('https://saldirgan.example/p.gif', null)).toBe(false);
    expect(isAllowedCustomerAvatar(dealerAvatar, null)).toBe(false);
    expect(isAllowedCustomerAvatar('', 'x')).toBe(false);
  });
});

describe('yeniden doğrulama (B4)', () => {
  it('şifre + 2FA; ikisi yoksa taze giriş', () => {
    expect(requiredReauthMethods({ hasPassword: true, twoFactorEnabled: false })).toEqual(['password']);
    expect(requiredReauthMethods({ hasPassword: true, twoFactorEnabled: true })).toEqual(['password', 'totp']);
    expect(requiredReauthMethods({ hasPassword: false, twoFactorEnabled: true })).toEqual(['totp']);
    expect(requiredReauthMethods({ hasPassword: false, twoFactorEnabled: false })).toEqual(['recent-login']);
  });

  it('taze giriş penceresi', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(isRecentLogin(new Date(now.getTime() - 60_000), now)).toBe(true);
    expect(isRecentLogin(new Date(now.getTime() - RECENT_LOGIN_WINDOW_MS - 1), now)).toBe(false);
    expect(isRecentLogin(null, now)).toBe(false);
  });
});

describe('yardımcılar', () => {
  it('cihaz etiketi', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36')).toBe('Chrome · Android');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36 Edg/128.0')).toBe('Edge · Windows');
    expect(deviceLabel(null)).toBeNull();
  });

  it('eski sekme adları', () => {
    expect(resolveSettingsSection('preferences')).toBe('appearance');
    expect(resolveSettingsSection('cosmetics')).toBe('profile');
    expect(resolveSettingsSection('privacy')).toBe('privacy');
    expect(resolveSettingsSection('nope')).toBeNull();
  });
});
