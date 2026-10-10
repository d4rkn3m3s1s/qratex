import { PRIORITY_META, STATUS_META, isTaskPriority, isTaskStatus, parseTags } from '@/lib/team/constants';
import { formatTeamDate } from '@/lib/team/dates';
import type { TaskDto, TeamDepartment } from './types';

/**
 * CSV hücresi: çift tırnak kaçışı + formül enjeksiyonu koruması (OWASP; denetim Bulgu 20:
 * `=`, `+`, `-`, `@`, sekme ve CR ile başlayan hücreler Excel'de formül olarak çalışıyordu).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function tasksToCsv(tasks: TaskDto[], departments: TeamDepartment[]): string {
  const head = ['Başlık', 'Durum', 'Öncelik', 'Atanan', 'Departman', 'Bitiş günü', 'Hafta', 'Etiketler', 'Tahmini (dk)', 'Harcanan (dk)', 'Oluşturma'];
  const rows = tasks.map((t) => [
    t.title,
    isTaskStatus(t.status) ? STATUS_META[t.status].label : t.status,
    isTaskPriority(t.priority) ? PRIORITY_META[t.priority].label : t.priority,
    t.assignedTo?.name ?? '',
    departments.find((d) => d.slug === t.department)?.name ?? '',
    t.dueDay ?? '',
    t.weekKey ?? '',
    parseTags(t.tags).join(', '),
    t.estimateMin ?? '',
    t.spentMin,
    formatTeamDate(t.createdAt),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
