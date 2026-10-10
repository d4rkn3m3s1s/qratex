import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';
import {
  ADMIN_GATE_AUDIT,
  ADMIN_GATE_AUDIT_ENTITY,
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_SETTING_CATEGORY,
  ADMIN_GATE_SETTING_KEY,
  loadAdminGate,
  publishGateCfgVer,
  type StoredAdminGate,
} from '@/lib/admin-gate';
import { elevationCookieOptions } from '@/lib/admin-elevation';

export const dynamic = 'force-dynamic';

/**
 * POST — "Tüm kapı oturumlarını sonlandır". `cfgVer` artar → bütün yöneticilerin (çağıran
 * dahil) kapı çerezleri anında geçersiz olur; herkes kapıdan yeniden geçer. Sızıntı şüphesinde
 * panik düğmesi — bu yüzden mevcut cevap SORULMAZ. Audit: `ADMIN_GATE_REVOKE_ALL`.
 */
export async function POST(request: NextRequest) {
  const auditMeta = getAuditRequestMeta(request);
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const rl = await checkRateLimitDb(`admin-gate-revoke:${userId}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, code: 'RATE_LIMITED', error: 'Çok fazla istek. Biraz bekleyin.' },
      { status: 429, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  let cfgVer: number;
  try {
    cfgVer = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'admin-gate-config'}))`;
        const current = await loadAdminGate(tx);
        const next: StoredAdminGate = { ...current, cfgVer: current.cfgVer + 1 };
        const saved = await tx.settings.upsert({
          where: { key: ADMIN_GATE_SETTING_KEY },
          update: { value: next as unknown as Prisma.InputJsonValue, category: ADMIN_GATE_SETTING_CATEGORY },
          create: {
            key: ADMIN_GATE_SETTING_KEY,
            value: next as unknown as Prisma.InputJsonValue,
            category: ADMIN_GATE_SETTING_CATEGORY,
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: ADMIN_GATE_AUDIT.REVOKED,
            entity: ADMIN_GATE_AUDIT_ENTITY,
            entityId: saved.id,
            oldData: { cfgVer: current.cfgVer } as Prisma.InputJsonValue,
            newData: { cfgVer: next.cfgVer } as Prisma.InputJsonValue,
            ...auditMeta,
          },
        });
        return next.cfgVer;
      },
      { timeout: 10_000 }
    );
  } catch {
    return NextResponse.json(
      { success: false, code: 'GATE_UNAVAILABLE', error: 'Kapı oturumları şu anda sonlandırılamadı. Lütfen tekrar deneyin.' },
      { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  await publishGateCfgVer(cfgVer);
  const res = NextResponse.json({ success: true, cfgVer, reauth: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  res.cookies.set(ADMIN_GATE_COOKIE, '', { ...elevationCookieOptions(), maxAge: 0 });
  return res;
}
