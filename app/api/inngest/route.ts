/**
 * Inngest serve handler (P2-20).
 * GET/POST/PUT at /api/inngest for Inngest Cloud / Dev Server.
 */
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { analyzeFeedbackFn, outboxProcessFn, featureFlagCleanupFn, analyticsEventCleanupFn, syntheticMonitorFn, negativeFeedbackSLAFn, churnPlaybookFn, aiQualitySampleFn, customerReminderNudgeFn, partnerDigestWebhookFn, squadBattlesFinishFn } from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeFeedbackFn, outboxProcessFn, featureFlagCleanupFn, analyticsEventCleanupFn, syntheticMonitorFn, negativeFeedbackSLAFn, churnPlaybookFn, aiQualitySampleFn, customerReminderNudgeFn, partnerDigestWebhookFn, squadBattlesFinishFn],
});
