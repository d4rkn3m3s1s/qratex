/** GET /api/admin/jobs — günlük orkestratörün alt işleri: son koşu, sonuç, ardışık hata, geçmiş. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadJobsView } from '@/lib/observability/jobs.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.jobs.list', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await loadJobsView()));
