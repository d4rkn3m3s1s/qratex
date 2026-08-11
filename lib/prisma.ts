import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  try {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is not defined');
    }
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  } catch (error) {
    console.error('Failed to create Prisma Client:', error);
    throw error;
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Neon uyku, ağ kesintisi, bağlantı zaman aşımı vb. — geçici, yeniden denenebilir. */
export function isPrismaConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, code } = err as { name?: string; code?: string };
  if (name === 'PrismaClientKnownRequestError' && typeof code === 'string') {
    return ['P1001', 'P1002', 'P1017', 'P2024'].includes(code);
  }
  if (name === 'PrismaClientInitializationError') return true;
  return false;
}

/** Serialization failure (Serializable transaction çakışması) — retry edilmeli. */
export function isSerializationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message } = err as { code?: string; message?: string };
  // Prisma P2034 = transaction write conflict/deadlock; Postgres 40001 = serialization_failure.
  return code === 'P2034' || (typeof message === 'string' && message.includes('40001'));
}

/**
 * Geçici hataları (bağlantı VEYA serialization) kısa backoff'la yeniden dener.
 * YALNIZ idempotent/salt-okunur işlerde veya kendi transaction'ı olan işlerde kullan
 * (yan etkili yazma yolunu retry'lamak çift işlem yapabilir — orada idempotency anahtarına güven).
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 80;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !(isPrismaConnectivityError(err) || isSerializationError(err))) throw err;
      // full jitter üstel backoff
      const delay = Math.floor(Math.random() * Math.min(2000, base * Math.pow(2, attempt)));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export default prisma;

