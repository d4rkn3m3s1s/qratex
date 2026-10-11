import type { Metadata } from 'next';
import { NotFoundView } from '@/components/layout/not-found-view';

export const metadata: Metadata = {
  title: 'Sayfa bulunamadı · Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
