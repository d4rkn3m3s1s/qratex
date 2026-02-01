import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateCardStatusSchema } from '@/lib/validations';

/**
 * GET /api/admin/cards/[id]
 * Tek kart detayı
 */
export async function GET(
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

    const card = await prisma.physicalCard.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        consumptions: {
          include: {
            dealer: {
              select: {
                id: true,
                name: true,
                businessName: true,
              },
            },
            product: true,
            review: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      card,
    });
  } catch (error) {
    console.error('Error fetching card:', error);
    return NextResponse.json(
      { error: 'Kart bilgisi alınamadı' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/cards/[id]
 * Kart durumunu güncelle (block/unblock)
 */
export async function PATCH(
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

    const body = await request.json();
    const validatedData = updateCardStatusSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { status, blockReason } = validatedData.data;

    const existingCard = await prisma.physicalCard.findUnique({
      where: { id },
    });

    if (!existingCard) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' },
        { status: 404 }
      );
    }

    // Güncelleme verisi
    const updateData: any = { status };

    if (status === 'BLOCKED') {
      updateData.blockedAt = new Date();
      updateData.blockReason = blockReason || 'Admin tarafından bloklandı';
    } else if (status === 'UNUSED' || status === 'ACTIVATED') {
      // Block kaldırılıyorsa
      if (existingCard.status === 'BLOCKED') {
        updateData.blockedAt = null;
        updateData.blockReason = null;
      }
    }

    const card = await prisma.physicalCard.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await prisma.cardAuditLog.create({
      data: {
        cardId: card.id,
        userId: session.user.id,
        action: status === 'BLOCKED' ? 'BLOCKED' : 'UNBLOCKED',
        metadata: {
          previousStatus: existingCard.status,
          newStatus: status,
          reason: blockReason,
        },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: status === 'BLOCKED' ? 'Kart bloklandı' : 'Kart durumu güncellendi',
      card,
    });
  } catch (error) {
    console.error('Error updating card:', error);
    return NextResponse.json(
      { error: 'Kart güncellenemedi' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/cards/[id]
 * Kartı sil (Admin tüm kartları silebilir)
 */
export async function DELETE(
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

    const card = await prisma.physicalCard.findUnique({
      where: { id },
      include: {
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

    // Önce ilişkili kayıtları sil
    await prisma.$transaction(async (tx) => {
      // Consumption review'ları sil
      await tx.consumptionReview.deleteMany({
        where: {
          consumption: {
            cardId: id,
          },
        },
      });
      
      // Consumption'ları sil
      await tx.consumption.deleteMany({
        where: { cardId: id },
      });
      
      // Audit log'ları sil
      await tx.cardAuditLog.deleteMany({
        where: { cardId: id },
      });
      
      // Kartı sil
      await tx.physicalCard.delete({
        where: { id },
      });
    });

    // Genel audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CARD_DELETED',
        entity: 'PhysicalCard',
        entityId: id,
        oldData: {
          token: card.token,
          batchId: card.batchId,
          status: card.status,
          customerId: card.customerId,
          consumptionCount: card._count.consumptions,
        },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Kart ve ilişkili kayıtlar silindi',
    });
  } catch (error) {
    console.error('Error deleting card:', error);
    return NextResponse.json(
      { error: 'Kart silinemedi' },
      { status: 500 }
    );
  }
}
