/**
 * GET    /api/admin/team/invitations      — bekleyen (açık) ekip davetleri (ekip yöneticisi).
 * DELETE /api/admin/team/invitations?id=  — daveti iptal et (tek kullanımlık bağlantı ölür).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';
import { listOpenInvitations, revokeTeamInvitation } from '@/lib/team/invitations';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'team.invitations.list', roles: TEAM_ROUTE_ROLES, rateLimit: 'read' },
  async ({ user }) => {
    await requireTeamViewer(user.id, { manager: true });
    return ok({ invitations: await listOpenInvitations() }, { legacySpread: true });
  }
);

const deleteQuery = z.object({ id: z.string().min(1).max(60) });

export const DELETE = defineRoute(
  { name: 'team.invitations.revoke', roles: TEAM_ROUTE_ROLES, query: deleteQuery, rateLimit: 'mutation' },
  async ({ user, query, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    await revokeTeamInvitation({ id: query.id, actorId: viewer.userId, actorIsAdmin: viewer.isAdmin, audit: getAuditRequestMeta(request) });
    return ok({ revoked: true }, { legacySpread: true });
  }
);
