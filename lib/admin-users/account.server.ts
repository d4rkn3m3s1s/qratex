/**
 * Hesap erişim işlemleri: davetle kullanıcı oluşturma ve şifre sıfırlama bağlantısı.
 *
 * Bulgu #51: admin şifreyi elle iletmek zorundaydı ve hesap otomatik "doğrulanmış"tı. Artık
 * varsayılan yol DAVET: hesap şifresiz açılır, tek kullanımlık şifre belirleme bağlantısı
 * yalnız o e-posta kutusuna gider (72 saat). Şifresiz hesaba bağlantı dışında giriş yapılamaz.
 * Admin'in şifre belirlediği eski yol isteğe bağlı kalır (posta yapılandırılmamış ortamlar).
 */
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { AUTH_TOKEN_PURPOSE, buildEmailVerifyUrl, createAuthEmailToken, issueEmailVerificationToken, revokeEmailVerificationTokens } from '@/lib/auth-email-token';
import { sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email';
import { isMailConfigured } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { emailLookupFilter } from '@/lib/auth/normalize-email';
import { auditEntry } from '@/lib/data-safety/audit';
import type { ActionCtx } from './actions.server';
import type { CreateUserInput } from './contract';

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

function resetUrl(plain: string) {
  return `${getPublicAppOrigin()}/auth/reset-password?${new URLSearchParams({ token: plain }).toString()}`;
}

export async function createUserByAdmin(ctx: ActionCtx, input: CreateUserInput) {
  if (input.mode === 'invite' && !isMailConfigured()) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'E-posta gönderimi yapılandırılmamış; davet gönderilemiyor. Şifre belirleyerek oluşturun.', {
      status: 503,
      retryable: false,
    });
  }
  const exists = await prisma.user.findFirst({ where: { email: emailLookupFilter(input.email) }, select: { id: true } });
  if (exists) {
    throw new ApiError('CONFLICT', 'Bu e-posta adresiyle kayıtlı bir hesap zaten var.', {
      status: 409,
      details: [{ path: 'email', message: 'Bu e-posta zaten kayıtlı' }],
    });
  }
  // ADMIN doğrudan oluşturulamaz: önce kullanıcı açılır, yükseltme dört gözle yapılır.
  if (input.role === 'ADMIN') {
    throw new ApiError('VALIDATION', 'Yönetici hesabı doğrudan oluşturulamaz. Kullanıcıyı açıp Erişim sekmesinden yükseltme talebi verin; ikinci bir yönetici onaylar.', {
      details: [{ path: 'role', message: 'Yönetici yükseltmesi dört göz ister' }],
    });
  }
  const password = input.mode === 'password' && input.password ? await bcrypt.hash(input.password, 12) : null;

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        password,
        businessName: input.role === 'DEALER' ? input.businessName?.trim() || null : null,
        // Şifreyi admin belirlediyse (eski yol) e-posta sahipliği kanıtlanmadı: doğrulama bekler.
        // Davette şifre belirleme bağlantısı yalnız o kutuya gittiği için sahiplik oradan kanıtlanır.
        emailVerified: input.mode === 'invite' ? new Date() : null,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: auditEntry(ctx.actor, { action: 'create', entity: 'user', entityId: u.id, newData: { name: u.name, email: u.email, role: u.role, mode: input.mode } }, ctx.request),
    });
    return u;
  });

  let mailSent = false;
  if (input.mode === 'invite') {
    const plain = await createAuthEmailToken(user.id, AUTH_TOKEN_PURPOSE.PASSWORD_RESET, INVITE_TTL_MS);
    const sent = await sendPasswordResetEmail(user.email, resetUrl(plain), user.name || undefined);
    mailSent = sent.ok;
  } else if (isMailConfigured()) {
    const plain = await issueEmailVerificationToken(user.id);
    const sent = await sendVerificationEmail(user.email, buildEmailVerifyUrl(getPublicAppOrigin(), plain), user.name || undefined);
    mailSent = sent.ok;
  }
  return { id: user.id, email: user.email, mode: input.mode, mailSent };
}

/** Admin tetikli şifre sıfırlama / doğrulama bağlantısı. */
export async function sendAccessLink(ctx: ActionCtx, userId: string) {
  if (!isMailConfigured()) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'E-posta gönderimi şu anda yapılandırılmamış.', { status: 503, retryable: false });
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerified: true, suspendedAt: true, anonymizedAt: true },
  });
  if (!u) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  if (u.anonymizedAt) throw new ApiError('CONFLICT', 'Anonimleştirilmiş hesaba bağlantı gönderilemez.', { status: 409 });
  if (u.suspendedAt) throw new ApiError('CONFLICT', 'Askıdaki hesaba bağlantı gönderilemez; önce askıyı kaldırın.', { status: 409 });

  let kind: 'reset' | 'verify';
  let ok: boolean;
  if (!u.emailVerified) {
    kind = 'verify';
    await revokeEmailVerificationTokens(u.id, u.email);
    const plain = await issueEmailVerificationToken(u.id);
    ok = (await sendVerificationEmail(u.email, buildEmailVerifyUrl(getPublicAppOrigin(), plain), u.name || undefined)).ok;
  } else {
    kind = 'reset';
    const plain = await createAuthEmailToken(u.id, AUTH_TOKEN_PURPOSE.PASSWORD_RESET, RESET_TTL_MS);
    ok = (await sendPasswordResetEmail(u.email, resetUrl(plain), u.name || undefined)).ok;
  }
  await prisma.auditLog.create({
    data: auditEntry(ctx.actor, { action: kind === 'reset' ? 'USER_PASSWORD_RESET_LINK' : 'USER_VERIFY_LINK', entity: 'User', entityId: u.id, newData: { sent: ok } }, ctx.request),
  });
  if (!ok) throw new ApiError('SERVICE_UNAVAILABLE', 'E-posta gönderilemedi. Birazdan tekrar deneyin.', { status: 502, retryable: true });
  return { kind, sentAt: new Date().toISOString() };
}
