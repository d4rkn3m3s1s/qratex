import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { TrustMergeGame } from '@/components/customer/games/trust-merge-game';

export const metadata = { title: 'Güven Birleştir | QRATEX' };

export default async function TrustMergePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Güven Birleştir 🔢"
        description="Aynı rozetleri kaydırıp birleştir, güven skorunu büyüt! 2 → 4 → 8… Günde 1 hak!"
      />
      <TrustMergeGame />
    </div>
  );
}
