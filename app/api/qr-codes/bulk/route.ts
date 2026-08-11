import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (session.user.role !== 'DEALER' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await request.json();
    const { action, ids } = body as { action?: string; ids?: string[] };
    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'action ve ids gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    // Üst sınır: dev payload'ı (aşırı büyük IN listesi) engelle.
    if (ids.length > 1000) {
      return NextResponse.json({ error: 'Tek seferde en fazla 1000 kayıt işlenebilir' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const cleanIds = ids.filter((v): v is string => typeof v === 'string');
    const validActions = ['activate', 'deactivate', 'delete'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const where = {
      id: { in: cleanIds },
      ...(session.user.role === 'DEALER' ? { dealerId: session.user.id } : {}),
    };

    if (action === 'delete') {
      const deleted = await prisma.qRCode.deleteMany({ where });
      return NextResponse.json({ success: true, count: deleted.count }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const isActive = action === 'activate';
    const updated = await prisma.qRCode.updateMany({
      where,
      data: { isActive },
    });
    return NextResponse.json({ success: true, count: updated.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('QR bulk error:', error);
    return NextResponse.json({ error: 'İşlem başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
