/**
 * One-off: add PRIVATE_NO_STORE_HEADERS import and patch NextResponse.json calls
 * in dealer route.ts files that don't already import it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dealerRoot = path.join(__dirname, '..', 'app', 'api', 'dealer');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else if (e.name === 'route.ts') files.push(p);
  }
  return files;
}

function ensureImport(source) {
  if (source.includes("PRIVATE_NO_STORE_HEADERS")) return source;
  const needles = [
    "from '@/lib/prisma'",
    'from "@/lib/prisma"',
    "from '@/lib/api-auth'",
    "from 'next/server'",
  ];
  for (const needle of needles) {
    const idx = source.indexOf(needle);
    if (idx === -1) continue;
    const lineEnd = source.indexOf('\n', idx);
    if (lineEnd === -1) continue;
    return (
      source.slice(0, lineEnd + 1) +
      "import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';\n" +
      source.slice(lineEnd + 1)
    );
  }
  return source;
}

function findMatchingParen(s, openParenIdx) {
  let depth = 0;
  let inStr = false;
  let strQuote = '';
  let escaped = false;
  for (let i = openParenIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === strQuote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = true;
      strQuote = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function patchNextResponseCalls(source) {
  const marker = 'NextResponse.json(';
  let out = '';
  let i = 0;
  while (i < source.length) {
    const idx = source.indexOf(marker, i);
    if (idx === -1) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, idx);
    const openParen = idx + marker.length - 1;
    const closeIdx = findMatchingParen(source, openParen);
    if (closeIdx === -1) {
      out += source.slice(idx, idx + marker.length);
      i = idx + marker.length;
      continue;
    }
    const fullCall = source.slice(idx, closeIdx);
    if (fullCall.includes('PRIVATE_NO_STORE_HEADERS')) {
      out += fullCall;
      i = closeIdx;
      continue;
    }
    const argsStart = openParen + 1;
    const argsEnd = closeIdx - 1;
    const argsStr = source.slice(argsStart, argsEnd);

    let brace = 0;
    let paren = 0;
    let sq = 0;
    let inStr = false;
    let strQuote = '';
    let esc = false;
    let split = -1;
    for (let k = 0; k < argsStr.length; k++) {
      const ch = argsStr[k];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === strQuote) inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = true;
        strQuote = ch;
        continue;
      }
      if (ch === '[') sq++;
      else if (ch === ']') sq--;
      else if (ch === '{') brace++;
      else if (ch === '}') brace--;
      else if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (ch === ',' && brace === 0 && paren === 0 && sq === 0 && split === -1) {
        split = k;
        break;
      }
    }

    if (split === -1) {
      out += fullCall.slice(0, -1) + `, { headers: PRIVATE_NO_STORE_HEADERS })`;
    } else {
      const a2 = argsStr.slice(split + 1).trim();
      if (a2.startsWith('{') && !a2.includes('headers:')) {
        const newA2 = a2.replace(/\}\s*$/, ', headers: PRIVATE_NO_STORE_HEADERS }');
        const inner = argsStr.slice(0, split) + ', ' + newA2;
        out += marker + inner + ')';
      } else if (!a2.startsWith('{')) {
        out += fullCall.slice(0, -1) + `, { headers: PRIVATE_NO_STORE_HEADERS })`;
      } else {
        out += fullCall;
      }
    }
    i = closeIdx;
  }
  return out;
}

const all = walk(dealerRoot);
const targets = all.filter((f) => !fs.readFileSync(f, 'utf8').includes('PRIVATE_NO_STORE_HEADERS'));

for (const f of targets) {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('NextResponse')) continue;
  s = ensureImport(s);
  s = patchNextResponseCalls(s);
  fs.writeFileSync(f, s, 'utf8');
  console.log('patched', path.relative(path.join(__dirname, '..'), f));
}

console.log('files scanned', all.length, 'patched', targets.length);
