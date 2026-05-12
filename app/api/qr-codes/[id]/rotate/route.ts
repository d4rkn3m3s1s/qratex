
export const dynamic = 'force-dynamic';

/**
 * POST /api/qr-codes/[id]/rotate
 * P2-32 QR lifecycle: Generate new code, revoke old (rotate on compromise).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
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
      return NextResponse.json({ error: 'QR kod bulunamadı' }, { status: 404 });
    }
    if (session.user.role !== 'ADMIN' && existing.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu QR kodu yenileme yetkiniz yok' }, { status: 403 });
    }
    if (existing.revokedAt) {
      return NextResponse.json({ error: 'Bu QR kod zaten iptal edilmiş' }, { status: 400 });
    }

    // Generate new unique code
    let newCode = generateQRCode();
    let exists = await prisma.qRCode.findUnique({ where: { code: newCode } });
    while (exists) {
      newCode = generateQRCode();
      exists = await prisma.qRCode.findUnique({ where: { code: newCode } });
    }

    // Create new QR, revoke old (in transaction)
    const [newQr] = await prisma.$transaction([
      prisma.qRCode.create({
        data: {
          code: newCode,
          name: existing.name,
          description: existing.description,
          dealerId: existing.dealerId,
        },
      }),
      prisma.qRCode.update({
        where: { id },
        data: { revokedAt: new Date() },
      }),
    ]);

    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'qr_code_rotated',
        category: 'qr',
        data: { oldQrCodeId: id, newQrCodeId: newQr.id, oldCode: existing.code, newCode: newQr.code },
      },
    });

    return NextResponse.json({ success: true, qrCode: newQr });
  } catch (error) {
    console.error('Error rotating QR code:', error);
    return NextResponse.json({ error: 'QR kod yenilenemedi' }, { status: 500 });
  }
}
