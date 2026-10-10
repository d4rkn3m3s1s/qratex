/**
 * Kullanıcı ajanı → okunur cihaz etiketi ("Chrome · Android"). Ham UA istemciye gönderilmez.
 * Bilinmeyen ajan → null (ekran "Bilinmeyen cihaz" der; uydurma etiket yok).
 */
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/SamsungBrowser\//i, 'Samsung Internet'],
  [/Edg(?:e|A|iOS)?\//i, 'Edge'],
  [/OPR\/|Opera/i, 'Opera'],
  [/Firefox\/|FxiOS\//i, 'Firefox'],
  [/CriOS\/|Chrome\//i, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//i, 'Safari'],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/Android/i, 'Android'],
  [/iPhone|iPad|iPod/i, 'iOS'],
  [/Windows NT/i, 'Windows'],
  [/Mac OS X|Macintosh/i, 'macOS'],
  [/CrOS/i, 'ChromeOS'],
  [/Linux/i, 'Linux'],
];

export function deviceLabel(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? '').slice(0, 512);
  if (!ua) return null;
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os;
}
