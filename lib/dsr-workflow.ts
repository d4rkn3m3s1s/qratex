/**
 * KVKK veri sahibi talebi (DSR) DURUM MAKİNESİ ve YÜRÜTME KANITI (P0-34).
 *
 * Kural: bir talep yalnız türüne özgü yürütme kanıtı (DsrEvent) varsa `completed` olur.
 * Elle "Tamamlandı" yoktur. Her adım `recordDsrEvent` ile hem `DsrEvent` (talebin kanıt
 * zinciri) hem `AuditLog` (işlemi yapan yönetici) satırı olarak aynı transaction'da yazılır.
 *
 *   tür            kapanış için gereken kanıt
 *   access         export_generated + notified   (paket üretildi ve sahibine bildirildi)
 *   deletion       erasure_executed              (anonimleştirme + envanter temizliği yürütüldü)
 *   rectification  rectified                     (yapılan düzeltme gerekçesiyle kaydedildi)
 *   objection      objection_resolved            (itirazın sonucu gerekçesiyle kaydedildi)
 *
 * Saf kısım (geçiş/kanıt kontrolü) Prisma'sız test edilir; yazıcılar `tx` alır.
 */
import type { Prisma } from '@prisma/client';

export const DSR_TYPES = ['access', 'deletion', 'rectification', 'objection'] as const;
export type DsrType = (typeof DSR_TYPES)[number];

export const DSR_STATUSES = ['received', 'in_review', 'completed', 'rejected'] as const;
export type DsrStatus = (typeof DSR_STATUSES)[number];

export const OPEN_DSR_STATUSES: readonly DsrStatus[] = ['received', 'in_review'];

export const DSR_EVENT_TYPES = [
  'received',
  'verified',
  'in_review',
  'export_generated',
  'export_downloaded',
  'erasure_executed',
  'rectified',
  'objection_resolved',
  'notified',
  'notify_failed',
  'rejected',
  'reopened',
  'completed',
  'note',
] as const;
export type DsrEventType = (typeof DSR_EVENT_TYPES)[number];

/** KVKK m.13: başvuru en geç 30 gün içinde sonuçlandırılır. */
export const DSR_LEGAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DSR_TYPE_LABELS: Readonly<Record<DsrType, string>> = {
  access: 'Verilerime erişim (kopya)',
  deletion: 'Verilerimin silinmesi',
  rectification: 'Verilerimin düzeltilmesi',
  objection: 'İşlemeye / otomatik karara itiraz',
};

export const DSR_STATUS_LABELS: Readonly<Record<DsrStatus, string>> = {
  received: 'Alındı',
  in_review: 'İncelemede',
  completed: 'Tamamlandı',
  rejected: 'Reddedildi',
};

export const DSR_EVENT_LABELS: Readonly<Record<DsrEventType, string>> = {
  received: 'Başvuru alındı',
  verified: 'Kimlik doğrulandı',
  in_review: 'İncelemeye alındı',
  export_generated: 'Veri paketi üretildi',
  export_downloaded: 'Veri paketi indirildi',
  erasure_executed: 'Silme / anonimleştirme yürütüldü',
  rectified: 'Düzeltme yapıldı',
  objection_resolved: 'İtiraz sonuçlandırıldı',
  notified: 'Başvurana bildirildi',
  notify_failed: 'Bildirim gönderilemedi',
  rejected: 'Reddedildi',
  reopened: 'Yeniden açıldı',
  completed: 'Tamamlandı',
  note: 'Not',
};

export function isDsrType(v: unknown): v is DsrType {
  return typeof v === 'string' && (DSR_TYPES as readonly string[]).includes(v);
}

export function isDsrStatus(v: unknown): v is DsrStatus {
  return typeof v === 'string' && (DSR_STATUSES as readonly string[]).includes(v);
}

export function computeDueAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + DSR_LEGAL_DAYS * DAY_MS);
}

/** Eski satırlarda `dueAt` boş olabilir → başvuru tarihinden hesaplanır. */
export function effectiveDueAt(row: { createdAt: Date | string; dueAt?: Date | string | null }): Date {
  if (row.dueAt) return new Date(row.dueAt);
  return computeDueAt(new Date(row.createdAt));
}

/** Tamamlanan erişim talebinin paketi bu süre boyunca hesaptan indirilebilir. */
export const ACCESS_DOWNLOAD_WINDOW_DAYS = 30;

/** Veri sahibi bu erişim talebinin paketini şimdi indirebilir mi? */
export function isAccessDownloadable(
  row: { type: string; status: string; processedAt: Date | string | null },
  now: Date = new Date()
): boolean {
  if (row.type !== 'access' || row.status !== 'completed' || !row.processedAt) return false;
  return now.getTime() - new Date(row.processedAt).getTime() <= ACCESS_DOWNLOAD_WINDOW_DAYS * DAY_MS;
}

/** Kalan tam gün (negatif = gecikmiş). */
export function daysRemaining(dueAt: Date, now: Date = new Date()): number {
  return Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Kapanış kanıtı: her grup için EN AZ BİR olay gerekir. Erişim talebinde paket üretilmiş
 * olmalı VE sahibine ulaşmış olmalı (bildirim gitti ya da paketi kendisi indirdi).
 */
export const REQUIRED_EVIDENCE: Readonly<Record<DsrType, ReadonlyArray<readonly DsrEventType[]>>> = {
  access: [['export_generated'], ['notified', 'export_downloaded']],
  deletion: [['erasure_executed']],
  rectification: [['rectified']],
  objection: [['objection_resolved']],
};

/**
 * Son yeniden açılıştan (reopened) SONRAKİ olaylar sayılır: yeniden açılan talep eski
 * kanıtla tekrar kapatılamaz.
 */
function eventsSinceReopen(events: ReadonlyArray<{ type: string }>): ReadonlyArray<{ type: string }> {
  let start = 0;
  events.forEach((e, i) => {
    if (e.type === 'reopened') start = i + 1;
  });
  return events.slice(start);
}

/** Kapanış için eksik kanıtlar (olaylar kronolojik sırada verilmelidir). */
export function missingEvidence(type: string, events: ReadonlyArray<{ type: string }>): DsrEventType[] {
  if (!isDsrType(type)) return ['received'];
  const have = new Set(eventsSinceReopen(events).map((e) => e.type));
  return REQUIRED_EVIDENCE[type].filter((group) => !group.some((t) => have.has(t))).map((group) => group[0]);
}

export function canComplete(type: string, events: ReadonlyArray<{ type: string }>): boolean {
  return missingEvidence(type, events).length === 0;
}

/** Yönetici komutları (genel "durum değiştir" yok). */
export const DSR_COMMANDS = [
  'review',
  'reject',
  'reopen',
  'fulfill_access',
  'confirm_delivery',
  'download_export',
  'erase',
  'rectify',
  'resolve_objection',
  'note',
] as const;
export type DsrCommand = (typeof DSR_COMMANDS)[number];

export function isDsrCommand(v: unknown): v is DsrCommand {
  return typeof v === 'string' && (DSR_COMMANDS as readonly string[]).includes(v);
}

export const MIN_REASON_LENGTH = 10;

export type TransitionCheck =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409; code: string; message: string };

const TYPE_FOR_COMMAND: Partial<Record<DsrCommand, DsrType>> = {
  fulfill_access: 'access',
  confirm_delivery: 'access',
  download_export: 'access',
  erase: 'deletion',
  rectify: 'rectification',
  resolve_objection: 'objection',
};

const NEEDS_USER: ReadonlySet<DsrCommand> = new Set(['fulfill_access', 'download_export', 'erase']);
const NEEDS_REASON: ReadonlySet<DsrCommand> = new Set(['reject', 'reopen', 'rectify', 'resolve_objection', 'note']);

function fail(status: 400 | 404 | 409, code: string, message: string): TransitionCheck {
  return { ok: false, status, code, message };
}

/**
 * Komut bu talepte çalışabilir mi? Tür, durum, ilişkili hesap, gerekçe ve kanıt kuralları.
 * Rota bu kontrolü transaction İÇİNDE güncel satırla tekrar yapar (yarış koşulu).
 */
export function checkDsrCommand(
  request: { type: string; status: string; userId: string | null },
  command: DsrCommand,
  input: { reason?: string | null; events?: ReadonlyArray<{ type: string }> } = {}
): TransitionCheck {
  const open = (OPEN_DSR_STATUSES as readonly string[]).includes(request.status);
  const requiredType = TYPE_FOR_COMMAND[command];
  if (requiredType && request.type !== requiredType) {
    return fail(409, 'WRONG_TYPE', `Bu işlem yalnız "${DSR_TYPE_LABELS[requiredType]}" taleplerinde yapılabilir.`);
  }
  if (NEEDS_USER.has(command) && !request.userId) {
    return fail(409, 'NO_ACCOUNT', 'Talep bir hesaba bağlı değil; bu işlem yürütülemez.');
  }
  if (NEEDS_REASON.has(command) && (input.reason ?? '').trim().length < MIN_REASON_LENGTH) {
    return fail(400, 'REASON_REQUIRED', `Gerekçe en az ${MIN_REASON_LENGTH} karakter olmalı.`);
  }

  switch (command) {
    case 'note':
      return { ok: true };
    case 'download_export':
      // Denetlenen tam paket indirmesi: kapalı talepte de (teslim tekrarı) yapılabilir, reddedilende değil.
      return request.status === 'rejected'
        ? fail(409, 'CLOSED', 'Reddedilmiş talepte veri paketi indirilemez.')
        : { ok: true };
    case 'review':
      return request.status === 'received'
        ? { ok: true }
        : fail(409, 'INVALID_STATE', 'Yalnız yeni alınan talepler incelemeye alınabilir.');
    case 'reopen':
      if (request.status === 'rejected') return { ok: true };
      if (request.status === 'completed' && request.type !== 'deletion') return { ok: true };
      return fail(409, 'INVALID_STATE', 'Bu talep yeniden açılamaz.');
    case 'confirm_delivery': {
      if (!open) return fail(409, 'CLOSED', 'Talep kapalı.');
      const events = input.events ?? [];
      return eventsSinceReopen(events).some((e) => e.type === 'export_generated')
        ? { ok: true }
        : fail(409, 'NO_EVIDENCE', 'Önce veri paketi üretilmeli.');
    }
    case 'reject':
    case 'fulfill_access':
    case 'erase':
    case 'rectify':
    case 'resolve_objection':
      return open ? { ok: true } : fail(409, 'CLOSED', 'Talep kapalı; önce yeniden açılmalı.');
    default:
      return fail(400, 'UNKNOWN_COMMAND', 'Bilinmeyen işlem.');
  }
}

// ───────────────────────────── Yazıcılar ─────────────────────────────

export interface DsrEventInput {
  requestId: string;
  type: DsrEventType;
  /** İşlemi yapan yönetici; sistem/self-servis adımlarında null. */
  actorId?: string | null;
  /** PII İÇERMEZ: sayılar, özetler, gerekçe kodları, yönetici notu. */
  detail?: Record<string, unknown> | null;
  /** AuditLog'a yazılacak istek bilgisi. */
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}

/**
 * Yürütme kanıtı: `DsrEvent` + `AuditLog` (aktör = yönetici ya da veri sahibi) aynı tx'te.
 */
export async function recordDsrEvent(tx: Prisma.TransactionClient, input: DsrEventInput): Promise<{ id: string }> {
  const detail = (input.detail ?? undefined) as Prisma.InputJsonValue | undefined;
  const event = await tx.dsrEvent.create({
    data: {
      requestId: input.requestId,
      type: input.type,
      actorId: input.actorId ?? null,
      ...(detail !== undefined ? { detail } : {}),
    },
    select: { id: true },
  });
  await tx.auditLog.create({
    data: {
      userId: input.actorId ?? null,
      actorType: input.actorId ? 'user' : 'system',
      action: `dsr_${input.type}`,
      entity: 'DataSubjectRequest',
      entityId: input.requestId,
      ...(detail !== undefined ? { newData: detail } : {}),
      ipAddress: input.meta?.ipAddress ?? null,
      userAgent: input.meta?.userAgent ?? null,
    },
  });
  return event;
}

export class DsrEvidenceError extends Error {
  constructor(readonly missing: DsrEventType[]) {
    super(`DSR_EVIDENCE_MISSING:${missing.join(',')}`);
    this.name = 'DsrEvidenceError';
  }
}

/**
 * Talebi `completed` yapan TEK yol. Kanıt zinciri okunur; eksikse `DsrEvidenceError`.
 * Koşullu güncelleme (yalnız açık talep) → eşzamanlı ikinci kapanış etkisiz kalır.
 */
export async function completeDsrIfEvidenced(
  tx: Prisma.TransactionClient,
  requestId: string,
  actorId: string | null,
  meta?: DsrEventInput['meta']
): Promise<{ completed: boolean }> {
  const request = await tx.dataSubjectRequest.findUnique({
    where: { id: requestId },
    select: { type: true, status: true },
  });
  if (!request) throw new Error('DSR_NOT_FOUND');
  const events = await tx.dsrEvent.findMany({
    where: { requestId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { type: true },
  });
  const missing = missingEvidence(request.type, events);
  if (missing.length > 0) throw new DsrEvidenceError(missing);

  const updated = await tx.dataSubjectRequest.updateMany({
    where: { id: requestId, status: { in: [...OPEN_DSR_STATUSES] } },
    data: { status: 'completed', processedAt: new Date() },
  });
  if (updated.count === 0) return { completed: false };
  await recordDsrEvent(tx, { requestId, type: 'completed', actorId, meta });
  return { completed: true };
}
