import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { assertModuleEnabled } from '@/lib/module-gate';
import { getInviteOverview, type InviteOverview } from '@/lib/referral-invite';
import { getSeoSettings } from '@/lib/seo-settings';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';
import { InviteExperience } from '@/components/customer/m-davet/invite-experience';
import { InviteBlocked } from '@/components/customer/m-davet/invite-closed';

/**
 * Ben → Davet (`/customer/me/invite`; eski `/customer/referral` buraya kalıcı yönlenir).
 *
 * Sunucu önce: oturum + modül kapısı (müşteri rolü görünürlüğü dahil) + tüm okuma modeli
 * sunucuda, tek istemci adasına `initial` olarak geçer. Okuma başarısız olursa ada istemcide
 * yeniden dener ve hatayı görünür kılar ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerReferral', 'layoutMetadata.customerReferralDescription');
}

export default async function CustomerInvitePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) redirect('/auth/login?callbackUrl=%2Fcustomer%2Fme%2Finvite');
  if (session.user.role !== 'CUSTOMER') return <InviteBlocked kind="forbidden" />;

  let blocked = false;
  try {
    blocked = !!(await assertModuleEnabled('referrals', { role: 'customer', userId, routeKey: 'page.customer.me.invite' }));
  } catch {
    // Kapı okunamadı: API uçları kapıyı yine uygular; sayfa ada üzerinden hatayı gösterir.
    blocked = false;
  }
  if (blocked) return <InviteBlocked kind="moduleDisabled" />;

  const [initial, siteName] = await Promise.all([
    getInviteOverview(userId).catch((error: unknown): InviteOverview | null => {
      console.error('[customer/me/invite] overview', error);
      return null;
    }),
    getSeoSettings()
      .then((s) => s.siteName)
      .catch(() => 'QRateX'),
  ]);

  return <InviteExperience initial={initial} siteName={siteName} />;
}
