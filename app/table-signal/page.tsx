/**
 * /table-signal — masadan ekibe tek dokunuş (QR / kiosk; oturum gerekmez).
 *
 * Sunucu bileşeni: işletme, QR yaşam döngüsü ve özellik bayrağı İLK RENDER'da çözülür;
 * misafir formu doldurup ancak gönderince "işletme yok / özellik kapalı" öğrenmez.
 * Etkileşim küçük bir istemci adasında (components/customer/p-kart-masa-offline/table).
 *
 * Giriş: `?qr=<QR kodu>&table=M7` (önerilen) · eski `?dealerId=<id>[&qrCodeId=<id>]` · `&kiosk=1`.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { AlertTriangle, Ban, Link2Off, PowerOff, ScanLine, ServerCrash } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { getPointsMatrix } from '@/lib/points-rules';
import { QR_CODE_PATTERN, feedbackHref } from '@/lib/qr-resolve';
import { normalizeTableCode } from '@/lib/table-signal/kinds';
import { resolveSignalVenue, type VenueResolution } from '@/lib/table-signal/venue';
import { Button } from '@/components/ui/button';
import { getSignalCopy, type SignalCopy, type SignalLocale } from '@/components/customer/p-kart-masa-offline/table/copy';
import { TableSignalExperience } from '@/components/customer/p-kart-masa-offline/table/table-signal-experience';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Masa sinyali',
  description: 'Masadan işletme ekibine tek dokunuşla haber verin.',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(v: string | string[] | undefined, max = 191): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  return t && t.length <= max ? t : undefined;
}

async function feedbackPoints(): Promise<number | null> {
  try {
    const matrix = await getPointsMatrix();
    return matrix.feedback.base.points;
  } catch {
    return null;
  }
}

export default async function TableSignalPage({ searchParams }: PageProps) {
  const [sp, rawLocale] = await Promise.all([searchParams, getServerLocale()]);
  const locale: SignalLocale = rawLocale === 'en' ? 'en' : 'tr';
  const copy = getSignalCopy(locale);

  const entry = {
    qr: first(sp.qr ?? sp.code, 64),
    dealerId: first(sp.dealerId),
    qrCodeId: first(sp.qrCodeId),
  };
  const kiosk = first(sp.kiosk, 8) === '1';
  const initialTable = normalizeTableCode(first(sp.table, 64) ?? null);

  let resolution: VenueResolution | null = null;
  try {
    resolution = await resolveSignalVenue(entry);
  } catch (err) {
    console.error('[table-signal] giriş çözülemedi', err);
  }

  if (!resolution) {
    return <StateScreen copy={copy} icon={<ServerCrash className="h-7 w-7" aria-hidden />} title={copy.stateErrorTitle} body={copy.stateErrorBody} retry />;
  }

  if (resolution.status !== 'ok') {
    const directFeedback = entry.qr && QR_CODE_PATTERN.test(entry.qr) && resolution.status === 'disabled' ? feedbackHref(entry.qr) : null;
    const map = {
      missing: { icon: <Link2Off className="h-7 w-7" aria-hidden />, title: copy.stateMissingTitle, body: copy.stateMissingBody },
      not_found: { icon: <AlertTriangle className="h-7 w-7" aria-hidden />, title: copy.stateNotFoundTitle, body: copy.stateNotFoundBody },
      qr_inactive: { icon: <Ban className="h-7 w-7" aria-hidden />, title: copy.stateInactiveTitle, body: copy.stateInactiveBody },
      disabled: { icon: <PowerOff className="h-7 w-7" aria-hidden />, title: copy.stateDisabledTitle, body: copy.stateDisabledBody },
    } as const;
    const s = map[resolution.status];
    return <StateScreen copy={copy} icon={s.icon} title={s.title} body={s.body} feedbackHref={directFeedback} />;
  }

  const [session, points] = await Promise.all([getServerSession(authOptions).catch(() => null), feedbackPoints()]);
  const canLink = session?.user?.role === 'CUSTOMER';

  return (
    <TableSignalExperience
      initialLocale={locale}
      entry={{
        ...(entry.qr ? { qr: entry.qr } : {}),
        ...(!entry.qr && entry.dealerId ? { dealerId: entry.dealerId } : {}),
        ...(!entry.qr && entry.qrCodeId ? { qrCodeId: entry.qrCodeId } : {}),
      }}
      scope={resolution.qrCode ?? resolution.dealerId}
      venue={resolution.venue}
      initialTable={initialTable}
      casesEnabled={resolution.casesEnabled}
      canLink={canLink}
      feedbackHref={resolution.qrCode ? feedbackHref(resolution.qrCode) : null}
      feedbackPoints={points}
      kiosk={kiosk}
    />
  );
}

function StateScreen({
  copy,
  icon,
  title,
  body,
  retry,
  feedbackHref: fb,
}: {
  copy: SignalCopy;
  icon: React.ReactNode;
  title: string;
  body: string;
  retry?: boolean;
  feedbackHref?: string | null;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <section aria-labelledby="ts-state-title" className="w-full max-w-sm rounded-card border border-border bg-surface-1 p-6 text-center qx-elevation-1">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-3 text-fg-muted">{icon}</span>
        <h1 id="ts-state-title" className="qx-h2 mt-4 text-fg">
          {title}
        </h1>
        <p className="mt-2 text-pretty text-sm text-fg-muted">{body}</p>
        <div className="mt-6 flex flex-col gap-2">
          {retry && (
            <Button asChild className="min-h-11">
              {/* Tam yenileme: aynı adres sunucuda yeniden çözülür. */}
              <a href="">{copy.retry}</a>
            </Button>
          )}
          {fb && (
            <Button asChild className="min-h-11">
              <Link href={fb}>{copy.bridgeCta}</Link>
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
    </main>
  );
}
