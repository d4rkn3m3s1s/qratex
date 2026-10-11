/**
 * Konsey oturumları — kalıcılık ve yaşam döngüsü (AgentRun / AgentMessage / AgentDecision).
 *
 *  - Oluştur: kapsam doğrulanır, ayarların anlık görüntüsü + veri paketi context'e yazılır.
 *  - Adım: sunucu sıradaki adımı DB'den belirler (istemci geçmiş göndermez). Adım kilidi
 *    (iyimser `updatedAt` + context.stepLockUntil) eşzamanlı çift adımı engeller; adım
 *    hep-ya-hiç kaydedilir; LLM hatasında hiçbir mesaj yazılmaz, `lastError` görünür kalır.
 *  - Sonlandır / arşivle / geri al: silme yok; hepsi denetim kaydıyla.
 *  - Yayınla: karar aksiyonları seçilen bayinin ActionItem kuyruğuna; (oturum, bayi, aksiyon)
 *    başına tek kez; yönetici sorusu ve persona adı bayiye gitmez; impactScore uydurulmaz.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { isAIConfigured } from '@/lib/ai-engine';
import { notifyRespectingPrefs } from '@/lib/notify-prefs-server';
import {
  SESSION_STATUSES,
  councilConfigSchema,
  scopeLabel,
  type CouncilConfig,
  type CreateSessionInput,
  type DataPack,
  type DealerOption,
  type ListQuery,
  type PublishInput,
  type PublishResult,
  type PublishedRecord,
  type SessionDecision,
  type SessionDetail,
  type SessionMessage,
  type SessionPage,
  type SessionScope,
  type SessionStatus,
  type SessionSummary,
} from '@/lib/council/contract';
import { getCouncilConfigState } from '@/lib/council/config.server';
import { buildDataPack } from '@/lib/council/context.server';
import { runDiscussionRound, runSynthesis, type Completion, type GeneratedMessage } from '@/lib/council/engine.server';

type Req = { headers: { get(name: string): string | null } } | null | undefined;

const STEP_LOCK_MS = 90_000;

// ───────────────────────────── context (Json) ─────────────────────────────

interface StoredPublished {
  actionKey: string;
  actionItemId: string;
  dealerId: string;
  dealerName: string;
  title: string;
  at: string;
  byName: string | null;
}

export interface RunContextV2 {
  v: 2;
  scope: SessionScope;
  config: CouncilConfig;
  dataPack: DataPack | null;
  lastError?: { message: string; at: string } | null;
  stepLockUntil?: string | null;
  statusBeforeArchive?: SessionStatus | null;
  published?: StoredPublished[];
}

function isStatus(s: unknown): s is SessionStatus {
  return typeof s === 'string' && (SESSION_STATUSES as readonly string[]).includes(s);
}

/** v2 context'i savunmacı okur; eski biçimde (computeCouncil) null döner. */
export function readContext(raw: unknown): RunContextV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 2) return null;
  const cfg = councilConfigSchema.safeParse(o.config);
  const scope = o.scope as SessionScope | undefined;
  if (!cfg.success || !scope || (scope.kind !== 'platform' && scope.kind !== 'dealer')) return null;
  return {
    v: 2,
    scope,
    config: cfg.data,
    dataPack: (o.dataPack as DataPack | null) ?? null,
    lastError: (o.lastError as RunContextV2['lastError']) ?? null,
    stepLockUntil: typeof o.stepLockUntil === 'string' ? o.stepLockUntil : null,
    statusBeforeArchive: isStatus(o.statusBeforeArchive) ? o.statusBeforeArchive : null,
    published: Array.isArray(o.published) ? (o.published as StoredPublished[]) : [],
  };
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

function normStatus(s: string): SessionStatus {
  return isStatus(s) ? s : 'completed';
}

// ───────────────────────────── eşleme ─────────────────────────────

type RunRow = {
  id: string;
  goal: string;
  status: string;
  context: Prisma.JsonValue | null;
  winnerAgent: string | null;
  confidence: number | null;
  createdAt: Date;
  updatedAt?: Date;
  createdById: string | null;
};

async function namesFor(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email || 'Yönetici']));
}

export function toSummary(row: RunRow, names: Map<string, string>): SessionSummary {
  const ctx = readContext(row.context);
  return {
    id: row.id,
    topic: row.goal,
    status: normStatus(row.status),
    statusBeforeArchive: ctx?.statusBeforeArchive ?? null,
    scope: ctx?.scope ?? null,
    winner: row.winnerAgent,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdById ? names.get(row.createdById) ?? null : null,
    legacy: !ctx,
    publishedCount: ctx?.published?.length ?? 0,
  };
}

type MessageRow = { id: string; round: number; agentName: string; role: string; content: string; metadata: Prisma.JsonValue | null; createdAt: Date };
type DecisionRow = { winnerAgent: string; rationale: string; suggestedActions: Prisma.JsonValue; consensusScore: number | null };

function toMessage(m: MessageRow, legacy: boolean): SessionMessage {
  const meta = (m.metadata && typeof m.metadata === 'object' ? m.metadata : {}) as Record<string, unknown>;
  const kind = legacy ? 'legacy' : m.role === 'synthesis' || m.role === 'moderation' ? m.role : 'turn';
  return {
    id: m.id,
    round: m.round,
    agent: m.agentName,
    kind,
    content: m.content,
    model: typeof meta.model === 'string' ? meta.model : null,
    latencyMs: typeof meta.latencyMs === 'number' ? meta.latencyMs : null,
    createdAt: m.createdAt.toISOString(),
  };
}

function toDecision(d: DecisionRow | undefined, finalDecision: string | null, legacy: boolean): SessionDecision | null {
  if (!d) return null;
  const sa = (d.suggestedActions && typeof d.suggestedActions === 'object' ? d.suggestedActions : {}) as Record<string, unknown>;
  if (!legacy && Array.isArray(sa.actions)) {
    return {
      answer: finalDecision ?? '',
      winner: d.winnerAgent,
      winnerRationale: d.rationale,
      confidence: d.consensusScore,
      dissent: Array.isArray(sa.dissent) ? (sa.dissent as string[]) : [],
      actions: sa.actions as SessionDecision['actions'],
    };
  }
  // Eski biçim: suggestedActions dizi idi; salt okunur gösterim.
  const arr = Array.isArray(d.suggestedActions) ? (d.suggestedActions as Array<Record<string, unknown>>) : [];
  return {
    answer: finalDecision ?? d.rationale,
    winner: d.winnerAgent,
    winnerRationale: d.rationale,
    confidence: d.consensusScore,
    dissent: [],
    actions: arr
      .filter((a) => typeof a.title === 'string')
      .map((a, i) => ({
        key: `a${i}`,
        title: a.title as string,
        detail: '',
        priority: a.priority === 'high' || a.priority === 'low' ? a.priority : 'medium',
      })),
  };
}

export function computeProgress(ctx: RunContextV2 | null, messages: SessionMessage[], status: SessionStatus, hasDecision: boolean) {
  const planned = ctx?.config.rounds ?? 0;
  const turnRounds = messages.filter((m) => m.kind === 'turn' || m.kind === 'moderation').map((m) => m.round);
  const completedRounds = turnRounds.length ? Math.max(...turnRounds) : 0;
  let nextStep: number | 'synthesis' | null = null;
  if (ctx && status === 'running' && !hasDecision) nextStep = completedRounds < planned ? completedRounds + 1 : 'synthesis';
  return { completedRounds, plannedRounds: planned, nextStep };
}

export async function getSessionDetail(id: string, now = new Date()): Promise<SessionDetail> {
  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: {
      messages: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] },
      decisions: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!run) throw new ApiError('NOT_FOUND', 'Konsey oturumu bulunamadı. Silinmiş ya da bağlantı hatalı olabilir.');
  const names = await namesFor([run.createdById]);
  const summary = toSummary(run, names);
  const ctx = readContext(run.context);
  const messages = run.messages.map((m) => toMessage(m, summary.legacy));
  const decision = toDecision(run.decisions[0], run.finalDecision, summary.legacy);
  const status = summary.status;
  const progress = computeProgress(ctx, messages, status, !!decision);

  const stored = ctx?.published ?? [];
  const items = stored.length
    ? await prisma.actionItem.findMany({ where: { id: { in: stored.map((p) => p.actionItemId) } }, select: { id: true, status: true } })
    : [];
  const statusById = new Map(items.map((i) => [i.id, i.status]));
  const published: PublishedRecord[] = stored.map((p) => ({ ...p, status: statusById.get(p.actionItemId) ?? null }));
  const models = [...new Set(messages.map((m) => m.model).filter((x): x is string => !!x))];

  return {
    ...summary,
    updatedAt: run.updatedAt.toISOString(),
    config: ctx?.config ?? null,
    dataPack: ctx?.dataPack ?? null,
    messages,
    decision,
    ...progress,
    lastError: ctx?.lastError ?? null,
    stepInFlight: !!(ctx?.stepLockUntil && new Date(ctx.stepLockUntil).getTime() > now.getTime()),
    published,
    models,
    callCount: messages.filter((m) => m.model).length,
  };
}

// ───────────────────────────── liste ─────────────────────────────

export async function listSessions(q: ListQuery): Promise<SessionPage> {
  const where: Prisma.AgentRunWhereInput = {
    ...(q.status === 'all' ? { status: { not: 'archived' } } : { status: q.status }),
    ...(q.q ? { goal: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [rows, grouped] = await Promise.all([
    prisma.agentRun.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: { id: true, goal: true, status: true, context: true, winnerAgent: true, confidence: true, createdAt: true, createdById: true },
    }),
    prisma.agentRun.groupBy({
      by: ['status'],
      where: q.q ? { goal: { contains: q.q, mode: 'insensitive' } } : {},
      _count: { _all: true },
    }),
  ]);
  const page = rows.slice(0, q.limit);
  const names = await namesFor(page.map((r) => r.createdById));
  const counts = Object.fromEntries(SESSION_STATUSES.map((s) => [s, 0])) as Record<SessionStatus, number>;
  for (const g of grouped) counts[normStatus(g.status)] += g._count._all;
  return {
    items: page.map((r) => toSummary(r, names)),
    nextCursor: rows.length > q.limit ? page[page.length - 1]?.id ?? null : null,
    counts,
  };
}

// ───────────────────────────── oluştur ─────────────────────────────

export function assertAiReady(): void {
  if (!isAIConfigured()) {
    throw new ApiError('AI_UNAVAILABLE', 'Yapay zekâ sağlayıcısı yapılandırılmamış. Konsey gerçek model olmadan çalışmaz.', { status: 503 });
  }
}

async function resolveScope(input: CreateSessionInput['scope']): Promise<SessionScope> {
  if (input.kind === 'platform') return { kind: 'platform' };
  const dealer = await prisma.user.findFirst({
    where: { id: input.dealerId, role: 'DEALER' },
    select: { id: true, name: true, businessName: true, email: true },
  });
  if (!dealer) throw new ApiError('NOT_FOUND', 'Seçilen bayi bulunamadı.');
  return { kind: 'dealer', dealerId: dealer.id, dealerName: dealer.businessName || dealer.name || dealer.email || 'Bayi' };
}

export async function createSession(input: CreateSessionInput, actor: AuditActor, request?: Req): Promise<SessionDetail> {
  assertAiReady();
  const [{ config }, scope] = await Promise.all([getCouncilConfigState(), resolveScope(input.scope)]);
  const dataPack = config.includeData ? await buildDataPack(scope) : null;
  const ctx: RunContextV2 = { v: 2, scope, config, dataPack, lastError: null, stepLockUntil: null, published: [] };
  const run = await prisma.agentRun.create({
    data: { goal: input.topic, status: 'running', createdById: actor.id, context: json(ctx) },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: auditEntry(actor, { action: 'agent_council.session.create', entity: 'AgentRun', entityId: run.id, newData: { topic: input.topic, scope, config } }, request),
  });
  return getSessionDetail(run.id);
}

// ───────────────────────────── adım ─────────────────────────────

export async function stepSession(id: string, actor: AuditActor, complete?: Completion, now = new Date()): Promise<SessionDetail> {
  assertAiReady();
  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: { messages: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] }, decisions: { take: 1 } },
  });
  if (!run) throw new ApiError('NOT_FOUND', 'Konsey oturumu bulunamadı.');
  const ctx = readContext(run.context);
  if (!ctx) throw new ApiError('CONFLICT', 'Eski biçimdeki kayıt devam ettirilemez; yalnız okunabilir.', { status: 409 });
  if (run.status !== 'running') throw new ApiError('CONFLICT', 'Bu oturum artık sürmüyor.', { status: 409 });
  if (ctx.stepLockUntil && new Date(ctx.stepLockUntil).getTime() > now.getTime()) {
    throw new ApiError('STEP_IN_PROGRESS', 'Bu oturumun bir adımı zaten sürüyor. Birkaç saniye sonra yenileyin.', { status: 409, retryable: true });
  }

  const claimed = await prisma.agentRun.updateMany({
    where: { id, status: 'running', updatedAt: run.updatedAt },
    data: { context: json({ ...ctx, stepLockUntil: new Date(now.getTime() + STEP_LOCK_MS).toISOString() }) },
  });
  if (claimed.count === 0) {
    throw new ApiError('STEP_IN_PROGRESS', 'Oturum bu sırada başka bir yerden ilerletildi. Güncel hâli yükleniyor.', { status: 409, retryable: true });
  }

  const messages = run.messages.map((m) => toMessage(m, false));
  const { nextStep } = computeProgress(ctx, messages, 'running', run.decisions.length > 0);
  const input = {
    topic: run.goal,
    scopeLabel: scopeLabel(ctx.scope),
    config: ctx.config,
    dataPack: ctx.dataPack,
    prior: messages.map((m) => ({ round: m.round, agent: m.agent, kind: m.kind, content: m.content })),
    actorKey: actor.id ?? 'admin',
  };

  let generated: GeneratedMessage[];
  let decision: SessionDecision | null = null;
  try {
    if (nextStep === 'synthesis') {
      const r = await runSynthesis(input, complete);
      generated = [r.message];
      decision = r.decision;
    } else if (typeof nextStep === 'number') {
      generated = await runDiscussionRound(input, nextStep, complete);
    } else {
      throw new ApiError('CONFLICT', 'Bu oturumda çalıştırılacak adım kalmadı.', { status: 409 });
    }
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Adım beklenmeyen bir hatayla durdu. Hiçbir şey kaydedilmedi; yeniden deneyin.';
    await prisma.agentRun.updateMany({
      where: { id },
      data: { context: json({ ...ctx, stepLockUntil: null, lastError: { message, at: new Date().toISOString() } }) },
    });
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    const done = await tx.agentRun.updateMany({
      where: { id, status: 'running' },
      data: {
        context: json({ ...ctx, stepLockUntil: null, lastError: null }),
        ...(decision
          ? { status: 'completed', finalDecision: decision.answer, winnerAgent: decision.winner, confidence: decision.confidence }
          : {}),
      },
    });
    if (done.count === 0) {
      throw new ApiError('CONFLICT', 'Oturum bu adım sürerken sonlandırıldı; sonuç kaydedilmedi.', { status: 409 });
    }
    await tx.agentMessage.createMany({
      data: generated.map((g) => ({
        runId: id,
        agentName: g.agent,
        role: g.kind,
        round: g.round,
        content: g.content,
        metadata: json({ model: g.model, latencyMs: g.latencyMs }),
      })),
    });
    if (decision) {
      await tx.agentDecision.create({
        data: {
          runId: id,
          winnerAgent: decision.winner,
          rationale: decision.winnerRationale,
          consensusScore: decision.confidence,
          suggestedActions: json({ actions: decision.actions, dissent: decision.dissent }),
        },
      });
    }
  });

  return getSessionDetail(id);
}

// ───────────────────────────── durum işlemleri ─────────────────────────────

export async function sessionAction(
  id: string,
  action: 'cancel' | 'archive' | 'unarchive',
  actor: AuditActor,
  request?: Req
): Promise<SessionDetail> {
  const run = await prisma.agentRun.findUnique({ where: { id }, select: { id: true, status: true, context: true, updatedAt: true } });
  if (!run) throw new ApiError('NOT_FOUND', 'Konsey oturumu bulunamadı.');
  const status = normStatus(run.status);
  const ctx = readContext(run.context);
  let data: Prisma.AgentRunUpdateManyMutationInput;

  if (action === 'cancel') {
    if (status !== 'running') throw new ApiError('CONFLICT', 'Yalnız süren bir oturum sonlandırılabilir.', { status: 409 });
    data = { status: 'cancelled', ...(ctx ? { context: json({ ...ctx, stepLockUntil: null }) } : {}) };
  } else if (action === 'archive') {
    if (status === 'archived') throw new ApiError('CONFLICT', 'Oturum zaten arşivde.', { status: 409 });
    if (status === 'running') throw new ApiError('CONFLICT', 'Süren oturum arşivlenemez; önce sonlandırın.', { status: 409 });
    const base = (run.context && typeof run.context === 'object' ? run.context : {}) as Record<string, unknown>;
    data = { status: 'archived', context: json({ ...base, statusBeforeArchive: status }) };
  } else {
    if (status !== 'archived') throw new ApiError('CONFLICT', 'Oturum arşivde değil.', { status: 409 });
    const base = (run.context && typeof run.context === 'object' ? run.context : {}) as Record<string, unknown>;
    const restore = isStatus(base.statusBeforeArchive) && base.statusBeforeArchive !== 'archived' ? base.statusBeforeArchive : 'completed';
    data = { status: restore, context: json({ ...base, statusBeforeArchive: null }) };
  }

  await prisma.$transaction(async (tx) => {
    const r = await tx.agentRun.updateMany({ where: { id, updatedAt: run.updatedAt }, data });
    if (r.count === 0) throw new ApiError('CONFLICT', 'Oturum bu sırada değişti. Güncel hâli yükleyip tekrar deneyin.', { status: 409 });
    await tx.auditLog.create({
      data: auditEntry(actor, { action: `agent_council.session.${action}`, entity: 'AgentRun', entityId: id, oldData: { status }, newData: { status: data.status } }, request),
    });
  });
  return getSessionDetail(id);
}

// ───────────────────────────── yayınla ─────────────────────────────

export function actionItemText(a: { title: string; detail: string }): string {
  return a.detail ? `${a.title}\n\n${a.detail}` : a.title;
}

export async function publishActions(id: string, input: PublishInput, actor: AuditActor, request?: Req, now = new Date()): Promise<PublishResult> {
  const dealer = await prisma.user.findFirst({
    where: { id: input.dealerId, role: 'DEALER' },
    select: { id: true, name: true, businessName: true, email: true },
  });
  if (!dealer) throw new ApiError('NOT_FOUND', 'Seçilen bayi bulunamadı.');
  const dealerName = dealer.businessName || dealer.name || dealer.email || 'Bayi';

  const result = await prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.findUnique({
      where: { id },
      select: { id: true, status: true, context: true, updatedAt: true, decisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!run) throw new ApiError('NOT_FOUND', 'Konsey oturumu bulunamadı.');
    const ctx = readContext(run.context);
    if (!ctx) throw new ApiError('CONFLICT', 'Eski biçimdeki kayıttan aksiyon yayınlanamaz.', { status: 409 });
    if (run.status !== 'completed') throw new ApiError('CONFLICT', 'Yalnız tamamlanmış bir oturumun aksiyonları yayınlanabilir.', { status: 409 });
    const decision = toDecision(run.decisions[0], null, false);
    const validKeys = new Set(decision?.actions.map((a) => a.key) ?? []);
    const unknown = input.actions.filter((a) => !validKeys.has(a.key));
    if (unknown.length) throw new ApiError('VALIDATION', 'Karar paketinde olmayan aksiyon gönderildi.', { status: 400 });

    const already = new Set((ctx.published ?? []).filter((p) => p.dealerId === dealer.id).map((p) => p.actionKey));
    const fresh = input.actions.filter((a) => !already.has(a.key));
    const skipped = input.actions.filter((a) => already.has(a.key)).map((a) => a.title);
    const dueAt = new Date(now.getTime() + input.dueInDays * 24 * 60 * 60 * 1000);

    const created: StoredPublished[] = [];
    for (const a of fresh) {
      const item = await tx.actionItem.create({
        data: {
          dealerId: dealer.id,
          feedbackId: null,
          suggestionText: actionItemText(a),
          priority: a.priority,
          status: 'pending',
          sourceModule: 'agent_council',
          dueAt,
          impactScore: null,
        },
        select: { id: true },
      });
      created.push({ actionKey: a.key, actionItemId: item.id, dealerId: dealer.id, dealerName, title: a.title, at: now.toISOString(), byName: actor.name ?? actor.email ?? null });
    }

    if (created.length) {
      const upd = await tx.agentRun.updateMany({
        where: { id, updatedAt: run.updatedAt },
        data: { context: json({ ...ctx, published: [...(ctx.published ?? []), ...created] }) },
      });
      if (upd.count === 0) throw new ApiError('CONFLICT', 'Oturum bu sırada değişti; yayın geri alındı. Tekrar deneyin.', { status: 409 });
      await tx.auditLog.create({
        data: auditEntry(
          actor,
          {
            action: 'agent_council.actions.publish',
            entity: 'AgentRun',
            entityId: id,
            newData: { dealerId: dealer.id, actionItemIds: created.map((c) => c.actionItemId), dueInDays: input.dueInDays, skipped },
          },
          request
        ),
      });
    }
    return { created: created.length, skipped };
  });

  if (result.created > 0) {
    await notifyRespectingPrefs({
      userId: dealer.id,
      title: 'Yeni aksiyon maddeleri',
      message: `Yönetim ${result.created} yeni aksiyon maddesini kuyruğunuza ekledi.`,
      type: 'info',
      data: { kind: 'action_items', href: '/dealer/inbox/assigned' },
    });
  }
  return { ...result, detail: await getSessionDetail(id) };
}

// ───────────────────────────── bayi seçici ─────────────────────────────

export async function searchDealers(q: string | undefined): Promise<DealerOption[]> {
  const term = q?.trim();
  const rows = await prisma.user.findMany({
    where: {
      role: 'DEALER',
      ...(term
        ? {
            OR: [
              { businessName: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ businessName: 'asc' }, { name: 'asc' }],
    take: 20,
    select: { id: true, name: true, businessName: true, email: true },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.businessName || r.name || r.email || 'Bayi',
    secondary: r.businessName && r.name ? r.name : r.email ?? null,
  }));
}
