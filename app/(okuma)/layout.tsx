import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { SkipToMainContent } from '@/components/layout/skip-to-main';

/**
 * Okuma yüzeyleri (blog + yasal belgeler) için SAKİN kabuk — URL'ler değişmez (route grubu).
 *
 * `(public)` kabuğundaki hareketli landing zemini (8 orb + 26 parçacık + yıldız, her görüntülemede
 * `no-store` ayar isteği) ve tam ekran marka yükleme katmanı burada YOK: uzun okumada dikkat
 * dağıtıyor, muted metnin kontrastını düşürüyordu (blog_slug bulgu 8, yasal sayfalar §4.2
 * "Yasal … landing zemini kaldırılır"). Zemin statik: düz yüzey + üstte hafif marka tonu.
 *
 * `ops` kaydı (sakin, yoğun). Yazdırma görünümü: krom gizlenir, renk token'ları açık zemin /
 * koyu metne çekilir (koyu temada yazdırınca açık gri metin çıkmasın).
 */
const PRINT_CSS = `
@media print {
  .qx-reading {
    --background: 0 0% 100%;
    --foreground: 0 0% 8%;
    --card: 0 0% 100%;
    --muted-foreground: 0 0% 28%;
    --border: 0 0% 78%;
    --surface-0: 0 0% 100%;
    --surface-1: 0 0% 100%;
    --surface-2: 0 0% 97%;
    --surface-3: 0 0% 95%;
    --text-1: 0 0% 8%;
    --text-2: 0 0% 28%;
    --text-3: 0 0% 38%;
    --brand-text: 263 70% 38%;
    --brand-subtle: 0 0% 96%;
    --brand-border: 0 0% 70%;
    background: #fff !important;
    color: #141414;
  }
  .qx-reading .qx-elevation-1 { box-shadow: none; }
  .qx-reading a[href^="mailto:"]::after { content: ""; }
}
`;

export default function ReadingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-register="ops" className="qx-reading relative flex min-h-dvh flex-col bg-background">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-brand-subtle to-transparent opacity-70 print:hidden"
      />
      <SkipToMainContent targetId="main-content" variant="content" />
      <div className="relative z-[1] flex min-h-dvh flex-col">
        <div className="print:hidden">
          <Header />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 pt-[calc(5rem+env(safe-area-inset-top))] outline-none print:pt-0 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {children}
        </main>
        <div className="print:hidden">
          <Footer />
        </div>
      </div>
    </div>
  );
}
