import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────
// GET /api/qr-codes/public/[code] - Get QR code by public code
// ─────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params;

    if (!code) {
      return NextResponse.json(
        { error: 'QR kod gerekli' },
        { status: 400 }
      );
    }

    const qrCode = await prisma.qRCode.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        dealer: {
          select: {
            id: true,
            name: true,
            businessName: true,
            businessLogo: true,
          },
        },
      },
    });

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR kod bulunamadı' },
        { status: 404 }
      );
    }

    if (!qrCode.isActive) {
      return NextResponse.json(
        { error: 'Bu QR kod aktif değil' },
        { status: 404 }
      );
    }

    // Log scan event
    await prisma.analyticsEvent.create({
      data: {
        event: 'qr_scanned',
        category: 'qr',
        data: { qrCodeId: qrCode.id, code: qrCode.code },
      },
    });

    return NextResponse.json({ qrCode });
  } catch (error) {
    console.error('Error fetching QR code:', error);
    return NextResponse.json(
      { error: 'QR kod getirilemedi' },
      { status: 500 }
    );
  }
}



