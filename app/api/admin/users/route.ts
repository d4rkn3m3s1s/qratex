import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { parseCursor, encodeCursor } from '@/lib/cursor-pagination';
import { requireAuth } from '@/lib/api-auth';
import { creditPointsAndXp, InsufficientPointsError } from '@/lib/points-wallet';
import { adjustPointsByAdmin, isEconomyError, ADMIN_ADJUST_LIMITS } from '@/lib/economy';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';
import { adminUsersQuerySchema } from '@/lib/validations-admin';
import { anonymizeUser } from '@/lib/gdpr-core';
import { archiveGateResponse, readArchiveIntent } from '@/lib/data-safety/archive';
import { actorFromSession } from '@/lib/data-safety/audit';
import { previewUserErasure } from '@/lib/data-safety/user-erasure';
import { invalidateSessionState } from '@/lib/auth/session-state';


export const dynamic = 'force-dynamic';

const updateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']).optional(),
  // P0-19: `points` / `xp` / `level` burada YOK — bakiyeyi doğrudan ezmek defter dışı
  // mint'ti. Bakiye yalnız PATCH add_points (adjustPointsByAdmin) ile değişir.
  phone: z.string().max(30).optional().nullable(),
  businessName: z.string().max(100).optional().nullable(),
  businessDesc: z.string().max(500).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  image: z.string().optional().nullable(),
  // İç ekip yönetimi — yalnızca ADMIN'e atanır
  adminDepartment: z.string().max(50).optional().nullable(),
  adminTeamRole: z.enum(['yonetici', 'uye']).optional().nullable(),
});

const createUserSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']).default('CUSTOMER'),
  businessName: z.string().max(100).optional(),
});

// Action schemas
// P0-19: admin puan düzeltmesi TEK yoldan (lib/economy#adjustPointsByAdmin). Tam sayı,
// sıfır olamaz, |miktar| ≤ 100.000, gerekçe zorunlu; 10.000 üstü ikinci yöneticinin imzalı
// onay belirteci (POST /api/admin/economy/adjust-approvals) ister. Negatif = bakiyeden düş
// (eksi bakiye imkânsız). `requestId` aynı isteğin tekrarında çift düzeltmeyi önler.
const addPointsSchema = z.object({
  action: z.literal('add_points'),
  userId: z.string().min(1).max(64),
  amount: z
    .number({ invalid_type_error: 'Puan miktarı sayı olmalı' })
    .int('Puan miktarı tam sayı olmalı')
    .refine((n) => n !== 0, 'Puan miktarı sıfır olamaz')
    .refine(
      (n) => Math.abs(n) <= ADMIN_ADJUST_LIMITS.perOperation,
      `Tek işlemde en fazla ${ADMIN_ADJUST_LIMITS.perOperation.toLocaleString('tr-TR')} puan düzeltilebilir`
    ),
  reason: z
    .string({ required_error: 'Puan düzeltmesi için gerekçe yazın' })
    .trim()
    .min(ADMIN_ADJUST_LIMITS.reasonMin, `Gerekçe en az ${ADMIN_ADJUST_LIMITS.reasonMin} karakter olmalı`)
    .max(ADMIN_ADJUST_LIMITS.reasonMax, `Gerekçe en fazla ${ADMIN_ADJUST_LIMITS.reasonMax} karakter olabilir`),
  approvalToken: z.string().max(4000).optional().nullable(),
  requestId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/, 'Geçersiz istek kimliği')
    .optional()
    .nullable(),
});

const addXpSchema = z.object({
  action: z.literal('add_xp'),
  userId: z.string(),
  amount: z.number(),
});

const setLevelSchema = z.object({
  action: z.literal('set_level'),
  userId: z.string(),
  level: z.number().min(1).max(100),
});

const grantBadgeSchema = z.object({
  action: z.literal('grant_badge'),
  userId: z.string(),
  badgeId: z.string(),
});

const revokeBadgeSchema = z.object({
  action: z.literal('revoke_badge'),
  userId: z.string(),
  badgeId: z.string(),
});

const grantRewardSchema = z.object({
  action: z.literal('grant_reward'),
  userId: z.string(),
  rewardId: z.string(),
});

const sendNotificationSchema = z.object({
  action: z.literal('send_notification'),
  userId: z.string(),
  title: z.string(),
  message: z.string(),
  type: z.enum(['info', 'success', 'warning', 'error']).default('info'),
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/users - Get all users
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const queryParsed = adminUsersQuerySchema.safeParse({
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
      search: searchParams.get('search') || undefined,
      role: searchParams.get('role') || undefined,
      cursor: searchParams.get('cursor') || undefined,
    });
    const { page, pageSize, search, role, cursor: cursorParam } = queryParsed.success
      ? queryParsed.data
      : { page: 1, pageSize: 20, search: undefined as string | undefined, role: undefined as string | undefined, cursor: undefined as string | undefined };
    const skip = (page - 1) * pageSize;
    const useCursor = !!cursorParam;

    const where: Record<string, unknown> = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { businessName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const parsed = useCursor ? parseCursor(cursorParam) : undefined;

    const [usersRaw, total] = await Promise.all([
      useCursor
        ? prisma.user.findMany({
            where,
            skip: parsed ? 1 : 0,
            take: pageSize + 1,
            orderBy: { id: 'desc' },
            ...(parsed ? { cursor: { id: parsed.id } } : {}),
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
              phone: true,
              points: true,
              level: true,
              xp: true,
              businessName: true,
              businessDesc: true,
              address: true,
              latitude: true,
              longitude: true,
              emailVerified: true,
              createdAt: true,
              updatedAt: true,
              pricingPlanId: true,
              pricingPlan: { select: { id: true, name: true } },
              _count: {
                select: {
                  feedbacks: true,
                  qrCodes: true,
                  badges: true,
                },
              },
            },
          })
        : prisma.user.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
              phone: true,
              points: true,
              level: true,
              xp: true,
              businessName: true,
              businessDesc: true,
              address: true,
              latitude: true,
              longitude: true,
              emailVerified: true,
              createdAt: true,
              updatedAt: true,
              pricingPlanId: true,
              pricingPlan: { select: { id: true, name: true } },
              _count: {
                select: {
                  feedbacks: true,
                  qrCodes: true,
                  badges: true,
                },
              },
            },
          }),
      prisma.user.count({ where }),
    ]);

    const users = useCursor && usersRaw.length > pageSize ? usersRaw.slice(0, pageSize) : usersRaw;
    const hasMore = useCursor && usersRaw.length > pageSize;
    const lastId = users.length > 0 ? users[users.length - 1]?.id : null;
    const nextCursor = useCursor && hasMore && lastId ? encodeCursor(lastId) : undefined;

    return NextResponse.json({
      items: users,
      total,
      page: useCursor ? undefined : page,
      pageSize,
      totalPages: useCursor ? undefined : Math.ceil(total / pageSize),
      ...(nextCursor && { nextCursor }),
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Kullanıcılar getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/admin/users - Create user
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validatedData = createUserSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { name, email, password, role, businessName } = validatedData.data;

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Bu email adresi zaten kayıtlı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        businessName,
        emailVerified: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'create',
        entity: 'user',
        entityId: user.id,
        newData: { name, email, role },
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, user }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Kullanıcı oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/users - Update user
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID parametresi gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await request.json();
    // Sessizce yok saymak yerine açıkça reddet: istemci bakiyenin değiştiğini sanmasın.
    if (body && typeof body === 'object' && ('points' in body || 'xp' in body || 'level' in body)) {
      return NextResponse.json(
        {
          error: 'Puan, XP ve seviye bu uçtan değiştirilemez. Puan düzeltmesini gerekçeyle "Puan Ekle/Düş" işleminden yapın.',
          code: 'USE_POINTS_ADJUSTMENT',
        },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const validatedData = updateUserSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Check email uniqueness if changing
    if (validatedData.data.email && validatedData.data.email !== existing.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: validatedData.data.email },
      });
      if (emailExists) {
        return NextResponse.json(
          { error: 'Bu email adresi zaten kullanılıyor' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
      }
    }

    // P0-07: rol değişikliği açık oturumları düşürür (eski rolle verilmiş token geçersizleşir).
    const roleChanged = validatedData.data.role !== undefined && validatedData.data.role !== existing.role;
    const user = await prisma.user.update({
      where: { id: userId },
      data: roleChanged ? { ...validatedData.data, sessionVersion: { increment: 1 } } : validatedData.data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        points: true,
        level: true,
        businessName: true,
        businessDesc: true,
        address: true,
        latitude: true,
        longitude: true,
        adminDepartment: true,
        adminTeamRole: true,
        updatedAt: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'update',
        entity: 'user',
        entityId: user.id,
        oldData: {
          name: existing.name,
          email: existing.email,
          role: existing.role,
          points: existing.points,
        },
        newData: validatedData.data,
        ...auditMeta,
      },
    });
    if (roleChanged) await invalidateSessionState(user.id).catch(() => undefined);

    return NextResponse.json({ success: true, user }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Kullanıcı güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/users - Action-based operations
// ─────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'add_points': {
        const data = addPointsSchema.parse(body);
        // Tek-kez: istemcinin istek kimliği (gövde ya da Idempotency-Key başlığı) admin'e
        // bağlanır → çift tıklama / ağ tekrarı ikinci bir düzeltme üretmez.
        const rawRequestId = data.requestId ?? request.headers.get('idempotency-key');
        const requestId =
          rawRequestId && /^[A-Za-z0-9_-]{8,100}$/.test(rawRequestId) ? rawRequestId : null;

        let adjusted;
        try {
          adjusted = await adjustPointsByAdmin(prisma, {
            adminId: session.user.id,
            userId: data.userId,
            delta: data.amount,
            reason: data.reason,
            approvalToken: data.approvalToken ?? null,
            idempotencyKey: requestId ? `admin-adjust:${session.user.id}:${requestId}` : null,
            auditMeta,
          });
        } catch (err) {
          if (err instanceof InsufficientPointsError) {
            return NextResponse.json(
              {
                error: `Kullanıcının bakiyesi yetersiz: mevcut ${err.currentPoints.toLocaleString('tr-TR')} puan, düşülmek istenen ${err.requiredPoints.toLocaleString('tr-TR')} puan.`,
                code: 'INSUFFICIENT_POINTS',
                currentPoints: err.currentPoints,
              },
              { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
            );
          }
          if (isEconomyError(err)) {
            return NextResponse.json(
              { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
              { status: err.httpStatus, headers: PRIVATE_NO_STORE_HEADERS }
            );
          }
          throw err;
        }

        // Bildirim yalnız gerçek (yeni) düzeltmede; tekrar oynatılan istek ikinci kez bildirmez.
        if (!adjusted.duplicate) {
          const abs = Math.abs(data.amount).toLocaleString('tr-TR');
          await prisma.notification
            .create({
              data: {
                userId: data.userId,
                title: data.amount > 0 ? 'Puan Kazandınız! 🎉' : 'Puan Düzeltmesi',
                message:
                  data.amount > 0
                    ? `${abs} puan hesabınıza eklendi: ${data.reason}`
                    : `${abs} puan hesabınızdan düşüldü: ${data.reason}`,
                type: data.amount > 0 ? 'success' : 'warning',
              },
            })
            .catch((e: unknown) => console.error('[admin add_points] bildirim yazılamadı', e));
        }

        return NextResponse.json(
          {
            success: true,
            user: { id: data.userId, points: adjusted.points },
            adjustment: {
              delta: adjusted.delta,
              pointsBefore: adjusted.pointsBefore,
              points: adjusted.points,
              ledgerId: adjusted.ledgerId,
              duplicate: adjusted.duplicate,
            },
          },
          { headers: PRIVATE_NO_STORE_HEADERS }
        );
      }

      case 'add_xp': {
        const data = addXpSchema.parse(body);
        
        // Varlık kontrolü (yalnızca name + existence; xp/level credited'tan gelir).
        const currentUser = await prisma.user.findUnique({
          where: { id: data.userId },
          select: { name: true },
        });

        if (!currentUser) {
          return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // TEK kaynak: creditPointsAndXp (geometrik calculateLevel + atomik artış).
        // Önceden linear floor(xp/1000)+1 ile canonical formülle çelişiyordu.
        // credited zaten güncel xp/level döndürür → ikinci tam-satır fetch kaldırıldı.
        const credited = await creditPointsAndXp(prisma, {
          userId: data.userId,
          xp: data.amount,
        });
        const newXp = credited.xp;
        const newLevel = credited.level;
        const leveledUp = credited.isLevelUp;

        const user = { id: credited.id, name: currentUser.name, xp: newXp, level: newLevel };

        // Notification for XP
        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: leveledUp ? `Seviye Atladınız! 🚀 Seviye ${newLevel}` : 'XP Kazandınız! ⚡',
            message: `${data.amount} XP kazandınız!${leveledUp ? ` Artık Seviye ${newLevel} oldunuz!` : ` Toplam: ${newXp} XP`}`,
            type: 'success',
          },
        });

        return NextResponse.json({ success: true, user, leveledUp, newXp, newLevel }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      case 'set_level': {
        const data = setLevelSchema.parse(body);
        const user = await prisma.user.update({
          where: { id: data.userId },
          data: { 
            level: data.level,
            xp: (data.level - 1) * 1000, // Reset XP to level start
          },
          select: { id: true, name: true, level: true, xp: true },
        });

        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: 'Seviye Güncellendi',
            message: `Seviyeniz ${data.level} olarak ayarlandı`,
            type: 'info',
          },
        });

        return NextResponse.json({ success: true, user }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      case 'grant_badge': {
        const data = grantBadgeSchema.parse(body);
        
        // Tek rozet servisi (P0-14 / §5.3): unique guard, An Motoru anı ve audit aynı tx'te.
        // Admin hediyesi kazanım ödülü basmaz (reward: 'none') — puan düzeltmesi ayrı yoldan.
        const { awardBadgeInTx, AWARD_BADGE_REJECT_MESSAGES } = await import('@/lib/badges/award');
        const granted = await prisma.$transaction(async (tx) => {
          const award = await awardBadgeInTx(tx, {
            userId: data.userId,
            badgeId: data.badgeId,
            source: 'admin',
            reward: 'none',
            requireActive: false,
            actorId: session.user.id,
          });
          if (!award.awarded) return award;
          await tx.auditLog.create({
            data: {
              userId: session.user.id,
              action: 'grant_badge',
              entity: 'user_badge',
              entityId: award.userBadgeId ?? `${data.userId}:${data.badgeId}`,
              newData: { userId: data.userId, badgeId: data.badgeId },
              ...auditMeta,
            },
          });
          return award;
        });

        if (!granted.awarded) {
          const status = granted.reason === 'ALREADY_OWNED' ? 400 : 404;
          const error =
            granted.reason === 'ALREADY_OWNED'
              ? 'Kullanıcı bu rozete zaten sahip'
              : AWARD_BADGE_REJECT_MESSAGES[granted.reason];
          return NextResponse.json({ error }, { status, headers: PRIVATE_NO_STORE_HEADERS });
        }

        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: 'Yeni Rozet Kazandınız! 🏆',
            message: `"${granted.badge.name}" rozetini kazandınız!`,
            type: 'success',
            data: { badgeId: data.badgeId },
          },
        });

        const userBadge = { id: granted.userBadgeId, userId: data.userId, badgeId: data.badgeId, badge: granted.badge };
        return NextResponse.json({ success: true, userBadge }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      case 'revoke_badge': {
        const data = revokeBadgeSchema.parse(body);
        
        const existing = await prisma.userBadge.findUnique({
          where: {
            userId_badgeId: {
              userId: data.userId,
              badgeId: data.badgeId,
            },
          },
          include: { badge: true },
        });

        if (!existing) {
          return NextResponse.json({ error: 'Kullanıcı bu rozete sahip değil' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        await prisma.userBadge.delete({
          where: { id: existing.id },
        });

        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: 'Rozet Kaldırıldı',
            message: `"${existing.badge.name}" rozeti hesabınızdan kaldırıldı`,
            type: 'warning',
          },
        });

        return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      case 'grant_reward': {
        const data = grantRewardSchema.parse(body);
        
        const reward = await prisma.reward.findUnique({
          where: { id: data.rewardId },
        });

        if (!reward) {
          return NextResponse.json({ error: 'Ödül bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Generate unique code for coupon
        const code = `GIFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        const userReward = await prisma.userReward.create({
          data: {
            userId: data.userId,
            rewardId: data.rewardId,
            code: reward.type === 'coupon' ? code : null,
          },
          include: { reward: true },
        });

        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: 'Hediye Ödül! 🎁',
            message: `"${reward.name}" ödülü hesabınıza eklendi!`,
            type: 'success',
            data: { rewardId: data.rewardId, code },
          },
        });

        return NextResponse.json({ success: true, userReward }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      case 'send_notification': {
        const data = sendNotificationSchema.parse(body);
        
        const notification = await prisma.notification.create({
          data: {
            userId: data.userId,
            title: data.title,
            message: data.message,
            type: data.type,
          },
        });

        return NextResponse.json({ success: true, notification }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      default:
        return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
  } catch (error) {
    console.error('Error in user action:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: 'İşlem başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/users - Delete user
// ─────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID parametresi gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // P0-25: hard delete YOK. "Silme" = KVKK anonimleştirmesi (lib/gdpr-core.ts#anonymizeUser).
    // Önceden user.delete → AuditLog/QR/başka müşterilerin yorumları cascade ile gidiyordu.
    const preview = await previewUserErasure(userId, { actorId: session.user.id, context: 'admin' });
    if (!preview) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (preview.alreadyAnonymized) {
      return NextResponse.json(
        { success: true, anonymized: true, alreadyAnonymized: true },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const early = archiveGateResponse(
      preview.impact,
      readArchiveIntent(request),
      'Kullanıcı silinmez, geri döndürülemez biçimde anonimleştirilir. Etkiyi inceleyip isteği confirm=anonymize ile tekrarlayın.'
    );
    if (early) return early;

    const result = await anonymizeUser(userId, {
      actor: actorFromSession(session),
      reason: 'admin_delete',
      request,
    });

    return NextResponse.json(
      {
        success: true,
        anonymized: true,
        alreadyAnonymized: result.alreadyAnonymized,
        archivedQrCodes: result.archivedQrCodes,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    console.error('Error anonymizing user:', error);
    return NextResponse.json(
      { error: 'Kullanıcı silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
