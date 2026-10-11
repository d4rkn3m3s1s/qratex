/**
 * Admin Analitik CSV dışa aktarımı (rapor #42: `Download` içe aktarılmış ama hiç bağlanmamıştı;
 * insights #29). Saf; jest'li. Kaçış/BOM/`;` ayırıcı ortak `toCsv`'den (formül enjeksiyonu korumalı).
 * Başlıklar çağıranın dilinde verilir; hücreler ham sayıdır (Excel kendi biçimler).
 */
import { toCsv, type CsvCell } from '@/lib/dealer-analytics/csv';
import type { AdminCards, AdminDealers, AdminOverview, AdminRootCause, AdminSectors, Comparison } from './types';

export function overviewSeriesCsv(d: AdminOverview, header: readonly string[]): string {
  return toCsv(
    header,
    d.series.map((p) => [p.day, p.reviews, p.avgRating, p.negative, p.newUsers, p.scans, p.compareDay, p.compareReviews]),
  );
}

export function dealersCsv(d: AdminDealers, header: readonly string[], sectorName: (s: string | null) => string, statusName: (s: string) => string): string {
  return toCsv(
    header,
    d.rows.map((r) => [
      r.name,
      sectorName(r.sector),
      r.n,
      r.avgRating,
      r.bayesRating,
      r.positiveShare,
      r.negativeShare,
      r.previousN,
      r.deltaPct,
      r.segmentAvg,
      r.z,
      statusName(r.status),
    ]),
  );
}

export function sectorsCsv(d: AdminSectors, header: readonly string[], sectorName: (s: string | null) => string): string {
  return toCsv(
    header,
    d.rows.map((r) => [
      sectorName(r.sector === 'none' ? null : r.sector),
      r.dealerCount,
      r.activeDealers,
      r.n,
      r.avgRating,
      r.dealerAvgRating,
      r.scans,
      r.previousN,
      r.deltaPct,
      r.deltaAvg,
      r.z,
      r.lowSample ? 1 : 0,
    ]),
  );
}

export function rootCauseCsv(d: AdminRootCause, header: readonly string[], topicName: (k: string) => string): string {
  return toCsv(
    header,
    d.topics.map((t) => [
      topicName(t.key),
      t.count,
      t.share,
      t.previous,
      t.deltaPct,
      t.dayParts.night,
      t.dayParts.morning,
      t.dayParts.afternoon,
      t.dayParts.evening,
      t.dealers.map((x) => `${x.name} (${x.count})`).join(', '),
    ]),
  );
}

export function cardsCsv(d: AdminCards, header: readonly string[], labels: Record<keyof AdminCards['period'], string>): string {
  const rows: CsvCell[][] = (Object.keys(labels) as Array<keyof AdminCards['period']>).map((k) => {
    const c: Comparison = d.period[k];
    return [labels[k], c.current, c.previous, c.deltaAbs, c.deltaPct];
  });
  return toCsv(header, rows);
}

export function adminCsvFileName(kind: string, from: string, to: string): string {
  return `qratex-platform-analitik-${kind}-${from}_${to}.csv`;
}
