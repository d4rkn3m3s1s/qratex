/**
 * Modül kapısı tarayıcısı — `lib/data/module-gate-bindings.json`'u üretir ve CI'da (jest)
 * tutarlılığını doğrular. Elle yazılmış "endpoint → modül" tablosunun yerini alır
 * (denetim raporu modules B1/B4).
 *
 * Ne sayılır:
 *  - `assert*Module*` / `is*Module*` çağrısının ilk argümanı (literal ya da aynı dosyadaki sabit)
 *  - `defineRoute({ module: '<key>' })`
 *  - lib içindeki argümansız sarmalayıcılar (ör. `assertInviteModule`) → çağrıldığı yer
 *  - `moduleControls.<key>` / `controls.<key>` / `controls['<key>']` okumaları
 *  - menü kaydındaki `moduleKey:` / `featureKey:` (yalnız menü gizleme)
 *
 * Yalnız Node (fs). Çalışma zamanında KULLANILMAZ; üretilen JSON okunur.
 */
import fs from 'fs';
import path from 'path';
import type { GateEndpoint } from './contract';

export type KeyBindings = { api: GateEndpoint[]; pages: string[]; server: string[]; landing: string[]; menu: string[] };
export type GateBindingsFile = {
  version: 1;
  keys: Record<string, KeyBindings>;
  unknownKeys: Record<string, string[]>;
};

const GATE_CALL_LITERAL = /\b((?:assert|is)[A-Za-z]*Module[A-Za-z]*)\(\s*['"]([a-z0-9_]+)['"]/g;
const GATE_CALL_IDENT = /\b(?:assert|is)[A-Za-z]*Module[A-Za-z]*\(\s*([A-Z_][A-Z0-9_]*)\b/g;
const DEFINE_ROUTE_MODULE = /\bmodule:\s*['"]([a-z0-9_]+)['"]/g;
const CONTROL_READ = /\b(?:moduleControls|controls)(?:\.([a-z][a-z0-9_]*)|\[\s*['"]([a-z0-9_]+)['"]\s*\])/g;
const MENU_KEY = /\b(?:moduleKey|featureKey):\s*['"]([a-z0-9_]+)['"]/g;
const EXPORT_FN = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g;
const HTTP_EXPORT = /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

/** Taramadan hariç: kataloğun kendisi, kapı, tarayıcı, test ve yönetim ekranları (yalnız gösterir). */
const EXCLUDE = [
  /^lib\/module-controls\.ts$/,
  /^lib\/module-gate\.ts$/,
  /^lib\/admin-flags\/(gate-scan|contract|modules\.server|flags\.server|experiments\.server|module-meta)\.ts$/,
  /^lib\/http\/define-route\.ts$/,
  /^app\/admin\//,
  /^components\/admin\//,
  /^app\/api\/admin\/settings\//,
  /^app\/api\/admin\/feature-control\//,
];
const MENU_FILES = ['lib/navigation/registry.ts', 'components/dashboard/sidebar.tsx'];

function walk(dir: string, root: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, root, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
}

function constMap(src: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of src.matchAll(/\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"]([a-z0-9_]+)['"]/g)) m.set(x[1], x[2]);
  return m;
}

/** Bir kaynaktaki doğrudan kapı anahtarları (çağrı + defineRoute + sabit çözümü). */
export function directGateKeys(src: string): string[] {
  const keys = new Set<string>();
  for (const x of src.matchAll(GATE_CALL_LITERAL)) {
    if (x[1] === 'assertMenuItemVisible') continue;
    keys.add(x[2]);
  }
  if (/\bdefineRoute\b/.test(src)) for (const x of src.matchAll(DEFINE_ROUTE_MODULE)) keys.add(x[1]);
  const consts = constMap(src);
  for (const x of src.matchAll(GATE_CALL_IDENT)) {
    const v = consts.get(x[1]);
    if (v) keys.add(v);
  }
  return [...keys];
}

export function controlReadKeys(src: string, catalog: ReadonlySet<string>): string[] {
  const keys = new Set<string>();
  for (const x of src.matchAll(CONTROL_READ)) {
    const k = x[1] ?? x[2];
    if (k && catalog.has(k)) keys.add(k);
  }
  return [...keys];
}

/** lib içindeki dışa aktarılan fonksiyon → içinde literal kapı çağrısı geçen anahtarlar. */
export function helperGateMap(src: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const marks = [...src.matchAll(EXPORT_FN)].map((x) => ({ name: x[1], at: x.index ?? 0 }));
  marks.forEach((mk, i) => {
    const body = src.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : src.length);
    const keys = directGateKeys(body.replace(/^export\s+(?:async\s+)?function\s+[A-Za-z0-9_]+/, ''));
    if (keys.length) out.set(mk.name, keys);
  });
  return out;
}

export function routeEndpoint(file: string): string {
  return '/' + file.replace(/^app\//, '').replace(/\/route\.tsx?$/, '').replace(/\([^/]+\)\//g, '');
}

export function httpMethods(src: string): string[] {
  return [...new Set([...src.matchAll(HTTP_EXPORT)].map((x) => x[1]))].sort();
}

const empty = (): KeyBindings => ({ api: [], pages: [], server: [], landing: [], menu: [] });

export function scanModuleGates(root: string, catalogKeys: readonly string[]): GateBindingsFile {
  const catalog = new Set(catalogKeys);
  const files: string[] = [];
  walk(path.join(root, 'app'), root, files);
  walk(path.join(root, 'lib'), root, files);
  walk(path.join(root, 'components'), root, files);
  files.sort();

  const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
  const keys: Record<string, KeyBindings> = {};
  const unknown: Record<string, Set<string>> = {};
  const add = (key: string, f: (b: KeyBindings) => void, file: string) => {
    if (!catalog.has(key)) {
      (unknown[key] ??= new Set()).add(file);
      return;
    }
    f((keys[key] ??= empty()));
  };

  // 1) lib sarmalayıcıları
  const helpers = new Map<string, string[]>();
  const helperFiles = new Set<string>();
  for (const f of files) {
    const helperCandidate = f.startsWith('lib/') || (f.startsWith('app/') && !/\/(route|page|layout)\.tsx?$/.test(f));
    if (!helperCandidate || EXCLUDE.some((re) => re.test(f))) continue;
    const src = read(f);
    if (!/(?:assert|is)[A-Za-z]*Module[A-Za-z]*\(|\bmodule:/.test(src)) continue;
    const map = helperGateMap(src);
    if (map.size) helperFiles.add(f);
    for (const [name, ks] of map) helpers.set(name, ks);
  }
  const helperCall = helpers.size ? new RegExp(`\\b(${[...helpers.keys()].join('|')})\\(`, 'g') : null;

  // 2) kullanım yerleri
  for (const f of files) {
    if (EXCLUDE.some((re) => re.test(f))) continue;
    const src = read(f);
    if (MENU_FILES.includes(f)) {
      for (const x of src.matchAll(MENU_KEY)) add(x[1], (b) => b.menu.includes(f) || b.menu.push(f), f);
      continue;
    }
    const gateKeys = new Set(directGateKeys(src));
    if (helperCall && !helperFiles.has(f)) for (const x of src.matchAll(helperCall)) for (const k of helpers.get(x[1]) ?? []) gateKeys.add(k);
    const reads = controlReadKeys(src, catalog);
    if (!gateKeys.size && !reads.length) continue;

    const isRoute = /^app\/.*\/route\.tsx?$/.test(f);
    const isPage = /^app\/.*\/(page|layout)\.tsx?$/.test(f);
    const isPublic = /^app\/\(public\)\//.test(f);
    const all = new Set([...gateKeys, ...reads]);
    for (const k of all) {
      if (isRoute) {
        add(
          k,
          (b) => {
            if (!b.api.some((e) => e.file === f)) b.api.push({ endpoint: routeEndpoint(f), methods: httpMethods(src), file: f });
          },
          f
        );
      } else if (isPage) {
        add(k, (b) => (isPublic && !gateKeys.has(k) ? b.landing : b.pages).push(f), f);
      } else if (f.startsWith('lib/') && !helperFiles.has(f)) {
        add(k, (b) => b.server.push(f), f);
      }
    }
  }

  const sortedKeys: Record<string, KeyBindings> = {};
  for (const k of Object.keys(keys).sort()) {
    const b = keys[k];
    sortedKeys[k] = {
      api: b.api.sort((a, c) => a.endpoint.localeCompare(c.endpoint)),
      pages: [...new Set(b.pages)].sort(),
      server: [...new Set(b.server)].sort(),
      landing: [...new Set(b.landing)].sort(),
      menu: [...new Set(b.menu)].sort(),
    };
  }
  const unknownKeys: Record<string, string[]> = {};
  for (const k of Object.keys(unknown).sort()) unknownKeys[k] = [...unknown[k]].sort();
  return { version: 1, keys: sortedKeys, unknownKeys };
}
