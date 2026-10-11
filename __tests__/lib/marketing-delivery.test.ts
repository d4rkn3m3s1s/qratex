/**
 * P0-35 pazarlama gönderim kapısı (lib/marketing-delivery) birim testleri.
 * Prisma ve push mock'lanır; gerçek DB'ye gidilmez.
 */
const mockUserFindMany = jest.fn();
const mockSendPush = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: (...a: unknown[]) => mockUserFindMany(...a) } },
}));
jest.mock('@/lib/push', () => ({
  sendPush: (...a: unknown[]) => mockSendPush(...a),
}));

import {
  EMAIL_CHANNEL_UNAVAILABLE_MESSAGE,
  MARKETING_KINDS,
  MARKETING_PREF_GROUP,
  buildMarketingNotificationRows,
  isSupportedCampaignChannel,
  partitionMarketingAudience,
  resolveMarketingAudience,
  sendMarketingPush,
} from '@/lib/marketing-delivery';
import { kindToGroup } from '@/lib/notification-prefs';

function row(id: string, prefs: unknown = null, extra: Partial<{ role: string; anonymizedAt: Date | null }> = {}) {
  return { id, role: 'CUSTOMER', anonymizedAt: null, notificationPrefs: prefs as never, ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tercih süzgeci (partitionMarketingAudience)', () => {
  it('kampanya grubunu iki kanalda da kapatan müşteriye hiçbir kanal açılmaz', () => {
    const a = partitionMarketingAudience(
      ['u1', 'u2'],
      [row('u1', { campaign: { app: false, push: false } }), row('u2')]
    );
    expect(a.appUserIds).toEqual(['u2']);
    expect(a.pushUserIds).toEqual(['u2']);
    expect(a.optedOutCount).toBe(1);
    expect(a.reachCount).toBe(1);
  });

  it('kanallar bağımsız: yalnız push kapalıysa uygulama içi gider, tersi de geçerli', () => {
    const a = partitionMarketingAudience(
      ['app-only', 'push-only'],
      [row('app-only', { campaign: { push: false } }), row('push-only', { campaign: { app: false } })]
    );
    expect(a.appUserIds).toEqual(['app-only']);
    expect(a.pushUserIds).toEqual(['push-only']);
    expect(a.reachCount).toBe(2);
    expect(a.optedOutCount).toBe(0);
  });

  it('başka grubun kapatılması (team) kampanyayı etkilemez; tercih yoksa varsayılan açık', () => {
    const a = partitionMarketingAudience(['u1'], [row('u1', { team: { app: false, push: false } })]);
    expect(a.appUserIds).toEqual(['u1']);
  });

  it('müşteri olmayan, anonimleştirilmiş ya da bulunamayan hesaplar elenir; kimlikler tekilleşir', () => {
    const a = partitionMarketingAudience(
      ['c', 'c', 'dealer', 'gone', 'anon', ''],
      [row('c'), row('dealer', null, { role: 'DEALER' }), row('anon', null, { anonymizedAt: new Date() })]
    );
    expect(a.candidateCount).toBe(4);
    expect(a.ineligibleCount).toBe(3);
    expect(a.appUserIds).toEqual(['c']);
  });
});

describe('resolveMarketingAudience', () => {
  it('tek sorguda tercihleri okur', async () => {
    mockUserFindMany.mockResolvedValue([row('u1'), row('u2', { campaign: { app: false, push: false } })]);
    const a = await resolveMarketingAudience(['u1', 'u2', 'u1']);
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany.mock.calls[0][0].where).toEqual({ id: { in: ['u1', 'u2'] } });
    expect(a.reachCount).toBe(1);
  });

  it('FAIL-CLOSED: tercih okunamazsa hata fırlatır (sessizce herkese göndermez)', async () => {
    mockUserFindMany.mockRejectedValue(new Error('db down'));
    await expect(resolveMarketingAudience(['u1'])).rejects.toThrow('db down');
  });

  it('boş aday listesinde DB sorgusu yapılmaz', async () => {
    const a = await resolveMarketingAudience([]);
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(a.reachCount).toBe(0);
  });
});

describe('bildirim satırları', () => {
  it('her pazarlama türü kampanya tercih grubuna düşer', () => {
    for (const kind of Object.values(MARKETING_KINDS)) {
      expect(kindToGroup(kind)).toBe(MARKETING_PREF_GROUP);
    }
  });

  it('data.kind her satıra yazılır ve çağıranın verdiği kind ile ezilemez', () => {
    const rows = buildMarketingNotificationRows(['u1', 'u1', 'u2'], {
      title: 'T',
      message: 'M',
      kind: MARKETING_KINDS.winBack,
      data: { kind: 'system-announcement', dealerId: 'd1' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userId: 'u1', title: 'T', message: 'M', type: 'campaign' });
    expect(rows[0].data).toEqual({ kind: 'campaign-win-back', dealerId: 'd1' });
  });

  it('kampanya grubunda olmayan tür reddedilir', () => {
    expect(() =>
      buildMarketingNotificationRows(['u1'], { title: 'T', message: 'M', kind: 'team-task' as never })
    ).toThrow();
  });
});

describe('kanallar', () => {
  it('sahte "email" kanalı desteklenmiyor; yalnız notification', () => {
    expect(isSupportedCampaignChannel('notification')).toBe(true);
    expect(isSupportedCampaignChannel('email')).toBe(false);
    expect(isSupportedCampaignChannel(undefined)).toBe(false);
    expect(EMAIL_CHANNEL_UNAVAILABLE_MESSAGE).toMatch(/E-posta/);
  });

  it('sendMarketingPush yalnız verilen kullanıcılara gönderir ve başarılı teslimleri sayar', async () => {
    mockSendPush.mockImplementation(async (userId: string) => {
      if (userId === 'boom') throw new Error('x');
      return userId !== 'no-sub';
    });
    const ids = Array.from({ length: 45 }, (_, i) => `u${i}`).concat(['no-sub', 'boom', 'u0']);
    const delivered = await sendMarketingPush(ids, { title: 'T', message: 'M', url: '/customer' });
    expect(mockSendPush).toHaveBeenCalledTimes(47);
    expect(delivered).toBe(45);
    expect(mockSendPush).toHaveBeenCalledWith('u1', { title: 'T', body: 'M', url: '/customer', icon: undefined });
  });
});
