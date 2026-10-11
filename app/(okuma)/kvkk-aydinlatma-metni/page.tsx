import type { Metadata } from 'next';
import { ConsentPreferencesButton } from '@/components/analytics/consent-preferences-button';
import { LegalDocument, LegalLink, type LegalSection } from '@/components/public/p-blog-yasal/legal-document';
import { CategoryTable, ProcessorTable } from '@/components/public/p-blog-yasal/legal-tables';
import { DSR_LEGAL_DAYS } from '@/lib/dsr-workflow';
import { LEGAL_CONTACT_EMAIL, getLegalDocument } from '@/lib/legal/documents';
import { buildLegalCategoryRows } from '@/lib/legal/inventory-view';
import { buildLegalMetadata, getReadingSeoContext } from '@/lib/legal/seo';
import { getPageSeo } from '@/lib/seo-settings';

/**
 * KVKK Aydınlatma Metni (KVKK m.10) — sistemden türeyen metin (P0-34).
 *
 * Veri kategorileri, hukuki sebepler, saklama süreleri ve silme talebinde ne olacağı ELLE
 * yazılmaz: kişisel veri envanterinden (`lib/pii-registry.ts` → `lib/legal/inventory-view.ts`)
 * üretilir. Hizmet sağlayıcılar `lib/legal/processors.ts`'ten gelir. Sürüm ve yürürlük tarihi
 * `lib/legal/documents.ts`'te (render anı değil).
 */
const SLUG = 'kvkk-aydinlatma-metni' as const;

export function generateMetadata(): Promise<Metadata> {
  return buildLegalMetadata(SLUG);
}

const PRIVACY_SETTINGS = '/customer/me/settings?tab=privacy';

const RIGHTS: Array<{ text: string; action?: { href: string; label: string } }> = [
  { text: 'Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme (m.11/1-a, b)', action: { href: PRIVACY_SETTINGS, label: 'Verilerimi indir' } },
  { text: 'İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme (m.11/1-c)' },
  { text: 'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme (m.11/1-ç)', action: { href: '#aktarim', label: 'Sağlayıcı listesi' } },
  { text: 'Eksik veya yanlış işlenmişse düzeltilmesini isteme (m.11/1-d)', action: { href: PRIVACY_SETTINGS, label: 'Düzeltme başvurusu' } },
  { text: 'Silinmesini veya yok edilmesini isteme (m.11/1-e)', action: { href: PRIVACY_SETTINGS, label: 'Silme başvurusu' } },
  { text: 'Düzeltme ve silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme (m.11/1-f)' },
  { text: 'Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuca itiraz etme (m.11/1-g)', action: { href: PRIVACY_SETTINGS, label: 'İtiraz başvurusu' } },
  { text: 'Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme (m.11/1-ğ)' },
];

export default async function KvkkAydinlatmaPage() {
  const doc = getLegalDocument(SLUG);
  const [{ base }, override] = await Promise.all([getReadingSeoContext(), getPageSeo(doc.path)]);
  const rows = buildLegalCategoryRows();

  const sections: LegalSection[] = [
    {
      id: 'veri-sorumlusu',
      title: 'Veri sorumlusu',
      body: (
        <>
          <p>
            6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında veri sorumlusu QRateX’tir. Bu metin; müşteri, işletme ve
            personel hesaplarıyla QR geri bildirim formunu kullanan ziyaretçileri kapsar. İşletmelerin kendi müşterileri hakkında tuttuğu
            ticari kayıtlarda işletme ayrıca veri sorumlusudur.
          </p>
          <p>
            İletişim: <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</LegalLink>
          </p>
        </>
      ),
    },
    {
      id: 'kategoriler',
      title: 'İşlenen veriler, hukuki sebepler ve saklama süreleri',
      body: (
        <>
          <p>
            Aşağıdaki tablo sistemdeki kişisel veri envanterinden otomatik üretilir; silme talebinizde ve saklama süresi dolduğunda tam olarak
            burada yazan uygulanır.
          </p>
          <CategoryTable rows={rows} variant="legal" />
          <p>
            Hesabınızı sildiğinizde ad, e-posta, telefon ve adres gibi doğrudan tanımlayıcılar geri döndürülemez biçimde anonimleştirilir; açık
            oturumlarınız kapanır. Puan ve puanlama istatistikleri işletmelerin ticari kaydı olduğu için kimliksiz olarak kalır.
          </p>
        </>
      ),
    },
    {
      id: 'amaclar',
      title: 'İşleme amaçları',
      body: (
        <ul>
          <li>Hesabınızın açılması, giriş ve güvenliğin sağlanması.</li>
          <li>Geri bildirimlerinizin işletmeye iletilmesi, işletme yanıtları ve telafi tekliflerinin size ulaştırılması.</li>
          <li>Puan, ödül, rozet, oyun ve kampanya hizmetlerinin yürütülmesi.</li>
          <li>Sahtecilik ve kötüye kullanımın önlenmesi, denetim kayıtlarının tutulması.</li>
          <li>Yasal yükümlülüklerin (5651, vergi ve ticaret mevzuatı, KVKK başvurularının ispatı) yerine getirilmesi.</li>
          <li>Yalnız açık rızanızla: ürün analitiği ve oturum kaydı.</li>
        </ul>
      ),
    },
    {
      id: 'toplama',
      title: 'Toplama yöntemi',
      body: (
        <p>
          Verileriniz kayıt ve profil formlarından, QR kodu okutarak doldurduğunuz geri bildirim formundan, uygulama içi işlemlerinizden
          (ziyaret, puan, oyun, sohbet), tarayıcınızın gönderdiği teknik bilgilerden ve yalnız onay verdiyseniz analitik araçlarından elektronik
          ortamda, otomatik ya da kısmen otomatik yollarla toplanır. Yakınınızdaki işletmeleri görmek için konum izni verirseniz konumunuz
          yalnız o aramada kullanılır ve cihazınızda kısa süre önbelleğe alınır.
        </p>
      ),
    },
    {
      id: 'aktarim',
      title: 'Aktarım ve hizmet sağlayıcılar',
      body: (
        <>
          <p>
            Verileriniz satılmaz ve reklam amacıyla paylaşılmaz. Hizmetin sunulması için aşağıdaki sağlayıcılarla, yalnız gereken ölçüde
            paylaşılır. Sağlayıcıların bir kısmı yurt dışındadır; bu aktarımlar KVKK m.9 kapsamındaki dayanaklara (hizmetin ifası için zorunlu
            aktarım, açık rıza) bağlıdır.
          </p>
          <ProcessorTable />
          <ul>
            <li>Geri bildirim verdiğiniz ve ziyaret ettiğiniz işletme: yorumunuz, puanınız, ziyaret bilgileriniz ve hesabınızla işlem yaptıysanız profil adınız.</li>
            <li>Yetkili kamu kurumları: yalnız yasal zorunluluk hâlinde.</li>
            <li>
              Analitik ve oturum kaydı tercihinizi{' '}
              <ConsentPreferencesButton surface="policy" className="font-medium text-brand underline underline-offset-4" /> üzerinden her an
              değiştirebilirsiniz; ayrıntılar <LegalLink href="/cerez-politikasi">Çerez Politikası</LegalLink>’nda.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'otomatik',
      title: 'Otomatik değerlendirmeler',
      body: (
        <p>
          Yorumlarınız yapay zekâ ile duygu ve konu bakımından sınıflandırılır; sahtecilik önleme için hesaplara bir güven puanı hesaplanır ve
          olağandışı etkinlikte kazanımlar otomatik olarak geçersiz sayılabilir (bkz.{' '}
          <LegalLink href="/kullanim-sartlari#hile">Kullanım Şartları, hile ve kötüye kullanım</LegalLink>). Bu değerlendirmeler veri
          paketinizde size gösterilir; aleyhinize bir sonuç doğurduğunu düşünüyorsanız itiraz edebilirsiniz.
        </p>
      ),
    },
    {
      id: 'haklar',
      title: 'KVKK m.11 kapsamındaki haklarınız',
      body: (
        <ul className="!list-none !space-y-2 !pl-0">
          {RIGHTS.map((r) => (
            <li
              key={r.text}
              className="flex flex-col gap-1 rounded-control border border-border bg-surface-1 p-3 text-[15px] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span>{r.text}</span>
              {r.action ? (
                <span className="shrink-0 print:hidden">
                  <LegalLink href={r.action.href}>{r.action.label}</LegalLink>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'basvuru',
      title: 'Başvuru',
      body: (
        <>
          <p>
            Hesabınız varsa haklarınızı <LegalLink href={PRIVACY_SETTINGS}>Ayarlar › Gizlilik</LegalLink> bölümünden kullanabilirsiniz: veri
            paketinizi anında indirebilir; düzeltme, silme ve itiraz başvurusu yapabilir; başvurunuzun her adımını izleyebilirsiniz. Başvurunuz
            en geç {DSR_LEGAL_DAYS} gün içinde sonuçlandırılır ve sonuç hesabınızın e-posta adresine bildirilir.
          </p>
          <p>
            Hesabınız yoksa başvurunuzu kimliğinizi doğrulayacak bilgilerle{' '}
            <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</LegalLink> adresine iletebilirsiniz. Başvurunuz reddedilir ya
            da yanıtı yetersiz bulursanız Kişisel Verileri Koruma Kurulu’na şikâyette bulunabilirsiniz.
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
        { text: 'Hangi verinizi hangi hukuki sebeple, ne kadar sakladığımız sistemdeki envanterden otomatik üretilir.', href: '#kategoriler' },
        { text: 'Verileriniz satılmaz; yalnız hizmeti sunan sağlayıcılarla, gerektiği kadar paylaşılır.', href: '#aktarim' },
        { text: 'Yorumlarınız yapay zekâ ile sınıflandırılır; otomatik bir sonuca itiraz edebilirsiniz.', href: '#otomatik' },
        { text: `Haklarınızı Ayarlar › Gizlilik’ten kullanırsınız; başvurular en geç ${DSR_LEGAL_DAYS} günde sonuçlanır.`, href: '#basvuru' },
      ]}
      sections={sections}
    />
  );
}
