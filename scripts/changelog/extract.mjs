// Git geçmişini ISO haftalarına bölüp ham commit verisi üretir (admin "Değişiklik Günlüğü" kaynağı).
// Kullanım: node scripts/changelog/extract.mjs [çıktı-klasörü] [git-dizini] [kaynak-adı]  (varsayılan .wf-tmp/changelog/raw)
// İkinci depo (ör. ön dönem 'sori' = qratex-ui) aynı klasöre eklenir; index birleştirilir.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || '.wf-tmp/changelog/raw';
const gitDir = process.argv[3];
const source = process.argv[4] || 'qratex';
fs.mkdirSync(outDir, { recursive: true });

const SEP = '\x1e';
const FS = '\x1f';
const log = execFileSync(
  'git',
  [...(gitDir ? ['--git-dir', gitDir] : []), 'log', '--all', '--reverse', '--date=iso-strict', '--numstat', `--format=${SEP}%H${FS}%h${FS}%ad${FS}%an${FS}%P${FS}%s${FS}%b${FS}`],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 }
);

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

const AREAS = [
  ['admin', /^app\/admin\/|^app\/api\/admin\//],
  ['bayi', /^app\/dealer\/|^app\/api\/dealer\//],
  ['musteri', /^app\/customer\/|^app\/api\/customer\//],
  ['personel', /^app\/staff\//],
  ['public', /^app\/\(public\)\/|^components\/landing\//],
  ['api', /^app\/api\//],
  ['veritabani', /^prisma\//],
  ['tasarim', /\.css$|^components\/ui\/|^tailwind/],
  ['test', /^__tests__\/|^e2e\/|\.test\.|\.spec\./],
  ['dokuman', /^docs\/|\.md$/],
  ['ci-altyapi', /^\.github\/|^scripts\/|next\.config|package\.json|vercel/],
  ['mobil', /^ios\/|^android\/|^native-shell\/|capacitor/],
  ['lib', /^lib\//],
  ['bilesen', /^components\//],
];

const commits = [];
for (const chunk of log.split(SEP).slice(1)) {
  const parts = chunk.split(FS);
  const [hash, short, date, author, parents, subject, body] = parts;
  const files = [];
  for (const line of (parts[7] || '').split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (m) files.push({ path: m[3], add: m[1] === '-' ? 0 : +m[1], del: m[2] === '-' ? 0 : +m[2] });
  }
  const areas = {};
  for (const f of files) {
    const a = AREAS.find(([, re]) => re.test(f.path));
    const k = a ? a[0] : 'diger';
    areas[k] = (areas[k] || 0) + 1;
  }
  commits.push({
    source, hash, short, date, author, merge: parents.trim().split(' ').length > 1,
    subject: subject.trim(), body: body.trim().slice(0, 4000),
    week: isoWeek(new Date(date)),
    additions: files.reduce((s, f) => s + f.add, 0),
    deletions: files.reduce((s, f) => s + f.del, 0),
    fileCount: files.length, areas,
    files: files.slice(0, 60).map((f) => f.path),
  });
}

const weeks = {};
for (const c of commits) (weeks[c.week] ||= []).push(c);
const prev = fs.existsSync(path.join(outDir, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8')) : [];
const index = Object.entries(weeks).map(([week, cs]) => ({
  week, source, commits: cs.length, from: cs[0].date.slice(0, 10), to: cs.at(-1).date.slice(0, 10),
  additions: cs.reduce((s, c) => s + c.additions, 0), deletions: cs.reduce((s, c) => s + c.deletions, 0),
}));
// Aynı haftada başka kaynağın (ör. erken 'we'/'sori' deposu) commitleri varsa korunur; yalnız bu kaynağınkiler yenilenir.
for (const [week, cs] of Object.entries(weeks)) {
  const file = path.join(outDir, `${week}.json`);
  let others = [];
  try { others = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).filter((c) => (c.source || 'qratex') !== source); } catch { /* yeni hafta */ }
  fs.writeFileSync(file, JSON.stringify([...others, ...cs], null, 1));
}
const merged = [...prev.filter((p) => (p.source || 'qratex') !== source), ...index].sort((a, b) => a.from.localeCompare(b.from));
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(merged, null, 1));
console.log(`${commits.length} commit, ${index.length} hafta → ${outDir}`);
