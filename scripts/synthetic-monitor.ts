/**
 * Synthetic monitoring (P2-20 item 13).
 * Login, QR scan, feedback submit hedef endpoint'leri kontrol eder.
 * BASE_URL env ile çalıştırın (örn. https://qratex.vercel.app).
 * CI veya cron ile periyodik çalıştırılır; başarısızlıkta exit 1.
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function check(
  name: string,
  url: string,
  options: RequestInit = {},
  expectStatus?: number
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const wanted = expectStatus ?? 200;
    const ok = res.status === wanted;
    if (!ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: text.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];

  // GET /api/auth/providers - auth altyapısı ayakta mı
  const auth = await check(
    'auth/providers',
    `${BASE_URL}/api/auth/providers`,
    {},
    200
  );
  results.push({
    name: 'auth/providers',
    ok: auth.ok,
    error: auth.error,
  });

  // GET /api/qr-codes/public/[code] - var olmayan kod 404 dönmeli
  const qr = await check(
    'qr-codes/public',
    `${BASE_URL}/api/qr-codes/public/__synthetic_test_nonexistent__`,
    {},
    404
  );
  results.push({
    name: 'qr-codes/public',
    ok: qr.ok,
    error: qr.error,
  });

  // POST /api/feedbacks - auth gerekir; 401 beklenir (no cookie)
  const fb = await check(
    'feedbacks (auth required)',
    `${BASE_URL}/api/feedbacks`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'test', qrCodeId: 'x' }) },
    401
  );
  results.push({
    name: 'feedbacks POST',
    ok: fb.ok,
    error: fb.error,
  });

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.name}` : `✗ ${r.name}: ${r.error}`);
  }
  if (failed.length > 0) {
    console.error(`Synthetic monitor failed: ${failed.length}/${results.length} checks`);
    process.exit(1);
  }
  console.log(`Synthetic monitor passed: ${results.length} checks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
