/**
 * EMEKLİ UÇ (ai-ozellikleri, Dalga 3). Eski `/customer/ai-insights` sohbet sekmesinin ucuydu; müşteriye işletme danışmanı personasıyla (askAI, bayi promptu) konuşuyordu.
 *
 * Hiçbir ekran bu ucu çağırmıyordu; yaşaması yalnız denetimsiz bir LLM yüzeyi bırakıyordu
 * (yeni yüzeylerin kotası, modül kapısı, şeması ve "sayıyı kod hesaplar" kuralı burada yoktu).
 * Yerine: müşteri ürün yardımı `/api/chat` (QRA, kapsamı daraltılmış, günlük tavanlı); kendi deneyim özeti `/customer/me/voices` (gerçek toplamlar, AI yok).
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
