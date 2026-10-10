/**
 * b-asistan — sunucu veri katmanı (yalnız sunucu): sohbet deposu + açılış özeti.
 *
 *  - Kiracı kapsamı: her sorgu `dealerId` ile süzülür; kimlik route'ta `defineRoute` +
 *    `resolveDealerScope` ile DB'den çözülür (istemciden gelen kimliğe güvenilmez).
 *  - Silme ARŞİVDİR (yol haritası §4.4: hard delete yok): `context.deleted = true`.
 *  - `AIConversation.messages` tek JSON kolonu olduğu için yazma İYİMSER EŞZAMANLILIK ile
 *    yapılır: okunan `updatedAt` koşuluyla `updateMany`; çakışmada yeniden okunup tekrar
 *    denenir (ai-chat Bulgu 9: oku-değiştir-yaz mesaj kaybı). Satır sınırsız büyümez
 *    (`MAX_STORED_MESSAGES`).
 *  - GET'te LLM yok: açılış özeti (kota, durum, öneriler) yalnız sorgudan.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AI_DAILY_TOKEN_LIMIT_PER_DEALER, getTodayUsage } from '@/lib/ai-cost-guard';
import { isAIConfigured } from '@/lib/ai-engine';
import { canUseAi, getDealerAiPolicy } from '@/lib/ai-policy';
import { loadAnalyticsOverview } from '@/lib/dealer-analytics/load';
import { toInstants } from '@/lib/dealer-analytics/params';
import { istanbulDay } from '@/components/ds/page/date-range';
import { ApiError } from '@/lib/http/define-route';
import {
  ASSISTANT_SURFACE,
  appendTurn,
  capMessages,
  cleanTitle,
  mergeContext,
  normalizeContext,
  normalizeStoredMessages,
  replaceLastAnswer,
  setMessageRating,
} from './messages';
import { buildSuggestions } from './suggestions';
import { analyticsQueryFor } from './tools';
import {
  CONVERSATION_PAGE_SIZE,
  DEFAULT_ASSISTANT_PERIOD,
  MAX_STORED_MESSAGES,
  type AssistantMessage,
  type AssistantOverview,
  type AssistantPeriod,
  type AssistantQuota,
  type AssistantStatus,
  type ConversationDetail,
  type ConversationListPage,
  type ConversationSummary,
} from './types';

/** Listeleme taraması üst sınırı (yalnız hafif kolonlar; mesaj JSON'u okunmaz). */
const LIST_SCAN_LIMIT = 500;
const WRITE_RETRIES = 3;

type ConvRow = { id: string; title: string | null; context: Prisma.JsonValue | null; createdAt: Date; updatedAt: Date };
type FullRow = ConvRow & { messages: Prisma.JsonValue };
type Patch = { messages?: AssistantMessage[]; context?: Record<string, unknown>; title?: string | null };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

export function isArchived(context: unknown): boolean {
  return asRecord(context).deleted === true;
}

export function toSummary(row: ConvRow): ConversationSummary {
  const ctx = normalizeContext(row.context);
  return {
    id: row.id,
    title: row.title?.trim() || '',
    pinned: ctx.pinned,
    period: ctx.period,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ───────────────────────── Liste ───────────────────────── */

export async function listConversations(
  dealerId: string,
  opts: { cursor?: string | null; q?: string | null; limit?: number } = {},
): Promise<ConversationListPage> {
  const limit = Math.min(Math.max(opts.limit ?? CONVERSATION_PAGE_SIZE, 1), 50);
  const q = opts.q?.trim() || null;
  const rows = await prisma.aIConversation.findMany({
    where: { dealerId, ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}) },
    select: { id: true, title: true, context: true, createdAt: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: LIST_SCAN_LIMIT,
  });
  const live = rows.filter((r) => !isArchived(r.context)).map(toSummary);
  const pinned = q ? [] : live.filter((c) => c.pinned);
  const pool = q ? live : live.filter((c) => !c.pinned);
  let start = 0;
  if (opts.cursor) {
    const idx = pool.findIndex((c) => c.id === opts.cursor);
    start = idx >= 0 ? idx + 1 : pool.length;
  }
  const items = pool.slice(start, start + limit);
  const hasMore = start + limit < pool.length;
  return {
    items,
    pinned: opts.cursor ? [] : pinned,
    nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
  };
}

/* ───────────────────────── Ayrıntı ───────────────────────── */

async function readOwned(dealerId: string, id: string): Promise<FullRow | null> {
  const row = await prisma.aIConversation.findFirst({
    where: { id, dealerId },
    select: { id: true, title: true, context: true, messages: true, createdAt: true, updatedAt: true },
  });
  if (!row || isArchived(row.context)) return null;
  return row;
}

export async function getConversation(dealerId: string, id: string): Promise<ConversationDetail | null> {
  const row = await readOwned(dealerId, id);
  if (!row) return null;
  const messages = normalizeStoredMessages(row.messages, row.createdAt.toISOString());
  const capped = capMessages(messages);
  const fallbackTitle = messages.find((m) => m.role === 'user')?.content.slice(0, 80) ?? '';
  return {
    ...toSummary(row),
    title: row.title?.trim() || fallbackTitle,
    messages: capped.messages,
    truncated: capped.truncated || (Array.isArray(row.messages) && row.messages.length > MAX_STORED_MESSAGES),
  };
}

/** Model geçmişi için mesajlar (sahiplik kontrollü). */
export async function getConversationMessages(
  dealerId: string,
  id: string,
): Promise<{ messages: AssistantMessage[]; period: AssistantPeriod } | null> {
  const row = await readOwned(dealerId, id);
  if (!row) return null;
  return { messages: normalizeStoredMessages(row.messages, row.createdAt.toISOString()), period: normalizeContext(row.context).period };
}

/* ───────────────────────── İyimser yazma ───────────────────────── */

async function mutate(
  dealerId: string,
  id: string,
  fn: (current: { messages: AssistantMessage[]; context: Prisma.JsonValue | null; title: string | null }) => Patch | null,
): Promise<ConvRow> {
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    const row = await readOwned(dealerId, id);
    if (!row) throw new ApiError('NOT_FOUND', 'Sohbet bulunamadı.');
    const patch = fn({ messages: normalizeStoredMessages(row.messages, row.createdAt.toISOString()), context: row.context, title: row.title });
    if (!patch) throw new ApiError('NOT_FOUND', 'Mesaj bulunamadı.');
    const data: Prisma.AIConversationUpdateManyMutationInput = {};
    if (patch.messages) data.messages = patch.messages as unknown as Prisma.InputJsonValue;
    if (patch.context) data.context = patch.context as Prisma.InputJsonValue;
    if (patch.title !== undefined) data.title = patch.title;
    const res = await prisma.aIConversation.updateMany({ where: { id, dealerId, updatedAt: row.updatedAt }, data });
    if (res.count === 1) {
      const fresh = await prisma.aIConversation.findFirst({
        where: { id, dealerId },
        select: { id: true, title: true, context: true, createdAt: true, updatedAt: true },
      });
      if (fresh) return fresh;
    }
  }
  throw new ApiError('CONFLICT', 'Sohbet başka bir sekmede güncellendi. Lütfen tekrar deneyin.', { retryable: true });
}

export async function updateConversation(
  dealerId: string,
  id: string,
  patch: { title?: string; pinned?: boolean; period?: AssistantPeriod; rate?: { messageId: string; rating: 1 | -1 | null } },
): Promise<ConversationSummary> {
  const row = await mutate(dealerId, id, (cur) => {
    const out: Patch = {};
    if (patch.title !== undefined) {
      const t = cleanTitle(patch.title);
      if (!t) throw new ApiError('VALIDATION', 'Başlık boş olamaz.');
      out.title = t;
    }
    if (patch.pinned !== undefined || patch.period !== undefined) {
      out.context = mergeContext(cur.context, { pinned: patch.pinned, period: patch.period });
    }
    if (patch.rate) {
      const next = setMessageRating(cur.messages, patch.rate.messageId, patch.rate.rating);
      if (!next) return null;
      out.messages = next;
    }
    return out;
  });
  return toSummary(row);
}

/** Sil = arşivle (kayıt fiziksel olarak silinmez; `restore` ile geri alınır). */
export async function archiveConversation(dealerId: string, id: string, restore = false): Promise<void> {
  const row = await prisma.aIConversation.findFirst({ where: { id, dealerId }, select: { context: true, updatedAt: true } });
  if (!row) throw new ApiError('NOT_FOUND', 'Sohbet bulunamadı.');
  const base = asRecord(row.context);
  base.surface = ASSISTANT_SURFACE;
  if (restore) {
    delete base.deleted;
    delete base.deletedAt;
  } else {
    base.deleted = true;
    base.deletedAt = new Date().toISOString();
  }
  const res = await prisma.aIConversation.updateMany({
    where: { id, dealerId, updatedAt: row.updatedAt },
    data: { context: base as Prisma.InputJsonValue },
  });
  if (res.count !== 1) throw new ApiError('CONFLICT', 'Sohbet başka bir sekmede güncellendi. Lütfen tekrar deneyin.', { retryable: true });
}

/** Bir turu kaydeder (yeni sohbet oluşturur ya da mevcut olana ekler / son yanıtı değiştirir). */
export async function saveTurn(input: {
  dealerId: string;
  conversationId: string | null;
  title: string;
  period: AssistantPeriod;
  user: AssistantMessage;
  assistant: AssistantMessage;
  regenerate: boolean;
}): Promise<{ id: string; title: string }> {
  if (!input.conversationId) {
    const created = await prisma.aIConversation.create({
      data: {
        dealerId: input.dealerId,
        title: cleanTitle(input.title) || null,
        messages: [input.user, input.assistant] as unknown as Prisma.InputJsonValue,
        context: mergeContext(null, { period: input.period }) as Prisma.InputJsonValue,
      },
      select: { id: true, title: true },
    });
    return { id: created.id, title: created.title ?? '' };
  }
  const row = await mutate(input.dealerId, input.conversationId, (cur) => {
    const messages = input.regenerate ? replaceLastAnswer(cur.messages, input.assistant) : appendTurn(cur.messages, input.user, input.assistant);
    if (!messages) return null;
    return {
      messages,
      context: mergeContext(cur.context, { period: input.period }),
      ...(cur.title?.trim() ? {} : { title: cleanTitle(input.title) || null }),
    };
  });
  return { id: row.id, title: row.title ?? '' };
}

/* ───────────────────────── Durum + kota + öneriler ───────────────────────── */

/** Kota sıfırlanma anı: `getTodayUsage` UTC gün başından saydığı için bir sonraki UTC gece yarısı. */
export function nextUtcMidnight(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

export async function loadQuota(dealerId: string): Promise<AssistantQuota> {
  const used = await getTodayUsage(dealerId);
  const limit = AI_DAILY_TOKEN_LIMIT_PER_DEALER;
  return { usedTokens: used, limitTokens: limit, resetsAt: nextUtcMidnight(), exhausted: used >= limit };
}

export async function loadAssistantStatus(dealerId: string): Promise<AssistantStatus> {
  if (!isAIConfigured()) return 'unconfigured';
  const policy = await getDealerAiPolicy(dealerId);
  return canUseAi(policy) ? 'ready' : 'ai_disabled';
}

export async function loadAssistantOverview(dealerId: string, period: AssistantPeriod = DEFAULT_ASSISTANT_PERIOD): Promise<AssistantOverview> {
  const q = analyticsQueryFor(period, istanbulDay());
  const { from, to } = toInstants(q.range);
  const [status, quota, overview, highChurn] = await Promise.all([
    loadAssistantStatus(dealerId),
    loadQuota(dealerId),
    loadAnalyticsOverview(dealerId, q),
    Promise.all([
      prisma.feedback.count({ where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: from, lt: to }, churnRisk: { gte: 0.7 } } }),
      prisma.consumptionReview.count({
        where: { consumption: { dealerId }, deletedAt: null, createdAt: { gte: from, lt: to }, churnRisk: { gte: 0.7 } },
      }),
    ]).then(([a, b]) => a + b),
  ]);
  return {
    status,
    quota,
    data: { hasAnyData: overview.hasAnyData, periodCount: overview.kpis.volume.value ?? 0 },
    suggestions: buildSuggestions({ period, overview, highChurn }),
    defaultPeriod: period,
    generatedAt: new Date().toISOString(),
  };
}
