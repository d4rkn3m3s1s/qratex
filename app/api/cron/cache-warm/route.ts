import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { internalAppBaseUrl } from '@/lib/inngest/internal-http';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * CACHE-WARM cron: GLOBAL (kullanıcıdan bağımsız) cache'leri önceden ısıtır → ilk gerçek
 * kullanıcı cache-miss beklemez. cron-job.org'dan 5 dk'da bir çağrılır (Bearer CRON_SECRET).
 * Yalnızca herkese aynı görünen (public/leaderboard) uçları ısıtır; per-kullanıcı/per-bayi
 * cache'ler ısıtılmaz (çok fazla anahtar olur).
 */
function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret.trim()}`;
  const got = (authHeader ?? '').trim();
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = internalAppBaseUrl();
  // Isıtılacak GLOBAL uçlar (Redis/unstable_cache doldurur). Self-fetch: yanıtı umursamayız,
  // yalnız cache dolsun. Her biri ayrı try — biri patlarsa diğerleri devam eder.
  const targets = [
    '/api/public/stats',
    '/api/leaderboard?period=alltime',
  ];
  const results: { path: string; ok: boolean; ms: number }[] = [];
  for (const path of targets) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(12_000), cache: 'no-store' });
      results.push({ path, ok: res.ok, ms: Date.now() - t0 });
    } catch {
      results.push({ path, ok: false, ms: Date.now() - t0 });
    }
  }
  return NextResponse.json({ ok: true, warmed: results });
}
