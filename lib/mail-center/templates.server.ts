/**
 * Mail şablonları — sunucu katmanı (okuma görünümü, kilitli kayıt + denetim farkı, gönderim,
 * gönderim geçmişi). Route'lar ince kalır; iş kuralları burada ve birim testlidir.
 */
import { randomBytes } from 'crypto';
import type { Session } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { isMailConfigured, sendTransactionalEmail } from '@/lib/mail-sender';
import { trDateParts, trDayKey } from '@/lib/cron-time';
import { groupSends, type SendRow, type TemplateStat } from '@/lib/intern-email-stats';
import {
  deadlineIsToday,
  loadInternTemplatesState,
  mailPublicOrigin,
  renderInternTaskEmailHtml,
  saveInternTemplates,
  templateRecipients,
  type InternTaskEmail,
} from '@/lib/intern-task-emails';
import { INCOMING_MAILBOXES } from '@/lib/mail-center/inbox-contract';
import type {
  ReminderInfo,
  SendHistoryPage,
  SendOutcome,
  SendResultRow,
  TemplateInput,
  TemplateStatView,
  TemplatesView,
} from '@/lib/mail-center/templates-contract';
import { QUICK_OPEN_MS } from '@/lib/intern-email-stats';
import { writeMailAudit } from '@/lib/mail-center/audit.server';

/** `/api/cron/intern-deadline` ile aynı bayrak anahtarı (salt okunur). */
export const REMINDER_FLAG_KEY = 'intern_deadline_reminder_sent';
/** Gönderimler arası bekleme — Gmail toplu-spam tetikleyicisini yumuşatır. */
const THROTTLE_MS = 800;
/** Tek istekte gönderim bütçesi; kalan alıcılar `remaining` ile döner, istemci devam ettirir. */
const SEND_BUDGET_MS = 40_000;
const STATS_ROW_CAP = 5_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeTrackToken(): string {
  return randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toTemplateInput(t: InternTaskEmail): TemplateInput {
  return {
    id: t.id,
    kind: t.kind ?? 'task',
    department: t.department,
    recipientName: t.recipientName,
    email: t.email,
    subject: t.subject,
    body: t.body,
    deadline: t.deadline,
    reminder: t.reminder === false ? false : true,
    archivedAt: t.archivedAt ?? null,
  };
}

export function fromTemplateInput(t: TemplateInput): InternTaskEmail {
  const out: InternTaskEmail = {
    id: t.id,
    kind: t.kind as InternTaskEmail['kind'],
    department: t.department.trim(),
    recipientName: t.recipientName.trim(),
    email: templateRecipients({ email: t.email }).join(', '),
    subject: t.subject.trim(),
    body: t.body,
  };
  if (t.deadline && t.deadline.trim()) out.deadline = t.deadline.trim();
  if (t.reminder === false) out.reminder = false;
  if (t.archivedAt) out.archivedAt = t.archivedAt;
  return out;
}

function emptyStat(): TemplateStatView {
  return { sent: 0, opened: 0, errored: 0, replied: 0, lastSentAt: null, recipients: [] };
}

function decorate(stat: TemplateStat | undefined, replies: Map<string, number>, templateId: string): TemplateStatView {
  if (!stat) return emptyStat();
  let replied = 0;
  const recipients = stat.recipients.map((r) => {
    const n = replies.get(`${templateId} ${r.email.toLowerCase()}`) ?? 0;
    if (n > 0) replied++;
    return { ...r, replies: n };
  });
  return { sent: stat.sent, opened: stat.opened, errored: stat.errored, replied, lastSentAt: stat.lastSentAt, recipients };
}

export function readReminderFlag(raw: unknown, dayKey: string): { templateIds: string[]; recipients: Record<string, string[]> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { templateIds: [], recipients: {} };
  const o = raw as { dayKey?: unknown; templateIds?: unknown; recipients?: unknown };
  if (o.dayKey !== dayKey) return { templateIds: [], recipients: {} };
  const recipients: Record<string, string[]> = {};
  if (o.recipients && typeof o.recipients === 'object' && !Array.isArray(o.recipients)) {
    for (const [k, v] of Object.entries(o.recipients as Record<string, unknown>)) {
      if (Array.isArray(v)) recipients[k] = v.filter((x): x is string => typeof x === 'string');
    }
  }
  return { templateIds: Array.isArray(o.templateIds) ? o.templateIds.filter((x): x is string => typeof x === 'string') : [], recipients };
}

/** Sayfanın tüm sunucu verisi. DB hatası FIRLATILIR (çağıran 503/QueryState hatası gösterir). */
export async function loadTemplatesView(now = new Date()): Promise<TemplatesView> {
  const state = await loadInternTemplatesState();
  const ids = state.templates.map((t) => t.id);

  const [rows, replyGroups, flagRow, updater] = await Promise.all([
    ids.length
      ? prisma.internEmailSend.findMany({
          where: { templateId: { in: ids }, kind: { in: ['send', 'test'] } },
          select: { templateId: true, kind: true, email: true, status: true, lastError: true, firstOpenedAt: true, openCount: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: STATS_ROW_CAP,
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.inboxMessage.groupBy({
          by: ['matchedTemplateId', 'fromEmail'],
          where: { matchedTemplateId: { in: ids }, mailbox: { in: [...INCOMING_MAILBOXES] }, isBounce: false },
          _count: { _all: true },
        })
      : Promise.resolve([] as { matchedTemplateId: string | null; fromEmail: string; _count: { _all: number } }[]),
    prisma.settings.findUnique({ where: { key: REMINDER_FLAG_KEY }, select: { value: true } }),
    state.updatedBy ? prisma.user.findUnique({ where: { id: state.updatedBy }, select: { name: true, email: true } }) : Promise.resolve(null),
  ]);

  const replies = new Map<string, number>();
  const repliesByTemplate: Record<string, number> = {};
  for (const g of replyGroups) {
    if (!g.matchedTemplateId) continue;
    replies.set(`${g.matchedTemplateId} ${g.fromEmail.toLowerCase()}`, g._count._all);
    repliesByTemplate[g.matchedTemplateId] = (repliesByTemplate[g.matchedTemplateId] ?? 0) + g._count._all;
  }

  const sendRows = rows.filter((r) => r.kind !== 'test') as SendRow[];
  const testRows = rows.filter((r) => r.kind === 'test') as SendRow[];
  const grouped = groupSends(sendRows);
  const groupedTest = groupSends(testRows);

  const stats: Record<string, TemplateStatView> = {};
  const testStats: Record<string, TemplateStatView> = {};
  for (const id of ids) {
    stats[id] = decorate(grouped[id], replies, id);
    testStats[id] = decorate(groupedTest[id], new Map(), id);
  }

  const parts = trDateParts(now);
  const dayKey = trDayKey(now);
  const flag = readReminderFlag(flagRow?.value, dayKey);
  const reminders: Record<string, ReminderInfo> = {};
  for (const t of state.templates) {
    if (t.archivedAt || (t.kind ?? 'task') !== 'task') continue;
    const dueToday = t.reminder !== false && deadlineIsToday(t.deadline, parts);
    reminders[t.id] = { dueToday, sentTo: flag.recipients[t.id] ?? [], completed: flag.templateIds.includes(t.id) };
  }

  const origin = mailPublicOrigin();
  return {
    version: state.version,
    updatedAt: state.updatedAt,
    updatedByName: updater ? updater.name || updater.email : null,
    exists: state.exists,
    templates: state.templates.map(toTemplateInput),
    stats,
    testStats,
    reminders,
    repliesByTemplate,
    mailConfigured: isMailConfigured(),
    trackingOriginLocal: /localhost|127\.0\.0\.1/i.test(origin),
    generatedAt: now.toISOString(),
  };
}

// ─────────────────────────── Kayıt (iyimser kilit + denetim farkı) ───────────────────────────

const DIFF_FIELDS = ['kind', 'department', 'recipientName', 'email', 'subject', 'body', 'deadline', 'reminder', 'archivedAt'] as const;

/** Denetim için alan bazlı fark (gövde metni denetime yazılmaz, yalnız "değişti" bilgisi). */
export function diffTemplates(before: InternTaskEmail[], after: InternTaskEmail[]) {
  const prev = new Map(before.map((t) => [t.id, t]));
  const next = new Map(after.map((t) => [t.id, t]));
  const added = after.filter((t) => !prev.has(t.id)).map((t) => t.id);
  const removed = before.filter((t) => !next.has(t.id)).map((t) => t.id);
  const changed: { id: string; fields: string[] }[] = [];
  for (const t of after) {
    const p = prev.get(t.id);
    if (!p) continue;
    const fields = DIFF_FIELDS.filter((f) => String(p[f] ?? '') !== String(t[f] ?? ''));
    if (fields.length) changed.push({ id: t.id, fields: [...fields] });
  }
  return { added, removed, changed };
}

export async function saveTemplates(input: {
  templates: TemplateInput[];
  baseVersion: number;
  session: Session;
  meta: { ipAddress: string | null; userAgent: string | null };
}): Promise<{ version: number; updatedAt: string }> {
  const before = (await loadInternTemplatesState()).templates;
  const list = input.templates.map(fromTemplateInput);
  const saved = await saveInternTemplates(list, { baseVersion: input.baseVersion, userId: input.session.user.id });
  const diff = diffTemplates(before, list);
  await writeMailAudit({
    session: input.session,
    action: 'UPDATE_INTERN_EMAILS',
    entity: 'Settings',
    entityId: 'intern_task_emails',
    oldData: { version: input.baseVersion, count: before.length },
    newData: { version: saved.version, count: list.length, ...diff },
    meta: input.meta,
  });
  return saved;
}

// ─────────────────────────── Gönderim ───────────────────────────

async function deliverOne(tpl: InternTaskEmail, to: string, kind: 'send' | 'test', userId: string): Promise<SendResultRow> {
  const token = makeTrackToken();
  const { html, text } = renderInternTaskEmailHtml(tpl, token, to); // pixel origin = mailPublicOrigin (localhost değil)
  const subject = kind === 'test' ? `[TEST] ${tpl.subject}` : tpl.subject;
  const r = await sendTransactionalEmail({ to, subject, html, text, headers: { 'X-Entity-Ref-ID': 'qratex-intern-task', 'X-Qratex-Ref': token } });
  await prisma.internEmailSend
    .create({
      data: {
        token,
        templateId: tpl.id,
        department: tpl.department,
        recipientName: tpl.recipientName,
        email: to,
        subject,
        kind,
        sentByUserId: userId,
        status: r.ok ? 'sent' : 'error',
        channel: r.ok ? r.channel : null,
        lastError: r.ok ? null : (r.error ?? 'Bilinmeyen gönderim hatası').slice(0, 300),
      },
    })
    .catch((e) => console.error('[intern-mail] gönderim kaydı yazılamadı:', e instanceof Error ? e.message : e));
  return r.ok ? { to, ok: true } : { to, ok: false, error: r.error ?? 'Gönderilemedi' };
}

export class TemplateNotFoundError extends Error {}
export class NothingToSendError extends Error {}

/**
 * Kayıtlı şablonu gerçek alıcılarına gönderir. `onlyNew` (varsayılan) → daha önce BAŞARIYLA
 * gönderilmiş alıcılar atlanır: zaman aşımı sonrası tekrar basmak çift mail üretmez (Bulgu 4).
 * Süre bütçesi aşılırsa kalan alıcılar `remaining` olarak döner (istemci aynı çağrıyla devam eder).
 */
export async function sendSavedTemplate(input: {
  templateId: string;
  onlyNew: boolean;
  only?: string[];
  session: Session;
  meta: { ipAddress: string | null; userAgent: string | null };
}): Promise<SendOutcome & { remaining: number }> {
  const state = await loadInternTemplatesState();
  const tpl = state.templates.find((t) => t.id === input.templateId && !t.archivedAt);
  if (!tpl) throw new TemplateNotFoundError('Şablon bulunamadı ya da arşivlenmiş. Önce kaydedin.');
  const inTemplate = templateRecipients(tpl);
  const all = input.only?.length ? inTemplate.filter((e) => input.only!.includes(e)) : inTemplate;
  if (all.length === 0) throw new NothingToSendError('Bu şablonda gönderilecek alıcı yok.');

  let skippedSet = new Set<string>();
  if (input.onlyNew) {
    const done = await prisma.internEmailSend.findMany({
      where: { templateId: tpl.id, kind: 'send', status: 'sent', email: { in: all } },
      select: { email: true },
    });
    skippedSet = new Set(done.map((d) => d.email.toLowerCase()));
  }
  const queue = all.filter((e) => !skippedSet.has(e));
  const results: SendResultRow[] = [...skippedSet].filter((e) => all.includes(e)).map((to) => ({ to, ok: true, skipped: true }));
  const deadline = Date.now() + SEND_BUDGET_MS;
  let processed = 0;
  for (let i = 0; i < queue.length; i++) {
    if (Date.now() > deadline) break;
    results.push(await deliverOne(tpl, queue[i], 'send', input.session.user.id));
    processed++;
    if (i < queue.length - 1) await sleep(THROTTLE_MS);
  }
  const sent = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  await writeMailAudit({
    session: input.session,
    action: 'INTERN_EMAIL_SEND',
    entity: 'InternEmailTemplate',
    entityId: tpl.id,
    newData: { sent, failed, skipped, remaining: queue.length - processed, onlyNew: input.onlyNew },
    meta: input.meta,
  });
  return { results, sent, failed, skipped, remaining: queue.length - processed };
}

/** Taslağı (kaydedilmemiş olabilir) yalnız test adresine gönderir. */
export async function sendTestDraft(input: { template: TemplateInput; testTo: string; session: Session }): Promise<SendOutcome> {
  const row = await deliverOne(fromTemplateInput(input.template), input.testTo.trim().toLowerCase(), 'test', input.session.user.id);
  return { results: [row], sent: row.ok ? 1 : 0, failed: row.ok ? 0 : 1, skipped: 0 };
}

// ─────────────────────────── Geçmiş (sayfalı) ───────────────────────────

export async function loadSendHistory(templateId: string, cursor: string | null, take = 20): Promise<SendHistoryPage> {
  const rows = await prisma.internEmailSend.findMany({
    where: { templateId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      kind: true,
      status: true,
      lastError: true,
      createdAt: true,
      firstOpenedAt: true,
      openCount: true,
      sentByUserId: true,
      channel: true,
    },
  });
  const page = rows.slice(0, take);
  const userIds = [...new Set(page.map((r) => r.sentByUserId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name || u.email]));
  return {
    items: page.map((r) => ({
      id: r.id,
      email: r.email,
      kind: r.kind === 'test' ? 'test' : 'send',
      status: r.status,
      error: r.lastError,
      sentAt: r.createdAt.toISOString(),
      openedAt: r.firstOpenedAt ? r.firstOpenedAt.toISOString() : null,
      openCount: r.openCount,
      openedQuickly: !!r.firstOpenedAt && r.firstOpenedAt.getTime() - r.createdAt.getTime() < QUICK_OPEN_MS,
      sentByName: r.sentByUserId ? names.get(r.sentByUserId) ?? null : null,
      channel: r.channel,
    })),
    nextCursor: rows.length > take ? page[page.length - 1]?.id ?? null : null,
  };
}
