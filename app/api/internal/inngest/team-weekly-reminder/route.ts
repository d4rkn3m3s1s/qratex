import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { sendWeeklyReminderEmail } from '@/lib/team-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Haftalık: açık (tamamlanmamış) görevi olan her atanana özet hatırlatma maili. Fail-closed. */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const open = await prisma.companyTask.findMany({
    where: { status: { not: 'done' }, assignedToId: { not: null } },
    select: { title: true, priority: true, dueAt: true, assignedTo: { select: { id: true, name: true, email: true } } },
    take: 2000,
  });

  const byUser = new Map<string, { name: string | null; email: string; tasks: { title: string; priority: string; dueAt: Date | null }[] }>();
  for (const t of open) {
    const u = t.assignedTo;
    if (!u?.email) continue;
    const cur = byUser.get(u.id) ?? { name: u.name, email: u.email, tasks: [] };
    cur.tasks.push({ title: t.title, priority: t.priority, dueAt: t.dueAt });
    byUser.set(u.id, cur);
  }

  // Onayda bekleyen (review) görevler — yöneticilere "onayını bekleyenler" özeti için.
  const reviewing = await prisma.companyTask.findMany({
    where: { status: 'review' },
    select: { title: true, assignedTo: { select: { name: true } } },
    orderBy: { submittedForReviewAt: 'asc' },
    take: 100,
  });
  const pendingApprovals = reviewing.map((t) => ({ title: t.title, submittedByName: t.assignedTo?.name ?? null }));

  // Yöneticiler (ADMIN + ekip yöneticisi) — pendingApprovals bloğu bunlara eklenir.
  const managers = await prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, { adminTeamRole: 'yonetici' }] },
    select: { id: true },
  });
  const managerIds = new Set(managers.map((m) => m.id));

  let sent = 0;
  for (const [uid, u] of byUser) {
    await sendWeeklyReminderEmail({
      to: u.email, name: u.name, openTasks: u.tasks,
      pendingApprovals: managerIds.has(uid) && pendingApprovals.length > 0 ? pendingApprovals : undefined,
    });
    sent++;
  }
  return NextResponse.json({ success: true, reminded: sent });
}
