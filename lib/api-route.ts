/**
 * API route sarıcısı (opt-in, geriye uyumlu). 234 route'un her biri kendi
 * requireAuth + 'error' in auth kontrolü + try/catch + responseIfDatabaseUnavailable
 * + 500 iskeletini tekrar yazıyordu. createApiRoute bu boilerplate'i merkeze alır:
 *
 *   export const GET = createApiRoute(['ADMIN'], async ({ session, request }) => {
 *     const data = await prisma.user.findMany(...);
 *     return jsonOk({ data });
 *   });
 *
 * - roles verilmezse auth ZORUNLU değildir (public route'lar için null geç).
 * - handler bir NextResponse döndürür; fırlatılan hatalar standart biçimde
 *   yakalanır (DB erişilemezse responseIfDatabaseUnavailable, aksi halde 500).
 * - Mevcut route'lar dokunulmadan çalışır; bu yalnızca yeni/migre edilen route'lar
 *   içindir.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { requireAuth, type AllowedRole } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export interface ApiContext<P = unknown> {
  request: NextRequest;
  /** Auth gerekliyse oturum; public route'ta null. */
  session: Session | null;
  /** Next.js dinamik segment paramları (varsa). */
  params: P;
}

type Handler<P> = (ctx: ApiContext<P>) => Promise<NextResponse> | NextResponse;

/** Standart başarılı JSON yanıtı (no-store başlıklarıyla). */
export function jsonOk(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...PRIVATE_NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  });
}

/** Standart hata JSON yanıtı (no-store başlıklarıyla). */
export function jsonError(message: string, status = 400, init?: ResponseInit): NextResponse {
  return NextResponse.json(
    { error: message },
    { ...init, status, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(init?.headers ?? {}) } }
  );
}

/**
 * Auth + standart hata yönetimini saran route fabrikası.
 * @param roles İzinli roller; null/[] ise auth atlanır (public).
 * @param handler İş mantığı; ctx.session (auth varsa) + request + params alır.
 */
export function createApiRoute<P = Record<string, string>>(
  roles: AllowedRole[] | null,
  handler: Handler<P>
) {
  // Next 16 route tip-jeneratörü ikinci argümanın imzasını katı kontrol eder
  // (opsiyonel/dar tip kabul etmez). `context: any` ile jeneratörü tatmin ederiz;
  // runtime davranışı aynıdır (Next param'sız route'ta da bir context geçirir).
  return async (request: NextRequest, context: any): Promise<NextResponse> => {
    let session: Session | null = null;
    if (roles && roles.length > 0) {
      const auth = await requireAuth(roles);
      if ('error' in auth) return auth.error;
      session = auth.session;
    }

    const rawParams = context?.params;
    const params = (rawParams ? await rawParams : {}) as P;

    try {
      return await handler({ request, session, params });
    } catch (error) {
      const db = responseIfDatabaseUnavailable(error);
      if (db) return db;
      console.error('[API_ROUTE]', request.method, request.nextUrl?.pathname, error);
      return jsonError('Sunucu hatası', 500);
    }
  };
}
