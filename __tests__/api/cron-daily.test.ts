/**
 * Günlük cron orkestratörü (P0-40).
 *
 * Yeniden üretilen hata: `app/api/cron/daily/route.ts` alt işlerin sonucundan bağımsız
 * `{ ok: true }` + HTTP 200 dönüyordu; Vercel cron panelinde ve izleme servisinde hata
 * görünmüyor, alarm kurulamıyordu. Artık:
 *  - alt iş başarısız → 500 + heartbeat "fail" + Sentry raporu,
 *  - bütçe yüzünden atlanan iş → 503,
 *  - hepsi başarılı → 200 + heartbeat "ok",
 *  - önceki koşu yarıda kesildiyse ("finishedAt" yok) raporlanır,
 *  - CRON_SECRET fail-closed.
 */
const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockPing = jest.fn();
const mockStartCheckIn = jest.fn();
const mockFinishCheckIn = jest.fn();
const mockCapture = jest.fn();

jest.mock('@/lib/cron-state', () => ({
  loadCronState: (...a: unknown[]) => mockLoad(...a),
  saveCronState: (...a: unknown[]) => mockSave(...a),
}));
jest.mock('@/lib/cron-heartbeat', () => ({
  pingHeartbeat: (...a: unknown[]) => mockPing(...a),
  startCronCheckIn: (...a: unknown[]) => mockStartCheckIn(...a),
  finishCronCheckIn: (...a: unknown[]) => mockFinishCheckIn(...a),
}));
jest.mock('@/lib/capture-api-error', () => ({
  captureApiError: (...a: unknown[]) => mockCapture(...a),
}));

const mockJobRuns: Record<string, jest.Mock> = {
  'squad-battles': jest.fn(),
  'db-cleanup': jest.fn(),
  'weekly-digest': jest.fn(),
};
jest.mock('@/app/api/cron/daily/jobs', () => ({
  DAILY_JOBS: [
    { name: 'squad-battles', priority: 0, cadence: { kind: 'daily' }, timeoutMs: 1000, run: (c: unknown) => mockJobRuns['squad-battles'](c) },
    { name: 'db-cleanup', priority: 1, cadence: { kind: 'daily' }, timeoutMs: 1000, run: (c: unknown) => mockJobRuns['db-cleanup'](c) },
    { name: 'weekly-digest', priority: 3, cadence: { kind: 'weekly', weekday: 1 }, timeoutMs: 1000, run: (c: unknown) => mockJobRuns['weekly-digest'](c) },
  ],
}));

import { GET } from '@/app/api/cron/daily/route';

const SECRET = 'test-cron-secret';
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const call = (auth: string | null = `Bearer ${SECRET}`, qs = '') =>
  GET(new Request(`http://localhost/api/cron/daily${qs}`, { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockLoad.mockResolvedValue({ jobs: {} });
  mockSave.mockResolvedValue(undefined);
  mockPing.mockResolvedValue('sent');
  mockStartCheckIn.mockReturnValue(null);
  for (const m of Object.values(mockJobRuns)) m.mockReset().mockImplementation(async () => ok());
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/daily', () => {
  it('CRON_SECRET yoksa 503, iş çalışmaz', async () => {
    delete process.env.CRON_SECRET;
    const res = await call();
    expect(res.status).toBe(503);
    expect(mockJobRuns['db-cleanup']).not.toHaveBeenCalled();
  });

  it('yanlış Bearer 401', async () => {
    const res = await call('Bearer yanlis');
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('hepsi başarılı → 200 + heartbeat ok + durum kaydı', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.overall).toBe('ok');
    expect(mockPing).toHaveBeenCalledWith(true, expect.objectContaining({ overall: 'ok' }));
    // Başlangıç + her iş + son durum.
    expect(mockSave.mock.calls.length).toBeGreaterThanOrEqual(3);
    const finalState = mockSave.mock.calls.at(-1)![0];
    expect(finalState.currentRun.finishedAt).toBeTruthy();
    expect(finalState.history[0].overall).toBe('ok');
  });

  it('alt iş 500 dönerse orkestratör 500 + heartbeat fail + Sentry; diğer işler yine çalışır', async () => {
    mockJobRuns['squad-battles'].mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'savaş kapanmadı' }), { status: 500 }));
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.failed).toEqual(['squad-battles']);
    expect(mockJobRuns['db-cleanup']).toHaveBeenCalled();
    expect(mockPing).toHaveBeenCalledWith(false, expect.objectContaining({ failed: ['squad-battles'] }));
    expect(mockCapture).toHaveBeenCalled();
  });

  it('alt iş 200 ama ok:false dönerse de başarısız sayılır', async () => {
    mockJobRuns['db-cleanup'].mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'kısmi' }), { status: 200 }));
    const res = await call();
    expect(res.status).toBe(500);
  });

  it('önceki koşu yarıda kesildiyse raporlanır ve geçmişe "interrupted" yazılır', async () => {
    mockLoad.mockResolvedValue({ jobs: {}, currentRun: { startedAt: '2026-10-09T03:00:00.000Z', finishedAt: null } });
    const res = await call();
    const body = await res.json();
    expect(body.previousRunInterrupted).toBe('2026-10-09T03:00:00.000Z');
    const finalState = mockSave.mock.calls.at(-1)![0];
    expect(finalState.history.some((h: { overall: string }) => h.overall === 'interrupted')).toBe(true);
  });

  it('durum deposu okunamazsa işler çalışır ama koşu başarılı sayılmaz (kadans güvencesi yok)', async () => {
    mockLoad.mockRejectedValue(new Error('db uyuyor'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(mockJobRuns['db-cleanup']).toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(mockPing).toHaveBeenCalledWith(false, expect.anything());
    spy.mockRestore();
  });

  it('bilinmeyen iş adıyla 400', async () => {
    const res = await call(`Bearer ${SECRET}`, '?only=yok-boyle-is');
    expect(res.status).toBe(400);
  });
});
