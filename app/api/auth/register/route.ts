import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { registerSchema } from '@/lib/validations';
import { checkRateLimitDb, getClientIdentifier } from '@/lib/rate-limit';
import { normalizeEmail, emailLookupFilter } from '@/lib/auth/normalize-email';
import { createPendingReferral, normalizeReferralCode } from '@/lib/referral';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const id = getClientIdentifier(request);
  const limit = await checkRateLimitDb(`register:${id}`, 5, 60_000);
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

    const { name, password, role } = validatedData.data;
    // Tek kanonik e-posta (büyük/küçük harf ve görünmez karakterle ikinci hesap açılamasın).
    const email = normalizeEmail(validatedData.data.email);
    const referralCode = normalizeReferralCode(body.referralCode);

    // Check if user exists (geçiş dönemi: normalize edilmemiş eski kayıtlar da bulunur)
    const existingUser = await prisma.user.findFirst({
      where: { email: emailLookupFilter(email) },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Bu e-posta adresi zaten kayıtlı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

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

    // Davet kodu (P0-16): kayıtta yalnız BEKLEYEN davet yazılır, PUAN VERİLMEZ. Ödül, e-posta
    // doğrulanıp ilk QR olayı gerçekleşince `qualifyReferral` ile tek seferlik verilir. Modül
    // kapısı, limitler ve karşılıklı davet reddi servis içinde (lib/referral.ts).
    let referralPending = false;
    if (referralCode) {
      try {
        const ref = await createPendingReferral({ referredUserId: user.id, code: referralCode });
        referralPending = ref.ok;
      } catch (e) {
        // Davet kaydı başarısız olsa da hesap açıldı; kayıt akışını bozma.
        console.error('[REGISTER_REFERRAL]', e);
      }
    }

    // Log analytics event
    await prisma.analyticsEvent.create({
      data: {
        userId: user.id,
        event: 'user_registered',
        category: 'auth',
        data: { role, referralPending },
      },
    });

    // verifyUrl'i (doğrulama token'ı içerir) yalnızca e-posta GÖNDERİLEMEDİĞİNDE
    // ve production DIŞINDA döndür — aksi halde token'ı HTTP yanıtında sızdırmak
    // "inbox'a erişim" doğrulamasını anlamsız kılar.
    const exposeVerifyUrl = !emailSent && process.env.NODE_ENV !== 'production';

    return NextResponse.json({
      success: true,
      user,
      // Bonus kayıtta verilmez; davet beklemede (doğrulama + ilk QR sonrası işlenir).
      referralPending: referralPending ? true : undefined,
      ...(exposeVerifyUrl ? { verifyUrl } : {}),
      emailSent,
      message: emailSent
        ? referralPending
          ? 'Kayıt başarılı. E-postanı doğrulayıp ilk QR deneyimini tamamladığında davet ödülün hesabına işlenecek.'
          : 'Kayıt başarılı. E-postanıza gönderilen doğrulama linkine tıklayıp giriş yapın.'
        : 'Kayıt başarılı. E-posta gönderimi yapılandırılmamış; lütfen yöneticinizle iletişime geçin.',
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/auth/register', status: 500 });
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'auth.registerServerError' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

