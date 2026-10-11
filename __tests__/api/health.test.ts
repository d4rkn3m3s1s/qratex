/**
 * API health endpoint tests (S1).
 * GET /api/health and GET /api/health?light=1 with mocked Prisma.
 */
import { NextRequest } from 'next/server';

const mockQueryRaw = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

async function getHealthHandler(light?: boolean, authorized?: boolean) {
  const { GET } = await import('@/app/api/health/route');
  const url = new URL('http://localhost/api/health');
  if (light) url.searchParams.set('light', '1');
  // Yetkili çağrı (internal job secret) verbose alanları alır.
  const headers: Record<string, string> = authorized
    ? { authorization: `Bearer ${process.env.INNGEST_INTERNAL_JOB_SECRET || process.env.CRON_SECRET || 'test-secret'}` }
    : {};
  const req = new NextRequest(url, { headers });
  return GET(req);
}

describe('GET /api/health', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  describe('?light=1 (readiness)', () => {
    it('returns 200 with status and latencyMs when DB is ok', async () => {
      mockQueryRaw.mockResolvedValueOnce(undefined);
      const res = await getHealthHandler(true);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('latencyMs');
      expect(typeof body.latencyMs).toBe('number');
    });

    it('returns 503 with status error when DB fails (anonim: genel metin)', async () => {
      mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));
      const res = await getHealthHandler(true);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'error');
      expect(body).toHaveProperty('error');
      expect(body.error).not.toMatch(/Connection refused/);
    });
  });

  describe('full health', () => {
    it('unauthenticated: 200 healthy, minimal (no version/runtime/email — recon önlemi)', async () => {
      mockQueryRaw.mockResolvedValueOnce(undefined);
      const res = await getHealthHandler(false, false);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'healthy');
      expect(body).toHaveProperty('timestamp');
      expect(body.checks).toHaveProperty('database');
      expect(body.checks.database).toMatchObject({ status: 'ok' });
      // Hassas alanlar anonim çağrıda OLMAMALI.
      expect(body.checks).not.toHaveProperty('transactionalEmail');
      expect(body).not.toHaveProperty('runtime');
      expect(body).not.toHaveProperty('version');
    });

    it('authorized: verbose alanlar (version/runtime/email) döner', async () => {
      process.env.INNGEST_INTERNAL_JOB_SECRET = 'test-secret';
      mockQueryRaw.mockResolvedValueOnce(undefined);
      const res = await getHealthHandler(false, true);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.checks).toHaveProperty('transactionalEmail');
      expect(body.checks.transactionalEmail).toMatchObject({
        status: expect.stringMatching(/^(ok|warn)$/),
        message: expect.any(String),
      });
      expect(body).toHaveProperty('runtime');
      expect(body.runtime).toMatchObject({
        nodeEnv: expect.any(String),
        uptimeSeconds: expect.any(Number),
      });
      delete process.env.INNGEST_INTERNAL_JOB_SECRET;
    });

    it('anonim: DB hatasında 503 degraded, ham hata metni ve ayrıntı SIZMAZ (arka plan D5)', async () => {
      mockQueryRaw.mockRejectedValueOnce(new Error('connect ECONNREFUSED ep-secret-host.neon.tech:5432'));
      const res = await getHealthHandler(false);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'degraded');
      expect(body.checks.database).toMatchObject({ status: 'error' });
      expect(JSON.stringify(body)).not.toMatch(/neon\.tech|ECONNREFUSED/);
      expect(body.checks).not.toHaveProperty('transactionalEmail');
      expect(body).not.toHaveProperty('runtime');
      expect(body).not.toHaveProperty('version');
    });

    it('yetkili: DB hatasında ham hata + ayrıntılar döner', async () => {
      process.env.INNGEST_INTERNAL_JOB_SECRET = 'test-secret';
      mockQueryRaw.mockRejectedValueOnce(new Error('Timeout'));
      const res = await getHealthHandler(false, true);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.checks.database).toMatchObject({ status: 'error', error: 'Timeout' });
      expect(body.checks.transactionalEmail).toMatchObject({
        status: expect.stringMatching(/^(ok|warn)$/),
        message: expect.any(String),
      });
      expect(body.runtime?.uptimeSeconds).toEqual(expect.any(Number));
      delete process.env.INNGEST_INTERNAL_JOB_SECRET;
    });
  });

  describe('?live=1 (liveness)', () => {
    it("veritabanına dokunmaz (dış izleyici Neon compute'unu uyanık tutmasın)", async () => {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET(new NextRequest('http://localhost/api/health?live=1'));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: 'ok' });
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });
  });
});
