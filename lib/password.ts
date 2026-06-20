/**
 * Parola hash'leme — bcrypt round sayısı tek kaynak + env ile yapılandırılabilir.
 * Donanım hızlandıkça BCRYPT_ROUNDS artırılarak kod değişmeden sertleştirilebilir.
 */
import bcrypt from 'bcryptjs';

/** Güvenli aralığa sıkıştırılmış round sayısı (env > varsayılan 12). */
export function bcryptRounds(): number {
  const raw = process.env.BCRYPT_ROUNDS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) return 12;
  // 10 altı zayıf, 15 üstü serverless'te aşırı yavaş (DoS riski) → sınırla.
  return Math.min(15, Math.max(10, parsed));
}

/** Parolayı yapılandırılmış round sayısıyla hash'ler. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, bcryptRounds());
}
