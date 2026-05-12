import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-json-ld';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { WebPageJsonLd } from '@/components/seo/webpage-json-ld';
import { getSeoSettings, getPageSeo, getCanonicalBase } from '@/lib/seo-settings';

export async function generateMetadata(): Promise<Metadata> {
  const override = await getPageSeo('/gizlilik-politikasi');
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: override?.title ?? 'Gizlilik Politikası',
    description: override?.description ?? 'QRATEX gizlilik politikası: hangi verileri neden işlediğimiz, kimlerle paylaştığımız ve saklama süreleri.',
    alternates: { canonical: override?.canonical ?? `${base}/gizlilik-politikasi` },
  };
}

export default async function GizlilikPolitikasiPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const override = await getPageSeo('/gizlilik-politikasi');
  const title = override?.title ?? 'Gizlilik Politikası';
  const description = override?.description ?? 'QRATEX gizlilik politikası: hangi verileri neden işlediğimiz, kimlerle paylaştığımız ve saklama süreleri.';
  return (
    <>
      <WebPageJsonLd name={title} description={description} url={`${base}/gizlilik-politikasi`} />
      <BreadcrumbJsonLd items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Gizlilik Politikası', path: '/gizlilik-politikasi' }]} />
    <div className="container px-4 py-10 md:py-14 space-y-6">
      <BreadcrumbNav items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Gizlilik Politikası', path: '/gizlilik-politikasi' }]} />
      <Card>
        <CardHeader>
          <CardTitle>Gizlilik Politikası</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            QRATEX, kişisel verilerin korunmasına önem verir. Bu politika; hangi verileri neden işlediğimizi, kimlerle
            paylaştığımızı ve ne kadar süre sakladığımızı açıklar.
          </p>
          <p>
            İşlenen başlıca veriler: hesap bilgileri, geri bildirim içerikleri, kullanım analitiği ve güvenlik logları
            (IP, tarayıcı bilgisi, zaman damgası).
          </p>
          <p>
            Veriler, hizmetin sağlanması, güvenlik, mevzuat yükümlülükleri ve kullanıcı deneyiminin iyileştirilmesi
            amacıyla işlenir.
          </p>
          <p>
            Ayrıntılı KVKK aydınlatması için{' '}
            <Link href="/kvkk-aydinlatma-metni" className="underline">
              KVKK Aydınlatma Metni
            </Link>{' '}
            sayfasına bakabilirsiniz.
          </p>
          <p className="text-xs">Son güncelleme: {new Date().toLocaleDateString('tr-TR')}</p>
        </CardContent>
      </Card>
    </div>
    </>
  );
}

