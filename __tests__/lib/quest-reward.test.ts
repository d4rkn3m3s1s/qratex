/**
 * P0-15 — görev ödülü tek seferlik (UserQuest.rewardedAt + rewardQuestOnce).
 *
 * Saldırı/hata senaryoları (eski):
 *  1. Ziyaret ya da başarım görevi tamamlanınca OTOMATİK ödeniyor, sonra claim ucu aynı görevi
 *     ikinci kez ödüyordu (yalnız CLAIM_QUEST_REWARD audit'ine bakıyordu).
 *  2. Başarım ilerlemesinde `completedAt: null` guard'ı yoktu → eşzamanlı iki çağrı çift ödeme.
 * Gerçek DB'ye GİDİLMEZ.
 */
import { NextRequest } from 'next/server';

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
}));

const mockTransaction = jest.fn();
const prismaMock: Record<string, unknown> = {
  $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const mockGetServerSession = jest.fn();
// requireAuth DB oturum durumunu (askı, oturum sürümü, güncel rol) okur; bu test yalnız uç
// mantığını sınar → kimlik, taklit oturumdan türetilen requireAuth sonucu ile verilir.
jest.mock('@/lib/api-auth', () => ({
  requireAuth: async (roles: string[]) => {
    const s = (await mockGetServerSession()) as { user?: { id?: string; role?: string } } | null;
    if (!s?.user?.id) return { error: new Response(JSON.stringify({ error: 'Oturum yok' }), { status: 401 }) };
    if (!roles.includes(String(s.user.role))) return { error: new Response(JSON.stringify({ error: 'Yetki yok' }), { status: 403 }) };
    return { session: s };
  },
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn(async () => ({ cached: false, key: null })),
  storeIdempotency: jest.fn(),
}));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({}) }));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getQuestReward: (reward: { points?: number; xp?: number }) => ({ points: reward?.points ?? 0, xp: reward?.xp ?? 0 }),
}));
jest.mock('@/lib/gamification-ab', () => ({ getVariant: jest.fn(async () => null) }));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => null) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

import { isAutoRewardQuest, rewardQuestOnce, ACHIEVEMENT_QUEST_IDS } from '@/lib/quests/reward';

beforeEach(() => {
  mockMint.mockReset().mockResolvedValue({
    credited: 100,
    xpCredited: 50,
    duplicate: false,
    points: 1100,
    xp: 50,
    level: 1,
    isLevelUp: false,
  });
  mockTransaction.mockReset();
  mockGetServerSession.mockReset().mockResolvedValue({ user: { id: 'u1', role: 'CUSTOMER' } });
});

describe('isAutoRewardQuest', () => {
  it('ziyaret görevleri ve başarım görevleri otomatik ödenir; diğerleri claim edilir', () => {
    expect(isAutoRewardQuest({ id: 'q1', requirement: { type: 'visit_category', count: 3 } })).toBe(true);
    for (const id of ACHIEVEMENT_QUEST_IDS) expect(isAutoRewardQuest({ id, requirement: { count: 1 } })).toBe(true);
    expect(isAutoRewardQuest({ id: 'q2', requirement: { type: 'give_feedback', count: 3 } })).toBe(false);
    expect(isAutoRewardQuest({ id: 'q3', requirement: null })).toBe(false);
  });
});

describe('rewardQuestOnce', () => {
  function tx(count: number) {
    return { userQuest: { updateMany: jest.fn(async () => ({ count })) } };
  }

  it('rewardedAt null → guard’lı geçiş + mintPoints (quest:<id> anahtarı)', async () => {
    const t = tx(1);
    const r = await rewardQuestOnce(t as never, {
      userQuestId: 'uq1',
      userId: 'u1',
      questId: 'q1',
      points: 100,
      xp: 50,
      source: 'quest',
    });
    expect(r).toMatchObject({ rewarded: true, credited: 100, xpCredited: 50 });
    const where = (t.userQuest.updateMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ id: 'uq1', userId: 'u1', rewardedAt: null });
    expect(where).not.toHaveProperty('completedAt');
    expect(mockMint).toHaveBeenCalledWith(t, expect.objectContaining({ idempotencyKey: 'quest:uq1', source: 'quest' }));
  });

  it('ikinci çağrı (count=0) → kredi YOK', async () => {
    const r = await rewardQuestOnce(tx(0) as never, {
      userQuestId: 'uq1',
      userId: 'u1',
      questId: 'q1',
      points: 100,
      xp: 50,
      source: 'quest',
    });
    expect(r).toEqual({ rewarded: false });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('otomatik yollar requireIncomplete ile eski (ödenmiş, rewardedAt=null) satırı tekrar ödemez', async () => {
    const t = tx(0);
    await rewardQuestOnce(t as never, {
      userQuestId: 'uq1',
      userId: 'u1',
      questId: 'q1',
      points: 100,
      xp: 0,
      source: 'visit_mission',
      requireIncomplete: true,
    });
    const where = (t.userQuest.updateMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ rewardedAt: null, completedAt: null });
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('POST /api/gamification/quests/[id]/claim', () => {
  type Opts = {
    quest?: Record<string, unknown> | null;
    userQuest?: Record<string, unknown> | null;
    legacyAudit?: boolean;
    updateCount?: number;
  };
  function claimTx(o: Opts) {
    const uq = o.userQuest === undefined ? { id: 'uq1', progress: 3, completedAt: null, rewardedAt: null } : o.userQuest;
    return {
      quest: {
        findUnique: jest.fn(async () =>
          o.quest === undefined
            ? { id: 'q1', name: 'Görev', reward: { points: 100, xp: 50 }, requirement: { type: 'give_feedback', count: 3 }, isActive: true, archivedAt: null, expiresAt: null }
            : o.quest
        ),
      },
      userQuest: {
        findUnique: jest.fn(async () => uq),
        updateMany: jest.fn(async () => ({ count: o.updateCount ?? 1 })),
      },
      $queryRaw: jest.fn(async () => []),
      auditLog: {
        findFirst: jest.fn(async () => (o.legacyAudit ? { id: 'a0' } : null)),
        create: jest.fn(async () => ({})),
      },
      notification: { create: jest.fn(async () => ({})) },
      analyticsEvent: { create: jest.fn(async () => ({})) },
    };
  }

  async function claim(o: Opts) {
    const t = claimTx(o);
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(t));
    const { POST } = await import('@/app/api/gamification/quests/[id]/claim/route');
    const req = new NextRequest('http://localhost/api/gamification/quests/q1/claim', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'q1' }) });
    return { res, body: await res.json(), t };
  }

  it('manuel görev: tek ödeme, rewardQuestOnce + audit', async () => {
    const { res, body, t } = await claim({});
    expect(res.status).toBe(200);
    expect(body.data.userPoints).toBe(1100);
    expect(mockMint).toHaveBeenCalledTimes(1);
    expect(t.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CLAIM_QUEST_REWARD' }) }));
  });

  it('otomatik ödenen ziyaret görevi claim edilemez (çift ödeme senaryosu) → 409, kredi yok', async () => {
    const { res, body } = await claim({
      quest: { id: 'q1', name: 'Ziyaret', reward: { points: 100 }, requirement: { type: 'visit_category', count: 2 }, isActive: true, archivedAt: null, expiresAt: null },
      userQuest: { id: 'uq1', progress: 2, completedAt: new Date(), rewardedAt: null },
    });
    expect(res.status).toBe(409);
    expect(body.code).toBe('QUEST_AUTO_REWARDED');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('otomatik ödenen başarım görevi claim edilemez → 409', async () => {
    const { res } = await claim({
      quest: { id: 'quest-gift-master', name: 'Hediye', reward: { points: 100 }, requirement: { count: 1 }, isActive: true, archivedAt: null, expiresAt: null },
    });
    expect(res.status).toBe(409);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('rewardedAt dolu → 409, kredi yok', async () => {
    const { res, body } = await claim({ userQuest: { id: 'uq1', progress: 3, completedAt: new Date(), rewardedAt: new Date() } });
    expect(res.status).toBe(409);
    expect(body.code).toBe('QUEST_ALREADY_CLAIMED');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('geçiş dönemi: eski CLAIM_QUEST_REWARD audit’i olan satır tekrar ödenmez', async () => {
    const { res } = await claim({ legacyAudit: true });
    expect(res.status).toBe(409);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('eşzamanlı ikinci claim (guard count=0) → 409, kredi yok', async () => {
    const { res } = await claim({ updateCount: 0 });
    expect(res.status).toBe(409);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('arşivlenmiş görev → 404', async () => {
    const { res } = await claim({
      quest: { id: 'q1', name: 'G', reward: {}, requirement: { count: 1 }, isActive: true, archivedAt: new Date(), expiresAt: null },
    });
    expect(res.status).toBe(404);
  });
});

describe('advanceAchievementProgress (yarış güvenliği)', () => {
  function achTx(fresh: { progress: number; completedAt: Date | null }, updateCount = 1) {
    return {
      $queryRaw: jest.fn(async () => []),
      userQuest: {
        findUnique: jest.fn(async () => fresh),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: updateCount })),
      },
      notification: { create: jest.fn(async () => ({})) },
      auditLog: { create: jest.fn(async () => ({})) },
    };
  }

  beforeEach(() => {
    prismaMock.quest = {
      findUnique: jest.fn(async () => ({
        id: 'quest-gift-master',
        name: 'Hediye Ustası',
        description: 'Hediye ver',
        requirement: { count: 1 },
        reward: { points: 100, xp: 200 },
        archivedAt: null,
      })),
    };
    prismaMock.userQuest = { upsert: jest.fn(async () => ({ id: 'uq1', completedAt: null })) };
  });

  it('kilit altında hedefe ulaşınca TEK ödeme', async () => {
    const t = achTx({ progress: 0, completedAt: null });
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(t));
    const { advanceAchievementProgress } = await import('@/lib/achievements');
    await advanceAchievementProgress('u1', 'quest-gift-master');
    expect(t.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockMint).toHaveBeenCalledTimes(1);
    expect(mockMint).toHaveBeenCalledWith(t, expect.objectContaining({ idempotencyKey: 'quest:uq1', source: 'achievement' }));
  });

  it('kilit sonrası satır zaten tamamlanmış (eşzamanlı çağrı ödedi) → ödeme yok', async () => {
    const t = achTx({ progress: 1, completedAt: new Date() });
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(t));
    const { advanceAchievementProgress } = await import('@/lib/achievements');
    await advanceAchievementProgress('u1', 'quest-gift-master');
    expect(mockMint).not.toHaveBeenCalled();
    expect(t.notification.create).not.toHaveBeenCalled();
  });

  it('guard yarışı kaybedilirse (count=0) bildirim ve audit de yazılmaz', async () => {
    const t = achTx({ progress: 0, completedAt: null }, 0);
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(t));
    const { advanceAchievementProgress } = await import('@/lib/achievements');
    await advanceAchievementProgress('u1', 'quest-gift-master');
    expect(mockMint).not.toHaveBeenCalled();
    expect(t.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('advanceVisitMissions', () => {
  beforeEach(() => {
    prismaMock.user = { findUnique: jest.fn(async () => ({ businessCategory: 'cafe' })) };
    prismaMock.quest = {
      findMany: jest.fn(async () => [
        { id: 'qv', name: 'Kafe turu', requirement: { type: 'visit_category', count: 2 }, reward: { points: 80, xp: 10 } },
      ]),
    };
    prismaMock.consumption = { findMany: jest.fn(async () => [{ dealerId: 'd1' }, { dealerId: 'd2' }]) };
    prismaMock.notification = { create: jest.fn(async () => ({})) };
  });

  it('eskiden tamamlanıp ödenmiş satır (completedAt dolu, rewardedAt null) tekrar ödenmez', async () => {
    prismaMock.userQuest = { findUnique: jest.fn(async () => ({ id: 'uq1', completedAt: new Date() })) };
    const { advanceVisitMissions } = await import('@/lib/visit-missions');
    const r = await advanceVisitMissions('u1', 'd2');
    expect(r).toEqual({ completed: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('hedefe ulaşınca tek-sefer guard’ıyla (completedAt+rewardedAt null) öder', async () => {
    prismaMock.userQuest = { findUnique: jest.fn(async () => null) };
    const t = {
      userQuest: {
        upsert: jest.fn(async () => ({ id: 'uq9' })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(t));
    const { advanceVisitMissions } = await import('@/lib/visit-missions');
    const r = await advanceVisitMissions('u1', 'd2');
    expect(r).toEqual({ completed: 1 });
    const where = (t.userQuest.updateMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ id: 'uq9', rewardedAt: null, completedAt: null });
    expect(mockMint).toHaveBeenCalledWith(t, expect.objectContaining({ idempotencyKey: 'quest:uq9', source: 'visit_mission', points: 80 }));
  });
});
