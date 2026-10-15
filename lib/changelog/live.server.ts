import 'server-only';
import type { LiveCommit } from './types';

const REPO = 'd4rkn3m3s1s/qratex';

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

type GhCommit = { sha?: string; html_url?: string; commit?: { message?: string; author?: { name?: string; date?: string } | null } };

/**
 * Günlük derlendikten sonra main'e gelen commitler (herkese açık GitHub API, saatlik önbellek).
 * Asla fırlatmaz: ağ/kota/zaman aşımı hatasında boş liste → sayfa ve derleme bozulmaz.
 */
export async function fetchLiveCommits(since: string | null, known: string[]): Promise<LiveCommit[]> {
  if (!since) return [];
  try {
    const sinceIso = new Date(since);
    if (Number.isNaN(sinceIso.getTime())) return [];
    const url = `https://api.github.com/repos/${REPO}/commits?sha=main&since=${encodeURIComponent(sinceIso.toISOString())}&per_page=100`;
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'qratex-changelog' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(url, { headers, next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return [];
    const knownLower = known.map((k) => k.toLowerCase());
    const out: LiveCommit[] = [];
    for (const c of json as GhCommit[]) {
      const sha = typeof c.sha === 'string' ? c.sha.toLowerCase() : '';
      const date = c.commit?.author?.date ?? '';
      if (!sha || !date) continue;
      if (knownLower.some((k) => k && sha.startsWith(k))) continue;
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) continue;
      out.push({
        sha,
        short: sha.slice(0, 8),
        date,
        subject: String(c.commit?.message ?? '').split('\n')[0].slice(0, 300),
        author: c.commit?.author?.name ?? undefined,
        url: typeof c.html_url === 'string' ? c.html_url : `https://github.com/${REPO}/commit/${sha}`,
        week: isoWeek(d),
      });
    }
    return out;
  } catch {
    return [];
  }
}
