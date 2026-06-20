import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { TruthVsFakeGame } from '@/components/customer/games/truth-vs-fake-game';

export const metadata = { title: 'Gerçek mi Sahte mi | QRATEX' };

export default async function TruthVsFakePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Gerçek mi Sahte mi ⚖️"
        description="Kartları hızlıca kaydır: gerçek yorum mu, sahte mi? Kombo yap, puanı topla. Günde 1 hak!"
      />
      <TruthVsFakeGame />
    </div>
  );
}
