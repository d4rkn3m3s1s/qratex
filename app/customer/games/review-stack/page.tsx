import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { ReviewStackGame } from '@/components/customer/games/review-stack-game';

export const metadata = { title: 'Yorum İstifi | QRATEX' };

export default async function ReviewStackPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Yorum İstifi 🧱"
        description="Düşen yorum bloklarını döndürüp diz! Satırı doldur, onaylat ve temizle. Günde 1 hak!"
      />
      <ReviewStackGame />
    </div>
  );
}
