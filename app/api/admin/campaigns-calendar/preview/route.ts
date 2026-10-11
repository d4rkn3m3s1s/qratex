/** POST { kind, data, excludeId? } — taslağın çakışmaları + gerçek defterle etki tahmini. Salt okunur. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { previewBody } from '@/lib/campaigns-calendar/contract';
import { previewDraft } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.campaigns-calendar.preview', roles: ['ADMIN'], schema: previewBody, rateLimit: 'read' },
  async ({ body }) => ok(await previewDraft(body.kind, body.data, body.excludeId ?? null))
);
