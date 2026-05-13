
export const dynamic = 'force-dynamic';

/**
 * POST /api/qr-codes/[id]/rotate
 * P2-32 QR lifecycle: Generate new code, revoke old (rotate on compromise).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { generateQRCode } from '@/lib/utils';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;

    const existing = await prisma.qRCode.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, description: true, dealerId: true, revokedAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (session.user.role !== 'ADMIN' && existing.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu QR kodu yenileme yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (existing.revokedAt) {
      return NextResponse.json({ error: 'Bu QR kod zaten iptal edilmiş' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Generate new unique code
    let newCode = generateQRCode();
    let exists = await prisma.qRCode.findUnique({ where: { code: newCode } });
    while (exists) {
      newCode = generateQRCode();
      exists = await prisma.qRCode.findUnique({ where: { code: newCode } });
    }

    // Create new QR, revoke old (transaction — revoke scoped so rollback if race)
    const newQr = await prisma.$transaction(async (tx) => {
      const created = await tx.qRCode.create({
        data: {
          code: newCode,
          name: existing.name,
          description: existing.description,
          dealerId: existing.dealerId,
        },
      });
      const revokeWhere =
        session.user.role === 'ADMIN'
          ? { id, revokedAt: null as null }
          : { id, dealerId: session.user.id, revokedAt: null as null };
      const rev = await tx.qRCode.updateMany({
        where: revokeWhere,
        data: { revokedAt: new Date() },
      });
      if (rev.count !== 1) {
        throw new Error('REVOKE_FAILED');
      }
      return created;
    });

    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'qr_code_rotated',
        category: 'qr',
        data: { oldQrCodeId: id, newQrCodeId: newQr.id, oldCode: existing.code, newCode: newQr.code },
      },
    });

    return NextResponse.json({ success: true, qrCode: newQr }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === 'REVOKE_FAILED') {
      return NextResponse.json({ error: 'QR kod yenilenemedi (eşzamanlı değişiklik)' }, { status: 409 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    console.error('Error rotating QR code:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'QR kod yenilenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
