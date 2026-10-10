import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamDepartments } from '@/components/team/departments/team-departments';
import { loadTeamBootstrap } from '@/lib/team/page-bootstrap';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ekip rehberi', description: 'Kim hangi departmanda, kime danışmalı.' };

export default async function CustomerTeamDepartmentsPage() {
  const boot = await loadTeamBootstrap();
  if (boot.status === 'unauthenticated') redirect('/auth/login');
  if (boot.status === 'forbidden') redirect('/customer');
  return <TeamDepartments basePath="/customer/ekip" viewer={boot.viewer} initialMeta={boot.initialMeta} />;
}
