/**
 * GET /api/admin/playbooks — playbook kütüphanesi + gerçek benimseme sayıları + güncel eşleşen bayiler.
 * (`?id=` ölü ucu kaldırıldı — denetim envanter #37.)
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getPlaybookLibrary } from '@/components/admin/a-bayi-sagligi/server/playbooks';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.playbooks.library', roles: ['ADMIN'], rateLimit: 'read' }, async () =>
  ok(await getPlaybookLibrary())
);
