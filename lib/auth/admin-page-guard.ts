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
 *  - 2FA kurulmamışsa → `/admin/account-security?zorunlu=1` (lib/auth/admin-2fa; demo/break-glass muaf).
 */
import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { checkAdminElevation } from '@/lib/admin-gate';
import { ADMIN_2FA_SETUP_PATH, adminNeeds2faSetup } from '@/lib/auth/admin-2fa';

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
  // Zorunlu 2FA (kapıdan SONRA): kurulmamışsa kurulum sayfasına. Yol, proxy'nin her /admin
  // isteğinde ezerek yazdığı `x-qx-pathname` başlığından okunur (istemci sahtesi geçmez).
  const pathname = (await headers()).get('x-qx-pathname');
  if (await adminNeeds2faSetup(userId, { sid: jti, pathname })) redirect(`${ADMIN_2FA_SETUP_PATH}?zorunlu=1`);
  return { userId };
}
