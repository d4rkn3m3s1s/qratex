'use client';

/**
 * "Çıplak" sayfa bayrağı — global kabuk öğelerinin (çevrimdışı şeridi, kurulum bandı, sohbet
 * balonu) gizlenmesi gereken yüzeyler.
 *
 *  - `/offline` çevrimdışı yedek sayfası: SW onu ASIL istek adresinde sunar (adres çubuğunda
 *    ör. `/c/<token>` durur) → yol ile ayırt edilemez. Sayfanın satır içi betiği `<html>`'e
 *    `data-qx-bare` koyar; bileşenler bu niteliği izler. Aynı mesaj iki kez gösterilmez
 *    (rapor offline bulgu 4), ağ gerektiren sohbet/kurulum çağrıları yapılmaz.
 *  - `/table-signal` tek dokunuşluk QR/kiosk sayfası: sohbet balonu ve kurulum bandı dikkat
 *    dağıtır (rapor table-signal envanter #37); sayfa kendi bağlantı durumunu gösterir.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BARE_CHROME_ATTR } from './bare-chrome-attr';

export { BARE_CHROME_ATTR };

export const BARE_CHROME_PATH_PREFIXES = ['/table-signal', '/offline'] as const;

export function isBareChromePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return BARE_CHROME_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isBareChromeDocument(doc: Document | null | undefined = typeof document === 'undefined' ? null : document): boolean {
  return !!doc?.documentElement?.hasAttribute(BARE_CHROME_ATTR);
}

/**
 * `null` → henüz bilinmiyor (ilk render / SSR): çağıran HİÇBİR ŞEY çizmemeli (ağır parçayı
 * gereksiz yüklememek için). `true` → gizle, `false` → normal.
 */
export function useBareChrome(): boolean | null {
  const pathname = usePathname();
  const [attr, setAttr] = useState<boolean | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    const sync = () => setAttr(html.hasAttribute(BARE_CHROME_ATTR));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(html, { attributes: true, attributeFilter: [BARE_CHROME_ATTR] });
    return () => mo.disconnect();
  }, []);

  if (attr === null) return null;
  return attr || isBareChromePath(pathname);
}
