import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Rota taraması: yatay taşma, dokunma hedefi (<44×44 px, `main` içinde), metin kontrastı
 * (WCAG AA: normal 4.5, büyük 3.0) ve axe-core (WCAG 2.0/2.1/2.2 A+AA) ihlalleri.
 * Ölçüm betiği e2e turundaki (.wf-tmp/e2e/x-tema-erisilebilirlik/sweep.cjs) taramanın kalıcı hâli.
 */
export type ScanResult = {
  overflowPx: number;
  smallTargets: string[];
  lowContrast: string[];
  axe: Array<{ id: string; impact: string | null; help: string; nodes: number; targets: string[] }>;
};

function measureInPage() {
  const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const small: string[] = [];
  const lowc: string[] = [];
  const lum = (c: string) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map((x) => {
      const v = Number(x) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return { L: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m[3] === undefined ? 1 : Number(m[3]) };
  };
  const bgOf = (start: Element | null): number | null => {
    let el = start;
    while (el) {
      const s = getComputedStyle(el);
      if (s.backgroundImage !== 'none') return null; // görsel/degrade zemin: ölçülemez, atla
      const l = lum(s.backgroundColor);
      if (l && l.a > 0.9) return l.L;
      if (l && l.a > 0.3) return null; // yarı saydam katman: güvenilir ölçüm yok
      el = el.parentElement;
    }
    return document.documentElement.classList.contains('dark') ? 0 : 1;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
  };
  const describe = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(
      el.getAttribute('aria-label') ||
      (el as HTMLElement).innerText ||
      el.getAttribute('title') ||
      ''
    )
      .trim()
      .slice(0, 30)}"`;

  document
    .querySelectorAll('main a, main button, main [role=tab], main [role=button], main input:not([type=hidden]), main select')
    .forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.height < 44 && r.width < 44) small.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });

  document.querySelectorAll('body *').forEach((el) => {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim())
      .map((n) => n.textContent)
      .join('')
      .trim();
    if (!text || !visible(el)) return;
    if (el.closest('[aria-hidden=true],svg,[disabled],[aria-disabled=true]')) return;
    let op = 1;
    for (let e: Element | null = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op < 0.6) return;
    const s = getComputedStyle(el);
    const fg = lum(s.color);
    if (!fg || fg.a < 0.6) return;
    const bg = bgOf(el);
    if (bg == null) return;
    const ratio = (Math.max(fg.L, bg) + 0.05) / (Math.min(fg.L, bg) + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) lowc.push(`"${text.slice(0, 30)}" ${ratio.toFixed(2)}`);
  });

  return { overflowPx, smallTargets: [...new Set(small)], lowContrast: [...new Set(lowc)] };
}

export async function scanPage(page: Page): Promise<ScanResult> {
  const m = await page.evaluate(measureInPage);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
    .then((r) =>
      r.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => String(n.target.join(' '))),
      }))
    )
    .catch((e: Error) => [{ id: 'axe-run-error', impact: 'serious', help: e.message.slice(0, 200), nodes: 1, targets: [] }]);
  return { ...m, axe };
}

/** Kalite kapısı çıktısı: her test kendi dosyasını yazar (paralel işçiler çakışmaz). */
export function writeGateRecord(name: string, data: unknown) {
  const dir = process.env.GATES_OUT;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name.replace(/[^a-z0-9]+/gi, '_')}.json`), JSON.stringify(data, null, 1));
}
