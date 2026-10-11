/**
 * AI Kalite — inceleme kuyruğu sunucu mantığı (sunucu otoriter).
 *
 *  - Liste: zod'lu filtre, `feedback.deletedAt: null` (silinen yorum metni ekrana düşmez),
 *    "Bekliyor" görünümünde FIFO (en eski önce; aç kalma yok), sayfalı.
 *  - Karar: alan bazlı (doğru/kısmen/yanlış); skor kararlardan TÜRETİLİR. İyimser kilit
 *    (beklenen durum + reviewedAt) → 409. Her karar `auditLog`'a (kararlar + düzeltmeler dahil).
 *  - Metrik: haftalık ortalama (İstanbul haftası), model ve alan kırılımı, inceleme oranı,
 *    son örnekleme. Demo bayi örnekleri ve sezgisel (LLM olmayan) analizler metriğe girmez.
 *  - Örnekleme: katmanlı rastgele (`sampler.ts`), LLM olmayan kaynaklar ve demo bayiler hariç;
 *    silinmiş yoruma ait bekleyen örnekler "geçersiz"e çekilir.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { maskEmail } from '@/lib/http/dto';
import {
  NON_LLM_MODELS,
  QUALITY_ALERT_MIN_N,
  QUALITY_ALERT_THRESHOLD,
  SAMPLE_STATUSES,
  VERDICT_FIELDS,
  VERDICT_FIELD_LABEL,
  scoreFromVerdicts,
  type Paged,
  type QualityMetrics,
  type SampleActionInput,
  type SampleDetail,
  type SampleHistoryEvent,
  type SampleListItem,
  type SampleListQuery,
  type SampleRunInput,
  type SampleRunResult,
  type SampleStatus,
  type Verdict,
  type VerdictField,
} from './contract';
import { maskPii, previewText } from './pii-mask';
import { stratifiedSample, type Rng } from './sampler';
import { istanbulWeekStart, lastWeekStarts } from './time';

export const SAMPLE_ENTITY = 'AIQualitySample';
export const AUDIT = {
  review: 'ai_quality.review',
  skip: 'ai_quality.skip',
  void: 'ai_quality.void',
  reopen: 'ai_quality.reopen',
  run: 'ai_quality.sample_run',
} as const;

/** Bootstrap demo tohumunun nota yazdığı iç işaret — kullanıcıya gösterilmez. */
const DEMO_NOTE_MARKER = '[bootstrap-demo]';

type RequestLike = { headers: { get(name: string): string | null } } | null | undefined;

const asStatus = (s: string): SampleStatus => ((SAMPLE_STATUSES as readonly string[]).includes(s) ? (s as SampleStatus) : 'pending');
const cleanNote = (n: string | null) => {
  const v = (n ?? '').replace(DEMO_NOTE_MARKER, '').trim();
  return v ? v : null;
};
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const LIST_FEEDBACK_SELECT = {
  id: true,
  text: true,
  rating: true,
  sentiment: true,
  intent: true,
  aiModelUsed: true,
  aiVersion: true,
  createdAt: true,
  deletedAt: true,
  qrCode: { select: { name: true, dealer: { select: { name: true, isDemo: true } } } },
} satisfies Prisma.FeedbackSelect;

type ListRow = {
  id: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewerId: string | null;
  accuracyScore: number | null;
  notes: string | null;
  feedback: Prisma.FeedbackGetPayload<{ select: typeof LIST_FEEDBACK_SELECT }>;
};

async function reviewerNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name ?? (u.email ? maskEmail(u.email) : null)]));
}

function toListItem(r: ListRow, names: Map<string, string | null>): SampleListItem {
  const f = r.feedback;
  return {
    id: r.id,
    status: asStatus(r.status),
    createdAt: r.createdAt.toISOString(),
    reviewedAt: iso(r.reviewedAt),
    reviewer: r.reviewerId ? { id: r.reviewerId, name: names.get(r.reviewerId) ?? null } : null,
    accuracyScore: r.accuracyScore,
    isDemo: f.qrCode?.dealer?.isDemo === true || (r.notes ?? '').includes(DEMO_NOTE_MARKER),
    feedback: {
      id: f.id,
      preview: previewText(f.text, 180),
      rating: f.rating,
      sentiment: f.sentiment,
      intent: f.intent,
      model: f.aiModelUsed,
      version: f.aiVersion,
      dealerName: f.qrCode?.dealer?.name ?? null,
      qrName: f.qrCode?.name ?? null,
      createdAt: f.createdAt.toISOString(),
      deleted: !!f.deletedAt,
    },
  };
}

export function buildSampleWhere(q: SampleListQuery): Prisma.AIQualitySampleWhereInput {
  const feedback: Prisma.FeedbackWhereInput = {};
  if (q.status !== 'void') feedback.deletedAt = null;
  if (q.model) feedback.aiModelUsed = q.model === '__none' ? null : q.model;
  if (q.sentiment) feedback.sentiment = q.sentiment;
  if (q.intent) feedback.intent = q.intent;
  if (q.q) {
    feedback.OR = [
      { text: { contains: q.q, mode: 'insensitive' } },
      { qrCode: { name: { contains: q.q, mode: 'insensitive' } } },
      { qrCode: { dealer: { name: { contains: q.q, mode: 'insensitive' } } } },
    ];
  }
  return { ...(q.status === 'all' ? {} : { status: q.status }), feedback };
}

export async function listSamples(q: SampleListQuery): Promise<Paged<SampleListItem>> {
  const where = buildSampleWhere(q);
  const orderBy: Prisma.AIQualitySampleOrderByWithRelationInput[] =
    q.status === 'pending' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }];
  const [rows, total] = await Promise.all([
    prisma.aIQualitySample.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.size,
      take: q.size,
      select: {
        id: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        reviewerId: true,
        accuracyScore: true,
        notes: true,
        feedback: { select: LIST_FEEDBACK_SELECT },
      },
    }),
    prisma.aIQualitySample.count({ where }),
  ]);
  const names = await reviewerNames(rows.map((r) => r.reviewerId));
  return { items: rows.map((r) => toListItem(r as ListRow, names)), total, page: q.page, size: q.size };
}

/* ───────────────────────── Detay ───────────────────────── */

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x && 'name' in x ? String((x as { name: unknown }).name) : '')).filter(Boolean).slice(0, 20) : [];

function objArr<T>(v: unknown, map: (o: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v.slice(0, 20)) {
    if (x && typeof x === 'object') {
      const m = map(x as Record<string, unknown>);
      if (m) out.push(m);
    }
  }
  return out;
}
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readVerdicts(newData: unknown): { verdicts: Partial<Record<VerdictField, Verdict>> | null; corrections: Partial<Record<VerdictField, string>> | null } {
  if (!newData || typeof newData !== 'object') return { verdicts: null, corrections: null };
  const d = newData as Record<string, unknown>;
  const verdicts: Partial<Record<VerdictField, Verdict>> = {};
  const corrections: Partial<Record<VerdictField, string>> = {};
  const vRaw = (d.verdicts ?? {}) as Record<string, unknown>;
  const cRaw = (d.corrections ?? {}) as Record<string, unknown>;
  for (const f of VERDICT_FIELDS) {
    const v = vRaw[f];
    if (v === 'correct' || v === 'partial' || v === 'wrong' || v === 'na') verdicts[f] = v;
    const c = cRaw[f];
    if (typeof c === 'string' && c.trim()) corrections[f] = c;
  }
  return { verdicts: Object.keys(verdicts).length ? verdicts : null, corrections: Object.keys(corrections).length ? corrections : null };
}

export async function getSampleDetail(id: string): Promise<SampleDetail> {
  const row = await prisma.aIQualitySample.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      reviewerId: true,
      accuracyScore: true,
      notes: true,
      feedback: {
        select: {
          ...LIST_FEEDBACK_SELECT,
          intentScore: true,
          urgency: true,
          churnRisk: true,
          effortScore: true,
          topics: true,
          themes: true,
          actionSuggestions: true,
          emotions: true,
          aiAnalysis: true,
          aiProcessedAt: true,
        },
      },
    },
  });
  if (!row) throw new ApiError('NOT_FOUND', 'Örnek bulunamadı.');
  const logs = await prisma.auditLog.findMany({
    where: { entity: SAMPLE_ENTITY, entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, action: true, createdAt: true, userId: true, actorSnapshot: true, newData: true },
  });
  const names = await reviewerNames([row.reviewerId, ...logs.map((l) => l.userId)]);
  const base = toListItem(row as unknown as ListRow, names);
  const lastReview = logs.find((l) => l.action === AUDIT.review);
  const { verdicts, corrections } = readVerdicts(lastReview?.newData);
  const f = row.feedback;
  const history: SampleHistoryEvent[] = logs.map((l) => {
    const d = (l.newData ?? {}) as Record<string, unknown>;
    const snap = (l.actorSnapshot ?? {}) as Record<string, unknown>;
    return {
      id: l.id,
      at: l.createdAt.toISOString(),
      action: l.action,
      actorName: (l.userId ? names.get(l.userId) : null) ?? s(snap.name) ?? null,
      score: n(d.accuracyScore),
      note: s(d.reason) ?? s(d.notes),
    };
  });
  // Ham çıktı: PII maskeli, okunur girintili.
  let raw: string | null = null;
  if (f.aiAnalysis != null) {
    try {
      raw = maskPii(JSON.stringify(f.aiAnalysis, null, 2)).slice(0, 20_000);
    } catch {
      raw = null;
    }
  }
  return {
    ...base,
    notes: cleanNote(row.notes),
    verdicts,
    corrections,
    feedbackDetail: {
      text: maskPii(f.text ?? ''),
      aiProcessedAt: iso(f.aiProcessedAt),
      intentScore: f.intentScore,
      urgency: f.urgency,
      churnRisk: f.churnRisk,
      effortScore: f.effortScore,
      topics: strArr(f.topics),
      themes: objArr(f.themes, (o) => (s(o.theme) ? { theme: s(o.theme)!, subTheme: s(o.subTheme), sentiment: s(o.sentiment) } : null)),
      actions: objArr(f.actionSuggestions, (o) => (s(o.action) ? { action: s(o.action)!, priority: s(o.priority) } : null)),
      emotions: objArr(f.emotions, (o) => (s(o.label) ? { label: s(o.label)!, score: n(o.score) } : null)),
      rawAnalysis: raw,
    },
    history,
  };
}

/* ───────────────────────── Karar ───────────────────────── */

const ALLOWED_FROM: Record<SampleActionInput['action'], readonly SampleStatus[]> = {
  review: ['pending', 'reviewed', 'skipped'],
  skip: ['pending'],
  void: ['pending', 'skipped', 'reviewed'],
  reopen: ['skipped', 'void'],
};

export async function applySampleAction(id: string, input: SampleActionInput, actor: AuditActor, request?: RequestLike): Promise<SampleDetail> {
  const current = await prisma.aIQualitySample.findUnique({
    where: { id },
    select: { id: true, status: true, reviewedAt: true, accuracyScore: true, notes: true, feedback: { select: { deletedAt: true } } },
  });
  if (!current) throw new ApiError('NOT_FOUND', 'Örnek bulunamadı.');
  const status = asStatus(current.status);
  if (!ALLOWED_FROM[input.action].includes(status)) {
    throw new ApiError('CONFLICT', `Bu örnek "${status}" durumunda; bu işlem yapılamaz.`);
  }
  if (input.action === 'review' && current.feedback.deletedAt) {
    throw new ApiError('CONFLICT', 'Bu yorum silinmiş; örnek yalnız geçersiz sayılabilir.');
  }

  const now = new Date();
  let data: Prisma.AIQualitySampleUpdateManyMutationInput;
  let newData: Record<string, unknown>;
  switch (input.action) {
    case 'review': {
      const score = scoreFromVerdicts(input.verdicts);
      if (score === null) throw new ApiError('VALIDATION', 'En az bir alan "Doğru", "Kısmen" ya da "Yanlış" olarak değerlendirilmeli.');
      const corrections = Object.fromEntries(
        Object.entries(input.corrections ?? {}).filter(([f, v]) => v && input.verdicts[f as VerdictField] !== 'correct')
      );
      const notes = input.notes?.trim() ? input.notes.trim() : null;
      data = { status: 'reviewed', accuracyScore: score, notes, reviewedAt: now, reviewerId: actor.id };
      newData = { status: 'reviewed', accuracyScore: score, verdicts: input.verdicts, corrections, notes };
      break;
    }
    case 'skip':
      data = { status: 'skipped', reviewedAt: now, reviewerId: actor.id };
      newData = { status: 'skipped', reason: input.reason ?? null };
      break;
    case 'void':
      data = { status: 'void', accuracyScore: null, reviewedAt: now, reviewerId: actor.id };
      newData = { status: 'void', reason: input.reason };
      break;
    case 'reopen':
      data = { status: 'pending', accuracyScore: null, reviewedAt: null, reviewerId: null };
      newData = { status: 'pending' };
      break;
  }

  await prisma.$transaction(async (tx) => {
    const res = await tx.aIQualitySample.updateMany({
      where: { id, status: input.expectedStatus, reviewedAt: input.expectedReviewedAt ? new Date(input.expectedReviewedAt) : null },
      data,
    });
    if (res.count !== 1) {
      throw new ApiError('CONFLICT', 'Bu örnek siz bakarken başka biri tarafından güncellendi. Güncel hâlini yükleyip tekrar deneyin.');
    }
    await tx.auditLog.create({
      data: auditEntry(
        actor,
        {
          action: AUDIT[input.action],
          entity: SAMPLE_ENTITY,
          entityId: id,
          oldData: { status, accuracyScore: current.accuracyScore, notes: cleanNote(current.notes) },
          newData,
        },
        request
      ),
    });
  });
  return getSampleDetail(id);
}

/* ───────────────────────── Metrik ───────────────────────── */

const METRIC_WEEKS = 12;
const realSampleScope: Prisma.AIQualitySampleWhereInput = {
  feedback: {
    qrCode: { dealer: { isDemo: false } },
    OR: [{ aiModelUsed: null }, { aiModelUsed: { notIn: [...NON_LLM_MODELS] } }],
  },
};

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export async function getQualityMetrics(now: Date = new Date()): Promise<QualityMetrics> {
  const weeks = lastWeekStarts(now, METRIC_WEEKS);
  const since = new Date(`${weeks[0]}T00:00:00+03:00`);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 3600_000);

  const [statusGroups, reviewed, recent, reviewLogs, lastRun, modelRows] = await Promise.all([
    prisma.aIQualitySample.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.aIQualitySample.findMany({
      where: { ...realSampleScope, status: 'reviewed', reviewedAt: { gte: since }, accuracyScore: { not: null } },
      select: { accuracyScore: true, reviewedAt: true, feedback: { select: { aiModelUsed: true } } },
      take: 10_000,
    }),
    prisma.aIQualitySample.groupBy({ by: ['status'], where: { ...realSampleScope, createdAt: { gte: fourWeeksAgo } }, _count: { _all: true } }),
    prisma.auditLog.findMany({
      where: { entity: SAMPLE_ENTITY, action: AUDIT.review, createdAt: { gte: since } },
      select: { entityId: true, createdAt: true, newData: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    }),
    prisma.auditLog.findFirst({
      where: { entity: SAMPLE_ENTITY, action: AUDIT.run },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, newData: true, actorType: true, actorSnapshot: true },
    }),
    prisma.feedback.findMany({
      where: { deletedAt: null, aiQualitySamples: { some: {} } },
      distinct: ['aiModelUsed'],
      select: { aiModelUsed: true },
      take: 50,
    }),
  ]);

  const counts = Object.fromEntries(SAMPLE_STATUSES.map((st) => [st, 0])) as Record<SampleStatus, number>;
  for (const g of statusGroups) counts[asStatus(g.status)] += g._count._all;

  const byWeek = new Map<string, number[]>(weeks.map((w) => [w, []]));
  const byModel = new Map<string, number[]>();
  for (const r of reviewed) {
    if (r.accuracyScore == null || !r.reviewedAt) continue;
    byWeek.get(istanbulWeekStart(r.reviewedAt))?.push(r.accuracyScore);
    const m = r.feedback.aiModelUsed ?? 'Bilinmiyor';
    const arr = byModel.get(m) ?? [];
    arr.push(r.accuracyScore);
    byModel.set(m, arr);
  }
  const weekly = weeks.map((w) => {
    const xs = byWeek.get(w) ?? [];
    const sorted = xs.slice().sort((a, b) => a - b);
    return { week: w, avg: mean(xs), n: xs.length, p50: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null };
  });
  const cur = weekly[weekly.length - 1];
  const prev = weekly[weekly.length - 2];

  // Alan kırılımı: her örneğin EN SON kararı sayılır (yeniden değerlendirme çift saymaz).
  const seen = new Set<string>();
  const fieldAgg = new Map<VerdictField, { sum: number; n: number }>(VERDICT_FIELDS.map((f) => [f, { sum: 0, n: 0 }]));
  for (const l of reviewLogs) {
    if (!l.entityId || seen.has(l.entityId)) continue;
    seen.add(l.entityId);
    const { verdicts } = readVerdicts(l.newData);
    if (!verdicts) continue;
    for (const f of VERDICT_FIELDS) {
      const v = verdicts[f];
      if (!v || v === 'na') continue;
      const a = fieldAgg.get(f)!;
      a.sum += v === 'correct' ? 1 : v === 'partial' ? 0.5 : 0;
      a.n += 1;
    }
  }
  const byField = VERDICT_FIELDS.map((f) => {
    const a = fieldAgg.get(f)!;
    return { field: f, label: VERDICT_FIELD_LABEL[f], accuracy: a.n ? Math.round((a.sum / a.n) * 1000) / 10 : null, n: a.n };
  });
  const weakestRow = byField.filter((x) => x.accuracy != null && x.n >= 5).sort((a, b) => (a.accuracy! - b.accuracy!))[0];

  let recentTotal = 0;
  let recentDone = 0;
  for (const g of recent) {
    recentTotal += g._count._all;
    if (g.status !== 'pending') recentDone += g._count._all;
  }

  const runData = (lastRun?.newData ?? {}) as Record<string, unknown>;
  const runSnap = (lastRun?.actorSnapshot ?? {}) as Record<string, unknown>;

  return {
    asOf: now.toISOString(),
    counts,
    reviewRate: { value: recentTotal ? Math.round((recentDone / recentTotal) * 1000) / 10 : null, n: recentTotal },
    current: { avg: cur?.avg ?? null, n: cur?.n ?? 0 },
    previous: { avg: prev?.avg ?? null, n: prev?.n ?? 0 },
    weekly: weekly.map(({ week, avg, n: c }) => ({ week, avg, n: c })),
    byModel: [...byModel.entries()].map(([model, xs]) => ({ model, avg: mean(xs), n: xs.length })).sort((a, b) => b.n - a.n),
    byField,
    weakest: weakestRow ? { field: weakestRow.field, label: weakestRow.label, accuracy: weakestRow.accuracy! } : null,
    lastRun: lastRun
      ? {
          at: lastRun.createdAt.toISOString(),
          created: n(runData.created) ?? 0,
          actor: lastRun.actorType === 'user' ? s(runSnap.name) ?? s(runSnap.email) ?? 'Yönetici' : null,
        }
      : null,
    models: modelRows.map((r) => r.aiModelUsed).filter((m): m is string => !!m).sort(),
    alert: cur && cur.avg != null && cur.n >= QUALITY_ALERT_MIN_N && cur.avg < QUALITY_ALERT_THRESHOLD ? { avg: cur.avg, n: cur.n } : null,
  };
}

/* ───────────────────────── Örnekleme ───────────────────────── */

export async function runSampling(input: SampleRunInput, actor: AuditActor, opts: { request?: RequestLike; rng?: Rng; now?: Date } = {}): Promise<SampleRunResult> {
  const now = opts.now ?? new Date();
  // 1) Sonradan silinen yoruma ya da LLM dışı analize ait bekleyen örnekler geçersiz.
  const voided = await prisma.aIQualitySample.updateMany({
    where: {
      status: 'pending',
      OR: [{ feedback: { deletedAt: { not: null } } }, { feedback: { aiModelUsed: { in: [...NON_LLM_MODELS] } } }],
    },
    data: { status: 'void' },
  });

  // 2) Aday havuzu: son N gün, metinli, gerçek LLM ile işlenmiş, demo bayi değil, örneklenmemiş.
  const candidates = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      text: { not: null },
      aiProcessedAt: { not: null },
      createdAt: { gte: new Date(now.getTime() - input.days * 24 * 3600_000) },
      OR: [{ aiModelUsed: null }, { aiModelUsed: { notIn: [...NON_LLM_MODELS] } }],
      qrCode: { dealer: { isDemo: false } },
      aiQualitySamples: { none: {} },
    },
    select: { id: true, sentiment: true, intent: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const { ids, strata } = stratifiedSample(candidates, input.size, opts.rng);
  const created = ids.length
    ? (await prisma.aIQualitySample.createMany({ data: ids.map((feedbackId) => ({ feedbackId, status: 'pending' })), skipDuplicates: true })).count
    : 0;

  const result: SampleRunResult = { candidates: candidates.length, created, voided: voided.count, strata };
  try {
    await prisma.auditLog.create({
      data: auditEntry(actor, { action: AUDIT.run, entity: SAMPLE_ENTITY, entityId: null, newData: { ...result, size: input.size, days: input.days } }, opts.request),
    });
  } catch (err) {
    console.error('[ai-quality] örnekleme denetim kaydı yazılamadı:', err);
  }
  return result;
}
