/**
 * Send events to Inngest (P2-20).
 * When USE_INNGEST_QUEUE=true, enqueue feedback/created instead of inline AI.
 */
import { inngest } from './client';

/** Not a React hook — name avoids `use*` so ESLint does not treat this as hooks usage in API routes. */
export function inngestQueueEnabled(): boolean {
  return process.env.USE_INNGEST_QUEUE === 'true';
}

export async function sendFeedbackAnalyze(feedbackId: string, dealerId?: string): Promise<void> {
  await inngest.send({
    name: 'feedback/created',
    data: { feedbackId, dealerId: dealerId ?? '' },
  });
}
