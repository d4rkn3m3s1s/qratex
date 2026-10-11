/**
 * GÜNLÜK İŞ KAYIT DEFTERİ — bütün periyodik işlerin TEK listesi (P0-40).
 *
 * Eskiden iki zamanlayıcı dünyası vardı: burada 7 iş, Inngest'te ~19 periyodik cron (~1.100
 * tetikleme/gün; 2 dakikalık outbox yoklaması Neon'u hiç uyutmuyordu). Inngest'teki periyodik
 * işler buraya taşındı ve Inngest'te yalnız olay tetiklemeli `feedback/created` kaldı.
 *
 * Yeni periyodik iş eklerken: ayrı bir dış tetikleyici KURMA, bu listeye ekle.
 *
 * Kaldırılan (bilerek taşınmayan) Inngest cron'ları:
 *  - outbox-process (*\/2): `createOutboxEvent` hiçbir yerde çağrılmıyor; boş tabloyu yokluyordu.
 *  - synthetic-monitor (*\/15): yerine dead-man heartbeat (`CRON_HEARTBEAT_URL`) + Sentry check-in.
 *  - rate-limit-cleanup (saatlik): `cleanup-counters` ile aynı iş (kilit korumalı olan o).
 *  - squad-battles-finish (*\/10): `squad-battles` ile aynı iş (claim'li, idempotent).
 */
import { NextRequest } from 'next/server';
import type { CronJobContext, CronJobDefinition } from '@/lib/cron-runner';
import { cronAuthHeader } from '@/lib/cron-auth';
import { CRON_DEADLINE_HEADER } from '@/lib/cron-delivery';
import { internalJobAuthHeaders } from '@/lib/inngest/internal-http';

import { GET as squadBattles } from '@/app/api/cron/squad-battles/route';
import { GET as cleanupCounters } from '@/app/api/cron/cleanup-counters/route';
import { GET as dbCleanup } from '@/app/api/cron/db-cleanup/route';
import { GET as internDeadline } from '@/app/api/cron/intern-deadline/route';
import { GET as teamTaskDue } from '@/app/api/cron/team-task-due/route';
import { GET as inboxSync } from '@/app/api/cron/inbox-sync/route';
import { GET as aiRetry } from '@/app/api/cron/ai-retry/route';
import { GET as inboxQueues } from '@/app/api/cron/inbox-queues/route';
import { GET as campaignDispatch } from '@/app/api/cron/campaign-dispatch/route';

import { POST as analyticsEventCleanup } from '@/app/api/internal/inngest/analytics-event-cleanup/route';
import { POST as featureFlagCleanup } from '@/app/api/internal/inngest/feature-flag-cleanup/route';
import { POST as dealerFlashOfferExpiry } from '@/app/api/internal/inngest/dealer-flash-offer-expiry/route';
import { POST as seasonalConceptActivation } from '@/app/api/internal/inngest/seasonal-concept-activation/route';
import { POST as teamDailyMaintenance } from '@/app/api/internal/inngest/team-daily-maintenance/route';
import { POST as negativeFeedbackSla } from '@/app/api/internal/inngest/negative-feedback-sla/route';
import { POST as calculateClv } from '@/app/api/internal/inngest/calculate-clv/route';
import { POST as churnIntervention } from '@/app/api/internal/inngest/churn-intervention/route';
import { POST as churnPlaybook } from '@/app/api/internal/inngest/churn-playbook/route';
import { POST as businessOfMonth } from '@/app/api/internal/inngest/business-of-month/route';
import { POST as aiQualitySample } from '@/app/api/internal/inngest/ai-quality-sample/route';
import { POST as customerReminderNudges } from '@/app/api/internal/inngest/customer-reminder-nudges/route';
import { POST as teamWeeklyReminder } from '@/app/api/internal/inngest/team-weekly-reminder/route';
import { POST as weeklyDigest } from '@/app/api/internal/inngest/weekly-digest/route';
import { POST as partnerDigestWebhook } from '@/app/api/internal/inngest/partner-digest-webhook/route';


type CronGet = (req: Request) => Promise<Response>;
type InternalPost = (req: NextRequest) => Promise<Response>;

/** `app/api/cron/*` GET işleyicisi: CRON_SECRET bearer'ı ile yetkili sentetik istek. */
function viaCronGet(handler: CronGet) {
  return (ctx: CronJobContext) =>
    handler(
      new Request('https://internal/cron', {
        headers: { authorization: cronAuthHeader(), [CRON_DEADLINE_HEADER]: String(ctx.jobDeadlineAt) },
      })
    );
}

/** `app/api/internal/inngest/*` POST işleyicisi: iç iş sırrıyla yetkili sentetik istek. */
function viaInternalPost(handler: InternalPost) {
  return (ctx: CronJobContext) =>
    handler(
      new NextRequest('https://internal/cron', {
        method: 'POST',
        headers: { ...internalJobAuthHeaders(), [CRON_DEADLINE_HEADER]: String(ctx.jobDeadlineAt) },
        body: '{}',
      })
    );
}

const DAILY = { kind: 'daily' } as const;
const MONDAY = { kind: 'weekly', weekday: 1 } as const;
const SUNDAY = { kind: 'weekly', weekday: 0 } as const;
const FIRST_OF_MONTH = { kind: 'monthly', day: 1 } as const;

/**
 * Öncelik: 0 ekonomi kapanışları · 1 temizlik/saklama · 2 üretim · 3 teslimat (mail) · 4 AI.
 * Ağır günlerde bütçe biterse sondakiler `skipped_budget` olur ve ertesi gün telafi edilir
 * (koşu non-2xx döner → alarm).
 */
export const DAILY_JOBS: CronJobDefinition[] = [
  // ── 0 · Ekonomi ─────────────────────────────────────────────
  { name: 'squad-battles', priority: 0, cadence: DAILY, timeoutMs: 25_000, run: viaCronGet(squadBattles) },

  // ── 1 · Temizlik / saklama ───────────────────────────────────
  { name: 'cleanup-counters', priority: 1, cadence: DAILY, timeoutMs: 10_000, run: viaCronGet(cleanupCounters) },
  { name: 'db-cleanup', priority: 1, cadence: DAILY, timeoutMs: 15_000, run: viaCronGet(dbCleanup) },
  { name: 'analytics-event-cleanup', priority: 1, cadence: DAILY, timeoutMs: 30_000, run: viaInternalPost(analyticsEventCleanup) },
  { name: 'feature-flag-cleanup', priority: 1, cadence: DAILY, timeoutMs: 5_000, run: viaInternalPost(featureFlagCleanup) },
  { name: 'dealer-flash-offer-expiry', priority: 1, cadence: DAILY, timeoutMs: 5_000, run: viaInternalPost(dealerFlashOfferExpiry) },
  { name: 'seasonal-concept-activation', priority: 1, cadence: DAILY, timeoutMs: 10_000, run: viaInternalPost(seasonalConceptActivation) },

  // ── 2 · Üretim (görev, CLV, churn, rozet) ────────────────────
  { name: 'team-daily-maintenance', priority: 2, cadence: DAILY, timeoutMs: 30_000, run: viaInternalPost(teamDailyMaintenance) },
  { name: 'negative-feedback-sla', priority: 2, cadence: DAILY, timeoutMs: 20_000, run: viaInternalPost(negativeFeedbackSla) },
  // SLA vakalarından SONRA: yanıtlanmış yorumun vakasını kapatır; radar + telafi süresi + onay hatırlatması.
  { name: 'inbox-queues', priority: 2, cadence: DAILY, timeoutMs: 45_000, run: viaCronGet(inboxQueues) },
  { name: 'calculate-clv', priority: 2, cadence: DAILY, timeoutMs: 45_000, run: viaInternalPost(calculateClv) },
  // CLV'den SONRA (riskli müşteri tespiti güncel CLV'yi okur).
  { name: 'churn-intervention', priority: 2, cadence: DAILY, timeoutMs: 30_000, run: viaInternalPost(churnIntervention) },
  { name: 'churn-playbook', priority: 2, cadence: DAILY, timeoutMs: 20_000, run: viaInternalPost(churnPlaybook) },
  { name: 'business-of-month', priority: 2, cadence: FIRST_OF_MONTH, timeoutMs: 20_000, run: viaInternalPost(businessOfMonth) },
  { name: 'ai-quality-sample', priority: 2, cadence: SUNDAY, timeoutMs: 10_000, run: viaInternalPost(aiQualitySample) },

  // ── 3 · Teslimat (mail / webhook / gelen kutusu) ─────────────
  // Planlı bayi kampanyaları (gün hassasiyeti; bkz. components/dealer/b-kampanyalar/server/schedule.ts) —
  // teslimatın başında: bütçe biterse gecikmesin, müşteriye planlanan sabah ulaşsın.
  { name: 'campaign-dispatch', priority: 3, cadence: DAILY, timeoutMs: 45_000, run: viaCronGet(campaignDispatch) },
  { name: 'intern-deadline', priority: 3, cadence: DAILY, timeoutMs: 30_000, run: viaCronGet(internDeadline) },
  { name: 'team-task-due', priority: 3, cadence: DAILY, timeoutMs: 40_000, run: viaCronGet(teamTaskDue) },
  { name: 'inbox-sync', priority: 3, cadence: DAILY, timeoutMs: 30_000, run: viaCronGet(inboxSync) },
  { name: 'customer-reminder-nudges', priority: 3, cadence: DAILY, timeoutMs: 25_000, run: viaInternalPost(customerReminderNudges) },
  { name: 'team-weekly-reminder', priority: 3, cadence: MONDAY, timeoutMs: 40_000, run: viaInternalPost(teamWeeklyReminder) },
  { name: 'weekly-digest', priority: 3, cadence: MONDAY, timeoutMs: 60_000, run: viaInternalPost(weeklyDigest) },
  { name: 'partner-digest-webhook', priority: 3, cadence: DAILY, timeoutMs: 15_000, run: viaInternalPost(partnerDigestWebhook) },

  // ── 4 · AI yeniden deneme ───────────────────────────────────
  { name: 'ai-retry', priority: 4, cadence: DAILY, timeoutMs: 35_000, run: viaCronGet(aiRetry) },
];

/** Sonraki ajanlar ve testler için: kayıtlı iş adları. */
export const DAILY_JOB_NAMES = DAILY_JOBS.map((j) => j.name);
