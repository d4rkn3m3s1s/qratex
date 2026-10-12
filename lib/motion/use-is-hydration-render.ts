'use client';

import { useState, useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * Bu bileşen sunucu HTML'iyle (SSR + hidrasyon) mi kuruldu? İlk render'daki değer sabitlenir.
 *
 * Giriş animasyonları (`initial="hidden"`) SSR çıktısına `opacity:0` yazar; o zaman sayfanın
 * LCP öğesi (başlık, bakiye kartı) JS indirilip hidrate olana kadar GÖRÜNMEZ kalır (ölçülen:
 * mobil LCP 3-4 sn). Kullanım: `initial={useIsHydrationRender() ? false : 'hidden'}` — sunucudan
 * gelen ilk boyama görünür basılır, istemcide sonradan kurulan ağaçta (gezinme, iskelet sonrası
 * veri) animasyon aynen oynar.
 */
export function useIsHydrationRender(): boolean {
  const hydrating = useSyncExternalStore(noopSubscribe, () => false, () => true);
  const [fromServer] = useState(hydrating);
  return fromServer;
}
