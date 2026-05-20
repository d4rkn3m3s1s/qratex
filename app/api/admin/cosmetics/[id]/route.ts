import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(['avatar_frame', 'profile_badge', 'profile_background']).optional(),
  price: z.number().int().min(0).max(10_000_000).optional(),
  imageUrl: z.string().max(2000).optional().nullable().or(z.literal('')),
  rarity: z.string().max(40).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const rl = checkAdminRateLimit(auth.session.user.id);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Çok fazla istek' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  try {
    const existing = await prisma.cosmeticItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const raw = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz veri';
      return NextResponse.json({ success: false, error: msg }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const patch = parsed.data;
    const data: Prisma.CosmeticItemUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.price !== undefined) data.price = patch.price;
    if (patch.rarity !== undefined) data.rarity = patch.rarity;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.description !== undefined) data.description = patch.description?.trim() || null;
    if (patch.slug !== undefined) data.slug = patch.slug?.trim() || null;
    if (patch.imageUrl !== undefined) {
      data.imageUrl = patch.imageUrl && patch.imageUrl !== '' ? patch.imageUrl.trim() : null;
    }
    const item = await prisma.cosmeticItem.update({
      where: { id },
      data,
    });
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'update_cosmetic_item',
        entity: 'CosmeticItem',
        entityId: id,
        oldData: {
          name: existing.name,
          price: existing.price,
          isActive: existing.isActive,
        } as object,
        newData: {
          name: item.name,
          price: item.price,
          isActive: item.isActive,
        } as object,
        ...getAuditRequestMeta(request),
      },
    });
    return NextResponse.json({ success: true, item }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Güncellenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
