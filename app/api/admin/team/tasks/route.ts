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
  estimateMin: z.number().int().min(0).max(100000).optional().nullable(),
  spentMin: z.number().int().min(0).max(100000).optional(),
  blockedById: z.string().optional().nullable(),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  archived: z.boolean().optional(), // true=arşivle, false=arşivden çıkar
});

/** GET: görevleri listeler. ?department=, ?weekKey=, ?status=, ?mine=1 filtreleri. */
export async function GET(req: NextRequest) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const sp = req.nextUrl.searchParams;

  const where: Prisma.CompanyTaskWhereInput = {};
  const dep = sp.get('department');
  const week = sp.get('weekKey');
  const status = sp.get('status');
  const priority = sp.get('priority');
  const assignee = sp.get('assignedTo');
  const tag = sp.get('tag');
  const q = sp.get('q')?.trim();
  // Arşiv: varsayılan sadece aktif (archivedAt null); ?archived=1 ile sadece arşivlenenler.
  where.archivedAt = sp.get('archived') === '1' ? { not: null } : null;
  if (dep) where.department = dep;
  if (week) where.weekKey = week;
  if (status && (STATUSES as readonly string[]).includes(status)) where.status = status;
  if (priority && (PRIORITIES as readonly string[]).includes(priority)) where.priority = priority;
  if (sp.get('mine') === '1') where.assignedToId = auth.session.user.id;
  else if (assignee === 'unassigned') where.assignedToId = null;
  else if (assignee) where.assignedToId = assignee;
  if (tag) where.tags = { contains: tag, mode: 'insensitive' };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { tags: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Kullanıcı sıralaması (?sort=). Varsayılan: durum→öncelik→oluşturma.
  const sort = sp.get('sort');
  const orderByMap: Record<string, Prisma.CompanyTaskOrderByWithRelationInput[]> = {
    manual: [{ boardOrder: 'asc' }, { createdAt: 'desc' }],
    priority: [{ priority: 'desc' }, { createdAt: 'desc' }],
    due: [{ dueAt: 'asc' }],
    title: [{ title: 'asc' }],
    created: [{ createdAt: 'desc' }],
    updated: [{ updatedAt: 'desc' }],
    spent: [{ spentMin: 'desc' }],
  };
  const orderBy = orderByMap[sort ?? ''] ?? [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }];

  const tasks = await prisma.companyTask.findMany({
    where,
    orderBy,
    take: 500,
    include: {
      assignedTo: { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { id: true, name: true } },
      blockedBy: { select: { id: true, title: true, status: true } },
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
      estimateMin: d.estimateMin ?? null,
      blockedById: d.blockedById || null,
      recurrence: d.recurrence ?? null,
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
  // Aktivite feed için "created" kaydı.
  await prisma.taskActivity.create({
    data: { taskId: task.id, actorId: auth.session.user.id, action: 'created', detail: 'Görevi oluşturdu' },
  }).catch(() => {});

  // Atama varsa bildirim maili + in-app bildirim (fire-and-forget)
  if (task.assignedTo?.email && task.assignedToId) {
    import('@/lib/team-email').then((m) => m.sendTaskAssignedEmail({
      to: task.assignedTo!.email, assigneeName: task.assignedTo!.name,
      taskTitle: task.title, priority: task.priority, dueAt: task.dueAt,
    })).catch(() => {});
    import('@/lib/team-notify').then((m) => m.notifyTaskAssigned({
      userId: task.assignedToId!, taskId: task.id, taskTitle: task.title, priority: task.priority,
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
  if (d.estimateMin !== undefined) data.estimateMin = d.estimateMin;
  if (d.spentMin !== undefined) data.spentMin = d.spentMin;
  if (d.recurrence !== undefined) data.recurrence = d.recurrence;
  if (d.archived !== undefined) data.archivedAt = d.archived ? new Date() : null;
  if (d.assignedToId !== undefined) {
    data.assignedTo = d.assignedToId ? { connect: { id: d.assignedToId } } : { disconnect: true };
  }
  // Bağımlılık: kendine bağlanmayı ve basit A↔B döngüsünü engelle.
  if (d.blockedById !== undefined) {
    if (!d.blockedById) {
      data.blockedBy = { disconnect: true };
    } else if (d.blockedById === id) {
      return NextResponse.json({ success: false, error: 'Görev kendine bağımlı olamaz' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    } else {
      const other = await prisma.companyTask.findUnique({ where: { id: d.blockedById }, select: { blockedById: true } });
      if (other?.blockedById === id) {
        return NextResponse.json({ success: false, error: 'Döngüsel bağımlılık oluşturulamaz' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
      }
      data.blockedBy = { connect: { id: d.blockedById } };
    }
  }
  const movingToDone = d.status === 'done' && existing.status !== 'done';
  if (d.status !== undefined) {
    // Bağlı olduğu görev bitmeden "done"a geçişi engelle.
    if (d.status === 'done' && existing.blockedById) {
      const blocker = await prisma.companyTask.findUnique({ where: { id: existing.blockedById }, select: { status: true } });
      if (blocker && blocker.status !== 'done') {
        return NextResponse.json({ success: false, error: 'Önce bağlı olduğu görev tamamlanmalı' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
      }
    }
    // ZORUNLU TAMAMLAMA: "done"a geçmek için görevde en az bir yorum (not) VEYA dosya eki olmalı.
    // İstemci `forceDone` göndermez; kanıt yoksa 409 + gereken bilgi döner (UI modal açar).
    if (movingToDone) {
      const counts = await prisma.companyTask.findUnique({
        where: { id }, select: { _count: { select: { comments: true, attachments: true } } },
      });
      const hasProof = (counts?._count.comments ?? 0) > 0 || (counts?._count.attachments ?? 0) > 0;
      if (!hasProof) {
        return NextResponse.json(
          { success: false, error: 'Görevi bitirmek için ne yaptığını not olarak yaz veya bir döküman ekle.', code: 'PROOF_REQUIRED' },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
        );
      }
    }
    data.status = d.status;
    // "done"a geçince completedAt damgala; geri alınca temizle.
    data.completedAt = d.status === 'done' ? new Date() : null;
  }

  const task = await prisma.companyTask.update({
    where: { id },
    data,
    include: { assignedTo: { select: { id: true, name: true, email: true, image: true } } },
  });

  // Yeni birine atandıysa (değişiklik) bildirim + mail gönder (fire-and-forget).
  if (d.assignedToId && d.assignedToId !== existing.assignedToId && task.assignedTo?.email) {
    import('@/lib/team-email').then((m) => m.sendTaskAssignedEmail({
      to: task.assignedTo!.email, assigneeName: task.assignedTo!.name,
      taskTitle: task.title, priority: task.priority, dueAt: task.dueAt,
    })).catch(() => {});
    import('@/lib/team-notify').then((m) => m.notifyTaskAssigned({
      userId: d.assignedToId!, taskId: task.id, taskTitle: task.title, priority: task.priority,
    })).catch(() => {});
  }

  // Görev tamamlandıysa yöneticilere + oluşturana bildirim (fire-and-forget).
  if (movingToDone) {
    const actor = await prisma.user.findUnique({ where: { id: auth.session.user.id }, select: { name: true } }).catch(() => null);
    import('@/lib/team-notify').then((m) => m.notifyTaskCompleted({
      taskId: task.id, taskTitle: task.title,
      completedById: auth.session.user.id, completedByName: actor?.name,
      createdById: existing.createdById,
    })).catch(() => {});
  }

  // Aktivite feed için TaskActivity kayıtları (status/atama/öncelik değişimleri).
  const STATUS_LABEL: Record<string, string> = { todo: 'Yapılacak', in_progress: 'Devam Ediyor', done: 'Bitti' };
  const PRIO_LABEL: Record<string, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
  const activityRows: { taskId: string; actorId: string; action: string; detail: string }[] = [];
  if (d.status !== undefined && d.status !== existing.status) {
    activityRows.push({ taskId: id, actorId: auth.session.user.id, action: 'status', detail: `Durumu "${STATUS_LABEL[d.status] ?? d.status}" yaptı` });
  }
  if (d.assignedToId !== undefined && d.assignedToId !== existing.assignedToId) {
    activityRows.push({ taskId: id, actorId: auth.session.user.id, action: 'assigned', detail: task.assignedTo ? `${task.assignedTo.name || task.assignedTo.email} kişisine atadı` : 'Atamayı kaldırdı' });
  }
  if (d.priority !== undefined && d.priority !== existing.priority) {
    activityRows.push({ taskId: id, actorId: auth.session.user.id, action: 'priority', detail: `Önceliği "${PRIO_LABEL[d.priority] ?? d.priority}" yaptı` });
  }
  if (activityRows.length > 0) {
    await prisma.taskActivity.createMany({ data: activityRows }).catch(() => {});
  }

  // Otomasyon motoru: status/atama değişince kuralları çalıştır (fire-and-forget).
  if (d.status !== undefined && d.status !== existing.status) {
    import('@/lib/team-automation-engine').then((m) => m.runAutomations({
      trigger: 'status_changed', triggerValue: d.status,
      task: { id: task.id, title: task.title, department: task.department, assignedToId: task.assignedToId, tags: task.tags },
      actorId: auth.session.user.id,
    })).catch(() => {});
  }
  if (d.assignedToId !== undefined && d.assignedToId !== existing.assignedToId && d.assignedToId) {
    import('@/lib/team-automation-engine').then((m) => m.runAutomations({
      trigger: 'assigned', triggerValue: d.assignedToId ?? undefined,
      task: { id: task.id, title: task.title, department: task.department, assignedToId: task.assignedToId, tags: task.tags },
      actorId: auth.session.user.id,
    })).catch(() => {});
  }

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
