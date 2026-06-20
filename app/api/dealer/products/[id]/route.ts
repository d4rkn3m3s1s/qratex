import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { updateProductSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/**
 * Ürün sahipliği: yalnızca ürünün sahibi bayi (veya ADMIN) düzenleyebilir/silebilir.
 * Global ürünler (dealerId = null) bayi tarafından değiştirilemez.
 */
async function loadOwnedProduct(
  productId: string,
  session: { user: { id: string; role?: string } }
): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, dealerId: true },
  });
  if (!product) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Ürün bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      ),
    };
  }
  const isAdmin = session.user.role === 'ADMIN';
  const isOwner = product.dealerId === session.user.id;
  if (!isAdmin && !isOwner) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Bu ürünü düzenleme yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      ),
    };
  }
  return { ok: true };
}

/**
 * PATCH /api/dealer/products/[id]
 * Ürünü güncelle (ad, açıklama, fiyat, kategori, görsel, aktiflik).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;

    const owned = await loadOwnedProduct(id, session);
    if (!owned.ok) return owned.res;

    const body = await request.json();
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Kategori değiştiriliyorsa erişim kontrolü (global veya bayiye ait olmalı).
    if (parsed.data.categoryId) {
      const category = await prisma.productCategory.findUnique({
        where: { id: parsed.data.categoryId },
        select: { id: true, dealerId: true },
      });
      if (!category) {
        return NextResponse.json(
          { error: 'Kategori bulunamadı' },
          { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      if (
        category.dealerId &&
        category.dealerId !== session.user.id &&
        session.user.role !== 'ADMIN'
      ) {
        return NextResponse.json(
          { error: 'Bu kategoriye erişim yetkiniz yok' },
          { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: parsed.data,
      include: {
        category: { select: { id: true, name: true, icon: true } },
      },
    });

    return NextResponse.json(
      { success: true, product },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error updating product:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Ürün güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/**
 * DELETE /api/dealer/products/[id]
 * Ürünü pasifleştirir (soft delete: isActive=false). Tüketim kayıtları için
 * sert silme yapılmaz; listelerde GET zaten isActive:true filtreler.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;

    const owned = await loadOwnedProduct(id, session);
    if (!owned.ok) return owned.res;

    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(
      { success: true },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error deleting product:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Ürün silinemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
