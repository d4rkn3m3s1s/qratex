/**
 * /c/[token] — fiziksel Qratex kartının (ve Wallet kartının) giriş noktası: rol farkındalığı olan
 * kart deep-link'i (rapor: docs/audit/2026-10-08/musteri/c_token.md).
 *
 * Sunucu bileşeni: kart durumu oturuma göre İLK RENDER'da çözülür (eski sayfa istemcide
 * hidrasyon → oturum → kart şelalesiyle spinner gösteriyordu). Etkileşim küçük adalarda:
 * sahiplenme + kutlama (CardClaim), kayıp kart bildirimi (FoundReport), hesap değiştirme.
 *
 *  - İşletme hesabı okutursa → /dealer/scan?token=… (kasada tüketim ekleme ekranı, otomatik sorgu).
 *  - Müşteri: sahiplenilebilir kart → "Kartı benim yap"; kendi kartı → özet + Kartım.
 *  - Oturumsuz: giriş/kayıt `callbackUrl` ile bu sayfaya döner (kayıt sayfası artık taşıyor).
 *  - Başkasının kartı: sahibin kimliği YOK; "Kartı buldum" + "Kendi kartını edin".
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { AlertTriangle, ArrowRight, Ban, CalendarCheck, CreditCard, History, Hourglass, LogIn, ScanLine, ServerCrash, Snowflake, Star, UserPlus } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-metadata';
import { isAppleWalletConfigured, isGoogleWalletConfigured } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { CardTwin } from '@/components/customer/p-kart-masa-offline/card/card-twin';
import { CardClaim } from '@/components/customer/p-kart-masa-offline/card/card-claim';
import { FoundReport } from '@/components/customer/p-kart-masa-offline/card/found-report';
import { SwitchAccountButton } from '@/components/customer/p-kart-masa-offline/card/switch-account';
import { fill, getCardCopy, type CardCopy, type CardLocale } from '@/components/customer/p-kart-masa-offline/card/copy';
import { loadCardPage, viewerKindOf, type CardPageModel, type CardPageViewer } from './_server/card-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Qratex kartı',
  description: 'Qratex sadakat kartını hesabına bağla.',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

type PageProps = { params: Promise<{ token: string }> };

function formatDate(iso: string | null, locale: CardLocale): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

async function rateLimited(): Promise<boolean> {
  try {
    const ip = getClientIp({ headers: await headers() }) ?? 'unknown';
    const rl = await checkRateLimitDb(`card-page:${ip}`, 60, 60_000);
    return !rl.ok;
  } catch {
    return false;
  }
}

export default async function CardPage({ params }: PageProps) {
  const [{ token: rawToken }, rawLocale, session] = await Promise.all([
    params,
    getServerLocale(),
    getServerSession(authOptions).catch(() => null),
  ]);
  const token = safeDecode(rawToken ?? '').trim();
  const locale: CardLocale = rawLocale === 'en' ? 'en' : 'tr';
  const copy = getCardCopy(locale);

  const viewer: CardPageViewer = {
    kind: viewerKindOf(session?.user?.role),
    id: session?.user?.id ?? null,
    name: session?.user?.name ?? null,
  };

  // İşletme kasası telefonun kamerasıyla okuttuysa: doğrudan tüketim ekleme ekranı (rapor B8).
  if (viewer.kind === 'dealer') {
    redirect(`/dealer/scan?token=${encodeURIComponent(token)}`);
  }

  if (await rateLimited()) {
    return (
      <Shell copy={copy}>
        <StatePanel icon={<Hourglass className="h-7 w-7" aria-hidden />} title={copy.rateLimitedTitle} body={copy.rateLimitedBody} copy={copy} retry />
      </Shell>
    );
  }

  let model: CardPageModel | null = null;
  try {
    model = await loadCardPage(token, viewer);
  } catch (err) {
    console.error('[c/token] kart yüklenemedi', err);
  }

  if (!model) {
    return (
      <Shell copy={copy}>
        <StatePanel icon={<ServerCrash className="h-7 w-7" aria-hidden />} title={copy.errorTitle} body={copy.errorBody} copy={copy} retry />
      </Shell>
    );
  }

  return (
    <Shell copy={copy}>
      <CardBody model={model} viewer={viewer} copy={copy} locale={locale} />
    </Shell>
  );
}

function Shell({ copy, children }: { copy: CardCopy; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5 sm:pt-8">
        <header>
          <Link
            href="/"
            aria-label={copy.homeAria}
            className="inline-flex min-h-11 items-center gap-2 rounded-control font-display text-lg font-bold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-black text-brand-fg">
              Q
            </span>
            {copy.brand}
          </Link>
        </header>
        {children}
        <p className="text-xs text-fg-muted">{copy.footer}</p>
      </div>
    </main>
  );
}

function StatePanel({
  icon,
  title,
  body,
  copy,
  retry,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  copy: CardCopy;
  retry?: boolean;
}) {
  return (
    <section aria-labelledby="card-state-title" className="rounded-card border border-border bg-surface-1 p-6 text-center qx-elevation-1">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-3 text-fg-muted">{icon}</span>
      <h1 id="card-state-title" className="qx-h2 mt-4 text-fg">
        {title}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">{body}</p>
      <div className="mt-6 flex flex-col gap-2">
        {retry && (
          <Button asChild className="min-h-11">
            <a href="">{copy.retry}</a>
          </Button>
        )}
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/customer/scan">
            <ScanLine className="h-4 w-4" aria-hidden />
            {copy.scanCta}
          </Link>
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link href="/">{copy.homeCta}</Link>
        </Button>
      </div>
    </section>
  );
}

function Benefits({ copy, reward }: { copy: CardCopy; reward: CardPageModel['reward'] }) {
  const items = [
    { icon: <ScanLine className="h-4 w-4" aria-hidden />, text: copy.benefitScan },
    {
      icon: <Star className="h-4 w-4" aria-hidden />,
      text: reward
        ? fill(copy.benefitReview, { base: reward.base, detailed: reward.detailed, threshold: reward.threshold })
        : copy.benefitReviewSimple,
    },
    { icon: <History className="h-4 w-4" aria-hidden />, text: copy.benefitHistory },
  ];
  return (
    <section aria-labelledby="benefits-title" className="rounded-card border border-border bg-surface-1 p-4">
      <h2 id="benefits-title" className="text-sm font-semibold text-fg">
        {copy.benefitsTitle}
      </h2>
      <ul className="mt-3 space-y-2.5">
        {items.map((it) => (
          <li key={it.text} className="flex items-start gap-2.5 text-sm text-fg">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">{it.icon}</span>
            {it.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CardBody({ model, viewer, copy, locale }: { model: CardPageModel; viewer: CardPageViewer; copy: CardCopy; locale: CardLocale }) {
  const twinAria = fill(copy.twinAria, { masked: model.maskedToken });
  const back = `/c/${encodeURIComponent(model.token)}`;

  if (model.state === 'not_found') {
    return <StatePanel icon={<AlertTriangle className="h-7 w-7" aria-hidden />} title={copy.notFoundTitle} body={copy.notFoundBody} copy={copy} />;
  }

  // Personel / yönetici: kart bağlanamaz; doğru yere yönlendir (rapor B8).
  if (viewer.kind === 'staff' || viewer.kind === 'admin') {
    return (
      <>
        <CardTwin variant="member" holder={copy.twinMember} maskedToken={model.maskedToken} caption={copy.twinCaption} ariaLabel={twinAria} />
        <section aria-labelledby="role-title" className="space-y-3">
          <h1 id="role-title" className="qx-h2 text-fg">
            {copy.wrongRoleTitle}
          </h1>
          <p className="text-sm text-fg-muted">{viewer.kind === 'staff' ? copy.wrongRoleStaff : copy.wrongRoleAdmin}</p>
          <Button asChild className="min-h-12 w-full">
            <Link href={viewer.kind === 'staff' ? '/staff' : '/admin/cards'}>{viewer.kind === 'staff' ? copy.staffHome : copy.adminCards}</Link>
          </Button>
          {model.state === 'claimable' && (
            <>
              <p className="text-sm text-fg-muted">{copy.wrongRoleCustomerHint}</p>
              <SwitchAccountButton token={model.token} label={copy.switchAccount} />
            </>
          )}
        </section>
      </>
    );
  }

  if (model.state === 'claimable') {
    if (viewer.kind === 'customer') {
      return (
        <>
          <CardClaim
            token={model.token}
            copy={copy}
            maskedToken={model.maskedToken}
            viewerName={viewer.name}
            hasOtherCard={model.hasOtherCard}
            orphan={model.orphan}
            wallet={{ apple: isAppleWalletConfigured(), google: isGoogleWalletConfigured() }}
          />
          <Benefits copy={copy} reward={model.reward} />
        </>
      );
    }
    return (
      <>
        <CardTwin variant="claimable" holder={copy.twinNamePlaceholder} maskedToken={model.maskedToken} caption={copy.twinCaption} ariaLabel={twinAria} />
        <section aria-labelledby="claim-anon-title" className="space-y-4">
          <div className="space-y-1.5">
            <h1 id="claim-anon-title" className="qx-h1 text-fg">
              {copy.claimSignedOutTitle}
            </h1>
            <p className="text-base text-fg-muted">{copy.claimSignedOutBody}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button asChild size="lg" className="min-h-12 w-full">
              <Link href={`/auth/register?callbackUrl=${encodeURIComponent(back)}`}>
                <UserPlus className="h-5 w-5" aria-hidden />
                {copy.register}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-12 w-full">
              <Link href={`/auth/login?callbackUrl=${encodeURIComponent(back)}`}>
                <LogIn className="h-5 w-5" aria-hidden />
                {copy.signIn}
              </Link>
            </Button>
          </div>
        </section>
        <Benefits copy={copy} reward={model.reward} />
      </>
    );
  }

  if (model.state === 'mine' && model.owner) {
    const o = model.owner;
    return (
      <>
        <CardTwin
          variant="owner"
          holder={o.holderName || copy.twinMember}
          maskedToken={model.maskedToken}
          caption={copy.twinCaption}
          ariaLabel={twinAria}
        />
        <section aria-labelledby="mine-title" className="space-y-4">
          <div className="space-y-1.5">
            <h1 id="mine-title" className="qx-h1 text-fg">
              {copy.mineTitle}
            </h1>
            <p className="text-base text-fg-muted">{copy.mineBody}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-card border border-border bg-surface-1 p-4 text-center">
            <div>
              <dt className="text-xs text-fg-muted">{copy.mineActivated}</dt>
              <dd className="mt-1 flex items-center justify-center gap-1 text-sm font-semibold text-fg">
                <CalendarCheck className="h-3.5 w-3.5 text-brand" aria-hidden />
                {formatDate(o.activatedAt, locale) ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{copy.mineUses}</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-fg">{o.usesCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{copy.mineLastUse}</dt>
              <dd className="mt-1 text-sm font-semibold text-fg">{formatDate(o.lastUsedAt, locale) ?? copy.mineNever}</dd>
            </div>
          </dl>
          <Button asChild size="lg" className="min-h-12 w-full justify-between">
            <Link href="/customer/wallet/card">
              <span className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" aria-hidden />
                {copy.mineCta}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </section>
        <Benefits copy={copy} reward={model.reward} />
      </>
    );
  }

  if (model.state === 'frozen_mine' || model.state === 'blocked_mine') {
    const frozen = model.state === 'frozen_mine';
    return (
      <>
        <CardTwin
          variant={frozen ? 'frozen' : 'blocked'}
          holder={model.owner?.holderName || copy.twinMember}
          maskedToken={model.maskedToken}
          caption={copy.twinCaption}
          ariaLabel={twinAria}
          statusLabel={frozen ? copy.twinFrozen : copy.twinBlocked}
        />
        <section aria-labelledby="blocked-mine-title" className={cn('space-y-3 rounded-card border p-4', frozen ? TONE_CALLOUT.info : TONE_CALLOUT.warning)}>
          <h1 id="blocked-mine-title" className="qx-h2 flex items-center gap-2 text-fg">
            {frozen ? <Snowflake className="h-5 w-5 text-info" aria-hidden /> : <Ban className="h-5 w-5 text-warning" aria-hidden />}
            {frozen ? copy.frozenTitle : copy.blockedMineTitle}
          </h1>
          <p className="text-sm text-fg">{frozen ? copy.frozenBody : copy.blockedMineBody}</p>
          <Button asChild className="min-h-12 w-full">
            <Link href="/customer/wallet/card">{frozen ? copy.frozenCta : copy.mineCta}</Link>
          </Button>
        </section>
      </>
    );
  }

  if (model.state === 'blocked') {
    return (
      <>
        <CardTwin variant="blocked" holder={copy.twinMember} maskedToken={model.maskedToken} caption={copy.twinCaption} ariaLabel={twinAria} statusLabel={copy.twinBlocked} />
        <StatePanel icon={<Ban className="h-7 w-7" aria-hidden />} title={copy.blockedTitle} body={copy.blockedBody} copy={copy} />
      </>
    );
  }

  // taken: başka bir üyenin kartı — kimlik yok; kayıp kart akışı + kendi kartın.
  return (
    <>
      <CardTwin variant="member" holder={copy.twinMember} maskedToken={model.maskedToken} caption={copy.twinCaption} ariaLabel={twinAria} />
      <section aria-labelledby="taken-title" className="space-y-4">
        <div className="space-y-1.5">
          <h1 id="taken-title" className="qx-h1 text-fg">
            {copy.takenTitle}
          </h1>
          <p className="text-base text-fg-muted">{copy.takenBody}</p>
        </div>
        <FoundReport token={model.token} copy={copy} />
      </section>
      <section aria-labelledby="own-card-title" className="rounded-card border border-brand-border bg-brand-subtle p-4">
        <h2 id="own-card-title" className="font-semibold text-fg">
          {copy.ownCardTitle}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{viewer.kind === 'customer' ? copy.ownCardBodyCustomer : copy.ownCardBodyAnon}</p>
        <Button asChild variant="outline" className="mt-3 min-h-11 w-full">
          <Link href={viewer.kind === 'customer' ? '/customer/wallet/card' : `/auth/register`}>
            {viewer.kind === 'customer' ? copy.ownCardCtaCustomer : copy.ownCardCtaAnon}
          </Link>
        </Button>
      </section>
    </>
  );
}
