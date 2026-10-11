/** GET /api/admin/ai/studio/prompts — temel promptlar (salt okunur) + sürümlü yönetici notları. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getPromptsState } from '@/lib/ai-studio/prompts.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.ai-studio.prompts', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getPromptsState()));
