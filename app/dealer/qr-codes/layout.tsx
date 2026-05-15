import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerQrCodes', 'layoutMetadata.dealerQrCodesDescription');
}

export default function DealerQrCodesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
