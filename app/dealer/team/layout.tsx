import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Team', description: 'Invite staff, plan shifts, assign tasks, approve leave and follow field reports, training and checklists.' }
    : {
        title: 'Ekip',
        description: 'Personel daveti, vardiya planı ve puantaj, görev atama, izin onayı, saha bildirimleri, eğitim ve kontrol listeleri.',
      };
}

export default function DealerTeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
