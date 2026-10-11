/**
 * GET /api/admin/feedbacks/item?key=qr:<id> | consumption:<id> — detay çekmecesi verisi.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { parseFeedKey } from '@/lib/admin-feedbacks/contract';
import { getFeedDetail } from '@/lib/admin-feedbacks/detail.server';

export const dynamic = 'force-dynamic';

const query = z.object({ key: z.string().max(80) });

export const GET = defineRoute(
  { name: 'admin.feedbacks.item', roles: ['ADMIN'], query, rateLimit: 'read' },
  async ({ query }) => {
    const parsed = parseFeedKey(query.key);
    if (!parsed) throw new ApiError('VALIDATION', 'Geçersiz kayıt kimliği.');
    const detail = await getFeedDetail(parsed.source, parsed.id);
    if (!detail) throw new ApiError('NOT_FOUND', 'Geri bildirim bulunamadı.');
    return ok(detail);
  }
);
