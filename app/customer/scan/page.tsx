/**
 * /customer/scan — Tara (merkez FAB). Sunucu bileşeni: ödül özeti ve son mekânlar ilk
 * render'da gelir; kamera, elle giriş ve çözüm kartı küçük bir istemci adasında.
 *
 * Derin link: `/customer/scan?code=<kod|bağlantı|kart token'ı>` → açılışta çözülür.
 */
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { ScanLine } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { getServerLocale } from '@/lib/server-locale';
import { PageHeader } from '@/components/states';
import { getScanCopy, type ScanLocale } from '@/components/customer/m-tara/copy';
import { ScanExperience } from '@/components/customer/m-tara/scan-experience';
import { ScanRecentVenues, ScanRewardPanel, ScanSummaryError } from '@/components/customer/m-tara/scan-aside';
import type { ScanSummary } from '@/components/customer/m-tara/scan-types';
import { MAX_QR_PAYLOAD_LENGTH } from '@/lib/qr-resolve';
import { loadScanSummary } from './_server/scan-summary';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function firstParam(v: string | string[] | undefined): string | null {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed && trimmed.length <= MAX_QR_PAYLOAD_LENGTH ? trimmed : null;
}

export default async function CustomerScanPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    redirect('/auth/login?callbackUrl=%2Fcustomer%2Fscan');
  }

  const [sp, rawLocale] = await Promise.all([searchParams, getServerLocale()]);
  const locale: ScanLocale = rawLocale === 'en' ? 'en' : 'tr';
  const copy = getScanCopy(locale);
  const initialCode = firstParam(sp.code);

  let summary: ScanSummary | null = null;
  try {
    summary = await loadScanSummary(session.user.id);
  } catch (err) {
    // Özet yoksa tarama yine çalışır; hata görünür kalır (sıfır gösterilmez).
    console.error('[customer/scan] özet yüklenemedi', err);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader
        title={copy.pageTitle}
        description={copy.pageDescription}
        icon={<ScanLine className="h-5 w-5" aria-hidden />}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start">
        <ScanExperience
          initialCode={initialCode}
          reward={summary?.reward ?? null}
          hasActiveCard={summary?.hasActiveCard ?? true}
        />
        <aside className="space-y-4" aria-label={copy.sideRewardTitle}>
          {summary ? (
            <>
              <ScanRewardPanel summary={summary} copy={copy} locale={locale} />
              <ScanRecentVenues summary={summary} copy={copy} locale={locale} />
            </>
          ) : (
            <ScanSummaryError copy={copy} />
          )}
        </aside>
      </div>
    </div>
  );
}
