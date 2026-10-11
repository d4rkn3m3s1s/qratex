/**
 * Android geri tuşu — tek global yönetici (DOM tabanlı, bileşen kaydı gerektirmez).
 * Sıra: 1) açık katman (Radix dialog/alert-dialog/sheet, vaul drawer, açık menü/select/popover)
 *          → Escape ile kapatılır (Radix DismissableLayer yalnız en üstteki katmanı kapatır)
 *       2) geçmiş varsa history.back()
 *       3) kökteyse "tekrar bas, çık" onayı.
 */
export type BackAction = 'close-layer' | 'history-back' | 'confirm-exit';

const OPEN_LAYER_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-vaul-drawer][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[data-radix-popper-content-wrapper] [data-state="open"]',
].join(',');

/** Uygulamanın kök ekranları: buradan geri = çıkış onayı. */
export const ROOT_PATHS = new Set(['/', '/app', '/customer', '/dealer', '/staff', '/admin', '/login']);

export function hasOpenLayer(doc: Document): boolean {
  return doc.querySelector(OPEN_LAYER_SELECTOR) !== null;
}

export function decideBackAction(input: { hasOpenLayer: boolean; canGoBack: boolean; pathname: string }): BackAction {
  if (input.hasOpenLayer) return 'close-layer';
  const path = input.pathname.replace(/\/+$/, '') || '/';
  if (input.canGoBack && !ROOT_PATHS.has(path)) return 'history-back';
  return 'confirm-exit';
}

/** Radix katmanları document üzerindeki Escape keydown'ı dinler; en üstteki katman kapanır. */
export function closeTopLayer(doc: Document): void {
  const target = (doc.activeElement as HTMLElement | null) ?? doc.body;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
  );
}

/** Harici (başka host) http(s) bağlantı mı? Native'de sistem tarayıcısında açılır. */
export function isExternalHttpUrl(href: string, currentHost: string): boolean {
  try {
    const u = new URL(href, `https://${currentHost}`);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host !== currentHost;
  } catch {
    return false;
  }
}
