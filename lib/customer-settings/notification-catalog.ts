/**
 * Müşteri bildirim tercih KATALOĞU — yalnız GERÇEKTEN uygulanan tür × kanal hücreleri.
 *
 * Denetim (customer_settings B2): eski ekran 4 grup × 3 kanal = 12 anahtar + 5 "eski kart"
 * anahtarı gösteriyordu; yarısından fazlası hiçbir gönderim yolunda okunmuyordu. Bu katalog,
 * her hücre için tercihi okuyan gönderici var mı sorusunun tek cevabıdır. Ekranda yalnız
 * buradaki hücreler çizilir; sunucu da yalnız bu hücrelere yazmaya izin verir.
 *
 * Hücre → onu uygulayan gönderici (değiştirirken ikisini birlikte güncelle):
 *  - campaign.app / campaign.push → lib/marketing-delivery.ts (bayi kampanya, win-back, risk
 *    segmenti, segment önerisi; fail-closed) + lib/surprise-badges.ts (uygulama içi)
 *  - character.app / character.email → lib/character-badges.ts
 *  - reminder.app → lib/customer-reminders.ts (yorum hatırlatmaları)
 *  - team.app / team.push → lib/team-notify.ts (yalnız ekip üyeleri)
 *  - reply.email → lib/notify-email.ts `emailDealerReply` (`Settings.notifications.emailReply`)
 *
 * Bilinçli olarak YOK: character.push (gönderilmiyor), campaign.email (kampanya e-postası
 * yok), reminder.email/push (gönderilmiyor), team.email (lib/team-email tercihe bakmıyor),
 * rozet e-postası (`emailBadgeEarned` çağıranı yok).
 */
import type { NotificationChannel } from '@/lib/notification-prefs';

export type NotificationStorage = 'prefs' | 'legacy-reply';

export interface CatalogRow {
  /** `User.notificationPrefs` grup anahtarı ya da `reply` (eski Settings anahtarı). */
  key: 'campaign' | 'character' | 'reminder' | 'team' | 'reply';
  channels: readonly NotificationChannel[];
  storage: NotificationStorage;
  /** Yalnız ekip üyelerine gösterilir. */
  teamOnly?: boolean;
}

export const CUSTOMER_NOTIFICATION_CATALOG: readonly CatalogRow[] = [
  { key: 'campaign', channels: ['app', 'push'], storage: 'prefs' },
  { key: 'reply', channels: ['email'], storage: 'legacy-reply' },
  { key: 'character', channels: ['app', 'email'], storage: 'prefs' },
  { key: 'reminder', channels: ['app'], storage: 'prefs' },
  { key: 'team', channels: ['app', 'push'], storage: 'prefs', teamOnly: true },
];

export function visibleCatalog(isTeamMember: boolean): CatalogRow[] {
  return CUSTOMER_NOTIFICATION_CATALOG.filter((r) => !r.teamOnly || isTeamMember);
}

/** Bu hücre bu kullanıcı için yazılabilir mi? (sunucu doğrulaması) */
export function findWritableCell(
  key: string,
  channel: string,
  isTeamMember: boolean,
): CatalogRow | null {
  const row = visibleCatalog(isTeamMember).find((r) => r.key === key);
  if (!row) return null;
  return (row.channels as readonly string[]).includes(channel) ? row : null;
}
