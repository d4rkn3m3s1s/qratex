/** GET /api/admin/changelog/search — Değişiklik Günlüğü tam metin arama dizini (yalnız ADMIN; public/ altında DEĞİL). */
import { promises as fs } from 'fs';
import path from 'path';
import { defineRoute } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.changelog.search', roles: ['ADMIN'], rateLimit: 'read' }, async () => {
  let body = '{}';
  try {
    body = await fs.readFile(path.join(process.cwd(), 'lib', 'changelog', 'search.json'), 'utf8');
  } catch {
    // dizin yoksa boş arama — sayfa yine çalışır
  }
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
});
