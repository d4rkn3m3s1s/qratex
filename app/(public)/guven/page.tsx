import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bug,
  CheckCircle2,
  Database,
  Download,
  EyeOff,
  FileText,
  Fingerprint,
  KeyRound,
  Lock,
  MailCheck,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Timer,
  Trash2,
  Archive,
  Activity,
  Building2,
  Repeat,
  type LucideIcon,
} from 'lucide-react';
import { BreadcrumbNav } from '@/components/seo/breadcrumb-nav';
import { Button } from '@/components/ui/button';
import { ConsentPreferencesButton } from '@/components/analytics/consent-preferences-button';
import { getSeoSettings, sanitizeSeoString } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { breadcrumbJsonLd, buildPublicMetadata, faqJsonLd, jsonLdHtml, resolvePublicSeo } from '@/lib/landing/seo';
import { FaqList } from '@/components/public/p-landing/faq-list';
import { fmt, PUBLIC_CONTACT_EMAIL } from '@/components/public/p-landing/fmt';
import { LiveStatus } from '@/components/public/p-landing/live-status';
import { LocaleSync } from '@/components/public/p-landing/locale-sync';
import { PublicSection, SectionHeading } from '@/components/public/p-landing/section';
import { getTrustCopy, TRUST_CONTENT_UPDATED_AT } from '@/components/public/p-landing/trust-copy';

const PATH = '/guven';
/** Gizlilik ayarları (eski yol; `/customer/me/settings?tab=privacy`'ye yönlenir, derin link korunur). */
const PRIVACY_SETTINGS_HREF = '/customer/me/settings?tab=privacy';
const CONTROL_ICONS: LucideIcon[] = [Download, ScrollText, Trash2];
const SECURITY_ICONS: LucideIcon[] = [KeyRound, MailCheck, Fingerprint, Lock, Timer, ShieldCheck, FileText, Archive, Activity, Repeat];

/**
 * `/guven` — Güven Merkezi (denetim guven.md, Dalga 2). Ops kaydı: sakin, okunur, hareket
 * yok. Her iddia koddaki kaynağa dayanır (eşleme: trust-copy.ts başlığı); ölçülmeyen
 * SLO rakamları ve yanlış "signed URL" iddiası kaldırıldı, iç dosya yolları yayından çıktı.
 * Sunucu bileşeni; istemci adaları yalnız canlı durum, çerez tercih düğmesi ve dil eşitleyici.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [locale, seo] = await Promise.all([getServerLocale(), getSeoSettings()]);
  const copy = getTrustCopy(locale);
  const brand = sanitizeSeoString(seo.siteName) || 'QRateX';
  return buildPublicMetadata({
    path: PATH,
    title: copy.meta.title,
    description: fmt(copy.meta.description, { brand }),
    locale,
  });
}

export default async function TrustPage() {
  const [locale, seo] = await Promise.all([getServerLocale(), getSeoSettings()]);
  const copy = getTrustCopy(locale);
  const brand = sanitizeSeoString(seo.siteName) || 'QRateX';
  const resolved = await resolvePublicSeo({ path: PATH, title: copy.meta.title, description: fmt(copy.meta.description, { brand }) });
  const crumbs = [
    { name: copy.breadcrumb.home, path: '/' },
    { name: copy.breadcrumb.current, path: PATH },
  ];
  const updatedDate = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(`${TRUST_CONTENT_UPDATED_AT}T12:00:00+03:00`));
  const aboutLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: resolved.title,
    description: resolved.description,
    url: resolved.canonical,
    dateModified: TRUST_CONTENT_UPDATED_AT,
    inLanguage: locale === 'en' ? 'en-US' : 'tr-TR',
  };

  return (
    <div className="relative">
      <LocaleSync serverLocale={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(aboutLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd(resolved.base, crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqJsonLd(copy.faq.items)) }} />

      {/* Hero + canlı durum */}
      <section aria-labelledby="trust-title" className="px-4 pb-10 pt-28 sm:px-6 sm:pt-32">
        <div className="mx-auto w-full max-w-6xl">
          <BreadcrumbNav items={crumbs} />
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
            <div>
              <p className="qx-overline flex items-center gap-2 text-brand">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {copy.hero.eyebrow}
              </p>
              <h1 id="trust-title" className="mt-3 text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
                {copy.hero.title}
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">{copy.hero.sub}</p>
              <nav aria-label={copy.hero.eyebrow} className="mt-6">
                <ul className="flex flex-wrap gap-2">
                  {copy.hero.chips.map((chip) => (
                    <li key={chip.href}>
                      <a
                        href={chip.href}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-subtle bg-surface-1/90 px-4 text-sm font-medium text-fg transition-colors duration-fast hover:border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                        {chip.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            <LiveStatus copy={copy.status} locale={locale} />
          </div>
        </div>
      </section>

      {/* Senin verin */}
      <PublicSection id="senin-verin" labelledBy="data-title" className="pt-6 sm:pt-10">
        <SectionHeading id="data-title" eyebrow={copy.data.eyebrow} title={copy.data.title} sub={copy.data.sub} align="start" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {copy.data.collect.map((item) => (
            <li key={item.title} className="rounded-card border border-subtle bg-surface-1/90 p-5">
              <p className="font-semibold text-fg">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-card border border-subtle bg-surface-1/90 p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-semibold text-fg">
              <Building2 className="h-5 w-5 text-info" aria-hidden />
              {copy.data.seesTitle}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-fg">
              {copy.data.sees.map((s) => (
                <li key={s} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-card border border-subtle bg-surface-1/90 p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-semibold text-fg">
              <EyeOff className="h-5 w-5 text-success" aria-hidden />
              {copy.data.notSeesTitle}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-fg">
              {copy.data.notSees.map((s) => (
                <li key={s} className="flex items-start gap-2.5">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <p className="rounded-card border border-subtle bg-surface-1/90 p-5 text-sm leading-relaxed text-fg-muted">{copy.data.ai}</p>
          <div className="rounded-card border border-subtle bg-surface-1/90 p-5">
            <p className="text-sm leading-relaxed text-fg-muted">{copy.data.analytics}</p>
            <ConsentPreferencesButton surface="policy" variant="outline" className="mt-4 min-h-11" showIcon>
              {copy.data.consentButton}
            </ConsentPreferencesButton>
          </div>
          <p className="rounded-card border border-subtle bg-surface-1/90 p-5 text-sm leading-relaxed text-fg-muted">
            {copy.data.leaderboard}
          </p>
        </div>
      </PublicSection>

      {/* Kontrol sende */}
      <PublicSection id="kontrol" labelledBy="control-title" className="pt-0 sm:pt-0">
        <SectionHeading id="control-title" eyebrow={copy.control.eyebrow} title={copy.control.title} sub={copy.control.sub} align="start" />
        <ul className="grid gap-4 md:grid-cols-3">
          {copy.control.actions.map((action, i) => {
            const Icon = CONTROL_ICONS[i] ?? Download;
            return (
              <li key={action.title} className="flex flex-col rounded-card border border-subtle bg-surface-1/90 p-5 sm:p-6">
                <span className="grid h-11 w-11 place-items-center rounded-control bg-brand-subtle text-brand" aria-hidden>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-fg">{action.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{action.body}</p>
                <Button asChild variant="outline" className="mt-5 self-start">
                  <Link href={PRIVACY_SETTINGS_HREF}>
                    {action.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-fg-subtle">
          {copy.control.loginNote}{' '}
          {copy.control.businessNote}{' '}
          <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`} className="font-medium text-brand underline underline-offset-4 hover:no-underline">
            {PUBLIC_CONTACT_EMAIL}
          </a>
        </p>
      </PublicSection>

      {/* İşletmeler için */}
      <PublicSection id="isletmeler" labelledBy="biz-title" className="pt-0 sm:pt-0">
        <SectionHeading id="biz-title" eyebrow={copy.business.eyebrow} title={copy.business.title} align="start" />
        <ul className="grid gap-4 sm:grid-cols-2">
          {copy.business.items.map((item) => (
            <li key={item.title} className="rounded-card border border-subtle bg-surface-1/90 p-5 sm:p-6">
              <p className="font-semibold text-fg">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </PublicSection>

      {/* Güvenlik uygulamaları */}
      <PublicSection id="guvenlik" labelledBy="security-title" className="pt-0 sm:pt-0">
        <SectionHeading id="security-title" eyebrow={copy.security.eyebrow} title={copy.security.title} sub={copy.security.sub} align="start" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copy.security.items.map((item, i) => {
            const Icon = SECURITY_ICONS[i] ?? ShieldCheck;
            return (
              <li key={item.title} className="flex gap-4 rounded-card border border-subtle bg-surface-1/90 p-5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">{item.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </PublicSection>

      {/* Altyapı ve alt işlemciler */}
      <PublicSection id="altyapi" labelledBy="infra-title" className="pt-0 sm:pt-0">
        <SectionHeading id="infra-title" eyebrow={copy.infra.eyebrow} title={copy.infra.title} sub={copy.infra.sub} align="start" />
        <div className="overflow-hidden rounded-card border border-subtle bg-surface-1/90">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{copy.infra.title}</caption>
            <thead className="hidden bg-surface-2/60 md:table-header-group">
              <tr className="border-b border-subtle">
                <th scope="col" className="px-5 py-3 font-semibold text-fg-muted">
                  {copy.infra.colService}
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-fg-muted">
                  {copy.infra.colPurpose}
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-fg-muted">
                  {copy.infra.colData}
                </th>
              </tr>
            </thead>
            <tbody>
              {copy.infra.rows.map((row) => (
                <tr key={row.service} className="block border-b border-subtle px-5 py-4 last:border-b-0 md:table-row md:p-0">
                  <th scope="row" className="block font-semibold text-fg md:table-cell md:px-5 md:py-3.5">
                    <span className="flex items-center gap-2">
                      <ServerCog className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                      {row.service}
                    </span>
                  </th>
                  <td className="mt-1 block text-fg md:mt-0 md:table-cell md:px-5 md:py-3.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle md:hidden">{copy.infra.colPurpose}: </span>
                    {row.purpose}
                  </td>
                  <td className="mt-1 block text-fg-muted md:mt-0 md:table-cell md:px-5 md:py-3.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle md:hidden">{copy.infra.colData}: </span>
                    {row.data}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted">
          <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {copy.infra.transferNote}{' '}
            <Link href="/kvkk-aydinlatma-metni" className="font-medium text-brand underline underline-offset-4 hover:no-underline">
              {copy.infra.transferLink}
            </Link>
          </span>
        </p>
      </PublicSection>

      {/* Sorumlu bildirim + yasal belgeler */}
      <PublicSection id="belgeler" labelledBy="legal-title" className="pt-0 sm:pt-0">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          <div className="rounded-card border border-subtle bg-surface-1/90 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
              <Bug className="h-5 w-5 text-brand" aria-hidden />
              {copy.disclosure.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">{fmt(copy.disclosure.body, { email: PUBLIC_CONTACT_EMAIL })}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href={`mailto:${PUBLIC_CONTACT_EMAIL}?subject=${encodeURIComponent('Security report')}`}>{copy.disclosure.cta}</a>
              </Button>
              <Button asChild variant="ghost">
                <a href="/.well-known/security.txt">{copy.disclosure.securityTxt}</a>
              </Button>
            </div>
          </div>
          <div>
            <p className="qx-overline text-brand">{copy.legal.eyebrow}</p>
            <h2 id="legal-title" className="mt-2 text-2xl font-semibold tracking-tight text-fg">
              {copy.legal.title}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {copy.legal.docs.map((doc) => (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    className="group flex h-full min-h-11 flex-col rounded-card border border-subtle bg-surface-1/90 p-4 transition-colors duration-fast hover:border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center justify-between gap-2 font-semibold text-fg">
                      {doc.title}
                      <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <span className="mt-1 text-sm text-fg-muted">{doc.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PublicSection>

      <FaqList id="gizlilik-sss" eyebrow={copy.faq.eyebrow} title={copy.faq.title} items={copy.faq.items} />

      <p className="px-4 pb-20 text-center text-sm text-fg-subtle">
        <time dateTime={TRUST_CONTENT_UPDATED_AT}>{fmt(copy.updated, { date: updatedDate })}</time>
      </p>
    </div>
  );
}
