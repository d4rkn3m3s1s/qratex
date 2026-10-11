/**
 * Bakım modu — EDGE okuyucusu (proxy). Prisma yok: değer `platform:maintenance` Redis
 * anahtarından okunur; kaynak doğruluk DB'dir (`lib/platform-settings/server.ts` her kayıtta
 * ve /admin/settings her açıldığında Redis'e yayınlar / onarır).
 *
 * Sıcak yol maliyeti: izolat başına 10 sn bellek önbelleği → istek başına Redis çağrısı yok.
 * Redis yapılandırılmamışsa bakım modu UYGULANAMAZ; ayar ekranı bunu açıkça söyler ve anahtarı
 * kilitler (sessiz "açık sandım" yok).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { redisGetJson } from '@/lib/redis';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { parseMaintenance, type MaintenanceState } from '@/lib/platform-settings/registry';

export const MAINTENANCE_REDIS_KEY = 'platform:maintenance';
/** Redis kaydının ömrü — ayar ekranı her açılışta yeniler; bakım açıkken kayıt da yeniler. */
export const MAINTENANCE_REDIS_TTL_SECONDS = 30 * 24 * 60 * 60;
const MEMO_MS = 10_000;

let memo: { at: number; state: MaintenanceState | null } | null = null;

/** Test yardımcı: bellek önbelleğini sıfırla. */
export function __resetMaintenanceMemo(): void {
  memo = null;
}

export async function readMaintenanceEdge(nowMs: number = Date.now()): Promise<MaintenanceState | null> {
  if (memo && nowMs - memo.at < MEMO_MS) return memo.state;
  const raw = await redisGetJson<unknown>(MAINTENANCE_REDIS_KEY);
  const state = raw == null ? null : parseMaintenance(raw);
  memo = { at: nowMs, state };
  return state;
}

/** Bakımın kapsadığı yollar: müşteri/bayi panelleri ve panel API'leri. */
export function maintenanceScope(pathname: string): 'page' | 'api' | null {
  if (pathname.startsWith('/api/customer/') || pathname.startsWith('/api/dealer/') || pathname.startsWith('/api/staff/')) {
    return 'api';
  }
  if (
    pathname === '/customer' ||
    pathname.startsWith('/customer/') ||
    pathname === '/dealer' ||
    pathname.startsWith('/dealer/')
  ) {
    return 'page';
  }
  return null;
}

/**
 * Proxy kancası: bakım açıksa ve istek kapsamdaysa ADMIN olmayan oturumu engeller.
 * Kapsam dışı ya da bakım kapalıysa `null` (istek normal akışına devam eder).
 */
export async function maintenanceBlock(req: NextRequest): Promise<NextResponse | null> {
  const scope = maintenanceScope(req.nextUrl.pathname);
  if (!scope) return null;
  let state: MaintenanceState | null = null;
  try {
    state = await readMaintenanceEdge();
  } catch {
    state = null;
  }
  if (!state?.enabled) return null;

  try {
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET })) as {
      role?: string;
    } | null;
    if (token?.role === 'ADMIN') return null;
  } catch {
    /* oturum çözülemedi → bakım uygulanır */
  }

  if (scope === 'api') {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        code: 'MAINTENANCE',
        error: state.message || 'Platform kısa bir bakımda. Lütfen birazdan tekrar deneyin.',
        message: state.message || 'Platform kısa bir bakımda. Lütfen birazdan tekrar deneyin.',
        retryable: true,
        plannedEndAt: state.plannedEndAt,
      },
      { status: 503, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': '300' } }
    );
  }
  const url = new URL('/bakim', req.url);
  return NextResponse.redirect(url);
}
