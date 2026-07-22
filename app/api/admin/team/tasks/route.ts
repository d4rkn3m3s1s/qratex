import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const STATUSES = ['todo', 'in_progress', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  status: z.enum(STATUSES).default('todo'),
  priority: z.enum(PRIORITIES).default('medium'),
  department: z.string().max(50).optional().nullable(),
  weekKey: z.string().max(10).optional().nullable(),
  tags: z.string().max(200).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

const updateSchema = createSchema.partial();

/** GET: görevleri listeler. ?department=, ?weekKey=, ?status=, ?mine=1 filtreleri. */
export async function GET(req: NextRequest) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const sp = req.nextUrl.searchParams;

  const where: Prisma.CompanyTaskWhereInput = {};
  const dep = sp.get('department');
  const week = sp.get('weekKey');
  const status = sp.get('status');
  if (dep) where.department = dep;
  if (week) where.weekKey = week;
  if (status && (STATUSES as readonly string[]).includes(status)) where.status = status;
  if (sp.get('mine') === '1') where.assignedToId = auth.session.user.id;

  const tasks = await prisma.companyTask.findMany({
    where,
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    include: {
      assignedTo: { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { comments: true, attachments: true, checklist: true } },
    },
  });

  return NextResponse.json({ success: true, tasks }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** POST: yeni görev oluşturur. */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const raw = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz görev verisi' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;

  const task = await prisma.companyTask.create({
    data: {
      title: d.title,
      description: d.description ?? null,
      status: d.status,
      priority: d.priority,
      department: d.department ?? null,
      weekKey: d.weekKey ?? null,
      tags: d.tags ?? null,
      assignedToId: d.assignedToId || null,
      createdById: auth.session.user.id,
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
    },
    include: { assignedTo: { select: { id: true, name: true, email: true, image: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: 'create',
      entity: 'company_task',
      entityId: task.id,
      newData: d as Prisma.InputJsonValue,
      ...getAuditRequestMeta(req),
    },
  });

  // Atama varsa bildirim maili (fire-and-forget)
  if (task.assignedTo?.email) {
    import('@/lib/team-email').then((m) => m.sendTaskAssignedEmail({
      to: task.assignedTo!.email, assigneeName: task.assignedTo!.name,
      taskTitle: task.title, priority: task.priority, dueAt: task.dueAt,
    })).catch(() => {});
  }

  return NextResponse.json({ success: true, task }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** PUT ?id=: görev günceller (durum/atama/vb.). Kanban sürükle-bırak da bunu kullanır. */
export async function PUT(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  const raw = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz güncelleme' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;

  const existing = await prisma.companyTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ success: false, error: 'Görev bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  const data: Prisma.CompanyTaskUpdateInput = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description;
  if (d.priority !== undefined) data.priority = d.priority;
  if (d.department !== undefined) data.department = d.department;
  if (d.weekKey !== undefined) data.weekKey = d.weekKey;
  if (d.tags !== undefined) data.tags = d.tags;
  if (d.dueAt !== undefined) data.dueAt = d.dueAt ? new Date(d.dueAt) : null;
  if (d.assignedToId !== undefined) {
    data.assignedTo = d.assignedToId ? { connect: { id: d.assignedToId } } : { disconnect: true };
  }
  if (d.status !== undefined) {
    data.status = d.status;
    // "done"a geçince completedAt damgala; geri alınca temizle.
    data.completedAt = d.status === 'done' ? new Date() : null;
  }

  const task = await prisma.companyTask.update({
    where: { id },
    data,
    include: { assignedTo: { select: { id: true, name: true, email: true, image: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: 'update',
      entity: 'company_task',
      entityId: id,
      oldData: { status: existing.status, assignedToId: existing.assignedToId } as Prisma.InputJsonValue,
      newData: d as Prisma.InputJsonValue,
      ...getAuditRequestMeta(req),
    },
  });

  return NextResponse.json({ success: true, task }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?id=: görev siler. */
export async function DELETE(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  await prisma.companyTask.delete({ where: { id } }).catch(() => null);

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: 'delete',
      entity: 'company_task',
      entityId: id,
      ...getAuditRequestMeta(req),
    },
  });

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
