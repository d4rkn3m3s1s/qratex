import type { Metadata } from 'next';
import { PrivacyRequestsClient } from './_components/privacy-requests-client';

export const metadata: Metadata = {
  title: 'KVKK Talepleri',
  robots: { index: false, follow: false },
};

export default function AdminPrivacyRequestsPage() {
  return <PrivacyRequestsClient />;
}
