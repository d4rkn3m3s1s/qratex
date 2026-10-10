/**
 * Fiziksel kart yaşam döngüsü DURUM MAKİNESİ (P0-26 kart kolu, admin_cards B1).
 *
 * Önceden "Müşteriden kaldır" bloklu kartı da koşulsuz `UNUSED` yapıyordu; blok sessizce
 * kalkıyor, çalıntı kartı elinde tutan kişi kartı kendi hesabına aktive edebiliyordu.
 * Kart silme ise tüketimleri, tüketim yorumlarını ve kartın denetim izini siliyordu.
 *
 * İzinli geçişler (yalnız bunlar):
 *
 *   UNUSED    → ACTIVATED   yalnız ATAMA (assign) ya da müşterinin kendi aktivasyonu
 *   UNUSED    → BLOCKED     blokla
 *   ACTIVATED → BLOCKED     blokla
 *   ACTIVATED → UNUSED      yalnız MÜŞTERİDEN KALDIR (unassign; müşteri bağı kopar)
 *   BLOCKED   → ACTIVATED   blok kaldır — yalnız kart bir müşteriye bağlıysa
 *   BLOCKED   → UNUSED      blok kaldır — yalnız kart kimseye bağlı değilse
 *   * (arşiv) → —           arşivlenmiş kart TERMİNALDİR: hiçbir geçiş yok
 *
 * Arşiv = "silme": `archivedAt` + `status=BLOCKED` (aktivasyon ucu bloklu kartı reddeder);
 * tüketimler, yorumlar ve CardAuditLog korunur.
 */
export type CardStatus = 'UNUSED' | 'ACTIVATED' | 'BLOCKED';
export type CardOperation = 'status' | 'assign' | 'unassign' | 'archive';

export interface CardState {
  status: CardStatus;
  customerId: string | null;
  archivedAt: Date | null;
}

export type TransitionResult =
  | { ok: true; noop?: boolean }
  | { ok: false; code: 'CARD_ARCHIVED' | 'INVALID_TRANSITION'; message: string };

const ARCHIVED: TransitionResult = {
  ok: false,
  code: 'CARD_ARCHIVED',
  message: 'Bu kart arşivlenmiş; üzerinde işlem yapılamaz.',
};

function invalid(message: string): TransitionResult {
  return { ok: false, code: 'INVALID_TRANSITION', message };
}

/** Admin PATCH (blokla / blok kaldır) için geçiş kontrolü. */
export function checkStatusChange(card: CardState, to: CardStatus): TransitionResult {
  if (card.archivedAt) return ARCHIVED;
  const from = card.status;
  if (from === to) {
    // BLOCKED → BLOCKED: blok gerekçesi güncellenebilir; diğerleri etkisiz.
    return { ok: true, noop: to !== 'BLOCKED' };
  }
  if (to === 'BLOCKED') return { ok: true };
  if (from === 'BLOCKED') {
    if (to === 'ACTIVATED' && !card.customerId) {
      return invalid('Kart hiçbir müşteriye bağlı değil; bloğu kaldırınca "Kullanılmamış" durumuna döner.');
    }
    if (to === 'UNUSED' && card.customerId) {
      return invalid('Kart bir müşteriye bağlı; bloğu kaldırınca "Aktif" durumuna döner. Müşteriden ayırmak için önce bloğu kaldırıp "Müşteriden kaldır" kullanın.');
    }
    return { ok: true };
  }
  if (from === 'UNUSED' && to === 'ACTIVATED') {
    return invalid('Kullanılmamış kart durum değişikliğiyle aktive edilemez; "Müşteriye ata" kullanın.');
  }
  if (from === 'ACTIVATED' && to === 'UNUSED') {
    return invalid('Aktif kart durum değişikliğiyle sıfırlanamaz; "Müşteriden kaldır" kullanın.');
  }
  return invalid('Bu durum geçişine izin verilmiyor.');
}

/** Müşteriden kaldır: YALNIZ ACTIVATED ve müşteriye bağlı kart. */
export function checkUnassign(card: CardState): TransitionResult {
  if (card.archivedAt) return ARCHIVED;
  if (!card.customerId) return invalid('Bu kart zaten bir müşteriye atanmamış.');
  if (card.status === 'BLOCKED') {
    return invalid('Bloklu kart müşteriden kaldırılamaz: bu işlem bloğu kaldırıp kartı yeniden aktive edilebilir yapardı. Önce bloğu kaldırın.');
  }
  if (card.status !== 'ACTIVATED') return invalid('Yalnız aktif kart müşteriden kaldırılabilir.');
  return { ok: true };
}

/** Müşteriye ata: YALNIZ UNUSED ve bağsız kart. */
export function checkAssign(card: CardState): TransitionResult {
  if (card.archivedAt) return ARCHIVED;
  if (card.customerId) return invalid('Bu kart zaten bir müşteriye atanmış.');
  if (card.status !== 'UNUSED') return invalid('Sadece aktive edilmemiş kartlar atanabilir.');
  return { ok: true };
}

/** Durum değişikliği için yazılacak alanlar (blok alanlarının tutarlılığı). */
export function statusChangeData(from: CardStatus, to: CardStatus, blockReason?: string | null) {
  if (to === 'BLOCKED') {
    return { status: to, blockedAt: new Date(), blockReason: blockReason?.trim() || 'Admin tarafından bloklandı' };
  }
  if (from === 'BLOCKED') {
    return { status: to, blockedAt: null, blockReason: null };
  }
  return { status: to };
}

export const CARD_ARCHIVE_BLOCK_REASON = 'Kart arşivlendi';
