import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

// Tetikleyici ve aksiyon türleri — TeamAutomation modeliyle birebir.
const TRIGGER_TYPES = ['status_changed', 'assigned', 'created', 'overdue'] as const;
const ACTION_TYPES = ['notify', 'add_tag', 'set_priority', 'assign', 'set_status'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(80),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerValue: z.string().max(200).optional(),
  actionType: z.enum(ACTION_TYPES),
  actionValue: z.string().max(200).optional(),
  department: z.string().max(50).optional(),
  enabled: z.boolean().default(true),
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
  triggerValue: z.string().max(200).optional(),
  actionValue: z.string().max(200).optional(),
  department: z.string().max(50).optional(),
});

/** GET: tüm otomasyon kuralları + oluşturan kişi. */
export async function GET() {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const automations = await prisma.teamAutomation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ success: true, automations }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** POST: otomasyon kuralı oluştur. Yönetici. */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const raw = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz otomasyon verisi' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;
  const automation = await prisma.teamAutomation.create({
    data: {
      name: d.name,
      triggerType: d.triggerType,
      triggerValue: d.triggerValue ?? null,
      actionType: d.actionType,
      actionValue: d.actionValue ?? null,
      department: d.department ?? null,
      enabled: d.enabled,
      createdById: auth.session.user.id,
    },
  });
  return NextResponse.json({ success: true, automation }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** PUT ?id=: kuralı kısmi güncelle. Yönetici. */
export async function PUT(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  const raw = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz istek' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;
  // Yalnızca gönderilen alanları güncelle (kısmi).
  const data: Record<string, unknown> = {};
  if (d.enabled !== undefined) data.enabled = d.enabled;
  if (d.name !== undefined) data.name = d.name;
  if (d.triggerValue !== undefined) data.triggerValue = d.triggerValue;
  if (d.actionValue !== undefined) data.actionValue = d.actionValue;
  if (d.department !== undefined) data.department = d.department;
  await prisma.teamAutomation.update({ where: { id }, data }).catch(() => null);
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?id=: kuralı sil. Yönetici. */
export async function DELETE(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  await prisma.teamAutomation.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
