import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SENT']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'status: APPROVED | REJECTED | SENT' }, { status: 400 });
  }

  const existing = await prisma.segmentCampaignProposal.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });
  }

  const proposal = await prisma.segmentCampaignProposal.update({
    where: { id },
    data: {
      status: parsed.data.status,
      decidedAt: new Date(),
      decidedById: session.user.id,
    },
  });

  return NextResponse.json({ success: true, proposal });
}
