import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/categories
 * Kategorileri listele (global + bayiye özel)
 */
export async function GET() {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const categories = await prisma.productCategory.findMany({
      where: {
        OR: [
          { dealerId: null }, // Global kategoriler
          { dealerId: session.user.id }, // Bayiye özel
        ],
        isActive: true,
      },
      take: 500,
      orderBy: { order: 'asc' },
      include: {
        // Yalnız bu bayinin + sistemin AKTİF ürünleri (eskiden tüm bayilerin ürünleri
        // sayılıyordu: platform hacmi sızıyordu ve Kart Tara'da yanlış sayı görünüyordu).
        _count: {
          select: {
            products: {
              where: { isActive: true, OR: [{ dealerId: session.user.id }, { dealerId: null }] },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      categories,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching categories:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Kategoriler getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// Yazma: POST /api/dealer/catalog/categories (defineRoute; aynı ad 409, simge doğrulamalı).
