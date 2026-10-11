import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope } from '@/lib/auth/scope';
import { assertModuleEnabled } from '@/lib/module-gate';
import { getTeamHub } from '@/lib/staff-ops/server';
import { isYmd } from '@/lib/staff-ops/core';
import type { TeamHub } from '@/lib/staff-ops/types';
import { ErrorState } from '@/components/states';
import { TeamHubScreen } from '@/components/dealer/b-ekip/team-hub';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Bayi → Ekip (denetim raporu docs/audit/2026-10-08/bayi/dealer_team.md).
 *
 * Sunucu önce: bugün özeti, ekip, davetler, görevler, seçili haftanın vardiya/puantajı, izin
 * kuyruğu, eğitim matrisi, kontrol listesi uyumu ve saha bildirimleri tek seferde yüklenir.
 * Yükleme düşerse istemci adası görünür hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 * Modül kapalıysa (staff_management) sayfa da kapalıdır.
 */
export default async function DealerTeamPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" variant="page" />
      </div>
    );
  }
  const scope = await resolveDealerScope(auth.session);
  if (!scope.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" variant="page" description={scope.message} />
      </div>
    );
  }
  const blocked = await assertModuleEnabled('staff_management', { role: 'dealer', userId: auth.session.user.id, routeKey: '/dealer/team' }).catch(
    () => null
  );
  if (blocked) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="moduleDisabled" variant="page" />
      </div>
    );
  }

  const rawWeek = Array.isArray(sp.week) ? sp.week[0] : sp.week;
  const week = rawWeek && isYmd(rawWeek) ? rawWeek : null;
  const initial = await getTeamHub(scope.dealerId, { week }).catch((err): TeamHub | null => {
    console.error('[dealer/team] sunucu ön yüklemesi başarısız:', err);
    return null;
  });

  return <TeamHubScreen initial={initial} />;
}
