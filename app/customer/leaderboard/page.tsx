import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';
import { getServerLocale } from '@/lib/server-locale';
import { buildLeagueBoard } from '@/lib/league-board/server';
import {
  isLeagueCategory,
  isLeaguePeriod,
  type LeagueCategory,
  type LeaguePeriod,
} from '@/lib/league-board/periods';
import type { LeagueBoardDTO } from '@/lib/league-board/types';
import { getLigCopy } from '@/components/customer/m-lig/copy';
import { LeagueBoard } from '@/components/customer/m-lig/league-board';
import { LeagueUnavailable } from '@/components/customer/m-lig/league-unavailable';

/**
 * Oyna → Lig (`/customer/leaderboard`). Sunucu bileşeni: kimlik + rol DB'den (requireAuth),
 * `rewards` modül kapısı ve menü görünürlüğü sunucuda; ilk sıralama sunucuda hesaplanıp istemci
 * adasına `initial` olarak verilir (ilk boyamada istek yok). Ayrıntı: lib/league-board/server.ts.
 */
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  let locale: 'tr' | 'en' = 'tr';
  try {
    locale = (await getServerLocale()) === 'en' ? 'en' : 'tr';
  } catch {
    /* varsayılan tr */
  }
  const copy = getLigCopy(locale);
  return { title: copy.title, description: copy.description, robots: { index: false } };
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Eski bağlantılar (`period=weekly|monthly|alltime`, `category=`) yeni değerlere eşlenir. */
const LEGACY_PERIOD: Record<string, LeaguePeriod> = { weekly: 'week', monthly: 'season', alltime: 'all' };

function parseParams(sp: Record<string, string | string[] | undefined>) {
  const rawCat = first(sp.cat) ?? first(sp.category);
  const rawPeriod = first(sp.period);
  const category: LeagueCategory = isLeagueCategory(rawCat) ? rawCat : 'points';
  const period: LeaguePeriod = isLeaguePeriod(rawPeriod)
    ? rawPeriod
    : rawPeriod && LEGACY_PERIOD[rawPeriod]
      ? (LEGACY_PERIOD[rawPeriod] as LeaguePeriod)
      : 'week';
  const pageNum = Number.parseInt(first(sp.page) ?? '1', 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, 10_000) : 1;
  return { category, period, page };
}

export default async function CustomerLeaguePage({ searchParams }: PageProps) {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) {
    if (auth.error.status === 401) redirect('/auth/signin?callbackUrl=%2Fcustomer%2Fleaderboard');
    return <LeagueUnavailable kind="forbidden" />;
  }
  const userId = auth.session.user.id;

  const blocked =
    (await assertModuleEnabled('rewards', { userId, routeKey: 'page:customer.leaderboard' })) ??
    (await assertMenuItemVisible('leaderboard', 'customer', { userId, routeKey: 'page:customer.leaderboard' }));
  if (blocked) return <LeagueUnavailable kind="moduleDisabled" />;

  const params = parseParams(await searchParams);
  let initial: LeagueBoardDTO | null = null;
  try {
    initial = await buildLeagueBoard({ viewerId: userId, ...params });
  } catch (err) {
    // Sayfa düşmez: istemci aynı ucu çağırır ve hatayı "Yeniden dene" ile GÖRÜNÜR gösterir.
    console.error('[customer/leaderboard] ilk sıralama hesaplanamadı:', err);
  }

  return (
    <LeagueBoard
      initial={initial}
      initialParams={initial ? { category: params.category, period: params.period, page: initial.page } : params}
    />
  );
}
