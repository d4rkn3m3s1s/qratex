import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import {
  FIELD_REPORT_CATEGORIES,
  FIELD_REPORT_CATEGORY_TR,
  FIELD_REPORT_SOURCE,
  coarseCoordinate,
  fieldReportSeverity,
} from '@/lib/staff-ops/core';
import { toFieldReportDto } from '@/lib/staff-ops/server';
import { notifyDealerFieldReport } from '@/lib/staff-ops/notify';

export const dynamic = 'force-dynamic';

const tenant = { kind: 'dealer', allowRoles: ['STAFF'] } as const;

const mineWhere = (dealerId: string, userId: string) => ({
  dealerId,
  AND: [
    { metadata: { path: ['source'], equals: FIELD_REPORT_SOURCE } },
    { metadata: { path: ['reporterUserId'], equals: userId } },
  ],
});

/** GET /api/staff/field-reports — YALNIZ kendi saha bildirimlerim (koordinat dönmez; yalnız "konum eklendi" bayrağı). */
export const GET = defineRoute(
  { name: 'staff.fieldReports.mine', roles: ['STAFF'], tenant, rateLimit: 'read' },
  async ({ tenant: t, user }) => {
    const rows = await prisma.incident.findMany({
      where: mineWhere(t.dealerId, user.id),
      select: { id: true, status: true, description: true, createdAt: true, resolvedAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return ok({ reports: rows.map((r) => toFieldReportDto(r, { includeLocation: false })) });
  }
);

/**
 * POST /api/staff/field-reports — saha bildirimi. İş kaydı olarak `Incident` (tip `custom`,
 * `metadata.source = staff_field_report`) yazılır: bayi hem /dealer/team "Saha" sekmesinde hem
 * vaka kuyruğunda görür, "görüldü/çözüldü" işaretler. `clientId` ile idempotent (çevrimdışı
 * kuyruk tekrar gönderse de çift kayıt olmaz). Konum isteğe bağlı ve ~100 m'ye yuvarlanır.
 */
export const POST = defineRoute(
  {
    name: 'staff.fieldReports.create',
    roles: ['STAFF'],
    tenant,
    schema: z.object({
      clientId: z.string().regex(/^[A-Za-z0-9:_-]{8,80}$/, 'Geçersiz istemci kimliği.'),
      category: z.enum(FIELD_REPORT_CATEGORIES),
      urgent: z.boolean().default(false),
      note: z.string().trim().max(500).optional(),
      location: z
        .object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          accuracyM: z.number().min(0).max(100_000).optional(),
        })
        .optional(),
    }),
    rateLimit: { max: 10, windowMs: 10 * 60_000, by: 'user' },
  },
  async ({ tenant: t, user, body, session }) => {
    const select = { id: true, status: true, description: true, createdAt: true, resolvedAt: true, metadata: true } as const;
    const dup = await prisma.incident.findFirst({
      where: { dealerId: t.dealerId, metadata: { path: ['clientId'], equals: body.clientId } },
      select,
    });
    if (dup) return ok({ report: toFieldReportDto(dup, { includeLocation: false }), duplicate: true });

    const label = FIELD_REPORT_CATEGORY_TR[body.category];
    const row = await prisma.incident.create({
      data: {
        dealerId: t.dealerId,
        type: 'custom',
        severity: fieldReportSeverity(body.category, body.urgent),
        status: 'open',
        title: `Saha bildirimi · ${label}${body.urgent ? ' (acil)' : ''}`,
        description: body.note || null,
        metadata: {
          source: FIELD_REPORT_SOURCE,
          clientId: body.clientId,
          category: body.category,
          urgent: body.urgent,
          reporterUserId: user.id,
          ...(body.location
            ? {
                location: {
                  lat: coarseCoordinate(body.location.lat),
                  lng: coarseCoordinate(body.location.lng),
                  accuracyM: body.location.accuracyM != null ? Math.round(body.location.accuracyM) : null,
                },
              }
            : {}),
        },
      },
      select,
    });
    await notifyDealerFieldReport(t.dealerId, session.user.name ?? null, body.note ? `${label}: ${body.note}` : label, body.urgent);
    return ok({ report: toFieldReportDto(row, { includeLocation: false }) }, { status: 201 });
  }
);
