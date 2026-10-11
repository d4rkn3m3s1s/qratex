/**
 * POST /api/security/csp-report — tarayıcının CSP ihlal raporları (guvenlik-admin-api B11).
 *
 * Yalnız `Content-Security-Policy-Report-Only` gözlem politikası buraya rapor gönderir
 * (config/security-headers.js). Amaç: `'unsafe-eval'`i uygulanan politikadan güvenle çıkarmak
 * için üretimde eval kullanan betik kalıp kalmadığını ölçmek.
 *
 * Kötüye kullanım sınırları: gövde ≤ 16 KB; IP başına dakikada 30 rapor; aynı ihlal imzası
 * (yönerge + engellenen kaynak + betik dosyası) günde BİR kez günlüğe/Sentry'ye düşer. Kimlik,
 * çerez, DB yazımı yok; her durumda 204 döner (tarayıcı yeniden denemez).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { captureApiMessage } from '@/lib/capture-api-error';
import { redisIncrWithTtl } from '@/lib/redis';
import { getClientIp } from '@/lib/request-metadata';
import { normalizeCspReports } from '@/lib/security/csp-report';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 16 * 1024;
const PER_IP_PER_MINUTE = 30;
const seenLocal = new Set<string>();

function noContent() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(len) && len > MAX_BYTES) return noContent();

  const ip = getClientIp(req) ?? 'unknown';
  const rl = await redisIncrWithTtl(`csp-report:ip:${ip}`, 60);
  if (rl && rl.count > PER_IP_PER_MINUTE) return noContent();

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return noContent();
    body = JSON.parse(text);
  } catch {
    return noContent();
  }

  for (const r of normalizeCspReports(body)) {
    if (!r.directive) continue;
    const sig = `${r.directive}|${r.blocked}|${r.source}`;
    if (seenLocal.has(sig)) continue;
    seenLocal.add(sig);
    if (seenLocal.size > 500) seenLocal.clear();
    const first = await redisIncrWithTtl(`csp-report:sig:${sig}`, 24 * 60 * 60);
    if (first && first.count > 1) continue;
    const msg = `[csp-report-only] ${r.directive} engellenirdi: ${r.blocked || '?'} (kaynak: ${r.source || '?'}, sayfa: ${r.page || '?'})`;
    console.warn(msg);
    captureApiMessage(msg, 'info');
  }
  return noContent();
}
