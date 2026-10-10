/**
 * Anket uçları (P0-39 bayi anketleri) — denetimdeki DOĞRULANMIŞ senaryoların yeniden üretimi:
 *  1. Bayi boş seçenekli seçim sorusuyla anket oluşturuyordu → 201 + yanıtlanamaz anket.
 *  2. Oturumsuz biri `{rating: 1000000}` / listede olmayan seçenek / yabancı soru kimliği
 *     gönderip bayi sonuçlarını kirletebiliyordu → 201.
 *  3. Oturumlu kullanıcı aynı anketi sınırsız yanıtlayabiliyordu.
 * Prisma ve oturum mock'lanır; gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkPublicActionRateLimit: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@/lib/request-metadata', () => ({ getClientIp: () => '1.2.3.4' }));
// Doldurma: modül açık (lib/survey-fill.ts → getModuleControls).
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn(async () => ({})) }));

const mockSurveyFindUnique = jest.fn();
const mockSurveyCount = jest.fn();
const mockSurveyCreate = jest.fn();
const mockSurveyFindMany = jest.fn();
const mockResponseFindFirst = jest.fn();
const mockResponseCreate = jest.fn();
const mockExecuteRaw = jest.fn(async () => 0);
jest.mock('@/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    survey: {
      findUnique: (...a: unknown[]) => mockSurveyFindUnique(...a),
      count: (...a: unknown[]) => mockSurveyCount(...a),
      create: (...a: unknown[]) => mockSurveyCreate(...a),
      findMany: (...a: unknown[]) => mockSurveyFindMany(...a),
    },
    surveyResponse: {
      findFirst: (...a: unknown[]) => mockResponseFindFirst(...a),
      create: (...a: unknown[]) => mockResponseCreate(...a),
    },
    $executeRaw: (...a: unknown[]) => mockExecuteRaw(...(a as [])),
  };
  // Oturumlu yanıt: kullanıcı×anket danışma kilidi işlem içinde (tx = aynı mock).
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma, isPrismaConnectivityError: () => false };
});

const SURVEY = {
  id: 'sv1',
  title: 'Memnuniyet',
  description: null,
  isActive: true,
  dealer: { id: 'dealer-1', role: 'DEALER', businessName: 'Kafe', businessLogo: null, suspendedAt: null, anonymizedAt: null },
  questions: [
    { id: 'q1', type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true, order: 0 },
    { id: 'q2', type: 'rating', text: 'Puan', options: null, required: true, order: 1 },
    { id: 'q3', type: 'single_choice', text: 'Eski bozuk', options: [], required: true, order: 2 },
  ],
};

const params = { params: Promise.resolve({ id: 'sv1' }) };

async function fill(body: unknown) {
  const { POST } = await import('@/app/api/surveys/[id]/fill/route');
  return POST(
    new NextRequest('http://localhost/api/surveys/sv1/fill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params,
  );
}

async function createSurvey(body: unknown) {
  const { POST } = await import('@/app/api/dealer/surveys/route');
  return POST(
    new NextRequest('http://localhost/api/dealer/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue(null);
  mockSurveyFindUnique.mockResolvedValue(SURVEY);
  mockResponseFindFirst.mockResolvedValue(null);
  mockResponseCreate.mockResolvedValue({ id: 'r1' });
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'dealer-1', role: 'DEALER' } } });
  mockSurveyCount.mockResolvedValue(0);
  mockSurveyCreate.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'new', ...(data as object) }));
});

describe('POST /api/dealer/surveys — oluşturma', () => {
  it('HATA SENARYOSU: boş seçenekli seçim sorusu 400 alır, DB yazılmaz', async () => {
    const res = await createSurvey({
      title: 'Anket',
      questions: [{ type: 'single_choice', text: 'Nasıldı?', options: [], required: true, order: 0 }],
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION');
    expect(body.error).toMatch(/^Soru 1: /);
    expect(body.issues[0].questionIndex).toBe(0);
    expect(mockSurveyCreate).not.toHaveBeenCalled();
  });

  it('geçerli anket 201; seçim dışı soruya options yazılmaz, sıra indeksten', async () => {
    const res = await createSurvey({
      title: ' Anket ',
      questions: [
        { type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'] },
        { type: 'rating', text: 'Puan', options: ['x'] },
      ],
    });
    expect(res.status).toBe(201);
    const data = mockSurveyCreate.mock.calls[0][0].data;
    expect(data.title).toBe('Anket');
    expect(data.dealerId).toBe('dealer-1');
    expect(data.questions.create).toEqual([
      { type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true, order: 0 },
      { type: 'rating', text: 'Puan', options: undefined, required: true, order: 1 },
    ]);
  });

  it('kota dolu → 400 SURVEY_QUOTA', async () => {
    mockSurveyCount.mockResolvedValueOnce(50);
    const res = await createSurvey({ title: 'A', questions: [{ type: 'open_text', text: 'X' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SURVEY_QUOTA');
  });

  it('bozuk JSON gövde 400 (500 değil)', async () => {
    const { POST } = await import('@/app/api/dealer/surveys/route');
    const res = await POST(new NextRequest('http://localhost/api/dealer/surveys', { method: 'POST', body: '{bozuk' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/dealer/surveys — liste', () => {
  it('yanıtlanamaz soru sayısını döner, soru gövdesini sızdırmaz', async () => {
    mockSurveyFindMany.mockResolvedValueOnce([
      { id: 'sv1', title: 'A', _count: { responses: 0, questions: 2 }, questions: [{ type: 'single_choice', options: [] }, { type: 'rating', options: null }] },
    ]);
    const { GET } = await import('@/app/api/dealer/surveys/route');
    const res = await GET();
    const body = await res.json();
    expect(body.surveys[0].unanswerableQuestions).toBe(1);
    expect(body.surveys[0]).not.toHaveProperty('questions');
  });
});

describe('GET /api/surveys/[id]/fill', () => {
  it('eski bozuk (seçeneksiz) soru kamusal görünüme girmez', async () => {
    const { GET } = await import('@/app/api/surveys/[id]/fill/route');
    const res = await GET(new NextRequest('http://localhost/api/surveys/sv1/fill'), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.survey.questions.map((q: { id: string }) => q.id)).toEqual(['q1', 'q2']);
    expect(body.alreadyResponded).toBe(false);
  });

  it('oturumlu ve daha önce yanıtlamış kullanıcıya alreadyResponded=true', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockResponseFindFirst.mockResolvedValueOnce({ id: 'r0' });
    const { GET } = await import('@/app/api/surveys/[id]/fill/route');
    const res = await GET(new NextRequest('http://localhost/api/surveys/sv1/fill'), params);
    expect((await res.json()).alreadyResponded).toBe(true);
  });

  it('olmayan anket 404 + SURVEY_NOT_FOUND kodu', async () => {
    mockSurveyFindUnique.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/surveys/[id]/fill/route');
    const res = await GET(new NextRequest('http://localhost/api/surveys/sv1/fill'), params);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SURVEY_NOT_FOUND');
  });
});

describe('POST /api/surveys/[id]/fill — doldurma', () => {
  it('geçerli yanıt 201; bozuk zorunlu soru gönderimi engellemez; normalize cevap yazılır', async () => {
    const res = await fill({ answers: [{ questionId: 'q2', value: 5 }, { questionId: 'q1', value: 'İyi' }] });
    expect(res.status).toBe(201);
    expect(mockResponseCreate).toHaveBeenCalledWith({
      data: { surveyId: 'sv1', userId: null, answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q2', value: 5 }] },
      select: { id: true },
    });
  });

  it('SALDIRI: oturumsuz 1.000.000 puan → 400, kayıt yok', async () => {
    const res = await fill({ answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q2', value: 1_000_000 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_ANSWER');
    expect(mockResponseCreate).not.toHaveBeenCalled();
  });

  it('SALDIRI: listede olmayan seçenek → 400', async () => {
    const res = await fill({ answers: [{ questionId: 'q1', value: 'Bayi tanımlamadı' }, { questionId: 'q2', value: 3 }] });
    expect(res.status).toBe(400);
    expect(mockResponseCreate).not.toHaveBeenCalled();
  });

  it('SALDIRI: yabancı soru kimliği → 400 UNKNOWN_QUESTION', async () => {
    const res = await fill({ answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q2', value: 3 }, { questionId: 'x', value: 'y' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('UNKNOWN_QUESTION');
  });

  it('boş metin zorunluyu karşılamaz → 400 REQUIRED_MISSING', async () => {
    const res = await fill({ answers: [{ questionId: 'q1', value: '' }, { questionId: 'q2', value: 3 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('REQUIRED_MISSING');
  });

  it('oturumlu kullanıcı ikinci kez yanıtlayamaz → 409', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1' } });
    mockResponseFindFirst.mockResolvedValueOnce({ id: 'r0' });
    const res = await fill({ answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q2', value: 3 }] });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_RESPONDED');
    expect(mockResponseCreate).not.toHaveBeenCalled();
  });

  it('oturumlu ilk yanıt kullanıcı kimliğiyle yazılır; istemciden userId kabul edilmez', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'u1' } });
    const res = await fill({ userId: 'forged', answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q2', value: 3 }] });
    expect(res.status).toBe(201);
    expect(mockResponseCreate.mock.calls[0][0].data.userId).toBe('u1');
    // Eşzamanlı çift gönderime karşı danışma kilidi alındı.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('bozuk gövde → 400 VALIDATION', async () => {
    const res = await fill({ answers: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION');
  });
});
