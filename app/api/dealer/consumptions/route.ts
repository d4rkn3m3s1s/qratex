import { after } from 'next/server';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { createConsumption, runConsumptionSideEffects } from '@/lib/consumption/service';
import { parseLedgerFilters, scopeLedgerFilters } from '@/lib/dealer/kasa/core';
import { listLedger } from '@/lib/dealer/kasa/server';
import { mapKasaErrors } from '@/lib/dealer/kasa/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/consumptions — İşlem defteri (BFF).
 *
 * Sorgu: range=today|7d|30d|90d|all|custom (+from,to YYYY-MM-DD, İstanbul günü), rating=all|none|
 * low|mid|high, product, q (müşteri adı/not/ürün, ≥2 karakter), sort=new|old|amount_desc|
 * amount_asc, page, pageSize (5–50). Yanıt: açık DTO satırları (ham müşteri/bayi kimliği ve
 * e-posta yok, kart yalnız son 4), seçili aralığın özeti ve önceki eşit dönem.
 * ADMIN yalnız `?dealerId=` ile, salt okunur.
 */
export const GET = defineRoute(
  {
    name: 'dealer.consumptions.list',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
  },
  async ({ request, tenant }) => {
    const sp = request.nextUrl.searchParams;
    const size = Number.parseInt(sp.get('pageSize') ?? '', 10);
    const pageSize = Number.isInteger(size) && size >= 5 && size <= 50 ? size : undefined;
    return ok(
      await listLedger(tenant.dealerId, scopeLedgerFilters(parseLedgerFilters(sp), tenant.via), {
        pageSize,
        // Personel: ad maskeli (kasa kartıyla aynı), geri alma düğmesi yalnız kendi kaydında.
        staffActorId: tenant.via === 'staff' ? tenant.actorId : null,
      })
    );
  }
);

/**
 * POST /api/dealer/consumptions — kasada tüketim kaydı.
 *
 * Kurallar lib/consumption/service.ts'te (kart durumu, oran sınırı, ürün sahipliği, tutar
 * sınırı, çarpan politikası; kayıt + denetim + bildirim + `mintPoints` tek transaction).
 * İdempotency: gövdede `clientOpId` ya da `Idempotency-Key` başlığı; aynı anahtar yeni
 * kayıt/puan üretmez (`duplicate: true`). Personel kasası: kayıt bayiye yazılır, aktör denetimde.
 */
export const POST = defineRoute(
  {
    name: 'dealer.consumptions.create',
    roles: ['DEALER', 'STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER', 'STAFF'] },
    rateLimit: 'mutation',
    maxBodyBytes: 8_000,
  },
  async ({ request, tenant, user }) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError('BAD_REQUEST', 'Geçersiz JSON gövdesi');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('BAD_REQUEST', 'Geçersiz istek gövdesi');
    }
    const headerKey = request.headers.get('idempotency-key');
    const input = {
      ...(body as Record<string, unknown>),
      clientOpId: (body as { clientOpId?: unknown }).clientOpId ?? (headerKey || undefined),
    };

    const now = new Date();
    const result = await mapKasaErrors(() =>
      createConsumption(input, {
        dealerId: tenant.dealerId,
        actorId: user.id,
        channel: 'live',
        now,
        ...getAuditRequestMeta(request),
      })
    );

    if (!result.duplicate) {
      const revenue = result.consumption.amount ?? 0;
      after(() =>
        runConsumptionSideEffects({ dealerId: tenant.dealerId, customerId: result.customerId, revenue, at: now })
      );
    }

    let visitCountHere: number | null = null;
    try {
      visitCountHere = await prisma.consumption.count({
        where: { dealerId: tenant.dealerId, cardId: result.consumption.cardId },
      });
    } catch {
      visitCountHere = null; // Kayıt commit'lendi; sayaç yalnız bilgi amaçlı.
    }

    const c = result.consumption;
    return ok(
      {
        message: result.duplicate ? 'Bu tüketim zaten kaydedilmiş' : 'Tüketim kaydı oluşturuldu',
        duplicate: result.duplicate,
        consumption: {
          id: c.id,
          amount: c.amount,
          note: c.note,
          createdAt: c.createdAt,
          product: c.product ? { id: c.product.id, name: c.product.name } : null,
        },
        passivePoints: result.passive.credited,
        passiveCapped: result.passive.capped,
        multiplier: result.passive.combinedMultiplier,
        visitCountHere,
      },
      { legacySpread: true }
    );
  }
);
