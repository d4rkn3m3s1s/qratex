import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { createProductSchema } from '@/lib/validations';


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

    const where: any = {
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

/**
 * POST /api/dealer/products
 * Yeni ürün ekle (bayiye özel)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validatedData = createProductSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { name, description, price, categoryId, image } = validatedData.data;

    // Kategori kontrolü
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Kategori bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Kategori global veya bayiye ait mi?
    if (category.dealerId && category.dealerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu kategoriye erişim yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        price,
        categoryId,
        image,
        dealerId: session.user.id,
      },
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
      product,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating product:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Ürün oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
