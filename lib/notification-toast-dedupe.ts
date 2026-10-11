/**
 * Bildirim toast'ı TEK KEZ (mimari-api B9). Bayi panelinde aynı bildirim iki kanaldan gelir:
 * SSE akışı (`RealtimeNotifications`, ~1 sn) ve bildirim merkezinin listesi (görünür sekmede
 * periyodik). Eskiden ikisi de toast açıyordu → her yeni bildirim iki kez görünüyordu.
 * Hangi kanal önce görürse toast'ı o açar; diğeri sessizce listeyi günceller.
 *
 * Sekme ömrü boyunca bellekte tutulur (en fazla `MAX_IDS` kimlik; en eskiler düşer).
 */
const MAX_IDS = 500;
const shown = new Set<string>();

/** Bu bildirim için toast açılmalı mı? İlk çağrı `true`, aynı kimlik için sonrakiler `false`. */
export function claimNotificationToast(id: string | null | undefined): boolean {
  if (!id) return true;
  if (shown.has(id)) return false;
  shown.add(id);
  if (shown.size > MAX_IDS) {
    const oldest = shown.values().next().value;
    if (oldest !== undefined) shown.delete(oldest);
  }
  return true;
}

/** Toast açmadan "görüldü" işaretle (ilk yükleme listesi gibi). */
export function markNotificationsSeen(ids: Iterable<string>): void {
  for (const id of ids) claimNotificationToast(id);
}

/** Yalnız testler için. */
export function __resetNotificationToastDedupe(): void {
  shown.clear();
}
