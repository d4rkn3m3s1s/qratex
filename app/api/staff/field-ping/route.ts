import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * EMEKLİ (Dalga 2): saha "ping"i analitik tablosuna yazılıyor, kimse okumuyor ve ekip
 * arkadaşlarının kesin koordinatlarını herkese gösteriyordu. Yerine `/api/staff/field-reports`
 * (bayinin gördüğü, durum takipli iş kaydı) geldi.
 */
function gone() {
  return NextResponse.json(
    { success: false, error: 'Bu uç kaldırıldı. /api/staff/field-reports kullanın.', code: 'GONE' },
    { status: 410, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export const GET = gone;
export const POST = gone;
