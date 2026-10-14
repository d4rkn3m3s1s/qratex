/**
 * QR geri bildirim hunisi (p-qr-geri-bildirim) — sunucu çekirdeği.
 *
 *  - Bulgu 1: ANONİM gönderim de webhook / ısı haritası / analytics / AI yan etkilerini kuyruğa alır.
 *  - Bulgu 4: başka işletmenin (ya da pasif) personeli yok sayılır.
 *  - Bulgu 5: işletme sahibi/personeli kendi QR'ına → işaretli kayıt, ödül YOK.
 *  - Bulgu 6: hızlı etiketler detaylı yorum ödülünü açmaz; metne Türkçe etiket satırı eklenir.
 *  - Bulgu 2: yalnız kendi R2 alanımızdaki bu QR'a ait fotoğraf URL'leri kabul edilir.
 *  - Bulgu 7: anonim gönderim 24 saatlik bağlama belirteci alır; bağlama tek seferlik.
 *  - Ekonomi: kredi yalnız `mintPoints` ile, `feedback:<id>` defter anahtarı.
 */

const afterQueue: Array<() => unknown> = [];
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (fn: () => unknown) => afterQueue.push(fn) };
});
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

const db = {
  qRCode: { findUnique: jest.fn() },
  dealerStaff: { findFirst: jest.fn() },
  feedback: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  notification: { create: jest.fn() },
  analyticsEvent: { create: jest.fn(), findMany: jest.fn(async () => []) },
  $transaction: jest.fn(),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
  ECONOMY_CAPS: { feedback: { daily: 500, weekly: 2000, countCategories: ['feedback'] } },
  sumEarnedInWindow: jest.fn(async () => ({ today: 0, week: 0, todayFromActor: 0 })),
}));
const MATRIX = { feedback: { longTextThreshold: 50, base: { points: 50, xp: 25 }, detailed: { points: 100, xp: 50 } } };
jest.mock('@/lib/points-rules', () => ({ getPointsMatrix: jest.fn(async () => MATRIX) }));
const mockQrLimit = jest.fn(async () => ({ ok: true }));
jest.mock('@/lib/rate-limit', () => ({
  checkFeedbackPerQrRateLimit: (...a: unknown[]) => mockQrLimit(...(a as [])),
  checkRateLimitDb: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@/lib/vip-multiplier', () => ({ applyVipMultiplier: jest.fn(async (_u: string, p: number) => ({ points: p, multiplier: 1, bonus: 0 })) }));
jest.mock('@/lib/seasonal-campaign-live', () => ({
  applySeasonalCampaignMultiplier: jest.fn(async (p: number) => ({ points: p, multiplier: 1, bonusPoints: 0, campaignId: null })),
}));
jest.mock('@/lib/gamification-settings', () => ({ getGamificationMultipliers: jest.fn(async () => ({ pointMultiplier: 1, xpMultiplier: 1 })) }));
jest.mock('@/lib/gamification-engine', () => ({
  addToSquadTreasury: jest.fn(async () => 5),
  addToActiveBattleScore: jest.fn(async () => 0),
}));
const mockTrust = jest.fn(async () => ({ flagged: false }));
jest.mock('@/lib/trust-score', () => ({ applyTrustEvaluation: (...a: unknown[]) => mockTrust(...(a as [])) }));
jest.mock('@/lib/r2-storage', () => ({ isR2Configured: () => true }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

import { submitFeedback } from '@/lib/feedback-funnel/submit';
import { claimFeedback } from '@/lib/feedback-funnel/claim';
import { signClaimToken, verifyClaimToken, CLAIM_TOKEN_TTL_MS } from '@/lib/feedback-funnel/claim-token';
import { composeStoredText, normalizeQuickTags, tagsForRating, STORED_TAG_PREFIX } from '@/lib/feedback-funnel/quick-tags';
import { acceptedMediaUrls } from '@/lib/feedback-funnel/media';
import { welcomeTextFor, toVenue, qrStatusOf } from '@/lib/feedback-funnel/venue';
import { ApiError } from '@/lib/http/define-route';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const OPEN_QR = {
  id: 'qr1',
  code: 'ABCD1234',
  dealerId: 'dealer1',
  isActive: true,
  expiresAt: null,
  revokedAt: null,
  archivedAt: null,
};

function minted(over: Record<string, unknown> = {}) {
  return {
    credited: 50,
    xpCredited: 25,
    requestedPoints: 50,
    points: 1050,
    xp: 1500,
    level: 2,
    isLevelUp: false,
    capped: false,
    duplicate: false,
    status: 'posted',
    ledgerId: 'l1',
    ...over,
  };
}

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-123456';
  process.env.R2_PUBLIC_URL = 'https://cdn.qratex.test';
});

beforeEach(() => {
  afterQueue.length = 0;
  jest.clearAllMocks();
  db.qRCode.findUnique.mockResolvedValue(OPEN_QR);
  db.dealerStaff.findFirst.mockResolvedValue(null);
  db.feedback.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'fb1', createdAt: NOW, ...data }));
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  mockMint.mockResolvedValue(minted());
});

describe('hızlı etiketler', () => {
  it('bilinmeyenleri atar, tekilleştirir, en fazla 4', () => {
    expect(normalizeQuickTags(['clean', 'clean', 'hack', 'tasty', 'fast_service', 'good_value', 'nice_ambiance'])).toEqual([
      'clean',
      'tasty',
      'fast_service',
      'good_value',
    ]);
  });
  it('puana göre bağlamsal set', () => {
    expect(tagsForRating(1).every((t) => t.polarity === 'negative')).toBe(true);
    expect(tagsForRating(5).every((t) => t.polarity === 'positive')).toBe(true);
    expect(tagsForRating(null)).toEqual([]);
  });
  it('saklanan metin: kullanıcı metni + Türkçe etiket satırı', () => {
    expect(composeStoredText('  Harikaydı  ', ['clean'])).toBe(`Harikaydı\n\n${STORED_TAG_PREFIX}Temizdi`);
    expect(composeStoredText('', [])).toBeNull();
    expect(composeStoredText('', ['tasty'])).toBe(`${STORED_TAG_PREFIX}Lezzetliydi`);
  });
});

describe('medya URL süzgeci', () => {
  it('yalnız kendi R2 alanımız + bu QR + beklenen anahtar biçimi; çıktı KEY', () => {
    const goodKey = 'feedback/qr1/2026-10/AAAAAAAAAAAAAAAAAAAAAAAA.jpg';
    const good = `https://cdn.qratex.test/${goodKey}`;
    expect(
      acceptedMediaUrls(
        [
          good,
          good,
          'data:image/jpeg;base64,xxxx',
          'https://evil.test/feedback/qr1/2026-10/AAAAAAAAAAAAAAAAAAAAAAAA.jpg',
          'https://cdn.qratex.test/feedback/qr2/2026-10/AAAAAAAAAAAAAAAAAAAAAAAA.jpg',
          'https://cdn.qratex.test/tasks/x.pdf',
          goodKey,
          'feedback/qr1/2026-10/../../qr2/2026-10/AAAAAAAAAAAAAAAAAAAAAAAA.jpg',
        ],
        'qr1'
      )
    ).toEqual([goodKey]);
  });
});

describe('mekân', () => {
  it('segment karşılama metni', () => {
    expect(welcomeTextFor({ vip: { welcomeText: ' Hoş geldin! ' } }, 'vip')).toBe('Hoş geldin!');
    expect(welcomeTextFor({ vip: { welcomeText: 'x' } }, 'other')).toBeNull();
    expect(welcomeTextFor(null, 'vip')).toBeNull();
  });
  it('personelde yalnız ilk ad (KVKK)', () => {
    const v = toVenue(
      {
        ...OPEN_QR,
        name: 'Masa 4',
        description: null,
        segmentConfig: null,
        location: null,
        dealer: { name: 'Ali', businessName: 'Kahve Evi', businessLogo: null, staffMembers: [{ id: 's1', user: { name: 'Ayşe Yılmaz', image: null } }] },
      },
      null
    );
    expect(v.staff).toEqual([{ id: 's1', firstName: 'Ayşe', image: null }]);
    expect(v.businessName).toBe('Kahve Evi');
    expect(v.spotName).toBe('Masa 4');
  });
  it('durum sırası', () => {
    expect(qrStatusOf({ isActive: true, expiresAt: new Date(0), revokedAt: null, archivedAt: null }, NOW)).toBe('expired');
    expect(qrStatusOf({ isActive: false, expiresAt: null, revokedAt: null, archivedAt: NOW }, NOW)).toBe('archived');
  });
});

describe('bağlama belirteci', () => {
  it('imzalı, 24 saat, kurcalanamaz', () => {
    const { token } = signClaimToken('fb1', true, NOW.getTime());
    const ok = verifyClaimToken(token, NOW.getTime() + 1000);
    expect(ok).toEqual({ ok: true, claims: { f: 'fb1', d: true, e: NOW.getTime() + CLAIM_TOKEN_TTL_MS } });
    expect(verifyClaimToken(token, NOW.getTime() + CLAIM_TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
    const [v, body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ f: 'fb2', d: true, e: NOW.getTime() + 1e9 })).toString('base64url');
    expect(verifyClaimToken(`${v}.${forged}.${mac}`, NOW.getTime())).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyClaimToken(`${v}.${body}.x${mac.slice(1)}`, NOW.getTime()).ok).toBe(false);
  });
});

describe('submitFeedback', () => {
  it('ANONİM: kayıt + bağlama belirteci + oturumdan bağımsız yan etkiler (Bulgu 1)', async () => {
    const res = await submitFeedback(
      { code: 'ABCD1234' },
      { rating: 2, text: 'Garson ilgisizdi', tags: ['slow_service'], attribution: { source: 'qr' } },
      { viewer: null, clientId: '1.2.3.4', now: NOW }
    );
    expect(mockMint).not.toHaveBeenCalled();
    expect(res.reward.status).toBe('claimable');
    if (res.reward.status === 'claimable') {
      expect(res.reward.points).toBe(50);
      expect(verifyClaimToken(res.reward.claimToken, NOW.getTime()).ok).toBe(true);
    }
    const data = db.feedback.create.mock.calls[0][0].data;
    expect(data.userId).toBeNull();
    expect(data.text).toBe(`Garson ilgisizdi\n\n${STORED_TAG_PREFIX}Hizmet yavaştı`);
    expect(data.attributionSource).toBe('qr');
    // analytics + webhook + AI yönlendirmesi kuyrukta (üye işleri yok). Isı haritası kovası
    // (HeatmapData) artık yazılmıyor — yoğunluk ekranı olay tablolarından hesaplanıyor.
    expect(afterQueue.length).toBe(3);
  });

  it('ÜYE: kayıt + mintPoints (feedback:<id> anahtarı) aynı transaction, gerçek kredi döner', async () => {
    const res = await submitFeedback(
      { code: 'ABCD1234' },
      { rating: 5, text: 'Kısa', tags: ['clean', 'tasty', 'fast_service', 'good_value'] },
      { viewer: { userId: 'u1', role: 'CUSTOMER' }, clientId: 'ip', now: NOW }
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(mockMint).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ userId: 'u1', points: 50, xp: 25, source: 'feedback', idempotencyKey: 'feedback:fb1', sourceId: 'fb1' })
    );
    expect(res.reward).toMatchObject({ status: 'credited', points: 50, xp: 25, level: 2, squadContribution: 5 });
    expect(mockTrust).toHaveBeenCalledWith('fb1', { userId: 'u1', dealerId: 'dealer1', rating: 5 });
    // Üyeye özel rozet/davet işleri de kuyrukta.
    expect(afterQueue.length).toBe(6);
  });

  it('Bulgu 6: etiketler detaylı ödülü AÇMAZ; yalnız kullanıcının kendi metni sayılır', async () => {
    await submitFeedback(
      { code: 'ABCD1234' },
      { rating: 5, text: '', tags: ['staff_friendly', 'fast_service', 'clean', 'nice_ambiance'] },
      { viewer: { userId: 'u1', role: 'CUSTOMER' }, clientId: 'ip', now: NOW }
    );
    expect(mockMint.mock.calls[0][1].points).toBe(50);
    await submitFeedback(
      { code: 'ABCD1234' },
      { rating: 5, text: 'x'.repeat(50) },
      { viewer: { userId: 'u1', role: 'CUSTOMER' }, clientId: 'ip', now: NOW }
    );
    expect(mockMint.mock.calls[1][1].points).toBe(100);
  });

  it('tavan: kısılan kredi `capped` olarak döner', async () => {
    mockMint.mockResolvedValue(minted({ credited: 20, xpCredited: 10, capped: true }));
    const res = await submitFeedback({ code: 'ABCD1234' }, { rating: 4 }, { viewer: { userId: 'u1', role: 'CUSTOMER' }, clientId: 'ip', now: NOW });
    expect(res.reward).toMatchObject({ status: 'capped', points: 20, requested: 50 });
  });

  it('Bulgu 5: işletme sahibi kendi QR’ına → işaretli kayıt, ödül yok', async () => {
    const res = await submitFeedback({ code: 'ABCD1234' }, { rating: 5 }, { viewer: { userId: 'dealer1', role: 'DEALER' }, clientId: 'ip', now: NOW });
    expect(res.reward).toEqual({ status: 'conflict' });
    expect(mockMint).not.toHaveBeenCalled();
    expect(db.feedback.create.mock.calls[0][0].data).toMatchObject({ userId: 'dealer1', trustFlagged: true });
  });

  it('Bulgu 5: işletmenin personeli de çıkar çatışmasıdır', async () => {
    db.dealerStaff.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.userId === 'staffUser' ? { id: 'ds1' } : null
    );
    const res = await submitFeedback({ code: 'ABCD1234' }, { rating: 5 }, { viewer: { userId: 'staffUser', role: 'STAFF' }, clientId: 'ip', now: NOW });
    expect(res.reward.status).toBe('conflict');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('Bulgu 4: başka işletmenin personeli yok sayılır', async () => {
    db.dealerStaff.findFirst.mockResolvedValue(null);
    await submitFeedback({ code: 'ABCD1234' }, { rating: 1, staffId: 'foreign-staff' }, { viewer: null, clientId: 'ip', now: NOW });
    expect(db.dealerStaff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign-staff', dealerId: 'dealer1', isActive: true } })
    );
    expect(db.feedback.create.mock.calls[0][0].data.dealerStaffId).toBeUndefined();
  });

  it('kapalı QR: mesajlı 404, kayıt yok', async () => {
    db.qRCode.findUnique.mockResolvedValue({ ...OPEN_QR, revokedAt: NOW });
    await expect(submitFeedback({ code: 'ABCD1234' }, { rating: 5 }, { viewer: null, clientId: 'ip', now: NOW })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Bu QR kod iptal edilmiş.',
    });
    expect(db.feedback.create).not.toHaveBeenCalled();
  });

  it('QR × IP hız sınırı: 429 + Retry-After', async () => {
    mockQrLimit.mockResolvedValueOnce({ ok: false, retryAfterMs: 30_000 } as never);
    const err = await submitFeedback({ code: 'ABCD1234' }, { rating: 5 }, { viewer: null, clientId: 'ip', now: NOW }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.headers).toEqual({ 'Retry-After': '30' });
  });
});

describe('claimFeedback (Bulgu 7)', () => {
  const FB = { id: 'fb9', userId: null, deletedAt: null, createdAt: NOW, rating: 4, qrCode: { id: 'qr1', dealerId: 'dealer1' } };

  it('bağlar + mintPoints (aynı feedback:<id> anahtarı → tek seferlik)', async () => {
    db.feedback.findUnique.mockResolvedValue(FB);
    db.feedback.updateMany.mockResolvedValue({ count: 1 });
    const { token } = signClaimToken('fb9', true, NOW.getTime());
    mockMint.mockResolvedValue(minted({ credited: 100, xpCredited: 50 }));
    const res = await claimFeedback('u7', token, new Date(NOW.getTime() + 60_000));
    expect(db.feedback.updateMany).toHaveBeenCalledWith({ where: { id: 'fb9', userId: null, deletedAt: null }, data: { userId: 'u7' } });
    expect(mockMint).toHaveBeenCalledWith(db, expect.objectContaining({ userId: 'u7', points: 100, idempotencyKey: 'feedback:fb9' }));
    expect(res.reward).toMatchObject({ status: 'credited', points: 100 });
  });

  it('yarış: başka hesap önce bağladıysa 409, kredi yok', async () => {
    db.feedback.findUnique.mockResolvedValue(FB);
    db.feedback.updateMany.mockResolvedValue({ count: 0 });
    const { token } = signClaimToken('fb9', false, NOW.getTime());
    await expect(claimFeedback('u7', token, NOW)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('zaten bağlı / işletme içi / süresi dolmuş reddedilir', async () => {
    const { token } = signClaimToken('fb9', false, NOW.getTime());
    db.feedback.findUnique.mockResolvedValueOnce({ ...FB, userId: 'other' });
    await expect(claimFeedback('u7', token, NOW)).rejects.toMatchObject({ code: 'CONFLICT' });

    db.feedback.findUnique.mockResolvedValueOnce(FB);
    await expect(claimFeedback('dealer1', token, NOW)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(claimFeedback('u7', token, new Date(NOW.getTime() + CLAIM_TOKEN_TTL_MS + 5))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockMint).not.toHaveBeenCalled();
  });
});
