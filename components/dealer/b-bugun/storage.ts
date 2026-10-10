/** Cihaza özel küçük tercihler (kart daraltma). Gizli mod / engelli depolama → sessizce yok sayılır. */
export function safeLocalGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* yok say */
  }
}
