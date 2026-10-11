import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { reportSuspiciousActivity } from '@/lib/security';
import { PRIVATE_NO_STORE_HEADERS, paginationSkip } from '@/lib/api-http';
import { requireCronSecretOrAdmin } from '@/lib/internal-cron-or-admin';
import { defineRoute, ok } from '@/lib/http/define-route';
import { parseJsonBody } from '@/lib/http/parse-body';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getClientIp } from '@/lib/request-metadata';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';

export const dynamic = 'force-dynamic';

/**
 * Şüpheli etkinlik kayıtları.
 *  - GET   (ADMIN): sayfalı liste + özet.
 *  - POST  (iç iş / ADMIN): kayıt bildir.
 *  - PATCH (ADMIN): çözüldü olarak işaretle (denetime yazılır).
 *
 * mimari-api B5/B6: sorgu ve gövdeler zod ile (eskiden POST gövdesi doğrulanmadan `type`,
 * `severity`, `metadata` olarak yazılıyor, PATCH'te eksik `id` Prisma 500'üne düşüyordu); hata
 * mesajları Türkçe zarf v2.
 */
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const listQuery = z.object({
  severity: z.enum(SEVERITIES).optional().catch(undefined),
  resolved: z.enum(['true', 'false']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(20),
});

const reportBody = z.object({
  userId: z.string().trim().min(1).max(64).optional(),
  dealerId: z.string().trim().min(1).max(64).optional(),
  cardId: z.string().trim().min(1).max(64).optional(),
  type: z.string().trim().min(1, 'Tür gerekli').max(64),
  severity: z.enum(SEVERITIES).default('MEDIUM'),
  description: z.string().trim().min(1, 'Açıklama gerekli').max(2_000),
  metadata: z.record(z.unknown()).optional(),
  ipAddress: z.string().trim().max(64).optional(),
  userAgent: z.string().trim().max(512).optional(),
});

const resolveBody = z.object({
  id: z.string().trim().min(1, 'Kayıt kimliği gerekli').max(64),
  resolution: z.string().trim().max(2_000).optional(),
});

export const GET = defineRoute(
  { name: 'security.suspicious.list', roles: ['ADMIN'], query: listQuery, rateLimit: 'read' },
  async ({ query }) => {
    const where: { severity?: string; isResolved?: boolean } = {};
    if (query.severity) where.severity = query.severity;
    if (query.resolved) where.isResolved = query.resolved === 'true';
    const skip = paginationSkip(query.page, query.limit);

    const [activities, total, stats] = await Promise.all([
      prisma.suspiciousActivity.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          dealer: { select: { id: true, name: true, businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      prisma.suspiciousActivity.count({ where }),
      prisma.suspiciousActivity.groupBy({ by: ['severity', 'isResolved'], _count: true }),
    ]);

    return ok(
      {
        activities,
        pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        stats,
      },
      { legacySpread: true }
    );
  }
);

// İç iş (cron sırrı) ya da ADMIN: defineRoute'un rol modeline sığmadığı için elle.
export async function POST(req: NextRequest) {
  const denied = await requireCronSecretOrAdmin(req);
  if (denied) return denied;
  // Kötüye kullanım tavanı (iç iş tek IP'den gelir; yönetici de IP ile sayılır).
  const limited = await enforceRouteRateLimit('security.suspicious.report', getClientIp(req) ?? 'unknown', 'mutation');
  if (limited) return limited;
  const parsed = await parseJsonBody(req, reportBody, { maxBytes: 32_000 });
  if (!parsed.ok) return parsed.response;
  try {
    const activity = await reportSuspiciousActivity(parsed.data);
    return NextResponse.json({ ok: true, success: true, activity }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Şüpheli etkinlik kaydedilemedi:', error);
    return NextResponse.json(
      { ok: false, success: false, code: 'INTERNAL', error: 'Şüpheli etkinlik kaydedilemedi.' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export const PATCH = defineRoute(
  { name: 'security.suspicious.resolve', roles: ['ADMIN'], schema: resolveBody, rateLimit: 'mutation' },
  async ({ body, session, request }) => {
    const activity = await prisma.$transaction(async (tx) => {
      const updated = await tx.suspiciousActivity.update({
        where: { id: body.id },
        data: { isResolved: true, resolvedBy: session.user.id, resolvedAt: new Date(), resolution: body.resolution },
      });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: 'SUSPICIOUS_ACTIVITY_RESOLVED',
            entity: 'SuspiciousActivity',
            entityId: updated.id,
            newData: { resolution: body.resolution ?? null },
          },
          request
        ),
      });
      return updated;
    });
    return ok({ activity }, { legacySpread: true });
  }
);
