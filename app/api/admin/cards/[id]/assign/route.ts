import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';
import { checkAssign } from '@/lib/cards/lifecycle';


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
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { customerId } = validatedData.data;

    // Kartı kontrol et
    const card = await prisma.physicalCard.findUnique({
      where: { id },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Durum makinesi: yalnız UNUSED + bağsız + arşivlenmemiş kart atanabilir (P0-26).
    const assignable = checkAssign(card);
    if (!assignable.ok) {
      return NextResponse.json(
        { error: assignable.message, code: assignable.code }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Müşteriyi kontrol et
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Müşteri bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (customer.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Sadece müşteri rolündeki kullanıcılara kart atanabilir' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
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
        { error: 'Bu müşterinin zaten aktif bir kartı var' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Kartı müşteriye ata — koşullu yazım (arada aktive/bloklandı/arşivlendiyse 409) ve
    // denetim izi + bildirim aynı transaction'da.
    const updatedCard = await prisma.$transaction(async (tx) => {
      const w = await tx.physicalCard.updateMany({
        where: { id, status: 'UNUSED', customerId: null, archivedAt: null },
        data: {
          customerId,
          status: 'ACTIVATED',
          activatedAt: new Date(),
        },
      });
      if (w.count === 0) return null;

      await tx.cardAuditLog.create({
        data: {
          cardId: id,
          userId: session.user.id,
          action: 'ADMIN_ASSIGNED',
          metadata: {
            customerId,
            assignedBy: session.user.id,
          },
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      });

      await tx.notification.create({
        data: {
          userId: customerId,
          title: 'QRateX Kartınız Aktive Edildi!',
          message: `Yönetici tarafından size bir QRateX kartı atandı. Artık tüketim kaydı oluşturabilirsiniz.`,
          type: 'SYSTEM',
          data: { actionUrl: '/customer/my-card' },
        },
      });

      return tx.physicalCard.findUnique({ where: { id } });
    });

    if (!updatedCard) {
      return NextResponse.json(
        { error: 'Kart bu sırada başka bir işlemle değişti. Sayfayı yenileyip tekrar deneyin.', code: 'CONFLICT' },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Kart müşteriye atandı',
      card: updatedCard,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error assigning card:', error);
    return NextResponse.json(
      { error: 'Kart atanamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
