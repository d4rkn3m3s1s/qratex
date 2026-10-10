/**
 * Anket sunucu sayfalarının ortak kapısı: oturum + rol DB'den (`requireAuth(['DEALER'])`),
 * modül kapısı (`dealer_surveys`) sayfa düzeyinde. API uçları kapıyı ayrıca uygular; sayfa
 * kapısı yalnız "boş/sıfır sayfa" yerine açıklayıcı durum göstermek içindir.
 */
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { assertModuleEnabled } from '@/lib/module-gate';

export type SurveyPageGate =
  | { ok: true; dealerId: string }
  | { ok: false; kind: 'moduleDisabled' | 'forbidden' | 'generic' };

export async function gateSurveyPage(callbackPath: string): Promise<SurveyPageGate> {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) {
    const status = auth.error.status;
    if (status === 401) redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
    return { ok: false, kind: status === 403 ? 'forbidden' : 'generic' };
  }
  const dealerId = auth.session.user.id;
  try {
    const blocked = await assertModuleEnabled('dealer_surveys', { role: 'dealer', userId: dealerId, routeKey: `page:${callbackPath}` });
    if (blocked) return { ok: false, kind: 'moduleDisabled' };
  } catch {
    // Kapı okunamadı: API uçları kapıyı yine uygular; istemci adası hatayı görünür gösterir.
  }
  return { ok: true, dealerId };
}
