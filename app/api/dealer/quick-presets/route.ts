import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { createQuickKey, deleteQuickKey, listQuickKeys } from '@/lib/dealer/kasa/server';
import { mapKasaErrors } from '@/lib/dealer/kasa/http';

export const dynamic = 'force-dynamic';

/**
 * Kasa hızlı tuşları (QuickScanPreset). Tek kullanıcı: /dealer/scan (Kasa modu).
 *
 * Önceki sürüm doğrulamasızdı (`parseFloat` ile sınırsız tutar, başka bayinin ürünü
 * bağlanabiliyordu, `isDefault` tekil değildi). Şimdi: zod + ürün sahipliği/aktifliği +
 * bayi başına 24 tuş + kiracı kapsamı. Personel tuşları okur ve kullanır; ekleme/silme bayide.
 */
export const GET = defineRoute(
  {
    name: 'dealer.kasa.quickKeys.list',
    roles: ['DEALER', 'STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER', 'STAFF'] },
    rateLimit: 'read',
  },
  async ({ tenant }) => ok({ presets: await listQuickKeys(tenant.dealerId) }, { legacySpread: true })
);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Tuş adı gerekli').max(40, 'Tuş adı en fazla 40 karakter olabilir'),
  productId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).nullish().transform((v) => v || null),
  amount: z.number().finite().min(0, 'Tutar negatif olamaz').max(1_000_000, 'Tutar çok büyük').nullish().transform((v) => v ?? null),
  note: z.string().trim().max(200, 'Not en fazla 200 karakter olabilir').nullish().transform((v) => v || null),
});

export const POST = defineRoute(
  {
    name: 'dealer.kasa.quickKeys.create',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    schema: createSchema,
    rateLimit: 'mutation',
  },
  async ({ tenant, body }) =>
    ok({ preset: await mapKasaErrors(() => createQuickKey(tenant.dealerId, body)) }, { status: 201, legacySpread: true })
);

export const DELETE = defineRoute(
  {
    name: 'dealer.kasa.quickKeys.delete',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    query: z.object({ id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) }),
    rateLimit: 'mutation',
  },
  async ({ tenant, query }) => {
    await mapKasaErrors(() => deleteQuickKey(tenant.dealerId, query.id));
    return ok({ deleted: true });
  }
);
