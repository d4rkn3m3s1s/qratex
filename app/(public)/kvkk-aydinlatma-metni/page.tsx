import type { Metadata } from 'next';
import Link from 'next/link';
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-json-ld';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { WebPageJsonLd } from '@/components/seo/webpage-json-ld';
import { ConsentPreferencesButton } from '@/components/analytics/consent-preferences-button';
import { getSeoSettings, getPageSeo, getCanonicalBase } from '@/lib/seo-settings';
import {
  PII_CATEGORY_LABELS,
  PII_REGISTRY,
  type EraseStrategy,
  type PiiCategory,
  type PiiRegistryEntry,
} from '@/lib/pii-registry';
import { DSR_LEGAL_DAYS } from '@/lib/dsr-workflow';

/**
 * KVKK Aydınlatma Metni (KVKK m.10) — kâğıt üzerinde değil, sistemden türeyen metin (P0-34).
 *
 * Veri kategorileri, hukuki sebepler, saklama süreleri ve silme talebinde ne olacağı ELLE
 * yazılmaz: kişisel veri envanterinden (`lib/pii-registry.ts`) üretilir. Envantere yeni bir
 * kayıt eklendiğinde bu metin de güncellenir; şema tarama testi envanterin eksiksizliğini korur.
 * "Son güncelleme" render anı DEĞİL, metnin yürürlük tarihidir.
 */

const PATH = '/kvkk-aydinlatma-metni';
const DEFAULT_TITLE = 'KVKK Aydınlatma Metni';
const DEFAULT_DESCRIPTION =
  '6698 sayılı KVKK kapsamında QRateX’in hangi kişisel verileri, hangi amaç ve hukuki sebeple işlediği, ne kadar sakladığı ve haklarınızı nasıl kullanacağınız.';

/** Metin değişince güncellenir (render anı değil). */
const KVKK_NOTICE_VERSION = '2.0';
const KVKK_NOTICE_EFFECTIVE_DATE = '2026-10-10';

const CONTACT_EMAIL = 'info@qratex.com';

const effectiveDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(
  new Date(`${KVKK_NOTICE_EFFECTIVE_DATE}T00:00:00+03:00`)
);

export async function generateMetadata(): Promise<Metadata> {
  const override = await getPageSeo(PATH);
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  return {
    title: override?.title ?? DEFAULT_TITLE,
    description: override?.description ?? DEFAULT_DESCRIPTION,
    alternates: { canonical: override?.canonical ?? `${base}${PATH}` },
  };
}

// ───────────────────────────── Envanterden türeyen tablo ─────────────────────────────

const CATEGORY_ORDER: PiiCategory[] = [
  'kimlik',
  'iletişim',
  'konum',
  'serbest_metin',
  'işlem',
  'davranış',
  'ai',
  'tercih',
  'cihaz',
  'güvenlik',
];

const CATEGORY_EXAMPLES: Readonly<Record<PiiCategory, string>> = {
  kimlik: 'Ad soyad, profil fotoğrafı, bağlı giriş hesabı (ör. Google), doğum tarihi (verdiyseniz), personel kaydı.',
  iletişim: 'E-posta adresi, telefon, size gönderilen bildirimler ve KVKK başvurularınız.',
  konum: 'Verdiyseniz adres ve işletme konumu. Cihaz konumunuzu sürekli izlemeyiz.',
  serbest_metin: 'Yazdığınız yorumlar, notlar, bağış mesajları, QRA asistanı ile sohbetleriniz, yüklediğiniz fotoğraflar.',
  işlem: 'Ziyaret ve tüketim kayıtları, puan hareketleri, ödüller, kart ve kupon kullanımı.',
  davranış: 'Oyun, görev, rozet ve seri ilerlemeniz; uygulama içi etkinlik kayıtları.',
  ai: 'Yorumlarınızdan çıkarılan duygu/konu analizleri, güven puanı ve kayıp riski gibi otomatik değerlendirmeler.',
  tercih: 'Bildirim, panel ve çerez/izleme tercihleriniz, favori işletmeleriniz.',
  cihaz: 'Anlık bildirim aboneliği, tarayıcı bilgisi, güvenlik kayıtlarındaki IP adresi.',
  güvenlik: 'Oturum ve tek kullanımlık giriş bağlantıları, denetim ve sahtecilik önleme kayıtları.',
};

const ERASE_LABELS: Readonly<Record<EraseStrategy, string>> = {
  delete: 'silinir',
  redact: 'metin ve tanımlayıcılar temizlenir, kimliksiz istatistik kalır',
  pseudonymize: 'anonim hesaba bağlı kimliksiz istatistik olarak kalır',
  retain: 'yasal süre boyunca saklanır, süre sonunda imha edilir',
  user_row: 'anonimleştirilir',
  business: 'işletmenin ticari kaydı olarak kalır',
};

function retentionText(e: PiiRegistryEntry): string {
  if (typeof e.retentionDays === 'number' && e.retentionField) return `${e.retentionDays} gün sonra otomatik silinir`;
  if (typeof e.retentionDays === 'number' && e.retentionDays >= 365) return `${Math.round(e.retentionDays / 365)} yıl (yasal saklama)`;
  if (typeof e.retentionDays === 'number') return `en fazla ${e.retentionDays} gün`;
  return 'hesabınız açık kaldığı sürece';
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

interface CategoryRow {
  category: PiiCategory;
  legalBases: string[];
  retention: string[];
  onErase: string[];
}

function buildRows(): CategoryRow[] {
  const own = PII_REGISTRY.filter((e) => e.subject === 'self');
  return CATEGORY_ORDER.map((category) => {
    const entries = own.filter((e) => e.categories.includes(category));
    return {
      category,
      legalBases: uniq(entries.map((e) => e.legalBasis)),
      retention: uniq(entries.map(retentionText)),
      onErase: uniq(entries.map((e) => ERASE_LABELS[e.erase])),
    };
  }).filter((r) => r.legalBases.length > 0);
}

// ───────────────────────────── Sunum ─────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-3">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-fg">
        {title}
      </h2>
      <div className="space-y-3 text-[0.95rem] leading-7 text-fg-muted">{children}</div>
    </section>
  );
}

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-fg underline decoration-brand/40 underline-offset-4 hover:decoration-brand">
      {children}
    </Link>
  );
}

const TOC = [
  { id: 'veri-sorumlusu', label: 'Veri sorumlusu' },
  { id: 'kategoriler', label: 'Veriler, sebepler ve süreler' },
  { id: 'amaclar', label: 'İşleme amaçları' },
  { id: 'toplama', label: 'Toplama yöntemi' },
  { id: 'aktarim', label: 'Aktarım' },
  { id: 'otomatik', label: 'Otomatik değerlendirmeler' },
  { id: 'haklar', label: 'Haklarınız' },
  { id: 'basvuru', label: 'Başvuru' },
];

const RIGHTS: Array<{ text: string; action?: { href: string; label: string } }> = [
  { text: 'Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme (m.11/1-a, b)', action: { href: '/customer/settings?tab=privacy', label: 'Verilerimi indir' } },
  { text: 'İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme (m.11/1-c)' },
  { text: 'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme (m.11/1-ç)' },
  { text: 'Eksik veya yanlış işlenmişse düzeltilmesini isteme (m.11/1-d)', action: { href: '/customer/settings?tab=privacy', label: 'Düzeltme başvurusu' } },
  { text: 'Silinmesini veya yok edilmesini isteme (m.11/1-e)', action: { href: '/customer/settings?tab=privacy', label: 'Silme başvurusu' } },
  { text: 'Düzeltme ve silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme (m.11/1-f)' },
  { text: 'Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuca itiraz etme (m.11/1-g)', action: { href: '/customer/settings?tab=privacy', label: 'İtiraz başvurusu' } },
  { text: 'Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme (m.11/1-ğ)' },
];

export default async function KvkkAydinlatmaPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const override = await getPageSeo(PATH);
  const title = override?.title ?? DEFAULT_TITLE;
  const description = override?.description ?? DEFAULT_DESCRIPTION;
  const crumbs = [
    { name: 'Ana Sayfa', path: '/' },
    { name: DEFAULT_TITLE, path: PATH },
  ];
  const rows = buildRows();

  return (
    <>
      <WebPageJsonLd name={title} description={description} url={`${base}${PATH}`} />
      <BreadcrumbJsonLd items={crumbs} />
      <div className="container px-4 py-10 md:py-14">
        <BreadcrumbNav items={crumbs} />
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <article className="min-w-0 space-y-10 rounded-2xl border border-border bg-card/95 p-5 shadow-sm sm:p-8">
            <header className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">{DEFAULT_TITLE}</h1>
              <p className="max-w-prose text-base leading-7 text-fg-muted">{DEFAULT_DESCRIPTION}</p>
              <p className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-brand-subtle px-2.5 py-1 font-medium text-brand ring-1 ring-inset ring-brand-border">
                  Sürüm {KVKK_NOTICE_VERSION}
                </span>
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-fg-muted ring-1 ring-inset ring-border">
                  Yürürlük: <time dateTime={KVKK_NOTICE_EFFECTIVE_DATE}>{effectiveDate}</time>
                </span>
              </p>
            </header>

            <Section id="veri-sorumlusu" title="Veri sorumlusu">
              <p>
                6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında veri sorumlusu QRateX’tir. Bu metin; müşteri,
                işletme ve personel hesaplarıyla QR geri bildirim formunu kullanan ziyaretçileri kapsar. İşletmelerin kendi
                müşterileri hakkında tuttuğu ticari kayıtlarda işletme ayrıca veri sorumlusudur.
              </p>
              <p>
                İletişim:{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-fg underline underline-offset-4">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </Section>

            <Section id="kategoriler" title="İşlenen veriler, hukuki sebepler ve saklama süreleri">
              <p>
                Aşağıdaki tablo, sistemdeki kişisel veri envanterinden otomatik üretilir; silme talebinizde ve saklama süresi
                dolduğunda tam olarak burada yazan uygulanır.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <caption className="sr-only">Kişisel veri kategorileri, hukuki sebepleri ve saklama süreleri</caption>
                  <thead className="bg-surface-muted text-xs uppercase tracking-wide text-fg-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Veri grubu</th>
                      <th scope="col" className="px-3 py-2 font-medium">Hukuki sebep (KVKK m.5)</th>
                      <th scope="col" className="px-3 py-2 font-medium">Saklama</th>
                      <th scope="col" className="px-3 py-2 font-medium">Silme talebinizde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.category} className="align-top">
                        <td className="px-3 py-3">
                          <p className="font-medium text-fg">{PII_CATEGORY_LABELS[r.category]}</p>
                          <p className="mt-1 text-xs leading-5">{CATEGORY_EXAMPLES[r.category]}</p>
                        </td>
                        <td className="px-3 py-3">
                          <ul className="space-y-1">
                            {r.legalBases.map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-3 py-3">
                          <ul className="space-y-1">
                            {r.retention.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-3 py-3">
                          <ul className="space-y-1">
                            {r.onErase.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm">
                Hesabınızı sildiğinizde ad, e-posta, telefon ve adres gibi doğrudan tanımlayıcılar geri döndürülemez biçimde
                anonimleştirilir; açık oturumlarınız kapanır. Puan ve puanlama istatistikleri işletmelerin ticari kaydı olduğu için
                kimliksiz olarak kalır.
              </p>
            </Section>

            <Section id="amaclar" title="İşleme amaçları">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Hesabınızın açılması, giriş ve güvenliğin sağlanması.</li>
                <li>Geri bildirimlerinizin işletmeye iletilmesi, işletme yanıtları ve telafi tekliflerinin size ulaştırılması.</li>
                <li>Puan, ödül, rozet, oyun ve kampanya hizmetlerinin yürütülmesi.</li>
                <li>Sahtecilik ve kötüye kullanımın önlenmesi, denetim kayıtlarının tutulması.</li>
                <li>Yasal yükümlülüklerin (5651, vergi ve ticaret mevzuatı, KVKK başvurularının ispatı) yerine getirilmesi.</li>
                <li>Yalnız açık rızanızla: ürün analitiği ve oturum kaydı.</li>
              </ul>
            </Section>

            <Section id="toplama" title="Toplama yöntemi">
              <p>
                Verileriniz kayıt ve profil formlarından, QR kodu okutarak doldurduğunuz geri bildirim formundan, uygulama içi
                işlemlerinizden (ziyaret, puan, oyun, sohbet), tarayıcınızın gönderdiği teknik bilgilerden ve yalnız onay
                verdiyseniz analitik araçlarından elektronik ortamda toplanır.
              </p>
            </Section>

            <Section id="aktarim" title="Aktarım ve hizmet sağlayıcılar">
              <p>Verileriniz satılmaz ve reklam amacıyla paylaşılmaz. Hizmetin sunulması için şu sağlayıcılarla sınırlı ölçüde paylaşılır:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Barındırma, veritabanı, önbellek ve dosya depolama altyapısı (uygulama sunucuları AB/Frankfurt bölgesinde).</li>
                <li>E-posta gönderim hizmeti (makbuz, doğrulama ve bildirim e-postaları).</li>
                <li>Yapay zekâ hizmet sağlayıcısı: yorum metinlerinin duygu ve konu analizi için (yurt dışında bulunabilir).</li>
                <li>Hata izleme hizmeti: uygulama hatalarının teknik ayrıntıları.</li>
                <li>Ödeme altyapısı: yalnız işletme abonelikleri için.</li>
                <li>
                  Yalnız açık rızanızla: ürün analitiği ve oturum kaydı (AB bölgesi). Tercihinizi{' '}
                  <ConsentPreferencesButton surface="policy" className="font-medium text-fg underline underline-offset-4" /> üzerinden
                  her an değiştirebilirsiniz; ayrıntılar <InlineLink href="/cerez-politikasi">Çerez Politikası</InlineLink>’nda.
                </li>
                <li>Geri bildirim verdiğiniz işletme: yorumunuz, puanınız ve (görünür kıldıysanız) adınız.</li>
                <li>Yetkili kamu kurumları: yalnız yasal zorunluluk hâlinde.</li>
              </ul>
            </Section>

            <Section id="otomatik" title="Otomatik değerlendirmeler">
              <p>
                Yorumlarınız yapay zekâ ile duygu ve konu bakımından sınıflandırılır; sahtecilik önleme için hesaplara bir güven
                puanı hesaplanır. Bu değerlendirmeler veri paketinizde size gösterilir ve aleyhinize bir sonuç doğurduğunu
                düşünüyorsanız itiraz edebilirsiniz.
              </p>
            </Section>

            <Section id="haklar" title="KVKK m.11 kapsamındaki haklarınız">
              <ul className="space-y-2">
                {RIGHTS.map((r) => (
                  <li key={r.text} className="flex flex-col gap-1 rounded-xl border border-border bg-surface-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{r.text}</span>
                    {r.action ? (
                      <InlineLink href={r.action.href}>{r.action.label}</InlineLink>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="basvuru" title="Başvuru">
              <p>
                Hesabınız varsa haklarınızı <InlineLink href="/customer/settings?tab=privacy">Ayarlar › Gizlilik</InlineLink>{' '}
                bölümünden kullanabilirsiniz: veri paketinizi anında indirebilir, düzeltme, silme ve itiraz başvurusu yapabilir,
                başvurunuzun her adımını izleyebilirsiniz. Başvurunuz en geç {DSR_LEGAL_DAYS} gün içinde sonuçlandırılır ve sonuç
                hesabınızın e-posta adresine bildirilir.
              </p>
              <p>
                Hesabınız yoksa başvurunuzu kimliğinizi doğrulayacak bilgilerle{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-fg underline underline-offset-4">
                  {CONTACT_EMAIL}
                </a>{' '}
                adresine iletebilirsiniz. Başvurunuz reddedilir ya da yanıtı yetersiz bulursanız Kişisel Verileri Koruma Kurulu’na
                şikâyette bulunabilirsiniz.
              </p>
            </Section>
          </article>

          <nav aria-label="Bu sayfada" className="hidden lg:block">
            <div className="sticky top-24 space-y-2 text-sm">
              <p className="font-semibold text-fg">Bu sayfada</p>
              <ul className="space-y-1.5 border-l border-border pl-3">
                {TOC.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="text-fg-muted transition-colors hover:text-fg">
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
