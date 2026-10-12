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
export default async function AdminAccountSecurityPage() {
  const en = (await getServerLocale()) === 'en';
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-fg">{en ? 'Account security' : 'Hesap güvenliği'}</h1>
      <TwoFactorSettings />
    </div>
  );
}
