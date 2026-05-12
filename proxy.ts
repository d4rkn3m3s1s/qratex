import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

const CORS_ALLOWLIST = (
  process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:3001,https://qratex.netlify.app'
)
  .split(',')
  .map((s) => s.trim());

function addSecurityHeaders(res: NextResponse): void {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.vercel-insights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https: wss: https://*.supabase.co https://*.netlify.app https://vitals.vercel-insights.com https://*.ingest.sentry.io",
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

const authMiddleware = withAuth(
  function middleware(req) {
    const token = (req as NextRequest & { nextauth?: { token?: { role?: string } } }).nextauth?.token;
    const pathname = req.nextUrl.pathname;

    const roleRouteMap: Record<string, string> = {
      '/admin': 'ADMIN',
      '/dealer': 'DEALER',
      '/customer': 'CUSTOMER',
      '/staff': 'STAFF',
    };

    for (const [routePrefix, requiredRole] of Object.entries(roleRouteMap)) {
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

    if (pathname === '/' && token?.role === 'STAFF') {
      return NextResponse.redirect(new URL('/staff', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export function proxy(req: NextRequest): ReturnType<typeof authMiddleware> | NextResponse {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      const res = new NextResponse(null, { status: 204 });
      addSecurityHeaders(res);
      addCorsHeaders(res, req);
      return res;
    }
    const res = NextResponse.next();
    addSecurityHeaders(res);
    addCorsHeaders(res, req);
    return res;
  }
  return (authMiddleware as (r: NextRequest) => NextResponse | Promise<NextResponse>)(req);
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*', '/dealer/:path*', '/customer/:path*'],
};
