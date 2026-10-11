import type { Metadata } from 'next';
import { TwoFactorSettings } from '@/components/auth/two-factor-settings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Hesap güvenliği',
  description: 'Yönetici hesabınız için iki adımlı doğrulama (TOTP) kurulumu ve kurtarma kodları.',
};

/** Admin → Hesap güvenliği: kendi hesabının 2FA kurulumu (/api/auth/2fa). */
export default function AdminAccountSecurityPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-fg">Hesap güvenliği</h1>
      <TwoFactorSettings />
    </div>
  );
}
