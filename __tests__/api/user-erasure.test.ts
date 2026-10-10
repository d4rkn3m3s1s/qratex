/**
 * P0-25 — kullanıcı silme denetim izini ve başkalarının verisini yok ETMEZ.
 *
 * Önceki saldırı/hata senaryoları:
 *  - ADMIN-A, ADMIN-B'yi siler → B'nin bütün AuditLog satırları cascade ile gider.
 *  - Bayi silinir → QR'ları ve o QR'lara gelmiş BAŞKA müşterilerin yorumları gider.
 *  - "Hesabımı sil" → user.delete, audit yok; ADMIN kendi hesabını da silebiliyordu.
 * Şimdi: hiçbir yol `user.delete`/`deleteMany` çağırmaz; yürütme anonymizeUser.
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
jest.mock('@/lib/r2-storage', () => ({ isR2Configured: () => false, keyFromPublicUrl: () => null, deleteFromR2: jest.fn() }));

import { prisma } from '@/lib/prisma';
import type { PrismaMock } from '../helpers/data-safety-prisma-mock';
import { anonymizeUser, anonymizedEmail } from '@/lib/gdpr-core';

const db = prisma as unknown as PrismaMock;
const ADMIN = { session: { user: { id: 'admin-1', role: 'ADMIN', email: 'a@x.com', name: 'Yönetici' } } };

function req(url: string, init: { method?: string; body?: unknown } = {}) {
  return new NextRequest(url, {
    method: init.method ?? 'DELETE',
    headers: { 'content-type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

function target(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1', name: 'Ayşe', email: 'ayse@example.com', role: 'CUSTOMER', points: 120,
    anonymizedAt: null, stripeSubscriptionId: null, subscriptionStatus: null, ...over,
  };
}

beforeEach(() => {
  db.__reset();
  mockRequireAuth.mockReset();
});

function expectNoUserDelete() {
  expect(db.user.delete).not.toHaveBeenCalled();
  expect(db.user.deleteMany).not.toHaveBeenCalled();
  expect(db.qRCode.deleteMany).not.toHaveBeenCalled();
  expect(db.auditLog.deleteMany).not.toHaveBeenCalled();
}

describe('anonymizeUser (lib/gdpr-core)', () => {
  it('PII maskeler, anonymizedAt yazar, user.delete çağırmaz, audit aynı tx', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: null });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await anonymizeUser('u-1', { actor: { id: 'admin-1', email: 'a@x.com', role: 'ADMIN' }, reason: 'admin_delete' });
    expect(res.anonymized).toBe(true);
    expect(res.alreadyAnonymized).toBe(false);
    const claim = db.user.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: 'u-1', anonymizedAt: null });
    expect(claim.data).toMatchObject({ email: anonymizedEmail('u-1'), password: null, phone: null, twoFactorSecret: null });
    expect(claim.data.anonymizedAt).toBeInstanceOf(Date);
    const audit = db.auditLog.create.mock.calls.map((c) => c[0].data).find((d) => d.action === 'gdpr_anonymize');
    expect(audit).toMatchObject({ userId: 'admin-1', entityId: 'u-1', actorType: 'user' });
    expect(audit.actorSnapshot).toMatchObject({ email: 'a@x.com', role: 'ADMIN' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expectNoUserDelete();
  });

  it('idempotent: zaten anonim kullanıcıda hiçbir şey yazmaz', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: new Date() });
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await anonymizeUser('u-1');
    expect(res.alreadyAnonymized).toBe(true);
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(db.session.deleteMany).not.toHaveBeenCalled();
  });

  it('bayi anonimleşince QR kodları ARŞİVLENİR (yorumlar korunur), silinmez', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'd-1', role: 'DEALER', anonymizedAt: null });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    db.qRCode.updateMany.mockResolvedValue({ count: 4 });
    const res = await anonymizeUser('d-1');
    expect(res.archivedQrCodes).toBe(4);
    expect(db.qRCode.updateMany.mock.calls[0][0]).toMatchObject({ where: { dealerId: 'd-1', archivedAt: null }, data: { isActive: false } });
    expectNoUserDelete();
    expect(db.feedback.deleteMany).not.toHaveBeenCalled();
  });

  it('withinTx hatası bütün anonimleştirmeyi geri alır (fırlatır)', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: null });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      anonymizeUser('u-1', { withinTx: async () => { throw new Error('DSR_FAIL'); } })
    ).rejects.toThrow('DSR_FAIL');
  });

  it('kullanıcı yoksa USER_NOT_FOUND', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(anonymizeUser('yok')).rejects.toThrow('USER_NOT_FOUND');
  });
});

describe('DELETE /api/admin/users (tekil)', () => {
  it('YÖNETİCİ hedef onayla da silinemez (denetim izi korunur)', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.user.findUnique.mockResolvedValue(target({ id: 'admin-2', role: 'ADMIN' }));
    const { DELETE } = await import('@/app/api/admin/users/route');
    const res = await DELETE(req('http://localhost/api/admin/users?id=admin-2&confirm=anonymize'));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ARCHIVE_BLOCKED');
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expectNoUserDelete();
  });

  it('onaysız istek 409 + etki önizlemesi; yazım yok', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.user.findUnique.mockResolvedValue(target());
    db.feedback.count.mockResolvedValue(8);
    const { DELETE } = await import('@/app/api/admin/users/route');
    const res = await DELETE(req('http://localhost/api/admin/users?id=u-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CONFIRM_REQUIRED');
    expect(body.impact.items).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'feedbacks', value: 8 })]));
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('onaylı istek anonimleştirir; user.delete yok', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.user.findUnique
      .mockResolvedValueOnce(target()) // önizleme
      .mockResolvedValueOnce({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: null }); // tx içi
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/admin/users/route');
    const res = await DELETE(req('http://localhost/api/admin/users?id=u-1&confirm=anonymize'));
    expect(res.status).toBe(200);
    expect((await res.json()).anonymized).toBe(true);
    expectNoUserDelete();
  });

  it('faturalanabilir aboneliği olan bayi engellenir', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    db.user.findUnique.mockResolvedValue(target({ id: 'd-1', role: 'DEALER', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }));
    const { DELETE } = await import('@/app/api/admin/users/route');
    const res = await DELETE(req('http://localhost/api/admin/users?id=d-1&confirm=anonymize'));
    expect(res.status).toBe(409);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/users/bulk delete', () => {
  const ids = ['ckabc0000000000000000000a', 'ckabc0000000000000000000b'];

  it('onaysız toplu silme 409; onaylı istekte yönetici atlanır, kalan anonimleşir', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === ids[0] ? target({ id: ids[0] }) : target({ id: ids[1], role: 'ADMIN' })
    );
    const r1 = await POST(req('http://localhost/api/admin/users/bulk', { method: 'POST', body: { action: 'delete', userIds: ids } }));
    expect(r1.status).toBe(409);
    expect(db.user.updateMany).not.toHaveBeenCalled();

    db.user.updateMany.mockResolvedValue({ count: 1 });
    const r2 = await POST(req('http://localhost/api/admin/users/bulk', { method: 'POST', body: { action: 'delete', userIds: ids, confirm: true } }));
    expect(r2.status).toBe(200);
    const body = await r2.json();
    expect(body.anonymized).toBe(1);
    expect(body.skipped).toEqual([expect.objectContaining({ id: ids[1] })]);
    expectNoUserDelete();
  });
});

describe('DELETE /api/user/delete-account (self-servis)', () => {
  it('YÖNETİCİ kendi hesabını silemez', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN);
    const { DELETE } = await import('@/app/api/user/delete-account/route');
    const res = await DELETE(req('http://localhost/api/user/delete-account', { body: { confirmEmail: 'a@x.com' } }));
    expect(res.status).toBe(403);
    expectNoUserDelete();
  });

  it('e-posta eşleşmezse 400 ve yazım yok', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u-1', role: 'CUSTOMER', email: 'ayse@example.com' } } });
    db.user.findUnique.mockResolvedValue(target());
    const { DELETE } = await import('@/app/api/user/delete-account/route');
    const res = await DELETE(req('http://localhost/api/user/delete-account', { body: { confirmEmail: 'baska@example.com' } }));
    expect(res.status).toBe(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('başarılı silme: anonimleştirme + KVKK talebi ve yürütme kanıtı aynı tx; user.delete yok', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u-1', role: 'CUSTOMER', email: 'ayse@example.com' } } });
    db.user.findUnique
      .mockResolvedValueOnce(target())
      .mockResolvedValueOnce({ id: 'u-1', role: 'CUSTOMER', anonymizedAt: null });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    db.dataSubjectRequest.create.mockResolvedValue({ id: 'dsr-1' });
    db.dataSubjectRequest.findUnique.mockResolvedValue({ type: 'deletion', status: 'received' });
    db.dsrEvent.findMany.mockResolvedValue([{ type: 'received' }, { type: 'erasure_executed' }]);
    db.dataSubjectRequest.updateMany.mockResolvedValue({ count: 1 });
    db.dsrEvent.create.mockResolvedValue({ id: 'ev' });
    const { DELETE } = await import('@/app/api/user/delete-account/route');
    const res = await DELETE(req('http://localhost/api/user/delete-account', { body: { confirmEmail: 'AYSE@example.com' } }));
    expect(res.status).toBe(200);
    expect(db.dataSubjectRequest.create.mock.calls[0][0].data).toMatchObject({ type: 'deletion', userId: 'u-1' });
    const eventTypes = db.dsrEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(eventTypes).toEqual(expect.arrayContaining(['received', 'erasure_executed', 'completed']));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expectNoUserDelete();
  });
});
