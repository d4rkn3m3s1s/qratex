/**
 * Kalite turu (a-guven-kvkk): kendi uçları olan anahtarlar genel `/api/admin/settings` ucundan
 * YAZILAMAZ. Önceden bir ADMIN genel toplu uçla `platform_maintenance`'ı Redis'e yayınlamadan
 * "açık" yazabiliyor, kayıt/Google anahtarlarını onaysız değiştirebiliyor, `trust.scan.last`'ı
 * sahte "son tarama" özetiyle, `trust.rules.v1`'i gerekçesiz ve 409'suz doldurabiliyordu.
 * Prisma mock'lanır; gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'admin-1', role: 'ADMIN', email: 'a@x.com' } } })),
}));
jest.mock('@/lib/rate-limit', () => ({ checkAdminRateLimit: () => ({ ok: true }) }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }));
jest.mock('@/lib/revalidate-public-theme', () => ({ revalidatePublicThemeSettings: jest.fn() }));

import { db, resetDb } from '../helpers/prisma-proxy';
import { isDedicatedSettingKey } from '@/lib/platform-settings/registry';

function req(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/admin/settings', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetDb();
});

describe('isDedicatedSettingKey', () => {
  it('yan etkili kayıt defteri anahtarları ve trust.* korunur', () => {
    for (const k of ['platform_maintenance', 'platform_registration_open', 'platform_google_auth', 'trust.rules.v1', 'trust.scan.last', ' trust.rules.v1 ']) {
      expect(isDedicatedSettingKey(k)).toBe(true);
    }
  });
  it('tema / ajan / eski toplu istemci anahtarları etkilenmez', () => {
    for (const k of ['agentWeights', 'backgroundEffect', 'enableMagicLink', 'customColors', 'trustScoreBoost', 42, null]) {
      expect(isDedicatedSettingKey(k)).toBe(false);
    }
  });
});

describe('genel /api/admin/settings yazma yasağı', () => {
  it('POST: bakım modu genel uçtan açılamaz (403), hiçbir şey yazılmaz', async () => {
    const { POST } = await import('@/app/api/admin/settings/route');
    const res = await POST(req('POST', { settings: [{ key: 'platform_maintenance', value: { enabled: true, message: '', plannedEndAt: null } }] }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PROTECTED_SETTING');
    expect(db.settings.upsert).not.toHaveBeenCalled();
    expect(db.settings.update).not.toHaveBeenCalled();
    expect(db.settings.create).not.toHaveBeenCalled();
  });

  it('POST: sahte tarama özeti (trust.scan.last) yazılamaz (403)', async () => {
    const { POST } = await import('@/app/api/admin/settings/route');
    const res = await POST(req('POST', { settings: [{ key: 'agentWeights', value: { a: 1 } }, { key: 'trust.scan.last', value: { at: '2026-10-11T00:00:00Z', created: 0 } }] }));
    expect(res.status).toBe(403);
    expect(db.settings.upsert).not.toHaveBeenCalled();
  });

  it('PUT: kayıt anahtarı genel uçtan değiştirilemez (403)', async () => {
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(req('PUT', { key: 'platform_registration_open', value: false, category: 'auth' }));
    expect(res.status).toBe(403);
    expect(db.settings.upsert).not.toHaveBeenCalled();
  });
});

describe('gizli kapı: "Tüm kapı kayıtları" bağlantısı', () => {
  it('denetim merkezini kapı EYLEMLERİYLE süzer (ayar değişikliği Settings varlığında olduğu için varlık süzgeci onu kaçırıyordu)', async () => {
    const { ADMIN_GATE_AUDIT } = await import('@/lib/admin-gate');
    const { GATE_AUDIT_HREF } = await import('@/components/admin/a-ayarlar-kapi/gate-settings');
    const url = new URL(GATE_AUDIT_HREF, 'http://localhost');
    expect(url.pathname).toBe('/admin/audit');
    expect(url.searchParams.get('varlik')).toBeNull();
    expect(new Set(url.searchParams.get('eylem')!.split(','))).toEqual(new Set(Object.values(ADMIN_GATE_AUDIT)));
  });
});
