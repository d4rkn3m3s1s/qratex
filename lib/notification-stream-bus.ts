'use client';

/**
 * Bildirimler için TEK kanal (perf Y5): bayi panelinde SSE akışı (`useNotificationStream`) açıkken
 * bildirim merkezi ayrıca 20 sn'de bir `/api/notifications` yoklamasın — listeyi yalnız akış yeni
 * bildirim getirdiğinde (ve seyrek bir güvenlik turunda) tazelesin. Akış yoksa (müşteri/admin
 * panelleri, akış koptu, sekme gizli) bildirim merkezi eski yoklamasına döner.
 */

type Listener = (event: { type: 'live'; live: boolean } | { type: 'items'; count: number }) => void;

let live = false;
const listeners = new Set<Listener>();

export function isNotificationStreamLive(): boolean {
  return live;
}

export function setNotificationStreamLive(next: boolean): void {
  if (live === next) return;
  live = next;
  for (const l of listeners) l({ type: 'live', live: next });
}

export function publishNotificationStreamItems(count: number): void {
  if (count <= 0) return;
  for (const l of listeners) l({ type: 'items', count });
}

export function subscribeNotificationStream(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
