/** GET /api/admin/changelog/weeks/[week] — Değişiklik Günlüğü hafta ayrıntısı (yalnız ADMIN; public/ altında DEĞİL). */
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { ApiError, defineRoute } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

const params = z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/) });

export const GET = defineRoute(
  { name: 'admin.changelog.week', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params }) => {
    const file = path.join(process.cwd(), 'lib', 'changelog', 'weeks', `${params.week}.json`);
    let body: string;
    try {
      body = await fs.readFile(file, 'utf8');
    } catch {
      throw new ApiError('NOT_FOUND', 'Hafta bulunamadı.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return new Response(body, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  }
);
