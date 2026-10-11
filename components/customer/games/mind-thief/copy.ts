/** Zihin Hırsızı arayüz metinleri (TR/EN). Kart metinleri (`texts.ts`) içerik havuzudur, Türkçe kalır. */
import { useLocaleSafe } from '@/lib/app-locale';

const tr = {
  wrong: 'Gerçek yorumdu! −1 can',
  leak: 'Sızdı! −1 can',
  rage: 'PATRON ÖFKELENDİ!',
  hudSummary: (score: number, lives: number, time: number, level: number, rage: boolean) =>
    `Skor ${score}, can ${lives}, kalan ${time} saniye, seviye ${level}${rage ? ', patron öfkeli' : ''}`,
  frozen: (n: number) => `Donuk ${n} sn`,
  double: (n: number) => `Çift puan ${n} sn`,
  rageMode: 'Öfke modu',
  arenaLabel: 'Zihin Hırsızı oyun alanı. Ok tuşlarıyla kart seç, Boşluk ya da Enter ile yok et, Esc ile duraklat.',
  corruptTitle: 'Bozuk yoruma dokun',
  corruptBody: ' ve yok et. Süresi dolarsa ağa sızar: −1 can.',
  genuineTitle: 'Gerçek yoruma dokunma.',
  genuineBody: ' Dokunursan −1 can.',
  powerTitle: 'Sarı güçler:',
  powerBody: ' ❄ kartları 3,5 sn dondurur (sızıntı yok), ×2 6 sn çift puan, ♥ +1 can.',
  rules: 'Her 5 komboda +1 bonus. 45 saniye, 3 seviye; patron her 12 saniyede öfkelenir.',
  keys: 'Klavye: ← → kart seç · Boşluk/Enter yok et · Esc duraklat',
  legend: '✕ Bozuk: yok et · ✓ Gerçek: dokunma · ★ Güç: topla',
};
type Copy = typeof tr;
const en: Copy = {
  wrong: 'That was a real review! −1 life',
  leak: 'It slipped through! −1 life',
  rage: 'THE BOSS IS FURIOUS!',
  hudSummary: (score, lives, time, level, rage) =>
    `Score ${score}, lives ${lives}, ${time} seconds left, level ${level}${rage ? ', boss enraged' : ''}`,
  frozen: (n) => `Frozen ${n}s`,
  double: (n) => `Double points ${n}s`,
  rageMode: 'Rage mode',
  arenaLabel: 'Mind Thief game area. Pick a card with the arrow keys, destroy it with Space or Enter, press Esc to pause.',
  corruptTitle: 'Tap corrupted reviews',
  corruptBody: ' to destroy them. If one times out, it leaks into the network: −1 life.',
  genuineTitle: 'Don’t tap real reviews.',
  genuineBody: ' Tapping one costs 1 life.',
  powerTitle: 'Yellow power-ups:',
  powerBody: ' ❄ freezes cards for 3.5s (no leaks), ×2 doubles points for 6s, ♥ +1 life.',
  rules: '+1 bonus every 5 combo. 45 seconds, 3 levels; the boss gets furious every 12 seconds.',
  keys: 'Keyboard: ← → pick a card · Space/Enter destroy · Esc pause',
  legend: '✕ Corrupted: destroy · ✓ Real: leave it · ★ Power-up: grab',
};
export function useMindThiefCopy(): Copy {
  return useLocaleSafe() === 'en' ? en : tr;
}
