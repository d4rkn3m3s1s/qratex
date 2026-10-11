/**
 * Native push (FCM HTTP v1 + APNs) ve tek cephe `sendPush` — fetch/APNs taşıması mock.
 */
import { generateKeyPairSync } from 'node:crypto';

const findMany = jest.fn();
const updateMany = jest.fn().mockResolvedValue({ count: 0 });
const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
const createMany = jest.fn().mockResolvedValue({ count: 0 });
jest.mock('@/lib/prisma', () => {
  const p = {
    pushSubscription: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a), deleteMany: (...a: unknown[]) => deleteMany(...a) },
    pushNotificationLog: { createMany: (...a: unknown[]) => createMany(...a) },
  };
  return { __esModule: true, default: p, prisma: p };
});
const isUserChannelEnabled = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/notify-prefs-server', () => ({ isUserChannelEnabled: (...a: unknown[]) => isUserChannelEnabled(...a) }));
jest.mock('web-push', () => ({ __esModule: true, default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() } }));

import {
  __resetNativePushCaches,
  __setApnsTransport,
  decodeNativeEndpoint,
  encodeNativeEndpoint,
  sendApns,
  sendFcm,
} from '@/lib/push-native';
import { sendPush } from '@/lib/push';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const FCM_TOKEN = 'fcmTokenAAAAAAAAAAAAAAAAAAAA:APA91b-xyz';
const APNS_TOKEN = 'a'.repeat(64);

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

function setFcmEnv() {
  process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'qx-proj', client_email: 'svc@qx.iam', private_key: rsa });
}
function setApnsEnv() {
  Object.assign(process.env, { APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM1', APNS_KEY_P8: ec, APNS_BUNDLE_ID: 'com.qratex.app' });
}
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  __resetNativePushCaches();
  __setApnsTransport(null);
  for (const k of ['FCM_SERVICE_ACCOUNT_JSON', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY_P8', 'APNS_BUNDLE_ID', 'APNS_PRODUCTION']) delete process.env[k];
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.clearAllMocks();
  isUserChannelEnabled.mockResolvedValue(true);
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('endpoint kodlama', () => {
  it('gidiş-dönüş ve geçersiz jeton reddi', () => {
    expect(decodeNativeEndpoint(encodeNativeEndpoint('fcm', FCM_TOKEN))).toEqual({ platform: 'fcm', token: FCM_TOKEN });
    expect(decodeNativeEndpoint('native:apns:kisa')).toBeNull();
    expect(decodeNativeEndpoint('native:xyz:' + APNS_TOKEN)).toBeNull();
    expect(decodeNativeEndpoint('https://fcm.googleapis.com/x')).toBeNull();
  });
});

describe('sendFcm', () => {
  it('env yoksa sessizce atlar (null, fetch yok)', async () => {
    expect(await sendFcm(FCM_TOKEN, { title: 't', body: 'b' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('oauth jetonu alır, HTTP v1 mesajı yollar, jetonu önbellekler', async () => {
    setFcmEnv();
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'ya29', expires_in: 3600 })).mockResolvedValue(json(200, { name: 'm' }));
    expect(await sendFcm(FCM_TOKEN, { title: 'Başlık', body: 'Gövde', url: '/x', kind: 'card_found' })).toEqual({ ok: true });
    expect(await sendFcm(FCM_TOKEN, { title: 'B2', body: 'G2' })).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 oauth + 2 mesaj
    const [oauthUrl, oauthInit] = fetchMock.mock.calls[0];
    expect(oauthUrl).toBe('https://oauth2.googleapis.com/token');
    expect(String(oauthInit.body)).toContain('grant_type=urn');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/qx-proj/messages:send');
    expect(init.headers.Authorization).toBe('Bearer ya29');
    const msg = JSON.parse(init.body).message;
    expect(msg).toMatchObject({ token: FCM_TOKEN, notification: { title: 'Başlık', body: 'Gövde' }, data: { url: '/x', kind: 'card_found' } });
  });

  it('UNREGISTERED → stale', async () => {
    setFcmEnv();
    fetchMock
      .mockResolvedValueOnce(json(200, { access_token: 'ya29' }))
      .mockResolvedValueOnce(json(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
    expect(await sendFcm(FCM_TOKEN, { title: 't', body: 'b' })).toMatchObject({ ok: false, stale: true });
  });

  it('ağ hatası → stale değil, fırlatmaz', async () => {
    setFcmEnv();
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    expect(await sendFcm(FCM_TOKEN, { title: 't', body: 'b' })).toMatchObject({ ok: false, stale: false });
  });
});

describe('sendApns', () => {
  it('env yoksa null', async () => {
    const t = jest.fn();
    __setApnsTransport(t);
    expect(await sendApns(APNS_TOKEN, { title: 't', body: 'b' })).toBeNull();
    expect(t).not.toHaveBeenCalled();
  });

  it('ES256 JWT + doğru başlıklar (sandbox)', async () => {
    setApnsEnv();
    const t = jest.fn().mockResolvedValue({ status: 200, body: '' });
    __setApnsTransport(t);
    expect(await sendApns(APNS_TOKEN, { title: 'T', body: 'B', url: '/u' })).toEqual({ ok: true });
    const req = t.mock.calls[0][0];
    expect(req.url).toBe(`https://api.sandbox.push.apple.com/3/device/${APNS_TOKEN}`);
    expect(req.headers['apns-topic']).toBe('com.qratex.app');
    const jwt = req.headers.authorization.replace('bearer ', '');
    const [h, , sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(Buffer.from(sig, 'base64url').length).toBe(64); // ieee-p1363
    expect(JSON.parse(req.body)).toMatchObject({ aps: { alert: { title: 'T', body: 'B' } }, url: '/u' });
  });

  it('410 / BadDeviceToken → stale', async () => {
    setApnsEnv();
    __setApnsTransport(jest.fn().mockResolvedValue({ status: 400, body: '{"reason":"BadDeviceToken"}' }));
    expect(await sendApns(APNS_TOKEN, { title: 't', body: 'b' })).toMatchObject({ ok: false, stale: true });
  });
});

describe('sendPush cephesi', () => {
  const rows = [
    { id: 's1', endpoint: encodeNativeEndpoint('fcm', FCM_TOKEN), p256dh: 'native', auth: 'native' },
    { id: 's2', endpoint: encodeNativeEndpoint('apns', APNS_TOKEN), p256dh: 'native', auth: 'native' },
    { id: 's3', endpoint: 'http://10.0.0.5/evil', p256dh: 'x', auth: 'y' },
  ];

  it('tercih kapalıysa hiç sorgu/gönderim yok', async () => {
    isUserChannelEnabled.mockResolvedValue(false);
    expect(await sendPush('u1', { title: 't', body: 'b', kind: 'campaign-x' })).toBe(false);
    expect(isUserChannelEnabled).toHaveBeenCalledWith('u1', 'campaign-x', 'push');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('env yokken native sessizce atlanır, SSRF kaydı pasifleşir', async () => {
    findMany.mockResolvedValue(rows);
    expect(await sendPush('u1', { title: 't', body: 'b' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ['s3'] } }, data: { isActive: false } });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('FCM + APNs gönderir, ölü APNs jetonunu siler, log yazar', async () => {
    setFcmEnv();
    setApnsEnv();
    findMany.mockResolvedValue(rows.slice(0, 2));
    fetchMock.mockResolvedValueOnce(json(200, { access_token: 'ya29' })).mockResolvedValue(json(200, {}));
    __setApnsTransport(jest.fn().mockResolvedValue({ status: 410, body: '{"reason":"Unregistered"}' }));
    expect(await sendPush('u1', { title: 't', body: 'b' })).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s2'] } } });
    const logs = createMany.mock.calls[0][0].data;
    expect(logs.map((l: { status: string }) => l.status).sort()).toEqual(['FAILED', 'SENT']);
  });
});
