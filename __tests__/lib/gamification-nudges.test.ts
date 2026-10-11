/**
 * Oyunlaştırma dürtmeleri (lib/gamification-nudges) — oyunlaştırma-ekonomi D3.
 * Seri tehlikede + açılmamış kutu: İstanbul günü penceresi, tercih kapısı, tekilleştirme,
 * imleçli sayfalama, küme bazlı yazım. Gerçek DB yok.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/login-streak', () => ({
  getLoginStreakMilestones: jest.fn(async () => [
    { days: 3, points: 50 },
    { days: 7, points: 150 },
  ]),
}));

import {
  BOX_NUDGE_KIND,
  STREAK_RISK_KIND,
  nextMilestoneFor,
  runStreakRiskNudges,
  runSurpriseBoxNudges,
  streakRiskMessage,
} from '@/lib/gamification-nudges';

const NOW = new Date('2026-10-11T03:00:00.000Z'); // İstanbul 06:00

function makeDb(opts: {
  users?: Array<{ id: string; loginStreakCount: number; loginStreakClaimedMilestones: unknown; notificationPrefs: unknown }>;
  boxes?: Array<{ id: string; userId: string; title: string; user: { notificationPrefs: unknown } }>;
  existing?: Array<{ userId: string; data: unknown }>;
}) {
  return {
    user: { findMany: jest.fn(async () => opts.users ?? []) },
    userSurpriseBox: { findMany: jest.fn(async () => opts.boxes ?? []) },
    notification: {
      findMany: jest.fn(async () => opts.existing ?? []),
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
  };
}

describe('seri tehlikede', () => {
  it('pencere: son sayılan gün DÜN (İstanbul), seri ≥ 2, uygun müşteri', async () => {
    const db = makeDb({ users: [] });
    await runStreakRiskNudges(db as never, NOW);
    const where = (db.user.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ role: 'CUSTOMER', suspendedAt: null, anonymizedAt: null, isDemo: false, loginStreakCount: { gte: 2 } });
    const w = where.loginStreakLastDay as { gte: Date; lt: Date };
    // İstanbul 2026-10-10 00:00 = 2026-10-09T21:00Z; bugün 2026-10-11 00:00 = 2026-10-10T21:00Z
    expect(w.gte.toISOString()).toBe('2026-10-09T21:00:00.000Z');
    expect(w.lt.toISOString()).toBe('2026-10-10T21:00:00.000Z');
  });

  it('tercihi kapalı ve bugün zaten dürtülen atlanır; kalanlara sıradaki taşla tek toplu yazım', async () => {
    const db = makeDb({
      users: [
        { id: 'a', loginStreakCount: 2, loginStreakClaimedMilestones: [], notificationPrefs: null },
        { id: 'b', loginStreakCount: 5, loginStreakClaimedMilestones: [3], notificationPrefs: { reminder: { app: false } } },
        { id: 'c', loginStreakCount: 6, loginStreakClaimedMilestones: [3], notificationPrefs: null },
        { id: 'd', loginStreakCount: 4, loginStreakClaimedMilestones: [3], notificationPrefs: null },
      ],
      existing: [{ userId: 'd', data: { kind: STREAK_RISK_KIND } }],
    });
    const r = await runStreakRiskNudges(db as never, NOW);
    expect(r).toEqual({ checked: 4, sent: 2 });
    expect(db.notification.createMany).toHaveBeenCalledTimes(1);
    const data = (db.notification.createMany.mock.calls[0] as unknown as [{ data: Array<{ userId: string; message: string; data: Record<string, unknown> }> }])[0].data;
    expect(data.map((d) => d.userId)).toEqual(['a', 'c']);
    expect(data[0].data).toMatchObject({ kind: STREAK_RISK_KIND, nextMilestone: { days: 3, points: 50 }, ctaPath: '/customer' });
    expect(data[1].message).toContain('+150');
  });

  it('saf yardımcılar: alınmış taş atlanır, son gün mesajı', () => {
    const ms = [
      { days: 3, points: 50 },
      { days: 7, points: 150 },
    ];
    expect(nextMilestoneFor(2, [], ms)).toEqual({ days: 3, points: 50 });
    expect(nextMilestoneFor(2, [3], ms)).toEqual({ days: 7, points: 150 });
    expect(nextMilestoneFor(8, [], ms)).toBeNull();
    expect(streakRiskMessage(2, { days: 3, points: 50 }).message).toContain('3. güne ulaşır');
    expect(streakRiskMessage(9, null).message).toContain('serin devam eder');
  });
});

describe('açılmamış sürpriz kutu', () => {
  it('yalnız yönetici kutusu (dayKey yok), 24 sa – 14 gün aralığı; kutu başına bir kez', async () => {
    const db = makeDb({
      boxes: [
        { id: 'box1', userId: 'u1', title: 'Hoş geldin', user: { notificationPrefs: null } },
        { id: 'box2', userId: 'u1', title: 'Teşekkürler', user: { notificationPrefs: null } },
        { id: 'box3', userId: 'u2', title: 'Kapalı', user: { notificationPrefs: { reminder: { app: false } } } },
      ],
      existing: [{ userId: 'u1', data: { kind: BOX_NUDGE_KIND, boxId: 'box1' } }],
    });
    const r = await runSurpriseBoxNudges(db as never, NOW);
    expect(r).toEqual({ checked: 3, sent: 1 });
    const where = (db.userSurpriseBox.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ openedAt: null, dayKey: null });
    const data = (db.notification.createMany.mock.calls[0] as unknown as [{ data: Array<{ data: Record<string, unknown> }> }])[0].data;
    expect(data).toHaveLength(1);
    expect(data[0].data).toMatchObject({ kind: BOX_NUDGE_KIND, boxId: 'box2', ctaPath: '/customer/wallet/owned?tab=boxes' });
  });
});
