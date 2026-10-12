'use client';

/**
 * components/admin kökü arayüz metinleri (TR/EN). Bileşenler `useAdminCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  twoFaOff: 'İki adımlı doğrulama kapalı.',
  twoFaRisk: 'Yönetici hesabınız yalnız şifreyle korunuyor; ele geçirilirse tüm platform etkilenir.',
  twoFaSetup: '2FA’yı şimdi kur',
  ruleEditor: 'Kural editörü',
  ruleEditorHint: 'Koşul ve aksiyon tanımlayın; önizleme ile kimlerin etkileneceğini görün.',
  savedRule: 'Kayıtlı kural',
  ruleName: 'Kural adı',
  description: 'Açıklama',
  roleCondition: 'Rol koşulu',
  customer: 'Müşteri',
  admin: 'Yönetici',
  priority: 'Öncelik',
  saveRule: 'Kuralı kaydet',
  previewBtn: 'Önizle',
  runNow: 'Şimdi çalıştır',
  affectedUsers: 'Etkilenecek kullanıcı:',
  overCap: 'Toplam etki çalıştırma tavanını aşıyor; hedefi daraltın.',
  confirmRun: 'Çalıştırmayı onaylayın',
  run: 'Çalıştırma',
  failed: 'Başarısız',
  errorRate: 'Hata oranı',
  noRules: 'Henüz kural yok.',
  runHistory: 'Çalıştırma geçmişi',
  noRuns: 'Henüz çalıştırma yok.',
};

export type AdminCopy = Record<keyof typeof tr, string>;

const en: AdminCopy = {
  twoFaOff: 'Two-step verification is off.',
  twoFaRisk: 'Your admin account is protected by a password alone; if it’s compromised, the whole platform is affected.',
  twoFaSetup: 'Set up 2FA now',
  ruleEditor: 'Rule editor',
  ruleEditorHint: 'Define conditions and actions, then preview who will be affected.',
  savedRule: 'Saved rule',
  ruleName: 'Rule name',
  description: 'Description',
  roleCondition: 'Role condition',
  customer: 'Customer',
  admin: 'Admin',
  priority: 'Priority',
  saveRule: 'Save rule',
  previewBtn: 'Preview',
  runNow: 'Run now',
  affectedUsers: 'Users affected:',
  overCap: 'The total impact exceeds the run cap; narrow the target.',
  confirmRun: 'Confirm the run',
  run: 'Run',
  failed: 'Failed',
  errorRate: 'Error rate',
  noRules: 'No rules yet.',
  runHistory: 'Run history',
  noRuns: 'No runs yet.',
};

export function useAdminCopy(): AdminCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminText({ k }: { k: keyof AdminCopy }): string {
  return useAdminCopy()[k];
}
