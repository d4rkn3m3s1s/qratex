import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamWorkspace } from '@/components/team/team-workspace';
import { loadTeamBootstrap } from '@/lib/team/page-bootstrap';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Ekip',
  description: 'İç ekip çalışma alanı: haftalık pano, onay kuyruğu, girişimler ve raporlar.',
};

/** Admin paneli ekip çalışma alanı (sunucu bileşeni: yetki ve ilk veri sunucuda). */
export default async function AdminTeamPage() {
  const boot = await loadTeamBootstrap();
  if (boot.status === 'unauthenticated') redirect('/auth/login');
  if (boot.status === 'forbidden') redirect('/admin');
  return <TeamWorkspace basePath="/admin/ekip" viewer={boot.viewer} initialMeta={boot.initialMeta} currentWeekKey={boot.currentWeekKey} />;
}
