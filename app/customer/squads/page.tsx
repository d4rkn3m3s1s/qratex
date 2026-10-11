import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getModuleControls } from '@/lib/module-gate';
import { normalizeInviteCode, SQUADS_PATH } from '@/lib/squads/rules';
import { getSquadOverview } from '@/lib/squads/overview';
import type { SquadOverview } from '@/lib/squads/dto';
import { EmptyState } from '@/components/states';
import { SquadRoom } from '@/components/customer/m-klan/squad-room';
import { getServerLocale } from '@/lib/server-locale';

/**
 * Oyna → Klan (`/customer/squads`). Sunucu bileşeni: oturum + modül kapısı + klan odası
 * verisi ilk render'da (tek `getSquadOverview`); istemci adası yalnız canlı yenileme yapar.
 * `?join=KOD` derin linki: oturum yoksa girişten sonra buraya döner, katılım diyaloğu dolu açılır.
 */
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SquadsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawJoin = typeof sp.join === 'string' ? normalizeInviteCode(sp.join) : '';
  const joinCode = rawJoin.length >= 4 ? rawJoin : undefined;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    const back = joinCode ? `${SQUADS_PATH}?join=${joinCode}` : SQUADS_PATH;
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  // Modül kapalıyken sayfa açılıp her aksiyon hata vermesin (envanter 2).
  const controls = await getModuleControls();
  if (controls.squads === false) {
    const locale = await getServerLocale();
    return (
      <div className="mx-auto max-w-xl py-10">
        <h1 className="sr-only">{locale === 'en' ? 'Squad' : 'Klan'}</h1>
        <EmptyState
          title={locale === 'en' ? 'Squads are turned off' : 'Klanlar şu an kapalı'}
          description={
            locale === 'en'
              ? 'This feature was temporarily disabled by an administrator.'
              : 'Bu özellik yönetici tarafından geçici olarak kapatıldı.'
          }
          headingLevel="h2"
        />
      </div>
    );
  }

  let initial: SquadOverview | null = null;
  try {
    initial = await getSquadOverview(session.user.id);
  } catch (err) {
    // İstemci adası hata durumunu + "tekrar dene"yi gösterir (sessiz boş veri yok).
    console.error('[customer/squads] özet üretilemedi', err);
  }

  return <SquadRoom initial={initial} joinCode={joinCode} />;
}
