import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const vt = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!vt) {
      return NextResponse.json({ success: false, error: 'Geçersiz veya süresi dolmuş link' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (vt.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.json({ success: false, error: 'Doğrulama linkinin süresi dolmuş' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { email: vt.identifier },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.delete({ where: { token } }),
    ]);

    return NextResponse.json({ success: true, message: 'E-posta adresiniz doğrulandı.' }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Verify email error:', error);
    return NextResponse.json({ success: false, error: 'Doğrulama yapılamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
