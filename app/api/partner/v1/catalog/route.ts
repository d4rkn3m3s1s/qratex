import { NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { authenticatePartnerApiKey } from '@/lib/partner-api-auth';
import { PARTNER_EVENTS, WEBHOOK_HEADERS } from '@/lib/partner-integration-catalog';

export const dynamic = 'force-dynamic';

/** Olay kataloğu + imza başlıkları — kurumsal entegrasyon. */
export async function GET(request: Request) {
  const auth = await authenticatePartnerApiKey(request.headers.get('authorization'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status , headers: PRIVATE_NO_STORE_HEADERS });
  }

  return NextResponse.json({
    version: '1.0',
    events: PARTNER_EVENTS,
    webhookHeaders: WEBHOOK_HEADERS,
    digestEndpoints: {
      rest: 'GET /api/partner/v1/digest?dealerId=<optional>',
      webhookCron: 'Inngest partnerDigestWebhookFn — ayar: innovationPlatform.partnerDigest',
    },
    examplePosAck: { received: true, processedAt: '{{ISO8601}}' },
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
