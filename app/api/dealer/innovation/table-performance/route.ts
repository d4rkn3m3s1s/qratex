import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { getDealerInnovationPrefs } from '@/lib/innovation-dealer-prefs';

export const dynamic = 'force-dynamic';

/**
 * Personel performansı (opt-in): isim yok, sadece masa kodu + geri bildirim özeti.
 */
export async function GET(request: NextRequest) {
  try {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.staffTableInsights) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const dealerIdParam = searchParams.get('dealerId');
  const targetDealerId =
    session.user.role === 'ADMIN' && dealerIdParam ? dealerIdParam : session.user.id;

  const forbidden = requireDealerResource(session, targetDealerId);
  if (forbidden) return forbidden;

  const prefs = await getDealerInnovationPrefs(targetDealerId);
  if (!prefs.staffTableInsights) {
    return NextResponse.json(
      { error: 'Bu bayi için masa/personel içgörüleri kapalı (gizlilik tercihi).' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const rows = await prisma.tablePulse.findMany({
    where: { dealerId: targetDealerId, createdAt: { gte: since }, tableCode: { not: null } },
    select: { tableCode: true, mood: true },
    take: 20_000,
  });

  const byTable = new Map<string, { ok: number; concern: number }>();
  for (const r of rows) {
    const code = r.tableCode || '?';
    const cur = byTable.get(code) || { ok: 0, concern: 0 };
    if (r.mood === 'CONCERN') cur.concern += 1;
    else cur.ok += 1;
    byTable.set(code, cur);
  }

  const tables = [...byTable.entries()]
    .map(([tableCode, counts]) => ({
      tableCode,
      ok: counts.ok,
      concern: counts.concern,
      total: counts.ok + counts.concern,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    since: since.toISOString(),
    tables,
    notice:
      'Bu görünüm isteğe bağlıdır; kişisel veri yerine masa etiketi kullanılır. Ekip eğitimi için trend takibi amaçlıdır.',
  }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('table-performance GET:', error);
    return NextResponse.json(
      { error: 'Masa performansı yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
