import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

/**
 * Ekip modülü erişim kapısı (müşteri paneli altında).
 * Yalnızca kendisine bir ekip rolü (adminTeamRole) atanmış kullanıcılar erişebilir.
 * ADMIN de erişir (kurulum/denetim). Diğerleri dashboard'a yönlendirilir.
 * Not: /customer/* middleware zaten CUSTOMER rolünü doğrular; bu kat ekstra rol kapısıdır.
 */
export default async function EkipLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/login');

  // Session bayat olabilir; DB'den güncel ekip rolünü doğrula.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, adminTeamRole: true },
  });
  const hasAccess = user?.role === 'ADMIN' || !!user?.adminTeamRole;
  if (!hasAccess) redirect('/customer');

  return <>{children}</>;
}
