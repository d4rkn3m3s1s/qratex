/**
 * EMEKLİ UÇ (a-ayarlar-kapi, Dalga 2). Yalnız eski /admin/settings istemcisi kullanıyordu.
 *  - audit      → GET /api/admin/platform-settings/history (gizli değer döndürmez, sayfalı)
 *  - modules    → PATCH /api/admin/feature-control/modules/:key (tek kaynak, gerekçeli)
 *  - visibility → /api/admin/platform-settings/access (sürüm kontrollü)
 * Eski uç gizli anahtarları ham döndürüyor / sürüm kontrolsüz yazıyordu; 410 ile kapatıldı.
 */
import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

function gone() {
  return NextResponse.json(
    { success: false, code: 'GONE', error: 'Bu uç kaldırıldı. Ayarlar ekranının güncel sürümünü kullanın.' },
    { status: 410, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export const GET = gone;
export const PUT = gone;
export const POST = gone;
