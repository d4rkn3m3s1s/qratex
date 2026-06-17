// canvas-confetti lazy yüklenir (top-level import bundle'ı şişiriyordu).
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
    const duration = 3000;
    const end = Date.now() + duration;
    const colors = ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'];
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  });
};

export const triggerSingleConfetti = () => {
  void loadConfetti().then((confetti) => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'],
    });
  });
};
