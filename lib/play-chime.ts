/**
 * Web Audio ile kısa bir "ödül" jingle çalar. Ses dosyası gerektirmez (Vercel
 * paket boyutu / asset yok). Sürpriz kutu açılışı gibi kutlama anlarında kullanılır.
 *
 * "Animasyonları azalt" erişilebilirlik tercihi açıksa (html.reduce-animations)
 * ses çalınmaz — hareket/efekt hassasiyetine saygı.
 */
export function playRewardChime(): void {
  if (typeof window === 'undefined') return;
  // Erişilebilirlik: animasyon azaltma açıksa sesi de çalma.
  if (document.documentElement.classList.contains('reduce-animations')) return;

  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    // Yükselen üç nota (C5 → E5 → G5) — neşeli, kısa kutlama.
    const notes = [523.25, 659.25, 783.99];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      const end = start + 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });

    // Kaynakları serbest bırak.
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 700);
  } catch {
    /* ses kullanılamıyorsa sessizce geç */
  }
}
