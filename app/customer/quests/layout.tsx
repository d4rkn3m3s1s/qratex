import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerQuests', 'layoutMetadata.customerQuestsDescription');
}

export default function CustomerQuestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
