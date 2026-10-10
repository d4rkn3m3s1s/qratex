/**
 * Hassas işlem yeniden doğrulaması (sunucu). Karar kuralları `reauth.ts`'te (saf).
 * Hata mesajları Türkçe; istemci `code` ile kendi dilinde gösterir.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyTOTP } from '@/lib/totp';
import type { ReauthMethod, SettingsErrorCode } from './contract';
import { isRecentLogin, requiredReauthMethods } from './reauth';

export interface ReauthInput {
  password?: string;
  totp?: string;
}

export type ReauthResult =
  | { ok: true; methods: ReauthMethod[] }
  | { ok: false; code: SettingsErrorCode; message: string; status: number; methods: ReauthMethod[] };

export interface ReauthRequirements {
  methods: ReauthMethod[];
  /** `recent-login` yöntemi için: bu oturum yeterince taze mi? */
  recentLoginFresh: boolean;
}

async function sessionStartedAt(jti: string | null | undefined): Promise<Date | null> {
  if (!jti) return null;
  const row = await prisma.sessionTokenUsage.findUnique({ where: { jti }, select: { createdAt: true } });
  return row?.createdAt ?? null;
}

export async function getReauthRequirements(userId: string, jti: string | null | undefined, now = new Date()): Promise<ReauthRequirements> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true, twoFactorEnabled: true } });
  const methods = requiredReauthMethods({ hasPassword: !!user?.password, twoFactorEnabled: !!user?.twoFactorEnabled });
  const recentLoginFresh = methods.includes('recent-login') ? isRecentLogin(await sessionStartedAt(jti), now) : false;
  return { methods, recentLoginFresh };
}

export async function verifySensitiveReauth(
  userId: string,
  input: ReauthInput,
  ctx: { jti?: string | null; now?: Date } = {},
): Promise<ReauthResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user) {
    return { ok: false, code: 'REAUTH_REQUIRED', message: 'Hesap bulunamadı.', status: 404, methods: [] };
  }
  const methods = requiredReauthMethods({ hasPassword: !!user.password, twoFactorEnabled: !!user.twoFactorEnabled });

  if (methods.includes('password')) {
    const pw = typeof input.password === 'string' ? input.password : '';
    if (!pw) return { ok: false, code: 'REAUTH_PASSWORD', message: 'Güvenlik için mevcut şifreni gir.', status: 400, methods };
    const valid = await bcrypt.compare(pw, user.password as string);
    if (!valid) return { ok: false, code: 'REAUTH_PASSWORD', message: 'Şifre hatalı.', status: 400, methods };
  }

  if (methods.includes('totp')) {
    const code = (input.totp ?? '').trim();
    if (!/^\d{6}$/.test(code) || !user.twoFactorSecret || !verifyTOTP(user.twoFactorSecret, code)) {
      return { ok: false, code: 'REAUTH_TOTP', message: 'Doğrulama kodu hatalı ya da süresi geçmiş.', status: 400, methods };
    }
  }

  if (methods.includes('recent-login')) {
    const fresh = isRecentLogin(await sessionStartedAt(ctx.jti), ctx.now ?? new Date());
    if (!fresh) {
      return {
        ok: false,
        code: 'REAUTH_RECENT_LOGIN',
        message: 'Güvenlik için çıkış yapıp yeniden giriş yapman gerekiyor.',
        status: 403,
        methods,
      };
    }
  }

  return { ok: true, methods };
}
