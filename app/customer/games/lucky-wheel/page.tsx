import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { LuckyWheelGame } from '@/components/customer/games/lucky-wheel-game';

export const metadata = { title: 'Şans Çarkı | QRateX' };

export default async function LuckyWheelPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Şans Çarkı 🎰"
        description="Çarkı çevir, yeşil dilimleri yakala! Riskli kırmızılardan kaç. Günde 1 hak!"
      />
      <LuckyWheelGame />
    </div>
  );
}
