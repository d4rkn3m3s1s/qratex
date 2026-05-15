/**
 * app/api/admin altındaki route.ts dosyalarını tarar; export edilen HTTP metodlarını çıkarır.
 * Çıktı: lib/data/admin-api-catalog.json (repo'ya commit edin; CI'da doğrulama için kullanılabilir)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const adminApiRoot = path.join(root, 'app', 'api', 'admin');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function walkRouteFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...walkRouteFiles(full));
    } else if (name.name === 'route.ts' || name.name === 'route.js') {
      out.push(full);
    }
  }
  return out;
}

function fileToApiPath(file) {
  const rel = path.relative(path.join(root, 'app', 'api'), file);
  const posix = rel.split(path.sep).join('/');
  return '/api/' + posix.replace(/\/route\.(ts|js)$/, '');
}

function detectMethods(source) {
  return METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(source));
}

const files = walkRouteFiles(adminApiRoot).sort((a, b) => a.localeCompare(b));
const routes = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const methods = detectMethods(src);
  routes.push({
    path: fileToApiPath(file),
    methods: methods.length ? methods : [],
    file: path.relative(root, file).split(path.sep).join('/'),
  });
}

const outDir = path.join(root, 'lib', 'data');
fs.mkdirSync(outDir, { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  routes,
};
const outFile = path.join(outDir, 'admin-api-catalog.json');
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Wrote ${routes.length} admin routes to ${path.relative(root, outFile)}`);
