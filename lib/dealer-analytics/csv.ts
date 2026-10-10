/**
 * b-analitik CSV dışa aktarımı (rapor B-10: dışa aktarma kodu içe aktarılmış ama bağlanmamıştı).
 * Saf; jest'li. Formül enjeksiyonu korumalı (`=`, `+`, `-`, `@`, sekme, CR ile başlayan metin
 * `'` ile kaçışlanır), Excel için UTF-8 BOM + `;` ayırıcı (TR yerelinde virgül ondalıktır).
 */
import { WEEKDAYS, type ActivityHeatmap, type AnalyticsOverview } from './types';

export type CsvCell = string | number | null | undefined;

export function escapeCsvCell(v: CsvCell, sep = ';'): string {
  if (v == null) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[], sep = ';'): string {
  const lines = [header.map((h) => escapeCsvCell(h, sep)).join(sep), ...rows.map((r) => r.map((c) => escapeCsvCell(c, sep)).join(sep))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function seriesCsv(data: AnalyticsOverview, header: readonly string[]): string {
  return toCsv(
    header,
    data.series.map((p) => [p.day, p.count, p.avgRating, p.positive, p.neutral, p.negative, p.pending, p.compareDay, p.compareCount]),
  );
}

export function qrCsv(data: AnalyticsOverview, header: readonly string[]): string {
  return toCsv(
    header,
    data.qr.map((r) => [r.name, r.code, r.locationName, r.feedbacks, r.avgRating, r.positiveShare, r.scans, r.conversion, r.compareFeedbacks, r.feedbackDelta]),
  );
}

export function topicsCsv(data: AnalyticsOverview, header: readonly string[], label: (key: string) => string): string {
  return toCsv(
    header,
    data.topics.map((t) => [label(t.key), t.count, t.positive, t.negative, t.net, t.compareCount]),
  );
}

/** Gün × saat ızgarası: her hücre bir satır (pivot elle yapılabilir). */
export function gridCsv(data: ActivityHeatmap, header: readonly string[], dayName: (d: (typeof WEEKDAYS)[number]) => string): string {
  const rows: CsvCell[][] = [];
  for (const r of data.rows) {
    for (const c of r.cells) {
      rows.push([dayName(r.day), c.hour, c.feedback, c.avgRating, c.negative, data.availability.visits ? c.visits : null, data.availability.revenue ? c.revenue : null, c.compareFeedback]);
    }
  }
  return toCsv(header, rows);
}

export function locationsCsv(data: ActivityHeatmap, header: readonly string[], unassigned: string): string {
  const rows: CsvCell[][] = [];
  for (const l of data.locations) {
    for (const q of l.qr) {
      rows.push([l.name ?? unassigned, q.name, q.feedbacks, q.avgRating, q.positive, q.neutral, q.negative, q.pending]);
    }
  }
  return toCsv(header, rows);
}

export function csvFileName(kind: string, from: string, to: string): string {
  return `qratex-analitik-${kind}-${from}_${to}.csv`;
}
