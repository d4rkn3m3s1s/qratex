import { createQuestSchema, QUEST_TYPES, type QuestType } from '@/lib/validations';

/**
 * Görev formu modeli — saf (React yok), jest ile test edilir.
 *
 * P0-39: Form `DAILY/WEEKLY/MONTHLY/SPECIAL` gönderiyor, şema küçük harfli üç
 * değer + `z.date()` bekliyordu → her "Oluştur" 500. Artık form ile API AYNI
 * şemayı (`createQuestSchema`) paylaşır; istemci göndermeden önce doğrular.
 */

export const QUEST_TYPE_LABELS: Readonly<Record<QuestType, string>> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  special: 'Özel',
};

export function isQuestType(v: unknown): v is QuestType {
  return typeof v === 'string' && (QUEST_TYPES as readonly string[]).includes(v);
}

/** Eski veride büyük harf (`SPECIAL`) de var → görüntülemede küçük harfe indirger. */
export function normalizeQuestType(raw: unknown): QuestType | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return isQuestType(v) ? v : null;
}

/** Formun sunduğu mekanikler. Başka bir mekanikle (ör. başarım görevleri) kayıtlı
 * görev düzenlenirken mevcut değer KORUNUR — sessizce `custom`'a çevrilmez. */
export const EDITABLE_MECHANICS = ['custom', 'visit_category'] as const;
export type QuestRequirementType = string;

export function isKnownMechanic(v: string): v is (typeof EDITABLE_MECHANICS)[number] {
  return (EDITABLE_MECHANICS as readonly string[]).includes(v);
}

/** Sayısal alanlar metin olarak tutulur: alan temizlenebilir, yazarken "1"e zıplamaz. */
export type QuestFormValues = {
  name: string;
  description: string;
  icon: string;
  type: QuestType;
  target: string;
  reward: string;
  isActive: boolean;
  /** `<input type="date">` değeri (YYYY-MM-DD) ya da boş. */
  expiresAt: string;
  requirementType: QuestRequirementType;
  category: string;
};

export const initialQuestForm: QuestFormValues = {
  name: '',
  description: '',
  icon: '🎯',
  type: 'daily',
  target: '1',
  reward: '50',
  isActive: true,
  expiresAt: '',
  requirementType: 'custom',
  category: '',
};

const TR_TIMEZONE = 'Europe/Istanbul';

/** ISO/Date → Türkiye saatine göre `YYYY-MM-DD` (düzenleme formunu doldurmak için). */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA biçimi YYYY-MM-DD üretir.
  return d.toLocaleDateString('en-CA', { timeZone: TR_TIMEZONE });
}

/** `YYYY-MM-DD` → o günün sonu (Türkiye saati) ISO metni; boş → null. */
export function dateInputToIso(value: string): string | null {
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T23:59:59.999+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type QuestApiPayload = {
  name: string;
  description: string;
  icon: string;
  type: QuestType;
  requirement: { type: QuestRequirementType; count: number; category?: string };
  reward: { points: number; xp: number };
  expiresAt: string | null;
  isActive?: boolean;
};

export function toQuestPayload(f: QuestFormValues, opts: { includeActive?: boolean } = {}): QuestApiPayload {
  const count = Number.parseInt(f.target, 10);
  const points = Number.parseInt(f.reward, 10);
  const category = f.category.trim();
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    icon: f.icon || '🎯',
    type: f.type,
    requirement: {
      type: f.requirementType,
      count: Number.isFinite(count) ? count : 0,
      ...(f.requirementType === 'visit_category' && category ? { category } : {}),
    },
    reward: {
      points: Number.isFinite(points) ? points : 0,
      xp: Number.isFinite(points) ? Math.floor(points / 2) : 0,
    },
    expiresAt: f.expiresAt ? dateInputToIso(f.expiresAt) : null,
    ...(opts.includeActive ? { isActive: f.isActive } : {}),
  };
}

/**
 * İstemci tarafı doğrulama — sunucuyla AYNI şema. Hata varsa kullanıcıya
 * gösterilecek ilk Türkçe mesajı, yoksa `null` döner.
 */
export function validateQuestPayload(p: QuestApiPayload): string | null {
  const parsed = createQuestSchema.safeParse(p);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue?.message || 'Görev bilgileri geçersiz';
}

type QuestLike = {
  name: string;
  description: string;
  icon?: string | null;
  type?: string | null;
  requirement?: { type?: string; count?: number; category?: string } | null;
  reward?: { points?: number } | null;
  isActive: boolean;
  expiresAt?: string | null;
};

export function questToFormValues(q: QuestLike): QuestFormValues {
  return {
    name: q.name ?? '',
    description: q.description ?? '',
    icon: q.icon || '🎯',
    type: normalizeQuestType(q.type) ?? 'daily',
    target: String(q.requirement?.count && q.requirement.count > 0 ? q.requirement.count : 1),
    reward: String(typeof q.reward?.points === 'number' && q.reward.points >= 0 ? q.reward.points : 50),
    isActive: q.isActive,
    expiresAt: toDateInputValue(q.expiresAt ?? null),
    requirementType:
      typeof q.requirement?.type === 'string' && q.requirement.type.trim() ? q.requirement.type.trim() : 'custom',
    category: q.requirement?.category || '',
  };
}
