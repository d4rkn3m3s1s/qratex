/**
 * Yönetici KVKK talep kuyruğu (P0-34): filtre, arama, sayfalama ve yasal süre göstergeleri.
 *
 *   GET ?status=open|overdue|due_soon|completed|rejected|all&type=…&q=…&cursor=…
 *   POST { type, email, channel, receivedOn?, message? } → e-posta/telefon/posta ile gelen
 *        başvuruyu kuyruğa alır (yasal süre başvurunun alındığı günden başlar; kanıt olayı yazılır).
 *
 * Her satırda hesabın güncel e-postası ayrı döner (başvuru e-postasıyla uyuşmazlık uyarısı),
 * son olay ve kalan gün. Üstteki sayaçlar filtreden bağımsızdır.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { manualDsrSchema } from '@/lib/admin-privacy/contract';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { sendDsrEmail } from '@/lib/dsr-email';
import {
  computeDueAt,
  recordDsrEvent,
  DSR_EVENT_LABELS,
  DSR_LEGAL_DAYS,
  OPEN_DSR_STATUSES,
  daysRemaining,
  effectiveDueAt,
  type DsrEventType,
} from '@/lib/dsr-workflow';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 30;

const Query = z.object({
  status: z.enum(['open', 'overdue', 'due_soon', 'completed', 'rejected', 'all']).default('open'),
  type: z.enum(['access', 'deletion', 'rectification', 'objection']).optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(64).optional(),
});

/** `dueAt` boş eski satırlar için başvuru tarihinden 30 gün kuralı. */
function dueBefore(at: Date): Prisma.DataSubjectRequestWhereInput {
  return {
    OR: [{ dueAt: { lt: at } }, { dueAt: null, createdAt: { lt: new Date(at.getTime() - DSR_LEGAL_DAYS * DAY_MS) } }],
  };
}

function statusWhere(status: z.infer<typeof Query>['status'], now: Date): Prisma.DataSubjectRequestWhereInput {
  const open = { status: { in: [...OPEN_DSR_STATUSES] } };
  switch (status) {
    case 'open':
      return open;
    case 'overdue':
      return { AND: [open, dueBefore(now)] };
    case 'due_soon':
      return { AND: [open, dueBefore(new Date(now.getTime() + 7 * DAY_MS)), { NOT: dueBefore(now) }] };
    case 'completed':
      return { status: 'completed' };
    case 'rejected':
      return { status: 'rejected' };
    default:
      return {};
  }
}

export const GET = defineRoute(
  { name: 'admin.privacy-requests.list', roles: ['ADMIN'], query: Query, rateLimit: 'read' },
  async ({ query }) => {
    const now = new Date();
    const where: Prisma.DataSubjectRequestWhereInput = {
      AND: [
        statusWhere(query.status, now),
        query.type ? { type: query.type } : {},
        query.q ? { email: { contains: query.q, mode: 'insensitive' } } : {},
      ],
    };

    const [rows, open, overdue, dueSoon, completed30, recentCompleted] = await Promise.all([
      prisma.dataSubjectRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          email: true,
          type: true,
          status: true,
          message: true,
          receiptSentAt: true,
          createdAt: true,
          processedAt: true,
          dueAt: true,
          userId: true,
          user: { select: { email: true, name: true, role: true, anonymizedAt: true } },
          events: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { type: true, createdAt: true },
          },
          _count: { select: { events: true } },
        },
      }),
      prisma.dataSubjectRequest.count({ where: statusWhere('open', now) }),
      prisma.dataSubjectRequest.count({ where: statusWhere('overdue', now) }),
      prisma.dataSubjectRequest.count({ where: statusWhere('due_soon', now) }),
      prisma.dataSubjectRequest.count({
        where: { status: 'completed', processedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      }),
      prisma.dataSubjectRequest.findMany({
        where: { status: 'completed', processedAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
        select: { createdAt: true, processedAt: true },
        take: 500,
      }),
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const durations = recentCompleted
      .filter((r) => r.processedAt)
      .map((r) => (r.processedAt!.getTime() - r.createdAt.getTime()) / DAY_MS);
    const avgResponseDays =
      durations.length > 0 ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null;

    const requests = page.map((r) => {
      const dueAt = effectiveDueAt(r);
      const isOpen = (OPEN_DSR_STATUSES as readonly string[]).includes(r.status);
      const last = r.events[0];
      return {
        id: r.id,
        email: r.email,
        type: r.type,
        status: r.status,
        message: r.message,
        receiptSentAt: r.receiptSentAt,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        userId: r.userId,
        dueAt,
        daysLeft: isOpen ? daysRemaining(dueAt, now) : null,
        account: r.user
          ? {
              email: r.user.email,
              name: r.user.name,
              role: r.user.role,
              anonymized: Boolean(r.user.anonymizedAt),
              emailMismatch: !r.user.anonymizedAt && r.user.email.toLowerCase() !== r.email.toLowerCase(),
            }
          : null,
        lastEvent: last
          ? { type: last.type, label: DSR_EVENT_LABELS[last.type as DsrEventType] ?? last.type, at: last.createdAt }
          : null,
        eventCount: r._count.events,
      };
    });

    return ok(
      {
        requests,
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
        stats: { open, overdue, dueSoon, completed30, avgResponseDays },
      },
      { legacySpread: true }
    );
  }
);

const MAX_BACKDATE_DAYS = 60;

export const POST = defineRoute(
  { name: 'admin.privacy-requests.create', roles: ['ADMIN'], schema: manualDsrSchema, rateLimit: 'mutation' },
  async ({ body, user, request }) => {
    const now = new Date();
    let receivedAt = now;
    if (body.receivedOn) {
      receivedAt = new Date(`${body.receivedOn}T12:00:00+03:00`);
      if (receivedAt.getTime() > now.getTime() + DAY_MS) {
        throw new ApiError('VALIDATION', 'Başvuru tarihi gelecekte olamaz.', { status: 400 });
      }
      if (receivedAt.getTime() < now.getTime() - MAX_BACKDATE_DAYS * DAY_MS) {
        throw new ApiError('VALIDATION', `Başvuru tarihi en fazla ${MAX_BACKDATE_DAYS} gün geriye girilebilir.`, { status: 400 });
      }
      if (receivedAt > now) receivedAt = now;
    }

    // Başvuranın hesabı (varsa): talep hesaba bağlanır; yoksa "hesaba bağlı değil" kalır ve
    // yürütme komutları (export/silme) açılmaz.
    const account = await prisma.user.findFirst({
      where: { email: { equals: body.email, mode: 'insensitive' } },
      select: { id: true, email: true, anonymizedAt: true },
    });
    const userId = account && !account.anonymizedAt ? account.id : null;

    const meta = getAuditRequestMeta(request);
    const created = await prisma.$transaction(async (tx) => {
      if (userId) {
        const open = await tx.dataSubjectRequest.findFirst({
          where: { userId, type: body.type, status: { in: [...OPEN_DSR_STATUSES] } },
          select: { id: true },
        });
        if (open) {
          throw new ApiError('CONFLICT', 'Bu hesabın aynı türde açık bir talebi zaten var.', { details: { requestId: open.id } });
        }
      }
      const row = await tx.dataSubjectRequest.create({
        data: {
          userId,
          email: body.email,
          type: body.type,
          status: 'received',
          message: body.message || null,
          createdAt: receivedAt,
          dueAt: computeDueAt(receivedAt),
        },
        select: { id: true, type: true, createdAt: true, dueAt: true, email: true },
      });
      await recordDsrEvent(tx, {
        requestId: row.id,
        type: 'received',
        actorId: user.id,
        detail: { channel: body.channel, manual: true, linkedAccount: Boolean(userId), hasMessage: Boolean(body.message) },
        meta,
      });
      return row;
    });

    const mail = await sendDsrEmail(created.email, 'received', {
      requestId: created.id,
      type: created.type,
      createdAt: created.createdAt,
    }).catch(() => ({ ok: false as const }));
    try {
      await prisma.$transaction(async (tx) => {
        if (mail.ok) await tx.dataSubjectRequest.update({ where: { id: created.id }, data: { receiptSentAt: new Date() } });
        await recordDsrEvent(tx, {
          requestId: created.id,
          type: mail.ok ? 'notified' : 'notify_failed',
          actorId: null,
          detail: { kind: 'receipt' },
        });
      });
    } catch (e) {
      console.warn('[admin/privacy-requests] makbuz kanıtı yazılamadı', e);
    }

    return ok(
      {
        id: created.id,
        linkedAccount: Boolean(userId),
        receiptSent: mail.ok,
        message: userId
          ? mail.ok
            ? 'Talep kuyruğa alındı ve başvurana makbuz gönderildi.'
            : 'Talep kuyruğa alındı; makbuz e-postası gönderilemedi.'
          : 'Talep kuyruğa alındı. Bu e-postaya bağlı hesap bulunamadı; kimliği doğrulayıp sonucu başvurana bildirin.',
      },
      { status: 201 }
    );
  }
);
