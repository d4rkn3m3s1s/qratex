/**
 * Bayi anket stüdyosu — SUNUCU tek kaynağı (BFF uçları ve sunucu sayfaları aynı fonksiyonları
 * çağırır). Her sorgu `dealerId` ile kapsamlıdır (kiracı); kimlik/rol/modül kapısı çağıranda
 * (defineRoute ya da sunucu sayfası) çözülür.
 *
 * Mimari ilkeler (yol haritası §4.4):
 *  - cascade silme yok: yanıtı olan anket SİLİNEMEZ (409); durdurulur. Yanıtsız anketin silinmesi
 *    yalnız tanım (soru) satırlarını götürür, hiçbir müşteri kaydını değil.
 *  - toplama SQL'de (`jsonb_array_elements` + GROUP BY), gün kovaları Europe/Istanbul.
 *  - hata görünür: bulunamayan anket 404 `SURVEY_NOT_FOUND`, kota 409 `SURVEY_QUOTA`.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import {
  countUnanswerableQuestions,
  isChoiceType,
  normalizeStoredOptions,
  SURVEY_LIMITS,
  toQuestionCreateData,
  type CreateSurveyInput,
  type SurveyQuestionInput,
} from '@/lib/survey-schema';
import { addDays, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import { fillDailySeries, resolveSurveyRange, summarizeGroupedAnswers, type GroupedAnswerRow, type TextPreviewRow } from './aggregate';
import { planSurveyUpdate } from './edit-policy';
import { answersMap, answerToText, CSV_BOM, surveyCsvHeader, surveyCsvRow, type CsvLang } from './csv';
import {
  EXPORT_MAX_ROWS,
  LIST_TREND_DAYS,
  RESPONSES_PAGE_SIZE,
  RESULT_TEXT_PREVIEW,
  TEXTS_PAGE_SIZE,
  type SurveyEditorData,
  type SurveyListData,
  type SurveyListItem,
  type SurveyRange,
  type SurveyResponsesPage,
  type SurveyResultsData,
  type SurveyTextsPage,
} from './types';

const LOCAL_DAY = Prisma.sql`to_char(((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD')`;
/** Bozuk (dizi olmayan) `answers` gövdesine karşı güvenli eleman açılımı. */
const ANSWER_ELEMENTS = Prisma.sql`CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.answers) = 'array' THEN r.answers ELSE '[]'::jsonb END) AS a`;
/** Sabit tamsayılar parametre değil LİTERAL: `left(text, bigint)` Postgres'te yok. */
const OPEN_TEXT_MAX_SQL = Prisma.raw(String(SURVEY_LIMITS.openTextMax));

export function surveyNotFound(): ApiError {
  return new ApiError('SURVEY_NOT_FOUND', 'Anket bulunamadı ya da bu işletmeye ait değil.', { status: 404 });
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

// ───────────────────────────── Liste ─────────────────────────────

export async function listDealerSurveys(dealerId: string, now: Date = new Date()): Promise<SurveyListData> {
  const rows = await prisma.survey.findMany({
    where: { dealerId },
    select: {
      id: true,
      title: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { responses: true, questions: true } },
      questions: { select: { type: true, options: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const ids = rows.map((r) => r.id);
  const today = istanbulDay(now);
  const fromDay = addDays(today, -(LIST_TREND_DAYS - 1));
  const lastById = new Map<string, Date | null>();
  const dailyById = new Map<string, { day: string; n: number }[]>();

  if (ids.length > 0) {
    const [last, daily] = await Promise.all([
      prisma.surveyResponse.groupBy({
        by: ['surveyId'],
        where: { surveyId: { in: ids } },
        _max: { createdAt: true },
      }),
      prisma.$queryRaw<{ surveyId: string; day: string; n: number | bigint }[]>(Prisma.sql`
        SELECT r."surveyId" AS "surveyId", ${LOCAL_DAY} AS day, count(*)::int AS n
        FROM "SurveyResponse" r
        WHERE r."surveyId" IN (${Prisma.join(ids)}) AND r."createdAt" >= ${istanbulDayStart(fromDay)}
        GROUP BY 1, 2
      `),
    ]);
    for (const g of last as { surveyId: string; _max: { createdAt: Date | null } | null }[]) {
      lastById.set(g.surveyId, g._max?.createdAt ?? null);
    }
    for (const d of daily) {
      const list = dailyById.get(d.surveyId) ?? [];
      list.push({ day: d.day, n: Number(d.n) });
      dailyById.set(d.surveyId, list);
    }
  }

  const totalTrend = new Array<number>(LIST_TREND_DAYS).fill(0);
  const surveys: SurveyListItem[] = rows.map((r) => {
    const trend = fillDailySeries(dailyById.get(r.id) ?? [], fromDay, today).map((p) => p.n);
    trend.forEach((n, i) => (totalTrend[i] += n));
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      isActive: r.isActive,
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
      questionCount: r._count.questions,
      responseCount: r._count.responses,
      unanswerableQuestions: countUnanswerableQuestions(r.questions),
      lastResponseAt: iso(lastById.get(r.id) ?? null),
      responses7d: trend.slice(-7).reduce((s, n) => s + n, 0),
      trend,
    };
  });

  const active = surveys.filter((s) => s.isActive).length;
  return {
    surveys,
    quota: { used: rows.length, limit: SURVEY_LIMITS.surveysPerDealer },
    totals: {
      total: surveys.length,
      active,
      paused: surveys.length - active,
      responses7d: surveys.reduce((s, x) => s + x.responses7d, 0),
      responsesAll: surveys.reduce((s, x) => s + x.responseCount, 0),
      trend: totalTrend,
    },
    asOf: now.toISOString(),
  };
}

// ───────────────────────────── Oluşturma / düzenleme ─────────────────────────────

async function assertQuota(dealerId: string): Promise<void> {
  const count = await prisma.survey.count({ where: { dealerId } });
  if (count >= SURVEY_LIMITS.surveysPerDealer) {
    throw new ApiError('SURVEY_QUOTA', `En fazla ${SURVEY_LIMITS.surveysPerDealer} anket oluşturabilirsiniz. Kullanmadığınız yanıtsız bir anketi silin.`, {
      status: 409,
      details: { limit: SURVEY_LIMITS.surveysPerDealer, used: count },
    });
  }
}

export async function createDealerSurvey(dealerId: string, input: CreateSurveyInput, publish: boolean) {
  await assertQuota(dealerId);
  const survey = await prisma.survey.create({
    data: {
      dealerId,
      title: input.title,
      description: input.description,
      isActive: publish,
      questions: { create: toQuestionCreateData(input.questions) },
    },
    select: { id: true, title: true, isActive: true, createdAt: true },
  });
  return { ...survey, createdAt: iso(survey.createdAt)! };
}

export async function getSurveyForEditor(dealerId: string, id: string): Promise<SurveyEditorData> {
  const s = await prisma.survey.findFirst({
    where: { id, dealerId },
    select: {
      id: true,
      title: true,
      description: true,
      isActive: true,
      createdAt: true,
      questions: { orderBy: { order: 'asc' }, select: { id: true, type: true, text: true, options: true, required: true } },
      _count: { select: { responses: true } },
    },
  });
  if (!s) throw surveyNotFound();
  return {
    survey: { id: s.id, title: s.title, description: s.description, isActive: s.isActive, createdAt: iso(s.createdAt)! },
    questions: s.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: isChoiceType(q.type) ? normalizeStoredOptions(q.options) : [],
      required: q.required,
    })),
    responseCount: s._count.responses,
    structuralLock: s._count.responses > 0,
  };
}

/**
 * Anketi (başlık, açıklama, sorular) günceller. Yanıt sayısı ve plan İŞLEM İÇİNDE okunur:
 * kontrol ile yazım arasında gelen ilk yanıt yapısal kilidi atlatamaz.
 */
export async function updateDealerSurvey(
  dealerId: string,
  id: string,
  input: CreateSurveyInput,
  questionIds: (string | null)[],
): Promise<{ id: string; updatedAt: string }> {
  return prisma.$transaction(async (tx) => {
    // Aynı anket için eşzamanlı iki kaydetme sırayla işlensin.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`survey-edit:${id}`}))`;
    const s = await tx.survey.findFirst({
      where: { id, dealerId },
      select: {
        id: true,
        questions: { select: { id: true, type: true, text: true, options: true, required: true, order: true } },
        _count: { select: { responses: true } },
      },
    });
    if (!s) throw surveyNotFound();

    const result = planSurveyUpdate(s.questions, input.questions as SurveyQuestionInput[], questionIds, s._count.responses > 0);
    if (!result.ok) {
      throw new ApiError(result.error.code, result.error.message, {
        status: result.error.code === 'STRUCTURE_LOCKED' ? 409 : 400,
        details: { questionIndex: result.error.questionIndex },
      });
    }
    const { plan } = result;
    const json = (o: string[] | null) => (o === null ? Prisma.DbNull : o);

    if (plan.deletes.length > 0) {
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id, id: { in: plan.deletes } } });
    }
    for (const u of plan.updates) {
      await tx.surveyQuestion.update({
        where: { id: u.id },
        data: { type: u.data.type, text: u.data.text, options: json(u.data.options), required: u.data.required, order: u.data.order },
      });
    }
    if (plan.creates.length > 0) {
      await tx.surveyQuestion.createMany({
        data: plan.creates.map((c) => ({
          surveyId: id,
          type: c.type,
          text: c.text,
          options: json(c.options),
          required: c.required,
          order: c.order,
        })),
      });
    }
    const updated = await tx.survey.update({
      where: { id },
      data: { title: input.title, description: input.description ?? null },
      select: { id: true, updatedAt: true },
    });
    return { id: updated.id, updatedAt: iso(updated.updatedAt)! };
  });
}

export async function patchDealerSurvey(
  dealerId: string,
  id: string,
  patch: { isActive?: boolean; title?: string; description?: string | null },
) {
  const data: Prisma.SurveyUpdateManyMutationInput = {};
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description || null;
  const n = await prisma.survey.updateMany({ where: { id, dealerId }, data });
  if (n.count === 0) throw surveyNotFound();
  const s = await prisma.survey.findFirst({
    where: { id, dealerId },
    select: { id: true, title: true, description: true, isActive: true, updatedAt: true },
  });
  if (!s) throw surveyNotFound();
  return { ...s, updatedAt: iso(s.updatedAt)! };
}

/**
 * Yalnız YANITSIZ anket silinir (koşul tek atomik sorguda). Yanıtı olan anket 409 alır:
 * müşteri yanıtları kayıt sistemidir, cascade ile yok edilmez — anket durdurulur.
 */
export async function deleteDealerSurvey(dealerId: string, id: string): Promise<void> {
  const n = await prisma.survey.deleteMany({ where: { id, dealerId, responses: { none: {} } } });
  if (n.count > 0) return;
  const s = await prisma.survey.findFirst({ where: { id, dealerId }, select: { _count: { select: { responses: true } } } });
  if (!s) throw surveyNotFound();
  throw new ApiError('SURVEY_HAS_RESPONSES', 'Yanıt almış bir anket silinemez; yanıtlar korunur. Anketi durdurabilir ve sonuçları CSV olarak indirebilirsiniz.', {
    status: 409,
    details: { responses: s._count.responses },
  });
}

/** Anketi taslak olarak (durdurulmuş) çoğaltır; yanıtlar kopyalanmaz. */
export async function duplicateDealerSurvey(dealerId: string, id: string) {
  const s = await prisma.survey.findFirst({
    where: { id, dealerId },
    select: {
      title: true,
      description: true,
      questions: { orderBy: { order: 'asc' }, select: { type: true, text: true, options: true, required: true } },
    },
  });
  if (!s) throw surveyNotFound();
  await assertQuota(dealerId);
  const suffix = ' (kopya)';
  const title = s.title.length + suffix.length > SURVEY_LIMITS.titleMax ? `${s.title.slice(0, SURVEY_LIMITS.titleMax - suffix.length)}${suffix}` : `${s.title}${suffix}`;
  // Eski şemadan kalan yanıtlanamaz sorular kopyaya taşınmaz; seçenekler normalize edilir.
  const questions = s.questions
    .filter((q) => !isChoiceType(q.type) || normalizeStoredOptions(q.options).length >= SURVEY_LIMITS.optionsMin)
    .map((q, i) => ({
      type: q.type,
      text: q.text,
      options: isChoiceType(q.type) ? normalizeStoredOptions(q.options) : undefined,
      required: q.required,
      order: i,
    }));
  const created = await prisma.survey.create({
    data: { dealerId, title, description: s.description, isActive: false, questions: { create: questions } },
    select: { id: true, title: true, isActive: true },
  });
  return created;
}

// ───────────────────────────── Sonuçlar ─────────────────────────────

type OwnedSurvey = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  questions: { id: string; type: string; text: string; options: unknown; required: boolean }[];
};

async function loadOwnedSurvey(dealerId: string, id: string): Promise<OwnedSurvey> {
  const s = await prisma.survey.findFirst({
    where: { id, dealerId },
    select: {
      id: true,
      title: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      questions: { orderBy: { order: 'asc' }, select: { id: true, type: true, text: true, options: true, required: true } },
    },
  });
  if (!s) throw surveyNotFound();
  return s;
}

/** Sunucu sayfasının sekme başlığı için hafif okuma (hata → null). */
export async function getSurveyTitle(dealerId: string, id: string): Promise<string | null> {
  try {
    const s = await prisma.survey.findFirst({ where: { id, dealerId }, select: { title: true } });
    return s?.title ?? null;
  } catch {
    return null;
  }
}

function rangeSql(from: Date | null): Prisma.Sql {
  return from ? Prisma.sql`AND r."createdAt" >= ${from}` : Prisma.empty;
}

export async function getSurveyResults(
  dealerId: string,
  id: string,
  rangeKey: SurveyRange,
  now: Date = new Date(),
): Promise<SurveyResultsData> {
  const s = await loadOwnedSurvey(dealerId, id);
  const range = resolveSurveyRange(rangeKey, now, s.createdAt);
  const createdFilter = range.from ? { createdAt: { gte: range.from } } : {};

  const choiceOrRatingIds = s.questions.filter((q) => isChoiceType(q.type) || q.type === 'rating').map((q) => q.id);
  const textIds = s.questions.filter((q) => !isChoiceType(q.type) && q.type !== 'rating').map((q) => q.id);

  const [all, inRange, members, trendRows, grouped, textRows] = await Promise.all([
    prisma.surveyResponse.aggregate({ where: { surveyId: id }, _count: { _all: true }, _max: { createdAt: true } }),
    range.from ? prisma.surveyResponse.count({ where: { surveyId: id, ...createdFilter } }) : Promise.resolve(null),
    prisma.surveyResponse.count({ where: { surveyId: id, userId: { not: null }, ...createdFilter } }),
    prisma.$queryRaw<{ day: string; n: number | bigint }[]>(Prisma.sql`
      SELECT ${LOCAL_DAY} AS day, count(*)::int AS n
      FROM "SurveyResponse" r
      WHERE r."surveyId" = ${id} AND r."createdAt" >= ${istanbulDayStart(range.trendFrom)}
      GROUP BY 1
    `),
    choiceOrRatingIds.length > 0
      ? prisma.$queryRaw<{ questionId: string; value: unknown; n: number | bigint }[]>(Prisma.sql`
          SELECT a->>'questionId' AS "questionId", a->'value' AS value, count(*)::int AS n
          FROM "SurveyResponse" r ${ANSWER_ELEMENTS}
          WHERE r."surveyId" = ${id} ${rangeSql(range.from)}
            AND a->>'questionId' IN (${Prisma.join(choiceOrRatingIds)})
          GROUP BY 1, 2
        `)
      : Promise.resolve([]),
    textIds.length > 0
      ? prisma.$queryRaw<{ questionId: string; text: string; createdAt: Date; total: number | bigint }[]>(Prisma.sql`
          SELECT t."questionId", t.text, t."createdAt", t.total FROM (
            SELECT a->>'questionId' AS "questionId",
                   left(btrim(a->>'value'), ${OPEN_TEXT_MAX_SQL}) AS text,
                   r."createdAt" AS "createdAt",
                   row_number() OVER (PARTITION BY a->>'questionId' ORDER BY r."createdAt" DESC, r.id DESC) AS rn,
                   count(*) OVER (PARTITION BY a->>'questionId')::int AS total
            FROM "SurveyResponse" r ${ANSWER_ELEMENTS}
            WHERE r."surveyId" = ${id} ${rangeSql(range.from)}
              AND a->>'questionId' IN (${Prisma.join(textIds)})
              AND jsonb_typeof(a->'value') = 'string'
              AND btrim(a->>'value') <> ''
          ) t
          WHERE t.rn <= ${Prisma.raw(String(RESULT_TEXT_PREVIEW))}
          ORDER BY t."createdAt" DESC
        `)
      : Promise.resolve([]),
  ]);

  const responsesAll = all._count._all;
  const responses = inRange ?? responsesAll;
  const summary = summarizeGroupedAnswers(
    s.questions,
    (grouped as { questionId: string; value: unknown; n: number | bigint }[]).map((g): GroupedAnswerRow => ({ questionId: g.questionId, value: g.value, n: Number(g.n) })),
    (textRows as { questionId: string; text: string; createdAt: Date; total: number | bigint }[]).map((t): TextPreviewRow => ({ ...t, total: Number(t.total) })),
    responses,
  );

  return {
    survey: {
      id: s.id,
      title: s.title,
      description: s.description,
      isActive: s.isActive,
      createdAt: iso(s.createdAt)!,
      updatedAt: iso(s.updatedAt)!,
      questionCount: s.questions.length,
      unanswerableQuestions: countUnanswerableQuestions(s.questions),
    },
    range: { key: range.key, from: iso(range.from), to: range.to.toISOString() },
    totals: { responses, responsesAll, members, lastResponseAt: iso(all._max.createdAt) },
    trend: fillDailySeries(trendRows.map((r) => ({ day: r.day, n: Number(r.n) })), range.trendFrom, range.trendTo),
    ratingOverall: summary.ratingOverall,
    questions: summary.questions,
    asOf: now.toISOString(),
  };
}

// ───────────────────────────── Sayfalı uçlar ─────────────────────────────

/** İmleç: `<ISO createdAt>|<id>` base64url. Bozuk imleç → baştan başla. */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  try {
    const [atRaw, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    const at = new Date(atRaw);
    if (!id || Number.isNaN(at.getTime()) || id.length > 64) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export async function listSurveyResponses(
  dealerId: string,
  id: string,
  opts: { cursor?: string | null; range: SurveyRange; now?: Date },
): Promise<SurveyResponsesPage> {
  const s = await loadOwnedSurvey(dealerId, id);
  const range = resolveSurveyRange(opts.range, opts.now ?? new Date(), s.createdAt);
  const cursor = decodeCursor(opts.cursor);
  const where: Prisma.SurveyResponseWhereInput = {
    surveyId: id,
    ...(range.from ? { createdAt: { gte: range.from } } : {}),
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] } : {}),
  };
  const rows = await prisma.surveyResponse.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: RESPONSES_PAGE_SIZE + 1,
    select: { id: true, createdAt: true, userId: true, answers: true },
  });
  const page = rows.slice(0, RESPONSES_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => {
      const map = answersMap(r.answers);
      return {
        id: r.id,
        createdAt: iso(r.createdAt)!,
        // Kişisel kimlik dönmez (KVKK): yalnız üye/anonim ayrımı.
        member: r.userId != null,
        answers: s.questions
          .map((q) => ({ questionId: q.id, question: q.text, display: answerToText(q, map.get(q.id)) }))
          .filter((a) => a.display !== ''),
      };
    }),
    nextCursor: rows.length > RESPONSES_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listSurveyTexts(
  dealerId: string,
  id: string,
  opts: { questionId: string; cursor?: string | null; q?: string | null; range: SurveyRange; now?: Date },
): Promise<SurveyTextsPage> {
  const s = await loadOwnedSurvey(dealerId, id);
  const question = s.questions.find((q) => q.id === opts.questionId);
  if (!question || isChoiceType(question.type) || question.type === 'rating') {
    throw new ApiError('UNKNOWN_QUESTION', 'Bu ankette böyle bir açık uçlu soru yok.', { status: 404 });
  }
  const range = resolveSurveyRange(opts.range, opts.now ?? new Date(), s.createdAt);
  const cursor = decodeCursor(opts.cursor);
  const search = opts.q?.trim() ? Prisma.sql`AND a->>'value' ILIKE ${`%${escapeLike(opts.q.trim())}%`}` : Prisma.empty;
  const after = cursor ? Prisma.sql`AND (r."createdAt", r.id) < (${cursor.at}, ${cursor.id})` : Prisma.empty;
  const base = Prisma.sql`
    FROM "SurveyResponse" r ${ANSWER_ELEMENTS}
    WHERE r."surveyId" = ${id} ${rangeSql(range.from)}
      AND a->>'questionId' = ${question.id}
      AND jsonb_typeof(a->'value') = 'string'
      AND btrim(a->>'value') <> ''
      ${search}
  `;
  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<{ id: string; createdAt: Date; text: string }[]>(Prisma.sql`
      SELECT r.id, r."createdAt", left(btrim(a->>'value'), ${OPEN_TEXT_MAX_SQL}) AS text
      ${base} ${after}
      ORDER BY r."createdAt" DESC, r.id DESC
      LIMIT ${Prisma.raw(String(TEXTS_PAGE_SIZE + 1))}
    `),
    cursor ? Promise.resolve(null) : prisma.$queryRaw<{ total: number | bigint }[]>(Prisma.sql`SELECT count(*)::int AS total ${base}`),
  ]);
  const page = rows.slice(0, TEXTS_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({ id: r.id, text: r.text, at: iso(r.createdAt)! })),
    nextCursor: rows.length > TEXTS_PAGE_SIZE && last ? encodeCursor(new Date(last.createdAt), last.id) : null,
    total: totalRows ? Number(totalRows[0]?.total ?? 0) : null,
  };
}

// ───────────────────────────── CSV ─────────────────────────────

/**
 * Dönemdeki yanıtların CSV'si (sunucuda üretilir). Partiler hâlinde okunur; en çok
 * `EXPORT_MAX_ROWS` satır — fazlası kesilir ve `truncated` ile bildirilir.
 */
export async function buildSurveyCsv(
  dealerId: string,
  id: string,
  opts: { range: SurveyRange; lang: CsvLang; now?: Date },
): Promise<{ csv: string; title: string; rows: number; truncated: boolean }> {
  const s = await loadOwnedSurvey(dealerId, id);
  const range = resolveSurveyRange(opts.range, opts.now ?? new Date(), s.createdAt);
  const lines: string[] = [surveyCsvHeader(s.questions, opts.lang)];
  const BATCH = 500;
  let cursor: { at: Date; id: string } | null = null;
  let count = 0;
  let truncated = false;
  for (;;) {
    const where: Prisma.SurveyResponseWhereInput = {
      surveyId: id,
      ...(range.from ? { createdAt: { gte: range.from } } : {}),
      ...(cursor ? { OR: [{ createdAt: { gt: cursor.at } }, { createdAt: cursor.at, id: { gt: cursor.id } }] } : {}),
    };
    const batch: { id: string; createdAt: Date; userId: string | null; answers: unknown }[] = await prisma.surveyResponse.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
      select: { id: true, createdAt: true, userId: true, answers: true },
    });
    for (const row of batch) {
      if (count >= EXPORT_MAX_ROWS) {
        truncated = true;
        break;
      }
      count += 1;
      lines.push(surveyCsvRow(row, count, s.questions, opts.lang));
    }
    if (truncated || batch.length < BATCH) break;
    const last = batch[batch.length - 1];
    cursor = { at: last.createdAt, id: last.id };
  }
  return { csv: CSV_BOM + lines.join('\r\n') + '\r\n', title: s.title, rows: count, truncated };
}
