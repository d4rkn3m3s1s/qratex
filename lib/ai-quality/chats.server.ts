/**
 * AI Kalite → QRA sohbet denetimi, sunucu mantığı.
 *
 *  - Liste yalnız PII MASKELİ kısa önizleme döner (tam metin listeye girmez).
 *  - Detay maskeli tam metin + aynı aktörün ±30 dk içindeki turları; her açılış `auditLog`'a
 *    (`qra_chat_log.view`). Ham (maskesiz) metin yalnız gerekçeli `reveal` ile ve denetim kaydıyla.
 *  - Sonuç (outcome) şemada alan olmadığı için yanıt metninden TÜRETİLİR: `lib/groq` QRA_MESSAGES
 *    sabitleri (bakım / güvenlik engeli / hata) birebir eşleşir. Bu yanıtlarda model hiç
 *    çağrılmadığı için gecikme anlamsızdır → gösterilmez, p50/p95'e girmez.
 *  - Saklama süresi PII kayıt defterinden okunur (QraChatLog: otomatik silme, `db-cleanup`).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { maskEmail } from '@/lib/http/dto';
import { QRA_MESSAGES } from '@/lib/groq';
import { MAX_QRA_CHAT_PER_MINUTE } from '@/lib/rate-limit';
import { PII_REGISTRY } from '@/lib/pii-registry';
import {
  CHAT_EXPORT_MAX,

  CHAT_OUTCOME_LABEL,
  CHAT_PERIOD_MS,
  CHAT_SLOW_MS,
  chatRoleLabel,
  type ChatActor,
  type ChatDetail,
  type ChatListItem,
  type ChatListQuery,
  type ChatOutcome,
  type ChatStats,
  type ChatStatsQuery,
  type ChatTurn,
  type Paged,
} from './contract';
import { maskPii, previewText } from './pii-mask';
import { lastDays } from './time';

export const CHAT_ENTITY = 'QraChatLog';
export const CHAT_AUDIT = { view: 'qra_chat_log.view', reveal: 'qra_chat_log.reveal', export: 'qra_chat_log.export' } as const;

/** `chatWithQRA` boş yanıt metni (lib/groq.ts içinde sabit dize). */
const EMPTY_REPLY = 'Yanıt oluşturulamadı.';

export const CANNED: Record<Exclude<ChatOutcome, 'ok'>, string[]> = {
  maintenance: [QRA_MESSAGES.unavailable],
  blocked: [QRA_MESSAGES.blocked],
  error: [QRA_MESSAGES.error, EMPTY_REPLY],
};
const ALL_CANNED = [...CANNED.maintenance, ...CANNED.blocked, ...CANNED.error];
const PROBLEM_CANNED = [...CANNED.blocked, ...CANNED.error, ...CANNED.maintenance];

export function classifyChatOutcome(assistantMessage: string): ChatOutcome {
  const t = assistantMessage.trim();
  if (CANNED.blocked.includes(t)) return 'blocked';
  if (CANNED.maintenance.includes(t)) return 'maintenance';
  if (CANNED.error.includes(t)) return 'error';
  return 'ok';
}

type RequestLike = { headers: { get(name: string): string | null } } | null | undefined;

const USER_SELECT = { id: true, email: true, name: true, role: true } as const;
type Row = Prisma.QraChatLogGetPayload<{ include: { user: { select: typeof USER_SELECT } } }>;

function actorOf(r: Row): ChatActor {
  if (r.user) {
    return { kind: 'user', userId: r.user.id, name: r.user.name, email: r.user.email ? maskEmail(r.user.email) : null, fingerprint: null, currentRole: r.user.role };
  }
  if (r.ipFingerprint || r.userRoleSnapshot === 'ANON') {
    return { kind: 'anon', userId: null, name: null, email: null, fingerprint: r.ipFingerprint ?? null, currentRole: null };
  }
  return { kind: 'deleted', userId: null, name: null, email: null, fingerprint: null, currentRole: null };
}

function toItem(r: Row): ChatListItem {
  const outcome = classifyChatOutcome(r.assistantMessage);
  const modelCalled = outcome === 'ok' || outcome === 'error';
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actor: actorOf(r),
    roleSnapshot: r.userRoleSnapshot,
    userPreview: previewText(r.userMessage, 160),
    assistantPreview: previewText(r.assistantMessage, 160),
    model: r.model,
    modelCalled,
    latencyMs: modelCalled ? r.latencyMs : null,
    outcome,
  };
}

function since(period: ChatListQuery['period'], now: Date): Date | null {
  return period === 'all' ? null : new Date(now.getTime() - CHAT_PERIOD_MS[period]);
}

export function buildChatWhere(q: ChatListQuery, now: Date = new Date()): Prisma.QraChatLogWhereInput {
  const and: Prisma.QraChatLogWhereInput[] = [];
  const from = since(q.period, now);
  if (from) and.push({ createdAt: { gte: from } });
  if (q.role) and.push({ userRoleSnapshot: q.role });
  if (q.user) and.push({ userId: q.user });
  if (q.fp) and.push({ ipFingerprint: q.fp });
  if (q.outcome) {
    and.push(q.outcome === 'ok' ? { assistantMessage: { notIn: ALL_CANNED } } : { assistantMessage: { in: CANNED[q.outcome] } });
  }
  if (q.slow) and.push({ latencyMs: { gte: CHAT_SLOW_MS } }, { assistantMessage: { notIn: [...CANNED.maintenance, ...CANNED.blocked] } });
  if (q.q) {
    and.push({
      OR: [
        { userMessage: { contains: q.q, mode: 'insensitive' } },
        { assistantMessage: { contains: q.q, mode: 'insensitive' } },
        { user: { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } },
        { ipFingerprint: { startsWith: q.q } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listChats(q: ChatListQuery, now: Date = new Date()): Promise<Paged<ChatListItem>> {
  const where = buildChatWhere(q, now);
  const [rows, total] = await Promise.all([
    prisma.qraChatLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.size,
      take: q.size,
      include: { user: { select: USER_SELECT } },
    }),
    prisma.qraChatLog.count({ where }),
  ]);
  return { items: rows.map((r) => toItem(r as Row)), total, page: q.page, size: q.size };
}

/* ───────────────────────── Detay + denetim ───────────────────────── */

const CONTEXT_WINDOW_MS = 30 * 60_000;

async function loadRow(id: string): Promise<Row> {
  const row = await prisma.qraChatLog.findUnique({ where: { id }, include: { user: { select: USER_SELECT } } });
  if (!row) throw new ApiError('NOT_FOUND', 'Sohbet kaydı bulunamadı (saklama süresi dolmuş ya da silinmiş olabilir).');
  return row as Row;
}

export async function getChatDetail(id: string, actor: AuditActor, request?: RequestLike): Promise<ChatDetail> {
  const row = await loadRow(id);
  const owner: Prisma.QraChatLogWhereInput | null = row.userId
    ? { userId: row.userId }
    : row.ipFingerprint
      ? { ipFingerprint: row.ipFingerprint }
      : null;
  const turns = owner
    ? await prisma.qraChatLog.findMany({
        where: {
          ...owner,
          createdAt: { gte: new Date(row.createdAt.getTime() - CONTEXT_WINDOW_MS), lte: new Date(row.createdAt.getTime() + CONTEXT_WINDOW_MS) },
        },
        orderBy: { createdAt: 'asc' },
        take: 30,
        select: { id: true, createdAt: true, userMessage: true, assistantMessage: true },
      })
    : [];
  await prisma.auditLog.create({
    data: auditEntry(actor, { action: CHAT_AUDIT.view, entity: CHAT_ENTITY, entityId: id }, request),
  });
  const conversation: ChatTurn[] = (turns.length ? turns : [row]).map((t) => ({
    id: t.id,
    createdAt: t.createdAt.toISOString(),
    userMessage: maskPii(t.userMessage),
    assistantMessage: maskPii(t.assistantMessage),
    outcome: classifyChatOutcome(t.assistantMessage),
    current: t.id === id,
  }));
  return { ...toItem(row), userMessage: maskPii(row.userMessage), assistantMessage: maskPii(row.assistantMessage), masked: true, conversation };
}

export async function revealChat(id: string, reason: string, actor: AuditActor, request?: RequestLike): Promise<{ userMessage: string; assistantMessage: string }> {
  const row = await loadRow(id);
  await prisma.auditLog.create({
    data: auditEntry(actor, { action: CHAT_AUDIT.reveal, entity: CHAT_ENTITY, entityId: id, newData: { reason } }, request),
  });
  return { userMessage: row.userMessage, assistantMessage: row.assistantMessage };
}

/* ───────────────────────── İstatistik ───────────────────────── */

const retentionDays = (): number | null => {
  const e = PII_REGISTRY.find((x) => x.model === 'QraChatLog');
  return e?.retentionDays ?? null;
};

export async function getChatStats(q: ChatStatsQuery, now: Date = new Date()): Promise<ChatStats> {
  const span = CHAT_PERIOD_MS[q.period];
  const from = new Date(now.getTime() - span);
  const prevFrom = new Date(from.getTime() - span);
  const range = { createdAt: { gte: from } };

  const [total, previousTotal, blocked, maintenance, error, latencyRows, seriesRows, users, anons, oldest] = await Promise.all([
    prisma.qraChatLog.count({ where: range }),
    prisma.qraChatLog.count({ where: { createdAt: { gte: prevFrom, lt: from } } }),
    prisma.qraChatLog.count({ where: { ...range, assistantMessage: { in: CANNED.blocked } } }),
    prisma.qraChatLog.count({ where: { ...range, assistantMessage: { in: CANNED.maintenance } } }),
    prisma.qraChatLog.count({ where: { ...range, assistantMessage: { in: CANNED.error } } }),
    prisma.$queryRaw<{ p50: number | null; p95: number | null; n: bigint | number }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95,
             COUNT("latencyMs") AS n
      FROM "QraChatLog"
      WHERE "createdAt" >= ${from} AND "latencyMs" IS NOT NULL
        AND "assistantMessage" NOT IN (${Prisma.join(ALL_CANNED)})`,
    prisma.$queryRaw<{ day: string; total: bigint | number; problems: bigint | number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD') AS day,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE "assistantMessage" IN (${Prisma.join(PROBLEM_CANNED)})) AS problems
      FROM "QraChatLog"
      WHERE "createdAt" >= ${from}
      GROUP BY 1`,
    prisma.qraChatLog.groupBy({
      by: ['userId'],
      where: { ...range, userId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 5,
    }),
    prisma.qraChatLog.groupBy({
      by: ['ipFingerprint'],
      where: { ...range, userId: null, ipFingerprint: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { ipFingerprint: 'desc' } },
      take: 5,
    }),
    prisma.qraChatLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);

  const ids = users.map((u) => u.userId).filter((x): x is string => !!x);
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, role: true } }) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const topActors: ChatStats['topActors'] = [
    ...users.map((u) => {
      const p = u.userId ? byId.get(u.userId) : undefined;
      const label = p ? `${p.name ?? (p.email ? maskEmail(p.email) : 'Kullanıcı')} · ${chatRoleLabel(p.role)}` : 'Kullanıcı';
      return { key: `u:${u.userId}`, kind: 'user' as const, label, count: u._count._all, userId: u.userId, fingerprint: null };
    }),
    ...anons.map((a) => ({
      key: `a:${a.ipFingerprint}`,
      kind: 'anon' as const,
      label: `Ziyaretçi #${(a.ipFingerprint ?? '').slice(0, 8)}`,
      count: a._count._all,
      userId: null,
      fingerprint: a.ipFingerprint,
    })),
  ]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const lat = latencyRows[0];
  const days = lastDays(now, q.period === '24h' ? 2 : q.period === '7d' ? 7 : 30);
  const byDay = new Map(seriesRows.map((r) => [r.day, r]));
  const outcomes: Record<ChatOutcome, number> = { ok: Math.max(0, total - blocked - maintenance - error), blocked, maintenance, error };

  return {
    asOf: now.toISOString(),
    period: q.period,
    total,
    previousTotal,
    outcomes,
    errorRate: total ? Math.round(((error + maintenance) / total) * 1000) / 10 : null,
    latency: {
      p50: lat?.p50 != null ? Math.round(Number(lat.p50)) : null,
      p95: lat?.p95 != null ? Math.round(Number(lat.p95)) : null,
      n: Number(lat?.n ?? 0),
    },
    series: days.map((d) => {
      const r = byDay.get(d);
      return { day: d, total: Number(r?.total ?? 0), problems: Number(r?.problems ?? 0) };
    }),
    topActors,
    retention: { days: retentionDays(), oldestAt: oldest ? oldest.createdAt.toISOString() : null },
    limits: { ...MAX_QRA_CHAT_PER_MINUTE },
  };
}

/* ───────────────────────── Dışa aktarma ───────────────────────── */

const TZ_FMT = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'medium' });

export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV formül enjeksiyonu
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportChatsCsv(q: ChatListQuery, actor: AuditActor, request?: RequestLike, now: Date = new Date()): Promise<{ csv: string; count: number }> {
  const where = buildChatWhere(q, now);
  const rows = (await prisma.qraChatLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: CHAT_EXPORT_MAX,
    include: { user: { select: USER_SELECT } },
  })) as Row[];
  const header = ['Zaman (İstanbul)', 'Rol (o an)', 'Aktör', 'Sonuç', 'Model', 'Gecikme (ms)', 'Kullanıcı mesajı (maskeli)', 'Bot yanıtı (maskeli)'];
  const lines = rows.map((r) => {
    const it = toItem(r);
    const a = it.actor;
    const who = a.kind === 'user' ? a.email ?? a.name ?? a.userId : a.kind === 'anon' ? `Ziyaretçi #${(a.fingerprint ?? '').slice(0, 8)}` : 'Silinmiş kullanıcı';
    return [
      TZ_FMT.format(r.createdAt),
      chatRoleLabel(r.userRoleSnapshot),
      who,
      CHAT_OUTCOME_LABEL[it.outcome],
      it.modelCalled ? r.model : 'çağrılmadı',
      it.latencyMs ?? '',
      maskPii(r.userMessage),
      maskPii(r.assistantMessage),
    ]
      .map(csvCell)
      .join(';');
  });
  await prisma.auditLog.create({
    data: auditEntry(
      actor,
      { action: CHAT_AUDIT.export, entity: CHAT_ENTITY, entityId: null, newData: { count: rows.length, filters: { ...q, page: undefined, size: undefined } } },
      request
    ),
  });
  return { csv: `﻿${[header.map(csvCell).join(';'), ...lines].join('\r\n')}\r\n`, count: rows.length };
}

