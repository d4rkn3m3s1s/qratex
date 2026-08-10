import { Resend } from 'resend';
import nodemailer from 'nodemailer';

export type MailDeliveryChannel = 'smtp' | 'resend';

/** Başarıda kullanılan kanal ve gönderen (admin test / log için). */
export type SendMailResult =
  | {
      ok: true;
      channel: MailDeliveryChannel;
      effectiveFrom: string;
      /** SMTP 535 vb. sonrası Resend ile teslim edildiyse true */
      usedResendAfterSmtpFailure?: boolean;
    }
  | { ok: false; error: string };

const fromDefault = process.env.EMAIL_FROM || 'QRATEX <onboarding@resend.dev>';

/** .env'de yanlışlıkla kalan çift tırnak / tek tırnak sarmalayıcılarını kaldırır */
function trimEnvValue(raw: string | undefined): string {
  if (raw == null) return '';
  let t = raw.trim();
  if (t.length >= 2) {
    const q = t[0];
    if ((q === '"' || q === "'") && t[t.length - 1] === q) {
      t = t.slice(1, -1).trim();
    }
  }
  return t;
}

function getSmtpCredentials():
  | {
      host: string;
      user: string;
      pass: string;
      port: number;
      secure: boolean;
    }
  | null {
  const host = trimEnvValue(process.env.SMTP_HOST);
  const user = trimEnvValue(process.env.SMTP_USER);
  let pass = trimEnvValue(process.env.SMTP_PASS || process.env.SMTP_PASSWORD);
  if (!host || !user || !pass) return null;
  // Google app password: spaces are cosmetic. Unquoted "vqnl ofpt ..." in .env often parses as only "vqnl".
  if (host.toLowerCase() === 'smtp.gmail.com') {
    const compact = pass.replace(/\s+/g, '');
    if (process.env.NODE_ENV === 'development' && compact.length !== 16) {
      console.warn(
        '[mail-sender] Gmail app passwords are usually 16 characters (no spaces). Current length:',
        compact.length,
        '— Use one line in .env, e.g. SMTP_PASS="vqnl ofpt osmz ntyj" or paste without spaces.'
      );
    }
    pass = compact;
  }
  const port = parseInt(trimEnvValue(process.env.SMTP_PORT) || '587', 10);
  const secureFlag = trimEnvValue(process.env.SMTP_SECURE);
  const secure =
    secureFlag === 'true' || secureFlag === '1' || (Number.isFinite(port) && port === 465);
  return {
    host,
    user,
    pass,
    port: Number.isFinite(port) ? port : 587,
    secure,
  };
}

function smtpConfigured(): boolean {
  return getSmtpCredentials() !== null;
}

function resendConfigured(): boolean {
  return Boolean(trimEnvValue(process.env.RESEND_API_KEY));
}

/**
 * Resend yalnızca doğrulanmış gönderen kabul eder. Gmail "from" ile çağrı çoğunlukla başarısız olur.
 * RESEND_FROM doluysa onu kullan; yoksa EMAIL_FROM içinde gmail vb. yoksa EMAIL_FROM; aksi halde Resend test adresi.
 */
function fromAddressForResend(fallbackFrom: string): string {
  const override = trimEnvValue(process.env.RESEND_FROM);
  if (override) {
    return override.includes('<') && override.includes('>') ? override : `QRATEX <${override}>`;
  }
  const primary = trimEnvValue(process.env.EMAIL_FROM) || trimEnvValue(fallbackFrom);
  const lower = primary.toLowerCase();
  if (
    lower.includes('@gmail.com') ||
    lower.includes('@googlemail.com') ||
    lower.includes('@yahoo.') ||
    lower.includes('@hotmail.') ||
    lower.includes('@outlook.')
  ) {
    return 'QRATEX <onboarding@resend.dev>';
  }
  return primary || 'QRATEX <onboarding@resend.dev>';
}

function smtpFallbackToResendEnabled(): boolean {
  const v = trimEnvValue(process.env.SMTP_FALLBACK_RESEND);
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

function isSmtpAuthFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: string; responseCode?: number; message?: string };
  if (o.code === 'EAUTH') return true;
  if (o.responseCode === 535) return true;
  if (typeof o.message === 'string' && o.message.includes('535')) return true;
  return false;
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from: string;
  replyTo?: string;
  headers?: Record<string, string>;
}): Promise<SendMailResult> {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.info('[mail-sender] Using Resend API');
    }
    const key = trimEnvValue(process.env.RESEND_API_KEY);
    if (!key) return { ok: false, error: 'RESEND_API_KEY eksik' };
    const from = fromAddressForResend(params.from);
    if (process.env.NODE_ENV === 'development' && from.trim() !== trimEnvValue(params.from)) {
      console.info('[mail-sender] Resend from:', from, '(EMAIL_FROM Gmail vb. olduğu için Resend uyumlu adres kullanıldı; kalıcı çözüm: RESEND_FROM veya kendi domaininizi Resend’de doğrulayın)');
    }
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.headers ? { headers: params.headers } : {}),
    });
    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[mail-sender] Resend API error:', error);
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, channel: 'resend', effectiveFrom: from };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Resend gönderilemedi';
    return { ok: false, error: message };
  }
}

/**
 * Önce SMTP (Gmail vb.), yoksa Resend. İkisi de yoksa ok:false.
 */
export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
  /** multipart/alternative; spam skoru ve salt metin istemcileri için önerilir */
  text?: string;
  from?: string;
  /** Yanıt adresi (Reply-To) — meşru gönderen sinyali, spam skorunu düşürür. */
  replyTo?: string;
  /** Ek başlıklar (ör. List-Unsubscribe) — teslim edilebilirlik için. */
  headers?: Record<string, string>;
}): Promise<SendMailResult> {
  const from = params.from?.trim() || fromDefault;
  const replyTo = params.replyTo?.trim() || trimEnvValue(process.env.EMAIL_REPLY_TO) || undefined;

  const smtp = getSmtpCredentials();
  if (smtp) {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.info('[mail-sender] Using SMTP transport', smtp.host);
      }
      // Per-gönderim timeout'ları: asılı bir SMTP bağlantısı tüm serverless bütçesini (60s)
      // yiyip toplu gönderimi kesmesin. 15s bağlantı/greeting/socket sınırı.
      const timeouts = { connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000 };
      const isGmailHost = smtp.host.toLowerCase() === 'smtp.gmail.com';
      const transporter = isGmailHost
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: { user: smtp.user, pass: smtp.pass },
            ...timeouts,
          })
        : nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: {
              user: smtp.user,
              pass: smtp.pass,
            },
            ...timeouts,
          });
      await transporter.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(params.headers ? { headers: params.headers } : {}),
      });
      return { ok: true, channel: 'smtp', effectiveFrom: from };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'SMTP gönderilemedi';
      console.warn('[mail-sender] SMTP error:', e);
      // HERHANGİ bir SMTP hatasında Resend'e düş (sadece auth değil: timeout/bağlantı/rate-limit de).
      // "Herkese mail gitmiyor"un ana nedeni buydu — auth-dışı hatada fallback yoktu.
      if (resendConfigured() && smtpFallbackToResendEnabled()) {
        if (isSmtpAuthFailure(e)) {
          console.warn('[mail-sender] SMTP giriş reddedildi (535/EAUTH). Gmail app password yenile / SMTP_USER eşleştir. Resend yedeğe geçiliyor.');
        } else {
          console.warn('[mail-sender] SMTP hatası (auth-dışı). Resend yedeğe geçiliyor:', message);
        }
        const r = await sendViaResend({ ...params, from, replyTo });
        if (r.ok) {
          return { ...r, usedResendAfterSmtpFailure: true };
        }
        return { ok: false, error: `SMTP: ${message} | Resend yedek: ${r.error}` };
      }
      return { ok: false, error: message };
    }
  }

  if (resendConfigured()) {
    return sendViaResend({ ...params, from, replyTo });
  }

  return { ok: false, error: 'E-posta yapılandırılmadı (SMTP veya RESEND_API_KEY)' };
}

export function isMailConfigured(): boolean {
  return smtpConfigured() || resendConfigured();
}

/** Hassas değer yok — sağlık / ayar ekranları için SMTP+Resend özeti */
export type MailDeliverySummary = {
  configured: boolean;
  smtp: boolean;
  resend: boolean;
};

export function getMailDeliverySummary(): MailDeliverySummary {
  return {
    configured: smtpConfigured() || resendConfigured(),
    smtp: smtpConfigured(),
    resend: resendConfigured(),
  };
}
