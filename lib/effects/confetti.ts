/**
 * Qratex kutlama yardımcıları — geriye uyumlu ince sarmalayıcı.
 *
 * Asıl uygulama An Motoru'nun TEK efekt cephesindedir (`lib/moments/effects.ts`):
 * canvas-confetti orada lazy yüklenir ve azaltılmış hareket (OS `prefers-reduced-motion`
 * VEYA `html.reduce-animations`) açıkken HİÇBİR efekt çalmaz. Bu dosya yalnız eski
 * çağıranların import yolunu korur; yeni kod doğrudan `confetti(preset)` kullanmalıdır.
 *
 * Not: Puan/seviye/lig/rozet kazanımı için konfeti ÇALMAYIN — `moments.points()` ve
 * `moments.refresh()` (lib/moments/client.ts) kullanın; kutlamayı An Motoru tek kez oynatır.
 */
import { confetti } from '@/lib/moments/effects';

/** ~3 sn iki yandan çoklu patlama (büyük başarı). */
export const triggerConfetti = (): void => {
  confetti('celebration');
};

/** Daha sade, tek seferlik patlama (buton tıklamaları vb.). */
export const triggerSuccessBurst = (): void => {
  confetti('burst');
};

/** Yanlardan yağan altın ödül efekti (~2 sn). */
export const triggerRewardShower = (): void => {
  confetti('shower');
};
