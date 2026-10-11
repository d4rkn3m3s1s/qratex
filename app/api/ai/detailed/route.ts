/**
 * EMEKLİ UÇ (ai-ozellikleri, Dalga 3). Eski `/admin/ai-detailed` ve `/dealer/ai-insights` istemcisinin ham AI alanı dökümüydü (6.000 kayıtlık toplulaştırma, müşteri adı).
 *
 * Hiçbir ekran bu ucu çağırmıyordu; yaşaması yalnız denetimsiz bir LLM yüzeyi bırakıyordu
 * (yeni yüzeylerin kotası, modül kapısı, şeması ve "sayıyı kod hesaplar" kuralı burada yoktu).
 * Yerine: `/api/admin/ai-ops` (Müşteri sesi: SQL toplamları, sinyalden listeye iniş) ve `/api/dealer/insights/*`.
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
