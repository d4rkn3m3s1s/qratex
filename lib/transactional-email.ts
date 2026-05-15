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
      .tx-email-body { background-color: #0f172a !important; color: #e2e8f0 !important; }
      .tx-email-h2 { color: #7dd3fc !important; }
      .tx-email-muted { color: #94a3b8 !important; }
      .tx-email-foot { color: #64748b !important; }
      .tx-email-card { background-color: #1e293b !important; }
      .tx-email-card td { border-color: #334155 !important; }
      .tx-email-card-label { color: #94a3b8 !important; }
      .tx-email-card strong { color: #f1f5f9 !important; }
      .tx-email-link { color: #38bdf8 !important; }
      .tx-email-logo-wrap { background-color: #1e293b !important; border-color: #334155 !important; }
    }
  </style>
</head>`;

const TX_BODY_INLINE =
  'font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 480px; margin: 0 auto; padding: 24px;';

const TX_FOOTER_HTML =
  '<p class="tx-email-foot" style="font-size: 12px; color: #999; margin-top: 32px;">QRATEX - QR Tabanlı Geri Bildirim Platformu</p>';

/** href / metin içi güvenli kaçış (kullanıcı veya DB kaynaklı değerler için). */
export function escapeEmailHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ctaBlock(cta: TransactionalCta): string {
  return `<p style="margin: 24px 0;">
    <a href="${escapeEmailHtml(cta.href)}" style="display: inline-block; background: linear-gradient(to right, ${BRAND_PRIMARY_HEX_DEEP}, ${BRAND_PRIMARY_HEX}); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">${escapeEmailHtml(cta.label)}</a>
  </p>`;
}

/** Açık arka planlı üst şerit — `logo-light` ile uyumlu (paneldeki `/logo/logo-light.png`). */
export function getTransactionalEmailLogoUrl(publicOrigin: string): string {
  const base = publicOrigin.replace(/\/$/, '');
  return `${base}/logo/logo-light.png`;
}

function logoHeaderBlock(logoUrl: string, brandLinkHref: string): string {
  const href = escapeEmailHtml(brandLinkHref.replace(/\/$/, ''));
  const src = escapeEmailHtml(logoUrl);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
  <tr>
    <td align="center" class="tx-email-logo-wrap" style="padding:22px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      <a href="${href}" style="display:inline-block;text-decoration:none;" target="_blank" rel="noopener noreferrer">
        <img src="${src}" width="180" alt="QRATEX" style="display:block;max-width:180px;width:100%;height:auto;border:0;outline:none;" />
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Tüm işlem e-postaları için tek HTML iskeleti: isteğe bağlı logo, başlık, gövde, isteğe bağlı CTA, dipnot, footer.
 * Koyu sistem teması olan istemcilerde sınırlı dark stil (Gmail çoğunlukla yalnızca açık tema gösterir).
 */
export function buildTransactionalEmailHtml(input: {
  heading: string;
  bodyHtml: string;
  /** CTA’dan önce (ör. KVKK tablosu) */
  extraHtml?: string;
  cta?: TransactionalCta;
  footnoteHtml?: string;
  /** Tam logo URL’si (çoğu istemci için mutlak adres gerekir). */
  logoUrl?: string;
  /** Logo linki; boşsa `logoUrl` kökü kullanılamaz — her iki alan birlikte verilmelidir. */
  brandLinkHref?: string;
}): string {
  const h = escapeEmailHtml(input.heading);
  const extra = input.extraHtml ?? '';
  const cta = input.cta ? ctaBlock(input.cta) : '';
  const foot = input.footnoteHtml ?? '';
  const logo =
    input.logoUrl && input.brandLinkHref
      ? logoHeaderBlock(input.logoUrl, input.brandLinkHref)
      : '';
  return `
<!DOCTYPE html>
<html lang="tr">
${TRANSACTIONAL_EMAIL_HEAD}
<body class="tx-email-body" style="${TX_BODY_INLINE}">
  ${logo}
  <h2 class="tx-email-h2" style="color: ${BRAND_PRIMARY_HEX_DEEP}; margin-top: 0;">${h}</h2>
  ${input.bodyHtml}
  ${extra}
  ${cta}
  ${foot}
  ${TX_FOOTER_HTML}
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
