import type { Metadata } from 'next';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.authVerifyEmail', 'layoutMetadata.authVerifyEmailDescription');
}

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
