/**
 * Gelen kutusu — sunucu katmanı. Görünümler, sayfalı liste, sayaçlar, konuşma (thread), okundu/
 * arşiv/silme, panelden yanıt (doğru References zinciri + giden kayıt + denetim), saklama süresi.
 *
 * Hata politikası: DB hataları YUTULMAZ; route katmanı (defineRoute) 503/500 zarfına çevirir,
 * istemci `QueryState` ile görünür hata + "Tekrar dene" gösterir (eski ".catch(() => [])" yok).
 */
import type { Session } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isMailConfigured, sendTransactionalEmail } from '@/lib/mail-sender';
import { inboxAccount, isInboxConfigured, readSyncState } from '@/lib/mail-inbox';
import {
  INBOX_PAGE_SIZE,
  INBOX_VIEWS,
  INCOMING_MAILBOXES,
  MAILBOX_ARCHIVED,
  MAILBOX_INBOX,
  MAILBOX_SENT,
  replySubject,
  type InboxAttachmentMeta,
  type InboxDetail,
  type InboxListItem,
  type InboxListPage,
  type InboxOverview,
  type InboxThreadMessage,
  type InboxView,
} from '@/lib/mail-center/inbox-contract';
import { buildReferences, hasRemoteImages, quoteOriginal, renderPersonalReplyHtml, threadRootOf } from '@/lib/mail-center/mail-html';
import { writeMailAudit } from '@/lib/mail-center/audit.server';
import { ApiError } from '@/lib/http/define-route';

export const INBOX_RETENTION_KEY = 'inbox_retention_days';

type StoredAttachment = { filename?: unknown; contentType?: unknown; size?: unknown; url?: unknown };

export function readAttachments(raw: unknown): (InboxAttachmentMeta & { url: string | null })[] {
  if (!Array.isArray(raw)) return [];
  return (raw as StoredAttachment[]).map((a, index) => ({
    index,
    filename: typeof a.filename === 'string' && a.filename ? a.filename : 'ek',
    contentType: typeof a.contentType === 'string' ? a.contentType : 'application/octet-stream',
    size: typeof a.size === 'number' ? a.size : 0,
    url: typeof a.url === 'string' && a.url ? a.url : null,
    available: typeof a.url === 'string' && a.url.length > 0,
  }));
}

function publicAttachments(raw: unknown): InboxAttachmentMeta[] {
  return readAttachments(raw).map(({ url: _url, ...rest }) => rest);
}

/** Panelden yanıtlanmış gelen mesajların Message-ID'leri (giden kayıtların In-Reply-To'su). */
async function repliedMessageIds(): Promise<string[]> {
  const rows = await prisma.inboxMessage.findMany({
    where: { mailbox: MAILBOX_SENT, inReplyTo: { not: null } },
    select: { inReplyTo: true },
    distinct: ['inReplyTo'],
    take: 10_000,
  });
  return rows.map((r) => r.inReplyTo!).filter(Boolean);
}

function hasAttachmentsWhere(): Prisma.InboxMessageWhereInput {
  return { NOT: [{ attachments: { equals: Prisma.DbNull } }, { attachments: { equals: Prisma.JsonNull } }, { attachments: { equals: [] } }] };
}

export function viewWhere(view: InboxView, replied: string[]): Prisma.InboxMessageWhereInput {
  switch (view) {
    case 'inbox':
      return { mailbox: MAILBOX_INBOX };
    case 'intern':
      return { mailbox: MAILBOX_INBOX, isFromIntern: true };
    case 'awaiting':
      return {
        mailbox: MAILBOX_INBOX,
        isFromIntern: true,
        isBounce: false,
        ...(replied.length ? { OR: [{ messageId: null }, { messageId: { notIn: replied } }] } : {}),
      };
    case 'unread':
      return { mailbox: MAILBOX_INBOX, seen: false };
    case 'attachments':
      return { mailbox: { in: [...INCOMING_MAILBOXES] }, ...hasAttachmentsWhere() };
    case 'bounce':
      return { mailbox: { in: [...INCOMING_MAILBOXES] }, isBounce: true };
    case 'sent':
      return { mailbox: MAILBOX_SENT };
    case 'archived':
      return { mailbox: MAILBOX_ARCHIVED };
  }
}

export function searchWhere(q: string): Prisma.InboxMessageWhereInput | null {
  const term = q.trim();
  if (!term) return null;
  const c = { contains: term, mode: 'insensitive' as const };
  return {
    OR: [
      { fromEmail: c },
      { fromName: c },
      { toEmail: c },
      { subject: c },
      { snippet: c },
      { matchedRecipientName: c },
      { matchedDepartment: c },
    ],
  };
}

export async function listInbox(input: { view: InboxView; q: string; cursor?: string | null }): Promise<InboxListPage> {
  const replied = await repliedMessageIds();
  const search = searchWhere(input.q);
  const where: Prisma.InboxMessageWhereInput = search ? { AND: [viewWhere(input.view, replied), search] } : viewWhere(input.view, replied);

  const [rows, matched] = await Promise.all([
    prisma.inboxMessage.findMany({
      where,
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: INBOX_PAGE_SIZE + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        mailbox: true,
        fromEmail: true,
        fromName: true,
        toEmail: true,
        subject: true,
        snippet: true,
        sentAt: true,
        seen: true,
        isFromIntern: true,
        isBounce: true,
        matchedRecipientName: true,
        matchedDepartment: true,
        attachments: true,
        threadRoot: true,
        messageId: true,
      },
    }),
    prisma.inboxMessage.count({ where }),
  ]);

  const page = rows.slice(0, INBOX_PAGE_SIZE);
  const roots = [...new Set(page.map((r) => r.threadRoot).filter((x): x is string => !!x))];
  const groups = roots.length
    ? await prisma.inboxMessage.groupBy({ by: ['threadRoot'], where: { threadRoot: { in: roots } }, _count: { _all: true } })
    : [];
  const threadCounts = new Map(groups.map((g) => [g.threadRoot, g._count._all]));
  const repliedSet = new Set(replied);

  const items: InboxListItem[] = page.map((r) => ({
    id: r.id,
    mailbox: r.mailbox,
    fromEmail: r.fromEmail,
    fromName: r.fromName,
    toEmail: r.toEmail,
    subject: r.subject,
    snippet: r.snippet,
    sentAt: r.sentAt.toISOString(),
    seen: r.seen,
    isFromIntern: r.isFromIntern,
    isBounce: r.isBounce,
    matchedRecipientName: r.matchedRecipientName,
    matchedDepartment: r.matchedDepartment,
    attachmentCount: readAttachments(r.attachments).length,
    threadCount: r.threadRoot ? threadCounts.get(r.threadRoot) ?? 1 : 1,
    replied: !!r.messageId && repliedSet.has(r.messageId),
  }));

  return { items, nextCursor: rows.length > INBOX_PAGE_SIZE ? page[page.length - 1]?.id ?? null : null, matched };
}

export async function inboxCounts(): Promise<Record<InboxView, number>> {
  const replied = await repliedMessageIds();
  const values = await Promise.all(INBOX_VIEWS.map((v) => prisma.inboxMessage.count({ where: viewWhere(v, replied) })));
  return Object.fromEntries(INBOX_VIEWS.map((v, i) => [v, values[i]])) as Record<InboxView, number>;
}

export async function readRetentionDays(): Promise<number | null> {
  const row = await prisma.settings.findUnique({ where: { key: INBOX_RETENTION_KEY }, select: { value: true } });
  const v = row?.value;
  return typeof v === 'number' && v > 0 ? v : null;
}

export async function loadInboxOverview(): Promise<InboxOverview> {
  const [counts, sync, retentionDays] = await Promise.all([inboxCounts(), readSyncState(), readRetentionDays()]);
  return {
    counts,
    sync,
    inboxConfigured: isInboxConfigured(),
    mailConfigured: isMailConfigured(),
    account: inboxAccount(),
    retentionDays,
    generatedAt: new Date().toISOString(),
  };
}

type FullRow = Prisma.InboxMessageGetPayload<object>;

function toThreadMessage(r: FullRow): InboxThreadMessage {
  return {
    id: r.id,
    mailbox: r.mailbox,
    direction: r.mailbox === MAILBOX_SENT ? 'out' : 'in',
    fromEmail: r.fromEmail,
    fromName: r.fromName,
    toEmail: r.toEmail,
    subject: r.subject,
    sentAt: r.sentAt.toISOString(),
    seen: r.seen,
    isBounce: r.isBounce,
    bodyText: r.bodyText,
    hasHtml: !!r.bodyHtml,
    hasRemoteImages: hasRemoteImages(r.bodyHtml),
    attachments: publicAttachments(r.attachments),
  };
}

/** Tek mail + konuşmanın tamamı. GET YAN ETKİSİZ (okundu işaretlemesi istemcinin açık PATCH'i). */
export async function getInboxDetail(id: string): Promise<InboxDetail> {
  const msg = await prisma.inboxMessage.findUnique({ where: { id } });
  if (!msg) throw new ApiError('NOT_FOUND', 'Mail bulunamadı. Silinmiş olabilir.');
  const thread = msg.threadRoot
    ? await prisma.inboxMessage.findMany({ where: { threadRoot: msg.threadRoot }, orderBy: [{ sentAt: 'asc' }, { id: 'asc' }], take: 50 })
    : [msg];
  if (!thread.some((t) => t.id === msg.id)) thread.push(msg);
  const replied =
    !!msg.messageId && (await prisma.inboxMessage.count({ where: { mailbox: MAILBOX_SENT, inReplyTo: msg.messageId } })) > 0;
  return {
    message: {
      ...toThreadMessage(msg),
      isFromIntern: msg.isFromIntern,
      matchedTemplateId: msg.matchedTemplateId,
      matchedRecipientName: msg.matchedRecipientName,
      matchedDepartment: msg.matchedDepartment,
      messageId: msg.messageId,
      replied,
    },
    thread: thread.map(toThreadMessage),
  };
}

export async function getMessageBody(id: string): Promise<{ html: string | null; text: string | null }> {
  const msg = await prisma.inboxMessage.findUnique({ where: { id }, select: { bodyHtml: true, bodyText: true } });
  if (!msg) throw new ApiError('NOT_FOUND', 'Mail bulunamadı.');
  return { html: msg.bodyHtml, text: msg.bodyText };
}

export async function getAttachment(id: string, index: number) {
  const msg = await prisma.inboxMessage.findUnique({ where: { id }, select: { attachments: true } });
  if (!msg) throw new ApiError('NOT_FOUND', 'Mail bulunamadı.');
  const att = readAttachments(msg.attachments)[index];
  if (!att) throw new ApiError('NOT_FOUND', 'Ek bulunamadı.');
  if (!att.url) throw new ApiError('NOT_FOUND', 'Bu ek depolanmamış (çok büyük ya da depolama kapalıydı).');
  return att;
}

export async function patchInboxMessage(input: {
  id: string;
  seen?: boolean;
  archived?: boolean;
  session: Session;
  meta: { ipAddress: string | null; userAgent: string | null };
}): Promise<{ id: string; seen: boolean; mailbox: string }> {
  const msg = await prisma.inboxMessage.findUnique({ where: { id: input.id }, select: { id: true, mailbox: true, seen: true } });
  if (!msg) throw new ApiError('NOT_FOUND', 'Mail bulunamadı.');
  const data: Prisma.InboxMessageUpdateInput = {};
  if (input.seen !== undefined) data.seen = input.seen;
  if (input.archived !== undefined) {
    if (msg.mailbox === MAILBOX_SENT) throw new ApiError('BAD_REQUEST', 'Gönderilen yanıtlar arşivlenemez.');
    data.mailbox = input.archived ? MAILBOX_ARCHIVED : MAILBOX_INBOX;
  }
  const updated = await prisma.inboxMessage.update({ where: { id: input.id }, data, select: { id: true, seen: true, mailbox: true } });
  if (input.archived !== undefined && msg.mailbox !== updated.mailbox) {
    await writeMailAudit({
      session: input.session,
      action: input.archived ? 'INBOX_ARCHIVE' : 'INBOX_UNARCHIVE',
      entity: 'InboxMessage',
      entityId: input.id,
      meta: input.meta,
    });
  }
  return updated;
}

async function deleteAttachmentObjects(raw: unknown): Promise<void> {
  const atts = readAttachments(raw).filter((a) => a.url);
  if (atts.length === 0) return;
  const { deleteFromR2, isR2Configured, keyFromPublicUrl } = await import('@/lib/r2-storage');
  if (!isR2Configured()) return;
  for (const a of atts) {
    const key = keyFromPublicUrl(a.url!);
    if (key && key.startsWith('inbox/')) await deleteFromR2(key);
  }
}

/** Kalıcı silme (KVKK talebi / gereksiz mail). Ekler depolamadan da silinir. Denetimli. */
export async function deleteInboxMessage(input: {
  id: string;
  session: Session;
  meta: { ipAddress: string | null; userAgent: string | null };
}): Promise<void> {
  const msg = await prisma.inboxMessage.findUnique({
    where: { id: input.id },
    select: { id: true, attachments: true, fromEmail: true, subject: true, mailbox: true, sentAt: true },
  });
  if (!msg) throw new ApiError('NOT_FOUND', 'Mail bulunamadı.');
  await prisma.inboxMessage.delete({ where: { id: input.id } });
  await deleteAttachmentObjects(msg.attachments);
  await writeMailAudit({
    session: input.session,
    action: 'INBOX_DELETE',
    entity: 'InboxMessage',
    entityId: input.id,
    oldData: { fromEmail: msg.fromEmail, subject: msg.subject.slice(0, 120), mailbox: msg.mailbox, sentAt: msg.sentAt.toISOString() },
    meta: input.meta,
  });
}

async function allocateSentUid(): Promise<number> {
  const max = await prisma.inboxMessage.aggregate({ where: { mailbox: MAILBOX_SENT }, _max: { uid: true } });
  return (max._max.uid ?? 0) + 1;
}

/**
 * Panelden yanıt. Alıcı, konu ve thread başlıkları İSTEMCİDEN ALINMAZ — orijinal mesajdan sunucuda
 * kurulur (Bulgu 4): `In-Reply-To` = ebeveyn Message-ID, `References` = ebeveyn References +
 * ebeveyn Message-ID. Giden yanıt `QRATEX_SENT` olarak saklanır (thread'de görünür, "yanıtlandı").
 */
export async function replyToMessage(input: {
  id: string;
  message: string;
  quote: boolean;
  session: Session;
  meta: { ipAddress: string | null; userAgent: string | null };
}): Promise<{ sentId: string }> {
  if (!isMailConfigured()) throw new ApiError('SERVICE_UNAVAILABLE', 'E-posta gönderimi yapılandırılmamış (SMTP veya Resend).');
  const parent = await prisma.inboxMessage.findUnique({ where: { id: input.id } });
  if (!parent) throw new ApiError('NOT_FOUND', 'Yanıtlanacak mail bulunamadı.');
  if (parent.mailbox === MAILBOX_SENT) throw new ApiError('BAD_REQUEST', 'Kendi gönderdiğiniz yanıta yanıt verilemez; konuşmadaki gelen maili seçin.');
  if (parent.isBounce) throw new ApiError('BAD_REQUEST', 'İletilemedi bildirimleri yanıtlanamaz (gönderen bir sistem adresi).');
  if (!parent.fromEmail) throw new ApiError('BAD_REQUEST', 'Gönderen adresi okunamadı.');

  const subject = replySubject(parent.subject);
  const quoted = input.quote ? quoteOriginal({ fromName: parent.fromName, fromEmail: parent.fromEmail, sentAt: parent.sentAt, text: parent.bodyText }) : null;
  const references = buildReferences(parent.references, parent.messageId);
  const headers: Record<string, string> = {};
  if (parent.messageId) headers['In-Reply-To'] = parent.messageId;
  if (references) headers.References = references;
  const text = quoted ? `${input.message}\n\n${quoted}` : input.message;

  const res = await sendTransactionalEmail({
    to: parent.fromEmail,
    subject,
    html: renderPersonalReplyHtml(input.message, quoted),
    text,
    ...(Object.keys(headers).length ? { headers } : {}),
  });
  if (!res.ok) throw new ApiError('SERVICE_UNAVAILABLE', `Yanıt gönderilemedi: ${res.error}`, { retryable: true });

  const u = input.session.user as { id: string; name?: string | null; email?: string | null };
  const threadRoot = parent.threadRoot ?? threadRootOf(parent.references, parent.inReplyTo, parent.messageId);
  let sentId: string | null = null;
  for (let attempt = 0; attempt < 5 && !sentId; attempt++) {
    try {
      const uid = (await allocateSentUid()) + attempt;
      const created = await prisma.inboxMessage.create({
        data: {
          uid,
          mailbox: MAILBOX_SENT,
          // Sağlayıcının ürettiği gerçek Message-ID bize dönmüyor; uydurma kimlik yazılmaz.
          messageId: null,
          fromEmail: (inboxAccount() ?? res.effectiveFrom ?? '').toLowerCase(),
          fromName: u.name || u.email || 'QRateX',
          toEmail: parent.fromEmail,
          subject,
          snippet: input.message.replace(/\s+/g, ' ').trim().slice(0, 200),
          bodyText: text,
          bodyHtml: null,
          sentAt: new Date(),
          seen: true,
          isFromIntern: false,
          matchedTemplateId: parent.matchedTemplateId,
          matchedRecipientName: parent.matchedRecipientName,
          matchedDepartment: parent.matchedDepartment,
          inReplyTo: parent.messageId,
          references,
          threadRoot,
          isBounce: false,
          attachments: [],
        },
        select: { id: true },
      });
      sentId = created.id;
    } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002') {
        console.error('[inbox] giden yanıt kaydı yazılamadı (mail GİTTİ):', e);
        break;
      }
    }
  }
  if (!parent.seen) await prisma.inboxMessage.update({ where: { id: parent.id }, data: { seen: true } });
  await writeMailAudit({
    session: input.session,
    action: 'INBOX_REPLY',
    entity: 'InboxMessage',
    entityId: parent.id,
    newData: { to: parent.fromEmail, subject, channel: res.channel, sentRecordId: sentId, quoted: input.quote },
    meta: input.meta,
  });
  if (!sentId) {
    // Mail gitti ama panel kaydı yazılamadı: kullanıcıya dürüstçe söyle (sessiz başarı yok).
    throw new ApiError('INTERNAL', 'Yanıt gönderildi ancak panele kaydedilemedi; konuşmada görünmeyebilir.', { status: 500 });
  }
  return { sentId };
}

export async function saveRetentionDays(input: {
  days: number | null;
  session: Session;
  meta: { ipAddress: string | null; userAgent: string | null };
}): Promise<number | null> {
  const before = await readRetentionDays();
  const value = (input.days ?? 0) as unknown as Prisma.InputJsonValue;
  await prisma.settings.upsert({
    where: { key: INBOX_RETENTION_KEY },
    update: { value, category: 'email' },
    create: { key: INBOX_RETENTION_KEY, value, category: 'email' },
  });
  await writeMailAudit({
    session: input.session,
    action: 'INBOX_RETENTION_UPDATE',
    entity: 'Settings',
    entityId: INBOX_RETENTION_KEY,
    oldData: { days: before },
    newData: { days: input.days },
    meta: input.meta,
  });
  return input.days;
}

/**
 * Saklama süresi: `sentAt`'i süreyi aşan mailleri (gelen, arşiv, giden) ve eklerini siler.
 * Varsayılan KAPALI; yalnız admin bir süre seçtiyse çalışır. Koşu başına sınırlı.
 */
export async function applyInboxRetention(now = new Date(), batch = 200): Promise<{ deleted: number; days: number | null }> {
  const days = await readRetentionDays();
  if (!days) return { deleted: 0, days: null };
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const old = await prisma.inboxMessage.findMany({ where: { sentAt: { lt: cutoff } }, select: { id: true, attachments: true }, take: batch });
  for (const m of old) await deleteAttachmentObjects(m.attachments);
  if (old.length) await prisma.inboxMessage.deleteMany({ where: { id: { in: old.map((m) => m.id) } } });
  return { deleted: old.length, days };
}
