import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import type { AdminApiCatalogPayload } from '@/lib/admin-api-catalog-types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/api-catalog — repo içi üretilmiş admin route kataloğu (yalnızca ADMIN).
 * Dosya: lib/data/admin-api-catalog.json (`npm run catalog:admin-api`).
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const p = path.join(process.cwd(), 'lib', 'data', 'admin-api-catalog.json');
    const raw = fs.readFileSync(p, 'utf8');
    const catalog = JSON.parse(raw) as AdminApiCatalogPayload;
    return NextResponse.json({ success: true, ...catalog }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Katalog dosyası yok veya okunamadı. Geliştirici makinesinde: npm run catalog:admin-api',
      },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
