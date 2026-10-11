/**
 * `POST /api/dealer/settings/sessions` — "diğer cihazlardan çık" / "her yerden çık".
 *
 * `User.sessionVersion` artırılır (P0-07): o ana kadar verilmiş bütün JWT'ler `requireAuth`
 * ve `jwt` callback'inde reddedilir; sıcak katman hemen bayatlatılır.
 *  - `others`: bu tarayıcının çerezi yeni `sv` ile yeniden imzalanır → yalnız diğerleri düşer.
 *    Çerez yenilenemezse `reissued: false` döner, istemci yeniden girişe yönlendirir.
 *  - `all`: çerez yenilenmez; istemci ardından `signOut` çağırır.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { defineRoute, successBody } from '@/lib/http/define-route';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { SESSION_MAX_AGE_SECONDS } from '@/lib/auth';
import { bumpSessionVersion, reissueSessionCookie } from '@/lib/auth/session-version';
import { invalidateSessionState } from '@/lib/auth/session-state';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { REVOKE_SESSIONS_ACTION, sessionsRevokeSchema } from '@/lib/dealer-settings/contract';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.settings.sessions',
    roles: ['DEALER'],
    schema: sessionsRevokeSchema,
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
    const headers = { ...PRIVATE_NO_STORE_HEADERS, 'x-request-id': requestId };
    const res = NextResponse.json(successBody({ scope: body.scope, revokedAt: at, reissued: false }, requestId), { headers });
    if (body.scope === 'others') {
      const reissued = await reissueSessionCookie(request, res, { sv }, { maxAge: SESSION_MAX_AGE_SECONDS });
      if (reissued) {
        const final = NextResponse.json(successBody({ scope: body.scope, revokedAt: at, reissued: true }, requestId), { headers });
        for (const c of res.cookies.getAll()) final.cookies.set(c);
        return final;
      }
    }
    return res;
  }
);
