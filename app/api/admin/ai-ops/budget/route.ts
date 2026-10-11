/** GET /api/admin/ai-ops/budget — bugünkü platform/bayi token kullanımı ve tavanlar (muhafızla aynı kaynak). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getBudgetReport } from '@/lib/admin-ai-ops/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.ai_ops.budget', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getBudgetReport(prisma)));
