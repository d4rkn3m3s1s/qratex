/**
 * P0-01 — Gizli kapı uçları (route seviyesinde, prisma mock'lu).
 *
 *  - Doğru cevap → imzalı g2 çerezi (httpOnly, 12 saat) + ADMIN_GATE_PASSED audit.
 *  - Yanlış cevap → 403 + ADMIN_GATE_FAILED (girilen değer audit'e YAZILMAZ).
 *  - 3. yanlışta kilit → 423 + ADMIN_GATE_LOCKED; kilitliyken doğru cevap bile kabul edilmez.
 *  - Ayar okunamazsa 503 — bilinen "7" ile geçilemez.
 *  - Ayar GET'i cevabı / özeti / tuzu döndürmez; PUT "42"yi 400 ile reddeder, mevcut cevap
 *    olmadan cevap değiştirilemez, yanlış mevcut cevap kapı denemesi sayılır.
 */
import { webcrypto } from 'crypto';
import { NextRequest } from 'next/server';

if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}
process.env.NEXTAUTH_SECRET = 'test-secret-gate-route';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => null), redisSetJson: jest.fn(async () => undefined) }));
jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));

type Audit = { userId: string | null; action: string; entity: string; entityId?: string | null; createdAt: Date; newData?: unknown; oldData?: unknown };
const audits: Audit[] = [];
let settingsRow: { id: string; value: unknown; updatedAt: Date } | null = null;
let settingsFails = false;

function auditWhereMatch(a: Audit, where: Record<string, unknown>): boolean {
  if (where.userId !== undefined && a.userId !== where.userId) return false;
  if (where.entityId !== undefined && a.entityId !== where.entityId) return false;
  if (where.entity !== undefined && a.entity !== where.entity) return false;
  if (typeof where.action === 'string' && a.action !== where.action) return false;
  if (where.action && typeof where.action === 'object') {
    const inList = (where.action as { in?: string[] }).in;
    if (inList && !inList.includes(a.action)) return false;
  }
  const created = where.createdAt as { gt?: Date; gte?: Date } | undefined;
  if (created?.gt && !(a.createdAt > created.gt)) return false;
  if (created?.gte && !(a.createdAt >= created.gte)) return false;
  return true;
}

const db = {
  $executeRaw: jest.fn(async () => 0),
  settings: {
    findUnique: jest.fn(async () => {
      if (settingsFails) throw new Error('P1001');
      return settingsRow ? { value: settingsRow.value, updatedAt: settingsRow.updatedAt } : null;
    }),
    update: jest.fn(async ({ data }: { data: { value: unknown } }) => {
      if (settingsRow) settingsRow.value = data.value;
      return settingsRow;
    }),
    upsert: jest.fn(async ({ update, create }: { update: { value: unknown }; create: { value: unknown } }) => {
      if (settingsRow) settingsRow = { ...settingsRow, value: update.value, updatedAt: new Date() };
      else settingsRow = { id: 'set1', value: create.value, updatedAt: new Date() };
      return { id: settingsRow.id };
    }),
  },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Omit<Audit, 'createdAt'> }) => {
      audits.push({ ...data, createdAt: new Date() });
      return { id: `a${audits.length}` };
    }),
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const rows = audits.filter((a) => auditWhereMatch(a, where)).sort((x, y) => +y.createdAt - +x.createdAt);
      return rows[0] ? { createdAt: rows[0].createdAt } : null;
    }),
    findMany: jest.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
      return audits
        .filter((a) => auditWhereMatch(a, where))
        .sort((x, y) => +y.createdAt - +x.createdAt)
        .slice(0, take ?? 100)
        .map((a, i) => ({ id: `e${i}`, action: a.action, createdAt: a.createdAt, ipAddress: '1.2.3.4', entityId: a.entityId ?? null, userId: a.userId, user: null }));
    }),
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) => audits.filter((a) => auditWhereMatch(a, where)).length),
  },
  user: {
    findMany: jest.fn(async () => [{ id: 'a2' }]),
    findUnique: jest.fn(async () => ({ id: 'a1', name: 'Yönetici', email: 'a1@x.test' })),
  },
  notification: { createMany: jest.fn(async () => ({ count: 1 })) },
};
jest.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === '$transaction') return async (fn: (tx: unknown) => unknown) => fn(db);
        return (db as Record<string, unknown>)[prop];
      },
    }
  ),
  isPrismaConnectivityError: () => false,
}));

import { verifyElevation } from '@/lib/admin-elevation';
import { hashGateAnswer } from '@/lib/admin-gate';

const SESSION = { user: { id: 'a1', role: 'ADMIN' }, jti: 'jti-a1' };

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function gatePost(answer: string) {
  const { POST } = await import('@/app/api/admin/gate/route');
  return POST(req('/api/admin/gate', 'POST', { answer }));
}

beforeEach(() => {
  audits.length = 0;
  settingsFails = false;
  settingsRow = {
    id: 'set1',
    value: { v: 2, question: 'Kaç boyut gizli?', answerHash: hashGateAnswer('4', 'tuz'), salt: 'tuz', cfgVer: 2, isDefaultAnswer: false },
    updatedAt: new Date(),
  };
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue({ session: SESSION });
});

describe('POST /api/admin/gate', () => {
  it('kapı ucu kendisi kapıdan muaf çağrılır', async () => {
    await gatePost('4');
    expect(mockRequireAuth).toHaveBeenCalledWith(['ADMIN'], { adminGate: false });
  });

  it('doğru cevap → imzalı, httpOnly, 12 saatlik, güncel sürümlü çerez + PASSED audit', async () => {
    const res = await gatePost('4');
    expect(res.status).toBe(200);
    const cookie = res.cookies.get('admin_gate');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBe(12 * 60 * 60);
    const check = await verifyElevation(cookie!.value, { userId: 'a1', jti: 'jti-a1', cfgVer: 2 });
    expect(check.ok).toBe(true);
    expect(audits.map((a) => a.action)).toEqual(['ADMIN_GATE_PASSED']);
  });

  it('yanlış cevap → 403 + FAILED audit; girilen değer audit\'e yazılmaz', async () => {
    const res = await gatePost('5');
    expect(res.status).toBe(403);
    expect(res.cookies.get('admin_gate')).toBeUndefined();
    expect(audits[0].action).toBe('ADMIN_GATE_FAILED');
    expect(JSON.stringify(audits[0])).not.toContain('"5"');
  });

  it('SALDIRI: rakamları sırayla denemek → 3. yanlışta 423 kilit, sonra DOĞRU cevap bile reddedilir', async () => {
    expect((await gatePost('0')).status).toBe(403);
    expect((await gatePost('1')).status).toBe(403);
    const third = await gatePost('2');
    expect(third.status).toBe(423);
    expect(audits.some((a) => a.action === 'ADMIN_GATE_LOCKED')).toBe(true);
    const correct = await gatePost('4');
    expect(correct.status).toBe(423);
    expect(correct.cookies.get('admin_gate')).toBeUndefined();
  });

  it('kilitte diğer adminlere bildirim gider', async () => {
    await gatePost('0');
    await gatePost('1');
    await gatePost('2');
    expect(db.notification.createMany).toHaveBeenCalled();
  });

  it('SALDIRI: ayar DB\'den okunamazken bilinen "7" ile geçilemez → 503', async () => {
    settingsFails = true;
    const res = await gatePost('7');
    expect(res.status).toBe(503);
    expect(res.cookies.get('admin_gate')).toBeUndefined();
  });

  it('satır yoksa varsayılan cevap (7) özetle doğrulanır', async () => {
    settingsRow = null;
    expect((await gatePost('7')).status).toBe(200);
  });

  it('ESKİ düz metin satır: doğrulanır ve satır özetli biçime yükseltilir', async () => {
    settingsRow = { id: 'set1', value: { question: 'Eski soru?', answer: '3' }, updatedAt: new Date() };
    expect((await gatePost('3')).status).toBe(200);
    expect(settingsRow.value).not.toHaveProperty('answer');
    expect((settingsRow.value as { v: number }).v).toBe(2);
  });
});

describe('GET /api/admin/gate', () => {
  it('yalnız soru + kilit durumu döner (cevap/özet yok)', async () => {
    const { GET } = await import('@/app/api/admin/gate/route');
    const res = await GET();
    const body = await res.json();
    expect(body.question).toBe('Kaç boyut gizli?');
    expect(JSON.stringify(body)).not.toMatch(/answer|salt|hash/i);
  });
});

describe('/api/admin/settings/admin-gate', () => {
  it('GET kapı zorunlu çağrılır ve cevap/özet/tuz DÖNMEZ (eskiden düz cevap dönüyordu)', async () => {
    const { GET } = await import('@/app/api/admin/settings/admin-gate/route');
    const res = await GET();
    expect(mockRequireAuth).toHaveBeenCalledWith(['ADMIN']);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.gate.question).toBe('Kaç boyut gizli?');
    expect(body.gate.cfgVer).toBe(2);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/answerHash|"salt"|"answer"/);
    expect(raw).not.toContain(hashGateAnswer('4', 'tuz'));
  });

  it('PUT "42" → 400 (sessizce 7 olmaz)', async () => {
    const { PUT } = await import('@/app/api/admin/settings/admin-gate/route');
    const res = await PUT(req('/api/admin/settings/admin-gate', 'PUT', { question: 'Yeni soru metni', newAnswer: '42', currentAnswer: '4' }));
    expect(res.status).toBe(400);
  });

  it('PUT cevap değişikliği mevcut cevap olmadan reddedilir', async () => {
    const { PUT } = await import('@/app/api/admin/settings/admin-gate/route');
    const res = await PUT(req('/api/admin/settings/admin-gate', 'PUT', { question: 'Yeni soru metni', newAnswer: '8' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CURRENT_ANSWER_REQUIRED');
  });

  it('SALDIRI: PUT yanlış mevcut cevap → 403 + FAILED audit (kaba kuvvet kestirmesi değil)', async () => {
    const { PUT } = await import('@/app/api/admin/settings/admin-gate/route');
    const res = await PUT(req('/api/admin/settings/admin-gate', 'PUT', { question: 'Yeni soru metni', newAnswer: '8', currentAnswer: '1' }));
    expect(res.status).toBe(403);
    expect(audits.some((a) => a.action === 'ADMIN_GATE_FAILED')).toBe(true);
    expect((settingsRow!.value as { cfgVer: number }).cfgVer).toBe(2);
  });

  it('PUT doğru mevcut cevapla: özetli yazar, cfgVer artar, değiştirene yeni çerez, audit\'te cevap yok', async () => {
    const { PUT } = await import('@/app/api/admin/settings/admin-gate/route');
    const res = await PUT(
      req('/api/admin/settings/admin-gate', 'PUT', { question: 'Yeni soru metni', newAnswer: '8', currentAnswer: '4', expectedCfgVer: 2 })
    );
    expect(res.status).toBe(200);
    const stored = settingsRow!.value as { cfgVer: number; answerHash: string; salt: string; answer?: string };
    expect(stored.cfgVer).toBe(3);
    expect(stored.answer).toBeUndefined();
    expect(stored.answerHash).toBe(hashGateAnswer('8', stored.salt));
    const cookie = res.cookies.get('admin_gate');
    expect((await verifyElevation(cookie!.value, { userId: 'a1', jti: 'jti-a1', cfgVer: 3 })).ok).toBe(true);
    const upd = audits.find((a) => a.action === 'UPDATE_ADMIN_GATE')!;
    expect(JSON.stringify(upd)).not.toMatch(/"8"|"4"/);
  });

  it('PUT eski sürümle (expectedCfgVer uyuşmaz) → 409', async () => {
    const { PUT } = await import('@/app/api/admin/settings/admin-gate/route');
    const res = await PUT(req('/api/admin/settings/admin-gate', 'PUT', { question: 'Yeni soru metni', expectedCfgVer: 1 }));
    expect(res.status).toBe(409);
  });

  it('POST revoke: cfgVer artar, çağıranın çerezi silinir, audit yazılır', async () => {
    const { POST } = await import('@/app/api/admin/settings/admin-gate/revoke/route');
    const res = await POST(req('/api/admin/settings/admin-gate/revoke', 'POST', {}));
    expect(res.status).toBe(200);
    expect((settingsRow!.value as { cfgVer: number }).cfgVer).toBe(3);
    expect(res.cookies.get('admin_gate')?.value).toBe('');
    expect(audits.some((a) => a.action === 'ADMIN_GATE_REVOKE_ALL')).toBe(true);
  });

  it('POST unlock: kilit kaldırılınca hesap yeniden deneyebilir', async () => {
    await gatePost('0');
    await gatePost('1');
    expect((await gatePost('2')).status).toBe(423);
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'a2', role: 'ADMIN' }, jti: 'jti-a2' } });
    const { POST } = await import('@/app/api/admin/settings/admin-gate/unlock/route');
    expect((await POST(req('/api/admin/settings/admin-gate/unlock', 'POST', { userId: 'a1' }))).status).toBe(200);
    mockRequireAuth.mockResolvedValue({ session: SESSION });
    // unlock kaydından SONRAKİ denemeler sayılır (aynı milisaniye riskine karşı küçük bekleme)
    await new Promise((r) => setTimeout(r, 5));
    expect((await gatePost('4')).status).toBe(200);
  });
});
