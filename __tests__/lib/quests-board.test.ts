/**
 * Görevler (m-gorevler) — dönem döngüsü, canlı ilerleme, pano DTO'su ve claim tek-sefer guard'ı.
 * Gerçek DB'ye GİDİLMEZ (sahte Prisma istemcisi).
 */
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getQuestReward: (reward: { points?: number; xp?: number } | null) => ({
    points: reward?.points ?? 10,
    xp: reward?.xp ?? 5,
  }),
}));
const mockActiveSeason = jest.fn();
jest.mock('@/lib/seasonal-campaign-live', () => ({ getActiveSeasonalCampaign: (...a: unknown[]) => mockActiveSeason(...a) }));

import { getQuestPeriod, istanbulDayKey, questPeriodKind, rewardedInPeriod, progressWindow } from '@/lib/quests/period';
import { computeActivityStreak } from '@/lib/quests/activity-streak';
import { countMechanicProgress, parseRequirement, resolveMechanic } from '@/lib/quests/mechanics';
import { getQuestBoard, questIconOf } from '@/lib/quests/board';
import { claimAllQuests, claimQuest, QuestClaimError } from '@/lib/quests/claim';

// 2026-10-10 Cumartesi 00:30 İstanbul = 2026-10-09T21:30Z
const NOW = new Date('2026-10-09T21:30:00.000Z');

describe('period (Europe/Istanbul)', () => {
  it('günlük dönem İstanbul gece yarısında başlar (UTC değil)', () => {
    const p = getQuestPeriod('daily', NOW);
    expect(p.key).toBe('d:2026-10-10');
    expect(p.start.toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(p.end!.toISOString()).toBe('2026-10-10T21:00:00.000Z');
    expect(istanbulDayKey(NOW)).toBe('2026-10-10');
  });

  it('haftalık dönem pazartesi 00:00, aylık dönem ayın 1’i', () => {
    const w = getQuestPeriod('weekly', NOW);
    expect(w.key).toBe('w:2026-10-05');
    expect(w.start.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(w.end!.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    const m = getQuestPeriod('monthly', NOW);
    expect(m.key).toBe('m:2026-10');
    expect(m.start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(m.end!.toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });

  it('ay/yıl taşması normalleşir', () => {
    const p = getQuestPeriod('daily', new Date('2026-12-31T22:00:00.000Z')); // 1 Ocak 01:00 İstanbul
    expect(p.key).toBe('d:2027-01-01');
    expect(getQuestPeriod('monthly', new Date('2026-12-15T10:00:00Z')).end!.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });

  it('tür → dönem; otomatik ödenen görev hep tek seferlik', () => {
    expect(questPeriodKind('DAILY')).toBe('daily');
    expect(questPeriodKind('weekly')).toBe('weekly');
    expect(questPeriodKind('special')).toBe('once');
    expect(questPeriodKind('mystery')).toBe('once');
    expect(questPeriodKind('daily', { autoReward: true })).toBe('once');
  });

  it('bu dönemde ödendi mi', () => {
    const p = getQuestPeriod('daily', NOW);
    expect(rewardedInPeriod(new Date('2026-10-09T20:59:00Z'), p)).toBe(false); // dün 23:59
    expect(rewardedInPeriod(new Date('2026-10-09T21:10:00Z'), p)).toBe(true);
    expect(rewardedInPeriod(new Date('2020-01-01T00:00:00Z'), getQuestPeriod('once', NOW))).toBe(true);
    expect(rewardedInPeriod(null, p)).toBe(false);
  });

  it('tek seferlik görevin penceresi yayın anından bitişe', () => {
    const created = new Date('2026-10-01T00:00:00Z');
    const expires = new Date('2026-10-05T00:00:00Z');
    const w = progressWindow(getQuestPeriod('once', NOW), { createdAt: created, expiresAt: expires }, NOW);
    expect(w).toEqual({ from: created, to: expires });
  });
});

describe('computeActivityStreak', () => {
  it('bugün yorum yoksa seri 0’a düşmez, risk altındadır', () => {
    const days = new Set(['2026-10-09', '2026-10-08', '2026-10-07']);
    const s = computeActivityStreak(days, NOW);
    expect(s).toMatchObject({ current: 3, activeToday: false, atRisk: true });
  });

  it('ilk boşlukta durur; eski seri mevcut serinin üzerine yazılmaz', () => {
    const days = new Set(['2026-10-10', '2026-10-08', '2026-10-07']);
    const s = computeActivityStreak(days, NOW);
    expect(s.current).toBe(1);
    expect(s.activeToday).toBe(true);
    expect(s.atRisk).toBe(false);
    expect(s.bestInWindow).toBe(2);
  });

  it('dün de bugün de yoksa seri 0', () => {
    expect(computeActivityStreak(new Set(['2026-10-07']), NOW)).toMatchObject({ current: 0, atRisk: false });
  });
});

describe('mechanics', () => {
  it('mekanik çözümü', () => {
    expect(resolveMechanic({ id: 'quest-color-wizard', requirement: { count: 1 } })).toBe('achievement');
    expect(resolveMechanic({ id: 'q', requirement: { type: 'visit_category', count: 3 } })).toBe('visit_category');
    expect(resolveMechanic({ id: 'q', requirement: { type: 'GIVE_FEEDBACK', count: 3 } })).toBe('give_feedback');
    expect(resolveMechanic({ id: 'q', requirement: { type: 'custom', count: 3 } })).toBe('custom');
    expect(parseRequirement({ count: -2 }).count).toBe(1);
  });

  const window = { from: new Date('2026-10-09T21:00:00Z'), to: NOW };

  it('geri bildirim = QR geri bildirimi + tüketim yorumu (silinmişler hariç)', async () => {
    const db = {
      feedback: { count: jest.fn(async () => 2) },
      consumptionReview: { count: jest.fn(async () => 1) },
    };
    await expect(countMechanicProgress(db as never, 'u1', 'give_feedback', window)).resolves.toBe(3);
    expect(db.feedback.count).toHaveBeenCalledWith({
      where: { userId: 'u1', deletedAt: null, createdAt: { gte: window.from, lt: window.to } },
    });
  });

  it('fotoğraflı ve ayrıntılı yorum sayımı', async () => {
    const db = {
      feedback: {
        findMany: jest.fn(async (args: { select: Record<string, unknown> }) =>
          'media' in args.select
            ? [{ media: ['a.jpg'] }, { media: [] }, { media: null }]
            : [{ text: 'x'.repeat(120) }, { text: 'kısa' }],
        ),
      },
      consumptionReview: { findMany: jest.fn(async () => [{ text: 'y'.repeat(100) }]) },
    };
    await expect(countMechanicProgress(db as never, 'u1', 'feedback_with_photo', window)).resolves.toBe(1);
    await expect(countMechanicProgress(db as never, 'u1', 'detailed_feedback', window)).resolves.toBe(2);
  });

  it('farklı işletme: geri bildirim + tüketim birleşik ve tekil', async () => {
    const db = {
      feedback: { findMany: jest.fn(async () => [{ qrCode: { dealerId: 'd1' } }, { qrCode: { dealerId: 'd2' } }]) },
      consumption: { findMany: jest.fn(async () => [{ dealerId: 'd2' }, { dealerId: 'd3' }]) },
    };
    await expect(countMechanicProgress(db as never, 'u1', 'visit_businesses', window)).resolves.toBe(3);
  });

  it('boş pencere sorgu atmaz', async () => {
    const db = { feedback: { count: jest.fn() }, consumptionReview: { count: jest.fn() } };
    await expect(
      countMechanicProgress(db as never, 'u1', 'give_feedback', { from: NOW, to: NOW }),
    ).resolves.toBe(0);
    expect(db.feedback.count).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── Pano ─────────────────────────────

type UQ = { id: string; progress: number; completedAt: Date | null; rewardedAt: Date | null };
function quest(over: Partial<{ id: string; type: string; requirement: unknown; reward: unknown; expiresAt: Date | null; users: UQ[]; icon: string }>) {
  return {
    id: 'q',
    name: 'Görev',
    description: 'Açıklama',
    icon: '🎯',
    type: 'daily',
    requirement: { type: 'give_feedback', count: 1 },
    reward: { points: 50, xp: 25 },
    expiresAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    users: [] as UQ[],
    ...over,
  };
}

function boardDb(rows: unknown[], counts: { feedback?: number; review?: number } = {}) {
  return {
    quest: { findMany: jest.fn(async () => rows) },
    auditLog: { findMany: jest.fn(async () => []) },
    feedback: { count: jest.fn(async () => counts.feedback ?? 0), findMany: jest.fn(async () => []) },
    consumptionReview: { count: jest.fn(async () => counts.review ?? 0), findMany: jest.fn(async () => []) },
    consumption: { findMany: jest.fn(async () => []) },
    referral: { count: jest.fn(async () => 0) },
    user: { findUnique: jest.fn(async () => ({ points: 1200 })) },
    seasonalCampaign: { findUnique: jest.fn() },
  };
}

beforeEach(() => {
  mockActiveSeason.mockReset().mockResolvedValue(null);
  mockMint.mockReset().mockResolvedValue({
    credited: 50,
    xpCredited: 25,
    duplicate: false,
    points: 1250,
    xp: 525,
    level: 3,
    isLevelUp: false,
    ledgerId: 'l1',
  });
});

describe('getQuestBoard', () => {
  it('dünkü ödülü alınmış günlük görev bugün yeniden alınabilir (dönem sıfırlaması)', async () => {
    const db = boardDb(
      [quest({ id: 'daily', users: [{ id: 'uq1', progress: 1, completedAt: new Date('2026-10-09T10:00:00Z'), rewardedAt: new Date('2026-10-09T10:00:00Z') }] })],
      { feedback: 1 },
    );
    const board = await getQuestBoard('u1', NOW, db as never);
    expect(board.quests[0]).toMatchObject({ id: 'daily', state: 'claimable', progress: 1, target: 1, group: 'daily', period: 'daily' });
    expect(board.summary.pending).toEqual({ count: 1, points: 50, xp: 25 });
    expect(board.balance).toBe(1200);
  });

  it('bugün ilerleme yoksa sıfırdan başlar ve CTA verir', async () => {
    const db = boardDb([quest({ id: 'daily' })]);
    const board = await getQuestBoard('u1', NOW, db as never);
    expect(board.quests[0]).toMatchObject({ state: 'in_progress', progress: 0, cta: { kind: 'scan', href: '/customer/scan' } });
  });

  it('bu dönem alınmışsa "claimed"', async () => {
    const db = boardDb(
      [quest({ users: [{ id: 'uq1', progress: 1, completedAt: NOW, rewardedAt: new Date('2026-10-09T21:10:00Z') }] })],
      { feedback: 3 },
    );
    const board = await getQuestBoard('u1', NOW, db as never);
    expect(board.quests[0].state).toBe('claimed');
    expect(board.summary.pending.count).toBe(0);
  });

  it('otomatik ödenen görev tamamlanınca "auto_rewarded" — claim YOK (B2)', async () => {
    const db = boardDb([
      quest({ id: 'quest-color-wizard', type: 'SPECIAL', requirement: { count: 1 }, users: [{ id: 'uq', progress: 1, completedAt: NOW, rewardedAt: null }] }),
    ]);
    const board = await getQuestBoard('u1', NOW, db as never);
    expect(board.quests[0]).toMatchObject({ state: 'auto_rewarded', rewardMode: 'auto', group: 'season' });
    expect(board.summary.pending.count).toBe(0);
  });

  it('manuel mekanik ilerleme satırı yoksa gösterilmez; süresi dolmuş tamamlanmamış görev düşer', async () => {
    const db = boardDb([
      quest({ id: 'custom', requirement: { type: 'custom', count: 2 } }),
      quest({ id: 'old', type: 'special', expiresAt: new Date('2026-10-09T20:00:00Z') }),
    ]);
    const board = await getQuestBoard('u1', NOW, db as never);
    expect(board.quests).toHaveLength(0);
  });

  it('DTO iç alanları sızdırmaz', async () => {
    const db = boardDb([quest({ users: [{ id: 'uq-secret', progress: 0, completedAt: null, rewardedAt: null }] })]);
    const board = await getQuestBoard('u1', NOW, db as never);
    const json = JSON.stringify(board);
    expect(json).not.toContain('uq-secret');
    expect(json).not.toContain('_count');
    expect(Object.keys(board.quests[0])).not.toContain('users');
  });

  it('görev ikonu: emoji, yerel görsel, boş', () => {
    expect(questIconOf('🎨')).toEqual({ kind: 'emoji', value: '🎨' });
    expect(questIconOf('/images/badges/YANKI.svg')).toEqual({ kind: 'image', src: '/images/badges/YANKI.svg' });
    expect(questIconOf('')).toEqual({ kind: 'none' });
  });
});

// ───────────────────────────── Claim ─────────────────────────────

function claimDb(opts: {
  quest: unknown;
  feedback?: number;
  fresh?: Partial<UQ>;
  guardCount?: number;
  legacy?: boolean;
}) {
  const tx = {
    $queryRaw: jest.fn(async () => []),
    userQuest: {
      findUnique: jest.fn(async () => ({ progress: 0, completedAt: null, rewardedAt: null, ...opts.fresh })),
      updateMany: jest.fn(async () => ({ count: opts.guardCount ?? 1 })),
    },
    auditLog: { findFirst: jest.fn(async () => (opts.legacy ? { id: 'a' } : null)), create: jest.fn() },
    notification: { create: jest.fn() },
  };
  const db = {
    quest: { findFirst: jest.fn(async () => opts.quest), findMany: jest.fn(async () => (opts.quest ? [opts.quest] : [])) },
    userQuest: { upsert: jest.fn(async () => ({ id: 'uq1' })), findUnique: jest.fn() },
    feedback: { count: jest.fn(async () => opts.feedback ?? 0) },
    consumptionReview: { count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { db, tx };
}

describe('claimQuest', () => {
  it('günlük görev: dönem guard’ı + dönem anahtarlı defter + audit', async () => {
    const { db, tx } = claimDb({ quest: quest({ id: 'daily' }), feedback: 1 });
    const res = await claimQuest('u1', 'daily', { db: db as never, now: NOW });
    expect(res.claimed).toEqual([{ questId: 'daily', name: 'Görev', points: 50, xp: 25 }]);
    expect(res.balance).toBe(1250);
    const guard = (tx.userQuest.updateMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0];
    expect(guard.where).toMatchObject({
      id: 'uq1',
      userId: 'u1',
      OR: [{ rewardedAt: null }, { rewardedAt: { lt: new Date('2026-10-09T21:00:00.000Z') } }],
    });
    expect(mockMint).toHaveBeenCalledWith(tx, expect.objectContaining({ source: 'quest', idempotencyKey: 'quest:uq1:d:2026-10-10', points: 50, xp: 25 }));
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('tek seferlik görev eski claim ucuyla aynı anahtarı kullanır (rewardedAt null guard’ı)', async () => {
    const { db, tx } = claimDb({ quest: quest({ id: 'sp', type: 'special', requirement: { type: 'referral', count: 1 } }) });
    (db as unknown as { referral: unknown }).referral = { count: jest.fn(async () => 1) };
    await claimQuest('u1', 'sp', { db: db as never, now: NOW });
    const guard = (tx.userQuest.updateMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0];
    expect(guard.where).toEqual({ id: 'uq1', userId: 'u1', rewardedAt: null });
    expect(mockMint).toHaveBeenCalledWith(tx, expect.objectContaining({ idempotencyKey: 'quest:uq1' }));
  });

  it('otomatik ödenen görev claim edilemez', async () => {
    const { db } = claimDb({ quest: quest({ id: 'quest-gift-master', type: 'SPECIAL', requirement: { count: 1 } }) });
    await expect(claimQuest('u1', 'quest-gift-master', { db: db as never, now: NOW })).rejects.toMatchObject({ code: 'QUEST_AUTO_REWARDED' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('ilerleme sunucuda yeniden sayılır: tamamlanmadıysa ödeme yok', async () => {
    const { db } = claimDb({ quest: quest({ id: 'daily' }), feedback: 0 });
    await expect(claimQuest('u1', 'daily', { db: db as never, now: NOW })).rejects.toMatchObject({ code: 'QUEST_NOT_COMPLETED' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('eşzamanlı ikinci istek guard’a takılır (count 0 → ödeme yok)', async () => {
    const { db } = claimDb({ quest: quest({ id: 'daily' }), feedback: 1, guardCount: 0 });
    await expect(claimQuest('u1', 'daily', { db: db as never, now: NOW })).rejects.toBeInstanceOf(QuestClaimError);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('bu dönem alınmışsa ya da eski audit varsa ödeme yok', async () => {
    const a = claimDb({ quest: quest({ id: 'daily' }), feedback: 1, fresh: { rewardedAt: new Date('2026-10-09T21:05:00Z') } });
    await expect(claimQuest('u1', 'daily', { db: a.db as never, now: NOW })).rejects.toMatchObject({ code: 'QUEST_ALREADY_CLAIMED' });
    const b = claimDb({ quest: quest({ id: 'daily' }), feedback: 1, legacy: true });
    await expect(claimQuest('u1', 'daily', { db: b.db as never, now: NOW })).rejects.toMatchObject({ code: 'QUEST_ALREADY_CLAIMED' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('defter anahtarı zaten varsa (duplicate) bayrak geri alınır', async () => {
    mockMint.mockResolvedValueOnce({ duplicate: true, credited: 0, xpCredited: 0, points: 1, xp: 1, level: 1, isLevelUp: false });
    const { db } = claimDb({ quest: quest({ id: 'daily' }), feedback: 1 });
    await expect(claimQuest('u1', 'daily', { db: db as never, now: NOW })).rejects.toMatchObject({ code: 'QUEST_ALREADY_CLAIMED' });
  });

  it('süresi + 24 saatlik ödül penceresi dolan görev', async () => {
    const { db } = claimDb({ quest: quest({ id: 'sp', type: 'special', expiresAt: new Date('2026-10-08T00:00:00Z') }) });
    await expect(claimQuest('u1', 'sp', { db: db as never, now: NOW })).rejects.toMatchObject({ code: 'QUEST_EXPIRED' });
  });

  it('bulunamayan görev', async () => {
    const { db } = claimDb({ quest: null });
    await expect(claimQuest('u1', 'x', { db: db as never, now: NOW })).rejects.toMatchObject({ code: 'QUEST_NOT_FOUND', status: 404 });
  });
});

describe('claimAllQuests', () => {
  it('tamamlanmamışları sessizce atlar, alınabilir olanları öder', async () => {
    const done = quest({ id: 'a' });
    const { db } = claimDb({ quest: done, feedback: 1 });
    db.quest.findMany = jest.fn(async () => [
      { ...done, users: [] },
      { ...quest({ id: 'auto', requirement: { type: 'visit_category', count: 2 } }), users: [] },
    ]);
    const res = await claimAllQuests('u1', { db: db as never, now: NOW });
    expect(res.claimed.map((c) => c.questId)).toEqual(['a']);
    expect(res.totals).toEqual({ points: 50, xp: 25 });
    expect(res.skipped).toEqual([]);
  });
});
