/**
 * Şifre politikası — kimlik yüzeyinin TEK kaynağı (kayıt, şifre sıfırlama, OAuth sonrası
 * şifre oluşturma). İsomorfik: hem istemcide canlı kontrol listesi hem sunucuda doğrulama.
 *
 * Kural `lib/validations.ts` → `registerSchema.password` ile aynıdır (en az 8 karakter,
 * küçük harf, büyük harf, rakam). Eskiden kayıt bu kuralı isterken OAuth sonrası şifre
 * oluşturma ve şifre sıfırlama yalnız uzunluğa bakıyordu (aynı hesap için iki politika).
 */

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt 72 bayttan sonrasını yok sayar; üst sınır sunucu uçlarıyla aynı. */
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordCheckKey = 'length' | 'lower' | 'upper' | 'digit';
export const PASSWORD_CHECK_KEYS: readonly PasswordCheckKey[] = ['length', 'lower', 'upper', 'digit'];

/** 0 = boş · 1 zayıf · 2 orta · 3 iyi · 4 güçlü */
export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export type PasswordEvaluation = {
  checks: Record<PasswordCheckKey, boolean>;
  /** Politikayı karşılıyor mu (sunucu bunu zorunlu kılar). */
  meetsPolicy: boolean;
  /** Uzunluk sınırını aşıyor mu. */
  tooLong: boolean;
  strength: PasswordStrength;
};

/** Sık kullanılan / tahmin edilebilir kökler — politikayı geçse bile "zayıf" gösterilir. */
const COMMON_ROOTS = ['password', 'parola', 'sifre', 'şifre', 'qwerty', 'asdf', '123456', '111111', 'qratex', 'abc123'];

function hasSequentialRun(pw: string, run = 4): boolean {
  let up = 1;
  let down = 1;
  for (let i = 1; i < pw.length; i++) {
    const diff = pw.charCodeAt(i) - pw.charCodeAt(i - 1);
    up = diff === 1 ? up + 1 : 1;
    down = diff === -1 ? down + 1 : 1;
    if (up >= run || down >= run) return true;
  }
  return false;
}

export function evaluatePassword(raw: string | null | undefined): PasswordEvaluation {
  const pw = typeof raw === 'string' ? raw : '';
  const checks: Record<PasswordCheckKey, boolean> = {
    length: pw.length >= PASSWORD_MIN_LENGTH,
    lower: /[a-zçğıöşü]/.test(pw),
    upper: /[A-ZÇĞİÖŞÜ]/.test(pw),
    digit: /\d/.test(pw),
  };
  // Sunucu kuralı ASCII regex'i ile aynı kalsın: Türkçe harfler ek puan değil, kural için
  // ASCII karşılığı da gerekir (registerSchema: /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).
  const asciiPolicy = /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);
  const tooLong = pw.length > PASSWORD_MAX_LENGTH;
  const meetsPolicy = checks.length && asciiPolicy && !tooLong;

  let strength: PasswordStrength;
  if (!pw) strength = 0;
  else if (!meetsPolicy) {
    const passed = PASSWORD_CHECK_KEYS.filter((k) => checks[k]).length;
    strength = passed >= 3 ? 2 : 1;
  } else {
    const lower = pw.toLowerCase();
    const weakPattern =
      COMMON_ROOTS.some((root) => lower.includes(root)) || /(.)\1{3,}/.test(pw) || hasSequentialRun(lower);
    const symbol = /[^A-Za-z0-9]/.test(pw);
    if (weakPattern) strength = 2;
    else if (pw.length >= 12 || (pw.length >= 10 && symbol)) strength = 4;
    else strength = 3;
  }

  return { checks, meetsPolicy, tooLong, strength };
}

/** Sunucu uçları için kısa yol: politika ihlalinde makine-okunur kod döndürür. */
export function passwordPolicyError(raw: unknown): 'WEAK_PASSWORD' | 'PASSWORD_TOO_LONG' | null {
  if (typeof raw !== 'string') return 'WEAK_PASSWORD';
  const ev = evaluatePassword(raw);
  if (ev.tooLong) return 'PASSWORD_TOO_LONG';
  return ev.meetsPolicy ? null : 'WEAK_PASSWORD';
}
