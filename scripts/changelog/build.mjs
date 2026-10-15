#!/usr/bin/env node
// Değişiklik Günlüğü veri derleyicisi: .wf-tmp/changelog (ham commit + haftalık özetler) → lib/changelog/data.json
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const base = path.join(root, '.wf-tmp', 'changelog');
const readJson = (p, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return fallback; }
};

const index = readJson(path.join(base, 'raw', 'index.json'), []);
const overview = readJson(path.join(base, 'overview.json'), null);
const manifest = readJson(path.join(root, 'public', 'changelog', 'shots', 'manifest.json'), null);
const shots = Array.isArray(manifest?.shots) ? manifest.shots : [];

// Haftalık parçalar
const weeksDir = path.join(base, 'weeks');
const parts = new Map();
if (fs.existsSync(weeksDir)) {
  for (const f of fs.readdirSync(weeksDir).filter((x) => x.endsWith('.json'))) {
    const e = readJson(path.join(weeksDir, f));
    if (!e) { console.warn('[changelog] okunamadı:', f); continue; }
    const wk = e.week || String(e.id || f.replace(/\.json$/, '')).replace(/-p\d+$/, '');
    if (!parts.has(wk)) parts.set(wk, []);
    parts.get(wk).push(e);
  }
}

const arr = (x) => (Array.isArray(x) ? x : []);
const weekIds = new Set([...index.map((w) => w.week), ...parts.keys()]);
const weeks = [];
const repoMap = new Map();
let tc = 0, ta = 0, td = 0, firstDate = null, lastDate = null;

for (const week of weekIds) {
  const meta = index.find((w) => w.week === week) || {};
  const raw = arr(readJson(path.join(base, 'raw', `${week}.json`), []));
  const ps = (parts.get(week) || []).sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
  const p1 = ps[0] || {};
  const commits = raw
    .map((c) => ({
      short: c.short, date: c.date, repo: c.source || 'qratex', author: c.author, subject: c.subject,
      additions: c.additions | 0, deletions: c.deletions | 0,
      areas: Object.keys(c.areas || {}),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const stats = {
    commits: raw.length || meta.commits || 0,
    additions: raw.reduce((s, c) => s + (c.additions | 0), 0) || meta.additions || 0,
    deletions: raw.reduce((s, c) => s + (c.deletions | 0), 0) || meta.deletions || 0,
    files: raw.reduce((s, c) => s + (c.fileCount | 0), 0),
  };
  const dates = raw.map((c) => String(c.date).slice(0, 10)).sort();
  const from = meta.from || p1.from || dates[0] || null;
  const to = meta.to || ps.at(-1)?.to || dates.at(-1) || null;
  // Gün dökümü: parça günlerini birleştir; aynı tarih tekrar ederse sayıları topla
  const dayMap = new Map();
  for (const d of ps.flatMap((p) => arr(p.days))) {
    const prev = dayMap.get(d.date);
    dayMap.set(d.date, prev ? { date: d.date, commits: (prev.commits | 0) + (d.commits | 0), summary: [prev.summary, d.summary].filter(Boolean).join(' ') } : { ...d });
  }
  const uniq = (xs) => [...new Set(xs)];
  const srcCount = new Map();
  for (const c of commits) srcCount.set(c.repo, (srcCount.get(c.repo) || 0) + 1);
  const repo = ps.find((p) => p.repo)?.repo || [...srcCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'qratex';
  for (const c of commits) {
    const r = repoMap.get(c.repo) || { name: c.repo, commits: 0, from: null, to: null };
    r.commits++;
    const d = String(c.date).slice(0, 10);
    if (!r.from || d < r.from) r.from = d;
    if (!r.to || d > r.to) r.to = d;
    repoMap.set(c.repo, r);
  }
  weeks.push({
    week, repo, from, to,
    title: overview?.weekTitles?.[week] || p1.title || week,
    summary: overview?.weekSummaries?.[week] || p1.summary || '',
    highlights: ps.flatMap((p) => arr(p.highlights)),
    sections: ps.flatMap((p) => arr(p.sections)),
    days: [...dayMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    risks: uniq(ps.flatMap((p) => arr(p.risks))),
    keyCommits: uniq(ps.flatMap((p) => arr(p.keyCommits))),
    parts: ps.length > 1 ? ps.map((p) => ({ part: p.part ?? null, from: p.from, to: p.to, title: p.title, summary: p.summary })) : [],
    shots: shots.filter((s) => s.week === week),
    stats,
    commits,
  });
  tc += stats.commits; ta += stats.additions; td += stats.deletions;
  if (from && (!firstDate || from < firstDate)) firstDate = from;
  if (to && (!lastDate || to > lastDate)) lastDate = to;
}

weeks.sort((a, b) => String(b.from ?? b.week).localeCompare(String(a.from ?? a.week)));

const out = {
  generatedAt: new Date().toISOString(),
  totals: { commits: tc, weeks: weeks.length, additions: ta, deletions: td, firstDate, lastDate,
    repos: [...repoMap.values()]
      .sort((a, b) => String(a.from).localeCompare(String(b.from)))
      .map((r) => ({ ...r, url: `https://github.com/d4rkn3m3s1s/${r.name}` })),
  },
  overview,
  weeks,
};
fs.mkdirSync(path.join(root, 'lib', 'changelog'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib', 'changelog', 'data.json'), JSON.stringify(out));

// İstemci için hafta ayrıntısı (bölümler, gün dökümü, riskler, commit listesi) ayrı dosyalarda:
// sayfa yalnız özet gönderir, kart açılınca /changelog/weeks/<hafta>.json isteğe bağlı yüklenir.
const detailDir = path.join(root, 'public', 'changelog', 'weeks');
fs.rmSync(detailDir, { recursive: true, force: true });
fs.mkdirSync(detailDir, { recursive: true });
for (const w of weeks) {
  const detail = { week: w.week, sections: w.sections, days: w.days, risks: w.risks, parts: w.parts, keyCommits: w.keyCommits, commits: w.commits };
  fs.writeFileSync(path.join(detailDir, `${w.week}.json`), JSON.stringify(detail));
}
// Tam metin arama dizini (madde başlıkları + commit mesajları); ilk aramada tembel yüklenir.
const search = Object.fromEntries(weeks.map((w) => [w.week, [
  ...w.risks, ...w.sections.map((s) => s.title), ...w.sections.flatMap((s) => arr(s.items).map((i) => i.title)),
  ...w.commits.map((c) => `${c.short} ${c.subject}`),
].filter(Boolean).join(' | ').toLocaleLowerCase('tr')]));
fs.writeFileSync(path.join(root, 'public', 'changelog', 'search.json'), JSON.stringify(search));
console.log(`[changelog] ${weeks.length} hafta, ${tc} commit → lib/changelog/data.json + public/changelog/weeks/*.json`);
