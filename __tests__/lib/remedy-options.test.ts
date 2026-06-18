/**
 * getRemedyOptions öncelik testi: mekana özel > işletme geneli > sistem varsayılanı.
 * Şablon yoksa geriye uyumlu varsayılan dönmeli.
 */
const mockTemplateFindMany = jest.fn();
const mockQrFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    remedyTemplate: { findMany: (...a: unknown[]) => mockTemplateFindMany(...a) },
    qRCode: { findUnique: (...a: unknown[]) => mockQrFindUnique(...a) },
  },
}));

import {
  getRemedyOptions,
  getRemedyOptionsForQrCode,
  DEFAULT_REMEDY_OPTIONS,
} from '@/lib/remedy-options';

beforeEach(() => {
  mockTemplateFindMany.mockReset();
  mockQrFindUnique.mockReset();
});

describe('getRemedyOptions', () => {
  it('şablon yoksa sistem varsayılanını döner (geriye uyumlu)', async () => {
    mockTemplateFindMany.mockResolvedValue([]); // hem mekan hem işletme geneli boş
    const opts = await getRemedyOptions('d1', null);
    expect(opts).toEqual(DEFAULT_REMEDY_OPTIONS);
  });

  it('işletme geneli şablon varsa onu döner', async () => {
    // locationId null → sadece işletme geneli sorgusu yapılır ve döner
    mockTemplateFindMany.mockResolvedValueOnce([
      { type: 'discount', label: 'İndirim', unit: '%', values: [5, 10] },
    ]);
    const opts = await getRemedyOptions('d1', null);
    expect(opts).toEqual([{ type: 'discount', label: 'İndirim', unit: '%', values: [5, 10] }]);
  });

  it('mekana özel şablon varsa işletme genelinden önce gelir', async () => {
    // 1. çağrı: mekana özel (dolu) → hemen döner, 2. çağrı yapılmaz
    mockTemplateFindMany.mockResolvedValueOnce([
      { type: 'points', label: 'Puan', unit: 'puan', values: [200] },
    ]);
    const opts = await getRemedyOptions('d1', 'loc1');
    expect(opts).toEqual([{ type: 'points', label: 'Puan', unit: 'puan', values: [200] }]);
    expect(mockTemplateFindMany).toHaveBeenCalledTimes(1); // mekan bulundu, işletme geneli sorulmadı
  });

  it('mekan boşsa işletme geneline düşer', async () => {
    mockTemplateFindMany
      .mockResolvedValueOnce([]) // mekana özel boş
      .mockResolvedValueOnce([{ type: 'discount', label: 'İndirim', unit: '%', values: [25] }]); // işletme geneli
    const opts = await getRemedyOptions('d1', 'loc1');
    expect(opts).toEqual([{ type: 'discount', label: 'İndirim', unit: '%', values: [25] }]);
    expect(mockTemplateFindMany).toHaveBeenCalledTimes(2);
  });

  it('values içindeki geçersiz değerleri temizler', async () => {
    mockTemplateFindMany.mockResolvedValueOnce([
      { type: 'discount', label: 'İndirim', unit: '%', values: [10, 'x', null, 20] },
    ]);
    const opts = await getRemedyOptions('d1', null);
    expect(opts[0].values).toEqual([10, 20]);
  });

  it('sorgu hata verirse varsayılana düşer', async () => {
    mockTemplateFindMany.mockRejectedValue(new Error('db down'));
    const opts = await getRemedyOptions('d1', null);
    expect(opts).toEqual(DEFAULT_REMEDY_OPTIONS);
  });
});

describe('getRemedyOptionsForQrCode', () => {
  it('QR kodun mekanını çözüp o mekanın şablonunu kullanır', async () => {
    mockQrFindUnique.mockResolvedValue({ locationId: 'loc9' });
    mockTemplateFindMany.mockResolvedValueOnce([
      { type: 'free_item', label: 'Ücretsiz', unit: 'adet', values: [1] },
    ]);
    const opts = await getRemedyOptionsForQrCode('d1', 'qr1');
    expect(opts).toEqual([{ type: 'free_item', label: 'Ücretsiz', unit: 'adet', values: [1] }]);
  });

  it('qrCodeId yoksa işletme geneli/varsayılana gider', async () => {
    mockTemplateFindMany.mockResolvedValue([]);
    const opts = await getRemedyOptionsForQrCode('d1', null);
    expect(opts).toEqual(DEFAULT_REMEDY_OPTIONS);
    expect(mockQrFindUnique).not.toHaveBeenCalled();
  });
});
