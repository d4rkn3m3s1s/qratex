import type { Metadata } from 'next';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.authResetPassword', 'layoutMetadata.authResetPasswordDescription');
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
