/**
 * KVKK m.11 başvurusu — veri sahibinin kendi talebi (P0-34).
 *
 *   POST  { type, message? }  → talep oluşturur, makbuzu HESAP e-postasına yollar.
 *   GET                        → kendi talepleri + yürütme zaman çizelgesi.
 *
 * Güvenlik: istemciden e-posta ALINMAZ (eskiden `email` alanı keyfi adrese markalı e-posta
 * gönderdiriyordu). Kullanıcı başına 24 saatte en fazla 3 başvuru; aynı türde açık talep
 * varken yenisi açılmaz (409). Her talep `dueAt = +30 gün` ile ve `received` kanıtıyla doğar.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import {
  DSR_EVENT_LABELS,
  DSR_STATUS_LABELS,
  DSR_TYPE_LABELS,
  OPEN_DSR_STATUSES,
  computeDueAt,
  effectiveDueAt,
  isDsrStatus,
  isAccessDownloadable,
  isDsrType,
  recordDsrEvent,
  type DsrEventType,
} from '@/lib/dsr-workflow';
import { sendDsrEmail } from '@/lib/dsr-email';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

const ROLES = ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'] as const;

const CreateBody = z.object({
  type: z.enum(['access', 'deletion', 'rectification', 'objection']),
  message: z.string().trim().max(4000).optional(),
});

export const POST = defineRoute(
  {
    name: 'customer.privacy-request.create',
    roles: ROLES,
    schema: CreateBody,
    rateLimit: { max: 3, windowMs: DAY_MS, by: 'user' },
  },
  async ({ body, user, request }) => {
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, anonymizedAt: true },
    });
    if (!account?.email || account.anonymizedAt) {
      throw new ApiError('CONFLICT', 'Bu hesap için KVKK başvurusu oluşturulamaz.');
    }
    if (body.type === 'rectification' && (body.message ?? '').length < 10) {
      throw new ApiError('VALIDATION', 'Düzeltme talebinde hangi bilginin nasıl düzeltileceğini yazın (en az 10 karakter).');
    }

    const meta = getAuditRequestMeta(request);
    const created = await prisma.$transaction(async (tx) => {
      const open = await tx.dataSubjectRequest.findFirst({
        where: { userId: user.id, type: body.type, status: { in: [...OPEN_DSR_STATUSES] } },
        select: { id: true },
      });
      if (open) {
        throw new ApiError('CONFLICT', 'Bu türde açık bir başvurunuz zaten var. Sonuçlandığında size bildireceğiz.', {
          details: { requestId: open.id },
        });
      }
      const now = new Date();
      const row = await tx.dataSubjectRequest.create({
        data: {
          userId: user.id,
          // Her zaman doğrulanmış hesap e-postası.
          email: account.email,
          type: body.type,
          message: body.message || null,
          status: 'received',
          dueAt: computeDueAt(now),
        },
        select: { id: true, type: true, status: true, createdAt: true, dueAt: true },
      });
      await recordDsrEvent(tx, {
        requestId: row.id,
        type: 'received',
        actorId: user.id,
        detail: { channel: 'self_service', hasMessage: Boolean(body.message) },
        meta,
      });
      return row;
    });

    const mail = await sendDsrEmail(account.email, 'received', {
      requestId: created.id,
      type: created.type,
      createdAt: created.createdAt,
    }).catch(() => ({ ok: false as const }));

    try {
      await prisma.$transaction(async (tx) => {
        if (mail.ok) {
          await tx.dataSubjectRequest.update({ where: { id: created.id }, data: { receiptSentAt: new Date() } });
        }
        await recordDsrEvent(tx, {
          requestId: created.id,
          type: mail.ok ? 'notified' : 'notify_failed',
          actorId: null,
          detail: { kind: 'receipt' },
        });
      });
    } catch (e) {
      console.warn('[privacy-request] makbuz kanıtı yazılamadı', e);
    }

    return ok(
      {
        request: { ...created, typeLabel: DSR_TYPE_LABELS[body.type] },
        receiptSent: mail.ok,
        message: mail.ok
          ? 'Başvurunuz alındı. Makbuz hesabınızın e-posta adresine gönderildi.'
          : 'Başvurunuz alındı. Makbuz e-postası şu an gönderilemedi; başvurunuzu bu sayfadan izleyebilirsiniz.',
      },
      { status: 201, legacySpread: true }
    );
  }
);

export const GET = defineRoute(
  { name: 'customer.privacy-request.list', roles: ROLES, rateLimit: 'read' },
  async ({ user }) => {
    const rows = await prisma.dataSubjectRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        status: true,
        message: true,
        createdAt: true,
        processedAt: true,
        dueAt: true,
        events: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { type: true, createdAt: true },
        },
      },
    });
    const now = Date.now();
    const requests = rows.map((r) => {
      const type = isDsrType(r.type) ? r.type : null;
      const status = isDsrStatus(r.status) ? r.status : null;
      const downloadable = isAccessDownloadable(r, new Date(now));
      return {
        id: r.id,
        type: r.type,
        typeLabel: type ? DSR_TYPE_LABELS[type] : r.type,
        status: r.status,
        statusLabel: status ? DSR_STATUS_LABELS[status] : r.status,
        message: r.message,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        dueAt: effectiveDueAt(r),
        downloadable,
        timeline: r.events
          // Bildirim teknik ayrıntıları kişiye gösterilmez; yalnız anlamlı adımlar.
          .filter((e) => e.type !== 'notify_failed' && e.type !== 'note')
          .map((e) => ({
            type: e.type,
            label: DSR_EVENT_LABELS[e.type as DsrEventType] ?? e.type,
            at: e.createdAt,
          })),
      };
    });
    return ok({ requests }, { legacySpread: true });
  }
);
