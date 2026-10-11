/**
 * Ekip modülü sözlüğü — durum, öncelik, tekrar, girişim aşaması. Sunucu ve istemci aynı
 * tabloyu okur (denetim D1/Bulgu 10: "Onayda" beş görünümde gri kalıyordu çünkü eşleme beş
 * yerde elle kopyalanmıştı).
 */

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Tekrar: "Her gün" haftalık panoda gerçeklenemediği için kaldırıldı (denetim O4). */
export const TASK_RECURRENCES = ['weekly', 'monthly'] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export type TeamTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const STATUS_META: Record<TaskStatus, { label: string; short: string; tone: TeamTone; description: string }> = {
  todo: { label: 'Yapılacak', short: 'Yapılacak', tone: 'neutral', description: 'Henüz başlanmadı' },
  in_progress: { label: 'Devam ediyor', short: 'Devam', tone: 'warning', description: 'Üzerinde çalışılıyor' },
  review: { label: 'Onayda', short: 'Onayda', tone: 'info', description: 'Yönetici onayı bekleniyor' },
  done: { label: 'Bitti', short: 'Bitti', tone: 'success', description: 'Onaylandı ve tamamlandı' },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; tone: TeamTone; rank: number }> = {
  high: { label: 'Yüksek', tone: 'danger', rank: 3 },
  medium: { label: 'Orta', tone: 'warning', rank: 2 },
  low: { label: 'Düşük', tone: 'neutral', rank: 1 },
};

export const RECURRENCE_LABEL: Record<string, string> = {
  weekly: 'Her hafta',
  monthly: 'Her ay',
  // Eski kayıtlar: "daily" hiçbir zaman günlük üretilmedi; haftalık davranır ve öyle gösterilir.
  daily: 'Her hafta',
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v);
}

export function isTaskPriority(v: unknown): v is TaskPriority {
  return typeof v === 'string' && (TASK_PRIORITIES as readonly string[]).includes(v);
}

/** Öncelik sırası: high 3 > medium 2 > low 1 (string alfabetik sıralama yerine; denetim O2). */
export function priorityRank(p: string | null | undefined): number {
  return isTaskPriority(p) ? PRIORITY_META[p].rank : 0;
}

export function statusMeta(s: string | null | undefined) {
  return isTaskStatus(s) ? STATUS_META[s] : STATUS_META.todo;
}

export function priorityMeta(p: string | null | undefined) {
  return isTaskPriority(p) ? PRIORITY_META[p] : PRIORITY_META.medium;
}

// ───────────────────────────── Girişimler (eski /admin/roadmap) ─────────────────────────────

/**
 * Girişim = `CompanyTask` satırı, `sourceType = 'initiative'`, `weekKey = null`.
 * `status` alanı aşamayı taşır. Görev sorguları girişimleri her zaman dışlar (`NOT_INITIATIVE`).
 */
export const INITIATIVE_SOURCE = 'initiative';
export const INITIATIVE_PHASES = ['later', 'next', 'now', 'shipped', 'dropped'] as const;
export type InitiativePhase = (typeof INITIATIVE_PHASES)[number];
export const INITIATIVE_BOARD_PHASES = ['later', 'next', 'now', 'shipped'] as const;

export const PHASE_META: Record<InitiativePhase, { label: string; tone: TeamTone; description: string }> = {
  later: { label: 'Sonra', tone: 'neutral', description: 'Fikir olgunlaşıyor; takvime alınmadı' },
  next: { label: 'Sırada', tone: 'info', description: 'Bir sonraki dönemde başlayacak' },
  now: { label: 'Şimdi', tone: 'warning', description: 'Ekip şu an üzerinde çalışıyor' },
  shipped: { label: 'Yayında', tone: 'success', description: 'Tamamlandı ve kullanıma açıldı' },
  dropped: { label: 'Vazgeçildi', tone: 'neutral', description: 'Bilinçli olarak durduruldu' },
};

export function isInitiativePhase(v: unknown): v is InitiativePhase {
  return typeof v === 'string' && (INITIATIVE_PHASES as readonly string[]).includes(v);
}

// ───────────────────────────── Yerelleştirilmiş sözlük (arayüz) ─────────────────────────────

const STATUS_EN: Record<TaskStatus, { label: string; short: string; description: string }> = {
  todo: { label: 'To do', short: 'To do', description: 'Not started yet' },
  in_progress: { label: 'In progress', short: 'In progress', description: 'Being worked on' },
  review: { label: 'In review', short: 'In review', description: 'Waiting for manager approval' },
  done: { label: 'Done', short: 'Done', description: 'Approved and completed' },
};
const PRIORITY_EN: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const PHASE_EN: Record<InitiativePhase, { label: string; description: string }> = {
  later: { label: 'Later', description: 'Idea still taking shape; not scheduled' },
  next: { label: 'Next', description: 'Starts in the next cycle' },
  now: { label: 'Now', description: 'The team is working on it now' },
  shipped: { label: 'Shipped', description: 'Done and available to use' },
  dropped: { label: 'Dropped', description: 'Deliberately stopped' },
};
const RECURRENCE_EN: Record<string, string> = { weekly: 'Every week', monthly: 'Every month', daily: 'Every week' };

/** Arayüz dili için durum/öncelik/aşama/tekrar sözlüğü (ton ve sıra aynı kalır). */
export function teamMeta(locale: 'tr' | 'en') {
  if (locale !== 'en') {
    return { STATUS_META, PRIORITY_META, PHASE_META, RECURRENCE_LABEL, statusMeta, priorityMeta };
  }
  const S = Object.fromEntries(TASK_STATUSES.map((k) => [k, { ...STATUS_META[k], ...STATUS_EN[k] }])) as typeof STATUS_META;
  const P = Object.fromEntries(TASK_PRIORITIES.map((k) => [k, { ...PRIORITY_META[k], label: PRIORITY_EN[k] }])) as typeof PRIORITY_META;
  const PH = Object.fromEntries(INITIATIVE_PHASES.map((k) => [k, { ...PHASE_META[k], ...PHASE_EN[k] }])) as typeof PHASE_META;
  return {
    STATUS_META: S,
    PRIORITY_META: P,
    PHASE_META: PH,
    RECURRENCE_LABEL: RECURRENCE_EN,
    statusMeta: (s: string | null | undefined) => (isTaskStatus(s) ? S[s] : S.todo),
    priorityMeta: (p: string | null | undefined) => (isTaskPriority(p) ? P[p] : P.medium),
  };
}

// ───────────────────────────── Dosya ekleri ─────────────────────────────

/**
 * Tek dosya sınırı. Yükleme Vercel fonksiyonunun gövdesinden geçer (platform sınırı ~4,5 MB);
 * eski kod "50 MB" diyip hata metninde "8 MB" yazıyordu (denetim O10/Bulgu 17). Arayüz ve
 * sunucu bu sabiti okur.
 */
export const TEAM_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const TEAM_ATTACHMENT_MAX_LABEL = '4 MB';

/** Departman renk paleti: beyaz metinle ≥ 4,5:1 kontrastlı koyu tonlar (denetim Bulgu 10). */
export const DEPARTMENT_COLORS = [
  '#6d28d9', // mor
  '#1d4ed8', // mavi
  '#047857', // yeşil
  '#b45309', // kehribar
  '#0e7490', // camgöbeği
  '#b91c1c', // kırmızı
  '#be185d', // pembe
  '#4338ca', // çivit
  '#374151', // gri
] as const;

/** Bir hex rengin üstünde okunur metin rengi (WCAG göreli parlaklık). */
export function contrastTextOn(hex: string): '#ffffff' | '#111827' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  const vsWhite = 1.05 / (L + 0.05);
  const vsDark = (L + 0.05) / 0.06; // #111827 ≈ L 0.01
  return vsWhite >= vsDark ? '#ffffff' : '#111827';
}

/** Etiket CSV'sini benzersiz listeye çevirir. */
export function parseTags(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return [...new Set(csv.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 12);
}

/** Etiket eşleşmesi TAM jeton üzerinden (eski `contains` "#tas" ile "tasarım"ı da buluyordu). */
export function hasTag(csv: string | null | undefined, tag: string): boolean {
  const needle = tag.trim().toLocaleLowerCase('tr');
  return parseTags(csv).some((t) => t.toLocaleLowerCase('tr') === needle);
}
