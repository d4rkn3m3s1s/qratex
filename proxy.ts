import { withAuth } from 'next-auth/middleware';
import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import {
  ADMIN_GATE_COOKIE,
  checkGateCookieForToken,
  isGateExemptApiPath,
  isGatedAdminPage,
  permissionsPolicyFor,
} from '@/lib/admin-gate-edge';
import { maintenanceBlock } from '@/lib/platform-settings/maintenance-edge';
import { checkRequestOrigin } from '@/lib/security/origin-guard';

// Kimlik bilgili (credentials) CORS izin listesi. Uygulamanın kendi istekleri aynı kaynaktan
// geldiği için CORS'a ihtiyaç duymaz; liste yalnız açıkça yapılandırılmış harici kaynaklar içindir.
// Üretimde varsayılan BOŞ (denetim: tanımsız env'de canlıda localhost ve eski netlify alan adı
// çerezli isteğe izinliydi); geliştirmede yerel portlar. Sunucu tarafı `ALLOWED_ORIGINS`
// önceliklidir (NEXT_PUBLIC_ öneki istemci paketine sızar; geriye uyum için okunur).
const CORS_ALLOWLIST = (
  process.env.ALLOWED_ORIGINS ||
  process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000,http://localhost:3001')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function addSecurityHeaders(res: NextResponse, pathname: string): void {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // API yanıtı belge açmaz → kamera dahil güçlü özellikler kapalı (lib/admin-gate-edge.ts).
  res.headers.set('Permissions-Policy', permissionsPolicyFor(pathname));
  // CSP burada YAZILMAZ (guvenlik-admin-api B11): tek kaynak `config/security-headers.js`
  // (next.config `headers()` → her yanıt, /api dahil). Eskiden proxy farklı bir ikinci CSP
  // yazıyordu (`connect-src https: wss:`, base-uri/form-action/object-src yok); iki başlık
  // birlikte gidince tarayıcı kesişimi uyguluyor, hangi kuralın geçerli olduğu belirsizleşiyordu.
}

/** CSRF köken denetimi (B5): durum değiştiren API isteği yabancı kökenden geliyorsa 403. */
function csrfOriginBlock(req: NextRequest): NextResponse | null {
  const decision = checkRequestOrigin(
    {
      method: req.method,
      pathname: req.nextUrl.pathname,
      selfOrigin: req.nextUrl.origin,
      headers: req.headers,
    },
    CORS_ALLOWLIST
  );
  if (decision.ok) return null;
  return NextResponse.json(
    {
      success: false,
      code: 'CSRF_ORIGIN_MISMATCH',
      error: 'İstek bu sitenin dışından geldiği için reddedildi. Sayfayı yenileyip tekrar deneyin.',
    },
    { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

function addCorsHeaders(res: NextResponse, req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (!origin || !CORS_ALLOWLIST.includes(origin)) return; // izinsiz kaynağa CORS başlığı yok
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.append('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Access-Control-Max-Age', '86400');
}

type GateToken = { role?: string; sub?: string; id?: string; jti?: string; sid?: string };

const authMiddleware = withAuth(
  async function middleware(req) {
    const token = (req as NextRequest & { nextauth?: { token?: GateToken } }).nextauth?.token;
    const pathname = req.nextUrl.pathname;

    const roleRouteMap: Record<string, string> = {
      '/admin': 'ADMIN',
      '/dealer': 'DEALER',
      '/customer': 'CUSTOMER',
      '/staff': 'STAFF',
    };

    for (const [routePrefix, requiredRole] of Object.entries(roleRouteMap)) {
      // /admin-gate de /admin önekiyle eşleşir → ADMIN rolü gerekir (ama kapı çerezi gerekmez).
      if (pathname.startsWith(routePrefix) && token?.role !== requiredRole) {
        if (token?.role) {
          const roleRedirects: Record<string, string> = {
            ADMIN: '/admin',
            DEALER: '/dealer',
            CUSTOMER: '/customer',
            STAFF: '/staff',
          };
          return NextResponse.redirect(new URL(roleRedirects[token.role as string] || '/', req.url));
        }
        return NextResponse.redirect(new URL('/auth/login', req.url));
      }
    }

    // ── ADMIN GİZLİ KAPI (P0-01) ── ADMIN rolü yetmez: imzalı, süreli, bu oturuma bağlı ve
    // güncel sürümlü kapı çerezi gerekir. İmza Web Crypto ile GERÇEKTEN doğrulanır
    // (eskiden yalnız biçime bakılıyordu; elle yazılan sahte çerez kapıyı geçiyordu).
    // API tarafı aynı kuralı `requireAuth` içinde DB'deki güncel sürümle uygular.
    if (token?.role === 'ADMIN' && isGatedAdminPage(pathname)) {
      const gateCookie = req.cookies.get(ADMIN_GATE_COOKIE)?.value;
      // Oturum kimliği kalıcı `sid` (next-auth `jti`'yi her encode'da yeniler) — lib/auth.ts jwt.
      const check = await checkGateCookieForToken(gateCookie, { ...token, jti: token.sid ?? token.jti });
      if (!check.ok) {
        const url = new URL('/admin-gate', req.url);
        url.searchParams.set('from', pathname);
        const redirect = NextResponse.redirect(url);
        // Geçersiz/bayat çerezi temizle (sahte değer tarayıcıda kalmasın).
        if (gateCookie) redirect.cookies.set(ADMIN_GATE_COOKIE, '', { path: '/', maxAge: 0 });
        return redirect;
      }
    }

    // Admin sayfa koruması (lib/auth/admin-page-guard → zorunlu 2FA) yolu bu başlıktan okur;
    // istemcinin gönderdiği değer her zaman EZİLİR.
    let res: NextResponse;
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const fwd = new Headers(req.headers);
      fwd.set('x-qx-pathname', pathname);
      res = NextResponse.next({ request: { headers: fwd } });
    } else {
      res = NextResponse.next();
    }
    // Belge politikası (P0-36): tarama sayfaları DAHİL bütün panel sayfalarında camera=(self) —
    // next.config başlığıyla aynı değer; panelden taramaya yumuşak geçişte belge değişmez.
    res.headers.set('Permissions-Policy', permissionsPolicyFor(pathname));
    return res;
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

/**
 * `/api/admin/*` için kapı savunması (derinlemesine savunma): ADMIN oturumunda geçerli
 * kapı çerezi yoksa route koduna hiç ulaşmadan 403. Asıl (yetkili) kontrol `requireAuth`
 * içindedir; bu katman `getServerSession`'ı doğrudan kullanan eski uçları da kapsar.
 * Oturumsuz istekler (cron vb.) ve ADMIN olmayan oturumlar route'un kendi kontrolüne bırakılır.
 */
async function adminApiGateBlock(req: NextRequest): Promise<NextResponse | null> {
  const pathname = req.nextUrl.pathname;
  if (!pathname.startsWith('/api/admin/') || isGateExemptApiPath(pathname)) return null;
  let token: GateToken | null = null;
  try {
    token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET })) as GateToken | null;
  } catch {
    token = null;
  }
  if (token?.role !== 'ADMIN') return null;
  const check = await checkGateCookieForToken(req.cookies.get(ADMIN_GATE_COOKIE)?.value, { ...token, jti: token.sid ?? token.jti });
  if (check.ok) return null;
  return NextResponse.json(
    {
      success: false,
      code: 'ADMIN_GATE_REQUIRED',
      error: 'Bu işlem için önce yönetici kapısından geçmelisiniz.',
    },
    { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      const res = new NextResponse(null, {
        status: 204,
        headers: { ...PRIVATE_NO_STORE_HEADERS },
      });
      addSecurityHeaders(res, pathname);
      addCorsHeaders(res, req);
      return res;
    }
    // Sıra: CSRF köken denetimi (B5) → bakım modu (panel API'leri 503, yöneticiler muaf) → admin kapısı.
    const blocked = csrfOriginBlock(req) ?? (await maintenanceBlock(req)) ?? (await adminApiGateBlock(req));
    let res: NextResponse;
    if (blocked) res = blocked;
    else if (pathname.startsWith('/api/')) {
      // requireAuth'taki zorunlu admin 2FA denetimi yolu buradan okur; istemci değeri EZİLİR.
      const fwd = new Headers(req.headers);
      fwd.set('x-qx-pathname', pathname);
      res = NextResponse.next({ request: { headers: fwd } });
    } else res = NextResponse.next();
    addSecurityHeaders(res, pathname);
    addCorsHeaders(res, req);
    return res;
  }
  // Bakım modu: müşteri/bayi paneli sayfaları /bakim ekranına yönlenir (yöneticiler muaf).
  const maintenance = await maintenanceBlock(req);
  if (maintenance) {
    addSecurityHeaders(maintenance, pathname);
    return maintenance;
  }
  const res = await (authMiddleware as unknown as (r: NextRequest) => Promise<NextResponse | Response | undefined>)(req);
  return (res as NextResponse) ?? NextResponse.next();
}

export const config = {
  // `/staff` de eşleşir (B15): roleRouteMap'teki STAFF kuralı eskiden matcher dışında kaldığı için
  // ölüydü; personel paneli yalnız layout denetimine dayanıyordu. Kök `/` için STAFF
  // yönlendirmesi (matcher'da `/` hiç yoktu, hiç çalışmıyordu) kaldırıldı.
  matcher: ['/api/:path*', '/admin/:path*', '/admin', '/admin-gate', '/dealer/:path*', '/customer/:path*', '/staff', '/staff/:path*'],
};
