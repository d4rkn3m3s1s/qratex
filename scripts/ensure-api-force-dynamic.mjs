// Adds export const dynamic = 'force-dynamic' to app API routes that use
// requireAuth / getServerSession. Skips files that already declare force-dynamic.
//
// Uses regex to place the export after ALL leading import declarations
// (including multiline `import { ... } from '...'`).
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'app', 'api');

function walkTs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

/**
 * Slice index after leading import declarations (possibly multiline).
 */
function endOfImportBlock(content) {
  let pos = 0;
  const stripBom = content.startsWith('\uFEFF') ? 1 : 0;
  pos = stripBom;
  const rest = () => content.slice(pos);
  while (true) {
    const r = rest();
    const m = r.match(
      /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*|(?:import\s[\s\S]*?;\s*\n))+/
    );
    if (m?.[0]) {
      pos += m[0].length;
      continue;
    }
    break;
  }
  return pos;
}

function injectDynamic(content) {
  const idx = endOfImportBlock(content);
  const insertion = `\nexport const dynamic = 'force-dynamic';\n`;
  return content.slice(0, idx) + insertion + content.slice(idx).replace(/^\s*\n/, '\n');
}

const files = walkTs(root);
let patched = 0;
for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('force-dynamic')) continue;
  if (!/requireAuth\s*\(/.test(s) && !/\bgetServerSession\b/.test(s)) continue;
  fs.writeFileSync(file, injectDynamic(s));
  patched++;
  console.log('patched', path.relative(process.cwd(), file));
}
console.log('done,', patched, 'files');
