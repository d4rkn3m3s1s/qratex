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
    select: { title: true, priority: true, assignedTo: { select: { id: true, name: true, email: true } } },
    take: 2000,
  });

  const byUser = new Map<string, { name: string | null; email: string; tasks: { title: string; priority: string }[] }>();
  for (const t of open) {
    const u = t.assignedTo;
    if (!u?.email) continue;
    const cur = byUser.get(u.id) ?? { name: u.name, email: u.email, tasks: [] };
    cur.tasks.push({ title: t.title, priority: t.priority });
    byUser.set(u.id, cur);
  }

  let sent = 0;
  for (const u of byUser.values()) {
    await sendWeeklyReminderEmail({ to: u.email, name: u.name, openTasks: u.tasks });
    sent++;
  }
  return NextResponse.json({ success: true, reminded: sent });
}
