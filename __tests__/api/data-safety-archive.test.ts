/**
 * P0-24 / P0-26 — "silme" uçları ARŞİVDİR; hiçbir uç hard delete + cascade tetiklemez.
 *
 * Saldırı/hata senaryoları (önceki davranış → şimdi):
 *  - Bayi kötü yorum almış QR'ı siler → yorumlar cascade ile yok olurdu. Şimdi QR arşivlenir,
 *    `qRCode.delete/deleteMany` hiç çağrılmaz.
 *  - Bayi 1000 QR'ı toplu siler → şimdi 410, yazım yok.
 *  - Admin 50 kişinin puanla aldığı ödülü siler → kupon kodları giderdi. Şimdi onaysız 409
 *    + etki önizlemesi; onaylı istekte arşiv.
 *  - Admin aboneli planı siler → aboneler ücretsiz kademeye düşerdi. Şimdi 409/arşiv.
 *  - Admin kartı siler → tüketim + yorum + kart izi silinirdi. Şimdi arşiv + BLOCKED.
 *  - Bloklu (çalıntı) kart "müşteriden kaldır" ile UNUSED olurdu. Şimdi 409.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  prisma: require('../helpers/data-safety-prisma-mock').createPrismaMock(),
  isPrismaConnectivityError: () => false,
}));

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => null) }));
const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn(async () => ({ key: null, cached: false })),
  storeIdempotency: jest.fn(async () => undefined),
}));
jest.mock('@/lib/gamification-ab', () => ({ getVariant: jest.fn(async () => null) }));

import { prisma } from '@/lib/prisma';
import { destructiveCalls, type PrismaMock } from '../helpers/data-safety-prisma-mock';

const db = prisma as unknown as PrismaMock;

const ADMIN = { session: { user: { id: 'admin-1', role: 'ADMIN', email: 'a@x.com', name: 'Admin' } } };
const DEALER = { session: { user: { id: 'dealer-1', role: 'DEALER', email: 'd@x.com', name: 'Bayi' } } };

function req(url: string, init: { method?: string; body?: unknown } = {}) {
  return new NextRequest(url, {
    method: init.method ?? 'DELETE',
    headers: { 'content-type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const ALL_MODELS = ['qRCode', 'feedback', 'badge', 'userBadge', 'reward', 'userReward', 'pricingPlan', 'physicalCard', 'consumption', 'consumptionReview', 'cardAuditLog'];

beforeEach(() => {
  db.__reset();
  mockRequireAuth.mockReset();
});

describe('QR silme = arşiv (P0-24)', () => {
  it('yorumlu QR silinince delete çağrılmaz; arşiv + iptal + audit aynı tx', async () => {
    mockRequireAuth.mockResolvedValue(DEALER);
    db.qRCode.findUnique.mockResolvedValue({
      id: 'qr-1', name: 'Masa 1', dealerId: 'dealer-1', isActive: true, archivedAt: null, revokedAt: null,
      _count: { feedbacks: 37 },
    });
    db.qRCode.updateMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/qr-codes/[id]/route');
    const res = await DELETE(req('http://localhost/api/qr-codes/qr-1'), params('qr-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(true);
    expect(destructiveCalls(db, ALL_MODELS)).toEqual([]);
    const call = db.qRCode.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'qr-1', dealerId: 'dealer-1', archivedAt: null });
    expect(call.data.isActive).toBe(false);
    expect(call.data.archivedAt).toBeInstanceOf(Date);
    expect(call.data.revokedAt).toBe(call.data.archivedAt);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'ARCHIVE_QR_CODE', userId: 'dealer-1' });
  });

  it('başka bayinin QR\'ı 403, yazım yok', async () => {
    mockRequireAuth.mockResolvedValue(DEALER);
    db.qRCode.findUnique.mockResolvedValue({ id: 'qr-2', name: 'X', dealerId: 'dealer-2', archivedAt: null, revokedAt: null, isActive: true, _count: { feedbacks: 0 } });
    const { DELETE } = await import('@/app/api/qr-codes/[id]/route');
    const res = await DELETE(req('http://localhost/api/qr-codes/qr-2'), params('qr-2'));
    expect(res.status).toBe(403);
    expect(db.qRCode.updateMany).not.toHaveBeenCalled();
  });

  it('dryRun yalnız etki önizlemesi döner', async () => {
    mockRequireAuth.mockResolvedValue(DEALER);
    db.qRCode.findUnique.mockResolvedValue({ id: 'qr-1', name: 'Masa', dealerId: 'dealer-1', archivedAt: null, revokedAt: null, isActive: true, _count: { feedbacks: 5 } });
    const { DELETE } = await import('@/app/api/qr-codes/[id]/route');
    const res = await DELETE(req('http://localhost/api/qr-codes/qr-1?dryRun=1'), params('qr-1'));
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.impact.items[0]).toMatchObject({ key: 'feedbacks', value: 5 });
    expect(db.qRCode.updateMany).not.toHaveBeenCalled();
  });

  it('arşivlenmiş QR düzenlenemez; restore arşivle konan iptali de kaldırır', async () => {
    mockRequireAuth.mockResolvedValue(DEALER);
    const at = new Date('2026-10-01T00:00:00Z');
    db.qRCode.findUnique.mockResolvedValueOnce({ id: 'qr-1', dealerId: 'dealer-1', archivedAt: at, revokedAt: at });
    const { PATCH } = await import('@/app/api/qr-codes/[id]/route');
    const blocked = await PATCH(req('http://localhost/api/qr-codes/qr-1', { method: 'PATCH', body: { isActive: true } }), params('qr-1'));
    expect(blocked.status).toBe(409);

    db.qRCode.findUnique.mockResolvedValueOnce({ id: 'qr-1', dealerId: 'dealer-1', archivedAt: at, revokedAt: at });
    db.qRCode.updateMany.mockResolvedValueOnce({ count: 1 });
    db.qRCode.findUnique.mockResolvedValueOnce({ id: 'qr-1' });
    const ok = await PATCH(req('http://localhost/api/qr-codes/qr-1', { method: 'PATCH', body: { restore: true } }), params('qr-1'));
    expect(ok.status).toBe(200);
    expect(db.qRCode.updateMany.mock.calls[0][0].data).toEqual({ archivedAt: null, isActive: true, revokedAt: null });
  });

  it('toplu silme kaldırıldı: 410 ve hiçbir yazım yok', async () => {
    mockRequireAuth.mockResolvedValue(DEALER);
    const { POST } = await import('@/app/api/qr-codes/bulk/route');
    const res = await POST(req('http://localhost/api/qr-codes/bulk', { method: 'POST', body: { action: 'delete', ids: ['a', 'b'] } }));
    expect(res.status).toBe(410);
    expect(destructiveCalls(db, ALL_MODELS)).toEqual([]);
    expect(db.qRCode.updateMany).not.toHaveBeenCalled();
  });

  it('toplu etkinleştirme arşivi yeniden açamaz ve 200 üstünü reddeder', async () => {
    mockRequireAuth.mockResolvedValue(DEALER);
    db.qRCode.updateMany.mockResolvedValue({ count: 2 });
    const { POST } = await import('@/app/api/qr-codes/bulk/route');
    const res = await POST(req('http://localhost/api/qr-codes/bulk', { method: 'POST', body: { action: 'activate', ids: ['a', 'b'] } }));
    expect(res.status).toBe(200);
    expect(db.qRCode.updateMany.mock.calls[0][0].where).toMatchObject({ archivedAt: null, dealerId: 'dealer-1' });
    const many = Array.from({ length: 201 }, (_, i) => `id-${i}`);
    const tooMany = await POST(req('http://localhost/api/qr-codes/bulk', { method: 'POST', body: { action: 'activate', ids: many } }));
    expect(tooMany.status).toBe(400);
  });
});

describe('Rozet / ödül / plan silme = onaylı arşiv (P0-26)', () => {
  it('kazanılmış rozet: onaysız 409 + etki; onaylı arşiv; delete hiç yok', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.badge.findUnique.mockResolvedValue({ id: 'b-1', name: 'Kaşif', isActive: true, archivedAt: null, pointCost: 50, _count: { users: 12 } });
    const { DELETE } = await import('@/app/api/gamification/badges/[id]/route');
    const r1 = await DELETE(req('http://localhost/api/gamification/badges/b-1'), params('b-1'));
    expect(r1.status).toBe(409);
    const b1 = await r1.json();
    expect(b1.code).toBe('CONFIRM_REQUIRED');
    expect(b1.impact.items[0]).toMatchObject({ key: 'earnedBy', value: 12 });
    expect(db.badge.update).not.toHaveBeenCalled();

    const r2 = await DELETE(req('http://localhost/api/gamification/badges/b-1?confirm=archive'), params('b-1'));
    expect(r2.status).toBe(200);
    expect(db.badge.update.mock.calls[0][0].data).toMatchObject({ isActive: false });
    expect(db.badge.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
    expect(destructiveCalls(db, ALL_MODELS)).toEqual([]);
  });

  it('karakter rozeti onayla da arşivlenemez (409 ARCHIVE_BLOCKED)', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    const { CHARACTER_PROFILES } = await import('@/lib/character-badges');
    const charId = CHARACTER_PROFILES[0].badgeId;
    db.badge.findUnique.mockResolvedValue({ id: charId, name: 'Karakter', isActive: true, archivedAt: null, _count: { users: 0 } });
    const { DELETE } = await import('@/app/api/gamification/badges/[id]/route');
    const res = await DELETE(req(`http://localhost/api/gamification/badges/${charId}?confirm=archive`), params(charId));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ARCHIVE_BLOCKED');
    expect(db.badge.update).not.toHaveBeenCalled();
  });

  it('puanla alınmış ödül: onaysız 409; onaylı arşiv; UserReward silinmez', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.reward.findUnique.mockResolvedValue({ id: 'r-1', name: 'Kahve', cost: 100, isActive: true, archivedAt: null, stock: -1 });
    db.userReward.count.mockResolvedValueOnce(50).mockResolvedValueOnce(7);
    const { DELETE } = await import('@/app/api/gamification/rewards/[id]/route');
    const r1 = await DELETE(req('http://localhost/api/gamification/rewards/r-1'), params('r-1'));
    expect(r1.status).toBe(409);
    const b = await r1.json();
    expect(b.impact.items).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'redeemed', value: 50 }), expect.objectContaining({ key: 'unusedCodes', value: 7 })]));

    db.userReward.count.mockResolvedValueOnce(50).mockResolvedValueOnce(7);
    const r2 = await DELETE(req('http://localhost/api/gamification/rewards/r-1?confirm=archive'), params('r-1'));
    expect(r2.status).toBe(200);
    expect(db.reward.update.mock.calls[0][0].data).toMatchObject({ isActive: false });
    expect(destructiveCalls(db, ALL_MODELS)).toEqual([]);
  });

  it('arşivlenmiş ödül alınamaz (okuma ile tx arasında arşivlense bile)', async () => {
    // Eski PATCH takma adı artık requireAuth (defineRoute) + claimReward servisi kullanır.
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'cust-1', role: 'CUSTOMER' } } });
    mockGetServerSession.mockResolvedValue({ user: { id: 'cust-1', role: 'CUSTOMER' } });
    db.user.findUnique.mockResolvedValue({ id: 'cust-1', points: 1000 });
    db.reward.findUnique
      .mockResolvedValueOnce({ id: 'r-1', name: 'Kahve', cost: 100, stock: -1, isActive: true, archivedAt: null, type: 'coupon', metadata: null })
      // tx içindeki taze okuma: admin bu arada arşivledi
      .mockResolvedValueOnce({ isActive: false, archivedAt: new Date() });
    db.reward.updateMany.mockResolvedValue({ count: 0 });
    const { PATCH } = await import('@/app/api/gamification/rewards/route');
    const res = await PATCH(new Request('http://localhost/api/gamification/rewards', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rewardId: 'r-1' }),
    }));
    expect(res.status).toBe(404);
    // claimReward kullanıcı kilidi altında ödülü TAZE okur; arşivliyse 404 (stok/borç yazımı yok).
    // Koşullu stok yazımı da arşiv/aktiflik koşulunu taşır (yarışın son savunması).
    for (const call of db.reward.updateMany.mock.calls) {
      expect(call[0].where).toMatchObject({ id: 'r-1', isActive: true, archivedAt: null });
    }
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.userReward.create).not.toHaveBeenCalled();
  });

  it('aboneli plan: onaysız 409; onaylı arşiv (aboneler planda kalır)', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.pricingPlan.findUnique.mockResolvedValue({ id: 'p-1', name: 'Pro', isActive: true, archivedAt: null, price: 499, stripePriceId: 'price_1' });
    db.user.count.mockResolvedValueOnce(14).mockResolvedValueOnce(9);
    const { DELETE } = await import('@/app/api/admin/pricing/route');
    const r1 = await DELETE(req('http://localhost/api/admin/pricing?id=p-1'));
    expect(r1.status).toBe(409);

    db.user.count.mockResolvedValueOnce(14).mockResolvedValueOnce(9);
    const r2 = await DELETE(req('http://localhost/api/admin/pricing?id=p-1&confirm=archive'));
    expect(r2.status).toBe(200);
    expect(db.pricingPlan.update.mock.calls[0][0].data).toMatchObject({ isActive: false });
    expect(destructiveCalls(db, ALL_MODELS)).toEqual([]);
    // Abonelerin pricingPlanId'si hiç yazılmaz.
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('Kart yaşam döngüsü (P0-26 kart kolu)', () => {
  it('kart silme: tüketim/yorum/kart izi silinmez; kart arşiv + BLOCKED olur', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.physicalCard.findUnique.mockResolvedValue({
      id: 'c-1', token: 'tok', batchId: null, status: 'ACTIVATED', customerId: 'cust-1', archivedAt: null,
      blockedAt: null, blockReason: null, _count: { consumptions: 9 },
    });
    db.physicalCard.updateMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/admin/cards/[id]/route');
    const r1 = await DELETE(req('http://localhost/api/admin/cards/c-1'), params('c-1'));
    expect(r1.status).toBe(409);
    const r2 = await DELETE(req('http://localhost/api/admin/cards/c-1?confirm=archive'), params('c-1'));
    expect(r2.status).toBe(200);
    expect(db.physicalCard.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'BLOCKED' });
    expect(destructiveCalls(db, ALL_MODELS)).toEqual([]);
  });

  it('bloklu kart müşteriden kaldırılamaz (çalıntı kart yeniden aktive edilemez)', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.physicalCard.findUnique.mockResolvedValue({
      id: 'c-2', status: 'BLOCKED', customerId: 'cust-1', archivedAt: null, customer: { id: 'cust-1', name: 'Ali' }, _count: { consumptions: 3 },
    });
    const { POST } = await import('@/app/api/admin/cards/[id]/unassign/route');
    const res = await POST(req('http://localhost/api/admin/cards/c-2/unassign', { method: 'POST' }), params('c-2'));
    expect(res.status).toBe(409);
    expect(db.physicalCard.updateMany).not.toHaveBeenCalled();
    expect(db.physicalCard.update).not.toHaveBeenCalled();
  });

  it('aktif kart müşteriden kaldırılır: koşullu yazım status=ACTIVATED ile', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.physicalCard.findUnique
      .mockResolvedValueOnce({ id: 'c-3', status: 'ACTIVATED', customerId: 'cust-1', archivedAt: null, customer: { id: 'cust-1', name: 'Ali' }, _count: { consumptions: 1 } })
      .mockResolvedValueOnce({ id: 'c-3', status: 'UNUSED' });
    db.physicalCard.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/admin/cards/[id]/unassign/route');
    const res = await POST(req('http://localhost/api/admin/cards/c-3/unassign', { method: 'POST' }), params('c-3'));
    expect(res.status).toBe(200);
    expect(db.physicalCard.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'c-3', status: 'ACTIVATED', customerId: 'cust-1', archivedAt: null });
  });

  it('PATCH ile bloklu ama müşterili kart UNUSED yapılamaz', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.physicalCard.findUnique.mockResolvedValue({ id: 'c-4', status: 'BLOCKED', customerId: 'cust-1', archivedAt: null });
    const { PATCH } = await import('@/app/api/admin/cards/[id]/route');
    const res = await PATCH(req('http://localhost/api/admin/cards/c-4', { method: 'PATCH', body: { status: 'UNUSED' } }), params('c-4'));
    expect(res.status).toBe(409);
    expect(db.physicalCard.updateMany).not.toHaveBeenCalled();
  });
});

// NextResponse import kullanılmazsa ts-jest uyarmasın
void NextResponse;
