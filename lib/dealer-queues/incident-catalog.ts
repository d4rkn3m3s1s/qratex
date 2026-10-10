/**
 * Vaka (Incident) kataloğu ve durum makinesi — saf (istemci + sunucu ortak).
 *
 * Denetim bulgu 5: `type` serbest dizgiydi; dört üretici dört ayrı adlandırma kullanıyordu ve
 * etiketsiz kodlar (`negative_spike`, `FEEDBACK`) kullanıcıya ham gösteriliyordu. Artık her kod
 * tek bir kayıttan etiket, grup, varsayılan önem ve hedef çözüm süresi alır; bilinmeyen kod
 * "Diğer" olarak gösterilir.
 *
 * Denetim bulgu 4: `resolved` ↔ `resolvedAt` kopabiliyordu. Geçişler yalnız
 * `applyIncidentPatch` üzerinden hesaplanır: çözülünce `resolvedAt = şimdi`, yeniden açılınca
 * temizlenir; atama `open ↔ assigned` durumunu kendiliğinden günceller.
 */
import { DAY_MS, HOUR_MS } from './time';

export const INCIDENT_STATUSES = ['open', 'assigned', 'in_progress', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const OPEN_INCIDENT_STATUSES: readonly IncidentStatus[] = ['open', 'assigned', 'in_progress'];

export type IncidentTypeGroup = 'radar' | 'table' | 'sla' | 'rule' | 'manual';

export interface IncidentTypeDef {
  code: string;
  group: IncidentTypeGroup;
  label: { tr: string; en: string };
  /** Bayi elle seçebilir mi (yeni vaka formu)? */
  manual: boolean;
  defaultSeverity: IncidentSeverity;
}

export const INCIDENT_TYPES: readonly IncidentTypeDef[] = [
  // Kriz radarı (sistem)
  { code: 'rating_drop', group: 'radar', label: { tr: 'Puan düşüşü', en: 'Rating drop' }, manual: false, defaultSeverity: 'medium' },
  { code: 'complaint_spike', group: 'radar', label: { tr: 'Şikâyet artışı', en: 'Complaint spike' }, manual: false, defaultSeverity: 'medium' },
  { code: 'negative_spike', group: 'radar', label: { tr: 'Acil ya da uygunsuz yorum', en: 'Urgent or toxic review' }, manual: false, defaultSeverity: 'high' },
  { code: 'nps_drop', group: 'radar', label: { tr: 'NPS düşüşü', en: 'NPS drop' }, manual: false, defaultSeverity: 'medium' },
  // SLA
  { code: 'negative_feedback_sla_breach', group: 'sla', label: { tr: 'Yanıtsız olumsuz yorum', en: 'Unanswered negative review' }, manual: false, defaultSeverity: 'high' },
  // Otomatik yanıt kuralı
  { code: 'FEEDBACK', group: 'rule', label: { tr: 'Kural tetiklendi', en: 'Rule triggered' }, manual: false, defaultSeverity: 'medium' },
  // Masa sinyali
  { code: 'table_signal', group: 'table', label: { tr: 'Masada sorun', en: 'Table concern' }, manual: false, defaultSeverity: 'medium' },
  { code: 'table_request', group: 'table', label: { tr: 'Masa isteği', en: 'Table request' }, manual: false, defaultSeverity: 'low' },
  // Elle açılan
  { code: 'manual_service', group: 'manual', label: { tr: 'Servis', en: 'Service' }, manual: true, defaultSeverity: 'medium' },
  { code: 'manual_product', group: 'manual', label: { tr: 'Ürün / kalite', en: 'Product / quality' }, manual: true, defaultSeverity: 'medium' },
  { code: 'manual_cleanliness', group: 'manual', label: { tr: 'Temizlik / hijyen', en: 'Cleanliness / hygiene' }, manual: true, defaultSeverity: 'high' },
  { code: 'manual_staff', group: 'manual', label: { tr: 'Personel', en: 'Staff' }, manual: true, defaultSeverity: 'medium' },
  { code: 'manual_safety', group: 'manual', label: { tr: 'Güvenlik / kaza', en: 'Safety / accident' }, manual: true, defaultSeverity: 'critical' },
  { code: 'manual_other', group: 'manual', label: { tr: 'Diğer', en: 'Other' }, manual: true, defaultSeverity: 'medium' },
  // Eski elle açılan kodlar (salt görüntüleme)
  { code: 'other', group: 'manual', label: { tr: 'Diğer', en: 'Other' }, manual: false, defaultSeverity: 'low' },
  { code: 'custom', group: 'manual', label: { tr: 'Diğer', en: 'Other' }, manual: false, defaultSeverity: 'low' },
];

const TYPE_INDEX = new Map(INCIDENT_TYPES.map((t) => [t.code, t]));

export const MANUAL_INCIDENT_TYPES = INCIDENT_TYPES.filter((t) => t.manual).map((t) => t.code) as [string, ...string[]];

export const INCIDENT_GROUPS: readonly IncidentTypeGroup[] = ['radar', 'table', 'sla', 'rule', 'manual'];

export function incidentTypeDef(code: string): IncidentTypeDef {
  return (
    TYPE_INDEX.get(code) ?? {
      code,
      group: 'manual',
      label: { tr: 'Diğer', en: 'Other' },
      manual: false,
      defaultSeverity: 'low',
    }
  );
}

export function typesOfGroup(group: IncidentTypeGroup): string[] {
  return INCIDENT_TYPES.filter((t) => t.group === group).map((t) => t.code);
}

export function isIncidentGroup(v: unknown): v is IncidentTypeGroup {
  return typeof v === 'string' && (INCIDENT_GROUPS as readonly string[]).includes(v);
}

export function toIncidentSeverity(raw: string | null | undefined): IncidentSeverity {
  const v = (raw ?? '').toLowerCase();
  return (INCIDENT_SEVERITIES as readonly string[]).includes(v) ? (v as IncidentSeverity) : 'low';
}

export function toIncidentStatus(raw: string | null | undefined): IncidentStatus {
  const v = (raw ?? '').toLowerCase();
  return (INCIDENT_STATUSES as readonly string[]).includes(v) ? (v as IncidentStatus) : 'open';
}

export function severityRank(s: IncidentSeverity): number {
  return INCIDENT_SEVERITIES.indexOf(s);
}

/** Masa sinyalleri (hizmet akışı) çözüm notu istemez; diğer vakalar ister. */
export function requiresResolutionNote(type: string): boolean {
  return incidentTypeDef(type).group !== 'table';
}

/** Hedef çözüm süresi (son tarih verilmezse sunucu bunu atar). */
export const SEVERITY_DUE_MS: Readonly<Record<IncidentSeverity, number>> = {
  critical: 4 * HOUR_MS,
  high: 24 * HOUR_MS,
  medium: 3 * DAY_MS,
  low: 7 * DAY_MS,
};

export function defaultDueAt(severity: IncidentSeverity, from: Date): Date {
  return new Date(from.getTime() + SEVERITY_DUE_MS[severity]);
}

/** Kök neden etiketleri (çözümde isteğe bağlı; tekrarlayan krizleri görünür kılar). */
export const ROOT_CAUSES = ['staffing', 'training', 'product', 'equipment', 'process', 'external', 'other'] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

export function isRootCause(v: unknown): v is RootCause {
  return typeof v === 'string' && (ROOT_CAUSES as readonly string[]).includes(v);
}

/* ───────────────────────── Durum makinesi ───────────────────────── */

/** Mevcut durumdan izinli hedef durumlar (atama durumuna göre). */
export function allowedIncidentTransitions(status: IncidentStatus, hasAssignee: boolean): IncidentStatus[] {
  switch (status) {
    case 'open':
      return hasAssignee ? ['assigned', 'in_progress', 'resolved'] : ['in_progress', 'resolved'];
    case 'assigned':
      return ['in_progress', 'resolved', 'open'];
    case 'in_progress':
      return hasAssignee ? ['assigned', 'resolved'] : ['open', 'resolved'];
    case 'resolved':
      return ['open'];
    default:
      return [];
  }
}

export interface IncidentState {
  type: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  assignedToId: string | null;
  dueAt: Date | null;
  resolvedAt: Date | null;
}

export interface IncidentPatch {
  status?: IncidentStatus;
  /** `undefined` dokunma, `null` atamayı kaldır. Doğrulama (aktif personel) ÇAĞIRANDA. */
  assignedToId?: string | null;
  severity?: IncidentSeverity;
  dueAt?: Date | null;
  resolutionNote?: string | null;
  rootCause?: RootCause | null;
}

export type IncidentEvent =
  | { kind: 'status'; from: IncidentStatus; to: IncidentStatus }
  | { kind: 'assigned'; from: string | null; to: string | null }
  | { kind: 'severity'; from: IncidentSeverity; to: IncidentSeverity }
  | { kind: 'due'; from: string | null; to: string | null };

export type IncidentPatchResult =
  | { ok: true; next: IncidentState; events: IncidentEvent[]; changed: boolean }
  | { ok: false; code: 'INVALID_TRANSITION' | 'NOTE_REQUIRED' | 'ASSIGNEE_REQUIRED'; message: string };

const NOTE_MIN = 3;

/**
 * Bir vaka güncellemesini hesaplar (saf). Sırayla: atama → durum → önem → son tarih.
 * Atama değişikliği `open ↔ assigned` durumunu otomatik çevirir; açık durum isteği her zaman
 * izinli geçiş listesine karşı doğrulanır.
 */
export function applyIncidentPatch(current: IncidentState, patch: IncidentPatch, now: Date): IncidentPatchResult {
  const next: IncidentState = { ...current };
  const events: IncidentEvent[] = [];

  if (patch.assignedToId !== undefined && patch.assignedToId !== current.assignedToId) {
    next.assignedToId = patch.assignedToId;
    events.push({ kind: 'assigned', from: current.assignedToId, to: patch.assignedToId });
    if (patch.status === undefined) {
      if (next.assignedToId && next.status === 'open') next.status = 'assigned';
      else if (!next.assignedToId && next.status === 'assigned') next.status = 'open';
    }
  }

  if (patch.status !== undefined && patch.status !== current.status) {
    const allowed = allowedIncidentTransitions(current.status, Boolean(next.assignedToId));
    // Atama + durum aynı istekte: atama sonrası durumdan da izin ver (open → assigned → in_progress).
    const viaAssign = next.status !== current.status ? allowedIncidentTransitions(next.status, Boolean(next.assignedToId)) : [];
    if (!allowed.includes(patch.status) && !viaAssign.includes(patch.status)) {
      return { ok: false, code: 'INVALID_TRANSITION', message: 'Bu vaka bu duruma geçirilemez.' };
    }
    if (patch.status === 'assigned' && !next.assignedToId) {
      return { ok: false, code: 'ASSIGNEE_REQUIRED', message: 'Önce bir sorumlu seçin.' };
    }
    if (patch.status === 'resolved' && requiresResolutionNote(current.type)) {
      const note = (patch.resolutionNote ?? '').trim();
      if (note.length < NOTE_MIN) {
        return { ok: false, code: 'NOTE_REQUIRED', message: 'Çözüm notu gerekli: ne yapıldığını kısaca yazın.' };
      }
    }
    next.status = patch.status;
  }

  if (next.status !== current.status) {
    events.push({ kind: 'status', from: current.status, to: next.status });
    if (next.status === 'resolved') next.resolvedAt = now;
    else if (current.status === 'resolved') next.resolvedAt = null;
  }

  if (patch.severity !== undefined && patch.severity !== current.severity) {
    next.severity = patch.severity;
    events.push({ kind: 'severity', from: current.severity, to: patch.severity });
  }

  if (patch.dueAt !== undefined) {
    const from = current.dueAt ? current.dueAt.toISOString() : null;
    const to = patch.dueAt ? patch.dueAt.toISOString() : null;
    if (from !== to) {
      next.dueAt = patch.dueAt;
      events.push({ kind: 'due', from, to });
    }
  }

  return { ok: true, next, events, changed: events.length > 0 };
}

/** Açık ve son tarihi geçmiş mi? */
export function isIncidentOverdue(status: string, dueAt: Date | string | null, now: Date = new Date()): boolean {
  if (!dueAt || status === 'resolved') return false;
  return new Date(dueAt).getTime() < now.getTime();
}

/* ───────────────────────── Metadata okuma ───────────────────────── */

export interface IncidentMetaView {
  source: string | null;
  feedbackIds: string[];
  table: { label: string; reasons: string[]; requestType: string | null } | null;
  metrics: Record<string, number | null> | null;
  resolution: { note: string | null; rootCause: string | null; by: string | null } | null;
  note: string | null;
  taskIds: string[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function asStringArray(v: unknown, max = 50): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64).slice(0, max);
}

/** `Incident.metadata` (serbest Json) → güvenli görünüm. Dizi/ilkel gelirse boş görünüm. */
export function readIncidentMeta(metadata: unknown): IncidentMetaView {
  const m = asRecord(metadata) ?? {};
  const feedbackIds = new Set<string>(asStringArray(m.feedbackIds));
  const single = asString(m.feedbackId);
  if (single) feedbackIds.add(single);

  const tableLabel = asString(m.tableLabel);
  const table =
    asString(m.source) === 'table_signal' || tableLabel
      ? {
          label: tableLabel ?? (asString(m.tableCode) ? `Masa ${asString(m.tableCode)}` : 'Masa belirtilmedi'),
          reasons: asStringArray(m.reasons, 10),
          requestType: asString(m.requestType),
        }
      : null;

  let metrics: Record<string, number | null> | null = null;
  const rawMetrics = asRecord(m.metrics);
  if (rawMetrics) {
    metrics = {};
    for (const [k, v] of Object.entries(rawMetrics)) {
      if (typeof v === 'number' && Number.isFinite(v)) metrics[k] = v;
      else if (v === null) metrics[k] = null;
    }
  }

  const res = asRecord(m.resolution);
  return {
    source: asString(m.source),
    feedbackIds: [...feedbackIds].slice(0, 50),
    table,
    metrics,
    resolution: res
      ? { note: asString(res.note), rootCause: asString(res.rootCause), by: asString(res.by) }
      : null,
    note: asString(m.note),
    taskIds: asStringArray(m.taskIds, 20),
  };
}

/** Grup → liste rozetindeki kaynak. */
export function sourceOfGroup(group: IncidentTypeGroup): 'system' | 'table' | 'sla' | 'rule' | 'manual' {
  if (group === 'radar') return 'system';
  return group;
}

export const INCIDENT_TITLE_MAX = 140;
export const INCIDENT_DESCRIPTION_MAX = 4000;
export const INCIDENT_NOTE_MAX = 1000;
export const INCIDENT_PAGE_SIZE = 20;
