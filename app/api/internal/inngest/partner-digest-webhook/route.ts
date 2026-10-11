import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { buildPartnerDigestPayload } from '@/lib/partner-digest-core';
import { safeWebhookPost } from '@/lib/safe-webhook-post';
import { signV1, signV2 } from '@/lib/webhook-dispatch';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Partner özet webhook'u (iç iş, Bearer). Hedef her gönderimde SSRF denetiminden geçer
 * (`safeWebhookPost`: yalnız genel IP, yönlendirme izlenmez, boyut + süre sınırı).
 *
 * guvenlik-admin-api B6:
 *  - Yanıt GÖVDESİ geri döndürülmez (eskiden `responsePreview` ilk 200 karakteri yansıtıyordu →
 *    admin tanımlı URL'ye istek atıp yanıtını okuma ilkeli). Yalnız durum kodu.
 *  - İmza Entegrasyon Merkezi webhook'larıyla aynı şema: geriye uyumlu `X-Qratex-Signature`
 *    (sha256=<hmac(body)>) + zaman damgalı `X-Qratex-Signature-V2: t=<unix>,v1=<hmac(t.body)>`
 *    (alıcı tekrar oynatmayı zaman penceresiyle reddedebilir).
 */
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
  const ts = Math.floor(Date.now() / 1000);
  let res: { ok: boolean; status: number; body: string };
  try {
    res = await safeWebhookPost(
      url,
      body,
      {
        'Content-Type': 'application/json',
        'X-Qratex-Event': 'partner.digest.24h',
        'X-Qratex-Timestamp': String(ts),
        ...(secret
          ? {
              'X-Qratex-Signature': `sha256=${signV1(secret, body)}`,
              'X-Qratex-Signature-V2': `t=${ts},v1=${signV2(secret, ts, body)}`,
            }
          : {}),
      },
      { timeoutMs: 10_000, maxBytes: 16 * 1024 },
    );
  } catch (e) {
    const blocked = e instanceof Error && e.message.startsWith('SSRF');
    return NextResponse.json({ ok: false, error: blocked ? 'blocked-url' : 'delivery-failed' }, { status: blocked ? 400 : 502 });
  }
  return NextResponse.json({ ok: res.ok, status: res.status });
}
