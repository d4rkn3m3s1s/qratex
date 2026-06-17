/**
 * Qratex 2.0 Kutlama Motoru
 * Başarı anlarında (QR tarama, Level atlama, Ödül kazanma) kullanılır.
 *
 * canvas-confetti yalnızca bir efekt gerçekten tetiklendiğinde lazy yüklenir;
 * önceden top-level import edildiği için müşteri dashboard'u gibi bu helper'ı
 * çeken her sayfanın ilk bundle'ına giriyordu.
 */
import type confettiNs from 'canvas-confetti';
type ConfettiFn = typeof confettiNs;

let confettiPromise: Promise<ConfettiFn> | null = null;
function loadConfetti(): Promise<ConfettiFn> {
  if (!confettiPromise) {
    confettiPromise = import('canvas-confetti').then((m) => m.default);
  }
  return confettiPromise;
}

export const triggerConfetti = () => {
  void loadConfetti().then((confetti) => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: ReturnType<typeof setInterval> = setInterval(function () {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#9333ea', '#c084fc', '#f472b6'],
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#3b82f6', '#60a5fa', '#22d3ee'],
      });
    }, 250);
  });
};

/**
 * Daha sade, tek seferlik patlama (Buton tıklamaları vb için)
 */
export const triggerSuccessBurst = () => {
  void loadConfetti().then((confetti) => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#9333ea', '#3b82f6', '#22d3ee'],
      zIndex: 9999,
    });
  });
};

/**
 * Sayfa üstünden yağan ödül efekti
 */
export const triggerRewardShower = () => {
  void loadConfetti().then((confetti) => {
    const end = Date.now() + 2 * 1000;
    (function frame() {
      confetti({
        particleCount: 2, angle: 60, spread: 55, origin: { x: 0 },
        colors: ['#fbbf24', '#f59e0b', '#facc15'],
      });
      confetti({
        particleCount: 2, angle: 120, spread: 55, origin: { x: 1 },
        colors: ['#fbbf24', '#f59e0b', '#facc15'],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    }());
  });
};
