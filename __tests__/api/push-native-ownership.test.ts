/**
 * Native push (Capacitor FCM/APNs) jeton sahipliği regresyonları:
 *  1) Başka hesaba bağlı jeton bayat oturumla DEVRALINAMAZ (abonelik ele geçirme); taze girişle devralınır.
 *  2) Oturum iptali (bumpSessionVersion) kullanıcının native jetonlarını düşürür.
 *  3) sendPush sahibi alıcı olmayan kayda göndermez.
 *  4) Kardeş uç eşitliği: rol listesi, zod, kullanıcı başına oran sınırı.
 */
const pushSubscription = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
const prismaMock = {
  pushSubscription,
  user: { update: jest.fn() },
  pushNotificationLog: { createMany: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock, default: prismaMock }));

class FakeApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
jest.mock('@/lib/http/define-route', () => ({
  ApiError: FakeApiError,
  ok: (x: unknown) => x,
  defineRoute: (def: unknown, handler: (ctx: unknown) => unknown) => Object.assign((ctx: unknown) => handler(ctx), { def }),
}));

const sendNative = jest.fn();
jest.mock('@/lib/push-native', () => ({
  ...jest.requireActual('@/lib/push-native'),
  sendNative: (...a: unknown[]) => sendNative(...a),
}));
jest.mock('@/lib/notify-prefs-server', () => ({ isUserChannelEnabled: jest.fn().mockResolvedValue(true) }));

const TOKEN = 'fcmTokenAAAAAAAAAAAAAAAAAAAAAAAA';
const request = { headers: new Headers({ 'user-agent': 'test' }) };
const ctx = (userId: string, authAt: number) => ({
  body: { platform: 'android', token: TOKEN },
  user: { id: userId, role: 'CUSTOMER' },
  session: { user: { id: userId }, authAt },
  request,
});

beforeEach(() => {
  jest.clearAllMocks();
  pushSubscription.findMany.mockResolvedValue([]);
  pushSubscription.update.mockResolvedValue({ id: 's1' });
  pushSubscription.create.mockResolvedValue({ id: 's2' });
  pushSubscription.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/push/native', () => {
  it('başka hesaba bağlı jetonu BAYAT oturumla devralmayı reddeder', async () => {
    const { POST } = await import('@/app/api/push/native/route');
    pushSubscription.findUnique.mockResolvedValue({ id: 's1', userId: 'victim' });
    await expect((POST as any)(ctx('attacker', Date.now() - 60 * 60_000))).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect((POST as any)(ctx('attacker', 0))).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(pushSubscription.update).not.toHaveBeenCalled();
  });

  it('taze girişle devralır (tek cihaz = en son doğrulanmış giriş)', async () => {
    const { POST } = await import('@/app/api/push/native/route');
    pushSubscription.findUnique.mockResolvedValue({ id: 's1', userId: 'old' });
    await (POST as any)(ctx('new', Date.now() - 60_000));
    expect(pushSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' }, data: expect.objectContaining({ userId: 'new' }) }));
  });

  it('kendi jetonunu bayat oturumla da yeniler; yeni jetonu oturum kullanıcısına yaratır', async () => {
    const { POST } = await import('@/app/api/push/native/route');
    pushSubscription.findUnique.mockResolvedValueOnce({ id: 's1', userId: 'me' });
    await (POST as any)(ctx('me', 0));
    expect(pushSubscription.update).toHaveBeenCalled();
    pushSubscription.findUnique.mockResolvedValueOnce(null);
    await (POST as any)(ctx('me', 0));
    expect(pushSubscription.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'me' }) }));
  });

  it('kardeş uç eşitliği: roller, zod şeması ve kullanıcı başına oran sınırı', async () => {
    const { POST, DELETE } = await import('@/app/api/push/native/route');
    const def = (POST as any).def;
    expect(def.roles).toEqual(['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN']);
    expect(def.schema.safeParse({ platform: 'android', token: 'x' }).success).toBe(false);
    expect(def.schema.safeParse({ platform: 'android', token: TOKEN }).success).toBe(true);
    expect(def.rateLimit).toMatchObject({ by: 'user' });
    expect((DELETE as any).def.roles).toEqual(def.roles);
  });

  it('DELETE yalnız oturum kullanıcısının kaydını düşürür', async () => {
    const { DELETE } = await import('@/app/api/push/native/route');
    await (DELETE as any)({ body: { platform: 'android', token: TOKEN }, user: { id: 'me' } });
    expect(pushSubscription.updateMany.mock.calls[0][0].where.userId).toBe('me');
  });
});

describe('oturum iptali', () => {
  it('bumpSessionVersion native jetonları devre dışı bırakır', async () => {
    const { bumpSessionVersion } = await import('@/lib/auth/session-version');
    prismaMock.user.update.mockResolvedValue({ sessionVersion: 3 });
    await bumpSessionVersion('u1');
    expect(pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isActive: true, endpoint: { startsWith: 'native:' } },
      data: { isActive: false },
    });
  });
});

describe('sendPush sahiplik savunması', () => {
  it('sahibi alıcı olmayan native kayda göndermez', async () => {
    const { sendPush } = await import('@/lib/push');
    pushSubscription.findMany.mockResolvedValue([
      { id: 'x', userId: 'someone-else', endpoint: `native:fcm:${TOKEN}`, p256dh: 'native', auth: 'native', isActive: true },
    ]);
    sendNative.mockResolvedValue({ ok: true });
    await sendPush('me', { title: 't', body: 'b' } as any);
    expect(sendNative).not.toHaveBeenCalled();
  });
});
