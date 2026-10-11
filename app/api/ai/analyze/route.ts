/**
 * EMEKLİ UÇ (ai-ozellikleri, Dalga 3). Eski `/dealer/ai-insights` + `/admin/ai-dashboard` istemcisinin çok eylemli ucuydu (analyze, bulk_analyze, theme_clusters, insights, ask, chat, get/update_settings, usage_stats). Kapanan açıklar: `update_settings` gövdeyi şemasız yazıyordu (`customPrompt` 1000 karakter + enjeksiyon kuralını dolanıyordu), `bulk_analyze` bayi AI politikasını ve kiracı bütçesini atlıyordu, `insights` LLM'e NPS/CSAT/CES/korelasyon uyduruyordu, `usage_stats` sunucusuz örnekte anlamsız bellek içi kayıttan okuyordu.
 *
 * Hiçbir ekran bu ucu çağırmıyordu; yaşaması yalnız denetimsiz bir LLM yüzeyi bırakıyordu
 * (yeni yüzeylerin kotası, modül kapısı, şeması ve "sayıyı kod hesaplar" kuralı burada yoktu).
 * Yerine: analiz `runFeedbackAnalyzePipeline` (Inngest/ai-retry), içgörüler `/api/dealer/insights/*` (kod hesaplar, AI kaynaklı anlatır), soru-cevap `/api/dealer/assistant/chat`, AI ayarları `/api/dealer/settings/ai`, kullanım/sağlık `/api/admin/ai-ops`.
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
