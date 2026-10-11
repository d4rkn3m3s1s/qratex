/** GET /api/admin/ai/studio/learning — sistem öğrenmesi: aktif kurallar, bekleyen öneri + diff, geçmiş (LLM yok). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getLearningState } from '@/lib/ai-studio/learning.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.ai-studio.learning', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getLearningState()));
