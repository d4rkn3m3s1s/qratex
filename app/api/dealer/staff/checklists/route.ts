import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  type: z.enum(['open', 'close', 'custom']),
  title: z.string().min(1).max(200),
  items: z.array(z.object({ id: z.string(), label: z.string(), required: z.boolean().optional() })),
});

export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const templates = await prisma.checklistTemplate.findMany({
    where: { dealerId, isActive: true },
    orderBy: { type: 'asc' },
  });

  return NextResponse.json({ success: true, templates });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });
  }

  const template = await prisma.checklistTemplate.create({
    data: {
      dealerId,
      type: parsed.data.type,
      title: parsed.data.title,
      items: parsed.data.items as object,
    },
  });

  return NextResponse.json({ success: true, template });
}
