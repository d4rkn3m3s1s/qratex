/**
 * Otomasyon › Otomatik yanıtlar — sunucu katmanı (yükleme + yazma + önizleme + geçmiş).
 *
 * Denetim (dealer_settings_auto-replies.md) karşılıkları:
 *  - B1/B15: koşul ayrık birleşim şemasıyla yazılır, okumada doğrulanır; geçersiz kayıt
 *    "tetiklenemez" işaretlenir.
 *  - B8: hatalar zarf v2 ile Türkçe ve alan bazlı (`details`) döner; liste hatası boş durum değildir.
 *  - B10: eski `/api/dealer/auto-replies` ailesi kaldırıldı; tek yazma yolu burası.
 *  - B15: 20 kural sınırı bayi başına advisory kilit altında sayılır (eşzamanlı POST aşamaz).
 *  - Eksik 1/2: geriye dönük önizleme (son 30 gün, AYNI eşleştirici) ve çalışma geçmişi
 *    (`auto_reply_fired` olayı) + sayaçlar.
 *  - Öncelik bir sayı girişi değil, listedeki SIRA'dır (`reorder`); motor `priority desc` okur.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { canAutoAnalyze, canUseAi, getDealerAiPolicy } from '@/lib/ai-policy';
import { AUTO_REPLY_FIRED_EVENT } from '@/lib/auto-reply-engine';
import {
  MAX_REPLY_RULES,
  describeCondition,
  matchReplyCondition,
  matchedKeywords,
  parseStoredCondition,
  toStoredCondition,
  type ReplyCondition,
  type ReplyRuleBody,
} from './reply-rules';
import type { RepliesOverviewDto, ReplyPreviewDto, ReplyRuleDto, ReplyRunDto } from './types';

const DAY = 86_400_000;
const WINDOW_DAYS = 30;
const PREVIEW_SCAN_CAP = 1500;

export interface Actor {
  dealerId: string;
  actorId: string;
}

function preview(text: string | null | undefined, max = 140): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function inboxHref(feedbackId: string): string {
  return `/dealer/inbox?id=${encodeURIComponent(`qr-${feedbackId}`)}`;
}

type RuleRow = {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  condition: Prisma.JsonValue;
  action: string;
  template: string;
  tone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const RULE_SELECT = {
  id: true,
  name: true,
  isActive: true,
  priority: true,
  condition: true,
  action: true,
  template: true,
  tone: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function listRuleRows(dealerId: string): Promise<RuleRow[]> {
  return prisma.autoReplyRule.findMany({
    where: { dealerId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: MAX_REPLY_RULES * 3,
    select: RULE_SELECT,
  });
}

function eventData(v: Prisma.JsonValue | null): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function toRuleDto(
  row: RuleRow,
  order: number,
  tones: Map<string, string>,
  stats: Map<string, { count30: number; lastAt: string | null; ai30: number }>
): ReplyRuleDto {
  const condition = parseStoredCondition(row.condition);
  const action = row.action === 'incident' ? 'incident' : 'reply';
  const tone = action === 'reply' ? row.tone : null;
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    order,
    condition,
    sentence: describeCondition(condition),
    action,
    template: row.template,
    tone,
    toneName: tone ? (tones.get(tone) ?? null) : null,
    toneMissing: !!tone && !tones.has(tone),
    updatedAt: row.updatedAt.toISOString(),
    stats: stats.get(row.id) ?? { count30: 0, lastAt: null, ai30: 0 },
  };
}

async function loadAiFlags(dealerId: string): Promise<RepliesOverviewDto['ai']> {
  try {
    const policy = await getDealerAiPolicy(dealerId);
    if (policy.source === 'unavailable') return { canUseAi: null, canAnalyze: null };
    return { canUseAi: canUseAi(policy), canAnalyze: canAutoAnalyze(policy) };
  } catch {
    return { canUseAi: null, canAnalyze: null };
  }
}

export async function loadRepliesOverview(dealerId: string, now: Date = new Date()): Promise<RepliesOverviewDto> {
  const since30 = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const [rows, toneRows, events, ai] = await Promise.all([
    listRuleRows(dealerId),
    prisma.aITone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { slug: true, name: true }, take: 50 }),
    prisma.analyticsEvent.findMany({
      where: { userId: dealerId, event: AUTO_REPLY_FIRED_EVENT, createdAt: { gte: since30 } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { data: true, createdAt: true },
    }),
    loadAiFlags(dealerId),
  ]);

  const stats = new Map<string, { count30: number; lastAt: string | null; ai30: number }>();
  let replies7 = 0;
  let incidents7 = 0;
  for (const e of events) {
    const d = eventData(e.data);
    const ruleId = typeof d.ruleId === 'string' ? d.ruleId : null;
    if (e.createdAt >= since7) {
      if (d.action === 'incident') incidents7++;
      else replies7++;
    }
    if (!ruleId) continue;
    const s = stats.get(ruleId) ?? { count30: 0, lastAt: null, ai30: 0 };
    s.count30++;
    if (d.ai === true) s.ai30++;
    if (!s.lastAt) s.lastAt = e.createdAt.toISOString();
    stats.set(ruleId, s);
  }

  const tones = new Map(toneRows.map((t) => [t.slug, t.name]));
  const rules = rows.map((r, i) => toRuleDto(r, i, tones, stats));
  return {
    rules,
    limit: MAX_REPLY_RULES,
    tones: toneRows,
    summary: {
      replies7,
      incidents7,
      fired30: events.length,
      brokenCount: rules.filter((r) => !r.condition).length,
      activeCount: rules.filter((r) => r.isActive && r.condition).length,
    },
    ai,
    windowDays: WINDOW_DAYS,
  };
}

/* ───────────────────────── Yazma ───────────────────────── */

async function assertTone(tone: string | null): Promise<void> {
  if (!tone) return;
  const t = await prisma.aITone.findFirst({ where: { slug: tone, isActive: true }, select: { id: true } });
  if (!t) {
    throw new ApiError('VALIDATION', 'Seçilen üslup artık kullanılamıyor. Başka bir üslup seçin.', {
      details: [{ path: 'tone', message: 'Bu üslup tanımlı değil.' }],
    });
  }
}

function ruleData(body: ReplyRuleBody) {
  const reply = body.action === 'reply';
  return {
    name: body.name,
    condition: toStoredCondition(body.condition) as Prisma.InputJsonValue,
    action: body.action,
    template: body.template,
    tone: reply ? body.tone : null,
    isActive: body.isActive,
  };
}

async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entityId: string,
  data: { oldData?: unknown; newData?: unknown }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: actor.actorId,
      actorType: 'user',
      action,
      entity: 'AutoReplyRule',
      entityId,
      ...(data.oldData !== undefined ? { oldData: data.oldData as Prisma.InputJsonValue } : {}),
      ...(data.newData !== undefined ? { newData: data.newData as Prisma.InputJsonValue } : {}),
    },
  });
}

/** Sıra → öncelik: ilk kural en yüksek öncelik (motor `priority desc`). */
async function renumber(tx: Prisma.TransactionClient, dealerId: string, orderedIds: string[]): Promise<void> {
  const n = orderedIds.length;
  for (let i = 0; i < n; i++) {
    await tx.autoReplyRule.updateMany({ where: { id: orderedIds[i], dealerId }, data: { priority: n - i } });
  }
}

export async function createReplyRule(actor: Actor, body: ReplyRuleBody): Promise<{ id: string }> {
  await assertTone(body.action === 'reply' ? body.tone : null);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`auto-reply-rules:${actor.dealerId}`}))`;
    const existing = await tx.autoReplyRule.findMany({
      where: { dealerId: actor.dealerId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    if (existing.length >= MAX_REPLY_RULES) {
      throw new ApiError('LIMIT_REACHED', `En fazla ${MAX_REPLY_RULES} kural tanımlanabilir. Kullanmadığınız bir kuralı silin.`, { status: 409 });
    }
    const created = await tx.autoReplyRule.create({
      data: { dealerId: actor.dealerId, priority: 0, ...ruleData(body) },
      select: { id: true },
    });
    // Yeni kural listenin SONUNA eklenir (mevcut önceliği bozmaz).
    await renumber(tx, actor.dealerId, [...existing.map((r) => r.id), created.id]);
    await audit(tx, actor, 'auto_reply_rule.created', created.id, { newData: ruleData(body) });
    return { id: created.id };
  });
}

export async function updateReplyRule(actor: Actor, id: string, body: ReplyRuleBody): Promise<{ id: string }> {
  await assertTone(body.action === 'reply' ? body.tone : null);
  return prisma.$transaction(async (tx) => {
    const before = await tx.autoReplyRule.findFirst({ where: { id, dealerId: actor.dealerId }, select: RULE_SELECT });
    if (!before) throw new ApiError('NOT_FOUND', 'Kural bulunamadı.');
    await tx.autoReplyRule.updateMany({ where: { id, dealerId: actor.dealerId }, data: ruleData(body) });
    await audit(tx, actor, 'auto_reply_rule.updated', id, {
      oldData: { name: before.name, condition: before.condition, action: before.action, template: before.template, tone: before.tone, isActive: before.isActive },
      newData: ruleData(body),
    });
    return { id };
  });
}

export async function setReplyRuleActive(actor: Actor, id: string, isActive: boolean): Promise<{ id: string; isActive: boolean }> {
  return prisma.$transaction(async (tx) => {
    const n = await tx.autoReplyRule.updateMany({ where: { id, dealerId: actor.dealerId }, data: { isActive } });
    if (n.count === 0) throw new ApiError('NOT_FOUND', 'Kural bulunamadı.');
    await audit(tx, actor, isActive ? 'auto_reply_rule.activated' : 'auto_reply_rule.paused', id, { newData: { isActive } });
    return { id, isActive };
  });
}

/**
 * Kural silme. Kuralın bağımlı kaydı yoktur (geçmiş olayları ve açılmış vakalar kalır), bu
 * yüzden kalıcı silmedir; yanıt gövdesi istemcinin "Geri al" ile yeniden oluşturabilmesi için
 * kuralın anlık görüntüsünü döndürür ve denetim kaydına yazılır.
 */
export async function deleteReplyRule(actor: Actor, id: string): Promise<{ id: string; snapshot: Record<string, unknown> }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.autoReplyRule.findFirst({ where: { id, dealerId: actor.dealerId }, select: RULE_SELECT });
    if (!row) throw new ApiError('NOT_FOUND', 'Kural bulunamadı.');
    await tx.autoReplyRule.deleteMany({ where: { id, dealerId: actor.dealerId } });
    const snapshot = {
      name: row.name,
      condition: parseStoredCondition(row.condition),
      action: row.action === 'incident' ? 'incident' : 'reply',
      template: row.template,
      tone: row.tone,
      isActive: row.isActive,
    };
    await audit(tx, actor, 'auto_reply_rule.deleted', id, { oldData: { ...snapshot, condition: row.condition } });
    return { id, snapshot };
  });
}

export async function reorderReplyRules(actor: Actor, ids: string[]): Promise<{ ids: string[] }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`auto-reply-rules:${actor.dealerId}`}))`;
    const current = await tx.autoReplyRule.findMany({ where: { dealerId: actor.dealerId }, select: { id: true } });
    const set = new Set(current.map((r) => r.id));
    const unique = new Set(ids);
    if (unique.size !== ids.length || ids.length !== set.size || ids.some((id) => !set.has(id))) {
      throw new ApiError('CONFLICT', 'Kural listesi bu arada değişti. Sayfayı yenileyip tekrar sıralayın.');
    }
    await renumber(tx, actor.dealerId, ids);
    await audit(tx, actor, 'auto_reply_rule.reordered', actor.dealerId, { newData: { ids } });
    return { ids };
  });
}

/* ───────────────────────── Önizleme + geçmiş ───────────────────────── */

/**
 * "Bu kural son 30 günde hangi geri bildirimlere uyardı?" — motorla AYNI eşleştirici,
 * yalnız okuma (LLM yok). En yeni `PREVIEW_SCAN_CAP` kayıt taranır; aşılırsa `capped`.
 */
export async function previewReplyCondition(
  dealerId: string,
  condition: ReplyCondition,
  now: Date = new Date()
): Promise<ReplyPreviewDto> {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const where: Prisma.FeedbackWhereInput = { deletedAt: null, createdAt: { gte: since }, qrCode: { dealerId } };
  if (condition.field === 'rating') {
    where.rating = condition.op === 'lte' ? { lte: condition.value } : condition.op === 'gte' ? { gte: condition.value } : condition.value;
  } else if (condition.field === 'sentiment') {
    where.sentiment = condition.value;
  } else {
    where.text = { not: null };
  }
  const rows = await prisma.feedback.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PREVIEW_SCAN_CAP,
    select: {
      id: true,
      rating: true,
      sentiment: true,
      text: true,
      createdAt: true,
      isToxic: true,
      trustFlagged: true,
      dealerReply: true,
      dealerRepliedAt: true,
    },
  });

  let matched = 0;
  let alreadyReplied = 0;
  let unsafe = 0;
  const samples: ReplyPreviewDto['samples'] = [];
  for (const r of rows) {
    if (!matchReplyCondition(condition, r)) continue;
    matched++;
    const replied = !!(r.dealerReply || r.dealerRepliedAt);
    if (replied) alreadyReplied++;
    if (r.isToxic || r.trustFlagged) unsafe++;
    if (samples.length < 3) {
      samples.push({
        id: r.id,
        rating: r.rating,
        sentiment: r.sentiment,
        textPreview: preview(r.text),
        createdAt: r.createdAt.toISOString(),
        keywordHits: condition.field === 'text' ? matchedKeywords(condition, r.text) : [],
        replied,
        href: inboxHref(r.id),
      });
    }
  }
  return { windowDays: WINDOW_DAYS, scanned: rows.length, capped: rows.length >= PREVIEW_SCAN_CAP, matched, alreadyReplied, unsafe, samples };
}

export async function loadReplyRuns(dealerId: string, ruleId: string, limit = 20): Promise<ReplyRunDto[]> {
  const rule = await prisma.autoReplyRule.findFirst({ where: { id: ruleId, dealerId }, select: { id: true } });
  if (!rule) throw new ApiError('NOT_FOUND', 'Kural bulunamadı.');
  const events = await prisma.analyticsEvent.findMany({
    where: { userId: dealerId, event: AUTO_REPLY_FIRED_EVENT, data: { path: ['ruleId'], equals: ruleId } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(50, Math.max(1, limit)),
    select: { data: true, createdAt: true },
  });
  const ids = [
    ...new Set(
      events.map((e) => eventData(e.data).feedbackId).filter((v): v is string => typeof v === 'string')
    ),
  ];
  const fbs = ids.length
    ? await prisma.feedback.findMany({
        where: { deletedAt: null, id: { in: ids }, qrCode: { dealerId } },
        select: { id: true, rating: true, text: true },
      })
    : [];
  const byId = new Map(fbs.map((f) => [f.id, f]));
  return events.map((e) => {
    const d = eventData(e.data);
    const f = typeof d.feedbackId === 'string' ? byId.get(d.feedbackId) : undefined;
    return {
      at: e.createdAt.toISOString(),
      action: d.action === 'incident' ? 'incident' : 'reply',
      ai: d.ai === true,
      feedback: f ? { id: f.id, rating: f.rating, textPreview: preview(f.text, 100), href: inboxHref(f.id) } : null,
    };
  });
}
