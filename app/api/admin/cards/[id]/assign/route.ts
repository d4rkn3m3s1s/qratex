import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const assignSchema = z.object({
  customerId: z.string().min(1, 'Müşteri ID gerekli'),
});

/**
 * POST /api/admin/cards/[id]/assign
 * Kartı bir müşteriye ata (Admin)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;

    const body = await request.json();
    const validatedData = assignSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { customerId } = validatedData.data;

    // Kartı kontrol et
    const card = await prisma.physicalCard.findUnique({
      where: { id },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' },
        { status: 404 }
      );
    }

    if (card.status !== 'UNUSED') {
      return NextResponse.json(
        { error: 'Sadece aktive edilmemiş kartlar atanabilir' },
        { status: 400 }
      );
    }

    if (card.customerId) {
      return NextResponse.json(
        { error: 'Bu kart zaten bir müşteriye atanmış' },
        { status: 400 }
      );
    }

    // Müşteriyi kontrol et
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Müşteri bulunamadı' },
        { status: 404 }
      );
    }

    if (customer.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Sadece müşteri rolündeki kullanıcılara kart atanabilir' },
        { status: 400 }
      );
    }

    // Müşterinin zaten aktif kartı var mı kontrol et
    const existingCard = await prisma.physicalCard.findFirst({
      where: {
        customerId,
        status: 'ACTIVATED',
      },
    });

    if (existingCard) {
      return NextResponse.json(
        { error: 'Bu müşterinin zaten aktif bir kartı var' },
        { status: 400 }
      );
    }

    // Kartı müşteriye ata
    const updatedCard = await prisma.physicalCard.update({
      where: { id },
      data: {
        customerId,
        status: 'ACTIVATED',
        activatedAt: new Date(),
      },
    });

    // Audit log
    await prisma.cardAuditLog.create({
      data: {
        cardId: id,
        userId: session.user.id,
        action: 'ADMIN_ASSIGNED',
        metadata: {
          customerId,
          customerName: customer.name,
          customerEmail: customer.email,
          assignedBy: session.user.name,
        },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    // Müşteriye bildirim gönder
    await prisma.notification.create({
      data: {
        userId: customerId,
        title: 'QRateX Kartınız Aktive Edildi!',
        message: `Admin tarafından size bir QRateX kartı atandı. Artık tüketim kaydı oluşturabilirsiniz.`,
        type: 'SYSTEM',
        data: { actionUrl: '/customer/my-card' },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Kart müşteriye atandı',
      card: updatedCard,
    });
  } catch (error) {
    console.error('Error assigning card:', error);
    return NextResponse.json(
      { error: 'Kart atanamadı' },
      { status: 500 }
    );
  }
}
