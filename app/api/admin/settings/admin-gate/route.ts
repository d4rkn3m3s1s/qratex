import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta, maskIpAddress } from '@/lib/request-metadata';
import { checkRateLimitDb } from '@/lib/rate-limit';
import {
  ADMIN_GATE_AUDIT,
  ADMIN_GATE_AUDIT_ENTITY,
  ADMIN_GATE_COOKIE,
  ADMIN_GATE_SETTING_CATEGORY,
  ADMIN_GATE_SETTING_KEY,
  GATE_LOCK_POLICY,
  adminGateUpdateSchema,
  answerFingerprint,
  defaultGateAnswer,
  hashGateAnswer,
  loadAdminGate,
  newGateSalt,
  notifyAdminsOfGateLock,
  publicGateView,
  publishGateCfgVer,
  readGateLock,
  verifyGateAnswer,
  type StoredAdminGate,
} from '@/lib/admin-gate';
import { elevationCookieOptions, signElevation } from '@/lib/admin-elevation';

export const dynamic = 'force-dynamic';

const GATE_EVENT_ACTIONS = Object.values(ADMIN_GATE_AUDIT);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

function unavailable() {
  return json(
    { success: false, code: 'GATE_UNAVAILABLE', error: 'Gizli kapı ayarları şu anda okunamıyor. Lütfen tekrar deneyin.' },
    503
  );
}

/**
 * GET — Gizli kapının DURUMU. Cevap ya da cevap özeti ASLA dönmez (eskiden düz metin
 * cevap dönüyordu ve kapıyı geçmemiş ADMIN de okuyabiliyordu — P0-01).
 *
 * Yanıt: soru, varsayılan-cevap uyarısı, yapılandırma sürümü, son değiştiren, kilit politikası,
 * son 24 saatin deneme sayıları, kilitli hesaplar ve son kapı olayları.
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const since = new Date(Date.now() - GATE_LOCK_POLICY.longWindowMs);
    const [gate, events, failures24h, passes24h, lockEvents] = await Promise.all([
      loadAdminGate(),
      prisma.auditLog.findMany({
        where: { action: { in: GATE_EVENT_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          action: true,
          createdAt: true,
          ipAddress: true,
          entityId: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where: { action: ADMIN_GATE_AUDIT.FAILED, createdAt: { gte: since } } }),
      prisma.auditLog.count({ where: { action: ADMIN_GATE_AUDIT.PASSED, createdAt: { gte: since } } }),
      prisma.auditLog.findMany({
        where: { action: ADMIN_GATE_AUDIT.LOCKED, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { userId: true, user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    // Hâlâ kilitli olan hesaplar (aynı kişi birden çok kez kilitlenmiş olabilir → tekilleştir).
    const seen = new Set<string>();
    const lockedUsers: Array<{ userId: string; name: string | null; email: string | null; lockedUntil: string }> = [];
    for (const ev of lockEvents) {
      if (!ev.userId || seen.has(ev.userId)) continue;
      seen.add(ev.userId);
      const lock = await readGateLock(prisma, ev.userId);
      if (lock.locked && lock.lockedUntil) {
        lockedUsers.push({
          userId: ev.userId,
          name: ev.user?.name ?? null,
          email: ev.user?.email ?? null,
          lockedUntil: lock.lockedUntil.toISOString(),
        });
      }
    }

    const updatedBy = gate.updatedById
      ? await prisma.user.findUnique({ where: { id: gate.updatedById }, select: { id: true, name: true, email: true } })
      : null;

    return json({
      success: true,
      gate: { ...publicGateView(gate), updatedBy },
      policy: {
        shortMaxFailures: GATE_LOCK_POLICY.shortMaxFailures,
        shortLockMinutes: GATE_LOCK_POLICY.shortLockMs / 60_000,
        longMaxFailures: GATE_LOCK_POLICY.longMaxFailures,
        longLockHours: GATE_LOCK_POLICY.longLockMs / 3_600_000,
        sessionHours: 12,
      },
      stats: { failures24h, passes24h, lockedUsers },
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        createdAt: e.createdAt.toISOString(),
        ip: maskIpAddress(e.ipAddress),
        targetUserId: e.entityId,
        user: e.user ? { id: e.user.id, name: e.user.name, email: e.user.email } : null,
      })),
    });
  } catch {
    return unavailable();
  }
}

type PutOutcome =
  | { kind: 'conflict'; cfgVer: number }
  | { kind: 'locked'; until: Date }
  | { kind: 'wrong_current'; lockedUntil: Date | null; attemptsLeft: number }
  | { kind: 'missing_current' }
  | { kind: 'ok'; gate: StoredAdminGate; answerChanged: boolean };

/**
 * PUT — Soru ve/veya cevabı günceller.
 *  - zod ile KATI doğrulama: geçersiz girdi 400 (eskiden sessizce "7"ye düşüyordu).
 *  - Cevap YALNIZ YAZILIR; değiştirmek için mevcut cevap ZORUNLU. Yanlış mevcut cevap kapı
 *    denemesi sayılır (aynı kilit politikası) — bu uç kaba kuvvet kestirmesi olamaz.
 *  - `expectedCfgVer` ile iyimser kilit (409).
 *  - Cevap değişirse `cfgVer` artar → bütün kapı oturumları düşer; değiştiren admine yeni
 *    çerez verilir (mevcut cevabı kanıtladı).
 */
export async function PUT(request: NextRequest) {
  const auditMeta = getAuditRequestMeta(request);
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;
  const jti = (auth.session as { jti?: string }).jti ?? null;

  const rl = await checkRateLimitDb(`admin-gate-settings:${userId}`, 10, 60_000);
  if (!rl.ok) return json({ success: false, code: 'RATE_LIMITED', error: 'Çok fazla istek. Biraz bekleyin.' }, 429);

  const raw = await request.json().catch(() => null);
  const parsed = adminGateUpdateSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return json(
      {
        success: false,
        code: 'VALIDATION',
        error: first?.message || 'Girilen bilgiler geçersiz.',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400
    );
  }
  const input = parsed.data;

  let outcome: PutOutcome;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'admin-gate-config'}))`;
        const current = await loadAdminGate(tx);
        if (input.expectedCfgVer !== undefined && input.expectedCfgVer !== current.cfgVer) {
          return { kind: 'conflict', cfgVer: current.cfgVer } as const;
        }

        const answerChanged = !!input.newAnswer;
        if (answerChanged) {
          if (!input.currentAnswer) return { kind: 'missing_current' } as const;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-gate-attempt:${userId}`}))`;
          const now = Date.now();
          const lock = await readGateLock(tx, userId, now);
          if (lock.locked && lock.lockedUntil) return { kind: 'locked', until: lock.lockedUntil } as const;
          if (!verifyGateAnswer(current, input.currentAnswer)) {
            await tx.auditLog.create({
              data: {
                userId,
                action: ADMIN_GATE_AUDIT.FAILED,
                entity: ADMIN_GATE_AUDIT_ENTITY,
                entityId: userId,
                newData: { cfgVer: current.cfgVer, via: 'settings' } as Prisma.InputJsonValue,
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
                  newData: { lockedUntil: after.lockedUntil.toISOString(), via: 'settings' } as Prisma.InputJsonValue,
                  ...auditMeta,
                },
              });
            }
            return { kind: 'wrong_current', lockedUntil: after.lockedUntil, attemptsLeft: after.attemptsLeft } as const;
          }
        }

        const nowIso = new Date().toISOString();
        let next: StoredAdminGate = {
          ...current,
          question: input.question,
          updatedAt: nowIso,
          updatedById: userId,
        };
        if (answerChanged) {
          const salt = newGateSalt();
          next = {
            ...next,
            salt,
            answerHash: hashGateAnswer(input.newAnswer!, salt),
            isDefaultAnswer: input.newAnswer === defaultGateAnswer(),
            cfgVer: current.cfgVer + 1,
          };
        }

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
            action: ADMIN_GATE_AUDIT.UPDATED,
            entity: 'Settings',
            entityId: saved.id,
            // Cevap ASLA yazılmaz; yalnız değişip değişmediği ve sır olmadan geri çözülemeyen parmak izi.
            oldData: {
              question: current.question,
              cfgVer: current.cfgVer,
              answerFingerprint: answerFingerprint(current),
            } as Prisma.InputJsonValue,
            newData: {
              question: next.question,
              cfgVer: next.cfgVer,
              answerChanged,
              answerFingerprint: answerFingerprint(next),
            } as Prisma.InputJsonValue,
            ...auditMeta,
          },
        });
        return { kind: 'ok', gate: next, answerChanged } as const;
      },
      { timeout: 10_000 }
    );
  } catch {
    return unavailable();
  }

  switch (outcome.kind) {
    case 'conflict':
      return json(
        {
          success: false,
          code: 'VERSION_CONFLICT',
          cfgVer: outcome.cfgVer,
          error: 'Gizli kapı siz düzenlerken başka bir yönetici tarafından değiştirildi. Güncel hâli yükleyip tekrar deneyin.',
        },
        409
      );
    case 'missing_current':
      return json(
        {
          success: false,
          code: 'CURRENT_ANSWER_REQUIRED',
          error: 'Cevabı değiştirmek için mevcut cevabı girin.',
          details: [{ path: 'currentAnswer', message: 'Mevcut cevap zorunludur.' }],
        },
        400
      );
    case 'locked':
      return json(
        {
          success: false,
          code: 'GATE_LOCKED',
          lockedUntil: outcome.until.toISOString(),
          error: 'Çok fazla yanlış deneme nedeniyle kapı ayarları geçici olarak kilitlendi.',
        },
        423
      );
    case 'wrong_current':
      if (outcome.lockedUntil) await notifyAdminsOfGateLock(userId, outcome.lockedUntil);
      return json(
        {
          success: false,
          code: outcome.lockedUntil ? 'GATE_LOCKED' : 'CURRENT_ANSWER_WRONG',
          lockedUntil: outcome.lockedUntil?.toISOString() ?? null,
          attemptsLeft: outcome.attemptsLeft,
          error: outcome.lockedUntil
            ? 'Mevcut cevap yanlış. Çok fazla yanlış deneme nedeniyle kapı kilitlendi.'
            : 'Mevcut cevap yanlış.',
          details: [{ path: 'currentAnswer', message: 'Mevcut cevap yanlış.' }],
        },
        outcome.lockedUntil ? 423 : 403
      );
    case 'ok':
      break;
  }

  await publishGateCfgVer(outcome.gate.cfgVer);
  const res = json({
    success: true,
    answerChanged: outcome.answerChanged,
    gate: publicGateView(outcome.gate),
  });
  if (outcome.answerChanged) {
    // Değiştiren yönetici mevcut cevabı kanıtladı → yeni sürümle oturumu sürsün.
    try {
      res.cookies.set(
        ADMIN_GATE_COOKIE,
        await signElevation({ userId, cfgVer: outcome.gate.cfgVer, jti }),
        elevationCookieOptions()
      );
    } catch {
      /* imza başarısızsa kullanıcı kapıdan yeniden geçer */
    }
  }
  return res;
}
