import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { assertModuleEnabled } from '@/lib/module-gate';

export const dynamic = 'force-dynamic';

/** GET: Admin gönderilen sürpriz kutuları listeler */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const gate = await assertModuleEnabled('surprise_boxes', {
    role: 'system',
    request,
    userId: auth.session.user.id,
    routeKey: '/admin/surprise-boxes',
  });
  if (gate) return gate;

  try {
    const boxes = await prisma.userSurpriseBox.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, name: true, email: true } },
        sentBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: boxes,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Admin surprise-box list error:', e);
    return NextResponse.json(
      { success: false, error: 'Liste alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
