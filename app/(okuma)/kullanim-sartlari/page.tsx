import type { Metadata } from 'next';
import { LegalDocument, LegalLink, type LegalSection } from '@/components/public/p-blog-yasal/legal-document';
import { ECONOMY_CAPS } from '@/lib/economy/caps';
import { TOURNAMENT_MIN_PARTICIPANTS } from '@/lib/game-tournament';
import { TOURNAMENT_PRIZES } from '@/lib/tournament-core';
import { LEGAL_CONTACT_EMAIL, getLegalDocument } from '@/lib/legal/documents';
import { buildLegalMetadata, getReadingSeoContext } from '@/lib/legal/seo';
import { getPageSeo } from '@/lib/seo-settings';

/**
 * Kullanım Şartları — oyunun kural kitabı.
 *
 * Sayısal kurallar ELLE YAZILMAZ: puan tavanları `lib/economy/caps.ts` (ECONOMY_CAPS),
 * turnuva ödülleri ve en az oyuncu sayısı `lib/tournament-core.ts` / `lib/game-tournament.ts`
 * sabitlerinden okunur; kod değişince metin de değişir (ekranda yazan kural = uygulanan kural).
 * Bölüm çapaları (`#puanlar`, `#hile`, `#hesap-kapatma` …) ürün ekranlarından derin
 * bağlantı hedefidir — değiştirmeyin.
 */
const SLUG = 'kullanim-sartlari' as const;
const PRIVACY_SETTINGS = '/customer/me/settings?tab=privacy';

export function generateMetadata(): Promise<Metadata> {
  return buildLegalMetadata(SLUG);
}

const nf = new Intl.NumberFormat('tr-TR');
const n = (v: number | undefined) => (typeof v === 'number' ? nf.format(v) : '—');

const CAP_ROWS: Array<{ label: string; daily: string; weekly: string }> = [
  { label: 'Geri bildirim ve tüketim yorumu', daily: n(ECONOMY_CAPS.feedback.daily), weekly: n(ECONOMY_CAPS.feedback.weekly) },
  { label: 'Mini oyun ödülleri', daily: n(ECONOMY_CAPS.game.daily), weekly: n(ECONOMY_CAPS.game.weekly) },
  {
    label: 'İşletme ziyareti (tüketim) puanı',
    daily: `${n(ECONOMY_CAPS.dealer_passive.daily)} (işletme başına ${n(ECONOMY_CAPS.dealer_passive.perActorDaily)})`,
    weekly: '—',
  },
  { label: 'Telafi teklifi puanı', daily: n(ECONOMY_CAPS.remedy.daily), weekly: n(ECONOMY_CAPS.remedy.weekly) },
];

const PRIZE_TEXT = Object.entries(TOURNAMENT_PRIZES)
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([rank, pts]) => `${rank}. sıra ${nf.format(pts)} puan`)
  .join(', ');

export default async function KullanimSartlariPage() {
  const doc = getLegalDocument(SLUG);
  const [{ base }, override] = await Promise.all([getReadingSeoContext(), getPageSeo(doc.path)]);

  const sections: LegalSection[] = [
    {
      id: 'taraflar',
      title: 'Taraflar ve kapsam',
      body: (
        <>
          <p>
            Bu şartlar, QRateX platformunu (web sitesi, müşteri, işletme ve personel panelleri, QR geri bildirim formu) kullanan herkes ile
            QRateX arasındaki kuralları belirler. Hesap açarak ya da hizmeti kullanarak bu şartları kabul etmiş olursunuz. Kişisel verileriniz
            için ayrıca <LegalLink href="/gizlilik-politikasi">Gizlilik Politikası</LegalLink> ve{' '}
            <LegalLink href="/kvkk-aydinlatma-metni">KVKK Aydınlatma Metni</LegalLink> geçerlidir.
          </p>
          <p>
            <strong>Tanımlar.</strong> “Müşteri”: QR okutan, geri bildirim veren, puan ve ödül kazanan kullanıcı. “İşletme”: QR kodları ve
            kampanyaları yöneten hesap sahibi. “Puan”: platform içi etkinliklerle kazanılan ve yalnız platformda kullanılabilen birim.
          </p>
        </>
      ),
    },
    {
      id: 'hesap',
      title: 'Hesabınız',
      body: (
        <ul>
          <li>Hesap bilgilerinizi doğru tutmak ve şifrenizi kimseyle paylaşmamak sizin sorumluluğunuzdadır.</li>
          <li>Her kişi tek müşteri hesabı kullanır; puan ya da sıralama kazanmak için ek hesap açmak yasaktır.</li>
          <li>Google hesabınızla da giriş yapabilirsiniz; bu durumda da bu şartlar geçerlidir.</li>
          <li>İki adımlı doğrulamayı açabilir, açık oturumlarınızı Ayarlar’dan görüp kapatabilirsiniz.</li>
        </ul>
      ),
    },
    {
      id: 'icerik',
      title: 'Geri bildirim ve içerik',
      body: (
        <>
          <p>
            Bıraktığınız yorum, puan ve fotoğraflar ilgili işletmeye iletilir ve işletmenin hizmetini iyileştirmesi için kullanılır. Yorum
            metinleri yapay zekâ ile duygu ve konu bakımından sınıflandırılır (bkz.{' '}
            <LegalLink href="/gizlilik-politikasi#yapay-zeka">Gizlilik Politikası</LegalLink>).
          </p>
          <ul>
            <li>Gerçek bir deneyime dayanmayan, yanıltıcı, hakaret, nefret söylemi, kişisel veri ya da reklam içeren içerik paylaşılamaz.</li>
            <li>Kurallara aykırı içerik kaldırılabilir; bu içerikle kazanılan puanlar geri alınabilir.</li>
            <li>İçeriğinizin sahibi sizsiniz; hizmetin sunulması için ilgili işletmeyle paylaşılmasına izin vermiş olursunuz.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'puanlar',
      title: 'Puan, XP, rozet ve ligler',
      body: (
        <>
          <ul>
            <li>Puanın nakit karşılığı yoktur; paraya çevrilemez, satılamaz ve başka bir hesaba aktarılamaz.</li>
            <li>
              Puanı yalnız platformun sunduğu yollarla harcayabilirsiniz (ör. ödül ve kozmetik alımı, hediye, bağış kampanyaları, klan savaşı ödül
              havuzu).
            </li>
            <li>Her puan hareketi hesabınızın puan defterine yazılır; aynı işlem iki kez ödüllendirilmez.</li>
            <li>
              Teknik bir hatayla yanlış verilen ya da düşülen puan, defter kaydına dayanılarak düzeltilir.
            </li>
          </ul>
          <p>Ekonominin dengede kalması için puan kazanımı tavanlarla sınırlıdır (uygulamadaki güncel değerler):</p>
          <div className="overflow-x-auto rounded-control border border-border">
            <table className="w-full min-w-[30rem] text-left text-sm leading-6">
              <caption className="sr-only">Kategori bazında günlük ve haftalık puan kazanım tavanları</caption>
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Kazanım</th>
                  <th scope="col" className="px-3 py-2 font-medium">Günlük tavan</th>
                  <th scope="col" className="px-3 py-2 font-medium">Haftalık tavan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CAP_ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="px-3 py-2 font-medium text-fg">
                      {r.label}
                    </th>
                    <td className="qx-num px-3 py-2">{r.daily}</td>
                    <td className="qx-num px-3 py-2">{r.weekly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-fg-muted">
            Gün ve hafta sınırı UTC’ye göre hesaplanır (Türkiye saatiyle 03:00; hafta pazartesi başlar). Tavana ulaşıldığında kazanım kısılır ya da
            sıfırlanır; işlemin kendisi (ör. yorumunuz) yine kaydedilir.
          </p>
        </>
      ),
    },
    {
      id: 'oyunlar',
      title: 'Oyunlar, turnuvalar ve klanlar',
      body: (
        <ul>
          <li>
            Haftalık turnuva tek bir öne çıkan oyunda yapılır. Sıralama en iyi skora göre belirlenir; eşitlikte o skora önce ulaşan öne geçer.
            Ödüller: {PRIZE_TEXT}. Sıralamada {TOURNAMENT_MIN_PARTICIPANTS}’ten az oyuncu varsa o hafta ödül verilmez.
          </li>
          <li>Diğer oyunların haftalık sıralaması gösterilir ancak ödülsüzdür.</li>
          <li>
            Klan savaşında meydan okuyan klanın ortaya koyduğu ödül havuzu, savaş sonuçlanana kadar emanette tutulur. Savaş iptal edilir, geri
            çekilir ya da süresinde yanıtlanmazsa havuzun tamamı iade edilir. Savaş sonuçlanırsa havuz, kazanan klanın savaş kadrosundaki üyeler arasında eşit paylaştırılır; berabere biterse iade edilir.
          </li>
          <li>Klan kurucusu ayrılırsa liderlik en eski üyeye devredilir; klan yalnız son üye ayrıldığında kapanır.</li>
        </ul>
      ),
    },
    {
      id: 'oduller',
      title: 'Ödüller, sürpriz kutular, hediye ve bağış',
      body: (
        <ul>
          <li>
            Ödül kodları ve kuponlar ilgili işletmede, belirtilen geçerlilik süresi ve koşullar içinde kullanılır. Stok ve koşullar ödülü sunan
            işletmeye ya da kampanyaya bağlıdır.
          </li>
          <li>
            Sürpriz kutular para ya da puanla satın alınmaz; uygulama içi etkinliklerle ücretsiz verilir. Günlük kutu Türkiye saatine göre
            günde bir kez açılır ve içeriği önceden tanımlı ödül havuzundan belirlenir.
          </li>
          <li>Hediye gönderilen kozmetik öğeler, alıcı doğrulandıktan ve ödeme yapıldıktan sonra geri alınamaz.</li>
          <li>Bağış kampanyalarına aktardığınız puan kampanyaya kaydedilir ve hesabınıza geri dönmez.</li>
        </ul>
      ),
    },
    {
      id: 'hile',
      title: 'Hile ve kötüye kullanım',
      body: (
        <>
          <p>
            Ekonomiyi adil tutmak için olağandışı etkinlik (örneğin kısa sürede çok sayıda QR okutma, çoklu hesap, otomasyon) otomatik olarak
            tespit edilir. Tespit hâlinde:
          </p>
          <ul>
            <li>İlgili kazanımlar ayrıca bildirim yapılmadan geçersiz sayılabilir; ekranda başarılı görünen bir işlem bakiyeye yansımayabilir.</li>
            <li>Hesap geçici olarak kısıtlanabilir, ağır ya da tekrarlayan durumlarda kapatılabilir.</li>
            <li>Klan savaşında kazanımı geçersiz sayılan üyenin payı, ödül havuzunu ortaya koyan tarafa iade edilir.</li>
          </ul>
          <p>
            Hatalı bir değerlendirmeye maruz kaldığınızı düşünüyorsanız{' '}
            <LegalLink href={PRIVACY_SETTINGS}>Ayarlar › Gizlilik</LegalLink> bölümünden itiraz başvurusu yapabilirsiniz (KVKK m.11/1-g);
            başvurunuz insan tarafından incelenir ve en geç 30 gün içinde yanıtlanır.
          </p>
        </>
      ),
    },
    {
      id: 'isletme',
      title: 'İşletmelerin sorumlulukları',
      body: (
        <ul>
          <li>İşletme bilgilerini, ürünlerini ve konumunu doğru ve güncel tutmak.</li>
          <li>Yayınladığı kampanya, ödül ve telafi tekliflerini belirttiği koşullarla yerine getirmek.</li>
          <li>Müşteri verilerini yalnız hizmetin sunulması için kullanmak; geri bildirimi koşula bağlamamak veya ödül karşılığı olumlu yorum istememek.</li>
          <li>Plan kotalarına (ör. QR kod sayısı) uymak; ücretli planlarda abonelik koşulları ayrıca geçerlidir.</li>
        </ul>
      ),
    },
    {
      id: 'hesap-kapatma',
      title: 'Hesabın kapatılması',
      body: (
        <>
          <p>Hesabınızı Ayarlar › Gizlilik bölümünden istediğiniz an silebilirsiniz. Silme, KVKK kapsamında geri döndürülemez bir anonimleştirmedir:</p>
          <ul>
            <li>Ad, e-posta, telefon, adres, şifre ve açık oturumlar kaldırılır.</li>
            <li>Yorum metinleri silinir; verdiğiniz puan işletmenin istatistiğinde kimliksiz kalır.</li>
            <li>Kullanılmamış puan bakiyesi, rozetler ve kullanılmamış ödül kodları geçersiz olur; geri yüklenemez.</li>
            <li>Aktif ücretli aboneliği olan işletme hesabı, abonelik sonlandırılmadan silinemez.</li>
          </ul>
          <p>
            Bu şartların ağır ihlalinde QRateX hesabı kısıtlayabilir ya da kapatabilir; itiraz yolu{' '}
            <LegalLink href="#hile">hile ve kötüye kullanım</LegalLink> bölümündeki gibidir.
          </p>
        </>
      ),
    },
    {
      id: 'sorumluluk',
      title: 'Hizmetin sunulması ve sorumluluk',
      body: (
        <>
          <p>
            Hizmet “olduğu gibi” sunulur; bakım ve beklenmeyen kesintiler olabilir. Puan, oyun ve ödül kuralları ekonomi dengesini korumak için
            değiştirilebilir; değişiklikler bu sayfada sürüm ve tarihle yayımlanır.
          </p>
          <p>İşletmelerin sunduğu ürün ve hizmetlerden ilgili işletme sorumludur.</p>
        </>
      ),
    },
    {
      id: 'degisiklik',
      title: 'Şartlardaki değişiklikler',
      body: (
        <p>
          Şartlar değiştiğinde sürüm numarası ve yürürlük tarihi güncellenir ve değişikliklerin özeti aşağıdaki değişiklik geçmişine eklenir.
          Yürürlük tarihinden sonra hizmeti kullanmaya devam etmeniz güncel sürümün kabulü anlamına gelir.
        </p>
      ),
    },
    {
      id: 'hukuk',
      title: 'Uygulanacak hukuk ve iletişim',
      body: (
        <>
          <p>
            Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır. Tüketici uyuşmazlıklarında, 6502 sayılı Tüketicinin Korunması Hakkında Kanun
            uyarınca parasal sınırlar dâhilinde Tüketici Hakem Heyetlerine, aşan durumlarda Tüketici Mahkemelerine başvurabilirsiniz.
          </p>
          <p>
            Sorularınız ve bildirimleriniz için: <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</LegalLink>
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
        { text: 'Puanın nakit karşılığı yoktur ve başka hesaba aktarılamaz; kazanım günlük ve haftalık tavanlarla sınırlıdır.', href: '#puanlar' },
        { text: 'Hile tespitinde kazanımlar bildirimsiz geçersiz sayılabilir; hatalı bulduğunuz karara itiraz edebilirsiniz.', href: '#hile' },
        { text: 'Yorumunuz işletmeyle paylaşılır ve yapay zekâ ile sınıflandırılır.', href: '#icerik' },
        { text: 'Klan savaşı ödül havuzu emanette tutulur; savaş iptal edilirse tamamı iade edilir.', href: '#oyunlar' },
        { text: 'Hesabınızı silerseniz kullanılmamış puan ve ödülleriniz geri yüklenemez.', href: '#hesap-kapatma' },
      ]}
      sections={sections}
    />
  );
}
