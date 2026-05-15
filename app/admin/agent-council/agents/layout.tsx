import type { Metadata } from 'next';
import { adminLayoutSectionMetadataNoindex } from '@/lib/admin-route-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return adminLayoutSectionMetadataNoindex('layoutMetadata.adminAgentCouncilAgents', 'layoutMetadata.adminAgentCouncilAgentsDescription');
}

export default function AgentCouncilAgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
