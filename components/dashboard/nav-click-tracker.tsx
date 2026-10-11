'use client';

/**
 * Bir gezinme yüzeyindeki (sidebar, mobil alt sekme) uygulama içi bağlantı tıklamalarını
 * `nav_click` olarak ölçer — yüzey bileşenine dokunmadan, yakalama aşamasında. Sarmalayıcı
 * `display: contents`: yerleşimi değiştirmez. Portal'la çizilen içerik (mobil menü çekmecesi)
 * React ağacında olduğu için o tıklamalar da yakalanır.
 */
import type { MouseEvent, ReactNode } from 'react';
import { trackNav, type NavSource } from '@/lib/navigation/track';

export function NavClickTracker({ source, children }: { source: NavSource; children: ReactNode }) {
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
    const href = anchor?.getAttribute('href');
    if (href && href.startsWith('/')) trackNav(source, href);
  };
  return (
    <div className="contents" onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
