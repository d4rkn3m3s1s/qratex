import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, requireTeamViewer, scopedTaskWhere } from '@/lib/team/access';
import { isOverdue } from '@/lib/team/dates';
import { isWeekKey, shiftWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

const query = z.object({
  weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional(),
  department: z.string().max(60).optional(),
  weeks: z.coerce.number().int().min(2).max(12).default(6),
});

/**
 * GET — pano özeti (BFF). Sayıları SUNUCU hesaplar ve FİLTRESİZDİR; kapsam görünürlükle
 * sınırlıdır (denetim Bulgu 43/44/15: KPI'lar arama filtresine bağlıydı, "Bu Hafta" başlığı
 * başka haftada da yazıyordu, trend seçili haftadan bağımsızdı ve arşivi sayıyordu,
 * onay rozeti Durum=Bitti filtresinde kayboluyordu).
 */
export const GET = defineRoute(
  { name: 'team.summary', roles: TEAM_ROUTE_ROLES, query, rateLimit: 'read' },
  async ({ user, query: q }) => {
    const viewer = await requireTeamViewer(user.id);
    const current = weekKeyOf();
    const week = q.weekKey ?? current;
    const dep = q.department && viewer.isManager ? { department: q.department } : null;
    const now = new Date();

    const weekWhere =
      week === current
        ? { OR: [{ weekKey: week }, { weekKey: { lt: week }, status: { not: 'done' } }] }
        : { weekKey: week };

    const keys: string[] = [];
    for (let i = q.weeks - 1; i >= 0; i--) keys.push(shiftWeekKey(week, -i));

    const [weekRows, trendRows, reviewCount, mine] = await Promise.all([
      prisma.companyTask.findMany({
        where: scopedTaskWhere(viewer, { archivedAt: null }, weekWhere, dep),
        select: { status: true, dueAt: true, weekKey: true, spentMin: true, estimateMin: true },
        take: 2000,
      }),
      prisma.companyTask.groupBy({
        by: ['weekKey', 'status'],
        where: scopedTaskWhere(viewer, { archivedAt: null, weekKey: { in: keys } }, dep),
        _count: { _all: true },
      }),
      prisma.companyTask.count({
        where: scopedTaskWhere(viewer, { archivedAt: null, status: 'review' }, viewer.isManager ? null : { assignedToId: viewer.userId }),
      }),
      prisma.companyTask.findMany({
        where: scopedTaskWhere(viewer, { archivedAt: null, assignedToId: viewer.userId }, {
          OR: [{ status: { not: 'done' } }, { status: 'done', weekKey: current }],
        }),
        select: { status: true, dueAt: true, reviewNote: true, submittedForReviewAt: true, approvedAt: true, weekKey: true, completedAt: true },
        take: 500,
      }),
    ]);

    const counts = { todo: 0, in_progress: 0, review: 0, done: 0 } as Record<string, number>;
    let overdue = 0;
    let carried = 0;
    let spentMin = 0;
    let estimateMin = 0;
    for (const r of weekRows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status !== 'done' && isOverdue(r.dueAt, now)) overdue++;
      if (r.weekKey && r.weekKey < week && r.status !== 'done') carried++;
      spentMin += r.spentMin ?? 0;
      estimateMin += r.estimateMin ?? 0;
    }
    const total = weekRows.length;

    const byWeek = new Map(keys.map((k) => [k, { total: 0, done: 0 }]));
    for (const r of trendRows) {
      const cur = r.weekKey ? byWeek.get(r.weekKey) : undefined;
      if (!cur) continue;
      cur.total += r._count._all;
      if (r.status === 'done') cur.done += r._count._all;
    }

    const myOpen = mine.filter((t) => t.status !== 'done');
    return {
      weekKey: week,
      currentWeekKey: current,
      isCurrentWeek: week === current,
      week: {
        total,
        todo: counts.todo ?? 0,
        inProgress: counts.in_progress ?? 0,
        review: counts.review ?? 0,
        done: counts.done ?? 0,
        overdue,
        carried,
        pct: total ? Math.round(((counts.done ?? 0) / total) * 100) : null,
        spentMin,
        estimateMin,
      },
      reviewQueue: reviewCount,
      trend: keys.map((k) => {
        const v = byWeek.get(k)!;
        return { weekKey: k, total: v.total, done: v.done, pct: v.total ? Math.round((v.done / v.total) * 100) : null };
      }),
      mine: {
        open: myOpen.length,
        inReview: myOpen.filter((t) => t.status === 'review').length,
        revision: myOpen.filter((t) => (t.status === 'todo' || t.status === 'in_progress') && t.reviewNote && !t.submittedForReviewAt && !t.approvedAt).length,
        overdue: myOpen.filter((t) => t.status !== 'review' && isOverdue(t.dueAt, now)).length,
        approvedThisWeek: mine.filter((t) => t.status === 'done').length,
      },
    };
  }
);
