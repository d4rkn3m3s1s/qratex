import type { ChangelogData, ChangelogSummaryData, ChangelogWeek, ChangelogWeekSummary } from './types';

/** Haftanın commitlerini Pazartesi(0)→Pazar(6) gününe dağıtır. */
function dailyCounts(w: ChangelogWeek): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const c of w.commits ?? []) {
    const d = new Date(`${String(c.date).slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) out[(d.getUTCDay() + 6) % 7]++;
  }
  if (out.every((n) => n === 0)) {
    for (const d of w.days ?? []) {
      const x = new Date(`${d.date}T12:00:00Z`);
      if (!Number.isNaN(x.getTime())) out[(x.getUTCDay() + 6) % 7] += d.commits ?? 0;
    }
  }
  return out;
}

/** Tam veriden istemciye giden hafif özeti üretir (commit listesi, bölümler, gün dökümü hariç). */
export function toSummary(data: ChangelogData): ChangelogSummaryData {
  const eraOf = new Map<string, number>();
  (data.overview?.eras ?? []).forEach((e, i) => (e.weeks ?? []).forEach((wk) => eraOf.set(wk, i)));
  const weeks: ChangelogWeekSummary[] = (data.weeks ?? []).map((w) => {
    const sections = w.sections ?? [];
    const items = sections.flatMap((s) => s.items ?? []);
    return {
      week: w.week, repo: w.repo, from: w.from, to: w.to, title: w.title, summary: w.summary,
      highlights: w.highlights ?? [], shots: w.shots ?? [], stats: w.stats,
      daily: dailyCounts(w),
      areas: [...new Set(sections.map((s) => s.area ?? 'diger'))],
      types: [...new Set(items.map((i) => i.type ?? '').filter(Boolean))],
      era: eraOf.get(w.week) ?? -1,
    };
  });
  return { generatedAt: data.generatedAt, totals: data.totals, overview: data.overview, weeks };
}

/** Veride bulunan en yeni qratex commit zamanı (ISO) ve bilinen kısa hash'ler. */
export function knownCommits(data: ChangelogData): { last: string | null; shorts: string[] } {
  let last: string | null = null;
  const shorts: string[] = [];
  for (const w of data.weeks ?? []) {
    for (const c of w.commits ?? []) {
      if ((c.repo ?? 'qratex') !== 'qratex') continue;
      shorts.push(c.short);
      if (!last || new Date(c.date) > new Date(last)) last = c.date;
    }
  }
  return { last: last ?? data.totals.lastDate, shorts };
}
