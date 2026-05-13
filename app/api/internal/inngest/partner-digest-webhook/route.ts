import { createHmac } from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { buildPartnerDigestPayload } from '@/lib/partner-digest-core';
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
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Qratex-Event': 'partner.digest.24h',
      ...(sig ? { 'X-Qratex-Signature': `sha256=${sig}` } : {}),
    },
    body,
  });
  const text = await res.text().catch(() => '');
  return NextResponse.json({ ok: res.ok, status: res.status, responsePreview: text.slice(0, 200) });
}
