import { isPasswordResetTokenUsable } from '@/lib/auth-email-token';
import { firstParam } from '@/components/auth/p-auth/server-data';
import { ResetPasswordView, type ResetTokenStatus } from './reset-password-view';

/**
 * /auth/reset-password — bağlantı SUNUCUDA, yan etkisiz olarak ön-doğrulanır: süresi dolmuş /
 * kullanılmış bağlantıda kullanıcı iki şifreyi boşuna yazıp gönderdikten sonra hata görmez,
 * doğrudan "yeni bağlantı iste" ekranını görür. (Token burada TÜKETİLMEZ; e-posta tarayıcılarının
 * ön-yüklemesi bağlantıyı yakmaz.) DB okunamazsa durum `unknown` olur ve form açılır.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = (firstParam(sp.token) ?? '').trim().slice(0, 512);
  let status: ResetTokenStatus = 'invalid';
  if (token) {
    try {
      status = (await isPasswordResetTokenUsable(token)) ? 'valid' : 'invalid';
    } catch {
      status = 'unknown';
    }
  }
  return <ResetPasswordView token={token} initialStatus={status} rawCallback={firstParam(sp.callbackUrl)} />;
}
