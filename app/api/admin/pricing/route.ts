import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { archivedListFilter, readArchiveIntent } from '@/lib/data-safety/archive';
import { ApiError } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { archivePlan } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/pricing — arşivlenmiş ("silinmiş") planlar varsayılan listede yok;
 * `?archived=only` arşivi, `?archived=include` hepsini döndürür. Her plan için abone sayısı
 * (`_count.dealers`) eklenir (silme/pasifleştirme etkisini UI gösterebilsin).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const plans = await prisma.pricingPlan.findMany({
      where: archivedListFilter(request),
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { dealers: true } } },
      take: 200,
    });
    return NextResponse.json({ success: true, plans }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Pricing list error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Planlar yüklenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * Eski yazma uçları emekli (Dalga 2): plan yazımı defineRoute BFF'lerinde —
 * POST /api/admin/pricing/plans · PATCH /api/admin/pricing/plans/:id ·
 * POST /api/admin/pricing/plans/:id/archive|restore · PUT /api/admin/pricing/reorder.
 * POST/PUT 410 döner. DELETE geriye uyumlu kalır ama ARŞİVDİR (silme yok, C1) ve aynı
 * sunucu mantığına (`archivePlan`) gider: aboneli plan `?confirm=archive` olmadan 409.
 * GET yukarıda kalır (/admin/users plan seçici okur).
 */
function gone() {
  return NextResponse.json(
    { success: false, ok: false, code: 'GONE', error: 'Bu uç kaldırıldı. Planlar /admin/pricing konsolundan yönetilir.' },
    { status: 410, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export const POST = gone;
export const PUT = gone;

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  try {
    const intent = readArchiveIntent(request);
    const result = await archivePlan(actionCtx(auth.session, request), id, { confirm: intent.confirmed, dryRun: intent.dryRun });
    return NextResponse.json({ success: true, ...result }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, ok: false, code: error.code, error: error.message, details: error.details },
        { status: error.status, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    console.error('Pricing archive error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ success: false, error: 'Plan arşivlenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
