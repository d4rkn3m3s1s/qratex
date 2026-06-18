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
      if (locTemplates.length > 0) return locTemplates.map(templateToOption);
    }

    // 2) İşletme geneli şablonlar (locationId = null).
    const dealerTemplates = await prisma.remedyTemplate.findMany({
      where: { dealerId, locationId: null, isActive: true },
      orderBy: { order: 'asc' },
    });
    if (dealerTemplates.length > 0) return dealerTemplates.map(templateToOption);
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
