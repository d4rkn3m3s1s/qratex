import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamWorkspace } from '@/components/team/team-workspace';
import { loadTeamBootstrap } from '@/lib/team/page-bootstrap';
import { getServerLocale } from '@/lib/server-locale';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return locale === 'en'
    ? { title: 'Team', description: 'Work assigned to you, your team’s week and initiatives.' }
    : { title: 'Ekip', description: 'Sana atanan işler, ekibinin haftası ve girişimler.' };
}

/** Müşteri paneli ekip çalışma alanı — yalnız ekip rolü atanmış kullanıcılar (teamOnly). */
export default async function CustomerTeamPage() {
  const boot = await loadTeamBootstrap();
  if (boot.status === 'unauthenticated') redirect('/auth/login');
  if (boot.status === 'forbidden') redirect('/customer');
  return <TeamWorkspace basePath="/customer/ekip" viewer={boot.viewer} initialMeta={boot.initialMeta} currentWeekKey={boot.currentWeekKey} />;
}
