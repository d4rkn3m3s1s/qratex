import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveTeamViewer } from './access';
import { loadTeamMeta } from './meta';
import { weekKeyOf } from '@/lib/team-week';

/**
 * Ekip sayfalarının sunucu önyüklemesi: görüntüleyici (yetki DB'den), departman/üye meta
 * verisi ve İstanbul'a göre içinde bulunulan hafta. Erişim yoksa `null` (sayfa yönlendirir).
 * Oturumlu dinamik sayfa olduğu için derleme anında DB'ye gidilmez.
 */
export async function loadTeamBootstrap() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { status: 'unauthenticated' as const };
  const viewer = await resolveTeamViewer(userId);
  if (!viewer) return { status: 'forbidden' as const };
  const meta = await loadTeamMeta(viewer).catch((err) => {
    console.error('[team] meta yüklenemedi', err);
    return undefined;
  });
  return {
    status: 'ok' as const,
    viewer: {
      userId: viewer.userId,
      name: viewer.name,
      isAdmin: viewer.isAdmin,
      isManager: viewer.isManager,
      teamRole: viewer.teamRole,
      departments: viewer.departments,
      primaryDepartment: viewer.primaryDepartment,
    },
    initialMeta: meta,
    currentWeekKey: weekKeyOf(),
  };
}
