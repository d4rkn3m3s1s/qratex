/**
 * app/api/admin altındaki route dosyalarını tarar ve admin API kataloğunu üretir.
 * Çıktı: lib/data/admin-api-catalog.json — `prebuild` her derlemede çalıştırır.
 *
 * Her route için:
 *  - methods: `export (async) function GET`, `export const GET =`, `export { h as GET }`
 *  - auth:    defineRoute `roles: [...]` / `'public'`, requireAuth([...]), createApiRoute([...]),
 *             requireTeamAccess (ekip), CRON_SECRET/verifyCron (cron), hiçbiri → 'none'
 *  - usedBy:  app/admin/** ve components/admin/** içinde bu yolu metin olarak anan dosyalar
 *             (metin taraması — tahmini ters indeks)
 * Yöntemi tespit edilemeyen route olursa uyarı basar (sessiz kalmaz).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const adminApiRoot = path.join(root, 'app', 'api', 'admin');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function walk(dir, accept) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      out.push(...walk(full, accept));
    } else if (accept(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f) => path.relative(root, f).split(path.sep).join('/');

function fileToApiPath(file) {
  const r = path.relative(path.join(root, 'app', 'api'), file).split(path.sep).join('/');
  return '/api/' + r.replace(/\/route\.(ts|tsx|js)$/, '');
}

export function detectMethods(source) {
  return METHODS.filter(
    (m) =>
      new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(source) ||
      new RegExp(`export\\s+(const|let|var)\\s+${m}\\b`).test(source) ||
      new RegExp(`export\\s*\\{[^}]*\\bas\\s+${m}\\b[^}]*\\}`).test(source)
  );
}

function rolesFrom(text) {
  return [...new Set((text.match(/'(ADMIN|DEALER|STAFF|CUSTOMER)'/g) || []).map((s) => s.replace(/'/g, '')))];
}

export function detectAuth(source) {
  const def = source.match(/roles:\s*(\[[^\]]*\]|'public')/);
  if (def) return def[1] === "'public'" ? { kind: 'public' } : { kind: 'role', roles: rolesFrom(def[1]) };
  const req = source.match(/(?:requireAuth|createApiRoute)\(\s*(\[[^\]]*\])/);
  if (req) return { kind: 'role', roles: rolesFrom(req[1]) };
  if (/requireTeamAccess|requireTeamManager/.test(source)) return { kind: 'team' };
  if (/CRON_SECRET|verifyCron|isCronAuthorized/.test(source)) return { kind: 'cron' };
  if (/requireAuth\(|getServerSession\(/.test(source)) return { kind: 'role', roles: [] };
  return { kind: 'none' };
}

function routeMatcher(apiPath) {
  const re = apiPath
    .split('/')
    .map((seg) => (/^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${re}/?$`);
}

function referencedPaths(source) {
  const out = new Set();
  const re = /\/api\/admin\/[A-Za-z0-9_\-/[\]${}.]*/g;
  for (const m of source.match(re) || []) {
    const cleaned = m.replace(/\$\{[^}]*\}/g, 'x').replace(/\?.*$/, '').replace(/\/+$/, '');
    out.add(cleaned);
  }
  return [...out];
}

const files = walk(adminApiRoot, (n) => /^route\.(ts|tsx|js)$/.test(n)).sort((a, b) => a.localeCompare(b));
const consumers = [
  ...walk(path.join(root, 'app', 'admin'), (n) => /\.(tsx?|jsx?)$/.test(n)),
  ...walk(path.join(root, 'components', 'admin'), (n) => /\.(tsx?|jsx?)$/.test(n)),
].map((f) => ({ file: rel(f), refs: referencedPaths(fs.readFileSync(f, 'utf8')) }));

const routes = [];
const undetected = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const apiPath = fileToApiPath(file);
  const methods = detectMethods(src);
  if (methods.length === 0) undetected.push(apiPath);
  const matcher = routeMatcher(apiPath);
  const usedBy = consumers.filter((c) => c.refs.some((r) => matcher.test(r))).map((c) => c.file);
  routes.push({ path: apiPath, methods, file: rel(file), auth: detectAuth(src), usedBy });
}

const outDir = path.join(root, 'lib', 'data');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'admin-api-catalog.json');
fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), routes }, null, 2), 'utf8');
console.log(`Wrote ${routes.length} admin routes to ${rel(outFile)}`);
if (undetected.length > 0) {
  console.warn(`[catalog] UYARI: ${undetected.length} route için HTTP yöntemi tespit edilemedi:\n  ${undetected.join('\n  ')}`);
}
