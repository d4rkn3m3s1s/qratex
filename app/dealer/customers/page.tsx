import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { getServerLocale } from '@/lib/server-locale';
import { getSummary, listCustomers } from '@/lib/dealer-customers/server';
import { isCustomerTag, isRiskLevel, isWinBackBand, normalizeSearch, parseSortParam } from '@/lib/dealer-customers/core';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { CustomersScreen, type CustomersInitial } from '@/components/dealer/b-musteriler/customers-screen';
import type { ListParams } from '@/components/dealer/b-musteriler/api';
import { LIST_DEFAULT_SORT, LIST_PAGE_SIZE } from '@/lib/dealer-customers/types';

/**
 * Bayi → Müşteriler 360 (yol haritası §4.3, F3.2(c)).
 * Birleşen eski rotalar (kalıcı yönlenir): /dealer/churn-risk (?tab=risk), /dealer/radar
 * (?tab=winback), /dealer/segment-actions (?tab=segments).
 *
 * Sunucu önce: özet ve (liste sekmesindeyken) URL'deki ilk sayfa sunucuda paralel çekilir ve
 * istemci adasına `initialData` olarak verilir; bir kaynak düşerse istemci kendi sorgusunda
 * görünür hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Customers', description: 'Customer list, 360 view, risk, win-back and segments.' }
    : { title: 'Müşteriler', description: 'Müşteri listesi, 360 görünüm, kayıp riski, geri kazanım ve segmentler.' };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const PAGE_SIZES = [10, 20, 50, 100];

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[dealer/customers] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function DealerCustomersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Rol proxy'de korunur; yetki kararı yine DB'den (oturum iptali, rol değişimi).
  const auth = await requireAuth(['DEALER']);
  const dealerId = 'error' in auth ? null : auth.session.user.id;

  const tab = first(sp.tab);
  const size = Number(first(sp.size));
  const pageNum = Number(first(sp.page));
  const q = normalizeSearch(first(sp.q));
  const params: ListParams = {
    q: q.length >= 2 ? q : '',
    segment: isCustomerTag(first(sp.segment)) ? first(sp.segment) : '',
    risk: isRiskLevel(first(sp.risk)) ? first(sp.risk) : '',
    band: isWinBackBand(first(sp.band)) ? first(sp.band) : '',
    sort: first(sp.sort) || LIST_DEFAULT_SORT,
    page: Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1,
    pageSize: PAGE_SIZES.includes(size) ? size : LIST_PAGE_SIZE,
  };

  const listTab = !tab || tab === 'list';
  const [summary, page] = dealerId
    ? await Promise.all([
        settle(getSummary(dealerId)),
        listTab
          ? settle(
              listCustomers(dealerId, {
                q: params.q,
                segment: isCustomerTag(params.segment) ? params.segment : null,
                risk: isRiskLevel(params.risk) ? params.risk : null,
                band: isWinBackBand(params.band) ? params.band : null,
                sort: parseSortParam(params.sort),
                page: params.page,
                pageSize: params.pageSize,
              })
            )
          : Promise.resolve(null),
      ])
    : [null, null];

  const initial: CustomersInitial = {
    summary,
    list: page ? { params, page } : null,
    canSend: dealerId != null,
  };

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <CustomersScreen initial={initial} />
    </Suspense>
  );
}
