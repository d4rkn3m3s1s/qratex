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

const CORS_ALLOWLIST = (
  process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:3001,https://qratex.netlify.app'
)
  .split(',')
  .map((s) => s.trim());

function addSecurityHeaders(res: NextResponse, pathname: string): void {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // API yanıtı belge açmaz → kamera dahil güçlü özellikler kapalı (lib/admin-gate-edge.ts).
  res.headers.set('Permissions-Policy', permissionsPolicyFor(pathname));
  const csp = [
    "default-src 'self'",
    // blob: + jsdelivr → Tesseract.js OCR worker/wasm (tarayıcıda çalışır, sunucu CPU yakmaz).
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.vercel-insights.com https://va.vercel-scripts.com https://vercel.live https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https: wss: https://*.supabase.co https://*.netlify.app https://vitals.vercel-insights.com https://*.ingest.sentry.io https://vercel.live",
    // Vercel Live preview feedback toolbar iframe'i (yalnız preview'da yüklenir).
    "frame-src 'self' https://vercel.live",
    "frame-ancestors 'none'",
  ].join('; ');
  res.headers.set('Content-Security-Policy', csp);
}

function addCorsHeaders(res: NextResponse, req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (origin && CORS_ALLOWLIST.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
  }
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Access-Control-Max-Age', '86400');
}

type GateToken = { role?: string; sub?: string; id?: string; jti?: string };

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
      const check = await checkGateCookieForToken(gateCookie, token);
      if (!check.ok) {
        const url = new URL('/admin-gate', req.url);
        url.searchParams.set('from', pathname);
        const redirect = NextResponse.redirect(url);
        // Geçersiz/bayat çerezi temizle (sahte değer tarayıcıda kalmasın).
        if (gateCookie) redirect.cookies.set(ADMIN_GATE_COOKIE, '', { path: '/', maxAge: 0 });
        return redirect;
      }
    }

    if (pathname === '/' && token?.role === 'STAFF') {
      return NextResponse.redirect(new URL('/staff', req.url));
    }

    const res = NextResponse.next();
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
  const check = await checkGateCookieForToken(req.cookies.get(ADMIN_GATE_COOKIE)?.value, token);
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
    // Bakım modu (/admin/settings → Bakım): panel API'leri 503, yöneticiler muaf.
    const blocked = (await maintenanceBlock(req)) ?? (await adminApiGateBlock(req));
    const res = blocked ?? NextResponse.next();
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
  matcher: ['/api/:path*', '/admin/:path*', '/admin', '/admin-gate', '/dealer/:path*', '/customer/:path*'],
};
