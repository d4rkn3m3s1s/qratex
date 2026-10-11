import { evaluatePassword } from '@/components/auth/p-auth/password-policy';

export type FieldErrors = { name?: string; password?: string; confirm?: string };

const MESSAGES = {
  tr: {
    name: 'Adınızı yazın (en az 2 karakter).',
    tooLong: 'Şifre en fazla 128 karakter olabilir.',
    policy: 'Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.',
    mismatch: 'Şifreler eşleşmiyor.',
  },
  en: {
    name: 'Enter your name (at least 2 characters).',
    tooLong: 'The password can be at most 128 characters.',
    policy: 'The password must be at least 8 characters and include a lowercase letter, an uppercase letter and a digit.',
    mismatch: 'The passwords do not match.',
  },
} as const;

/** Kayıt / sıfırlama ile AYNI şifre politikası (tek kaynak `password-policy`); mesajlar arayüz dilinde. */
export function validateInviteSignup(
  input: { name: string; password: string; confirm: string },
  locale: 'tr' | 'en' = 'tr',
): FieldErrors {
  const m = MESSAGES[locale];
  const ev = evaluatePassword(input.password);
  const errs: FieldErrors = {};
  if (input.name.trim().length < 2) errs.name = m.name;
  if (ev.tooLong) errs.password = m.tooLong;
  else if (!ev.meetsPolicy) errs.password = m.policy;
  else if (input.password !== input.confirm) errs.confirm = m.mismatch;
  return errs;
}
