/**
 * Test yardımcısı: her model ve metodu talep anında `jest.fn()` olan sahte Prisma istemcisi.
 *
 *   jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
 *   import { db, resetDb } from '../helpers/prisma-proxy';
 *   db.feedback.findMany.mockResolvedValue([...]);
 *
 * `$transaction(fn)` aynı sahte istemciyi `tx` olarak verir; dizi biçimi Promise.all'dır.
 * Gerçek veritabanına ASLA gitmez.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type ModelMock = Record<string, jest.Mock>;

const models: Record<string, ModelMock> = {};
const IGNORED = new Set(['then', 'catch', 'finally', '__esModule', 'toJSON', 'constructor', 'asymmetricMatch', 'nodeType', '$$typeof']);

function model(name: string): ModelMock {
  if (!models[name]) {
    models[name] = new Proxy({} as ModelMock, {
      get(target, key) {
        if (typeof key !== 'string' || IGNORED.has(key)) return undefined;
        if (!target[key]) target[key] = jest.fn();
        return target[key];
      },
    });
  }
  return models[name] as ModelMock;
}

export const $transaction = jest.fn();

export const prisma: any = new Proxy(
  {},
  {
    get(_t, key) {
      if (typeof key !== 'string' || IGNORED.has(key)) return undefined;
      if (key === '$transaction') return $transaction;
      return model(key);
    },
  }
);

/** Testlerde okunaklı erişim: `db.user.findUnique.mockResolvedValue(...)`. */
export const db: Record<string, ModelMock> = prisma;

function defaultTransaction(arg: unknown) {
  if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(prisma);
  return Promise.all(arg as Promise<unknown>[]);
}

export function resetDb(): void {
  for (const m of Object.values(models)) {
    for (const key of Object.keys(m)) (m[key] as jest.Mock).mockReset();
  }
  $transaction.mockReset();
  $transaction.mockImplementation(defaultTransaction);
}
resetDb();

export const isPrismaConnectivityError = () => false;
export const withDbRetry = <T,>(fn: () => Promise<T>) => fn();
