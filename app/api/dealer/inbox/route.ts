/**
 * GET /api/dealer/inbox — Gelen Kutusu birleşik listesi (QR geri bildirimleri + tüketim
 * yorumları), imleç tabanlı sayfalama, sunucu tarafı filtre ve arama.
 *
 *   ?source=all|qr|consumption  ?status=new|replied|resolved|all  ?rating=1..5
 *   ?sentiment=negative|neutral|positive|pending  ?signal=urgent|churn|trust
 *   ?assigned=me|unassigned  ?range=7|30|90  ?qr=<qrCodeId>  ?q=  ?sort=newest|oldest
 *   ?cursor=  ?limit=1..50
 *
 * Kapsam: DEALER kendi, STAFF aktif bağlı bayi (DB), ADMIN yalnız `?dealerId=` ile salt-okunur.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { INBOX_PAGE_MAX, INBOX_PAGE_SIZE, listInbox } from '@/lib/dealer-inbox/server';
import { normalizeInboxFilters } from '@/lib/dealer-inbox/core';

export const dynamic = 'force-dynamic';

const querySchema = z
  .object({
    source: z.string().max(16).optional(),
    status: z.string().max(16).optional(),
    rating: z.string().max(4).optional(),
    sentiment: z.string().max(16).optional(),
    signal: z.string().max(16).optional(),
    assigned: z.string().max(16).optional(),
    range: z.string().max(4).optional(),
    qr: z.string().max(64).optional(),
    q: z.string().max(200).optional(),
    sort: z.string().max(16).optional(),
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(INBOX_PAGE_MAX).optional(),
    dealerId: z.string().max(191).optional(),
  })
  .passthrough();

export const GET = defineRoute(
  {
    name: 'dealer.inbox.list',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: querySchema,
  },
  async ({ query, tenant, user }) => {
    const filters = normalizeInboxFilters(query as Record<string, unknown>);
    return ok(
      await listInbox(tenant.dealerId, user.id, filters, {
        cursor: query.cursor ?? null,
        limit: query.limit ?? INBOX_PAGE_SIZE,
      })
    );
  }
);
