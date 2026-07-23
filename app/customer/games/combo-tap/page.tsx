import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { ComboTapGame } from '@/components/customer/games/combo-tap-game';

export const metadata = { title: 'Kombo Yıldız | QRateX' };

export default async function ComboTapPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Kombo Yıldız 🎯"
        description="Beliren yıldızlara hızla dokun, komboyu kaçırma! Refleksini test et. Günde 1 hak!"
      />
      <ComboTapGame />
    </div>
  );
}
