import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import type { EcosystemSummaryPayload } from '@/lib/admin-ecosystem-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const since = new Date(Date.now() - 7 * 86400_000);

    const [byRole, feedbacksLast7Days, consumptionsLast7Days] = await Promise.all([
      prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
      }),
      prisma.feedback.count({
        where: { deletedAt: null, createdAt: { gte: since } },
      }),
      prisma.consumption.count({
        where: { createdAt: { gte: since } },
      }),
    ]);

    const usersByRole = {
      [Role.ADMIN]: 0,
      [Role.DEALER]: 0,
      [Role.CUSTOMER]: 0,
      [Role.STAFF]: 0,
    } satisfies Record<Role, number>;

    for (const row of byRole) {
      usersByRole[row.role] = row._count._all;
    }

    const totalUsers = Object.values(usersByRole).reduce((a, b) => a + b, 0);

    const body: EcosystemSummaryPayload = {
      generatedAt: new Date().toISOString(),
      totalUsers,
      usersByRole,
      feedbacksLast7Days,
      consumptionsLast7Days,
    };

    return NextResponse.json({ success: true, ...body }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('ecosystem-summary:', error);
    return NextResponse.json(
      { success: false, error: 'Özet alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
