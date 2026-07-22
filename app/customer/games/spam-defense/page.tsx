import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { SpamDefenseGame } from '@/components/customer/games/spam-defense-game';

export const metadata = { title: 'Spam Savunması | QRateX' };

export default async function SpamDefensePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Spam Savunması 🛡️"
        description="Qratex Çekirdeği’ni spam botlarından koru! Gelen botlara ateş et, dalgalar zorlaştıkça hayatta kal. Günde 1 hak!"
      />
      <SpamDefenseGame />
    </div>
  );
}
