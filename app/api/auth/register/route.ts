import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { registerSchema } from '@/lib/validations';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getPointsMatrix, getReferralRewards } from '@/lib/points-rules';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const id = getClientIdentifier(request);
  const limit = checkRateLimit('register', id);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'auth.registerRateLimited' },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          ...(limit.retryAfterMs
            ? { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) }
            : {}),
        },
      }
    );
  }

  try {
    const body = await request.json();

    // Validate input (referralCode is optional, not in schema)
    const validatedData = registerSchema.safeParse(body);
    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { name, email, password, role } = validatedData.data;
    const referralCodeRaw = typeof body.referralCode === 'string' ? body.referralCode.trim().toUpperCase() : null;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Bu email adresi zaten kayıtlı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user (email doğrulama gerekir; emailVerified başta null)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        emailVerified: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Doğrulama token'ı (24 saat geçerli)
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl?.origin || 'http://localhost:3000';
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: verifyToken,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const verifyUrl = `${baseUrl}/auth/verify-email?token=${verifyToken}`;

    // E-posta ile doğrulama linki gönder (RESEND_API_KEY varsa)
    const emailSent = (await sendVerificationEmail(email, verifyUrl, name)).ok;

    // Bildirim: e-posta doğrulama bekleniyor
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'E-postanızı doğrulayın',
        message: 'Giriş yapmak için e-posta doğrulama linkine tıklayın.',
        type: 'success',
      },
    });

    // Apply referral code if provided (same logic as POST /api/referral)
    let referralApplied = false;
    if (referralCodeRaw) {
      const referralCodeRow = await prisma.referralCode.findUnique({
        where: { code: referralCodeRaw },
        include: { user: true },
      });
      if (referralCodeRow && referralCodeRow.userId !== user.id && referralCodeRow.isActive !== false) {
        const limitOk = !referralCodeRow.maxUsage || referralCodeRow.usageCount < referralCodeRow.maxUsage;
        if (limitOk) {
          const pointsMatrix = await getPointsMatrix();
          const { referredPoints: REFERRAL_BONUS, referrerPoints: REFERRER_BONUS } = getReferralRewards(pointsMatrix);
          await prisma.$transaction(async (tx: any) => {
            await tx.referral.create({
              data: {
                referrerId: referralCodeRow.userId,
                referredId: user.id,
                referralCode: referralCodeRow.code,
                status: 'COMPLETED',
                bonusGiven: REFERRAL_BONUS,
                pointsEarned: REFERRER_BONUS,
                completedAt: new Date(),
              },
            });
            await creditPointsAndXp(tx, { userId: user.id, points: REFERRAL_BONUS });
            await creditPointsAndXp(tx, { userId: referralCodeRow.userId, points: REFERRER_BONUS });
            await tx.referralCode.update({
              where: { id: referralCodeRow.id },
              data: { usageCount: { increment: 1 } },
            });
            await tx.notification.createMany({
              data: [
                { userId: user.id, type: 'REFERRAL_BONUS', title: 'Hoş Geldin Bonusu!', message: `Referans kodu ile ${REFERRAL_BONUS} puan kazandın!` },
                { userId: referralCodeRow.userId, type: 'REFERRAL_COMPLETE', title: 'Referans Tamamlandı!', message: `Birisi senin referans kodunu kullandı. ${REFERRER_BONUS} puan kazandın!` },
              ],
            });
          });
          referralApplied = true;
        }
      }
    }

    // Log analytics event
    await prisma.analyticsEvent.create({
      data: {
        userId: user.id,
        event: 'user_registered',
        category: 'auth',
        data: { role, referralApplied },
      },
    });

    return NextResponse.json({
      success: true,
      user,
      referralApplied: referralApplied ? true : undefined,
      verifyUrl,
      emailSent,
      message: emailSent
        ? 'Kayıt başarılı. E-postanıza gönderilen doğrulama linkine tıklayıp giriş yapın.'
        : 'Kayıt başarılı. Giriş yapmak için aşağıdaki doğrulama linkine tıklayın.',
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/auth/register', status: 500 });
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'auth.registerServerError' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

