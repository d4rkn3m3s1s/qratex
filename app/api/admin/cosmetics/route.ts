import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(['avatar_frame', 'profile_badge', 'profile_background']),
  price: z.number().int().min(0).max(10_000_000),
  imageUrl: z.string().max(2000).optional().nullable().or(z.literal('')),
  rarity: z.string().max(40).optional().default('common'),
  isActive: z.boolean().optional().default(true),
});

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const items = await prisma.cosmeticItem.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return NextResponse.json({ success: true, items }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Liste alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const rl = checkAdminRateLimit(auth.session.user.id);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Çok fazla istek' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz veri';
      return NextResponse.json({ success: false, error: msg }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const { slug, imageUrl, description, ...rest } = parsed.data;
    const item = await prisma.cosmeticItem.create({
      data: {
        ...rest,
        slug: slug?.trim() || null,
        description: description?.trim() || null,
        imageUrl: imageUrl && imageUrl !== '' ? imageUrl.trim() : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'create_cosmetic_item',
        entity: 'CosmeticItem',
        entityId: item.id,
        newData: { id: item.id, name: item.name, slug: item.slug } as object,
        ...getAuditRequestMeta(request),
      },
    });
    return NextResponse.json({ success: true, item }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Oluşturulamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
