/**
 * P0-22 · Telafi bütünlüğü — servis düzeyi saldırı/hata senaryoları.
 *  - Müşteri teklifte olmayan değeri ("%100 indirim", 999999 puan) kabul ettiremez.
 *  - 500+ karakter mesaj sessizce "doğrudan gönder"e düşmez (onay kuyruğu bypass'ı).
 *  - Aynı kaynağa ikinci açık teklif 409; P2002 (kısmi unique) de 409'a çevrilir.
 *  - Anonim kayda sahte başarı yok (422).
 */
const mockOfferFindFirst = jest.fn();
const mockOfferFindUnique = jest.fn();
const mockOfferCreate = jest.fn();
const mockOfferUpdateMany = jest.fn();
const mockTimelineCreate = jest.fn();
const mockNotificationCreate = jest.fn();
const mockExecuteRaw = jest.fn();

// İşletme içi (sahip/personel) kişisel teklif kontrolü (lib/remedy-offer-service isDealerInsider):
// bu senaryolarda müşteri işletme personeli DEĞİL.
const mockStaffFindFirst = jest.fn(async () => null);

const tx = {
  $executeRaw: (...a: unknown[]) => mockExecuteRaw(...a),
  dealerStaff: { findFirst: (...a: unknown[]) => (mockStaffFindFirst as (...x: unknown[]) => unknown)(...a) },
  remedyOffer: {
    findFirst: (...a: unknown[]) => mockOfferFindFirst(...a),
    create: (...a: unknown[]) => mockOfferCreate(...a),
    updateMany: (...a: unknown[]) => mockOfferUpdateMany(...a),
  },
  remedyTimelineEvent: { create: (...a: unknown[]) => mockTimelineCreate(...a) },
  notification: { create: (...a: unknown[]) => mockNotificationCreate(...a) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    dealerStaff: { findFirst: (...a: unknown[]) => (mockStaffFindFirst as (...x: unknown[]) => unknown)(...a) },
    remedyOffer: {
      findUnique: (...a: unknown[]) => mockOfferFindUnique(...a),
      findFirst: (...a: unknown[]) => mockOfferFindFirst(...a),
    },
    remedyTemplate: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

import {
  acceptRemedyOffer,
  createRemedyOffer,
  describeRemedyOffer,
  parseRemedyCreateBody,
  resolveRemedyMode,
  RemedyOfferError,
} from '@/lib/remedy-offer-service';
import {
  DEFAULT_REMEDY_OPTIONS,
  findRemedySelection,
  formatRemedySelection,
  normalizeRemedyOptions,
  restrictRemedyOptionsToAllowlist,
} from '@/lib/remedy-options';

const OFFER_OPTIONS = [
  { type: 'discount', label: 'İndirim', unit: '%', values: [10, 20] },
  { type: 'points', label: 'Puan', unit: 'puan', values: [50, 100] },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockOfferFindFirst.mockResolvedValue(null);
  mockOfferCreate.mockResolvedValue({ id: 'offer-new' });
  mockOfferUpdateMany.mockResolvedValue({ count: 1 });
  mockTimelineCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockExecuteRaw.mockResolvedValue(1);
});

describe('normalizeRemedyOptions / findRemedySelection', () => {
  it('dizi olmayan Json, bilinmeyen tür ve aralık dışı değerleri atar', () => {
    expect(normalizeRemedyOptions(null)).toEqual([]);
    expect(normalizeRemedyOptions({ type: 'discount' })).toEqual([]);
    expect(
      normalizeRemedyOptions([
        { type: 'discount', label: 'İndirim', unit: '%', values: [0, 10, 500, '20', 'abc'] },
        { type: 'cash', label: 'Nakit', unit: 'TL', values: [100] },
        { type: 'points', label: 'Puan', unit: 'puan', values: [1_000_000] },
      ])
    ).toEqual([{ type: 'discount', label: 'İndirim', unit: '%', values: [10, 20] }]);
  });

  it('SALDIRI: teklifte olmayan "%100 indirim" seçimi reddedilir', () => {
    expect(findRemedySelection(OFFER_OPTIONS, 'discount', '100')).toBeNull();
    expect(findRemedySelection(OFFER_OPTIONS, 'points', '999999')).toBeNull();
    expect(findRemedySelection(OFFER_OPTIONS, 'free_item', '1')).toBeNull(); // tür teklifte yok
    expect(findRemedySelection(OFFER_OPTIONS, 'discount', '20abc')).toBeNull();
  });

  it('geçerli seçim sunucudaki etiket/birimle anlık görüntü üretir', () => {
    const sel = findRemedySelection(OFFER_OPTIONS, 'discount', '20');
    expect(sel).toEqual({ type: 'discount', label: 'İndirim', unit: '%', value: 20 });
    expect(formatRemedySelection(sel!)).toBe('%20 İndirim');
    expect(formatRemedySelection({ type: 'points', label: 'Puan', unit: 'puan', value: 100 })).toBe('100 puan');
  });

  it('describeRemedyOffer kayıtlı seçimi okunur etikete çevirir', () => {
    const d = describeRemedyOffer({ options: OFFER_OPTIONS, selectedType: 'points', selectedValue: '50' });
    expect(d.selectionLabel).toBe('50 puan');
    expect(describeRemedyOffer({ options: 'bozuk', selectedType: null, selectedValue: null }).options).toEqual([]);
  });
});

describe('restrictRemedyOptionsToAllowlist', () => {
  it('SALDIRI: bayi gövdesinden allowlist dışı puan değeri enjekte edilemez', () => {
    const r = restrictRemedyOptionsToAllowlist(
      [{ type: 'points', label: 'Puan', unit: 'puan', values: [999] }],
      DEFAULT_REMEDY_OPTIONS
    );
    expect(r.ok).toBe(false);
  });

  it('alt küme kabul edilir; etiket şablondan gelir', () => {
    const r = restrictRemedyOptionsToAllowlist(
      [{ type: 'discount', label: 'HACK', unit: '%', values: [10] }],
      DEFAULT_REMEDY_OPTIONS
    );
    expect(r).toEqual({ ok: true, options: [{ type: 'discount', label: 'İndirim', unit: '%', values: [10] }] });
  });
});

describe('parseRemedyCreateBody / resolveRemedyMode (onay kuyruğu bypass)', () => {
  it('SALDIRI: 501 karakterlik mesaj artık sessiz varsayılana düşmez → hata', () => {
    const r = parseRemedyCreateBody({ message: 'x'.repeat(501), queueForApproval: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/500 karakter/);
  });

  it('tip hatası da 400 (Türkçe mesaj)', () => {
    const r = parseRemedyCreateBody({ queueForApproval: 'yes' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Onay kuyruğu tercihi geçersiz.');
  });

  it('boş gövde geçerlidir; belirsizlikte güvenli yön kuyruk', () => {
    const r = parseRemedyCreateBody(undefined);
    expect(r.ok).toBe(true);
    expect(resolveRemedyMode({})).toBe('send');
    expect(resolveRemedyMode({ queueForApproval: true, sendNotification: true })).toBe('queue');
    expect(resolveRemedyMode({ sendNotification: false })).toBe('queue');
  });
});

describe('createRemedyOffer', () => {
  const base = {
    source: { kind: 'feedback' as const, feedbackId: 'fb1' },
    dealerId: 'd1',
    userId: 'u1',
    message: 'Özür dileriz',
    options: DEFAULT_REMEDY_OPTIONS,
  };

  it('anonim kayıtta teklif açmaz (422, sahte başarı yok)', async () => {
    await expect(createRemedyOffer({ ...base, userId: null, mode: 'send' })).rejects.toMatchObject({
      code: 'NO_CUSTOMER',
      status: 422,
    });
    expect(mockOfferCreate).not.toHaveBeenCalled();
  });

  it('aynı kaynakta açık teklif varken 409 OPEN_OFFER_EXISTS; yeni kayıt yok', async () => {
    mockOfferFindFirst.mockResolvedValue({ id: 'old', status: 'awaiting_dealer_approval' });
    await expect(createRemedyOffer({ ...base, mode: 'send' })).rejects.toMatchObject({
      code: 'OPEN_OFFER_EXISTS',
      status: 409,
      existingOfferId: 'old',
    });
    expect(mockOfferCreate).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('kabul edilmiş telafi varken ikinci telafi açılmaz (ALREADY_REMEDIED)', async () => {
    mockOfferFindFirst.mockResolvedValue({ id: 'acc', status: 'accepted' });
    await expect(createRemedyOffer({ ...base, mode: 'queue' })).rejects.toMatchObject({ code: 'ALREADY_REMEDIED' });
  });

  it('yarışta kısmi unique index P2002 → 409', async () => {
    mockOfferCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(createRemedyOffer({ ...base, mode: 'send' })).rejects.toBeInstanceOf(RemedyOfferError);
  });

  it('kaynak başına advisory kilit alınır', async () => {
    await createRemedyOffer({ ...base, mode: 'queue' });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const values = (mockExecuteRaw.mock.calls[0] as unknown[]).slice(1);
    expect(values).toContain('remedy:fb:fb1');
  });

  it('queue modunda müşteriye bildirim gitmez, durum awaiting_dealer_approval', async () => {
    const r = await createRemedyOffer({ ...base, mode: 'queue' });
    expect(r).toEqual({ offerId: 'offer-new', status: 'awaiting_dealer_approval', notificationSent: false });
    expect(mockOfferCreate.mock.calls[0][0].data.status).toBe('awaiting_dealer_approval');
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('send modunda pending + tek bildirim; seçenekler normalize yazılır', async () => {
    const r = await createRemedyOffer({ ...base, mode: 'send' });
    expect(r.status).toBe('pending');
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockOfferCreate.mock.calls[0][0].data.options).toEqual(DEFAULT_REMEDY_OPTIONS);
  });

  it('kaynaksız kişisel teklif dealerId+userId ile tekilleştirilir', async () => {
    await createRemedyOffer({ ...base, source: { kind: 'personal' }, mode: 'queue', blockIfAccepted: false });
    const where = mockOfferFindFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ dealerId: 'd1', userId: 'u1', feedbackId: null, consumptionReviewId: null });
    expect(where.status.in).toEqual(['pending', 'awaiting_dealer_approval']);
    expect(mockOfferCreate.mock.calls[0][0].data).toMatchObject({ feedbackId: null, consumptionReviewId: null, userId: 'u1' });
  });
});

describe('acceptRemedyOffer', () => {
  const pendingOffer = { id: 'o1', userId: 'u1', dealerId: 'd1', status: 'pending', options: OFFER_OPTIONS };

  it('SALDIRI: {discount, 100} → INVALID_SELECTION (400); durum değişmez', async () => {
    mockOfferFindUnique.mockResolvedValue(pendingOffer);
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'discount', selectedValue: '100' })
    ).rejects.toMatchObject({ code: 'INVALID_SELECTION', status: 400 });
    expect(mockOfferUpdateMany).not.toHaveBeenCalled();
  });

  it('onay bekleyen teklif müşteriye yok sayılır (404)', async () => {
    mockOfferFindUnique.mockResolvedValue({ ...pendingOffer, status: 'awaiting_dealer_approval' });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'discount', selectedValue: '10' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('başkasının teklifi 403', async () => {
    mockOfferFindUnique.mockResolvedValue(pendingOffer);
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'other', selectedType: 'discount', selectedValue: '10' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('geçerli seçim: atomik pending→accepted, kanonik değer, snapshot olayı ve bayi bildirimi', async () => {
    mockOfferFindUnique.mockResolvedValue(pendingOffer);
    const r = await acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'discount', selectedValue: 20 });
    expect(r.selection).toEqual({ type: 'discount', label: 'İndirim', unit: '%', value: 20 });
    const upd = mockOfferUpdateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'o1', userId: 'u1', status: 'pending' });
    expect(upd.data).toMatchObject({ status: 'accepted', selectedType: 'discount', selectedValue: '20' });
    const ev = mockTimelineCreate.mock.calls[0][0].data;
    expect(ev.kind).toBe('accepted');
    expect(ev.meta.selection).toEqual(r.selection);
    expect(mockNotificationCreate.mock.calls[0][0].data.userId).toBe('d1');
  });

  it('eşzamanlı ikinci kabul (updateMany 0) → NOT_PENDING (409), bildirim yok', async () => {
    mockOfferFindUnique.mockResolvedValue(pendingOffer);
    mockOfferUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      acceptRemedyOffer({ offerId: 'o1', userId: 'u1', selectedType: 'points', selectedValue: '50' })
    ).rejects.toMatchObject({ code: 'NOT_PENDING', status: 409 });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });
});
