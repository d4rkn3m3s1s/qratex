
export const dynamic = 'force-dynamic';

/**
 * P3 AI quality review: örnek listesi ve skor güncelleme.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';

const updateSchema = z.object({
  accuracyScore: z.number().min(0).max(100),
  notes: z.string().max(1000).optional().nullable(),
});

// GET /api/admin/ai-quality
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const samples = await prisma.aIQualitySample.findMany({
    where: status === 'all' ? {} : { status },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      feedback: {
        select: {
          id: true,
          text: true,
          rating: true,
          sentiment: true,
          intent: true,
          aiAnalysis: true,
          aiProcessedAt: true,
          qrCode: { select: { name: true } },
        },
      },
    },
  });

  const [pendingCount, reviewedCount] = await Promise.all([
    prisma.aIQualitySample.count({ where: { status: 'pending' } }),
    prisma.aIQualitySample.count({ where: { status: 'reviewed' } }),
  ]);

  return NextResponse.json({
    samples,
    stats: { pendingCount, reviewedCount },
  });
}

const patchBodySchema = updateSchema.extend({ id: z.string().min(1) });

// PATCH /api/admin/ai-quality – tek örnek skor güncelleme
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const sample = await prisma.aIQualitySample.findUnique({ where: { id: parsed.data.id } });
  if (!sample) return NextResponse.json({ error: 'Örnek bulunamadı' }, { status: 404 });

  const updated = await prisma.aIQualitySample.update({
    where: { id: parsed.data.id },
    data: {
      accuracyScore: parsed.data.accuracyScore,
      notes: parsed.data.notes ?? null,
      status: 'reviewed',
      reviewedAt: new Date(),
      reviewerId: session.user.id,
    },
  });

  return NextResponse.json({ sample: updated });
}
