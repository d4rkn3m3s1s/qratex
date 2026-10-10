/**
 * Tek KVKK talebi: ayrıntı + yürütme komutları (P0-34).
 *
 *   GET    → talep, hesap, kanıt zinciri (DsrEvent), eksik kanıt, izinli komutlar
 *            (?inventory=1 → bölüm başına kayıt SAYILARI; kişisel veri içermez)
 *   POST   { action, reason?, confirmEmail? } → komut (aşağıda)
 *   PATCH  { status } → ESKİ istemciler için dar uyumluluk: yalnız `in_review`. "completed"
 *          artık elle verilemez (409) — tamamlanma yalnız yürütme kanıtıyla olur.
 *
 * Komutlar: review · reject · reopen · note · download_export · fulfill_access ·
 * confirm_delivery · erase · rectify · resolve_objection. Her biri sunucu tarafı durum makinesi
 * (`checkDsrCommand`) + kanıt kaydı (`recordDsrEvent`: DsrEvent + AuditLog, aktör = yönetici)
 * ile çalışır; `completed` yalnız `completeDsrIfEvidenced` üzerinden verilir.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import {
  anonymizeUser,
  countUserData,
  exportDigest,
  exportUserData,
  purgeRegistryPersonalData,
  deletePersonalObjects,
} from '@/lib/gdpr-core';
import {
  DSR_COMMANDS,
  DSR_EVENT_LABELS,
  OPEN_DSR_STATUSES,
  checkDsrCommand,
  completeDsrIfEvidenced,
  daysRemaining,
  effectiveDueAt,
  isDsrCommand,
  missingEvidence,
  recordDsrEvent,
  DsrEvidenceError,
  type DsrCommand,
  type DsrEventType,
} from '@/lib/dsr-workflow';
import { sendDsrEmail, type DsrOutcome } from '@/lib/dsr-email';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

type RequestRow = {
  id: string;
  userId: string | null;
  email: string;
  type: string;
  status: string;
  createdAt: Date;
};

const REQUEST_SELECT = {
  id: true,
  userId: true,
  email: true,
  type: true,
  status: true,
  createdAt: true,
} as const;

async function loadRequest(id: string): Promise<RequestRow> {
  const row = await prisma.dataSubjectRequest.findUnique({ where: { id }, select: REQUEST_SELECT });
  if (!row) throw new ApiError('NOT_FOUND', 'Talep bulunamadı.');
  return row;
}

async function loadEvents(client: Prisma.TransactionClient | typeof prisma, requestId: string) {
  return client.dsrEvent.findMany({
    where: { requestId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true, actorId: true, detail: true, createdAt: true },
  });
}

function assertAllowed(row: RequestRow, command: DsrCommand, input: { reason?: string | null; events?: { type: string }[] }) {
  const check = checkDsrCommand(row, command, input);
  if (!check.ok) throw new ApiError(check.code, check.message, { status: check.status });
}

/** İzinli komutlar (UI yalnız bunları gösterir; sunucu yine her komutta denetler). */
function allowedCommands(row: RequestRow, events: { type: string }[]): DsrCommand[] {
  const longReason = 'x'.repeat(20);
  return DSR_COMMANDS.filter((c) => checkDsrCommand(row, c, { reason: longReason, events }).ok);
}

// ───────────────────────────── GET ─────────────────────────────

export const GET = defineRoute(
  {
    name: 'admin.privacy-requests.detail',
    roles: ['ADMIN'],
    params: Params,
    query: z.object({ inventory: z.enum(['0', '1']).optional() }),
    rateLimit: 'read',
  },
  async ({ params, query }) => {
    const row = await prisma.dataSubjectRequest.findUnique({
      where: { id: params.id },
      select: {
        ...REQUEST_SELECT,
        message: true,
        receiptSentAt: true,
        processedAt: true,
        dueAt: true,
        user: { select: { email: true, name: true, role: true, anonymizedAt: true, createdAt: true } },
      },
    });
    if (!row) throw new ApiError('NOT_FOUND', 'Talep bulunamadı.');
    const events = await loadEvents(prisma, row.id);

    const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter((v): v is string => !!v)));
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true, role: true } })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    const inventory =
      query.inventory === '1' && row.userId && !row.user?.anonymizedAt ? await countUserData(row.userId) : null;

    const dueAt = effectiveDueAt(row);
    const isOpen = (OPEN_DSR_STATUSES as readonly string[]).includes(row.status);
    return ok(
      {
        request: {
          ...row,
          dueAt,
          daysLeft: isOpen ? daysRemaining(dueAt) : null,
          account: row.user
            ? {
                email: row.user.email,
                name: row.user.name,
                role: row.user.role,
                anonymized: Boolean(row.user.anonymizedAt),
                createdAt: row.user.createdAt,
                emailMismatch: !row.user.anonymizedAt && row.user.email.toLowerCase() !== row.email.toLowerCase(),
              }
            : null,
          user: undefined,
        },
        events: events.map((e) => {
          const a = e.actorId ? actorById.get(e.actorId) : null;
          return {
            id: e.id,
            type: e.type,
            label: DSR_EVENT_LABELS[e.type as DsrEventType] ?? e.type,
            detail: e.detail,
            createdAt: e.createdAt,
            actor: e.actorId
              ? { id: e.actorId, name: a?.name ?? null, email: a?.email ?? null, role: a?.role ?? null }
              : null,
          };
        }),
        missingEvidence: isOpen ? missingEvidence(row.type, events) : [],
        allowedCommands: allowedCommands(row, events),
        inventory,
      },
      { legacySpread: true }
    );
  }
);

// ───────────────────────────── POST (komutlar) ─────────────────────────────

const CommandBody = z.object({
  action: z.enum(DSR_COMMANDS),
  reason: z.string().trim().max(2000).optional(),
  confirmEmail: z.string().trim().max(320).optional(),
});

/** Eski istemci: `?action=export|anonymize` (gövdesiz). */
const LEGACY_ACTIONS: Record<string, DsrCommand> = { export: 'download_export', anonymize: 'erase' };

async function notifySubject(
  row: RequestRow,
  outcome: DsrOutcome,
  reason?: string | null
): Promise<{ ok: boolean }> {
  const mail = await sendDsrEmail(row.email, outcome, {
    requestId: row.id,
    type: row.type,
    createdAt: row.createdAt,
    reason,
  }).catch(() => ({ ok: false as const }));
  return { ok: mail.ok };
}

async function recordNotification(row: RequestRow, outcome: DsrOutcome, delivered: boolean) {
  try {
    await prisma.$transaction((tx) =>
      recordDsrEvent(tx, {
        requestId: row.id,
        type: delivered ? 'notified' : 'notify_failed',
        actorId: null,
        detail: { kind: outcome, channel: 'email' },
      })
    );
  } catch (e) {
    console.warn('[privacy-requests] bildirim kanıtı yazılamadı', e);
  }
}

function jsonDownload(data: unknown, filename: string): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

async function runCommand(
  command: DsrCommand,
  row: RequestRow,
  input: { reason?: string; confirmEmail?: string },
  ctx: { adminId: string; adminEmail: string | null; adminName: string | null; request: NextRequest }
): Promise<unknown> {
  const meta = getAuditRequestMeta(ctx.request);
  const reason = input.reason?.trim() || null;
  const events = await loadEvents(prisma, row.id);
  assertAllowed(row, command, { reason, events });

  switch (command) {
    case 'review': {
      await prisma.$transaction(async (tx) => {
        const res = await tx.dataSubjectRequest.updateMany({
          where: { id: row.id, status: 'received' },
          data: { status: 'in_review' },
        });
        if (res.count === 0) throw new ApiError('CONFLICT', 'Talep bu arada değişti; sayfayı yenileyin.');
        await recordDsrEvent(tx, { requestId: row.id, type: 'in_review', actorId: ctx.adminId, meta });
      });
      return { status: 'in_review', message: 'Talep incelemeye alındı.' };
    }

    case 'note': {
      await prisma.$transaction((tx) =>
        recordDsrEvent(tx, { requestId: row.id, type: 'note', actorId: ctx.adminId, detail: { note: reason }, meta })
      );
      return { message: 'Not eklendi.' };
    }

    case 'reject': {
      await prisma.$transaction(async (tx) => {
        const res = await tx.dataSubjectRequest.updateMany({
          where: { id: row.id, status: { in: [...OPEN_DSR_STATUSES] } },
          data: { status: 'rejected', processedAt: new Date() },
        });
        if (res.count === 0) throw new ApiError('CONFLICT', 'Talep bu arada kapandı; sayfayı yenileyin.');
        await recordDsrEvent(tx, { requestId: row.id, type: 'rejected', actorId: ctx.adminId, detail: { reason }, meta });
      });
      const mail = await notifySubject(row, 'rejected', reason);
      await recordNotification(row, 'rejected', mail.ok);
      return {
        status: 'rejected',
        notified: mail.ok,
        message: mail.ok ? 'Talep reddedildi; gerekçe başvurana e-postayla bildirildi.' : 'Talep reddedildi ancak e-posta gönderilemedi; başvurana başka kanaldan bildirin.',
      };
    }

    case 'reopen': {
      await prisma.$transaction(async (tx) => {
        const res = await tx.dataSubjectRequest.updateMany({
          where: { id: row.id, status: row.status },
          data: { status: 'in_review', processedAt: null },
        });
        if (res.count === 0) throw new ApiError('CONFLICT', 'Talep bu arada değişti; sayfayı yenileyin.');
        await recordDsrEvent(tx, { requestId: row.id, type: 'reopened', actorId: ctx.adminId, detail: { reason }, meta });
      });
      return { status: 'in_review', message: 'Talep yeniden açıldı.' };
    }

    case 'download_export': {
      const data = await exportUserData(row.userId!);
      const digest = exportDigest(data);
      await prisma.$transaction((tx) =>
        recordDsrEvent(tx, {
          requestId: row.id,
          type: 'export_generated',
          actorId: ctx.adminId,
          detail: { digest, counts: data.counts as Record<string, number>, channel: 'admin_download' },
          meta,
        })
      );
      return jsonDownload(data, `kvkk-paket-${row.id}.json`);
    }

    case 'fulfill_access': {
      // Paket gerçekten üretilebiliyor mu (ve içerik özeti) — kanıt bu üretimin özetidir.
      const data = await exportUserData(row.userId!);
      const digest = exportDigest(data);
      await prisma.$transaction(async (tx) => {
        const current = await tx.dataSubjectRequest.findUnique({ where: { id: row.id }, select: { status: true } });
        if (!current || !(OPEN_DSR_STATUSES as readonly string[]).includes(current.status)) {
          throw new ApiError('CONFLICT', 'Talep bu arada kapandı; sayfayı yenileyin.');
        }
        if (current.status === 'received') {
          await tx.dataSubjectRequest.update({ where: { id: row.id }, data: { status: 'in_review' } });
        }
        await recordDsrEvent(tx, {
          requestId: row.id,
          type: 'export_generated',
          actorId: ctx.adminId,
          detail: { digest, counts: data.counts as Record<string, number>, channel: 'account_download' },
          meta,
        });
      });
      const mail = await notifySubject(row, 'access_ready');
      if (!mail.ok) {
        await recordNotification(row, 'access_ready', false);
        return {
          completed: false,
          message:
            'Paket hazırlandı ancak bildirim e-postası gönderilemedi. Başvurana başka kanaldan ulaşıp "Teslimi onayla" ile kapatın.',
        };
      }
      await prisma.$transaction(async (tx) => {
        await recordDsrEvent(tx, {
          requestId: row.id,
          type: 'notified',
          actorId: null,
          detail: { kind: 'access_ready', channel: 'email' },
        });
        await completeDsrIfEvidenced(tx, row.id, ctx.adminId, meta);
      });
      return { completed: true, message: 'Paket hazırlandı, başvurana bildirildi ve talep kapandı.' };
    }

    case 'confirm_delivery': {
      await prisma.$transaction(async (tx) => {
        await recordDsrEvent(tx, {
          requestId: row.id,
          type: 'notified',
          actorId: ctx.adminId,
          detail: { kind: 'access_ready', channel: 'manual', note: reason },
          meta,
        });
        await completeDsrIfEvidenced(tx, row.id, ctx.adminId, meta);
      });
      return { completed: true, message: 'Teslim kaydedildi ve talep kapandı.' };
    }

    case 'erase': {
      if ((input.confirmEmail ?? '').toLowerCase() !== row.email.toLowerCase()) {
        throw new ApiError('CONFIRMATION_REQUIRED', 'Onay için başvurunun e-posta adresini aynen yazın.', { status: 400 });
      }
      const userId = row.userId!;
      const result = await anonymizeUser(userId, {
        actor: { id: ctx.adminId, email: ctx.adminEmail, name: ctx.adminName, role: 'ADMIN', type: 'user' },
        reason: 'dsr_erasure',
        request: ctx.request,
        withinTx: async (tx, { counts }) => {
          await recordDsrEvent(tx, {
            requestId: row.id,
            type: 'erasure_executed',
            actorId: ctx.adminId,
            detail: { counts },
            meta,
          });
          await completeDsrIfEvidenced(tx, row.id, ctx.adminId, meta);
        },
      });
      if (result.alreadyAnonymized) {
        // Hesap daha önce (ör. self-servis) anonimleşmiş: çevre envanteri yine de idempotent
        // biçimde temizlenir ve bu talebin kanıtı yazılır.
        const purge = await prisma.$transaction(async (tx) => {
          const p = await purgeRegistryPersonalData(tx, userId);
          await recordDsrEvent(tx, {
            requestId: row.id,
            type: 'erasure_executed',
            actorId: ctx.adminId,
            detail: { counts: p.counts, alreadyAnonymized: true },
            meta,
          });
          await completeDsrIfEvidenced(tx, row.id, ctx.adminId, meta);
          return p;
        });
        await deletePersonalObjects(purge.objectUrls);
      }
      const mail = await notifySubject(row, 'erased');
      await recordNotification(row, 'erased', mail.ok);
      return {
        completed: true,
        alreadyAnonymized: result.alreadyAnonymized,
        counts: result.counts,
        message: 'Veriler silindi / anonimleştirildi ve talep kanıtıyla kapandı.',
      };
    }

    case 'rectify':
    case 'resolve_objection': {
      const eventType: DsrEventType = command === 'rectify' ? 'rectified' : 'objection_resolved';
      await prisma.$transaction(async (tx) => {
        await recordDsrEvent(tx, { requestId: row.id, type: eventType, actorId: ctx.adminId, detail: { summary: reason }, meta });
        await completeDsrIfEvidenced(tx, row.id, ctx.adminId, meta);
      });
      const outcome: DsrOutcome = command === 'rectify' ? 'rectified' : 'objection_resolved';
      const mail = await notifySubject(row, outcome, reason);
      await recordNotification(row, outcome, mail.ok);
      return { completed: true, notified: mail.ok, message: 'Talep sonuçlandırıldı ve başvurana bildirildi.' };
    }
  }
  throw new ApiError('BAD_REQUEST', 'Bilinmeyen işlem.');
}

function mapEvidenceError(e: unknown): never {
  if (e instanceof DsrEvidenceError) {
    throw new ApiError('NO_EVIDENCE', 'Tamamlamak için yürütme kanıtı eksik.', {
      status: 409,
      details: { missing: e.missing },
    });
  }
  if (e instanceof Error && e.message === 'USER_NOT_FOUND') {
    throw new ApiError('NOT_FOUND', 'İlişkili kullanıcı bulunamadı.');
  }
  throw e;
}

export const POST = defineRoute(
  { name: 'admin.privacy-requests.command', roles: ['ADMIN'], params: Params, rateLimit: 'mutation' },
  async ({ params, request, session, user }) => {
    const legacy = request.nextUrl.searchParams.get('action');
    let input: z.infer<typeof CommandBody>;
    if (legacy && LEGACY_ACTIONS[legacy]) {
      input = { action: LEGACY_ACTIONS[legacy] };
    } else {
      const raw = await request.json().catch(() => null);
      const parsed = CommandBody.safeParse(raw);
      if (!parsed.success) {
        throw new ApiError('VALIDATION', 'Geçersiz işlem.', {
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      input = parsed.data;
    }
    if (!isDsrCommand(input.action)) throw new ApiError('BAD_REQUEST', 'Bilinmeyen işlem.');

    const row = await loadRequest(params.id);
    try {
      const result = await runCommand(input.action, row, input, {
        adminId: user.id,
        adminEmail: session.user?.email ?? null,
        adminName: session.user?.name ?? null,
        request,
      });
      if (result instanceof Response) return result;
      return ok(result, { legacySpread: true });
    } catch (e) {
      mapEvidenceError(e);
    }
  }
);

// ───────────────────────────── PATCH (eski uyumluluk) ─────────────────────────────

export const PATCH = defineRoute(
  {
    name: 'admin.privacy-requests.patch',
    roles: ['ADMIN'],
    params: Params,
    schema: z.object({ status: z.string(), reason: z.string().trim().max(2000).optional() }),
    rateLimit: 'mutation',
  },
  async ({ params, body, request, session, user }) => {
    const row = await loadRequest(params.id);
    const ctx = {
      adminId: user.id,
      adminEmail: session.user?.email ?? null,
      adminName: session.user?.name ?? null,
      request,
    };
    if (body.status === 'completed') {
      throw new ApiError(
        'NO_EVIDENCE',
        'Talep elle "Tamamlandı" yapılamaz. KVKK Talepleri ekranından türüne uygun işlemi yürütün; talep kanıtıyla kendiliğinden kapanır.',
        { status: 409 }
      );
    }
    if (body.status === 'in_review') {
      if (row.status === 'in_review') return ok({ status: 'in_review' }, { legacySpread: true });
      return ok(await runCommand('review', row, {}, ctx), { legacySpread: true });
    }
    if (body.status === 'rejected') {
      return ok(await runCommand('reject', row, { reason: body.reason }, ctx), { legacySpread: true });
    }
    throw new ApiError('VALIDATION', 'Bu durum değişikliği desteklenmiyor.');
  }
);
