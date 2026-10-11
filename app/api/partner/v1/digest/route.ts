import { NextRequest, NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { authenticatePartnerApiKey } from '@/lib/partner-api-auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { buildPartnerDigestPayload } from '@/lib/partner-digest-core';
import { getClientIp } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

/**
 * Partner / POS webhook kaynağı: son 24 saat NPS + geri bildirim özeti.
 * Authorization: Bearer qrx_... — scope: read:partner_digest
 *
 * Kiracı kapsamı anahtardan gelir (sorgu parametresinden DEĞİL):
 *  - Anahtar bir bayiye bağlıysa yalnız o bayi döner; başka `dealerId` istenirse 403.
 *  - Anahtar bir partnere bağlı ve partnerin bayi listesi varsa yalnız o bayiler döner.
 *  - Platform geneli anahtar (admin bilerek verdi) `?dealerId=` ile süzebilir.
 */
export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.partnerDigestApi) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const auth = await authenticatePartnerApiKey(request.headers.get('authorization'), 'read:partner_digest', {
    ip: getClientIp(request),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const requested = new URL(request.url).searchParams.get('dealerId');
  const allowed = auth.dealerId ? [auth.dealerId] : auth.partnerDealerIds;
  if (requested && allowed.length > 0 && !allowed.includes(requested)) {
    return NextResponse.json({ error: 'Bu bayinin verisine erişim yetkiniz yok' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const filter = auth.dealerId ?? requested ?? null;
  const payload = await buildPartnerDigestPayload(filter);
  if (!filter && allowed.length > 0) {
    payload.dealers = payload.dealers.filter((d) => allowed.includes(d.dealerId));
  }

  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE_HEADERS });
}
