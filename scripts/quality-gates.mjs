#!/usr/bin/env node
/**
 * Kalite kapıları — tek komutla ölç, docs/quality/GATES.md üret.
 *
 *   node scripts/quality-gates.mjs            # hepsi
 *   GATES_SKIP=jest,lighthouse node scripts/quality-gates.mjs   # bazılarını atla
 *
 * YALNIZ localhost'a koşar ve DB'ye yazan akışları ÇALIŞTIRMAZ (e2e/gates/flows.spec.ts
 * E2E_WRITE=1 ister). e2e de Lighthouse ile aynı üretim derlemesine (3100) karşı koşar;
 * GATES_E2E_DEV=1 ile http://localhost:3000'deki next dev'e karşı.
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
const LH_PORT = Number(process.env.GATES_LH_PORT ?? 3100);
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
// Varsayılan: ÜRETİM derlemesine (3100, .next-gates — Lighthouse ile aynı sunucu) karşı koşar.
// Dev sunucusunda bayi/admin rotalarının ilk derlemesi 120 sn'yi aşıp zaman aşımı/ERR_CONNECTION_RESET
// üretiyordu (ölçülen: 23/29 başarısızlık) — kapı ürünü değil dev derleyicisini ölçüyordu.
// GATES_E2E_DEV=1: eski davranış (3000'deki next dev).
const E2E_DEV = process.env.GATES_E2E_DEV === '1';

/** Uzun süren alt süreç — spawnSync olay döngüsünü kilitler, açık `next start` borusu dolup sunucu donar. */
function runAsync(cmd, args, opts = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, shell: IS_WIN, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(opts.env ?? {}) } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      log(`${cmd} ${args.join(' ')} → çıkış ${code} (${Math.round((Date.now() - t0) / 1000)} sn)`);
      resolve({ code, out });
    });
  });
}

let records = [];
async function runE2e(baseUrl) {
  const pf = path.join(OUT_DIR, 'playwright.json');
  // --output: Playwright çıktı klasörünü (varsayılan test-results/) koşu başında SİLER; ayrı alt
  // klasör verilmezse test-results/gates (jest.json, rota kayıtları) da silinir.
  const pw = await runAsync('npx', ['playwright', 'test', '--project=gates', '--reporter=json', '--workers=3', '--output=test-results/pw-gates'], {
    env: { GATES_OUT: RECORDS, PLAYWRIGHT_JSON_OUTPUT_NAME: pf, E2E_WRITE: '', PLAYWRIGHT_BASE_URL: baseUrl },
  });
  fs.writeFileSync(path.join(OUT_DIR, 'playwright.log'), pw.out);
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
}
const E2E_GATES = ['E2E (Playwright, salt-okur)', 'Konsol hatası', 'Başarısız istek', 'axe kritik + ciddi', 'Yatay taşma (412px)', 'Dokunma hedefi <44px', 'Kontrast ihlali (AA)'];
if (SKIP.has('e2e')) for (const g of E2E_GATES) skipped(g, '0', 'GATES_SKIP');
else if (E2E_DEV) await runE2e(DEV_URL);

// ── 4. Lighthouse (üretim derlemesi, mobil) ───────────────────────────────────
const LH_ROUTES_ALL = [
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
// GATES_LH_ROUTES=/a,/b: yalnız bu rotaları ölç (hedefli doğrulama; GATES.md yazılmaz).
const LH_ONLY = (process.env.GATES_LH_ROUTES ?? '').split(',').filter(Boolean);
// SEO kapısı yalnız DİZİNLENEN public rotalara uygulanır. /feedback/[code] bilerek `noindex`
// (QR hunisi, arama sonucu değil); Lighthouse onu "taranamaz" saymalı ama Next'in akışlı
// metadata'sı (loading.tsx sınırı → etiketler <body>'de) yüzünden SEO puanı rastgele çıkar.
const LH_NOINDEX = new Set(['/feedback/DEMO-CAFE-002']);
const LH_ROUTES = LH_ONLY.length ? LH_ROUTES_ALL.filter(([r]) => LH_ONLY.includes(r)) : LH_ROUTES_ALL;

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

// Oturum ÜRETİM sunucusunun (3100) kendisine karşı açılır: 3000'deki dev oturumunun çerezi/
// callbackUrl'i 3100'de geçerli değildir (farklı köken, AUTH_URL 3000'i gösterir). Giriş akışı
// e2e/support/accounts.ts createState ile aynıdır (Pixel 7 profili — belirteç UA'ya bağlı).
const ACCOUNTS = {
  admin: { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@qratex.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!', home: '/admin' },
  dealer: { email: process.env.E2E_DEALER_EMAIL ?? 'dealer@qratex.com', password: process.env.E2E_DEALER_PASSWORD ?? 'Dealer123!', home: '/dealer' },
  customer: { email: process.env.E2E_CUSTOMER_EMAIL ?? 'customer@qratex.com', password: process.env.E2E_CUSTOMER_PASSWORD ?? 'Customer123!', home: '/customer' },
};
const lhCookies = new Map();

async function loginOnLh(chromium, device, role) {
  const acc = ACCOUNTS[role];
  // Service worker istekleri bağlam UA'sını değil tarayıcının gerçek UA'sını taşır → token-replay
  // "farklı tarayıcı" görüp oturumu iptal eder. UA tarayıcı düzeyinde sabitlenir.
  const browser = await chromium.launch({ headless: true, args: [`--user-agent=${device.userAgent}`] });
  try {
    const context = await browser.newContext({ ...device, baseURL: LH_URL });
    const page = await context.newPage();
    // Kök neden (ölçüldü): form React hidrate olmadan doldurulup Enter'a basılınca yerel HTML
    // gönderimi çalışıyor → GET /auth/login?email=…&password=… (oturum yok, şifre URL'de) ve
    // 90 sn sonra düşüyordu (customer + admin; dealer yalnız sunucu ısındığı için şans eseri geçti).
    // Hidrasyon işareti: istemcinin kendi GET /api/auth/session çağrısı. Bekle, sonra dene; olmazsa yinele.
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const hydrated = page
        .waitForResponse((r) => r.url().includes('/api/auth/session'), { timeout: 60_000 })
        .catch(() => null);
      await page.goto(`/auth/login?callbackUrl=${encodeURIComponent(acc.home)}`, { waitUntil: 'load', timeout: 120_000 });
      await hydrated;
      const reject = page.getByRole('button', { name: /tümünü reddet/i }).first();
      if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => {});
      await page.locator('input[type=email],input[name=email]').first().fill(acc.email);
      await page.locator('input[type=password]').first().fill(acc.password);
      await page.locator('input[type=password]').first().press('Enter');
      ok = await page
        .waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!ok) throw new Error(`giriş tamamlanmadı (${new URL(page.url()).pathname})`);
    if (role === 'admin') {
      // Kapı sayfasında da aynı hidrasyon sorunu: sayfanın GET /api/admin/gate çağrısını bekle,
      // POST yanıtını (HMAC çerezi) doğrula.
      const gateHydrated = page
        .waitForResponse((r) => r.url().includes('/api/admin/gate') && r.request().method() === 'GET', { timeout: 60_000 })
        .catch(() => null);
      if (!page.url().includes('/admin-gate')) await page.goto('/admin-gate', { waitUntil: 'load', timeout: 120_000 });
      if (page.url().includes('/admin-gate')) {
        await gateHydrated;
        const input = page.locator('input').first();
        await input.waitFor({ state: 'visible', timeout: 30_000 });
        const reject = page.getByRole('button', { name: /tümünü reddet/i }).first();
        if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => {});
        let passed = false;
        for (let attempt = 0; attempt < 3 && !passed; attempt++) {
          await input.focus();
          const post = page
            .waitForResponse((r) => r.url().includes('/api/admin/gate') && r.request().method() === 'POST', { timeout: 30_000 })
            .catch(() => null);
          await page.keyboard.type(process.env.E2E_ADMIN_GATE ?? '7', { delay: 80 });
          await page.keyboard.press('Enter');
          const res = await post;
          if (res && res.ok()) passed = true;
          else if (res && res.status() !== 400) throw new Error(`admin-gate POST ${res.status()}`);
        }
        if (!passed) throw new Error('admin-gate: kapı cevabı gönderilemedi');
        await page.waitForURL((u) => !u.pathname.startsWith('/admin-gate'), { timeout: 60_000, waitUntil: 'commit' }).catch(() => {});
      }
    }
    const cookies = await context.cookies(LH_URL);
    lhCookies.set(role, cookies);
    log(`lighthouse oturum ${role}`, `${new URL(page.url()).pathname} (${cookies.map((c) => c.name).join(', ')})`);
  } catch (e) {
    log(`lighthouse oturum ${role}`, `BAŞARISIZ: ${e.message}`);
  } finally {
    await browser.close();
  }
}

function cookieHeader(role) {
  const c = lhCookies.get(role);
  return c ? c.map((x) => `${x.name}=${x.value}`).join('; ') : null;
}

const LH_GATES = ['Lighthouse performans (mobil)', 'Lighthouse erişilebilirlik', 'Lighthouse en iyi uygulamalar', 'Lighthouse SEO (public)', 'LCP (mobil)', 'CLS', '/feedback/[code] JS (sıkıştırılmış)'];
const E2E_ON_PROD = !SKIP.has('e2e') && !E2E_DEV;
const LH_SKIPPED = Symbol('lighthouse-skipped');
if (!SKIP.has('lighthouse') || E2E_ON_PROD) {
  const keep = ['tsconfig.json', 'next-env.d.ts'].map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f)) : null]);
  // GATES_LH_REUSE_BUILD=1: mevcut .next-gates derlemesini yeniden kullan (yalnız ölçüm hattını denerken).
  const reuse = process.env.GATES_LH_REUSE_BUILD === '1' && fs.existsSync(path.join(ROOT, DIST, 'BUILD_ID'));
  const build = reuse ? { code: 0, out: 'GATES_LH_REUSE_BUILD: derleme atlandı' } : run('npx', ['next', 'build', '--webpack'], { env: { NEXT_DIST_DIR: DIST, DISABLE_SENTRY_BUILD: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=8192`.trim() } });
  for (const [f, buf] of keep) if (buf) fs.writeFileSync(path.join(ROOT, f), buf);
  fs.writeFileSync(path.join(OUT_DIR, 'build.log'), build.out);
  if (build.code !== 0) {
    gate('Üretim derlemesi (e2e + Lighthouse ön koşulu)', 'başarılı', 'BAŞARISIZ', false, build.out.split(/\r?\n/).filter((l) => /error|Error/.test(l)).slice(0, 15));
    if (E2E_ON_PROD) for (const g of E2E_GATES) gate(g, '—', 'ölçülmedi', false, ['üretim derlemesi başarısız']);
  } else {
    run('node', ['scripts/ensure-edge-instrumentation.js'], { env: { NEXT_DIST_DIR: DIST } });
    const server = spawn('npx', ['next', 'start', '-p', String(LH_PORT)], {
      cwd: ROOT,
      shell: IS_WIN,
      env: { ...process.env, NEXT_DIST_DIR: DIST, NODE_ENV: 'production', AUTH_URL: LH_URL, NEXTAUTH_URL: LH_URL, AUTH_TRUST_HOST: 'true' },
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
      if (E2E_ON_PROD) await runE2e(LH_URL);
      if (SKIP.has('lighthouse')) throw LH_SKIPPED;
      const { default: lighthouse } = await import('lighthouse');
      const chromeLauncher = await import('chrome-launcher');
      const { devices, chromium } = await import('playwright');
      const ua = devices['Pixel 7'].userAgent; // oturum belirteci UA'ya bağlı (lib/token-replay.ts)
      for (const role of new Set(LH_ROUTES.map(([, r]) => r).filter(Boolean))) await loginOnLh(chromium, devices['Pixel 7'], role);
      const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', `--user-agent=${ua}`] });
      // Lighthouse `extraHeaders: Cookie` istemci tarafı istekleri/yönlendirmeyi taşımıyor: oturum çerezi
      // Chrome'un kendi çerez kavanozuna CDP ile yazılır, depolama sıfırlaması kapatılır.
      const cdp = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
      const jar = cdp.contexts()[0];
      const rows = [];
      try {
        for (const [route, role] of LH_ROUTES) {
          await jar.clearCookies();
          if (role && lhCookies.get(role)) await jar.addCookies(lhCookies.get(role));
          // Isınma: ilk istek derleme/önbellek maliyetini ölçüme taşımasın.
          await fetch(LH_URL + route, { headers: role ? { cookie: cookieHeader(role) ?? '', 'user-agent': ua } : {} }).catch(() => {});
          const res = await lighthouse(
            LH_URL + route,
            { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], disableStorageReset: true },
            { extends: 'lighthouse:default', settings: { formFactor: 'mobile', emulatedUserAgent: ua, disableStorageReset: true } }
          );
          // Sayfa oturumu yenilemiş olabilir (döndürülen belirteç); sıradaki rota güncel çerezle girsin.
          if (role) lhCookies.set(role, await jar.cookies(LH_URL));
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
            lcpEl: lhr.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.selector ?? null,
          });
          log(`lighthouse ${route}`, JSON.stringify(rows[rows.length - 1]));
        }
      } finally {
        await cdp.close().catch(() => {});
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
      scoreGate('Lighthouse SEO (public)', 'seo', 95, (r) => !r.role && !LH_NOINDEX.has(r.route));
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
      if (e === LH_SKIPPED) for (const g of LH_GATES) skipped(g, '—', 'GATES_SKIP');
      else gate('Lighthouse', 'ölçüm', 'BAŞARISIZ', false, [String(e?.message ?? e).slice(0, 300)]);
    } finally {
      stop();
    }
  }
} else {
  for (const g of LH_GATES)
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
  E2E_DEV
    ? 'Ortam: e2e/tarama `next dev` (localhost:3000, GATES_E2E_DEV=1, Pixel 7 profili, 4 rol); Lighthouse üretim derlemesi'
    : 'Ortam: e2e/tarama VE Lighthouse aynı üretim derlemesine karşı (Pixel 7 profili, 4 rol):',
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
if (LH_ONLY.length) log(`GATES_LH_ROUTES: kısmi ölçüm, GATES.md yazılmadı — ${green} yeşil, ${red} kırmızı`);
else {
  fs.writeFileSync(path.join(ROOT, 'docs', 'quality', 'GATES.md'), md);
  log(`docs/quality/GATES.md yazıldı — ${green} yeşil, ${red} kırmızı`);
}
process.exit(red ? 1 : 0);
