import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { sendWeeklyReminderEmail } from '@/lib/team-email';
import { NOT_INITIATIVE } from '@/lib/team/access';
import { effectiveDue } from '@/lib/team/dates';
import { teamPanelBase } from '@/lib/team/href';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Haftalık (pazartesi): açık görevi olan her atanana ve onay bekleyen görev varken her
 * yöneticiye özet mail. Arşivdeki görevler ve girişimler sayılmaz; bağlantı alıcının
 * paneline göre (ADMIN → /admin/ekip). Eski sürüm açık görevi olmayan yöneticiye onay
 * özetini hiç göndermiyordu.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const origin = getPublicAppOrigin().replace(/\/$/, '');

  const open = await prisma.companyTask.findMany({
    where: { AND: [NOT_INITIATIVE, { status: { not: 'done' }, archivedAt: null, assignedToId: { not: null } }] },
    select: { title: true, priority: true, dueAt: true, assignedTo: { select: { id: true, name: true, email: true, role: true } } },
    take: 2000,
  });

  type Bucket = { name: string | null; email: string; role: string; tasks: { title: string; priority: string; dueAt: Date | null }[] };
  const byUser = new Map<string, Bucket>();
  for (const t of open) {
    const u = t.assignedTo;
    if (!u?.email) continue;
    const cur = byUser.get(u.id) ?? { name: u.name, email: u.email, role: String(u.role), tasks: [] };
    cur.tasks.push({ title: t.title, priority: t.priority, dueAt: effectiveDue(t.dueAt) });
    byUser.set(u.id, cur);
  }

  const reviewing = await prisma.companyTask.findMany({
    where: { AND: [NOT_INITIATIVE, { status: 'review', archivedAt: null }] },
    select: { title: true, assignedTo: { select: { name: true } } },
    orderBy: { submittedForReviewAt: 'asc' },
    take: 100,
  });
  const pendingApprovals = reviewing.map((t) => ({ title: t.title, submittedByName: t.assignedTo?.name ?? null }));

  const managers = await prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
    select: { id: true, name: true, email: true, role: true },
  });
  const managerIds = new Set(managers.map((m) => m.id));
  if (pendingApprovals.length > 0) {
    for (const m of managers) {
      if (!byUser.has(m.id) && m.email) byUser.set(m.id, { name: m.name, email: m.email, role: String(m.role), tasks: [] });
    }
  }

  let sent = 0;
  for (const [uid, u] of byUser) {
    await sendWeeklyReminderEmail({
      to: u.email,
      name: u.name,
      openTasks: u.tasks,
      pendingApprovals: managerIds.has(uid) && pendingApprovals.length > 0 ? pendingApprovals : undefined,
      link: `${origin}${teamPanelBase(u.role)}`,
    });
    sent++;
  }
  return NextResponse.json({ success: true, reminded: sent });
}
