import type { Metadata } from 'next';
import { adminLayoutSectionMetadata } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadata('layoutMetadata.adminEcosystem', 'layoutMetadata.adminEcosystemDescription');
}

export default function AdminEcosystemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
