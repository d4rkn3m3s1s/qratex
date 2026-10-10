import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamWorkspace } from '@/components/team/team-workspace';
import { loadTeamBootstrap } from '@/lib/team/page-bootstrap';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Ekip',
  description: 'Sana atanan işler, ekibinin haftası ve girişimler.',
};

/** Müşteri paneli ekip çalışma alanı — yalnız ekip rolü atanmış kullanıcılar (teamOnly). */
export default async function CustomerTeamPage() {
  const boot = await loadTeamBootstrap();
  if (boot.status === 'unauthenticated') redirect('/auth/login');
  if (boot.status === 'forbidden') redirect('/customer');
  return <TeamWorkspace basePath="/customer/ekip" viewer={boot.viewer} initialMeta={boot.initialMeta} currentWeekKey={boot.currentWeekKey} />;
}
