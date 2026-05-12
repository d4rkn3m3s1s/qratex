import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-json-ld';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { WebPageJsonLd } from '@/components/seo/webpage-json-ld';
import { getSeoSettings, getPageSeo, getCanonicalBase } from '@/lib/seo-settings';

export async function generateMetadata(): Promise<Metadata> {
  const override = await getPageSeo('/kullanim-sartlari');
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: override?.title ?? 'Kullanım Şartları',
    description: override?.description ?? 'QRATEX hizmet kullanım şartları: kullanıcı yükümlülükleri, kabul ve sonlandırma koşulları.',
    alternates: { canonical: override?.canonical ?? `${base}/kullanim-sartlari` },
  };
}

export default async function KullanimSartlariPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const override = await getPageSeo('/kullanim-sartlari');
  const title = override?.title ?? 'Kullanım Şartları';
  const description = override?.description ?? 'QRATEX hizmet kullanım şartları: kullanıcı yükümlülükleri, kabul ve sonlandırma koşulları.';
  return (
    <>
      <WebPageJsonLd name={title} description={description} url={`${base}/kullanim-sartlari`} />
      <BreadcrumbJsonLd items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Kullanım Şartları', path: '/kullanim-sartlari' }]} />
    <div className="container px-4 py-10 md:py-14 space-y-6">
      <BreadcrumbNav items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Kullanım Şartları', path: '/kullanim-sartlari' }]} />
      <Card>
        <CardHeader>
          <CardTitle>Kullanım Şartları</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            QRATEX hizmetlerini kullanarak bu şartları kabul etmiş sayılırsınız. Platform; QR tabanlı geri bildirim,
            tüketim kaydı, puan/rozet sistemi ve ilgili özellikleri sunar.
          </p>
          <p>
            Hesaplarınızı güvende tutmak, uygunsuz içerik paylaşmamak ve başkalarının hesaplarına izinsiz erişmemek
            kullanıcı yükümlülüğündedir. İşletme tarafında verilen bilgilerin doğru ve güncel tutulması beklenir.
          </p>
          <p>
            Hizmet, &quot;olduğu gibi&quot; sunulur; yasal zorunluluklar dışında kesintisiz kullanım garanti edilmez.
            Uyumsuz kullanımda hesap kısıtlanabilir veya sonlandırılabilir.
          </p>
          <p>
            Kişisel verileriniz için{' '}
            <Link href="/gizlilik-politikasi" className="underline">
              Gizlilik Politikası
            </Link>{' '}
            ve{' '}
            <Link href="/kvkk-aydinlatma-metni" className="underline">
              KVKK Aydınlatma Metni
            </Link>{' '}
            geçerlidir.
          </p>
          <p className="text-xs">Son güncelleme: {new Date().toLocaleDateString('tr-TR')}</p>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
