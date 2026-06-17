import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * Kupon yönetimi (admin). Coupon modeli artık gerçek bir akışa bağlı:
 * admin burada indirim kuponu oluşturur, müşteri /api/customer/redeem-coupon
 * ile kodu kullanır (atomik usedCount + tek-kullanım kontrolü).
 */
const createSchema = z.object({
  code: z.string().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Kod yalnızca harf/rakam/-/_ içerebilir'),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().positive(),
  minPurchase: z.number().min(0).nullable().optional(),
  maxUses: z.number().int().min(-1).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const sp = new URL(request.url).searchParams;
    const isActiveParam = sp.get('isActive');
    const where =
      isActiveParam === 'true' ? { isActive: true } : isActiveParam === 'false' ? { isActive: false } : {};
    const coupons = await prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return NextResponse.json(coupons, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Coupon GET error:', e);
    return NextResponse.json({ error: 'Kuponlar alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Geçersiz istek' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const d = parsed.data;
    if (d.type === 'percentage' && d.value > 100) {
      return NextResponse.json(
        { error: 'Yüzde indirim 100 değerinden büyük olamaz' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const code = d.code.toUpperCase();
    const exists = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (exists) {
      return NextResponse.json({ error: 'Bu kod zaten var' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const coupon = await prisma.coupon.create({
      data: {
        code,
        type: d.type,
        value: d.value,
        minPurchase: d.minPurchase ?? null,
        maxUses: d.maxUses ?? -1,
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        isActive: d.isActive ?? true,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'CREATE_COUPON',
        entity: 'Coupon',
        entityId: coupon.id,
        newData: { code: coupon.code, type: coupon.type, value: coupon.value } as object,
        ...getAuditRequestMeta(request),
      },
    });
    return NextResponse.json(coupon, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Coupon POST error:', e);
    return NextResponse.json({ error: 'Kupon oluşturulamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  try {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Kupon bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    // Silmek yerine pasifleştir (kullanım geçmişi korunsun).
    await prisma.coupon.update({ where: { id }, data: { isActive: false } });
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'DEACTIVATE_COUPON',
        entity: 'Coupon',
        entityId: id,
        oldData: { code: existing.code } as object,
        ...getAuditRequestMeta(request),
      },
    });
    return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Coupon DELETE error:', e);
    return NextResponse.json({ error: 'Kupon pasifleştirilemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
