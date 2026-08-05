import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const STATUSES = ['todo', 'in_progress', 'review', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.discriminatedUnion('op', [
    z.object({ op: z.literal('status'), value: z.enum(STATUSES) }),
    z.object({ op: z.literal('priority'), value: z.enum(PRIORITIES) }),
    z.object({ op: z.literal('assign'), value: z.string().nullable() }),
    z.object({ op: z.literal('department'), value: z.string().nullable() }),
    z.object({ op: z.literal('archive'), value: z.boolean() }), // true=arşivle, false=çıkar
    z.object({ op: z.literal('tag_add'), value: z.string().max(50) }), // toplu etiket ekle
    z.object({ op: z.literal('delete') }),
  ]),
});

/** POST: seçili görevlere toplu işlem (durum/öncelik/atama/departman/sil). Yönetici. */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const raw = await req.json().catch(() => ({}));
  const parsed = bulkSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz toplu işlem' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const { ids, action } = parsed.data;
  const where = { id: { in: ids } };

  let affected = 0;
  if (action.op === 'delete') {
    const res = await prisma.companyTask.deleteMany({ where });
    affected = res.count;
  } else if (action.op === 'tag_add') {
    // Her göreve etiketi ekle (mevcut CSV'ye, tekrar yoksa). updateMany ile yapılamaz.
    const rows = await prisma.companyTask.findMany({ where, select: { id: true, tags: true } });
    for (const r of rows) {
      const set = new Set((r.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean));
      set.add(action.value.trim());
      await prisma.companyTask.update({ where: { id: r.id }, data: { tags: [...set].join(',') } }).catch(() => {});
      affected++;
    }
  } else if (action.op === 'status' && action.value === 'done') {
    // Toplu ONAY (done): PUT ile aynı iş kuralları — her görev için kanıt (yorum/ek)
    // ve bağımlılık (blocker bitmiş mi) kontrolü. Uymayan görevler ATLANIR (sessizce
    // done yapılmaz). Bu yüzden updateMany değil, tek tek işlenir.
    const rows = await prisma.companyTask.findMany({
      where, select: { id: true, blockedById: true, _count: { select: { comments: true, attachments: true } } },
    });
    const now = new Date();
    for (const r of rows) {
      const hasProof = r._count.comments > 0 || r._count.attachments > 0;
      if (!hasProof) continue; // kanıtsız görev done yapılmaz
      if (r.blockedById) {
        const blocker = await prisma.companyTask.findUnique({ where: { id: r.blockedById }, select: { status: true } });
        if (blocker && blocker.status !== 'done') continue; // bağlı görev bitmemiş
      }
      await prisma.companyTask.update({
        where: { id: r.id },
        data: { status: 'done', completedAt: now, approvedById: auth.session.user.id, approvedAt: now },
      }).catch(() => {});
      affected++;
    }
  } else {
    const data: Prisma.CompanyTaskUncheckedUpdateManyInput = {};
    if (action.op === 'status') {
      // (done buraya düşmez — yukarıda özel işlenir.) todo/in_progress/review:
      data.status = action.value;
      data.completedAt = null;
      data.approvedById = null;
      data.approvedAt = null;
      if (action.value === 'review') data.submittedForReviewAt = new Date();
    } else if (action.op === 'priority') {
      data.priority = action.value;
    } else if (action.op === 'assign') {
      data.assignedToId = action.value || null;
    } else if (action.op === 'department') {
      data.department = action.value || null;
    } else if (action.op === 'archive') {
      data.archivedAt = action.value ? new Date() : null;
    }
    const res = await prisma.companyTask.updateMany({ where, data });
    affected = res.count;
  }

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: `bulk_${action.op}`,
      entity: 'company_task',
      entityId: ids[0],
      newData: { ids, action, affected } as Prisma.InputJsonValue,
      ...getAuditRequestMeta(req),
    },
  });

  return NextResponse.json({ success: true, affected }, { headers: PRIVATE_NO_STORE_HEADERS });
}
