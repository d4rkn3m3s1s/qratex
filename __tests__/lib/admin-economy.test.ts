/**
 * Ekonomi Stüdyosu (/admin/economy) sunucu mantığı — saf sözleşme, simülasyon ve prisma
 * mock'lu veri katmanı. Gerçek DB'ye GİDİLMEZ.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }));

import { getDefaultPointsMatrix, type PointsMatrix } from '@/lib/points-rules';
import { DEFAULT_LEAGUE_RULES, getLeagueMetaFromRules, getLeagueProgressFromRules, type LeagueRule } from '@/lib/league-rules-core';
import {
  LEAGUE_OPEN_MAX,
  classifySource,
  deriveLeagueRanges,
  diffJson,
  leagueRuleErrors,
  leagueRulesSchema,
  legacyRedirectTarget,
  multipliersSchema,
  parseEconomyTab,
  type EconomyFlow,
} from '@/lib/admin-economy/contract';
import { simulateEconomy, spinExpectedPoints } from '@/lib/admin-economy/simulate';
import { getEconomyFlow, listHistory, previewLeagues, saveMultipliers } from '@/lib/admin-economy/server';
import { VersionConflictError } from '@/lib/settings-version';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('sözleşme', () => {
  it('eski rota yönlendirmesi sekmeyi ayarlar ve diğer parametreleri korur', () => {
    expect(legacyRedirectTarget('matrix', {})).toBe('/admin/economy');
    expect(legacyRedirectTarget('leagues', { foo: 'a', tab: 'x', many: ['1', '2'] })).toBe('/admin/economy?foo=a&many=1&many=2&tab=leagues');
    expect(parseEconomyTab('simulation')).toBe('simulation');
    expect(parseEconomyTab('zzz')).toBe('matrix');
  });

  it('çarpan şeması 0,1–5 aralığı dışını reddeder', () => {
    expect(multipliersSchema.safeParse({ pointMultiplier: 1, xpMultiplier: 1.5 }).success).toBe(true);
    expect(multipliersSchema.safeParse({ pointMultiplier: 0, xpMultiplier: 1 }).success).toBe(false);
    expect(multipliersSchema.safeParse({ pointMultiplier: 100, xpMultiplier: 1 }).success).toBe(false);
    expect(multipliersSchema.safeParse({ pointMultiplier: Number.NaN, xpMultiplier: 1 }).success).toBe(false);
  });

  it('lig eşikleri: bitişik aralık türetilir, varsayılan kurallar geçerli olur', () => {
    const rules = deriveLeagueRanges(DEFAULT_LEAGUE_RULES);
    expect(rules[rules.length - 1].maxPoints).toBe(LEAGUE_OPEN_MAX);
    expect(rules[0].maxPoints).toBe(rules[1].minPoints - 1);
    expect(leagueRulesSchema.safeParse(rules).success).toBe(true);
    expect(leagueRuleErrors(rules)).toEqual({});
  });

  it('lig eşikleri: artmayan eşik, 0 olmayan ilk eşik, boşluk ve eksik lig reddedilir', () => {
    const bad = deriveLeagueRanges(DEFAULT_LEAGUE_RULES.map((r, i) => (i === 2 ? { ...r, minPoints: 100 } : r)));
    expect(leagueRuleErrors(bad)[2]).toMatch(/büyük olmalı/);
    const firstNonZero = deriveLeagueRanges(DEFAULT_LEAGUE_RULES.map((r, i) => (i === 0 ? { ...r, minPoints: 5 } : r)));
    expect(leagueRulesSchema.safeParse(firstNonZero).success).toBe(false);
    // Üst sınır istemciden alınmaz: boşluklu gönderim türetmeyle bitişik olur.
    const gap = deriveLeagueRanges(DEFAULT_LEAGUE_RULES).map((r, i) => (i === 1 ? { ...r, maxPoints: r.maxPoints - 10 } : r));
    expect(deriveLeagueRanges(gap)[1].maxPoints).toBe(gap[2].minPoints - 1);
    expect(leagueRulesSchema.safeParse(deriveLeagueRanges(DEFAULT_LEAGUE_RULES).slice(0, 6)).success).toBe(false);
  });

  it('diffJson yaprak farklarını kimlikli dizilerle üretir', () => {
    const a = { feedback: { base: { points: 10 } }, spin: { prizes: [{ id: 'a', value: 5 }, { id: 'b', value: 1 }] } };
    const b = { feedback: { base: { points: 20 } }, spin: { prizes: [{ id: 'a', value: 5 }, { id: 'c', value: 2 }] } };
    const d = diffJson(a, b);
    expect(d).toEqual(
      expect.arrayContaining([
        { path: 'feedback.base.points', before: '10', after: '20' },
        { path: 'spin.prizes[b]', before: 'vardı', after: 'silindi' },
        { path: 'spin.prizes[c]', before: '—', after: 'eklendi' },
      ])
    );
    expect(diffJson({ x: 1 }, { x: 1 })).toEqual([]);
  });

  it('kaynak sınıflaması: emanet transfer, düzeltme ve açılış bakiyesi basım sayılmaz', () => {
    expect(classifySource('feedback', 10)).toBe('mint');
    expect(classifySource('shop', -10)).toBe('sink');
    expect(classifySource('squad_escrow', -10)).toBe('transfer');
    expect(classifySource('squad_battle', 10)).toBe('transfer');
    expect(classifySource('admin_adjust', 10)).toBe('correction');
    expect(classifySource('opening_balance', 10)).toBe('excluded');
  });
});

describe('lig çekirdeği (B3: tavanın üstü Başlangıç\'a düşmez)', () => {
  it('son ligin üstü ve boşluk en yüksek geçilen lige yerleşir', () => {
    expect(getLeagueMetaFromRules(250_000, DEFAULT_LEAGUE_RULES).key).toBe('ZENOR');
    const gapped: LeagueRule[] = DEFAULT_LEAGUE_RULES.map((r) => (r.key === 'KOR' ? { ...r, maxPoints: 4000 } : r));
    expect(getLeagueMetaFromRules(4500, gapped).key).toBe('KOR');
    expect(getLeagueMetaFromRules(0, DEFAULT_LEAGUE_RULES).key).toBe('BASLANGIC');
    expect(getLeagueProgressFromRules(250_000, DEFAULT_LEAGUE_RULES)).toBe(100);
  });
});

describe('simülasyon', () => {
  const saved = getDefaultPointsMatrix();
  const flow: Pick<EconomyFlow, 'days' | 'bySource' | 'spent'> = {
    days: 30,
    spent: 500,
    bySource: [
      { source: 'feedback', label: 'Geri bildirim', kind: 'mint', points: 1000, count: 50, xp: 0 },
      { source: 'game', label: 'Mini oyunlar', kind: 'mint', points: 700, count: 10, xp: 0 },
      { source: 'shop', label: 'Mağaza', kind: 'sink', points: 500, count: 3, xp: 0 },
    ],
  };

  it('çarpan iki katına çıkınca yalnız geri bildirim ölçeklenir', () => {
    const r = simulateEconomy({
      flow,
      saved: { matrix: saved, multipliers: { pointMultiplier: 1, xpMultiplier: 1 } },
      draft: { matrix: saved, multipliers: { pointMultiplier: 2, xpMultiplier: 1 } },
    });
    expect(r.rows.find((x) => x.source === 'feedback')!.projected).toBe(2000);
    expect(r.rows.find((x) => x.source === 'game')!.projected).toBe(700);
    expect(r.observedMint).toBe(1700);
    expect(r.projectedMint).toBe(2700);
    expect(r.projectedNet).toBe(2200);
    expect(r.deltaPct).toBeCloseTo((1000 / 1700) * 100, 5);
  });

  it('matris değişmezse tahmin gözleme eşittir; çark kapatılınca çark basımı sıfırlanır', () => {
    const same = simulateEconomy({
      flow,
      saved: { matrix: saved, multipliers: { pointMultiplier: 1, xpMultiplier: 1 } },
      draft: { matrix: saved, multipliers: { pointMultiplier: 1, xpMultiplier: 1 } },
    });
    expect(same.projectedMint).toBe(same.observedMint);

    const off: PointsMatrix = clone(saved);
    off.spin.enabled = false;
    const withSpin = { ...flow, bySource: [...flow.bySource, { source: 'spin', label: 'Çark', kind: 'mint' as const, points: 300, count: 30, xp: 0 }] };
    const r = simulateEconomy({
      flow: withSpin,
      saved: { matrix: saved, multipliers: { pointMultiplier: 1, xpMultiplier: 1 } },
      draft: { matrix: off, multipliers: { pointMultiplier: 1, xpMultiplier: 1 } },
    });
    expect(spinExpectedPoints(off.spin)).toBe(0);
    expect(r.rows.find((x) => x.source === 'spin')!.projected).toBe(0);
  });

  it('kayıtlı ödülü 0 olan kaynak ölçeklenemez diye işaretlenir', () => {
    const zero: PointsMatrix = clone(saved);
    zero.birthday.points = 0;
    const draft: PointsMatrix = clone(saved);
    draft.birthday.points = 500;
    const r = simulateEconomy({
      flow,
      saved: { matrix: zero, multipliers: { pointMultiplier: 1, xpMultiplier: 1 } },
      draft: { matrix: draft, multipliers: { pointMultiplier: 1, xpMultiplier: 1 } },
    });
    expect(r.rows.find((x) => x.source === 'birthday')!.factor).toBeNull();
    expect(r.assumptions.join(' ')).toMatch(/ölçeklenemez/);
  });
});

describe('saveMultipliers (sürümlü yazma)', () => {
  const row = { id: 'g1', xpMultiplier: 1, pointMultiplier: 1, updatedAt: new Date('2026-10-01T10:00:00.000Z') };
  function makeDb(current: typeof row | null) {
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      gamificationSettings: {
        findFirst: jest.fn(async () => current),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'g1', ...data })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'g2', ...data, updatedAt: new Date('2026-10-02T00:00:00.000Z') })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const db = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    return { db, tx };
  }
  const actor = { userId: 'admin1', ipAddress: null, userAgent: null };

  it('eski sürümle yazma 409 (VersionConflictError) fırlatır ve yazmaz', async () => {
    const { db, tx } = makeDb(row);
    await expect(
      saveMultipliers({ pointMultiplier: 2, xpMultiplier: 1, baseVersion: '2026-09-01T00:00:00.000Z' }, actor, db as never)
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect(tx.gamificationSettings.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('doğru sürümle yalnız iki çarpanı yazar, audit aynı tx\'te', async () => {
    const { db, tx } = makeDb(row);
    const res = await saveMultipliers({ pointMultiplier: 1.5, xpMultiplier: 2, baseVersion: row.updatedAt.toISOString() }, actor, db as never);
    const data = (tx.gamificationSettings.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.pointMultiplier).toBe(1.5);
    expect(data.xpMultiplier).toBe(2);
    expect(data).not.toHaveProperty('dailyXpCap');
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual({ pointMultiplier: 1.5, xpMultiplier: 2 });
    expect(new Date(res.version).getTime()).toBeGreaterThan(row.updatedAt.getTime());
  });

  it('satır yoksa sürüm "none" ile oluşturur', async () => {
    const { db, tx } = makeDb(null);
    await saveMultipliers({ pointMultiplier: 1, xpMultiplier: 1, baseVersion: 'none' }, actor, db as never);
    expect(tx.gamificationSettings.create).toHaveBeenCalled();
  });
});

describe('previewLeagues', () => {
  it('aralık birleşiminden yükselen/düşen müşteri sayar', async () => {
    const current = deriveLeagueRanges(DEFAULT_LEAGUE_RULES);
    // KOR eşiği 3000 → 2000: 2000–2999 arası BASLANGIC → KOR (yükselir)
    const draft = deriveLeagueRanges(DEFAULT_LEAGUE_RULES.map((r) => (r.key === 'KOR' ? { ...r, minPoints: 2000 } : r)));
    const count = jest.fn(async ({ where }: { where: { points?: { gte?: number; lt?: number } } }) => {
      const p = where.points;
      if (p?.gte === 2000 && p.lt === 3000) return 7;
      if (p?.gte === undefined && p?.lt === 2000) return 100;
      return 1;
    });
    const db = { user: { count } };
    const res = await previewLeagues(current, draft, db as never);
    expect(res.promoted).toBe(7);
    expect(res.demoted).toBe(0);
    expect(res.current.BASLANGIC).toBe(107);
    expect(res.draft.BASLANGIC).toBe(100);
    expect(res.draft.KOR).toBe(8);
    // demo/anonim hariç müşteri kitlesi
    expect(count.mock.calls[0][0].where).toMatchObject({ role: 'CUSTOMER', isDemo: false, anonymizedAt: null });
  });
});

describe('getEconomyFlow', () => {
  it('basım/harcama/transferi ayırır, enflasyonu dönem başı arza göre hesaplar, boş günleri doldurur', async () => {
    const group = jest
      .fn()
      .mockResolvedValueOnce([
        { source: 'feedback', _sum: { delta: 800, xpDelta: 100 }, _count: { _all: 40 } },
        { source: 'squad_battle', _sum: { delta: 300, xpDelta: 0 }, _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { source: 'shop', _sum: { delta: -200, xpDelta: 0 }, _count: { _all: 4 } },
        { source: 'squad_escrow', _sum: { delta: -300, xpDelta: 0 }, _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([{ source: 'feedback', _sum: { delta: 400, xpDelta: 0 }, _count: { _all: 20 } }])
      .mockResolvedValueOnce([]);
    const db = {
      pointsLedger: { groupBy: group, count: jest.fn(async () => 0) },
      user: { aggregate: jest.fn(async () => ({ _sum: { points: 10_600 } })) },
      $queryRaw: jest.fn(async () => [{ day: '2026-10-08', mint: BigInt(800), sink: BigInt(200) }]),
    };
    const f = await getEconomyFlow(7, db as never, new Date('2026-10-08T12:00:00.000Z'));
    expect(f.minted).toBe(800);
    expect(f.spent).toBe(200);
    expect(f.net).toBe(600);
    expect(f.previous.minted).toBe(400);
    expect(f.inflationPct).toBeCloseTo((600 / 10_000) * 100, 6);
    expect(f.redeemPct).toBe(25);
    expect(f.series).toHaveLength(7);
    expect(f.series[6]).toEqual({ day: '2026-10-08', mint: 800, sink: 200 });
    expect(f.series[0]).toEqual({ day: '2026-10-02', mint: 0, sink: 0 });
    expect(f.bySource.find((r) => r.source === 'squad_escrow')!.kind).toBe('transfer');
    // Yalnız işlenmiş (posted) POINTS satırları
    expect(group.mock.calls[0][0].where).toMatchObject({ status: 'posted', currency: 'POINTS' });
  });
});

describe('listHistory', () => {
  it('aktör adını ve alan farklarını döndürür', async () => {
    const db = {
      auditLog: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [
          {
            id: 'a1',
            createdAt: new Date('2026-10-05T09:00:00.000Z'),
            oldData: { pointMultiplier: 1, xpMultiplier: 1 },
            newData: { pointMultiplier: 2, xpMultiplier: 1 },
            actorSnapshot: null,
            user: { name: 'Furkan', email: 'f@x.com' },
          },
        ]),
      },
    };
    const page = await listHistory('multipliers', 1, 10, db as never);
    expect(page.total).toBe(1);
    expect(page.items[0].actor).toBe('Furkan');
    expect(page.items[0].changes).toEqual([{ path: 'pointMultiplier', before: '1', after: '2' }]);
    expect(db.auditLog.findMany.mock.calls[0]).toBeDefined();
  });
});
