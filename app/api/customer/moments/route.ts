/**
 * An Motoru — görülmemiş anlar (spec §1 · API).
 *
 *   GET → { moments: Moment[] }  — yalnız oturumdaki müşterinin `seenAt: null` kayıtları,
 *                                  en eski önce, en fazla 10.
 *
 * Yalnız CUSTOMER rolü; başka kullanıcının anı asla dönmez (where userId = oturum).
 */
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { isMomentKind, MOMENTS_FETCH_LIMIT, type Moment } from '@/lib/moments/types';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'customer.moments.list',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
  },
  async ({ user }) => {
    const rows = await prisma.customerMoment.findMany({
      where: { userId: user.id, seenAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MOMENTS_FETCH_LIMIT,
      select: { id: true, kind: true, payload: true, createdAt: true },
    });

    const moments: Moment[] = [];
    for (const row of rows) {
      if (!isMomentKind(row.kind)) continue;
      if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) continue;
      moments.push({
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
      } as unknown as Moment);
    }

    return ok({ moments }, { legacySpread: true });
  }
);
