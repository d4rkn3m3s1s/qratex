/**
 * Personel davet akışı (P0-04 kalıcı çözümü, F1.2 `StaffInvitation`).
 *
 * Eski desen (`POST /api/dealer/staff`): bayinin yazdığı e-posta sistemde kayıtlıysa o hesabın
 * ŞİFRESİ bayinin gönderdiği şifreyle değiştiriliyor, adı eziliyor ve rolü STAFF yapılıyordu —
 * hesap sahibinden onay alınmadan. Kayıt herkese açık olduğundan herkes bayi hesabı açıp HERHANGİ
 * bir müşteriyi ele geçirebiliyor, bayi ve admin hesaplarını STAFF'a düşürebiliyordu. Yeni hesap
 * açılırken de bayinin sahibi olmadığı e-posta "doğrulanmış" işaretleniyordu (D6).
 *
 * Yeni sözleşme:
 *  1. Bayi YALNIZ davet oluşturur (`createStaffInvitation`): e-postaya tek kullanımlık bağlantı
 *     gider. Var olan hiçbir kullanıcı satırına YAZILMAZ; bayi şifre BELİRLEYEMEZ.
 *  2. Davetli bağlantıyı açar (`previewStaffInvitation`):
 *      - hesabı yoksa adını ve KENDİ şifresini belirleyip hesabını açar;
 *      - hesabı varsa önce giriş yapar, daveti KENDİSİ kabul eder.
 *  3. Kabul (`acceptStaffInvitation`) tek transaction'da: davet koşullu tüketilir (yarışta tek
 *     kazanan), rol dönüşümü + `DealerStaff` bağı yazılır, oturum sürümü artırılır.
 *  4. ADMIN ve DEALER hesapları personele DÖNÜŞTÜRÜLEMEZ. Başka bir işletmede aktif personel olan
 *     hesap ikinci işletmeye bağlanamaz.
 *  5. Davet oluşturma yanıtı hedef e-postanın sistemde olup olmadığını SÖYLEMEZ (hesap
 *     numaralandırma olmasın).
 */
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { isSameEmail, normalizeEmail, emailLookupFilter } from '@/lib/auth/normalize-email';
import { maskEmail } from '@/lib/http/dto';
import { invalidateStaffScope } from '@/lib/auth/scope';
import { invalidateSessionState } from '@/lib/auth/session-state';

export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STAFF_INVITE_PATH = '/auth/staff-invite';

export type InvitationErrorCode =
  | 'INVALID_EMAIL'
  | 'SELF_INVITE'
  | 'ALREADY_YOUR_STAFF'
  | 'INVITE_NOT_FOUND'
  | 'INVITE_EXPIRED'
  | 'INVITE_REVOKED'
  | 'INVITE_USED'
  | 'LOGIN_REQUIRED'
  | 'EMAIL_MISMATCH'
  | 'ROLE_NOT_CONVERTIBLE'
  | 'ALREADY_STAFF_ELSEWHERE'
  | 'INVALID_SIGNUP';

export interface InvitationFailure {
  ok: false;
  status: 400 | 401 | 403 | 404 | 409 | 410;
  code: InvitationErrorCode;
  error: string;
}

function fail(status: InvitationFailure['status'], code: InvitationErrorCode, error: string): InvitationFailure {
  return { ok: false, status, code, error };
}

export function hashInviteToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Şifre politikası: kayıt formuyla aynı (≥ 8, küçük + büyük harf + rakam). */
export function isAcceptablePassword(pw: unknown): pw is string {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 200 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(pw);
}

const ROLES_NEVER_CONVERTED = new Set(['ADMIN', 'DEALER']);

// ───────────────────────────── Oluşturma ─────────────────────────────

export interface CreateInvitationInput {
  dealerId: string;
  invitedById: string;
  email: string;
  jobTitle?: string | null;
  now?: Date;
}

export type CreateInvitationResult =
  | {
      ok: true;
      plainToken: string;
      invitation: { id: string; email: string; jobTitle: string | null; expiresAt: Date; createdAt: Date };
    }
  | InvitationFailure;

export async function createStaffInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
  const email = normalizeEmail(input.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    return fail(400, 'INVALID_EMAIL', 'Geçerli bir e-posta adresi girin.');
  }
  const now = input.now ?? new Date();

  const dealer = await prisma.user.findUnique({ where: { id: input.dealerId }, select: { email: true } });
  if (dealer?.email && isSameEmail(dealer.email, email)) {
    return fail(400, 'SELF_INVITE', 'Kendinizi personel olarak davet edemezsiniz.');
  }

  // Yalnız BAYİNİN KENDİ verisi açıklanır: bu kişi zaten sizin aktif personelinizse söyleriz.
  // Başka işletmede kayıtlı mı / hangi rolde mi — bu bilgi asla dönmez (kabul anında uygulanır).
  const existingOwnStaff = await prisma.dealerStaff.findFirst({
    where: { dealerId: input.dealerId, isActive: true, user: { email: emailLookupFilter(email) } },
    select: { id: true },
  });
  if (existingOwnStaff) {
    return fail(409, 'ALREADY_YOUR_STAFF', 'Bu kişi zaten ekibinizde.');
  }

  const plainToken = generateInviteToken();
  const tokenHash = hashInviteToken(plainToken);
  const expiresAt = new Date(now.getTime() + STAFF_INVITE_TTL_MS);
  const jobTitle = input.jobTitle?.trim() ? input.jobTitle.trim().slice(0, 50) : null;

  const invitation = await prisma.$transaction(async (tx) => {
    // Aynı kişiye bekleyen eski davet varsa iptal (yeniden gönderim = tek geçerli bağlantı).
    await tx.staffInvitation.updateMany({
      where: { dealerId: input.dealerId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.staffInvitation.create({
      data: {
        dealerId: input.dealerId,
        email,
        jobTitle,
        tokenHash,
        invitedById: input.invitedById,
        expiresAt,
      },
      select: { id: true, email: true, jobTitle: true, expiresAt: true, createdAt: true },
    });
  });

  return { ok: true, plainToken, invitation };
}

// ───────────────────────────── Önizleme ─────────────────────────────

type InvitationRow = {
  id: string;
  dealerId: string;
  email: string;
  role: string;
  jobTitle: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

async function findInvitation(plainToken: unknown): Promise<InvitationRow | null> {
  if (typeof plainToken !== 'string' || plainToken.length < 16 || plainToken.length > 200) return null;
  return prisma.staffInvitation.findUnique({
    where: { tokenHash: hashInviteToken(plainToken) },
    select: {
      id: true,
      dealerId: true,
      email: true,
      role: true,
      jobTitle: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });
}

function invitationStateError(inv: InvitationRow | null, now: Date): InvitationFailure | null {
  if (!inv) return fail(404, 'INVITE_NOT_FOUND', 'Davet bağlantısı geçersiz.');
  if (inv.acceptedAt) return fail(410, 'INVITE_USED', 'Bu davet zaten kullanılmış.');
  if (inv.revokedAt) return fail(410, 'INVITE_REVOKED', 'Bu davet iptal edilmiş. İşletmeden yeni bir davet isteyin.');
  if (inv.expiresAt.getTime() <= now.getTime()) {
    return fail(410, 'INVITE_EXPIRED', 'Bu davetin süresi dolmuş. İşletmeden yeni bir davet isteyin.');
  }
  return null;
}

export type InvitationPreview =
  | {
      ok: true;
      businessName: string;
      emailMasked: string;
      jobTitle: string | null;
      expiresAt: Date;
      /** Davet e-postasıyla kayıtlı hesap var mı (bağlantıyı açan kişi e-postanın sahibidir). */
      accountExists: boolean;
      /** Oturum açık ve davet e-postasıyla eşleşiyor mu? */
      signedInAsInvitee: boolean;
    }
  | InvitationFailure;

export async function previewStaffInvitation(
  plainToken: unknown,
  viewer: { userId: string | null; email: string | null } = { userId: null, email: null },
  now: Date = new Date()
): Promise<InvitationPreview> {
  const inv = await findInvitation(plainToken);
  const stateError = invitationStateError(inv, now);
  if (stateError || !inv) return stateError ?? fail(404, 'INVITE_NOT_FOUND', 'Davet bağlantısı geçersiz.');

  const [dealer, account] = await Promise.all([
    prisma.user.findUnique({ where: { id: inv.dealerId }, select: { businessName: true, name: true } }),
    prisma.user.findFirst({ where: { email: emailLookupFilter(inv.email) }, select: { id: true } }),
  ]);

  return {
    ok: true,
    businessName: dealer?.businessName || dealer?.name || 'İşletme',
    emailMasked: maskEmail(inv.email),
    jobTitle: inv.jobTitle,
    expiresAt: inv.expiresAt,
    accountExists: !!account,
    signedInAsInvitee: !!viewer.userId && isSameEmail(viewer.email, inv.email),
  };
}

// ───────────────────────────── Kabul ─────────────────────────────

export interface AcceptInvitationInput {
  plainToken: unknown;
  /** Oturum açık kullanıcı (yoksa null → yeni hesap açma yolu). */
  sessionUserId: string | null;
  /** Yeni hesap için (yalnız oturumsuz yol). */
  name?: unknown;
  password?: unknown;
  now?: Date;
}

export type AcceptInvitationResult =
  | { ok: true; userId: string; dealerId: string; createdAccount: boolean; requiresReLogin: boolean }
  | InvitationFailure;

class AcceptAbort extends Error {
  constructor(public readonly failure: InvitationFailure) {
    super(failure.code);
  }
}

export async function acceptStaffInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
  const now = input.now ?? new Date();
  const inv = await findInvitation(input.plainToken);
  const stateError = invitationStateError(inv, now);
  if (stateError || !inv) return stateError ?? fail(404, 'INVITE_NOT_FOUND', 'Davet bağlantısı geçersiz.');

  // ── Kim kabul ediyor? ──
  let existingUser: { id: string; email: string | null; role: string } | null = null;
  if (input.sessionUserId) {
    existingUser = await prisma.user.findUnique({
      where: { id: input.sessionUserId },
      select: { id: true, email: true, role: true },
    });
    if (!existingUser) return fail(401, 'LOGIN_REQUIRED', 'Oturumunuz geçersiz. Lütfen yeniden giriş yapın.');
    if (!isSameEmail(existingUser.email, inv.email)) {
      return fail(403, 'EMAIL_MISMATCH', 'Bu davet başka bir e-posta adresine gönderildi. Davet edilen hesapla giriş yapın.');
    }
  } else {
    const account = await prisma.user.findFirst({
      where: { email: emailLookupFilter(inv.email) },
      select: { id: true },
    });
    if (account) {
      return fail(401, 'LOGIN_REQUIRED', 'Bu e-posta ile bir hesabınız var. Daveti kabul etmek için önce giriş yapın.');
    }
  }

  if (existingUser && ROLES_NEVER_CONVERTED.has(existingUser.role)) {
    return fail(409, 'ROLE_NOT_CONVERTIBLE', 'İşletme ve yönetici hesapları personel hesabına dönüştürülemez.');
  }

  // Yeni hesap girdileri (oturumsuz yol).
  let newAccount: { name: string; passwordHash: string } | null = null;
  if (!existingUser) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < 2 || name.length > 50) {
      return fail(400, 'INVALID_SIGNUP', 'Adınız 2–50 karakter olmalı.');
    }
    if (!isAcceptablePassword(input.password)) {
      return fail(400, 'INVALID_SIGNUP', 'Şifre en az 8 karakter olmalı; küçük harf, büyük harf ve rakam içermeli.');
    }
    newAccount = { name, passwordHash: await hashPassword(input.password) };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) Daveti KOŞULLU tüket: eşzamanlı iki kabulde yalnız biri kazanır.
      const claimed = await tx.staffInvitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) throw new AcceptAbort(fail(410, 'INVITE_USED', 'Bu davet zaten kullanılmış.'));

      // 2) Kullanıcı: var olan hesap (onaylı rol dönüşümü) ya da yeni hesap (e-posta bağlantıyla
      //    kanıtlandığı için doğrulanmış).
      let userId: string;
      let createdAccount = false;
      if (existingUser) {
        // Rolü transaction içinde yeniden oku (araya giren rol değişikliğine karşı).
        const fresh = await tx.user.findUnique({ where: { id: existingUser.id }, select: { role: true } });
        if (!fresh || ROLES_NEVER_CONVERTED.has(fresh.role)) {
          throw new AcceptAbort(fail(409, 'ROLE_NOT_CONVERTIBLE', 'İşletme ve yönetici hesapları personel hesabına dönüştürülemez.'));
        }
        userId = existingUser.id;
      } else {
        const created = await tx.user.create({
          data: {
            name: newAccount!.name,
            email: inv.email,
            password: newAccount!.passwordHash,
            role: 'STAFF',
            emailVerified: now,
          },
          select: { id: true },
        });
        userId = created.id;
        createdAccount = true;
      }

      // 3) Personel bağı: kişi başka işletmede AKTİF personelse reddet.
      const link = await tx.dealerStaff.findUnique({
        where: { userId },
        select: { id: true, dealerId: true, isActive: true },
      });
      if (link && link.isActive && link.dealerId !== inv.dealerId) {
        throw new AcceptAbort(
          fail(409, 'ALREADY_STAFF_ELSEWHERE', 'Hesabınız başka bir işletmede aktif personel olarak kayıtlı. Önce oradan ayrılmanız gerekir.')
        );
      }
      if (link) {
        await tx.dealerStaff.update({
          where: { id: link.id },
          data: { dealerId: inv.dealerId, isActive: true, jobTitle: inv.jobTitle },
        });
      } else {
        await tx.dealerStaff.create({
          data: { dealerId: inv.dealerId, userId, jobTitle: inv.jobTitle },
        });
      }

      // 4) Rol dönüşümü + oturum sürümü (eski token'lar düşer, yeni girişte STAFF rolüyle gelir).
      if (!createdAccount) {
        await tx.user.update({
          where: { id: userId },
          data: { role: 'STAFF', sessionVersion: { increment: 1 } },
        });
      }

      await tx.staffInvitation.update({ where: { id: inv.id }, data: { acceptedUserId: userId } });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ACCEPT_STAFF_INVITATION',
          entity: 'StaffInvitation',
          entityId: inv.id,
          newData: { dealerId: inv.dealerId, createdAccount },
        },
      });

      return { userId, createdAccount };
    });

    await Promise.all([
      invalidateStaffScope(result.userId).catch(() => {}),
      // Rol CUSTOMER → STAFF oldu: requireAuth'un oturum durumu önbelleği eski rolü tutmasın.
      invalidateSessionState(result.userId).catch(() => {}),
    ]);
    return {
      ok: true,
      userId: result.userId,
      dealerId: inv.dealerId,
      createdAccount: result.createdAccount,
      requiresReLogin: !result.createdAccount,
    };
  } catch (err) {
    if (err instanceof AcceptAbort) return err.failure;
    // Eşzamanlı kayıt: aynı e-postayla hesap az önce açıldıysa (P2002) giriş yolu.
    if ((err as { code?: string } | null)?.code === 'P2002') {
      return fail(409, 'LOGIN_REQUIRED', 'Bu e-posta ile bir hesap az önce oluşturuldu. Lütfen giriş yapıp daveti kabul edin.');
    }
    throw err;
  }
}

// ───────────────────────────── Bayi tarafı listeleme / iptal ─────────────────────────────

export async function listPendingInvitations(dealerId: string, now: Date = new Date()) {
  const rows = await prisma.staffInvitation.findMany({
    where: { dealerId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true, email: true, jobTitle: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows;
}

export async function revokeInvitation(dealerId: string, invitationId: string, now: Date = new Date()): Promise<boolean> {
  const res = await prisma.staffInvitation.updateMany({
    where: { id: invitationId, dealerId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  return res.count === 1;
}

// ───────────────────────────── E-posta ─────────────────────────────

/**
 * Davet e-postası. Bayi adı ve unvan KAÇIŞLANIR (O2: bayi adı e-postaya kaçışsız giriyordu).
 * Mail yapılandırılmamışsa `false` döner; çağıran bayiye bağlantıyı elle paylaşma seçeneği sunar.
 */
export async function sendStaffInvitationEmail(params: {
  to: string;
  plainToken: string;
  businessName: string;
  jobTitle: string | null;
  origin: string;
}): Promise<boolean> {
  try {
    const { isMailConfigured, sendTransactionalEmail } = await import('@/lib/mail-sender');
    if (!isMailConfigured()) return false;
    const {
      buildTransactionalEmailHtml,
      buildTransactionalPlainText,
      getTransactionalEmailLogoUrl,
    } = await import('@/lib/transactional-email');
    const { escapeEmailHtml } = await import('@/lib/security/escape-html');

    const origin = params.origin.replace(/\/$/, '');
    const href = `${origin}${STAFF_INVITE_PATH}?token=${encodeURIComponent(params.plainToken)}`;
    const business = params.businessName.slice(0, 120);
    const role = params.jobTitle ? ` (${params.jobTitle.slice(0, 50)})` : '';
    const lines = [
      `${business} sizi QRATEX üzerinde ekibine personel${role} olarak davet etti.`,
      'Daveti kabul etmek için aşağıdaki bağlantıyı kullanın. Hesabınız yoksa kendi şifrenizi belirleyerek oluşturursunuz; hesabınız varsa giriş yapıp daveti onaylarsınız.',
      'Bağlantı 7 gün geçerlidir. Bu daveti beklemiyorsanız e-postayı yok sayabilirsiniz; hesabınızda hiçbir değişiklik yapılmaz.',
    ];
    const cta = { label: 'Daveti görüntüle', href };
    const html = buildTransactionalEmailHtml({
      heading: 'Ekibe katılma daveti',
      bodyHtml: lines.map((l) => `<p style="margin:0 0 12px;">${escapeEmailHtml(l)}</p>`).join(''),
      cta,
      logoUrl: getTransactionalEmailLogoUrl(origin),
      brandLinkHref: origin,
    });
    const text = buildTransactionalPlainText({ heading: 'Ekibe katılma daveti', bodyLines: lines, cta });
    const res = await sendTransactionalEmail({
      to: params.to,
      subject: `${business} sizi ekibine davet etti`,
      html,
      text,
    });
    return res.ok;
  } catch (err) {
    console.error('[STAFF_INVITE] e-posta gönderilemedi:', err);
    return false;
  }
}
