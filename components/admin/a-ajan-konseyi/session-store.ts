'use client';

import type { DealerOption } from '@/lib/council/contract';

/**
 * Sekme içi bellek (sayfa yenilemesinde kaybolması İSTENEN durumlar):
 *  - autoRun: yalnız bu sekmede az önce başlatılan oturum kendiliğinden ilerler. Geçmişten açılan
 *    süren bir oturum, operatör "Devam et" demeden LLM harcamaz.
 *  - composer prefill: "Aynı soruyla yeni oturum" formu doldurur (soru URL'ye/loglara yazılmaz).
 */
const autoRun = new Set<string>();

export function requestAutoRun(id: string) {
  autoRun.add(id);
}
export function autoRunRequested(id: string): boolean {
  return autoRun.has(id);
}
export function clearAutoRun(id: string) {
  autoRun.delete(id);
}

export type ComposerPrefill = {
  topic: string;
  scope: { kind: 'platform' } | { kind: 'dealer'; dealer: DealerOption };
};

let prefill: ComposerPrefill | null = null;

export function setComposerPrefill(p: ComposerPrefill) {
  prefill = p;
}
export function takeComposerPrefill(): ComposerPrefill | null {
  const p = prefill;
  prefill = null;
  return p;
}
