import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import type { ProductRoadmapPayload } from '@/lib/product-roadmap-types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/product-roadmap — repo içi JSON yol haritası (yalnızca ADMIN).
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const p = path.join(process.cwd(), 'lib', 'data', 'product-roadmap.json');
    const raw = fs.readFileSync(p, 'utf8');
    const payload = JSON.parse(raw) as ProductRoadmapPayload;
    return NextResponse.json({ success: true, ...payload }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Yol haritası dosyası okunamadı. lib/data/product-roadmap.json dosyasını kontrol edin.',
      },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
