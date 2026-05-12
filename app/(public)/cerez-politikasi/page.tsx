import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-json-ld';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { WebPageJsonLd } from '@/components/seo/webpage-json-ld';
import { getSeoSettings, getPageSeo, getCanonicalBase } from '@/lib/seo-settings';

export async function generateMetadata(): Promise<Metadata> {
  const override = await getPageSeo('/cerez-politikasi');
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: override?.title ?? 'Çerez Politikası',
    description: override?.description ?? 'QRATEX çerez politikası: zorunlu ve analitik çerezler, kullanım amaçları ve yönetim.',
    alternates: { canonical: override?.canonical ?? `${base}/cerez-politikasi` },
  };
}

export default async function CerezPolitikasiPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const override = await getPageSeo('/cerez-politikasi');
  const title = override?.title ?? 'Çerez Politikası';
  const description = override?.description ?? 'QRATEX çerez politikası: zorunlu ve analitik çerezler, kullanım amaçları ve yönetim.';
  return (
    <>
      <WebPageJsonLd name={title} description={description} url={`${base}/cerez-politikasi`} />
      <BreadcrumbJsonLd items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Çerez Politikası', path: '/cerez-politikasi' }]} />
    <div className="container px-4 py-10 md:py-14">
      <BreadcrumbNav items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'Çerez Politikası', path: '/cerez-politikasi' }]} />
      <Card>
        <CardHeader>
          <CardTitle>Çerez Politikası</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Bu politika, QRATEX platformunda kullanılan çerez türlerini ve bu çerezlerin hangi amaçlarla işlendiğini
            açıklar.
          </p>
          <p>
            <strong>Zorunlu çerezler:</strong> Oturum güvenliği, kimlik doğrulama ve temel uygulama fonksiyonları için
            kullanılır.
          </p>
          <p>
            <strong>Analitik çerezler:</strong> Ürün performansı ve kullanım eğilimlerini ölçmek için kullanılır.
            Tercihe bağlıdır.
          </p>
          <p>
            <strong>Pazarlama çerezleri:</strong> Kampanya ölçümü ve iletişim optimizasyonu için kullanılabilir.
            Tercihe bağlıdır.
          </p>
          <p>
            Çerez tercihlerinizi çerez bildirimi üzerinden güncelleyebilirsiniz. Zorunlu çerezlerin devre dışı
            bırakılması bazı özelliklerin çalışmamasına neden olabilir.
          </p>
          <p className="text-xs">Son güncelleme: {new Date().toLocaleDateString('tr-TR')}</p>
        </CardContent>
      </Card>
    </div>
    </>
  );
}

