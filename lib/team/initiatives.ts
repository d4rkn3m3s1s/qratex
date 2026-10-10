import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { INITIATIVE_SOURCE, PHASE_META, isInitiativePhase, type InitiativePhase } from './constants';
import { dueDayOf, isOverdue } from './dates';

/**
 * Girişimler (eski /admin/roadmap). Statik JSON yerine veritabanı: `CompanyTask` satırı,
 * `sourceType='initiative'`, `weekKey=null`; `status` = aşama (later/next/now/shipped/dropped),
 * `assignedTo` = sorumlu, `dueAt` = hedef tarih, `department` = tema, kontrol listesi = kilometre
 * taşları (ilerleme bunlardan TÜRETİLİR), yorumlar = karar notları, aktivite = değişiklik geçmişi.
 * Şema penceresi kapalı olduğu için ayrı model yok; görev sorguları bunları `NOT_INITIATIVE` ile dışlar.
 */

export const INITIATIVE_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  department: true,
  dueAt: true,
  tags: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true, image: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { checklist: true, comments: true } },
} satisfies Prisma.CompanyTaskSelect;

type Row = Prisma.CompanyTaskGetPayload<{ select: typeof INITIATIVE_SELECT }>;

export function toInitiativeDto(row: Row, doneMilestones: number) {
  const phase: InitiativePhase = isInitiativePhase(row.status) ? row.status : 'later';
  const total = row._count.checklist;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    phase,
    phaseLabel: PHASE_META[phase].label,
    priority: row.priority,
    department: row.department,
    targetDay: dueDayOf(row.dueAt),
    targetOverdue: phase !== 'shipped' && phase !== 'dropped' && isOverdue(row.dueAt),
    tags: row.tags,
    shippedAt: row.completedAt ? row.completedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    owner: row.assignedTo,
    createdBy: row.createdBy,
    milestones: { total, done: doneMilestones, pct: total ? Math.round((doneMilestones / total) * 100) : null },
    notes: row._count.comments,
  };
}

export type InitiativeDto = ReturnType<typeof toInitiativeDto>;

export async function doneMilestoneCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.taskChecklistItem.groupBy({ by: ['taskId'], where: { taskId: { in: ids }, done: true }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.taskId, r._count._all]));
}

export async function findInitiative(id: string) {
  const row = await prisma.companyTask.findFirst({ where: { id, sourceType: INITIATIVE_SOURCE }, select: INITIATIVE_SELECT });
  if (!row) throw new ApiError('NOT_FOUND', 'Girişim bulunamadı.');
  return row;
}
