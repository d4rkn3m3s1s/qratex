/** GET /api/admin/segments/[segmentId]/members — sayfalı, aranabilir, sıralanabilir üye listesi. */
import { defineRoute } from '@/lib/http/define-route';
import { getSegmentMembers } from '@/components/admin/a-segmentler/server/segments';
import { MembersQuery, SegmentParams } from '@/components/admin/a-segmentler/server/schemas';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.segments.members', roles: ['ADMIN'], params: SegmentParams, query: MembersQuery, rateLimit: 'read' },
  async ({ params, query }) =>
    getSegmentMembers({ segmentId: params.segmentId, q: query.q, sort: query.sort, page: query.page, size: query.size })
);
