import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runFeedbackAnalyzePipeline } from '@/lib/inngest/feedback-analyze-pipeline';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { parseJsonBody } from '@/lib/http/parse-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Uzun AI analizi + embedding */
export const maxDuration = 300;

const bodySchema = z.object({ feedbackId: z.string().trim().min(1, 'feedbackId gerekli').max(64) });

/**
 * Inngest `feedback/created` işinin ağır kısmı — sadece Bearer ile (CRON veya özel secret).
 * mimari-api B6: gövde zod ile; hata mesajları Türkçe ve iç hata ayrıntısı yanıta sızmaz
 * (Inngest yeniden deneme için yalnız durum koduna bakar, ayrıntı sunucu günlüğünde).
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const parsed = await parseJsonBody(req, bodySchema, { maxBytes: 4_096 });
  if (!parsed.ok) return parsed.response;

  try {
    const result = await runFeedbackAnalyzePipeline(parsed.data.feedbackId);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[internal/feedback-analyze] işlem hattı başarısız:', parsed.data.feedbackId, e);
    return NextResponse.json(
      { ok: false, success: false, code: 'INTERNAL', error: 'Geri bildirim analizi tamamlanamadı.' },
      { status: 500 }
    );
  }
}
