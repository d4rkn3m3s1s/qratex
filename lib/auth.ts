import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
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
import { consumeMagicLoginToken } from '@/lib/auth-email-token';
import type { Adapter } from 'next-auth/adapters';

function resolveSessionMaxAgeSeconds(): number {
  const raw = process.env.NEXTAUTH_SESSION_MAX_AGE;
  const parsed = raw !== undefined && raw !== '' ? parseInt(raw, 10) : NaN;
  const fallback = 3 * 24 * 60 * 60;
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(300, base);
}

const providers = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    allowDangerousEmailAccountLinking: true,
  }),
  ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
    ? [
        GitHubProvider({
          clientId: process.env.GITHUB_ID,
          clientSecret: process.env.GITHUB_SECRET,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : []),
];

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: 'jwt',
    maxAge: resolveSessionMaxAgeSeconds(),
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
      },
      async authorize(credentials) {
        const cred = credentials as Record<string, string | undefined> | undefined;
        if (!cred) {
          throw new Error('Email ve şifre gerekli');
        }

        const headersList = await headers();
        const forwarded = headersList.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0].trim() : headersList.get('x-real-ip') || 'unknown';

        const magicToken = typeof cred.magicToken === 'string' ? cred.magicToken.trim() : '';
        if (magicToken) {
          const user = await consumeMagicLoginToken(magicToken);
          if (!user) {
            throw new Error('Geçersiz veya süresi dolmuş bağlantı');
          }
          await clearFailedLoginAttemptsDb(`${ip}:${user.email}`);
          logLoginSuccess(ip, user.email);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as 'ADMIN' | 'DEALER' | 'CUSTOMER' | 'STAFF',
            image: user.image,
            points: user.points,
            level: user.level,
            preferredLanguage: (user.preferredLanguage as 'tr' | 'en' | null) ?? 'tr',
          };
        }

        if (!cred.email || !cred.password) {
          throw new Error('Email ve şifre gerekli');
        }

        const identifier = `${ip}:${cred.email}`;
        const lockout = await getLoginLockoutDb(identifier);
        if (lockout.locked) {
          const sec = lockout.retryAfterMs
            ? Math.ceil(lockout.retryAfterMs / 1000)
            : 900;
          logLockout(ip, cred.email, sec);
          throw new Error(`Çok fazla başarısız deneme. ${sec} saniye sonra tekrar deneyin.`);
        }

        const limit = await checkRateLimitDb(`login:${identifier}`, 10, 60_000);
        if (!limit.ok) {
          logRateLimit(
            ip,
            cred.email,
            limit.retryAfterMs ? Math.ceil(limit.retryAfterMs / 1000) : undefined
          );
          const msg = limit.retryAfterMs
            ? `Çok fazla giriş denemesi. ${Math.ceil(limit.retryAfterMs / 1000)} saniye sonra tekrar deneyin.`
            : 'Çok fazla giriş denemesi. Lütfen 1 dakika sonra tekrar deneyin.';
          throw new Error(msg);
        }

        const user = await prisma.user.findUnique({
          where: { email: cred.email },
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
        });

        if (!user || !user.password) {
          await recordFailedLoginAttemptDb(identifier);
          logLoginFailed(ip, cred.email, 'user_not_found');
          throw new Error('Kullanıcı bulunamadı');
        }

        if (!user.emailVerified) {
          await recordFailedLoginAttemptDb(identifier);
          logLoginFailed(ip, cred.email, 'email_not_verified');
          throw new Error('E-posta adresinizi doğrulayın. Kayıt sonrası size gönderilen linke tıklayın.');
        }

        const isPasswordValid = await bcrypt.compare(cred.password, user.password);

        if (!isPasswordValid) {
          await recordFailedLoginAttemptDb(identifier);
          logLoginFailed(ip, cred.email, 'invalid_password');
          throw new Error('Şifre hatalı');
        }

        await clearFailedLoginAttemptsDb(identifier);
        logLoginSuccess(ip, cred.email);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image,
          points: user.points,
          level: user.level,
          preferredLanguage: (user.preferredLanguage as 'tr' | 'en' | null) ?? 'tr',
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Session fixation: her login'de yeni JTI üret; eski token geçersiz kılınır
      if (user) {
        token.jti = crypto.randomUUID();
        // For OAuth providers, we need to fetch the full user data from DB
        // because the user object only contains basic OAuth info
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            role: true,
            points: true,
            level: true,
            image: true,
            preferredLanguage: true,
            staffProfile: { select: { dealerId: true } },
            equippedCosmetics: {
              where: { isEquipped: true },
              select: { cosmetic: { select: { type: true, imageUrl: true } } }
            },
            customFrameColor: true
          },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.points = dbUser.points;
          token.level = dbUser.level;
          token.image = dbUser.image || user.image || token.image;
          token.preferredLanguage = (dbUser.preferredLanguage as 'tr' | 'en' | null) ?? 'tr';
          
          const frame = dbUser.equippedCosmetics.find(c => c.cosmetic.type === 'avatar_frame');
          const background = dbUser.equippedCosmetics.find(c => c.cosmetic.type === 'profile_background');
          token.equippedFrame = frame ? frame.cosmetic.imageUrl : null;
          token.equippedBackground = background ? background.cosmetic.imageUrl : null;
          token.customFrameColor = dbUser.customFrameColor || null;

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
          token.equippedFrame = null;
          token.equippedBackground = null;
          token.customFrameColor = null;
        }
      }

      // Handle session update — only overwrite fields that are explicitly provided
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
        if (token.dealerId) session.user.dealerId = token.dealerId as string;
        (session as { jti?: string }).jti = token.jti as string;
      }
      return session;
    },
    async signIn({ user, account }) {
      // Allow OAuth sign in
      if (account?.provider !== 'credentials') {
        return true;
      }
      return !!user;
    },
  },
  events: {
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

