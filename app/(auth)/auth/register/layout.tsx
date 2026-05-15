import type { Metadata } from 'next';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.authRegister', 'layoutMetadata.authRegisterDescription');
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
