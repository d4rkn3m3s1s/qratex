import type { Metadata } from 'next';
import Link from 'next/link';
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-json-ld';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { WebPageJsonLd } from '@/components/seo/webpage-json-ld';
import { ConsentSummaryCard } from '@/components/analytics/consent-preferences-button';
import { getSeoSettings, getPageSeo, getCanonicalBase } from '@/lib/seo-settings';
import { CONSENT_CATEGORY_LABELS, type ConsentCategory } from '@/lib/consent';
import {
  COOKIELESS_MEASUREMENT,
  COOKIE_INVENTORY,
  COOKIE_POLICY_EFFECTIVE_DATE,
  COOKIE_POLICY_VERSION,
} from '@/lib/consent/inventory';

const PATH = '/cerez-politikasi';
const DEFAULT_TITLE = 'Çerez Politikası';
const DEFAULT_DESCRIPTION =
  'QRateX hangi çerezleri ve benzeri teknolojileri hangi amaçla kullanır, ne kadar saklar ve tercihinizi nasıl değiştirirsiniz.';

const effectiveDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(
  new Date(`${COOKIE_POLICY_EFFECTIVE_DATE}T00:00:00+03:00`)
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

const CATEGORY_ORDER: ConsentCategory[] = ['necessary', 'analytics', 'replay'];

const CATEGORY_INTRO: Record<ConsentCategory, string> = {
  necessary:
    'Hizmetin çalışması için gereklidir: giriş oturumu, güvenlik, dil ve rıza tercihinizin kendisi. KVKK m.5/2-c (sözleşmenin ifası) ve m.5/2-f (meşru menfaat) kapsamında işlenir; kapatılamaz, ancak tarayıcı ayarlarınızdan silebilirsiniz (bu durumda oturumunuz kapanır).',
  analytics:
    'Yalnız açık rızanızla çalışır. Onay vermezseniz analitik kütüphanesi hiç yüklenmez ve üçüncü tarafa istek gitmez. Gönderilen sayfa adreslerinden giriş bağlantıları, doğrulama kodları ve benzeri gizli değerler önceden silinir.',
  replay:
    'Analitikten ayrı, ikinci bir onay ister. Tüm form alanları maskelenir; giriş, şifre sıfırlama, yönetici kapısı ve kart/paylaşım bağlantısı sayfaları hiç kaydedilmez.',
  marketing: '',
};

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

const TOC = [
  { id: 'kisaca', label: 'Kısaca' },
  { id: 'tercihleriniz', label: 'Tercihleriniz' },
  { id: 'kategoriler', label: 'Kategoriler ve envanter' },
  { id: 'cerezsiz', label: 'Çerezsiz ölçüm' },
  { id: 'aktarim', label: 'Üçüncü taraflar ve aktarım' },
  { id: 'haklar', label: 'Haklarınız' },
];

export default async function CerezPolitikasiPage() {
  const seo = await getSeoSettings();
  const base = getCanonicalBase(seo);
  const override = await getPageSeo(PATH);
  const title = override?.title ?? DEFAULT_TITLE;
  const description = override?.description ?? DEFAULT_DESCRIPTION;
  const crumbs = [
    { name: 'Ana Sayfa', path: '/' },
    { name: DEFAULT_TITLE, path: PATH },
  ];

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
              <p className="max-w-prose text-base leading-7 text-fg-muted">{description}</p>
              <p className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-brand-subtle px-2.5 py-1 font-medium text-brand ring-1 ring-inset ring-brand-border">
                  Sürüm {COOKIE_POLICY_VERSION}
                </span>
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-fg-muted ring-1 ring-inset ring-border">
                  Yürürlük: <time dateTime={COOKIE_POLICY_EFFECTIVE_DATE}>{effectiveDate}</time>
                </span>
              </p>
            </header>

            <Section id="kisaca" title="Kısaca">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Zorunlu çerezler yalnız oturum, güvenlik ve tercihlerinizi hatırlamak içindir.</li>
                <li>Analitik ve oturum kaydı ayrı ayrı sorulur; onay vermezseniz hiç çalışmaz.</li>
                <li>Pazarlama veya reklam çerezi kullanmıyoruz; verinizi reklam amacıyla paylaşmıyoruz.</li>
                <li>Kararınızı bu sayfadan, sayfa altındaki “Çerez tercihleri” bağlantısından ya da hesabınızın Ayarlar › Gizlilik bölümünden her an değiştirebilirsiniz.</li>
              </ul>
            </Section>

            <Section id="tercihleriniz" title="Tercihleriniz">
              <p>Şu an bu tarayıcıda geçerli olan karar aşağıdadır. Ret, kabul kadar kolaydır ve hizmeti kullanmanızı engellemez.</p>
              <ConsentSummaryCard surface="policy" />
              <p className="text-sm">
                Tercihiniz bu tarayıcıda 180 gün geçerlidir; politika değişirse yeniden sorarız. Oturum açtıysanız kararınız hesabınıza
                da kaydedilir ve yeni cihazınızda yeniden sorulmaz.
              </p>
            </Section>

            <Section id="kategoriler" title="Kategoriler ve envanter">
              {CATEGORY_ORDER.map((cat) => {
                const rows = COOKIE_INVENTORY.filter((i) => i.category === cat);
                return (
                  <div key={cat} className="space-y-3 pt-2">
                    <h3 className="text-base font-semibold text-fg">{CONSENT_CATEGORY_LABELS[cat].title}</h3>
                    <p>{CATEGORY_INTRO[cat]}</p>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[40rem] text-left text-sm">
                        <caption className="sr-only">{CONSENT_CATEGORY_LABELS[cat].title} çerez ve depolama öğeleri</caption>
                        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-fg-muted">
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
                              <td className="px-3 py-2 font-mono text-xs text-fg">{r.name}</td>
                              <td className="px-3 py-2 text-fg">{r.provider}</td>
                              <td className="px-3 py-2">{r.kind}</td>
                              <td className="px-3 py-2">{r.purpose}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{r.duration}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </Section>

            <Section id="cerezsiz" title="Çerezsiz ölçüm">
              <p>Aşağıdaki araçlar çerez veya kalıcı kimlik kullanmaz, kişisel profil oluşturmaz; sayfa adresindeki gizli değerler gönderilmeden önce silinir.</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {COOKIELESS_MEASUREMENT.map((m) => (
                  <li key={m.name}>
                    <strong className="text-fg">{m.name}</strong> ({m.provider}): {m.purpose}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="aktarim" title="Üçüncü taraflar ve yurt dışına aktarım">
              <p>
                Analitik ve oturum kaydı onay verirseniz PostHog Inc. tarafından AB (Frankfurt) bölgesindeki sunucularda işlenir. Uygulamanın
                barındırıldığı Vercel altyapısı da AB (Frankfurt) bölgesindedir. Bu aktarımlar KVKK m.9 kapsamında açık rızanıza veya
                ilgili hukuki dayanağa bağlıdır; ayrıntılar{' '}
                <Link href="/kvkk-aydinlatma-metni" className="font-medium text-fg underline underline-offset-4">
                  KVKK Aydınlatma Metni
                </Link>
                ’nde yer alır.
              </p>
            </Section>

            <Section id="haklar" title="Haklarınız">
              <p>
                KVKK m.11 kapsamındaki erişim, düzeltme, silme ve itiraz haklarınızı hesabınızın{' '}
                <Link href="/customer/settings?tab=privacy" className="font-medium text-fg underline underline-offset-4">
                  Ayarlar › Gizlilik
                </Link>{' '}
                bölümünden kullanabilirsiniz; başvurunuz en geç 30 gün içinde sonuçlandırılır. Hesabınız yoksa{' '}
                <a href="mailto:info@qratex.com" className="font-medium text-fg underline underline-offset-4">
                  info@qratex.com
                </a>{' '}
                adresine yazabilirsiniz.
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
