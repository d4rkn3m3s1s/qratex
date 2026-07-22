import type { Metadata } from 'next';
import Link from 'next/link';
import { getSeoSettings, getCanonicalBase } from '@/lib/seo-settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, Sparkles } from 'lucide-react';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';

export const metadata: Metadata = {
  title: 'Neden QRateX?',
  description:
    'QRateX ile rakiplerinizden ayrışın: QR kodlu geri bildirim, AI analizi, gamification ve tek platformda müşteri deneyimi.',
  openGraph: {
    title: 'Neden QRateX?',
    description:
      'QR kodlu geri bildirim, AI analizi ve gamification ile müşteri deneyimini dönüştürün.',
  },
};

const comparisons = [
  {
    feature: 'QR ile anında geri bildirim',
    qratex: true,
    classic: 'Form / e-posta',
  },
  {
    feature: 'AI duygu ve konu analizi',
    qratex: true,
    classic: 'Manuel',
  },
  {
    feature: 'Puan, rozet, görevler (gamification)',
    qratex: true,
    classic: 'Yok',
  },
  {
    feature: 'Tek panel: bayi + müşteri',
    qratex: true,
    classic: 'Ayrı araçlar',
  },
  {
    feature: 'KVKK uyumlu, güvenli altyapı',
    qratex: true,
    classic: 'Değişken',
  },
];

export default async function NedenQratexPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);

  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Neden QRateX?',
    description:
      'QRateX ile rakiplerinizden ayrışın: QR kodlu geri bildirim, AI analizi, gamification.',
    url: `${base}/neden-qratex`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }}
      />
      <div className="container px-4 py-10 md:py-14">
        <BreadcrumbNav
          items={[
            { name: 'Ana Sayfa', path: '/' },
            { name: 'Neden QRateX?', path: '/neden-qratex' },
          ]}
        />
        <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
          Karşılaştırma
        </span>
        <h1 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Neden QRateX?</h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl">
          Geleneksel geri bildirim yöntemlerinden farklı olarak QRateX, QR kodları,
          yapay zeka ve gamification ile müşteri deneyimini tek platformda toplar.
        </p>

        <div className="grid gap-6 md:grid-cols-2 mb-12">
          {/* QRateX ile — vurgulu, renkli */}
          <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-fuchsia-500/5 shadow-lg backdrop-blur-sm">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl" aria-hidden />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </span>
                QRateX ile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparisons.map((row) => (
                <div key={row.feature} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15">
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                  </span>
                  <span className="font-medium">{row.feature}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          {/* Klasik yöntemler — soluk */}
          <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-muted-foreground">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
                  <X className="h-5 w-5" aria-hidden />
                </span>
                Klasik yöntemler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparisons.map((row) => (
                <div key={row.feature} className="flex items-start gap-3 text-muted-foreground">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted/40">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span>{row.classic}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:bg-primary/90"
          >
            Ücretsiz Başla
          </Link>
          <Link
            href="/#pricing"
            className="inline-flex items-center justify-center rounded-lg border border-border/80 bg-background px-6 py-3 font-medium text-foreground shadow-sm hover:bg-accent dark:border-white/25 dark:bg-white/[0.07]"
          >
            Fiyatlandırma
          </Link>
        </div>
      </div>
    </>
  );
}
