import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/**
 * Müşteriye dönük yorum alanları — İZİN LİSTESİ (P0-09).
 * Eski yanıt `include` ile bayinin İÇ notunu (`consumption.note`), gizli karakter kategorisini
 * (`characterCategory`), AI `churnRisk` / `sentiment` sinyallerini ve kart kimliğini müşteriye
 * gönderiyordu. Yeni alan eklemeden önce gizlilik etkisini düşünün.
 */
const CUSTOMER_REVIEW_SELECT = {
  id: true,
  consumptionId: true,
  rating: true,
  text: true,
  dimensions: true,
  dealerReply: true,
  dealerRepliedAt: true,
  createdAt: true,
  updatedAt: true,
  consumption: {
    select: {
      id: true,
      amount: true,
      createdAt: true,
      dealer: {
        select: {
          id: true,
          name: true,
          businessName: true,
          businessLogo: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          category: { select: { name: true, icon: true } },
        },
      },
    },
  },
} as const;

/**
 * GET /api/customer/reviews
 * Müşterinin tüm tüketim yorumlarını listele (moderasyonla kaldırılanlar hariç).
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const customerId = session.user.id;
    const LIST_CAP = 200;
    const where = { customerId, deletedAt: null };

    const [reviews, totalCount] = await Promise.all([
      prisma.consumptionReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: LIST_CAP,
        select: CUSTOMER_REVIEW_SELECT,
      }),
      prisma.consumptionReview.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        reviews,
        count: totalCount,
        truncated: totalCount > LIST_CAP,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching customer reviews:', error);
    return NextResponse.json(
      { error: 'Yorumlar getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
