import { NextResponse, type NextRequest } from 'next/server';
import { getOptionalSession } from '@/lib/api-auth';
import { roleHome } from '@/lib/auth/post-login-target';

/**
 * PWA başlangıç yönlendiricisi (mobil-erisilebilirlik-i18n B10). Kurulu uygulama `start_url`
 * ile buraya açılır: oturum varsa rolün ana sayfası (müşteri → /customer, işletme → /dealer,
 * personel → /staff, yönetici → /admin), yoksa giriş ekranı. Eskiden `start_url: "/"` kurulu
 * uygulamayı her açılışta pazarlama landing'ine (en ağır sayfa) düşürüyordu.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getOptionalSession().catch(() => null);
  const role = (session?.user as { role?: string } | undefined)?.role ?? null;
  const target = session?.user ? roleHome(role) : '/auth/login?callbackUrl=%2Fapp';
  const res = NextResponse.redirect(new URL(target, request.nextUrl.origin), 307);
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
