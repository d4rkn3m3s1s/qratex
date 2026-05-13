import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { createQRCodeSchema } from '@/lib/validations';
import { generateQRCode } from '@/lib/utils';
import {
  PRIVATE_NO_STORE_HEADERS,
  clampPageParam,
  clampPageSizeParam,
  paginationSkip,
  responseIfDatabaseUnavailable,
} from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const page = clampPageParam(searchParams.get('page'));
    const pageSize = clampPageSizeParam(searchParams.get('pageSize'), 10, 100);
    const skip = paginationSkip(page, pageSize);

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

    return NextResponse.json(
      {
        items: qrCodes,
        total,
        page,
        pageSize,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching QR codes:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'QR kodları getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    if (session.user.role !== 'DEALER' && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Sadece işletmeler QR kod oluşturabilir' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const validatedData = createQRCodeSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
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

    return NextResponse.json({ success: true, qrCode }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating QR code:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'QR kod oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

