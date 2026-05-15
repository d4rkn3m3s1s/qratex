import type { Metadata } from 'next';
import { adminLayoutSectionMetadata } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadata('layoutMetadata.adminPlatformPulse', 'layoutMetadata.adminPlatformPulseDescription');
}

export default function AdminPlatformPulseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
