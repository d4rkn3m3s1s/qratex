import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { SignalPipeGame } from '@/components/customer/games/signal-pipe-game';

export const metadata = { title: 'Sinyal Bağla | QRATEX' };

export default async function SignalPipePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Sinyal Bağla 🔧"
        description="Boruları döndürerek QR sinyalini kaynaktan sunucuya ulaştır! Kesintisiz hat kur. Günde 1 hak!"
      />
      <SignalPipeGame />
    </div>
  );
}
