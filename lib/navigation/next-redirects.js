/**
 * next.config.js `redirects()` üreticisi — kaynak: `lib/navigation/redirects.json`
 * (o da `lib/navigation/registry.ts` → `redirectFrom`'dan türetilir; senkron testle korunur).
 *
 * Kural: bir eski → yeni eşleme YALNIZ şu iki koşul birlikte sağlanınca kenarda (308) etkinleşir:
 *   1. Hedef sayfa (`app/**\/page.tsx`) gerçekten var.
 *   2. Eski sayfa dosyası SİLİNMİŞ.
 * Eski URL'de hâlâ bir sayfa dosyası varsa (çalışan eski yüzey ya da emekli koçanı) yönlendirme
 * kararı O DOSYANINDIR: koçanlar sekme/parametre eşlemesi yapar (ör. `/customer/favorites` →
 * `/customer/places?tab=saved`, `?dealerId=` → mekân detayı, `/dealer/weekly-brief` → `?tab=weekly`).
 * next.config yönlendirmesi sayfadan ÖNCE çalıştığı için koçanı ezer ve bu eşlemeyi kaybettirirdi
 * (önceki "koçansa etkinleştir" kuralı 22 eski URL'yi sekmesiz hedefe atıyordu).
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

/**
 * Emekli koçanı: istemci bileşeni değil, JSX yok, yalnız yönlendirme çağrısı. JSX sezgisi kapanış
 * etiketi (`</x`) ya da kendi kendini kapatan etiket (`/>`) arar — TypeScript jenerikleri
 * (`Promise<Record<…>>`) JSX sayılmaz (eski `<Harf` sezgisi tipli koçanları "canlı sayfa" sanıyordu).
 */
function isRetirementStub(file) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (/['"]use client['"]/.test(code)) return false;
  if (/<\/[A-Za-z]|\/>/.test(code)) return false;
  return /\b(permanentRedirect|redirect)\s*\(/.test(code) && code.length < 2000;
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
    if (sourceFile) {
      skipped.push(
        `${source} → ${destination} (${isRetirementStub(sourceFile) ? 'emekli koçanı kendi eşlemesini yapar' : 'eski sayfa henüz emekli değil'})`
      );
      continue;
    }
    out.push({ source, destination, permanent: true });
  }
  if (opts.log && skipped.length) opts.log(`[nav-redirects] ${skipped.length} eşleme sayfa dosyasında (koçan/eski yüzey)`);
  return out;
}

module.exports = { buildNavRedirects, collectRoutes, isRetirementStub };
