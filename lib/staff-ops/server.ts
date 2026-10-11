/**
 * Ekip operasyonları — sunucu okuma katmanı (Prisma). Hem RSC sayfaları (ilk boyama) hem BFF
 * uçları (yenileme) aynı fonksiyonu çağırır; sonuç tek JSON-uyumlu DTO'dur.
 *
 * Kiracı kapsamı: her sorgu çağıranın verdiği `dealerId` ile sınırlıdır (çağıran
 * `resolveDealerScope` / `requireAuth` ile doğrular). Liste boyutları sınırlıdır.
 */
import { prisma } from '@/lib/prisma';
import {
  FIELD_REPORT_CATEGORIES,
  FIELD_REPORT_SOURCE,
  OPEN_TASK_STATUSES,
  addDaysYmd,
  attendanceState,
  compareTasks,
  dbDateToYmd,
  fieldReportStatusOf,
  isTaskOverdue,
  istanbulYmd,
  lateMinutes,
  leaveDays,
  parseChecklistItems,
  shiftWindow,
  weekStartYmd,
  workedMinutes,
  ymdToDbDate,
  type ChecklistType,
  type FieldReportCategory,
} from './core';
import type {
  ChecklistTemplateDto,
  FeedbackStat,
  FieldReportDto,
  LeaveDto,
  MemberDto,
  ShiftDto,
  StaffAssignedDto,
  StaffToday,
  TaskDto,
  TeamHub,
  TrainingModuleDto,
} from './types';

const DAY_MS = 86_400_000;

type ShiftRow = {
  id: string;
  userId: string;
  date: Date;
  startTime: string;
  endTime: string;
  note: string | null;
  clockInAt: Date | null;
  clockOutAt: Date | null;
};

export function toShiftDto(s: ShiftRow, now: Date): ShiftDto {
  const w = shiftWindow(s);
  return {
    id: s.id,
    userId: s.userId,
    date: dbDateToYmd(s.date),
    startTime: s.startTime,
    endTime: s.endTime,
    note: s.note,
    clockInAt: s.clockInAt?.toISOString() ?? null,
    clockOutAt: s.clockOutAt?.toISOString() ?? null,
    startAt: w?.start.toISOString() ?? null,
    endAt: w?.end.toISOString() ?? null,
    plannedMinutes: w?.plannedMinutes ?? null,
    state: attendanceState(s, now),
    lateMinutes: lateMinutes(s),
    workedMinutes: workedMinutes(s, now),
  };
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  assignedTo: string;
  user?: { name: string | null } | null;
};

export function toTaskDto(t: TaskRow, now: Date, names?: Map<string, string | null>): TaskDto {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    assignee: { userId: t.assignedTo, name: t.user?.name ?? names?.get(t.assignedTo) ?? null },
    overdue: isTaskOverdue(t, now),
  };
}

type IncidentRow = {
  id: string;
  status: string;
  description: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  metadata: unknown;
};

function readMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function toFieldReportDto(
  row: IncidentRow,
  opts: { includeLocation: boolean; names?: Map<string, string | null> }
): FieldReportDto {
  const meta = readMeta(row.metadata);
  const category = (FIELD_REPORT_CATEGORIES as readonly string[]).includes(String(meta.category))
    ? (meta.category as FieldReportCategory)
    : 'other';
  const reporterId = typeof meta.reporterUserId === 'string' ? meta.reporterUserId : null;
  const loc = readMeta(meta.location);
  const hasLocation = typeof loc.lat === 'number' && typeof loc.lng === 'number';
  return {
    id: row.id,
    category,
    urgent: meta.urgent === true,
    note: row.description,
    status: fieldReportStatusOf(row.status),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reporter: reporterId ? { userId: reporterId, name: opts.names?.get(reporterId) ?? null } : null,
    hasLocation,
    location:
      opts.includeLocation && hasLocation
        ? { lat: loc.lat as number, lng: loc.lng as number, accuracyM: typeof loc.accuracyM === 'number' ? loc.accuracyM : null }
        : null,
  };
}

function round1(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}

const fieldReportWhere = (dealerId: string) => ({
  dealerId,
  metadata: { path: ['source'], equals: FIELD_REPORT_SOURCE },
});

// ───────────────────────────── Bayi: ekip merkezi ─────────────────────────────

export async function getTeamHub(dealerId: string, opts: { week?: string | null; now?: Date } = {}): Promise<TeamHub> {
  const now = opts.now ?? new Date();
  const todayYmd = istanbulYmd(now);
  const weekStart = weekStartYmd(opts.week ?? todayYmd);
  const weekEnd = addDaysYmd(weekStart, 6);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);

  const staff = await prisma.dealerStaff.findMany({
    where: { dealerId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    take: 200,
  });
  const staffIds = staff.map((s) => s.id);
  const userIds = staff.map((s) => s.userId);
  const names = new Map<string, string | null>(staff.map((s) => [s.userId, s.user.name ?? s.user.email]));

  const [
    invitations,
    openTasks,
    closedTasks,
    weekShifts,
    todayShifts,
    openShiftCount,
    pendingLeave,
    recentLeave,
    modules,
    templates,
    reports,
    feedbackByStaff,
    feedbackAll,
  ] = await Promise.all([
    prisma.staffInvitation.findMany({
      where: { dealerId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, email: true, jobTitle: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.staffTask.findMany({
      where: { dealerId, status: { in: [...OPEN_TASK_STATUSES] } },
      include: { user: { select: { name: true } } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    }),
    prisma.staffTask.findMany({
      where: { dealerId, status: { in: ['completed', 'cancelled'] } },
      include: { user: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    }),
    prisma.staffShift.findMany({
      where: { dealerId, date: { gte: ymdToDbDate(weekStart), lte: ymdToDbDate(weekEnd) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 600,
    }),
    prisma.staffShift.findMany({
      where: { dealerId, date: ymdToDbDate(todayYmd) },
      take: 300,
    }),
    prisma.staffShift.count({
      where: {
        dealerId,
        clockInAt: { not: null },
        clockOutAt: null,
        date: { gte: ymdToDbDate(addDaysYmd(todayYmd, -1)) },
      },
    }),
    prisma.staffLeaveRequest.findMany({
      where: { dealerId, status: 'pending' },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { startDate: 'asc' },
      take: 100,
    }),
    prisma.staffLeaveRequest.findMany({
      where: { dealerId, status: { not: 'pending' }, updatedAt: { gte: since30 } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.trainingModule.findMany({
      where: { OR: [{ dealerId }, { dealerId: null }], isActive: true },
      select: {
        id: true,
        title: true,
        description: true,
        dealerId: true,
        orderIndex: true,
        completions: { where: { userId: { in: userIds } }, select: { userId: true } },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    }),
    prisma.checklistTemplate.findMany({
      where: { dealerId, isActive: true },
      select: {
        id: true,
        type: true,
        title: true,
        items: true,
        completions: {
          where: { completedAt: { gte: since7 } },
          select: { id: true, userId: true, completedAt: true },
          orderBy: { completedAt: 'desc' },
          take: 100,
        },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    }),
    prisma.incident.findMany({
      where: fieldReportWhere(dealerId),
      select: { id: true, status: true, description: true, createdAt: true, resolvedAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    staffIds.length
      ? prisma.feedback.groupBy({
          by: ['dealerStaffId'],
          where: { dealerStaffId: { in: staffIds }, createdAt: { gte: since30 } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ dealerStaffId: string | null; _avg: { rating: number | null }; _count: { _all: number } }>),
    staffIds.length
      ? prisma.feedback.aggregate({
          where: { dealerStaffId: { in: staffIds }, createdAt: { gte: since30 } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : Promise.resolve({ _avg: { rating: null as number | null }, _count: { _all: 0 } }),
  ]);

  // İzin çakışmaları: bekleyen taleplerin aralığına düşen planlı vardiyalar.
  let conflictShifts: Array<{ userId: string; date: Date }> = [];
  if (pendingLeave.length) {
    const minStart = pendingLeave.reduce((m, l) => (l.startDate < m ? l.startDate : m), pendingLeave[0].startDate);
    const maxEnd = pendingLeave.reduce((m, l) => (l.endDate > m ? l.endDate : m), pendingLeave[0].endDate);
    conflictShifts = await prisma.staffShift.findMany({
      where: { dealerId, userId: { in: [...new Set(pendingLeave.map((l) => l.userId))] }, date: { gte: minStart, lte: maxEnd } },
      select: { userId: true, date: true },
      take: 1000,
    });
  }

  const toLeave = (l: (typeof pendingLeave)[number]): LeaveDto => {
    const s = dbDateToYmd(l.startDate);
    const e = dbDateToYmd(l.endDate);
    return {
      id: l.id,
      userId: l.userId,
      name: l.user?.name ?? l.user?.email ?? null,
      startDate: s,
      endDate: e,
      days: leaveDays(s, e),
      reason: l.reason,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      conflictingShifts:
        l.status === 'pending'
          ? conflictShifts.filter((c) => c.userId === l.userId && c.date >= l.startDate && c.date <= l.endDate).length
          : 0,
    };
  };

  const fbMap = new Map<string, FeedbackStat>(
    feedbackByStaff
      .filter((g) => g.dealerStaffId)
      .map((g) => [g.dealerStaffId as string, { avg: round1(g._avg.rating), n: g._count._all }])
  );
  const openByUser = new Map<string, number>();
  for (const t of openTasks) openByUser.set(t.assignedTo, (openByUser.get(t.assignedTo) ?? 0) + 1);
  const trainingByUser = new Map<string, number>();
  for (const m of modules) for (const c of m.completions) trainingByUser.set(c.userId, (trainingByUser.get(c.userId) ?? 0) + 1);
  const todayByUser = new Map<string, ShiftRow>();
  for (const s of [...todayShifts].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    if (!todayByUser.has(s.userId)) todayByUser.set(s.userId, s);
  }

  const members: MemberDto[] = staff.map((s) => {
    const today = todayByUser.get(s.userId);
    return {
      staffId: s.id,
      userId: s.userId,
      name: s.user.name,
      email: s.user.email,
      image: s.user.image,
      jobTitle: s.jobTitle,
      isActive: s.isActive,
      joinedAt: s.createdAt.toISOString(),
      feedback30: fbMap.get(s.id) ?? { avg: null, n: 0 },
      openTasks: openByUser.get(s.userId) ?? 0,
      trainingDone: trainingByUser.get(s.userId) ?? 0,
      today: today ? { startTime: today.startTime, endTime: today.endTime, state: attendanceState(today, now) } : null,
    };
  });

  const tasks = [...openTasks, ...closedTasks].map((t) => toTaskDto(t, now, names));
  tasks.sort(compareTasks);

  const todayStates = todayShifts.map((s) => attendanceState(s, now));
  const fieldReports = reports.map((r) => toFieldReportDto(r, { includeLocation: true, names }));

  const training: TrainingModuleDto[] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    isGlobal: m.dealerId == null,
    orderIndex: m.orderIndex,
    completedBy: m.completions.map((c) => c.userId),
  }));

  const checklists: ChecklistTemplateDto[] = templates.map((t) => ({
    id: t.id,
    type: (['open', 'close', 'custom'].includes(t.type) ? t.type : 'custom') as ChecklistType,
    title: t.title,
    items: parseChecklistItems(t.items),
    completions: t.completions.map((c) => ({
      id: c.id,
      userId: c.userId,
      name: names.get(c.userId) ?? null,
      at: c.completedAt.toISOString(),
      day: istanbulYmd(c.completedAt),
    })),
  }));

  return {
    generatedAt: now.toISOString(),
    todayYmd,
    weekStart,
    kpis: {
      onShiftNow: openShiftCount,
      scheduledToday: todayShifts.length,
      lateOrMissedToday: todayStates.filter((s) => s === 'late' || s === 'missed').length,
      pendingLeave: pendingLeave.length,
      overdueTasks: openTasks.filter((t) => isTaskOverdue(t, now)).length,
      openTasks: openTasks.length,
      openFieldReports: fieldReports.filter((r) => r.status !== 'resolved').length,
      urgentFieldReports: fieldReports.filter((r) => r.status === 'open' && r.urgent).length,
      feedback30: { avg: round1(feedbackAll._avg.rating), n: feedbackAll._count._all },
    },
    members,
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      jobTitle: i.jobTitle,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    tasks,
    shifts: weekShifts.map((s) => toShiftDto(s, now)),
    leave: [...pendingLeave, ...recentLeave].map(toLeave),
    training,
    checklists,
    fieldReports,
  };
}

// ───────────────────────────── Personel: Bugün ─────────────────────────────

export async function getStaffToday(userId: string, dealerId: string, opts: { now?: Date } = {}): Promise<StaffToday> {
  const now = opts.now ?? new Date();
  const todayYmd = istanbulYmd(now);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since60 = new Date(now.getTime() - 60 * DAY_MS);

  const profileRow = await prisma.dealerStaff.findFirst({
    where: { userId, dealerId },
    select: {
      id: true,
      jobTitle: true,
      user: { select: { name: true } },
      dealer: { select: { businessName: true, name: true } },
    },
  });
  const staffId = profileRow?.id ?? null;

  const [
    shifts,
    openTasks,
    recentDone,
    actionItems,
    incidents,
    templates,
    modules,
    leave,
    reports,
    fbLast,
    fbPrev,
    fbRecent,
  ] = await Promise.all([
    prisma.staffShift.findMany({
      where: {
        userId,
        dealerId,
        date: { gte: ymdToDbDate(addDaysYmd(todayYmd, -1)), lte: ymdToDbDate(addDaysYmd(todayYmd, 13)) },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 60,
    }),
    prisma.staffTask.findMany({
      where: { assignedTo: userId, dealerId, status: { in: [...OPEN_TASK_STATUSES] } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.staffTask.findMany({
      where: { assignedTo: userId, dealerId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
      take: 5,
    }),
    prisma.actionItem.findMany({
      where: { assignedToId: userId, dealerId, status: { notIn: ['done', 'cancelled'] } },
      select: { id: true, suggestionText: true, priority: true, status: true, dueAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.incident.findMany({
      where: { assignedToId: userId, dealerId, status: { not: 'resolved' } },
      select: { id: true, title: true, severity: true, status: true, dueAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.checklistTemplate.findMany({
      where: { dealerId, isActive: true },
      select: {
        id: true,
        type: true,
        title: true,
        items: true,
        completions: {
          where: { userId, completedAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } },
          select: { completedAt: true },
          orderBy: { completedAt: 'desc' },
          take: 3,
        },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    }),
    prisma.trainingModule.findMany({
      where: { OR: [{ dealerId }, { dealerId: null }], isActive: true },
      select: {
        id: true,
        title: true,
        description: true,
        dealerId: true,
        completions: { where: { userId }, select: { completedAt: true }, take: 1 },
      },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    }),
    prisma.staffLeaveRequest.findMany({
      where: { userId, dealerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.incident.findMany({
      where: {
        dealerId,
        AND: [
          { metadata: { path: ['source'], equals: FIELD_REPORT_SOURCE } },
          { metadata: { path: ['reporterUserId'], equals: userId } },
        ],
      },
      select: { id: true, status: true, description: true, createdAt: true, resolvedAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    staffId
      ? prisma.feedback.aggregate({
          where: { dealerStaffId: staffId, createdAt: { gte: since30 } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : Promise.resolve(null),
    staffId
      ? prisma.feedback.aggregate({
          where: { dealerStaffId: staffId, createdAt: { gte: since60, lt: since30 } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : Promise.resolve(null),
    staffId
      ? prisma.feedback.findMany({
          where: { dealerStaffId: staffId, isToxic: false, text: { not: null } },
          select: { rating: true, text: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 3,
        })
      : Promise.resolve([] as Array<{ rating: number; text: string | null; createdAt: Date }>),
  ]);

  const shiftDtos = shifts.map((s) => toShiftDto(s, now));
  const activeShift = [...shiftDtos].reverse().find((s) => s.clockInAt && !s.clockOutAt) ?? null;
  const todayShift =
    shiftDtos.find((s) => s.date === todayYmd && !s.clockOutAt) ?? shiftDtos.find((s) => s.date === todayYmd) ?? null;
  const nextShift = shiftDtos.find((s) => s.date > todayYmd) ?? null;

  const tasks = openTasks.map((t) => toTaskDto(t, now));
  tasks.sort(compareTasks);

  const assigned: StaffAssignedDto[] = [
    ...actionItems.map((a) => ({
      kind: 'action' as const,
      id: a.id,
      title: a.suggestionText.replace(/\s+/g, ' ').trim().slice(0, 200),
      priority: a.priority,
      status: a.status,
      dueAt: a.dueAt?.toISOString() ?? null,
    })),
    ...incidents.map((i) => ({
      kind: 'incident' as const,
      id: i.id,
      title: i.title,
      priority: i.severity,
      status: i.status,
      dueAt: i.dueAt?.toISOString() ?? null,
    })),
  ];

  return {
    generatedAt: now.toISOString(),
    todayYmd,
    profile: {
      name: profileRow?.user.name ?? null,
      jobTitle: profileRow?.jobTitle ?? null,
      businessName: profileRow?.dealer.businessName ?? profileRow?.dealer.name ?? null,
    },
    activeShift,
    todayShift,
    nextShift,
    weekShifts: shiftDtos.filter((s) => s.date >= todayYmd),
    openTasks: tasks,
    recentDone: recentDone.map((t) => toTaskDto(t, now)),
    assigned,
    checklists: templates.map((t) => {
      const doneToday = t.completions.find((c) => istanbulYmd(c.completedAt) === todayYmd);
      return {
        id: t.id,
        type: (['open', 'close', 'custom'].includes(t.type) ? t.type : 'custom') as ChecklistType,
        title: t.title,
        items: parseChecklistItems(t.items),
        doneTodayAt: doneToday?.completedAt.toISOString() ?? null,
      };
    }),
    training: modules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      isGlobal: m.dealerId == null,
      completedAt: m.completions[0]?.completedAt.toISOString() ?? null,
    })),
    leave: leave.map((l) => {
      const s = dbDateToYmd(l.startDate);
      const e = dbDateToYmd(l.endDate);
      return {
        id: l.id,
        userId: l.userId,
        name: null,
        startDate: s,
        endDate: e,
        days: leaveDays(s, e),
        reason: l.reason,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        conflictingShifts: 0,
      };
    }),
    fieldReports: reports.map((r) => toFieldReportDto(r, { includeLocation: false })),
    feedback: {
      last30: { avg: round1(fbLast?._avg.rating ?? null), n: fbLast?._count._all ?? 0 },
      prev30: { avg: round1(fbPrev?._avg.rating ?? null), n: fbPrev?._count._all ?? 0 },
      recent: fbRecent.map((f) => ({
        rating: f.rating,
        text: f.text ? f.text.replace(/\s+/g, ' ').trim().slice(0, 280) : null,
        createdAt: f.createdAt.toISOString(),
      })),
    },
  };
}
