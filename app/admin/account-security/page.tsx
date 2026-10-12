import type { Metadata } from 'next';
import { TwoFactorSettings } from '@/components/auth/two-factor-settings';
import { getServerLocale } from '@/lib/server-locale';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const en = (await getServerLocale()) === 'en';
  return en
    ? { title: 'Account security', description: 'Two-factor authentication (TOTP) setup and recovery codes for your admin account.' }
    : { title: 'Hesap güvenliği', description: 'Yönetici hesabınız için iki adımlı doğrulama (TOTP) kurulumu ve kurtarma kodları.' };
}

/** Admin → Hesap güvenliği: kendi hesabının 2FA kurulumu (/api/auth/2fa). */
export default async function AdminAccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [locale, sp] = await Promise.all([getServerLocale(), searchParams]);
  const en = locale === 'en';
  // Zorunlu 2FA yönlendirmesiyle gelindi (lib/auth/admin-2fa): neden burada olduğunu söyle.
  const required = sp.zorunlu === '1';
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-fg">{en ? 'Account security' : 'Hesap güvenliği'}</h1>
      {required ? (
        <p role="status" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-fg">
          {en
            ? 'Two-factor authentication is required for admin accounts. Set it up to continue to the admin panel.'
            : 'Yönetici hesaplarında iki adımlı doğrulama zorunludur. Yönetici paneline devam etmek için kurulumu tamamla.'}
        </p>
      ) : null}
      <TwoFactorSettings />
    </div>
  );
}
