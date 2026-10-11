/**
 * POST /api/user/web-vitals — panel RUM toplayıcısı (oturumlu paneller).
 * Gövde: tek örnek ya da `{ samples: [...] }` (sayfa başına toplu gönderim, en fazla 10).
 * Değer aralığı doğrulanır, derece sunucuda türetilir (istemcinin `rating`'i yok sayılır),
 * yol kimliklerden arındırılır, kullanıcı başına dakikada 30 istek. Kalıcı depo: Upstash.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { VITAL_NAMES } from '@/lib/observability/contract';
import { recordVitals } from '@/lib/observability/web-vitals';

export const dynamic = 'force-dynamic';

const sample = z.object({
  name: z.enum(VITAL_NAMES),
  value: z.number().finite().min(0),
  path: z.string().max(512).optional(),
});
const body = z.union([z.object({ samples: z.array(sample).min(1).max(10) }), sample]);

export const POST = defineRoute(
  {
    name: 'user.web_vitals.ingest',
    roles: ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'],
    schema: body,
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    maxBodyBytes: 8_000,
  },
  async ({ body: b }) => {
    const samples = 'samples' in b ? b.samples : [{ name: b.name, value: b.value, path: b.path }];
    const stored = await recordVitals(samples);
    return ok({ stored });
  }
);
