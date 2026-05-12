import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  templateId: z.string(),
  shiftId: z.string().optional(),
  items: z.array(z.object({ itemId: z.string(), done: z.boolean() })),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const session = auth.session;
  const dealerId = getStaffDealerId(session);
  if (dealerId instanceof Response) return dealerId;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });
  }

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: parsed.data.templateId, dealerId, isActive: true },
  });
  if (!template) {
    return NextResponse.json({ error: 'Checklist bulunamadı' }, { status: 404 });
  }

  const completion = await prisma.staffChecklistCompletion.create({
    data: {
      userId,
      templateId: parsed.data.templateId,
      shiftId: parsed.data.shiftId ?? null,
      items: parsed.data.items as object,
    },
  });

  return NextResponse.json({ success: true, completion });
}
