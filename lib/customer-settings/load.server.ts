/**
 * Ayarlar yüzeyinin tek okuma modeli — sayfa (RSC) ve `GET /api/customer/me/settings` aynı
 * fonksiyonu kullanır. Tek paralel tur; hiçbir yazma yan etkisi yok (eski sayfa doğum günü
 * GET'iyle bildirim üretiyordu, burada üretilmez).
 *
 * Hata görünür: kullanıcı satırı okunamazsa fırlatır (sayfa hata durumu gösterir); varsayılan
 * değerlerle "her şey açık" gibi davranıp sonra o varsayılanları KAYDETTİRMEZ (denetim B7).
 */
import { prisma } from '@/lib/prisma';
import { isChannelEnabled, type NotificationChannel } from '@/lib/notification-prefs';
import { evaluateBirthdayClaim } from '@/lib/birthday';
import { getBirthdayBonusPoints, getPointsMatrix } from '@/lib/points-rules';
import { SHOWCASE_PIN_LIMIT } from '@/lib/badges/collection-logic';
import type { CustomerSettingsSnapshot, NotificationRow, PushDevice } from './contract';
import { visibleCatalog } from './notification-catalog';
import { isReplyEmailEnabled, readStoredSettings, toCustomerPreferences, userSettingsKey } from './preferences';
import { deviceLabel } from './device-label';

export class SettingsUserNotFoundError extends Error {
  constructor() {
    super('USER_NOT_FOUND');
    this.name = 'SettingsUserNotFoundError';
  }
}

export interface LoadContext {
  /** Bu oturumun JWT kimliği (oturum başlangıç zamanı için). */
  jti?: string | null;
  userAgent?: string | null;
  now?: Date;
}

const PASSWORD_ACTIONS = ['CHANGE_PASSWORD', 'SET_INITIAL_PASSWORD'];
export const REVOKE_SESSIONS_ACTION = 'REVOKE_SESSIONS';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseHue(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 360 ? n : null;
}

export async function loadCustomerSettings(userId: string, ctx: LoadContext = {}): Promise<CustomerSettingsSnapshot> {
  const now = ctx.now ?? new Date();

  const [user, settingsRow, birthday, pushRows, pinnedBadges, pinnedCosmetics, lastPassword, lastRevoke, tokenUsage, bonusAmount] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          image: true,
          createdAt: true,
          password: true,
          preferredLanguage: true,
          notificationPrefs: true,
          customFrameColor: true,
          twoFactorEnabled: true,
          twoFactorVerifiedAt: true,
          adminTeamRole: true,
          accounts: { select: { provider: true } },
          equippedCosmetics: {
            where: { isEquipped: true, cosmetic: { type: 'avatar_frame' } },
            select: { cosmetic: { select: { imageUrl: true } } },
            take: 1,
          },
        },
      }),
      prisma.settings.findUnique({ where: { key: userSettingsKey(userId) }, select: { value: true } }),
      prisma.userBirthday.findUnique({
        where: { userId },
        select: { birthDate: true, createdAt: true, lastBonusAt: true },
      }),
      prisma.pushSubscription.findMany({
        where: { userId, isActive: true },
        orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true },
        take: 20,
      }),
      prisma.userBadge.count({ where: { userId, isPinned: true } }),
      prisma.userCosmetic.count({ where: { userId, isPinned: true } }),
      prisma.auditLog.findFirst({
        where: { userId, action: { in: PASSWORD_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.auditLog.findFirst({
        where: { userId, action: REVOKE_SESSIONS_ACTION },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      ctx.jti
        ? prisma.sessionTokenUsage.findUnique({ where: { jti: ctx.jti }, select: { createdAt: true } })
        : Promise.resolve(null),
      getPointsMatrix()
        .then((m) => getBirthdayBonusPoints(m))
        .catch(() => null),
    ]);

  if (!user) throw new SettingsUserNotFoundError();

  const remainingRecoveryCodes = user.twoFactorEnabled
    ? await prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } })
    : 0;

  const stored = readStoredSettings(settingsRow?.value ?? null);
  const preferences = toCustomerPreferences(stored, user.preferredLanguage);
  const isTeamMember = !!user.adminTeamRole;

  const rows: NotificationRow[] = visibleCatalog(isTeamMember).map((row) => ({
    key: row.key,
    cells: row.channels.map((channel: NotificationChannel) => ({
      channel,
      enabled: row.storage === 'legacy-reply' ? isReplyEmailEnabled(stored) : isChannelEnabled(user.notificationPrefs, row.key, channel),
    })),
  }));

  const pushDevices: PushDevice[] = pushRows.map((p) => ({
    id: p.id,
    label: deviceLabel(p.userAgent) ?? '',
    createdAt: p.createdAt.toISOString(),
    lastUsedAt: p.lastUsedAt ? p.lastUsedAt.toISOString() : null,
  }));

  const decision = evaluateBirthdayClaim(birthday, now);
  const providers = [...new Set(user.accounts.map((a) => a.provider).filter((p) => p !== 'credentials'))];

  return {
    profile: {
      name: user.name ?? '',
      email: user.email,
      image: user.image ?? null,
      memberSince: user.createdAt.toISOString(),
    },
    frame: {
      equipped: user.equippedCosmetics[0]?.cosmetic.imageUrl ?? null,
      hue: parseHue(user.customFrameColor),
    },
    showcase: { pinned: pinnedBadges + pinnedCosmetics, limit: SHOWCASE_PIN_LIMIT },
    birthday: {
      date: birthday ? ymd(birthday.birthDate) : null,
      locked: !!birthday,
      isToday: decision.isToday,
      canClaim: decision.canClaim,
      claimReason: decision.reason,
      bonusAmount,
    },
    preferences,
    notifications: { rows, pushDevices },
    security: {
      hasPassword: !!user.password,
      providers,
      twoFactor: {
        enabled: user.twoFactorEnabled,
        since: user.twoFactorVerifiedAt ? user.twoFactorVerifiedAt.toISOString() : null,
        remainingRecoveryCodes,
      },
      lastPasswordChangeAt: lastPassword?.createdAt.toISOString() ?? null,
      lastSessionsRevokedAt: lastRevoke?.createdAt.toISOString() ?? null,
      currentDevice: deviceLabel(ctx.userAgent),
      sessionStartedAt: tokenUsage?.createdAt.toISOString() ?? null,
    },
    isTeamMember,
  };
}
