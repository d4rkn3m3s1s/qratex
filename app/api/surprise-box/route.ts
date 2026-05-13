import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/** GET: Müşterinin sürpriz kutuları (açılmamış önce) */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const boxes = await prisma.userSurpriseBox.findMany({
      where: { userId: session.user.id },
      orderBy: [{ openedAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    const unopened = boxes.filter((b) => !b.openedAt);
    const opened = boxes.filter((b) => b.openedAt);

    return NextResponse.json({
      success: true,
      data: { unopened, opened, all: boxes },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    console.error('Surprise box list error:', e);
    return NextResponse.json({ success: false, error: 'Kutular yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
