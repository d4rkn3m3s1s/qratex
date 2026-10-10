import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { findWritableCell } from '@/lib/customer-settings/notification-catalog';
import { writeNotificationPrefCell, writeReplyEmail } from '@/lib/customer-settings/write.server';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    key: z.string().min(1).max(32),
    channel: z.enum(['app', 'email', 'push']),
    enabled: z.boolean(),
  })
  .strict();

/**
 * PATCH /api/customer/me/settings/notifications — tek tür × kanal hücresi (autosave).
 * Yalnız KATALOGDAKİ (gerçekten uygulanan) hücreler yazılabilir; diğerleri 400
 * `CELL_NOT_SUPPORTED` — kullanıcıya hiçbir şeyi kontrol etmeyen bir anahtar sunulmaz.
 */
export const PATCH = defineRoute(
  { name: 'customer.me.settings.notifications', roles: ['CUSTOMER'], schema: Body, rateLimit: 'mutation' },
  async ({ user, body }) => {
    const member = await prisma.user.findUnique({ where: { id: user.id }, select: { adminTeamRole: true } });
    const row = findWritableCell(body.key, body.channel, !!member?.adminTeamRole);
    if (!row) {
      throw new ApiError('CELL_NOT_SUPPORTED', 'Bu bildirim türü için bu kanal kullanılmıyor.', { status: 400 });
    }
    if (row.storage === 'legacy-reply') {
      await writeReplyEmail(user.id, body.enabled);
    } else {
      await writeNotificationPrefCell(user.id, row.key, body.channel, body.enabled);
    }
    return ok({ key: row.key, channel: body.channel, enabled: body.enabled });
  },
);
