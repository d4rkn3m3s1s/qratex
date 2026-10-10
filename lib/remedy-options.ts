/**
 * Telafi teklif seçeneklerinin tek kaynağı. Önceden 6 ayrı yerde hardcoded
 * DEFAULT_OPTIONS vardı; artık bayi (ve mekan) bazlı RemedyTemplate'lerden
 * çözülür. Şablon tanımlı değilse güvenli varsayılana düşer → geriye uyumlu.
 *
 * Öncelik: mekana özel şablon > işletme geneli şablon > sistem varsayılanı.
 */
import { prisma } from '@/lib/prisma';

export interface RemedyOption {
  type: string; // discount | points | free_item
  label: string;
  unit: string;
  values: number[];
}

/** Hiç şablon tanımlanmadığında kullanılan sistem varsayılanı (eski davranış). */
export const DEFAULT_REMEDY_OPTIONS: RemedyOption[] = [
  { type: 'discount', label: 'İndirim', unit: '%', values: [10, 15, 20, 25, 30] },
  { type: 'points', label: 'Puan', unit: 'puan', values: [50, 100, 150, 200] },
  { type: 'free_item', label: 'Ücretsiz ürün/içecek', unit: 'adet', values: [1] },
];

/** Telafi türleri (RemedyTemplate.type ile aynı sözlük). Bilinmeyen tür hiçbir zaman sunulmaz. */
export const REMEDY_OPTION_TYPES = ['discount', 'points', 'free_item'] as const;
export type RemedyOptionType = (typeof REMEDY_OPTION_TYPES)[number];

/**
 * Tür başına izinli değer aralığı. Şablon uç noktası yalnız `nonnegative` istiyor; burada
 * anlamsız/aşırı değerler (0, %500 indirim, 1.000.000 puan) teklif seçeneklerine giremez.
 * Puan tavanı: telafi teslimi (F2.5) puan basmaya bağlandığında tek teklifin basabileceği üst sınır.
 */
export const REMEDY_VALUE_LIMITS: Readonly<Record<RemedyOptionType, { min: number; max: number; integer: boolean }>> = {
  discount: { min: 1, max: 100, integer: false },
  points: { min: 1, max: 1000, integer: true },
  free_item: { min: 1, max: 10, integer: true },
};

const MAX_OPTION_VALUES = 12;
const MAX_LABEL_LEN = 60;
const MAX_UNIT_LEN = 20;

const DEFAULT_LABELS: Record<RemedyOptionType, { label: string; unit: string }> = {
  discount: { label: 'İndirim', unit: '%' },
  points: { label: 'Puan', unit: 'puan' },
  free_item: { label: 'Ücretsiz ürün/içecek', unit: 'adet' },
};

export function isRemedyOptionType(v: unknown): v is RemedyOptionType {
  return typeof v === 'string' && (REMEDY_OPTION_TYPES as readonly string[]).includes(v);
}

/** Tek bir değeri türün sınırlarına göre doğrular (string "20" de kabul edilir). */
export function coerceRemedyValue(type: RemedyOptionType, raw: unknown): number | null {
  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(raw)) n = Number(raw);
  else return null;
  if (!Number.isFinite(n)) return null;
  const lim = REMEDY_VALUE_LIMITS[type];
  if (n < lim.min || n > lim.max) return null;
  if (lim.integer && !Number.isInteger(n)) return null;
  return n;
}

function cleanText(v: unknown, fallback: string, max: number): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  return t ? t.slice(0, max) : fallback;
}

/**
 * Herhangi bir kaynaktan (DB Json, istemci gövdesi, şablon) gelen seçenek listesini güvenli
 * biçime indirger: dizi değilse boş; bilinmeyen tür, geçersiz/aralık dışı değer atılır; aynı tür
 * iki kez gelirse ilk kayıt kalır. Hiç geçerli değeri kalmayan seçenek listeden çıkar.
 * (JSON-forEach 500 sınıfı: `options` Json alanı dizi olmayabilir.)
 */
export function normalizeRemedyOptions(raw: unknown): RemedyOption[] {
  if (!Array.isArray(raw)) return [];
  const out: RemedyOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    if (!isRemedyOptionType(o.type) || seen.has(o.type)) continue;
    const type = o.type;
    const values: number[] = [];
    if (Array.isArray(o.values)) {
      for (const v of o.values) {
        const n = coerceRemedyValue(type, v);
        if (n != null && !values.includes(n)) values.push(n);
        if (values.length >= MAX_OPTION_VALUES) break;
      }
    }
    if (values.length === 0) continue;
    seen.add(type);
    out.push({
      type,
      label: cleanText(o.label, DEFAULT_LABELS[type].label, MAX_LABEL_LEN),
      unit: cleanText(o.unit, DEFAULT_LABELS[type].unit, MAX_UNIT_LEN),
      values,
    });
  }
  return out;
}

/** Kabul anında saklanan seçim anlık görüntüsü (istemciden gelen etiket/değere asla güvenilmez). */
export interface RemedySelection {
  type: RemedyOptionType;
  label: string;
  unit: string;
  value: number;
}

/**
 * Müşterinin seçimini teklifin KENDİ seçenek listesine (allowlist) karşı doğrular.
 * Tür listede yoksa ya da değer o türün `values` dizisinde değilse null döner.
 */
export function findRemedySelection(
  offerOptions: unknown,
  selectedType: unknown,
  selectedValue: unknown
): RemedySelection | null {
  if (!isRemedyOptionType(selectedType)) return null;
  const options = normalizeRemedyOptions(offerOptions);
  const opt = options.find((o) => o.type === selectedType);
  if (!opt) return null;
  const n = coerceRemedyValue(selectedType, selectedValue);
  if (n == null || !opt.values.includes(n)) return null;
  return { type: opt.type as RemedyOptionType, label: opt.label, unit: opt.unit, value: n };
}

/** Saklanan seçim alanlarından (selectedType/selectedValue + teklif seçenekleri) anlık görüntüyü üretir. */
export function selectionFromStored(
  offerOptions: unknown,
  selectedType: string | null | undefined,
  selectedValue: string | null | undefined
): RemedySelection | null {
  if (!selectedType || selectedValue == null) return null;
  return findRemedySelection(offerOptions, selectedType, selectedValue);
}

/** "%20 İndirim", "100 puan", "1 adet Ücretsiz ürün/içecek" — müşteri/bayi metinleri için. */
export function formatRemedySelection(sel: Pick<RemedySelection, 'type' | 'label' | 'unit' | 'value'>): string {
  const v = Number.isInteger(sel.value) ? String(sel.value) : sel.value.toLocaleString('tr-TR');
  if (sel.type === 'discount' && sel.unit === '%') return `%${v} ${sel.label}`;
  if (sel.type === 'points') return `${v} ${sel.unit || 'puan'}`;
  return `${v} ${sel.unit} ${sel.label}`.trim();
}

/**
 * Bayinin istek gövdesinde gönderdiği seçenekleri, şablonlardan çözülen allowlist'in ALT
 * KÜMESİ olmaya zorlar. Tür allowlist'te yoksa ya da bir değer o türün izinli değerlerinde
 * değilse `ok:false` döner (route 400 verir). Böylece istemciden 999.999 puanlık seçenek
 * enjekte edilemez.
 */
export function restrictRemedyOptionsToAllowlist(
  requested: unknown,
  allowed: RemedyOption[]
): { ok: true; options: RemedyOption[] } | { ok: false; reason: string } {
  if (!Array.isArray(requested) || requested.length === 0) {
    return { ok: false, reason: 'En az bir telafi seçeneği gerekli.' };
  }
  const normalized = normalizeRemedyOptions(requested);
  if (normalized.length !== requested.length) {
    return { ok: false, reason: 'Telafi seçeneklerinden biri geçersiz.' };
  }
  const out: RemedyOption[] = [];
  for (const opt of normalized) {
    const base = allowed.find((a) => a.type === opt.type);
    if (!base) return { ok: false, reason: `"${opt.label}" türü bu işletmenin telafi şablonlarında yok.` };
    const bad = opt.values.find((v) => !base.values.includes(v));
    if (bad != null) {
      return { ok: false, reason: `"${base.label}" için ${bad} değeri izinli değil.` };
    }
    // Etiket/birim şablondan gelir (bayi gövdesindeki metin değil).
    out.push({ type: base.type, label: base.label, unit: base.unit, values: opt.values });
  }
  return { ok: true, options: out };
}

function templateToOption(t: {
  type: string;
  label: string;
  unit: string;
  values: unknown;
}): RemedyOption {
  // Yalnızca gerçek sayıları kabul et: Number(null)===0 gibi sürprizleri ele.
  const values = Array.isArray(t.values)
    ? (t.values as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
  return { type: t.type, label: t.label, unit: t.unit, values };
}

/** Şablon satırlarını seçeneklere çevirip türün sınırlarına göre süzer. */
function templatesToOptions(rows: Array<{ type: string; label: string; unit: string; values: unknown }>): RemedyOption[] {
  return normalizeRemedyOptions(rows.map(templateToOption));
}

/**
 * Bir bayi (ve opsiyonel mekan) için telafi seçeneklerini döner.
 * Mekana özel şablon varsa onu, yoksa işletme geneli şablonları, o da yoksa
 * sistem varsayılanını kullanır. Asla boş dizi döndürmez.
 */
export async function getRemedyOptions(
  dealerId: string,
  locationId?: string | null
): Promise<RemedyOption[]> {
  try {
    // 1) Mekana özel şablonlar (locationId verildiyse).
    if (locationId) {
      const locTemplates = await prisma.remedyTemplate.findMany({
        where: { dealerId, locationId, isActive: true },
        orderBy: { order: 'asc' },
      });
      const loc = templatesToOptions(locTemplates);
      if (loc.length > 0) return loc;
    }

    // 2) İşletme geneli şablonlar (locationId = null).
    const dealerTemplates = await prisma.remedyTemplate.findMany({
      where: { dealerId, locationId: null, isActive: true },
      orderBy: { order: 'asc' },
    });
    const general = templatesToOptions(dealerTemplates);
    if (general.length > 0) return general;
  } catch (err) {
    console.error('[REMEDY_OPTIONS] template lookup failed, using default:', err);
  }

  // 3) Sistem varsayılanı (geriye uyumlu).
  return DEFAULT_REMEDY_OPTIONS;
}

/**
 * Bir QR koddan mekanı çözüp seçenekleri döner — feedback akışı için kısayol.
 */
export async function getRemedyOptionsForQrCode(
  dealerId: string,
  qrCodeId: string | null | undefined
): Promise<RemedyOption[]> {
  let locationId: string | null = null;
  if (qrCodeId) {
    try {
      const qr = await prisma.qRCode.findUnique({
        where: { id: qrCodeId },
        select: { locationId: true },
      });
      locationId = qr?.locationId ?? null;
    } catch {
      locationId = null;
    }
  }
  return getRemedyOptions(dealerId, locationId);
}
