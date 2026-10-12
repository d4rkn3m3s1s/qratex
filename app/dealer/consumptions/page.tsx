import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope } from '@/lib/auth/scope';
import { getServerLocale } from '@/lib/server-locale';
import { parseLedgerFilters, scopeLedgerFilters, type StaffLedgerScope } from '@/lib/dealer/kasa/core';
import { resolveStaffLedgerAccess } from '@/lib/dealer/kasa/staff-scope.server';

/** Personel görünümü: bayinin seçtiği kapsamı yansıtır (zorlama API/sunucu tarafında). */
const STAFF_SCOPE_NOTE: Record<StaffLedgerScope, string> = {
  today: 'Personel görünümü: yalnız bugünün kayıtları.',
  today_own: 'Personel görünümü: bugünün tüm kayıtları ve geçmişte kendi girdiğin kayıtlar.',
  all: 'Personel görünümü: işletmenin tüm kayıtları.',
};
import { listKasaProducts, listLedger } from '@/lib/dealer/kasa/server';
import type { KasaProduct, LedgerPage } from '@/lib/dealer/kasa/types';
import { ErrorState } from '@/components/states';
import { LedgerScreen } from '@/components/dealer/b-kasa-tuketim/ledger-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Transaction ledger', description: 'Purchases recorded at the till, revenue, review conversion and undo.' }
    : { title: 'İşlem defteri', description: 'Kasada kaydedilen işlemler, ciro, yoruma dönüşüm ve geri alma.' };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Bayi → İşlem defteri (denetim raporu docs/audit/2026-10-08/bayi/dealer_consumptions.md).
 *
 * Sunucu önce: URL'deki filtrelerle ilk sayfa + özet (+ önceki dönem) ve ürün listesi paralel
 * yüklenir. Yükleme düşerse istemci adası kendi sorgusunda görünür hata + "Tekrar dene" gösterir.
 * ADMIN yalnız `?dealerId=` ile ve salt okunur görür.
 */
export default async function DealerConsumptionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const auth = await requireAuth(['DEALER', 'STAFF', 'ADMIN']);
  if ('error' in auth) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" />
      </div>
    );
  }
  const rawDealer = Array.isArray(sp.dealerId) ? sp.dealerId[0] : sp.dealerId;
  const scope = await resolveDealerScope(auth.session, { dealerId: rawDealer ?? null });
  if (!scope.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" description={scope.message} />
      </div>
    );
  }

  const staff = await resolveStaffLedgerAccess(scope).catch(() => ({ policy: 'today' as const, scopeWhere: null }));
  const filters = scopeLedgerFilters(parseLedgerFilters(sp), scope.via, staff.policy ?? undefined);
  const [initial, products] = await Promise.all([
    listLedger(scope.dealerId, filters, {
      staffActorId: scope.via === 'staff' ? scope.actorId : null,
      scopeWhere: staff.scopeWhere,
    }).catch((err): LedgerPage | null => {
      console.error('[dealer/consumptions] sunucu ön yüklemesi başarısız:', err);
      return null;
    }),
    listKasaProducts(scope.dealerId).catch((): KasaProduct[] => []),
  ]);

  return (
    <>
      {staff.policy ? (
        <p className="mx-auto mb-3 w-full max-w-5xl px-1 text-sm text-muted-foreground" role="note">
          {STAFF_SCOPE_NOTE[staff.policy]}
        </p>
      ) : null}
      <LedgerScreen
      initial={initial}
      products={products}
      readOnly={scope.via === 'admin'}
      adminDealerId={scope.via === 'admin' ? scope.dealerId : null}
      />
    </>
  );
}
