import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import {
  deleteAnalyticsEventsOlderThan,
  countAnalyticsEventsOlderThan,
  DEFAULT_RETENTION_DAYS,
} from '@/lib/analytics-event-retention';

export const dynamic = 'force-dynamic';

/**
 * GET - Kaç kayıt silinebilir (retention dışı) bilgisini döner.
 * POST - Eski AnalyticsEvent kayıtlarını siler (admin only).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('olderThanDays') || String(DEFAULT_RETENTION_DAYS), 10) || DEFAULT_RETENTION_DAYS));

  try {
    const count = await countAnalyticsEventsOlderThan(days);
    return NextResponse.json({
      success: true,
      olderThanDays: days,
      deletableCount: count,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Analytics cleanup count error:', e);
    return NextResponse.json({ success: false, error: 'Sayılamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const days = typeof body.olderThanDays === 'number'
    ? Math.min(365, Math.max(1, body.olderThanDays))
    : DEFAULT_RETENTION_DAYS;

  try {
    const deleted = await deleteAnalyticsEventsOlderThan(days);
    return NextResponse.json({
      success: true,
      deletedCount: deleted,
      olderThanDays: days,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('Analytics cleanup delete error:', e);
    return NextResponse.json({ success: false, error: 'Temizlik yapılamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
