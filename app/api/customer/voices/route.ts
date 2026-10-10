/**
 * GET /api/customer/voices — Seslerim birleşik zaman çizelgesi (QR geri bildirimleri +
 * tüketim yorumları), imleç tabanlı sayfalama.
 *
 *   ?type=all|qr|review  ?status=all|replied|awaiting|remedy|low  ?q=  ?cursor=  ?limit=1..50
 *
 * Sunucu birleştirir (istemcide iki listeyi join etmek yok), kapsam oturumdaki müşteridir.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { listVoices } from '@/lib/customer-voices/server';
import {
  VOICE_PAGE_MAX,
  VOICE_PAGE_SIZE,
  normalizeVoiceQuery,
  normalizeVoiceStatusFilter,
  normalizeVoiceTypeFilter,
} from '@/lib/customer-voices/core';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  type: z.string().max(16).optional(),
  status: z.string().max(16).optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(VOICE_PAGE_MAX).optional(),
});

export const GET = defineRoute(
  { name: 'customer.voices.list', roles: ['CUSTOMER'], rateLimit: 'read', query: querySchema },
  async ({ query, user }) => {
    const page = await listVoices(user.id, {
      type: normalizeVoiceTypeFilter(query.type),
      status: normalizeVoiceStatusFilter(query.status),
      q: normalizeVoiceQuery(query.q),
      cursor: query.cursor ?? null,
      limit: query.limit ?? VOICE_PAGE_SIZE,
    });
    return ok(page);
  }
);
