import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamDepartments } from '@/components/team/departments/team-departments';
import { loadTeamBootstrap } from '@/lib/team/page-bootstrap';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Departmanlar ve üyeler', description: 'Ekip yapısı, roller ve erişim.' };

export default async function AdminTeamDepartmentsPage() {
  const boot = await loadTeamBootstrap();
  if (boot.status === 'unauthenticated') redirect('/auth/login');
  if (boot.status === 'forbidden') redirect('/admin');
  return <TeamDepartments basePath="/admin/ekip" viewer={boot.viewer} initialMeta={boot.initialMeta} />;
}
