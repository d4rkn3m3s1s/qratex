import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DataMinerGame } from '@/components/customer/games/data-miner-game';

export const metadata = { title: 'Veri Madencisi | QRateX' };

export default async function DataMinerPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Veri Madencisi ⛏️"
        description="Holografik küpleri aç, değerli veriyi bul — bot tuzaklarına dikkat! İstediğin an çıkıp skoru kasala. Günde 1 hak!"
      />
      <DataMinerGame />
    </div>
  );
}
