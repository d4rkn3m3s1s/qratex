/**
 * Admin → Klan Merkezi (/admin/squads) sözleşmesi — istemci + sunucu ortak, saf modül (DB yok).
 *
 * Denetim: docs/audit/2026-10-08/admin/admin_squads.md + admin_squads_battles.md (Dalga 2).
 *  - Liste/savaş sorguları zod ile doğrulanır (NaN sayfa, sınırsız `pageSize` yok).
 *  - Klan moderasyonu ve savaş geçişleri adlandırılmış, gerekçeli aksiyonlardır (ham alan yazımı yok).
 *  - Yönetici savaşı ödülsüzdür (onur savaşı): escrow yalnız klan liderinin meydan okumasında oluşur.
 */
import { z } from 'zod';
import { BATTLE_MAX_HOURS, BATTLE_MIN_HOURS, squadNameSchema } from '@/lib/squads/rules';

// ───────────────────────────── Klan listesi ─────────────────────────────

export const SQUAD_SORT_IDS = ['createdAt', 'members', 'totalPoints', 'treasuryPoints', 'name'] as const;
export type SquadSortId = (typeof SQUAD_SORT_IDS)[number];
export const SQUAD_DEFAULT_SORT = 'createdAt.desc';
export const SQUAD_PAGE_SIZE = 20;
export const SQUAD_EXPORT_MAX_ROWS = 10_000;

export const SQUAD_STATUS_FILTERS = ['active', 'frozen', 'in_battle'] as const;
export type SquadStatusFilter = (typeof SQUAD_STATUS_FILTERS)[number];

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .catch(undefined)
    .transform((v) => (v ? v : undefined));

export const squadListQuerySchema = z.object({
  q: optionalTrimmed(80),
  status: z.enum(SQUAD_STATUS_FILTERS).optional().catch(undefined),
  sort: z
    .string()
    .regex(/^(createdAt|members|totalPoints|treasuryPoints|name)\.(asc|desc)$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(10).max(100).catch(SQUAD_PAGE_SIZE),
});
export type SquadListQuery = z.infer<typeof squadListQuerySchema>;

export type SquadOwner = { id: string; name: string | null; email: string };

export type SquadListItem = {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  isFrozen: boolean;
  createdAt: string;
  owner: SquadOwner;
  memberCount: number;
  totalPoints: number;
  treasuryPoints: number;
  /** Açık (bekleyen/aktif) savaşı varsa. */
  openBattle: { id: string; status: 'pending' | 'active' } | null;
};

export type SquadListPage = { items: SquadListItem[]; total: number; page: number; size: number };

export type SquadStats = {
  total: number;
  frozen: number;
  newLast7d: number;
  /** Son 7 günde en az bir üyesi puan kazanan klan. */
  activeLast7d: number;
  totalMembers: number;
  avgMembers: number;
  battles: {
    live: number;
    pending: number;
    /** Süresi dolduğu hâlde açık kalan (cron/okuma henüz kapatmamış) savaş. */
    overdue: number;
    /** Açık savaşlarda kilitli escrow (fonlu + iade edilmemiş). */
    escrowLocked: number;
    paidOut7d: number;
    refunded7d: number;
  };
  generatedAt: string;
};

// ───────────────────────────── Klan detayı ─────────────────────────────

export type SquadMemberRow = {
  userId: string;
  name: string | null;
  email: string;
  points: number;
  joinedAt: string;
  isOwner: boolean;
};

export type SquadAuditRow = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  reason: string | null;
  data: Record<string, unknown> | null;
};

export type SquadDetail = {
  id: string;
  name: string;
  description: string | null;
  inviteCode: string;
  isFrozen: boolean;
  createdAt: string;
  updatedAt: string;
  totalPoints: number;
  treasuryPoints: number;
  owner: SquadOwner;
  members: SquadMemberRow[];
  record: { wins: number; losses: number; draws: number; cancelled: number };
  battles: BattleListItem[];
  audit: SquadAuditRow[];
  /** Son dondurma kaydı (yalnız `isFrozen` iken). */
  freeze: { at: string; reason: string | null; by: string | null } | null;
};

// ───────────────────────────── Klan aksiyonları ─────────────────────────────

const reason = (min: number, label = 'Gerekçe') =>
  z.string().trim().min(min, `${label} en az ${min} karakter olmalı.`).max(500, `${label} en fazla 500 karakter olabilir.`);

export const squadActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('freeze'), reason: reason(5) }),
  z.object({ action: z.literal('unfreeze'), reason: reason(3) }),
  z.object({ action: z.literal('rename'), name: squadNameSchema, reason: reason(3) }),
  z.object({ action: z.literal('clear_description'), reason: reason(3) }),
  z.object({ action: z.literal('regenerate_invite'), reason: reason(3) }),
  z.object({ action: z.literal('remove_member'), userId: z.string().min(1).max(64), reason: reason(3) }),
  z.object({ action: z.literal('transfer_owner'), userId: z.string().min(1).max(64), reason: reason(3) }),
]);
export type SquadActionInput = z.infer<typeof squadActionSchema>;
export type SquadActionName = SquadActionInput['action'];

export type SquadActionResult = {
  action: SquadActionName;
  changed: boolean;
  /** Dondurmada iadeli iptal edilen açık savaşlar. */
  cancelledBattles?: number;
  refunded?: number;
  inviteCode?: string;
  name?: string;
};

// ───────────────────────────── Klan seçici ─────────────────────────────

export const squadOptionsQuerySchema = z.object({ q: optionalTrimmed(60) });

export type SquadOption = {
  id: string;
  name: string;
  memberCount: number;
  isFrozen: boolean;
  hasOpenBattle: boolean;
};

// ───────────────────────────── Savaşlar ─────────────────────────────

/** Görünür durum: `overdue` = süresi dolmuş ama hâlâ açık. */
export const BATTLE_VIEW_STATUSES = ['live', 'pending', 'overdue', 'completed', 'cancelled'] as const;
export type BattleViewStatus = (typeof BATTLE_VIEW_STATUSES)[number];

export const battleListQuerySchema = z.object({
  status: z.enum(BATTLE_VIEW_STATUSES).optional().catch(undefined),
  q: optionalTrimmed(60),
  squadId: z.string().max(64).optional().catch(undefined),
  origin: z.enum(['admin', 'challenge']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(10).max(100).catch(20),
});
export type BattleListQuery = z.infer<typeof battleListQuerySchema>;

export type BattleListItem = {
  id: string;
  status: string;
  view: BattleViewStatus;
  origin: 'admin' | 'challenge';
  squad1: { id: string; name: string };
  squad2: { id: string; name: string };
  squad1Score: number;
  squad2Score: number;
  winnerId: string | null;
  rewardPool: number;
  rewardFunded: boolean;
  rewardRefunded: boolean;
  startTime: string;
  endTime: string;
  acceptedAt: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  paidOutAt: string | null;
};

export type BattleListPage = {
  items: BattleListItem[];
  total: number;
  page: number;
  size: number;
  counts: Record<BattleViewStatus, number>;
};

export type BattleLedgerRow = {
  id: string;
  source: string;
  delta: number;
  status: string;
  userId: string | null;
  userName: string | null;
  createdAt: string;
};

export type BattleDetail = BattleListItem & {
  participants: Array<{ userId: string; name: string | null; squadId: string; score: number }>;
  ledger: BattleLedgerRow[];
  audit: SquadAuditRow[];
};

export const BATTLE_DURATION_PRESETS = [6, 12, 24, 48, 72, 168] as const;

export const battleCreateSchema = z
  .object({
    squad1Id: z.string().min(1, 'Birinci klanı seçin.').max(64),
    squad2Id: z.string().min(1, 'İkinci klanı seçin.').max(64),
    durationHours: z.coerce
      .number()
      .int('Süre tam saat olmalı.')
      .min(BATTLE_MIN_HOURS, `Süre en az ${BATTLE_MIN_HOURS} saat olmalı.`)
      .max(BATTLE_MAX_HOURS, `Süre en fazla ${BATTLE_MAX_HOURS} saat (7 gün) olabilir.`),
    /** invite: ikinci klanın lideri kabul edince başlar · start_now: hemen başlar, kadro şimdi donar. */
    mode: z.enum(['invite', 'start_now']),
  })
  .refine((b) => b.squad1Id !== b.squad2Id, { message: 'Bir klan kendisiyle savaşamaz.', path: ['squad2Id'] });
export type BattleCreateInput = z.infer<typeof battleCreateSchema>;

export const battleActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('finish') }),
  z.object({ action: z.literal('cancel'), reason: reason(3, 'İptal gerekçesi') }),
  z.object({
    action: z.literal('extend'),
    endTime: z.string().datetime({ offset: true, message: 'Geçerli bir bitiş zamanı girin.' }),
    reason: reason(3, 'Uzatma gerekçesi'),
  }),
  z.object({
    action: z.literal('adjust_score'),
    squad1Score: z.number().int().min(0).max(10_000_000),
    squad2Score: z.number().int().min(0).max(10_000_000),
    reason: reason(5, 'Skor düzeltme gerekçesi'),
  }),
]);
export type BattleActionInput = z.infer<typeof battleActionSchema>;

export type BattleActionResult =
  | { action: 'finish'; winnerId: string | null; paidOut: number; perPerson: number; refunded: number }
  | { action: 'cancel'; refunded: number }
  | { action: 'extend'; endTime: string }
  | { action: 'adjust_score'; squad1Score: number; squad2Score: number };

// ───────────────────────────── Yardımcılar ─────────────────────────────

/** Görünür durum (saf): aktif/bekleyen savaşın süresi dolduysa `overdue`. */
export function battleView(status: string, endTime: Date | string, now: Date = new Date()): BattleViewStatus {
  const end = new Date(endTime).getTime();
  if (status === 'active') return end <= now.getTime() ? 'overdue' : 'live';
  if (status === 'pending') return end <= now.getTime() ? 'overdue' : 'pending';
  if (status === 'completed') return 'completed';
  return 'cancelled';
}

export function queryString(p: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/** Denetim eylemi → Türkçe etiket. */
export const AUDIT_ACTION_LABEL: Readonly<Record<string, string>> = {
  SQUAD_FREEZE: 'Donduruldu',
  SQUAD_UNFREEZE: 'Dondurma kaldırıldı',
  SQUAD_RENAME: 'Yeniden adlandırıldı',
  SQUAD_DESCRIPTION_CLEAR: 'Slogan kaldırıldı',
  SQUAD_INVITE_ROTATE: 'Davet kodu yenilendi',
  SQUAD_MEMBER_KICK: 'Üye çıkarıldı',
  SQUAD_MEMBER_REMOVE: 'Üye çıkarıldı (yönetici)',
  SQUAD_OWNERSHIP_TRANSFER: 'Liderlik devredildi',
  SQUAD_UPDATE: 'Profil güncellendi',
  SQUAD_CREATE: 'Klan kuruldu',
  SQUAD_BATTLE_CREATE: 'Savaş oluşturuldu',
  SQUAD_BATTLE_CANCEL: 'Savaş iptal edildi',
  SQUAD_BATTLE_SETTLE: 'Savaş sonuçlandı',
  SQUAD_BATTLE_EXTEND: 'Süre uzatıldı',
  SQUAD_BATTLE_ADJUST_SCORE: 'Skor düzeltildi',
  SQUADS_EXPORT: 'Dışa aktarıldı',
};

export const LEDGER_SOURCE_LABEL: Readonly<Record<string, string>> = {
  squad_escrow: 'Havuz tahsilatı (escrow)',
  squad_battle: 'Kazanan payı',
  squad_escrow_refund: 'Havuz iadesi',
};

export const squadIdParamsSchema = z.object({ id: z.string().min(1).max(64) });

export type SquadAuditLogRow = SquadAuditRow & { entity: string; entityId: string | null };
export type SquadAuditPage = { items: SquadAuditLogRow[]; total: number; page: number; size: number };
