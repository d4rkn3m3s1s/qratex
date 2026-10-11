/**
 * Yönetici paneli SAYFA koruması (sunucu, derinlemesine savunma — guvenlik-admin-api B15).
 *
 * `/admin/*` sayfalarının tek savunması `proxy.ts` idi; proxy eşleştiricisi değişirse ya da
 * atlanırsa (yanlış matcher, yeni rota grubu) admin kabuğu ve sunucu bileşenleri herkese
 * render edilirdi. Personel paneli (`app/staff/layout.tsx`) zaten sunucuda denetliyordu; bu
 * yardımcı aynı garantiyi admin layout'una verir:
 *  - Oturum yoksa / iptal edilmişse (NextAuth `jwt` callback'i DB durumunu doğrular) → giriş.
 *  - Güncel (DB) rol ADMIN değilse → kendi paneline.
 *  - Gizli kapı çerezi geçersizse → `/admin-gate` (imza + süre + oturum + güncel sürüm; API ile
 *    AYNI doğrulama: `checkAdminElevation`). Kapı yapılandırması okunamazsa da kapıya gider
 *    (fail-closed; kapı ekranı kendi hatasını gösterir).
 */
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { checkAdminElevation } from '@/lib/admin-gate';

const ROLE_HOME: Record<string, string> = {
  DEALER: '/dealer',
  CUSTOMER: '/customer',
  STAFF: '/staff',
};

export async function requireAdminPage(): Promise<{ userId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/login');
  const userId = session.user.id;
  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') redirect(ROLE_HOME[role ?? ''] ?? '/');
  const jti = (session as { jti?: string }).jti ?? null;
  const elevation = await checkAdminElevation(userId, jti);
  if (!elevation.ok) redirect('/admin-gate');
  return { userId };
}
