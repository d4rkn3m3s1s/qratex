'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { capabilitiesFor, type TeamViewer } from '@/lib/team/permissions';
import type { ClientViewer, TeamCapabilities, TeamDepartment, TeamMemberRow, TeamTag } from './lib/types';

export type WorkspaceContextValue = {
  basePath: string;
  viewer: ClientViewer;
  /** `lib/team/permissions` fonksiyonları için tam görüntüleyici. */
  teamViewer: TeamViewer;
  can: TeamCapabilities;
  departments: TeamDepartment[];
  members: TeamMemberRow[];
  tags: TeamTag[];
  weekKey: string;
  currentWeekKey: string;
  openTask: (id: string) => void;
};

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace: WorkspaceProvider eksik');
  return v;
}

export function toTeamViewer(v: ClientViewer): TeamViewer {
  return { ...v, role: v.isAdmin ? 'ADMIN' : 'CUSTOMER' };
}

export function capsOf(v: ClientViewer): TeamCapabilities {
  return capabilitiesFor(v);
}
