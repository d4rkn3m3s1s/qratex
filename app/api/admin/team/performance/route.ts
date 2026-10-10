import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { NOT_INITIATIVE, TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';
import { effectiveDue, isOverdue } from '@/lib/team/dates';
import { isWeekKey, shiftWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

const query = z.object({
  weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional(),
  weeks: z.coerce.number().int().min(1).max(12).default(4),
  department: z.string().max(60).optional(),
});

type Acc = {
  total: number;
  done: number;
  open: number;
  overdue: number;
  onTime: number;
  doneWithDue: number;
  estimateMin: number;
  spentMin: number;
  cycleSum: number;
  cycleCount: number;
  reviewWaitSum: number;
  reviewWaitCount: number;
};

const empty = (): Acc => ({
  total: 0,
  done: 0,
  open: 0,
  overdue: 0,
  onTime: 0,
  doneWithDue: 0,
  estimateMin: 0,
  spentMin: 0,
  cycleSum: 0,
  cycleCount: 0,
  reviewWaitSum: 0,
  reviewWaitCount: 0,
});

/**
 * GET — kişi başı performans, SEÇİLİ DÖNEMDE (son N hafta, seçili haftada biter) ve
 * isteğe bağlı departmanda (denetim Bulgu 73: tüm zamanlar + bağlamsız "liderlik tablosu").
 * Zamanında teslim oranı, onay bekleme süresi, tahmin/gerçekleşen sapması kodla hesaplanır.
 */
export const GET = defineRoute(
  { name: 'team.performance', roles: TEAM_ROUTE_ROLES, query, rateLimit: 'read' },
  async ({ user, query: q }) => {
    await requireTeamViewer(user.id, { manager: true });
    const end = q.weekKey ?? weekKeyOf();
    const keys: string[] = [];
    for (let i = q.weeks - 1; i >= 0; i--) keys.push(shiftWeekKey(end, -i));

    const [members, tasks] = await Promise.all([
      prisma.user.findMany({
        where: { adminTeamRole: { not: null } },
        select: { id: true, name: true, image: true, adminTeamRole: true, adminDepartment: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      prisma.companyTask.findMany({
        where: {
          AND: [
            NOT_INITIATIVE,
            { assignedToId: { not: null }, archivedAt: null, weekKey: { in: keys } },
            ...(q.department ? [{ department: q.department }] : []),
          ],
        },
        select: {
          assignedToId: true,
          status: true,
          estimateMin: true,
          spentMin: true,
          dueAt: true,
          createdAt: true,
          completedAt: true,
          submittedForReviewAt: true,
          approvedAt: true,
        },
        take: 10_000,
      }),
    ]);

    const now = new Date();
    const byUser = new Map<string, Acc>();
    for (const t of tasks) {
      if (!t.assignedToId) continue;
      const s = byUser.get(t.assignedToId) ?? empty();
      s.total++;
      s.estimateMin += t.estimateMin ?? 0;
      s.spentMin += t.spentMin ?? 0;
      if (t.status === 'done') {
        s.done++;
        if (t.completedAt) {
          s.cycleSum += (t.completedAt.getTime() - t.createdAt.getTime()) / 3_600_000;
          s.cycleCount++;
          const due = effectiveDue(t.dueAt);
          if (due) {
            s.doneWithDue++;
            if (t.completedAt.getTime() <= due.getTime()) s.onTime++;
          }
        }
        if (t.submittedForReviewAt && t.approvedAt) {
          s.reviewWaitSum += Math.max(0, (t.approvedAt.getTime() - t.submittedForReviewAt.getTime()) / 3_600_000);
          s.reviewWaitCount++;
        }
      } else {
        s.open++;
        if (isOverdue(t.dueAt, now)) s.overdue++;
      }
      byUser.set(t.assignedToId, s);
    }

    const rows = members.map((m) => {
      const s = byUser.get(m.id) ?? empty();
      return {
        id: m.id,
        name: m.name,
        image: m.image,
        role: m.adminTeamRole,
        department: m.adminDepartment,
        total: s.total,
        done: s.done,
        open: s.open,
        overdue: s.overdue,
        completionRate: s.total ? Math.round((s.done / s.total) * 100) : null,
        onTimeRate: s.doneWithDue ? Math.round((s.onTime / s.doneWithDue) * 100) : null,
        estimateMin: s.estimateMin,
        spentMin: s.spentMin,
        avgCycleHours: s.cycleCount ? Math.round((s.cycleSum / s.cycleCount) * 10) / 10 : null,
        avgReviewWaitHours: s.reviewWaitCount ? Math.round((s.reviewWaitSum / s.reviewWaitCount) * 10) / 10 : null,
      };
    });

    const totals = rows.reduce(
      (a, r) => ({
        total: a.total + r.total,
        done: a.done + r.done,
        overdue: a.overdue + r.overdue,
        estimateMin: a.estimateMin + r.estimateMin,
        spentMin: a.spentMin + r.spentMin,
      }),
      { total: 0, done: 0, overdue: 0, estimateMin: 0, spentMin: 0 }
    );
    return { period: { from: keys[0], to: end, weeks: q.weeks }, totals, members: rows };
  }
);
