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

export default prisma;

