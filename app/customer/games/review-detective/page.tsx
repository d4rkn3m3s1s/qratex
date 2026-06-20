import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { ReviewDetectiveGame } from '@/components/customer/games/review-detective-game';

export const metadata = { title: 'Yorum Dedektifi | QRATEX' };

export default async function ReviewDetectivePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Yorum Dedektifi 🕵️"
        description="Dosyadaki yorumlardan sahte/yapay olanı bul. Süre dolmadan doğru kararı ver. Günde 1 hak!"
      />
      <ReviewDetectiveGame />
    </div>
  );
}
