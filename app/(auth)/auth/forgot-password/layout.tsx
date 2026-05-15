import type { Metadata } from 'next';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.authForgotPassword', 'layoutMetadata.authForgotPasswordDescription');
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
