/**
 * Bayi anket stüdyosu saf modülleri: dönem/eğilim (İstanbul günleri), CSV güvenliği, şablonların
 * ortak sözleşmeyi geçmesi, düzenleme politikası, oluşturucu taslak modeli ve gövde ayrıştırma.
 */
import { createSurveyInputSchema } from '@/lib/survey-schema';
import { fillDailySeries, ratingValue, resolveSurveyRange, summarizeGroupedAnswers } from '@/lib/dealer-surveys/aggregate';
import { answerToText, csvCell, exportFileSlug } from '@/lib/dealer-surveys/csv';
import { planSurveyUpdate } from '@/lib/dealer-surveys/edit-policy';
import { parseSurveyWrite, surveyPatchSchema } from '@/lib/dealer-surveys/input';
import { findSurveyTemplate, surveyTemplates } from '@/lib/dealer-surveys/templates';
import {
  draftFromEditor,
  draftSignature,
  moveItem,
  parseStoredDraft,
  serializeDraft,
} from '@/components/dealer/b-anketler/builder-model';

describe('dönem ve eğilim (Europe/Istanbul)', () => {
  // 2026-10-09 22:30 UTC = 2026-10-10 01:30 İstanbul → "bugün" 10 Ekim.
  const now = new Date('2026-10-09T22:30:00Z');

  it('7d: İstanbul gün başından itibaren 7 gün (bugün dahil)', () => {
    const r = resolveSurveyRange('7d', now, '2026-01-01T00:00:00Z');
    expect(r.trendFrom).toBe('2026-10-04');
    expect(r.trendTo).toBe('2026-10-10');
    expect(r.from?.toISOString()).toBe('2026-10-03T21:00:00.000Z'); // 4 Ekim 00:00 İstanbul
  });

  it('all: filtre yok; eğilim anketin ilk gününden, en çok 90 gün', () => {
    const young = resolveSurveyRange('all', now, '2026-10-05T12:00:00Z');
    expect(young.from).toBeNull();
    expect(young.trendFrom).toBe('2026-10-05');
    const old = resolveSurveyRange('all', now, '2025-01-01T00:00:00Z');
    expect(old.trendFrom).toBe('2026-07-13');
  });

  it('boş günler 0 ile doldurulur', () => {
    expect(fillDailySeries([{ day: '2026-10-02', n: 3 }], '2026-10-01', '2026-10-03')).toEqual([
      { day: '2026-10-01', n: 0 },
      { day: '2026-10-02', n: 3 },
      { day: '2026-10-03', n: 0 },
    ]);
  });

  it('puan değeri yalnız tamsayı 1–5 (eski sayısal metin kabul)', () => {
    expect([ratingValue(5), ratingValue('4'), ratingValue(0), ratingValue(4.5), ratingValue(1e9), ratingValue('x')]).toEqual([5, 4, null, null, null, null]);
  });
});

describe('summarizeGroupedAnswers', () => {
  it('çoklu seçimde dizi, kişi başına bir kez; atlayan = toplam − yanıtlayan', () => {
    const { questions, ratingOverall } = summarizeGroupedAnswers(
      [
        { id: 'm', type: 'multiple_choice', text: 'M', options: ['A', 'B', 'C'], required: false },
        { id: 'r', type: 'rating', text: 'R', options: null, required: true },
      ],
      [
        { questionId: 'm', value: ['A', 'B', 'A'], n: 2 },
        { questionId: 'm', value: ['Z'], n: 1 },
        { questionId: 'r', value: 4, n: 2 },
        { questionId: 'r', value: 2, n: 2 },
      ],
      [],
      5,
    );
    expect(questions[0].options).toEqual([
      { label: 'A', count: 2 },
      { label: 'B', count: 2 },
      { label: 'C', count: 0 },
    ]);
    expect(questions[0]).toMatchObject({ answered: 2, skipped: 3, ignoredAnswers: 1 });
    expect(questions[1].rating).toEqual({ avg: 3, distribution: [0, 2, 0, 2, 0], satisfiedPct: 50 });
    expect(ratingOverall).toEqual({ avg: 3, n: 4, satisfiedPct: 50 });
  });
});

describe('CSV', () => {
  it('formül enjeksiyonu kaçışlanır, ayırıcı/tırnak güvenli', () => {
    expect(csvCell('=1+1', ';')).toBe("'=1+1");
    expect(csvCell('-2', ';')).toBe("'-2");
    expect(csvCell(-2, ';')).toBe('-2');
    expect(csvCell('a;b', ';')).toBe('"a;b"');
    expect(csvCell('say "hi"', ',')).toBe('"say ""hi"""');
  });

  it('cevap metni: tanımsız seçenek ve aralık dışı puan boş', () => {
    const q = { id: 'q', type: 'single_choice', text: 'Q', options: ['Evet', 'Hayır'] };
    expect(answerToText(q, 'Evet')).toBe('Evet');
    expect(answerToText(q, 'Uydurma')).toBe('');
    expect(answerToText({ id: 'm', type: 'multiple_choice', text: 'M', options: ['A', 'B'] }, ['B', 'A', 'B'])).toBe('B | A');
    expect(answerToText({ id: 'r', type: 'rating', text: 'R', options: null }, 9)).toBe('');
  });

  it('dosya adı ASCII ve Türkçe harfler sadeleşir', () => {
    expect(exportFileSlug('Müşteri Memnuniyeti: Şubat & İkram!')).toBe('musteri-memnuniyeti-subat-ikram');
    expect(exportFileSlug('***')).toBe('anket');
  });
});

describe('şablonlar ortak sözleşmeyi geçer', () => {
  for (const locale of ['tr', 'en'] as const) {
    it(`${locale}: her şablon createSurveyInputSchema ile geçerli`, () => {
      for (const tpl of surveyTemplates(locale)) {
        const r = createSurveyInputSchema.safeParse({ title: tpl.title, description: tpl.description, questions: tpl.questions });
        expect(r.success).toBe(true);
      }
    });
  }
  it('bilinmeyen anahtar → null', () => {
    expect(findSurveyTemplate('yok')).toBeNull();
    expect(findSurveyTemplate('csat')?.questions.length).toBeGreaterThan(0);
  });
});

describe('planSurveyUpdate', () => {
  const existing = [
    { id: 'q1', type: 'multiple_choice', text: 'Ne?', options: ['A', 'B'], required: true, order: 0 },
    { id: 'q2', type: 'rating', text: 'Puan', options: null, required: true, order: 1 },
  ];
  const parse = (questions: unknown[]) => {
    const r = createSurveyInputSchema.parse({ title: 'T', questions });
    return r.questions;
  };

  it('kilitte tip değişimi reddedilir', () => {
    const r = planSurveyUpdate(existing, parse([{ type: 'single_choice', text: 'Ne?', options: ['A', 'B'] }, { type: 'rating', text: 'Puan' }]), ['q1', 'q2'], true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: 'STRUCTURE_LOCKED', questionIndex: 0 });
  });

  it('aynı kimlik iki kez → UNKNOWN_QUESTION', () => {
    const r = planSurveyUpdate(existing, parse([{ type: 'rating', text: 'a' }, { type: 'rating', text: 'b' }]), ['q2', 'q2'], false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNKNOWN_QUESTION');
  });

  it('kilitsiz: seçim → puan geçişinde seçenekler temizlenir (null)', () => {
    const r = planSurveyUpdate(existing, parse([{ type: 'rating', text: 'Ne?' }]), ['q1'], false);
    expect(r.ok && r.plan).toEqual({ deletes: ['q2'], updates: [{ id: 'q1', data: { type: 'rating', text: 'Ne?', options: null, required: true, order: 0 } }], creates: [] });
  });
});

describe('gövde ayrıştırma', () => {
  it('questionIds uzunluğu sorularla eşleşmeli', () => {
    const r = parseSurveyWrite({ title: 'T', questions: [{ type: 'rating', text: 'X' }], questionIds: ['a', 'b'] });
    expect(r.ok).toBe(false);
  });
  it('PATCH boş gövde ve bilinmeyen alan reddedilir', () => {
    expect(surveyPatchSchema.safeParse({}).success).toBe(false);
    expect(surveyPatchSchema.safeParse({ isActive: true, foo: 1 }).success).toBe(false);
    expect(surveyPatchSchema.safeParse({ isActive: true }).success).toBe(true);
  });
});

describe('oluşturucu taslak modeli', () => {
  it('yerel taslak gidiş-dönüş; bozuk/eski taslak yok sayılır', () => {
    const now = 1_760_000_000_000;
    const draft = parseStoredDraft(
      serializeDraft(
        {
          title: 'Başlık',
          description: '',
          questions: [{ id: 'x', type: 'single_choice', text: 'S', options: [{ id: 'o', value: 'A' }], required: false, serverId: null, locked: false }],
        },
        now,
      ),
      now,
    );
    expect(draft?.title).toBe('Başlık');
    expect(draft?.questions[0]).toMatchObject({ type: 'single_choice', text: 'S', required: false });
    expect(draft?.questions[0].options.map((o) => o.value)).toEqual(['A']);
    expect(parseStoredDraft('{bozuk', now)).toBeNull();
    expect(parseStoredDraft(serializeDraft({ title: 'T', description: '', questions: [] }, now - 31 * 86_400_000), now)).toBeNull();
  });

  it('düzenleyici verisi: kilitli seçenekler + seçeneksiz eski soruya iki boş satır', () => {
    const d = draftFromEditor({
      survey: { id: 's', title: 'T', description: null, isActive: true, createdAt: '2026-10-01T00:00:00Z' },
      questions: [
        { id: 'q1', type: 'single_choice', text: 'A', options: ['X', 'Y'], required: true },
        { id: 'q2', type: 'single_choice', text: 'Bozuk', options: [], required: true },
      ],
      responseCount: 3,
      structuralLock: true,
    });
    expect(d.questions[0].options.every((o) => o.locked)).toBe(true);
    expect(d.questions[0].serverId).toBe('q1');
    expect(d.questions[1].options).toHaveLength(2);
    expect(draftSignature(d)).toBe(draftSignature({ ...d, questions: d.questions.map((q) => ({ ...q, id: 'baska' })) }));
  });

  it('moveItem sınır dışında listeyi değiştirmez', () => {
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
  });
});
