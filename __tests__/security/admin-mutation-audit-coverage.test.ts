/**
 * guvenlik-admin-api B10 — yapı testi: `app/api/admin/**` altında POST/PUT/PATCH/DELETE dışa
 * aktaran HER route denetim kaydı yazmalı (kendisi ya da içe aktardığı sunucu modülü, en fazla
 * iki seviye). Ayrıca her admin route'u bir yetki kapısından geçmeli ve her mutasyon oran
 * sınırına tabi olmalı. Emekli (410) uçlar muaf.
 *
 * Denetim sırasında mutasyon yapan 89 admin route'unun 44'ünde audit yoktu (sınırsız puan basan
 * sürpriz kutu dahil); bu test aynı boşluğun sessizce geri gelmesini engeller.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const ADMIN_API = path.join(ROOT, 'app', 'api', 'admin');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(c)) return c;
  return null;
}

const AUDIT_CALL = /(auditLog\.(create|createMany|upsert)|\b\w*[aA]udit\w*\s*\(|withAudit|\baudit\s*:)/;
const cache = new Map<string, boolean>();
function writesAudit(file: string, depth: number): boolean {
  const key = `${file}:${depth}`;
  if (cache.has(key)) return cache.get(key)!;
  const src = fs.readFileSync(file, 'utf8');
  const body = src
    .replace(/import[^;]+;/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  let ok = AUDIT_CALL.test(body);
  if (!ok && depth > 0) {
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const f = resolveImport(m[1], file);
      if (f && writesAudit(f, depth - 1)) {
        ok = true;
        break;
      }
    }
  }
  cache.set(key, ok);
  return ok;
}

const MUTATION_EXPORT = /export\s+(?:const|async function|function)\s+(POST|PUT|PATCH|DELETE)\b/;
const RETIRED = /status:\s*410|\bgone\b/;
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

const routes = walk(ADMIN_API).map((f) => ({ file: f, src: fs.readFileSync(f, 'utf8') }));

describe('admin API yapı korkulukları', () => {
  it('admin route envanteri boş değil (test gerçekten dosya okuyor)', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('mutasyon yapan her admin route denetim kaydı yazar', () => {
    const missing = routes
      .filter((r) => MUTATION_EXPORT.test(r.src) && !RETIRED.test(r.src))
      .filter((r) => !writesAudit(r.file, 2))
      .map((r) => rel(r.file));
    expect(missing).toEqual([]);
  });

  it('her admin route bir yetki kapısından geçer (ADMIN rolü ya da ekip modülü)', () => {
    const GUARD =
      /requireAuth\(\s*\[\s*'ADMIN'\s*\]|roles:\s*\[\s*'ADMIN'\s*\]|createApiRoute\(\s*\[\s*'ADMIN'\s*\]|TEAM_ROUTE_ROLES|requireCronAuth|authorizeInternal/;
    const unguarded = routes.filter((r) => !RETIRED.test(r.src) && !GUARD.test(r.src)).map((r) => rel(r.file));
    expect(unguarded).toEqual([]);
  });

  it('mutasyon yapan her admin route oran sınırına tabi', () => {
    const unlimited = routes
      .filter((r) => MUTATION_EXPORT.test(r.src) && !RETIRED.test(r.src))
      .filter((r) => !/rateLimit|RateLimit/.test(r.src))
      .map((r) => rel(r.file));
    expect(unlimited).toEqual([]);
  });

  it('kapı muafiyeti (adminGate: false) yalnız kapı ucunun kendisinde', () => {
    const files = [...routes.map((r) => r.file), path.join(ROOT, 'lib', 'team-access.ts')].filter((f) => fs.existsSync(f));
    const offenders = files
      .filter((f) => /adminGate:\s*false/.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => f !== 'app/api/admin/gate/route.ts');
    expect(offenders).toEqual([]);
  });
});
