import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { upsertDemoCosmetics } from '@/lib/cosmetic-seed-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const rl = checkAdminRateLimit(auth.session.user.id);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Çok fazla istek' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }
  try {
    const n = await upsertDemoCosmetics(prisma);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'seed_demo_cosmetics',
        entity: 'CosmeticItem',
        entityId: 'batch',
        newData: { count: n } as object,
        ...getAuditRequestMeta(request),
      },
    });
    return NextResponse.json({ success: true, count: n }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ success: false, error: 'Demo yüklenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
