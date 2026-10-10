/**
 * Anket DÜZENLEME politikası (saf; Jest ile test edilir).
 *
 * Denetim (dealer_surveys_create #2/#37): oluşturulduktan sonra düzenleme yoktu; tek hata =
 * anketi silmek = bütün müşteri yanıtlarını kaybetmek. Şemada sürüm alanı yok (ŞEMA İSTEĞİ:
 * `Survey.version` + `SurveyResponse.surveyVersion`), bu yüzden yanıtların anlamını koruyan
 * kurallar burada:
 *
 *  - Yanıtı OLMAYAN anket: her şey serbest (soru sil/ekle, tip değiştir, seçenek düzenle).
 *  - Yanıtı OLAN anket (yapısal kilit): yanıtlar `questionId` + seçenek METNİNE bağlıdır;
 *      · mevcut soru silinemez, tipi değiştirilemez;
 *      · seçim sorusunun mevcut seçenekleri aynen korunmalı (yeni seçenek eklenebilir);
 *      · soru metni, zorunluluk ve sıra değişebilir; yeni soru eklenebilir.
 *
 * Girdi, ortak sözleşmeyle (lib/survey-schema.ts) doğrulanmış sorular + paralel `questionIds`
 * dizisidir (null = yeni soru). Çıktı uygulanabilir bir plan ya da kodlu hatadır.
 */
import { isChoiceType, normalizeStoredOptions, type SurveyQuestionInput } from '@/lib/survey-schema';

export type StoredEditableQuestion = {
  id: string;
  type: string;
  text: string;
  options: unknown;
  required: boolean;
  order: number;
};

export type QuestionWrite = {
  type: string;
  text: string;
  /** Seçim sorusunda dizi; diğer tiplerde null (seçenek temizlenir). */
  options: string[] | null;
  required: boolean;
  order: number;
};

export type SurveyUpdatePlan = {
  deletes: string[];
  updates: { id: string; data: QuestionWrite }[];
  creates: QuestionWrite[];
};

export type SurveyPlanError = {
  code: 'UNKNOWN_QUESTION' | 'STRUCTURE_LOCKED';
  message: string;
  /** Hatanın bağlı olduğu (girdideki) 0 tabanlı soru indeksi; silinen soru için null. */
  questionIndex: number | null;
};

export type SurveyPlanResult = { ok: true; plan: SurveyUpdatePlan } | { ok: false; error: SurveyPlanError };

function clip(text: string, max = 60): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function toWrite(q: SurveyQuestionInput, order: number): QuestionWrite {
  return {
    type: q.type,
    text: q.text,
    options: isChoiceType(q.type) && 'options' in q ? q.options : null,
    required: q.required,
    order,
  };
}

export function planSurveyUpdate(
  existing: StoredEditableQuestion[],
  input: SurveyQuestionInput[],
  questionIds: (string | null | undefined)[],
  locked: boolean,
): SurveyPlanResult {
  const byId = new Map(existing.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const plan: SurveyUpdatePlan = { deletes: [], updates: [], creates: [] };

  for (let i = 0; i < input.length; i += 1) {
    const q = input[i];
    const id = questionIds[i] ?? null;
    const write = toWrite(q, i);

    if (!id) {
      plan.creates.push(write);
      continue;
    }
    const stored = byId.get(id);
    if (!stored || seen.has(id)) {
      return {
        ok: false,
        error: { code: 'UNKNOWN_QUESTION', message: `Soru ${i + 1}: bu ankete ait olmayan bir soru gönderildi. Sayfayı yenileyip tekrar deneyin.`, questionIndex: i },
      };
    }
    seen.add(id);

    if (locked) {
      if (stored.type !== q.type) {
        return {
          ok: false,
          error: { code: 'STRUCTURE_LOCKED', message: `Soru ${i + 1}: yanıt almış bir sorunun tipi değiştirilemez.`, questionIndex: i },
        };
      }
      if (isChoiceType(q.type)) {
        const next = new Set(write.options ?? []);
        const missing = normalizeStoredOptions(stored.options).find((opt) => !next.has(opt));
        if (missing !== undefined) {
          return {
            ok: false,
            error: {
              code: 'STRUCTURE_LOCKED',
              message: `Soru ${i + 1}: yanıt almış ankette mevcut seçenekler silinemez ya da değiştirilemez ("${clip(missing)}"). Yeni seçenek ekleyebilirsiniz.`,
              questionIndex: i,
            },
          };
        }
      }
    }
    plan.updates.push({ id, data: write });
  }

  for (const q of existing) {
    if (seen.has(q.id)) continue;
    if (locked) {
      return {
        ok: false,
        error: {
          code: 'STRUCTURE_LOCKED',
          message: `Yanıt almış ankette soru silinemez ("${clip(q.text)}"). Soruyu isteğe bağlı yapabilir ya da anketi çoğaltıp yeni sürüm hazırlayabilirsiniz.`,
          questionIndex: null,
        },
      };
    }
    plan.deletes.push(q.id);
  }

  return { ok: true, plan };
}
