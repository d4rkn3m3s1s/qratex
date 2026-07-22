import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { parseCursor, encodeCursor } from '@/lib/cursor-pagination';
import { requireAuth } from '@/lib/api-auth';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';
import { adminUsersQuerySchema } from '@/lib/validations-admin';


export const dynamic = 'force-dynamic';

const updateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']).optional(),
  points: z.number().optional(),
  level: z.number().positive().optional(),
  xp: z.number().nonnegative().optional(),
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
const addPointsSchema = z.object({
  action: z.literal('add_points'),
  userId: z.string(),
  amount: z.number(),
  reason: z.string().optional(),
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

    const user = await prisma.user.update({
      where: { id: userId },
      data: validatedData.data,
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
        const user = await prisma.user.update({
          where: { id: data.userId },
          data: { points: { increment: data.amount } },
          select: { id: true, name: true, points: true },
        });

        // Create notification
        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: data.amount >= 0 ? 'Puan Kazandınız! 🎉' : 'Puan Düşüşü',
            message: data.amount >= 0 
              ? `${data.amount} puan hesabınıza eklendi${data.reason ? `: ${data.reason}` : ''}`
              : `${Math.abs(data.amount)} puan hesabınızdan düşüldü${data.reason ? `: ${data.reason}` : ''}`,
            type: data.amount >= 0 ? 'success' : 'warning',
          },
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'add_points',
            entity: 'user',
            entityId: data.userId,
            newData: { amount: data.amount, reason: data.reason },
            ...auditMeta,
          },
        });

        return NextResponse.json({ success: true, user }, { headers: PRIVATE_NO_STORE_HEADERS });
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
        
        // Check if user already has badge
        const existing = await prisma.userBadge.findUnique({
          where: {
            userId_badgeId: {
              userId: data.userId,
              badgeId: data.badgeId,
            },
          },
        });

        if (existing) {
          return NextResponse.json({ error: 'Kullanıcı bu rozete zaten sahip' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const userBadge = await prisma.userBadge.create({
          data: {
            userId: data.userId,
            badgeId: data.badgeId,
          },
          include: {
            badge: true,
          },
        });

        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: 'Yeni Rozet Kazandınız! 🏆',
            message: `"${userBadge.badge.name}" rozetini kazandınız!`,
            type: 'success',
            data: { badgeId: data.badgeId },
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'grant_badge',
            entity: 'user_badge',
            entityId: userBadge.id,
            newData: { userId: data.userId, badgeId: data.badgeId },
            ...auditMeta,
          },
        });

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

    // Prevent self-deletion
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: 'Kendi hesabınızı silemezsiniz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'delete',
        entity: 'user',
        entityId: userId,
        oldData: {
          name: existing.name,
          email: existing.email,
          role: existing.role,
        },
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Kullanıcı silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}




