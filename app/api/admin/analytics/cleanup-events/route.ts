import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import {
  deleteAnalyticsEventsOlderThan,
  countAnalyticsEventsOlderThan,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  RETAINED_ANALYTICS_EVENTS,
} from '@/lib/analytics-event-retention';

export const dynamic = 'force-dynamic';

/**
 * GET  — saklama süresi dışında kalan (silinebilir) olay sayısı.
 * POST — saklama süresi dışındaki olayları siler (yalnız ADMIN, denetime yazılır).
 *
 * mimari-api B6/B11: gövde/sorgu zod ile (`olderThanDays` tamsayı, [30, 365]); eskiden şemasız
 * okunuyor ve 1 güne kadar inilebiliyordu. Ekonomi/sahtekârlık olayları (`points_credited` …)
 * hiçbir koşulda silinmez (`RETAINED_ANALYTICS_EVENTS`).
 */
const days = z.coerce
  .number({ invalid_type_error: 'Gün sayısı sayı olmalı.' })
  .int('Gün sayısı tam sayı olmalı.')
  .min(MIN_RETENTION_DAYS, `En az ${MIN_RETENTION_DAYS} gün saklanmalı.`)
  .max(365, 'En fazla 365 gün seçilebilir.');

const querySchema = z.object({ olderThanDays: days.default(DEFAULT_RETENTION_DAYS) });
const bodySchema = z.object({ olderThanDays: days.default(DEFAULT_RETENTION_DAYS) }).strict().default({});

export const GET = defineRoute(
  { name: 'admin.analytics.cleanup-events.count', roles: ['ADMIN'], query: querySchema, rateLimit: 'read' },
  async ({ query }) => {
    const deletableCount = await countAnalyticsEventsOlderThan(query.olderThanDays);
    return ok(
      { olderThanDays: query.olderThanDays, deletableCount, retainedEvents: RETAINED_ANALYTICS_EVENTS },
      { legacySpread: true }
    );
  }
);

export const POST = defineRoute(
  { name: 'admin.analytics.cleanup-events.run', roles: ['ADMIN'], schema: bodySchema, rateLimit: 'sensitive' },
  async ({ body, session, request }) => {
    const deletedCount = await deleteAnalyticsEventsOlderThan(body.olderThanDays);
    await prisma.auditLog.create({
      data: auditEntry(
        actorFromSession(session),
        {
          action: 'ANALYTICS_EVENTS_CLEANUP',
          entity: 'AnalyticsEvent',
          newData: { olderThanDays: body.olderThanDays, deletedCount, retainedEvents: RETAINED_ANALYTICS_EVENTS },
        },
        request
      ),
    });
    return ok({ deletedCount, olderThanDays: body.olderThanDays }, { legacySpread: true });
  }
);
