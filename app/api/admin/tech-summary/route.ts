import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/tech-summary
 * Dashboard için özet: özellik bayrakları (sayı/durum), webhooks (sayı/aktif), api-keys (sayı).
 */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const [featuresCount, featuresEnabled, webhooksTotal, webhooksActive, apiKeysTotal] = await Promise.all([
      prisma.featureFlag.count(),
      prisma.featureFlag.count({ where: { isEnabled: true } }),
      prisma.webhook.count(),
      prisma.webhook.count({ where: { isActive: true } }),
      prisma.apiKey.count(),
    ]);

    return NextResponse.json({
      success: true,
      features: {
        total: featuresCount,
        enabled: featuresEnabled,
        disabled: featuresCount - featuresEnabled,
      },
      webhooks: {
        total: webhooksTotal,
        active: webhooksActive,
      },
      apiKeys: {
        total: apiKeysTotal,
      },
    });
  } catch (error) {
    console.error('Tech summary error:', error);
    return NextResponse.json(
      { success: false, error: 'Teknoloji özeti alınamadı' },
      { status: 500 }
    );
  }
}
