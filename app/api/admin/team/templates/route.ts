import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

const PRIORITIES = ['low', 'medium', 'high'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  priority: z.enum(PRIORITIES).default('medium'),
  department: z.string().max(50).optional().nullable(),
  tags: z.string().max(200).optional().nullable(),
  estimateMin: z.number().int().min(0).max(100000).optional().nullable(),
  checklist: z.string().max(4000).optional().nullable(), // satır-ayrık
});

/** GET: tüm görev şablonları. */
export async function GET() {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const templates = await prisma.taskTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ success: true, templates }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** POST: şablon oluştur. Yönetici. */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const raw = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz şablon verisi' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;
  const template = await prisma.taskTemplate.create({
    data: {
      name: d.name, title: d.title, description: d.description ?? null, priority: d.priority,
      department: d.department ?? null, tags: d.tags ?? null, estimateMin: d.estimateMin ?? null,
      checklist: d.checklist ?? null, createdById: auth.session.user.id,
    },
  });
  return NextResponse.json({ success: true, template }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const applySchema = z.object({
  templateId: z.string(),
  weekKey: z.string().max(10).optional(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

/** PUT: şablondan görev oluştur (checklist iskeletiyle birlikte). Yönetici. */
export async function PUT(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const raw = await req.json().catch(() => ({}));
  const parsed = applySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz istek' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const { templateId, weekKey, assignedToId, dueAt } = parsed.data;
  const tpl = await prisma.taskTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) return NextResponse.json({ success: false, error: 'Şablon bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  const checklistLines = (tpl.checklist ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 50);

  const task = await prisma.companyTask.create({
    data: {
      title: tpl.title, description: tpl.description, priority: tpl.priority,
      department: tpl.department, tags: tpl.tags, estimateMin: tpl.estimateMin,
      weekKey: weekKey || weekKeyOf(), assignedToId: assignedToId || null,
      dueAt: dueAt ? new Date(dueAt) : null, createdById: auth.session.user.id,
      sourceType: 'manual',
      checklist: { create: checklistLines.map((text, i) => ({ text, order: i })) },
    },
    include: { assignedTo: { select: { id: true, name: true, email: true, image: true } } },
  });

  return NextResponse.json({ success: true, task }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?id=: şablon sil. Yönetici. */
export async function DELETE(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  await prisma.taskTemplate.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
