/**
 * getVenueDetail (lib/venue-detail/detail.ts) — sunucu yükleyicisi:
 *  - askıdaki/anonim/bilinmeyen mekân → null (404), uydurma kimlik → DB'ye gitmeden null;
 *  - açık/kapalı Keşfet ile aynı kaynaktan (bayi saatleri, İstanbul), tatil modu;
 *  - teklif: kullanım tavanı dolmuş flash teklif listelenmez; bayrak kapalıysa hiç yok;
 *  - ziyaret kartı gün tekil; iyileştirme uygunluğu son 180 gün; modül kapalıysa paylaşım/istek kapalı.
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
const mockModules = { value: {} as Record<string, boolean> };
jest.mock('@/lib/module-gate', () => ({ getModuleControls: async () => mockModules.value }));
jest.mock('@/lib/discovery-config', () => ({ getDiscoveryConfig: async () => ({ locations: [] }) }));
const mockFlash = { value: true };
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: async () => ({ features: { flashOffers: mockFlash.value } }),
}));

const state = {
  dealer: null as Record<string, unknown> | null,
  consumptions: [] as Array<{ createdAt: Date }>,
  feedbacks: [] as Array<{ createdAt: Date }>,
  offers: [] as Array<Record<string, unknown>>,
  userFindFirstCalls: 0,
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(async () => {
        state.userFindFirstCalls++;
        return state.dealer;
      }),
    },
    dealerLocation: { findMany: jest.fn(async () => []) },
    customerFavoriteDealer: { findUnique: jest.fn(async () => ({ id: 'fav1' })) },
    dealerFlashOffer: { findMany: jest.fn(async () => state.offers) },
    happyHour: { findMany: jest.fn(async () => []) },
    consumption: {
      findMany: jest.fn(async ({ select }: { select: Record<string, unknown> }) =>
        'product' in select ? [] : state.consumptions
      ),
    },
    feedback: {
      findMany: jest.fn(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
        if ('dealerRepliedAt' in where) return [];
        if ('rating' in select) return [];
        return state.feedbacks;
      }),
    },
    consumptionReview: { findMany: jest.fn(async () => []) },
    improvementRequest: { findMany: jest.fn(async () => []) },
    notification: { findMany: jest.fn(async () => []) },
    experienceShareToken: { findMany: jest.fn(async () => []) },
  },
}));

import { getVenueDetail } from '@/lib/venue-detail/detail';

// Cuma 2026-10-09 12:00 İstanbul (09:00Z)
const NOW = new Date('2026-10-09T09:00:00Z');
const base = { userId: 'user_000001', dealerId: 'dealer_000001', baseUrl: 'https://qratex.test', now: NOW };

beforeEach(() => {
  mockModules.value = {};
  mockFlash.value = true;
  state.dealer = {
    id: 'dealer_000001',
    businessName: 'Kahve Durağı',
    name: null,
    businessLogo: null,
    businessDesc: null,
    businessCategory: 'cafe',
    address: 'Moda Cd. 1, Kadıköy',
    latitude: 40.98,
    longitude: 29.02,
    businessHours: 'Pzt-Cum 09:00-18:00, Cmt 10:00-14:00',
    holidayMode: false,
  };
  state.consumptions = [];
  state.feedbacks = [];
  state.offers = [];
  state.userFindFirstCalls = 0;
});

describe('getVenueDetail', () => {
  it('uydurma kimlikte DB sorgusu yapmadan null', async () => {
    expect(await getVenueDetail({ ...base, dealerId: "x' OR 1=1" })).toBeNull();
    expect(state.userFindFirstCalls).toBe(0);
  });

  it('mekân yoksa (askıda/anonim) null', async () => {
    state.dealer = null;
    expect(await getVenueDetail(base)).toBeNull();
  });

  it('açık/kapalı bayi saatlerinden, İstanbul saatiyle; kategori kontrollü sözlükten', async () => {
    const d = await getVenueDetail(base);
    expect(d?.hours.state).toMatchObject({ status: 'open', closesAt: '18:00' });
    expect(d?.hours.rows?.[0]).toEqual({ day: 1, ranges: [{ open: '09:00', close: '18:00' }] });
    expect(d?.hours.rows?.find((r) => r.day === 0)?.ranges).toEqual([]);
    expect(d?.dealer.category).toBe('kahve');
    expect(d?.isFavorite).toBe(true);
  });

  it('tatil modu → holiday; çözülemeyen metin → durum yok, ham metin gösterilir', async () => {
    state.dealer!.holidayMode = true;
    expect((await getVenueDetail(base))?.hours.state).toMatchObject({ status: 'holiday' });
    state.dealer!.holidayMode = false;
    state.dealer!.businessHours = 'Sezona göre değişir';
    const d = await getVenueDetail(base);
    expect(d?.hours.state).toBeNull();
    expect(d?.hours.raw).toBe('Sezona göre değişir');
  });

  it('kullanım tavanı dolmuş flash teklif listelenmez; bayrak kapalıysa teklif yok', async () => {
    state.offers = [
      { id: 'o1', title: 'Kahve %20', body: 'Öğleden önce', offerType: 'PERCENT', value: 20, validTo: new Date('2026-10-10T00:00:00Z'), maxRedemptions: 10, redemptionCount: 3 },
      { id: 'o2', title: 'Dolu', body: '', offerType: 'PERCENT', value: 10, validTo: new Date('2026-10-10T00:00:00Z'), maxRedemptions: 5, redemptionCount: 5 },
    ];
    expect((await getVenueDetail(base))?.offers.map((o) => o.id)).toEqual(['o1']);
    mockFlash.value = false;
    expect((await getVenueDetail(base))?.offers).toEqual([]);
  });

  it('ziyaret kartı gün tekil; 180 gün içinde ziyaret varsa istek uygun', async () => {
    state.consumptions = [{ createdAt: new Date('2026-10-01T10:00:00Z') }, { createdAt: new Date('2026-10-01T12:00:00Z') }];
    state.feedbacks = [{ createdAt: new Date('2026-10-01T11:00:00Z') }, { createdAt: new Date('2026-10-05T11:00:00Z') }];
    const d = await getVenueDetail(base);
    expect(d?.visits.days).toBe(2);
    expect(d?.visits.stamps).toMatchObject({ filled: 2, toFull: 8 });
    expect(d?.improvement).toMatchObject({ enabled: true, eligible: true });
  });

  it('eski ziyaret → uygun değil; modül kapalı → paylaşım ve istek kapalı', async () => {
    state.consumptions = [{ createdAt: new Date('2025-01-01T10:00:00Z') }];
    mockModules.value = { experiences: false };
    const d = await getVenueDetail(base);
    expect(d?.improvement).toMatchObject({ enabled: false, eligible: false });
    expect(d?.share.enabled).toBe(false);
  });
});
