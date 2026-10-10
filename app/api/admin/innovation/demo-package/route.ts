import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { demoSeedGate, demoTargetRequiredResponse } from '@/lib/data-safety/demo-guard';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { seedInnovationDemoPackage } from '@/lib/innovation-demo-seed';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().min(1),
});

/**
 * Tenant / bayi demo: örnek masa sinyali, flash, haftalık özet, segment taslağı.
 *
 * P0-27: yalnız demo kapısı açıkken (üretimde ALLOW_DEMO_SEED=true) ve yalnız `isDemo`
 * işaretli SENTETİK bayiye yazar. Gerçek bayiye müşteriye görünen sahte flash teklif açılamaz.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const gate = demoSeedGate();
  if (gate) return gate;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  try {
    const { dealerId } = parsed.data;
    const dealer = await prisma.user.findFirst({
      where: { id: dealerId, role: 'DEALER' },
      select: { id: true, latitude: true, longitude: true, isDemo: true },
    });
    if (!dealer) {
      return NextResponse.json({ error: 'Bayi bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (!dealer.isDemo) return demoTargetRequiredResponse();

    const created = await seedInnovationDemoPackage(dealer, 'package');

    await prisma.auditLog
      .create({
        data: auditEntry(
          actorFromSession(auth.session),
          { action: 'INNOVATION_DEMO_PACKAGE', entity: 'User', entityId: dealerId, newData: created },
          request
        ),
      })
      .catch((e) => console.error('[innovation/demo-package] audit failed:', e));

    return NextResponse.json({
      success: true,
      created,
      trainingNotes: [
        'Masa sinyali: POST /api/innovation/table-pulse ile QR veya kiosk entegrasyonu.',
        'Flash: bayi panelinden süre ve indirim tipi düzenlenir; müşteri /api/customer/innovation/nearby ile görür.',
        'Haftalık özet: POST /api/dealer/innovation/weekly-brief ile yenilenir.',
        'Segment taslağı: admin /api/admin/innovation/segment-proposals ile onaylanır.',
      ],
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('[innovation/demo-package]', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Demo paketi oluşturulamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
