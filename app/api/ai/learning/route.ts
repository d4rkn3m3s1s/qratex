/**
 * EMEKLİ UÇ (ai-ozellikleri, Dalga 3). Eski `/dealer/ai-settings` öğrenme sekmesinin ucuydu (profil, düzeltme kaydı, profil yenileme).
 *
 * Hiçbir ekran bu ucu çağırmıyordu; yaşaması yalnız denetimsiz bir LLM yüzeyi bırakıyordu
 * (yeni yüzeylerin kotası, modül kapısı, şeması ve "sayıyı kod hesaplar" kuralı burada yoktu).
 * Yerine: bayi `/api/dealer/settings/ai/retrain` (eşikli, kotalı), yönetici `/api/admin/ai/studio/learning*` (onaylı öneri akışı).
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
