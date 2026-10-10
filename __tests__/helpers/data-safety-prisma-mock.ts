/**
 * Veri koruma testleri için otomatik Prisma sahtesi. GERÇEK DB'YE GİTMEZ.
 *
 * Herhangi bir model temsilcisine (`prisma.qRCode`, `tx.badge` …) erişildiğinde jest.fn
 * metotlarıyla oluşturulur. Varsayılan dönüşler: findUnique/findFirst → null, findMany → [],
 * count → 0, updateMany/deleteMany/createMany → { count: 0 }, create/update/upsert → { id }.
 * `$transaction(fn)` aynı sahteyi tx olarak geçirir; dizi biçimi Promise.all ile çözülür.
 *
 *   jest.mock('@/lib/prisma', () => ({ prisma: require('../helpers/data-safety-prisma-mock').createPrismaMock() }));
 *   import { prisma } from '@/lib/prisma';
 *   const db = prisma as unknown as PrismaMock;
 *   db.badge.findUnique.mockResolvedValue({...});
 */
type Fn = jest.Mock;
export type Delegate = Record<string, Fn>;
export type PrismaMock = Record<string, Delegate> & {
  $transaction: Fn;
  $queryRaw: Fn;
  $executeRaw: Fn;
  __reset: () => void;
};

const DEFAULTS: Record<string, () => unknown> = {
  findUnique: () => null,
  findUniqueOrThrow: () => null,
  findFirst: () => null,
  findMany: () => [],
  count: () => 0,
  aggregate: () => ({ _sum: {}, _count: { _all: 0 }, _max: {} }),
  groupBy: () => [],
  updateMany: () => ({ count: 0 }),
  deleteMany: () => ({ count: 0 }),
  createMany: () => ({ count: 0 }),
  create: () => ({ id: 'created-id' }),
  update: () => ({ id: 'updated-id' }),
  upsert: () => ({ id: 'upserted-id' }),
  delete: () => ({ id: 'deleted-id' }),
};

function makeDelegate(): Delegate {
  const store: Delegate = {};
  return new Proxy(store, {
    get(target, prop: string) {
      if (!(prop in target)) {
        const def = DEFAULTS[prop] ?? (() => undefined);
        target[prop] = jest.fn(async () => def());
      }
      return target[prop];
    },
  });
}

export function createPrismaMock(): PrismaMock {
  const delegates: Record<string, Delegate> = {};
  let self: PrismaMock;
  const base = {
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(self);
      if (Array.isArray(arg)) return Promise.all(arg);
      return undefined;
    }),
    $queryRaw: jest.fn(async () => []),
    $executeRaw: jest.fn(async () => 0),
    __reset: () => {
      for (const k of Object.keys(delegates)) delete delegates[k];
      base.$transaction.mockClear();
      base.$queryRaw.mockClear();
      base.$executeRaw.mockClear();
    },
  };
  self = new Proxy(base as unknown as PrismaMock, {
    get(target, prop: string) {
      if (prop in target) return (target as Record<string, unknown>)[prop];
      if (prop === 'then') return undefined; // await edilebilir sanılmasın
      if (!delegates[prop]) delegates[prop] = makeDelegate();
      return delegates[prop];
    },
  });
  return self;
}

/** Bir çağrı listesindeki herhangi bir modelde yıkıcı silme yapıldı mı? */
export function destructiveCalls(db: PrismaMock, models: string[]): string[] {
  const hits: string[] = [];
  for (const m of models) {
    const d = db[m] as Delegate;
    for (const op of ['delete', 'deleteMany']) {
      if ((d[op] as Fn).mock.calls.length > 0) hits.push(`${m}.${op}`);
    }
  }
  return hits;
}
