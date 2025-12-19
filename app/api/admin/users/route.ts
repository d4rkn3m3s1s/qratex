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
  points: z.number().nonnegative().optional(),
  level: z.number().positive().optional(),
  xp: z.number().nonnegative().optional(),
  businessName: z.string().max(100).optional().nullable(),
  businessDesc: z.string().max(500).optional().nullable(),
});

const createUserSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']).default('CUSTOMER'),
  businessName: z.string().max(100).optional(),
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


