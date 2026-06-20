import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { MindThiefGame } from '@/components/customer/games/mind-thief-game';

export const metadata = { title: 'Zihin Hırsızı | QRATEX' };

export default async function MindThiefPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Zihin Hırsızı 🧠"
        description="Bozulmuş yorumları ağ enfekte olmadan yok et, gerçek yorumlara dokunma. Günde 1 hak!"
      />
      <MindThiefGame />
    </div>
  );
}
