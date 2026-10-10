/**
 * Günlük iş yürütücüsü (P0-40 · denetim K2/Y1).
 *
 * Yeniden üretilen hatalar:
 *  - Eski orkestratör alt iş 500 dönse de `{ ok: true }` + 200 dönüyordu → alarm kurulamıyordu.
 *  - Alt iş `ok:false` gövdesiyle 200 dönerse de başarısız sayılmalı.
 *  - Sıralı ve bütçesiz yürütme: bütçe biterse sondaki işler iz bırakmadan ölüyordu.
 *  - Haftalık/aylık işler kaçırılınca telafi edilmeli, başarılıysa aynı dönemde tekrar çalışmamalı.
 */
import {
  appendHistory,
  cadenceBoundary,
  classifyResponse,
  HISTORY_LIMIT,
  isJobDue,
  runCronJobs,
  summarizeRun,
  type CronJobDefinition,
} from '@/lib/cron-runner';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const DAILY = { kind: 'daily' } as const;

function job(name: string, priority: number, run: CronJobDefinition['run'], extra: Partial<CronJobDefinition> = {}): CronJobDefinition {
  return { name, priority, cadence: DAILY, timeoutMs: 1_000, run, ...extra };
}

describe('classifyResponse', () => {
  it('2xx + ok:true başarılı', async () => {
    expect((await classifyResponse(json({ ok: true }))).ok).toBe(true);
  });
  it('500 başarısız ve hata mesajı taşınır', async () => {
    const c = await classifyResponse(json({ error: 'patladı' }, 500));
    expect(c).toMatchObject({ ok: false, httpStatus: 500, error: 'patladı' });
  });
  it('200 ama gövde ok:false → başarısız (sessiz başarısızlık yakalanır)', async () => {
    const c = await classifyResponse(json({ ok: false, error: '3 alıcıya ulaşılamadı' }));
    expect(c.ok).toBe(false);
    expect(c.error).toBe('3 alıcıya ulaşılamadı');
  });
  it('JSON olmayan 200 başarılı sayılır', async () => {
    expect((await classifyResponse(new Response('tamam'))).ok).toBe(true);
  });
});

describe('runCronJobs', () => {
  it('öncelik sırasıyla çalıştırır; bir iş başarısızsa sonrakiler yine çalışır ve genel durum failed olur', async () => {
    const order: string[] = [];
    const jobs = [
      job('teslimat', 3, async () => { order.push('teslimat'); return json({ ok: true }); }),
      job('ekonomi', 0, async () => { order.push('ekonomi'); return json({ error: 'x' }, 500); }),
      job('temizlik', 1, async () => { order.push('temizlik'); return json({ ok: true }); }),
    ];
    const r = await runCronJobs({ jobs, state: { jobs: {} }, deadlineAt: Date.now() + 60_000 });
    expect(order).toEqual(['ekonomi', 'temizlik', 'teslimat']);
    expect(r.overall).toBe('failed');
    expect(r.results.find((x) => x.name === 'ekonomi')).toMatchObject({ status: 'failed', httpStatus: 500 });
    expect(r.state.jobs.ekonomi.consecutiveFailures).toBe(1);
    expect(r.state.jobs.temizlik.lastOkAt).toBeTruthy();
  });

  it('fırlatan iş failed olur, koşu sürer', async () => {
    const r = await runCronJobs({
      jobs: [job('a', 0, async () => { throw new Error('bağlantı yok'); }), job('b', 1, async () => json({ ok: true }))],
      state: { jobs: {} },
      deadlineAt: Date.now() + 60_000,
    });
    expect(r.results.map((x) => x.status)).toEqual(['failed', 'ok']);
    expect(r.results[0].error).toContain('bağlantı yok');
  });

  it('zaman aşımına uğrayan iş timeout olur ve koşu durmaz', async () => {
    const r = await runCronJobs({
      jobs: [
        job('yavas', 0, () => new Promise<Response>(() => {}), { timeoutMs: 30 }),
        job('hizli', 1, async () => json({ ok: true })),
      ],
      state: { jobs: {} },
      deadlineAt: Date.now() + 60_000,
    });
    expect(r.results.map((x) => x.status)).toEqual(['timeout', 'ok']);
    expect(r.overall).toBe('failed');
  });

  it('bütçe bittiğinde kalan işler başlatılmaz, skipped_budget yazılır → partial', async () => {
    let now = 1_000_000;
    const clock = () => now;
    const r = await runCronJobs({
      jobs: [
        job('uzun', 0, async () => { now += 9_000; return json({ ok: true }); }, { timeoutMs: 10_000 }),
        job('sonraki', 1, async () => json({ ok: true }), { timeoutMs: 5_000 }),
      ],
      state: { jobs: {} },
      deadlineAt: 1_000_000 + 10_000,
      clock,
    });
    expect(r.results.map((x) => x.status)).toEqual(['ok', 'skipped_budget']);
    expect(r.overall).toBe('partial');
    // Bütçe atlaması ardışık hata sayısını artırmaz, son başarılı koşu korunur.
    expect(r.state.jobs.sonraki.consecutiveFailures).toBeUndefined();
  });

  it('her iş bitince kalıcılık kancası çağrılır; kanca hatası koşuyu durdurmaz', async () => {
    const onJobDone = jest.fn().mockRejectedValueOnce(new Error('db yok')).mockResolvedValue(undefined);
    const r = await runCronJobs({
      jobs: [job('a', 0, async () => json({ ok: true })), job('b', 1, async () => json({ ok: true }))],
      state: { jobs: {} },
      deadlineAt: Date.now() + 60_000,
      onJobDone,
    });
    expect(onJobDone).toHaveBeenCalledTimes(2);
    expect(r.overall).toBe('ok');
  });

  it('only ile yalnız seçilen iş çalışır', async () => {
    const a = jest.fn(async () => json({ ok: true }));
    const b = jest.fn(async () => json({ ok: true }));
    await runCronJobs({ jobs: [job('a', 0, a), job('b', 0, b)], state: { jobs: {} }, deadlineAt: Date.now() + 60_000, only: ['b'] });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('bugün başarıyla çalışmış iş tekrar çalışmaz (manuel yeniden tetiklemede yan etki tekrarı yok)', async () => {
    const run = jest.fn(async () => json({ ok: true }));
    const now = new Date('2026-10-12T03:00:00Z');
    const r = await runCronJobs({
      jobs: [job('a', 0, run)],
      state: { jobs: { a: { lastOkAt: '2026-10-12T03:00:05Z' } } },
      deadlineAt: now.getTime() + 60_000,
      clock: () => now.getTime(),
    });
    expect(run).not.toHaveBeenCalled();
    expect(r.results[0].status).toBe('skipped_not_due');
    expect(r.overall).toBe('ok');
  });
});

describe('kadans', () => {
  const MONDAY = { kind: 'weekly', weekday: 1 } as const;
  const FIRST = { kind: 'monthly', day: 1 } as const;

  it('haftalık sınır: Çarşamba için önceki Pazartesi', () => {
    expect(cadenceBoundary(MONDAY, new Date('2026-10-14T03:00:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('Pazartesi kaçırılan haftalık iş Salı telafi edilir', () => {
    const tue = new Date('2026-10-13T03:00:00Z');
    expect(isJobDue({ cadence: MONDAY }, { lastOkAt: '2026-10-05T03:00:00Z' }, tue)).toBe(true);
    expect(isJobDue({ cadence: MONDAY }, { lastOkAt: '2026-10-12T03:00:00Z' }, tue)).toBe(false);
  });

  it('hiç çalışmamış haftalık iş yalnız kendi gününde başlar', () => {
    expect(isJobDue({ cadence: MONDAY }, undefined, new Date('2026-10-13T03:00:00Z'))).toBe(false);
    expect(isJobDue({ cadence: MONDAY }, undefined, new Date('2026-10-12T03:00:00Z'))).toBe(true);
  });

  it('aylık sınır ve telafi', () => {
    expect(cadenceBoundary(FIRST, new Date('2026-10-03T03:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(isJobDue({ cadence: FIRST }, { lastOkAt: '2026-09-01T03:00:00Z' }, new Date('2026-10-02T03:00:00Z'))).toBe(true);
    expect(isJobDue({ cadence: FIRST }, { lastOkAt: '2026-10-01T03:00:00Z' }, new Date('2026-10-02T03:00:00Z'))).toBe(false);
  });
});

describe('geçmiş', () => {
  it(`en fazla ${HISTORY_LIMIT} koşu tutulur, en yeni başta`, () => {
    let s = { jobs: {} } as Parameters<typeof appendHistory>[0];
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) {
      s = appendHistory(s, summarizeRun(new Date(i * 1000), new Date(i * 1000 + 5), 'ok', []));
    }
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(s.history![0].startedAt).toBe(new Date((HISTORY_LIMIT + 2) * 1000).toISOString());
  });
});
