/**
 * Müşteri hatırlatma dürtmeleri (lib/customer-reminders) — oyunlaştırma-ekonomi D3.
 * Küme bazlı sorgu (müşteri başına sorgu yok), imleçli sayfalama (ilk 1000 sınırı yok),
 * pencere içi tekilleştirme (yalnız en son bildirime bakılmaz), uygun müşteri filtresi.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/navigation/deep-links', () => ({ consumptionVoiceHref: (id: string) => `/customer/me/voices?consumption=${id}` }));

import { INACTIVE_KIND, MISSING_COMMENT_KIND, planReminders, runCustomerReminderNudges } from '@/lib/customer-reminders';

const NOW = new Date('2026-10-11T03:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe('planReminders (saf)', () => {
  it('pasif müşteri bekleme süresi içinde ikinci kez dürtülmez; yorumsuz değerlendirme tüketim başına', () => {
    const plan = planReminders({
      userIds: ['a', 'b', 'c', 'd'],
      lastFeedbackAt: new Map([
        ['a', daysAgo(30)],
        ['b', daysAgo(2)],
        ['c', daysAgo(30)],
      ]),
      pendingConsumption: new Map([
        ['b', 'cons-1'],
        ['c', 'cons-2'],
      ]),
      recentInactive: new Set(['c']),
      recentMissing: new Set(['c:cons-2']),
      inactiveCutoff: daysAgo(14),
    });
    expect(plan.inactive).toEqual(['a', 'd']); // d hiç yorum yapmamış
    expect(plan.missing).toEqual([{ userId: 'b', consumptionId: 'cons-1' }]);
  });
});

describe('runCustomerReminderNudges', () => {
  function makeDb(pages: Array<Array<{ id: string; notificationPrefs: unknown }>>, recent: unknown[] = []) {
    let call = 0;
    return {
      user: { findMany: jest.fn(async () => pages[call++] ?? []) },
      feedback: { groupBy: jest.fn(async () => [{ userId: 'u1', _max: { createdAt: daysAgo(1) } }]) },
      consumptionReview: {
        groupBy: jest.fn(async () => []),
        findMany: jest.fn(async () => [
          { customerId: 'u2', consumptionId: 'cons-9' },
          { customerId: 'u2', consumptionId: 'cons-older' },
        ]),
      },
      notification: {
        findMany: jest.fn(async () => recent),
        createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      },
    };
  }

  it('uygun müşteri filtresi + imleç; sayfa başına sabit sorgu ve tek toplu yazım', async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ id: `p${String(i).padStart(3, '0')}`, notificationPrefs: { reminder: { app: false } } }));
    const db = makeDb([full, [{ id: 'u1', notificationPrefs: null }, { id: 'u2', notificationPrefs: null }]]);
    const r = await runCustomerReminderNudges(db as never, NOW);
    expect(r.customersChecked).toBe(502);
    expect(db.user.findMany).toHaveBeenCalledTimes(2);
    const first = (db.user.findMany.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(first.where).toMatchObject({ role: 'CUSTOMER', suspendedAt: null, anonymizedAt: null, isDemo: false });
    const second = (db.user.findMany.mock.calls[1] as unknown as [Record<string, unknown>])[0];
    expect(second).toMatchObject({ cursor: { id: 'p499' }, skip: 1 });
    // İlk sayfa tamamen tercih-kapalı → küme sorgusu yok; ikinci sayfada her biri bir kez.
    expect(db.feedback.groupBy).toHaveBeenCalledTimes(1);
    expect(db.notification.createMany).toHaveBeenCalledTimes(1);
    const data = (db.notification.createMany.mock.calls[0] as unknown as [{ data: Array<{ userId: string; data: Record<string, unknown> }> }])[0].data;
    // u1 dün yorum yaptı (pasif değil); u2 hiç QR yorumu yok → pasif + en yeni yorumsuz değerlendirme.
    expect(data.map((d) => [d.userId, d.data.kind])).toEqual([
      ['u2', INACTIVE_KIND],
      ['u2', MISSING_COMMENT_KIND],
    ]);
    expect(data[1].data.nudgeType).toBe('rated_without_comment:cons-9');
    expect(r).toMatchObject({ inactiveNudgesSent: 1, missingCommentNudgesSent: 1 });
  });

  it('pencere içindeki AYNI türde bildirim (en son bildirim olmasa da) tekrarı engeller', async () => {
    const db = makeDb(
      [[{ id: 'u2', notificationPrefs: null }]],
      [
        { userId: 'u2', data: { kind: INACTIVE_KIND, nudgeType: 'inactive_feedback' }, createdAt: daysAgo(3) },
        { userId: 'u2', data: { kind: MISSING_COMMENT_KIND, nudgeType: 'rated_without_comment:cons-9' }, createdAt: daysAgo(1) },
      ]
    );
    const r = await runCustomerReminderNudges(db as never, NOW);
    expect(r).toMatchObject({ inactiveNudgesSent: 0, missingCommentNudgesSent: 0 });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});
