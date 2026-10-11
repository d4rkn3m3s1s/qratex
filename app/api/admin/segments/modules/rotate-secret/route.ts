/** POST /api/admin/segments/modules/rotate-secret — partner webhook HMAC gizli değerini sunucuda üretir; düz metin YALNIZ bu yanıtta. */
import { defineRoute } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { rotateWebhookSecret } from '@/components/admin/a-segmentler/server/modules';
import { RotateSecretBody } from '@/components/admin/a-segmentler/server/schemas';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.segments.modules.rotate-secret', roles: ['ADMIN'], schema: RotateSecretBody, rateLimit: 'sensitive' },
  async ({ body, user, request }) => {
    const meta = getAuditRequestMeta(request);
    return rotateWebhookSecret(body.version, { id: user.id, role: user.role, ...meta });
  }
);
