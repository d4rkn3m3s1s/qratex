import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Admin routes - only ADMIN role
    if (pathname.startsWith('/admin')) {
      if (token?.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/auth/login?error=unauthorized', req.url));
      }
    }

    // Dealer routes - only DEALER role
    if (pathname.startsWith('/dealer')) {
      if (token?.role !== 'DEALER') {
        return NextResponse.redirect(new URL('/auth/login?error=unauthorized', req.url));
      }
    }

    // Customer routes - only CUSTOMER role
    if (pathname.startsWith('/customer')) {
      if (token?.role !== 'CUSTOMER') {
        return NextResponse.redirect(new URL('/auth/login?error=unauthorized', req.url));
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
  matcher: ['/admin/:path*', '/dealer/:path*', '/customer/:path*'],
};

