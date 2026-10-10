import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, History, ShieldCheck } from 'lucide-react';
import { Breadcrumbs } from '@/components/ds/page/breadcrumbs';
import {
  LEGAL_CONTACT_EMAIL,
  formatLegalDate,
  getRelatedLegalDocuments,
  legalDateToDate,
  type LegalDocumentMeta,
} from '@/lib/legal/documents';
import { cn } from '@/lib/utils';
import { JsonLd, breadcrumbLd } from './json-ld';
import { PrintButton } from './print-button';
import { TocNav, type TocItem } from './toc-nav';
import { TurkishOnlyNotice } from './turkish-only-notice';

export interface LegalSection {
  /** URL çapası (`/kullanim-sartlari#puanlar`) — derin bağlantılar buna dayanır, değiştirmeyin. */
  id: string;
  title: string;
  body: ReactNode;
}

export interface LegalSummaryItem {
  text: ReactNode;
  /** İlgili bölümün çapası (`#puanlar`). */
  href?: string;
}

/** Yasal metin gövdesi için ortak tipografi (gövde 16px, tam kontrast; meta bilgiler soluk). */
export const legalProse =
  'space-y-3 text-base leading-7 text-fg [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 marker:text-fg-subtle';

/** Metin içi site bağlantısı (görünür odak + yeterli alt çizgi kontrastı). */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  const cls =
    'rounded-sm font-medium text-brand underline decoration-brand-border underline-offset-4 transition-colors duration-fast hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';
  if (href.startsWith('mailto:') || /^https?:/i.test(href)) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Mobil içindekiler — JS gerektirmeyen açılır liste (masaüstünde yan sütun `TocNav`). */
export function MobileToc({ items, className }: { items: readonly TocItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <details className={cn('group rounded-card border border-border bg-surface-1 print:hidden', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
        <span>
          Bu sayfada <span className="text-fg-muted">({items.length} bölüm)</span>
        </span>
        <ArrowRight className="h-4 w-4 rotate-90 text-fg-muted transition-transform duration-fast group-open:-rotate-90" aria-hidden />
      </summary>
      <ol className="space-y-0.5 border-t border-border px-2 py-2">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex min-h-11 items-center gap-2 rounded-control px-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="qx-num w-5 shrink-0 text-fg-subtle">{i + 1}.</span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

function MetaChip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
        tone === 'brand' ? 'bg-brand-subtle text-brand ring-brand-border' : 'bg-surface-2 text-fg-muted ring-border'
      )}
    >
      {children}
    </span>
  );
}

/**
 * Ortak yasal belge kabuğu (dört yasal sayfa). Tek yerde: `h1` + sürüm/yürürlük rozeti,
 * "Kısaca" özeti, numaralı bölümler (derin bağlantılı çapalar), masaüstü yapışkan + mobil
 * açılır içindekiler, değişiklik geçmişi, ilgili belgeler, yazdırma ve yapılandırılmış veri.
 * Sunucu bileşeni; istemci adaları yalnız içindekiler (scroll-spy), yazdır ve dil notu.
 */
export function LegalDocument({
  doc,
  base,
  title,
  description,
  summary,
  sections,
}: {
  doc: LegalDocumentMeta;
  /** Canonical taban (SEO ayarından). */
  base: string;
  /** Görünen başlık — admin SEO ezmesi varsa o (metadata ile aynı kaynak). */
  title: string;
  description: string;
  summary: readonly LegalSummaryItem[];
  sections: readonly LegalSection[];
}) {
  const url = `${base}${doc.path}`;
  const toc: TocItem[] = [
    ...sections.map((s, i) => ({ id: s.id, label: `${i + 1}. ${s.title}` })),
    { id: 'degisiklikler', label: 'Değişiklik geçmişi' },
  ];
  const crumbs = [
    { name: 'Ana Sayfa', path: '/' },
    { name: title, path: doc.path },
  ];
  const effective = formatLegalDate(doc.effectiveDate);
  const firstPublished = doc.changelog[doc.changelog.length - 1]?.date ?? doc.effectiveDate;

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: title,
            description,
            url,
            inLanguage: 'tr-TR',
            version: doc.version,
            datePublished: legalDateToDate(firstPublished).toISOString(),
            dateModified: legalDateToDate(doc.effectiveDate).toISOString(),
            isPartOf: { '@type': 'WebSite', url: base },
          },
          breadcrumbLd(base, crumbs),
        ]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
        <Breadcrumbs
          className="print:hidden"
          items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { label: c.name } : { label: c.name, href: c.path }))}
        />

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <article lang="tr" aria-labelledby="legal-title" className="min-w-0">
            <header className="space-y-4 border-b border-border pb-8">
              <p className="qx-overline flex items-center gap-1.5 text-brand">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                Yasal belge
              </p>
              <h1 id="legal-title" className="qx-h1 text-3xl text-fg sm:text-4xl">
                {title}
              </h1>
              <p className="max-w-prose text-base leading-7 text-fg-muted">{description}</p>
              <div className="flex flex-wrap items-center gap-2">
                <MetaChip tone="brand">Sürüm {doc.version}</MetaChip>
                <MetaChip>
                  Yürürlük: <time dateTime={doc.effectiveDate}>{effective}</time>
                </MetaChip>
                <a
                  href="#degisiklikler"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus print:hidden"
                >
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Değişiklik geçmişi
                </a>
                <PrintButton className="ml-auto" />
              </div>
              <TurkishOnlyNotice kind="legal" />
            </header>

            {summary.length ? (
              <section
                aria-labelledby="kisaca-title"
                className="mt-8 rounded-card border border-border border-l-4 border-l-brand bg-surface-1 p-5 qx-elevation-1 sm:p-6"
              >
                <h2 id="kisaca-title" className="qx-h3 text-fg">
                  Kısaca
                </h2>
                <ul className="mt-3 space-y-2.5">
                  {summary.map((item, i) => (
                    <li key={i} className="flex gap-3 text-base leading-7 text-fg">
                      <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span>
                        {item.text}
                        {item.href ? (
                          <>
                            {' '}
                            <a
                              href={item.href}
                              className="whitespace-nowrap rounded-sm text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus print:hidden"
                            >
                              Ayrıntı<span className="sr-only">: {typeof item.text === 'string' ? item.text : 'ilgili bölüm'}</span> →
                            </a>
                          </>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <MobileToc items={toc} className="mt-6 lg:hidden" />

            <div className="mt-10 space-y-12">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24 print:break-inside-avoid-page">
                  <h2 id={`${s.id}-title`} className="qx-h2 flex gap-2 text-xl text-fg sm:text-2xl">
                    <span className="qx-num text-fg-subtle">{i + 1}.</span>
                    <span>{s.title}</span>
                  </h2>
                  <div className={cn('mt-4', legalProse)}>{s.body}</div>
                </section>
              ))}

              <section id="degisiklikler" aria-labelledby="degisiklikler-title" className="scroll-mt-24">
                <h2 id="degisiklikler-title" className="qx-h2 text-xl text-fg sm:text-2xl">
                  Değişiklik geçmişi
                </h2>
                <p className="mt-2 text-sm leading-6 text-fg-muted">
                  Metin her değiştiğinde sürüm ve yürürlük tarihi güncellenir. İlk yayın:{' '}
                  <time dateTime={firstPublished}>{formatLegalDate(firstPublished)}</time>.
                </p>
                <ol className="mt-5 space-y-4 border-l border-border pl-5">
                  {doc.changelog.map((c) => (
                    <li key={`${c.version}-${c.date}`} className="relative">
                      <span aria-hidden className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-brand" />
                      <p className="text-sm font-semibold text-fg">
                        Sürüm {c.version} · <time dateTime={c.date}>{formatLegalDate(c.date)}</time>
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-fg-muted">
                        {c.summary.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <nav aria-labelledby="ilgili-belgeler" className="mt-14 border-t border-border pt-8 print:hidden">
              <h2 id="ilgili-belgeler" className="qx-h3 text-fg">
                İlgili belgeler
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {getRelatedLegalDocuments(doc.slug).map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={d.path}
                      className="group flex h-full min-h-11 flex-col gap-1 rounded-card border border-border bg-surface-1 p-4 transition-colors duration-fast ease-standard hover:border-brand-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <span className="flex items-center gap-2 font-medium text-fg">
                        <FileText className="h-4 w-4 text-fg-subtle" aria-hidden />
                        {d.title}
                      </span>
                      <span className="text-sm leading-6 text-fg-muted">{d.blurb}</span>
                      <span className="mt-auto pt-1 text-xs text-fg-subtle">
                        Sürüm {d.version} · <time dateTime={d.effectiveDate}>{formatLegalDate(d.effectiveDate)}</time>
                      </span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/guven"
                    className="group flex h-full min-h-11 flex-col gap-1 rounded-card border border-border bg-surface-1 p-4 transition-colors duration-fast ease-standard hover:border-brand-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span className="flex items-center gap-2 font-medium text-fg">
                      <ShieldCheck className="h-4 w-4 text-fg-subtle" aria-hidden />
                      Güven ve güvenlik
                    </span>
                    <span className="text-sm leading-6 text-fg-muted">Verilerinizi teknik olarak nasıl koruduğumuz.</span>
                  </Link>
                </li>
              </ul>
              <p className="mt-6 text-sm leading-6 text-fg-muted">
                Sorularınız için:{' '}
                <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</LegalLink>
              </p>
            </nav>
          </article>

          <aside className="hidden lg:block print:hidden">
            <div className="sticky top-24 space-y-6">
              <TocNav items={toc} />
              <p className="text-xs leading-5 text-fg-subtle">
                Sürüm {doc.version}
                <br />
                Yürürlük: <time dateTime={doc.effectiveDate}>{effective}</time>
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
