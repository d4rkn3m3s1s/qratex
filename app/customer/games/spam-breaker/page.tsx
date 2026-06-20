import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { SpamBreakerGame } from '@/components/customer/games/spam-breaker-game';

export const metadata = { title: 'Spam Kırıcı | QRATEX' };

export default async function SpamBreakerPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Spam Kırıcı 🧊"
        description="Kalkanı kaydır, topu sektir, spam tuğlalarını kır! Çekirdeği koru. Günde 1 hak!"
      />
      <SpamBreakerGame />
    </div>
  );
}
