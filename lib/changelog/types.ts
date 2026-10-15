/** Değişiklik Günlüğü veri sözleşmesi — scripts/changelog/build.mjs üretir (lib/changelog/data.json). */
export type ChangelogArea =
  | 'admin' | 'bayi' | 'musteri' | 'personel' | 'public' | 'api' | 'veritabani' | 'guvenlik' | 'performans'
  | 'tasarim' | 'mobil' | 'altyapi' | 'ai' | 'ekonomi' | 'mail' | 'test' | 'dokuman' | 'diger';
export type ChangelogItemType =
  | 'feature' | 'improvement' | 'fix' | 'security' | 'performance' | 'design' | 'infra' | 'docs' | 'refactor' | 'removal';

export type ChangelogItem = { type?: string; title?: string; detail?: string; commits?: string[] };
export type ChangelogSection = { area?: string; title?: string; items?: ChangelogItem[] };
export type ChangelogDay = { date: string; commits?: number; summary?: string };
export type ChangelogCommit = { short: string; repo?: string; date: string; author?: string; subject: string; additions: number; deletions: number; areas?: string[] };
export type ChangelogShot = { week?: string; date?: string; src: string; caption?: string; url?: string | null };
export type ChangelogPart = { part?: number | null; from?: string; to?: string; title?: string; summary?: string };

export type ChangelogWeek = {
  week: string;
  repo?: string;
  from: string | null;
  to: string | null;
  title: string;
  summary: string;
  highlights: string[];
  sections: ChangelogSection[];
  days: ChangelogDay[];
  risks: string[];
  keyCommits: string[];
  parts?: ChangelogPart[];
  shots?: ChangelogShot[];
  stats: { commits: number; additions: number; deletions: number; files: number };
  commits: ChangelogCommit[];
};

export type ChangelogOverview = {
  headline?: string;
  summary?: string;
  eras?: { name: string; from: string; to: string; summary?: string; weeks?: string[] }[];
  milestones?: { date: string; title: string; detail?: string; commit?: string | null }[];
  weekTitles?: Record<string, string>;
  weekSummaries?: Record<string, string>;
} | null;

export type ChangelogData = {
  generatedAt: string;
  totals: { commits: number; weeks: number; additions: number; deletions: number; firstDate: string | null; lastDate: string | null; repos?: ChangelogRepo[] };
  overview: ChangelogOverview;
  weeks: ChangelogWeek[];
};

export type ChangelogRepo = { name: string; commits: number; from: string | null; to: string | null; url: string };

/** İstemciye giden hafta özeti — ayrıntı (`ChangelogWeekDetail`) /changelog/weeks/<hafta>.json'dan tembel yüklenir. */
export type ChangelogWeekSummary = Omit<ChangelogWeek, 'sections' | 'days' | 'risks' | 'keyCommits' | 'parts' | 'commits'> & {
  /** Pazartesi→Pazar commit sayısı. */
  daily: number[];
  areas: string[];
  types: string[];
  /** overview.eras içindeki dönem sırası; yoksa -1. */
  era: number;
};
export type ChangelogWeekDetail = Pick<ChangelogWeek, 'week' | 'sections' | 'days' | 'risks' | 'keyCommits' | 'parts' | 'commits'>;

export type ChangelogSummaryData = Omit<ChangelogData, 'weeks'> & { weeks: ChangelogWeekSummary[] };

/** Henüz özetlenmemiş canlı commit (GitHub API). */
export type LiveCommit = { sha: string; short: string; date: string; subject: string; author?: string; url: string; week: string };
