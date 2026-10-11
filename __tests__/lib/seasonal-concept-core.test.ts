/**
 * Seasonal concept core testleri: aktif konsept çözümü (pencere + öncelik) ve
 * parse helper'ın güvenli davranışı.
 */
const mockConceptFindFirst = jest.fn();
const mockSettingsUpsert = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    seasonalConcept: { findFirst: (...a: unknown[]) => mockConceptFindFirst(...a) },
    settings: { upsert: (...a: unknown[]) => mockSettingsUpsert(...a) },
  },
}));

import {
  getActiveSeasonalConcept,
  syncActiveSeasonalConcept,
  parseActiveSeasonalConcept,
  readValidSeasonalCache,
} from '@/lib/seasonal-concept-core';

beforeEach(() => {
  mockConceptFindFirst.mockReset();
  mockSettingsUpsert.mockReset().mockResolvedValue({});
});

describe('getActiveSeasonalConcept', () => {
  it('aktif konsept yoksa null döner', async () => {
    mockConceptFindFirst.mockResolvedValue(null);
    expect(await getActiveSeasonalConcept(new Date('2026-07-01'))).toBeNull();
  });

  it('aktif konsepti ActiveSeasonalConcept şekline çevirir', async () => {
    mockConceptFindFirst.mockResolvedValue({
      id: 'c1',
      name: 'Yaz',
      backgroundEffect: 'waves',
      themePresetId: 'orange',
      bannerText: 'Yaz geldi',
      bannerEmoji: '☀️',
      endDate: new Date('2026-08-01T00:00:00.000Z'),
    });
    const r = await getActiveSeasonalConcept(new Date('2026-07-15'));
    expect(r).toEqual({
      id: 'c1',
      name: 'Yaz',
      backgroundEffect: 'waves',
      themePresetId: 'orange',
      bannerText: 'Yaz geldi',
      bannerEmoji: '☀️',
      endDate: '2026-08-01T00:00:00.000Z',
    });
    // Sorgu pencere + öncelik sıralamasıyla çağrılmalı.
    const callArg = mockConceptFindFirst.mock.calls[0][0];
    expect(callArg.where.isActive).toBe(true);
    expect(callArg.orderBy).toEqual([{ priority: 'desc' }, { startDate: 'desc' }]);
  });

  it('DB hatasında güvenli null döner', async () => {
    mockConceptFindFirst.mockRejectedValue(new Error('db'));
    expect(await getActiveSeasonalConcept()).toBeNull();
  });
});

describe('syncActiveSeasonalConcept', () => {
  it('aktif konsepti Settings anahtarına yazar', async () => {
    mockConceptFindFirst.mockResolvedValue({
      id: 'c2',
      name: 'Kış',
      backgroundEffect: 'christmas',
      themePresetId: 'arctic',
      bannerText: null,
      bannerEmoji: '❄️',
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    });
    const r = await syncActiveSeasonalConcept(new Date('2026-12-01'));
    expect(r?.id).toBe('c2');
    expect(mockSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'activeSeasonalConcept' },
      })
    );
  });

  it('aktif yoksa "yok + sonraki değişim" yazar', async () => {
    mockConceptFindFirst.mockResolvedValue(null);
    const r = await syncActiveSeasonalConcept();
    expect(r).toBeNull();
    expect(mockSettingsUpsert.mock.calls[0][0].update.value).toEqual({ none: true, nextChangeAt: null });
  });

  it('okuma hatasında önbelleğe YAZMAZ (canlı konsept silinmez)', async () => {
    mockConceptFindFirst.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await syncActiveSeasonalConcept()).toBeNull();
    expect(mockSettingsUpsert).not.toHaveBeenCalled();
  });

  it('sonraki değişim anı: kazananın bitişi ile sonraki başlangıcın küçüğü', async () => {
    mockConceptFindFirst
      .mockResolvedValueOnce({ id: 'k', name: 'Kış', backgroundEffect: null, themePresetId: null, bannerText: null, bannerEmoji: null, endDate: new Date('2027-02-28T00:00:00.000Z') })
      .mockResolvedValueOnce({ startDate: new Date('2026-12-24T00:00:00.000Z') });
    await syncActiveSeasonalConcept(new Date('2026-12-10T00:00:00.000Z'));
    expect(mockSettingsUpsert.mock.calls[0][0].update.value).toMatchObject({ id: 'k', nextChangeAt: '2026-12-24T00:00:00.000Z' });
  });
});

describe('parseActiveSeasonalConcept', () => {
  it('geçersiz girdilerde null', () => {
    expect(parseActiveSeasonalConcept(null)).toBeNull();
    expect(parseActiveSeasonalConcept('x')).toBeNull();
    expect(parseActiveSeasonalConcept({})).toBeNull();
    expect(parseActiveSeasonalConcept({ id: 'x' })).toBeNull(); // name yok
  });

  it('geçerli objeyi parse eder ve eksik alanları null yapar', () => {
    const r = parseActiveSeasonalConcept({ id: 'a', name: 'Test', endDate: '2026-01-01' });
    expect(r).toEqual({
      id: 'a',
      name: 'Test',
      backgroundEffect: null,
      themePresetId: null,
      bannerText: null,
      bannerEmoji: null,
      endDate: '2026-01-01',
    });
  });
});

describe('readValidSeasonalCache', () => {
  const now = new Date('2026-12-20T00:00:00.000Z');
  it('nextChangeAt gelecekteyse önbellek geçerli (konsept yok dahil)', () => {
    expect(readValidSeasonalCache({ none: true, nextChangeAt: '2026-12-24T00:00:00.000Z' }, now)).toEqual({ concept: null });
    expect(readValidSeasonalCache({ none: true, nextChangeAt: null }, now)).toEqual({ concept: null });
  });
  it('değişim anı geçtiyse geçersiz → canlı çözülür (yüksek öncelikli yeni konsept bekletilmez)', () => {
    expect(readValidSeasonalCache({ id: 'k', name: 'Kış', endDate: '2027-02-28T00:00:00.000Z', nextChangeAt: '2026-12-19T00:00:00.000Z' }, now)).toBeNull();
  });
  it('eski biçim: bitiş gelecekteyse geçerli', () => {
    expect(readValidSeasonalCache({ id: 'k', name: 'Kış', endDate: '2027-02-28T00:00:00.000Z' }, now)?.concept?.id).toBe('k');
    expect(readValidSeasonalCache(null, now)).toBeNull();
  });
});
