import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { buildInnovationDemoScenario } from '@/lib/innovation-demo-scenario';
import { demoSeedGate, demoTargetRequiredResponse, isDemoSeedAllowed } from '@/lib/data-safety/demo-guard';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { seedInnovationDemoPackage } from '@/lib/innovation-demo-seed';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().min(1),
  /** true: demo-package ile aynı seed (DB yazılır) */
  runSeed: z.boolean().optional(),
});

/**
 * 120 sn hedefli adım adım senaryo + isteğe bağlı canlı seed (demo-package ile aynı).
 * Senaryo metni her zaman döner; `runSeed` yalnız demo kapısı açıkken ve yalnız `isDemo`
 * bayide veritabanına yazar (P0-27).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const limited = await enforceRouteRateLimit('admin.innovation.demo-scenario.post', auth.session.user.id, 'mutation');
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { dealerId, runSeed } = parsed.data;

  try {
    const dealer = await prisma.user.findFirst({
      where: { id: dealerId, role: 'DEALER' },
      select: { id: true, latitude: true, longitude: true, isDemo: true },
    });
    if (!dealer) {
      return NextResponse.json({ error: 'Bayi bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const scenario = buildInnovationDemoScenario(dealerId);

    if (!runSeed) {
      return NextResponse.json({
        ...scenario,
        seeded: null,
        demoSeedAllowed: isDemoSeedAllowed(),
        note: 'runSeed: true ile veritabanına demo paketi yazılır (yalnız demo bayide).',
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const gate = demoSeedGate();
    if (gate) return gate;
    if (!dealer.isDemo) return demoTargetRequiredResponse();

    const seeded = await seedInnovationDemoPackage(dealer, 'scenario');

    await prisma.auditLog
      .create({
        data: auditEntry(
          actorFromSession(auth.session),
          { action: 'INNOVATION_DEMO_SCENARIO', entity: 'User', entityId: dealerId, newData: seeded },
          request
        ),
      })
      .catch((e) => console.error('[innovation/demo-scenario] audit failed:', e));

    return NextResponse.json({ ...scenario, seeded }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('[innovation/demo-scenario]', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Senaryo hazırlanamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
