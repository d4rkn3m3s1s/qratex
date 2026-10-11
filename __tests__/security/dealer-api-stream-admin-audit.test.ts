/**
 * guvenlik-bayi-api O5 (SSE bağlantı sınırı) + O6 (yönetici kiracılar arası erişim denetimi).
 */
const rateLimit = jest.fn(async (_bucket: string, _max: number, _windowMs: number) => ({ ok: true, remaining: 1 }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (bucket: string, max: number, windowMs: number) => rateLimit(bucket, max, windowMs),
}));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'cdealer000000000000000001', role: 'DEALER' } } })),
}));
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async () => null),
  redisSetJson: jest.fn(async () => undefined),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { create: jest.fn(async () => ({})) },
    user: { findUnique: jest.fn(async () => ({ role: 'DEALER' })) },
    notification: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
  },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GET as stream } from '@/app/api/dealer/notifications/stream/route';
import {
  MAX_CURSOR_AGE_MS,
  STREAM_OPENS_PER_MINUTE,
  clampStreamCursor,
  nextReconnectDelayMs,
} from '@/lib/notification-stream-policy';
import { ADMIN_TENANT_ACCESS_ACTION, recordAdminTenantAccess } from '@/lib/auth/admin-tenant-audit';
import { resolveDealerScope } from '@/lib/auth/scope';

const auditCreate = (prisma as unknown as { auditLog: { create: jest.Mock } }).auditLog.create;

beforeEach(() => {
  rateLimit.mockClear();
  rateLimit.mockImplementation(async () => ({ ok: true, remaining: 1 }));
  auditCreate.mockClear();
});

describe('O5 — bildirim akışı bağlantı sınırı', () => {
  it('kullanıcı başına açılış sayacı aşılınca 429 + Retry-After, akış açılmaz', async () => {
    rateLimit.mockImplementationOnce(async () => ({ ok: false, remaining: 0, retryAfterMs: 42_000 } as never));
    const res = await stream(new NextRequest('http://localhost/api/dealer/notifications/stream'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(rateLimit).toHaveBeenCalledWith('notif-stream:cdealer000000000000000001', STREAM_OPENS_PER_MINUTE, 60_000);
  });

  it('imleç 24 saatten eskiye ve geleceğe gidemez; geçersiz imleç = şimdi', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    expect(clampStreamCursor('2020-01-01T00:00:00Z', now).getTime()).toBe(now.getTime() - MAX_CURSOR_AGE_MS);
    expect(clampStreamCursor('2030-01-01T00:00:00Z', now).getTime()).toBe(now.getTime());
    expect(clampStreamCursor('çöp', now).getTime()).toBe(now.getTime());
    expect(clampStreamCursor(null, now).getTime()).toBe(now.getTime());
    const recent = new Date(now.getTime() - 60_000);
    expect(clampStreamCursor(recent.toISOString(), now).getTime()).toBe(recent.getTime());
  });

  it('istemci yeniden bağlanması üstel geri çekilir (3 sn → 60 sn tavan)', () => {
    expect(nextReconnectDelayMs(0)).toBe(3_000);
    expect(nextReconnectDelayMs(1)).toBe(6_000);
    expect(nextReconnectDelayMs(3)).toBe(24_000);
    expect(nextReconnectDelayMs(10)).toBe(60_000);
  });
});

describe('O6 — yönetici kiracılar arası erişim denetimi', () => {
  it('ilk erişimde denetim kaydı yazılır, pencere içindeki tekrar yazılmaz', async () => {
    expect(await recordAdminTenantAccess({ adminId: 'cadmin', dealerId: 'cdealer', context: 'dealer.customers.list', method: 'get' })).toBe(true);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      userId: 'cadmin',
      action: ADMIN_TENANT_ACCESS_ACTION,
      entity: 'Dealer',
      entityId: 'cdealer',
      newData: { context: 'dealer.customers.list', method: 'GET' },
    });
    rateLimit.mockImplementationOnce(async () => ({ ok: false, remaining: 0 } as never));
    expect(await recordAdminTenantAccess({ adminId: 'cadmin', dealerId: 'cdealer', context: 'dealer.customers.list' })).toBe(false);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('sayaç altyapısı çökerse kayıt yine yazılır; kayıt hatası isteği düşürmez', async () => {
    rateLimit.mockImplementationOnce(async () => {
      throw new Error('redis down');
    });
    expect(await recordAdminTenantAccess({ adminId: 'cadmin', dealerId: 'cdealer' })).toBe(true);
    auditCreate.mockImplementationOnce(async () => {
      throw new Error('db down');
    });
    await expect(recordAdminTenantAccess({ adminId: 'cadmin', dealerId: 'cdealer2' })).resolves.toBe(false);
  });

  it('güvensiz bağlam metni "unknown" olarak yazılır', async () => {
    await recordAdminTenantAccess({ adminId: 'cadmin', dealerId: 'cdealer', context: '<script>' });
    expect(auditCreate.mock.calls[0][0].data.newData.context).toBe('unknown');
  });

  it('resolveDealerScope yönetici çözümünde denetim yazar; bayi kendi kapsamında yazmaz', async () => {
    const admin = await resolveDealerScope(
      { user: { id: 'cadmin', role: 'ADMIN' } } as never,
      { dealerId: 'cdealer', auditContext: 'dealer.inbox.list', auditMethod: 'GET' }
    );
    expect(admin).toMatchObject({ ok: true, via: 'admin', dealerId: 'cdealer' });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data.newData.context).toBe('dealer.inbox.list');

    auditCreate.mockClear();
    const self = await resolveDealerScope({ user: { id: 'cdealer', role: 'DEALER' } } as never, {});
    expect(self).toMatchObject({ ok: true, via: 'self' });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
