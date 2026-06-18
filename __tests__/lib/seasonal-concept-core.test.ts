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
      bonusMultiplier: 1.5,
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
      bonusMultiplier: 1.5,
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
      bonusMultiplier: 1,
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

  it('aktif yoksa null yazar', async () => {
    mockConceptFindFirst.mockResolvedValue(null);
    const r = await syncActiveSeasonalConcept();
    expect(r).toBeNull();
    expect(mockSettingsUpsert).toHaveBeenCalled();
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
      bonusMultiplier: null,
      endDate: '2026-01-01',
    });
  });
});
