import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClientIp, getUserAgent } from '@/lib/request-metadata';
import { headers } from 'next/headers';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { pickAbVariant, recordInnovationAbEvent } from '@/lib/innovation-ab';

export const dynamic = 'force-dynamic';

/**
 * Müşteri için A/B varyantı (oturum veya anonim yapışkan anahtar).
 * impression AnalyticsEvent olarak kaydedilir.
 */
export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  const { searchParams } = new URL(request.url);
  const experimentId = searchParams.get('experimentId') || '';
  if (!experimentId) {
    return NextResponse.json({ error: 'experimentId gerekli' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  const headersList = await headers();
  const ip = getClientIp({ headers: headersList }) || '0';
  const ua = getUserAgent({ headers: headersList }) || '';
  const stickySeed = session?.user?.id ?? `${ip}:${ua}`.slice(0, 200);

  const exp = cfg.campaignAb.experiments.find((e) => e.id === experimentId && e.active);
  if (!exp) {
    return NextResponse.json({
      experimentId,
      variant: 'A' as const,
      active: false,
      copy: '',
      message: 'Deney kapalı veya bulunamadı',
    });
  }

  const { variant } = pickAbVariant(cfg, experimentId, stickySeed);

  await recordInnovationAbEvent(session?.user?.id ?? null, experimentId, variant, 'impression', {
    dimension: exp.dimension || 'copy',
  });

  const dim = exp.dimension || 'copy';
  const copy = variant === 'A' ? exp.variantA : exp.variantB;
  const pushTitle =
    variant === 'A' ? exp.pushTitleA ?? copy : exp.pushTitleB ?? copy;
  const pushHour = variant === 'A' ? exp.pushHourA ?? '18:00' : exp.pushHourB ?? '19:00';
  const bannerImage =
    variant === 'A' ? exp.bannerImageUrlA ?? '' : exp.bannerImageUrlB ?? '';

  return NextResponse.json({
    experimentId,
    variant,
    active: true,
    name: exp.name,
    dimension: dim,
    copy,
    pushTitle,
    pushHour,
    bannerImageUrl: bannerImage,
  });
}
