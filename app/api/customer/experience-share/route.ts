import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().min(1),
  caption: z.string().max(200).optional(),
  mood: z.enum(['great', 'good', 'ok']).optional(),
});

/** Arkadaşla paylaşılabilir anonim deneyim linki (7 gün geçerli). */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
  }

  const dealer = await prisma.user.findFirst({
    where: { id: parsed.data.dealerId, role: 'DEALER' },
    select: { id: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: 'İşletme bulunamadı' }, { status: 404 });
  }

  const token = randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  await prisma.experienceShareToken.create({
    data: {
      token,
      creatorId: auth.session.user.id,
      dealerId: parsed.data.dealerId,
      caption: parsed.data.caption?.trim() || null,
      mood: parsed.data.mood ?? 'good',
      expiresAt,
    },
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    new URL(request.url).origin;

  return NextResponse.json({
    success: true,
    token,
    shareUrl: `${base}/experience/${token}`,
    expiresAt: expiresAt.toISOString(),
  });
}
