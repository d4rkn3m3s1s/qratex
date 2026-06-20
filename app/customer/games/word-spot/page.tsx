import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { WordSpotGame } from '@/components/customer/games/word-spot-game';

export const metadata = { title: 'Sahteyi Yakala | QRATEX' };

export default async function WordSpotPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Sahteyi Yakala 🧩"
        description="Izgaradaki kelimelerden farklı/sahte olanı bul! Gözünü açık tut. Günde 1 hak!"
      />
      <WordSpotGame />
    </div>
  );
}
