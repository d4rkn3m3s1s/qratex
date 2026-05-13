import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { computeDealerHealthV2 } from '@/lib/dealer-health-v2';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER' },
    select: { id: true, businessName: true, name: true },
    take: 200,
  });

  const ranked = [];
  for (const d of dealers) {
    const h = await computeDealerHealthV2(d.id);
    ranked.push({
      dealerId: d.id,
      label: d.businessName || d.name || d.id,
      ...h,
    });
  }

  ranked.sort((a, b) => b.score - a.score);

  const warnings = ranked.filter((r) => r.score < 55).slice(0, 15);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    dealers: ranked,
    earlyWarnings: warnings,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
