import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { isDemoSeedAllowed } from '@/lib/data-safety/demo-guard';


export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/bootstrap/summary — demo kayıt sayıları + demo kapısının durumu.
 * `contamination`: eski sürümün GERÇEK (isDemo=false) kayıtlara yazdığı demo izleri
 * (P0-27 temizlik betiği/onaylı temizlik için görünürlük).
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const [
      insightsDemoCategories,
      suspiciousDemoLogs,
      aiQualityDemoSamples,
      demoAccounts,
      realDealersWithDemoCategory,
      realFeedbacksWithSyntheticAi,
      realFlashOffersFromDemo,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'DEALER', businessCategory: { startsWith: 'demo-' } } }),
      prisma.suspiciousActivity.count({ where: { metadata: { path: ['source'], equals: 'bootstrap' } } }),
      prisma.aIQualitySample.count({ where: { notes: '[bootstrap-demo]' } }),
      prisma.user.count({ where: { isDemo: true } }),
      prisma.user.count({ where: { role: 'DEALER', isDemo: false, businessCategory: { startsWith: 'demo-' } } }),
      prisma.feedback.count({ where: { aiModelUsed: 'bootstrap-heuristic', qrCode: { dealer: { isDemo: false } } } }),
      prisma.dealerFlashOffer.count({
        where: {
          dealer: { isDemo: false },
          OR: [{ title: { startsWith: 'Demo:' } }, { title: { startsWith: 'Senaryo:' } }],
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      demoSeedAllowed: isDemoSeedAllowed(),
      summary: {
        insightsDemoCategories,
        suspiciousDemoLogs,
        aiQualityDemoSamples,
        demoAccounts,
        totalDemoRecords: insightsDemoCategories + suspiciousDemoLogs + aiQualityDemoSamples,
      },
      contamination: {
        realDealersWithDemoCategory,
        realFeedbacksWithSyntheticAi,
        realFlashOffersFromDemo,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('[bootstrap/summary]', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Özet alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
