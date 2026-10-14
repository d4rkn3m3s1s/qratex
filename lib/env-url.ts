/**
 * Ortamdan okunan URL'yi normalize eder: baş/son boşluk ve satır sonu (Vercel env'e yapıştırılan
 * değerin sonunda "\n" kalabiliyor → sitemap <loc>, canonical, JSON-LD bozuluyordu) ve sondaki
 * eğik çizgiler atılır. Boşsa undefined döner (|| zincirleri çalışmaya devam etsin).
 */
export function cleanEnvUrl(value: string | undefined | null): string | undefined {
  const v = value?.trim().replace(/\/+$/, '');
  return v || undefined;
}

/** NEXT_PUBLIC_APP_URL (normalize). İstemcide de inline edilebilsin diye literal erişim. */
export function envAppUrl(): string | undefined {
  return cleanEnvUrl(process.env.NEXT_PUBLIC_APP_URL);
}

/** NEXTAUTH_URL (normalize). */
export function envAuthUrl(): string | undefined {
  return cleanEnvUrl(process.env.NEXTAUTH_URL);
}
