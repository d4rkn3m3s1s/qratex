/**
 * Self-servis "Verilerimi indir" (KVKK m.11 erişim hakkı) — P0-34.
 *
 * Eskiden ayarlar ekranı ayrı bir uçtan, kuyruğa ve denetime hiç düşmeden, daha dar bir
 * kapsamla indiriyordu. Şimdi her indirme bir `access` başvurusu olarak kaydedilir ve
 * kanıtıyla (`received` → `export_generated` → `export_downloaded` → `completed`) AYNI
 * transaction'da kapanır; paket PII_REGISTRY'nin tam kapsamıdır. Kanıt yazılamazsa paket
 * verilmez. Kullanıcı başına 24 saatte en fazla 3 indirme.
 */
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { exportDigest, exportUserData } from '@/lib/gdpr-core';
import { completeDsrIfEvidenced, computeDueAt, recordDsrEvent } from '@/lib/dsr-workflow';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

export const POST = defineRoute(
  {
    name: 'customer.privacy-request.self-export',
    roles: ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'],
    rateLimit: { max: 3, windowMs: DAY_MS, by: 'user' },
  },
  async ({ user, request }) => {
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, anonymizedAt: true },
    });
    if (!account || account.anonymizedAt) throw new ApiError('NOT_FOUND', 'Hesap bulunamadı.');

    const data = await exportUserData(user.id);
    const digest = exportDigest(data);
    const counts = data.counts as Record<string, number>;
    const meta = getAuditRequestMeta(request);

    const requestId = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const row = await tx.dataSubjectRequest.create({
        data: {
          userId: user.id,
          email: account.email,
          type: 'access',
          status: 'in_review',
          message: null,
          dueAt: computeDueAt(now),
        },
        select: { id: true },
      });
      await recordDsrEvent(tx, { requestId: row.id, type: 'received', actorId: user.id, detail: { channel: 'self_service' }, meta });
      await recordDsrEvent(tx, { requestId: row.id, type: 'export_generated', actorId: user.id, detail: { digest, counts }, meta });
      await recordDsrEvent(tx, {
        requestId: row.id,
        type: 'export_downloaded',
        actorId: user.id,
        detail: { digest, channel: 'self_service_download' },
        meta,
      });
      await completeDsrIfEvidenced(tx, row.id, user.id, meta);
      return row.id;
    });

    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="qratex-verilerim-${day}.json"`,
        'x-dsr-request-id': requestId,
      },
    });
  }
);
