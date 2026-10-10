/**
 * next.config.js `redirects()` üreticisi — kaynak: `lib/navigation/redirects.json`
 * (o da `lib/navigation/registry.ts` → `redirectFrom`'dan türetilir; senkron testle korunur).
 *
 * Güvenlik kuralı (paralel yüzey inşası sırasında yarım birleşmeyi canlıya taşımamak için):
 * bir eski → yeni eşlemesi YALNIZ şu iki koşul birlikte sağlanınca etkinleşir:
 *   1. Hedef sayfa (`app/**\/page.tsx`) gerçekten var.
 *   2. Eski sayfa ya silinmiş ya da emekli koçanına (yalnız `redirect`/`permanentRedirect`
 *      yapan küçük sunucu bileşeni) çevrilmiş — yani içerik hedefe taşınmış.
 * Böylece çalışan bir eski sayfa, yerine geçecek yüzey hazır olmadan susturulmaz.
 *
 * Next yönlendirmeleri sorgu dizesini korur. 308 (kalıcı) döner.
 */
const fs = require('fs');
const path = require('path');

const PAGE_FILES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'page.mdx'];

function collectRoutes(appDir) {
  const routes = new Map(); // url → dosya
  const walk = (dir, segments) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isFile() && PAGE_FILES.includes(e.name)) {
        const url = '/' + segments.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@')).join('/');
        routes.set(url === '/' ? '/' : url.replace(/\/$/, ''), path.join(dir, e.name));
      } else if (e.isDirectory() && !e.name.startsWith('_') && e.name !== 'api' && e.name !== 'node_modules') {
        walk(path.join(dir, e.name), [...segments, e.name]);
      }
    }
  };
  walk(appDir, []);
  return routes;
}

/** Emekli koçanı: JSX yok, istemci bileşeni değil, yalnız yönlendirme çağrısı. */
function isRetirementStub(file) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/['"]use client['"]/.test(code)) return false;
  if (/<[A-Za-z]/.test(code)) return false;
  return /\b(permanentRedirect|redirect)\s*\(/.test(code) && code.length < 1500;
}

/**
 * @param {string} rootDir proje kökü (next.config.js'nin dizini)
 * @param {{ log?: (msg: string) => void }} [opts]
 */
function buildNavRedirects(rootDir, opts = {}) {
  let map;
  try {
    map = JSON.parse(fs.readFileSync(path.join(rootDir, 'lib', 'navigation', 'redirects.json'), 'utf8'));
  } catch (err) {
    if (opts.log) opts.log(`[nav-redirects] redirects.json okunamadı: ${err && err.message}`);
    return [];
  }
  const routes = collectRoutes(path.join(rootDir, 'app'));
  const out = [];
  const skipped = [];
  for (const { source, destination } of map) {
    const destPath = destination.split('?')[0];
    if (!routes.has(destPath)) {
      skipped.push(`${source} → ${destination} (hedef sayfa yok)`);
      continue;
    }
    const sourceFile = routes.get(source);
    if (sourceFile && !isRetirementStub(sourceFile)) {
      skipped.push(`${source} → ${destination} (eski sayfa henüz emekli değil)`);
      continue;
    }
    out.push({ source, destination, permanent: true });
  }
  if (opts.log && skipped.length) opts.log(`[nav-redirects] ${skipped.length} eşleme beklemede`);
  return out;
}

module.exports = { buildNavRedirects, collectRoutes, isRetirementStub };
