/**
 * P0-23 — hediye yanlış kişiye gidemez.
 *
 * Önceden: alıcı serbest metinle (isim) `orderBy`'sız `findFirst` ile bulunuyordu; aynı isimde
 * iki müşteri varken puan keyfi birine gidiyor, gönderen kime ödediğini görmüyordu.
 * Şimdi: GET önizleme yalnız TEK eşleşmede kimlik verir, POST yalnız `recipientUserId` kabul eder.
 */
import { NextRequest } from 'next/server';

const mockSession = jest.fn();
jest.mock('next-auth/next', () => ({ getServerSession: (...a: unknown[]) => mockSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/achievements', () => ({ advanceAchievementProgress: jest.fn(async () => undefined) }));

const tx = {
  userCosmetic: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
  notification: { create: jest.fn(async () => ({})) },
};
const db = {
  user: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  cosmeticItem: { findUnique: jest.fn() },
  $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db }));

const mockDebit = jest.fn();
jest.mock('@/lib/points-wallet', () => {
  const actual = jest.requireActual('@/lib/points-wallet');
  return { ...actual, debitPoints: (...a: unknown[]) => mockDebit(...a) };
});

import { InsufficientPointsError } from '@/lib/points-wallet';

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: 'sender', role: 'CUSTOMER' } });
  db.cosmeticItem.findUnique.mockResolvedValue({ id: 'cos1', name: 'Altın Çerçeve', price: 300, isActive: true });
  db.user.findUnique.mockResolvedValue({ name: 'Gönderen' });
  db.user.findFirst.mockResolvedValue({ id: 'rcp', name: 'Ayşe Yılmaz' });
  mockDebit.mockResolvedValue({ duplicate: false, ledgerId: 'l1' });
});

async function lookup(q: string) {
  const { GET } = await import('@/app/api/customer/shop/gift/route');
  const res = await GET(new NextRequest(`http://localhost/api/customer/shop/gift?q=${encodeURIComponent(q)}`));
  return { status: res.status, body: await res.json() };
}

async function send(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/customer/shop/gift/route');
  const res = await POST(
    new NextRequest('http://localhost/api/customer/shop/gift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
}

describe('alıcı önizlemesi', () => {
  it('aynı isimde iki müşteri → 409 AMBIGUOUS_RECIPIENT (kimlik verilmez)', async () => {
    db.user.findMany.mockResolvedValueOnce([
      { id: 'a', name: 'Ali Can', email: 'a@x.com', image: null },
      { id: 'b', name: 'Ali Can', email: 'b@x.com', image: null },
    ]);
    const r = await lookup('Ali Can');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('AMBIGUOUS_RECIPIENT');
    expect(JSON.stringify(r.body)).not.toMatch(/"a"|"b"/);
  });

  it('tek eşleşme → recipientUserId + maskelenmiş ad/e-posta; sorgu deterministik ve uygun müşteriyle sınırlı', async () => {
    db.user.findMany.mockResolvedValueOnce([{ id: 'rcp', name: 'Ayşe Yılmaz', email: 'ayse@ornek.com', image: null }]);
    const r = await lookup('AYSE@ornek.com');
    expect(r.status).toBe(200);
    expect(r.body.recipient).toMatchObject({ recipientUserId: 'rcp', displayName: 'Ayşe Y.' });
    expect(r.body.recipient.maskedEmail).not.toContain('ayse@');
    const args = db.user.findMany.mock.calls[0][0] as { where: Record<string, unknown>; orderBy: unknown; take: number };
    expect(args.where).toMatchObject({ role: 'CUSTOMER', suspendedAt: null, anonymizedAt: null });
    expect(args.orderBy).toBeDefined();
    expect(args.take).toBe(2);
  });

  it('kendine hediye önizlemesi reddedilir', async () => {
    db.user.findMany.mockResolvedValueOnce([{ id: 'sender', name: 'Ben', email: 'ben@x.com', image: null }]);
    expect((await lookup('ben@x.com')).status).toBe(400);
  });
});

describe('gönderim', () => {
  it('serbest metin alıcı (recipientIdentifier) artık kabul edilmez', async () => {
    const r = await send({ cosmeticId: 'cos1', recipientIdentifier: 'Ali Can' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('RECIPIENT_PREVIEW_REQUIRED');
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('doğrulanmış kimliğe defterli ve tek-kez harcama ile gider', async () => {
    const r = await send({ cosmeticId: 'cos1', recipientUserId: 'rcp', message: 'İyi kullan', requestId: 'gift_12345678' });
    expect(r.status).toBe(200);
    expect(mockDebit.mock.calls[0][1]).toMatchObject({
      userId: 'sender',
      points: 300,
      source: 'gift',
      sourceId: 'cos1',
      idempotencyKey: 'gift:sender:gift_12345678',
    });
    expect(tx.userCosmetic.create.mock.calls[0]).toEqual([
      { data: expect.objectContaining({ userId: 'rcp', cosmeticId: 'cos1', giftedByUserId: 'sender' }) },
    ]);
  });

  it('tekrar oynatılan istek (duplicate) ikinci kozmetik/bildirim üretmez', async () => {
    mockDebit.mockResolvedValueOnce({ duplicate: true });
    const r = await send({ cosmeticId: 'cos1', recipientUserId: 'rcp', requestId: 'gift_12345678' });
    expect(r.status).toBe(200);
    expect(r.body.duplicate).toBe(true);
    expect(tx.userCosmetic.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('alıcı zaten sahipse 409 ve düşüm aynı transaction içinde geri alınır; yetersiz bakiyede 400', async () => {
    tx.userCosmetic.findFirst.mockResolvedValueOnce({ id: 'x' } as never);
    expect((await send({ cosmeticId: 'cos1', recipientUserId: 'rcp' })).status).toBe(409);
    // Düşüm yalnız transaction içinde yapıldı ve transaction hatayla bitti → gerçek DB'de rollback.
    expect(mockDebit.mock.calls[0][0]).toBe(tx);
    await expect(db.$transaction.mock.results[0].value).rejects.toThrow();
    expect(tx.userCosmetic.create).not.toHaveBeenCalled();

    mockDebit.mockRejectedValueOnce(new InsufficientPointsError(10, 300));
    expect((await send({ cosmeticId: 'cos1', recipientUserId: 'rcp' })).status).toBe(400);
  });

  it('başarılı hediyenin ağ tekrarı (aynı requestId, alıcı artık sahip) 409 değil duplicate başarı döner', async () => {
    tx.userCosmetic.findFirst.mockResolvedValue({ id: 'owned' } as never);
    mockDebit.mockResolvedValueOnce({ duplicate: true });
    const r = await send({ cosmeticId: 'cos1', recipientUserId: 'rcp', requestId: 'gift_12345678' });
    expect(r.status).toBe(200);
    expect(r.body.duplicate).toBe(true);
    expect(tx.userCosmetic.create).not.toHaveBeenCalled();
    tx.userCosmetic.findFirst.mockResolvedValue(null as never);
  });

  it('arşivli kozmetik hediye edilemez (satın almayla aynı kural); puan düşmez', async () => {
    db.cosmeticItem.findUnique.mockResolvedValueOnce({ id: 'cos1', name: 'Altın Çerçeve', price: 300, isActive: true, archivedAt: new Date() });
    expect((await send({ cosmeticId: 'cos1', recipientUserId: 'rcp', requestId: 'gift_12345678' })).status).toBe(404);
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('gösterilen fiyat sunucudakinden farklıysa 409 PRICE_CHANGED; puan düşmez', async () => {
    const r = await send({ cosmeticId: 'cos1', recipientUserId: 'rcp', requestId: 'gift_12345678', expectedPrice: 250 });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PRICE_CHANGED', price: 300 });
    expect(mockDebit).not.toHaveBeenCalled();
    expect((await send({ cosmeticId: 'cos1', recipientUserId: 'rcp', requestId: 'gift_12345679', expectedPrice: 300 })).status).toBe(200);
  });

  it('askıdaki/anonim ya da müşteri olmayan alıcı 404', async () => {
    db.user.findFirst.mockResolvedValueOnce(null);
    expect((await send({ cosmeticId: 'cos1', recipientUserId: 'ghost' })).status).toBe(404);
    const where = (db.user.findFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ id: 'ghost', role: 'CUSTOMER', suspendedAt: null, anonymizedAt: null });
  });
});
