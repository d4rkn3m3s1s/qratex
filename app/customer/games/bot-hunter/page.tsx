import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { BotHunterGame } from '@/components/customer/games/bot-hunter-game';

export const metadata = { title: 'Bot Avcısı | QRATEX' };

export default async function BotHunterPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Bot Avcısı 🛰️"
        description="6 profilden sahte botları yakala, gerçek kullanıcıları koru. Günde 1 hak!"
      />
      <BotHunterGame />
    </div>
  );
}
