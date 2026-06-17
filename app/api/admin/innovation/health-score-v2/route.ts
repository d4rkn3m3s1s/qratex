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

  // Önceden 200 dealer için sıralı for-await (her biri 5 sorgu = ~1000 seri
  // round-trip). Şimdi sınırlı eşzamanlılıkla paralel — DB havuzunu boğmadan
  // gecikmeyi ~ortalama_sorgu × (200/CONCURRENCY)'e indirir.
  const CONCURRENCY = 10;
  const ranked: Array<{ dealerId: string; label: string } & Awaited<ReturnType<typeof computeDealerHealthV2>>> = [];
  for (let i = 0; i < dealers.length; i += CONCURRENCY) {
    const chunk = dealers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (d) => ({
        dealerId: d.id,
        label: d.businessName || d.name || d.id,
        ...(await computeDealerHealthV2(d.id)),
      }))
    );
    ranked.push(...results);
  }

  ranked.sort((a, b) => b.score - a.score);

  const warnings = ranked.filter((r) => r.score < 55).slice(0, 15);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    dealers: ranked,
    earlyWarnings: warnings,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
