import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { MemoryMatchGame } from '@/components/customer/games/memory-match-game';

export const metadata = { title: 'Hafıza Eşleştir | QRateX' };

export default async function MemoryMatchPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6 pb-10">
      <DashboardPageHeading
        title="Hafıza Eşleştir 🃏"
        description="Kartları çevir, eşleşen çiftleri bul! Hafızanı kullan, az hamlede tamamla. Günde 1 hak!"
      />
      <MemoryMatchGame />
    </div>
  );
}
