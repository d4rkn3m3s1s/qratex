/**
 * TÜR BAZINDA BİLDİRİM TERCİHLERİ (tür × kanal).
 *
 * Kullanıcı her bildirim TÜRÜNÜ (grup) hem "Uygulama içi" (app) hem "E-posta"
 * (email) kanalında ayrı ayrı açıp kapatabilir. Tercihler User.notificationPrefs
 * (Json) alanında saklanır; şekli: `{ [group]: { app?: boolean; email?: boolean } }`.
 *
 * ÖNEMLİ: Bu dosya CLIENT-SAFE'dir — prisma/DB IMPORT ETMEZ. Hem ayar UI'si (client)
 * hem sunucu (gönderim kontrolü) aynı grup tanımlarını ve saf yardımcıları kullanır.
 * Sunucu tarafı DB helper'ları AYRI dosyadadır (lib/notify-prefs-server.ts).
 *
 * VARSAYILAN: prefs yoksa/boşsa ya da ilgili alan tanımsızsa → AÇIK (true) sayılır.
 * Böylece mevcut çalışan bildirimler bozulmaz (yeni alan geriye dönük uyumludur).
 */

/** Bir bildirim kanalı: uygulama içi zil (app), e-posta (email) veya tarayıcı push. */
export type NotificationChannel = 'app' | 'email' | 'push';

/** Tercih JSON'unun tip şekli (User.notificationPrefs). Tüm alanlar opsiyonel. */
export type NotificationPrefs = {
  [group: string]: { app?: boolean; email?: boolean; push?: boolean } | undefined;
};

/** Bir bildirim TÜR GRUBUNUN tanımı (UI + eşleme için). */
export interface NotificationGroupDef {
  /** Stabil anahtar (JSON'da ve data.kind eşlemesinde kullanılır) — asla değiştirme. */
  key: string;
  /** Kullanıcıya gösterilen ad. */
  label: string;
  /** Ayar ekranındaki açıklama alt metni. */
  description: string;
}

/**
 * TÜR GRUPLARI — ayar ekranı bu listeden 2 toggle (app/email) üretir.
 * Yeni bir bildirim türü eklerken: buraya bir grup ekle + kindToGroup'ta eşle.
 */
export const NOTIFICATION_GROUPS: NotificationGroupDef[] = [
  {
    key: 'character',
    label: 'Karakter Rozeti',
    description: 'Gizemli küren dolup yeni bir karakter hazır olduğunda haber ver.',
  },
  {
    key: 'team',
    label: 'Ekip & Görevler',
    description: 'Görev atama, onay, yorumda etiketlenme ve ekip hareketleri.',
  },
  {
    key: 'campaign',
    label: 'Kampanya & Sürprizler',
    description: 'Kampanyalar, sürpriz kutular, sezonluk etkinlikler ve fırsatlar.',
  },
  {
    key: 'reminder',
    label: 'Hatırlatmalar',
    description: 'Bitiş tarihi, yaklaşan görev ve dönemsel hatırlatmalar.',
  },
];

/** Geçerli grup anahtarları kümesi (API doğrulaması için). */
export const NOTIFICATION_GROUP_KEYS: string[] = NOTIFICATION_GROUPS.map((g) => g.key);

/** Geçerli kanallar. */
export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['app', 'email', 'push'];

/** Bir grup anahtarı geçerli mi? */
export function isValidGroup(group: string): boolean {
  return NOTIFICATION_GROUP_KEYS.includes(group);
}

/** Bir kanal geçerli mi? */
export function isValidChannel(channel: string): channel is NotificationChannel {
  return channel === 'app' || channel === 'email' || channel === 'push';
}

/**
 * Bir bildirimin `data.kind` değerini TÜR GRUBUNA eşler.
 *   • team-task-*  / team-*        → 'team'
 *   • character-*                  → 'character'
 *   • deadline / reminder içeren   → 'reminder'
 *   • campaign / surprise / season → 'campaign'
 * Bilinmeyen/eşleşmeyen kind → null (grubu yok → HER ZAMAN gönderilir, tercih uygulanmaz).
 */
export function kindToGroup(kind: string | null | undefined): string | null {
  if (!kind) return null;
  const k = kind.toLowerCase();

  // Ekip & görevler (team-task-deadline dahil tüm team-* buraya; en spesifik önce).
  if (k.startsWith('team') || k.includes('task')) return 'team';

  // Karakter rozeti (character-ready, character-*).
  if (k.startsWith('character')) return 'character';

  // Hatırlatmalar (deadline/reminder/hatirlat).
  if (k.includes('deadline') || k.includes('reminder') || k.includes('hatirlat')) return 'reminder';

  // Kampanya & sürprizler (campaign/surprise/season/flash/offer).
  if (
    k.includes('campaign') ||
    k.includes('surprise') ||
    k.includes('season') ||
    k.includes('flash') ||
    k.includes('offer')
  ) {
    return 'campaign';
  }

  return null; // bilinmeyen → gruplama yok → her zaman gönder
}

/**
 * Bir grup+kanal için bildirim AÇIK mı?
 * VARSAYILAN AÇIK: prefs null/undefined ise, grup girişi yoksa ya da kanal alanı
 * tanımsızsa → true döner. Yalnızca kullanıcı AÇIKÇA `false` yazmışsa kapalıdır.
 *
 * @param prefs   User.notificationPrefs (Json) — herhangi bir tip olabilir (savunmacı okunur).
 * @param group   Tür grubu anahtarı (kindToGroup çıktısı). null → daima true (grupsuz gönder).
 * @param channel 'app' | 'email'.
 */
export function isChannelEnabled(
  prefs: unknown,
  group: string | null | undefined,
  channel: NotificationChannel,
): boolean {
  // Grup yoksa (bilinmeyen kind) tercih uygulanmaz → her zaman gönder.
  if (!group) return true;
  if (!prefs || typeof prefs !== 'object') return true;

  const groupPref = (prefs as Record<string, unknown>)[group];
  if (!groupPref || typeof groupPref !== 'object') return true;

  const value = (groupPref as Record<string, unknown>)[channel];
  // Yalnızca açıkça false → kapalı; undefined/null/başka değer → AÇIK varsay.
  return value === false ? false : true;
}

/**
 * Ham/kısmi bir prefs nesnesini yalnızca GEÇERLİ grup+kanal boolean'larına indirger.
 * API'de gelen gövdeyi kaydetmeden önce temizlemek için (geçersiz grup/kanal atılır).
 */
export function sanitizeNotificationPrefs(input: unknown): NotificationPrefs {
  const out: NotificationPrefs = {};
  if (!input || typeof input !== 'object') return out;
  for (const group of NOTIFICATION_GROUP_KEYS) {
    const raw = (input as Record<string, unknown>)[group];
    if (!raw || typeof raw !== 'object') continue;
    const entry: { app?: boolean; email?: boolean; push?: boolean } = {};
    const appVal = (raw as Record<string, unknown>).app;
    const emailVal = (raw as Record<string, unknown>).email;
    const pushVal = (raw as Record<string, unknown>).push;
    if (typeof appVal === 'boolean') entry.app = appVal;
    if (typeof emailVal === 'boolean') entry.email = emailVal;
    if (typeof pushVal === 'boolean') entry.push = pushVal;
    if (Object.keys(entry).length > 0) out[group] = entry;
  }
  return out;
}

/**
 * UI için tam (her grup için app+email dolu) tercih tablosu üretir; eksikler AÇIK (true).
 * Ayar ekranı toggle'ları bu tam tabloyu kullanır.
 */
export function fullPrefsForUI(prefs: unknown): Record<string, { app: boolean; email: boolean; push: boolean }> {
  const out: Record<string, { app: boolean; email: boolean; push: boolean }> = {};
  for (const g of NOTIFICATION_GROUPS) {
    out[g.key] = {
      app: isChannelEnabled(prefs, g.key, 'app'),
      email: isChannelEnabled(prefs, g.key, 'email'),
      push: isChannelEnabled(prefs, g.key, 'push'),
    };
  }
  return out;
}
