'use client';

import { useAppLocale } from '@/lib/app-locale';
import type { AuthErrorKind } from '@/lib/auth/login-errors';
import type { PasswordCheckKey, PasswordStrength } from './password-policy';

/**
 * Kimlik yüzeyinin (giriş, kayıt, doğrulama, şifre kurtarma, magic link, OAuth sonrası) TÜM
 * metinleri — TR/EN, tek hitap dili ("sen"). Paylaşılan i18n kataloğuna dokunmadan iki dilli
 * çalışır (components/states/copy.ts deseni). Demo hesap etiketleri mevcut `auth.demo.*`
 * anahtarlarından gelir.
 */
type ErrorCopy = { title: string; body: string };

export type AuthCopy = {
  errors: Record<AuthErrorKind, ErrorCopy>;
  waitSeconds: (sec: number) => string;

  // ── Ortak ──
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  confirmPasswordLabel: string;
  showPassword: string;
  hidePassword: string;
  invalidEmail: string;
  emailRequired: string;
  passwordRequired: string;
  or: string;
  continueWithGoogle: string;
  continueWithGithub: string;
  backToLogin: string;
  continueToLogin: string;
  tryAgain: string;
  loadingSr: string;
  redirecting: string;
  mailUnavailable: string;
  networkError: string;

  // ── Kabuk ──
  shellLanguage: string;
  shellTerms: string;
  shellPrivacy: string;
  shellKvkk: string;
  shellHome: string;

  // ── Oturum zaten açık ──
  signedInTitle: string;
  signedInBody: (email: string) => string;
  signedInContinue: string;
  signedInSwitch: string;

  // ── Giriş ──
  loginTitle: string;
  loginSubtitle: string;
  loginQrTitle: (place: string) => string;
  loginQrBody: string;
  forgotPassword: string;
  signIn: string;
  signingIn: string;
  noAccount: string;
  registerLink: string;
  magicLinkButton: string;
  magicLinkHint: string;
  magicLinkNeedEmail: string;
  magicLinkSent: (email: string) => string;
  magicLinkUnavailable: string;
  magicLinkDisabled: string;
  demoTitle: string;
  demoBody: string;
  demoCredentialsTitle: string;
  demoLoginFailed: string;
  noticeVerified: string;
  noticePasswordReset: string;

  // ── 2FA ──
  twoFactorTitle: string;
  twoFactorBody: string;
  twoFactorOAuthBody: string;
  twoFactorLabel: string;
  twoFactorRecoveryLabel: string;
  twoFactorRecoveryPlaceholder: string;
  twoFactorUseRecovery: string;
  twoFactorUseApp: string;
  twoFactorSubmit: string;
  twoFactorCodeShort: string;
  twoFactorBack: string;

  // ── Kayıt ──
  registerTitle: string;
  registerSubtitle: string;
  roleLegend: string;
  roleCustomer: string;
  roleCustomerDesc: string;
  roleDealer: string;
  roleDealerDesc: string;
  nameLabel: string;
  namePlaceholder: string;
  createAccount: string;
  haveAccount: string;
  signInLink: string;
  termsBefore: string;
  termsLink: string;
  termsAnd: string;
  privacyLink: string;
  termsAfter: string;
  inviteTitle: (name: string) => string;
  inviteGenericTitle: string;
  inviteBody: (points: number) => string;
  inviteBodyNoPoints: string;
  inviteDealerNote: string;
  dealerOAuthHint: string;
  intentFailed: string;
  emailTakenTitle: string;
  emailTakenBody: string;
  registerRateLimited: (time: string) => string;
  registerFailedTitle: string;
  registerFailedBody: string;
  registerInvalid: string;

  // ── Şifre alanı ──
  passwordRulesTitle: string;
  passwordRules: Record<PasswordCheckKey, string>;
  passwordStrength: (s: PasswordStrength) => string;
  passwordStrengthNames: Record<Exclude<PasswordStrength, 0>, string>;
  passwordsMatch: string;
  passwordsDontMatch: string;
  passwordWeak: string;
  passwordTooLong: string;

  // ── Doğrulama ──
  resend: string;
  resendIn: (sec: number) => string;
  resendSent: string;
  resendFailed: string;
  verifyPendingTitle: string;
  verifyPendingBody: (email: string) => string;
  verifyPendingGeneric: string;
  verifyPendingSpamHint: string;
  verifyPendingWrongEmail: string;
  verifyPendingOpenGmail: string;
  verifyPendingOpenOutlook: string;
  verifyPendingDevLink: string;
  verifyPendingEmailLabel: string;
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

  // ── Şifremi unuttum ──
  forgotTitle: string;
  forgotBody: string;
  forgotSubmit: string;
  forgotSentTitle: string;
  forgotSentBody: (email: string) => string;
  forgotSentHint: string;
  forgotResend: string;
  forgotDifferentEmail: string;
  forgotUnavailableTitle: string;
  forgotUnavailableBody: string;
  forgotMagicTitle: string;
  forgotMagicBody: string;
  forgotMagicSubmit: string;
  forgotSignedInBody: (email: string) => string;

  // ── Şifre sıfırlama ──
  resetTitle: string;
  resetBody: string;
  resetSubmit: string;
  resetInvalidTitle: string;
  resetInvalidBody: string;
  resetNewLink: string;
  resetSuccessTitle: string;
  resetSuccessBody: string;
  resetFailed: string;
  resetRateLimited: string;
  resetUnknownBody: string;

  // ── Magic ──
  magicWorkingTitle: string;
  magicWorkingBody: string;
  magicDoneBody: string;
  magicErrorTitle: string;
  magicNetworkTitle: string;
  magicNetworkBody: string;
  magicRequestTitle: string;
  magicRequestSubmit: string;
  magicSwitchBody: (email: string) => string;
  magicSwitchConfirm: string;
  magicSwitchStay: string;

  // ── Hata sayfası ──
  errorPageHelp: string;

  // ── OAuth sonrası ──
  completeReferralTitle: (points: number) => string;
  completeReferralPendingTitle: string;
  completeReferralFailedTitle: string;
  completeReferralFailedBody: string;
  completeReferralLink: string;
  completeContinue: string;
  completeDealerTitle: string;
  completeDealerBody: string;
  completeDealerContinue: string;
  completeAccountTitle: string;
  completeAccountBody: (provider: string) => string;
  completePasswordSave: string;
  completePasswordSkip: string;
  completePasswordFailed: string;
  completeRedirecting: string;
  completeProcessingReferral: string;
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

const SUSPENDED_TR: ErrorCopy = {
  title: 'Hesap kullanıma kapalı',
  body: 'Bu hesap şu anda askıya alınmış durumda. Bir yanlışlık olduğunu düşünüyorsan destek ekibiyle iletişime geç.',
};
const SUSPENDED_EN: ErrorCopy = {
  title: 'Account unavailable',
  body: 'This account is currently suspended. If you think this is a mistake, contact support.',
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
    ACCOUNT_SUSPENDED: SUSPENDED_TR,
    AccountSuspended: SUSPENDED_TR,
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

  emailLabel: 'E-posta',
  emailPlaceholder: 'ornek@eposta.com',
  passwordLabel: 'Şifre',
  confirmPasswordLabel: 'Şifre tekrar',
  showPassword: 'Şifreyi göster',
  hidePassword: 'Şifreyi gizle',
  invalidEmail: 'Geçerli bir e-posta adresi gir.',
  emailRequired: 'E-posta adresini gir.',
  passwordRequired: 'Şifreni gir.',
  or: 'veya',
  continueWithGoogle: 'Google ile devam et',
  continueWithGithub: 'GitHub ile devam et',
  backToLogin: 'Giriş sayfasına dön',
  continueToLogin: 'Giriş yap',
  tryAgain: 'Tekrar dene',
  loadingSr: 'Yükleniyor',
  redirecting: 'Yönlendiriliyorsun…',
  mailUnavailable: 'E-posta gönderimi şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.',
  networkError: 'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.',

  shellLanguage: 'Dil',
  shellTerms: 'Kullanım şartları',
  shellPrivacy: 'Gizlilik',
  shellKvkk: 'KVKK',
  shellHome: 'Qratex ana sayfa',

  signedInTitle: 'Zaten giriş yaptın',
  signedInBody: (email) => `${email} hesabıyla oturumun açık.`,
  signedInContinue: 'Devam et',
  signedInSwitch: 'Çıkış yap, başka hesapla gir',

  loginTitle: 'Giriş yap',
  loginSubtitle: 'Puanların, ödüllerin ve panelin seni bekliyor.',
  loginQrTitle: (place) => `${place} geri bildirimine dön`,
  loginQrBody: 'Giriş yaptıktan sonra kaldığın yerden devam edersin; geri bildirimin hesabına işlenir.',
  forgotPassword: 'Şifremi unuttum',
  signIn: 'Giriş yap',
  signingIn: 'Giriş yapılıyor…',
  noAccount: 'Hesabın yok mu?',
  registerLink: 'Kayıt ol',
  magicLinkButton: 'Şifresiz giriş bağlantısı gönder',
  magicLinkHint: 'Şifre yazmak istemiyorsan yukarıdaki e-postaya tek kullanımlık bir giriş bağlantısı gönderebiliriz.',
  magicLinkNeedEmail: 'Bağlantı göndermek için önce e-posta adresini yaz.',
  magicLinkSent: (email) =>
    `${email} adresine kayıtlı bir hesap varsa 15 dakika geçerli bir giriş bağlantısı gönderdik. Gelen kutunu kontrol et.`,
  magicLinkUnavailable: 'Bağlantıyla giriş şu anda kullanılamıyor.',
  magicLinkDisabled: 'Bağlantıyla giriş şu anda kapalı.',
  demoTitle: 'Demo hesaplar',
  demoBody: 'Platformu her rolle tek dokunuşla dene.',
  demoCredentialsTitle: 'Demo giriş bilgileri',
  demoLoginFailed: 'Demo girişi yapılamadı. Demo hesapları bu ortamda hazır olmayabilir.',
  noticeVerified: 'E-postan doğrulandı. Şimdi giriş yapabilirsin.',
  noticePasswordReset: 'Şifren güncellendi ve diğer cihazlardaki oturumlar kapatıldı. Yeni şifrenle giriş yap.',

  twoFactorTitle: 'İki adımlı doğrulama',
  twoFactorBody: 'Doğrulama uygulamandaki 6 haneli kodu gir.',
  twoFactorOAuthBody: 'Kimliğini doğruladın. Hesabında iki adımlı doğrulama açık; devam etmek için kodunu gir.',
  twoFactorLabel: '6 haneli doğrulama kodu',
  twoFactorRecoveryLabel: 'Kurtarma kodu',
  twoFactorRecoveryPlaceholder: 'XXXX-XXXX',
  twoFactorUseRecovery: 'Uygulamana ulaşamıyor musun? Kurtarma kodu kullan',
  twoFactorUseApp: 'Doğrulama uygulaması kodunu kullan',
  twoFactorSubmit: 'Doğrula ve giriş yap',
  twoFactorCodeShort: '6 haneli kodu ya da kurtarma kodunu eksiksiz gir.',
  twoFactorBack: 'Geri dön',

  registerTitle: 'Hesap oluştur',
  registerSubtitle: 'QR okut, geri bildirim ver, puan ve ödül kazan.',
  roleLegend: 'Hesap türü',
  roleCustomer: 'Müşteri',
  roleCustomerDesc: 'Geri bildirim ver, puan ve ödül kazan',
  roleDealer: 'İşletme',
  roleDealerDesc: 'QR kodlarını yönet, geri bildirimleri analiz et',
  nameLabel: 'Ad soyad',
  namePlaceholder: 'Adın ve soyadın',
  createAccount: 'Hesabı oluştur',
  haveAccount: 'Zaten hesabın var mı?',
  signInLink: 'Giriş yap',
  termsBefore: 'Hesap oluşturarak ',
  termsLink: 'Kullanım Şartları',
  termsAnd: '’nı ve ',
  privacyLink: 'Gizlilik Politikası',
  termsAfter: '’nı kabul etmiş olursun.',
  inviteTitle: (name) => `${name} seni davet etti`,
  inviteGenericTitle: 'Davet koduyla geldin',
  inviteBody: (points) =>
    `E-postanı doğrulayıp ilk QR deneyimini tamamladığında +${points.toLocaleString('tr-TR')} puan hesabına eklenir.`,
  inviteBodyNoPoints: 'E-postanı doğrulayıp ilk QR deneyimini tamamladığında davet bonusu hesabına eklenir.',
  inviteDealerNote: 'Davet bonusu yalnız müşteri hesaplarına verilir.',
  dealerOAuthHint: 'İşletme hesabı açıyorsun; Google veya GitHub ile devam edersen yeni hesabın işletme hesabı olarak oluşturulur.',
  intentFailed: 'Hesap türü kaydedilemedi. Bağlantını kontrol edip tekrar dene.',
  emailTakenTitle: 'Bu e-posta zaten kayıtlı',
  emailTakenBody:
    'Bu adresle açılmış bir hesap var. Giriş yapabilir, şifreni sıfırlayabilir ya da doğrulama bağlantısını yeniden isteyebilirsin.',
  registerRateLimited: (time) => `Çok fazla kayıt denemesi yapıldı. ${time} sonra tekrar dene.`,
  registerFailedTitle: 'Kayıt tamamlanamadı',
  registerFailedBody: 'Beklenmeyen bir sorun oluştu. Lütfen tekrar dene.',
  registerInvalid: 'Bilgilerden biri geçersiz. Alanları kontrol edip tekrar dene.',

  passwordRulesTitle: 'Şifren şunları içermeli:',
  passwordRules: { length: 'En az 8 karakter', lower: 'Küçük harf', upper: 'Büyük harf', digit: 'Rakam' },
  passwordStrength: (s) => (s === 0 ? '' : `Şifre gücü: ${TR_STRENGTH[s]}`),
  passwordStrengthNames: { 1: 'zayıf', 2: 'orta', 3: 'iyi', 4: 'güçlü' },
  passwordsMatch: 'Şifreler eşleşiyor',
  passwordsDontMatch: 'Şifreler eşleşmiyor',
  passwordWeak: 'Şifre kuralları karşılanmıyor: en az 8 karakter, küçük harf, büyük harf ve rakam.',
  passwordTooLong: 'Şifre en fazla 128 karakter olabilir.',

  resend: 'Doğrulama bağlantısını yeniden gönder',
  resendIn: (sec) => `Yeniden göndermek için ${sec} sn`,
  resendSent: 'Adres doğrulama bekliyorsa yeni bir bağlantı gönderdik. Gelen kutunu kontrol et.',
  resendFailed: 'Bağlantı şu anda gönderilemedi. Biraz sonra tekrar dene.',
  verifyPendingTitle: 'Gelen kutunu kontrol et',
  verifyPendingBody: (email) => `${email} adresine bir doğrulama bağlantısı gönderdik. Hesabını açmak için e-postadaki butona dokun.`,
  verifyPendingGeneric: 'E-posta adresine bir doğrulama bağlantısı gönderdik. Hesabını açmak için e-postadaki butona dokun.',
  verifyPendingSpamHint: 'Birkaç dakika içinde gelmezse spam ve “Promosyonlar” klasörüne de bak. Bağlantı 24 saat geçerlidir.',
  verifyPendingWrongEmail: 'E-postayı yanlış mı yazdın? Bilgileri düzenle',
  verifyPendingOpenGmail: 'Gmail’i aç',
  verifyPendingOpenOutlook: 'Outlook’u aç',
  verifyPendingDevLink: 'Geliştirme ortamı: doğrulama bağlantısını aç',
  verifyPendingEmailLabel: 'E-posta adresin',
  verifyPendingEmailNotSent: 'Doğrulama e-postası şu anda gönderilemedi. Aşağıdan yeniden gönderebilirsin.',
  verifyReferralPending:
    'Davet kodun kaydedildi. E-postanı doğrulayıp ilk QR deneyimini tamamladığında davet bonusu hesabına eklenecek.',
  verifySuccessTitle: 'E-postan doğrulandı',
  verifySuccessBody: 'Hesabın hazır. Şimdi giriş yapıp puan kazanmaya başlayabilirsin.',
  verifyAlreadyTitle: 'E-postan zaten doğrulanmış',
  verifyAlreadyBody: 'Bu bağlantı daha önce kullanılmış; hesabın hazır. Giriş yapabilirsin.',
  verifyExpiredTitle: 'Bağlantının süresi dolmuş',
  verifyExpiredBody: (masked) =>
    `${masked} adresine gönderdiğimiz bağlantının süresi doldu. Tek dokunuşla yenisini gönderebilirsin.`,
  verifyInvalidTitle: 'Bağlantı geçersiz',
  verifyInvalidBody: 'Bağlantı eksik kopyalanmış ya da geçersiz. E-posta adresini yazarak yeni bir bağlantı isteyebilirsin.',
  verifyNetworkTitle: 'Bağlantı kurulamadı',
  verifyNetworkBody: 'İnternet bağlantını kontrol edip tekrar dene.',
  verifyWorking: 'E-posta adresin doğrulanıyor…',

  forgotTitle: 'Şifreni sıfırla',
  forgotBody: 'Hesabının e-posta adresini yaz; doğrulanmış hesaba bir sıfırlama bağlantısı gönderelim.',
  forgotSubmit: 'Sıfırlama bağlantısı gönder',
  forgotSentTitle: 'Gelen kutunu kontrol et',
  forgotSentBody: (email) =>
    `${email} adresiyle kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderdik. E-postan henüz doğrulanmamışsa önce doğrulama bağlantısı gelir.`,
  forgotSentHint: 'Bağlantı 1 saat geçerlidir. Birden fazla e-posta gelirse en son geleni kullan; spam klasörüne de bak.',
  forgotResend: 'Yeniden gönder',
  forgotDifferentEmail: 'Farklı bir e-posta dene',
  forgotUnavailableTitle: 'E-posta gönderimi şu anda kullanılamıyor',
  forgotUnavailableBody:
    'Şu an sıfırlama bağlantısı gönderemiyoruz. Lütfen daha sonra tekrar dene; sorun sürerse destek ekibiyle iletişime geç.',
  forgotMagicTitle: 'Şifreni değiştirmeden girmek ister misin?',
  forgotMagicBody: 'Aynı e-postaya tek kullanımlık bir giriş bağlantısı da gönderebiliriz.',
  forgotMagicSubmit: 'Giriş bağlantısı gönder',
  forgotSignedInBody: (email) =>
    `${email} hesabıyla oturumun açık. Bu hesabın şifresini hesap ayarlarından değiştirebilirsin; başka bir hesap için aşağıdan devam et.`,

  resetTitle: 'Yeni şifreni belirle',
  resetBody: 'Güçlü bir şifre seç. Kaydettiğinde diğer cihazlardaki oturumların kapatılır.',
  resetSubmit: 'Şifreyi güncelle',
  resetInvalidTitle: 'Bağlantı geçersiz ya da süresi dolmuş',
  resetInvalidBody: 'Sıfırlama bağlantıları 1 saat geçerlidir ve yalnız bir kez kullanılabilir. Yeni bir bağlantı isteyebilirsin.',
  resetNewLink: 'Yeni bağlantı iste',
  resetSuccessTitle: 'Şifren güncellendi',
  resetSuccessBody: 'Diğer cihazlardaki oturumların kapatıldı. Yeni şifrenle giriş yapabilirsin.',
  resetFailed: 'Şifre güncellenemedi. Lütfen tekrar dene.',
  resetRateLimited: 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
  resetUnknownBody: 'Bağlantın şu an kontrol edilemedi; yine de yeni şifreni kaydetmeyi deneyebilirsin.',

  magicWorkingTitle: 'Giriş yapılıyor',
  magicWorkingBody: 'Bağlantın kontrol ediliyor…',
  magicDoneBody: 'Giriş başarılı, yönlendiriliyorsun…',
  magicErrorTitle: 'Giriş yapılamadı',
  magicNetworkTitle: 'Bağlantı kurulamadı',
  magicNetworkBody: 'İnternet bağlantını kontrol edip tekrar dene. Giriş bağlantın henüz kullanılmadı.',
  magicRequestTitle: 'Yeni giriş bağlantısı iste',
  magicRequestSubmit: 'Bağlantı gönder',
  magicSwitchBody: (email) =>
    `Bu cihazda ${email} hesabıyla oturumun açık. Bu giriş bağlantısıyla devam edersen açık oturumun kapanır ve bağlantının hesabına geçilir.`,
  magicSwitchConfirm: 'Bağlantıyla giriş yap',
  magicSwitchStay: 'Açık oturumla devam et',

  errorPageHelp: 'Sorun devam ederse farklı bir giriş yöntemi deneyebilirsin.',

  completeReferralTitle: (points) => `Davet bonusu eklendi: +${points.toLocaleString('tr-TR')} puan`,
  completeReferralPendingTitle: 'Davet kodun kaydedildi',
  completeReferralFailedTitle: 'Davet kodu uygulanamadı',
  completeReferralFailedBody: 'Kod geçersiz, süresi dolmuş ya da daha önce bir davet kodu kullanmışsın. Bonus eklenmedi.',
  completeReferralLink: 'Davet sayfasına git',
  completeContinue: 'Uygulamaya geç',
  completeDealerTitle: 'Bu hesap bir müşteri hesabı',
  completeDealerBody:
    'Bu e-posta ile daha önce müşteri hesabı açılmış; işletme paneli bu hesapta yok. İşletme hesabı için farklı bir e-posta ile kayıt olabilirsin.',
  completeDealerContinue: 'Müşteri paneline devam et',
  completeAccountTitle: 'Hesabını tamamla',
  completeAccountBody: (provider) =>
    `${provider} ile giriş yaptın. İstersen bir şifre belirle; böylece e-posta ve şifreyle de giriş yapabilirsin.`,
  completePasswordSave: 'Şifreyi kaydet ve devam et',
  completePasswordSkip: 'Şimdilik atla',
  completePasswordFailed: 'Şifre kaydedilemedi. Lütfen tekrar dene.',
  completeRedirecting: 'Hesabın hazırlanıyor…',
  completeProcessingReferral: 'Davet kodun işleniyor…',
};

const TR_STRENGTH: Record<Exclude<PasswordStrength, 0>, string> = { 1: 'zayıf', 2: 'orta', 3: 'iyi', 4: 'güçlü' };
const EN_STRENGTH: Record<Exclude<PasswordStrength, 0>, string> = { 1: 'weak', 2: 'fair', 3: 'good', 4: 'strong' };

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
    INVALID_LINK: { title: 'Invalid link', body: 'This link is invalid, already used or expired. You can request a new one.' },
    ACCOUNT_SUSPENDED: SUSPENDED_EN,
    AccountSuspended: SUSPENDED_EN,
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

  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  passwordLabel: 'Password',
  confirmPasswordLabel: 'Confirm password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  invalidEmail: 'Enter a valid email address.',
  emailRequired: 'Enter your email address.',
  passwordRequired: 'Enter your password.',
  or: 'or',
  continueWithGoogle: 'Continue with Google',
  continueWithGithub: 'Continue with GitHub',
  backToLogin: 'Back to sign in',
  continueToLogin: 'Sign in',
  tryAgain: 'Try again',
  loadingSr: 'Loading',
  redirecting: 'Redirecting…',
  mailUnavailable: 'Email delivery is unavailable right now. Please try again later.',
  networkError: 'Connection problem. Check your internet connection and try again.',

  shellLanguage: 'Language',
  shellTerms: 'Terms',
  shellPrivacy: 'Privacy',
  shellKvkk: 'KVKK notice',
  shellHome: 'Qratex home',

  signedInTitle: 'You’re already signed in',
  signedInBody: (email) => `You’re signed in as ${email}.`,
  signedInContinue: 'Continue',
  signedInSwitch: 'Sign out and use another account',

  loginTitle: 'Sign in',
  loginSubtitle: 'Your points, rewards and dashboard are waiting.',
  loginQrTitle: (place) => `Back to your ${place} feedback`,
  loginQrBody: 'After signing in you’ll continue where you left off; your feedback is added to your account.',
  forgotPassword: 'Forgot password?',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  noAccount: 'Don’t have an account?',
  registerLink: 'Sign up',
  magicLinkButton: 'Email me a sign-in link',
  magicLinkHint: 'Prefer not to type a password? We can send a one-time sign-in link to the email above.',
  magicLinkNeedEmail: 'Enter your email address first to get a link.',
  magicLinkSent: (email) => `If an account exists for ${email}, we sent a sign-in link valid for 15 minutes. Check your inbox.`,
  magicLinkUnavailable: 'Sign-in links are unavailable right now.',
  magicLinkDisabled: 'Sign-in links are turned off.',
  demoTitle: 'Demo accounts',
  demoBody: 'Try the platform in every role with one tap.',
  demoCredentialsTitle: 'Demo credentials',
  demoLoginFailed: 'Demo sign-in failed. Demo accounts may not be available in this environment.',
  noticeVerified: 'Your email is verified. You can sign in now.',
  noticePasswordReset: 'Your password was updated and other sessions were signed out. Sign in with your new password.',

  twoFactorTitle: 'Two-step verification',
  twoFactorBody: 'Enter the 6-digit code from your authenticator app.',
  twoFactorOAuthBody: 'You verified your identity. Two-step verification is on; enter your code to continue.',
  twoFactorLabel: '6-digit verification code',
  twoFactorRecoveryLabel: 'Recovery code',
  twoFactorRecoveryPlaceholder: 'XXXX-XXXX',
  twoFactorUseRecovery: 'Can’t reach your app? Use a recovery code',
  twoFactorUseApp: 'Use your authenticator code',
  twoFactorSubmit: 'Verify and sign in',
  twoFactorCodeShort: 'Enter the full 6-digit code or recovery code.',
  twoFactorBack: 'Go back',

  registerTitle: 'Create your account',
  registerSubtitle: 'Scan QR codes, share feedback, earn points and rewards.',
  roleLegend: 'Account type',
  roleCustomer: 'Customer',
  roleCustomerDesc: 'Share feedback, earn points and rewards',
  roleDealer: 'Business',
  roleDealerDesc: 'Manage QR codes, analyse feedback',
  nameLabel: 'Full name',
  namePlaceholder: 'Your first and last name',
  createAccount: 'Create account',
  haveAccount: 'Already have an account?',
  signInLink: 'Sign in',
  termsBefore: 'By creating an account you agree to the ',
  termsLink: 'Terms of Use',
  termsAnd: ' and ',
  privacyLink: 'Privacy Policy',
  termsAfter: '.',
  inviteTitle: (name) => `${name} invited you`,
  inviteGenericTitle: 'You came with an invite code',
  inviteBody: (points) =>
    `Verify your email and complete your first QR experience to get +${points.toLocaleString('en-US')} points.`,
  inviteBodyNoPoints: 'Verify your email and complete your first QR experience to get the invite bonus.',
  inviteDealerNote: 'Invite bonuses only apply to customer accounts.',
  dealerOAuthHint: 'You are creating a business account; continuing with Google or GitHub creates your new account as a business account.',
  intentFailed: 'We couldn’t save the account type. Check your connection and try again.',
  emailTakenTitle: 'This email is already registered',
  emailTakenBody: 'An account already uses this address. You can sign in, reset your password or request a new verification link.',
  registerRateLimited: (time) => `Too many sign-up attempts. Try again in ${time}.`,
  registerFailedTitle: 'Sign-up could not be completed',
  registerFailedBody: 'Something unexpected happened. Please try again.',
  registerInvalid: 'One of the fields is invalid. Check them and try again.',

  passwordRulesTitle: 'Your password needs:',
  passwordRules: { length: 'At least 8 characters', lower: 'A lowercase letter', upper: 'An uppercase letter', digit: 'A number' },
  passwordStrength: (s) => (s === 0 ? '' : `Password strength: ${EN_STRENGTH[s]}`),
  passwordStrengthNames: { 1: 'weak', 2: 'fair', 3: 'good', 4: 'strong' },
  passwordsMatch: 'Passwords match',
  passwordsDontMatch: 'Passwords don’t match',
  passwordWeak: 'Password rules not met: at least 8 characters, a lowercase letter, an uppercase letter and a number.',
  passwordTooLong: 'Password can be at most 128 characters.',

  resend: 'Resend verification link',
  resendIn: (sec) => `Resend available in ${sec}s`,
  resendSent: 'If this address is waiting for verification, we sent a new link. Check your inbox.',
  resendFailed: 'We could not send the link right now. Try again shortly.',
  verifyPendingTitle: 'Check your inbox',
  verifyPendingBody: (email) => `We sent a verification link to ${email}. Tap the button in the email to activate your account.`,
  verifyPendingGeneric: 'We sent a verification link to your email. Tap the button in the email to activate your account.',
  verifyPendingSpamHint: 'If it doesn’t arrive in a few minutes, check spam and “Promotions”. The link is valid for 24 hours.',
  verifyPendingWrongEmail: 'Wrong email? Edit your details',
  verifyPendingOpenGmail: 'Open Gmail',
  verifyPendingOpenOutlook: 'Open Outlook',
  verifyPendingDevLink: 'Development: open verification link',
  verifyPendingEmailLabel: 'Your email address',
  verifyPendingEmailNotSent: 'We could not send the verification email right now. You can resend it below.',
  verifyReferralPending:
    'Your invite code is saved. The bonus is added after you verify your email and complete your first QR experience.',
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

  forgotTitle: 'Reset your password',
  forgotBody: 'Enter your account email and we’ll send a reset link to verified accounts.',
  forgotSubmit: 'Send reset link',
  forgotSentTitle: 'Check your inbox',
  forgotSentBody: (email) =>
    `If an account exists for ${email}, we sent a password reset link. If your email isn’t verified yet, you’ll get a verification link first.`,
  forgotSentHint: 'The link is valid for 1 hour. If you get several emails, use the latest one; check spam too.',
  forgotResend: 'Resend',
  forgotDifferentEmail: 'Try a different email',
  forgotUnavailableTitle: 'Email delivery is unavailable',
  forgotUnavailableBody: 'We can’t send reset links right now. Please try again later; if it continues, contact support.',
  forgotMagicTitle: 'Want to sign in without changing your password?',
  forgotMagicBody: 'We can also send a one-time sign-in link to the same email.',
  forgotMagicSubmit: 'Send sign-in link',
  forgotSignedInBody: (email) =>
    `You’re signed in as ${email}. You can change this account’s password in settings; continue below for another account.`,

  resetTitle: 'Set a new password',
  resetBody: 'Choose a strong password. Saving it signs you out on other devices.',
  resetSubmit: 'Update password',
  resetInvalidTitle: 'Link invalid or expired',
  resetInvalidBody: 'Reset links are valid for 1 hour and can be used once. You can request a new one.',
  resetNewLink: 'Request a new link',
  resetSuccessTitle: 'Password updated',
  resetSuccessBody: 'Other sessions were signed out. You can sign in with your new password.',
  resetFailed: 'Password could not be updated. Please try again.',
  resetRateLimited: 'Too many attempts. Try again shortly.',
  resetUnknownBody: 'We couldn’t check your link right now; you can still try saving a new password.',

  magicWorkingTitle: 'Signing you in',
  magicWorkingBody: 'Checking your link…',
  magicDoneBody: 'Signed in, redirecting…',
  magicErrorTitle: 'Could not sign in',
  magicNetworkTitle: 'Connection problem',
  magicNetworkBody: 'Check your internet connection and try again. Your sign-in link hasn’t been used yet.',
  magicRequestTitle: 'Request a new sign-in link',
  magicRequestSubmit: 'Send link',
  magicSwitchBody: (email) =>
    `You’re signed in as ${email} on this device. Continuing with this link signs you out and switches to the link’s account.`,
  magicSwitchConfirm: 'Sign in with this link',
  magicSwitchStay: 'Stay in current session',

  errorPageHelp: 'If the problem continues, try a different sign-in method.',

  completeReferralTitle: (points) => `Invite bonus added: +${points.toLocaleString('en-US')} points`,
  completeReferralPendingTitle: 'Invite code saved',
  completeReferralFailedTitle: 'Invite code could not be applied',
  completeReferralFailedBody: 'The code is invalid or expired, or you already used an invite code. No bonus was added.',
  completeReferralLink: 'Go to invites',
  completeContinue: 'Continue to the app',
  completeDealerTitle: 'This is a customer account',
  completeDealerBody:
    'A customer account already exists for this email, so the business panel isn’t available here. Use a different email for a business account.',
  completeDealerContinue: 'Continue to customer panel',
  completeAccountTitle: 'Complete your account',
  completeAccountBody: (provider) =>
    `You signed in with ${provider}. Set a password if you also want to sign in with email and password.`,
  completePasswordSave: 'Save password and continue',
  completePasswordSkip: 'Skip for now',
  completePasswordFailed: 'Password could not be saved. Please try again.',
  completeRedirecting: 'Getting your account ready…',
  completeProcessingReferral: 'Processing your invite code…',
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
