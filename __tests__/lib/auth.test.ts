import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// Mock prisma
// Not: `authorize` kullanıcıyı büyük/küçük harf duyarsız `findFirst` ile arar (karışık
// harfli eski kayıtlar); jwt callback ise `findUnique` (id ile) kullanır.
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockAccountFindUnique = jest.fn();
// Magic link iki adımlı: peek (tüketmeden oku) → 2FA gerekiyorsa kod → claim (atomik tüket).
const mockPeekLoginLinkToken = jest.fn();
const mockClaimAuthEmailToken = jest.fn();
jest.mock('@/lib/auth-email-token', () => ({
  AUTH_TOKEN_PURPOSE: {
    PASSWORD_RESET: 'password_reset',
    MAGIC_LOGIN: 'magic_login',
    EMAIL_VERIFY: 'email_verify',
    MFA_CHALLENGE: 'mfa_challenge',
  },
  MFA_CHALLENGE_TTL_MS: 300000,
  peekLoginLinkToken: (...args: unknown[]) => mockPeekLoginLinkToken(...args),
  claimAuthEmailToken: (...args: unknown[]) => mockClaimAuthEmailToken(...args),
  createAuthEmailToken: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    account: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
    },
  },
}));
jest.mock('@/lib/auth-events', () => ({
  logLoginFailed: jest.fn(),
  logLockout: jest.fn(),
  logLoginSuccess: jest.fn(),
  logRateLimit: jest.fn(),
}));

// DB-backed rate limiter / login lockout — testlerde her zaman "geçer" (kilitsiz, limit ok).
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }),
  getLoginLockoutDb: jest.fn().mockResolvedValue({ locked: false }),
  recordFailedLoginAttemptDb: jest.fn().mockResolvedValue(undefined),
  clearFailedLoginAttemptsDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(() => Promise.resolve(new Headers({ 'x-forwarded-for': '127.0.0.1' }))),
}));

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

// Mock PrismaAdapter
jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));

// Mock next-auth providers
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn((config) => ({
    ...config,
    type: 'credentials',
  })),
}));

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn((config) => ({
    ...config,
    type: 'oauth',
  })),
}));

describe('auth.ts', () => {
  const mockBcryptCompare = bcrypt.compare as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Varsayılan: şifre eşleşmez. Kullanıcı yokken de sahte bcrypt karşılaştırması çalışır
    // (zamanlama eşitleme), bu yüzden mock her zaman bir Promise dönmeli.
    mockBcryptCompare.mockResolvedValue(false);
  });

  describe('authOptions configuration', () => {
    it('should have jwt session strategy', () => {
      expect(authOptions.session?.strategy).toBe('jwt');
    });

    it('should resolve session maxAge (default 24h, min 300s; mirrors lib/auth)', () => {
      const raw = process.env.NEXTAUTH_SESSION_MAX_AGE;
      const parsed = raw !== undefined && raw !== '' ? parseInt(raw, 10) : NaN;
      const fallback = 24 * 60 * 60; // güvenlik: 72sa → 24sa
      const expected = Math.max(300, Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
      expect(authOptions.session?.maxAge).toBe(expected);
    });

    it('should have correct pages configured', () => {
      expect(authOptions.pages).toEqual({
        signIn: '/auth/login',
        error: '/auth/error',
        verifyRequest: '/auth/verify',
      });
    });

    it('should have secret from env', () => {
      expect(authOptions.secret).toBe(process.env.NEXTAUTH_SECRET);
    });

    it('should have debug based on NODE_ENV', () => {
      // The debug value is evaluated at module load time
      // In test environment, NODE_ENV is 'test' which is not 'development'
      // so debug should be false
      const expectedDebug = process.env.NODE_ENV === 'development';
      expect(authOptions.debug).toBe(expectedDebug);
    });

    it('should have two providers configured', () => {
      expect(authOptions.providers).toHaveLength(2);
    });

    it('should have adapter configured', () => {
      expect(authOptions.adapter).toBeDefined();
    });
  });

  describe('CredentialsProvider authorize', () => {
    const getAuthorize = () => {
      const credentialsProvider = authOptions.providers.find(
        (p) => p.type === 'credentials'
      ) as { authorize: (credentials: { email?: string; password?: string; magicToken?: string } | undefined) => Promise<unknown> };
      return credentialsProvider.authorize;
    };

    it('should return user when magic token is valid', async () => {
      const authorize = getAuthorize();
      mockPeekLoginLinkToken.mockResolvedValue({
        tokenId: 't1',
        purpose: 'magic_login',
        user: {
          id: 'm1',
          email: 'magic@test.com',
          name: 'Magic User',
          role: 'CUSTOMER',
          image: null,
          points: 10,
          level: 2,
          preferredLanguage: 'tr',
          emailVerified: new Date(),
          twoFactorEnabled: false,
          twoFactorSecret: null,
          suspendedAt: null,
          anonymizedAt: null,
        },
      });
      mockClaimAuthEmailToken.mockResolvedValue(true);

      const result = await authorize({ magicToken: 'plain-token', email: '', password: '' });

      expect(result).toEqual({
        id: 'm1',
        email: 'magic@test.com',
        name: 'Magic User',
        role: 'CUSTOMER',
        image: null,
        points: 10,
        level: 2,
        preferredLanguage: 'tr',
      });
      expect(mockPeekLoginLinkToken).toHaveBeenCalledWith('plain-token');
      expect(mockClaimAuthEmailToken).toHaveBeenCalledWith('t1');
    });

    it('should throw when magic token is invalid', async () => {
      const authorize = getAuthorize();
      mockPeekLoginLinkToken.mockResolvedValue(null);

      // Sunucu makine-okunur kod fırlatır (lib/auth/login-errors); metni istemci çözer.
      await expect(authorize({ magicToken: 'bad-token' })).rejects.toThrow('INVALID_LINK');
      expect(mockClaimAuthEmailToken).not.toHaveBeenCalled();
    });

    it('should throw error when email is missing', async () => {
      const authorize = getAuthorize();
      
      await expect(authorize({ password: 'test123' })).rejects.toThrow('MISSING_CREDENTIALS');
    });

    it('should throw error when password is missing', async () => {
      const authorize = getAuthorize();
      
      await expect(authorize({ email: 'test@test.com' })).rejects.toThrow('MISSING_CREDENTIALS');
    });

    it('should throw error when credentials is undefined', async () => {
      const authorize = getAuthorize();
      
      await expect(authorize(undefined)).rejects.toThrow('MISSING_CREDENTIALS');
    });

    it('should throw error when both email and password are missing', async () => {
      const authorize = getAuthorize();
      
      await expect(authorize({})).rejects.toThrow('MISSING_CREDENTIALS');
    });

    it('should throw error when credentials is null', async () => {
      const authorize = getAuthorize();
      
      await expect(authorize(null as unknown as { email?: string; password?: string })).rejects.toThrow('MISSING_CREDENTIALS');
    });

    it('should throw error when email is empty string', async () => {
      const authorize = getAuthorize();
      
      await expect(authorize({ email: '', password: 'test123' })).rejects.toThrow('MISSING_CREDENTIALS');
    });

    it('should throw error when password is empty string', async () => {
      const authorize = getAuthorize();
      
      await expect(authorize({ email: 'test@test.com', password: '' })).rejects.toThrow('MISSING_CREDENTIALS');
    });

    it('should throw error when user is not found', async () => {
      const authorize = getAuthorize();
      mockFindFirst.mockResolvedValue(null);

      // User enumeration önlemi: "bulunamadı" da "şifre hatalı" da AYNI generic mesaj.
      await expect(
        authorize({ email: 'notfound@test.com', password: 'test123' })
      ).rejects.toThrow('INVALID_CREDENTIALS');
      // Kullanıcı yokken de bcrypt çalışır → "yok" ile "şifre yanlış" zamanlamadan ayırt edilemez.
      expect(mockBcryptCompare).toHaveBeenCalledTimes(1);
    });

    it('should throw error when user has no password (OAuth user)', async () => {
      const authorize = getAuthorize();
      mockFindFirst.mockResolvedValue({
        id: '1',
        email: 'oauth@test.com',
        name: 'OAuth User',
        password: null,
        role: 'CUSTOMER',
        image: null,
        points: 0,
        level: 1,
      });

      await expect(
        authorize({ email: 'oauth@test.com', password: 'test123' })
      ).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should throw error when password is invalid', async () => {
      const authorize = getAuthorize();
      mockFindFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'CUSTOMER',
        image: null,
        points: 100,
        level: 5,
        preferredLanguage: 'tr',
        emailVerified: new Date(),
      });
      mockBcryptCompare.mockResolvedValue(false);

      await expect(
        authorize({ email: 'test@test.com', password: 'wrongpassword' })
      ).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('should return user object when credentials are valid', async () => {
      const authorize = getAuthorize();
      const mockUser = {
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'ADMIN',
        image: 'https://example.com/image.jpg',
        points: 500,
        level: 10,
        preferredLanguage: 'en',
        emailVerified: new Date(),
      };
      mockFindFirst.mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);

      const result = await authorize({ email: 'test@test.com', password: 'correctpassword' });

      expect(result).toEqual({
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        role: 'ADMIN',
        image: 'https://example.com/image.jpg',
        points: 500,
        level: 10,
        preferredLanguage: 'en',
      });
    });

    it('should call prisma with correct email', async () => {
      const authorize = getAuthorize();
      mockFindFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        password: 'hashedPassword',
        role: 'CUSTOMER',
        image: null,
        points: 0,
        level: 1,
        preferredLanguage: 'tr',
        emailVerified: new Date(),
      });
      mockBcryptCompare.mockResolvedValue(true);

      await authorize({ email: 'test@test.com', password: 'password123' });

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'test@test.com', mode: 'insensitive' } },
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
          twoFactorEnabled: true,
          twoFactorSecret: true,
          suspendedAt: true,
          anonymizedAt: true,
        },
      });
    });

    it('should call bcrypt.compare with correct arguments', async () => {
      const authorize = getAuthorize();
      mockFindFirst.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        name: 'Test User',
        password: 'hashedPassword123',
        role: 'CUSTOMER',
        image: null,
        points: 0,
        level: 1,
        preferredLanguage: 'tr',
        emailVerified: new Date(),
      });
      mockBcryptCompare.mockResolvedValue(true);

      await authorize({ email: 'test@test.com', password: 'myPassword' });

      expect(mockBcryptCompare).toHaveBeenCalledWith('myPassword', 'hashedPassword123');
    });
  });

  describe('jwt callback', () => {
    const getJwtCallback = () => authOptions.callbacks!.jwt!;

    // P0-07: var olan oturumun her okunuşunda DB durumu doğrulanır; bu testlerdeki kullanıcı
    // aktif ve `sessionVersion` 0 (token'da `sv` yok → 0). Kendi değerini kuran testler ezer.
    beforeEach(() => {
      mockFindUnique.mockResolvedValue({
        role: 'CUSTOMER',
        sessionVersion: 0,
        suspendedAt: null,
        anonymizedAt: null,
        staffProfile: null,
      });
    });

    it('should set token from dbUser when user exists and found in DB', async () => {
      const jwtCallback = getJwtCallback();
      const mockDbUser = {
        id: 'db-user-1',
        role: 'ADMIN',
        points: 1000,
        level: 20,
        equippedCosmetics: [],
      };
      mockFindUnique.mockResolvedValue(mockDbUser);

      const result = await jwtCallback({
        token: { sub: 'token-sub' },
        user: { id: 'user-1', email: 'test@test.com', role: 'CUSTOMER', points: 0, level: 1 },
        account: null,
        trigger: 'signIn',
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.id).toBe('db-user-1');
      expect(result.role).toBe('ADMIN');
      expect(result.points).toBe(1000);
      expect(result.level).toBe(20);
    });

    it('should fallback to user object when dbUser is not found', async () => {
      const jwtCallback = getJwtCallback();
      mockFindUnique.mockResolvedValue(null);

      const result = await jwtCallback({
        token: { sub: 'token-sub' },
        user: { id: 'user-1', email: 'test@test.com', role: 'DEALER', points: 50, level: 3 },
        account: null,
        trigger: 'signIn',
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.id).toBe('user-1');
      expect(result.role).toBe('DEALER');
      expect(result.points).toBe(50);
      expect(result.level).toBe(3);
    });

    it('should use default values when user properties are undefined (fallback)', async () => {
      const jwtCallback = getJwtCallback();
      mockFindUnique.mockResolvedValue(null);

      const result = await jwtCallback({
        token: { sub: 'token-sub' },
        user: { id: 'user-1', email: 'test@test.com' },
        account: null,
        trigger: 'signIn',
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.id).toBe('user-1');
      expect(result.role).toBe('CUSTOMER');
      expect(result.points).toBe(0);
      expect(result.level).toBe(1);
    });

    it('should update token when trigger is update and session exists', async () => {
      const jwtCallback = getJwtCallback();

      const result = await jwtCallback({
        token: { 
          sub: 'token-sub',
          id: 'user-1',
          role: 'CUSTOMER',
          name: 'Old Name',
          image: 'old-image.jpg',
          points: 100,
          level: 5,
        },
        user: undefined,
        account: null,
        trigger: 'update',
        session: {
          name: 'New Name',
          image: 'new-image.jpg',
          points: 200,
          level: 10,
        },
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.name).toBe('New Name');
      expect(result.image).toBe('new-image.jpg');
      expect(result.points).toBe(200);
      expect(result.level).toBe(10);
    });

    it('should return token unchanged when no user and no update trigger', async () => {
      const jwtCallback = getJwtCallback();
      const originalToken = { 
        sub: 'token-sub',
        id: 'user-1',
        role: 'CUSTOMER',
        points: 100,
        level: 5,
      };

      const result = await jwtCallback({
        token: { ...originalToken },
        user: undefined,
        account: null,
        trigger: 'signIn',
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.id).toBe('user-1');
      expect(result.role).toBe('CUSTOMER');
      expect(result.points).toBe(100);
      expect(result.level).toBe(5);
    });

    it('should not update token when trigger is update but session is undefined', async () => {
      const jwtCallback = getJwtCallback();
      const originalToken = { 
        sub: 'token-sub',
        id: 'user-1',
        role: 'CUSTOMER',
        name: 'Original Name',
        points: 100,
        level: 5,
      };

      const result = await jwtCallback({
        token: { ...originalToken },
        user: undefined,
        account: null,
        trigger: 'update',
        session: undefined,
      } as Parameters<typeof jwtCallback>[0]);

      expect(result.name).toBe('Original Name');
      expect(result.points).toBe(100);
      expect(result.level).toBe(5);
    });

    it('should query prisma with correct user id', async () => {
      const jwtCallback = getJwtCallback();
      mockFindUnique.mockResolvedValue({
        id: 'user-123',
        role: 'CUSTOMER',
        points: 0,
        level: 1,
        equippedCosmetics: [],
      });

      await jwtCallback({
        token: { sub: 'token-sub' },
        user: { id: 'user-123', email: 'test@test.com', role: 'CUSTOMER', points: 0, level: 1 },
        account: null,
        trigger: 'signIn',
      } as Parameters<typeof jwtCallback>[0]);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
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
            select: { cosmetic: { select: { type: true, imageUrl: true } } },
          },
          customFrameColor: true,
          adminDepartment: true,
          adminTeamRole: true,
        },
      });
    });
  });

  describe('session callback', () => {
    const getSessionCallback = () => authOptions.callbacks!.session!;

    it('should add token data to session.user when session.user exists', async () => {
      const sessionCallback = getSessionCallback();

      const result = await sessionCallback({
        session: {
          user: { name: 'Test', email: 'test@test.com' },
          expires: '2025-01-01',
        },
        token: {
          id: 'user-1',
          role: 'ADMIN',
          points: 500,
          level: 15,
          sub: 'sub-1',
        },
      } as Parameters<typeof sessionCallback>[0]);

      expect(result.user.id).toBe('user-1');
      expect(result.user.role).toBe('ADMIN');
      expect(result.user.points).toBe(500);
      expect(result.user.level).toBe(15);
    });

    it('should return session unchanged when session.user is undefined', async () => {
      const sessionCallback = getSessionCallback();

      const result = await sessionCallback({
        session: {
          user: undefined as unknown as { name: string; email: string },
          expires: '2025-01-01',
        },
        token: {
          id: 'user-1',
          role: 'ADMIN',
          points: 500,
          level: 15,
          sub: 'sub-1',
        },
      } as Parameters<typeof sessionCallback>[0]);

      expect(result.user).toBeUndefined();
    });

    it('should preserve existing session.user properties', async () => {
      const sessionCallback = getSessionCallback();

      const result = await sessionCallback({
        session: {
          user: { 
            name: 'Test User', 
            email: 'test@test.com',
            image: 'https://example.com/avatar.jpg',
          },
          expires: '2025-12-31',
        },
        token: {
          id: 'user-1',
          role: 'CUSTOMER',
          points: 100,
          level: 5,
          sub: 'sub-1',
          image: 'https://example.com/avatar.jpg',
        },
      } as Parameters<typeof sessionCallback>[0]);

      expect(result.user.name).toBe('Test User');
      expect(result.user.email).toBe('test@test.com');
      expect(result.user.image).toBe('https://example.com/avatar.jpg');
      expect(result.expires).toBe('2025-12-31');
    });
  });

  describe('signIn callback', () => {
    const getSignInCallback = () => authOptions.callbacks!.signIn!;

    it('should return true for a new Google user with a verified e-mail', async () => {
      const signInCallback = getSignInCallback();
      mockAccountFindUnique.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue(null);

      const result = await signInCallback({
        user: { id: 'user-1', email: 'test@test.com' },
        account: { provider: 'google', type: 'oauth', providerAccountId: '123' },
        profile: { email: 'test@test.com', email_verified: true },
      } as Parameters<typeof signInCallback>[0]);

      expect(result).toBe(true);
    });

    it('should reject Google sign-in when the e-mail is not reported as verified (P0-08)', async () => {
      const signInCallback = getSignInCallback();

      const result = await signInCallback({
        user: { id: 'user-1', email: 'test@test.com' },
        account: { provider: 'google', type: 'oauth', providerAccountId: '123' },
        profile: { email: 'test@test.com' },
      } as Parameters<typeof signInCallback>[0]);

      expect(typeof result).toBe('string');
      expect(result).toContain('/auth/login?error=OAuthEmailUnverified');
      expect(mockAccountFindUnique).not.toHaveBeenCalled();
    });

    it('should return true for a new user on another OAuth provider', async () => {
      const signInCallback = getSignInCallback();
      mockAccountFindUnique.mockResolvedValue(null);
      mockFindFirst.mockResolvedValue(null);

      const result = await signInCallback({
        user: { id: 'user-1', email: 'test@test.com' },
        account: { provider: 'github', type: 'oauth', providerAccountId: '456' },
      } as Parameters<typeof signInCallback>[0]);

      expect(result).toBe(true);
    });

    it('should return true for credentials provider when user exists', async () => {
      const signInCallback = getSignInCallback();

      const result = await signInCallback({
        user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
        account: { provider: 'credentials', type: 'credentials', providerAccountId: 'user-1' },
      } as Parameters<typeof signInCallback>[0]);

      expect(result).toBe(true);
    });

    it('should return false for credentials provider when user is null', async () => {
      const signInCallback = getSignInCallback();

      const result = await signInCallback({
        user: null as unknown as { id: string; email: string },
        account: { provider: 'credentials', type: 'credentials', providerAccountId: '' },
      } as Parameters<typeof signInCallback>[0]);

      expect(result).toBe(false);
    });

    it('should return false for credentials provider when user is undefined', async () => {
      const signInCallback = getSignInCallback();

      const result = await signInCallback({
        user: undefined as unknown as { id: string; email: string },
        account: { provider: 'credentials', type: 'credentials', providerAccountId: '' },
      } as Parameters<typeof signInCallback>[0]);

      expect(result).toBe(false);
    });

    it('should return true when account is null (edge case)', async () => {
      const signInCallback = getSignInCallback();

      const result = await signInCallback({
        user: { id: 'user-1', email: 'test@test.com' },
        account: null,
      } as Parameters<typeof signInCallback>[0]);

      // account?.provider !== 'credentials' is true when account is null
      expect(result).toBe(true);
    });
  });

  describe('events', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    beforeEach(() => {
      consoleSpy.mockClear();
    });

    afterAll(() => {
      consoleSpy.mockRestore();
    });

    it('should log sign in event in development only', async () => {
      const signInEvent = authOptions.events!.signIn!;

      await signInEvent({
        user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
      } as Parameters<typeof signInEvent>[0]);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleSpy).toHaveBeenCalledWith('User signed in: test@test.com');
      } else {
        expect(consoleSpy).not.toHaveBeenCalled();
      }
    });

    it('should log sign out event in development only', async () => {
      const signOutEvent = authOptions.events!.signOut!;

      await signOutEvent({
        token: { email: 'test@test.com', sub: 'sub-1' },
      } as Parameters<typeof signOutEvent>[0]);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleSpy).toHaveBeenCalledWith('User signed out: test@test.com');
      } else {
        expect(consoleSpy).not.toHaveBeenCalled();
      }
    });

    it('should handle undefined email in sign in (development only)', async () => {
      const signInEvent = authOptions.events!.signIn!;

      await signInEvent({
        user: { id: 'user-1' },
      } as Parameters<typeof signInEvent>[0]);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleSpy).toHaveBeenCalledWith('User signed in: undefined');
      } else {
        expect(consoleSpy).not.toHaveBeenCalled();
      }
    });

    it('should handle undefined email in sign out (development only)', async () => {
      const signOutEvent = authOptions.events!.signOut!;

      await signOutEvent({
        token: { sub: 'sub-1' },
      } as Parameters<typeof signOutEvent>[0]);

      if (process.env.NODE_ENV === 'development') {
        expect(consoleSpy).toHaveBeenCalledWith('User signed out: undefined');
      } else {
        expect(consoleSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('GoogleProvider configuration', () => {
    it('should have allowDangerousEmailAccountLinking enabled', () => {
      const googleProvider = authOptions.providers.find(
        (p) => p.type === 'oauth'
      );
      expect(googleProvider).toBeDefined();
      expect((googleProvider as { allowDangerousEmailAccountLinking: boolean }).allowDangerousEmailAccountLinking).toBe(true);
    });

    it('should use env variables for client credentials or default to empty string', () => {
      const googleProvider = authOptions.providers.find(
        (p) => p.type === 'oauth'
      ) as { clientId: string; clientSecret: string };
      
      // Test the nullish coalescing - when env vars are undefined, should be empty string
      // When env vars are set, should use those values
      const expectedClientId = process.env.GOOGLE_CLIENT_ID ?? '';
      const expectedClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
      
      expect(googleProvider.clientId).toBe(expectedClientId);
      expect(googleProvider.clientSecret).toBe(expectedClientSecret);
      
      // Verify type is string (either empty or from env)
      expect(typeof googleProvider.clientId).toBe('string');
      expect(typeof googleProvider.clientSecret).toBe('string');
    });

    it('should use GOOGLE_CLIENT_ID when env var is set', () => {
      const originalClientId = process.env.GOOGLE_CLIENT_ID;
      const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      
      jest.resetModules();
      
      // Re-mock dependencies after reset
      jest.doMock('@/lib/prisma', () => ({
        prisma: {
          user: {
            findUnique: jest.fn(),
          },
        },
      }));
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn(),
      }));
      jest.doMock('@auth/prisma-adapter', () => ({
        PrismaAdapter: jest.fn(() => ({})),
      }));
      jest.doMock('next-auth/providers/credentials', () => ({
        __esModule: true,
        default: jest.fn((config) => ({
          ...config,
          type: 'credentials',
        })),
      }));
      jest.doMock('next-auth/providers/google', () => ({
        __esModule: true,
        default: jest.fn((config) => ({
          ...config,
          type: 'oauth',
        })),
      }));
      
      const { authOptions: freshOptions } = require('@/lib/auth');
      
      const googleProvider = freshOptions.providers.find(
        (p: { type: string }) => p.type === 'oauth'
      ) as { clientId: string; clientSecret: string };
      
      expect(googleProvider.clientId).toBe('test-client-id');
      expect(googleProvider.clientSecret).toBe('test-client-secret');
      
      // Restore
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    });

    it('should keep empty string when env var is empty (nullish coalescing edge case)', () => {
      const originalClientId = process.env.GOOGLE_CLIENT_ID;
      const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      // Empty string is NOT nullish, so ?? won't fallback
      process.env.GOOGLE_CLIENT_ID = '';
      process.env.GOOGLE_CLIENT_SECRET = '';
      
      jest.resetModules();
      
      jest.doMock('@/lib/prisma', () => ({
        prisma: {
          user: {
            findUnique: jest.fn(),
          },
        },
      }));
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn(),
      }));
      jest.doMock('@auth/prisma-adapter', () => ({
        PrismaAdapter: jest.fn(() => ({})),
      }));
      jest.doMock('next-auth/providers/credentials', () => ({
        __esModule: true,
        default: jest.fn((config) => ({
          ...config,
          type: 'credentials',
        })),
      }));
      jest.doMock('next-auth/providers/google', () => ({
        __esModule: true,
        default: jest.fn((config) => ({
          ...config,
          type: 'oauth',
        })),
      }));
      
      const { authOptions: freshOptions } = require('@/lib/auth');
      
      const googleProvider = freshOptions.providers.find(
        (p: { type: string }) => p.type === 'oauth'
      ) as { clientId: string; clientSecret: string };
      
      // Empty string should be preserved (not replaced by '')
      expect(googleProvider.clientId).toBe('');
      expect(googleProvider.clientSecret).toBe('');
      
      // Restore
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    });
  });

  describe('CredentialsProvider configuration', () => {
    it('should have correct credentials fields configured', () => {
      const credentialsProvider = authOptions.providers.find(
        (p) => p.type === 'credentials'
      ) as {
        credentials: {
          email: { label: string; type: string };
          password: { label: string; type: string };
          magicToken: { label: string; type: string };
        };
        name: string;
      };
      
      expect(credentialsProvider.name).toBe('credentials');
      expect(credentialsProvider.credentials.email).toEqual({
        label: 'Email',
        type: 'email',
      });
      expect(credentialsProvider.credentials.password).toEqual({
        label: 'Password',
        type: 'password',
      });
      expect(credentialsProvider.credentials.magicToken).toEqual({
        label: 'Magic',
        type: 'text',
      });
    });
  });

  describe('default export', () => {
    it('should export authOptions as default', () => {
      // Import the module fresh to check default export
      const authModule = require('@/lib/auth');
      expect(authModule.default).toBeDefined();
      expect(authModule.default.session?.strategy).toBe('jwt');
      expect(authModule.default.pages?.signIn).toBe('/auth/login');
    });
  });
});
