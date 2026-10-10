/**
 * Açık DTO yardımcıları (P0-09, P0-11, P0-35): `...row` yayılımı ve `include` ile dışarı sızan
 * alanlar yerine yanıta YALNIZ izin verilen alanlar girer; kişisel veri maskelenir.
 */

/** Nesneden yalnız verilen anahtarları kopyalar (izin listesi). */
export function pickDto<T extends object, K extends keyof T>(source: T, keys: ReadonlyArray<K>): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

/** Dizi için `pickDto`. */
export function pickDtoList<T extends object, K extends keyof T>(rows: ReadonlyArray<T>, keys: ReadonlyArray<K>): Array<Pick<T, K>> {
  return rows.map((row) => pickDto(row, keys));
}

/**
 * E-posta maskeleme: `ali.yilmaz@ornek.com` → `a***z@o***.com`.
 * Geçersiz/boş girdide `***`.
 */
export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '***';
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  const maskedLocal = local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${host[0] ?? ''}***${tld}`;
}

/**
 * Herkese açık yüzeyler (VoC duvarı, liderlik tablosu, yorum kartı) için ad maskeleme:
 * `Ayşe Nur Yılmaz` → `Ayşe Y.`; tek kelime → `Ayşe`; boş → `Misafir`.
 */
export function publicDisplayName(name: string | null | undefined, fallback = 'Misafir'): string {
  if (typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  const first = parts[0] as string;
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1] as string;
  return `${first} ${last.charAt(0).toLocaleUpperCase('tr-TR')}.`;
}
