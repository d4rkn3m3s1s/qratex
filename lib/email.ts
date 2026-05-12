import { Resend } from 'resend';
import { BRAND_PRIMARY_HEX, BRAND_PRIMARY_HEX_DEEP } from '@/lib/brand-colors';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.EMAIL_FROM || 'QRATEX <onboarding@resend.dev>';

function getClient(): Resend | null {
  if (!resendApiKey) return null;
  return new Resend(resendApiKey);
}

/**
 * E-posta doğrulama linki gönderir. RESEND_API_KEY yoksa sessizce atlar (kayıt yine de verifyUrl döner).
 */
export async function sendVerificationEmail(to: string, verifyUrl: string, userName?: string): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false };

  const subject = 'QRATEX - E-posta adresinizi doğrulayın';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: ${BRAND_PRIMARY_HEX_DEEP};">QRATEX</h2>
  <p>Merhaba${userName ? ` ${userName}` : ''},</p>
  <p>Hesabınızı oluşturdunuz. Giriş yapmak için aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın:</p>
  <p style="margin: 24px 0;">
    <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(to right, ${BRAND_PRIMARY_HEX_DEEP}, ${BRAND_PRIMARY_HEX}); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">E-postamı doğrula</a>
  </p>
  <p style="font-size: 14px; color: #666;">Bu link 24 saat geçerlidir. Eğer bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
  <p style="font-size: 12px; color: #999; margin-top: 32px;">QRATEX - QR Tabanlı Geri Bildirim Platformu</p>
</body>
</html>
  `.trim();

  try {
    const { error } = await client.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });
    if (error) {
      console.warn('Resend send error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'E-posta gönderilemedi';
    console.warn('Verification email send failed:', err);
    return { ok: false, error: message };
  }
}

/**
 * KVKK başvuru makbuzu — RESEND yoksa false döner (kayıt yine oluşturulur).
 */
export async function sendKvkkReceiptEmail(
  to: string,
  payload: { requestId: string; type: string; createdAt: string }
): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: 'E-posta yapılandırılmadı' };

  const subject = `QRATEX — Başvurunuz alındı (${payload.requestId.slice(0, 8)})`;
  const html = `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
  <h2 style="color:${BRAND_PRIMARY_HEX_DEEP};">Başvuru makbuzu</h2>
  <p>Talebiniz kaydedildi.</p>
  <ul>
    <li><strong>Referans:</strong> ${payload.requestId}</li>
    <li><strong>Tür:</strong> ${payload.type}</li>
    <li><strong>Tarih:</strong> ${payload.createdAt}</li>
  </ul>
  <p style="font-size:14px;color:#666;">Kişisel verileriniz KVKK kapsamında işlenir. İşlem süresi tipik olarak 30 günü geçmez; karmaşık taleplerde yasal süre uygulanır.</p>
</body></html>
`.trim();

  try {
    const { error } = await client.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gönderilemedi';
    return { ok: false, error: message };
  }
}
