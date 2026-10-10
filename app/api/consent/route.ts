/**
 * Çerez/izleme rızası kanıtı (P0-31, KVKK m.5 ispat yükü).
 *
 *   POST { version, analytics, replay, marketing, surface, anonId? } → `ConsentRecord` (yalnız ekleme)
 *   GET  → oturum açmış kullanıcının son rıza kaydı (cihazlar arası senkron için)
 *
 * Ham IP tutulmaz (sha256 kısa parmak izi). Oturumsuz ziyaretçi istemcide üretilmiş rastgele
 * `anonId` ile kaydedilir. Kayıt silinmez/güncellenmez; her karar yeni satırdır.
 */
import { createHash } from 'crypto';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getUserAgent } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

const Body = z.object({
  version: z.number().int().min(1).max(9999),
  analytics: z.boolean(),
  replay: z.boolean(),
  marketing: z.boolean(),
  surface: z.enum(['banner', 'settings', 'footer', 'policy', 'other']).default('other'),
  anonId: z
    .string()
    .regex(/^[A-Za-z0-9-]{8,64}$/)
    .optional(),
});

async function optionalUserId(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    return (session?.user?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

function ipFingerprint(ip: string | null): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`consent:${ip}`).digest('hex').slice(0, 32);
}

export const POST = defineRoute(
  { name: 'consent.record', roles: 'public', schema: Body, rateLimit: 'public-write' },
  async ({ body, request, ip }) => {
    const userId = await optionalUserId();
    if (!userId && !body.anonId) {
      return ok({ recorded: false });
    }
    const ua = getUserAgent(request);
    const row = await prisma.consentRecord.create({
      data: {
        userId,
        anonId: body.anonId ?? null,
        version: String(body.version),
        analytics: body.analytics,
        // Oturum kaydı analitik olmadan verilemez (bağımlı kategori).
        replay: body.analytics && body.replay,
        marketing: body.marketing,
        source: body.surface,
        ipHash: ipFingerprint(ip),
        userAgent: ua ? ua.slice(0, 256) : null,
      },
      select: { id: true, createdAt: true },
    });
    return ok({ recorded: true, id: row.id, createdAt: row.createdAt }, { status: 201 });
  }
);

export const GET = defineRoute({ name: 'consent.latest', roles: 'public', rateLimit: 'read' }, async () => {
  const userId = await optionalUserId();
  if (!userId) return ok({ record: null });
  const record = await prisma.consentRecord.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { version: true, analytics: true, replay: true, marketing: true, source: true, createdAt: true },
  });
  return ok({ record });
});
