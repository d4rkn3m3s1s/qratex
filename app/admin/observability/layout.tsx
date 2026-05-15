import type { Metadata } from 'next';
import { adminLayoutSectionMetadata } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadata('layoutMetadata.adminObservability', 'layoutMetadata.adminObservabilityDescription');
}

export default function AdminObservabilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
