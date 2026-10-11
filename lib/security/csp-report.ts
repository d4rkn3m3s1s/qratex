/**
 * CSP ihlal raporu normalizasyonu (guvenlik-admin-api B11) — app/api/security/csp-report.
 * Yalnız kökenler tutulur (yol/sorgu kişisel veri taşıyabilir).
 */

/** URL'yi kökene indirger (yol/sorgu kişisel veri taşıyabilir). */
function hostOnly(v: unknown): string {
  if (typeof v !== 'string' || !v) return '';
  if (/^(inline|eval|wasm-eval|self|data|blob)$/i.test(v)) return v.toLowerCase();
  try {
    const u = new URL(v);
    return u.protocol === 'data:' || u.protocol === 'blob:' ? u.protocol.replace(':', '') : u.origin;
  } catch {
    return v.slice(0, 40);
  }
}

export type CspReport = { directive: string; blocked: string; source: string; page: string };

/** Hem eski `application/csp-report` hem Reporting API (`application/reports+json`) biçimi. */
export function normalizeCspReports(body: unknown): CspReport[] {
  const items: Array<Record<string, unknown>> = [];
  if (Array.isArray(body)) {
    for (const r of body) {
      const b = (r as { body?: unknown })?.body;
      if (b && typeof b === 'object') items.push(b as Record<string, unknown>);
    }
  } else if (body && typeof body === 'object') {
    const legacy = (body as { 'csp-report'?: unknown })['csp-report'];
    if (legacy && typeof legacy === 'object') items.push(legacy as Record<string, unknown>);
  }
  return items.slice(0, 20).map((r) => {
    const pick = (...keys: string[]) => {
      for (const k of keys) if (typeof r[k] === 'string') return r[k] as string;
      return '';
    };
    let page = '';
    try {
      page = new URL(pick('document-uri', 'documentURL')).pathname.replace(/[0-9a-f]{8,}|\d{3,}/gi, ':id').slice(0, 80);
    } catch {
      page = '';
    }
    return {
      directive: pick('effective-directive', 'effectiveDirective', 'violated-directive').split(' ')[0].slice(0, 40),
      blocked: hostOnly(pick('blocked-uri', 'blockedURL')),
      source: hostOnly(pick('source-file', 'sourceFile')),
      page,
    };
  });
}
