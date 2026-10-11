/**
 * Entegrasyon Merkezi (/admin/integrations) sunucu mantığı.
 *  - Saf: ApiKey/Webhook/Partner meta zarfı (eski dizi + v2), yaşam döngüsü, IP izin listesi,
 *    SSRF şekil + DNS denetimi, imza sırrı şifreleme.
 *  - Partner API doğrulaması: modül kill-switch, iptal/süre, IP, partner aktifliği, kapsam.
 *  - Servis: anahtar oluştur (hash + bir kez ham), iptal 409, döndürme, webhook URL/çift kayıt, arşiv.
 *  - Dispatcher: geçici hatada yeniden deneme, 4xx'te durma, yönlendirme başarısız, imza başlıkları.
 * Prisma mock'lanır; gerçek DB'ye ve ağa gidilmez.
 */
jest.mock('@/lib/prisma', () => {
  const p = require('../helpers/prisma-proxy');
  const queryRaw = jest.fn().mockResolvedValue([]);
  const prisma = new Proxy(p.prisma, {
    get(t: Record<string, unknown>, k: string) {
      return k === '$queryRaw' ? queryRaw : t[k];
    },
  });
  return { ...p, prisma, __queryRaw: queryRaw };
});
jest.mock('@prisma/client', () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }) },
}));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/redis', () => ({
  redisIncrWithTtl: jest.fn().mockResolvedValue(null),
  redisGetJson: jest.fn().mockResolvedValue(null),
  isRedisConfigured: jest.fn().mockReturnValue(false),
}));
jest.mock('@/lib/safe-webhook-post', () => ({ ...jest.requireActual('@/lib/safe-webhook-post'), safeWebhookPost: jest.fn() }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn().mockResolvedValue({}) }));
jest.mock('@/lib/innovation-config', () => ({ getInnovationPlatformConfig: jest.fn().mockResolvedValue({ features: { partnerDigestApi: true } }) }));

import { db, resetDb } from '../helpers/prisma-proxy';
import { getModuleControls } from '@/lib/module-gate';
import { CreateKeyBody, isLiveWebhookEvent } from '@/lib/integrations/contract';
import { ipAllowed, ipMatches, keyLifecycle, parseKeyMeta, parsePartnerMeta, parseWebhookMeta, serializeKeyMeta, serializePartnerMeta } from '@/lib/integrations/meta';
import { assertSafeWebhookUrl, checkUrlShape, isNonPublicIp } from '@/lib/integrations/url-safety';
import { generateWebhookSecret, openSecret, sealSecret } from '@/lib/integrations/secret-box';
import { authenticatePartnerApiKey, hashApiKey } from '@/lib/partner-api-auth';
import { createKey, createWebhook, revokeKey, rollKey, updateWebhook } from '@/lib/integrations/server';
import { deliverWithRetry, signV2 } from '@/lib/webhook-dispatch';
import { safeWebhookPost } from '@/lib/safe-webhook-post';

const ctx = { actor: { id: 'admin1', email: 'a@x.com', role: 'ADMIN', name: 'Ada' }, request: { headers: { get: () => null } } };
const NOW = new Date('2026-10-11T10:00:00.000Z');

beforeEach(() => {
  resetDb();
  (getModuleControls as jest.Mock).mockResolvedValue({});
});

describe('meta zarfı', () => {
  it('eski dizi kapsamını okur, v2 alanlarını boş verir', () => {
    const m = parseKeyMeta(['read:partner_digest']);
    expect(m.scopes).toEqual(['read:partner_digest']);
    expect(m.revokedAt).toBeNull();
    expect(keyLifecycle(m, NOW)).toBe('active');
  });
  it('v2: iptal ve süre dolumu', () => {
    const base = parseKeyMeta(serializeKeyMeta({ ...parseKeyMeta(null), scopes: ['*'], expiresAt: '2026-10-01T00:00:00.000Z' }));
    expect(keyLifecycle(base, NOW)).toBe('expired');
    expect(keyLifecycle({ ...base, revokedAt: NOW.toISOString() }, NOW)).toBe('revoked');
  });
  it('webhook eski dizi → events', () => {
    expect(parseWebhookMeta(['feedback.created', 'badge.earned']).events).toEqual(['feedback.created', 'badge.earned']);
    expect(isLiveWebhookEvent('badge.earned')).toBe(false);
    expect(isLiveWebhookEvent('incident.created')).toBe(true);
  });
  it('partner metadata bilinmeyen alanları korur', () => {
    const m = parsePartnerMeta({ foo: 1, dealerIds: ['d1'] });
    expect(serializePartnerMeta({ ...m, notes: 'n' })).toMatchObject({ foo: 1, dealerIds: ['d1'], notes: 'n' });
  });
  it('IP izin listesi: CIDR, tam eşleşme, boş liste serbest, bilinmeyen IP reddedilir', () => {
    expect(ipMatches('10.1.2.3', '10.1.0.0/16')).toBe(true);
    expect(ipMatches('10.2.0.1', '10.1.0.0/16')).toBe(false);
    expect(ipMatches('::ffff:203.0.113.5', '203.0.113.5')).toBe(true);
    expect(ipAllowed(null, [])).toBe(true);
    expect(ipAllowed(null, ['1.2.3.4'])).toBe(false);
  });
  it('tam erişim kapsamı ayrı onay ister', () => {
    expect(CreateKeyBody.safeParse({ name: 'POS', scopes: ['*'], expiresInDays: 90 }).success).toBe(false);
    expect(CreateKeyBody.safeParse({ name: 'POS', scopes: ['*'], confirmFullAccess: true, expiresInDays: 90 }).success).toBe(true);
    expect(CreateKeyBody.safeParse({ name: 'POS', scopes: ['write:everything'], expiresInDays: 90 }).success).toBe(false);
  });
});

describe('SSRF denetimi', () => {
  it('özel/ayrılmış IP aralıkları', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(isNonPublicIp(ip)).toBe(true);
    }
    expect(isNonPublicIp('8.8.8.8')).toBe(false);
  });
  it('şekil: http, localhost, kimlik bilgisi reddedilir', () => {
    expect(checkUrlShape('http://example.com/h').ok).toBe(false);
    expect(checkUrlShape('https://localhost/h').ok).toBe(false);
    expect(checkUrlShape('https://u:p@example.com/h').ok).toBe(false);
    expect(checkUrlShape('https://169.254.169.254/latest').ok).toBe(false);
    expect(checkUrlShape('https://example.com/h').ok).toBe(true);
  });
  it('DNS özel adrese çözülürse reddeder', async () => {
    await expect(assertSafeWebhookUrl('https://evil.example', async () => ['10.0.0.5'])).resolves.toMatchObject({ ok: false });
    await expect(assertSafeWebhookUrl('https://good.example', async () => ['93.184.216.34'])).resolves.toMatchObject({ ok: true });
    await expect(assertSafeWebhookUrl('https://nx.example', async () => { throw new Error('ENOTFOUND'); })).resolves.toMatchObject({ ok: false });
  });
});

describe('imza sırrı kasası', () => {
  it('şifreler/çözer, eski düz metni aynen okur, kurcalanmışı reddeder', () => {
    const s = generateWebhookSecret();
    expect(s.startsWith('whsec_')).toBe(true);
    const sealed = sealSecret(s);
    expect(sealed).not.toContain(s);
    expect(openSecret(sealed)).toBe(s);
    expect(openSecret('plain-old')).toBe('plain-old');
    expect(openSecret(null)).toBeNull();
    expect(openSecret(sealed.slice(0, -3) + 'AAA')).toEqual({ error: expect.any(String) });
  });
});

describe('partner API doğrulaması', () => {
  const raw = 'qrx_testtesttesttesttest';
  const row = (scope: unknown) => ({ id: 'k1', scope });

  it('dış API modülü kapalıysa 503', async () => {
    (getModuleControls as jest.Mock).mockResolvedValue({ api_keys: false });
    const r = await authenticatePartnerApiKey(`Bearer ${raw}`);
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
  it('hash ile arar; iptal edilen anahtar 401', async () => {
    db.apiKey.findFirst.mockResolvedValue(row({ v: 2, scopes: ['read:partner_digest'], revokedAt: '2026-10-01T00:00:00.000Z' }));
    const r = await authenticatePartnerApiKey(`Bearer ${raw}`, 'read:partner_digest');
    expect(db.apiKey.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { keyHash: hashApiKey(raw) } }));
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it('kapsam eksikse 403, IP izinli değilse 403', async () => {
    db.apiKey.findFirst.mockResolvedValue(row([]));
    expect(await authenticatePartnerApiKey(`Bearer ${raw}`, 'read:partner_digest')).toMatchObject({ ok: false, status: 403 });
    db.apiKey.findFirst.mockResolvedValue(row({ v: 2, scopes: ['*'], ipAllowlist: ['1.2.3.4'] }));
    expect(await authenticatePartnerApiKey(`Bearer ${raw}`, 'read:partner_digest', { ip: '5.6.7.8' })).toMatchObject({ ok: false, status: 403 });
  });
  it('pasif partnerin anahtarı 403', async () => {
    db.apiKey.findFirst.mockResolvedValue(row({ v: 2, scopes: ['*'], partnerId: 'p1' }));
    db.partner.findUnique.mockResolvedValue({ isActive: false, metadata: {} });
    expect(await authenticatePartnerApiKey(`Bearer ${raw}`)).toMatchObject({ ok: false, status: 403 });
  });
  it('geçerli anahtar: bayi kapsamı + partner bayileri döner, lastUsedAt yazılır', async () => {
    db.apiKey.findFirst.mockResolvedValue(row({ v: 2, scopes: ['read:partner_digest'], dealerId: 'd1', partnerId: 'p1' }));
    db.partner.findUnique.mockResolvedValue({ isActive: true, metadata: { dealerIds: ['d1', 'd2'] } });
    db.apiKey.update.mockResolvedValue({});
    const r = await authenticatePartnerApiKey(`Bearer ${raw}`, 'read:partner_digest');
    expect(r).toMatchObject({ ok: true, apiKeyId: 'k1', dealerId: 'd1', partnerId: 'p1', partnerDealerIds: ['d1', 'd2'] });
    expect(db.apiKey.update).toHaveBeenCalled();
  });
});

describe('anahtar servisi', () => {
  const keyRow = (scope: unknown, extra: Record<string, unknown> = {}) => ({
    id: 'k1',
    name: 'POS',
    keyPrefix: 'qrx_abcdefgh',
    scope,
    lastUsedAt: null,
    createdAt: NOW,
    createdBy: { name: 'Ada', email: 'a@x.com' },
    ...extra,
  });

  it('oluşturur: yalnız hash saklanır, ham anahtar bir kez döner, denetim aynı transaction', async () => {
    db.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => keyRow(data.scope, { keyPrefix: data.keyPrefix }));
    db.auditLog.create.mockResolvedValue({});
    db.user.findMany.mockResolvedValue([]);
    db.partner.findMany.mockResolvedValue([]);
    const r = await createKey(ctx, { name: 'POS', scopes: ['read:partner_digest'], expiresInDays: 90 }, NOW);
    const data = db.apiKey.create.mock.calls[0][0].data;
    expect(data.keyHash).toBe(hashApiKey(r.rawKey));
    expect(JSON.stringify(data)).not.toContain(r.rawKey);
    expect(r.key.scopes).toEqual(['read:partner_digest']);
    expect(r.key.expiresAt).toBe(new Date(NOW.getTime() + 90 * 86_400_000).toISOString());
    expect(r.key.display.endsWith(r.rawKey.slice(-4))).toBe(true);
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CREATE_API_KEY' }) }));
  });

  it('iptal: zaten iptal edilmişse 409; değilse meta yazılır, kayıt silinmez', async () => {
    db.apiKey.findUnique.mockResolvedValue(keyRow({ v: 2, scopes: ['*'], revokedAt: NOW.toISOString() }));
    await expect(revokeKey(ctx, 'k1', 'sızıntı', NOW)).rejects.toMatchObject({ code: 'CONFLICT' });
    db.apiKey.findUnique.mockResolvedValue(keyRow(['read:partner_digest']));
    db.apiKey.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => keyRow(data.scope));
    db.user.findMany.mockResolvedValue([]);
    db.partner.findMany.mockResolvedValue([]);
    const it = await revokeKey(ctx, 'k1', 'sızıntı', NOW);
    expect(it.status).toBe('revoked');
    expect(it.revokeReason).toBe('sızıntı');
    expect(db.apiKey.delete).not.toHaveBeenCalled();
  });

  it('döndürme: yeni anahtar aynı kapsamla, eskisi ek süre sonunda dolar', async () => {
    db.apiKey.findUnique.mockResolvedValue(keyRow({ v: 2, scopes: ['read:partner_digest'], dealerId: null }));
    db.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => keyRow(data.scope, { id: 'k2', keyPrefix: data.keyPrefix }));
    db.apiKey.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => keyRow(data.scope));
    db.auditLog.create.mockResolvedValue({});
    db.user.findMany.mockResolvedValue([]);
    db.partner.findMany.mockResolvedValue([]);
    const r = await rollKey(ctx, 'k1', 24, NOW);
    expect(r.key.scopes).toEqual(['read:partner_digest']);
    expect(r.previous.expiresAt).toBe(new Date(NOW.getTime() + 24 * 3_600_000).toISOString());
    expect(r.previous.rolledToId).toBe('k2');
  });
});

describe('webhook servisi', () => {
  it('özel ağ adresini reddeder (VALIDATION)', async () => {
    await expect(createWebhook(ctx, { url: 'https://localhost/x', events: ['feedback.created'] }, NOW)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('arşivleme: pasifleştirir ve archivedAt yazar', async () => {
    const row = { id: 'w1', url: 'https://hooks.example.com/a', secret: null, events: ['feedback.created'], isActive: true, createdAt: NOW, createdBy: null };
    db.webhook.findUnique.mockResolvedValue(row);
    db.webhook.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }));
    db.auditLog.create.mockResolvedValue({});
    db.partner.findMany.mockResolvedValue([]);
    const w = await updateWebhook(ctx, 'w1', { archived: true }, NOW);
    expect(w.status).toBe('archived');
    expect(db.webhook.update.mock.calls[0][0].data.isActive).toBe(false);
  });
});

describe('dispatcher teslimi', () => {
  const post = safeWebhookPost as jest.MockedFunction<typeof safeWebhookPost>;
  afterEach(() => post.mockReset());
  const target = { id: 'w1', url: 'https://93.184.216.34/hook', secret: 'whsec_abc' };

  it('5xx sonrası yeniden dener ve başarılı olur; imza başlıkları gönderilir; teslim safeWebhookPost ile', async () => {
    post.mockResolvedValueOnce({ ok: false, status: 502, body: 'x' }).mockResolvedValueOnce({ ok: true, status: 200, body: 'ok' });
    const o = await deliverWithRetry(target, 'feedback.created', '{"a":1}', { wait: async () => undefined });
    expect(o).toMatchObject({ ok: true, status: 200, attempts: 2 });
    const h = post.mock.calls[1][2];
    const t = Number(h['X-Qratex-Timestamp']);
    expect(h['X-Qratex-Signature-V2']).toBe(`t=${t},v1=${signV2('whsec_abc', t, '{"a":1}')}`);
    expect(h['X-Qratex-Delivery']).toBe(o.deliveryId);
    expect(post.mock.calls[1][3]).toMatchObject({ timeoutMs: expect.any(Number), maxBytes: expect.any(Number) });
  });

  it('4xx yeniden denenmez; 3xx başarısız sayılır', async () => {
    post.mockResolvedValue({ ok: false, status: 400, body: 'no' });
    expect(await deliverWithRetry(target, 'feedback.created', '{}', { wait: async () => undefined })).toMatchObject({ ok: false, attempts: 1, errorKind: 'http_4xx' });
    post.mockResolvedValue({ ok: false, status: 302, body: '' });
    expect(await deliverWithRetry(target, 'feedback.created', '{}', { wait: async () => undefined })).toMatchObject({ ok: false, errorKind: 'redirect' });
  });

  it('bağlantı anında SSRF (DNS rebinding) blocked_url olur, yeniden denenmez', async () => {
    post.mockRejectedValue(Object.assign(new Error('SSRF: x özel/iç adrese çözülüyor'), { code: 'ESSRF' }));
    expect(await deliverWithRetry(target, 'feedback.created', '{}', { wait: async () => undefined })).toMatchObject({ ok: false, attempts: 1, errorKind: 'blocked_url' });
  });

  it('engellenen hedefe hiç istek atılmaz', async () => {
    const o = await deliverWithRetry({ ...target, url: 'https://10.0.0.1/x' }, 'feedback.created', '{}', { wait: async () => undefined });
    expect(o).toMatchObject({ ok: false, errorKind: 'blocked_url' });
    expect(post).not.toHaveBeenCalled();
  });

  it('IPv6 biçimleri ve kimlik bilgili URL reddedilir', () => {
    for (const ip of ['::a9fe:a9fe', '::ffff:a9fe:a9fe', '[::ffff:127.0.0.1]', '2002:a9fe:a9fe::1', '64:ff9b::a9fe:a9fe', 'fe80::1']) expect(isNonPublicIp(ip)).toBe(true);
    expect(checkUrlShape('https://[::ffff:7f00:1]/h').ok).toBe(false);
    expect(checkUrlShape('https://user@example.com/h').ok).toBe(false);
  });
});
