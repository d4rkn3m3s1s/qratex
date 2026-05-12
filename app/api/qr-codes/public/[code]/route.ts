import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkScanRateLimit, getClientIdentifier } from '@/lib/rate-limit';

// ─────────────────────────────────────────────────────────────
// GET /api/qr-codes/public/[code] - Get QR code by public code
// ─────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const clientId = getClientIdentifier(request);
    const scanLimit = checkScanRateLimit(clientId);
    if (!scanLimit.ok) {
      return NextResponse.json(
        { error: 'Çok fazla QR taraması. Lütfen biraz bekleyip tekrar deneyin.' },
        {
          status: 429,
          headers: scanLimit.retryAfterMs
            ? { 'Retry-After': String(Math.ceil(scanLimit.retryAfterMs / 1000)) }
            : undefined,
        }
      );
    }

    const { code } = await params;

    if (!code) {
      return NextResponse.json(
        { error: 'QR kod gerekli' },
        { status: 400 }
      );
    }

    const segment = request.nextUrl.searchParams.get('segment') ?? undefined;
    const utmSource = request.nextUrl.searchParams.get('utm_source') ?? undefined;
    const utmCampaign = request.nextUrl.searchParams.get('utm_campaign') ?? undefined;
    const utmMedium = request.nextUrl.searchParams.get('utm_medium') ?? undefined;

    const qrCode = await prisma.qRCode.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        expiresAt: true,
        revokedAt: true,
        segmentConfig: true,
        dealer: {
          select: {
            id: true,
            name: true,
            businessName: true,
            businessLogo: true,
            staffMembers: {
              where: { isActive: true },
              select: {
                id: true,
                user: { select: { name: true, image: true } }
              }
            }
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

    const now = new Date();
    if (!qrCode.isActive) {
      return NextResponse.json(
        { error: 'Bu QR kod aktif değil' },
        { status: 404 }
      );
    }
    if (qrCode.expiresAt && now > qrCode.expiresAt) {
      return NextResponse.json(
        { error: 'Bu QR kodun süresi dolmuş' },
        { status: 404 }
      );
    }
    if (qrCode.revokedAt) {
      return NextResponse.json(
        { error: 'Bu QR kod iptal edilmiş' },
        { status: 404 }
      );
    }

    const config = qrCode.segmentConfig as Record<string, { welcomeText?: string }> | null;
    const segmentExperience =
      segment && config && config[segment]
        ? config[segment]
        : null;

    // Log scan event (P2-33: scan attribution utm/source/campaign)
    await prisma.analyticsEvent.create({
      data: {
        event: 'qr_scanned',
        category: 'qr',
        data: {
          qrCodeId: qrCode.id,
          code: qrCode.code,
          segment: segment ?? null,
          ...(utmSource && { utmSource }),
          ...(utmCampaign && { utmCampaign }),
          ...(utmMedium && { utmMedium }),
        },
      },
    });

    const { segmentConfig: _sc, ...rest } = qrCode;
    return NextResponse.json({
      qrCode: {
        ...rest,
        segmentExperience,
      },
    });
  } catch (error) {
    console.error('Error fetching QR code:', error);
    return NextResponse.json(
      { error: 'QR kod getirilemedi' },
      { status: 500 }
    );
  }
}




