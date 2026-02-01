import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createProductSchema } from '@/lib/validations';

/**
 * GET /api/dealer/products
 * Ürünleri listele (bayiye özel + global)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'DEALER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

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
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Ürünler getirilemedi' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dealer/products
 * Yeni ürün ekle (bayiye özel)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'DEALER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createProductSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, description, price, categoryId, image } = validatedData.data;

    // Kategori kontrolü
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Kategori bulunamadı' },
        { status: 404 }
      );
    }

    // Kategori global veya bayiye ait mi?
    if (category.dealerId && category.dealerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu kategoriye erişim yetkiniz yok' },
        { status: 403 }
      );
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
    });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: 'Ürün oluşturulamadı' },
      { status: 500 }
    );
  }
}
