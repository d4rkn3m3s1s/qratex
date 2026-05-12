import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().max(500).optional(),
});

export async function GET() {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const requests = await prisma.staffLeaveRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ success: true, requests });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const session = auth.session;
  const dealerId = getStaffDealerId(session);
  if (dealerId instanceof Response) return dealerId;
  const userId = session.user.id;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });
  }

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (end < start) {
    return NextResponse.json({ error: 'Bitiş tarihi başlangıçtan önce olamaz' }, { status: 400 });
  }

  const leave = await prisma.staffLeaveRequest.create({
    data: {
      dealerId,
      userId,
      startDate: start,
      endDate: end,
      reason: parsed.data.reason ?? null,
    },
  });

  return NextResponse.json({ success: true, request: leave });
}
