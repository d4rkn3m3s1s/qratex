import { sendTransactionalEmail } from '@/lib/mail-sender';
import { BRAND_PRIMARY_HEX } from '@/lib/brand-colors';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import {
  buildTransactionalEmailHtml,
  buildTransactionalPlainText,
  escapeEmailHtml,
  getTransactionalEmailLogoUrl,
} from '@/lib/transactional-email';

const fromEmail = process.env.EMAIL_FROM || 'QRATEX <onboarding@resend.dev>';

function transactionalBranding() {
  const siteUrl = getPublicAppOrigin();
  return {
    siteUrl,
    logoUrl: getTransactionalEmailLogoUrl(siteUrl),
    brandLinkHref: siteUrl,
  };
}

/**
 * E-posta doğrulama linki gönderir. RESEND_API_KEY yoksa sessizce atlar (kayıt yine de verifyUrl döner).
 */
export async function sendVerificationEmail(to: string, verifyUrl: string, userName?: string): Promise<{ ok: boolean; error?: string }> {
  const subject = 'QRATEX — E-posta adresinizi doğrulayın';
  const { logoUrl, brandLinkHref } = transactionalBranding();
  const html = buildTransactionalEmailHtml({
    heading: 'QRATEX',
    bodyHtml: `<p>Merhaba${userName ? ` ${escapeEmailHtml(userName)}` : ''},</p>
  <p>Hesabınızı oluşturdunuz. Giriş yapmak için aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın:</p>`,
    cta: { href: verifyUrl, label: 'E-postamı doğrula' },
    footnoteHtml: `<p class="tx-email-muted" style="font-size: 14px; color: #666;">Bu link 24 saat geçerlidir. Eğer bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
    logoUrl,
    brandLinkHref,
  });
  const text = buildTransactionalPlainText({
    heading: 'QRATEX',
    bodyLines: [
      userName ? `Merhaba ${userName},` : 'Merhaba,',
      'Hesabınızı oluşturdunuz. Giriş yapmak için aşağıdaki bağlantıyı kullanın:',
    ],
    cta: { href: verifyUrl, label: 'E-postamı doğrula' },
    footnoteLines: ['Bu link 24 saat geçerlidir. Eğer bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz.'],
  });
  const result = await sendTransactionalEmail({ to, subject, html, text, from: fromEmail });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * KVKK başvuru makbuzu — RESEND yoksa false döner (kayıt yine oluşturulur).
 */
export async function sendKvkkReceiptEmail(
  to: string,
  payload: { requestId: string; type: string; createdAt: string }
): Promise<{ ok: boolean; error?: string }> {
  const subject = `QRATEX — Başvurunuz alındı (${payload.requestId.slice(0, 8)})`;
  const rid = escapeEmailHtml(payload.requestId);
  const typ = escapeEmailHtml(payload.type);
  const dt = escapeEmailHtml(payload.createdAt);
  const { logoUrl, brandLinkHref } = transactionalBranding();
  const extraHtml = `<table class="tx-email-card" role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 20px 0; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
    <tr><td style="padding: 14px 16px; border-bottom: 1px solid #e2e8f0;"><span class="tx-email-card-label" style="color: #64748b; font-size: 13px;">Referans</span><br><strong style="font-size: 15px; word-break: break-all;">${rid}</strong></td></tr>
    <tr><td style="padding: 14px 16px; border-bottom: 1px solid #e2e8f0;"><span class="tx-email-card-label" style="color: #64748b; font-size: 13px;">Tür</span><br><strong style="font-size: 15px;">${typ}</strong></td></tr>
    <tr><td style="padding: 14px 16px;"><span class="tx-email-card-label" style="color: #64748b; font-size: 13px;">Tarih</span><br><strong style="font-size: 15px;">${dt}</strong></td></tr>
  </table>`;
  const html = buildTransactionalEmailHtml({
    heading: 'Başvuru makbuzu',
    bodyHtml: '<p>Merhaba, KVKK kapsamındaki talebiniz kaydedildi. Özet bilgiler aşağıdadır.</p>',
    extraHtml,
    footnoteHtml: `<p class="tx-email-muted" style="font-size: 14px; color: #666;">Bu e-posta bilgilendirme amaçlıdır. Ek işlem gerekmiyorsa yanıtlamanız gerekmez.</p>`,
    logoUrl,
    brandLinkHref,
  });
  const text = buildTransactionalPlainText({
    heading: 'Başvuru makbuzu',
    bodyLines: [
      'Merhaba, KVKK kapsamındaki talebiniz kaydedildi.',
      `Referans: ${payload.requestId}`,
      `Tür: ${payload.type}`,
      `Tarih: ${payload.createdAt}`,
    ],
    footnoteLines: ['Bu e-posta bilgilendirme amaçlıdır. Ek işlem gerekmiyorsa yanıtlamanız gerekmez.'],
  });
  const result = await sendTransactionalEmail({ to, subject, html, text, from: fromEmail });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  userName?: string
): Promise<{ ok: boolean; error?: string }> {
  const subject = 'QRATEX — Şifre sıfırlama';
  const { logoUrl, brandLinkHref } = transactionalBranding();
  const html = buildTransactionalEmailHtml({
    heading: 'QRATEX',
    bodyHtml: `<p>Merhaba${userName ? ` ${escapeEmailHtml(userName)}` : ''},</p>
  <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın. Bu isteği siz yapmadıysanız e-postayı yok sayın.</p>`,
    cta: { href: resetUrl, label: 'Şifremi sıfırla' },
    footnoteHtml: `<p class="tx-email-muted" style="font-size: 14px; color: #666;">Link yaklaşık 1 saat geçerlidir.</p>`,
    logoUrl,
    brandLinkHref,
  });
  const text = buildTransactionalPlainText({
    heading: 'QRATEX',
    bodyLines: [
      userName ? `Merhaba ${userName},` : 'Merhaba,',
      'Şifrenizi sıfırlamak için aşağıdaki bağlantıyı kullanın. Bu isteği siz yapmadıysanız bu e-postayı yok sayın.',
    ],
    cta: { href: resetUrl, label: 'Şifremi sıfırla' },
    footnoteLines: ['Link yaklaşık 1 saat geçerlidir.'],
  });
  const result = await sendTransactionalEmail({ to, subject, html, text, from: fromEmail });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function sendMagicLinkEmail(
  to: string,
  magicUrl: string,
  userName?: string
): Promise<{ ok: boolean; error?: string }> {
  const subject = 'QRATEX — Giriş bağlantınız';
  const { logoUrl, brandLinkHref } = transactionalBranding();
  const html = buildTransactionalEmailHtml({
    heading: 'QRATEX',
    bodyHtml: `<p>Merhaba${userName ? ` ${escapeEmailHtml(userName)}` : ''},</p>
  <p>Tek kullanımlık giriş bağlantınız:</p>`,
    cta: { href: magicUrl, label: 'Giriş yap' },
    footnoteHtml: `<p class="tx-email-muted" style="font-size: 14px; color: #666;">Link kısa süre geçerlidir; yalnızca bir kez kullanılabilir.</p>`,
    logoUrl,
    brandLinkHref,
  });
  const text = buildTransactionalPlainText({
    heading: 'QRATEX',
    bodyLines: [userName ? `Merhaba ${userName},` : 'Merhaba,', 'Tek kullanımlık giriş bağlantınız:'],
    cta: { href: magicUrl, label: 'Giriş yap' },
    footnoteLines: ['Link kısa süre geçerlidir; yalnızca bir kez kullanılabilir.'],
  });
  const result = await sendTransactionalEmail({ to, subject, html, text, from: fromEmail });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/** Admin test e-postası — HTML + düz metin (aynı transactional şablon). */
export function buildAdminTestEmail(baseUrl: string): { html: string; text: string } {
  const origin = baseUrl.replace(/\/$/, '');
  const logoUrl = getTransactionalEmailLogoUrl(origin);
  const html = buildTransactionalEmailHtml({
    heading: 'QRATEX',
    bodyHtml: `<p style="font-size: 16px;">Bu bir <strong>yönetici test e-postasıdır</strong>. Gönderim kanalınız (SMTP veya Resend) düzgün çalışıyor.</p>`,
    cta: { href: baseUrl, label: 'Uygulamayı aç' },
    footnoteHtml: `<p class="tx-email-muted" style="font-size: 14px; color: #666;">Kök URL: <a class="tx-email-link" href="${escapeEmailHtml(baseUrl)}" style="color: ${BRAND_PRIMARY_HEX};">${escapeEmailHtml(baseUrl)}</a></p>`,
    logoUrl,
    brandLinkHref: origin,
  });
  const text = buildTransactionalPlainText({
    heading: 'QRATEX',
    bodyLines: [
      'Bu bir yönetici test e-postasıdır. Gönderim kanalınız (SMTP veya Resend) düzgün çalışıyor.',
      `Kök URL: ${baseUrl}`,
    ],
    cta: { href: baseUrl, label: 'Uygulamayı aç' },
  });
  return { html, text };
}

/**
 * Yönetici panelinden gönderilen metin (logo şeridi + dipnot; HTML kaçışlı).
 */
export function buildAdminComposeEmail(input: {
  siteUrl: string;
  /** E-posta konusu ile aynı — gövde başlığı (H2). */
  subjectHeading: string;
  messagePlain: string;
}): { html: string; text: string } {
  const origin = input.siteUrl.replace(/\/$/, '');
  const logoUrl = getTransactionalEmailLogoUrl(origin);
  const paras = input.messagePlain
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const bodyHtml =
    paras.length > 0
      ? paras
          .map((p) => {
            const esc = escapeEmailHtml(p).replace(/\n/g, '<br />');
            return `<p style="margin:0 0 14px 0;font-size:15px;">${esc}</p>`;
          })
          .join('')
      : `<p style="margin:0 0 14px 0;font-size:15px;">${escapeEmailHtml(input.messagePlain.trim()).replace(/\n/g, '<br />')}</p>`;
  const html = buildTransactionalEmailHtml({
    heading: input.subjectHeading,
    bodyHtml,
    footnoteHtml: `<p class="tx-email-muted" style="font-size: 14px; color: #666;">Bu mesaj QRATEX yönetici panelinden gönderilmiştir.</p>`,
    logoUrl,
    brandLinkHref: origin,
  });
  const text = buildTransactionalPlainText({
    heading: input.subjectHeading,
    bodyLines: paras.length ? paras : [input.messagePlain.trim()],
    footnoteLines: ['Bu mesaj QRATEX yönetici panelinden gönderilmiştir.', `Site: ${origin}`],
  });
  return { html, text };
}
