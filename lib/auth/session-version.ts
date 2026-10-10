/**
 * Oturum sürümü (P0-07, JWT tarafı).
 *
 * Sözleşme:
 *  - `User.sessionVersion` (Int, varsayılan 0) giriş anında JWT'ye `sv` olarak yazılır
 *    (lib/auth.ts `jwt` callback'i).
 *  - Şifre sıfırlama, 2FA açma/kapama/kurtarma kodu yenileme gibi kimlik bilgisi
 *    değişikliklerinde `bumpSessionVersion` ile artırılır → o ana kadar verilmiş BÜTÜN
 *    token'lar geçersiz sayılır. `sv` karşılaştırması `requireAuth` tarafındadır (A2 şeridi).
 *  - İşlemi yapan oturumun kendisi düşmesin diye `reissueSessionCookie` mevcut çerezi
 *    yeni `sv` ile yeniden imzalar (yalnız bu tarayıcı; diğer cihazlar çıkış yapar).
 */
import type { NextRequest, NextResponse } from 'next/server';
import { decode, encode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

/** JWT'de `sv` yoksa (geçiş öncesi verilmiş token) 0 kabul edilir. */
export function readTokenSessionVersion(token: { sv?: unknown } | null | undefined): number {
  const sv = token?.sv;
  return typeof sv === 'number' && Number.isInteger(sv) && sv >= 0 ? sv : 0;
}

type SessionVersionDb = {
  user: {
    update: (args: {
      where: { id: string };
      data: { sessionVersion: { increment: number } };
      select: { sessionVersion: true };
    }) => Promise<{ sessionVersion: number }>;
  };
};

/** `sessionVersion`'ı 1 artırır ve yeni değeri döndürür. Transaction içinde `tx` verilebilir. */
export async function bumpSessionVersion(userId: string, db: SessionVersionDb = prisma as unknown as SessionVersionDb): Promise<number> {
  const row = await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return row.sessionVersion;
}

const SESSION_COOKIE_NAMES = ['__Secure-next-auth.session-token', 'next-auth.session-token'] as const;

/**
 * İsteği yapan tarayıcının oturum çerezini `patch` ile güncellenmiş claim'lerle yeniden
 * imzalar. Çerez parçalı (`.0`, `.1`) ise veya çözülemezse dokunmaz ve `false` döner —
 * bu durumda kullanıcı yeniden giriş yapar (güvenli taraf).
 */
export async function reissueSessionCookie(
  req: NextRequest,
  res: NextResponse,
  patch: Record<string, unknown>,
  options: { maxAge: number; secret?: string }
): Promise<boolean> {
  const secret = options.secret ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return false;
  const name = SESSION_COOKIE_NAMES.find((n) => req.cookies.get(n)?.value);
  if (!name) return false;
  const raw = req.cookies.get(name)?.value;
  if (!raw) return false;
  try {
    const token = await decode({ token: raw, secret });
    if (!token) return false;
    const next = await encode({ token: { ...token, ...patch }, secret, maxAge: options.maxAge });
    res.cookies.set(name, next, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: name.startsWith('__Secure-'),
      maxAge: options.maxAge,
    });
    return true;
  } catch {
    return false;
  }
}
