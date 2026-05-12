import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['pending', 'assigned', 'in_progress', 'done', 'cancelled']).optional(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const existing = await prisma.actionItem.findUnique({
    where: { id },
    select: { dealerId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Aksiyon bulunamadı' }, { status: 404 });
  }
  if (session.user.role === 'DEALER' && existing.dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Bu aksiyonu güncelleme yetkiniz yok' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const data: { status?: string; assignedToId?: string | null; dueAt?: Date | null; completedAt?: Date | null } = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.assignedToId !== undefined) data.assignedToId = parsed.data.assignedToId;
  if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.completedAt !== undefined) data.completedAt = parsed.data.completedAt ? new Date(parsed.data.completedAt) : null;

  const updated = await prisma.actionItem.update({ where: { id }, data });
  return NextResponse.json(updated);
}
