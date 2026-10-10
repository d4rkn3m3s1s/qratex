/**
 * globals.css'teki CSS değişken bloklarını çözen küçük ayrıştırıcı.
 * Yalnız Jest kontrast testi ve araçlar için (tarayıcıda canlı değerler
 * `getComputedStyle` ile okunur). Dosya sistemi erişimi YOK — metni alır.
 */

export type VarMap = Record<string, string>;

/** Seçici listesi tam eşleşen tüm blokların değişkenlerini birleştirir (sırayla). */
export function extractVarsForSelector(css: string, selector: string): VarMap {
  const out: VarMap = {};
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const target = norm(selector);
  // Yorumları sil
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const selectors = m[1].split(',').map(norm);
    if (!selectors.includes(target)) continue;
    // @media içindeki bloklar ayrıştırıcıda aynı görünür; yalnız üst düzey
    // bloklar istenir → bloktan önceki son '@media' açılışı kapanmamışsa atla.
    if (isInsideMedia(text, m.index)) continue;
    for (const decl of m[2].split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      const key = decl.slice(0, idx).trim();
      if (!key.startsWith('--')) continue;
      out[key.slice(2)] = decl.slice(idx + 1).trim();
    }
  }
  return out;
}

function isInsideMedia(text: string, index: number): boolean {
  // index'ten geriye doğru parantez dengesi: en yakın kapanmamış '{' bir @media'ya aitse true.
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) {
        const head = text.slice(Math.max(0, text.lastIndexOf('}', i - 1) + 1), i);
        return /@media|@supports|@container/.test(head);
      }
      depth--;
    }
  }
  return false;
}

/** `var(--x)` / `var(--x, fallback)` referanslarını özyinelemeli çözer. */
export function resolveVar(vars: VarMap, name: string, depth = 0): string | null {
  const raw = vars[name];
  if (raw == null || depth > 20) return null;
  return raw.replace(/var\(--([a-z0-9-]+)(?:\s*,\s*([^)]+))?\)/gi, (_, ref: string, fallback?: string) => {
    const v = resolveVar(vars, ref, depth + 1);
    return v ?? fallback?.trim() ?? '';
  });
}

/** Birden çok blok haritasını katman sırasıyla birleştirir (sonraki kazanır). */
export function layerVars(...maps: VarMap[]): VarMap {
  return Object.assign({}, ...maps);
}
