import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { resolveTeamViewer } from '@/lib/team/access';

/**
 * Ekip modülü erişim kapısı (müşteri paneli altında, teamOnly). Yalnız ekip rolü
 * (adminTeamRole) atanmış kullanıcılar girer; karar DB'den, oturumdaki bayat rolden değil.
 * Not: proxy `/customer/*` yolunu yalnız CUSTOMER rolüne açar; ADMIN ekip modülünü
 * `/admin/ekip` üzerinden kullanır (eski "ADMIN de erişir" dalı ulaşılamaz ölü koddu).
 */
export default async function EkipLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/login');
  const viewer = await resolveTeamViewer(session.user.id);
  if (!viewer) redirect('/customer');
  return <>{children}</>;
}
