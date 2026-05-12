import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const addStaffSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  jobTitle: z.string().max(50).optional(),
  pinCode: z.string().min(4).max(6).optional(),
});

export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const staff = await prisma.dealerStaff.findMany({
    where: { dealerId, isActive: true },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    success: true,
    staff: staff.map((s) => ({
      id: s.id,
      userId: s.userId,
      jobTitle: s.jobTitle,
      pinCode: s.pinCode ? '****' : null,
      isActive: s.isActive,
      createdAt: s.createdAt,
      user: s.user,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const body = await request.json();
  const parsed = addStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Geçersiz veri' },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (existingUser) {
    const existingLink = await prisma.dealerStaff.findUnique({
      where: { userId: existingUser.id },
    });
    if (existingLink && existingLink.dealerId === dealerId) {
      return NextResponse.json(
        { error: 'Bu e-posta adresi zaten ekli' },
        { status: 400 }
      );
    }
    if (existingLink) {
      return NextResponse.json(
        { error: 'Bu e-posta adresi başka bir işletmeye kayıtlı' },
        { status: 400 }
      );
    }
    const hashedPassword = await bcrypt.hash(parsed.data.password, 12);
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name: parsed.data.name,
        password: hashedPassword,
        role: 'STAFF',
      },
    });
    const staff = await prisma.dealerStaff.create({
      data: {
        dealerId,
        userId: existingUser.id,
        jobTitle: parsed.data.jobTitle ?? null,
        pinCode: parsed.data.pinCode ?? null,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true, createdAt: true },
        },
      },
    });
    return NextResponse.json({ success: true, staff });
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashedPassword,
      role: 'STAFF',
      emailVerified: new Date(),
    },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  });

  const staff = await prisma.dealerStaff.create({
    data: {
      dealerId,
      userId: user.id,
      jobTitle: parsed.data.jobTitle ?? null,
      pinCode: parsed.data.pinCode ?? null,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({ success: true, staff });
}
