/**
 * Davet (referral) servisi — P0-16.
 *
 * Kök neden: kayıt ucu (`/api/auth/register`) davet kodunu görünce doğrulanmamış e-postayla
 * anında `COMPLETED` davet yazıp iki tarafa puan basıyordu; modül kapısı, ömür/aylık limit ve
 * karşılıklı davet (A↔B) reddi yalnız `/api/referral` POST'unda vardı. Sahte e-postalarla davet
 * çiftliği kurulabiliyordu.
 *
 * Yeni akış (iki aşama, tek servis):
 *   1. `createPendingReferral` — kayıt ya da kod uygulama anında `PENDING` davet, PUAN YOK.
 *      Modül kapısı, kod geçerliliği, kendi kodu, tek davet, karşılıklı davet, ömür boyu ve
 *      aylık limit, kod kullanım limiti burada; referrer başına advisory kilitle sıralı.
 *   2. `qualifyReferral` — davet edilen kullanıcı e-postasını DOĞRULAMIŞ ve en az bir QR
 *      olayı (QR geri bildirimi ya da kart tüketimi) oluşmuşsa, `PENDING → COMPLETED` geçişini
 *      İLK yapan çağrı iki tarafa `mintPoints` ile tek seferlik kredi verir
 *      (`referral:<id>:referred|referrer` anahtarları, defter + points_credited aynı tx'te).
 *      Tetikleyiciler: e-posta doğrulama ucu, QR geri bildirimi, kod uygulama.
 *
 * Bekleyen davet `REFERRAL_PENDING_TTL_DAYS` gün içinde nitelenmezse `EXPIRED` olur.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy';
import { getModuleControls } from '@/lib/module-gate';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { getPointsMatrix, getReferralRewards } from '@/lib/points-rules';

export const REFERRAL_PENDING_TTL_DAYS = 30;
const DAY_MS = 86_400_000;

export type ReferralRejectCode =
  | 'MODULE_DISABLED'
  | 'INVALID_CODE'
  | 'CODE_NOT_FOUND'
  | 'CODE_INACTIVE'
  | 'NOT_ELIGIBLE'
  | 'SELF_REFERRAL'
  | 'ALREADY_REFERRED'
  | 'RECIPROCAL'
  | 'LIFETIME_LIMIT'
  | 'MONTHLY_LIMIT'
  | 'MAX_USAGE';

export const REFERRAL_REJECT_MESSAGES: Record<ReferralRejectCode, string> = {
  MODULE_DISABLED: 'Davet programı şu anda kapalı.',
  INVALID_CODE: 'Geçerli bir davet kodu girin.',
  CODE_NOT_FOUND: 'Davet kodu bulunamadı.',
  CODE_INACTIVE: 'Bu davet kodu artık kullanılamıyor.',
  NOT_ELIGIBLE: 'Davet programı yalnız müşteri hesaplarına açıktır.',
  SELF_REFERRAL: 'Kendi davet kodunu kullanamazsın.',
  ALREADY_REFERRED: 'Daha önce bir davet kodu kullandın.',
  RECIPROCAL: 'Seni davet ettiğin kişinin kodunu kullanamazsın.',
  LIFETIME_LIMIT: 'Bu davet kodu platform davet limitine ulaştı.',
  MONTHLY_LIMIT: 'Bu davet kodunun aylık kullanım limiti doldu.',
  MAX_USAGE: 'Bu davet kodunun kullanım limiti doldu.',
};

export const REFERRAL_REJECT_STATUS: Record<ReferralRejectCode, number> = {
  MODULE_DISABLED: 403,
  INVALID_CODE: 400,
  CODE_NOT_FOUND: 404,
  CODE_INACTIVE: 400,
  NOT_ELIGIBLE: 403,
  SELF_REFERRAL: 400,
  ALREADY_REFERRED: 409,
  RECIPROCAL: 400,
  LIFETIME_LIMIT: 400,
  MONTHLY_LIMIT: 400,
  MAX_USAGE: 400,
};

export type CreatePendingReferralResult =
  | { ok: true; referralId: string; referrerId: string; expiresAt: Date }
  | { ok: false; code: ReferralRejectCode; message: string };

type Db = typeof prisma;

function reject(code: ReferralRejectCode): { ok: false; code: ReferralRejectCode; message: string } {
  return { ok: false, code, message: REFERRAL_REJECT_MESSAGES[code] };
}

/** Kod biçimi: kayıt formundan, URL'den ya da kod alanından gelen her şey buradan geçer. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length < 4 || code.length > 32 || !/^[A-Z0-9_-]+$/.test(code)) return null;
  return code;
}

/** Davet modülü global olarak açık mı? (admin modül kontrolü; DB hatasında varsayılan) */
export async function isReferralModuleEnabled(): Promise<boolean> {
  try {
    const controls = await getModuleControls();
    return (controls as Record<string, boolean | undefined>).referrals !== false;
  } catch {
    // Kapıyı okuyamıyorsak puan basmayalım (fail-closed); bekleyen davet sonra nitelenir.
    return false;
  }
}

/** UTC ay başı (sunucu saat diliminden bağımsız). */
export function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Limitlere sayılan davetler: tamamlanmış + süresi dolmamış bekleyenler. */
function liveReferralFilter(now: Date): Prisma.ReferralWhereInput {
  return {
    OR: [{ status: 'COMPLETED' }, { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
  };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Davet kodunu `PENDING` olarak kaydeder. PUAN VERMEZ. Reddedilen durumlar hata fırlatmaz.
 */
export async function createPendingReferral(
  input: { referredUserId: string; code: unknown; now?: Date },
  db: Db = prisma
): Promise<CreatePendingReferralResult> {
  const now = input.now ?? new Date();
  const code = normalizeReferralCode(input.code);
  if (!code) return reject('INVALID_CODE');

  if (!(await isReferralModuleEnabled())) return reject('MODULE_DISABLED');

  const [codeRow, referred] = await Promise.all([
    db.referralCode.findUnique({
      where: { code },
      select: { id: true, userId: true, code: true, isActive: true, maxUsage: true },
    }),
    db.user.findUnique({ where: { id: input.referredUserId }, select: { id: true, role: true } }),
  ]);
  if (!codeRow) return reject('CODE_NOT_FOUND');
  if (!codeRow.isActive) return reject('CODE_INACTIVE');
  if (!referred || referred.role !== 'CUSTOMER') return reject('NOT_ELIGIBLE');
  if (codeRow.userId === referred.id) return reject('SELF_REFERRAL');

  const innov = await getInnovationPlatformConfig();
  const referrerId = codeRow.userId;
  const expiresAt = new Date(now.getTime() + REFERRAL_PENDING_TTL_DAYS * DAY_MS);

  try {
    return await db.$transaction(async (tx): Promise<CreatePendingReferralResult> => {
      // Aynı davet edene ait limit kontrollerini sıraya sok: eşzamanlı kayıtlar aynı "kalan"
      // kotayı görüp limiti aşamasın.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`referral:${referrerId}`}))`;

      const existing = await tx.referral.findUnique({
        where: { referredId: referred.id },
        select: { id: true },
      });
      if (existing) return reject('ALREADY_REFERRED');

      // Karşılıklı davet (A↔B): davet eden, bu kullanıcı tarafından davet edilmişse reddet.
      const reverse = await tx.referral.findFirst({
        where: { referrerId: referred.id, referredId: referrerId, status: { not: 'EXPIRED' } },
        select: { id: true },
      });
      if (reverse) return reject('RECIPROCAL');

      const live = liveReferralFilter(now);
      const [lifetime, monthly, byCode] = await Promise.all([
        tx.referral.count({ where: { referrerId, ...live } }),
        tx.referral.count({ where: { referralCode: codeRow.code, createdAt: { gte: startOfMonthUTC(now) } } }),
        codeRow.maxUsage ? tx.referral.count({ where: { referralCode: codeRow.code, ...live } }) : Promise.resolve(0),
      ]);
      if (lifetime >= innov.referral.maxInvitesPerReferrerLifetime) return reject('LIFETIME_LIMIT');
      if (monthly >= innov.referral.maxRedemptionsPerReferralCodePerMonth) return reject('MONTHLY_LIMIT');
      if (codeRow.maxUsage && byCode >= codeRow.maxUsage) return reject('MAX_USAGE');

      const created = await tx.referral.create({
        data: {
          referrerId,
          referredId: referred.id,
          referralCode: codeRow.code,
          status: 'PENDING',
          pointsEarned: 0,
          bonusGiven: 0,
          expiresAt,
        },
        select: { id: true },
      });
      return { ok: true as const, referralId: created.id, referrerId, expiresAt };
    });
  } catch (e) {
    // referredId @unique: eşzamanlı ikinci istek.
    if (isUniqueViolation(e)) return reject('ALREADY_REFERRED');
    throw e;
  }
}

export type QualifyReferralReason =
  | 'NO_PENDING'
  | 'EXPIRED'
  | 'MODULE_DISABLED'
  | 'NOT_VERIFIED'
  | 'NO_QR_EVENT'
  | 'NOT_ELIGIBLE'
  | 'RECIPROCAL'
  | 'LIFETIME_LIMIT'
  | 'ALREADY_QUALIFIED';

export type QualifyReferralResult =
  | { qualified: true; referralId: string; referrerId: string; referredPoints: number; referrerPoints: number }
  | { qualified: false; reason: QualifyReferralReason };

async function expireReferral(db: Db, referralId: string) {
  await db.referral.updateMany({ where: { id: referralId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
}

/**
 * Bekleyen daveti nitelendirir ve iki tarafa TEK SEFER puan verir. Koşul sağlanmıyorsa
 * davet `PENDING` kalır (ya da süresi dolduysa/kural ihlalindeyse `EXPIRED` olur).
 */
export async function qualifyReferral(
  referredUserId: string,
  opts: { now?: Date } = {},
  db: Db = prisma
): Promise<QualifyReferralResult> {
  const now = opts.now ?? new Date();
  const ref = await db.referral.findUnique({
    where: { referredId: referredUserId },
    select: { id: true, referrerId: true, referredId: true, referralCode: true, status: true, expiresAt: true },
  });
  if (!ref || ref.status !== 'PENDING') return { qualified: false, reason: 'NO_PENDING' };

  if (ref.expiresAt && ref.expiresAt.getTime() <= now.getTime()) {
    await expireReferral(db, ref.id);
    return { qualified: false, reason: 'EXPIRED' };
  }

  // Modül kapalıysa puan yok; davet bekler (açılınca bir sonraki olayda nitelenir).
  if (!(await isReferralModuleEnabled())) return { qualified: false, reason: 'MODULE_DISABLED' };

  const referred = await db.user.findUnique({
    where: { id: referredUserId },
    select: { id: true, role: true, emailVerified: true },
  });
  if (!referred || referred.role !== 'CUSTOMER') {
    await expireReferral(db, ref.id);
    return { qualified: false, reason: 'NOT_ELIGIBLE' };
  }
  if (!referred.emailVerified) return { qualified: false, reason: 'NOT_VERIFIED' };

  // İlk QR olayı: QR geri bildirimi (silinmemiş) ya da kart tüketimi.
  const [feedback, consumption] = await Promise.all([
    db.feedback.findFirst({ where: { userId: referredUserId, deletedAt: null }, select: { id: true } }),
    db.consumption.findFirst({ where: { customerId: referredUserId }, select: { id: true } }),
  ]);
  if (!feedback && !consumption) return { qualified: false, reason: 'NO_QR_EVENT' };

  const matrix = await getPointsMatrix();
  const { referredPoints, referrerPoints } = getReferralRewards(matrix);
  const innov = await getInnovationPlatformConfig();

  return db.$transaction(async (tx): Promise<QualifyReferralResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`referral:${ref.referrerId}`}))`;

    // Karşılıklı davet: diğer yön zaten tamamlanmışsa bu yön ödenmez.
    const reverse = await tx.referral.findFirst({
      where: { referrerId: referredUserId, referredId: ref.referrerId, status: 'COMPLETED' },
      select: { id: true },
    });
    if (reverse) {
      await tx.referral.updateMany({ where: { id: ref.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      return { qualified: false as const, reason: 'RECIPROCAL' as const };
    }

    const completedCount = await tx.referral.count({
      where: { referrerId: ref.referrerId, status: 'COMPLETED' },
    });
    if (completedCount >= innov.referral.maxInvitesPerReferrerLifetime) {
      await tx.referral.updateMany({ where: { id: ref.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      return { qualified: false as const, reason: 'LIFETIME_LIMIT' as const };
    }

    // Tek-sefer geçiş: PENDING → COMPLETED'i İLK çeviren çağrı öder.
    const claim = await tx.referral.updateMany({
      where: { id: ref.id, status: 'PENDING' },
      data: { status: 'COMPLETED', completedAt: now, bonusGiven: referredPoints, pointsEarned: referrerPoints },
    });
    if (claim.count === 0) return { qualified: false as const, reason: 'ALREADY_QUALIFIED' as const };

    await mintPoints(tx, {
      userId: referredUserId,
      points: referredPoints,
      source: 'referral',
      sourceId: ref.id,
      idempotencyKey: `referral:${ref.id}:referred`,
      actorId: ref.referrerId,
      meta: { role: 'referred', referralId: ref.id },
      now,
    });
    await mintPoints(tx, {
      userId: ref.referrerId,
      points: referrerPoints,
      source: 'referral',
      sourceId: ref.id,
      idempotencyKey: `referral:${ref.id}:referrer`,
      actorId: referredUserId,
      meta: { role: 'referrer', referralId: ref.id },
      now,
    });

    await tx.referralCode.updateMany({
      where: { code: ref.referralCode },
      data: { usageCount: { increment: 1 } },
    });

    await tx.notification.createMany({
      data: [
        {
          userId: referredUserId,
          type: 'REFERRAL_BONUS',
          title: 'Hoş geldin bonusu!',
          message: `Davet ödülün hesabına işlendi: +${referredPoints} puan.`,
        },
        {
          userId: ref.referrerId,
          type: 'REFERRAL_COMPLETE',
          title: 'Davetin tamamlandı!',
          message: `Davet ettiğin arkadaşın ilk QR deneyimini tamamladı. +${referrerPoints} puan kazandın!`,
        },
      ],
    });

    return {
      qualified: true as const,
      referralId: ref.id,
      referrerId: ref.referrerId,
      referredPoints,
      referrerPoints,
    };
  });
}

/**
 * Olay kancaları için güvenli çağrı (e-posta doğrulama, QR geri bildirimi): hata yutulur ve
 * loglanır; tetikleyen akış asla bozulmaz.
 */
export async function maybeQualifyReferral(referredUserId: string | null | undefined): Promise<void> {
  if (!referredUserId) return;
  try {
    await qualifyReferral(referredUserId);
  } catch (e) {
    console.error('[REFERRAL_QUALIFY]', referredUserId, e);
  }
}
