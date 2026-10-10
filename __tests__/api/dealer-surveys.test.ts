/**
 * Bayi anket stüdyosu uçları (b-anketler, Dalga 2) — gerçek DB'ye gidilmez; prisma mock.
 *
 * Denetimde DOĞRULANAN senaryolar:
 *  - Liste hatası "Henüz anket yok" gibi görünüyordu → artık hata zarfı; liste kiracı kapsamlı.
 *  - Modül kapatılınca API çalışmaya devam ediyordu → 403 MODULE_DISABLED.
 *  - Onaysız tek tık silme tüm yanıtları cascade ile yok ediyordu → yanıtlı anket 409, silinmez.
 *  - Düzenleme yoktu → PUT; yanıt almış ankette yapısal kilit (soru silme / tip / seçenek 409).
 *  - Boş seçenekli seçim sorusu yayına giriyordu → 400 VALIDATION + soru indeksli `issues`.
 *  - ADMIN sonuçlarda hep 404 alıyordu ama silebiliyordu → ADMIN yalnız `?dealerId=` ile, salt-okunur.
 *  - Sonuçlar tüm yanıtları belleğe çekiyordu → SQL toplama (İstanbul günleri), savunmacı sayım.
 *  - CSV yoktu → sunucu `Response` (text/csv, BOM, formül kaçışı).
 */
import { NextRequest } from 'next/server';

jest.mock('@prisma/client', () => {
  const r = jest.requireActual('@prisma/client/runtime/library');
  return { Prisma: { sql: r.sqltag, join: r.join, raw: r.raw, empty: r.empty, Sql: r.Sql, DbNull: 'DbNull' } };
});

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('@/lib/redis', () => ({ redisGetJson: async () => null, redisSetJson: async () => undefined }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: () => undefined }));

const mockModuleBlocked = jest.fn<unknown, unknown[]>(async () => null);
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: (...a: unknown[]) => mockModuleBlocked(...a) }));

type RawCall = { sql: string; values: unknown[] };
const raw: { calls: RawCall[]; handler: (sql: string, values: unknown[]) => unknown[] } = { calls: [], handler: () => [] };

const tx = {
  $executeRaw: jest.fn(async () => 1),
  survey: { findFirst: jest.fn(), update: jest.fn(async () => ({ id: 'sv1', updatedAt: new Date('2026-10-10T10:00:00Z') })) },
  surveyQuestion: { deleteMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async () => ({})), createMany: jest.fn(async () => ({ count: 1 })) },
};

const db = {
  survey: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(async () => 0),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new1', title: data.title, isActive: data.isActive, createdAt: new Date('2026-10-10T10:00:00Z') })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  },
  surveyResponse: {
    groupBy: jest.fn(async () => []),
    aggregate: jest.fn(async () => ({ _count: { _all: 0 }, _max: { createdAt: null } })),
    count: jest.fn(async () => 0),
    findMany: jest.fn(async () => []),
  },
  user: { findUnique: jest.fn(async () => ({ role: 'DEALER' })) },
  $queryRaw: jest.fn(async (q: { sql: string; values: unknown[] }) => {
    raw.calls.push({ sql: q.sql, values: q.values });
    return raw.handler(q.sql, q.values);
  }),
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, default: db, isPrismaConnectivityError: () => false }));

const DEALER = { session: { user: { id: 'dealer-1', role: 'DEALER' } } };
const ADMIN = { session: { user: { id: 'admin-1', role: 'ADMIN' } } };

function req(url: string, init?: { method?: string; body?: unknown; rawBody?: string }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined || init?.rawBody !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.rawBody ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
}
const ctx = (id = 'sv1') => ({ params: Promise.resolve({ id }) });
async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => {
  jest.clearAllMocks();
  raw.calls = [];
  raw.handler = () => [];
  mockRequireAuth.mockResolvedValue(DEALER);
  mockModuleBlocked.mockResolvedValue(null);
  db.survey.count.mockResolvedValue(0);
  db.survey.deleteMany.mockResolvedValue({ count: 0 });
});

// ───────────────────────────── Liste ─────────────────────────────

describe('GET /api/dealer/surveys', () => {
  it('kiracı kapsamlı; yanıtlanamaz soru sayısı + 14 günlük eğilim; soru gövdesi sızmaz', async () => {
    db.survey.findMany.mockResolvedValueOnce([
      {
        id: 'sv1',
        title: 'A',
        description: null,
        isActive: true,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        updatedAt: new Date('2026-10-01T10:00:00Z'),
        _count: { responses: 3, questions: 2 },
        questions: [{ type: 'single_choice', options: [] }, { type: 'rating', options: null }],
      },
    ]);
    db.surveyResponse.groupBy.mockResolvedValueOnce([{ surveyId: 'sv1', _max: { createdAt: new Date('2026-10-09T08:00:00Z') } }] as never);
    raw.handler = () => [{ surveyId: 'sv1', day: '2026-10-09', n: 2 }, { surveyId: 'sv1', day: '2026-09-20', n: 9 }];

    const { GET } = await import('@/app/api/dealer/surveys/route');
    const { status, body } = await json(await GET(req('/api/dealer/surveys'), {}));
    expect(status).toBe(200);
    expect(db.survey.findMany.mock.calls[0][0].where).toEqual({ dealerId: 'dealer-1' });
    const s = body.data.surveys[0];
    expect(s.unanswerableQuestions).toBe(1);
    expect(s).not.toHaveProperty('questions');
    expect(s.trend).toHaveLength(14);
    expect(s.lastResponseAt).toBe('2026-10-09T08:00:00.000Z');
    expect(body.data.quota).toEqual({ used: 1, limit: 50 });
    expect(raw.calls[0].sql).toContain("AT TIME ZONE 'Europe/Istanbul'");
    // Eski istemci uyumu: kök düzeyde `surveys`.
    expect(body.surveys).toHaveLength(1);
  });

  it('modül kapalı → 403 MODULE_DISABLED (menü gizlemek yetmiyordu)', async () => {
    mockModuleBlocked.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    const { GET } = await import('@/app/api/dealer/surveys/route');
    const { status, body } = await json(await GET(req('/api/dealer/surveys'), {}));
    expect(status).toBe(403);
    expect(body.code).toBe('MODULE_DISABLED');
    expect(db.survey.findMany).not.toHaveBeenCalled();
  });

  it('veritabanı hatası boş liste DEĞİL, hata zarfı döner', async () => {
    db.survey.findMany.mockRejectedValueOnce(new Error('boom'));
    const { GET } = await import('@/app/api/dealer/surveys/route');
    const { status, body } = await json(await GET(req('/api/dealer/surveys'), {}));
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body).not.toHaveProperty('surveys');
  });

  it('ADMIN dealerId vermeden → 400 TENANT_REQUIRED', async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN);
    const { GET } = await import('@/app/api/dealer/surveys/route');
    const { status, body } = await json(await GET(req('/api/dealer/surveys'), {}));
    expect(status).toBe(400);
    expect(body.code).toBe('TENANT_REQUIRED');
  });
});

// ───────────────────────────── Oluşturma ─────────────────────────────

describe('POST /api/dealer/surveys', () => {
  const post = async (body: unknown) => {
    const { POST } = await import('@/app/api/dealer/surveys/route');
    return json(await POST(req('/api/dealer/surveys', { method: 'POST', body }), {}));
  };

  it('HATA SENARYOSU: boş seçenekli seçim sorusu 400 + soru indeksli issues; DB yazılmaz', async () => {
    const { status, body } = await post({ title: 'Anket', questions: [{ type: 'single_choice', text: 'Nasıldı?', options: ['', ''], required: true }] });
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION');
    expect(body.error).toMatch(/^Soru 1: /);
    expect(body.details.issues[0].questionIndex).toBe(0);
    expect(db.survey.create).not.toHaveBeenCalled();
  });

  it('geçerli anket 201, varsayılan yayında; seçim dışı soruya options yazılmaz', async () => {
    const { status, body } = await post({
      title: ' Anket ',
      questions: [
        { type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'] },
        { type: 'rating', text: 'Puan', options: ['x'] },
      ],
    });
    expect(status).toBe(201);
    expect(body.data.survey.id).toBe('new1');
    const data = db.survey.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ dealerId: 'dealer-1', title: 'Anket', isActive: true });
    expect(data.questions.create[1]).toEqual({ type: 'rating', text: 'Puan', options: undefined, required: true, order: 1 });
  });

  it('publish:false → durdurulmuş (taslak) kaydedilir', async () => {
    await post({ title: 'T', publish: false, questions: [{ type: 'open_text', text: 'X' }] });
    expect(db.survey.create.mock.calls[0][0].data.isActive).toBe(false);
  });

  it('kota dolu → 409 SURVEY_QUOTA', async () => {
    db.survey.count.mockResolvedValueOnce(50);
    const { status, body } = await post({ title: 'A', questions: [{ type: 'open_text', text: 'X' }] });
    expect(status).toBe(409);
    expect(body.code).toBe('SURVEY_QUOTA');
    expect(db.survey.create).not.toHaveBeenCalled();
  });

  it('bozuk JSON → 400 (500 değil)', async () => {
    const { POST } = await import('@/app/api/dealer/surveys/route');
    const res = await POST(req('/api/dealer/surveys', { method: 'POST', rawBody: '{bozuk' }), {});
    expect(res.status).toBe(400);
  });

  it('ADMIN bayi adına YAZAMAZ (salt-okunur)', async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN);
    const { POST } = await import('@/app/api/dealer/surveys/route');
    const res = await POST(req('/api/dealer/surveys?dealerId=dealer-1', { method: 'POST', body: { title: 'A', questions: [{ type: 'open_text', text: 'X' }] } }), {});
    expect(res.status).toBe(403);
    expect(db.survey.create).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── Silme ─────────────────────────────

describe('DELETE /api/dealer/surveys/[id]', () => {
  const del = async () => {
    const { DELETE } = await import('@/app/api/dealer/surveys/[id]/route');
    return json(await DELETE(req('/api/dealer/surveys/sv1', { method: 'DELETE' }), ctx()));
  };

  it('HATA SENARYOSU: yanıtı olan anket SİLİNMEZ → 409 SURVEY_HAS_RESPONSES', async () => {
    db.survey.deleteMany.mockResolvedValueOnce({ count: 0 });
    db.survey.findFirst.mockResolvedValueOnce({ _count: { responses: 12 } });
    const { status, body } = await del();
    expect(status).toBe(409);
    expect(body.code).toBe('SURVEY_HAS_RESPONSES');
    // Koşul tek atomik sorguda: kiracı + yanıtsız.
    expect(db.survey.deleteMany.mock.calls[0][0].where).toEqual({ id: 'sv1', dealerId: 'dealer-1', responses: { none: {} } });
  });

  it('yanıtsız anket silinir', async () => {
    db.survey.deleteMany.mockResolvedValueOnce({ count: 1 });
    const { status, body } = await del();
    expect(status).toBe(200);
    expect(body.data.deleted).toBe(true);
  });

  it('başka bayinin anketi → 404', async () => {
    db.survey.findFirst.mockResolvedValueOnce(null);
    const { status, body } = await del();
    expect(status).toBe(404);
    expect(body.code).toBe('SURVEY_NOT_FOUND');
  });
});

// ───────────────────────────── Düzenleme ─────────────────────────────

describe('PUT /api/dealer/surveys/[id] — yapısal kilit', () => {
  const stored = {
    id: 'sv1',
    questions: [
      { id: 'q1', type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true, order: 0 },
      { id: 'q2', type: 'open_text', text: 'Not', options: null, required: false, order: 1 },
    ],
    _count: { responses: 4 },
  };
  const put = async (body: unknown) => {
    const { PUT } = await import('@/app/api/dealer/surveys/[id]/route');
    return json(await PUT(req('/api/dealer/surveys/sv1', { method: 'PUT', body }), ctx()));
  };

  it('yanıtlı ankette soru silmek → 409 STRUCTURE_LOCKED, hiçbir şey yazılmaz', async () => {
    tx.survey.findFirst.mockResolvedValueOnce(stored);
    const { status, body } = await put({ title: 'A', questions: [{ type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'] }], questionIds: ['q1'] });
    expect(status).toBe(409);
    expect(body.code).toBe('STRUCTURE_LOCKED');
    expect(tx.surveyQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.survey.update).not.toHaveBeenCalled();
  });

  it('yanıtlı ankette mevcut seçeneği yeniden adlandırmak → 409 (yanıtlar seçenek metnine bağlı)', async () => {
    tx.survey.findFirst.mockResolvedValueOnce(stored);
    const { status, body } = await put({
      title: 'A',
      questions: [
        { type: 'single_choice', text: 'Nasıldı?', options: ['Çok iyi', 'Kötü'] },
        { type: 'open_text', text: 'Not' },
      ],
      questionIds: ['q1', 'q2'],
    });
    expect(status).toBe(409);
    expect(body.details.questionIndex).toBe(0);
  });

  it('yanıtlı ankette metin düzeltme + yeni seçenek + yeni soru + sıra serbest', async () => {
    tx.survey.findFirst.mockResolvedValueOnce(stored);
    const { status } = await put({
      title: 'Yeni ad',
      questions: [
        { type: 'open_text', text: 'Notunuz', required: true },
        { type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü', 'Orta'] },
        { type: 'rating', text: 'Puan' },
      ],
      questionIds: ['q2', 'q1', null],
    });
    expect(status).toBe(200);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.surveyQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.surveyQuestion.update.mock.calls.map((c) => [c[0].where.id, c[0].data.order])).toEqual([
      ['q2', 0],
      ['q1', 1],
    ]);
    expect(tx.surveyQuestion.update.mock.calls[0][0].data.options).toBe('DbNull');
    expect(tx.surveyQuestion.createMany.mock.calls[0][0].data[0]).toMatchObject({ surveyId: 'sv1', type: 'rating', order: 2 });
    expect(tx.survey.update.mock.calls[0][0].data.title).toBe('Yeni ad');
  });

  it('yanıtsız ankette soru silinebilir ve tip değişebilir', async () => {
    tx.survey.findFirst.mockResolvedValueOnce({ ...stored, _count: { responses: 0 } });
    const { status } = await put({ title: 'A', questions: [{ type: 'rating', text: 'Nasıldı?' }], questionIds: ['q1'] });
    expect(status).toBe(200);
    expect(tx.surveyQuestion.deleteMany.mock.calls[0][0].where).toEqual({ surveyId: 'sv1', id: { in: ['q2'] } });
  });

  it('ankete ait olmayan soru kimliği → 400 UNKNOWN_QUESTION', async () => {
    tx.survey.findFirst.mockResolvedValueOnce({ ...stored, _count: { responses: 0 } });
    const { status, body } = await put({ title: 'A', questions: [{ type: 'rating', text: 'X' }], questionIds: ['baska'] });
    expect(status).toBe(400);
    expect(body.code).toBe('UNKNOWN_QUESTION');
  });

  it('başka bayinin anketi → 404 (kiracı filtresi işlem içinde)', async () => {
    tx.survey.findFirst.mockResolvedValueOnce(null);
    const { status } = await put({ title: 'A', questions: [{ type: 'rating', text: 'X' }] });
    expect(status).toBe(404);
    expect(tx.survey.findFirst.mock.calls[0][0].where).toEqual({ id: 'sv1', dealerId: 'dealer-1' });
  });
});

describe('PATCH /api/dealer/surveys/[id]', () => {
  it('bilinmeyen alan reddedilir (strict) → 400', async () => {
    const { PATCH } = await import('@/app/api/dealer/surveys/[id]/route');
    const res = await PATCH(req('/api/dealer/surveys/sv1', { method: 'PATCH', body: { dealerId: 'x' } }), ctx());
    expect(res.status).toBe(400);
    expect(db.survey.updateMany).not.toHaveBeenCalled();
  });

  it('yayın anahtarı kiracı kapsamlı güncellenir', async () => {
    db.survey.findFirst.mockResolvedValueOnce({ id: 'sv1', title: 'A', description: null, isActive: false, updatedAt: new Date() });
    const { PATCH } = await import('@/app/api/dealer/surveys/[id]/route');
    const res = await PATCH(req('/api/dealer/surveys/sv1', { method: 'PATCH', body: { isActive: false } }), ctx());
    expect(res.status).toBe(200);
    expect(db.survey.updateMany.mock.calls[0][0]).toEqual({ where: { id: 'sv1', dealerId: 'dealer-1' }, data: { isActive: false } });
  });
});

describe('POST /api/dealer/surveys/[id]/duplicate', () => {
  it('durdurulmuş kopya, yanıtsız; yanıtlanamaz eski soru taşınmaz', async () => {
    db.survey.findFirst.mockResolvedValueOnce({
      title: 'Memnuniyet',
      description: 'd',
      questions: [
        { type: 'single_choice', text: 'Bozuk', options: [], required: true },
        { type: 'single_choice', text: 'İyi mi?', options: [' Evet', 'Hayır', 'evet'], required: true },
      ],
    });
    const { POST } = await import('@/app/api/dealer/surveys/[id]/duplicate/route');
    const res = await POST(req('/api/dealer/surveys/sv1/duplicate', { method: 'POST' }), ctx());
    expect(res.status).toBe(201);
    const data = db.survey.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ dealerId: 'dealer-1', title: 'Memnuniyet (kopya)', isActive: false });
    expect(data.questions.create).toEqual([{ type: 'single_choice', text: 'İyi mi?', options: ['Evet', 'Hayır'], required: true, order: 0 }]);
  });
});

// ───────────────────────────── Sonuçlar ─────────────────────────────

const SURVEY_ROW = {
  id: 'sv1',
  title: 'Memnuniyet',
  description: null,
  isActive: true,
  createdAt: new Date('2026-09-01T09:00:00Z'),
  updatedAt: new Date('2026-09-01T09:00:00Z'),
  questions: [
    { id: 'q1', type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true },
    { id: 'q2', type: 'rating', text: 'Puan', options: null, required: true },
    { id: 'q3', type: 'open_text', text: 'Not', options: null, required: false },
  ],
};

describe('GET /api/dealer/surveys/[id]/results', () => {
  it('SQL toplama + savunmacı sayım: uydurma seçenek ve 1–5 dışı puan sayılmaz', async () => {
    db.survey.findFirst.mockResolvedValueOnce(SURVEY_ROW);
    db.surveyResponse.aggregate.mockResolvedValueOnce({ _count: { _all: 6 }, _max: { createdAt: new Date('2026-10-09T10:00:00Z') } });
    db.surveyResponse.count.mockResolvedValueOnce(2); // üye
    raw.handler = (sql) => {
      if (sql.includes('row_number()')) return [{ questionId: 'q3', text: 'Güzel', createdAt: new Date('2026-10-09T10:00:00Z'), total: 4 }];
      if (sql.includes("a->'value' AS value")) {
        return [
          { questionId: 'q1', value: 'İyi', n: 4 },
          { questionId: 'q1', value: "Rakip X'e gidin", n: 1 },
          { questionId: 'q1', value: ['İyi', 'Kötü'], n: 1 },
          { questionId: 'q2', value: 5, n: 3 },
          { questionId: 'q2', value: 1000000, n: 1 },
        ];
      }
      return [{ day: '2026-10-09', n: 6 }];
    };
    const { GET } = await import('@/app/api/dealer/surveys/[id]/results/route');
    const { status, body } = await json(await GET(req('/api/dealer/surveys/sv1/results'), ctx()));
    expect(status).toBe(200);
    const [q1, q2, q3] = body.data.questions;
    expect(q1.options).toEqual([
      { label: 'İyi', count: 4 },
      { label: 'Kötü', count: 0 },
    ]);
    expect(q1.ignoredAnswers).toBe(2); // uydurma seçenek + tek seçimliye dizi
    expect(q1.skipped).toBe(2);
    expect(q2.rating).toMatchObject({ avg: 5, satisfiedPct: 100 });
    expect(q2.ignoredAnswers).toBe(1);
    expect(q3.answered).toBe(4);
    expect(q3.texts[0].text).toBe('Güzel');
    expect(body.data.totals).toMatchObject({ responses: 6, responsesAll: 6, members: 2 });
    expect(db.survey.findFirst.mock.calls[0][0].where).toEqual({ id: 'sv1', dealerId: 'dealer-1' });
    expect(raw.calls.some((c) => c.sql.includes('jsonb_array_elements'))).toBe(true);
  });

  it('başka bayinin anketi → 404 SURVEY_NOT_FOUND', async () => {
    db.survey.findFirst.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/dealer/surveys/[id]/results/route');
    const { status, body } = await json(await GET(req('/api/dealer/surveys/sv1/results'), ctx()));
    expect(status).toBe(404);
    expect(body.code).toBe('SURVEY_NOT_FOUND');
  });

  it('ADMIN ?dealerId= ile salt-okunur görebilir (eskiden hep 404)', async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN);
    db.survey.findFirst.mockResolvedValueOnce(SURVEY_ROW);
    const { GET } = await import('@/app/api/dealer/surveys/[id]/results/route');
    const { status } = await json(await GET(req('/api/dealer/surveys/sv1/results?dealerId=dealer-1&range=7d'), ctx()));
    expect(status).toBe(200);
    expect(db.survey.findFirst.mock.calls[0][0].where).toEqual({ id: 'sv1', dealerId: 'dealer-1' });
  });

  it('geçersiz dönem → 400', async () => {
    const { GET } = await import('@/app/api/dealer/surveys/[id]/results/route');
    const res = await GET(req('/api/dealer/surveys/sv1/results?range=1y'), ctx());
    expect(res.status).toBe(400);
  });
});

describe('GET /api/dealer/surveys/[id]/responses', () => {
  it('kişisel kimlik dönmez; yalnız üye/anonim; geçersiz cevap gösterilmez', async () => {
    db.survey.findFirst.mockResolvedValueOnce(SURVEY_ROW);
    db.surveyResponse.findMany.mockResolvedValueOnce([
      { id: 'r1', createdAt: new Date('2026-10-09T10:00:00Z'), userId: 'u-secret', answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q2', value: 99 }] },
    ] as never);
    const { GET } = await import('@/app/api/dealer/surveys/[id]/responses/route');
    const { body } = await json(await GET(req('/api/dealer/surveys/sv1/responses'), ctx()));
    const item = body.data.items[0];
    expect(item.member).toBe(true);
    expect(JSON.stringify(body)).not.toContain('u-secret');
    expect(item.answers).toEqual([{ questionId: 'q1', question: 'Nasıldı?', display: 'İyi' }]);
    expect(body.data.nextCursor).toBeNull();
  });
});

describe('GET /api/dealer/surveys/[id]/export', () => {
  it('sunucu CSV Response: text/csv, BOM, TR ayırıcı, formül kaçışı, kimlik yok', async () => {
    db.survey.findFirst.mockResolvedValueOnce(SURVEY_ROW);
    db.surveyResponse.findMany.mockResolvedValueOnce([
      { id: 'r1', createdAt: new Date('2026-10-09T10:00:00Z'), userId: 'u-secret', answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q3', value: '=HYPERLINK("x")' }] },
    ] as never);
    const { GET } = await import('@/app/api/dealer/surveys/[id]/export/route');
    const res = await GET(req('/api/dealer/surveys/sv1/export?range=all&lang=tr'), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('anket-memnuniyet-all.csv');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM (Excel'de Türkçe karakter)
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Yanıt;Tarih;Saat;Yanıtlayan;S1. Nasıldı?;S2. Puan;S3. Not');
    expect(lines[1]).toContain(';Üye;İyi;;');
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text).not.toContain('u-secret');
  });
});
