/**
 * Kampanya Takvimi (/admin/campaigns-calendar) — saf sözleşme (durum, kazanan, çakışma,
 * tahmin, İstanbul saati), sezon seçicisinin bütçe/tavan davranışı ve prisma mock'lu
 * yazım yolları (doğrulama, 409, arşiv, denetim). Gerçek DB'ye GİDİLMEZ.
 */
const mockPrisma: Record<string, any> = {};
jest.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => mockPrisma[k as string] }) }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
const mockSync = jest.fn();
jest.mock('@/lib/seasonal-concept-core', () => ({ syncActiveSeasonalConcept: (...a: unknown[]) => mockSync(...a) }));

import {
  barGeometry,
  assignLanes,
  campaignInputSchema,
  conceptInputSchema,
  detectConflicts,
  estimateCampaignExtra,
  isoToIstanbulLocal,
  istanbulLocalToIso,
  legacyCalendarTarget,
  parseArchiveMap,
  toCampaignView,
  toConceptView,
  withCampaignStatus,
  withConceptStatus,
  type RawCampaign,
  type RawConcept,
} from '@/lib/campaigns-calendar/contract';
import { getActiveSeasonalCampaign } from '@/lib/seasonal-campaign-live';
import {
  ARCHIVE_KEY,
  archiveCampaign,
  campaignVersion,
  createCampaign,
  setCampaignActive,
  updateCampaign,
  updateConcept,
} from '@/lib/campaigns-calendar/server';

const NOW = new Date('2026-10-11T09:00:00.000Z');

function raw(over: Partial<RawCampaign> = {}): RawCampaign {
  return {
    id: 'c1',
    name: 'Yaz',
    description: 'd',
    type: 'SEASONAL',
    multiplier: 1.5,
    bonusPoints: 0,
    imageUrl: null,
    conditions: null,
    challengeType: null,
    challengeGoal: null,
    challengeRewardPoints: null,
    challengeRewardBadgeId: null,
    isActive: true,
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-20T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...over,
  };
}
const cv = (r: RawCampaign, spent: number | null = null) => toCampaignView(r, 'v', null, spent);

function rawConcept(over: Partial<RawConcept> = {}): RawConcept {
  return {
    id: 'k1',
    name: 'Kış',
    description: null,
    priority: 0,
    backgroundEffect: 'winter',
    themePresetId: 'arctic',
    bannerText: 'Kış geldi',
    bannerEmoji: '❄️',
    isActive: true,
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-30T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    ...over,
  };
}

const validCampaign = {
  name: 'Kış 2×',
  description: 'Kışa özel',
  type: 'SEASONAL',
  multiplier: 2,
  bonusPoints: 10,
  imageUrl: null,
  minLevel: null,
  budgetPoints: null,
  challenge: null,
  isActive: true,
  startDate: '2026-12-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
};

beforeEach(() => {
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  mockSync.mockReset().mockResolvedValue(null);
});

describe('İstanbul saati', () => {
  it('datetime-local İstanbul duvar saati olarak yorumlanır (UTC+3)', () => {
    expect(istanbulLocalToIso('2026-12-01T00:00')).toBe('2026-11-30T21:00:00.000Z');
    expect(isoToIstanbulLocal('2026-11-30T21:00:00.000Z')).toBe('2026-12-01T00:00');
    expect(istanbulLocalToIso('bozuk')).toBeNull();
  });
});

describe('şemalar (istemci + sunucu ortak)', () => {
  it('tavanlar: 10× çarpan ve 100.000 bonus Türkçe mesajla reddedilir', () => {
    const m = campaignInputSchema.safeParse({ ...validCampaign, multiplier: 10 });
    expect(m.success).toBe(false);
    expect(m.error!.issues[0].message).toBe('Çarpan en fazla 3 olabilir');
    const b = campaignInputSchema.safeParse({ ...validCampaign, bonusPoints: 100_000 });
    expect(b.error!.issues[0].message).toBe('Bonus en fazla 250 puan olabilir');
  });
  it('NaN (boş alan) sessizce varsayılana dönmez, reddedilir', () => {
    expect(campaignInputSchema.safeParse({ ...validCampaign, multiplier: Number.NaN }).success).toBe(false);
  });
  it('bitiş başlangıçtan önce olamaz; etkisiz kampanya reddedilir', () => {
    const r = campaignInputSchema.safeParse({ ...validCampaign, endDate: '2026-11-01T00:00:00.000Z' });
    expect(r.error!.issues.some((i) => i.path.join('.') === 'endDate')).toBe(true);
    expect(campaignInputSchema.safeParse({ ...validCampaign, multiplier: 1, bonusPoints: 0 }).success).toBe(false);
  });
  it('görev: ödülsüz görev ve tavan üstü ödül reddedilir', () => {
    expect(
      campaignInputSchema.safeParse({ ...validCampaign, challenge: { type: 'games_played', goal: 5, rewardPoints: 0, rewardBadgeId: null } }).success
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({ ...validCampaign, challenge: { type: 'games_played', goal: 5, rewardPoints: 5000, rewardBadgeId: null } }).success
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({ ...validCampaign, challenge: { type: 'reviews_written', goal: 3, rewardPoints: 100, rewardBadgeId: null } }).success
    ).toBe(true);
  });
  it('konsept: listede olmayan efekt/palet reddedilir; görünmez konsept reddedilir', () => {
    const base = { name: 'Kış', description: null, priority: 0, backgroundEffect: 'winter', themePresetId: 'arctic', bannerText: null, bannerEmoji: null, isActive: true, startDate: '2026-12-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z' };
    expect(conceptInputSchema.safeParse(base).success).toBe(true);
    expect(conceptInputSchema.safeParse({ ...base, backgroundEffect: 'hack' }).success).toBe(false);
    expect(conceptInputSchema.safeParse({ ...base, backgroundEffect: null, themePresetId: null }).success).toBe(false);
  });
});

describe('durum ve kazanan (üretim seçicisiyle aynı kural)', () => {
  it('canlı/gölgede/planlı/duraklatıldı/bitti/bütçe doldu ayrımı', () => {
    const items = [
      cv(raw({ id: 'a', multiplier: 2 })),
      cv(raw({ id: 'b', multiplier: 1.5, bonusPoints: 200 })),
      cv(raw({ id: 'c', startDate: new Date('2026-11-01T00:00:00Z'), endDate: new Date('2026-11-10T00:00:00Z') })),
      cv(raw({ id: 'd', isActive: false })),
      cv(raw({ id: 'e', endDate: new Date('2026-10-05T00:00:00Z') })),
      cv(raw({ id: 'f', multiplier: 3, conditions: { budgetPoints: 1000 } }), 1000),
    ];
    const s = Object.fromEntries(withCampaignStatus(items, NOW).map((v) => [v.id, v.status]));
    expect(s).toEqual({ a: 'live', b: 'shadowed', c: 'scheduled', d: 'paused', e: 'ended', f: 'exhausted' });
  });
  it('eşit çarpanda büyük bonus kazanır; kırpma sıralamayı değiştirir', () => {
    const items = [cv(raw({ id: 'x', multiplier: 10 })), cv(raw({ id: 'y', multiplier: 3, bonusPoints: 50 }))];
    const s = Object.fromEntries(withCampaignStatus(items, NOW).map((v) => [v.id, v.status]));
    expect(s).toEqual({ x: 'shadowed', y: 'live' });
  });
  it('hedefli kampanya herkese açık kazananı belirlemez', () => {
    const items = [cv(raw({ id: 'bd', type: 'BIRTHDAY', multiplier: 3 })), cv(raw({ id: 'g', multiplier: 1.5 }))];
    const v = withCampaignStatus(items, NOW);
    expect(v.find((x) => x.id === 'g')!.status).toBe('live');
    expect(v.find((x) => x.id === 'bd')!).toMatchObject({ status: 'live', targeted: true });
  });
  it('tanınmayan koşul → seçici uygulamaz (gölgede + işaretli)', () => {
    const v = withCampaignStatus([cv(raw({ id: 'z', conditions: { region: 'x' } }))], NOW)[0];
    expect(v.conditionsInvalid).toBe(true);
    expect(v.status).toBe('shadowed');
  });
  it('konsept: öncelik, eşitse geç başlayan kazanır', () => {
    const a = toConceptView(rawConcept({ id: 'a', priority: 1 }), null);
    const b = toConceptView(rawConcept({ id: 'b', priority: 1, startDate: new Date('2026-10-05T00:00:00Z') }), null);
    const st = Object.fromEntries(withConceptStatus([a, b], NOW).map((x) => [x.id, x.status]));
    expect(st).toEqual({ a: 'shadowed', b: 'live' });
  });
  it('arşiv her şeyi ezer', () => {
    const v = withCampaignStatus([toCampaignView(raw(), 'v', { at: 'x', reason: 'r', by: null })], NOW)[0];
    expect(v.status).toBe('archived');
  });
});

describe('çakışmalar', () => {
  it('iki herkese açık kampanya: kazanan ve kaybolan bonus anlatılır', () => {
    const c = detectConflicts([cv(raw({ id: 'a', name: 'A', multiplier: 1.1 })), cv(raw({ id: 'b', name: 'B', multiplier: 1, bonusPoints: 200 }))], [], NOW);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'campaign', severity: 'warning', winnerId: 'a' });
    expect(c[0].message).toContain('200 puanlık bonusu');
  });
  it('konsept örtüşmesi ve puan vaat eden banner (kampanyasız) uyarısı', () => {
    const k1 = toConceptView(rawConcept({ id: 'k1', priority: 5 }), null);
    const k2 = toConceptView(rawConcept({ id: 'k2', name: 'Yılbaşı', bannerText: 'Bol puan seni bekliyor' }), null);
    const c = detectConflicts([], [k1, k2], NOW);
    expect(c.map((x) => x.kind).sort()).toEqual(['concept', 'cross']);
    expect(c.find((x) => x.kind === 'concept')!.winnerId).toBe('k1');
  });
  it('bitmiş, duraklatılmış ve arşivli kayıtlar çakışma üretmez', () => {
    const c = detectConflicts(
      [cv(raw({ id: 'a' })), cv(raw({ id: 'b', isActive: false })), toCampaignView(raw({ id: 'c' }), 'v', { at: 'x', reason: 'r', by: null })],
      [],
      NOW
    );
    expect(c).toHaveLength(0);
  });
});

describe('tahmin ve geometri', () => {
  it('ek puan = taban × (çarpan−1) + olay × bonus; bütçe günü', () => {
    const e = estimateCampaignExtra({ baselineWeekPoints: 7000, baselineWeekEvents: 70, multiplier: 2, bonus: 10, windowMs: 10 * 86_400_000, budgetPoints: 11_000, targeted: false });
    expect(e.extraPerDay).toBe(1000 + 100);
    expect(e.extraTotal).toBe(11_000);
    expect(e.budgetDays).toBe(5.2); // günde 2000 + 100 = 2100
  });
  it('bar geometrisi pencere dışında null, kırpılınca işaretli', () => {
    const from = Date.parse('2026-10-01T00:00:00Z');
    const to = Date.parse('2026-10-31T00:00:00Z');
    expect(barGeometry('2026-09-01T00:00:00Z', '2026-09-10T00:00:00Z', from, to)).toBeNull();
    const g = barGeometry('2026-09-25T00:00:00Z', '2026-10-16T00:00:00Z', from, to)!;
    expect(g.clippedStart).toBe(true);
    expect(g.left).toBe(0);
    expect(Math.round(g.width)).toBe(50);
  });
  it('örtüşenler ayrı şeride düşer', () => {
    const lanes = assignLanes([
      { id: 'a', startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-10T00:00:00Z' },
      { id: 'b', startDate: '2026-10-05T00:00:00Z', endDate: '2026-10-12T00:00:00Z' },
      { id: 'c', startDate: '2026-10-11T00:00:00Z', endDate: '2026-10-15T00:00:00Z' },
    ]);
    expect([lanes.get('a'), lanes.get('b'), lanes.get('c')]).toEqual([0, 1, 0]);
  });
  it('eski rota sorgu parametrelerini korur', () => {
    expect(legacyCalendarTarget('concept', { foo: 'a', many: ['1', '2'] })).toBe('/admin/campaigns-calendar?foo=a&many=1&many=2&layer=concept');
  });
  it('arşiv haritası bozuk girdide boş', () => {
    expect(parseArchiveMap('x')).toEqual({ campaigns: {}, concepts: {} });
    expect(parseArchiveMap({ campaigns: { a: { at: 't', reason: 'r' } } }).campaigns.a).toEqual({ at: 't', reason: 'r', by: null });
  });
});

describe('sezon seçicisi: bütçe (yumuşak tavan)', () => {
  it('bütçesi dolan kampanya atlanır, sıradaki uygun kampanyaya düşülür', async () => {
    const db = {
      seasonalCampaign: {
        findMany: jest.fn(async () => [
          { id: 'big', type: 'SEASONAL', multiplier: 3, bonusPoints: 0, conditions: { budgetPoints: 500 }, startDate: new Date('2026-10-01') },
          { id: 'small', type: 'SEASONAL', multiplier: 1.5, bonusPoints: 0, conditions: null, startDate: new Date('2026-10-01') },
        ]),
      },
      pointsLedger: { aggregate: jest.fn(async () => ({ _sum: { delta: 600 } })) },
      user: { findUnique: jest.fn() },
    };
    const r = await getActiveSeasonalCampaign(NOW, db as never, 'u1');
    expect(r?.campaignId).toBe('small');
    const where = db.pointsLedger.aggregate.mock.calls[0][0].where;
    expect(where.meta).toEqual({ path: ['seasonalCampaignId'], equals: 'big' });
  });
  it('bütçe dolmadıysa kazanan uygulanır', async () => {
    const db = {
      seasonalCampaign: {
        findMany: jest.fn(async () => [{ id: 'big', type: 'SEASONAL', multiplier: 3, bonusPoints: 0, conditions: { budgetPoints: 500 }, startDate: new Date('2026-10-01') }]),
      },
      pointsLedger: { aggregate: jest.fn(async () => ({ _sum: { delta: 100 } })) },
      user: { findUnique: jest.fn(async () => null) },
    };
    expect((await getActiveSeasonalCampaign(NOW, db as never, 'u1'))?.campaignId).toBe('big');
  });
});

describe('yazım yolları (prisma mock)', () => {
  const actor = { id: 'admin_1', meta: { ipAddress: null, userAgent: null } };
  function setup(existing: RawCampaign = raw(), archive: unknown = null) {
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      seasonalCampaign: {
        findUnique: jest.fn(async () => existing),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...raw({ id: 'new' }), ...data, conditions: null })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data, conditions: existing.conditions })),
      },
      seasonalConcept: {
        findUnique: jest.fn(async () => rawConcept()),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...rawConcept(), ...data, updatedAt: new Date('2026-10-11T00:00:00Z') })),
      },
      settings: {
        findUnique: jest.fn(async () => (archive ? { value: archive } : null)),
        upsert: jest.fn(async () => ({})),
      },
      badge: { findUnique: jest.fn(async () => null) },
      auditLog: { create: jest.fn(async () => ({ id: 'a1' })) },
    };
    mockPrisma.$transaction = jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));
    return tx;
  }

  it('oluşturma: şema dışı (10×) hiçbir şey yazmaz', async () => {
    const tx = setup();
    await expect(createCampaign({ ...validCampaign, multiplier: 10 }, actor)).rejects.toThrow();
    expect(tx.seasonalCampaign.create).not.toHaveBeenCalled();
  });

  it('oluşturma: pasif/olmayan rozet reddedilir', async () => {
    const tx = setup();
    await expect(
      createCampaign({ ...validCampaign, challenge: { type: 'games_played', goal: 5, rewardPoints: 0, rewardBadgeId: 'b404' } }, actor)
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(tx.seasonalCampaign.create).not.toHaveBeenCalled();
  });

  it('oluşturma: bütçe + seviye conditions’a, görev alanları kolonlara yazılır; denetim kaydı', async () => {
    const tx = setup();
    await createCampaign(
      { ...validCampaign, minLevel: 3, budgetPoints: 5000, challenge: { type: 'reviews_written', goal: 3, rewardPoints: 100, rewardBadgeId: null } },
      actor
    );
    const data = tx.seasonalCampaign.create.mock.calls[0][0].data;
    expect(data.conditions).toEqual({ minLevel: 3, budgetPoints: 5000 });
    expect(data).toMatchObject({ challengeType: 'reviews_written', challengeGoal: 3, challengeRewardPoints: 100, challengeRewardBadgeId: null });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('CREATE_SEASONAL_CAMPAIGN');
  });

  it('düzenleme: eski sürümle 409, denetimde önce/sonra + değişen alanlar', async () => {
    const existing = raw();
    const tx = setup(existing);
    await expect(updateCampaign('c1', validCampaign, 'h:eski', actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.seasonalCampaign.update).not.toHaveBeenCalled();
    await updateCampaign('c1', { ...validCampaign, name: 'Yaz', description: 'd', multiplier: 2, bonusPoints: 0, startDate: existing.startDate.toISOString(), endDate: existing.endDate.toISOString() }, campaignVersion(existing), actor);
    const audit = tx.auditLog.create.mock.calls[0][0].data;
    expect(audit.oldData).toMatchObject({ multiplier: 1.5 });
    expect(audit.newData.changedFields).toEqual(['multiplier']);
  });

  it('düzenleme: baseVersion zorunlu', async () => {
    setup();
    await expect(updateCampaign('c1', validCampaign, undefined, actor)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('arşiv: kampanya pasifleşir, arşiv haritasına gerekçeyle yazılır, silinmez', async () => {
    const existing = raw();
    const tx = setup(existing);
    await archiveCampaign('c1', 'Yanlış tarih', campaignVersion(existing), actor);
    expect(tx.seasonalCampaign.update.mock.calls[0][0].data).toEqual({ isActive: false });
    const written = tx.settings.upsert.mock.calls[0][0];
    expect(written.where).toEqual({ key: ARCHIVE_KEY });
    expect(written.update.value.campaigns.c1).toMatchObject({ reason: 'Yanlış tarih', by: 'admin_1' });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('SEASONAL_CAMPAIGN_ARCHIVE');
  });

  it('arşivdeki kampanya yayına alınamaz', async () => {
    const existing = raw({ isActive: false });
    setup(existing, { campaigns: { c1: { at: 'x', reason: 'r' } }, concepts: {} });
    await expect(setCampaignActive('c1', true, campaignVersion(existing), actor)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('konsept düzenleme: senkron hatası kaydı bozmaz (synced=false)', async () => {
    setup();
    mockSync.mockRejectedValue(new Error('redis'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await updateConcept(
      'k1',
      { name: 'Kış', description: null, priority: 0, backgroundEffect: 'winter', themePresetId: 'arctic', bannerText: 'Kış', bannerEmoji: null, isActive: true, startDate: '2026-12-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z' },
      '2026-09-02T00:00:00.000Z',
      actor
    );
    expect(r.synced).toBe(false);
  });
});
