/**
 * Gelen Kutusu kuyrukları (Telafi onayı · Vakalar · Bana atananlar) — yanıt DTO'ları.
 * İstemci ve sunucu ortak kullanır; tarih alanları ISO dizgisidir.
 */
import type { RemedyOption } from '@/lib/remedy-options';
import type { RemedyRejectReason, RemedyTrigger, RemedyView } from './remedy-core';
import type { IncidentSeverity, IncidentStatus, IncidentTypeGroup } from './incident-catalog';
import type { RadarRuleKey, RadarLevel } from './radar-rules';
import type { WorkKind, WorkPriority, WorkStatus } from './work-core';

/* ───────────────────────── Ortak ───────────────────────── */

export interface AssigneeDto {
  id: string;
  name: string;
  /** `owner` = işletme sahibi (bayi hesabı), `staff` = aktif personel. */
  role: 'owner' | 'staff';
  jobTitle: string | null;
  isMe: boolean;
}

export interface TimelineEntryDto {
  id: string;
  at: string;
  kind: string;
  label: string;
  actorName: string | null;
  note: string | null;
  /** İstemcinin dil kopyasıyla biçimleyeceği ham değerler (durum kodu, sorumlu adı…). */
  params?: Record<string, string | null>;
}

/* ───────────────────────── Telafi ───────────────────────── */

export type RemedySourceKind = 'qr' | 'consumption' | 'personal';

export interface RemedyQueueItem {
  id: string;
  status: string;
  view: RemedyView;
  createdAt: string;
  publishedAt: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
  customer: { name: string; initials: string };
  source: {
    kind: RemedySourceKind;
    id: string | null;
    rating: number | null;
    excerpt: string | null;
    createdAt: string | null;
    /** Şube (QR'ın mekânı) ya da ürün adı (tüketim). */
    placeLabel: string | null;
    /** Gelen Kutusu'nda kaynak yorumun detay çekmecesi. */
    inboxHref: string | null;
  };
  message: string;
  options: RemedyOption[];
  origin: { auto: boolean; trigger: RemedyTrigger | null };
  selection: { label: string; type: string; value: number } | null;
  creditedPoints: number | null;
  reject: { reason: RemedyRejectReason | null; note: string | null } | null;
}

export interface RemedyCounts {
  awaiting: number;
  sent: number;
  accepted: number;
  closed: number;
  /** En eski onay bekleyen taslağın oluşturulma anı. */
  oldestAwaitingAt: string | null;
  /** En eski onay bekleyen taslağın bekleme süresi (sn; sunucu saatine göre). */
  oldestAwaitingSeconds: number | null;
  /** 24 saatten uzun süredir onay bekleyen taslak sayısı. */
  staleAwaiting: number;
  /** Bu ay (İstanbul) müşterinin kabul ettiği telafi sayısı. */
  acceptedThisMonth: number;
  /** Bu ay yayınlananların kabul oranı (%; yayın yoksa null). */
  acceptRateThisMonth: number | null;
}

export interface RemedyListPage {
  items: RemedyQueueItem[];
  nextCursor: string | null;
}

export interface RemedyListResponse extends RemedyListPage {
  counts: RemedyCounts;
}

export interface RemedyDetail extends RemedyQueueItem {
  sourceText: string | null;
  customerContext: { visits: number; feedbacks: number; remedies: number; acceptedRemedies: number };
  /** Bayinin bu kaynak için GÜNCEL şablon izin listesi (düzenleme yalnız bunun alt kümesi). */
  allowedOptions: RemedyOption[];
  /** Taslaktaki seçenekler güncel şablonlardan farklı mı? */
  templateDrift: boolean;
  timeline: TimelineEntryDto[];
  /** Reddedildikten sonra geri alma süresi içinde mi? */
  restorableUntil: string | null;
}

export interface RemedyActionResult {
  id: string;
  status: string;
  notificationSent?: boolean;
  restorableUntil?: string | null;
}

export interface RemedyBulkResult {
  done: string[];
  failed: Array<{ id: string; code: string; message: string }>;
}

/* ───────────────────────── Vakalar ───────────────────────── */

export interface IncidentItem {
  id: string;
  type: string;
  typeGroup: IncidentTypeGroup;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  excerpt: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  overdue: boolean;
  resolvedAt: string | null;
  assignee: AssigneeDto | null;
  source: 'system' | 'table' | 'sla' | 'rule' | 'manual';
  /** Masa sinyali: masa etiketi + neden kodları. */
  table: { label: string; reasons: string[]; requestType: string | null } | null;
  feedbackCount: number;
}

export interface IncidentSummary {
  open: number;
  urgent: number;
  overdue: number;
  mine: number;
  table: number;
  resolved7d: number;
  /** Son 30 günde çözülenlerin ortalama çözüm süresi (sn; yoksa null). */
  mttrSeconds: number | null;
  mttrSample: number;
}

export interface RadarRuleStatus {
  key: RadarRuleKey;
  enabled: boolean;
  /** Ölçülen değer (ör. puan farkı, sayı). Veri yetersizse null. */
  value: number | null;
  threshold: number;
  /** 0..1 eşiğe yakınlık (1 = eşik aşıldı). */
  ratio: number;
  level: RadarLevel;
  /** Değerlendirme için örneklem (ör. son 7 günün yorum sayısı). */
  sample: number;
  /** Ek bağlam (ör. önceki ve son 7 gün ortalaması). */
  detail: Record<string, number | null>;
}

export interface RadarStatus {
  level: RadarLevel;
  rules: RadarRuleStatus[];
  evaluatedAt: string;
  /** Son otomatik tarama zamanı (sistem vakası üretimi). */
  lastScanAt: string | null;
}

export interface IncidentListResponse {
  items: IncidentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: IncidentSummary;
}

export interface IncidentDetail extends IncidentItem {
  description: string | null;
  thresholdValue: number | null;
  metrics: Record<string, number | null> | null;
  note: string | null;
  resolution: { note: string | null; rootCause: string | null; by: string | null } | null;
  feedbacks: Array<{ id: string; rating: number; excerpt: string | null; createdAt: string; replied: boolean; href: string }>;
  tasks: Array<{ id: string; title: string; status: string }>;
  timeline: TimelineEntryDto[];
  allowedTransitions: IncidentStatus[];
}

/* ───────────────────────── Bana atananlar ───────────────────────── */

export interface WorkItem {
  key: string;
  kind: WorkKind;
  id: string;
  title: string;
  excerpt: string | null;
  priority: WorkPriority;
  status: WorkStatus;
  rawStatus: string;
  dueAt: string | null;
  overdue: boolean;
  createdAt: string;
  closedAt: string | null;
  assignee: AssigneeDto | null;
  sourceLabel: string;
  sourceKind: string;
  feedbackHref: string | null;
  impactScore: number | null;
}

export interface WorkSummary {
  mine: number;
  mineOverdue: number;
  team: number;
  unassigned: number;
  closedThisWeek: number;
}

export interface WorkListResponse {
  items: WorkItem[];
  nextOffset: number | null;
  total: number;
  summary: WorkSummary;
  incidentsIncluded: boolean;
}

export interface TaskDetail extends WorkItem {
  text: string;
  feedback: { id: string; rating: number; excerpt: string | null; createdAt: string; href: string } | null;
  timeline: TimelineEntryDto[];
  allowedTransitions: WorkStatus[];
}

export interface TaskSuggestion {
  key: string;
  text: string;
  priority: WorkPriority;
  evidence: number;
  feedbackIds: string[];
  lastSeenAt: string;
}
