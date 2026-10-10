/**
 * P0-37 — next-pwa precache kapsamı.
 * Kök neden: publicExcludes/buildExcludes yoktu → public/ (~358 MB) + 954 chunk precache'teydi.
 * Bu test next-pwa'nın kullandığı AYNI globby çağrısıyla gerçek public/ klasöründen
 * precache listesini üretir ve boyutunu ölçer.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const pwa = require('../../config/pwa.js') as {
  PUBLIC_EXCLUDES: string[];
  RUNTIME_CACHING: Array<{ urlPattern: RegExp | ((ctx: { url: URL }) => boolean); handler: string; options: { cacheName: string } }>;
  isExcludedFromPrecache: (name: string) => boolean;
  buildPwaOptions: (env: { isDev: boolean }) => Record<string, unknown>;
};
const globby = require('globby') as { sync: (patterns: string[], opts: { cwd: string }) => string[] };

const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

/** next-pwa 5.6 index.js'deki manifest üretiminin birebir kopyası. */
function publicPrecacheEntries(): string[] {
  const sw = 'sw.js';
  return globby.sync(
    [
      '**/*',
      '!workbox-*.js',
      '!workbox-*.js.map',
      '!worker-*.js',
      '!worker-*.js.map',
      '!fallback-*.js',
      '!fallback-*.js.map',
      `!${sw}`,
      `!${sw}.map`,
      ...pwa.PUBLIC_EXCLUDES,
    ],
    { cwd: PUBLIC_DIR },
  );
}

describe('PWA precache — public/ (P0-37)', () => {
  const entries = publicPrecacheEntries();

  it('görsel, video, maskot, logo ve yüklemeler precache’e girmez', () => {
    for (const e of entries) {
      expect(e).not.toMatch(/^(images|videos|mascot|logo|uploads)\//);
      expect(e).not.toMatch(/\.map$/);
    }
    expect(entries).not.toContain('push-sw.js');
  });

  it('kalan public precache toplamı 1 MB altında (eskiden ~358 MB)', () => {
    const total = entries.reduce((sum, e) => sum + fs.statSync(path.join(PUBLIC_DIR, e)).size, 0);
    expect(total).toBeLessThan(1024 * 1024);
    // Kabuk varlıkları hâlâ çevrimdışı kullanılabilir.
    expect(entries).toEqual(expect.arrayContaining(['manifest.json', 'favicon.ico']));
  });
});

describe('PWA precache — webpack çıktısı', () => {
  it.each([
    'static/chunks/app/admin/page-abc123.js',
    'static/chunks/app/dealer/scan/page-abc123.js',
    'static/chunks/63044-3076083add9da287.js',
    'static/chunks/b536a0f1.0bb3cbee141d42c2.js',
    'static/chunks/main-app-90e55ac8ca66994b.js.map',
  ])('rota/paylaşılan chunk precache dışı: %s', (name) => {
    expect(pwa.isExcludedFromPrecache(name)).toBe(true);
  });

  it.each([
    'static/chunks/webpack-b646184dcb0fe5d5.js',
    'static/chunks/main-app-90e55ac8ca66994b.js',
    'static/chunks/polyfills-42372ed130431b0a.js',
    'static/css/0f1e2d3c4b5a6978.css',
    'static/media/inter-latin.4f9a8b7c.woff2',
    'static/WI95wUtouUqtEzsyBlxjJ/_buildManifest.js',
  ])('uygulama kabuğu precache’te: %s', (name) => {
    expect(pwa.isExcludedFromPrecache(name)).toBe(false);
  });

  it('yerel build çıktısı varsa kabuk precache’i 3 MB altında', () => {
    const chunksDir = path.join(ROOT, '.next', 'static');
    if (!fs.existsSync(chunksDir)) return; // build yoksa atla (CI build adımında ölçülür)
    let total = 0;
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, f.name);
        if (f.isDirectory()) walk(abs);
        else {
          const name = path.relative(path.join(ROOT, '.next'), abs).split(path.sep).join('/');
          if (!pwa.isExcludedFromPrecache(name)) total += fs.statSync(abs).size;
        }
      }
    };
    walk(chunksDir);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });
});

describe('PWA seçenekleri', () => {
  const opts = pwa.buildPwaOptions({ isDev: false });

  it('otomatik kayıt kapalı (QR hunisi SW kurmaz), push dinleyicisi aynı SW’de', () => {
    expect(opts.register).toBe(false);
    expect(opts.importScripts).toEqual(['/push-sw.js']);
    expect(opts.publicExcludes).toEqual(expect.arrayContaining(['!noprecache/**/*', '!images/**/*']));
    expect(pwa.buildPwaOptions({ isDev: true }).disable).toBe(true);
  });

  /**
   * urlPattern fonksiyonları sw.js'e `toString()` ile gömülür; kapanım değişkeni kullanırlarsa
   * SW içinde ReferenceError verir. Burada SW benzeri izole bir bağlamda yeniden derleyip çalıştırıyoruz.
   */
  it('sayfa önbelleği kuralı kendi içinde bütün ve API/yönetim/kimlik yollarını önbelleğe almaz', () => {
    const fnRules = pwa.RUNTIME_CACHING.filter((r) => typeof r.urlPattern === 'function');
    expect(fnRules.length).toBeGreaterThan(0);
    const sandbox = { self: { origin: 'https://qratex.app' }, URL };
    const compiled = fnRules.map((r) => ({
      cacheName: r.options.cacheName,
      fn: vm.runInNewContext(`(${(r.urlPattern as (...a: unknown[]) => boolean).toString()})`, sandbox) as (ctx: {
        url: URL;
      }) => boolean,
    }));
    const others = compiled.find((c) => c.cacheName === 'others')!;
    const u = (p: string) => ({ url: new URL(p, 'https://qratex.app') });
    expect(others.fn(u('/customer'))).toBe(true);
    expect(others.fn(u('/dealer/scan'))).toBe(true);
    expect(others.fn(u('/api/customer/me'))).toBe(false);
    expect(others.fn(u('/admin/users'))).toBe(false);
    expect(others.fn(u('/admin-gate'))).toBe(false);
    expect(others.fn(u('/auth/login'))).toBe(false);
    expect(others.fn({ url: new URL('https://cdn.example.com/x.js') })).toBe(false);
    const cross = compiled.find((c) => c.cacheName === 'cross-origin')!;
    expect(cross.fn({ url: new URL('https://cdn.example.com/x.js') })).toBe(true);
  });

  it('hash’li avatar ve rozet küçük resimleri genel görsel kuralından ÖNCE CacheFirst ile eşleşir', () => {
    const firstMatch = (pathname: string) =>
      pwa.RUNTIME_CACHING.find(
        (r) => r.urlPattern instanceof RegExp && r.urlPattern.test(`https://qratex.app${pathname}`),
      );
    for (const p of ['/images/avatar/opt/cat.0123456789.webp', '/images/badges/opt/efsane.0123456789.webp']) {
      const rule = firstMatch(p)!;
      expect(rule.options.cacheName).toBe('avatar-images');
      expect(rule.handler).toBe('CacheFirst');
    }
    // Hash'siz özgün SVG değişebilir → CacheFirst DEĞİL.
    expect(firstMatch('/images/badges/EFSANE.svg')!.handler).toBe('StaleWhileRevalidate');
  });

  it('hash’li Next varlıkları genel .js kuralından ÖNCE CacheFirst ile eşleşir', () => {
    const idxStatic = pwa.RUNTIME_CACHING.findIndex((r) => r.options.cacheName === 'next-static');
    const idxJs = pwa.RUNTIME_CACHING.findIndex((r) => r.options.cacheName === 'static-js-assets');
    expect(idxStatic).toBeGreaterThanOrEqual(0);
    expect(idxStatic).toBeLessThan(idxJs);
    expect(pwa.RUNTIME_CACHING[idxStatic].handler).toBe('CacheFirst');
  });
});
