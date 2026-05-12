import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-json-ld';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { WebPageJsonLd } from '@/components/seo/webpage-json-ld';
import { getSeoSettings, getPageSeo, getCanonicalBase } from '@/lib/seo-settings';

export async function generateMetadata(): Promise<Metadata> {
  const override = await getPageSeo('/kvkk-aydinlatma-metni');
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: override?.title ?? 'KVKK Aydınlatma Metni',
    description: override?.description ?? '6698 sayılı KVKK kapsamında QRATEX veri sorumlusu aydınlatma metni. İşlenen veri kategorileri ve haklarınız.',
    alternates: { canonical: override?.canonical ?? `${base}/kvkk-aydinlatma-metni` },
  };
}

export default async function KvkkAydinlatmaPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const override = await getPageSeo('/kvkk-aydinlatma-metni');
  const title = override?.title ?? 'KVKK Aydınlatma Metni';
  const description = override?.description ?? '6698 sayılı KVKK kapsamında QRATEX veri sorumlusu aydınlatma metni. İşlenen veri kategorileri ve haklarınız.';
  return (
    <>
      <WebPageJsonLd name={title} description={description} url={`${base}/kvkk-aydinlatma-metni`} />
      <BreadcrumbJsonLd items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'KVKK Aydınlatma Metni', path: '/kvkk-aydinlatma-metni' }]} />
    <div className="container px-4 py-10 md:py-14">
      <BreadcrumbNav items={[{ name: 'Ana Sayfa', path: '/' }, { name: 'KVKK Aydınlatma Metni', path: '/kvkk-aydinlatma-metni' }]} />
      <Card>
        <CardHeader>
          <CardTitle>KVKK Aydınlatma Metni</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, veri sorumlusu olarak QRATEX tarafından
            işlenen kişisel verileriniz hakkında sizi bilgilendiriyoruz.
          </p>
          <p>
            <strong>İşlenen veri kategorileri:</strong> kimlik/iletişim verileri, kullanım verileri, geri bildirim
            içerikleri, güvenlik kayıtları.
          </p>
          <p>
            <strong>İşleme amaçları:</strong> hizmet sunumu, kullanıcı hesabı yönetimi, güvenlik ve denetim,
            analitik/raporlama, mevzuat yükümlülüklerinin yerine getirilmesi.
          </p>
          <p>
            <strong>Aktarım:</strong> veriler, yalnızca hizmetin teknik olarak sağlanması veya yasal yükümlülüklerin
            yerine getirilmesi için sınırlı şekilde aktarılır.
          </p>
          <p>
            <strong>Haklarınız:</strong> KVKK madde 11 kapsamındaki erişim, düzeltme, silme ve itiraz haklarınızı
            kullanabilirsiniz.
          </p>
          <p>
            Başvurular için: <strong>info@qratex.com</strong>
          </p>
          <p className="text-xs">Son güncelleme: {new Date().toLocaleDateString('tr-TR')}</p>
        </CardContent>
      </Card>
    </div>
    </>
  );
}

