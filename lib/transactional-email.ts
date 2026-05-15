import { BRAND_PRIMARY_HEX, BRAND_PRIMARY_HEX_DEEP } from '@/lib/brand-colors';

export type TransactionalCta = { href: string; label: string };

/** Ortak <head>: viewport, color-scheme, koyu tema için sınırlı destek (Apple Mail, iOS Mail, bazı istemciler). */
export const TRANSACTIONAL_EMAIL_HEAD = `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style type="text/css">
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      .tx-email-outer { background-color: #0f172a !important; }
      .tx-email-card { background-color: #1e293b !important; border-color: #334155 !important; }
      .tx-email-body { color: #e2e8f0 !important; }
      .tx-email-h2 { color: #c4b5fd !important; }
      .tx-email-muted { color: #94a3b8 !important; }
      .tx-email-foot { color: #64748b !important; }
      .tx-email-card-inner td { border-color: #334155 !important; }
      .tx-email-card-label { color: #94a3b8 !important; }
      .tx-email-card strong { color: #f1f5f9 !important; }
      .tx-email-link { color: #38bdf8 !important; }
      .tx-email-logo-wrap { background: linear-gradient(145deg, #1e1b4b 0%, #1e293b 55%, #0f172a 100%) !important; border-color: #4c1d95 !important; }
      .tx-email-brand-title { color: #ddd6fe !important; }
      .tx-email-brand-sub { color: #94a3b8 !important; }
    }
  </style>
</head>`;

const TX_OUTER =
  'margin:0;padding:24px 14px;background-color:#f1f5f9;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;';

const TX_FOOTER_HTML =
  '<p class="tx-email-foot" style="font-size:12px;color:#94a3b8;margin:28px 0 0 0;text-align:center;line-height:1.5;">QRATEX · QR tabanlı geri bildirim platformu</p>';

/** href / metin içi güvenli kaçış (kullanıcı veya DB kaynaklı değerler için). */
export function escapeEmailHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Gmail vb. istemciler uzaktan görseli çeker; localhost / loopback adreslerinde img her zaman kırılır.
 * Yalnızca genel ağda çözümlenebilir kökenlerde harici logo URL’si döner.
 */
export function canUseRemoteEmailImages(publicOrigin: string): boolean {
  const raw = publicOrigin.trim().replace(/\/$/, '');
  if (!raw) return false;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]') return false;
    if (h.endsWith('.local') || h.endsWith('.localhost')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Mutlak logo URL’si; localhost vb. için `null` (şablonda tipografi markası kullanılır). */
export function getTransactionalEmailLogoUrl(publicOrigin: string): string | null {
  const base = publicOrigin.replace(/\/$/, '');
  if (!canUseRemoteEmailImages(base)) return null;
  return `${base}/logo/logo-light.png`;
}

function ctaBlock(cta: TransactionalCta): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;">
  <tr>
    <td align="left">
      <a href="${escapeEmailHtml(cta.href)}" style="display:inline-block;background:linear-gradient(135deg,${BRAND_PRIMARY_HEX_DEEP},${BRAND_PRIMARY_HEX});color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(124,58,237,0.35);">${escapeEmailHtml(cta.label)}</a>
    </td>
  </tr>
</table>`;
}

/** Üst marka: uzaktan yüklenebilir kökte isteğe bağlı PNG; aksi halde sadece tipografi (kırık img yok). */
function emailBrandHeader(brandLinkHref: string, remoteLogoUrl: string | null): string {
  const href = escapeEmailHtml(brandLinkHref.replace(/\/$/, ''));
  const img =
    remoteLogoUrl && remoteLogoUrl.length > 0
      ? `<img src="${escapeEmailHtml(remoteLogoUrl)}" width="132" height="auto" alt="QRATEX" style="display:block;margin:0 auto 16px auto;max-width:132px;height:auto;border:0;outline:none;" />`
      : '';
  const titleFallback =
    remoteLogoUrl && remoteLogoUrl.length > 0
      ? `<p class="tx-email-brand-sub" style="margin:0;font-size:13px;line-height:1.45;color:#475569;font-weight:500;">QR tabanlı geri bildirim platformu</p>`
      : `<p class="tx-email-brand-title" style="margin:0 0 6px 0;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.04em;color:${BRAND_PRIMARY_HEX_DEEP};">QRATEX</p>
         <p class="tx-email-brand-sub" style="margin:0;font-size:12px;line-height:1.5;color:#64748b;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;">Geri bildirim platformu</p>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
  <tr>
    <td align="center" style="padding:0;">
      <a href="${href}" style="text-decoration:none;display:block;" target="_blank" rel="noopener noreferrer">
        <table role="presentation" class="tx-email-logo-wrap" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;border-radius:16px;border:1px solid #e9d5ff;background:linear-gradient(145deg,#faf5ff 0%,#ffffff 42%,#f1f5f9 100%);">
          <tr>
            <td style="padding:30px 28px;text-align:center;">
              ${img}
              ${titleFallback}
            </td>
          </tr>
        </table>
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Tüm işlem e-postaları için tek HTML iskeleti: marka üst şeridi, başlık, gövde, CTA, dipnot.
 * Logo: canlı domainde PNG; geliştirme (localhost) dahil her yerde tipografi ile kırık img önlenir.
 */
export function buildTransactionalEmailHtml(input: {
  heading: string;
  bodyHtml: string;
  /** CTA’dan önce (ör. KVKK tablosu) */
  extraHtml?: string;
  cta?: TransactionalCta;
  footnoteHtml?: string;
  /** Mutlak logo URL’si; `null` / atlanırsa yalnızca tipografi markası */
  logoUrl?: string | null;
  brandLinkHref?: string;
}): string {
  const h = escapeEmailHtml(input.heading);
  const extra = input.extraHtml ?? '';
  const cta = input.cta ? ctaBlock(input.cta) : '';
  const foot = input.footnoteHtml ?? '';
  const brand =
    input.brandLinkHref != null && input.brandLinkHref.length > 0
      ? emailBrandHeader(input.brandLinkHref, input.logoUrl ?? null)
      : '';
  return `
<!DOCTYPE html>
<html lang="tr">
${TRANSACTIONAL_EMAIL_HEAD}
<body class="tx-email-outer" style="${TX_OUTER}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
    <tr>
      <td>
        ${brand}
        <table role="presentation" class="tx-email-card" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
          <tr>
            <td class="tx-email-body" style="padding:28px 26px 32px 26px;color:#334155;font-size:15px;line-height:1.65;">
              <h2 class="tx-email-h2" style="color:${BRAND_PRIMARY_HEX_DEEP};margin:0 0 18px 0;font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;">${h}</h2>
              ${input.bodyHtml}
              ${extra}
              ${cta}
              ${foot}
            </td>
          </tr>
        </table>
        ${TX_FOOTER_HTML}
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/** Spam filtreleri ve salt metin istemcileri için; bağlantılar açık URL ile verilir. */
export function buildTransactionalPlainText(input: {
  heading: string;
  bodyLines: string[];
  cta?: TransactionalCta;
  footnoteLines?: string[];
}): string {
  const lines: string[] = [input.heading, '', ...input.bodyLines];
  if (input.cta) {
    lines.push('', `${input.cta.label}: ${input.cta.href}`);
  }
  if (input.footnoteLines?.length) {
    lines.push('', ...input.footnoteLines);
  }
  lines.push('', '—', 'QRATEX - QR Tabanlı Geri Bildirim Platformu');
  return lines.join('\n').trim();
}
