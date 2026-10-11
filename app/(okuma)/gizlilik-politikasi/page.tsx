import type { Metadata } from 'next';
import { Cookie, Download, FileSignature, UserX } from 'lucide-react';
import { ConsentPreferencesButton } from '@/components/analytics/consent-preferences-button';
import { LegalDocument, LegalLink, type LegalSection } from '@/components/public/p-blog-yasal/legal-document';
import { CategoryTable, ProcessorTable } from '@/components/public/p-blog-yasal/legal-tables';
import { DSR_LEGAL_DAYS } from '@/lib/dsr-workflow';
import { LEGAL_CONTACT_EMAIL, getLegalDocument } from '@/lib/legal/documents';
import { buildLegalCategoryRows } from '@/lib/legal/inventory-view';
import { buildLegalMetadata, getReadingSeoContext } from '@/lib/legal/seo';
import { getPageSeo } from '@/lib/seo-settings';

/**
 * Gizlilik Politikası — KVKK Aydınlatma Metni'nin sade dilli, eyleme dönük karşılığı.
 * Veri grupları + saklama süreleri envanterden, sağlayıcılar `lib/legal/processors.ts`'ten,
 * sürüm `lib/legal/documents.ts`'ten gelir. Her iddia koddaki bir davranışa dayanır:
 *  - sıralama tablosunda ad "Ad S." biçiminde (`publicDisplayName`), görünürlük ayarı var;
 *  - bağış listelerinde ad maskeli; hesap silme = anonimleştirme (`previewUserErasure`);
 *  - analitik/oturum kaydı yalnız rızayla (`lib/consent`).
 */
const SLUG = 'gizlilik-politikasi' as const;
const PRIVACY_SETTINGS = '/customer/me/settings?tab=privacy';

export function generateMetadata(): Promise<Metadata> {
  return buildLegalMetadata(SLUG);
}

function ActionCard({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border bg-surface-1 p-4">
      <p className="flex items-center gap-2 font-semibold text-fg">
        <span className="grid h-8 w-8 place-items-center rounded-control bg-brand-subtle text-brand" aria-hidden>
          {icon}
        </span>
        {title}
      </p>
      <p className="text-sm leading-6 text-fg-muted">{body}</p>
      <div className="mt-auto pt-1 print:hidden">{action}</div>
    </li>
  );
}

export default async function GizlilikPolitikasiPage() {
  const doc = getLegalDocument(SLUG);
  const [{ base }, override] = await Promise.all([getReadingSeoContext(), getPageSeo(doc.path)]);
  const rows = buildLegalCategoryRows();

  const sections: LegalSection[] = [
    {
      id: 'kapsam',
      title: 'Bu politika kimi kapsar?',
      body: (
        <p>
          QR kodu okutup geri bildirim bırakan ziyaretçileri, müşteri hesabıyla puan ve ödül kazanan kullanıcıları, işletme (bayi) ve personel
          hesaplarını kapsar. Burada sade bir dille anlatılanların hukuki karşılığı (hukuki sebepler, silme talebinde uygulanan işlem){' '}
          <LegalLink href="/kvkk-aydinlatma-metni">KVKK Aydınlatma Metni</LegalLink>’ndedir; iki metin aynı veri envanterinden üretilir.
        </p>
      ),
    },
    {
      id: 'veriler',
      title: 'Hangi verileri, ne kadar süre işliyoruz?',
      body: (
        <>
          <p>
            Tablo, sistemdeki kişisel veri envanterinden otomatik üretilir. “Otomatik silinir” yazan süreler günlük temizlikte gerçekten
            uygulanır; diğerleri hesabınız açık kaldığı sürece ya da yasal saklama süresi boyunca tutulur.
          </p>
          <CategoryTable rows={rows} variant="privacy" />
        </>
      ),
    },
    {
      id: 'kullanim',
      title: 'Verilerinizi ne için kullanıyoruz?',
      body: (
        <ul>
          <li>Hesabınızı açmak, giriş yapmanızı ve hesabınızın güvenliğini sağlamak.</li>
          <li>Geri bildiriminizi işletmeye iletmek; işletmenin yanıtını ve telafi tekliflerini size ulaştırmak.</li>
          <li>Puan, seviye, rozet, görev, oyun, turnuva, klan ve ödül özelliklerini çalıştırmak.</li>
          <li>Size uygun işletme ve kampanya önerileri göstermek (uygulama içi; reklam ağı yoktur).</li>
          <li>Sahteciliği ve kötüye kullanımı önlemek, yasal yükümlülükleri yerine getirmek.</li>
          <li>Yalnız açık rızanızla: ürünü iyileştirmek için kullanım analitiği ve oturum kaydı.</li>
        </ul>
      ),
    },
    {
      id: 'gorunurluk',
      title: 'Diğer kullanıcılar neyi görür?',
      body: (
        <>
          <ul>
            <li>
              Lig ve sıralama tablolarında adınız “Ad S.” biçiminde kısaltılarak, profil fotoğrafınız, seviyeniz ve puanınızla görünür. Sıralamada
              ve profilde görünmeyi Ayarlar’dan kapatabilirsiniz.
            </li>
            <li>Bağış listelerinde adınız maskelenir (ör. “Ayşe Y.”) ve fotoğrafınız gösterilmez.</li>
            <li>Geri bildirim verdiğiniz işletme yorumunuzu, puanınızı ve ziyaret bilgilerinizi görür.</li>
            <li>E-posta adresiniz ve telefonunuz diğer müşterilere gösterilmez. Size hediye gönderen biri, adresinizi kendisi yazdıysa alıcıyı doğrulamak için yalnız maskelenmiş hâlini görür.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'yapay-zeka',
      title: 'Yapay zekâ ve otomatik değerlendirmeler',
      body: (
        <>
          <p>
            Yorum metinleri, işletmenin geri bildirimleri anlayabilmesi için yapay zekâ ile duygu ve konu bakımından sınıflandırılır. Bu analiz
            ve QRA asistanıyla yaptığınız sohbetler yapay zekâ sağlayıcısına (Groq, ABD) gönderilir. Sahteciliği önlemek için hesaplara
            otomatik bir güven puanı hesaplanır; olağandışı etkinlikte kazanımlar geçersiz sayılabilir.
          </p>
          <p>
            Bu değerlendirmeler veri paketinizde size gösterilir. Aleyhinize bir sonuç doğurduğunu düşünüyorsanız{' '}
            <LegalLink href={PRIVACY_SETTINGS}>itiraz başvurusu</LegalLink> yapabilirsiniz (KVKK m.11/1-g).
          </p>
        </>
      ),
    },
    {
      id: 'paylasim',
      title: 'Kimlerle paylaşıyoruz?',
      body: (
        <>
          <p>
            Verilerinizi satmıyor, reklam amacıyla paylaşmıyoruz. Hizmeti sunabilmek için aşağıdaki sağlayıcılarla yalnız gerektiği kadar
            paylaşıyoruz. Listedeki her sağlayıcı uygulamadaki gerçek bir entegrasyona karşılık gelir.
          </p>
          <ProcessorTable />
          <p>Yetkili kamu kurumlarıyla yalnız yasal zorunluluk hâlinde paylaşırız.</p>
        </>
      ),
    },
    {
      id: 'yurt-disi',
      title: 'Yurt dışına aktarım',
      body: (
        <p>
          Uygulama sunucularımız AB (Frankfurt) bölgesindedir; veritabanı, e-posta, yapay zekâ ve hata izleme sağlayıcılarının bir kısmı yurt
          dışındadır. Bu aktarımlar hizmetin sunulması için gereklidir ve KVKK m.9 kapsamındaki dayanaklara bağlıdır; analitik ve oturum kaydı
          ise yalnız açık rızanızla yapılır. Ayrıntılar{' '}
          <LegalLink href="/kvkk-aydinlatma-metni#aktarim">KVKK Aydınlatma Metni</LegalLink>’nde.
        </p>
      ),
    },
    {
      id: 'guvenlik',
      title: 'Güvenlik',
      body: (
        <p>
          Şifreler tek yönlü özetlenerek saklanır; iki adımlı doğrulama kullanabilir, açık oturumlarınızı görüp kapatabilirsiniz. Giriş
          denemeleri ve hassas işlemler sınırlandırılır ve denetim kaydına geçer. Teknik önlemlerin özeti{' '}
          <LegalLink href="/guven">Güven</LegalLink> sayfasında.
        </p>
      ),
    },
    {
      id: 'cerezler',
      title: 'Çerezler',
      body: (
        <p>
          Zorunlu çerezler dışında hiçbir izleme aracı onayınız olmadan çalışmaz. Hangi çerezin ne kadar tutulduğu{' '}
          <LegalLink href="/cerez-politikasi">Çerez Politikası</LegalLink>’nda; tercihinizi{' '}
          <ConsentPreferencesButton surface="policy" className="font-medium text-brand underline underline-offset-4" /> üzerinden her an
          değiştirebilirsiniz.
        </p>
      ),
    },
    {
      id: 'haklar',
      title: 'Haklarınızı kullanın',
      body: (
        <>
          <p>
            Haklarınızın çoğunu e-posta yazmadan, hesabınızın içinden kullanabilirsiniz. Başvurular en geç {DSR_LEGAL_DAYS} gün içinde
            sonuçlandırılır; giriş yapmadıysanız bağlantılar önce giriş ekranına götürür.
          </p>
          <ul className="!list-none !pl-0 grid gap-3 sm:grid-cols-2 [&>li]:!mt-0">
            <ActionCard
              icon={<Download className="h-4 w-4" />}
              title="Verilerimi indir"
              body="Hesabınıza bağlı kişisel verilerin makine tarafından okunabilir kopyası; anında hazırlanır."
              action={<LegalLink href={PRIVACY_SETTINGS}>Ayarlar › Gizlilik’e git</LegalLink>}
            />
            <ActionCard
              icon={<FileSignature className="h-4 w-4" />}
              title="Düzeltme, itiraz, silme başvurusu"
              body="Başvurunuzun makbuzu e-postanıza gelir; her adımını “Başvurularım”da izlersiniz."
              action={<LegalLink href={PRIVACY_SETTINGS}>Başvuru yap</LegalLink>}
            />
            <ActionCard
              icon={<UserX className="h-4 w-4" />}
              title="Hesabımı sil"
              body="Hesap geri döndürülemez biçimde anonimleştirilir; neyi kaybedeceğinizi silmeden önce görürsünüz."
              action={<LegalLink href={PRIVACY_SETTINGS}>Hesap silme</LegalLink>}
            />
            <ActionCard
              icon={<Cookie className="h-4 w-4" />}
              title="Çerez tercihleri"
              body="Analitik ve oturum kaydı onayınızı verin ya da geri çekin."
              action={<ConsentPreferencesButton surface="policy" className="font-medium text-brand underline underline-offset-4" />}
            />
          </ul>
          <p>
            Hesabınız yoksa: <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</LegalLink>. Yanıtımızı yetersiz bulursanız
            Kişisel Verileri Koruma Kurulu’na şikâyette bulunabilirsiniz.
          </p>
        </>
      ),
    },
  ];

  return (
    <LegalDocument
      doc={doc}
      base={base}
      title={override?.title || doc.title}
      description={override?.description || doc.description}
      summary={[
        { text: 'Topladığımız her veri grubu ve saklama süresi sistemdeki envanterden otomatik listelenir.', href: '#veriler' },
        { text: 'Verilerinizi satmıyoruz; yalnız hizmeti sunan, adını yazdığımız sağlayıcılarla paylaşıyoruz.', href: '#paylasim' },
        { text: 'Yorumlarınız yapay zekâ ile analiz edilir; otomatik bir sonuca itiraz edebilirsiniz.', href: '#yapay-zeka' },
        { text: 'Sıralamalarda adınız kısaltılır; e-posta ve telefonunuz diğer müşterilere gösterilmez.', href: '#gorunurluk' },
        { text: 'Verilerinizi indirme, düzeltme ve silme haklarınızı uygulamanın içinden kullanırsınız.', href: '#haklar' },
      ]}
      sections={sections}
    />
  );
}
