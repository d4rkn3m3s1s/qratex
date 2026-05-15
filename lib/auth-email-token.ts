import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

export const AUTH_TOKEN_PURPOSE = {
  PASSWORD_RESET: 'password_reset',
  MAGIC_LOGIN: 'magic_login',
} as const;

export type AuthEmailTokenPurpose = (typeof AUTH_TOKEN_PURPOSE)[keyof typeof AUTH_TOKEN_PURPOSE];

function hashToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function generatePlainToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createAuthEmailToken(
  userId: string,
  purpose: AuthEmailTokenPurpose,
  ttlMs: number
): Promise<string> {
  const plain = generatePlainToken();
  const tokenHash = hashToken(plain);
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.$transaction(async (tx) => {
    await tx.authEmailToken.deleteMany({ where: { userId, purpose } });
    await tx.authEmailToken.create({
      data: { userId, tokenHash, purpose, expiresAt },
    });
  });

  return plain;
}

export async function consumePasswordResetToken(
  plain: string,
  newPasswordHash: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tokenHash = hashToken(plain.trim());
  const row = await prisma.authEmailToken.findFirst({
    where: {
      tokenHash,
      purpose: AUTH_TOKEN_PURPOSE.PASSWORD_RESET,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true },
  });
  if (!row) return { ok: false, error: 'Geçersiz veya süresi dolmuş bağlantı' };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { password: newPasswordHash },
    }),
    prisma.authEmailToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    }),
  ]);

  return { ok: true };
}

type AuthorizeUserShape = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
  points: number;
  level: number;
  preferredLanguage: string | null;
};

export async function consumeMagicLoginToken(
  plain: string
): Promise<AuthorizeUserShape | null> {
  const tokenHash = hashToken(plain.trim());
  const row = await prisma.authEmailToken.findFirst({
    where: {
      tokenHash,
      purpose: AUTH_TOKEN_PURPOSE.MAGIC_LOGIN,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          password: true,
          role: true,
          image: true,
          points: true,
          level: true,
          preferredLanguage: true,
          emailVerified: true,
        },
      },
    },
  });
  if (!row?.user) return null;

  if (!row.user.emailVerified) return null;

  await prisma.authEmailToken.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });

  const u = row.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    image: u.image,
    points: u.points,
    level: u.level,
    preferredLanguage: u.preferredLanguage,
  };
}
