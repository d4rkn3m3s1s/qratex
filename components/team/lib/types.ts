import type { TaskDto } from '@/lib/team/tasks';
import type { TaskDetailPayload } from '@/lib/team/detail';
import type { InitiativeDto } from '@/lib/team/initiatives';
import type { TeamCapabilities, TeamRole } from '@/lib/team/permissions';

export type { TaskDto, TaskDetailPayload, InitiativeDto, TeamCapabilities };

/** Sunucuda (sayfa bileşeni) çözülen görüntüleyici — istemciye serileşebilir. */
export type ClientViewer = {
  userId: string;
  name: string | null;
  isAdmin: boolean;
  isManager: boolean;
  teamRole: TeamRole | null;
  departments: string[];
  primaryDepartment: string | null;
};

export type TeamDepartment = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  order: number;
  isActive: boolean;
  memberCount: number;
  openTaskCount: number;
};

export type TeamMemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isAdmin: boolean;
  inTeam: boolean;
  teamRole: TeamRole | null;
  departmentSlugs: string[];
  isSelf: boolean;
};

export type TeamMeta = {
  viewer: { userId: string; isAdmin: boolean; isManager: boolean; teamRole: TeamRole | null; departments: string[] };
  can: TeamCapabilities;
  departments: TeamDepartment[];
  members: TeamMemberRow[];
  membersTruncated: boolean;
};

export type TaskList = {
  items: TaskDto[];
  weekKey: string;
  currentWeekKey: string;
  carriedCount: number;
  truncated: boolean;
};

export type TeamSummary = {
  weekKey: string;
  currentWeekKey: string;
  isCurrentWeek: boolean;
  week: {
    total: number;
    todo: number;
    inProgress: number;
    review: number;
    done: number;
    overdue: number;
    carried: number;
    pct: number | null;
    spentMin: number;
    estimateMin: number;
  };
  reviewQueue: number;
  trend: Array<{ weekKey: string; total: number; done: number; pct: number | null }>;
  mine: { open: number; inReview: number; revision: number; overdue: number; approvedThisWeek: number };
};

export type TeamTag = { slug: string; label: string; color: string };

export type SavedView = {
  id: string;
  name: string;
  config: Record<string, string>;
  isShared: boolean;
  ownerName: string | null;
  mine: boolean;
};

export type TaskDetail = TaskDetailPayload['task'];
