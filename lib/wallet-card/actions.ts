/**
 * Müşterinin kendi kartı üzerindeki işlemler (saf karar; jest ile test edilir).
 *
 *  - `freeze`   : ACTIVATED → BLOCKED (gerekçe `CUSTOMER_FREEZE_REASON`). Kasada kullanılamaz.
 *  - `unfreeze` : yalnız MÜŞTERİNİN dondurduğu kart → ACTIVATED. Admin bloğu müşteri tarafından
 *                 kaldırılamaz (çalıntı/sahte kullanım kararını yönetici verir).
 *  - `rotate`   : "Kartımı kaybettim" — yeni kod üretilir; eski (basılı) QR artık hiçbir kasada
 *                 çalışmaz, uygulamadaki kart yeni kodla devam eder. Aktif ya da müşterinin
 *                 dondurduğu kartta yapılır; sonunda kart ACTIVATED olur (kayıp kod zararsız).
 *
 * Arşivli kart terminaldir (lib/cards/lifecycle.ts). Puan/ekonomi etkisi YOK: hiçbir işlem
 * puan basmaz ya da tüketim silmez; tüketimler `cardId` ile bağlı kalır.
 */
import { CUSTOMER_FREEZE_REASON } from './dto';

export type CardAction = 'freeze' | 'unfreeze' | 'rotate';

export interface OwnedCardState {
  customerId: string | null;
  status: string;
  blockReason: string | null;
  archivedAt: Date | null;
}

export type CardActionDecision =
  | {
      ok: true;
      data: { status: 'ACTIVATED' | 'BLOCKED'; blockedAt: Date | null; blockReason: string | null; rotate: boolean };
      audit: 'BLOCKED' | 'UNBLOCKED' | 'TOKEN_ROTATED';
    }
  | { ok: false; status: 403 | 404 | 409; code: string; message: string };

export function decideCardAction(card: OwnedCardState | null, userId: string, action: CardAction, now: Date): CardActionDecision {
  if (!card || card.customerId !== userId) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Kart bulunamadı.' };
  }
  if (card.archivedAt) {
    return { ok: false, status: 409, code: 'CARD_ARCHIVED', message: 'Bu kart arşivlenmiş; üzerinde işlem yapılamaz.' };
  }
  const frozenByCustomer = card.status === 'BLOCKED' && card.blockReason === CUSTOMER_FREEZE_REASON;
  const adminBlocked = card.status === 'BLOCKED' && !frozenByCustomer;
  if (adminBlocked) {
    return {
      ok: false,
      status: 403,
      code: 'CARD_BLOCKED_BY_ADMIN',
      message: 'Bu kart yönetim tarafından engellendi. Destek ekibiyle iletişime geç.',
    };
  }

  switch (action) {
    case 'freeze':
      if (frozenByCustomer) return { ok: false, status: 409, code: 'ALREADY_FROZEN', message: 'Kart zaten dondurulmuş.' };
      if (card.status !== 'ACTIVATED') {
        return { ok: false, status: 409, code: 'INVALID_TRANSITION', message: 'Yalnız aktif kart dondurulabilir.' };
      }
      return {
        ok: true,
        data: { status: 'BLOCKED', blockedAt: now, blockReason: CUSTOMER_FREEZE_REASON, rotate: false },
        audit: 'BLOCKED',
      };
    case 'unfreeze':
      if (!frozenByCustomer) return { ok: false, status: 409, code: 'NOT_FROZEN', message: 'Kart dondurulmuş değil.' };
      return {
        ok: true,
        data: { status: 'ACTIVATED', blockedAt: null, blockReason: null, rotate: false },
        audit: 'UNBLOCKED',
      };
    case 'rotate':
      if (card.status !== 'ACTIVATED' && !frozenByCustomer) {
        return { ok: false, status: 409, code: 'INVALID_TRANSITION', message: 'Yalnız aktif ya da dondurduğun kartın kodu yenilenebilir.' };
      }
      return {
        ok: true,
        data: { status: 'ACTIVATED', blockedAt: null, blockReason: null, rotate: true },
        audit: 'TOKEN_ROTATED',
      };
    default:
      return { ok: false, status: 409, code: 'INVALID_TRANSITION', message: 'Bu işlem desteklenmiyor.' };
  }
}
