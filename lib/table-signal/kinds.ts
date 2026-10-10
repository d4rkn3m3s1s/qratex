/**
 * Masa sinyali — saf sözleşme (istemci + sunucu ortak; DB'ye dokunmaz).
 *
 * Üç tür sinyal vardır (docs/audit/2026-10-08/musteri/table-signal.md):
 *  - `OK`      : "Her şey yolunda". Yalnız `TablePulse` (duygu kaydı); vaka açılmaz, bildirim gitmez.
 *  - `CONCERN` : "Bir şey var" + neden çipleri (+ isteğe bağlı not). `TablePulse` (mood CONCERN) +
 *                bayinin Gelen Kutusu › Vakalar kuyruğuna `Incident(type=table_signal)`.
 *  - `REQUEST` : "Garson çağır / Hesap / Başka bir istek". Duygu değil hizmet isteği olduğu için
 *                `TablePulse`'a YAZILMAZ (sağlık skoru 2.0'daki CONCERN oranını ve masa içgörüsünü
 *                bozmasın); yalnız `Incident(type=table_request)` açılır.
 *
 * Misafir takibi: vaka durumu (`Incident.status`) misafire üç aşamada gösterilir —
 * İletildi (open) → Ekip ilgileniyor (assigned / in_progress) → Çözüldü (resolved).
 */

export const SIGNAL_KINDS = ['OK', 'CONCERN', 'REQUEST'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/** "Bir şey var" neden çipleri (çoklu seçim). */
export const CONCERN_REASONS = ['slow_service', 'wrong_order', 'food_quality', 'cleanliness', 'noise', 'other'] as const;
export type ConcernReason = (typeof CONCERN_REASONS)[number];

/** Hizmet isteği türleri (tek seçim). */
export const REQUEST_TYPES = ['waiter', 'bill', 'other'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/** Vaka türleri (Incident.type). */
export const INCIDENT_TYPE_CONCERN = 'table_signal';
export const INCIDENT_TYPE_REQUEST = 'table_request';

/** Masa etiketi ve not sınırları (TablePulse.tableCode serbest metin, note VarChar(400)). */
export const TABLE_CODE_MAX = 32;
export const NOTE_MAX = 400;

/** Aynı masadan aynı türde ikinci vaka açılmaz; mevcut vakanın takibi döner (dakika). */
export const DUPLICATE_WINDOW_MS = 3 * 60_000;
/** Vaka hedef çözüm süresi (bayi kuyruğunda `dueAt`). */
export const CONCERN_DUE_MS = 10 * 60_000;
export const REQUEST_DUE_MS = 5 * 60_000;
/** Misafir takip anahtarının ömrü. */
export const TRACKING_TTL_MS = 6 * 60 * 60_000;

/** Misafire gösterilen aşama. */
export type SignalStage = 'sent' | 'seen' | 'resolved';

export function stageOfIncidentStatus(status: string | null | undefined): SignalStage {
  if (status === 'resolved') return 'resolved';
  if (status === 'assigned' || status === 'in_progress') return 'seen';
  return 'sent';
}

/** Vaka başlığı/açıklaması — bayi tarafı Türkçe çalışır (kuyruk metni). */
export const REASON_LABEL_TR: Record<ConcernReason, string> = {
  slow_service: 'Servis yavaş',
  wrong_order: 'Sipariş yanlış',
  food_quality: 'Yemek / ürün kalitesi',
  cleanliness: 'Temizlik',
  noise: 'Gürültü / ortam',
  other: 'Diğer',
};

export const REQUEST_LABEL_TR: Record<RequestType, string> = {
  waiter: 'Garson çağrısı',
  bill: 'Hesap istendi',
  other: 'Misafir isteği',
};

/** Masa etiketini normalleştirir: kırp, boşlukları tekle, en fazla 32 karakter; boşsa null. */
export function normalizeTableCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.replace(/\s+/g, ' ').trim().slice(0, TABLE_CODE_MAX);
  return v || null;
}

/** Tekrarsız, bilinen nedenler (sıra korunur). */
export function normalizeReasons(raw: readonly string[] | null | undefined): ConcernReason[] {
  if (!raw) return [];
  const out: ConcernReason[] = [];
  for (const r of raw) {
    if ((CONCERN_REASONS as readonly string[]).includes(r) && !out.includes(r as ConcernReason)) out.push(r as ConcernReason);
  }
  return out;
}

const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Not alanındaki telefon ve e-posta desenlerini maskeler (KVKK — "kişisel bilgi yazmayın"
 * ipucuna rağmen yazılırsa bayiye çıplak gitmez). Boşsa null.
 */
export function sanitizeNote(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw
    .replace(EMAIL_RE, '[e-posta gizlendi]')
    .replace(PHONE_RE, '[telefon gizlendi]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_MAX);
  return v || null;
}

export function tableLabelTr(tableCode: string | null): string {
  return tableCode ? `Masa ${tableCode}` : 'Masa belirtilmedi';
}

export function incidentTitle(
  input: { kind: 'CONCERN'; reasons: readonly ConcernReason[]; tableCode: string | null } | { kind: 'REQUEST'; requestType: RequestType; tableCode: string | null }
): string {
  const table = tableLabelTr(input.tableCode);
  if (input.kind === 'REQUEST') return `${table} · ${REQUEST_LABEL_TR[input.requestType]}`;
  const reasons = input.reasons.map((r) => REASON_LABEL_TR[r]);
  return reasons.length ? `${table} · Sorun bildirildi: ${reasons.join(', ')}` : `${table} · Sorun bildirildi`;
}

export function incidentDescription(parts: {
  note: string | null;
  placeLabel: string | null;
  linkedAccount: boolean;
}): string {
  const lines: string[] = [];
  if (parts.note) lines.push(`Misafir notu: “${parts.note}”`);
  if (parts.placeLabel) lines.push(`QR: ${parts.placeLabel}`);
  lines.push(parts.linkedAccount ? 'Misafir hesabıyla ilişkilendirdi.' : 'Anonim gönderildi.');
  lines.push('Kaynak: masa sinyali (QR).');
  return lines.join('\n');
}
