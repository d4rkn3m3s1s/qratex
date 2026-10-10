/**
 * POST /api/webhooks/stripe (P0-29): olay idempotency'si ve sıra koruması.
 *
 * Gerçek billing-core sahiplenme mantığı + bellek içi StripeEvent deposu ile:
 *  - Aynı olay iki kez teslim edilir → yalnız bir kez işlenir.
 *  - Paralel iki teslim → biri işler, diğeri 409 (Stripe sonra yeniden dener).
 *  - Daha yeni olay işlendikten sonra gelen eski olay işlenmez.
 *  - İşleme hatası → 500 + `failed`; yeniden deneme devralır ve işler.
 */
import { NextRequest } from 'next/server';

type Row = {
  id: string;
  type: string;
  objectId: string | null;
  stripeCreatedAt: Date | null;
  status: string;
  error: string | null;
  createdAt: Date;
  processedAt: Date | null;
};
const store = new Map<string, Row>();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    stripeEvent: {
      create: async ({ data }: { data: Omit<Row, 'createdAt' | 'error' | 'processedAt'> }) => {
        if (store.has(data.id)) throw Object.assign(new Error('Unique'), { code: 'P2002' });
        const row: Row = { error: null, processedAt: null, createdAt: new Date(), ...data } as Row;
        store.set(data.id, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => store.get(where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; OR: Array<Record<string, unknown>> }; data: Partial<Row> }) => {
        const row = store.get(where.id);
        if (!row) return { count: 0 };
        const match = where.OR.some((c) => {
          if (c.status !== row.status) return false;
          const created = c.createdAt as { lt?: Date } | undefined;
          return !created?.lt || row.createdAt < created.lt;
        });
        if (!match) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findFirst: async ({ where }: { where: { objectId: string; status: string; stripeCreatedAt: { gt: Date }; NOT: { id: string } } }) => {
        for (const row of store.values()) {
          if (
            row.objectId === where.objectId &&
            row.status === where.status &&
            row.id !== where.NOT.id &&
            row.stripeCreatedAt &&
            row.stripeCreatedAt > where.stripeCreatedAt.gt
          ) {
            return { id: row.id };
          }
        }
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = store.get(where.id);
        if (!row) throw Object.assign(new Error('nf'), { code: 'P2025' });
        Object.assign(row, data);
        return row;
      },
    },
    analyticsEvent: { create: jest.fn().mockResolvedValue({}) },
  },
}));

const mockSync = jest.fn();
jest.mock('@/lib/billing-core', () => {
  const actual = jest.requireActual('@/lib/billing-core');
  return { ...actual, syncSubscriptionToUser: (...a: unknown[]) => mockSync(...a) };
});

let nextEvent: Record<string, unknown> = {};
const stripe = {
  webhooks: { constructEvent: jest.fn(() => nextEvent) },
  subscriptions: { retrieve: jest.fn(async (id: string) => ({ id, status: 'active' })) },
};
jest.mock('@/lib/stripe', () => ({
  getStripe: () => stripe,
  getStripeWebhookSecret: () => 'whsec_test',
}));

import { POST } from '@/app/api/webhooks/stripe/route';

function req() {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=x' },
    body: '{}',
  });
}

function subEvent(id: string, created: number, status = 'active') {
  return {
    id,
    type: 'customer.subscription.updated',
    created,
    data: { object: { id: 'sub_1', status, customer: 'cus_1', metadata: { dealerId: 'd1' } } },
  };
}

beforeEach(() => {
  store.clear();
  mockSync.mockReset().mockResolvedValue({ status: 'applied', dealerId: 'd1', subscriptionId: 'sub_1' });
});

describe('Stripe webhook idempotency', () => {
  it('aynı olay iki kez teslim edilince yalnız bir kez işlenir', async () => {
    nextEvent = subEvent('evt_1', 1000);
    const a = await POST(req());
    const b = await POST(req());

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ duplicate: true });
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(store.get('evt_1')?.status).toBe('processed');
  });

  it('paralel iki teslimden yalnız biri işler; diğeri 409 alır', async () => {
    nextEvent = subEvent('evt_p', 1000);
    let release: () => void = () => undefined;
    mockSync.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ status: 'applied' }); })
    );
    const first = POST(req());
    await new Promise((r) => setTimeout(r, 5));
    const second = await POST(req());
    release();
    const firstRes = await first;

    expect(second.status).toBe(409);
    expect(firstRes.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('daha yeni olay işlendikten sonra gelen ESKİ olay işlenmez (sıra koruması)', async () => {
    nextEvent = subEvent('evt_new', 2000, 'canceled');
    await POST(req());
    nextEvent = subEvent('evt_old', 1000, 'active');
    const res = await POST(req());

    expect(await res.json()).toMatchObject({ stale: true });
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(store.get('evt_old')?.status).toBe('ignored');
  });

  it('işleme hatası 500 + failed; Stripe yeniden denemesi devralıp işler', async () => {
    nextEvent = subEvent('evt_f', 1000);
    mockSync.mockRejectedValueOnce(new Error('geçici'));
    const a = await POST(req());
    expect(a.status).toBe(500);
    expect(store.get('evt_f')?.status).toBe('failed');

    const b = await POST(req());
    expect(b.status).toBe(200);
    expect(store.get('evt_f')?.status).toBe('processed');
    expect(mockSync).toHaveBeenCalledTimes(2);
  });

  it('checkout.session.completed aboneliği Stripe\'tan taze çekip uzlaştırır', async () => {
    nextEvent = {
      id: 'evt_cs',
      type: 'checkout.session.completed',
      created: 1000,
      data: { object: { id: 'cs_1', mode: 'subscription', subscription: 'sub_9' } },
    };
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_9');
    expect(store.get('evt_cs')?.objectId).toBe('sub_9');
  });

  it('ilgilenilmeyen olay türü kayıt açmadan 200 döner', async () => {
    nextEvent = { id: 'evt_x', type: 'charge.succeeded', created: 1, data: { object: {} } };
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(store.size).toBe(0);
  });
});
