import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { ShieldAlert } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AdminText } from './copy';

/**
 * Yönetici 2FA uyarısı — 2FA ZORUNLU değildir (sahip hesabı kilitlenmesin), ama kurulmamışsa
 * yönetici panelinin her sayfasında kalıcı, kapatılamaz uyarı + tek tık kurulum bağlantısı.
 * Okuma hatasında sessizce gizlenir (paneli düşürmez).
 */
export async function Admin2faBanner() {
  let show = false;
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.id && session.user.role === 'ADMIN') {
      const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { twoFactorEnabled: true } });
      show = !!u && !u.twoFactorEnabled;
    }
  } catch {
    show = false;
  }
  if (!show) return null;
  return (
    <div role="alert" className="mt-3 flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-fg sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        <span>
          <strong><AdminText k="twoFaOff" /></strong> Yönetici hesabınız yalnız şifreyle korunuyor; ele geçirilirse tüm platform etkilenir.
        </span>
      </p>
      <Link href="/admin/account-security" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-danger px-3 font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        2FA'yı şimdi kur
      </Link>
    </div>
  );
}
