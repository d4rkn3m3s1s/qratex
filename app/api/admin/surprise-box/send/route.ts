import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { assertModuleEnabled } from '@/lib/module-gate';

const sendSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().max(2000).optional(),
  couponCode: z.string().max(50).optional(),
  points: z.number().int().min(0).default(0),
  rewardType: z.string().max(50).optional(),
  // Tek kullanıcı: userId veya email
  userId: z.string().optional(),
  email: z.string().email().optional(),
  // Rastgele N müşteri
  randomCount: z.number().int().min(1).max(500).optional(),
});

export const dynamic = 'force-dynamic';

/** POST: Admin sürpriz kutu gönderir (isimle veya rastgele) */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const gate = await assertModuleEnabled('surprise_boxes', {
    role: 'system',
    request: req,
    userId: auth.session.user.id,
    routeKey: '/admin/surprise-boxes/send',
  });
  if (gate) return gate;

  try {
    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz istek', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, message, couponCode, points, rewardType, userId, email, randomCount } =
      parsed.data;

    let targetUserIds: string[] = [];

    if (userId) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!u) {
        return NextResponse.json(
          { success: false, error: 'Belirtilen kullanıcı bulunamadı' },
          { status: 404 }
        );
      }
      targetUserIds = [u.id];
    } else if (email) {
      const u = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });
      if (!u) {
        return NextResponse.json(
          { success: false, error: 'Belirtilen e-posta ile kullanıcı bulunamadı' },
          { status: 404 }
        );
      }
      targetUserIds = [u.id];
    } else if (randomCount) {
      const customers = await prisma.user.findMany({
        where: { role: 'CUSTOMER' },
        select: { id: true },
        take: randomCount * 2,
      });
      const shuffled = customers.sort(() => Math.random() - 0.5);
      targetUserIds = shuffled.slice(0, randomCount).map((c) => c.id);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Hedef belirtin: userId, email veya randomCount (1–500)',
        },
        { status: 400 }
      );
    }

    if (targetUserIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Gönderilecek kullanıcı bulunamadı' },
        { status: 400 }
      );
    }

    const created = await prisma.userSurpriseBox.createMany({
      data: targetUserIds.map((uid) => ({
        userId: uid,
        sentByUserId: auth.session!.user.id,
        title,
        message: message ?? null,
        couponCode: couponCode ?? null,
        points: points ?? 0,
        rewardType: rewardType ?? null,
      })),
    });

    return NextResponse.json({
      success: true,
      data: { count: created.count, userIds: targetUserIds },
    });
  } catch (e) {
    console.error('Admin surprise-box send error:', e);
    return NextResponse.json(
      { success: false, error: 'Kutu gönderilemedi' },
      { status: 500 }
    );
  }
}
