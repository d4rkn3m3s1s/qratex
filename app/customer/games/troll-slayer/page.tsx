import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { TrollSlayerGame } from '@/components/customer/games/troll-slayer-game';

export const metadata = { title: 'Troll Avcısı Arena | QRATEX' };

export default async function TrollSlayerPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Troll Avcısı Arena ⚔️"
        description="Dijital arenada troll dalgalarıyla savaş! Dokun, yok et, mümkün olduğunca uzun hayatta kal. Günde 1 hak!"
      />
      <TrollSlayerGame />
    </div>
  );
}
