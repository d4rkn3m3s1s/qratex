/**
 * Digest çakışması (D10 / P0-14): /dealer/innovation'daki elle "yenile" aynı (bayi, hafta)
 * DealerWeeklyBrief satırını önceden oluşturduğunda Pazartesi cron'u bildirimi + e-postayı
 * sessizce atlıyordu. Artık bildirim kararı satırın varlığından bağımsız, atomik
 * tek-seferlik anahtarla verilir.
 */
const keys = new Set<string>();
const bodies = new Map<string, string>();
const briefs = new Set<string>();
const mockNotificationCreate = jest.fn();
const mockSendEmail = jest.fn();
const mockAi = jest.fn();

const tx = {
  idempotencyKey: {
    createMany: jest.fn(async ({ data }: { data: Array<{ key: string }> }) => {
      const k = data[0].key;
      if (keys.has(k)) return { count: 0 };
      keys.add(k);
      return { count: 1 };
    }),
  },
  notification: { create: (...a: unknown[]) => mockNotificationCreate(...a) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    idempotencyKey: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        keys.has(where.key) ? { id: 'k', responseBody: bodies.get(where.key) ?? '{}' } : null
      ),
      deleteMany: jest.fn(async ({ where }: { where: { key: string } }) => ({ count: keys.delete(where.key) ? 1 : 0 })),
      updateMany: jest.fn(async ({ where, data }: { where: { key: string }; data: { responseBody: string } }) => {
        if (!keys.has(where.key)) return { count: 0 };
        bodies.set(where.key, data.responseBody);
        return { count: 1 };
      }),
    },
    dealerWeeklyBrief: {
      upsert: jest.fn(async ({ where }: { where: { dealerId_weekStart: { dealerId: string; weekStart: Date } } }) => {
        briefs.add(`${where.dealerId_weekStart.dealerId}:${where.dealerId_weekStart.weekStart.toISOString()}`);
        return {};
      }),
    },
    feedback: {
      aggregate: jest.fn(async () => ({ _avg: { rating: 4.2 }, _count: 5 })),
      count: jest.fn(async () => 1),
      findMany: jest.fn(async () => [{ topics: ['servis'] }]),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
jest.mock('@/lib/ai-engine', () => ({ runChatCompletion: (...a: unknown[]) => mockAi(...a) }));
jest.mock('@/lib/mail-sender', () => ({ sendTransactionalEmail: (...a: unknown[]) => mockSendEmail(...a) }));

import {
  DIGEST_EMAIL_MAX_ATTEMPTS,
  generateWeeklyDigestForDealer,
  weeklyDigestEmailPendingKey,
  weeklyDigestNotifyKey,
} from '@/lib/weekly-digest-core';

const dealer = { id: 'dealer_1', email: 'bayi@ornek.com', businessName: 'Kafe', name: null };
const week = new Date('2026-09-28T00:00:00.000Z');

beforeEach(() => {
  keys.clear();
  bodies.clear();
  briefs.clear();
  jest.clearAllMocks();
  mockAi.mockResolvedValue({ content: 'Özet.' });
  mockSendEmail.mockResolvedValue({ ok: true });
  mockNotificationCreate.mockResolvedValue({});
});

describe('haftalık digest çakışması', () => {
  it('elle üretilmiş satır varken bile cron bildirimi ve e-postayı GÖNDERİR', async () => {
    // Bayi hafta içinde inovasyon sayfasında "yenile"ye bastı → satır zaten var.
    briefs.add(`${dealer.id}:${week.toISOString()}`);

    const r = await generateWeeklyDigestForDealer(dealer, week);

    expect(r.status).toBe('sent');
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('cron yeniden denemesi bildirimi/e-postayı ikinci kez göndermez ve AI\'ya yeniden harcamaz', async () => {
    await generateWeeklyDigestForDealer(dealer, week);
    mockAi.mockClear();

    const r = await generateWeeklyDigestForDealer(dealer, week);

    expect(r.status).toBe('skipped');
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockAi).not.toHaveBeenCalled();
  });

  it('eşzamanlı iki çalıştırmadan yalnız biri bildirir', async () => {
    const [a, b] = await Promise.all([
      generateWeeklyDigestForDealer(dealer, week),
      generateWeeklyDigestForDealer(dealer, week),
    ]);
    expect([a.status, b.status].sort()).toEqual(['sent', 'skipped']);
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('e-posta gidemezse "sent" sayılmaz; sonraki koşu AI olmadan yeniden dener, bildirim tekrarlanmaz (arka plan Y6)', async () => {
    mockSendEmail.mockResolvedValueOnce({ ok: false, error: 'SMTP down' });
    const first = await generateWeeklyDigestForDealer(dealer, week);
    expect(first.status).toBe('email_failed');
    expect(keys.has(weeklyDigestEmailPendingKey(dealer.id, week))).toBe(true);

    mockAi.mockClear();
    const second = await generateWeeklyDigestForDealer(dealer, week);
    expect(second.status).toBe('sent');
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockAi).not.toHaveBeenCalled();
    expect(keys.has(weeklyDigestEmailPendingKey(dealer.id, week))).toBe(false);

    const third = await generateWeeklyDigestForDealer(dealer, week);
    expect(third.status).toBe('skipped');
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it('deneme hakkı bitince ya da sonuç belirsizse işaret silinir (sonsuz/çift gönderim yok)', async () => {
    mockSendEmail.mockResolvedValue({ ok: false, error: 'SMTP down' });
    for (let i = 0; i < DIGEST_EMAIL_MAX_ATTEMPTS; i++) {
      expect((await generateWeeklyDigestForDealer(dealer, week)).status).toBe('email_failed');
    }
    expect(keys.has(weeklyDigestEmailPendingKey(dealer.id, week))).toBe(false);
    expect((await generateWeeklyDigestForDealer(dealer, week)).status).toBe('skipped');
    expect(mockSendEmail).toHaveBeenCalledTimes(DIGEST_EMAIL_MAX_ATTEMPTS);

    keys.clear();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValueOnce({ ok: false, error: 'Timeout', maybeDelivered: true });
    expect((await generateWeeklyDigestForDealer(dealer, week)).status).toBe('email_failed');
    expect(keys.has(weeklyDigestEmailPendingKey(dealer.id, week))).toBe(false);
  });

  it('e-postası olmayan bayi için bekleyen işaret yazılmaz', async () => {
    const r = await generateWeeklyDigestForDealer({ ...dealer, email: null }, week);
    expect(r.status).toBe('no_email');
    expect(keys.has(weeklyDigestEmailPendingKey(dealer.id, week))).toBe(false);
  });

  it('sistem anahtarı istemci Idempotency-Key ad uzayına düşemez (>128 karakter, bayi+hafta özgü)', () => {
    const k1 = weeklyDigestNotifyKey('d', week);
    const k2 = weeklyDigestNotifyKey('d', new Date(week.getTime() + 7 * 86400000));
    expect(k1.length).toBeGreaterThan(128);
    expect(k1).not.toBe(k2);
    expect(weeklyDigestNotifyKey('d', week)).toBe(k1);
  });
});
