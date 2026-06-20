import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DataSnakeGame } from '@/components/customer/games/data-snake-game';

export const metadata = { title: 'Veri Yılanı | QRATEX' };

export default async function DataSnakePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Veri Yılanı 🐍"
        description="Yılanı yönlendir, veri paketlerini yut ve büyü! Duvara ve kuyruğuna çarpma. Günde 1 hak!"
      />
      <DataSnakeGame />
    </div>
  );
}
