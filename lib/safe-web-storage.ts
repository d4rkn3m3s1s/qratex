/** localStorage yazımı — kota / gizli mod / devre dışı durumunda sessizce yutar. */
export function safeLocalStorageSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
