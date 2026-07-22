import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { PacmanGame } from '@/components/customer/pacman-game';

export const metadata = { title: 'Yıldız Avı | QRateX' };

export default async function PacmanGamePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Yıldız Avı 🎮"
        description="QRatex labirentinde yıldızları topla, hayaletlerden kaç! Günde 1 hak — 5 yıldız topla, ödülü kap."
      />
      <PacmanGame />
    </div>
  );
}
