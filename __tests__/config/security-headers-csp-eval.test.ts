/**
 * Genel denetim 2026-10 (guvenlik): üretimde uygulanan CSP `'unsafe-eval'` İÇERMEZ;
 * yalnız WebAssembly için `'wasm-unsafe-eval'`. Geliştirmede next dev eval'e ihtiyaç duyar.
 */
function loadWithEnv(nodeEnv: string) {
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = nodeEnv;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../config/security-headers.js');
  (process.env as Record<string, string>).NODE_ENV = prev as string;
  return mod as { CONTENT_SECURITY_POLICY: string; CONTENT_SECURITY_POLICY_REPORT_ONLY: string };
}

describe('CSP eval politikası', () => {
  it('üretimde unsafe-eval yok, wasm-unsafe-eval var', () => {
    const { CONTENT_SECURITY_POLICY } = loadWithEnv('production');
    const scriptSrc = CONTENT_SECURITY_POLICY.split(';').find((d) => d.trim().startsWith('script-src'))!;
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });

  it('geliştirmede unsafe-eval açık (next dev HMR)', () => {
    const { CONTENT_SECURITY_POLICY } = loadWithEnv('development');
    expect(CONTENT_SECURITY_POLICY).toContain("'unsafe-eval'");
  });
});
