#!/usr/bin/env node
/**
 * Kalite kapıları — tek komutla ölç, docs/quality/GATES.md üret.
 *
 *   node scripts/quality-gates.mjs            # hepsi
 *   GATES_SKIP=jest,lighthouse node scripts/quality-gates.mjs   # bazılarını atla
 *
 * YALNIZ localhost'a koşar ve DB'ye yazan akışları ÇALIŞTIRMAZ (e2e/gates/flows.spec.ts
 * E2E_WRITE=1 ister). Ön koşul: http://localhost:3000'de çalışan uygulama (next dev).
 *
 * Lighthouse dev sunucusunda yanıltıcıdır: üretim derlemesi AYRI klasöre (NEXT_DIST_DIR=.next-gates,
 * next.config.js destekler) alınır ve 3100 portunda `next start` ile ölçülür; dev sunucusunun
 * .next'i ezilmez. Next derlemesi tsconfig.json / next-env.d.ts'e dağıtım klasörü türlerini
 * eklediği için ikisi derleme sonrası eski hâline döndürülür.
 *
 * Kapılar: tsc 0 · jest %100 · e2e %100 · konsol hatası 0 · başarısız istek 0 · axe kritik+ciddi 0 ·
 * Lighthouse (mobil) perf ≥90, a11y ≥95, best-practices ≥95, SEO ≥95 (public) · LCP <2.5 sn ·
 * CLS <0.1 · yatay taşma 0 · <44px dokunma hedefi 0 · kontrast ihlali 0 ·
 * /feedback/[code] JS ≤150 KB (sıkıştırılmış aktarım) · npm audit kritik 0.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'test-results', 'gates');
const RECORDS = path.join(OUT_DIR, 'routes');
const DEV_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const LH_PORT = 3100;
const LH_URL = `http://localhost:${LH_PORT}`;
const DIST = '.next-gates';
const SKIP = new Set((process.env.GATES_SKIP ?? '').split(',').filter(Boolean));
const IS_WIN = process.platform === 'win32';

for (const u of [DEV_URL, LH_URL]) {
  const host = new URL(u).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`Kalite kapısı yalnız localhost'a koşar: ${u}`);
}

const log = (...a) => console.log('[gates]', ...a);
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(RECORDS, { recursive: true });

function run(cmd, args, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: IS_WIN,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    ...opts,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  log(`${cmd} ${args.join(' ')} → çıkış ${r.status} (${Math.round((Date.now() - t0) / 1000)} sn)`);
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** @type {Array<{name:string,target:string,measured:string,pass:boolean|null,detail:string[]}>} */
const gates = [];
const gate = (name, target, measured, pass, detail = []) => gates.push({ name, target, measured: String(measured), pass, detail });
const skipped = (name, target, why) => gate(name, target, 'ölçülmedi', null, [why]);

// ── 1. tsc ────────────────────────────────────────────────────────────────────
if (!SKIP.has('tsc')) {
  const r = run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']);
  const errs = r.out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
  gate('TypeScript (tsc)', '0 hata', `${errs.length} hata`, errs.length === 0 && r.code === 0, errs.slice(0, 15));
} else skipped('TypeScript (tsc)', '0 hata', 'GATES_SKIP');

// ── 2. jest ───────────────────────────────────────────────────────────────────
if (!SKIP.has('jest')) {
  const jf = path.join(OUT_DIR, 'jest.json');
  run('npx', ['jest', '--ci', '--silent', '--json', `--outputFile=${jf}`]);
  if (fs.existsSync(jf)) {
    const j = JSON.parse(fs.readFileSync(jf, 'utf8'));
    const failedSuites = j.testResults.filter((s) => s.status !== 'passed');
    const pct = j.numTotalTests ? ((j.numPassedTests / j.numTotalTests) * 100).toFixed(2) : '0';
    gate(
      'Jest birim/entegrasyon',
      '%100 geçer',
      `%${pct} (${j.numPassedTests}/${j.numTotalTests}; ${j.numFailedTestSuites} suite kırık)`,
      j.numFailedTests === 0 && j.numRuntimeErrorTestSuites === 0 && j.numFailedTestSuites === 0,
      failedSuites.slice(0, 15).map((s) => `${path.relative(ROOT, s.name)} — ${(s.message || '').split('\n').find((l) => l.trim()) ?? ''}`.slice(0, 220))
    );
  } else gate('Jest birim/entegrasyon', '%100 geçer', 'çalışmadı', false, ['jest JSON çıktısı üretilmedi']);
} else skipped('Jest birim/entegrasyon', '%100 geçer', 'GATES_SKIP');

// ── 3. e2e (salt-okur) + rota taraması ────────────────────────────────────────
let records = [];
if (!SKIP.has('e2e')) {
  const pf = path.join(OUT_DIR, 'playwright.json');
  // --output: Playwright çıktı klasörünü (varsayılan test-results/) koşu başında SİLER; ayrı alt
  // klasör verilmezse test-results/gates (jest.json, rota kayıtları) da silinir.
  run('npx', ['playwright', 'test', '--project=gates', '--reporter=json', '--workers=3', '--output=test-results/pw-gates'], {
    env: { GATES_OUT: RECORDS, PLAYWRIGHT_JSON_OUTPUT_NAME: pf, E2E_WRITE: '' },
  });
  if (fs.existsSync(pf)) {
    const p = JSON.parse(fs.readFileSync(pf, 'utf8'));
    const failed = [];
    const walk = (suite, trail) => {
      for (const s of suite.suites ?? []) walk(s, [...trail, s.title]);
      for (const sp of suite.specs ?? [])
        for (const t of sp.tests ?? []) {
          const last = t.results?.[t.results.length - 1];
          if (t.status === 'unexpected' || t.status === 'flaky')
            failed.push(`${sp.title} — ${(last?.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 160)}`);
        }
    };
    walk(p, []);
    const st = p.stats ?? {};
    const ran = (st.expected ?? 0) + (st.unexpected ?? 0) + (st.flaky ?? 0);
    const pct = ran ? (((st.expected ?? 0) / ran) * 100).toFixed(1) : '0';
    gate(
      'E2E (Playwright, salt-okur)',
      '%100 geçer',
      `%${pct} (${st.expected ?? 0}/${ran}; ${st.skipped ?? 0} atlandı — DB yazan akışlar E2E_WRITE=1 ister)`,
      ran > 0 && (st.unexpected ?? 0) === 0 && (st.flaky ?? 0) === 0,
      failed.slice(0, 40)
    );
  } else gate('E2E (Playwright, salt-okur)', '%100 geçer', 'çalışmadı', false, ['Playwright JSON çıktısı üretilmedi']);

  records = fs.readdirSync(RECORDS).map((f) => JSON.parse(fs.readFileSync(path.join(RECORDS, f), 'utf8')));
  const tag = (r) => `${r.role} ${r.route}`;
  const sumGate = (name, target, pick, fmt) => {
    const bad = records.filter((r) => pick(r).length > 0);
    const total = records.reduce((n, r) => n + pick(r).length, 0);
    // 0 rota ölçüldüyse (giriş kurulumu düştü vb.) "0 ihlal" YEŞİL sayılmaz: ölçülmedi.
    if (records.length === 0) return skipped(name, target, 'rota kaydı yok (giriş kurulumu / e2e düştü)');
    gate(name, target, `${total} (${bad.length}/${records.length} rota)`, total === 0, bad.slice(0, 40).map((r) => `${tag(r)}: ${fmt(pick(r))}`));
  };
  const head = (arr, n = 3) => arr.slice(0, n).join(' · ') + (arr.length > n ? ` (+${arr.length - n})` : '');
  sumGate('Konsol hatası', '0', (r) => r.consoleErrors, (a) => head(a, 2));
  sumGate('Başarısız istek', '0', (r) => r.failedRequests, (a) => head(a, 2));
  sumGate(
    'axe kritik + ciddi',
    '0',
    (r) => r.axe.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    (a) => a.map((v) => `${v.id}[${v.impact}]×${v.nodes} ${v.targets[0] ?? ''}`).join(' · ')
  );
  {
    const bad = records.filter((r) => r.overflowPx > 1);
    if (records.length === 0) skipped('Yatay taşma (412px)', '0 rota', 'rota kaydı yok (giriş kurulumu / e2e düştü)');
    else gate('Yatay taşma (412px)', '0 rota', `${bad.length} rota`, bad.length === 0, bad.map((r) => `${tag(r)}: +${r.overflowPx}px`));
  }
  sumGate('Dokunma hedefi <44px', '0', (r) => r.smallTargets, (a) => head(a));
  sumGate('Kontrast ihlali (AA)', '0', (r) => r.lowContrast, (a) => head(a));
} else {
  for (const g of ['E2E (Playwright, salt-okur)', 'Konsol hatası', 'Başarısız istek', 'axe kritik + ciddi', 'Yatay taşma (412px)', 'Dokunma hedefi <44px', 'Kontrast ihlali (AA)'])
    skipped(g, '0', 'GATES_SKIP');
}

// ── 4. Lighthouse (üretim derlemesi, mobil) ───────────────────────────────────
const LH_ROUTES = [
  ['/', null],
  ['/auth/login', null],
  ['/auth/register', null],
  ['/neden-qratex', null],
  ['/guven', null],
  ['/blog', null],
  ['/feedback/DEMO-CAFE-002', null],
  ['/customer', 'customer'],
  ['/customer/wallet/card', 'customer'],
  ['/customer/games', 'customer'],
  ['/dealer', 'dealer'],
  ['/admin', 'admin'],
];

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function cookieHeader(role) {
  const f = path.join(ROOT, 'test-results', '.auth', `${role}.json`);
  if (!fs.existsSync(f)) return null;
  const st = JSON.parse(fs.readFileSync(f, 'utf8'));
  return st.cookies.filter((c) => c.domain === 'localhost').map((c) => `${c.name}=${c.value}`).join('; ');
}

if (!SKIP.has('lighthouse')) {
  const keep = ['tsconfig.json', 'next-env.d.ts'].map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f)) : null]);
  const build = run('npx', ['next', 'build', '--webpack'], { env: { NEXT_DIST_DIR: DIST, DISABLE_SENTRY_BUILD: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=8192`.trim() } });
  for (const [f, buf] of keep) if (buf) fs.writeFileSync(path.join(ROOT, f), buf);
  fs.writeFileSync(path.join(OUT_DIR, 'build.log'), build.out);
  if (build.code !== 0) {
    gate('Üretim derlemesi (Lighthouse ön koşulu)', 'başarılı', 'BAŞARISIZ', false, build.out.split(/\r?\n/).filter((l) => /error|Error/.test(l)).slice(0, 15));
  } else {
    run('node', ['scripts/ensure-edge-instrumentation.js'], { env: { NEXT_DIST_DIR: DIST } });
    const server = spawn('npx', ['next', 'start', '-p', String(LH_PORT)], {
      cwd: ROOT,
      shell: IS_WIN,
      env: { ...process.env, NEXT_DIST_DIR: DIST, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const srvLog = fs.createWriteStream(path.join(OUT_DIR, 'next-start.log'));
    server.stdout.pipe(srvLog);
    server.stderr.pipe(srvLog);
    const stop = () => {
      if (IS_WIN) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']);
      else server.kill('SIGTERM');
    };
    try {
      if (!(await waitFor(`${LH_URL}/api/health`, 180_000))) throw new Error('next start 3100 ayağa kalkmadı');
      const { default: lighthouse } = await import('lighthouse');
      const chromeLauncher = await import('chrome-launcher');
      const { devices } = await import('playwright');
      const ua = devices['Pixel 7'].userAgent; // oturum belirteci UA'ya bağlı (lib/token-replay.ts)
      const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
      const rows = [];
      try {
        for (const [route, role] of LH_ROUTES) {
          // Isınma: ilk istek derleme/önbellek maliyetini ölçüme taşımasın.
          await fetch(LH_URL + route, { headers: role ? { cookie: cookieHeader(role) ?? '', 'user-agent': ua } : {} }).catch(() => {});
          const cookie = role ? cookieHeader(role) : null;
          const res = await lighthouse(
            LH_URL + route,
            { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}) },
            { extends: 'lighthouse:default', settings: { formFactor: 'mobile', emulatedUserAgent: ua } }
          );
          const lhr = res.lhr;
          const sc = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
          const scripts = (lhr.audits['network-requests']?.details?.items ?? []).filter((i) => i.resourceType === 'Script');
          rows.push({
            route,
            role,
            finalUrl: lhr.finalDisplayedUrl,
            perf: sc('performance'),
            a11y: sc('accessibility'),
            bp: sc('best-practices'),
            seo: sc('seo'),
            lcp: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
            cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? null,
            tbt: lhr.audits['total-blocking-time']?.numericValue ?? null,
            jsKB: Math.round(scripts.reduce((n, i) => n + (i.transferSize ?? 0), 0) / 1024),
            error: lhr.runtimeError?.message ?? null,
          });
          log(`lighthouse ${route}`, JSON.stringify(rows[rows.length - 1]));
        }
      } finally {
        await chrome.kill();
      }
      fs.writeFileSync(path.join(OUT_DIR, 'lighthouse.json'), JSON.stringify(rows, null, 1));
      // Oturumlu rota girişe yönlendiyse ölçülen sayfa giriş ekranıdır — kapıya sayılmaz, ayrıca raporlanır.
      const lost = rows.filter((r) => r.role && /\/auth\/login/.test(r.finalUrl));
      if (lost.length)
        gate('Lighthouse oturum aktarımı', 'oturumlu rotalar ölçülür', `${lost.length} rota girişe yönlendi`, false, lost.map((r) => `${r.route} → ${r.finalUrl}`));
      for (const r of lost) rows.splice(rows.indexOf(r), 1);
      const fmt = (r) => `${r.route}${r.role ? ` (${r.role})` : ''}`;
      const scoreGate = (name, key, min, filter = () => true) => {
        const set = rows.filter(filter);
        const bad = set.filter((r) => r[key] < min);
        const minV = Math.min(...set.map((r) => r[key]));
        gate(name, `≥${min} (her rota)`, `en düşük ${minV}; ${bad.length}/${set.length} rota altında`, bad.length === 0, bad.map((r) => `${fmt(r)}: ${r[key]}`));
      };
      scoreGate('Lighthouse performans (mobil)', 'perf', 90);
      scoreGate('Lighthouse erişilebilirlik', 'a11y', 95);
      scoreGate('Lighthouse en iyi uygulamalar', 'bp', 95);
      scoreGate('Lighthouse SEO (public)', 'seo', 95, (r) => !r.role);
      {
        const bad = rows.filter((r) => r.lcp == null || r.lcp >= 2500);
        gate('LCP (mobil)', '<2.5 sn', `en kötü ${(Math.max(...rows.map((r) => r.lcp ?? 0)) / 1000).toFixed(2)} sn`, bad.length === 0, bad.map((r) => `${fmt(r)}: ${((r.lcp ?? 0) / 1000).toFixed(2)} sn`));
      }
      {
        const bad = rows.filter((r) => r.cls == null || r.cls >= 0.1);
        gate('CLS', '<0.1', `en kötü ${Math.max(...rows.map((r) => r.cls ?? 0)).toFixed(3)}`, bad.length === 0, bad.map((r) => `${fmt(r)}: ${(r.cls ?? 0).toFixed(3)}`));
      }
      {
        const worst = Math.max(...rows.map((r) => r.tbt ?? 0));
        gate('TBT (bilgi)', 'raporlanır (<200 ms iyi)', `en kötü ${Math.round(worst)} ms`, null, rows.map((r) => `${fmt(r)}: ${Math.round(r.tbt ?? 0)} ms`));
      }
      {
        const fb = rows.find((r) => r.route.startsWith('/feedback/'));
        gate('/feedback/[code] JS (sıkıştırılmış)', '≤150 KB', fb ? `${fb.jsKB} KB` : 'ölçülmedi', fb ? fb.jsKB <= 150 : false);
      }
      fs.writeFileSync(path.join(OUT_DIR, 'lighthouse-table.md'), rows.map((r) => `| ${fmt(r)} | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${((r.lcp ?? 0) / 1000).toFixed(2)} | ${(r.cls ?? 0).toFixed(3)} | ${Math.round(r.tbt ?? 0)} | ${r.jsKB} |`).join('\n'));
    } catch (e) {
      gate('Lighthouse', 'ölçüm', 'BAŞARISIZ', false, [String(e?.message ?? e).slice(0, 300)]);
    } finally {
      stop();
    }
  }
} else {
  for (const g of ['Lighthouse performans (mobil)', 'Lighthouse erişilebilirlik', 'Lighthouse en iyi uygulamalar', 'Lighthouse SEO (public)', 'LCP (mobil)', 'CLS', '/feedback/[code] JS (sıkıştırılmış)'])
    skipped(g, '—', 'GATES_SKIP');
}

// ── 5. npm audit ──────────────────────────────────────────────────────────────
if (!SKIP.has('audit')) {
  const r = run('npm', ['audit', '--json', '--omit=dev']);
  let crit = null;
  let detail = [];
  try {
    const j = JSON.parse(r.out.slice(r.out.indexOf('{')));
    crit = j.metadata?.vulnerabilities?.critical ?? 0;
    detail = Object.values(j.vulnerabilities ?? {})
      .filter((v) => v.severity === 'critical')
      .map((v) => `${v.name} (${v.range})`);
    const m = j.metadata?.vulnerabilities ?? {};
    detail.push(`özet: kritik ${m.critical ?? 0}, yüksek ${m.high ?? 0}, orta ${m.moderate ?? 0}, düşük ${m.low ?? 0} (yalnız üretim bağımlılıkları)`);
  } catch {
    detail = ['npm audit çıktısı okunamadı (ağ?)'];
  }
  gate('npm audit (üretim) kritik', '0', crit ?? 'ölçülemedi', crit === 0, detail);
} else skipped('npm audit (üretim) kritik', '0', 'GATES_SKIP');

// ── GATES.md ──────────────────────────────────────────────────────────────────
const status = (p) => (p === true ? 'YEŞİL' : p === false ? 'KIRMIZI' : 'BİLGİ');
const commit = run('git', ['rev-parse', '--short', 'HEAD']).out.trim();
const green = gates.filter((g) => g.pass === true).length;
const red = gates.filter((g) => g.pass === false).length;
const lhTable = fs.existsSync(path.join(OUT_DIR, 'lighthouse-table.md')) ? fs.readFileSync(path.join(OUT_DIR, 'lighthouse-table.md'), 'utf8') : '';
const md = [
  '# Kalite kapıları',
  '',
  `Üretim: \`node scripts/quality-gates.mjs\` · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · commit \`${commit}\``,
  '',
  `**Özet:** ${green} YEŞİL · ${red} KIRMIZI · ${gates.length - green - red} bilgi/atlandı`,
  '',
  'Ortam: e2e/tarama `next dev` (localhost:3000, Pixel 7 profili, 4 rol); Lighthouse üretim derlemesi',
  '(`NEXT_DIST_DIR=.next-gates`, `next start -p 3100`, mobil profil). DB yazan akışlar bu turda koşmaz',
  '(`E2E_WRITE=1 npx playwright test --project=gates e2e/gates/flows.spec.ts`).',
  '',
  '| Kapı | Hedef | Ölçülen | Durum |',
  '| --- | --- | --- | --- |',
  ...gates.map((g) => `| ${g.name} | ${g.target} | ${g.measured} | **${status(g.pass)}** |`),
  '',
  ...(lhTable
    ? ['## Lighthouse (mobil, üretim derlemesi)', '', '| Rota | Perf | A11y | BP | SEO | LCP sn | CLS | TBT ms | JS KB |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', lhTable, '']
    : []),
  '## Kırmızı kapıların ayrıntısı',
  '',
  ...gates
    .filter((g) => g.pass === false && g.detail.length)
    .flatMap((g) => [`### ${g.name}`, '', ...g.detail.map((d) => `- ${d.replace(/\|/g, '\\|')}`), '']),
  '## Bilgi',
  '',
  ...gates.filter((g) => g.pass === null).flatMap((g) => [`### ${g.name}`, '', ...g.detail.map((d) => `- ${d}`), '']),
].join('\n');
fs.mkdirSync(path.join(ROOT, 'docs', 'quality'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'quality', 'GATES.md'), md);
log(`docs/quality/GATES.md yazıldı — ${green} yeşil, ${red} kırmızı`);
process.exit(red ? 1 : 0);
