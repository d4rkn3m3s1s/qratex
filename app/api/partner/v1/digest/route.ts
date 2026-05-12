import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartnerApiKey } from '@/lib/partner-api-auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { buildPartnerDigestPayload } from '@/lib/partner-digest-core';

export const dynamic = 'force-dynamic';

/**
 * Partner / POS webhook kaynağı: son 24 saat NPS + geri bildirim özeti.
 * Authorization: Bearer qrx_... — scope: read:partner_digest
 */
export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.partnerDigestApi) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 });
  }

  const auth = await authenticatePartnerApiKey(
    request.headers.get('authorization'),
    'read:partner_digest'
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const dealerId = searchParams.get('dealerId');
  const payload = await buildPartnerDigestPayload(dealerId);

  return NextResponse.json(payload);
}
