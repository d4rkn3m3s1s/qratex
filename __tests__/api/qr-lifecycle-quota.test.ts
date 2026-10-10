/**
 * QR yaşam döngüsü kotası (F12 / P0-14).
 *
 * Saldırı (yeniden üretim): planı 3 QR olan ve 3 canlı kodu bulunan bayi
 *   (1) A'yı rotate eder → A iptal, A' canlı (canlı = 3)
 *   (2) PATCH /api/qr-codes/A { revoke: false } → A tekrar canlı (canlı = 4)
 *   (3) döngü → sınırsız canlı QR.
 * Beklenen: (2) 402 PLAN_LIMIT_REACHED; rotate kota-nötr ve ayarları taşır.
 */
import { NextRequest } from 'next/server';

type Qr = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dealerId: string;
  isActive: boolean;
  revokedAt: Date | null;
  archivedAt: Date | null;
  expiresAt: Date | null;
  segmentConfig: unknown;
  locationId: string | null;
};
const qrs = new Map<string, Qr>();
let seq = 0;
const lockCalls: string[] = [];

function matches(row: Qr, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cur = (row as unknown as Record<string, unknown>)[k];
    if (v === null) {
      if (cur !== null) return false;
    } else if (typeof v === 'object' && v !== null && 'not' in (v as object)) {
      if ((v as { not: unknown }).not === null && cur === null) return false;
    } else if (cur !== v) return false;
  }
  return true;
}

const db = {
  qRCode: {
    findUnique: jest.fn(async ({ where }: { where: { id?: string; code?: string } }) => {
      if (where.id) return qrs.get(where.id) ?? null;
      return [...qrs.values()].find((q) => q.code === where.code) ?? null;
    }),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => [...qrs.values()].filter((q) => matches(q, where)).length),
    create: jest.fn(async ({ data }: { data: Partial<Qr> }) => {
      const row: Qr = {
        id: `qr_${++seq}`,
        description: null,
        isActive: true,
        revokedAt: null,
        archivedAt: null,
        expiresAt: null,
        segmentConfig: null,
        locationId: null,
        ...(data as Qr),
      };
      qrs.set(row.id, row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Qr> }) => {
      let count = 0;
      for (const q of qrs.values()) {
        if (matches(q, where)) {
          Object.assign(q, data);
          count++;
        }
      }
      return { count };
    }),
  },
  auditLog: { create: jest.fn() },
  analyticsEvent: { create: jest.fn().mockResolvedValue({}) },
  $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    lockCalls.push(String(values[0]));
    return 1;
  }),
};

jest.mock('@/lib/prisma', () => ({
  prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) },
}));
jest.mock('@prisma/client', () => ({ Prisma: { JsonNull: 'JsonNull' } }));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'dealer_1', role: 'DEALER' } } })),
}));
jest.mock('@/lib/plan-limits', () => ({
  getDealerPlanLimits: jest.fn(async () => ({ maxQRCodes: 3, maxBranches: 1, planName: 'Ücretsiz' })),
}));
jest.mock('@/lib/data-safety/archive', () => ({
  impactPreviewResponse: jest.fn(),
  readArchiveIntent: jest.fn(),
}));
jest.mock('@/lib/data-safety/audit', () => ({
  actorFromSession: jest.fn(() => ({})),
  auditEntry: jest.fn(() => ({})),
}));
let codeSeq = 0;
jest.mock('@/lib/utils', () => ({ generateQRCode: () => `CODE${++codeSeq}` }));

import { PATCH } from '@/app/api/qr-codes/[id]/route';
import { POST as ROTATE } from '@/app/api/qr-codes/[id]/rotate/route';

function seed(id: string, extra: Partial<Qr> = {}) {
  qrs.set(id, {
    id,
    code: `C_${id}`,
    name: `Masa ${id}`,
    description: null,
    dealerId: 'dealer_1',
    isActive: true,
    revokedAt: null,
    archivedAt: null,
    expiresAt: null,
    segmentConfig: null,
    locationId: null,
    ...extra,
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patchReq = (body: unknown) =>
  new NextRequest('http://localhost/api/qr-codes/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const live = () => [...qrs.values()].filter((q) => !q.revokedAt && !q.archivedAt).length;

beforeEach(() => {
  qrs.clear();
  lockCalls.length = 0;
  seed('A');
  seed('B');
  seed('C');
});

describe('QR rotate + revoke:false kota açığı', () => {
  it('rotate kota-nötrdür ve ayarları yeni koda taşır', async () => {
    const exp = new Date('2027-01-01T00:00:00Z');
    Object.assign(qrs.get('A') as Qr, { expiresAt: exp, locationId: 'loc_1', segmentConfig: { new: { welcomeText: 'Hoş geldiniz' } } });

    const res = await ROTATE(new NextRequest('http://localhost/api/qr-codes/A/rotate', { method: 'POST' }), ctx('A'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(live()).toBe(3);
    expect(qrs.get('A')?.revokedAt).toBeInstanceOf(Date);
    const created = qrs.get(body.qrCode.id) as Qr;
    expect(created.expiresAt).toEqual(exp);
    expect(created.locationId).toBe('loc_1');
    expect(created.segmentConfig).toEqual({ new: { welcomeText: 'Hoş geldiniz' } });
    expect(lockCalls).toContain('qr-quota:dealer_1');
  });

  it('SALDIRI: rotate sonrası eski kodu revoke:false ile geri açmak limitte 402 döner', async () => {
    await ROTATE(new NextRequest('http://localhost/api/qr-codes/A/rotate', { method: 'POST' }), ctx('A'));
    expect(live()).toBe(3);

    const res = await PATCH(patchReq({ revoke: false }), ctx('A'));

    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', quota: { used: 3, limit: 3 } });
    expect(qrs.get('A')?.revokedAt).toBeInstanceOf(Date);
    expect(live()).toBe(3);
  });

  it('limit altında iptal geri alınabilir', async () => {
    (qrs.get('C') as Qr).revokedAt = new Date();
    const res = await PATCH(patchReq({ revoke: false }), ctx('C'));
    expect(res.status).toBe(200);
    expect(qrs.get('C')?.revokedAt).toBeNull();
    expect(lockCalls).toContain('qr-quota:dealer_1');
  });

  it('arşivden geri alma da canlı limiti aşamaz', async () => {
    const t = new Date();
    seed('D', { archivedAt: t, revokedAt: t, isActive: false });
    const res = await PATCH(patchReq({ restore: true }), ctx('D'));
    expect(res.status).toBe(402);
    expect(qrs.get('D')?.archivedAt).toEqual(t);
  });

  it('kotayı etkilemeyen alan güncellemesi kilit almaz', async () => {
    const res = await PATCH(patchReq({ name: 'Yeni ad' }), ctx('A'));
    expect(res.status).toBe(200);
    expect(lockCalls).toHaveLength(0);
  });
});
