/**
 * Yönetici için ZORUNLU 2FA (karar: docs/audit/2026-10-08/karar-personel-defter-admin-2fa.md).
 *
 * 2FA kurmamış ADMIN, yönetici panelinde (gizli kapıdan SONRA) `/admin/account-security`
 * kurulum sayfasına yönlendirilir. İstisnalar:
 *  - Demo yönetici hesabı (`isDemo` ya da ADMIN_2FA_EXEMPT_EMAILS listesi; varsayılan
 *    `admin@qratex.com` — giriş ekranındaki demo bloğu kalır).
 *  - Break-glass: `ADMIN_2FA_BREAK_GLASS=1` zorunluluğu kapatır; HER kullanımda (oturum başına
 *    saatte bir, Redis yoksa her istekte) `ADMIN_2FA_BREAK_GLASS_USED` denetim kaydı yazılır.
 * Karar JWT'ye değil DB'ye dayanır → 2FA açıldığı an yönlendirme biter (sid/çerez döngüsü yok).
 * DB okunamazsa panel düşürülmez (kapı ve rol denetimi zaten geçti) — fail-open, loglanır.
 */
import { prisma } from '@/lib/prisma';
import { redisIncrWithTtl } from '@/lib/redis';

export const ADMIN_2FA_SETUP_PATH = '/admin/account-security';
export const DEFAULT_DEMO_ADMIN_EMAILS = ['admin@qratex.com'];

export type Admin2faVerdict = 'ok' | 'exempt_demo' | 'break_glass' | 'setup_required';

export function exemptAdminEmails(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.ADMIN_2FA_EXEMPT_EMAILS;
  const list = raw === undefined ? DEFAULT_DEMO_ADMIN_EMAILS : raw.split(',');
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isBreakGlassOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADMIN_2FA_BREAK_GLASS === '1';
}

/** Kurulum sayfası (ve alt yolları) yönlendirmeden muaf — aksi hâlde döngü olur. */
export function isSetupPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === ADMIN_2FA_SETUP_PATH || pathname.startsWith(`${ADMIN_2FA_SETUP_PATH}/`);
}

/** Saf karar (test edilir). */
export function decideAdmin2fa(
  user: { twoFactorEnabled: boolean; twoFactorSecret: string | null; isDemo: boolean; email: string | null },
  env: Record<string, string | undefined> = process.env
): Admin2faVerdict {
  if (user.twoFactorEnabled && user.twoFactorSecret) return 'ok';
  if (user.isDemo || (user.email && exemptAdminEmails(env).includes(user.email.trim().toLowerCase()))) return 'exempt_demo';
  if (isBreakGlassOn(env)) return 'break_glass';
  return 'setup_required';
}

async function auditBreakGlass(userId: string, sid: string | null, pathname: string | null): Promise<void> {
  const hit = await redisIncrWithTtl(`admin2fa:breakglass:${userId}:${sid ?? 'nosid'}`, 3600).catch(() => null);
  if (hit && hit.count > 1) return; // bu oturumda son 1 saatte zaten kaydedildi
  console.warn('[admin-2fa] BREAK-GLASS kullanıldı', { userId, pathname });
  await prisma.auditLog.create({
    data: {
      userId,
      actorType: 'user',
      action: 'ADMIN_2FA_BREAK_GLASS_USED',
      entity: 'User',
      entityId: userId,
      newData: { pathname, sid, env: 'ADMIN_2FA_BREAK_GLASS=1' },
    },
  });
}

/**
 * Admin sayfa koruması için: kurulum gerekiyorsa `true` (çağıran yönlendirir).
 * `pathname` proxy'nin yazdığı `x-qx-pathname` başlığından gelir.
 */
export async function adminNeeds2faSetup(userId: string, opts: { sid: string | null; pathname: string | null }): Promise<boolean> {
  if (isSetupPath(opts.pathname)) return false;
  let verdict: Admin2faVerdict;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true, isDemo: true, email: true },
    });
    if (!u) return false; // oturum zaten jwt callback'te düşer
    verdict = decideAdmin2fa(u);
  } catch (err) {
    console.error('[admin-2fa] 2FA durumu okunamadı (fail-open):', err);
    return false;
  }
  if (verdict === 'break_glass') {
    await auditBreakGlass(userId, opts.sid, opts.pathname).catch((err) => console.error('[admin-2fa] break-glass denetim kaydı yazılamadı:', err));
    return false;
  }
  return verdict === 'setup_required';
}
