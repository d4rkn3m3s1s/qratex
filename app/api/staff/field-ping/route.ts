import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

const postSchema = z.object({
  note: z.string().max(240).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export async function GET() {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const dealerId = getStaffDealerId(auth.session);
  if (dealerId instanceof NextResponse) return dealerId;

  const rows = await prisma.analyticsEvent.findMany({
    where: {
      event: 'staff_field_ping',
      category: 'staff_field',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      data: { path: ['dealerId'], equals: dealerId },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { id: true, userId: true, data: true, createdAt: true },
  });

  return NextResponse.json({ success: true, pings: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const dealerId = getStaffDealerId(auth.session);
  if (dealerId instanceof NextResponse) return dealerId;

  const json = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.analyticsEvent.create({
    data: {
      userId: auth.session.user.id,
      event: 'staff_field_ping',
      category: 'staff_field',
      data: {
        dealerId,
        note: parsed.data.note ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    },
  });

  return NextResponse.json({ success: true });
}
