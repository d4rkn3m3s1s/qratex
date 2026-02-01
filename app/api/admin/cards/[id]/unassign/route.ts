import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/admin/cards/[id]/unassign
 * Kartı müşteriden kaldır (Admin)
 * Not: Tüketim geçmişi korunur
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403 }
      );
    }

    // Kartı kontrol et
    const card = await prisma.physicalCard.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: { consumptions: true },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' },
        { status: 404 }
      );
    }

    if (!card.customerId || !card.customer) {
      return NextResponse.json(
        { error: 'Bu kart zaten bir müşteriye atanmamış' },
        { status: 400 }
      );
    }

    const previousCustomer = card.customer;

    // Kartı müşteriden kaldır - UNUSED durumuna getir
    const updatedCard = await prisma.physicalCard.update({
      where: { id },
      data: {
        customerId: null,
        status: 'UNUSED',
        activatedAt: null,
      },
    });

    // Audit log
    await prisma.cardAuditLog.create({
      data: {
        cardId: id,
        userId: session.user.id,
        action: 'ADMIN_UNASSIGNED',
        metadata: {
          previousCustomerId: previousCustomer.id,
          previousCustomerName: previousCustomer.name,
          previousCustomerEmail: previousCustomer.email,
          consumptionCount: card._count.consumptions,
          unassignedBy: session.user.name,
        },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    // Müşteriye bildirim gönder
    await prisma.notification.create({
      data: {
        userId: previousCustomer.id,
        title: 'Kartınız Kaldırıldı',
        message: `QRateX kartınız admin tarafından hesabınızdan kaldırıldı. Sorularınız için destek ile iletişime geçebilirsiniz.`,
        type: 'WARNING',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Kart müşteriden kaldırıldı',
      card: updatedCard,
      previousCustomer: {
        id: previousCustomer.id,
        name: previousCustomer.name,
      },
    });
  } catch (error) {
    console.error('Error unassigning card:', error);
    return NextResponse.json(
      { error: 'Kart kaldırılamadı' },
      { status: 500 }
    );
  }
}
