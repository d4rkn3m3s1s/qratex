/**
 * GET   /api/admin/segments/proposals/[id] — detay: tam mesaj, kitle önizlemesi (gönderimle aynı hesap),
 *       bayinin son 30 günü, karar geçmişi.
 * PATCH /api/admin/segments/proposals/[id] — { decision: APPROVED|REJECTED, note? } koşullu geçiş
 *       (yalnız PENDING; aksi 409), denetim izi + bayiye bildirim. `SENT` kabul edilmez.
 */
import { defineRoute } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { decideProposal, getProposalDetail } from '@/components/admin/a-segmentler/server/proposals';
import { DecideBody, ProposalParams } from '@/components/admin/a-segmentler/server/schemas';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.segments.proposals.detail', roles: ['ADMIN'], params: ProposalParams, rateLimit: 'read' },
  async ({ params }) => getProposalDetail(params.id)
);

export const PATCH = defineRoute(
  { name: 'admin.segments.proposals.decide', roles: ['ADMIN'], params: ProposalParams, schema: DecideBody, rateLimit: 'mutation' },
  async ({ params, body, user, request }) => {
    const meta = getAuditRequestMeta(request);
    return decideProposal(params.id, { decision: body.decision, note: body.note }, { id: user.id, role: user.role, ...meta });
  }
);
