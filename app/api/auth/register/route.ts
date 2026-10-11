import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { registerSchema } from '@/lib/validations';
import { checkRateLimitDb, getClientIdentifier } from '@/lib/rate-limit';
import { normalizeEmail, emailLookupFilter } from '@/lib/auth/normalize-email';
import { createPendingReferral, normalizeReferralCode } from '@/lib/referral';
import { sendVerificationEmail } from '@/lib/email';
import { buildEmailVerifyUrl, issueEmailVerificationToken } from '@/lib/auth-email-token';
import { isRegistrationOpen } from '@/lib/platform-settings/flags';

/**
 * POST /api/auth/register — e-posta ile hesap açar; HER ZAMAN e-posta doğrulaması ister.
 *
 * Yanıt sözleşmesi (istemci metni kodlardan TR/EN üretir; sabit Türkçe cümle dönmez):
 *   200 { success, requiresVerification: true, emailSent, referralPending?, verifyUrl? (yalnız dev + gönderilemediyse) }
 *   400 { success: false, code: 'VALIDATION', error: '<validation.* anahtarı>', field }
 *   409 { success: false, code: 'EMAIL_TAKEN', error: 'auth.emailAlreadyRegistered' }
 *   403 { success: false, code: 'REGISTRATION_CLOSED', error: 'auth.registrationClosed' } (yönetici kaydı kapattı)
 *   429 { success: false, code: 'RATE_LIMITED', error: 'auth.registerRateLimited', retryAfterSec }
 *   500 { success: false, code: 'INTERNAL', error: 'auth.registerServerError' }
 *
 * Doğrulama token'ı hash'li `AuthEmailToken` (eskiden düz metin `VerificationToken`); davet
 * kodu yalnız BEKLEYEN davet yazar (P0-16, puan doğrulama + ilk QR sonrası). Dil tercihi
 * (`locale`) hesaba yazılır; bildirim metni o dilde.
 */
const NOTIFY_COPY = {
  tr: { title: 'E-postanı doğrula', message: 'Hesabını açmak için e-postana gönderdiğimiz doğrulama bağlantısına tıkla.' },
  en: { title: 'Verify your email', message: 'Click the verification link we emailed you to activate your account.' },
} as const;

function json(body: Record<string, unknown>, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(extra ?? {}) } });
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002';
}

export async function POST(request: NextRequest) {
  const id = getClientIdentifier(request);
  const limit = await checkRateLimitDb(`register:${id}`, 5, 60_000);
  if (!limit.ok) {
    const sec = Math.max(1, Math.ceil((limit.retryAfterMs ?? 60_000) / 1000));
    return json(
      { success: false, code: 'RATE_LIMITED', error: 'auth.registerRateLimited', retryAfterSec: sec },
      429,
      { 'Retry-After': String(sec) }
    );
  }

  // Yönetici "Yeni kayıtlar" anahtarını kapattıysa (/admin/settings → Kimlik) kayıt reddedilir.
  if (!(await isRegistrationOpen())) {
    return json({ success: false, code: 'REGISTRATION_CLOSED', error: 'auth.registrationClosed' }, 403);
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const validatedData = registerSchema.safeParse(body ?? {});
    if (!validatedData.success) {
      const first = validatedData.error.errors[0];
      return json(
        { success: false, code: 'VALIDATION', error: first?.message ?? 'validation.register.emailInvalid', field: first?.path?.[0] ?? null },
        400
      );
    }

    const { name, password, role } = validatedData.data;
    // Tek kanonik e-posta (büyük/küçük harf ve görünmez karakterle ikinci hesap açılamasın).
    const email = normalizeEmail(validatedData.data.email);
    const referralCode = normalizeReferralCode(body?.referralCode);
    const locale: 'tr' | 'en' = body?.locale === 'en' ? 'en' : 'tr';

    // Geçiş dönemi: normalize edilmemiş eski kayıtlar da bulunur.
    const existingUser = await prisma.user.findFirst({
      where: { email: emailLookupFilter(email) },
      select: { id: true },
    });
    if (existingUser) {
      return json({ success: false, code: 'EMAIL_TAKEN', error: 'auth.emailAlreadyRegistered' }, 409);
    }

    const hashedPassword = await hashPassword(password);

    let user: { id: string; name: string | null; email: string; role: string; createdAt: Date };
    try {
      user = await prisma.user.create({
        data: { name, email, password: hashedPassword, role, emailVerified: null, preferredLanguage: locale },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
    } catch (error) {
      // Varlık kontrolü ile oluşturma arasındaki yarış: 500 yerine "zaten kayıtlı".
      if (isUniqueViolation(error)) {
        return json({ success: false, code: 'EMAIL_TAKEN', error: 'auth.emailAlreadyRegistered' }, 409);
      }
      throw error;
    }

    // Doğrulama bağlantısı (hash'li, 24 saat). Üretim/gönderim hatası hesabı geri almaz:
    // kullanıcı "yeniden gönder" ile devam eder (ekranda dürüstçe "gönderilemedi" yazar).
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl?.origin || 'http://localhost:3000';
    let verifyUrl: string | null = null;
    let emailSent = false;
    try {
      const plain = await issueEmailVerificationToken(user.id);
      verifyUrl = buildEmailVerifyUrl(baseUrl, plain);
      emailSent = (await sendVerificationEmail(email, verifyUrl, name)).ok;
    } catch (error) {
      const { captureApiError } = await import('@/lib/capture-api-error');
      captureApiError(error, { route: 'POST /api/auth/register (verify token)', status: 500 });
    }

    await prisma.notification
      .create({ data: { userId: user.id, title: NOTIFY_COPY[locale].title, message: NOTIFY_COPY[locale].message, type: 'info' } })
      .catch(() => undefined);

    // Davet kodu (P0-16): kayıtta yalnız BEKLEYEN davet yazılır, PUAN VERİLMEZ.
    let referralPending = false;
    if (referralCode) {
      try {
        const ref = await createPendingReferral({ referredUserId: user.id, code: referralCode });
        referralPending = ref.ok;
      } catch (e) {
        console.error('[REGISTER_REFERRAL]', e);
      }
    }

    await prisma.analyticsEvent
      .create({ data: { userId: user.id, event: 'user_registered', category: 'auth', data: { role, referralPending, emailSent } } })
      .catch(() => undefined);

    // Doğrulama token'ını yanıtta yalnız e-posta GÖNDERİLEMEDİĞİNDE ve production DIŞINDA ver
    // (aksi halde "gelen kutusuna erişim" doğrulaması anlamsızlaşır).
    const exposeVerifyUrl = !emailSent && !!verifyUrl && process.env.NODE_ENV !== 'production';

    return json({
      success: true,
      requiresVerification: true,
      user: { id: user.id, role: user.role },
      referralPending: referralPending ? true : undefined,
      emailSent,
      ...(exposeVerifyUrl ? { verifyUrl } : {}),
    });
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/auth/register', status: 500 });
    console.error('Registration error:', error);
    return json({ success: false, code: 'INTERNAL', error: 'auth.registerServerError' }, 500);
  }
}
