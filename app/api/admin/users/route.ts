import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']).optional(),
  points: z.number().optional(),
  level: z.number().positive().optional(),
  xp: z.number().nonnegative().optional(),
  businessName: z.string().max(100).optional().nullable(),
  businessDesc: z.string().max(500).optional().nullable(),
  image: z.string().optional().nullable(),
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
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const role = searchParams.get('role');
    const search = searchParams.get('search');
    const skip = (page - 1) * pageSize;

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

    const [users, total] = await Promise.all([
      prisma.user.findMany({
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
          points: true,
          level: true,
          xp: true,
          businessName: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
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

    return NextResponse.json({
      items: users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Kullanıcılar getirilemedi' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/admin/users - Create user
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createUserSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, role, businessName } = validatedData.data;

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Bu email adresi zaten kayıtlı' },
        { status: 400 }
      );
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
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Kullanıcı oluşturulamadı' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/users - Update user
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID parametresi gerekli' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updateUserSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
    }

    // Check email uniqueness if changing
    if (validatedData.data.email && validatedData.data.email !== existing.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: validatedData.data.email },
      });
      if (emailExists) {
        return NextResponse.json(
          { error: 'Bu email adresi zaten kullanılıyor' },
          { status: 400 }
        );
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
        points: true,
        level: true,
        businessName: true,
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
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Kullanıcı güncellenemedi' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/users - Action-based operations
// ─────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          },
        });

        return NextResponse.json({ success: true, user });
      }

      case 'add_xp': {
        const data = addXpSchema.parse(body);
        
        // Get current user
        const currentUser = await prisma.user.findUnique({
          where: { id: data.userId },
          select: { xp: true, level: true },
        });

        if (!currentUser) {
          return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
        }

        // Calculate new level (1000 XP per level)
        const currentXp = currentUser.xp || 0;
        const currentLevel = currentUser.level || 1;
        const newXp = currentXp + data.amount;
        const newLevel = Math.floor(newXp / 1000) + 1;
        const leveledUp = newLevel > currentLevel;

        const user = await prisma.user.update({
          where: { id: data.userId },
          data: { 
            xp: newXp,
            level: newLevel,
          },
          select: { id: true, name: true, xp: true, level: true },
        });

        // Notification for XP
        await prisma.notification.create({
          data: {
            userId: data.userId,
            title: leveledUp ? `Seviye Atladınız! 🚀 Seviye ${newLevel}` : 'XP Kazandınız! ⚡',
            message: `${data.amount} XP kazandınız!${leveledUp ? ` Artık Seviye ${newLevel} oldunuz!` : ` Toplam: ${newXp} XP`}`,
            type: 'success',
          },
        });

        return NextResponse.json({ success: true, user, leveledUp, newXp, newLevel });
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

        return NextResponse.json({ success: true, user });
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
          return NextResponse.json({ error: 'Kullanıcı bu rozete zaten sahip' }, { status: 400 });
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
          },
        });

        return NextResponse.json({ success: true, userBadge });
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
          return NextResponse.json({ error: 'Kullanıcı bu rozete sahip değil' }, { status: 400 });
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

        return NextResponse.json({ success: true });
      }

      case 'grant_reward': {
        const data = grantRewardSchema.parse(body);
        
        const reward = await prisma.reward.findUnique({
          where: { id: data.rewardId },
        });

        if (!reward) {
          return NextResponse.json({ error: 'Ödül bulunamadı' }, { status: 404 });
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

        return NextResponse.json({ success: true, userReward });
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

        return NextResponse.json({ success: true, notification });
      }

      default:
        return NextResponse.json({ error: 'Geçersiz işlem' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in user action:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: 'İşlem başarısız' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/users - Delete user
// ─────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID parametresi gerekli' },
        { status: 400 }
      );
    }

    // Prevent self-deletion
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: 'Kendi hesabınızı silemezsiniz' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
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
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Kullanıcı silinemedi' },
      { status: 500 }
    );
  }
}




