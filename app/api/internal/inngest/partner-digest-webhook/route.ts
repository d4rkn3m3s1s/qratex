import { createHmac } from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { buildPartnerDigestPayload } from '@/lib/partner-digest-core';
import { safeWebhookPost } from '@/lib/safe-webhook-post';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const cfg = await getInnovationPlatformConfig();
  const url = cfg.partnerDigest?.webhookUrl?.trim();
  if (!url || !cfg.partnerDigest?.webhookEnabled) {
    return NextResponse.json({ skipped: true, reason: 'disabled-or-no-url' });
  }
  const payload = await buildPartnerDigestPayload(null);
  const body = JSON.stringify(payload);
  const secret = (cfg.partnerDigest?.webhookSecret || '').trim();
  const sig = secret ? createHmac('sha256', secret).update(body).digest('hex') : '';
  let res: { ok: boolean; status: number; body: string };
  try {
    res = await safeWebhookPost(
      url,
      body,
      {
        'Content-Type': 'application/json',
        'X-Qratex-Event': 'partner.digest.24h',
        ...(sig ? { 'X-Qratex-Signature': `sha256=${sig}` } : {}),
      },
      { timeoutMs: 10_000, maxBytes: 16 * 1024 },
    );
  } catch (e) {
    const blocked = e instanceof Error && e.message.startsWith('SSRF');
    return NextResponse.json({ ok: false, error: blocked ? 'blocked-url' : 'delivery-failed' }, { status: blocked ? 400 : 502 });
  }
  const text = res.body;
  return NextResponse.json({ ok: res.ok, status: res.status, responsePreview: text.slice(0, 200) });
}
