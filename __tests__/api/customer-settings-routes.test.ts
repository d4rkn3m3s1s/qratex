/**
 * Ayarlar BFF uçları (`/api/customer/me/settings/*`) + geriye uyum uçları.
 * Denetim (customer_settings) bulguları sunucu tarafında kilitlenir:
 *  - B1: eski uçta `theme: 'system'` artık 400 vermez, diğer alanlar yazılır
 *  - B2: yalnız uygulanan bildirim hücreleri yazılabilir (sahte hücre → 400, yazım yok)
 *  - B3: müşteri avatarı izin listesi (keyfi URL → 400, yazım yok)
 *  - B7: alan bazlı + kilitli yazım; mevcut tercihler ezilmez
 *  - B14: çerçeve rengi doğrulaması
 *  - oturumlar: sessionVersion artışı + denetim kaydı + bu cihazın çerezi yenilenir
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 9 })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/auth', () => ({ SESSION_MAX_AGE_SECONDS: 3600 }));
const mockBump = jest.fn(async () => 7);
const mockReissue = jest.fn(async () => true);
jest.mock('@/lib/auth/session-version', () => ({
  bumpSessionVersion: (...a: unknown[]) => (mockBump as (...x: unknown[]) => unknown)(...a),
  reissueSessionCookie: (...a: unknown[]) => (mockReissue as (...x: unknown[]) => unknown)(...a),
}));
const mockInvalidate = jest.fn(async () => undefined);
jest.mock('@/lib/auth/session-state', () => ({ invalidateSessionState: (...a: unknown[]) => (mockInvalidate as (...x: unknown[]) => unknown)(...a) }));
jest.mock('@/lib/points-rules', () => ({ getPointsMatrix: jest.fn(async () => ({})), getBirthdayBonusPoints: () => 500 }));
const mockAdvance = jest.fn(async () => undefined);
jest.mock('@/lib/achievements', () => ({ advanceAchievementProgress: (...a: unknown[]) => (mockAdvance as (...x: unknown[]) => unknown)(...a) }));

const db = {
  user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  settings: { findUnique: jest.fn(), upsert: jest.fn() },
  auditLog: { create: jest.fn(), findFirst: jest.fn() },
  pushSubscription: { updateMany: jest.fn(), findMany: jest.fn() },
  userBadge: { count: jest.fn() },
  userCosmetic: { count: jest.fn() },
  userBirthday: { findUnique: jest.fn() },
  sessionTokenUsage: { findUnique: jest.fn() },
  twoFactorRecoveryCode: { count: jest.fn() },
  $executeRaw: jest.fn(async () => 1),
  $transaction: jest.fn(),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { avatarList } from '@/lib/avatar-options';

const CUSTOMER = { session: { user: { id: 'c-1', role: 'CUSTOMER' }, jti: 'jti-1', expires: '2099-01-01' } };

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(CUSTOMER);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.settings.findUnique.mockResolvedValue(null);
  db.settings.upsert.mockResolvedValue({});
  db.user.update.mockResolvedValue({ id: 'c-1', name: 'Ayşe', image: null });
  db.auditLog.create.mockResolvedValue({});
});

describe('PATCH /api/customer/me/settings/preferences', () => {
  it('yalnız CUSTOMER; kilitli tx içinde yalnız gönderilen alanı yazar, mevcutları korur', async () => {
    db.settings.findUnique.mockResolvedValue({ value: { preferences: { showLeaderboard: false, highContrast: true }, notifications: { emailReply: false } } });
    db.user.findUnique.mockResolvedValue({ preferredLanguage: 'tr' });
    const { PATCH } = await import('@/app/api/customer/me/settings/preferences/route');
    const res = await PATCH(req('/api/customer/me/settings/preferences', 'PATCH', { textScale: 'lg' }), {});
    expect(res.status).toBe(200);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
    expect(db.$executeRaw).toHaveBeenCalled();
    const value = db.settings.upsert.mock.calls[0][0].update.value;
    expect(value).toEqual({ preferences: { showLeaderboard: false, highContrast: true, textScale: 'lg' }, notifications: { emailReply: false } });
    const body = await res.json();
    expect(body.data.preferences).toMatchObject({ showLeaderboard: false, a11y: { textScale: 'lg', highContrast: true } });
  });

  it('dil → User.preferredLanguage aynı tx', async () => {
    const { PATCH } = await import('@/app/api/customer/me/settings/preferences/route');
    const res = await PATCH(req('/api/customer/me/settings/preferences', 'PATCH', { language: 'en' }), {});
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { preferredLanguage: 'en' } }));
  });

  it('bilinmeyen alan → 400 VALIDATION, yazım yok', async () => {
    const { PATCH } = await import('@/app/api/customer/me/settings/preferences/route');
    const res = await PATCH(req('/api/customer/me/settings/preferences', 'PATCH', { showProfile: false }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION');
    expect(db.settings.upsert).not.toHaveBeenCalled();
  });

  it('bayi erişemez', async () => {
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const { PATCH } = await import('@/app/api/customer/me/settings/preferences/route');
    const res = await PATCH(req('/api/customer/me/settings/preferences', 'PATCH', { textScale: 'lg' }), {});
    expect(res.status).toBe(403);
    expect(db.settings.upsert).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/customer/me/settings/notifications', () => {
  it('sahte hücre (karakter push) → 400 CELL_NOT_SUPPORTED, yazım yok', async () => {
    db.user.findUnique.mockResolvedValue({ adminTeamRole: null });
    const { PATCH } = await import('@/app/api/customer/me/settings/notifications/route');
    const res = await PATCH(req('/api/customer/me/settings/notifications', 'PATCH', { key: 'character', channel: 'push', enabled: false }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CELL_NOT_SUPPORTED');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('ekip satırı ekip üyesi olmayana yazılamaz', async () => {
    db.user.findUnique.mockResolvedValue({ adminTeamRole: null });
    const { PATCH } = await import('@/app/api/customer/me/settings/notifications/route');
    const res = await PATCH(req('/api/customer/me/settings/notifications', 'PATCH', { key: 'team', channel: 'app', enabled: false }), {});
    expect(res.status).toBe(400);
  });

  it('kampanya push kapatma: mevcut gruplar korunarak birleştirilir', async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ adminTeamRole: null })
      .mockResolvedValueOnce({ notificationPrefs: { campaign: { app: false }, character: { email: false } } });
    const { PATCH } = await import('@/app/api/customer/me/settings/notifications/route');
    const res = await PATCH(req('/api/customer/me/settings/notifications', 'PATCH', { key: 'campaign', channel: 'push', enabled: false }), {});
    expect(res.status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data.notificationPrefs).toEqual({
      campaign: { app: false, push: false },
      character: { email: false },
    });
  });

  it('işletme yanıtı e-postası eski Settings anahtarına yazılır (notify-email okur)', async () => {
    db.user.findUnique.mockResolvedValue({ adminTeamRole: null });
    db.settings.findUnique.mockResolvedValue({ value: { preferences: { showLeaderboard: false } } });
    const { PATCH } = await import('@/app/api/customer/me/settings/notifications/route');
    const res = await PATCH(req('/api/customer/me/settings/notifications', 'PATCH', { key: 'reply', channel: 'email', enabled: false }), {});
    expect(res.status).toBe(200);
    expect(db.settings.upsert.mock.calls[0][0].update.value).toEqual({
      preferences: { showLeaderboard: false },
      notifications: { emailReply: false },
    });
  });
});

describe('PATCH /api/customer/me/settings/profile', () => {
  const preset = avatarList.find((c) => c.category !== 'Bayi')!.items[1];

  it('keyfi URL avatar → 400 AVATAR_NOT_ALLOWED, yazım yok', async () => {
    db.user.findUnique.mockResolvedValue({ name: 'Ayşe', image: null });
    const { PATCH } = await import('@/app/api/customer/me/settings/profile/route');
    const res = await PATCH(req('/api/customer/me/settings/profile', 'PATCH', { image: 'https://saldirgan.example/p.gif' }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('AVATAR_NOT_ALLOWED');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('hazır avatar + ad: tek tx, denetim kaydı', async () => {
    db.user.findUnique.mockResolvedValue({ name: 'Ayşe', image: null });
    db.user.update.mockResolvedValue({ name: 'Ayşe Yılmaz', image: preset });
    const { PATCH } = await import('@/app/api/customer/me/settings/profile/route');
    const res = await PATCH(req('/api/customer/me/settings/profile', 'PATCH', { name: '  Ayşe   Yılmaz ', image: preset }), {});
    expect(res.status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ name: 'Ayşe Yılmaz', image: preset });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'UPDATE_PROFILE', userId: 'c-1' });
  });

  it('kısa ad → 400', async () => {
    const { PATCH } = await import('@/app/api/customer/me/settings/profile/route');
    const res = await PATCH(req('/api/customer/me/settings/profile', 'PATCH', { name: ' a ' }), {});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/customer/me/settings/sessions', () => {
  it('diğer cihazlar: sessionVersion artar, sıcak katman bayatlar, denetim yazılır, çerez yenilenir', async () => {
    const { POST } = await import('@/app/api/customer/me/settings/sessions/route');
    const res = await POST(req('/api/customer/me/settings/sessions', 'POST', { scope: 'others' }), {});
    expect(res.status).toBe(200);
    expect(mockBump).toHaveBeenCalledWith('c-1');
    expect(mockInvalidate).toHaveBeenCalledWith('c-1');
    expect(mockReissue).toHaveBeenCalledWith(expect.anything(), expect.anything(), { sv: 7 }, { maxAge: 3600 });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'REVOKE_SESSIONS', newData: { scope: 'others' } });
    expect((await res.json()).data).toMatchObject({ scope: 'others', reissued: true });
  });

  it('her yerden: çerez yenilenmez', async () => {
    const { POST } = await import('@/app/api/customer/me/settings/sessions/route');
    const res = await POST(req('/api/customer/me/settings/sessions', 'POST', { scope: 'all' }), {});
    expect(res.status).toBe(200);
    expect(mockReissue).not.toHaveBeenCalled();
    expect((await res.json()).data).toMatchObject({ scope: 'all', reissued: false });
  });
});

describe('DELETE /api/customer/me/settings/push-devices/:id', () => {
  it('yalnız kendi aboneliği; arşivler (silmez)', async () => {
    db.pushSubscription.updateMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/customer/me/settings/push-devices/[id]/route');
    const res = await DELETE(req('/api/customer/me/settings/push-devices/ps-1', 'DELETE'), { params: Promise.resolve({ id: 'ps-1' }) });
    expect(res.status).toBe(200);
    expect(db.pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'ps-1', userId: 'c-1', isActive: true },
      data: { isActive: false },
    });
  });

  it('başkasının / yok → 404', async () => {
    db.pushSubscription.updateMany.mockResolvedValue({ count: 0 });
    const { DELETE } = await import('@/app/api/customer/me/settings/push-devices/[id]/route');
    const res = await DELETE(req('/api/customer/me/settings/push-devices/x', 'DELETE'), { params: Promise.resolve({ id: 'x' }) });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/customer/me/settings', () => {
  it('okuma modeli yalnız katalogdaki hücreleri döner; ekip satırı yok', async () => {
    db.user.findUnique.mockResolvedValue({
      name: 'Ayşe',
      email: 'ayse@example.com',
      image: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      password: 'hash',
      preferredLanguage: 'tr',
      notificationPrefs: { campaign: { push: false } },
      customFrameColor: '120',
      twoFactorEnabled: false,
      twoFactorVerifiedAt: null,
      adminTeamRole: null,
      accounts: [{ provider: 'google' }],
      equippedCosmetics: [],
    });
    db.userBirthday.findUnique.mockResolvedValue(null);
    db.pushSubscription.findMany.mockResolvedValue([]);
    db.userBadge.count.mockResolvedValue(2);
    db.userCosmetic.count.mockResolvedValue(1);
    db.auditLog.findFirst.mockResolvedValue(null);
    db.sessionTokenUsage.findUnique.mockResolvedValue({ createdAt: new Date() });
    const { GET } = await import('@/app/api/customer/me/settings/route');
    const res = await GET(req('/api/customer/me/settings', 'GET'), {});
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.notifications.rows.map((r: { key: string }) => r.key)).toEqual(['campaign', 'reply', 'character', 'reminder']);
    expect(data.notifications.rows[0].cells).toEqual([
      { channel: 'app', enabled: true },
      { channel: 'push', enabled: false },
    ]);
    expect(data.showcase).toEqual({ pinned: 3, limit: 4 });
    expect(data.frame.hue).toBe(120);
    expect(data.security).toMatchObject({ hasPassword: true, providers: ['google'], currentDevice: 'Chrome · Android' });
    expect(JSON.stringify(data)).not.toContain('hash');
  });

  it('okuma hatası varsayılan değer olarak DÖNMEZ', async () => {
    db.user.findUnique.mockRejectedValue(new Error('boom'));
    const { GET } = await import('@/app/api/customer/me/settings/route');
    const res = await GET(req('/api/customer/me/settings', 'GET'), {});
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});

describe('geriye uyum: /api/customer/settings (m-lig) ve /api/customer/custom-color', () => {
  it('B1: theme "system" 400 vermez; dil yine yazılır, tema saklanmaz', async () => {
    db.user.findUnique.mockResolvedValue({ preferredLanguage: 'en' });
    const { PATCH } = await import('@/app/api/customer/settings/route');
    const res = await PATCH(req('/api/customer/settings', 'PATCH', { preferences: { theme: 'system', language: 'en', showLeaderboard: false } }), {});
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { preferredLanguage: 'en' } }));
    const value = db.settings.upsert.mock.calls[0][0].update.value;
    expect(value.preferences).toEqual({ language: 'en', showLeaderboard: false });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.preferences.showLeaderboard).toBe(false);
  });

  it('B14: çerçeve rengi doğrulanır', async () => {
    const { POST } = await import('@/app/api/customer/custom-color/route');
    const bad = await POST(req('/api/customer/custom-color', 'POST', { customFrameColor: '9999' }), {});
    expect(bad.status).toBe(400);
    const tooBig = await POST(req('/api/customer/custom-color', 'POST', { customFrameColor: '400' }), {});
    expect(tooBig.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();

    const okRes = await POST(req('/api/customer/custom-color', 'POST', { customFrameColor: '120' }), {});
    expect(okRes.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { customFrameColor: '120' } }));
    expect(mockAdvance).toHaveBeenCalledWith('c-1', 'quest-color-wizard', 1, 'increment');

    const reset = await POST(req('/api/customer/custom-color', 'POST', { customFrameColor: null }), {});
    expect(reset.status).toBe(200);
    expect(db.user.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { customFrameColor: null } }));
  });
});
