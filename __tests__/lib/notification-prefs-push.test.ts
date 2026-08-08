/**
 * Bildirim tercihleri 'push' kanalı: app/email ile aynı fail-open mantığı, geriye dönük
 * uyumlu. Yeni kanal, mevcut kullanıcıların prefs'inde yokken AÇIK sayılmalı (aksi halde
 * push sessizce hiç gitmez); açıkça false ise KAPALI olmalı.
 */
import {
  isChannelEnabled,
  isValidChannel,
  sanitizeNotificationPrefs,
  fullPrefsForUI,
  NOTIFICATION_CHANNELS,
} from '@/lib/notification-prefs';

describe("notification-prefs — 'push' kanalı", () => {
  it("push geçerli bir kanaldır", () => {
    expect(isValidChannel('push')).toBe(true);
    expect(NOTIFICATION_CHANNELS).toContain('push');
  });

  it("prefs yoksa push AÇIK (fail-open, geriye dönük uyum)", () => {
    expect(isChannelEnabled(null, 'character', 'push')).toBe(true);
    expect(isChannelEnabled({}, 'team', 'push')).toBe(true);
  });

  it("push açıkça false ise KAPALI", () => {
    const prefs = { character: { push: false } };
    expect(isChannelEnabled(prefs, 'character', 'push')).toBe(false);
    // app/email etkilenmez (bağımsız kanal)
    expect(isChannelEnabled(prefs, 'character', 'app')).toBe(true);
    expect(isChannelEnabled(prefs, 'character', 'email')).toBe(true);
  });

  it("push açıkça true ise AÇIK", () => {
    expect(isChannelEnabled({ team: { push: true } }, 'team', 'push')).toBe(true);
  });

  it("app kapalı olsa bile push bağımsızdır", () => {
    const prefs = { campaign: { app: false, push: true } };
    expect(isChannelEnabled(prefs, 'campaign', 'app')).toBe(false);
    expect(isChannelEnabled(prefs, 'campaign', 'push')).toBe(true);
  });

  it("sanitizeNotificationPrefs push boolean'ı korur, çöpü atar", () => {
    const clean = sanitizeNotificationPrefs({ character: { push: false, app: true }, team: { push: 'x' } });
    expect(clean.character?.push).toBe(false);
    expect(clean.character?.app).toBe(true);
    expect(clean.team?.push).toBeUndefined(); // 'x' boolean değil → atıldı
  });

  it("fullPrefsForUI her grup için push alanı döndürür", () => {
    const ui = fullPrefsForUI({ character: { push: false } });
    expect(ui.character.push).toBe(false);
    expect(ui.character.app).toBe(true); // dokunulmamış → açık
    // diğer gruplar varsayılan açık
    expect(ui.team.push).toBe(true);
  });
});
