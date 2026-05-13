import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/consumptions/[id]
 * Tek tüketim detayı
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    
    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const consumption = await prisma.consumption.findUnique({
      where: { id },
      include: {
        dealer: {
          select: {
            id: true,
            name: true,
            businessName: true,
            businessLogo: true,
            businessDesc: true,
            image: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            image: true,
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            },
          },
        },
        card: {
          select: {
            id: true,
            token: true,
          },
        },
        review: {
          select: {
            id: true,
            rating: true,
            text: true,
            dimensions: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!consumption) {
      return NextResponse.json(
        { error: 'Tüketim kaydı bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Sadece kendi tüketimini görebilir
    if (consumption.customerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu tüketime erişim yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        consumption,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching consumption:', error);
    return NextResponse.json(
      { error: 'Tüketim bilgisi alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
