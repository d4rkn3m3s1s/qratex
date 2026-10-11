/**
 * İç bağlantı korkuluğu (bilgi mimarisi B4 + "Kırık iç link sayısı 0, link taraması CI'da").
 *
 * `app/`, `components/`, `lib/` altındaki her panel/auth yolu dizgisi (tek/çift tırnak ya da
 * şablon dizgi, `${…}` tam bölüm → dinamik parametre) gerçek bir sayfaya çözülmeli ve
 * EMEKLİ KOÇANINA inmemeli:
 *  - sayfası olmayan yol → 404 (kırık bağlantı);
 *  - emekli koçanına inen yol → her tıklamada fazladan yönlendirme turu ve çoğu zaman bağlam
 *    kaybı (koçanlar yalnız eski yer imleri / DB'deki eski bildirim bağlantıları içindir; yeni
 *    kod kanonik adresi üretir: `lib/navigation/deep-links.ts`, kayıt `href`'leri).
 *
 * Bilinçli istisnalar aşağıda gerekçeli (eski URL → yeni URL eşleme tabloları, koçanların kendisi).
 */
import * as fs from 'fs';
import * as path from 'path';
const { collectRoutes, isRetirementStub } = require('@/lib/navigation/next-redirects') as {
  collectRoutes: (appDir: string) => Map<string, string>;
  isRetirementStub: (file: string) => boolean;
};

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib'];

/** Eski → yeni eşleme tabloları ve kayıt: eski yolları BİLEREK anar. */
const ALLOW_FILES: RegExp[] = [
  /^lib\/navigation\//, // kayıt (redirectFrom/legacyIds), yönlendirme üreticisi
  /(^|\/)legacy-redirect\.ts$/, // emekli rota → sekme eşlemeleri
  /^components\/customer\/m-ben-ilerleme\/retired-route\.ts$/,
  /^lib\/admin-economy\/contract\.ts$/, // LEGACY_TAB: eski ekonomi rotaları → sekme
  /^lib\/dealer-inbox\/core\.ts$/, // legacyInboxParams belgesi
  /^lib\/consent\/redact\.ts$/, // URL desenleri (PII karartma), bağlantı değil
  /^components\/analytics\/posthog-consent\.ts$/, // URL desen belgesi
  /^lib\/pwa\//, // önbellek dışı yol önekleri
  /^app\/robots\.ts$/, // tarama kuralı önekleri
  /^lib\/seo-settings\.ts$/,
  /^lib\/admin-seo\/contract\.ts$/,
  /^components\/customer\/p-kart-masa-offline\/offline\/copy\.ts$/, // yol → başlık sözlüğü (anahtar)
  /^lib\/auth\/post-login-target\.ts$/, // girişten sonra yasak yol önekleri
  /^lib\/wallet-card\/tabs\.ts$/, // `startsWith('/customer/wallet/')` önek denetimi
];

/** Bağlantı değil, etiket: modül kapısı reddinin günlük anahtarı. */
const SKIP_LINE = /\brouteKey\s*:/;

type Hit = { file: string; line: number; raw: string; path: string };

function listFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (path.relative(ROOT, p).split(path.sep).join('/') === 'app/api') {
        // API rotaları da bağlantı üretir (bildirim ctaPath, yönlendirme) → taranır.
      }
      listFiles(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** `'/x/y'`, `"/x"`, `` `/x/${id}/z` `` → yol (`${…}` tam bölüm → `:param`; kısmi bölümde kesilir). */
function extractPaths(line: string): { raw: string; path: string }[] {
  const out: { raw: string; path: string }[] = [];
  const re = /(['"`])\/(admin|dealer|customer|staff|auth)(?=[/'"`?#$]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const quote = m[1];
    let i = m.index + 1;
    let pathOut = '';
    let truncated = false;
    while (i < line.length) {
      const ch = line[i];
      if (ch === quote || ch === '?' || ch === '#' || /\s/.test(ch)) break;
      if (quote === '`' && ch === '$' && line[i + 1] === '{') {
        let depth = 0;
        let j = i + 1;
        for (; j < line.length; j++) {
          if (line[j] === '{') depth++;
          else if (line[j] === '}' && --depth === 0) break;
        }
        const segStart = pathOut.endsWith('/');
        const next = line[j + 1];
        const segEnd = next === '/' || next === quote || next === '?' || next === '#' || next === undefined;
        if (segStart && segEnd) {
          pathOut += ':param';
          i = j + 1;
          continue;
        }
        truncated = true;
        break;
      }
      pathOut += ch;
      i++;
    }
    if (!truncated || pathOut.length > 1) {
      out.push({ raw: line.slice(m.index, Math.min(line.length, i + 1)).trim(), path: pathOut.replace(/\/+$/, '') || '/' });
    }
  }
  return out;
}

const routes = collectRoutes(path.join(ROOT, 'app'));
const compiled = [...routes.entries()].map(([url, file]) => ({
  url,
  file,
  re: new RegExp('^' + url.replace(/\[\[?\.\.\.[^\]]+\]\]?/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+') + '$'),
}));

function resolve(p: string): { url: string; file: string } | null {
  if (!p.includes(':param')) return compiled.find((c) => c.url === p) ?? compiled.find((c) => c.re.test(p)) ?? null;
  // `${…}` bölümü: o konumda herhangi bir statik ya da dinamik bölüm kabul (ör. `/auth/${kind}`).
  const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('^' + p.split(':param').map(escape).join('[^/]+') + '$');
  const candidates = compiled.filter((c) => pattern.test(c.url));
  return candidates.find((c) => !isRetirementStub(c.file)) ?? candidates[0] ?? null;
}

function scan(): { missing: Hit[]; stub: Hit[] } {
  const missing: Hit[] = [];
  const stub: Hit[] = [];
  const stubFiles = new Set(compiled.filter((c) => isRetirementStub(c.file)).map((c) => path.resolve(c.file)));
  for (const dir of SCAN_DIRS) {
    for (const abs of listFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      if (ALLOW_FILES.some((r) => r.test(rel))) continue;
      if (stubFiles.has(path.resolve(abs))) continue; // koçanın kendisi
      const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
      let inBlock = false;
      lines.forEach((text, idx) => {
        const t = text.trim();
        if (inBlock) {
          if (t.includes('*/')) inBlock = false;
          return;
        }
        if (t.startsWith('/*')) {
          if (!t.includes('*/')) inBlock = true;
          return;
        }
        if (t.startsWith('//') || t.startsWith('*')) return;
        if (SKIP_LINE.test(text)) return;
        const code = text.replace(/\s\/\/\s.*$/, '');
        for (const { raw, path: p } of extractPaths(code)) {
          if (/\/api(\/|$)/.test(p)) continue;
          const hit = { file: rel, line: idx + 1, raw, path: p };
          const r = resolve(p);
          if (!r) {
            missing.push(hit);
            continue;
          }
          if (stubFiles.has(path.resolve(r.file))) stub.push(hit);
        }
      });
    }
  }
  return { missing, stub };
}

const fmt = (h: Hit) => `${h.file}:${h.line}  ${h.path}`;

describe('iç bağlantılar (panel/auth yolları)', () => {
  const { missing, stub } = scan();

  it('her yol gerçek bir sayfaya çözülür (404 yok)', () => {
    expect(missing.map(fmt)).toEqual([]);
  });

  it('yeni kod emekli koçanına bağlanmaz (kanonik adres kullanır)', () => {
    expect(stub.map(fmt)).toEqual([]);
  });

  it('çıkarıcı: şablon parametresi tam bölümse dinamik, kısmi bölümde kesilir', () => {
    expect(extractPaths('href={`/customer/places/${id}`}').map((x) => x.path)).toEqual(['/customer/places/:param']);
    expect(extractPaths('push(`/customer/me/voices${qs}`)').map((x) => x.path)).toEqual(['/customer/me/voices']);
    expect(extractPaths("href: '/dealer/inbox?id=qr-1'").map((x) => x.path)).toEqual(['/dealer/inbox']);
    expect(extractPaths('`/admin/users/${encodeURIComponent(u.id)}`').map((x) => x.path)).toEqual(['/admin/users/:param']);
  });
});
