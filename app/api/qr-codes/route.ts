import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createQRCodeSchema } from '@/lib/validations';
import { generateQRCode } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const skip = (page - 1) * pageSize;

    // Filter by dealer if not admin
    const where = session.user.role === 'ADMIN' 
      ? {} 
      : { dealerId: session.user.id };

    const [qrCodes, total] = await Promise.all([
      prisma.qRCode.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          dealer: {
            select: { id: true, name: true, businessName: true },
          },
          _count: {
            select: { feedbacks: true },
          },
        },
      }),
      prisma.qRCode.count({ where }),
    ]);

    return NextResponse.json({
      items: qrCodes,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Error fetching QR codes:', error);
    return NextResponse.json(
      { error: 'QR kodları getirilemedi' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'DEALER' && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Sadece işletmeler QR kod oluşturabilir' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createQRCodeSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, description } = validatedData.data;

    // Generate unique QR code
    let code = generateQRCode();
    let exists = await prisma.qRCode.findUnique({ where: { code } });
    while (exists) {
      code = generateQRCode();
      exists = await prisma.qRCode.findUnique({ where: { code } });
    }

    const qrCode = await prisma.qRCode.create({
      data: {
        code,
        name,
        description,
        dealerId: session.user.id,
      },
    });

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'qr_code_created',
        category: 'qr',
        data: { qrCodeId: qrCode.id },
      },
    });

    return NextResponse.json({ success: true, qrCode });
  } catch (error) {
    console.error('Error creating QR code:', error);
    return NextResponse.json(
      { error: 'QR kod oluşturulamadı' },
      { status: 500 }
    );
  }
}

