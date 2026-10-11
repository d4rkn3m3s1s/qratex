/**
 * POST /api/admin/playbooks/apply — playbook → bayiye MÜŞTERİ dilinde kampanya taslağı.
 * `dryRun: true` → önizleme (metin, hedef kitle sayımı, mevcut açık taslak). Gerçek uygulama:
 * transaction (kampanya + bayiye bildirim + `playbook.apply` denetimi), aynı açık taslak → 409.
 * Global görev üretimi kaldırıldı (denetim Bulgu 1).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { ApplyBody } from '@/components/admin/a-bayi-sagligi/server/schemas';
import { applyPlaybook, previewApply } from '@/components/admin/a-bayi-sagligi/server/playbooks';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.playbooks.apply', roles: ['ADMIN'], schema: ApplyBody, rateLimit: 'mutation', idempotent: true },
  async ({ body, user, request }) => {
    if (body.dryRun) return ok({ preview: await previewApply(body.playbookId, body.dealerId) });
    const result = await applyPlaybook(body.playbookId, body.dealerId, {
      id: user.id,
      role: user.role,
      ...getAuditRequestMeta(request),
    });
    return ok(result, { status: 201 });
  }
);
