import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

/**
 * Allow trusted cron jobs (Bearer CRON_SECRET) or authenticated ADMIN.
 * Use for internal-only POST endpoints that must not be anonymously callable.
 */
export async function requireCronSecretOrAdmin(
  request: NextRequest
): Promise<NextResponse | null> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return null;
  }
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  return null;
}
