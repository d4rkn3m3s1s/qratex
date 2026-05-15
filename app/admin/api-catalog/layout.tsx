import type { Metadata } from 'next';
import { adminLayoutSectionMetadata } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadata('layoutMetadata.adminApiCatalog', 'layoutMetadata.adminApiCatalogDescription');
}

export default function AdminApiCatalogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
