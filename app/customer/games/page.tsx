import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { requireAuth } from '@/lib/api-auth';
import { roleHome } from '@/lib/auth/post-login-target';
import { getServerLocale } from '@/lib/server-locale';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import type { ShellConfig, ShellItem } from '@/lib/navigation/shell-config';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { playHubCopy, type PlayLocale } from '@/components/customer/m-oyna-merkez/copy';
import { PlayTabsNav } from '@/components/customer/m-oyna-merkez/play-tabs-nav';
import { RetiredNotice } from '@/components/customer/m-oyna-merkez/retired-notice';
import { HubSkeleton } from '@/components/customer/m-oyna-merkez/hub-skeleton';
import { GamesTab } from '@/components/customer/m-oyna-merkez/games-tab';
import { TournamentTab } from '@/components/customer/m-oyna-merkez/tournament-tab';
import { RETIRED_QUERY_KEY, retiredNoticeFor } from '@/lib/play-hub/retired';

/**
 * Oyna merkezi (yol haritası §4.3 "Oyna" sekmesi, §7.3 #22). Sunucu bileşeni: kabuk ve
 * başlık anında, veri bölümleri `Suspense` içinde akışla gelir (sabit iskelet, CLS yok).
 *
 *   ?tab=tournament → haftalık turnuva sekmesi
 *   ?kip=pratik     → oyun ızgarası pratik (ödülsüz) modunda
 *   ?emekli=<id>    → emekli oyunun eski bağlantısından gelindi (tek seferlik not)
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Oyna', robots: { index: false } };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Kabuk kaydında AÇIK olan menü kimlikleri (yöneticinin kapattığı modül sekmesi gizlenir). */
function enabledNavIds(shell: ShellConfig): Set<string> {
  const ids = new Set<string>();
  const walk = (items: readonly ShellItem[]) => {
    for (const it of items) {
      ids.add(it.id);
      walk(it.children);
    }
  };
  for (const node of shell.nodes) {
    if (node.kind === 'item') walk([node.item]);
    else walk(node.items);
  }
  for (const p of shell.palette) ids.add(p.id);
  return ids;
}

export default async function PlayHubPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/login?callbackUrl=%2Fcustomer%2Fgames');
  if (session.user.role !== 'CUSTOMER') redirect(roleHome(session.user.role));

  const [sp, locale, shell] = await Promise.all([
    searchParams,
    getServerLocale() as Promise<PlayLocale>,
    getShellConfig('customer').catch(() => null),
  ]);
  const c = playHubCopy(locale);

  // Yetki kararı DB'den (oturum iptali, rol değişimi, ban) — JWT tek başına yetmez (§4.4/2).
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) {
    const status = auth.error.status;
    if (status === 503) {
      return (
        <PanelPage register="play" header={<PageHeader title={c.pageTitle} />}>
          <ErrorState kind="offline" variant="section" title={c.sectionErrorTitle} description={c.sectionUnavailable} />
        </PanelPage>
      );
    }
    redirect('/auth/login?callbackUrl=%2Fcustomer%2Fgames');
  }
  const userId = auth.session.user.id;

  const tab = first(sp.tab) === 'tournament' ? 'tournament' : 'games';
  const mode = first(sp.kip) === 'pratik' ? 'practice' : 'ranked';
  const notice = retiredNoticeFor(sp[RETIRED_QUERY_KEY]);

  return (
    <PanelPage
      register="play"
      header={
        <PageHeader
          title={c.pageTitle}
          description={tab === 'tournament' ? c.pageDescriptionTournament : c.pageDescriptionGames}
        />
      }
      toolbar={<PlayTabsNav active={tab} locale={locale} enabledNavIds={shell ? enabledNavIds(shell) : null} />}
    >
      {notice && <RetiredNotice locale={locale} notice={notice} />}
      <Suspense key={`${tab}:${mode}`} fallback={<HubSkeleton tab={tab} label={locale === 'en' ? 'Loading…' : 'Yükleniyor…'} />}>
        {tab === 'tournament' ? (
          <TournamentTab userId={userId} locale={locale} />
        ) : (
          <GamesTab userId={userId} locale={locale} mode={mode} />
        )}
      </Suspense>
    </PanelPage>
  );
}
