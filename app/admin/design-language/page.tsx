'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { ExternalLink, LayoutTemplate, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, SectionCard } from '@/components/states';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { ColorTokensSection, ContrastAuditSection, ScalesSection, TypographySection } from './_components/token-sections';
import { MotionSection } from './_components/motion-section';
import { PrimitivesSection, StatesSection } from './_components/component-sections';

const HEADER = {
  tr: {
    title: 'Qratex Tasarım Dili v2',
    description:
      "Yaşayan rehber: token'lar, kontrast skorları, motion ön ayarları ve durum bileşenleri gerçek koddan canlı render edilir. Operasyon yüzeyleri sakin ve yoğun; ödül ve oyun yüzeyleri ifadeli; her temada okunurluk garanti.",
    themeLight: 'Açık temaya geç',
    themeDark: 'Koyu temaya geç',
  },
  en: {
    title: 'Qratex Design Language v2',
    description:
      'Living guide: tokens, contrast scores, motion presets and state components rendered live from real code. Operations surfaces calm and dense; reward and game surfaces expressive; legible in every theme.',
    themeLight: 'Switch to light theme',
    themeDark: 'Switch to dark theme',
  },
} as const;

const RULES: Array<{ do: string; dont: string }> = [
  { do: 'Durum rengi için tone="success|warning|danger|info" ya da text-success / bg-danger-subtle', dont: 'text-emerald-500, text-red-600 gibi ham palet sınıfları' },
  { do: 'Sayfa başlığı için PageHeader (mobilde de görünür, tek h1)', dont: 'Elle h1 + gradient şerit kopyaları, mobilde gizli başlık' },
  { do: 'Veri ekranında QueryState (yükleme / hata+tekrar dene / boş / bayat)', dont: 'Hata olunca boş liste göstermek, res.ok kontrol etmemek' },
  { do: 'Kalıcı/etkili işlemde ConfirmAction (etki önizlemesi + tipli onay)', dont: 'window.confirm() ya da tek tıkla silme' },
  { do: 'Hareket için lib/motion ön ayarları ve token süreleri', dont: 'duration: 0.7, stiffness: 260, index * 0.1 sınırsız gecikme' },
  { do: "Sonsuz döngü yalnız play kaydında <Ambient> içinde", dont: 'Operasyon panelinde nabız, marquee, shimmer' },
  { do: 'Tipografi için qx-h1…qx-caption; bilgi metni ≥ 12px', dont: 'text-[9px], text-[10px] bilgi metni' },
  { do: 'Projeye özel CSS sınıfları qx- önekli (qx-enter)', dont: 'Tailwind/eklenti adlarını yeniden tanımlamak (.animate-in, .delay-200)' },
];

export default function AdminDesignLanguagePage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const copy = HEADER[locale === 'en' ? 'en' : 'tr'];
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-section pb-12">
      <PageHeader
        variant="hero"
        eyebrow={t('adminDesignLanguage.eyebrow')}
        title={copy.title}
        description={copy.description}
        icon={<LayoutTemplate />}
        meta={
          <>
            <Badge variant="brand">QDL v2</Badge>
            <Badge variant="outline">WCAG 2.2 AA</Badge>
          </>
        }
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? copy.themeLight : copy.themeDark}
          >
            {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            {isDark ? 'Açık' : 'Koyu'}
          </Button>
        }
      />

      <ContrastAuditSection />
      <ColorTokensSection />
      <TypographySection />
      <ScalesSection />
      <MotionSection />
      <PrimitivesSection />
      <StatesSection />

      <SectionCard title="Yap / Yapma" description="Sayfa göçünde (F3.5) uygulanacak kurallar; zamanla lint kuralına dönüşür.">
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
                    {r.do}
                  </td>
                  <td className="py-2.5 text-fg-muted">
                    <span className="mr-1.5 font-semibold text-danger" aria-hidden>
                      ✕
                    </span>
                    {r.dont}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Kaynaklar"
        description="Token değerleri: app/globals.css · Tailwind eşlemesi: tailwind.config.ts · Katalog: lib/design/tokens.ts · Motion: lib/motion (README) · Durum bileşenleri: components/states"
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/accessibility">{t('adminDesignLanguage.linkAccessibility')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/observability#core-web-vitals">
              {t('adminDesignLanguage.linkObservability')}
              <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/themes">Tema preset'leri</Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
