/**
 * Başlangıç (boot) ortam değişkeni doğrulaması.
 *
 * Önceden yalnızca NEXTAUTH_SECRET üretimde kontrol ediliyordu; DATABASE_URL gibi
 * uygulamanın çalışması için ZORUNLU değişkenler eksikse sorun ancak ilk DB
 * çağrısında (çalışma zamanında, kullanıcı isteği sırasında) belirsiz bir hatayla
 * ortaya çıkıyordu. Bu modül eksik/zayıf yapılandırmayı boot anında, NET bir mesajla
 * yakalar — yanlış-yapılandırılmış bir dağıtımın sessizce ayağa kalkmasını önler.
 *
 * Saf çekirdek (validateEnv) test edilebilir; assertEnvOrThrow boot'ta çağrılır.
 */

export interface EnvIssue {
  key: string;
  level: 'error' | 'warn';
  message: string;
}

export interface EnvValidationResult {
  ok: boolean; // hiç 'error' yoksa true
  issues: EnvIssue[];
}

/**
 * Verilen ortam haritasını doğrular. `isProduction` true ise üretim-zorunlu
 * kontroller (gizli anahtar uzunluğu vb.) uygulanır.
 */
export function validateEnv(
  env: Record<string, string | undefined>,
  isProduction: boolean
): EnvValidationResult {
  const issues: EnvIssue[] = [];

  // DATABASE_URL — her ortamda zorunlu (uygulama DB olmadan çalışmaz).
  const db = env.DATABASE_URL?.trim();
  if (!db) {
    issues.push({ key: 'DATABASE_URL', level: 'error', message: 'DATABASE_URL tanımlı değil.' });
  } else if (!/^postgres(ql)?:\/\//.test(db)) {
    issues.push({
      key: 'DATABASE_URL',
      level: 'warn',
      message: "DATABASE_URL 'postgres://' veya 'postgresql://' ile başlamıyor.",
    });
  }

  // NEXTAUTH_SECRET — üretimde zorunlu, min 32 karakter (JWT forge koruması).
  const secret = env.NEXTAUTH_SECRET?.trim();
  if (isProduction) {
    if (!secret) {
      issues.push({ key: 'NEXTAUTH_SECRET', level: 'error', message: 'NEXTAUTH_SECRET üretimde zorunludur.' });
    } else if (secret.length < 32) {
      issues.push({
        key: 'NEXTAUTH_SECRET',
        level: 'error',
        message: 'NEXTAUTH_SECRET en az 32 karakter olmalıdır.',
      });
    }
  } else if (secret && secret.length < 32) {
    issues.push({
      key: 'NEXTAUTH_SECRET',
      level: 'warn',
      message: 'NEXTAUTH_SECRET 32 karakterden kısa (üretimde reddedilir).',
    });
  }

  // NEXTAUTH_URL — üretimde önerilir (yanlışsa OAuth redirect ve e-posta linkleri bozulur).
  if (isProduction && !env.NEXTAUTH_URL?.trim() && !env.NEXT_PUBLIC_APP_URL?.trim() && !env.VERCEL_URL?.trim()) {
    issues.push({
      key: 'NEXTAUTH_URL',
      level: 'warn',
      message: 'NEXTAUTH_URL/NEXT_PUBLIC_APP_URL tanımsız — OAuth redirect ve e-posta CTA linkleri yanlış olabilir.',
    });
  }

  // OAuth sağlayıcı çiftleri: biri tanımlıysa diğeri de olmalı (yarım yapılandırma sessizce kırılır).
  if (Boolean(env.GOOGLE_CLIENT_ID?.trim()) !== Boolean(env.GOOGLE_CLIENT_SECRET?.trim())) {
    issues.push({
      key: 'GOOGLE_CLIENT_ID',
      level: 'warn',
      message: 'Google OAuth yarım yapılandırılmış (ID veya SECRET eksik).',
    });
  }
  if (Boolean(env.GITHUB_ID?.trim()) !== Boolean(env.GITHUB_SECRET?.trim())) {
    issues.push({
      key: 'GITHUB_ID',
      level: 'warn',
      message: 'GitHub OAuth yarım yapılandırılmış (ID veya SECRET eksik).',
    });
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

let asserted = false;

/**
 * Boot'ta bir kez çağrılır. 'error' seviyesi varsa üretimde fırlatır (dağıtımı
 * durdurur); 'warn' seviyeleri loglanır. Geliştirmede error'lar da yalnızca
 * loglanır (yerel kurulumu engellemez).
 */
export function assertEnvOrThrow(): void {
  if (asserted) return;
  asserted = true;

  const isProduction = process.env.NODE_ENV === 'production';
  const { ok, issues } = validateEnv(process.env, isProduction);

  for (const issue of issues) {
    const prefix = issue.level === 'error' ? '[ENV:ERROR]' : '[ENV:WARN]';
    console.warn(`${prefix} ${issue.key}: ${issue.message}`);
  }

  if (!ok && isProduction) {
    const errors = issues.filter((i) => i.level === 'error').map((i) => `${i.key}: ${i.message}`);
    throw new Error(`Ortam yapılandırması geçersiz:\n${errors.join('\n')}`);
  }
}
