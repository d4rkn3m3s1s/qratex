/** GET /api/admin/ai/studio/overview — Prompt ve Model Stüdyosu KPI'ları (platform geneli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getStudioOverview } from '@/lib/ai-studio/overview.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.ai-studio.overview', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getStudioOverview()));
