import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getJourneyPage } from '@/components/customer/m-ben-ilerleme/server/journey';
import { JOURNEY_FILTERS } from '@/components/customer/m-ben-ilerleme/types';

export const dynamic = 'force-dynamic';

const Query = z.object({
  filter: z.enum(JOURNEY_FILTERS).default('all'),
  cursor: z.string().max(300).optional(),
});

/**
 * Ben → İlerleme: "Yolculuğun" akışı — imleçli, birleşik, yapısal olaylar (metin istemcide).
 * Yalnız oturumdaki müşteri. `journey_score` modülü kapalıysa 403 MODULE_DISABLED
 * (eski Yolculuk skoru anahtarı artık API'de de uygulanır).
 */
export const GET = defineRoute(
  { name: 'customer.me.progress.journey', roles: ['CUSTOMER'], module: 'journey_score', rateLimit: 'read', query: Query },
  async ({ user, query }) => ok(await getJourneyPage(user.id, { filter: query.filter, cursor: query.cursor ?? null }))
);
