import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/products
 * Ürünleri listele (bayiye özel + global)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const categoryIdRaw = searchParams.get('categoryId');
    const categoryId =
      categoryIdRaw && categoryIdRaw.length <= 64 ? categoryIdRaw.trim() : null;
    if (categoryIdRaw && categoryIdRaw.length > 64) {
      return NextResponse.json(
        { error: 'Geçersiz kategori' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const where: Prisma.ProductWhereInput = {
      OR: [
        { dealerId: null }, // Global ürünler
        { dealerId: session.user.id }, // Bayiye özel
      ],
      isActive: true,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      products,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching products:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Ürünler getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// Yazma: /api/dealer/catalog/products (defineRoute; kuruş fiyat, görsel alanı, aynı ad 409).
