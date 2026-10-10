/**
 * Veri sahibinin, sonuçlanan erişim talebinin paketini İNDİRMESİ (P0-34 teslim kanalı).
 * Paket e-postaya eklenmez: yalnız hesap sahibi, oturum açıkken ve talep tamamlandıktan sonra
 * 30 gün içinde indirebilir. Her indirme `export_downloaded` kanıtı (içerik özeti ile) yazar.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute } from '@/lib/http/define-route';
import { exportDigest, exportUserData } from '@/lib/gdpr-core';
import { isAccessDownloadable, recordDsrEvent } from '@/lib/dsr-workflow';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'customer.privacy-request.download',
    roles: ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'],
    params: z.object({ id: z.string().min(1).max(64) }),
    rateLimit: 'sensitive',
  },
  async ({ params, user, request }) => {
    const row = await prisma.dataSubjectRequest.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, type: true, status: true, processedAt: true },
    });
    // Başkasının talebi "yok" gibi görünür (varlık sızdırma yok).
    if (!row || row.userId !== user.id) throw new ApiError('NOT_FOUND', 'Başvuru bulunamadı.');
    if (!isAccessDownloadable(row)) {
      throw new ApiError('CONFLICT', 'Bu başvurunun veri paketi indirilebilir durumda değil.');
    }

    const data = await exportUserData(user.id);
    const digest = exportDigest(data);
    await prisma.$transaction((tx) =>
      recordDsrEvent(tx, {
        requestId: row.id,
        type: 'export_downloaded',
        actorId: user.id,
        detail: { digest, counts: data.counts as Record<string, number>, channel: 'account_download' },
        meta: getAuditRequestMeta(request),
      })
    );

    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="qratex-verilerim-${day}.json"`,
      },
    });
  }
);
