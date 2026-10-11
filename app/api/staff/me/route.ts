import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * EMEKLİ (Dalga 2): personel ekranı tek BFF'e taşındı → `GET /api/staff/today`.
 * Eski uç PIN'i açık metin döndürüyor ve görevleri yanlış sıralıyordu; 410 ile kapatıldı.
 */
export function GET() {
  return NextResponse.json(
    { success: false, error: 'Bu uç kaldırıldı. /api/staff/today kullanın.', code: 'GONE' },
    { status: 410, headers: PRIVATE_NO_STORE_HEADERS }
  );
}
