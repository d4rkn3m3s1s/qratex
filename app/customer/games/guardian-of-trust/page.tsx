import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { GuardianOfTrustGame } from '@/components/customer/games/guardian-of-trust-game';

export const metadata = { title: 'Güven Muhafızı | QRATEX' };

export default async function GuardianOfTrustPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Güven Muhafızı ✨"
        description="Düşen olumlu yorumları koru, bozuk yorumları kalkanınla engelle. Günde 1 hak!"
      />
      <GuardianOfTrustGame />
    </div>
  );
}
