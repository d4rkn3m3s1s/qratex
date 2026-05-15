import type { Metadata } from 'next';
import { adminLayoutSectionMetadata } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadata('layoutMetadata.adminDesignLanguage', 'layoutMetadata.adminDesignLanguageDescription');
}

export default function AdminDesignLanguageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
