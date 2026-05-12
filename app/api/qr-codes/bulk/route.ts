import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'DEALER' && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
    }

    const body = await request.json();
    const { action, ids } = body as { action?: string; ids?: string[] };
    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'action ve ids gerekli' }, { status: 400 });
    }
    const validActions = ['activate', 'deactivate', 'delete'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 });
    }

    const where = {
      id: { in: ids },
      ...(session.user.role === 'DEALER' ? { dealerId: session.user.id } : {}),
    };

    if (action === 'delete') {
      const deleted = await prisma.qRCode.deleteMany({ where });
      return NextResponse.json({ success: true, count: deleted.count });
    }

    const isActive = action === 'activate';
    const updated = await prisma.qRCode.updateMany({
      where,
      data: { isActive },
    });
    return NextResponse.json({ success: true, count: updated.count });
  } catch (error) {
    console.error('QR bulk error:', error);
    return NextResponse.json({ error: 'İşlem başarısız' }, { status: 500 });
  }
}
