/**
 * Denetim #33: davet tamamlanması bir kademe eşiğine ulaştırınca davet edene "kademe ödülün hazır"
 * bildirimi gider (ödül yine /customer/me/invite'ta kullanıcı eylemiyle talep edilir).
 */
jest.mock('@prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn(async () => ({ credited: 1, duplicate: false })) }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn(async () => ({ referrals: true })) }));
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: jest.fn(async () => ({
    referral: { maxInvitesPerReferrerLifetime: 100, maxRedemptionsPerReferralCodePerMonth: 30 },
  })),
}));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getReferralRewards: () => ({ referredPoints: 500, referrerPoints: 1000 }),
}));

import { qualifyReferral } from '@/lib/referral';

function makeDb(completedBefore: number) {
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    referral: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => completedBefore),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    referralCode: { updateMany: jest.fn(async () => ({ count: 1 })) },
    notification: { createMany: jest.fn(async () => ({ count: 2 })) },
  };
  const db = {
    referral: {
      findUnique: jest.fn(async () => ({
        id: 'ref1',
        referrerId: 'A',
        referredId: 'B',
        referralCode: 'ABCD2345',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
      updateMany: jest.fn(),
    },
    user: { findUnique: jest.fn(async () => ({ id: 'B', role: 'CUSTOMER', emailVerified: new Date() })) },
    feedback: { findFirst: jest.fn(async () => ({ id: 'f1' })) },
    consumption: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  return { db, tx };
}

describe('qualifyReferral → kademe bildirimi', () => {
  it('3. başarılı davet → davet edene "kademe hazır" bildirimi (+200)', async () => {
    const { db, tx } = makeDb(2);
    await qualifyReferral('B', {}, db as never);
    const data = (tx.notification.createMany.mock.calls[0] as unknown as [{ data: Array<Record<string, unknown>> }])[0].data;
    expect(data).toHaveLength(3);
    expect(data[2]).toMatchObject({
      userId: 'A',
      type: 'REFERRAL_MILESTONE_READY',
      data: { ctaPath: '/customer/me/invite', points: 200 },
    });
  });

  it('eşik dışı (4. davet) → yalnız iki olağan bildirim', async () => {
    const { db, tx } = makeDb(3);
    await qualifyReferral('B', {}, db as never);
    const data = (tx.notification.createMany.mock.calls[0] as unknown as [{ data: unknown[] }])[0].data;
    expect(data).toHaveLength(2);
  });
});
