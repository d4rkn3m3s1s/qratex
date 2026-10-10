'use client';

import { useAppLocale } from '@/lib/app-locale';
import type { AuthErrorKind } from '@/lib/auth/login-errors';

/**
 * Kimlik akışlarının (giriş, kayıt doğrulama, magic link, hata sayfası) yeni metinleri —
 * TR/EN. Paylaşılan i18n kataloğuna dokunmadan iki dilli çalışır (components/states/copy.ts
 * deseni). Mevcut `auth.*` anahtarları sayfalarda `t()` ile kullanılmaya devam eder.
 */
type ErrorCopy = { title: string; body: string };

type AuthCopy = {
  errors: Record<AuthErrorKind, ErrorCopy>;
  waitSeconds: (sec: number) => string;
  resend: string;
  resendIn: (sec: number) => string;
  resendSent: string;
  resendFailed: string;
  mailUnavailable: string;
  verifyPendingTitle: string;
  verifyPendingBody: (email: string) => string;
  verifyPendingGeneric: string;
  verifyPendingSpamHint: string;
  verifyPendingWrongEmail: string;
  verifyPendingOpenGmail: string;
  verifyPendingOpenOutlook: string;
  verifyPendingDevLink: string;
  verifyPendingEmailLabel: string;
  verifyPendingEmailSent: string;
  verifyPendingEmailNotSent: string;
  verifyReferralPending: string;
  verifySuccessTitle: string;
  verifySuccessBody: string;
  verifyAlreadyTitle: string;
  verifyAlreadyBody: string;
  verifyExpiredTitle: string;
  verifyExpiredBody: (masked: string) => string;
  verifyInvalidTitle: string;
  verifyInvalidBody: string;
  verifyNetworkTitle: string;
  verifyNetworkBody: string;
  verifyWorking: string;
  continueToLogin: string;
  backToLogin: string;
  tryAgain: string;
  noticeVerified: string;
  noticePasswordReset: string;
  noticeRegistered: string;
  twoFactorTitle: string;
  twoFactorBody: string;
  twoFactorOAuthBody: string;
  twoFactorLabel: string;
  twoFactorSubmit: string;
  twoFactorCodeShort: string;
  magicWorkingTitle: string;
  magicWorkingBody: string;
  magicDoneBody: string;
  magicErrorTitle: string;
  magicNewLink: string;
  errorPageTitle: string;
  errorPageHelp: string;
  completeReferralTitle: (points: number) => string;
  completeReferralPendingTitle: string;
  completeReferralFailedTitle: string;
  completeReferralFailedBody: string;
  completeReferralLink: string;
  completeDealerTitle: string;
  completeDealerBody: string;
  completeDealerContinue: string;
  completeAccountTitle: string;
  completeAccountBody: (provider: string) => string;
  completePasswordLabel: string;
  completePasswordPlaceholder: string;
  completePasswordSave: string;
  completePasswordSkip: string;
  completePasswordMin: string;
  completePasswordFailed: string;
  showPassword: string;
  hidePassword: string;
  magicLinkEmailLabel: string;
  magicLinkUnavailable: string;
  magicLinkDisabled: string;
  invalidEmail: string;
  registerInviteLine: string;
  registerDealerOAuthHint: string;
};

function formatWait(sec: number, locale: 'tr' | 'en'): string {
  const s = Math.max(1, Math.ceil(sec));
  if (s < 90) return locale === 'en' ? `${s} seconds` : `${s} saniye`;
  const m = Math.ceil(s / 60);
  return locale === 'en' ? `${m} minute${m === 1 ? '' : 's'}` : `${m} dakika`;
}

const SOCIAL_GENERIC_TR: ErrorCopy = {
  title: 'Sosyal giriş tamamlanamadı',
  body: 'Google ya da GitHub ile girişte bir sorun oluştu. Lütfen tekrar dene veya e-posta ile giriş yap.',
};
const SOCIAL_GENERIC_EN: ErrorCopy = {
  title: 'Social sign-in could not be completed',
  body: 'Something went wrong while signing in with Google or GitHub. Please try again or use your email.',
};

const TR: AuthCopy = {
  errors: {
    MISSING_CREDENTIALS: { title: 'Bilgiler eksik', body: 'E-posta adresini ve şifreni gir.' },
    INVALID_CREDENTIALS: { title: 'Giriş yapılamadı', body: 'E-posta veya şifre hatalı.' },
    EMAIL_NOT_VERIFIED: {
      title: 'E-posta adresin henüz doğrulanmadı',
      body: 'Kayıt olurken gönderdiğimiz bağlantıya tıkla. Bulamıyorsan yeni bir bağlantı gönderebiliriz.',
    },
    LOCKED: {
      title: 'Giriş geçici olarak kilitlendi',
      body: 'Çok fazla hatalı deneme yapıldı. Güvenliğin için {{time}} sonra tekrar deneyebilirsin. Şifreni hatırlamıyorsan sıfırlayabilirsin.',
    },
    RATE_LIMITED: { title: 'Biraz yavaşla', body: 'Çok hızlı deneme yapıldı. {{time}} sonra tekrar dene.' },
    '2FA_REQUIRED': { title: 'Doğrulama kodu gerekli', body: 'Hesabında iki adımlı doğrulama açık.' },
    INVALID_2FA: {
      title: 'Kod hatalı',
      body: 'Doğrulama uygulamandaki güncel 6 haneli kodu ya da kullanılmamış bir kurtarma kodunu dene.',
    },
    INVALID_LINK: {
      title: 'Bağlantı geçersiz',
      body: 'Bu bağlantı geçersiz, daha önce kullanılmış ya da süresi dolmuş. Yeni bir bağlantı isteyebilirsin.',
    },
    ACCOUNT_SUSPENDED: {
      title: 'Hesap kullanıma kapalı',
      body: 'Bu hesap şu anda askıya alınmış durumda. Bir yanlışlık olduğunu düşünüyorsan destek ekibiyle iletişime geç.',
    },
    AccountSuspended: {
      title: 'Hesap kullanıma kapalı',
      body: 'Bu hesap şu anda askıya alınmış durumda. Bir yanlışlık olduğunu düşünüyorsan destek ekibiyle iletişime geç.',
    },
    OAuthAccountNotLinked: {
      title: 'Bu e-posta başka bir yöntemle kayıtlı',
      body: 'Bu adresle zaten bir hesap var. Hesabının güvenliği için lütfen ilk kullandığın yöntemle (e-posta ve şifre ya da Google) giriş yap.',
    },
    OAuthEmailUnverified: {
      title: 'E-posta doğrulanmamış',
      body: 'Google hesabındaki e-posta adresi doğrulanmamış görünüyor. Google’da e-postanı doğruladıktan sonra tekrar dene.',
    },
    OAuthNoEmail: {
      title: 'E-posta paylaşılmadı',
      body: 'Giriş sağlayıcısı e-posta adresini paylaşmadı. E-posta ve şifreyle kayıt olabilir ya da giriş yapabilirsin.',
    },
    OAuthSignin: SOCIAL_GENERIC_TR,
    OAuthCallback: SOCIAL_GENERIC_TR,
    OAuthCreateAccount: SOCIAL_GENERIC_TR,
    Callback: SOCIAL_GENERIC_TR,
    AccessDenied: {
      title: 'Giriş iptal edildi',
      body: 'Giriş isteği iptal edildi ya da erişim reddedildi. İstersen tekrar deneyebilirsin.',
    },
    Verification: {
      title: 'Bağlantının süresi dolmuş',
      body: 'Giriş bağlantısının süresi dolmuş ya da daha önce kullanılmış. Yeni bir bağlantı iste.',
    },
    Configuration: {
      title: 'Geçici bir sorun var',
      body: 'Giriş sisteminde geçici bir yapılandırma sorunu oluştu. Lütfen biraz sonra tekrar dene.',
    },
    SessionRequired: { title: 'Giriş gerekli', body: 'Bu sayfayı görmek için giriş yapmalısın.' },
    CredentialsSignin: { title: 'Giriş yapılamadı', body: 'E-posta veya şifre hatalı.' },
    UNKNOWN: { title: 'Giriş yapılamadı', body: 'Beklenmeyen bir sorun oluştu. Lütfen tekrar dene.' },
  },
  waitSeconds: (sec) => formatWait(sec, 'tr'),
  resend: 'Doğrulama bağlantısını yeniden gönder',
  resendIn: (sec) => `Yeniden göndermek için ${sec} sn`,
  resendSent: 'Adres doğrulama bekliyorsa yeni bir bağlantı gönderdik. Gelen kutunu kontrol et.',
  resendFailed: 'Bağlantı şu anda gönderilemedi. Biraz sonra tekrar dene.',
  mailUnavailable: 'E-posta gönderimi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.',
  verifyPendingTitle: 'Gelen kutunu kontrol et',
  verifyPendingBody: (email) => `${email} adresine bir doğrulama bağlantısı gönderdik. Hesabını açmak için e-postadaki butona dokun.`,
  verifyPendingGeneric: 'E-posta adresine bir doğrulama bağlantısı gönderdik. Hesabını açmak için e-postadaki butona dokun.',
  verifyPendingSpamHint: 'Birkaç dakika içinde gelmezse spam ve “Promosyonlar” klasörüne de bak. Bağlantı 24 saat geçerlidir.',
  verifyPendingWrongEmail: 'E-postayı yanlış mı yazdın? Yeniden kayıt ol',
  verifyPendingOpenGmail: 'Gmail’i aç',
  verifyPendingOpenOutlook: 'Outlook’u aç',
  verifyPendingDevLink: 'Geliştirme ortamı: doğrulama bağlantısını aç',
  verifyPendingEmailLabel: 'E-posta adresin',
  verifyPendingEmailSent: 'Doğrulama e-postası gönderildi.',
  verifyPendingEmailNotSent: 'Doğrulama e-postası şu anda gönderilemedi. Aşağıdan yeniden gönderebilirsin.',
  verifyReferralPending: 'Davet kodun kaydedildi. E-postanı doğrulayıp ilk QR deneyimini tamamladığında davet bonusu hesabına eklenecek.',
  verifySuccessTitle: 'E-postan doğrulandı',
  verifySuccessBody: 'Hesabın hazır. Şimdi giriş yapıp puan kazanmaya başlayabilirsin.',
  verifyAlreadyTitle: 'E-postan zaten doğrulanmış',
  verifyAlreadyBody: 'Bu bağlantı daha önce kullanılmış; hesabın hazır. Giriş yapabilirsin.',
  verifyExpiredTitle: 'Bağlantının süresi dolmuş',
  verifyExpiredBody: (masked) => `${masked} adresine gönderdiğimiz bağlantının süresi doldu. Tek dokunuşla yenisini gönderebilirsin.`,
  verifyInvalidTitle: 'Bağlantı geçersiz',
  verifyInvalidBody: 'Bağlantı eksik kopyalanmış ya da geçersiz. E-posta adresini yazarak yeni bir bağlantı isteyebilirsin.',
  verifyNetworkTitle: 'Bağlantı kurulamadı',
  verifyNetworkBody: 'İnternet bağlantını kontrol edip tekrar dene.',
  verifyWorking: 'E-posta adresin doğrulanıyor…',
  continueToLogin: 'Giriş yap',
  backToLogin: 'Giriş sayfasına dön',
  tryAgain: 'Tekrar dene',
  noticeVerified: 'E-postan doğrulandı. Şimdi giriş yapabilirsin.',
  noticePasswordReset: 'Şifren güncellendi ve diğer cihazlardaki oturumlar kapatıldı. Yeni şifrenle giriş yap.',
  noticeRegistered: 'Hesabın oluşturuldu. E-postanı doğruladıktan sonra giriş yapabilirsin.',
  twoFactorTitle: 'İki adımlı doğrulama',
  twoFactorBody: 'Doğrulama uygulamandaki 6 haneli kodu ya da bir kurtarma kodunu gir.',
  twoFactorOAuthBody: 'Google ile kimliğini doğruladın. Hesabında iki adımlı doğrulama açık; devam etmek için kodunu gir.',
  twoFactorLabel: 'Doğrulama kodu',
  twoFactorSubmit: 'Doğrula ve giriş yap',
  twoFactorCodeShort: '6 haneli kodu ya da kurtarma kodunu gir.',
  magicWorkingTitle: 'Giriş yapılıyor',
  magicWorkingBody: 'Bağlantın kontrol ediliyor…',
  magicDoneBody: 'Giriş başarılı, yönlendiriliyorsun…',
  magicErrorTitle: 'Giriş yapılamadı',
  magicNewLink: 'Yeni bağlantı iste',
  errorPageTitle: 'Giriş tamamlanamadı',
  errorPageHelp: 'Sorun devam ederse farklı bir giriş yöntemi deneyebilirsin.',
  completeReferralTitle: (points) => `Davet bonusu eklendi: +${points} puan`,
  completeReferralPendingTitle: 'Davet kodun kaydedildi',
  completeReferralFailedTitle: 'Davet kodu uygulanamadı',
  completeReferralFailedBody: 'Kod geçersiz, süresi dolmuş ya da daha önce bir davet kodu kullanmışsın. Bonus eklenmedi.',
  completeReferralLink: 'Davet sayfasına git',
  completeDealerTitle: 'Bu hesap bir müşteri hesabı',
  completeDealerBody: 'Bu e-posta ile daha önce müşteri hesabı açılmış; işletme paneli bu hesapta yok. İşletme hesabı için farklı bir e-posta ile kayıt olabilirsin.',
  completeDealerContinue: 'Müşteri paneline devam et',
  completeAccountTitle: 'Hesabını tamamla',
  completeAccountBody: (provider) => `${provider} ile giriş yaptın. İstersen bir şifre belirle; böylece e-posta ve şifreyle de giriş yapabilirsin.`,
  completePasswordLabel: 'Şifre',
  completePasswordPlaceholder: 'En az 8 karakter',
  completePasswordSave: 'Şifreyi kaydet ve devam et',
  completePasswordSkip: 'Şimdilik atla',
  completePasswordMin: 'Şifre en az 8 karakter olmalı.',
  completePasswordFailed: 'Şifre kaydedilemedi. Lütfen tekrar dene.',
  showPassword: 'Şifreyi göster',
  hidePassword: 'Şifreyi gizle',
  magicLinkEmailLabel: 'Giriş bağlantısı için e-posta',
  magicLinkUnavailable: 'Bağlantıyla giriş şu anda kullanılamıyor.',
  magicLinkDisabled: 'Bağlantıyla giriş şu anda kapalı.',
  invalidEmail: 'Geçerli bir e-posta adresi gir.',
  registerInviteLine: 'Davet koduyla geldin. Kod geçerliyse e-postanı doğrulayıp ilk QR deneyimini tamamladığında bonus puan kazanırsın.',
  registerDealerOAuthHint: 'İşletme hesabı açıyorsun; Google ile devam edersen hesabın işletme hesabı olarak oluşturulur.',
};

const EN: AuthCopy = {
  errors: {
    MISSING_CREDENTIALS: { title: 'Missing details', body: 'Enter your email address and password.' },
    INVALID_CREDENTIALS: { title: 'Could not sign in', body: 'Incorrect email or password.' },
    EMAIL_NOT_VERIFIED: {
      title: 'Your email is not verified yet',
      body: 'Click the link we sent when you signed up. Can’t find it? We can send a new one.',
    },
    LOCKED: {
      title: 'Sign-in temporarily locked',
      body: 'Too many failed attempts. For your security, try again in {{time}}. You can also reset your password.',
    },
    RATE_LIMITED: { title: 'Slow down a little', body: 'Too many attempts. Try again in {{time}}.' },
    '2FA_REQUIRED': { title: 'Verification code required', body: 'Two-step verification is on for your account.' },
    INVALID_2FA: { title: 'Wrong code', body: 'Try the current 6-digit code from your authenticator or an unused recovery code.' },
    INVALID_LINK: {
      title: 'Invalid link',
      body: 'This link is invalid, already used or expired. You can request a new one.',
    },
    ACCOUNT_SUSPENDED: {
      title: 'Account unavailable',
      body: 'This account is currently suspended. If you think this is a mistake, contact support.',
    },
    AccountSuspended: {
      title: 'Account unavailable',
      body: 'This account is currently suspended. If you think this is a mistake, contact support.',
    },
    OAuthAccountNotLinked: {
      title: 'This email uses another sign-in method',
      body: 'An account with this address already exists. For your security, sign in with the method you used first (email and password or Google).',
    },
    OAuthEmailUnverified: {
      title: 'Email not verified',
      body: 'The email on your Google account looks unverified. Verify it with Google and try again.',
    },
    OAuthNoEmail: {
      title: 'No email shared',
      body: 'The provider did not share your email address. You can sign up or sign in with email and password.',
    },
    OAuthSignin: SOCIAL_GENERIC_EN,
    OAuthCallback: SOCIAL_GENERIC_EN,
    OAuthCreateAccount: SOCIAL_GENERIC_EN,
    Callback: SOCIAL_GENERIC_EN,
    AccessDenied: { title: 'Sign-in cancelled', body: 'The sign-in request was cancelled or denied. You can try again.' },
    Verification: { title: 'Link expired', body: 'The sign-in link expired or was already used. Request a new one.' },
    Configuration: { title: 'Temporary problem', body: 'There is a temporary configuration problem. Please try again shortly.' },
    SessionRequired: { title: 'Sign-in required', body: 'You need to sign in to view this page.' },
    CredentialsSignin: { title: 'Could not sign in', body: 'Incorrect email or password.' },
    UNKNOWN: { title: 'Could not sign in', body: 'Something unexpected happened. Please try again.' },
  },
  waitSeconds: (sec) => formatWait(sec, 'en'),
  resend: 'Resend verification link',
  resendIn: (sec) => `Resend available in ${sec}s`,
  resendSent: 'If this address is waiting for verification, we sent a new link. Check your inbox.',
  resendFailed: 'We could not send the link right now. Try again shortly.',
  mailUnavailable: 'Email delivery is unavailable right now. Please try again later.',
  verifyPendingTitle: 'Check your inbox',
  verifyPendingBody: (email) => `We sent a verification link to ${email}. Tap the button in the email to activate your account.`,
  verifyPendingGeneric: 'We sent a verification link to your email. Tap the button in the email to activate your account.',
  verifyPendingSpamHint: 'If it doesn’t arrive in a few minutes, check spam and “Promotions”. The link is valid for 24 hours.',
  verifyPendingWrongEmail: 'Wrong email? Sign up again',
  verifyPendingOpenGmail: 'Open Gmail',
  verifyPendingOpenOutlook: 'Open Outlook',
  verifyPendingDevLink: 'Development: open verification link',
  verifyPendingEmailLabel: 'Your email address',
  verifyPendingEmailSent: 'Verification email sent.',
  verifyPendingEmailNotSent: 'We could not send the verification email right now. You can resend it below.',
  verifyReferralPending: 'Your invite code is saved. The bonus is added after you verify your email and complete your first QR experience.',
  verifySuccessTitle: 'Email verified',
  verifySuccessBody: 'Your account is ready. Sign in and start earning points.',
  verifyAlreadyTitle: 'Email already verified',
  verifyAlreadyBody: 'This link was already used; your account is ready. You can sign in.',
  verifyExpiredTitle: 'Link expired',
  verifyExpiredBody: (masked) => `The link we sent to ${masked} has expired. Get a new one with one tap.`,
  verifyInvalidTitle: 'Invalid link',
  verifyInvalidBody: 'The link is incomplete or invalid. Enter your email to get a new one.',
  verifyNetworkTitle: 'Connection problem',
  verifyNetworkBody: 'Check your internet connection and try again.',
  verifyWorking: 'Verifying your email…',
  continueToLogin: 'Sign in',
  backToLogin: 'Back to sign in',
  tryAgain: 'Try again',
  noticeVerified: 'Your email is verified. You can sign in now.',
  noticePasswordReset: 'Your password was updated and other sessions were signed out. Sign in with your new password.',
  noticeRegistered: 'Your account was created. Verify your email, then sign in.',
  twoFactorTitle: 'Two-step verification',
  twoFactorBody: 'Enter the 6-digit code from your authenticator app or a recovery code.',
  twoFactorOAuthBody: 'You verified with Google. Two-step verification is on; enter your code to continue.',
  twoFactorLabel: 'Verification code',
  twoFactorSubmit: 'Verify and sign in',
  twoFactorCodeShort: 'Enter the 6-digit code or a recovery code.',
  magicWorkingTitle: 'Signing you in',
  magicWorkingBody: 'Checking your link…',
  magicDoneBody: 'Signed in, redirecting…',
  magicErrorTitle: 'Could not sign in',
  magicNewLink: 'Request a new link',
  errorPageTitle: 'Sign-in could not be completed',
  errorPageHelp: 'If the problem continues, try a different sign-in method.',
  completeReferralTitle: (points) => `Invite bonus added: +${points} points`,
  completeReferralPendingTitle: 'Invite code saved',
  completeReferralFailedTitle: 'Invite code could not be applied',
  completeReferralFailedBody: 'The code is invalid or expired, or you already used an invite code. No bonus was added.',
  completeReferralLink: 'Go to invites',
  completeDealerTitle: 'This is a customer account',
  completeDealerBody: 'A customer account already exists for this email, so the business panel isn’t available here. Use a different email for a business account.',
  completeDealerContinue: 'Continue to customer panel',
  completeAccountTitle: 'Complete your account',
  completeAccountBody: (provider) => `You signed in with ${provider}. Set a password if you also want to sign in with email and password.`,
  completePasswordLabel: 'Password',
  completePasswordPlaceholder: 'At least 8 characters',
  completePasswordSave: 'Save password and continue',
  completePasswordSkip: 'Skip for now',
  completePasswordMin: 'Password must be at least 8 characters.',
  completePasswordFailed: 'Password could not be saved. Please try again.',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  magicLinkEmailLabel: 'Email for sign-in link',
  magicLinkUnavailable: 'Sign-in links are unavailable right now.',
  magicLinkDisabled: 'Sign-in links are turned off.',
  invalidEmail: 'Enter a valid email address.',
  registerInviteLine: 'You came with an invite code. If it is valid, you earn bonus points after verifying your email and completing your first QR experience.',
  registerDealerOAuthHint: 'You are creating a business account; continuing with Google creates it as a business account.',
};

export function useAuthCopy(): AuthCopy {
  const { locale } = useAppLocale();
  return locale === 'en' ? EN : TR;
}

/** Hata kopyasını süre değişkeniyle birlikte çözer. */
export function resolveErrorCopy(copy: AuthCopy, code: AuthErrorKind, retryAfterSec?: number): ErrorCopy {
  const base = copy.errors[code] ?? copy.errors.UNKNOWN;
  const time = copy.waitSeconds(retryAfterSec ?? 60);
  return { title: base.title, body: base.body.replace('{{time}}', time) };
}
