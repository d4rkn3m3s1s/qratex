/** GET /api/admin/audit/summary — son 24 saat / kritik / 7 gün / toplam / silinmiş aktör / en eski kayıt. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getSummary } from '@/lib/admin-audit/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.audit.summary', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getSummary(prisma)));
