import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  ADMIN_GATE_AUDIT,
  ADMIN_GATE_AUDIT_ENTITY,
  ADMIN_GATE_COOKIE,
  AdminGateConfigError,
  loadAdminGate,
  notifyAdminsOfGateLock,
  publishGateCfgVer,
  readGateLock,
  verifyGateAnswer,
} from '@/lib/admin-gate';
import { elevationCookieOptions, signElevation } from '@/lib/admin-elevation';
import { parseJsonBody } from '@/lib/http/parse-body';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';

export const dynamic = 'force-dynamic';

const GateBodySchema = z.object({
  answer: z.string({ required_error: 'Cevap gerekli', invalid_type_error: 'Cevap gerekli' }).trim().max(64, 'Cevap çok uzun'),
});

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function unavailable() {
  return json(
    {
      success: false,
      code: 'GATE_UNAVAILABLE',
      error: 'Geçit şu anda doğrulanamıyor. Lütfen birazdan tekrar dene.',
    },
    503
  );
}

function lockedResponse(until: Date) {
  const retryAfterSec = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  const res = json(
    {
      success: false,
      code: 'GATE_LOCKED',
      lockedUntil: until.toISOString(),
      error: 'Geçit kilitlendi. Çok fazla yanlış frekans denendi.',
    },
    423
  );
  res.headers.set('Retry-After', String(retryAfterSec));
  return res;
}

/**
 * GET — Gizli kapı SORUSU + kilit durumu. Cevap (ya da özeti) ASLA dönmez.
 * Yalnız ADMIN; kapıdan muaf (soru ekranı bu uçla açılır).
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN'], { adminGate: false });
  if ('error' in auth) return auth.error;
  try {
    const [gate, lock] = await Promise.all([loadAdminGate(), readGateLock(prisma, auth.session.user.id)]);
    return json({
      success: true,
      question: gate.question,
      locked: lock.locked,
      lockedUntil: lock.lockedUntil?.toISOString() ?? null,
    });
  } catch {
    return unavailable();
  }
}

type AttemptOutcome =
  | { kind: 'locked'; until: Date }
  | { kind: 'wrong'; attemptsLeft: number; lockedUntil: Date | null }
  | { kind: 'ok'; cfgVer: number };

/**
 * POST — `{ answer: "7" }` cevabını sunucuda doğrular.
 *
 *  - Kullanıcı başına advisory kilit altında: kilit kontrolü → doğrulama → audit (yarış yok;
 *    10 paralel istekle bütün rakamları aynı anda denemek mümkün değil).
 *  - Yanlış → `ADMIN_GATE_FAILED`; eşik aşılırsa `ADMIN_GATE_LOCKED` + diğer adminlere bildirim.
 *  - Doğru → `ADMIN_GATE_PASSED` + imzalı, 12 saatlik, oturuma ve güncel cfgVer'e bağlı çerez.
 *  - Yapılandırma/DB okunamazsa 503 (kaynak koddaki varsayılana DÜŞÜLMEZ).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN'], { adminGate: false });
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;
  const jti = (auth.session as { jti?: string }).jti ?? null;
  const auditMeta = getAuditRequestMeta(request);

  // Kaba kuvvet ön filtresi (asıl koruma aşağıdaki kalıcı kilit).
  const rl = await checkRateLimitDb(`admin-gate:${userId}`, 6, 60_000);
  if (!rl.ok) {
    return json({ success: false, code: 'RATE_LIMITED', error: 'Çok hızlı deniyorsun. Biraz bekle.' }, 429);
  }

  // mimari-api B6: gövde zod ile (bozuk JSON / eksik alan deneme hakkı yemez, 400 döner).
  const parsed = await parseJsonBody(request, GateBodySchema, { maxBytes: 4_096 });
  if (!parsed.ok) return parsed.response;
  const answer = parsed.data.answer;

  let outcome: AttemptOutcome;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-gate-attempt:${userId}`}))`;
        const now = Date.now();
        const lock = await readGateLock(tx, userId, now);
        if (lock.locked && lock.lockedUntil) return { kind: 'locked', until: lock.lockedUntil } as const;

        const gate = await loadAdminGate(tx);
        if (verifyGateAnswer(gate, answer)) {
          await tx.auditLog.create({
            data: {
              userId,
              action: ADMIN_GATE_AUDIT.PASSED,
              entity: ADMIN_GATE_AUDIT_ENTITY,
              entityId: userId,
              newData: { cfgVer: gate.cfgVer } as Prisma.InputJsonValue,
              ...auditMeta,
            },
          });
          return { kind: 'ok', cfgVer: gate.cfgVer } as const;
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: ADMIN_GATE_AUDIT.FAILED,
            entity: ADMIN_GATE_AUDIT_ENTITY,
            entityId: userId,
            // Girilen değer YAZILMAZ (doğruya bir rakam uzaklıktaki tahminler de sır sayılır).
            newData: { cfgVer: gate.cfgVer } as Prisma.InputJsonValue,
            ...auditMeta,
          },
        });
        const after = await readGateLock(tx, userId, now);
        if (after.locked && after.lockedUntil) {
          await tx.auditLog.create({
            data: {
              userId,
              action: ADMIN_GATE_AUDIT.LOCKED,
              entity: ADMIN_GATE_AUDIT_ENTITY,
              entityId: userId,
              newData: {
                lockedUntil: after.lockedUntil.toISOString(),
                failures24h: after.failures24h,
              } as Prisma.InputJsonValue,
              ...auditMeta,
            },
          });
        }
        return { kind: 'wrong', attemptsLeft: after.attemptsLeft, lockedUntil: after.lockedUntil } as const;
      },
      { timeout: 10_000 }
    );
  } catch (e) {
    if (e instanceof AdminGateConfigError) return unavailable();
    return unavailable();
  }

  if (outcome.kind === 'locked') return lockedResponse(outcome.until);

  if (outcome.kind === 'wrong') {
    if (outcome.lockedUntil) {
      await notifyAdminsOfGateLock(userId, outcome.lockedUntil);
      return lockedResponse(outcome.lockedUntil);
    }
    return json(
      {
        success: false,
        code: 'GATE_WRONG',
        attemptsLeft: outcome.attemptsLeft,
        error:
          outcome.attemptsLeft <= 1
            ? 'Yanlış frekans. Bir yanlış daha geçidi kilitler.'
            : 'Yanlış frekans. Evrenin sırrını çözemedin.',
      },
      403
    );
  }

  let cookieValue: string;
  try {
    cookieValue = await signElevation({ userId, cfgVer: outcome.cfgVer, jti });
  } catch {
    return unavailable();
  }
  await publishGateCfgVer(outcome.cfgVer);
  const res = json({ success: true });
  res.cookies.set(ADMIN_GATE_COOKIE, cookieValue, elevationCookieOptions());
  return res;
}

/** DELETE — Kapı oturumunu kapatır (çerezi siler). Çıkışta ya da "kilitle" düğmesiyle. */
export async function DELETE() {
  const auth = await requireAuth(['ADMIN'], { adminGate: false });
  if ('error' in auth) return auth.error;
  const limited = await enforceRouteRateLimit('admin.gate.delete', auth.session.user.id, 'mutation');
  if (limited) return limited;
  const res = json({ success: true });
  res.cookies.set(ADMIN_GATE_COOKIE, '', { ...elevationCookieOptions(), maxAge: 0 });
  return res;
}
