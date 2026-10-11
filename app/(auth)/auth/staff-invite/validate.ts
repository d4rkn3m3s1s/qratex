import { evaluatePassword } from '@/components/auth/p-auth/password-policy';

export type FieldErrors = { name?: string; password?: string; confirm?: string };

/** Kayıt / sıfırlama ile AYNI şifre politikası (tek kaynak `password-policy`). */
export function validateInviteSignup(input: { name: string; password: string; confirm: string }): FieldErrors {
  const ev = evaluatePassword(input.password);
  const errs: FieldErrors = {};
  if (input.name.trim().length < 2) errs.name = 'Adınızı yazın (en az 2 karakter).';
  if (ev.tooLong) errs.password = 'Şifre en fazla 128 karakter olabilir.';
  else if (!ev.meetsPolicy) errs.password = 'Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.';
  else if (input.password !== input.confirm) errs.confirm = 'Şifreler eşleşmiyor.';
  return errs;
}
