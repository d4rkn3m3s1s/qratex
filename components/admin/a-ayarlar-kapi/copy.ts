'use client';

/**
 * a-ayarlar-kapi arayüz metinleri (TR/EN). Bileşenler `useAdminAyarlarKapiCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminAyarlarKapiText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  questionHint: 'Cevabı tek rakam olan, yalnız kurucuların bileceği bir soru.',
  changeAnswer: 'Cevabı değiştir (isteğe bağlı)',
  answerMismatch: 'Yeni cevap ile tekrarı aynı olmalıdır.',
  noChange: 'Değişiklik yok.',
  shortLock: 'Kısa kilit',
  allOtherAdmins: 'Diğer bütün yöneticilere',
  gateTitle: 'Boyutlar Arası Geçit',
  gateSubtitle: 'Erişim Doğrulaması',
  saveFirst: 'Önce bekleyen değişiklikleri kaydedin ya da geri alın.',
  siteName: 'Site adı',
  maintenanceDefault: 'Boş bırakılırsa genel bir bakım metni gösterilir.',
  maintenanceInfoOnly: 'Yalnız bilgi amaçlı; bakım kendiliğinden kapanmaz.',
  gateUnreadable: 'Kapı durumu şu anda okunamadı. Kapı ekranında yeniden deneyin.',
  nameMin: 'Ad en az 2 karakter olmalıdır.',
  pickAvatar: 'Avatar seç',
  avatarHint: 'Seçtiğiniz avatar “Profili kaydet” ile kalıcı olur.',
  passwordMin: 'Şifre en az 8 karakter olmalıdır.',
  passwordMismatch: 'Şifreler aynı değil.',
  maintenanceOn: 'Bakım modu açık.',
  smtpFor: 'SMTP için',
  resendFor: '; Resend için',
  mailSetupTail: ' tanımlayın. E-posta yokken bağlantıyla giriş düğmesi de görünmez.',
};

export type AdminAyarlarKapiCopy = Record<keyof typeof tr, string>;

const en: AdminAyarlarKapiCopy = {
  questionHint: 'A question with a single-digit answer that only the founders know.',
  changeAnswer: 'Change the answer (optional)',
  answerMismatch: 'The new answer and its confirmation must match.',
  noChange: 'No changes.',
  shortLock: 'Short lockout',
  allOtherAdmins: 'All other admins',
  gateTitle: 'Interdimensional Gate',
  gateSubtitle: 'Access Check',
  saveFirst: 'Save or discard your pending changes first.',
  siteName: 'Site name',
  maintenanceDefault: 'Leave empty to show a generic maintenance message.',
  maintenanceInfoOnly: 'For information only; maintenance doesn\'t end on its own.',
  gateUnreadable: 'Couldn\'t read the gate status right now. Try again from the gate screen.',
  nameMin: 'Name must be at least 2 characters.',
  pickAvatar: 'Choose avatar',
  avatarHint: 'Your chosen avatar is kept once you click “Save profile”.',
  passwordMin: 'Password must be at least 8 characters.',
  passwordMismatch: 'Passwords don\'t match.',
  maintenanceOn: 'Maintenance mode is on.',
  smtpFor: 'For SMTP, set',
  resendFor: '; for Resend, set',
  mailSetupTail: '. Without email, the sign-in link button is hidden too.',
};

export function useAdminAyarlarKapiCopy(): AdminAyarlarKapiCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminAyarlarKapiText({ k }: { k: keyof AdminAyarlarKapiCopy }): string {
  return useAdminAyarlarKapiCopy()[k];
}
