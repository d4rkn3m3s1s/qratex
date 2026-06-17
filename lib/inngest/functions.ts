/**
 * Inngest tanımları — gövde kodu burada YOK; tüm işler `/api/internal/inngest/*` üzerinden ayrı
 * sunucusuz fonksiyonlarda çalışır. Böylece `/api/inngest` paketi ~sadece `inngest` + fetch kalır
 * (Vercel 250MB unzipped sınırı).
 */
import { inngest } from './client';
import { internalAppBaseUrl, invokeInternalCron } from './internal-http';

export const analyzeFeedbackFn = inngest.createFunction(
  {
    id: 'feedback-analyze',
    retries: 3,
    concurrency: { key: 'event.data.dealerId', limit: 1 },
  },
  { event: 'feedback/created' },
  async ({ event, step }) => {
    const { feedbackId } = event.data;
    return step.run('delegate-feedback-analyze', async () => {
      return invokeInternalCron('/api/internal/inngest/feedback-analyze', { feedbackId });
    });
  }
);

export const outboxProcessFn = inngest.createFunction(
  { id: 'outbox-process', retries: 2 },
  { cron: '*/2 * * * *' },
  async ({ step }) => {
    return step.run('delegate-outbox', () => invokeInternalCron('/api/internal/inngest/outbox-process'));
  }
);

export const syntheticMonitorFn = inngest.createFunction(
  { id: 'synthetic-monitor', retries: 1 },
  { cron: '*/15 * * * *' },
  async () => {
    const baseUrl = internalAppBaseUrl();
    const results: Array<{ name: string; ok: boolean }> = [];
    try {
      const auth = await fetch(`${baseUrl}/api/auth/providers`, { signal: AbortSignal.timeout(10000) });
      results.push({ name: 'auth/providers', ok: auth.status === 200 });
    } catch {
      results.push({ name: 'auth/providers', ok: false });
    }
    try {
      const qr = await fetch(`${baseUrl}/api/qr-codes/public/__synthetic_nonexistent__`, {
        signal: AbortSignal.timeout(10000),
      });
      results.push({ name: 'qr-codes/public', ok: qr.status === 404 });
    } catch {
      results.push({ name: 'qr-codes/public', ok: false });
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      return { ok: false, failed: failed.map((f) => f.name), results };
    }
    return { ok: true, results };
  }
);

export const negativeFeedbackSLAFn = inngest.createFunction(
  { id: 'negative-feedback-sla', retries: 2 },
  { cron: '0 * * * *' },
  async ({ step }) => {
    return step.run('delegate-negative-feedback-sla', () =>
      invokeInternalCron('/api/internal/inngest/negative-feedback-sla')
    );
  }
);

export const churnPlaybookFn = inngest.createFunction(
  { id: 'churn-playbook', retries: 2 },
  { cron: '0 6 * * *' },
  async ({ step }) => {
    return step.run('delegate-churn-playbook', () => invokeInternalCron('/api/internal/inngest/churn-playbook'));
  }
);

export const aiQualitySampleFn = inngest.createFunction(
  { id: 'ai-quality-sample', retries: 2 },
  { cron: '0 3 * * 0' },
  async ({ step }) => {
    return step.run('delegate-ai-quality-sample', () =>
      invokeInternalCron('/api/internal/inngest/ai-quality-sample')
    );
  }
);

export const featureFlagCleanupFn = inngest.createFunction(
  { id: 'feature-flag-cleanup', retries: 2 },
  { cron: '0 * * * *' },
  async ({ step }) => {
    return step.run('delegate-feature-flag-cleanup', () =>
      invokeInternalCron('/api/internal/inngest/feature-flag-cleanup')
    );
  }
);

export const analyticsEventCleanupFn = inngest.createFunction(
  { id: 'analytics-event-cleanup', retries: 2 },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    return step.run('delegate-analytics-event-cleanup', () =>
      invokeInternalCron('/api/internal/inngest/analytics-event-cleanup')
    );
  }
);

export const customerReminderNudgeFn = inngest.createFunction(
  { id: 'customer-reminder-nudges', retries: 1 },
  { cron: '0 */6 * * *' },
  async ({ step }) => {
    return step.run('delegate-customer-reminder-nudges', () =>
      invokeInternalCron('/api/internal/inngest/customer-reminder-nudges')
    );
  }
);

export const partnerDigestWebhookFn = inngest.createFunction(
  { id: 'partner-digest-webhook', retries: 2 },
  { cron: '15 * * * *' },
  async ({ step }) => {
    return step.run('delegate-partner-digest-webhook', () =>
      invokeInternalCron('/api/internal/inngest/partner-digest-webhook')
    );
  }
);

// Süresi dolan klan savaşlarını otomatik bitirir (önceden yalnızca elle kapanıyordu).
export const squadBattlesFinishFn = inngest.createFunction(
  { id: 'squad-battles-finish', retries: 2 },
  { cron: '*/10 * * * *' },
  async ({ step }) => {
    return step.run('delegate-squad-battles-finish', () =>
      invokeInternalCron('/api/internal/inngest/squad-battles-finish')
    );
  }
);
