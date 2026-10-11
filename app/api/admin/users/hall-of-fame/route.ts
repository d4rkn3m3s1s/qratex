import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';

/**
 * Onur listesi (Hall of Fame) — yalnız yönetici.
 * mimari-api B5: tek route fabrikası (`defineRoute`): zarf v2, şemalı gövde, oran sınırı, merkezi
 * hata yolu (eskiden `createApiRoute` + `jsonOk/jsonError`, oran sınırsız ve denetim kaydı yoktu).
 */

/** Hiçbir handler ham User satırı döndürmemeli — yalnızca bu güvenli alanlar. */
const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  isHallOfFame: true,
} as const;

export const GET = defineRoute(
  { name: 'admin.users.hall-of-fame.list', roles: ['ADMIN'], rateLimit: 'read' },
  async () => {
    const users = await prisma.user.findMany({
      where: { isHallOfFame: true },
      select: { id: true, name: true, email: true, level: true, xp: true, biography: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    return ok({ users }, { legacySpread: true });
  }
);

const patchSchema = z.object({
  userId: z.string().trim().min(1).max(191),
  isHallOfFame: z.boolean(),
});

export const PATCH = defineRoute(
  { name: 'admin.users.hall-of-fame.update', roles: ['ADMIN'], schema: patchSchema, rateLimit: 'mutation' },
  async ({ body, user, request }) => {
    // Açık select: ham User satırı (password hash, twoFactorSecret, stripe*, fraud/trust
    // internals) ASLA yanıta sızmamalı. Kayıt yoksa P2025 → merkezi 404.
    const updated = await prisma.user.update({
      where: { id: body.userId },
      data: { isHallOfFame: body.isHallOfFame },
      select: PUBLIC_USER_SELECT,
    });
    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: body.isHallOfFame ? 'HALL_OF_FAME_ADD' : 'HALL_OF_FAME_REMOVE',
          entity: 'User',
          entityId: updated.id,
          ...getAuditRequestMeta(request),
        },
      })
      .catch((e) => console.warn('[hall-of-fame] denetim kaydı yazılamadı:', e));
    return ok({ user: updated }, { legacySpread: true });
  }
);
