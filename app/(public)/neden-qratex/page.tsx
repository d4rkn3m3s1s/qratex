import type { Metadata } from 'next';
import Link from 'next/link';
import { getSeoSettings, getCanonicalBase } from '@/lib/seo-settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';

export const metadata: Metadata = {
  title: 'Neden QRATEX?',
  description:
    'QRATEX ile rakiplerinizden ayrışın: QR kodlu geri bildirim, AI analizi, gamification ve tek platformda müşteri deneyimi.',
  openGraph: {
    title: 'Neden QRATEX?',
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
    name: 'Neden QRATEX?',
    description:
      'QRATEX ile rakiplerinizden ayrışın: QR kodlu geri bildirim, AI analizi, gamification.',
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
            { name: 'Neden QRATEX?', path: '/neden-qratex' },
          ]}
        />
        <h1 className="text-3xl md:text-4xl font-bold mb-4">Neden QRATEX?</h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl">
          Geleneksel geri bildirim yöntemlerinden farklı olarak QRATEX, QR kodları,
          yapay zeka ve gamification ile müşteri deneyimini tek platformda toplar.
        </p>

        <div className="grid gap-6 md:grid-cols-2 mb-12">
          <Card>
            <CardHeader>
              <CardTitle>QRATEX ile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparisons.map((row) => (
                <div key={row.feature} className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span>{row.feature}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-muted">
            <CardHeader>
              <CardTitle className="text-muted-foreground">
                Klasik yöntemler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparisons.map((row) => (
                <div key={row.feature} className="text-muted-foreground">
                  {row.classic}
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
