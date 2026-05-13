import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runFeedbackAnalyzePipeline } from '@/lib/inngest/feedback-analyze-pipeline';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Uzun AI analizi + embedding */
export const maxDuration = 300;

/**
 * Inngest `feedback/created` işinin ağır kısmı — sadece Bearer ile (CRON veya özel secret).
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const feedbackId =
    typeof body === 'object' &&
    body !== null &&
    'feedbackId' in body &&
    typeof (body as { feedbackId: unknown }).feedbackId === 'string'
      ? (body as { feedbackId: string }).feedbackId
      : null;
  if (!feedbackId) {
    return NextResponse.json({ error: 'feedbackId required' }, { status: 400 });
  }

  try {
    const result = await runFeedbackAnalyzePipeline(feedbackId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Pipeline error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
