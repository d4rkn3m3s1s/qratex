import type { Metadata } from 'next';
import { adminLayoutSectionMetadata } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadata('layoutMetadata.adminAccessibility', 'layoutMetadata.adminAccessibilityDescription');
}

export default function AdminAccessibilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
