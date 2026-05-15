import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerAiChat', 'layoutMetadata.dealerAiChatDescription');
}

export default function DealerAiChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
