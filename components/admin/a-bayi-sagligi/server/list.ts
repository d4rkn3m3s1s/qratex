/**
 * Bayi Sağlığı listesi — sinyaller → satırlar → filtre/sıralama/sayfa (sunucu otoriter).
 * Özet (bant sayıları) FİLTRESİZ evren üzerinden hesaplanır: KPI kutuları her zaman bütün resmi gösterir.
 */
import {
  buildRow,
  filterRows,
  paginate,
  parseSortParam,
  platformMeanOf,
  sortRows,
  summarize,
  type HealthBand,
  type HealthFlag,
  type HealthRow,
  type HealthSummary,
  type HealthWindow,
} from '../domain';
import { getSignals, openCsmCounts } from './signals';

export interface HealthListQuery {
  window: HealthWindow;
  q?: string | null;
  band?: HealthBand | null;
  flag?: HealthFlag | null;
  sort?: string | null;
  page?: number;
  size?: number;
  fresh?: boolean;
}

export interface HealthListResult {
  window: HealthWindow;
  computedAt: string;
  platformMean: number;
  summary: HealthSummary;
  items: HealthRow[];
  total: number;
  page: number;
  size: number;
}

export async function loadAllRows(window: HealthWindow, fresh = false): Promise<{ rows: HealthRow[]; computedAt: string; platformMean: number }> {
  const [snap, csm] = await Promise.all([getSignals(window, { fresh }), openCsmCounts()]);
  const platformMean = platformMeanOf(snap.signals);
  const rows = snap.signals.map((s) => buildRow(s, platformMean, csm.get(s.dealerId) ?? 0));
  return { rows, computedAt: snap.computedAt, platformMean };
}

export function selectRows(rows: readonly HealthRow[], q: Omit<HealthListQuery, 'window' | 'fresh' | 'page' | 'size'>): HealthRow[] {
  return sortRows(filterRows(rows, { q: q.q, band: q.band, flag: q.flag }), parseSortParam(q.sort));
}

export async function getHealthList(q: HealthListQuery): Promise<HealthListResult> {
  const { rows, computedAt, platformMean } = await loadAllRows(q.window, q.fresh);
  const selected = selectRows(rows, q);
  const page = paginate(selected, q.page ?? 1, q.size ?? 20);
  return {
    window: q.window,
    computedAt,
    platformMean,
    summary: summarize(rows),
    items: page.items,
    total: page.total,
    page: page.page,
    size: page.size,
  };
}
