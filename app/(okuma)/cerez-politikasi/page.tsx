import type { Metadata } from 'next';
import { ConsentPreferencesButton, ConsentSummaryCard } from '@/components/analytics/consent-preferences-button';
import { LegalDocument, LegalLink, type LegalSection } from '@/components/public/p-blog-yasal/legal-document';
import { CONSENT_CATEGORY_LABELS, CONSENT_MAX_AGE_SECONDS, type ConsentCategory } from '@/lib/consent';
import { COOKIELESS_MEASUREMENT, COOKIE_INVENTORY } from '@/lib/consent/inventory';
import { LEGAL_CONTACT_EMAIL, getLegalDocument } from '@/lib/legal/documents';
import { buildLegalMetadata, getReadingSeoContext } from '@/lib/legal/seo';
import { getPageSeo } from '@/lib/seo-settings';

/**
 * Çerez Politikası — envanter ve kategori metinleri rıza modülünden (`lib/consent`) gelir;
 * tercih merkezi banner, sayfa altı ve Ayarlar › Gizlilik ile aynı kaynak (`useConsent`).
 * Kullanılan kategoriler: zorunlu, analitik, oturum kaydı. Pazarlama kategorisi KULLANILMAZ
 * (tercih merkezinde de yok); metin bunu açıkça söyler.
 */
const SLUG = 'cerez-politikasi' as const;

export function generateMetadata(): Promise<Metadata> {
  return buildLegalMetadata(SLUG);
}

const CATEGORY_ORDER: ConsentCategory[] = ['necessary', 'analytics', 'replay'];

const CATEGORY_INTRO: Record<ConsentCategory, string> = {
  necessary:
    'Hizmetin çalışması için gereklidir: giriş oturumu, güvenlik, dil ve rıza tercihinizin kendisi. KVKK m.5/2-c (sözleşmenin ifası) ve m.5/2-f (meşru menfaat) kapsamında işlenir; kapatılamaz, ancak tarayıcı ayarlarınızdan silebilirsiniz (bu durumda oturumunuz kapanır).',
  analytics:
    'Yalnız açık rızanızla çalışır. Onay vermezseniz analitik kütüphanesi hiç yüklenmez ve üçüncü tarafa istek gitmez. Gönderilen sayfa adreslerinden giriş bağlantıları, doğrulama kodları ve benzeri gizli değerler önceden silinir.',
  replay:
    'Analitikten ayrı, ikinci bir onay ister. Form alanlarına yazdıklarınız maskelenir; giriş, şifre sıfırlama, yönetici kapısı ve kart/paylaşım bağlantısı sayfaları hiç kaydedilmez.',
  marketing: '',
};

const CONSENT_DAYS = Math.round(CONSENT_MAX_AGE_SECONDS / 86_400);

function InventoryTable({ category }: { category: ConsentCategory }) {
  const rows = COOKIE_INVENTORY.filter((i) => i.category === category);
  const label = CONSENT_CATEGORY_LABELS[category].title;
  return (
    <>
      {/* Mobil: kart listesi (yatay kaydırma yok) */}
      <ul className="space-y-2 sm:hidden" aria-label={`${label} çerez ve depolama öğeleri`}>
        {rows.map((r) => (
          <li key={r.name} className="rounded-control border border-border bg-surface-1 p-3 text-sm">
            <p className="break-words font-mono text-xs text-fg">{r.name}</p>
            <p className="mt-1 text-fg">{r.purpose}</p>
            <p className="mt-1 text-xs text-fg-muted">
              {r.provider} · {r.kind} · {r.duration}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-control border border-border sm:block">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">{label} çerez ve depolama öğeleri</caption>
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Ad</th>
              <th scope="col" className="px-3 py-2 font-medium">Sağlayıcı</th>
              <th scope="col" className="px-3 py-2 font-medium">Tür</th>
              <th scope="col" className="px-3 py-2 font-medium">Amaç</th>
              <th scope="col" className="px-3 py-2 font-medium">Süre</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.name} className="align-top">
                <th scope="row" className="px-3 py-2 font-mono text-xs font-normal text-fg">{r.name}</th>
                <td className="px-3 py-2">{r.provider}</td>
                <td className="px-3 py-2">{r.kind}</td>
                <td className="px-3 py-2">{r.purpose}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default async function CerezPolitikasiPage() {
  const doc = getLegalDocument(SLUG);
  const [{ base }, override] = await Promise.all([getReadingSeoContext(), getPageSeo(doc.path)]);

  const sections: LegalSection[] = [
    {
      id: 'tercihleriniz',
      title: 'Tercihleriniz',
      body: (
        <>
          <p>Şu an bu tarayıcıda geçerli olan karar aşağıdadır. Ret, kabul kadar kolaydır ve hizmeti kullanmanızı engellemez.</p>
          <div className="print:hidden">
            <ConsentSummaryCard surface="policy" />
          </div>
          <p>
            Tercihiniz bu tarayıcıda {CONSENT_DAYS} gün geçerlidir; politika değişirse yeniden sorarız. Oturum açtıysanız kararınız
            hesabınıza da kaydedilir ve yeni cihazınızda yeniden sorulmaz.
          </p>
        </>
      ),
    },
    {
      id: 'kategoriler',
      title: 'Kategoriler ve envanter',
      body: (
        <>
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} id={`kategori-${cat}`} className="scroll-mt-24 space-y-3 pt-2">
              <h3 className="qx-h3 text-fg">{CONSENT_CATEGORY_LABELS[cat].title}</h3>
              <p>{CATEGORY_INTRO[cat]}</p>
              <InventoryTable category={cat} />
            </div>
          ))}
          <p>
            <strong>Pazarlama:</strong> pazarlama veya reklam çerezi kullanmıyoruz; tercih merkezinde bu yüzden böyle bir seçenek yoktur.
            Böyle bir kategori eklenirse önce bu politika güncellenir ve onayınız ayrıca sorulur.
          </p>
        </>
      ),
    },
    {
      id: 'cerezsiz',
      title: 'Çerezsiz ölçüm',
      body: (
        <>
          <p>
            Aşağıdaki araçlar çerez veya kalıcı kimlik kullanmaz, kişisel profil oluşturmaz; sayfa adresindeki gizli değerler gönderilmeden önce
            silinir.
          </p>
          <ul>
            {COOKIELESS_MEASUREMENT.map((m) => (
              <li key={m.name}>
                <strong>{m.name}</strong> ({m.provider}): {m.purpose}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'aktarim',
      title: 'Üçüncü taraflar ve yurt dışına aktarım',
      body: (
        <p>
          Onay verirseniz analitik ve oturum kaydı PostHog Inc. tarafından AB (Frankfurt) bölgesindeki sunucularda işlenir. Uygulamanın
          barındırıldığı Vercel altyapısı da AB (Frankfurt) bölgesindedir. Tüm hizmet sağlayıcılarımız ve bölgeleri{' '}
          <LegalLink href="/gizlilik-politikasi#paylasim">Gizlilik Politikası</LegalLink>’nda; aktarımın hukuki dayanağı{' '}
          <LegalLink href="/kvkk-aydinlatma-metni#aktarim">KVKK Aydınlatma Metni</LegalLink>’nde yer alır.
        </p>
      ),
    },
    {
      id: 'silme',
      title: 'Çerezleri silmek',
      body: (
        <>
          <p>
            Rızanızı geri çektiğinizde analitik çerezleri ve yerel depolama anahtarları tarayıcınızdan silinir. Diğer kayıtları tarayıcınızın
            ayarlarından (site verilerini temizle) her an silebilirsiniz; zorunlu çerezler silinirse oturumunuz kapanır ve tercihiniz yeniden
            sorulur.
          </p>
          <p className="print:hidden">
            <ConsentPreferencesButton surface="policy" variant="outline" showIcon className="min-h-11" />
          </p>
        </>
      ),
    },
    {
      id: 'haklar',
      title: 'Haklarınız ve iletişim',
      body: (
        <p>
          KVKK m.11 kapsamındaki erişim, düzeltme, silme ve itiraz haklarınızı hesabınızın{' '}
          <LegalLink href="/customer/me/settings?tab=privacy">Ayarlar › Gizlilik</LegalLink> bölümünden kullanabilirsiniz; başvurunuz en geç 30 gün
          içinde sonuçlandırılır. Hesabınız yoksa <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</LegalLink> adresine
          yazabilirsiniz.
        </p>
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
        { text: 'Zorunlu çerezler yalnız oturum, güvenlik ve tercihlerinizi hatırlamak içindir.', href: '#kategori-necessary' },
        { text: 'Analitik ve oturum kaydı ayrı ayrı sorulur; onay vermezseniz hiç çalışmaz.', href: '#kategoriler' },
        { text: 'Pazarlama veya reklam çerezi kullanmıyoruz; verinizi reklam amacıyla paylaşmıyoruz.' },
        { text: 'Kararınızı bu sayfadan, sayfa altındaki “Çerez tercihleri” bağlantısından ya da Ayarlar › Gizlilik’ten her an değiştirebilirsiniz.', href: '#tercihleriniz' },
      ]}
      sections={sections}
    />
  );
}
