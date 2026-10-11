/**
 * EMEKLİ UÇ (ai-ozellikleri, Dalga 3). Eski `/customer/ai-insights` + `/customer/nearby` "5 kişisel AI önerisi" ucuydu (konuma/yarıçapa bağlı olmayan, her açılışta LLM çağıran süs).
 *
 * Hiçbir ekran bu ucu çağırmıyordu; yaşaması yalnız denetimsiz bir LLM yüzeyi bırakıyordu
 * (yeni yüzeylerin kotası, modül kapısı, şeması ve "sayıyı kod hesaplar" kuralı burada yoktu).
 * Yerine: deterministik öneriler `/api/customer/recommendations` ve keşif ekranları.
 */
import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

function gone() {
  return NextResponse.json(
    { success: false, code: 'GONE', error: 'Bu uç kaldırıldı. Lütfen uygulamanın güncel ekranını kullanın.' },
    { status: 410, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export const GET = gone;
export const POST = gone;
