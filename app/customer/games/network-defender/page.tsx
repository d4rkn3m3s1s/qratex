import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { NetworkDefenderGame } from '@/components/customer/games/network-defender-game';

export const metadata = { title: 'Ağ Savunucusu | QRateX' };

export default async function NetworkDefenderPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Ağ Savunucusu 🌐"
        description="Yayılan kötü amaçlı sinyali, düğümlere dokunarak temizle. Enfeksiyon tüm ağı sarmasın! Günde 1 hak!"
      />
      <NetworkDefenderGame />
    </div>
  );
}
