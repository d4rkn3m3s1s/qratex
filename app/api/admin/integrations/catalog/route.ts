/**
 * GET /api/admin/integrations/catalog — admin API kataloğu (ADMIN).
 * JSON statik import edilir: paketleyici dosyayı garanti eder, çalışma anında fs yok.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { normalizeCatalog } from '@/lib/integrations/catalog';
import raw from '@/lib/data/admin-api-catalog.json';

export const dynamic = 'force-dynamic';

const payload = normalizeCatalog(raw as { generatedAt?: unknown; routes?: unknown });

export const GET = defineRoute({ name: 'admin.integrations.catalog', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(payload));
