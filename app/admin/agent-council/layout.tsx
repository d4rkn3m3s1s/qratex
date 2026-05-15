import type { Metadata } from 'next';
import { adminLayoutSectionMetadataNoindex } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadataNoindex('layoutMetadata.adminAgentCouncil', 'layoutMetadata.adminAgentCouncilDescription');
}

export default function AgentCouncilSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
