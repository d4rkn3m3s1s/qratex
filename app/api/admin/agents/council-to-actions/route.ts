import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().min(1),
  topic: z.string().min(3).max(500),
  actions: z
    .array(
      z.object({
        title: z.string().min(3).max(400),
        owner: z.string().max(120).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      })
    )
    .min(1)
    .max(12),
});

/**
 * Agent Council karar aksiyonlarını seçilen bayinin ActionItem kuyruğuna yazar (feedback bağlantısız).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const dealer = await prisma.user.findFirst({
    where: { id: parsed.data.dealerId, role: 'DEALER' },
    select: { id: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: 'Bayi bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { dealerId, topic, actions } = parsed.data;

  const defaultDue = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const impactFor = (p: string | undefined) =>
    p === 'high' ? 88 : p === 'low' ? 42 : 66;

  const created = await prisma.$transaction(
    actions.map((a) =>
      prisma.actionItem.create({
        data: {
          dealerId,
          feedbackId: null,
          suggestionText: `[Agent Council] ${topic}\n\n${a.title}${a.owner ? `\nSorumlu (öneri): ${a.owner}` : ''}`,
          priority: a.priority ?? 'medium',
          status: 'pending',
          sourceModule: 'agent_council',
          dueAt: defaultDue,
          impactScore: impactFor(a.priority),
        },
      })
    )
  );

  return NextResponse.json({
    success: true,
    count: created.length,
    ids: created.map((c) => c.id),
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
