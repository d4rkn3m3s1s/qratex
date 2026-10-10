import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  checkRateLimitDb,
  getLoginLockoutDb,
  recordFailedLoginAttemptDb,
  clearFailedLoginAttemptsDb,
} from '@/lib/rate-limit';
import {
  logLoginFailed,
  logLockout,
  logLoginSuccess,
  logRateLimit,
} from '@/lib/auth-events';
import {
  AUTH_TOKEN_PURPOSE,
  MFA_CHALLENGE_TTL_MS,
  claimAuthEmailToken,
  createAuthEmailToken,
  peekLoginLinkToken,
} from '@/lib/auth-email-token';
import { verifyTwoFactorForLogin } from '@/lib/two-factor';
import { assertEnvOrThrow } from '@/lib/env-validation';
import { emailLookupFilter, normalizeEmail } from '@/lib/auth/normalize-email';
import { nextAuthRedirect, sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { AUTH_ERROR, OAUTH_ERROR, encodeAuthError } from '@/lib/auth/login-errors';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import type { Adapter, AdapterUser } from 'next-auth/adapters';
import type { Account, Profile, User } from 'next-auth';

// Boot-time ortam doğrulaması: DATABASE_URL + NEXTAUTH_SECRET (üretimde min 32,
// JWT forge koruması) + NEXTAUTH_URL + yarım OAuth yapılandırması. Üretimde 'error'
// seviyesi dağıtımı durdurur; aksi halde sadece loglanır.
assertEnvOrThrow();

function resolveSessionMaxAgeSeconds(): number {
  const raw = process.env.NEXTAUTH_SESSION_MAX_AGE;
  const parsed = raw !== undefined && raw !== '' ? parseInt(raw, 10) : NaN;
  // Varsayılan 24sa (önceden 72sa): puan/ekonomi içeren bir sistemde sızan
  // token'ın geçerlilik penceresini daraltır. Env ile özelleştirilebilir.
  const fallback = 24 * 60 * 60;
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(300, base);
}

export const SESSION_MAX_AGE_SECONDS = resolveSessionMaxAgeSeconds();

/**
 * Kayıt ekranında "İşletme" seçilip OAuth ile devam edildiğinde `/api/auth/signup-intent`
 * bu çerezi yazar. YALNIZ yeni oluşturulan kullanıcıya (adapter.createUser) uygulanır;
 * mevcut hesabın rolünü asla değiştirmez. E-posta kaydı da DEALER seçimine açık olduğu
 * için çerez yeni bir yetki vermez — yalnız OAuth yolunda niyetin kaybolmasını önler.
 */
export const SIGNUP_INTENT_COOKIE = 'qx_signup_intent';

const providers = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    // E-posta eşleşmesiyle bağlama YALNIZ Google için ve YALNIZ Google e-postayı doğrulanmış
    // bildirdiğinde (`signIn` callback'i `email_verified !== true` ise reddeder). Doğrulanmamış
    // hedef satır bağlamadan önce `claimUnverifiedAccount` ile temizlenir (P0-08).
    allowDangerousEmailAccountLinking: true,
  }),
  ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
    ? [
        GitHubProvider({
          clientId: process.env.GITHUB_ID,
          clientSecret: process.env.GITHUB_SECRET,
          // GitHub sağlayıcısı birincil e-postanın `verified` bayrağına bakmaz → e-posta
          // eşleşmesiyle mevcut hesaba bağlanmak hesap ele geçirme vektörüdür. Kapalı:
          // aynı e-postalı hesap varsa NextAuth `OAuthAccountNotLinked` döner (/auth/error açıklar).
          allowDangerousEmailAccountLinking: false,
        }),
      ]
    : []),
];

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    return forwarded ? forwarded.split(',')[0].trim() : h.get('x-real-ip') || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function readCookie(name: string): Promise<string | undefined> {
  try {
    const jar = await cookies();
    return jar.get(name)?.value;
  } catch {
    return undefined;
  }
}

// ─────────────────────────────── Adapter (e-posta normalizasyonu) ───────────────────────────────

const baseAdapter = PrismaAdapter(prisma) as Adapter;

/**
 * PrismaAdapter sarmalayıcısı:
 *  - `getUserByEmail` büyük/küçük harf duyarsız (eski kayıtlarda karışık harfli e-posta var;
 *    birebir eşleşme aynı kişiye ikinci hesap açtırıyordu).
 *  - `createUser` e-postayı normalize eder ve kayıt niyetini (DEALER) uygular. Bu metot
 *    YALNIZ gerçekten yeni kullanıcıda çağrılır (e-postayla bağlamada çağrılmaz).
 */
export const authAdapter: Adapter = {
  ...baseAdapter,
  async getUserByEmail(email: string) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const user = await prisma.user.findFirst({ where: { email: emailLookupFilter(normalized) } });
    return (user as unknown as AdapterUser | null) ?? null;
  },
  async createUser(data: AdapterUser) {
    const intent = await readCookie(SIGNUP_INTENT_COOKIE);
    const email = normalizeEmail(data.email) || data.email;
    const payload = { ...data, email, ...(intent === 'DEALER' ? { role: 'DEALER' } : {}) } as AdapterUser;
    return baseAdapter.createUser!(payload);
  },
};

// ───────────────────────────────────── Giriş yardımcıları ─────────────────────────────────────

type AuthUserShape = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string | null;
  points: number;
  level: number;
  preferredLanguage: string | null;
};

function toAuthUser(u: AuthUserShape) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as 'ADMIN' | 'DEALER' | 'CUSTOMER' | 'STAFF',
    image: u.image,
    points: u.points,
    level: u.level,
    preferredLanguage: (u.preferredLanguage as 'tr' | 'en' | null) ?? 'tr',
  };
}

function authError(code: (typeof AUTH_ERROR)[keyof typeof AUTH_ERROR], retryAfterSec?: number): Error {
  return new Error(encodeAuthError(code, retryAfterSec));
}

/** bcrypt ile aynı maliyette sahte karşılaştırma (kullanıcı yokken zamanlama farkını eşitler). */
// Geçerli bir bcrypt(12) özeti olmalı: biçimi bozuk özet bcryptjs'te anında döner ve
// "kullanıcı yok" yolu yine ölçülebilir biçimde hızlı kalırdı.
const DUMMY_BCRYPT_HASH = '$2a$12$b98Jz6zxKFOqLELcUyqkyOVDLwoBK2QIjNrjjCTTDRw1jdKG5LbD6';

async function assertNotLocked(identifier: string, ip: string, email: string): Promise<void> {
  const lockout = await getLoginLockoutDb(identifier);
  if (lockout.locked) {
    const sec = lockout.retryAfterMs ? Math.ceil(lockout.retryAfterMs / 1000) : 900;
    logLockout(ip, email, sec);
    throw authError(AUTH_ERROR.LOCKED, sec);
  }
}

/**
 * Magic link ve OAuth 2FA bileti ile giriş (P0-08).
 * 2FA'lı hesapta kod gelene kadar token TÜKETİLMEZ; kod doğrulanınca atomik tüketilir.
 */
async function authorizeLoginLink(token: string, twoFactorCode: string, ip: string) {
  const rl = await checkRateLimitDb(`login_link:${ip}`, 20, 60_000);
  if (!rl.ok) {
    throw authError(AUTH_ERROR.RATE_LIMITED, rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60);
  }
  const peek = await peekLoginLinkToken(token);
  if (!peek) throw authError(AUTH_ERROR.INVALID_LINK);
  const user = peek.user;
  if (peek.purpose === AUTH_TOKEN_PURPOSE.MAGIC_LOGIN && !user.emailVerified) {
    throw authError(AUTH_ERROR.INVALID_LINK);
  }
  if (user.suspendedAt || user.anonymizedAt) throw authError(AUTH_ERROR.ACCOUNT_SUSPENDED);

  const identifier = `${ip}:${normalizeEmail(user.email)}`;
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!twoFactorCode) throw authError(AUTH_ERROR.TWO_FACTOR_REQUIRED);
    await assertNotLocked(identifier, ip, user.email);
    const ok = await verifyTwoFactorForLogin(user.id, twoFactorCode);
    if (!ok) {
      await recordFailedLoginAttemptDb(identifier);
      logLoginFailed(ip, user.email, 'invalid_2fa_link');
      throw authError(AUTH_ERROR.INVALID_2FA);
    }
  }

  const claimed = await claimAuthEmailToken(peek.tokenId);
  if (!claimed) throw authError(AUTH_ERROR.INVALID_LINK);
  await clearFailedLoginAttemptsDb(identifier);
  logLoginSuccess(ip, user.email);
  return toAuthUser(user);
}

const LOGIN_USER_SELECT = {
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
  twoFactorEnabled: true,
  twoFactorSecret: true,
  suspendedAt: true,
  anonymizedAt: true,
} as const;

// ─────────────────────────────────────── OAuth politikası ───────────────────────────────────────

const OAUTH_USER_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  suspendedAt: true,
  anonymizedAt: true,
} as const;

/**
 * E-postası hiç kanıtlanmamış satıra doğrulanmış OAuth kimliği bağlanırken satırı
 * "sahiplenir" (P0-08 hesap ön-ele geçirme):
 *  Saldırgan kurbanın e-postasıyla şifreli kayıt açar (doğrulanmamış) → kurban Google ile
 *  girince NextAuth bu satıra bağlar → eskiden saldırganın şifresi kalıyor ve satır
 *  doğrulanmış sayılıyordu. Artık: şifre null, 2FA sıfır, başka sağlayıcı bağlantıları
 *  (doğrulanmamış iddialar) silinir, bekleyen token'lar iptal, `sessionVersion` artar.
 */
export async function claimUnverifiedAccount(userId: string, email: string, provider: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        password: null,
        emailVerified: now,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorVerifiedAt: null,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId, provider: { not: provider } } }),
    prisma.authEmailToken.deleteMany({ where: { userId } }),
    prisma.verificationToken.deleteMany({ where: { identifier: emailLookupFilter(email) } }),
  ]);
  console.warn('[auth] unverified account claimed by verified OAuth identity', { userId, provider });
}

async function readOAuthCallbackPath(origin: string): Promise<string | null> {
  const raw =
    (await readCookie('__Secure-next-auth.callback-url')) ?? (await readCookie('next-auth.callback-url'));
  return sanitizeCallbackPath(raw ?? null, origin);
}

/**
 * OAuth girişinin kabul politikası. `true` → NextAuth devam eder; string → o adrese
 * yönlendirilir (oturum AÇILMAZ, bağlama YAPILMAZ).
 */
export async function resolveOAuthSignIn(params: {
  user: User | AdapterUser | null | undefined;
  account: Account;
  profile?: Profile | Record<string, unknown> | null;
}): Promise<true | string> {
  const { user, account } = params;
  const raw = (params.profile ?? {}) as Record<string, unknown>;
  const origin = getPublicAppOrigin();
  const fail = (code: string) => `${origin}/auth/login?error=${encodeURIComponent(code)}`;

  const email = normalizeEmail(raw.email ?? user?.email);
  if (!email) return fail(OAUTH_ERROR.NO_EMAIL);
  if (account.provider === 'google' && raw.email_verified !== true) return fail(OAUTH_ERROR.EMAIL_UNVERIFIED);

  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
    select: { user: { select: OAUTH_USER_SELECT } },
  });
  let existing = linked?.user ?? null;
  let matchedByEmail = false;
  if (!existing) {
    existing = await prisma.user.findFirst({ where: { email: emailLookupFilter(email) }, select: OAUTH_USER_SELECT });
    matchedByEmail = !!existing;
  }
  if (!existing) return true; // yeni kullanıcı → authAdapter.createUser

  if (existing.suspendedAt || existing.anonymizedAt) return fail(OAUTH_ERROR.ACCOUNT_SUSPENDED);

  if (matchedByEmail) {
    // Google dışı sağlayıcı e-postayla bağlanamaz; NextAuth OAuthAccountNotLinked döndürür.
    if (account.provider !== 'google') return true;
    if (!existing.emailVerified) {
      await claimUnverifiedAccount(existing.id, existing.email, account.provider);
      return true; // sahiplenme 2FA'yı da sıfırladı
    }
  }

  // 2FA'lı hesap: OAuth 1. adımdır. 2. adım için kısa ömürlü bilet + /auth/magic ekranı.
  if (existing.twoFactorEnabled && existing.twoFactorSecret) {
    const plain = await createAuthEmailToken(existing.id, AUTH_TOKEN_PURPOSE.MFA_CHALLENGE, MFA_CHALLENGE_TTL_MS);
    const qs = new URLSearchParams({ token: plain, via: 'oauth' });
    const cb = await readOAuthCallbackPath(origin);
    if (cb) qs.set('callbackUrl', cb);
    return `${origin}/auth/magic?${qs.toString()}`;
  }
  return true;
}

// ───────────────────────────────────────── NextAuth ─────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  adapter: authAdapter,
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
  },
  providers: [
    ...providers,
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        magicToken: { label: 'Magic', type: 'text' },
        twoFactorCode: { label: '2FA', type: 'text' },
      },
      async authorize(credentials) {
        const cred = credentials as Record<string, string | undefined> | undefined;
        if (!cred) throw authError(AUTH_ERROR.MISSING_CREDENTIALS);

        const ip = await clientIp();
        const twoFactorCode = typeof cred.twoFactorCode === 'string' ? cred.twoFactorCode.trim() : '';

        const magicToken = typeof cred.magicToken === 'string' ? cred.magicToken.trim() : '';
        if (magicToken) return authorizeLoginLink(magicToken, twoFactorCode, ip);

        // Kanonik e-posta: kilit/oran anahtarı büyük harfle atlatılamasın, karışık harfli
        // kayıtlar da bulunsun.
        const email = normalizeEmail(cred.email);
        const password = typeof cred.password === 'string' ? cred.password : '';
        if (!email || !password) throw authError(AUTH_ERROR.MISSING_CREDENTIALS);

        const identifier = `${ip}:${email}`;
        await assertNotLocked(identifier, ip, email);

        const limit = await checkRateLimitDb(`login:${identifier}`, 10, 60_000);
        if (!limit.ok) {
          const sec = limit.retryAfterMs ? Math.ceil(limit.retryAfterMs / 1000) : 60;
          logRateLimit(ip, email, sec);
          throw authError(AUTH_ERROR.RATE_LIMITED, sec);
        }

        const user = await prisma.user.findFirst({
          where: { email: emailLookupFilter(email) },
          select: LOGIN_USER_SELECT,
        });

        // Kullanıcı sayımı önlemi: "yok" ile "şifre yanlış" AYNI kod; kullanıcı yoksa da
        // bcrypt çalışır (zamanlama eşit).
        if (!user || !user.password) {
          await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => false);
          await recordFailedLoginAttemptDb(identifier);
          logLoginFailed(ip, email, 'user_not_found');
          throw authError(AUTH_ERROR.INVALID_CREDENTIALS);
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          await recordFailedLoginAttemptDb(identifier);
          logLoginFailed(ip, email, 'invalid_password');
          throw authError(AUTH_ERROR.INVALID_CREDENTIALS);
        }

        // Aşağıdakiler YALNIZ doğru şifreden sonra ayırt edilir (şifresiz sorgulanamaz).
        if (user.suspendedAt || user.anonymizedAt) {
          logLoginFailed(ip, email, 'account_suspended');
          throw authError(AUTH_ERROR.ACCOUNT_SUSPENDED);
        }
        if (!user.emailVerified) {
          logLoginFailed(ip, email, 'email_not_verified');
          throw authError(AUTH_ERROR.EMAIL_NOT_VERIFIED);
        }

        // 2FA: şifre doğru ve 2FA açıksa TOTP/kurtarma kodu zorunlu.
        if (user.twoFactorEnabled && user.twoFactorSecret) {
          if (!twoFactorCode) throw authError(AUTH_ERROR.TWO_FACTOR_REQUIRED);
          const ok = await verifyTwoFactorForLogin(user.id, twoFactorCode);
          if (!ok) {
            await recordFailedLoginAttemptDb(identifier);
            logLoginFailed(ip, email, 'invalid_2fa');
            throw authError(AUTH_ERROR.INVALID_2FA);
          }
        }

        await clearFailedLoginAttemptsDb(identifier);
        logLoginSuccess(ip, email);
        return toAuthUser(user);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Session fixation: her login'de yeni JTI üret; eski token geçersiz kılınır
      if (user) {
        token.jti = crypto.randomUUID();
        // OAuth kullanıcı nesnesi yalnız temel bilgiyi taşır → DB'den oku.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            role: true,
            points: true,
            level: true,
            image: true,
            preferredLanguage: true,
            sessionVersion: true,
            staffProfile: { select: { dealerId: true } },
            equippedCosmetics: {
              where: { isEquipped: true },
              select: { cosmetic: { select: { type: true, imageUrl: true } } }
            },
            customFrameColor: true,
            adminDepartment: true,
            adminTeamRole: true
          },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.points = dbUser.points;
          token.level = dbUser.level;
          token.image = dbUser.image || user.image || token.image;
          token.preferredLanguage = (dbUser.preferredLanguage as 'tr' | 'en' | null) ?? 'tr';
          // P0-07: oturum sürümü. requireAuth DB'deki değerle karşılaştırır; şifre sıfırlama,
          // 2FA değişikliği, rol değişikliği vb. artırınca bu token geçersizleşir.
          token.sv = dbUser.sessionVersion ?? 0;

          const frame = dbUser.equippedCosmetics.find(c => c.cosmetic.type === 'avatar_frame');
          const background = dbUser.equippedCosmetics.find(c => c.cosmetic.type === 'profile_background');
          token.equippedFrame = frame ? frame.cosmetic.imageUrl : null;
          token.equippedBackground = background ? background.cosmetic.imageUrl : null;
          token.customFrameColor = dbUser.customFrameColor || null;
          token.adminDepartment = dbUser.adminDepartment ?? null;
          token.adminTeamRole = dbUser.adminTeamRole ?? null;

          if (dbUser.role === 'STAFF' && dbUser.staffProfile?.dealerId) {
            token.dealerId = dbUser.staffProfile.dealerId;
          }
        } else {
          // Fallback to user object (for credentials)
          token.id = user.id;
          token.role = user.role || 'CUSTOMER';
          token.points = user.points || 0;
          token.level = user.level || 1;
          token.image = user.image || token.image;
          token.preferredLanguage = (user.preferredLanguage as 'tr' | 'en' | undefined) ?? 'tr';
          token.sv = 0;
          token.equippedFrame = null;
          token.equippedBackground = null;
          token.customFrameColor = null;
        }
      }

      // Handle session update — only overwrite fields that are explicitly provided.
      // `sv` ve `role` istemciden ASLA güncellenmez.
      if (trigger === 'update' && session) {
        if (session.name !== undefined) token.name = session.name;
        if (session.image !== undefined) token.image = session.image;
        if (session.points !== undefined) token.points = session.points;
        if (session.level !== undefined) token.level = session.level;
        if (session.preferredLanguage !== undefined) token.preferredLanguage = session.preferredLanguage;
        if (session.equippedFrame !== undefined) token.equippedFrame = session.equippedFrame;
        if (session.equippedBackground !== undefined) token.equippedBackground = session.equippedBackground;
        if (session.customFrameColor !== undefined) token.customFrameColor = session.customFrameColor;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.points = token.points as number;
        session.user.level = token.level as number;
        session.user.image = token.image as string;
        session.user.preferredLanguage = (token.preferredLanguage as 'tr' | 'en' | undefined) ?? 'tr';
        (session.user as any).equippedFrame = token.equippedFrame as string | null;
        (session.user as any).equippedBackground = token.equippedBackground as string | null;
        (session.user as any).customFrameColor = token.customFrameColor as string | null;
        (session.user as any).adminDepartment = (token.adminDepartment as string | null) ?? null;
        (session.user as any).adminTeamRole = (token.adminTeamRole as string | null) ?? null;
        if (token.dealerId) session.user.dealerId = token.dealerId as string;
        (session as { jti?: string }).jti = token.jti as string;
        // P0-07: requireAuth bu değeri DB'deki User.sessionVersion ile karşılaştırır.
        (session as { sv?: number }).sv = typeof token.sv === 'number' ? token.sv : 0;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') return !!user;
      return resolveOAuthSignIn({ user, account, profile });
    },
    // P0-02: NextAuth'un kendi yönlendirmeleri (OAuth dönüşü, signOut) de aynı süzgeçten geçer.
    async redirect({ url, baseUrl }) {
      return nextAuthRedirect({ url, baseUrl });
    },
  },
  events: {
    // Google e-postayı doğrulanmış bildirdi (`signIn` bunu zorunlu kılıyor) → yeni bağlanan
    // hesapta `emailVerified` boşsa doldur. GitHub için YAPILMAZ: sağlayıcı e-postanın
    // doğrulandığını garanti etmiyor; kullanıcı gerekirse doğrulama bağlantısı ister.
    // (Eski `events.createUser` e-postayla bağlanan MEVCUT satırda da çalışıp saldırganın
    // doğrulanmamış satırını doğrulanmış yapıyordu.)
    async linkAccount({ user, account }) {
      if (account.provider !== 'google') return;
      try {
        await prisma.user.updateMany({ where: { id: user.id, emailVerified: null }, data: { emailVerified: new Date() } });
      } catch (e) {
        console.error('[auth] linkAccount emailVerified set failed:', e);
      }
    },
    async signIn({ user }) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`User signed in: ${user.email}`);
      }
    },
    async signOut({ token }) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`User signed out: ${token?.email ?? '[session]'}`);
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

export default authOptions;
