import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { notifyDeadline, notifyTaskAutoApproved } from '@/lib/team-notify';
import { weekKeyOf, shiftWeekKey } from '@/lib/team-week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Günlük ekip bakımı (fail-closed):
 * 1) Tekrarlayan görevler — bu hafta tamamlanmış (done) recurring görevlerin bir
 *    sonraki döngü için yeni bir örneğini oluşturur (idempotent: recurrenceParentId + hedef weekKey).
 * 2) Otomatik onay — "Onayda" (review) durumunda takılı ve BİTİŞ TARİHİ GEÇMİŞ
 *    görevleri otomatik "done" yapar (yönetici zamanında onaylamadıysa). Bağlı
 *    olduğu görev bitmemişse onaylamaz. Sessiz DEĞİL: aktivite + üye/yönetici bildirimi.
 * 3) Deadline bildirimi — yarın veya bugün biten / süresi geçmiş açık görevlerin
 *    atananına in-app bildirim gönderir.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const now = new Date();
  const thisWeek = weekKeyOf(now);

  // ── 1) Tekrarlayan görev klonlama ────────────────────────────────
  const recurring = await prisma.companyTask.findMany({
    where: { recurrence: { not: null }, status: 'done', weekKey: thisWeek },
    select: {
      id: true, title: true, description: true, priority: true, department: true,
      tags: true, assignedToId: true, createdById: true, estimateMin: true,
      recurrence: true, recurrenceParentId: true,
    },
    take: 500,
  });

  let cloned = 0;
  for (const t of recurring) {
    // Sonraki hedef hafta: daily/weekly → +1 hafta, monthly → +4 hafta (haftalık pano yaklaşımı).
    const offset = t.recurrence === 'monthly' ? 4 : 1;
    const nextWeek = shiftWeekKey(thisWeek, offset);
    const parentKey = t.recurrenceParentId ?? t.id;

    // İdempotent: bu şablon için hedef haftada zaten bir örnek var mı?
    const exists = await prisma.companyTask.findFirst({
      where: { recurrenceParentId: parentKey, weekKey: nextWeek },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.companyTask.create({
      data: {
        title: t.title, description: t.description, priority: t.priority, department: t.department,
        tags: t.tags, assignedToId: t.assignedToId, createdById: t.createdById, estimateMin: t.estimateMin,
        weekKey: nextWeek, recurrence: t.recurrence, recurrenceParentId: parentKey, sourceType: 'manual',
      },
    });
    cloned++;
  }

  // ── 2) Otomatik onay: BİTİŞ TARİHİ GEÇMİŞ + "Onayda" takılı görevler ──
  //    Üye onaya gönderdi ama yönetici dueAt'e kadar onaylamadıysa sistem
  //    otomatik "done" yapar. Bağlı olduğu görev bitmemişse ATLA (blocker'a saygı).
  //    Sessiz değil: aktivite kaydı + üye/yönetici bildirimi.
  const stuckReview = await prisma.companyTask.findMany({
    where: {
      status: 'review',
      dueAt: { not: null, lt: now }, // bitiş tarihi geçmiş
    },
    select: { id: true, title: true, assignedToId: true, createdById: true, blockedById: true },
    take: 500,
  });

  let autoApproved = 0;
  for (const t of stuckReview) {
    // Bağımlılık: bağlı olduğu görev bitmemişse otomatik onaylama.
    if (t.blockedById) {
      const blocker = await prisma.companyTask.findUnique({
        where: { id: t.blockedById }, select: { status: true },
      });
      if (blocker && blocker.status !== 'done') continue;
    }
    // Atomik onay: yalnız hâlâ 'review' iken (yönetici bu arada onaylamış olabilir).
    const res = await prisma.companyTask.updateMany({
      where: { id: t.id, status: 'review' },
      data: {
        status: 'done',
        completedAt: now,
        approvedAt: now,
        approvedById: null, // sistem onayı (yönetici değil)
        reviewNote: 'Bitiş tarihi geçtiği için otomatik onaylandı (yönetici onayı gelmedi).',
      },
    });
    if (res.count === 0) continue; // araya yönetici girmiş, atla
    autoApproved++;

    // Sessiz DEĞİL: aktivite kaydı + bildirimler (fail-soft).
    await prisma.taskActivity.create({
      data: { taskId: t.id, actorId: t.createdById, action: 'status', detail: 'Bitiş tarihinde otomatik onaylandı (Bitti)' },
    }).catch(() => {});
    await notifyTaskAutoApproved({ taskId: t.id, taskTitle: t.title, assignedToId: t.assignedToId }).catch(() => {});
  }

  // ── 3) Deadline bildirimi ────────────────────────────────────────
  const soon = new Date(now.getTime() + 36 * 60 * 60 * 1000); // 36 saat penceresi
  const dueTasks = await prisma.companyTask.findMany({
    where: {
      status: { not: 'done' },
      assignedToId: { not: null },
      dueAt: { not: null, lte: soon },
    },
    select: { id: true, title: true, dueAt: true, assignedToId: true },
    take: 1000,
  });

  let notified = 0;
  for (const t of dueTasks) {
    if (!t.assignedToId || !t.dueAt) continue;
    const overdue = t.dueAt < now;
    await notifyDeadline({ userId: t.assignedToId, taskId: t.id, taskTitle: t.title, overdue });
    notified++;
  }

  return NextResponse.json({ success: true, cloned, autoApproved, notified });
}
