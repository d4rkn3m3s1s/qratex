/**
 * GET   /api/admin/segments/modules — inovasyon modül anahtarları, davet limitleri, partner webhook
 *       (gizli değer maskeli) + iyimser kilit sürümü.
 * PATCH /api/admin/segments/modules — bölüm bazlı katı zod; sürüm uyuşmazsa 409; AuditLog.
 */
import { defineRoute } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getModules, patchModules } from '@/components/admin/a-segmentler/server/modules';
import { ModulesPatchBody } from '@/components/admin/a-segmentler/server/schemas';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.segments.modules.get', roles: ['ADMIN'], rateLimit: 'read' }, async () => getModules());

export const PATCH = defineRoute(
  { name: 'admin.segments.modules.patch', roles: ['ADMIN'], schema: ModulesPatchBody, rateLimit: 'mutation' },
  async ({ body, user, request }) => {
    const meta = getAuditRequestMeta(request);
    const actor = { id: user.id, role: user.role, ...meta };
    if (body.section === 'features') return patchModules({ section: 'features', features: body.features }, body.version, actor);
    if (body.section === 'referral') return patchModules({ section: 'referral', referral: body.referral }, body.version, actor);
    return patchModules({ section: 'partnerDigest', partnerDigest: body.partnerDigest }, body.version, actor);
  }
);
