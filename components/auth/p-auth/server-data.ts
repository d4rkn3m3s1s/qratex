/**
 * Kimlik sayfalarının SUNUCU verisi (server component'lerden çağrılır; istemciye import edilmez).
 *
 * Eskiden giriş/kayıt sayfaları mount sonrası `/api/public/auth-features`'ı çekiyor, Google
 * butonu ve magic link bölümü sonradan "pop" ediyordu (yerleşim kayması). Artık bayraklar,
 * oturum durumu, QR bağlamı ve davet önizlemesi ilk HTML ile gelir.
 *
 * Her yardımcı hata durumunda güvenli varsayılan döner (build/DB erişilemezken sayfa çökmez).
 */
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getBooleanSiteSetting } from '@/lib/site-setting-bool';
import { isMailConfigured } from '@/lib/mail-sender';
import { getPublicAppOrigin } from '@/lib/public-app-origin';
import { resolvePostLoginTarget, sanitizeCallbackPath } from '@/lib/auth/post-login-target';
import { normalizeReferralCode, isReferralModuleEnabled } from '@/lib/referral';
import { getPointsMatrix, getReferralRewards } from '@/lib/points-rules';

export type AuthFeatures = {
  google: boolean;
  github: boolean;
  /** Bağlantıyla giriş açık VE e-posta gönderimi yapılandırılmış. */
  magicLink: boolean;
  mailConfigured: boolean;
};

export async function getAuthFeatures(): Promise<AuthFeatures> {
  const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const github = Boolean(process.env.GITHUB_ID && process.env.GITHUB_SECRET);
  let mailConfigured = false;
  try {
    mailConfigured = isMailConfigured();
  } catch {
    mailConfigured = false;
  }
  const magicEnabled = await getBooleanSiteSetting('enableMagicLink', false).catch(() => false);
  return { google, github, magicLink: magicEnabled && mailConfigured, mailConfigured };
}

/** İsteğin kökeni (önizleme dağıtımlarında da doğru); okunamazsa yapılandırılmış genel köken. */
export async function getRequestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = (h.get('x-forwarded-host') ?? h.get('host'))?.split(',')[0]?.trim();
    if (host) {
      const protoRaw = h.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
      const local = host.startsWith('localhost') || host.startsWith('127.');
      const proto = protoRaw === 'http' || protoRaw === 'https' ? protoRaw : local ? 'http' : 'https';
      return new URL(`${proto}://${host}`).origin;
    }
  } catch {
    /* başlık yok (build) */
  }
  return getPublicAppOrigin();
}

export type SignedInUser = { email: string; role: string | null };

/** Geçerli oturum (oturum iptali, askı vb. NextAuth jwt callback'inde DB'den doğrulanır). */
export async function getSignedInUser(): Promise<SignedInUser | null> {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!session?.user?.id || typeof email !== 'string' || !email) return null;
    return { email, role: (session.user.role as string | undefined) ?? null };
  } catch {
    return null;
  }
}

/** Oturumu açık kullanıcının "devam et" hedefi — ham callback asla doğrudan kullanılmaz. */
export function continueTargetFor(user: SignedInUser, rawCallback: string | null, origin: string): string {
  return resolvePostLoginTarget(rawCallback, user.role, origin);
}

export type QrContext = { placeName: string };

const FEEDBACK_PATH = /^\/feedback\/([A-Za-z0-9_-]{3,64})(?:[/?#]|$)/;

/**
 * Girişten sonra dönülecek yol bir QR geri bildirim sayfasıysa (`/feedback/<kod>`) işletme
 * adını döndürür — "X geri bildirimine dön" bağlam bandı için. Yalnız etkin, iptal/arşiv
 * edilmemiş kod; QR'ın iç adı (ör. "Masa 3") gösterilmez.
 */
export async function getQrContext(rawCallback: string | null, origin: string): Promise<QrContext | null> {
  const path = sanitizeCallbackPath(rawCallback, origin);
  if (!path) return null;
  const match = FEEDBACK_PATH.exec(path);
  if (!match) return null;
  try {
    const qr = await prisma.qRCode.findFirst({
      where: { code: match[1], isActive: true, revokedAt: null, archivedAt: null },
      select: { expiresAt: true, dealer: { select: { businessName: true, name: true } } },
    });
    if (!qr || (qr.expiresAt && qr.expiresAt <= new Date())) return null;
    const placeName = (qr.dealer.businessName || qr.dealer.name || '').trim();
    return placeName ? { placeName: placeName.slice(0, 80) } : null;
  } catch {
    return null;
  }
}

export type ReferralPreview = {
  /** Davet edenin yalnız adı (soyadı ve e-posta asla). */
  inviterFirstName: string | null;
  /** Sunucu matrisinden davet edilenin ödülü (müşteri hesabı, doğrulama + ilk QR sonrası). */
  referredPoints: number | null;
};

/**
 * `?ref=` kodu gerçekten kullanılabilir mi? Geçersiz / pasif / kotası dolmuş kod veya kapalı
 * modülde `null` → kayıt ekranında bonus vaadi HİÇ gösterilmez (eskiden her değer için
 * "bonus puan kazanacaksınız" yazıyordu).
 */
export async function getReferralPreview(rawCode: string | null): Promise<ReferralPreview | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  try {
    if (!(await isReferralModuleEnabled())) return null;
    const row = await prisma.referralCode.findUnique({
      where: { code },
      select: {
        isActive: true,
        usageCount: true,
        maxUsage: true,
        user: { select: { name: true, suspendedAt: true, anonymizedAt: true } },
      },
    });
    if (!row || !row.isActive) return null;
    if (row.maxUsage != null && row.usageCount >= row.maxUsage) return null;
    if (row.user.suspendedAt || row.user.anonymizedAt) return null;
    const firstName = (row.user.name ?? '').trim().split(/\s+/)[0] ?? '';
    let referredPoints: number | null = null;
    try {
      const { referredPoints: pts } = getReferralRewards(await getPointsMatrix());
      referredPoints = Number.isFinite(pts) && pts > 0 ? Math.floor(pts) : null;
    } catch {
      referredPoints = null;
    }
    return { inviterFirstName: firstName ? firstName.slice(0, 40) : null, referredPoints };
  } catch {
    return null;
  }
}

/** Next 15+ `searchParams` değerinden tek dize. */
export function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}
