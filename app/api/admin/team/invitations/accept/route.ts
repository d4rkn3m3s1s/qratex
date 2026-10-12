/**
 * POST /api/admin/team/invitations/accept — davet bağlantısındaki token ile ekibe katıl.
 * Oturum gerekir (bayi/personel rolü servis katmanında reddedilir); oturumdaki e-posta davet e-postasıyla aynı olmalı (lib/team/invitations.ts).
 * Not: `/api/admin/team/*` admin kapısından muaftır (ekip üyeleri müşteri panelinden kullanır).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { acceptTeamInvitation } from '@/lib/team/invitations';
import { TEAM_ROUTE_ROLES } from '@/lib/team/access';

export const dynamic = 'force-dynamic';

const body = z.object({ token: z.string().min(1).max(300) });

export const POST = defineRoute(
  { name: 'team.invitations.accept', roles: TEAM_ROUTE_ROLES, schema: body, rateLimit: 'sensitive' },
  async ({ user, body, request }) => {
    const result = await acceptTeamInvitation({ token: body.token, userId: user.id, audit: getAuditRequestMeta(request) });
    return ok({ accepted: true, ...result }, { legacySpread: true });
  }
);
