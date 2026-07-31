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

// Landing kimliği: koyu mor-lacivert zemin, fuchsia aksan, ışıltı.
const LANDING_BG_DARK = '#0f0f0f';
const LANDING_BG_MID = '#1a0a2e';
const LANDING_BG_DEEP = '#16213e';
const BRAND_FUCHSIA = '#e879f9';

// Dış zemin (tüm maili ortalar) + kart. Tablo-tabanlı: tüm mail istemcileriyle uyumlu.
// Not: font-family içinde ÇİFT tırnak kullanma — inline style attribute'unu erken kapatır. Tek tırnak.
const TX_BODY_INLINE =
  "margin:0;padding:0;background-color:#0b0713;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

const TX_FOOTER_HTML =
  '<p class="tx-email-foot" style="font-size:12px;color:#8b7ba8;margin:0;text-align:center;line-height:1.7;">QRate<span style="color:#e879f9;">X</span> · QR Tabanlı Geri Bildirim Platformu<br>Bu otomatik bir bildirimdir, lütfen yanıtlamayın.</p>';

/** href / metin içi güvenli kaçış (kullanıcı veya DB kaynaklı değerler için). */
export function escapeEmailHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ctaBlock(cta: TransactionalCta): string {
  // Landing CTA kimliği: mor→fuchsia gradient, ortalanmış "bulletproof" buton.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:30px 0;">
  <tr><td align="center">
    <a href="${escapeEmailHtml(cta.href)}" target="_blank" rel="noopener noreferrer"
       style="display:inline-block;background:${BRAND_PRIMARY_HEX};background-image:linear-gradient(135deg, ${BRAND_PRIMARY_HEX_DEEP} 0%, ${BRAND_PRIMARY_HEX} 55%, ${BRAND_FUCHSIA} 100%);color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 6px 18px rgba(147,51,234,0.35);">
      ${escapeEmailHtml(cta.label)} &rarr;
    </a>
  </td></tr>
</table>`;
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
  const foot = input.footnoteHtml
    ? `<p class="tx-email-muted" style="font-size:13px;color:#94a3b8;margin:20px 0 0;line-height:1.6;">${input.footnoteHtml}</p>`
    : '';
  // Logo verildiyse görsel; verilmediyse metin marka başlığı (ekip mailleri gibi).
  const brandMark =
    input.logoUrl && input.brandLinkHref
      ? `<a href="${escapeEmailHtml(input.brandLinkHref.replace(/\/$/, ''))}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
           <img src="${escapeEmailHtml(input.logoUrl)}" width="150" alt="QRateX" style="display:block;margin:0 auto;max-width:150px;height:auto;border:0;" />
         </a>`
      : `<span style="display:inline-block;font-size:26px;font-weight:800;letter-spacing:0.5px;color:#ffffff;">QRate<span style="color:${BRAND_FUCHSIA};">X</span></span>`;

  return `
<!DOCTYPE html>
<html lang="tr">
${TRANSACTIONAL_EMAIL_HEAD}
<body class="tx-email-body" style="${TX_BODY_INLINE}">
  <!-- Dış zemin: landing'in koyu mor-lacivert atmosferi -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0b0713;background-image:linear-gradient(160deg, ${LANDING_BG_DARK} 0%, ${LANDING_BG_MID} 55%, ${LANDING_BG_DEEP} 100%);padding:40px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <!-- Koyu gradient hero (landing zemini) + logo -->
        <tr>
          <td align="center" style="background:${LANDING_BG_MID};background-image:linear-gradient(135deg, ${LANDING_BG_DARK} 0%, ${LANDING_BG_MID} 60%, ${LANDING_BG_DEEP} 100%);padding:34px 24px 30px;">
            ${brandMark}
          </td>
        </tr>
        <!-- Işıltılı aksan şeridi: mor → fuchsia -->
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background:${BRAND_PRIMARY_HEX};background-image:linear-gradient(90deg, ${BRAND_PRIMARY_HEX_DEEP}, ${BRAND_PRIMARY_HEX}, ${BRAND_FUCHSIA});">&nbsp;</td>
        </tr>
        <!-- Kart gövdesi -->
        <tr>
          <td class="tx-email-card" style="background-color:#ffffff;padding:38px 34px;">
            <h1 class="tx-email-h2" style="margin:0 0 18px;font-size:23px;font-weight:800;color:#160a24;line-height:1.3;letter-spacing:-0.01em;">${h}</h1>
            <div style="font-size:15px;line-height:1.75;color:#3b3450;">
              ${input.bodyHtml}
            </div>
            ${extra}
            ${cta}
            ${foot}
          </td>
        </tr>
        <!-- Footer -->
        <tr><td style="background-color:#0b0713;padding:22px 16px;">${TX_FOOTER_HTML}</td></tr>
      </table>
    </td></tr>
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
