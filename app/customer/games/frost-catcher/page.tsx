import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { FrostCatcherGame } from '@/components/customer/games/frost-catcher-game';

export const metadata = { title: 'Kar Tanesi Yakala | QRateX' };

export default async function FrostCatcherPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Kar Tanesi Yakala ❄️"
        description="Buzul Krallığı’nda gökten düşen kar tanelerini eldivenle yakala! Kombo yap, altın kristali kaçırma. Günde 1 hak!"
      />
      <FrostCatcherGame />
    </div>
  );
}
