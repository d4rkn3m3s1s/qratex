import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ekip daveti',
  description: 'İşletme ekibine katılma davetini görüntüleyin ve kabul edin.',
  robots: { index: false, follow: false },
};

export default function StaffInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
