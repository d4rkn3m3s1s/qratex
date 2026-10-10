/**
 * lib/economy eşzamanlılık testleri — bellek içi sahte veritabanı ile.
 *
 * Sahte DB her işlemde event loop'a döner (setImmediate) ki paralel istekler gerçekten
 * iç içe geçsin; `SELECT … FOR UPDATE` çağrısı kullanıcı başına bir kilit alır ve kilit
 * transaction bitene kadar tutulur (Postgres satır kilidinin davranışı).
 * Kontrol testi: kilit kapatıldığında aynı senaryo tavanı AŞIYOR → testler kilide duyarlı.
 * Gerçek DB'ye GİDİLMEZ.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { mintPoints } from '@/lib/economy/mint';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';

type User = { id: string; points: number; xp: number; level: number; fraudStatus: string };
type LedgerRow = Record<string, unknown> & { id: string; idempotencyKey?: string | null; userId: string; delta: number };
type EventRow = { userId: string; event: string; category: string; data: Record<string, unknown>; createdAt: Date };

const tick = () => new Promise<void>((r) => setImmediate(r));

function createFakeDb(users: Array<Partial<User> & { id: string }>, opts: { lock?: boolean } = {}) {
  const lockEnabled = opts.lock !== false;
  const state = {
    users: new Map<string, User>(users.map((u) => [u.id, { points: 0, xp: 0, level: 1, fraudStatus: 'clean', ...u }])),
    ledger: [] as LedgerRow[],
    events: [] as EventRow[],
  };
  const locks = new Map<string, Promise<void>>();

  function makeTx(releases: Array<() => void>) {
    return {
      $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
        const userId = values[0] as string;
        if (lockEnabled) {
          const prev = locks.get(userId) ?? Promise.resolve();
          let release!: () => void;
          const mine = new Promise<void>((r) => (release = r));
          locks.set(userId, prev.then(() => mine));
          await prev;
          releases.push(release);
        }
        await tick();
        const u = state.users.get(userId);
        return u ? [{ id: u.id, fraudStatus: u.fraudStatus }] : [];
      },
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          await tick();
          const u = state.users.get(where.id);
          return u ? { ...u } : null;
        },
        update: async ({ where, data }: { where: { id: string }; data: { points?: { increment: number }; xp?: { increment: number } } }) => {
          await tick();
          const u = state.users.get(where.id)!;
          u.points += data.points?.increment ?? 0;
          u.xp += data.xp?.increment ?? 0;
          return { ...u };
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; points?: { gte: number }; level?: { lt: number } };
          data: { points?: { decrement: number }; level?: number };
        }) => {
          await tick();
          // Tek ifade atomik (Postgres UPDATE … WHERE): kontrol + yazım arasında yield yok.
          const u = state.users.get(where.id);
          if (!u) return { count: 0 };
          if (where.points && !(u.points >= where.points.gte)) return { count: 0 };
          if (where.level && !(u.level < where.level.lt)) return { count: 0 };
          if (data.points) u.points -= data.points.decrement;
          if (data.level !== undefined) u.level = data.level;
          return { count: 1 };
        },
      },
      pointsLedger: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
          await tick();
          return state.ledger.find((l) => l.idempotencyKey === where.idempotencyKey) ?? null;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          await tick();
          if (data.idempotencyKey && state.ledger.some((l) => l.idempotencyKey === data.idempotencyKey)) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
          }
          const row = { id: `led${state.ledger.length + 1}`, createdAt: new Date(), ...data } as LedgerRow;
          state.ledger.push(row);
          return { id: row.id };
        },
      },
      analyticsEvent: {
        findMany: async ({ where }: { where: { userId: string; event: string; category: { in: string[] }; createdAt: { gte: Date } } }) => {
          await tick();
          return state.events
            .filter(
              (e) =>
                e.userId === where.userId &&
                e.event === where.event &&
                where.category.in.includes(e.category) &&
                e.createdAt >= where.createdAt.gte
            )
            .map((e) => ({ data: e.data, createdAt: e.createdAt }));
        },
        create: async ({ data }: { data: Omit<EventRow, 'createdAt'> }) => {
          await tick();
          state.events.push({ ...data, createdAt: new Date() });
          return { id: 'ev' };
        },
      },
    };
  }

  const root = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const releases: Array<() => void> = [];
      try {
        return await fn(makeTx(releases));
      } finally {
        releases.forEach((r) => r());
      }
    },
  };
  return { root, state };
}

const N = 20;

describe('mintPoints eşzamanlılık', () => {
  it('aynı idempotencyKey ile 20 paralel istek → bakiye tam bir kredi kadar artar', async () => {
    const { root, state } = createFakeDb([{ id: 'u1', points: 0 }]);
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        mintPoints(root as never, { userId: 'u1', points: 150, source: 'quest', idempotencyKey: 'quest:q1:u1' })
      )
    );
    expect(state.users.get('u1')!.points).toBe(150);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(results.filter((r) => r.duplicate)).toHaveLength(N - 1);
    expect(state.ledger).toHaveLength(1);
    expect(state.events.filter((e) => e.event === 'points_credited')).toHaveLength(1);
  });

  it('farklı anahtarlarla 20 paralel geri bildirim kredisi → günlük tavan (500) asla aşılmaz', async () => {
    const { root, state } = createFakeDb([{ id: 'u1', points: 0 }]);
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        mintPoints(root as never, { userId: 'u1', points: 100, source: 'feedback', idempotencyKey: `feedback:f${i}` })
      )
    );
    const total = results.reduce((s, r) => s + r.credited, 0);
    expect(total).toBe(500);
    expect(state.users.get('u1')!.points).toBe(500);
    expect(results.filter((r) => r.capped)).toHaveLength(N - 5);
    // Defter ve bakiye birbirini tutar (mutabakat değişmezi).
    const ledgerSum = state.ledger.reduce((s, l) => s + (l.delta as number), 0);
    expect(ledgerSum).toBe(state.users.get('u1')!.points);
  });

  it('KONTROL: kilit olmasaydı aynı senaryo tavanı aşardı (test kilide duyarlı)', async () => {
    const { root, state } = createFakeDb([{ id: 'u1', points: 0 }], { lock: false });
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        mintPoints(root as never, { userId: 'u1', points: 100, source: 'feedback', idempotencyKey: `feedback:f${i}` })
      )
    );
    expect(state.users.get('u1')!.points).toBeGreaterThan(500);
  });

  it('farklı kullanıcılar birbirini kilitlemez: her biri kendi tavanını doldurur', async () => {
    const { root, state } = createFakeDb([{ id: 'a' }, { id: 'b' }]);
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        mintPoints(root as never, { userId: i % 2 ? 'a' : 'b', points: 100, source: 'game', idempotencyKey: `game:s${i}` })
      )
    );
    expect(state.users.get('a')!.points).toBe(600);
    expect(state.users.get('b')!.points).toBe(600);
  });
});

describe('debitPoints eşzamanlılık', () => {
  it('1.000 bakiyeyle 20 paralel 100’lük harcama → tam 10 başarılı, bakiye asla eksiye düşmez', async () => {
    const { root, state } = createFakeDb([{ id: 'u1', points: 1000 }]);
    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        root.$transaction((tx) => debitPoints(tx as never, { userId: 'u1', points: 100, source: 'shop', sourceId: `o${i}` }))
      )
    );
    const ok = settled.filter((s) => s.status === 'fulfilled');
    const failed = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(10);
    expect(failed.every((f) => f.reason instanceof InsufficientPointsError)).toBe(true);
    expect(state.users.get('u1')!.points).toBe(0);
    expect(state.ledger.filter((l) => (l.delta as number) < 0)).toHaveLength(10);
    expect(state.events.filter((e) => e.event === 'points_spent')).toHaveLength(10);
  });
});
