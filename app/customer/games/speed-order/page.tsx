import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { SpeedOrderGame } from '@/components/customer/games/speed-order-game';

export const metadata = { title: 'Hız Sıralama | QRATEX' };

export default async function SpeedOrderPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Hız Sıralama ⚡"
        description="Rakamlara 1’den başlayarak sırayla dokun! Süre tükenmeden yakala. Günde 1 hak!"
      />
      <SpeedOrderGame />
    </div>
  );
}
