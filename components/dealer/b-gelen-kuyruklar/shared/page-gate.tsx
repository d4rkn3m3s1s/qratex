import type { ReactNode } from 'react';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope, type DealerScope } from '@/lib/auth/scope';
import { isModuleOn } from '@/lib/dealer-queues/route-helpers';
import { ErrorState } from '@/components/states';

type SearchParams = Record<string, string | string[] | undefined>;

export const firstParam = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export type QueueGate =
  | { ok: true; scope: DealerScope; readOnly: boolean; actorName: string | null }
  | { ok: false; node: ReactNode };

/**
 * Kuyruk sayfalarının sunucu kapısı: yetki DB'den (`requireAuth`), kiracı kapsamı
 * (`resolveDealerScope`; ADMIN yalnız `?dealerId=` ile ve salt okunur), modül kapısı.
 * Reddedilen durumda görünür durum ekranı döner (boş sayfa ya da sessiz yönlendirme yok).
 */
export async function gateQueuePage(moduleKey: string, sp: SearchParams): Promise<QueueGate> {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) {
    return { ok: false, node: <ErrorState kind="forbidden" variant="section" headingLevel="h2" /> };
  }
  const scope = await resolveDealerScope(auth.session, { dealerId: firstParam(sp.dealerId) ?? null, allowRoles: ['DEALER', 'ADMIN'] });
  if (!scope.ok) {
    return { ok: false, node: <ErrorState kind="forbidden" variant="section" headingLevel="h2" description={scope.message} /> };
  }
  if (!(await isModuleOn(moduleKey))) {
    return { ok: false, node: <ErrorState kind="moduleDisabled" variant="section" headingLevel="h2" /> };
  }
  const name = typeof auth.session.user?.name === 'string' ? auth.session.user.name : null;
  return { ok: true, scope, readOnly: scope.via === 'admin', actorName: name };
}

/** Sunucu ön yüklemesi: bir kaynak düşerse sayfa yine açılır, istemci görünür hata + "Tekrar dene" gösterir. */
export async function settle<T>(label: string, p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error(`[dealer-queues] ${label} sunucu ön yüklemesi başarısız:`, err);
    return null;
  }
}
