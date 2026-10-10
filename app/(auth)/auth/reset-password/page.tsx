import { prisma } from '@/lib/prisma';
import { AUTH_TOKEN_PURPOSE, hashAuthToken, isPlausibleToken } from '@/lib/auth-email-token';
import { maskEmail } from '@/lib/http/dto';
import { firstParam } from '@/components/auth/p-auth/server-data';
import { ResetPasswordView, type ResetTokenStatus } from './reset-password-view';

/**
 * /auth/reset-password — bağlantı SUNUCUDA, yan etkisiz olarak ön-doğrulanır: süresi dolmuş /
 * kullanılmış bağlantıda kullanıcı iki şifreyi boşuna yazıp gönderdikten sonra hata görmez,
 * doğrudan "yeni bağlantı iste" ekranını görür; geçerliyse kalan süre ve hesabın (maskeli)
 * e-postası gösterilir, parola yöneticisi yeni şifreyi doğru hesapla eşleştirir.
 * Token burada TÜKETİLMEZ (e-posta tarayıcılarının ön-yüklemesi bağlantıyı yakmaz).
 * DB okunamazsa durum `unknown` olur ve form yine açılır (sunucu POST'ta doğrular).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = (firstParam(sp.token) ?? '').trim().slice(0, 512);
  let status: ResetTokenStatus = 'invalid';
  let account: { email: string; masked: string; minutesLeft: number } | null = null;
  if (token && isPlausibleToken(token)) {
    try {
      const now = new Date();
      const row = await prisma.authEmailToken.findFirst({
        where: {
          tokenHash: hashAuthToken(token),
          purpose: AUTH_TOKEN_PURPOSE.PASSWORD_RESET,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        select: { expiresAt: true, user: { select: { email: true } } },
      });
      if (row) {
        status = 'valid';
        account = {
          email: row.user.email,
          masked: maskEmail(row.user.email),
          minutesLeft: Math.max(1, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 60_000)),
        };
      }
    } catch {
      status = 'unknown';
    }
  }
  return (
    <ResetPasswordView token={token} initialStatus={status} account={account} rawCallback={firstParam(sp.callbackUrl)} />
  );
}
