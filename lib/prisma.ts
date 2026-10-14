import { PrismaClient } from '@prisma/client';
import { servePublicRef } from '@/lib/storage/served-url';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * R2 bucket'ı public değil (docs/ops/R2-GUVENLIK.md). DB'de duran ESKİ tam r2.dev URL'leri
 * (logo, ürün görseli, rozet/ödül/kozmetik ikonu…) okunurken `/api/files/public/<key>` iç ucuna
 * çevrilir — migration yok, her okuma yolu (select/include, iç içe ilişki) tek noktadan kapsanır.
 * Yalnız `R2_PUBLIC_URL/` ile başlayan değerler değişir; emoji/harici URL/iç URL aynen kalır.
 * (`$queryRaw` sonuçları kapsanmaz.) Tür PrismaClient olarak kalır: alan türleri değişmiyor.
 */
function servedField<F extends string>(field: F) {
  return {
    [field]: {
      needs: { [field]: true } as Record<F, true>,
      compute: (row: Record<F, unknown>) => servePublicRef(row[field]),
    },
  } as Record<F, { needs: Record<F, true>; compute: (row: Record<F, unknown>) => unknown }>;
}

function withServedFileUrls(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: 'served-file-urls',
    result: {
      user: { ...servedField('businessLogo'), ...servedField('image') },
      product: servedField('image'),
      productCategory: servedField('icon'),
      badge: servedField('icon'),
      quest: servedField('icon'),
      reward: servedField('icon'),
      cosmeticItem: servedField('imageUrl'),
      donationProject: servedField('icon'),
      vIPTier: servedField('icon'),
      seasonalCampaign: servedField('imageUrl'),
      menuItem: servedField('icon'),
    },
  }) as unknown as PrismaClient;
}

function createPrismaClient() {
  try {
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is not defined');
    }
    return withServedFileUrls(new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      // Etkileşimli $transaction havuzdan bağlantı beklerken varsayılan 2 sn'de P2028 ("Unable to
      // start a transaction in the given time") ile düşüyordu: Neon pooler + connection_limit=5
      // altında eşzamanlı istek patlamasında vaka açma/çözme 500 verdi (e2e b-bugun-gelen).
      // Yalnız bekleme süresi uzar; çağrı başına verilen seçenekler bunu yine ezer.
      transactionOptions: { maxWait: 10_000 },
    }));
  } catch (error) {
    console.error('Failed to create Prisma Client:', error);
    throw error;
  }
}

// Dev önbelleği PrismaClient SINIFINA göre anahtarlanır: Next dev'de her rota paketi kendi
// generated-prisma-client kopyasını taşıyabilir; tek global örnek başka kopyanın `Prisma.sql`
// parçalarını `instanceof Sql` ile tanımaz → iç içe parça `$1` parametresi olarak gider
// ("syntax error at or near $1", e2e b-analitik-ai: kıyas/etki 500). Prod'da davranış aynı.
const devClients = ((globalThis as unknown as { __prismaByCtor?: Map<unknown, PrismaClient> }).__prismaByCtor ??=
  new Map<unknown, PrismaClient>());
const cachedForThisCopy = devClients.get(PrismaClient) ?? (globalForPrisma.prisma instanceof PrismaClient ? globalForPrisma.prisma : undefined);

export const prisma = cachedForThisCopy ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  devClients.set(PrismaClient, prisma);
  globalForPrisma.prisma = prisma;
}

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

