import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Role-based route protection
    const roleRouteMap: Record<string, string> = {
      '/admin': 'ADMIN',
      '/dealer': 'DEALER',
      '/customer': 'CUSTOMER',
    };

    for (const [routePrefix, requiredRole] of Object.entries(roleRouteMap)) {
      if (pathname.startsWith(routePrefix) && token?.role !== requiredRole) {
        // Kullanıcı giriş yapmış ama yetkisi yok → kendi rolüne yönlendir
        if (token?.role) {
          const roleRedirects: Record<string, string> = {
            ADMIN: '/admin',
            DEALER: '/dealer',
            CUSTOMER: '/customer',
          };
          return NextResponse.redirect(new URL(roleRedirects[token.role as string] || '/', req.url));
        }
        // Giriş yapmamış → login sayfasına yönlendir (error parametresi olmadan)
        return NextResponse.redirect(new URL('/auth/login', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  // /c/[token] route'u public - kart aktivasyonu için
  // /api/cards/[token] route'u public - kart bilgisi için
  matcher: ['/admin/:path*', '/dealer/:path*', '/customer/:path*'],
};

