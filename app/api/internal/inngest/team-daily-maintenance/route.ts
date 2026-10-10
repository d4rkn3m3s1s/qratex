import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { notifyDeadline, notifyReviewLate } from '@/lib/team-notify';
import { NOT_INITIATIVE } from '@/lib/team/access';
import { addTeamDays, addTeamMonths, dueDayOf, effectiveDue, endOfIstanbulDay, isOverdue, istanbulDayOf, teamDayDiff } from '@/lib/team/dates';
import { runEffects, transitionTask } from '@/lib/team/transitions';
import { ApiError } from '@/lib/http/define-route';
import { weekKeyOf, shiftWeekKey, mondayFromWeekKey } from '@/lib/team-week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const AUTO_APPROVE_GRACE_MS = 24 * 3_600_000;

/**
 * Günlük ekip bakımı (fail-closed; `/api/cron/daily` içinden):
 *
 * 1) Tekrarlayan görevler — son 14 günde onaylanmış tekrarlı görevin bir sonraki örneği, GÖREVİN
 *    KENDİ haftasına göre üretilir (eski kod yalnız "bu hafta" bakıyordu: pazar akşamı biten
 *    görevin zinciri kırılıyordu; "Her gün" = haftalık, "Her ay" = 4 hafta idi). İdempotent:
 *    (recurrenceParentId, hedef hafta). Bitiş tarihi ve alt görev iskeleti de taşınır.
 * 2) Otomatik onay — "Onayda" bekleyen görev, bitiş GÜNÜ (İstanbul) bittikten 24 saat sonra
 *    hâlâ onaylanmadıysa sistem onaylar; ama yalnız kanıt ve bağımlılık kuralını geçerse
 *    (`transitionTask`, aktör "sistem"). Geçemiyorsa yöneticilere BİR KEZ "onay gecikti".
 * 3) Bitiş bildirimi — atanana bitiş gününden önce bir kez "yaklaşıyor", bitiş geçince bir kez
 *    "geçti" (eskiden arşivdekiler dahil her sabah süresiz gidiyordu). İşaret, görevin
 *    geçmişine yazılan sistem aktivitesidir (bitiş günüyle; tarih değişirse yeniden kurulur).
 *    "Gecikince" otomasyon tetiği de burada, görev başına bir kez çalışır.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const now = new Date();
  const thisWeek = weekKeyOf(now);
  const today = istanbulDayOf(now);

  // ── 1) Tekrar ────────────────────────────────────────────────────
  const recurring = await prisma.companyTask.findMany({
    where: {
      AND: [
        NOT_INITIATIVE,
        { recurrence: { not: null }, status: 'done', archivedAt: null, completedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      department: true,
      tags: true,
      assignedToId: true,
      createdById: true,
      estimateMin: true,
      recurrence: true,
      recurrenceParentId: true,
      weekKey: true,
      dueAt: true,
      completedAt: true,
      checklist: { orderBy: { order: 'asc' }, select: { text: true, order: true } },
    },
    take: 500,
  });

  let cloned = 0;
  for (const t of recurring) {
    const parentKey = t.recurrenceParentId ?? t.id;
    const baseWeek = t.weekKey ?? weekKeyOf(t.completedAt ?? now);
    const monthly = t.recurrence === 'monthly';
    let targetWeek: string;
    let nextDue: Date | null = null;
    const dueDay = dueDayOf(t.dueAt);
    if (monthly) {
      const anchor = dueDay ?? istanbulDayOf(mondayFromWeekKey(baseWeek));
      const nextDay = addTeamMonths(anchor, 1);
      targetWeek = weekKeyOf(endOfIstanbulDay(nextDay) ?? now);
      if (dueDay) nextDue = endOfIstanbulDay(nextDay);
    } else {
      targetWeek = shiftWeekKey(baseWeek, 1);
      if (dueDay) nextDue = endOfIstanbulDay(addTeamDays(dueDay, 7));
    }
    if (targetWeek < thisWeek) targetWeek = thisWeek; // kaçırılmış örnek bu haftaya düşer

    const exists = await prisma.companyTask.findFirst({
      where: { OR: [{ recurrenceParentId: parentKey }, { id: parentKey }], weekKey: targetWeek },
      select: { id: true },
    });
    if (exists) continue;

    const created = await prisma.companyTask.create({
      data: {
        title: t.title,
        description: t.description,
        priority: t.priority,
        department: t.department,
        tags: t.tags,
        assignedToId: t.assignedToId,
        createdById: t.createdById,
        estimateMin: t.estimateMin,
        weekKey: targetWeek,
        dueAt: nextDue,
        recurrence: t.recurrence === 'daily' ? 'weekly' : t.recurrence,
        recurrenceParentId: parentKey,
        sourceType: 'manual',
        checklist: t.checklist.length ? { create: t.checklist.map((c) => ({ text: c.text, order: c.order })) } : undefined,
        activities: { create: { actorId: t.createdById, action: 'created', detail: 'Tekrarlayan görevden üretildi' } },
      },
      select: { id: true, title: true, department: true, assignedToId: true, tags: true },
    });
    cloned++;
    const { runAutomations } = await import('@/lib/team-automation-engine');
    await runAutomations({ trigger: 'created', task: created, actorId: t.createdById }).catch(() => undefined);
  }

  // ── 2) Otomatik onay (kanıt + bağımlılık kontrollü) ──────────────
  const stuck = await prisma.companyTask.findMany({
    where: { AND: [NOT_INITIATIVE, { status: 'review', archivedAt: null, dueAt: { not: null, lt: now } }] },
    select: { id: true, title: true, dueAt: true },
    take: 500,
  });
  let autoApproved = 0;
  let reviewLate = 0;
  for (const t of stuck) {
    const due = effectiveDue(t.dueAt);
    if (!due || due.getTime() + AUTO_APPROVE_GRACE_MS > now.getTime()) continue;
    try {
      const res = await transitionTask({ taskId: t.id, to: 'done', actor: { userId: null, kind: 'system' } });
      await runEffects(res.effects);
      autoApproved++;
    } catch (err) {
      const reason = err instanceof ApiError ? err.message : 'beklenmeyen hata';
      const marker = `Onay gecikti (${dueDayOf(t.dueAt)})`;
      const seen = await prisma.taskActivity.findFirst({ where: { taskId: t.id, action: 'system_review_late', detail: marker }, select: { id: true } });
      if (seen) continue;
      const owner = await prisma.companyTask.findUnique({ where: { id: t.id }, select: { createdById: true } });
      if (!owner) continue;
      await prisma.taskActivity.create({ data: { taskId: t.id, actorId: owner.createdById, action: 'system_review_late', detail: marker } });
      await notifyReviewLate({ taskId: t.id, taskTitle: t.title, reason });
      reviewLate++;
    }
  }

  // ── 3) Bitiş bildirimleri (görev + bitiş günü başına bir kez) ────
  const soon = endOfIstanbulDay(addTeamDays(today, 1)) ?? new Date(now.getTime() + 36 * 3_600_000);
  const due = await prisma.companyTask.findMany({
    where: {
      AND: [
        NOT_INITIATIVE,
        {
          status: { not: 'done' },
          archivedAt: null,
          assignedToId: { not: null },
          dueAt: { not: null, lte: soon, gte: new Date(now.getTime() - 30 * 86_400_000) },
        },
      ],
    },
    select: { id: true, title: true, dueAt: true, assignedToId: true, createdById: true, department: true, tags: true },
    take: 1000,
  });
  const markers = due.length
    ? await prisma.taskActivity.findMany({
        where: { taskId: { in: due.map((t) => t.id) }, action: { in: ['system_due_soon', 'system_overdue'] } },
        select: { taskId: true, action: true, detail: true },
      })
    : [];
  const seen = new Set(markers.map((m) => `${m.taskId}|${m.action}|${m.detail}`));

  let notifiedSoon = 0;
  let notifiedOverdue = 0;
  for (const t of due) {
    if (!t.assignedToId || !t.dueAt) continue;
    const day = dueDayOf(t.dueAt);
    if (!day) continue;
    if (isOverdue(t.dueAt, now)) {
      const detail = `Bitiş günü geçti (${day})`;
      if (seen.has(`${t.id}|system_overdue|${detail}`)) continue;
      await prisma.taskActivity.create({ data: { taskId: t.id, actorId: t.createdById, action: 'system_overdue', detail } });
      await notifyDeadline({ userId: t.assignedToId, taskId: t.id, taskTitle: t.title, overdue: true });
      const { runAutomations } = await import('@/lib/team-automation-engine');
      await runAutomations({
        trigger: 'overdue',
        task: { id: t.id, title: t.title, department: t.department, assignedToId: t.assignedToId, tags: t.tags },
        actorId: t.createdById,
      }).catch(() => undefined);
      notifiedOverdue++;
    } else if (teamDayDiff(today, day) <= 1) {
      const detail = `Bitiş günü yaklaşıyor (${day})`;
      if (seen.has(`${t.id}|system_due_soon|${detail}`)) continue;
      await prisma.taskActivity.create({ data: { taskId: t.id, actorId: t.createdById, action: 'system_due_soon', detail } });
      await notifyDeadline({ userId: t.assignedToId, taskId: t.id, taskTitle: t.title, overdue: false });
      notifiedSoon++;
    }
  }

  return NextResponse.json({ success: true, cloned, autoApproved, reviewLate, notifiedSoon, notifiedOverdue });
}
