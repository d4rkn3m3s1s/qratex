/**
 * Anket doldurma — sunucu okuma modeli + tekillik + istemci akış mantığı
 * (denetim: docs/audit/2026-10-08/musteri/surveys_id.md B3, B4, B7, B9).
 * Gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ __esModule: true, getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
// Doldurma ucu oturumu isteğe bağlı ama doğrulanmış okur (getOptionalSession).
jest.mock('@/lib/api-auth', () => ({
  getOptionalSession: async () => {
    const s = (await mockGetServerSession()) as { user?: { id?: string } } | null;
    return s?.user?.id ? s : null;
  },
}));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: async () => ({ ok: true }),
  checkPublicActionRateLimit: async () => ({ ok: true }),
}));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
const modules: { value: Record<string, boolean> } = { value: {} };
jest.mock('@/lib/module-gate', () => ({ getModuleControls: async () => modules.value }));

type SurveyRow = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  dealer: Record<string, unknown> | null;
  questions: { id: string; type: string; text: string; options: unknown; required: boolean }[];
};
const db: { survey: SurveyRow | null; existing: { id: string } | null; throwOnFind: boolean } = {
  survey: null,
  existing: null,
  throwOnFind: false,
};

function baseSurvey(over: Partial<SurveyRow> = {}): SurveyRow {
  return {
    id: 'sv_000001',
    title: 'Memnuniyet',
    description: '  ',
    isActive: true,
    dealer: { id: 'dealer_1', role: 'DEALER', businessName: 'Kahve Durağı', name: 'Ahmet Yılmaz', businessLogo: null, suspendedAt: null, anonymizedAt: null },
    questions: [
      { id: 'q1', type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true },
      { id: 'q2', type: 'rating', text: 'Puan', options: null, required: true },
      { id: 'q3', type: 'open_text', text: 'Not', options: null, required: false },
      { id: 'q4', type: 'multiple_choice', text: 'Eski bozuk', options: [], required: true },
    ],
    ...over,
  };
}

const mockCreate = jest.fn(async () => ({ id: 'resp_1' }));
const mockExecuteRaw = jest.fn(async () => 0);
jest.mock('@/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    survey: {
      findUnique: jest.fn(async () => {
        if (db.throwOnFind) throw new Error('db down');
        return db.survey;
      }),
    },
    surveyResponse: {
      findFirst: jest.fn(async () => db.existing),
      create: (...a: unknown[]) => mockCreate(...(a as [])),
    },
    $executeRaw: (...a: unknown[]) => mockExecuteRaw(...(a as [])),
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma, isPrismaConnectivityError: () => false };
});

import {
  appendDoneCookie,
  estimateSurveySeconds,
  loadSurveyForFill,
  parseDoneCookie,
  submitSurveyResponse,
} from '@/lib/survey-fill';
import { GET, POST } from '@/app/api/surveys/[id]/fill/route';
import {
  answerSummary,
  buildSubmission,
  missingRequired,
  sanitizeDraft,
  toggleOption,
} from '@/components/public/p-deneyim-anket/survey-flow-logic';
import type { PublicSurveyQuestion } from '@/lib/survey-schema';

const ctx = { params: Promise.resolve({ id: 'sv_000001' }) };

function post(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost/api/surveys/sv_000001/fill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

const VALID = { answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q2', value: 4 }] };

beforeEach(() => {
  jest.clearAllMocks();
  db.survey = baseSurvey();
  db.existing = null;
  db.throwOnFind = false;
  modules.value = {};
  mockGetServerSession.mockResolvedValue(null);
});

describe('çerez yardımcıları', () => {
  it('parse: yabancı/bozuk parçaları atar; append: tekrarsız, en çok 30', () => {
    expect(parseDoneCookie('a1.b2.<x>..c3')).toEqual(['a1', 'b2', 'c3']);
    expect(appendDoneCookie('a1.b2', 'a1')).toBe('b2.a1');
    const many = Array.from({ length: 35 }, (_, i) => `s${i}`).join('.');
    const out = appendDoneCookie(many, 'yeni').split('.');
    expect(out).toHaveLength(30);
    expect(out[29]).toBe('yeni');
  });
  it('süre tahmini: seçim 7 + puan 5 + açık uçlu 30; en az 30 sn', () => {
    expect(estimateSurveySeconds([{ type: 'single_choice' }, { type: 'rating' }, { type: 'open_text' }])).toBe(42);
    expect(estimateSurveySeconds([{ type: 'rating' }])).toBe(30);
  });
});

describe('loadSurveyForFill — durumlar (B4/B9)', () => {
  it('ok: yalnız yanıtlanabilir sorular, işletme adı (kişisel ad YOK), zorunlu sayısı', async () => {
    const r = await loadSurveyForFill('sv_000001', { userId: null });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.survey.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(r.survey.requiredCount).toBe(2);
    expect(r.survey.description).toBeNull();
    expect(r.survey.dealer).toEqual({ id: 'dealer_1', name: 'Kahve Durağı', logo: null });
    expect(JSON.stringify(r)).not.toContain('Ahmet');
    expect(r.alreadyResponded).toBe(false);
  });

  it('pasif anket → closed (işletme adıyla)', async () => {
    db.survey = baseSurvey({ isActive: false });
    expect(await loadSurveyForFill('sv_000001', { userId: null })).toEqual({ status: 'closed', dealerName: 'Kahve Durağı' });
  });

  it('modül kapalı ya da bayi askıda → closed', async () => {
    modules.value = { dealer_surveys: false };
    expect((await loadSurveyForFill('sv_000001', { userId: null })).status).toBe('closed');
    modules.value = {};
    db.survey = baseSurvey({ dealer: { ...baseSurvey().dealer!, suspendedAt: new Date() } });
    expect((await loadSurveyForFill('sv_000001', { userId: null })).status).toBe('closed');
  });

  it('yok / anonimleştirilmiş bayi → not_found; biçimsiz kimlik DB\'ye gitmez', async () => {
    db.survey = null;
    expect((await loadSurveyForFill('sv_000001', { userId: null })).status).toBe('not_found');
    db.survey = baseSurvey({ dealer: { ...baseSurvey().dealer!, anonymizedAt: new Date() } });
    expect((await loadSurveyForFill('sv_000001', { userId: null })).status).toBe('not_found');
    expect((await loadSurveyForFill('../x', { userId: null })).status).toBe('not_found');
  });

  it('DB hatası → unavailable (sessiz "bulunamadı" değil)', async () => {
    db.throwOnFind = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await loadSurveyForFill('sv_000001', { userId: null })).status).toBe('unavailable');
    spy.mockRestore();
  });

  it('anonim cihazda daha önce yanıtlandıysa (çerez) → alreadyResponded', async () => {
    const r = await loadSurveyForFill('sv_000001', { userId: null, doneIds: ['sv_000001'] });
    expect(r.status === 'ok' && r.alreadyResponded).toBe(true);
  });
});

describe('submitSurveyResponse — tekillik (B3)', () => {
  it('anonim: kilitsiz doğrudan yazar, normalize cevap', async () => {
    const r = await submitSurveyResponse('sv_000001', VALID.answers, { userId: null });
    expect(r).toEqual({ ok: true, responseId: 'resp_1' });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('anonim + çerezde aynı anket → 409', async () => {
    const r = await submitSurveyResponse('sv_000001', VALID.answers, { userId: null, doneIds: ['sv_000001'] });
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_RESPONDED', status: 409 });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('oturumlu: danışma kilidi içinde tekrar kontrolü — yarışta ikinci yazım engellenir', async () => {
    // İlk ön kontrol boş, kilit sonrası kontrolde başka istek yazmış.
    const { prisma } = jest.requireMock('@/lib/prisma') as { prisma: { surveyResponse: { findFirst: jest.Mock } } };
    prisma.surveyResponse.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'race' });
    const r = await submitSurveyResponse('sv_000001', VALID.answers, { userId: 'u1' });
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_RESPONDED' });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('kapalı anket → 410 SURVEY_CLOSED (yazım yok)', async () => {
    db.survey = baseSurvey({ isActive: false });
    expect(await submitSurveyResponse('sv_000001', VALID.answers, { userId: null })).toMatchObject({ code: 'SURVEY_CLOSED', status: 410 });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('/api/surveys/[id]/fill uçları', () => {
  it('POST başarı: 201 + HttpOnly tekillik çerezi', async () => {
    const res = await POST(post(VALID), ctx);
    expect(res.status).toBe(201);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('qx_sv=sv_000001');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect((await res.json()).responseId).toBe('resp_1');
  });

  it('POST: aynı cihaz çerezle ikinci kez → 409', async () => {
    const res = await POST(post(VALID, 'qx_sv=sv_000001'), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_RESPONDED');
  });

  it('POST: geçersiz cevap → 400 + details.questionId (istemci soruya götürür)', async () => {
    const res = await POST(post({ answers: [{ questionId: 'q1', value: 'Yok' }, { questionId: 'q2', value: 4 }] }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_ANSWER');
    expect(body.details.questionId).toBe('q1');
  });

  it('GET: kapalı → 410 SURVEY_CLOSED; DB hatası → 503 retryable', async () => {
    db.survey = baseSurvey({ isActive: false });
    let res = await GET(new NextRequest('http://localhost/api/surveys/sv_000001/fill'), ctx);
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe('SURVEY_CLOSED');
    db.throwOnFind = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    res = await GET(new NextRequest('http://localhost/api/surveys/sv_000001/fill'), ctx);
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect((await res.json()).retryable).toBe(true);
  });
});

describe('akış mantığı (istemci, ortak şema)', () => {
  const Q: PublicSurveyQuestion[] = [
    { id: 'q1', type: 'single_choice', text: 'A', options: ['İyi', 'Kötü'], required: true },
    { id: 'q2', type: 'multiple_choice', text: 'B', options: ['x', 'y', 'z'], required: false },
    { id: 'q3', type: 'rating', text: 'C', options: null, required: true },
    { id: 'q4', type: 'open_text', text: 'D', options: null, required: false },
  ];

  it('taslak: değişmiş seçenek / aralık dışı puan atılır, yarım metin korunur, adım sınırlanır', () => {
    const now = 1_000_000;
    const d = sanitizeDraft(
      { v: 1, savedAt: now - 1000, step: 99, answers: { q1: 'Silinen seçenek', q2: ['y', 'x'], q3: 9, q4: 'yarım ', qX: 'yabancı' } },
      Q,
      now
    );
    expect(d).toEqual({ answers: { q2: ['y', 'x'], q4: 'yarım ' }, step: 3 });
    expect(sanitizeDraft({ v: 1, savedAt: now - 2 * 86_400_000, step: 0, answers: { q1: 'İyi' } }, Q, now)).toBeNull();
    expect(sanitizeDraft('bozuk', Q, now)).toBeNull();
  });

  it('eksik zorunlular; boşluk metni yanıt sayılmaz', () => {
    expect(missingRequired(Q, { q1: 'İyi', q4: '   ' }).map((q) => q.id)).toEqual(['q3']);
  });

  it('çoklu seçim aç/kapa seçenek sırasını korur', () => {
    expect(toggleOption(Q[1], ['z'], 'x')).toEqual(['x', 'z']);
    expect(toggleOption(Q[1], ['x', 'z'], 'x')).toEqual(['z']);
  });

  it('gönderim gövdesi: boşlar atılır, metin kırpılır, soru sırasında', () => {
    expect(buildSubmission(Q, { q4: '  not  ', q1: 'İyi', q2: [] })).toEqual({
      answers: [
        { questionId: 'q1', value: 'İyi' },
        { questionId: 'q4', value: 'not' },
      ],
    });
  });

  it('özet metni', () => {
    expect(answerSummary(Q[2], 4)).toBe('4/5');
    expect(answerSummary(Q[1], ['x', 'z'])).toBe('x, z');
    expect(answerSummary(Q[0], undefined)).toBeNull();
  });
});
