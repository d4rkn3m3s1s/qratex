/** GET /api/admin/integrations/overview — Entegrasyon Merkezi KPI'ları (gerçek veri, GET'te LLM yok). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getOverview } from '@/lib/integrations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.integrations.overview', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getOverview()));
