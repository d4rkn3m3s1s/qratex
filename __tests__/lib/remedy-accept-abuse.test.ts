/**
 * Telafi kabulünde puan basma — kötüye kullanım regresyonları (güvenlik incelemesi).
 *
 *  1. Bayi başına günlük TOPLAM telafi puanı bütçesi: kullanıcı tavanı tek hesabı sınırlıyordu;
 *     bayi N kukla hesaba (QR geri bildirim → 1.000 puanlık telafi) sınırsız puan basabiliyordu.
 *     Aşımda tx geri alınır (teklif `pending` kalır), mint çağrılmaz; bütçe bayi kilidi altında
 *     defterden (posted, source=remedy, actorId=bayi, bugün) okunur.
 *  2. Bayi = müşteri (kendi kendine telafi) reddedilir.
 *  3. Kaynağı moderasyonla kaldırılmış (deletedAt) yorum/geri bildirimin teklifi kabul edilemez.
 */
const mockOfferFindUnique = jest.fn();
const mockOfferUpdateMany = jest.fn();
const mockTimelineCreate = jest.fn();
const mockNotificationCreate = jest.fn();
const mockExecuteRaw = jest.fn();
const mockLedgerAggregate = jest.fn();
const mockMint = jest.fn();

// İşletme içi (sahip/personel) kişisel teklif kontrolü (lib/remedy-offer-service isDealerInsider):
// bu senaryolarda müşteri işletme personeli DEĞİL.
const mockStaffFindFirst = jest.fn(async () => null);

const tx = {
  $executeRaw: (...a: unknown[]) => mockExecuteRaw(...a),
  dealerStaff: { findFirst: (...a: unknown[]) => (mockStaffFindFirst as (...x: unknown[]) => unknown)(...a) },
  pointsLedger: { aggregate: (...a: unknown[]) => mockLedgerAggregate(...a) },
  remedyOffer: { updateMany: (...a: unknown[]) => mockOfferUpdateMany(...a) },
  remedyTimelineEvent: { create: (...a: unknown[]) => mockTimelineCreate(...a) },
  notification: { create: (...a: unknown[]) => mockNotificationCreate(...a) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    dealerStaff: { findFirst: (...a: unknown[]) => (mockStaffFindFirst as (...x: unknown[]) => unknown)(...a) },
    remedyOffer: { findUnique: (...a: unknown[]) => mockOfferFindUnique(...a) },
  },
}));
jest.mock('@/lib/economy/mint', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

import { acceptRemedyOffer } from '@/lib/remedy-offer-service';
import { REMEDY_DEALER_DAILY_CAP } from '@/lib/economy/caps';

const NOW = new Date('2026-10-10T15:30:00.000Z');
const pending = {
  id: 'o1', userId: 'u1', dealerId: 'd1', status: 'pending',
  options: [
    { type: 'points', label: 'Puan', unit: 'puan', values: [100, 1000] },
    { type: 'discount', label: 'İndirim', unit: '%', values: [10] },
  ],
  feedback: null,
  consumptionReview: { deletedAt: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOfferFindUnique.mockResolvedValue(pending);
  mockOfferUpdateMany.mockResolvedValue({ count: 1 });
  mockTimelineCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockExecuteRaw.mockResolvedValue(1);
  mockLedgerAggregate.mockResolvedValue({ _sum: { delta: 0 } });
  mockMint.mockImplementation(async (_tx: unknown, input: { points: number }) => ({
    credited: input.points, capped: false, status: 'posted', duplicate: false,
  }));
});

describe('bayi günlük telafi puanı bütçesi', () => {
  it('SALDIRI: bütçeyi aşan kabul → DEALER_BUDGET_EXHAUSTED (409), mint yok, bildirim yok', async () => {
    mockLedgerAggregate.mockResolvedValue({ _sum: { delta: REMEDY_DEALER_DAILY_CAP - 50 } });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 100, now: NOW })
    ).rejects.toMatchObject({ code: 'DEALER_BUDGET_EXHAUSTED', status: 409 });
    expect(mockMint).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('bütçe bayi kilidi altında, defterden (bayi × remedy × posted × bugün UTC) okunur', async () => {
    await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 100, now: NOW });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const lockArgs = mockExecuteRaw.mock.calls[0];
    expect(lockArgs.slice(1)).toEqual(['remedy:dealer-budget:d1']);
    expect(mockLedgerAggregate.mock.calls[0][0]).toEqual({
      where: {
        actorId: 'd1',
        source: 'remedy',
        status: 'posted',
        createdAt: { gte: new Date('2026-10-10T00:00:00.000Z') },
      },
      _sum: { delta: true },
    });
    // Kilit + bütçe okuması mint'ten ÖNCE.
    expect(mockLedgerAggregate.mock.invocationCallOrder[0]).toBeLessThan(mockMint.mock.invocationCallOrder[0]);
    expect(mockExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(mockLedgerAggregate.mock.invocationCallOrder[0]);
  });

  it('bütçeyi tam dolduran kabul geçer (sınır dahil)', async () => {
    mockLedgerAggregate.mockResolvedValue({ _sum: { delta: REMEDY_DEALER_DAILY_CAP - 1000 } });
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 1000, now: NOW });
    expect(r.creditedPoints).toBe(1000);
    expect(mockMint).toHaveBeenCalledTimes(1);
  });

  it('bütçe dolu olsa da puan dışı tür (indirim) kabul edilir; bütçe sorgulanmaz', async () => {
    mockLedgerAggregate.mockResolvedValue({ _sum: { delta: REMEDY_DEALER_DAILY_CAP } });
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'discount', selectedValue: 10, now: NOW });
    expect(r.creditedPoints).toBeNull();
    expect(mockLedgerAggregate).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('boş gün (null toplam) → kabul geçer', async () => {
    mockLedgerAggregate.mockResolvedValue({ _sum: { delta: null } });
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: '100', now: NOW });
    expect(r.creditedPoints).toBe(100);
  });
});

describe('kimlik ve kaynak geçerliliği', () => {
  it('SALDIRI: işletme personeli PUAN telafisi alamaz (bütçe aktarımı); puan dışı tür serbest', async () => {
    mockStaffFindFirst.mockImplementation((async () => ({ id: 'staff-link' })) as never);
    try {
      await expect(
        acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 100, now: NOW })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mockMint).not.toHaveBeenCalled();
      expect(mockOfferUpdateMany).not.toHaveBeenCalled();
      const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'discount', selectedValue: 10, now: NOW });
      expect(r.creditedPoints).toBeNull();
    } finally {
      mockStaffFindFirst.mockImplementation(async () => null);
    }
  });

  it('SALDIRI: bayi = müşteri (kendi kendine telafi) → FORBIDDEN, durum değişmez', async () => {
    mockOfferFindUnique.mockResolvedValue({ ...pending, userId: 'd1', dealerId: 'd1' });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'd1', selectedType: 'points', selectedValue: 100, now: NOW })
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(mockOfferUpdateMany).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('SALDIRI: kaynağı moderasyonla kaldırılmış tüketim yorumu → NOT_FOUND, puan yok', async () => {
    mockOfferFindUnique.mockResolvedValue({ ...pending, consumptionReview: { deletedAt: new Date() } });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 100, now: NOW })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockOfferUpdateMany).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('SALDIRI: kaynağı kaldırılmış QR geri bildirimi → NOT_FOUND', async () => {
    mockOfferFindUnique.mockResolvedValue({ ...pending, consumptionReview: null, feedback: { deletedAt: new Date() } });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 100, now: NOW })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('kaynaksız kişisel teklif (feedback/review null) kabul edilir', async () => {
    mockOfferFindUnique.mockResolvedValue({ ...pending, feedback: null, consumptionReview: null });
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: 100, now: NOW });
    expect(r.creditedPoints).toBe(100);
  });

  it('kabul sorgusu kaynak silinme durumunu da okur', async () => {
    await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'discount', selectedValue: 10, now: NOW });
    expect(mockOfferFindUnique.mock.calls[0][0].select).toMatchObject({
      feedback: { select: { deletedAt: true } },
      consumptionReview: { select: { deletedAt: true } },
    });
  });
});
