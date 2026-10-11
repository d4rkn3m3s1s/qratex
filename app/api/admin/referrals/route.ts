import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';

export const dynamic = 'force-dynamic';

/**
 * GET   /api/admin/referrals — davet istatistikleri, son davetler (sayfalı), en çok kullanılan kodlar.
 * PATCH /api/admin/referrals — davet kodunu aktif/pasif yap (denetime yazılır).
 *
 * mimari-api B6: sorgu ve gövde zod ile. Eskiden `?page=abc` → `NaN` → Prisma 500, PATCH gövdesi
 * şemasızdı (`isActive` eksikse kod sessizce PASİFE alınıyordu: `Boolean(undefined)`).
 */
const querySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim().slice(0, 120)),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  sort: z.enum(['newest', 'oldest', 'usage_desc', 'usage_asc']).catch('newest'),
});

const patchSchema = z
  .object({
    referralCodeId: z.string().trim().min(1, 'Kod ID gerekli').max(64),
    isActive: z.boolean({ required_error: 'Durum (isActive) gerekli', invalid_type_error: 'Durum (isActive) true/false olmalı' }),
  })
  .strict();

export const GET = defineRoute(
  { name: 'admin.referrals.list', roles: ['ADMIN'], query: querySchema, rateLimit: 'read' },
  async ({ query }) => {
    const { q, page, pageSize, sort } = query;
    const insensitive = { contains: q, mode: 'insensitive' as const };
    const referralWhere = q
      ? { OR: [{ referralCode: insensitive }, { referrer: { email: insensitive } }, { referred: { email: insensitive } }] }
      : {};
    const referralOrderBy = sort === 'oldest' ? ({ createdAt: 'asc' } as const) : ({ createdAt: 'desc' } as const);
    const topCodesOrderBy = sort === 'usage_asc' ? ({ usageCount: 'asc' } as const) : ({ usageCount: 'desc' } as const);

    const [totals, recent, topCodes, totalCount] = await Promise.all([
      prisma.referral.aggregate({ _count: true, _sum: { pointsEarned: true, bonusGiven: true } }),
      prisma.referral.findMany({
        where: referralWhere,
        orderBy: referralOrderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          referrer: { select: { id: true, name: true, email: true } },
          referred: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.referralCode.findMany({
        orderBy: topCodesOrderBy,
        take: 20,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.referral.count({ where: referralWhere }),
    ]);

    return ok(
      {
        stats: {
          totalReferrals: totals._count,
          totalReferrerPoints: totals._sum.pointsEarned || 0,
          totalReferredBonus: totals._sum.bonusGiven || 0,
        },
        recent,
        topCodes,
        pagination: { page, pageSize, total: totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) },
      },
      { legacySpread: true }
    );
  }
);

export const PATCH = defineRoute(
  { name: 'admin.referrals.toggle', roles: ['ADMIN'], schema: patchSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => {
    const code = await prisma.$transaction(async (tx) => {
      const before = await tx.referralCode.findUnique({ where: { id: body.referralCodeId }, select: { isActive: true } });
      const updated = await tx.referralCode.update({
        where: { id: body.referralCodeId },
        data: { isActive: body.isActive },
        select: { id: true, code: true, isActive: true },
      });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: body.isActive ? 'REFERRAL_CODE_ACTIVATED' : 'REFERRAL_CODE_DEACTIVATED',
            entity: 'ReferralCode',
            entityId: updated.id,
            oldData: before ? { isActive: before.isActive } : null,
            newData: { isActive: updated.isActive },
          },
          request
        ),
      });
      return updated;
    });
    return ok({ code }, { legacySpread: true });
  }
);
