import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getProgressTrends } from '@/components/customer/m-ben-ilerleme/server/trends';
import { PROGRESS_PERIODS, type ProgressPeriod } from '@/components/customer/m-ben-ilerleme/period';

export const dynamic = 'force-dynamic';

const Query = z.object({
  period: z.coerce
    .number()
    .int()
    .refine((n): n is ProgressPeriod => (PROGRESS_PERIODS as readonly number[]).includes(n), {
      message: 'Dönem 7, 30, 90 ya da 365 gün olmalı.',
    })
    .default(30),
});

/**
 * Ben → İlerleme: kişisel trendler (dönem seçici). Yalnız oturumdaki müşterinin verisi;
 * kullanıcı kimliği istekten alınmaz (IDOR yüzeyi yok). Gruplama SQL'de, İstanbul saatiyle.
 * `progress_hub` modülü kapalıysa 403 MODULE_DISABLED.
 */
export const GET = defineRoute(
  { name: 'customer.me.progress.trends', roles: ['CUSTOMER'], module: 'progress_hub', rateLimit: 'read', query: Query },
  async ({ user, query }) => ok(await getProgressTrends(user.id, query.period as ProgressPeriod))
);
