import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TeamDepartments } from '@/components/team/departments/team-departments';
import { loadTeamBootstrap } from '@/lib/team/page-bootstrap';
import { getServerLocale } from '@/lib/server-locale';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  return locale === 'en'
    ? { title: 'Team directory', description: 'Who is in which department, and who to ask.' }
    : { title: 'Ekip rehberi', description: 'Kim hangi departmanda, kime danışmalı.' };
}

export default async function CustomerTeamDepartmentsPage() {
  const boot = await loadTeamBootstrap();
  if (boot.status === 'unauthenticated') redirect('/auth/login');
  if (boot.status === 'forbidden') redirect('/customer');
  return <TeamDepartments basePath="/customer/ekip" viewer={boot.viewer} initialMeta={boot.initialMeta} />;
}
