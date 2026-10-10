/**
 * P0-07 + P0-01 — `requireAuth` sunucu tarafı yetki kararı.
 *
 * Saldırı/hata senaryoları:
 *  - Şifre sıfırlandı / rol değişti (sessionVersion arttı) → çalınan eski oturum 401.
 *  - Rolü ADMIN'den CUSTOMER'a düşürülen hesabın token'ı hâlâ "ADMIN" → admin uçları 403.
 *  - Askıya alınan / anonimleştirilen / silinen hesap → reddedilir.
 *  - İşten çıkarılan (DealerStaff.isActive=false) personel → personel uçları 403, dealerId silinir.
 *  - ADMIN rolü kapı çerezi olmadan API'yi kullanamaz; sahte çerez işe yaramaz; cevap
 *    değişince (cfgVer) eski çerez geçersiz; ekip modülü muaf.
 *  - DB'ye ulaşılamazsa yetki tahminle verilmez → 503.
 */
import { webcrypto } from 'crypto';

if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}
process.env.NEXTAUTH_SECRET = 'test-secret-require-auth';

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ __esModule: true, getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

let cookieJar: Record<string, string> = {};
jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers({ 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' })),
  cookies: jest.fn(async () => ({
    get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined),
  })),
}));

const mockUserFindUnique = jest.fn();
const mockSettingsFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      update: (...a: unknown[]) => mockUserUpdate(...a),
    },
    settings: { findUnique: (...a: unknown[]) => mockSettingsFindUnique(...a), update: jest.fn() },
  },
  isPrismaConnectivityError: () => false,
}));

const redisStore = new Map<string, unknown>();
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async (k: string) => (redisStore.has(k) ? redisStore.get(k) : null)),
  redisSetJson: jest.fn(async (k: string, v: unknown) => {
    redisStore.set(k, v);
  }),
}));

jest.mock('@/lib/token-replay', () => ({ checkTokenReplay: jest.fn(async () => ({ ok: true })) }));

import { requireAuth } from '@/lib/api-auth';
import { signElevation } from '@/lib/admin-elevation';
import { evaluateSessionState, invalidateSessionState, loadSessionState } from '@/lib/auth/session-state';
import { hashGateAnswer } from '@/lib/admin-gate';

type DbUser = {
  role: string;
  sessionVersion: number;
  suspendedAt: Date | null;
  anonymizedAt: Date | null;
  staffProfile: { dealerId: string; isActive: boolean } | null;
};
function dbUser(over: Partial<DbUser> = {}): DbUser {
  return { role: 'CUSTOMER', sessionVersion: 0, suspendedAt: null, anonymizedAt: null, staffProfile: null, ...over };
}
function session(id: string, role: string, extra: Record<string, unknown> = {}) {
  return { user: { id, role, email: `${id}@x.test` }, jti: `jti-${id}`, sv: 0, ...extra };
}
function gateRow(cfgVer: number) {
  return { value: { v: 2, question: 'Soru nedir?', answerHash: hashGateAnswer('7', 's'), salt: 's', cfgVer, isDefaultAnswer: true }, updatedAt: new Date() };
}
async function status(res: { error: Response } | { session: unknown }) {
  if ('error' in res) return { status: res.error.status, body: await res.error.json() };
  return { status: 200, body: null };
}

beforeEach(() => {
  cookieJar = {};
  redisStore.clear();
  mockUserFindUnique.mockReset();
  mockSettingsFindUnique.mockReset();
  mockUserUpdate.mockReset();
  mockGetServerSession.mockReset();
  mockSettingsFindUnique.mockResolvedValue(gateRow(0));
});

describe('P0-07 oturum durumu', () => {
  it('oturum yoksa 401', async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await status(await requireAuth())).status).toBe(401);
  });

  it('SALDIRI: şifre sıfırlandı (sv 0 → 1) → eski oturum 401 SESSION_REVOKED', async () => {
    mockGetServerSession.mockResolvedValue(session('u1', 'CUSTOMER', { sv: 0 }));
    mockUserFindUnique.mockResolvedValue(dbUser({ sessionVersion: 1 }));
    const r = await status(await requireAuth(['CUSTOMER']));
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('SESSION_REVOKED');
  });

  it('JWT\'de sv yoksa 0 sayılır (geçiş dönemi) → DB 0 iken geçer', async () => {
    mockGetServerSession.mockResolvedValue(session('u1', 'CUSTOMER', { sv: undefined }));
    mockUserFindUnique.mockResolvedValue(dbUser());
    expect((await status(await requireAuth(['CUSTOMER']))).status).toBe(200);
  });

  it('SALDIRI: rolü düşürülen eski ADMIN token\'ı admin ucuna 403 alır (karar DB rolüyle)', async () => {
    mockGetServerSession.mockResolvedValue(session('u1', 'ADMIN'));
    mockUserFindUnique.mockResolvedValue(dbUser({ role: 'CUSTOMER' }));
    const r = await requireAuth(['ADMIN']);
    expect((await status(r)).status).toBe(403);
  });

  it('DB rolü session\'a yazılır (token bayatsa bile güncel rol)', async () => {
    const s = session('u1', 'CUSTOMER');
    mockGetServerSession.mockResolvedValue(s);
    mockUserFindUnique.mockResolvedValue(dbUser({ role: 'DEALER' }));
    const r = await requireAuth(['DEALER']);
    expect('session' in r && r.session.user.role).toBe('DEALER');
  });

  it('askıya alınan hesap 403 ACCOUNT_SUSPENDED', async () => {
    mockGetServerSession.mockResolvedValue(session('u1', 'CUSTOMER'));
    mockUserFindUnique.mockResolvedValue(dbUser({ suspendedAt: new Date() }));
    const r = await status(await requireAuth());
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('SALDIRI: anonimleştirilen kullanıcı profiline yeniden yazamaz (401)', async () => {
    mockGetServerSession.mockResolvedValue(session('u1', 'CUSTOMER'));
    mockUserFindUnique.mockResolvedValue(dbUser({ anonymizedAt: new Date() }));
    expect((await status(await requireAuth())).status).toBe(401);
  });

  it('silinen kullanıcının token\'ı 401', async () => {
    mockGetServerSession.mockResolvedValue(session('u1', 'CUSTOMER'));
    mockUserFindUnique.mockResolvedValue(null);
    expect((await status(await requireAuth())).status).toBe(401);
  });

  it('SALDIRI: işten çıkarılan personel (isActive=false) personel ucunda 403 STAFF_INACTIVE', async () => {
    mockGetServerSession.mockResolvedValue(session('s1', 'STAFF', { user: { id: 's1', role: 'STAFF', dealerId: 'd1' } }));
    mockUserFindUnique.mockResolvedValue(dbUser({ role: 'STAFF', staffProfile: { dealerId: 'd1', isActive: false } }));
    const r = await status(await requireAuth(['STAFF', 'DEALER']));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('STAFF_INACTIVE');
  });

  it('pasif personel genel uçta (rol listesi yok) geçer ama dealerId SİLİNİR', async () => {
    mockGetServerSession.mockResolvedValue(session('s1', 'STAFF', { user: { id: 's1', role: 'STAFF', dealerId: 'd1' } }));
    mockUserFindUnique.mockResolvedValue(dbUser({ role: 'STAFF', staffProfile: { dealerId: 'd1', isActive: false } }));
    const r = await requireAuth();
    expect('session' in r).toBe(true);
    expect('session' in r && (r.session.user as { dealerId?: string }).dealerId).toBeUndefined();
  });

  it('aktif personelin dealerId\'si DB\'den gelir (token\'daki değer yok sayılır)', async () => {
    mockGetServerSession.mockResolvedValue(session('s1', 'STAFF', { user: { id: 's1', role: 'STAFF', dealerId: 'eski' } }));
    mockUserFindUnique.mockResolvedValue(dbUser({ role: 'STAFF', staffProfile: { dealerId: 'yeni', isActive: true } }));
    const r = await requireAuth(['STAFF']);
    expect('session' in r && (r.session.user as { dealerId?: string }).dealerId).toBe('yeni');
  });

  it('DB erişilemezse 503 (tahminle yetki verilmez)', async () => {
    mockGetServerSession.mockResolvedValue(session('u1', 'CUSTOMER'));
    mockUserFindUnique.mockRejectedValue(new Error('P1001'));
    expect((await status(await requireAuth())).status).toBe(503);
  });

  it('Redis sıcak katman: ikinci istek DB\'ye gitmez; invalidateSessionState anında bayatlatır', async () => {
    mockUserFindUnique.mockResolvedValue(dbUser());
    await loadSessionState('u9');
    await loadSessionState('u9');
    expect(mockUserFindUnique).toHaveBeenCalledTimes(1);

    await invalidateSessionState('u9');
    mockUserFindUnique.mockResolvedValue(dbUser({ sessionVersion: 1 }));
    const fresh = await loadSessionState('u9');
    expect(fresh.sessionVersion).toBe(1);
    expect(mockUserFindUnique).toHaveBeenCalledTimes(2);
  });

  it('2FA/şifre değişince yeni sv\'li çerez alan tarayıcı bayat önbellek yüzünden DÜŞMEZ; eski token düşer', async () => {
    // Önbellek sv=0 ile dolu.
    mockUserFindUnique.mockResolvedValue(dbUser());
    mockGetServerSession.mockResolvedValue(session('u7', 'CUSTOMER', { sv: 0 }));
    expect((await status(await requireAuth())).status).toBe(200);
    // DB'de sv=1 oldu (bumpSessionVersion), önbellek bayatlatılmadı; bu tarayıcıya sv=1 verildi.
    mockUserFindUnique.mockResolvedValue(dbUser({ sessionVersion: 1 }));
    mockGetServerSession.mockResolvedValue(session('u7', 'CUSTOMER', { sv: 1 }));
    expect((await status(await requireAuth())).status).toBe(200);
    // Başka cihazdaki eski token (sv=0) artık reddedilir.
    mockGetServerSession.mockResolvedValue(session('u7', 'CUSTOMER', { sv: 0 }));
    expect((await status(await requireAuth())).status).toBe(401);
  });

  it('evaluateSessionState: bilinmeyen rol 403', () => {
    const v = evaluateSessionState(
      { exists: true, role: 'ROOT', sessionVersion: 0, suspended: false, anonymized: false, staff: null },
      0
    );
    expect(v.ok).toBe(false);
  });
});

describe('P0-01 admin kapısı API\'de zorunlu', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(session('a1', 'ADMIN'));
    mockUserFindUnique.mockResolvedValue(dbUser({ role: 'ADMIN' }));
  });

  it('SALDIRI: ADMIN rolü var ama kapı çerezi yok → 403 ADMIN_GATE_REQUIRED', async () => {
    const r = await status(await requireAuth(['ADMIN']));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ADMIN_GATE_REQUIRED');
  });

  it('SALDIRI: denetimdeki DevTools sahte çerezi (<id>.<64 hex>) → 403', async () => {
    cookieJar.admin_gate = `a1.${'a'.repeat(64)}`;
    expect((await status(await requireAuth(['ADMIN']))).status).toBe(403);
  });

  it('SALDIRI: rol listesiz genel uçta da ADMIN kapısız yetki kazanamaz', async () => {
    expect((await status(await requireAuth())).status).toBe(403);
  });

  it('geçerli imzalı çerez → geçer', async () => {
    cookieJar.admin_gate = await signElevation({ userId: 'a1', cfgVer: 0, jti: 'jti-a1' });
    expect((await status(await requireAuth(['ADMIN']))).status).toBe(200);
  });

  it('cevap değişince (DB cfgVer 0 → 1) eski çerez 403', async () => {
    cookieJar.admin_gate = await signElevation({ userId: 'a1', cfgVer: 0, jti: 'jti-a1' });
    mockSettingsFindUnique.mockResolvedValue(gateRow(1));
    expect((await status(await requireAuth(['ADMIN']))).status).toBe(403);
  });

  it('başka adminin çerezi bu admine işe yaramaz', async () => {
    cookieJar.admin_gate = await signElevation({ userId: 'a2', cfgVer: 0, jti: 'jti-a1' });
    expect((await status(await requireAuth(['ADMIN']))).status).toBe(403);
  });

  it('ekip modülü / kapı ucu muaf (adminGate:false)', async () => {
    expect((await status(await requireAuth(['ADMIN'], { adminGate: false }))).status).toBe(200);
  });

  it('kapı yapılandırması okunamazsa 503 (varsayılan "7"ye düşmez)', async () => {
    cookieJar.admin_gate = await signElevation({ userId: 'a1', cfgVer: 0, jti: 'jti-a1' });
    mockSettingsFindUnique.mockRejectedValue(new Error('P1001'));
    expect((await status(await requireAuth(['ADMIN']))).status).toBe(503);
  });

  it('ADMIN olmayan roller kapıdan etkilenmez', async () => {
    mockGetServerSession.mockResolvedValue(session('d1', 'DEALER'));
    mockUserFindUnique.mockResolvedValue(dbUser({ role: 'DEALER' }));
    expect((await status(await requireAuth(['DEALER']))).status).toBe(200);
  });
});
