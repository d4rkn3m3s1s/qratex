/**
 * Sunucu sayfası kimlik kapısı — yetki kararı DB'den (`requireAuth`: oturum sürümü, askı,
 * güncel rol, token-replay). JWT'deki role güvenilmez (yol haritası ilke 2).
 */
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';

export type PageAuth = { kind: 'ok'; userId: string } | { kind: 'forbidden' } | { kind: 'unavailable' };

export async function requireCustomerPage(callbackPath: string): Promise<PageAuth> {
  const auth = await requireAuth(['CUSTOMER']);
  if (!('error' in auth)) return { kind: 'ok', userId: auth.session.user.id };
  const status = auth.error.status;
  if (status === 401) redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  if (status === 403) return { kind: 'forbidden' };
  return { kind: 'unavailable' };
}
