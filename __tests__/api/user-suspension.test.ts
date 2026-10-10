/**
 * P0-25 — "hard delete yerine askıya alma": geri alınabilir hesap kapatma.
 *
 * Önceden yöneticinin tek seçeneği `user.delete` (cascade ile denetim izi + başkalarının
 * yorumları gidiyordu) ya da artık geri döndürülemez anonimleştirmeydi. Askıya alma hesabı
 * ve bütün veriyi korur, girişi/API erişimini kapatır, açık oturumları düşürür.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  prisma: require('../helpers/data-safety-prisma-mock').createPrismaMock(),
  isPrismaConnectivityError: () => false,
}));
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
jest.mock('@/lib/rate-limit', () => ({ checkAdminRateLimit: () => ({ ok: true }) }));
const mockInvalidate = jest.fn(async () => undefined);
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: (id: string) => mockInvalidate(id) }));

import { prisma } from '@/lib/prisma';
import type { PrismaMock } from '../helpers/data-safety-prisma-mock';

const db = prisma as unknown as PrismaMock;
const ADMIN = { session: { user: { id: 'ckadmin000000000000000000', role: 'ADMIN', email: 'a@x.com', name: 'Yönetici' } } };
const U1 = 'ckabc0000000000000000000a';
const U2 = 'ckabc0000000000000000000b';
const U3 = 'ckabc0000000000000000000c';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  db.__reset();
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue(ADMIN);
  mockInvalidate.mockClear();
});

describe('POST /api/admin/users/bulk suspend/unsuspend', () => {
  it('askıya alır: koşullu yazım + sessionVersion artışı + audit aynı tx; yönetici ve kendi hesap atlanır; silme yok', async () => {
    db.user.findMany.mockResolvedValue([
      { id: U1, role: 'CUSTOMER', suspendedAt: null, anonymizedAt: null },
      { id: U2, role: 'ADMIN', suspendedAt: null, anonymizedAt: null },
    ]);
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(post({ action: 'suspend', userIds: [U1, U2, ADMIN.session.user.id], reason: 'Sahte yorum şüphesi' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suspended).toBe(1);
    expect(body.skipped.map((s: { id: string }) => s.id).sort()).toEqual([ADMIN.session.user.id, U2].sort());

    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    const call = db.user.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: U1, suspendedAt: null, anonymizedAt: null });
    expect(call.data.suspendedAt).toBeInstanceOf(Date);
    expect(call.data).toMatchObject({ suspendedReason: 'Sahte yorum şüphesi', sessionVersion: { increment: 1 } });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: 'BULK_SUSPEND_USERS', userId: ADMIN.session.user.id });
    expect(mockInvalidate).toHaveBeenCalledWith(U1);
    expect(db.user.delete).not.toHaveBeenCalled();
    expect(db.user.deleteMany).not.toHaveBeenCalled();
  });

  it('gerekçesiz askıya alma 400 ve yazım yok', async () => {
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(post({ action: 'suspend', userIds: [U1] }));
    expect(res.status).toBe(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('askıdan çıkarma yalnız askıdaki, anonimleşmemiş hesapta çalışır', async () => {
    db.user.findMany.mockResolvedValue([
      { id: U1, role: 'CUSTOMER', suspendedAt: new Date(), anonymizedAt: null },
      { id: U2, role: 'CUSTOMER', suspendedAt: null, anonymizedAt: null },
      { id: U3, role: 'CUSTOMER', suspendedAt: new Date(), anonymizedAt: new Date() },
    ]);
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(post({ action: 'unsuspend', userIds: [U1, U2, U3] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unsuspended).toBe(1);
    expect(db.user.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: U1, suspendedAt: { not: null }, anonymizedAt: null },
      data: { suspendedAt: null, suspendedReason: null },
    });
  });

  it('bozuk JSON 400 döner (500 değil)', async () => {
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(post('{bozuk'));
    expect(res.status).toBe(400);
  });
});
