import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { createProductCategorySchema } from '@/lib/validations';


export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/categories
 * Kategorileri listele (global + bayiye özel)
 */
export async function GET(request: NextRequest) {
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
      orderBy: { order: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Kategoriler getirilemedi' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dealer/categories
 * Yeni kategori ekle (bayiye özel)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validatedData = createProductCategorySchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, icon, order } = validatedData.data;

    const category = await prisma.productCategory.create({
      data: {
        name,
        icon,
        order,
        dealerId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Kategori oluşturulamadı' },
      { status: 500 }
    );
  }
}
