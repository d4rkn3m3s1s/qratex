import type { NextRequest } from 'next/server';
import { assertModuleEnabled } from '@/lib/module-gate';
import { ApiError } from '@/lib/http/define-route';

/**
 * Davet modülü kapısı — müşteri rolüne özel görünürlük dahil (`defineRoute` `module` seçeneği
 * rol vermediği için yalnız global kapıya bakardı; denetim #3).
 */
export async function assertInviteModule(userId: string, request: NextRequest, routeKey: string): Promise<void> {
  const blocked = await assertModuleEnabled('referrals', { role: 'customer', userId, request, routeKey });
  if (blocked) throw new ApiError('MODULE_DISABLED', 'Davet programı şu anda kapalı.');
}
