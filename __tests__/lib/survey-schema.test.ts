/**
 * Anket ortak sözleşmesi (P0-39 bayi anketleri): oluşturma + doldurma aynı ayrık birleşimi
 * kullanır. Bu testler denetimde DOĞRULANAN hata senaryolarını yeniden üretir:
 *  - boş seçenekli seçim sorusu yayına giriyordu (yanıtlanamaz anket),
 *  - doldurma ucu listede olmayan seçeneği / 1-5 dışı puanı / yabancı soru kimliğini kaydediyordu.
 */
import {
  createSurveyInputSchema,
  describeSurveyIssues,
  isAnswerableQuestion,
  normalizeStoredOptions,
  toPublicSurveyQuestions,
  toQuestionCreateData,
  validateSurveyAnswers,
  countUnanswerableQuestions,
  type StoredSurveyQuestion,
} from '@/lib/survey-schema';
import { aggregateSurveyResults } from '@/lib/survey-results';

const baseSurvey = (questions: unknown[]) => ({ title: 'Memnuniyet', questions });

describe('createSurveyInputSchema — oluşturma', () => {
  it('SALDIRI/HATA: iki boş seçenekli tek seçim sorusu REDDEDİLİR (eskiden [] kaydediliyordu)', () => {
    const r = createSurveyInputSchema.safeParse(
      baseSurvey([{ type: 'single_choice', text: 'Nasıldı?', options: ['', ''], required: true }]),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const { message, issues } = describeSurveyIssues(r.error);
      expect(message).toMatch(/^Soru 1: /);
      expect(issues[0].questionIndex).toBe(0);
    }
  });

  it('eski istemcinin gönderdiği boş dizi ([]) ve eksik options reddedilir', () => {
    expect(createSurveyInputSchema.safeParse(baseSurvey([{ type: 'single_choice', text: 'X', options: [] }])).success).toBe(false);
    expect(createSurveyInputSchema.safeParse(baseSurvey([{ type: 'multiple_choice', text: 'X' }])).success).toBe(false);
  });

  it('tek seçenekli seçim sorusu reddedilir (en az 2)', () => {
    expect(createSurveyInputSchema.safeParse(baseSurvey([{ type: 'single_choice', text: 'X', options: ['A'] }])).success).toBe(false);
  });

  it('büyük/küçük harf ve boşluk farkıyla yinelenen seçenekler reddedilir, hata seçeneğe işaret eder', () => {
    const r = createSurveyInputSchema.safeParse(baseSurvey([{ type: 'single_choice', text: 'X', options: ['Evet', ' evet '] }]));
    expect(r.success).toBe(false);
    if (!r.success) {
      const { issues } = describeSurveyIssues(r.error);
      expect(issues[0].optionIndex).toBe(1);
      expect(issues[0].message).toMatch(/farklı/);
    }
  });

  it('21 seçenek ve 21 soru reddedilir', () => {
    const opts = Array.from({ length: 21 }, (_, i) => `S${i}`);
    expect(createSurveyInputSchema.safeParse(baseSurvey([{ type: 'single_choice', text: 'X', options: opts }])).success).toBe(false);
    const qs = Array.from({ length: 21 }, () => ({ type: 'open_text', text: 'X' }));
    expect(createSurveyInputSchema.safeParse(baseSurvey(qs)).success).toBe(false);
  });

  it('geçersiz tip Türkçe mesajla reddedilir', () => {
    const r = createSurveyInputSchema.safeParse(baseSurvey([{ type: 'nps', text: 'X' }]));
    expect(r.success).toBe(false);
    if (!r.success) expect(describeSurveyIssues(r.error).message).toContain('Geçersiz soru tipi');
  });

  it('geçerli anket: metinler kırpılır, seçim dışı tiplerde options atılır, sıra indeksten gelir', () => {
    const r = createSurveyInputSchema.safeParse({
      title: '  Anket  ',
      description: '   ',
      questions: [
        { type: 'single_choice', text: ' Nasıldı? ', options: [' İyi ', 'Kötü'], order: 7 },
        { type: 'open_text', text: 'Yorum', options: ['gizlice'] },
        { type: 'rating', text: 'Puan', required: false },
      ],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.title).toBe('Anket');
    expect(r.data.description).toBeUndefined();
    const rows = toQuestionCreateData(r.data.questions);
    expect(rows[0]).toEqual({ type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true, order: 0 });
    expect(rows[1].options).toBeUndefined();
    expect(rows[2]).toMatchObject({ type: 'rating', required: false, order: 2 });
  });

  it('başlıksız veya sorusuz anket reddedilir', () => {
    expect(createSurveyInputSchema.safeParse({ title: ' ', questions: [{ type: 'open_text', text: 'X' }] }).success).toBe(false);
    expect(createSurveyInputSchema.safeParse({ title: 'A', questions: [] }).success).toBe(false);
    expect(createSurveyInputSchema.safeParse(null).success).toBe(false);
  });
});

const QUESTIONS: StoredSurveyQuestion[] = [
  { id: 'q1', type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true },
  { id: 'q2', type: 'multiple_choice', text: 'Neler?', options: ['Kahve', 'Tatlı', 'Kahve'], required: false },
  { id: 'q3', type: 'rating', text: 'Puan', options: null, required: true },
  { id: 'q4', type: 'open_text', text: 'Yorum', options: null, required: false },
  // Eski bozuk kayıt: seçeneksiz, zorunlu seçim sorusu
  { id: 'q5', type: 'single_choice', text: 'Bozuk', options: [], required: true },
];

describe('kayıtlı sorular — kamusal görünüm', () => {
  it('normalizeStoredOptions: string olmayan/boş/yinelenen elenir', () => {
    expect(normalizeStoredOptions(['A', ' a ', '', 3, null, 'B '])).toEqual(['A', 'B']);
    expect(normalizeStoredOptions(null)).toEqual([]);
    expect(normalizeStoredOptions('A')).toEqual([]);
  });

  it('seçeneksiz seçim sorusu ve bilinmeyen tip yanıtlanamaz sayılır', () => {
    expect(isAnswerableQuestion({ type: 'single_choice', options: [] })).toBe(false);
    expect(isAnswerableQuestion({ type: 'mystery', options: null })).toBe(false);
    expect(isAnswerableQuestion({ type: 'rating', options: null })).toBe(true);
    expect(countUnanswerableQuestions(QUESTIONS)).toBe(1);
  });

  it('kamusal görünüm bozuk soruyu dışarıda bırakır ve seçenekleri tekilleştirir', () => {
    const pub = toPublicSurveyQuestions(QUESTIONS);
    expect(pub.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(pub[1].options).toEqual(['Kahve', 'Tatlı']);
    expect(pub[2].options).toBeNull();
  });
});

describe('validateSurveyAnswers — doldurma', () => {
  const valid = [
    { questionId: 'q1', value: 'İyi' },
    { questionId: 'q3', value: 4 },
  ];

  it('geçerli cevaplar normalize edilip soru sırasıyla döner; bozuk zorunlu soru engel olmaz', () => {
    const r = validateSurveyAnswers(QUESTIONS, [
      { questionId: 'q4', value: '  harika  ' },
      ...valid,
      { questionId: 'q2', value: [] }, // boş isteğe bağlı → atılır
    ]);
    expect(r).toEqual({
      ok: true,
      answers: [
        { questionId: 'q1', value: 'İyi' },
        { questionId: 'q3', value: 4 },
        { questionId: 'q4', value: 'harika' },
      ],
    });
  });

  it('SALDIRI: 1.000.000 puan reddedilir (ortalama zehirleme)', () => {
    const r = validateSurveyAnswers(QUESTIONS, [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q3', value: 1_000_000 }]);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_ANSWER', questionId: 'q3' });
  });

  it('SALDIRI: listede olmayan seçenek (sahte çubuk) reddedilir', () => {
    const r = validateSurveyAnswers(QUESTIONS, [{ questionId: 'q1', value: '<script>x</script>' }, { questionId: 'q3', value: 3 }]);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_ANSWER', questionId: 'q1' });
  });

  it('SALDIRI: ankete ait olmayan soru kimliği reddedilir', () => {
    const r = validateSurveyAnswers(QUESTIONS, [...valid, { questionId: 'other-survey-q', value: 'x' }]);
    expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_QUESTION' });
  });

  it('aynı soruya iki cevap reddedilir', () => {
    const r = validateSurveyAnswers(QUESTIONS, [...valid, { questionId: 'q1', value: 'Kötü' }]);
    expect(r).toMatchObject({ ok: false, code: 'DUPLICATE_ANSWER' });
  });

  it('çoklu seçimde yinelenen ve yabancı seçenek reddedilir', () => {
    expect(validateSurveyAnswers(QUESTIONS, [...valid, { questionId: 'q2', value: ['Kahve', 'Kahve'] }])).toMatchObject({ ok: false, code: 'INVALID_ANSWER' });
    expect(validateSurveyAnswers(QUESTIONS, [...valid, { questionId: 'q2', value: ['Kahve', 'Pizza'] }])).toMatchObject({ ok: false, code: 'INVALID_ANSWER' });
  });

  it('ondalıklı puan, metin puan ve 2001 karakter metin reddedilir', () => {
    expect(validateSurveyAnswers(QUESTIONS, [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q3', value: 2.5 }]).ok).toBe(false);
    expect(validateSurveyAnswers(QUESTIONS, [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q3', value: '5' }]).ok).toBe(false);
    expect(validateSurveyAnswers(QUESTIONS, [...valid, { questionId: 'q4', value: 'x'.repeat(2001) }]).ok).toBe(false);
  });

  it('boşluktan oluşan cevap zorunlu soruyu karşılamaz', () => {
    const qs: StoredSurveyQuestion[] = [{ id: 'a', type: 'open_text', options: null, required: true }];
    expect(validateSurveyAnswers(qs, [{ questionId: 'a', value: '   ' }])).toMatchObject({ ok: false, code: 'REQUIRED_MISSING' });
  });

  it('eksik zorunlu soru → REQUIRED_MISSING; hiç geçerli cevap yok → EMPTY_SUBMISSION', () => {
    expect(validateSurveyAnswers(QUESTIONS, [{ questionId: 'q1', value: 'İyi' }])).toMatchObject({ ok: false, code: 'REQUIRED_MISSING', questionId: 'q3' });
    const optional: StoredSurveyQuestion[] = [{ id: 'o', type: 'open_text', options: null, required: false }];
    expect(validateSurveyAnswers(optional, [])).toMatchObject({ ok: false, code: 'EMPTY_SUBMISSION' });
  });

  it('bozuk (yanıtlanamaz) soruya gelen cevap sessizce atılır', () => {
    const r = validateSurveyAnswers(QUESTIONS, [...valid, { questionId: 'q5', value: 'herhangi' }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers.map((a) => a.questionId)).toEqual(['q1', 'q3']);
  });
});

describe('aggregateSurveyResults — savunmacı toplama', () => {
  const qs = [
    { id: 'q1', type: 'single_choice', text: 'Nasıldı?', options: ['İyi', 'Kötü'], required: true },
    { id: 'q3', type: 'rating', text: 'Puan', options: null, required: true },
    { id: 'q4', type: 'open_text', text: 'Yorum', options: null, required: false },
  ];

  it('eski kirli kayıtlar (sahte seçenek, 1e6 puan) sayılmaz ve ignoredAnswers ile görünür', () => {
    const res = aggregateSurveyResults(qs, [
      { answers: [{ questionId: 'q1', value: 'İyi' }, { questionId: 'q3', value: 5 }, { questionId: 'q4', value: ' güzel ' }] },
      { answers: [{ questionId: 'q1', value: 'SAHTE' }, { questionId: 'q3', value: 1_000_000 }, { questionId: 'q4', value: '' }] },
      { answers: 'bozuk-json' },
      { answers: [{ questionId: 'q1', value: 'Kötü' }, { questionId: 'q3', value: 3 }] },
    ]);
    expect(res[0]).toMatchObject({ totalAnswers: 2, ignoredAnswers: 1, optionCounts: { 'İyi': 1, 'Kötü': 1 } });
    expect(res[0].optionCounts).not.toHaveProperty('SAHTE');
    expect(res[1]).toMatchObject({ totalAnswers: 2, ignoredAnswers: 1, avg: 4 });
    expect(res[1].distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 });
    expect(res[2]).toMatchObject({ totalAnswers: 1, ignoredAnswers: 1, recentTexts: ['güzel'] });
  });
});

describe('survey-draft — oluşturucu taslağı ↔ şema', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateSurveyDraft } = require('@/lib/survey-draft') as typeof import('@/lib/survey-draft');

  it('iki boş seçenekli soru: gövde [] olur ve hata o sorunun kartına bağlanır', () => {
    const draft = {
      title: 'A',
      description: '',
      questions: [{ id: 'qa', type: 'single_choice' as const, text: 'Nasıldı?', options: [{ id: 'o1', value: '' }, { id: 'o2', value: ' ' }], required: true }],
    };
    const r = validateSurveyDraft(draft);
    expect(r.ok).toBe(false);
    expect(r.payload.questions[0].options).toEqual([]);
    expect(r.errors.byQuestion.qa.options).toMatch(/en az 2/i);
  });

  it('yinelenen seçenek hatası doğru seçenek kimliğine eşlenir (boş satır atlansa da)', () => {
    const draft = {
      title: 'A',
      description: '',
      questions: [{
        id: 'qa', type: 'single_choice' as const, text: 'X', required: true,
        options: [{ id: 'o1', value: 'Evet' }, { id: 'o2', value: '' }, { id: 'o3', value: 'EVET' }],
      }],
    };
    const r = validateSurveyDraft(draft);
    expect(r.ok).toBe(false);
    expect(r.errors.byQuestion.qa.option).toEqual({ o3: 'Seçenekler birbirinden farklı olmalı' });
  });

  it('geçerli taslak: ok ve boş açıklama gövdeye girmez', () => {
    const r = validateSurveyDraft({
      title: 'A',
      description: '  ',
      questions: [{ id: 'qa', type: 'rating', text: 'Puan', options: [{ id: 'o1', value: 'x' }], required: true }],
    });
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({ title: 'A', questions: [{ type: 'rating', text: 'Puan', required: true, order: 0 }] });
  });
});
