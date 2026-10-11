/**
 * Ekip operasyonları DTO'ları (sunucu → istemci, JSON'a serileşir). Tarihler ISO metin.
 */
import type { AttendanceState, ChecklistItemDef, ChecklistType, FieldReportCategory, FieldReportStatus } from './core';

export interface ShiftDto {
  id: string;
  userId: string;
  /** İstanbul takvim günü `YYYY-MM-DD`. */
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  startAt: string | null;
  endAt: string | null;
  plannedMinutes: number | null;
  state: AttendanceState;
  lateMinutes: number | null;
  workedMinutes: number | null;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: { userId: string; name: string | null };
  overdue: boolean;
}

export interface LeaveDto {
  id: string;
  userId: string;
  name: string | null;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  createdAt: string;
  /** Talep aralığına düşen planlı vardiya sayısı (bayi görünümü). */
  conflictingShifts: number;
}

export interface FieldReportDto {
  id: string;
  category: FieldReportCategory;
  urgent: boolean;
  note: string | null;
  status: FieldReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { userId: string; name: string | null } | null;
  hasLocation: boolean;
  /** Yalnız bayi görünümünde (~100 m yuvarlanmış). */
  location: { lat: number; lng: number; accuracyM: number | null } | null;
}

export interface FeedbackStat {
  avg: number | null;
  n: number;
}

export interface MemberDto {
  staffId: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  jobTitle: string | null;
  isActive: boolean;
  joinedAt: string;
  feedback30: FeedbackStat;
  openTasks: number;
  trainingDone: number;
  today: { startTime: string; endTime: string; state: AttendanceState } | null;
}

export interface InvitationDto {
  id: string;
  email: string;
  jobTitle: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface TrainingModuleDto {
  id: string;
  title: string;
  description: string | null;
  isGlobal: boolean;
  orderIndex: number;
  completedBy: string[];
}

export interface ChecklistTemplateDto {
  id: string;
  type: ChecklistType;
  title: string;
  items: ChecklistItemDef[];
  /** Son 7 günün tamamlanmaları (en yeni önce). */
  completions: Array<{ id: string; userId: string; name: string | null; at: string; day: string }>;
}

export interface TeamKpis {
  onShiftNow: number;
  scheduledToday: number;
  lateOrMissedToday: number;
  pendingLeave: number;
  overdueTasks: number;
  openTasks: number;
  openFieldReports: number;
  urgentFieldReports: number;
  feedback30: FeedbackStat;
}

export interface TeamHub {
  generatedAt: string;
  todayYmd: string;
  weekStart: string;
  kpis: TeamKpis;
  members: MemberDto[];
  invitations: InvitationDto[];
  tasks: TaskDto[];
  shifts: ShiftDto[];
  leave: LeaveDto[];
  training: TrainingModuleDto[];
  checklists: ChecklistTemplateDto[];
  fieldReports: FieldReportDto[];
}

export interface StaffChecklistDto {
  id: string;
  type: ChecklistType;
  title: string;
  items: ChecklistItemDef[];
  doneTodayAt: string | null;
}

export interface StaffTrainingDto {
  id: string;
  title: string;
  description: string | null;
  isGlobal: boolean;
  completedAt: string | null;
}

export interface StaffAssignedDto {
  kind: 'action' | 'incident';
  id: string;
  title: string;
  priority: string;
  status: string;
  dueAt: string | null;
}

export interface StaffToday {
  generatedAt: string;
  todayYmd: string;
  profile: { name: string | null; jobTitle: string | null; businessName: string | null };
  activeShift: ShiftDto | null;
  todayShift: ShiftDto | null;
  nextShift: ShiftDto | null;
  weekShifts: ShiftDto[];
  openTasks: TaskDto[];
  recentDone: TaskDto[];
  assigned: StaffAssignedDto[];
  checklists: StaffChecklistDto[];
  training: StaffTrainingDto[];
  leave: LeaveDto[];
  fieldReports: FieldReportDto[];
  feedback: {
    last30: FeedbackStat;
    prev30: FeedbackStat;
    recent: Array<{ rating: number; text: string | null; createdAt: string }>;
  };
}

export const TEAM_HUB_QUERY_KEY = 'dealer-team-hub';
export const STAFF_TODAY_QUERY_KEY = 'staff-today';
