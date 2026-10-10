/**
 * P0-36 (kamera) + statik varlık önbellek başlıkları — next.config.js `headers()` kaynağı.
 */
const headersConfig = require('../../config/security-headers.js') as {
  PERMISSIONS_POLICY: string;
  buildHeaders: () => Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  IMMUTABLE_CACHE: string;
  STATIC_ASSET_CACHE: string;
};

/** Next.js eşleşme davranışının sadeleştirilmiş modeli: `:path*` önekini kapsar; son kural kazanır. */
function sourceMatches(source: string, pathname: string): boolean {
  if (source.endsWith('/:path*')) {
    const prefix = source.slice(0, -'/:path*'.length);
    return prefix === '' || pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
  return source === pathname;
}

function effectiveHeader(pathname: string, key: string): string | undefined {
  let value: string | undefined;
  for (const rule of headersConfig.buildHeaders()) {
    if (!sourceMatches(rule.source, pathname)) continue;
    const h = rule.headers.find((x) => x.key.toLowerCase() === key.toLowerCase());
    if (h) value = h.value;
  }
  return value;
}

describe('Permissions-Policy — kamera (P0-36)', () => {
  it('kamera yalnız kendi origin’imize açık; mikrofon ve ödeme kapalı', () => {
    expect(headersConfig.PERMISSIONS_POLICY).toContain('camera=(self)');
    expect(headersConfig.PERMISSIONS_POLICY).not.toMatch(/camera=\(\)/);
    expect(headersConfig.PERMISSIONS_POLICY).toContain('microphone=()');
    expect(headersConfig.PERMISSIONS_POLICY).toContain('payment=()');
  });

  // Yumuşak (client-side) gezinmede belge değişmez: ilk yüklenen HER sayfa kamerayı engellememeli.
  it.each(['/dealer/scan', '/customer/scan', '/dealer', '/customer', '/', '/feedback/AB12CD34', '/blog'])(
    '%s belgesi kamerayı engellemez (tarama sayfasına yumuşak geçiş çalışır)',
    (pathname) => {
      const policy = effectiveHeader(pathname, 'Permissions-Policy');
      expect(policy).toBeDefined();
      expect(policy).toContain('camera=(self)');
    },
  );

  it('çerçeveleme ve CSP korumaları yerinde', () => {
    expect(effectiveHeader('/dealer/scan', 'X-Frame-Options')).toBe('DENY');
    expect(effectiveHeader('/dealer/scan', 'Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });
});

describe('Statik varlık önbellek başlıkları', () => {
  it('hash’li optimize avatarlar 1 yıl immutable', () => {
    expect(effectiveHeader('/images/avatar/opt/avatar-erkek-1.2ffa7bf9f1.webp', 'Cache-Control')).toBe(
      headersConfig.IMMUTABLE_CACHE,
    );
    expect(headersConfig.IMMUTABLE_CACHE).toMatch(/max-age=31536000/);
    expect(headersConfig.IMMUTABLE_CACHE).toMatch(/immutable/);
  });

  it('hash’siz görseller uzun süre önbellekte, ama immutable DEĞİL (aynı adla değişebilir)', () => {
    for (const p of ['/images/avatar/CAT.svg', '/images/badges/EFSANE.svg', '/icons/icon-192x192.svg', '/logo/chatbot.png']) {
      const cc = effectiveHeader(p, 'Cache-Control');
      expect(cc).toBe(headersConfig.STATIC_ASSET_CACHE);
      expect(cc).not.toMatch(/immutable/);
      expect(cc).not.toMatch(/max-age=0/);
    }
  });

  it('service worker betikleri her zaman yeniden doğrulanır', () => {
    expect(effectiveHeader('/sw.js', 'Cache-Control')).toMatch(/max-age=0/);
    expect(effectiveHeader('/push-sw.js', 'Cache-Control')).toMatch(/max-age=0/);
  });

  it('sayfa ve API yanıtlarına statik önbellek başlığı eklenmez', () => {
    expect(effectiveHeader('/customer', 'Cache-Control')).toBeUndefined();
    expect(effectiveHeader('/api/dealer/cards/scan/x', 'Cache-Control')).toBeUndefined();
  });
});
