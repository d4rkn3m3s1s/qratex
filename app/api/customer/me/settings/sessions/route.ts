import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, successBody } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { SESSION_MAX_AGE_SECONDS } from '@/lib/auth';
import { bumpSessionVersion, reissueSessionCookie } from '@/lib/auth/session-version';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { REVOKE_SESSIONS_ACTION } from '@/lib/customer-settings/load.server';

export const dynamic = 'force-dynamic';

const Body = z.object({ scope: z.enum(['others', 'all']) }).strict();

/**
 * POST /api/customer/me/settings/sessions — "diğer cihazlardan çık" / "her yerden çık".
 *
 * `User.sessionVersion` artırılır (P0-07): o ana kadar verilmiş bütün JWT'ler `requireAuth`
 * ve `jwt` callback'inde reddedilir; sıcak katman (60 sn) hemen bayatlatılır.
 *  - `others`: bu tarayıcının çerezi yeni `sv` ile yeniden imzalanır → yalnız diğerleri düşer.
 *    Çerez yenilenemezse (parçalı çerez vb.) `reissued: false` döner ve istemci kullanıcıyı
 *    yeniden girişe yönlendirir (güvenli taraf).
 *  - `all`: çerez yenilenmez; istemci ardından `signOut` çağırır.
 */
export const POST = defineRoute(
  {
    name: 'customer.me.settings.sessions',
    roles: ['CUSTOMER'],
    schema: Body,
    rateLimit: { max: 6, windowMs: 15 * 60_000, by: 'user' },
  },
  async ({ user, body, request, requestId }) => {
    const sv = await bumpSessionVersion(user.id);
    await invalidateSessionState(user.id).catch(() => undefined);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: REVOKE_SESSIONS_ACTION,
        entity: 'User',
        entityId: user.id,
        newData: { scope: body.scope } as object,
        ...getAuditRequestMeta(request),
      },
    });

    const at = new Date().toISOString();
    const res = NextResponse.json(successBody({ scope: body.scope, revokedAt: at, reissued: false }, requestId), {
      headers: { ...PRIVATE_NO_STORE_HEADERS, 'x-request-id': requestId },
    });
    if (body.scope === 'others') {
      const reissued = await reissueSessionCookie(request, res, { sv }, { maxAge: SESSION_MAX_AGE_SECONDS });
      if (reissued) {
        const payload = successBody({ scope: body.scope, revokedAt: at, reissued: true }, requestId);
        const final = NextResponse.json(payload, { headers: { ...PRIVATE_NO_STORE_HEADERS, 'x-request-id': requestId } });
        for (const c of res.cookies.getAll()) final.cookies.set(c);
        return final;
      }
    }
    return res;
  },
);
