'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { ArrowRight, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/states';
import type { DriftReport } from '@/lib/design-system/drift-scan';
import { ColorTokensSection, ContrastAuditSection, ScalesSection, TypographySection } from './token-sections';
import { MotionSection } from './motion-section';
import { PrimitivesSection, StatesSection } from './component-sections';
import { DriftSection } from './drift-section';
import { useSourceT } from '@/components/ds/page/source-dict';
import { DS_DICT, useDesignSystemCopy } from '../copy';

const RULES: Array<{ do: string; dont: string }> = [
  { do: 'Durum rengi için tone="success|warning|danger|info" ya da text-success / bg-danger-subtle', dont: 'text-emerald-500, text-red-600 gibi ham palet sınıfları' },
  { do: 'Sayfa başlığı için PageHeader (mobilde de görünür, tek h1)', dont: 'Elle h1 + gradient şerit kopyaları, mobilde gizli başlık' },
  { do: 'Veri ekranında QueryState (yükleme / hata+tekrar dene / boş / bayat)', dont: 'Hata olunca boş liste göstermek, res.ok kontrol etmemek' },
  { do: 'Kalıcı/etkili işlemde ConfirmAction (etki önizlemesi + tipli onay)', dont: 'window.confirm() ya da tek tıkla silme' },
  { do: 'Hareket için lib/motion ön ayarları ve token süreleri', dont: 'duration: 0.7, stiffness: 260, index * 0.1 sınırsız gecikme' },
  { do: 'Sonsuz döngü yalnız play kaydında <Ambient> içinde', dont: 'Operasyon panelinde nabız, marquee, shimmer' },
  { do: 'Tipografi için qx-h1…qx-caption; bilgi metni ≥ 12px', dont: 'text-[9px], text-[10px] bilgi metni' },
  { do: 'Projeye özel CSS sınıfları qx- önekli (qx-enter)', dont: 'Tailwind/eklenti adlarını yeniden tanımlamak (.animate-in, .delay-200)' },
];

const JUMPS = [
  { id: 'kontrast', label: 'Kontrast' },
  { id: 'renkler', label: "Renk token'ları" },
  { id: 'tipografi', label: 'Tipografi' },
  { id: 'olcekler', label: 'Ölçekler' },
  { id: 'hareket', label: 'Hareket' },
  { id: 'bilesenler', label: 'Bileşenler' },
  { id: 'durumlar', label: 'Durumlar' },
  { id: 'kurallar', label: 'Yap / Yapma' },
  { id: 'uyum', label: 'Uyum raporu' },
] as const;

function Anchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      {children}
    </div>
  );
}

/** Yaşayan rehber: token'lar, kontrast, hareket ve bileşenler gerçek koddan canlı çizilir. */
export function GuideTab({ drift }: { drift: DriftReport | null }) {
  const fz = useDesignSystemCopy().fx;
  const L = useSourceT(DS_DICT);
  const ux = useDesignSystemCopy().ui;
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div className="flex flex-col gap-section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={ux.rehberBolumleri} className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
          <ul className="flex w-max gap-1.5">
            {JUMPS.map((j) => (
              <li key={j.id}>
                <a
                  href={`#${j.id}`}
                  className="qx-caption inline-flex min-h-11 items-center rounded-chip border bg-surface-1 px-3 font-medium text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                >
                  {L(j.label)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 sm:min-h-10"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? ux.kendiEkranimdaAcikModa : ux.kendiEkranimdaKoyuModa}
        >
          {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          {isDark ? ux.acikModdaGor : ux.koyuModdaGor}
        </Button>
      </div>

      <Anchor id="kontrast">
        <ContrastAuditSection />
      </Anchor>
      <Anchor id="renkler">
        <ColorTokensSection />
      </Anchor>
      <Anchor id="tipografi">
        <TypographySection />
      </Anchor>
      <Anchor id="olcekler">
        <ScalesSection />
      </Anchor>
      <Anchor id="hareket">
        <MotionSection />
      </Anchor>
      <Anchor id="bilesenler">
        <PrimitivesSection />
      </Anchor>
      <Anchor id="durumlar">
        <StatesSection />
      </Anchor>

      <Anchor id="kurallar">
        <SectionCard title={ux.yapYapma} description={ux.sayfaGocundeUygulananKurallar}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead>
                <tr className="qx-caption text-fg-muted">
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Yap
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Yapma
                  </th>
                </tr>
              </thead>
              <tbody className="qx-small">
                {RULES.map((r) => (
                  <tr key={r.do} className="border-t align-top">
                    <td className="py-2.5 pr-4 text-fg">
                      <span className="mr-1.5 font-semibold text-success" aria-hidden>
                        ✓
                      </span>
                      {L(r.do)}
                    </td>
                    <td className="py-2.5 text-fg-muted">
                      <span className="mr-1.5 font-semibold text-danger" aria-hidden>
                        ✕
                      </span>
                      {L(r.dont)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </Anchor>

      <Anchor id="uyum">
        <DriftSection report={drift} />
      </Anchor>

      <SectionCard
        title={ux.kaynaklarVeIlgiliSayfalar}
        description={ux.tokenDegerleriAppGlobals}
      >
        <nav aria-label={ux.ilgiliKaliteSayfalari}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                <Link href="/admin/design-system?tab=temalar">
                  Temalar ve palet <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </li>
            <li>
              <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                <Link href="/admin/design-system?tab=erisilebilirlik">
                  {fz.accessibility} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </li>
            <li>
              <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                <Link href="/admin/observability#core-web-vitals">
                  Performans (Core Web Vitals) <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </li>
          </ul>
        </nav>
      </SectionCard>
    </div>
  );
}
