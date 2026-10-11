import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { verifyCronBearer } from '@/lib/cron-auth';

/**
 * Allow trusted cron jobs (Bearer CRON_SECRET) or authenticated ADMIN.
 * Use for internal-only POST endpoints that must not be anonymously callable.
 *
 * guvenlik-admin-api B13: sır karşılaştırması cron uçlarıyla AYNI yardımcıdan geçer
 * (`verifyCronBearer`: sabit zamanlı, trim'li, sır yoksa her zaman yanlış). Eskiden
 * sabit-zamansız `===` kullanılıyordu.
 */
export async function requireCronSecretOrAdmin(
  request: NextRequest
): Promise<NextResponse | null> {
  if (verifyCronBearer(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return null;
  }
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  return null;
}
