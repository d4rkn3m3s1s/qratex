import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-json-ld';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { WebPageJsonLd } from '@/components/seo/webpage-json-ld';
import { Shield, Server, Lock, FileText } from 'lucide-react';
import { getSeoSettings, getPageSeo, getCanonicalBase } from '@/lib/seo-settings';

export async function generateMetadata(): Promise<Metadata> {
  const override = await getPageSeo('/guven');
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: override?.title ?? 'Güven ve Güvenilirlik',
    description: override?.description ?? 'QRateX güvenlik kontrolleri, uptime SLO ve veri politikaları. KVKK uyumlu, şifreli altyapı.',
    alternates: { canonical: override?.canonical ?? `${base}/guven` },
  };
}

export default async function GuvenPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const override = await getPageSeo('/guven');
  const title = override?.title ?? 'Güven ve Güvenilirlik';
  const description = override?.description ?? 'QRateX güvenlik kontrolleri, uptime SLO ve veri politikaları. KVKK uyumlu, şifreli altyapı.';
  return (
    <>
      <WebPageJsonLd name={title} description={description} url={`${base}/guven`} type="AboutPage" />
      <BreadcrumbJsonLd items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Güven ve Güvenilirlik', path: '/guven' }]} />
    <div className="container px-4 py-10 md:py-14 space-y-8">
      <BreadcrumbNav items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Güven ve Güvenilirlik', path: '/guven' }]} />
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          Güven ve Güvenilirlik
        </h1>
        <p className="text-muted-foreground mt-1">
          Uptime, güvenlik kontrolleri ve veri politikaları tek sayfada.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              Uptime ve SLO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p><strong>Hedef uptime:</strong> %99.9 (aylık downtime &lt; 43 dk)</p>
            <p><strong>p95 Latency:</strong> &lt; 300ms</p>
            <p><strong>Error Rate:</strong> &lt; %0.1</p>
            <p>İzleme: Sentry, Vercel Analytics, Inngest.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Güvenlik Kontrolleri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p><strong>PII:</strong> Email, telefon, IP maskeleme (lib/pii-redact).</p>
            <p><strong>Export:</strong> Satır limiti, watermark, signed URL.</p>
            <p><strong>Session:</strong> JWT + token replay tespiti, session fixation koruması.</p>
            <p><strong>Idempotency:</strong> Kritik route&apos;larda tekrar istek koruması.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Veri Politikaları
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="space-y-2">
              <li>
                <Link href="/kvkk-aydinlatma-metni" className="underline hover:text-foreground">
                  KVKK Aydınlatma Metni
                </Link>
              </li>
              <li>
                <Link href="/gizlilik-politikasi" className="underline hover:text-foreground">
                  Gizlilik Politikası
                </Link>
              </li>
              <li>
                <Link href="/cerez-politikasi" className="underline hover:text-foreground">
                  Çerez Politikası
                </Link>
              </li>
              <li>
                <Link href="/kullanim-sartlari" className="underline hover:text-foreground">
                  Kullanım Şartları
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}
