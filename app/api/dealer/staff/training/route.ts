import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  content: z.string(),
  orderIndex: z.number().optional(),
});

export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const modules = await prisma.trainingModule.findMany({
    where: { OR: [{ dealerId }, { dealerId: null }], isActive: true },
    orderBy: { orderIndex: 'asc' },
    take: 200,
  });

  return NextResponse.json({ success: true, modules }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const maxOrder = await prisma.trainingModule
    .aggregate({
      where: { dealerId },
      _max: { orderIndex: true },
    })
    .then((r) => (r._max.orderIndex ?? -1) + 1);

  const trainingModule = await prisma.trainingModule.create({
    data: {
      dealerId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      content: parsed.data.content,
      orderIndex: parsed.data.orderIndex ?? maxOrder,
    },
  });

  return NextResponse.json({ success: true, module: trainingModule }, { headers: PRIVATE_NO_STORE_HEADERS });
}
