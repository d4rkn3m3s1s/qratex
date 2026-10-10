import type { Metadata } from 'next';
import Link from 'next/link';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { EmptyState, ErrorState } from '@/components/states';
import { getShellConfig } from '@/lib/navigation/get-shell-config';
import { getServerLocale } from '@/lib/server-locale';
import { formatNumber, getMeCopy, toMeLocale } from '@/components/customer/m-ben-ilerleme/copy';
import { getMeProfile, type MeProfile } from '@/components/customer/m-ben-ilerleme/server/profile';
import { requireCustomerPage } from '@/components/customer/m-ben-ilerleme/server/page-auth';
import { MeProfileCard } from '@/components/customer/m-ben-ilerleme/ui/me-profile-card';
import { MeSections, meChildren } from '@/components/customer/m-ben-ilerleme/ui/me-sections';
import { SOFT_BUTTON } from '@/components/customer/m-ben-ilerleme/ui/styles';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = getMeCopy(toMeLocale(await getServerLocale())).me;
  return { title: c.title, description: c.description, robots: { index: false } };
}

/**
 * Ben kabuğu (yol haritası §4.3): profil kartı + alt bölümler (İlerleme · Rozetler · Yılım ·
 * Seslerim · Davet · Ayarlar · Ekip[teamOnly]). Tamamen sunucuda çizilir; bölüm listesi
 * navigasyon kaydından ve admin görünürlük ayarlarından gelir.
 */
export default async function MePage() {
  const locale = toMeLocale(await getServerLocale());
  const c = getMeCopy(locale).me;
  const auth = await requireCustomerPage('/customer/me');

  const header = <PageHeader title={c.title} description={c.description} />;

  if (auth.kind === 'forbidden') {
    return (
      <PanelPage register="play" header={header} width="default">
        <EmptyState variant="permission" title={c.forbiddenTitle} description={c.forbiddenBody} />
      </PanelPage>
    );
  }
  if (auth.kind === 'unavailable') {
    return (
      <PanelPage register="play" header={header}>
        <ErrorState
          variant="section"
          action={
            <Link href="/customer/me" className={SOFT_BUTTON}>
              {getMeCopy(locale).progress.retry}
            </Link>
          }
        />
      </PanelPage>
    );
  }

  const [shell, profile] = await Promise.all([
    getShellConfig('customer'),
    getMeProfile(auth.userId).catch((error): MeProfile | null => {
      console.error('[me] profil okunamadı', error);
      return null;
    }),
  ]);

  const items = meChildren(shell.nodes).filter((it) => !it.teamOnly || profile?.canSeeTeam === true);
  const settingsHref = items.find((it) => it.id === 'customer.me.settings')?.href ?? null;

  return (
    <PanelPage register="play" header={header}>
      {profile ? (
        <MeProfileCard profile={profile} settingsHref={settingsHref} locale={locale} />
      ) : (
        <p role="status" className="qx-small rounded-control border border-warning-border bg-warning-subtle px-3 py-2.5 text-warning-text">
          {c.profileError}
        </p>
      )}
      <MeSections
        items={items}
        locale={locale}
        hints={{
          levelText: profile
            ? c.hintLevel(formatNumber(profile.level, locale), formatNumber(profile.levelPercent / 100, locale, { style: 'percent' }))
            : null,
          badgeCount: profile?.badgeCount ?? null,
          pendingReviews: profile?.pendingReviews ?? null,
        }}
      />
    </PanelPage>
  );
}
