import { permanentRedirect } from 'next/navigation';
import { sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { parseAuthError } from '@/lib/auth/login-errors';

/**
 * `/auth/signin` → `/auth/login` kalıcı yönlendirme (308).
 * Kod tabanında ~25 sunucu sayfası oturumsuz kullanıcıyı `/auth/signin`'e atıyordu; bu rota
 * yoktu (404). `callbackUrl` yalnız güvenli YOL olarak, `error` yalnız bilinen kod olarak taşınır.
 */
export default async function SignInRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  const cb = typeof sp.callbackUrl === 'string' ? sanitizeCallbackPath(sp.callbackUrl, null) : null;
  if (cb) qs.set('callbackUrl', cb);
  const err = typeof sp.error === 'string' ? parseAuthError(sp.error) : null;
  if (err && err.code !== 'UNKNOWN') qs.set('error', sp.error as string);
  const query = qs.toString();
  permanentRedirect(query ? `/auth/login?${query}` : '/auth/login');
}
