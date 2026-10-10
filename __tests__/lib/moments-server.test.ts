/**
 * An Motoru — sunucu "an kutusu" (spec §1).
 *
 * Yeniden üretilen hata/senaryo sınıfları:
 *  - "Her an tam bir kez": aynı dedupeKey ikinci kez yazılmaz (skipDuplicates + liste içi tekilleştirme).
 *  - An yazımı kazanımı bozmaz: createMany patlasa da creditPointsAndXp başarıyla döner;
 *    tx içinde hata SAVEPOINT'e geri sarılır (dış kredi transaction'ı iptal olmaz).
 *  - Lig yükselme sınırları: 2999→3000 yükselir; aynı lig içinde hareket yok; harcayıp tekrar
 *    yükselince AYNI sezonlu anahtar (league:s0:KOR) → ikinci kutlama yok; son kademe açık uçlu
 *    (100.000 üstü sahte "yükselme"/"düşme" üretmez); çoklu lig atlamada tek an (en üst lig).
 *  - Panel bug'ının sunucu karşılığı: seviye anı yalnız bump'ı yapan çağrıda yazılır.
 */
const mockSettingsFindUnique = jest.fn(async () => null as unknown);
jest.mock('@/lib/prisma', () => ({
  prisma: { settings: { findUnique: (...a: unknown[]) => mockSettingsFindUnique(...(a as [])) } },
}));

import {
  badgeMomentKey,
  captureCreditMoments,
  cleanupMoments,
  currentLeagueSeasonKey,
  detectLeagueUp,
  leagueIndexAt,
  leagueMomentKey,
  levelMomentKey,
  recordBadgeMoment,
  recordMoments,
} from '@/lib/moments/server';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { DEFAULT_LEAGUE_RULES } from '@/lib/league-rules-core';
import { clearLeagueRulesCache } from '@/lib/league-rules';
import { calculateLevel } from '@/lib/utils';
import type { MomentInput } from '@/lib/moments/types';

function makeDb(opts: { tx?: boolean; createMany?: jest.Mock } = {}) {
  const createMany = opts.createMany ?? jest.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }));
  const exec = jest.fn(async () => 0);
  const db: Record<string, unknown> = {
    customerMoment: { createMany, deleteMany: jest.fn(async () => ({ count: 2 })) },
    settings: { findUnique: jest.fn(async () => null) },
    $executeRawUnsafe: exec,
  };
  if (!opts.tx) db.$transaction = jest.fn();
  return { db, createMany, exec };
}

beforeEach(() => {
  clearLeagueRulesCache();
  mockSettingsFindUnique.mockReset().mockResolvedValue(null);
});

const levelItem = (to: number): MomentInput => ({
  kind: 'level_up',
  dedupeKey: levelMomentKey(to),
  payload: { from: to - 1, to, xp: 100 },
});

describe('dedupe anahtarları', () => {
  it('biçimler spec ile aynı; lig anahtarı sezonlu', () => {
    expect(levelMomentKey(5)).toBe('level:5');
    expect(badgeMomentKey('b1')).toBe('badge:b1');
    expect(currentLeagueSeasonKey()).toBe('s0');
    expect(leagueMomentKey(currentLeagueSeasonKey(), 'KOR')).toBe('league:s0:KOR');
  });
});

describe('recordMoments', () => {
  it('createMany skipDuplicates ile yazar; liste içi aynı anahtar tekilleşir', async () => {
    const { db, createMany } = makeDb();
    const n = await recordMoments(db as never, 'u1', [levelItem(3), levelItem(3), levelItem(4)]);
    expect(n).toBe(2);
    expect(createMany).toHaveBeenCalledTimes(1);
    const arg = createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.map((d: { dedupeKey: string }) => d.dedupeKey)).toEqual(['level:3', 'level:4']);
    expect(arg.data[0]).toMatchObject({ userId: 'u1', kind: 'level_up' });
  });

  it('veritabanı zaten varsa (ON CONFLICT DO NOTHING) 0 döner, fırlatmaz', async () => {
    const { db } = makeDb({ createMany: jest.fn(async () => ({ count: 0 })) });
    await expect(recordMoments(db as never, 'u1', [levelItem(3)])).resolves.toBe(0);
  });

  it('geçersiz tür / boş anahtar / boş kullanıcı yazılmaz', async () => {
    const { db, createMany } = makeDb();
    await recordMoments(db as never, '', [levelItem(3)]);
    await recordMoments(db as never, 'u1', [
      { kind: 'nope', dedupeKey: 'x', payload: {} } as never,
      { kind: 'level_up', dedupeKey: '', payload: { from: 1, to: 2, xp: 1 } },
    ]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('kök istemcide hata yutulur (0), savepoint kullanılmaz', async () => {
    const { db, exec } = makeDb({ createMany: jest.fn(async () => { throw new Error('relation does not exist'); }) });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordMoments(db as never, 'u1', [levelItem(3)])).resolves.toBe(0);
    expect(exec).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('transaction içinde SAVEPOINT ile yalıtılır; hata → ROLLBACK TO SAVEPOINT (dış tx kurtulur)', async () => {
    const { db, exec } = makeDb({
      tx: true,
      createMany: jest.fn(async () => { throw new Error('relation "CustomerMoment" does not exist'); }),
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordMoments(db as never, 'u1', [levelItem(3)])).resolves.toBe(0);
    const sql = exec.mock.calls.map((c) => c[0]);
    expect(sql).toEqual([
      'SAVEPOINT qratex_moments',
      'ROLLBACK TO SAVEPOINT qratex_moments',
      'RELEASE SAVEPOINT qratex_moments',
    ]);
    spy.mockRestore();
  });

  it('transaction içinde başarıda SAVEPOINT → RELEASE', async () => {
    const { db, exec } = makeDb({ tx: true });
    await expect(recordMoments(db as never, 'u1', [levelItem(3)])).resolves.toBe(1);
    expect(exec.mock.calls.map((c) => c[0])).toEqual(['SAVEPOINT qratex_moments', 'RELEASE SAVEPOINT qratex_moments']);
  });
});

describe('recordBadgeMoment', () => {
  it('rozet payload + badge:<id> anahtarı', async () => {
    const { db, createMany } = makeDb();
    await recordBadgeMoment(db as never, 'u1', {
      id: 'b9',
      name: 'Kaşif',
      icon: '🧭',
      rarity: 'epic',
      color: '#d946ef',
      hiddenUntilEarned: true,
    });
    expect(createMany.mock.calls[0][0].data[0]).toEqual({
      userId: 'u1',
      kind: 'badge',
      dedupeKey: 'badge:b9',
      payload: { badgeId: 'b9', name: 'Kaşif', icon: '🧭', rarity: 'epic', color: '#d946ef', hidden: true },
    });
  });

  it('eksik alanlarda güvenli varsayılanlar', async () => {
    const { db, createMany } = makeDb();
    await recordBadgeMoment(db as never, 'u1', { id: 'b1', name: 'X' });
    expect(createMany.mock.calls[0][0].data[0].payload).toEqual({
      badgeId: 'b1', name: 'X', icon: '', rarity: 'common', color: null, hidden: false,
    });
  });
});

describe('lig yükselme algılama', () => {
  const rules = DEFAULT_LEAGUE_RULES;

  it('sınır: 2999 → 3000 Başlangıç→Kor', () => {
    const up = detectLeagueUp(2999, 3000, rules);
    expect(up?.from.key).toBe('BASLANGIC');
    expect(up?.to.key).toBe('KOR');
  });

  it('aynı lig içinde hareket → yok; azalma → yok', () => {
    expect(detectLeagueUp(3000, 5000, rules)).toBeNull();
    expect(detectLeagueUp(6000, 4000, rules)).toBeNull();
  });

  it('çoklu lig atlama → tek an, en üst lig', () => {
    expect(detectLeagueUp(100, 12_000, rules)?.to.key).toBe('SAVASCI');
  });

  it('son kademe açık uçlu: 100.000 üstü sahte yükselme/düşme yok', () => {
    expect(leagueIndexAt(250_000, rules)).toBe(rules.length - 1);
    expect(detectLeagueUp(99_990, 100_500, rules)).toBeNull();
    expect(detectLeagueUp(29_000, 150_000, rules)?.to.key).toBe('ZENOR');
  });

  it('sırasız kurallar da doğru sıralanır', () => {
    const shuffled = [...rules].reverse();
    expect(detectLeagueUp(2999, 3000, shuffled)?.to.key).toBe('KOR');
  });
});

describe('captureCreditMoments', () => {
  it('seviye + lig birlikte yazılır (sezonlu lig anahtarı)', async () => {
    const { db, createMany } = makeDb();
    const n = await captureCreditMoments(db as never, {
      userId: 'u1',
      pointsAdded: 50,
      pointsAfter: 3010,
      xpAfter: 900,
      levelBefore: 2,
      levelAfter: 3,
      isLevelUp: true,
    });
    expect(n).toBe(2);
    const data = createMany.mock.calls[0][0].data;
    expect(data).toEqual([
      { userId: 'u1', kind: 'level_up', dedupeKey: 'level:3', payload: { from: 2, to: 3, xp: 900 } },
      {
        userId: 'u1',
        kind: 'league_up',
        dedupeKey: 'league:s0:KOR',
        payload: { fromKey: 'BASLANGIC', fromName: 'Başlangıç', toKey: 'KOR', toName: 'Kor', points: 3010 },
      },
    ]);
  });

  it('harcayıp tekrar yükselince aynı anahtar üretilir → DB tekilliği ikinci kutlamayı engeller', async () => {
    const { db, createMany } = makeDb();
    const ctx = { userId: 'u1', pointsAdded: 20, pointsAfter: 3005, xpAfter: 1, levelBefore: 1, levelAfter: 1, isLevelUp: false };
    await captureCreditMoments(db as never, ctx);
    await captureCreditMoments(db as never, ctx);
    const keys = createMany.mock.calls.map((c) => c[0].data[0].dedupeKey);
    expect(keys).toEqual(['league:s0:KOR', 'league:s0:KOR']);
    expect(createMany.mock.calls.every((c) => c[0].skipDuplicates === true)).toBe(true);
  });

  it('yarışı kaybeden çağrı (isLevelUp=false) seviye anı yazmaz; değişim yoksa hiç yazım yok', async () => {
    const { db, createMany } = makeDb();
    await captureCreditMoments(db as never, {
      userId: 'u1', pointsAdded: 10, pointsAfter: 500, xpAfter: 99, levelBefore: 2, levelAfter: 3, isLevelUp: false,
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('lig kuralları okunamazsa varsayılanlarla devam eder, fırlatmaz', async () => {
    const { db, createMany } = makeDb();
    mockSettingsFindUnique.mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      captureCreditMoments(db as never, {
        userId: 'u1', pointsAdded: 10, pointsAfter: 3001, xpAfter: 1, levelBefore: 1, levelAfter: 1, isLevelUp: false,
      })
    ).resolves.toBe(1);
    expect(createMany.mock.calls[0][0].data[0].dedupeKey).toBe('league:s0:KOR');
    warn.mockRestore();
  });

  it("lig kuralları kredi transaction'ından DEĞİL kök istemciden (cache'li) okunur", async () => {
    const { db } = makeDb({ tx: true });
    const ctx = { userId: 'u1', pointsAdded: 10, pointsAfter: 3001, xpAfter: 1, levelBefore: 1, levelAfter: 1, isLevelUp: false };
    await captureCreditMoments(db as never, ctx);
    await captureCreditMoments(db as never, ctx);
    expect((db.settings as { findUnique: jest.Mock }).findUnique).not.toHaveBeenCalled();
    // İkinci çağrı cache'ten: kök istemciye tek sorgu.
    expect(mockSettingsFindUnique).toHaveBeenCalledTimes(1);
  });

  it('admin lig eşiklerini değiştirdiyse yeni kurallar kullanılır', async () => {
    mockSettingsFindUnique.mockResolvedValue({
      value: DEFAULT_LEAGUE_RULES.map((r) => (r.key === 'KOR' ? { ...r, minPoints: 500 } : r)),
    });
    const { db, createMany } = makeDb();
    await captureCreditMoments(db as never, {
      userId: 'u1', pointsAdded: 10, pointsAfter: 505, xpAfter: 1, levelBefore: 1, levelAfter: 1, isLevelUp: false,
    });
    expect(createMany.mock.calls[0][0].data[0].dedupeKey).toBe('league:s0:KOR');
  });
});

describe('creditPointsAndXp → an yakalama', () => {
  function walletDb(updated: { points: number; xp: number; level: number }, bumpCount: number, createMany?: jest.Mock) {
    const { db, createMany: cm } = makeDb({ tx: true, createMany });
    db.user = {
      update: jest.fn(async () => ({ id: 'u1', ...updated })),
      updateMany: jest.fn(async () => ({ count: bumpCount })),
    };
    return { db, createMany: cm };
  }

  it('seviye bump eden kredi level_up anı yazar; dönüş tipi aynı', async () => {
    const xp = 100_000;
    const to = calculateLevel(xp);
    const { db, createMany } = walletDb({ points: 10, xp, level: 1 }, 1);
    const res = await creditPointsAndXp(db as never, { userId: 'u1', xp });
    expect(res).toEqual({ id: 'u1', points: 10, xp, level: to, isLevelUp: true });
    const data = createMany.mock.calls[0][0].data;
    expect(data[0]).toMatchObject({ kind: 'level_up', dedupeKey: `level:${to}`, payload: { from: 1, to, xp } });
  });

  it('an tablosu yoksa/yazım patlarsa kredi YİNE başarılı (kazanım bozulmaz)', async () => {
    const xp = 100_000;
    const { db, exec } = (() => {
      const w = walletDb({ points: 3001, xp, level: 1 }, 1, jest.fn(async () => { throw new Error('relation does not exist'); }));
      return { db: w.db, exec: w.db.$executeRawUnsafe as jest.Mock };
    })();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await creditPointsAndXp(db as never, { userId: 'u1', points: 10, xp });
    expect(res.isLevelUp).toBe(true);
    expect(exec.mock.calls.map((c) => c[0])).toContain('ROLLBACK TO SAVEPOINT qratex_moments');
    spy.mockRestore();
  });

  it('seviye/lig değişmeyen sıradan kredi an yazmaz', async () => {
    const { db, createMany } = walletDb({ points: 150, xp: 5, level: 1 }, 0);
    await creditPointsAndXp(db as never, { userId: 'u1', points: 10, xp: 5 });
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('cleanupMoments', () => {
  it('görülmüş 30 gün (seenAt), görülmemiş 90 gün (createdAt)', async () => {
    const deleteMany = jest.fn(async () => ({ count: 1 }));
    const now = new Date('2026-10-08T00:00:00Z');
    const res = await cleanupMoments({ customerMoment: { deleteMany } } as never, now);
    expect(res).toEqual({ seen: 1, unseen: 1 });
    expect(deleteMany).toHaveBeenNthCalledWith(1, {
      where: { seenAt: { not: null, lt: new Date('2026-09-08T00:00:00Z') } },
    });
    expect(deleteMany).toHaveBeenNthCalledWith(2, {
      where: { seenAt: null, createdAt: { lt: new Date('2026-07-10T00:00:00Z') } },
    });
  });
});
