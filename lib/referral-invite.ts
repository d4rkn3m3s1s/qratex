/**
 * Davet yüzeyi (`/customer/me/invite`) sunucu mantığı — okuma modeli + kullanıcı eylemleri.
 *
 * Puan kuralları ve PENDING → COMPLETED geçişi `lib/referral.ts`'te (P0-16): bu dosya
 * yalnız o servisi ÇAĞIRIR, puanı kendisi basmaz (kademe ödülü hariç — o da `mintPoints`
 * üzerinden, JSON guard + tek-kez anahtarla).
 *
 * Neler burada:
 *  - `ensureReferralCode`   — kod yoksa üretir (yalnız POST yolundan; GET yazmaz). Elle
 *                             yazılabilir alfabe (0/O, 1/I yok), eşzamanlı ilk açılışta P2002 güvenli.
 *  - `getInviteOverview`    — sayfanın tek okuma modeli: ödüller, sayılar, gerçek kazanç
 *                             (aggregate; "son 20 kaydın toplamı" hatası yok), kademeler,
 *                             şeffaf limitler, beni davet eden + kendi adımlarım, ilk sayfa liste.
 *  - `listInviteRows`       — imleç sayfalı davet listesi; ad maskeli, adım göstergeli.
 *  - `applyInviteCode`      — kayıttan sonraki pencerede kod uygulama (+ anında nitelendirme denemesi).
 *  - `claimReferralMilestones` — ulaşılmış kademe ödüllerini atomik öder.
 *  - `nudgeInvite`          — bekleyen arkadaşa tek seferlik (72 saatte bir) hatırlatma; koşullar
 *                             zaten sağlanmışsa nitelendirmeyi yeniden dener (kendini onarma).
 */
import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { getPointsMatrix, getReferralRewards } from '@/lib/points-rules';
import { publicDisplayName } from '@/lib/http/dto';
import { encodeCursor, parseCursor } from '@/lib/cursor-pagination';
import {
  REFERRAL_PENDING_TTL_DAYS,
  REFERRAL_REJECT_MESSAGES,
  REFERRAL_REJECT_STATUS,
  createPendingReferral,
  liveReferralFilter,
  qualifyReferral,
  startOfMonthIstanbul,
  type ReferralRejectCode,
} from '@/lib/referral';
import {
  REFERRAL_MILESTONES,
  claimableReferralMilestones,
  parseClaimedReferralMilestones,
} from '@/lib/referral-milestones';

type Db = typeof prisma;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Kayıttan sonra davet kodu elle uygulanabilecek süre (eski hesapların koda bağlanmasını keser). */
export const INVITE_APPLY_WINDOW_DAYS = 7;
/** Aynı arkadaşa iki hatırlatma arasında en az bu kadar saat. */
export const INVITE_NUDGE_COOLDOWN_HOURS = 72;
/** Hatırlatma bildiriminin türü (rate limit sorgusu bu türle yapılır). */
export const INVITE_NUDGE_NOTIFICATION_TYPE = 'REFERRAL_NUDGE';
export const INVITE_PAGE_SIZE = 10;
export const INVITE_PAGE_MAX = 30;

/** Elle yazmaya uygun alfabe: 0/O, 1/I/L karışmaz; `-`/`_` yok. */
export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const REFERRAL_CODE_LENGTH = 8;

export function generateReferralCode(
  length: number = REFERRAL_CODE_LENGTH,
  rand: (max: number) => number = (max) => randomInt(max)
): string {
  let out = '';
  for (let i = 0; i < length; i++) out += REFERRAL_CODE_ALPHABET[rand(REFERRAL_CODE_ALPHABET.length)];
  return out;
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002';
}

// ───────────────────────────── Kod ─────────────────────────────

export interface ReferralCodeInfo {
  code: string;
  isActive: boolean;
}

/**
 * Kullanıcının davet kodunu döndürür; yoksa üretir. İdempotent ve yarış güvenli:
 * `userId @unique` çakışması = eşzamanlı ilk açılış → mevcut kayıt okunur;
 * `code @unique` çakışması = nadir kod çarpışması → yeni kodla yeniden denenir.
 */
export async function ensureReferralCode(userId: string, db: Db = prisma): Promise<ReferralCodeInfo> {
  const select = { code: true, isActive: true } as const;
  const existing = await db.referralCode.findUnique({ where: { userId }, select });
  if (existing) return existing;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.referralCode.create({ data: { userId, code: generateReferralCode() }, select });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const again = await db.referralCode.findUnique({ where: { userId }, select });
      if (again) return again;
    }
  }
  throw new Error('Davet kodu üretilemedi (art arda kod çakışması).');
}

// ───────────────────────────── Okuma modeli ─────────────────────────────

export type InviteRowStatus = 'COMPLETED' | 'PENDING' | 'EXPIRED';
export type InviteRowAction = 'nudge' | 'check' | null;
export type InviteNudgeBlock = 'NOT_VERIFIED' | 'RECENTLY_NUDGED' | null;

export interface InviteRow {
  id: string;
  /** Maskeli ad (`Ayşe K.`); ad yoksa null (istemci "Arkadaşın" yazar). */
  name: string | null;
  initials: string;
  status: InviteRowStatus;
  createdAt: string;
  completedAt: string | null;
  /** Bekleyen davetin son günü. */
  expiresAt: string | null;
  pointsEarned: number;
  steps: { verified: boolean; firstQr: boolean };
  /** Satırdaki eylem: hatırlat / ödülü yeniden kontrol et / yok. */
  action: InviteRowAction;
  /** Hatırlatma neden şu an yapılamıyor (bilgi metni için). */
  nudgeBlockedBy: InviteNudgeBlock;
  /** Bir sonraki hatırlatmanın mümkün olduğu an. */
  nudgeAvailableAt: string | null;
}

export interface InviteRowsPage {
  rows: InviteRow[];
  nextCursor: string | null;
}

export type MilestoneStopState = 'claimed' | 'claimable' | 'locked';

export interface InviteOverview {
  code: string | null;
  codeActive: boolean;
  rewards: { referrerPoints: number; referredPoints: number };
  counts: { total: number; completed: number; pending: number; expired: number };
  earnings: { perInvite: number; milestones: number; total: number };
  milestones: {
    stops: Array<{ count: number; points: number; state: MilestoneStopState; remaining: number }>;
    claimablePoints: number;
    next: { count: number; points: number; remaining: number } | null;
    completed: number;
  };
  limits: {
    lifetime: { used: number; max: number };
    monthly: { used: number; max: number; resetsAt: string };
    codeUsage: { used: number; max: number } | null;
    pendingTtlDays: number;
    applyWindowDays: number;
    nudgeCooldownHours: number;
  };
  referredBy: {
    name: string | null;
    status: InviteRowStatus;
    expiresAt: string | null;
    bonusPoints: number;
    steps: { verified: boolean; firstQr: boolean };
  } | null;
  apply: { canApply: boolean; windowEndsAt: string | null; blockedBy: 'ALREADY_REFERRED' | 'WINDOW_EXPIRED' | null };
  referrals: InviteRowsPage;
  generatedAt: string;
}

function initialsOf(masked: string | null): string {
  if (!masked) return '?';
  const parts = masked.replace(/\./g, '').split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((p) => p.charAt(0).toLocaleUpperCase('tr-TR'));
  return chars.join('') || '?';
}

function maskedName(name: string | null | undefined): string | null {
  const masked = publicDisplayName(name, '');
  return masked ? masked : null;
}

function effectiveStatus(status: string, expiresAt: Date | null, now: Date): InviteRowStatus {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'PENDING' && (!expiresAt || expiresAt.getTime() > now.getTime())) return 'PENDING';
  return 'EXPIRED';
}

/** Verilen kullanıcılardan hangileri ilk QR olayını (geri bildirim ya da kart tüketimi) yaşamış? */
async function usersWithFirstQr(userIds: string[], db: Db): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const [feedbacks, consumptions] = await Promise.all([
    db.feedback.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.consumption.findMany({
      where: { customerId: { in: userIds } },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
  ]);
  const out = new Set<string>();
  for (const f of feedbacks) if (f.userId) out.add(f.userId);
  for (const c of consumptions) if (c.customerId) out.add(c.customerId);
  return out;
}

/** İmleç sayfalı davet listesi (yalnız `referrerId = userId`). */
export async function listInviteRows(
  userId: string,
  opts: { cursor?: string | null; take?: number; now?: Date } = {},
  db: Db = prisma
): Promise<InviteRowsPage> {
  const now = opts.now ?? new Date();
  const take = Math.max(1, Math.min(INVITE_PAGE_MAX, Math.floor(opts.take ?? INVITE_PAGE_SIZE)));
  const cursor = parseCursor(opts.cursor ?? null);

  const raw = await db.referral.findMany({
    where: { referrerId: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      pointsEarned: true,
      createdAt: true,
      completedAt: true,
      expiresAt: true,
      referredId: true,
      referred: { select: { name: true, emailVerified: true } },
    },
  });
  const pageRows = raw.slice(0, take);
  const nextCursor = raw.length > take && pageRows.length > 0 ? encodeCursor(pageRows[pageRows.length - 1]!.id) : null;

  const openIds = pageRows
    .filter((r) => effectiveStatus(r.status, r.expiresAt, now) !== 'COMPLETED')
    .map((r) => r.referredId);
  const pendingVerifiedIds = pageRows
    .filter((r) => effectiveStatus(r.status, r.expiresAt, now) === 'PENDING' && r.referred?.emailVerified)
    .map((r) => r.referredId);

  const since = new Date(now.getTime() - INVITE_NUDGE_COOLDOWN_HOURS * HOUR_MS);
  const [withQr, recentNudges] = await Promise.all([
    usersWithFirstQr(openIds, db),
    pendingVerifiedIds.length
      ? db.notification.findMany({
          where: { userId: { in: pendingVerifiedIds }, type: INVITE_NUDGE_NOTIFICATION_TYPE, createdAt: { gte: since } },
          select: { userId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([] as Array<{ userId: string; createdAt: Date }>),
  ]);
  const lastNudge = new Map<string, Date>();
  for (const n of recentNudges) if (!lastNudge.has(n.userId)) lastNudge.set(n.userId, n.createdAt);

  const rows: InviteRow[] = pageRows.map((r) => {
    const status = effectiveStatus(r.status, r.expiresAt, now);
    const name = maskedName(r.referred?.name);
    const verified = status === 'COMPLETED' || !!r.referred?.emailVerified;
    const firstQr = status === 'COMPLETED' || withQr.has(r.referredId);
    let action: InviteRowAction = null;
    let nudgeBlockedBy: InviteNudgeBlock = null;
    let nudgeAvailableAt: string | null = null;
    if (status === 'PENDING') {
      if (!verified) nudgeBlockedBy = 'NOT_VERIFIED';
      else if (firstQr) action = 'check';
      else {
        const last = lastNudge.get(r.referredId);
        if (last) {
          nudgeBlockedBy = 'RECENTLY_NUDGED';
          nudgeAvailableAt = new Date(last.getTime() + INVITE_NUDGE_COOLDOWN_HOURS * HOUR_MS).toISOString();
        } else action = 'nudge';
      }
    }
    return {
      id: r.id,
      name,
      initials: initialsOf(name),
      status,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      expiresAt: status === 'PENDING' && r.expiresAt ? r.expiresAt.toISOString() : null,
      pointsEarned: status === 'COMPLETED' ? r.pointsEarned : 0,
      steps: { verified, firstQr },
      action,
      nudgeBlockedBy,
      nudgeAvailableAt,
    };
  });

  return { rows, nextCursor };
}

/**
 * Sayfanın tek okuma modeli. YAZMAZ: kod yoksa `code: null` döner, kod POST ile üretilir.
 */
export async function getInviteOverview(
  userId: string,
  opts: { now?: Date } = {},
  db: Db = prisma
): Promise<InviteOverview> {
  const now = opts.now ?? new Date();
  const live = liveReferralFilter(now);

  const [codeRow, me, referredByRow, byStatus, pendingLive, perInviteAgg, matrix, innov, page] = await Promise.all([
    db.referralCode.findUnique({ where: { userId }, select: { code: true, isActive: true, maxUsage: true } }),
    db.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, emailVerified: true, referralMilestonesClaimed: true },
    }),
    db.referral.findUnique({
      where: { referredId: userId },
      select: { status: true, expiresAt: true, bonusGiven: true, referrer: { select: { name: true } } },
    }),
    db.referral.groupBy({ by: ['status'], where: { referrerId: userId }, _count: { _all: true } }),
    // Süresi dolmamış bekleyenler (limitlere sayılanlar; `liveReferralFilter` ile aynı tanım).
    db.referral.count({
      where: { referrerId: userId, status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    db.referral.aggregate({ where: { referrerId: userId, status: 'COMPLETED' }, _sum: { pointsEarned: true } }),
    getPointsMatrix(),
    getInnovationPlatformConfig(),
    listInviteRows(userId, { now }, db),
  ]);

  const total = byStatus.reduce((s, g) => s + g._count._all, 0);
  const completed = byStatus.find((g) => g.status === 'COMPLETED')?._count._all ?? 0;
  // Ömür boyu limit = tamamlanan + canlı bekleyen (servisteki `liveReferralFilter`).
  const lifetimeUsed = completed + pendingLive;

  const code = codeRow?.code ?? null;
  const monthStart = startOfMonthIstanbul(now);
  const referredByStatus = referredByRow ? effectiveStatus(referredByRow.status, referredByRow.expiresAt, now) : null;

  const [monthlyUsed, codeUsed, myQr] = await Promise.all([
    code ? db.referral.count({ where: { referralCode: code, createdAt: { gte: monthStart } } }) : Promise.resolve(0),
    code && codeRow?.maxUsage ? db.referral.count({ where: { referralCode: code, ...live } }) : Promise.resolve(0),
    referredByStatus === 'PENDING' ? usersWithFirstQr([userId], db) : Promise.resolve(new Set<string>()),
  ]);

  const { referredPoints, referrerPoints } = getReferralRewards(matrix);
  const claimed = parseClaimedReferralMilestones(me?.referralMilestonesClaimed);
  const claimedSet = new Set(claimed);
  const claimable = claimableReferralMilestones(completed, claimed);
  const milestonePoints = REFERRAL_MILESTONES.filter((m) => claimedSet.has(m.count)).reduce((s, m) => s + m.points, 0);
  const perInvite = perInviteAgg._sum.pointsEarned ?? 0;
  const next = REFERRAL_MILESTONES.find((m) => completed < m.count) ?? null;

  const windowEndsAt = me ? new Date(me.createdAt.getTime() + INVITE_APPLY_WINDOW_DAYS * DAY_MS) : null;
  const windowOpen = !!windowEndsAt && windowEndsAt.getTime() > now.getTime();
  const applyBlockedBy = referredByRow ? 'ALREADY_REFERRED' : windowOpen ? null : 'WINDOW_EXPIRED';

  const referredByName = maskedName(referredByRow?.referrer?.name);

  return {
    code,
    codeActive: codeRow ? codeRow.isActive : true,
    rewards: { referrerPoints, referredPoints },
    counts: { total, completed, pending: pendingLive, expired: Math.max(0, total - completed - pendingLive) },
    earnings: { perInvite, milestones: milestonePoints, total: perInvite + milestonePoints },
    milestones: {
      stops: REFERRAL_MILESTONES.map((m) => ({
        count: m.count,
        points: m.points,
        state: claimedSet.has(m.count) ? 'claimed' : completed >= m.count ? 'claimable' : 'locked',
        remaining: Math.max(0, m.count - completed),
      })),
      claimablePoints: claimable.reduce((s, m) => s + m.points, 0),
      next: next ? { count: next.count, points: next.points, remaining: next.count - completed } : null,
      completed,
    },
    limits: {
      lifetime: { used: lifetimeUsed, max: innov.referral.maxInvitesPerReferrerLifetime },
      monthly: {
        used: monthlyUsed,
        max: innov.referral.maxRedemptionsPerReferralCodePerMonth,
        resetsAt: startOfMonthIstanbul(now, 1).toISOString(),
      },
      codeUsage: codeRow?.maxUsage ? { used: codeUsed, max: codeRow.maxUsage } : null,
      pendingTtlDays: REFERRAL_PENDING_TTL_DAYS,
      applyWindowDays: INVITE_APPLY_WINDOW_DAYS,
      nudgeCooldownHours: INVITE_NUDGE_COOLDOWN_HOURS,
    },
    referredBy:
      referredByRow && referredByStatus
        ? {
            name: referredByName,
            status: referredByStatus,
            expiresAt: referredByStatus === 'PENDING' && referredByRow.expiresAt ? referredByRow.expiresAt.toISOString() : null,
            bonusPoints: referredByStatus === 'COMPLETED' ? referredByRow.bonusGiven : referredPoints,
            steps: {
              verified: referredByStatus === 'COMPLETED' || !!me?.emailVerified,
              firstQr: referredByStatus === 'COMPLETED' || myQr.has(userId),
            },
          }
        : null,
    apply: {
      canApply: applyBlockedBy === null,
      windowEndsAt: windowEndsAt && windowOpen ? windowEndsAt.toISOString() : null,
      blockedBy: applyBlockedBy,
    },
    referrals: page,
    generatedAt: now.toISOString(),
  };
}

// ───────────────────────────── Eylemler ─────────────────────────────

export type InviteApplyRejectCode = ReferralRejectCode | 'WINDOW_EXPIRED';

export const INVITE_APPLY_WINDOW_MESSAGE = `Davet kodu yalnız kayıttan sonraki ${INVITE_APPLY_WINDOW_DAYS} gün içinde kullanılabilir.`;

export function inviteRejectMessage(code: InviteApplyRejectCode): string {
  return code === 'WINDOW_EXPIRED' ? INVITE_APPLY_WINDOW_MESSAGE : REFERRAL_REJECT_MESSAGES[code];
}

export function inviteRejectStatus(code: InviteApplyRejectCode): number {
  return code === 'WINDOW_EXPIRED' ? 400 : REFERRAL_REJECT_STATUS[code];
}

export type ApplyInviteResult =
  | { ok: true; status: 'PENDING' | 'COMPLETED'; pointsEarned: number; expiresAt: string }
  | { ok: false; code: InviteApplyRejectCode; message: string };

/**
 * Kayıttan sonraki pencerede davet kodu uygular. Puan yalnız `qualifyReferral` ile (koşullar
 * zaten sağlanıyorsa hemen; değilse e-posta doğrulama / ilk QR olayında) verilir.
 */
export async function applyInviteCode(
  userId: string,
  rawCode: unknown,
  opts: { now?: Date } = {},
  db: Db = prisma
): Promise<ApplyInviteResult> {
  const now = opts.now ?? new Date();
  const me = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!me || now.getTime() - me.createdAt.getTime() > INVITE_APPLY_WINDOW_DAYS * DAY_MS) {
    return { ok: false, code: 'WINDOW_EXPIRED', message: INVITE_APPLY_WINDOW_MESSAGE };
  }

  const created = await createPendingReferral({ referredUserId: userId, code: rawCode, now }, db);
  if (!created.ok) return { ok: false, code: created.code, message: created.message };

  const qualified = await qualifyReferral(userId, { now }, db).catch((e: unknown) => {
    console.error('[INVITE_APPLY_QUALIFY]', userId, e);
    return null;
  });
  if (qualified?.qualified) {
    return { ok: true, status: 'COMPLETED', pointsEarned: qualified.referredPoints, expiresAt: created.expiresAt.toISOString() };
  }
  return { ok: true, status: 'PENDING', pointsEarned: 0, expiresAt: created.expiresAt.toISOString() };
}

export interface ClaimMilestonesResult {
  awarded: number;
  points: number;
  milestones: number[];
}

/**
 * Ulaşılmış kademe ödüllerini öder. Sunucu başarılı davet sayısını yeniden sayar; JSON guard'lı
 * `updateMany` + `referral_milestone:<user>:<count>` tek-kez anahtarı ile çift ödeme imkânsız.
 */
export async function claimReferralMilestones(
  userId: string,
  opts: { now?: Date } = {},
  db: Db = prisma
): Promise<ClaimMilestonesResult> {
  const now = opts.now ?? new Date();
  const completedCount = await db.referral.count({ where: { referrerId: userId, status: 'COMPLETED' } });

  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { referralMilestonesClaimed: true } });
    const claimed = parseClaimedReferralMilestones(u?.referralMilestonesClaimed);
    const claimable = claimableReferralMilestones(completedCount, claimed);
    if (claimable.length === 0) return { awarded: 0, points: 0, milestones: [] };

    const newClaimed = [...claimed, ...claimable.map((m) => m.count)].sort((a, b) => a - b);
    const guard = await tx.user.updateMany({
      where: {
        id: userId,
        referralMilestonesClaimed: claimed.length
          ? { equals: u?.referralMilestonesClaimed as Prisma.InputJsonValue }
          : { equals: Prisma.AnyNull },
      },
      data: { referralMilestonesClaimed: newClaimed },
    });
    if (guard.count === 0) return { awarded: 0, points: 0, milestones: [] };

    let totalPoints = 0;
    for (const m of claimable) {
      const minted = await mintPoints(tx, {
        userId,
        points: m.points,
        source: 'referral_milestone',
        sourceId: String(m.count),
        idempotencyKey: `referral_milestone:${userId}:${m.count}`,
        meta: { milestone: m.count },
        now,
      });
      totalPoints += minted.duplicate ? 0 : minted.credited;
    }
    await tx.notification.create({
      data: {
        userId,
        type: 'success',
        title: 'Davet kademesi ödülü',
        message: `${claimable.map((m) => `${m.count} davet`).join(', ')} kademesi açıldı: +${totalPoints} puan kazandın.`,
      },
    });
    return { awarded: claimable.length, points: totalPoints, milestones: claimable.map((m) => m.count) };
  });
}

export type NudgeInviteResult =
  | { kind: 'nudged'; nextAt: string }
  | { kind: 'qualified'; points: number }
  | { kind: 'rejected'; reason: 'NOT_FOUND' | 'NOT_PENDING' | 'NOT_VERIFIED' | 'RECENTLY_NUDGED' | 'NOT_QUALIFIED'; nextAt?: string };

/**
 * Bekleyen arkadaşa hatırlatma. Kapsam: yalnız `referrerId = çağıran`. E-postasını doğrulamamış
 * arkadaş giriş yapamadığı için uygulama içi bildirim işe yaramaz → reddedilir. İlk QR olayı
 * zaten varsa (nitelendirme bir sebeple kaçmışsa) bildirim yerine `qualifyReferral` yeniden denenir.
 */
export async function nudgeInvite(
  referrerId: string,
  referralId: string,
  opts: { now?: Date } = {},
  db: Db = prisma
): Promise<NudgeInviteResult> {
  const now = opts.now ?? new Date();
  const ref = await db.referral.findFirst({
    where: { id: referralId, referrerId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      referredId: true,
      referred: { select: { emailVerified: true } },
      referrer: { select: { name: true } },
    },
  });
  if (!ref) return { kind: 'rejected', reason: 'NOT_FOUND' };
  if (effectiveStatus(ref.status, ref.expiresAt, now) !== 'PENDING') return { kind: 'rejected', reason: 'NOT_PENDING' };
  if (!ref.referred?.emailVerified) return { kind: 'rejected', reason: 'NOT_VERIFIED' };

  const withQr = await usersWithFirstQr([ref.referredId], db);
  if (withQr.has(ref.referredId)) {
    const q = await qualifyReferral(ref.referredId, { now }, db);
    return q.qualified ? { kind: 'qualified', points: q.referrerPoints } : { kind: 'rejected', reason: 'NOT_QUALIFIED' };
  }

  const matrix = await getPointsMatrix();
  const { referredPoints } = getReferralRewards(matrix);
  const since = new Date(now.getTime() - INVITE_NUDGE_COOLDOWN_HOURS * HOUR_MS);
  const inviter = publicDisplayName(ref.referrer?.name, 'Arkadaşın').split(' ')[0] ?? 'Arkadaşın';

  return db.$transaction(async (tx) => {
    // Aynı arkadaşa eşzamanlı iki hatırlatma yazılmasın.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`referral-nudge:${ref.referredId}`}))`;
    const recent = await tx.notification.findFirst({
      where: { userId: ref.referredId, type: INVITE_NUDGE_NOTIFICATION_TYPE, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const nextAt = new Date(recent.createdAt.getTime() + INVITE_NUDGE_COOLDOWN_HOURS * HOUR_MS).toISOString();
      return { kind: 'rejected' as const, reason: 'RECENTLY_NUDGED' as const, nextAt };
    }
    await tx.notification.create({
      data: {
        userId: ref.referredId,
        type: INVITE_NUDGE_NOTIFICATION_TYPE,
        title: 'Hoş geldin bonusun seni bekliyor',
        message: `${inviter} seni davet etti. İlk QR deneyimini tamamla, +${referredPoints} puan hesabına geçsin.`,
        data: { ctaPath: '/customer/scan', nudgeType: 'referral_first_qr', points: referredPoints },
      },
    });
    return { kind: 'nudged' as const, nextAt: new Date(now.getTime() + INVITE_NUDGE_COOLDOWN_HOURS * HOUR_MS).toISOString() };
  });
}
