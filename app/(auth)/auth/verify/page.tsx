import type { Metadata } from 'next';
import { VerifyRequestView } from './verify-request-view';

export const metadata: Metadata = {
  title: 'E-postanı doğrula',
  robots: { index: false, follow: false },
};

export default function VerifyRequestPage() {
  return <VerifyRequestView />;
}
