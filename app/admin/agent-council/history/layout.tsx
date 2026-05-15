import type { Metadata } from 'next';
import { adminLayoutSectionMetadataNoindex } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadataNoindex('layoutMetadata.adminAgentCouncilHistory', 'layoutMetadata.adminAgentCouncilHistoryDescription');
}

export default function AgentCouncilHistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
