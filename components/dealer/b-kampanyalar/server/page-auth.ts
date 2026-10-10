/**
 * Sunucu sayfası kapısı — yetki DB'den (`requireAuth`), kiracı kapsamı `resolveDealerScope`
 * (ADMIN yalnız `?dealerId=` ile ve salt-okunur), bayi rolü için modül + menü kapısı.
 */
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope } from '@/lib/auth/scope';
import { campaignsAvailable } from './common';

export type CampaignsPageAuth =
  | {
      kind: 'ok';
      dealerId: string;
      actorId: string;
      /** ADMIN görünümü: yazma yok, istemci istekleri `?dealerId=` taşır. */
      readOnly: boolean;
      dealerParam: string | null;
    }
  | { kind: 'forbidden' }
  | { kind: 'disabled' }
  | { kind: 'unavailable' };

export async function requireCampaignsPage(callbackPath: string, dealerIdParam: string | null): Promise<CampaignsPageAuth> {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) {
    const status = auth.error.status;
    if (status === 401) redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
    if (status === 403) return { kind: 'forbidden' };
    return { kind: 'unavailable' };
  }
  try {
    const scope = await resolveDealerScope(auth.session, { dealerId: dealerIdParam, allowRoles: ['DEALER', 'ADMIN'] });
    if (!scope.ok) return { kind: 'forbidden' };
    if (!(await campaignsAvailable(scope.actorId))) return { kind: 'disabled' };
    const admin = scope.via === 'admin';
    return { kind: 'ok', dealerId: scope.dealerId, actorId: scope.actorId, readOnly: admin, dealerParam: admin ? scope.dealerId : null };
  } catch (err) {
    console.error('[campaigns] sayfa kapısı çözülemedi', err);
    return { kind: 'unavailable' };
  }
}

export function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}
