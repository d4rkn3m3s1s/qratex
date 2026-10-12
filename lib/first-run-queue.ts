'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * İlk açılış sırası (mobil-erisilebilirlik-i18n B6) — birbirinden habersiz açılan katmanların
 * ("modal fırtınası") tek sırası. Eskiden müşterinin ilk girişinde karşılama videosu (tam ekran),
 * tanıtım alt sayfası ve doğum günü diyaloğu AYNI ANDA açılıyordu; odak ve ekran okuyucu
 * duyuruları birbirini eziyordu.
 *
 * Kural: kayıtlı katmanlar `FIRST_RUN_ORDER` sırasıyla açılır. Bir katman ancak kendinden ÖNCEKİ
 * her kayıtlı katman "istemiyorum" dedikten ya da kapandıktan sonra açılabilir. Karar vermemiş
 * (ör. video dosyasını yoklayan) katman, arkasındakileri bekletir.
 */
export const FIRST_RUN_ORDER = ['welcome-video', 'onboarding', 'birthday'] as const;
export type FirstRunId = (typeof FIRST_RUN_ORDER)[number];

/** pending: karar yok · want: açılmak istiyor · skip: istemiyor · done: gösterildi ve kapandı. */
type SlotState = 'pending' | 'want' | 'skip' | 'done';

const slots = new Map<FirstRunId, SlotState>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saf karar (jest): `id` şu an açılabilir mi? */
export function canShowFirstRun(id: FirstRunId, state: ReadonlyMap<FirstRunId, SlotState>): boolean {
  if (state.get(id) !== 'want') return false;
  for (const other of FIRST_RUN_ORDER) {
    if (other === id) return true;
    const s = state.get(other);
    if (s === 'pending' || s === 'want') return false;
  }
  return true;
}

/**
 * Katmanın sırası. `wants`: null = henüz karar yok (yokluyor), true = açılmak istiyor,
 * false = istemiyor. Dönen `granted` true olunca katman açılır; kapanınca `finish()` çağrılır.
 */
export function useFirstRunTurn(id: FirstRunId, wants: boolean | null): { granted: boolean; finish: () => void } {
  useEffect(() => {
    if (!slots.has(id)) {
      slots.set(id, 'pending');
      emit();
    }
    return () => {
      // Katman söküldü (rota değişti): arkasındakileri bekletmesin.
      slots.delete(id);
      emit();
    };
  }, [id]);

  useEffect(() => {
    const current = slots.get(id);
    if (current === 'done') return;
    const next: SlotState = wants === null ? 'pending' : wants ? 'want' : 'skip';
    if (current !== next) {
      slots.set(id, next);
      emit();
    }
  }, [id, wants]);

  useSyncExternalStore(subscribe, () => version, () => 0);
  const granted = canShowFirstRun(id, slots);

  const finish = () => {
    if (slots.get(id) !== 'done') {
      slots.set(id, 'done');
      emit();
    }
  };
  return { granted, finish };
}

/**
 * Bir ilk-açılış katmanı şu an açık mı ya da açılmak üzere mi? Kayıtsız katmanlar (çerez bandı
 * gibi kalıcı-ama-modal-olmayan bildirimler) bununla sıraya girer: video/tanıtım/doğum günü
 * akışı bitene kadar geri çekilir, sonra kendi sırası gelir — ilk girişte üç katman üst üste
 * açılmaz. Yalnız 'want' sayılır: henüz karar vermemiş (yoklayan) katman bandı gizlemez.
 */
export function isFirstRunBusy(state: ReadonlyMap<FirstRunId, SlotState>): boolean {
  for (const s of state.values()) if (s === 'want') return true;
  return false;
}

export function useFirstRunBusy(): boolean {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return isFirstRunBusy(slots);
}
