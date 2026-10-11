/** GET /api/admin/segments/proposals — onay kuyruğu: durum sekmeleri + sayaçlar, arama, segment/kaynak süzgeci, sayfalama. */
import { defineRoute } from '@/lib/http/define-route';
import { listProposals } from '@/components/admin/a-segmentler/server/proposals';
import { ProposalListQuery } from '@/components/admin/a-segmentler/server/schemas';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.segments.proposals.list', roles: ['ADMIN'], query: ProposalListQuery, rateLimit: 'read' },
  async ({ query }) =>
    listProposals({ status: query.status, q: query.q, segment: query.seg, source: query.source, page: query.page, size: query.size })
);
