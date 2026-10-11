/** Yıldız Avı arayüz metinleri (TR/EN); uygulama dilini izler. Labirent adları içeriktir, Türkçe kalır. */
import { useLocaleSafe } from '@/lib/app-locale';

export interface StarCanvasTexts {
  caught: (chain: number) => string;
  ready: (level: number, maze: string) => string;
  readySub: string;
  clear: (level: number) => string;
  nextMaze: string;
  allDone: string;
  caughtBanner: string;
  livesLeft: (n: number) => string;
  noLives: string;
}

const canvasTr: StarCanvasTexts = {
  caught: (chain) => (chain > 1 ? `Yakalandı ×${chain}` : 'Yakalandı!'),
  ready: (level, maze) => `Seviye ${level} · ${maze}`,
  readySub: 'Hazır ol — yön ver',
  clear: (level) => `Seviye ${level} temiz!`,
  nextMaze: 'Sıradaki labirent geliyor',
  allDone: 'Tüm seviyeler bitti',
  caughtBanner: 'Yakalandın!',
  livesLeft: (n) => `${n} can kaldı`,
  noLives: 'Canın bitti',
};
const canvasEn: StarCanvasTexts = {
  caught: (chain) => (chain > 1 ? `Caught ×${chain}` : 'Caught!'),
  ready: (level, maze) => `Level ${level} · ${maze}`,
  readySub: 'Get ready: pick a direction',
  clear: (level) => `Level ${level} clear!`,
  nextMaze: 'Next maze coming up',
  allDone: 'All levels done',
  caughtBanner: 'You got caught!',
  livesLeft: (n) => `${n} ${n === 1 ? 'life' : 'lives'} left`,
  noLives: 'Out of lives',
};
export const STAR_CANVAS_TEXTS_TR = canvasTr;

const tr = {
  canvas: canvasTr,
  star: (lvl: number, per: number, total: number) => `Yıldız: seviyede ${lvl} / ${per}, toplam ${total}.`,
  pellet: 'Güç kapsülü! Hayaletler kısa süre korkuyor, onları yakalayabilirsin.',
  powerWarn: 'Güç bitmek üzere.',
  caught: (lives: number) => (lives > 0 ? `Yakalandın. ${lives} can kaldı.` : 'Yakalandın. Canın bitti.'),
  cleared: (lvl: number) => `Seviye ${lvl} temizlendi.`,
  levelStart: (lvl: number, total: number) => `Seviye ${lvl} / ${total} başlıyor.`,
  thresholdAnnounce: 'Ödül eşiği geçildi.',
  endAnnounce: (won: boolean, level: number, score: number, trophies: number) =>
    `${won ? 'Tüm seviyeler tamamlandı' : `Oyun bitti, seviye ${level}`}. ${score} yıldız. ${trophies} kupa.`,
  shareWon: (levels: number, score: number) => `Qratex Yıldız Avı'nda ${levels} labirentin hepsini bitirdim: ${score} yıldız!`,
  shareLost: (level: number, score: number) =>
    `Qratex Yıldız Avı'nda ${level}. seviyeye kadar gittim: ${score} yıldız. Sen geçebilir misin?`,
  shareTitle: 'Yıldız Avı',
  hudSummary: (lvl: number, total: number, ls: number, per: number, score: number, threshold: number, lives: number) =>
    `Seviye ${lvl} / ${total}. Bu seviyede ${ls} / ${per} yıldız, toplam ${score}, ödül eşiği ${threshold}. ${lives} can.`,
  level: 'Seviye',
  levelStars: (n: number) => `Bu seviyede ${n} yıldız`,
  total: 'Toplam',
  power: (n: number) => `Güç ${n} sn`,
  rules:
    'Ok tuşları ya da W, A, S, D ile yön ver; Esc duraklatır. Turuncu beş köşeli yıldızları topla, hayaletlere değme. Mavi halka güç kapsülüdür: alınca hayaletler kısa süre korkar ve yakalanabilir.',
  arena: 'Yıldız Avı labirenti',
  starTitle: '5 yıldızı topla, seviyeyi geç.',
  starBody: (levels: number, threshold: number) => ` ${levels} labirent var; her biri biraz daha zor. İlk ${threshold} yıldız ödül eşiği.`,
  ghostTitle: 'Hayaletlere değme.',
  ghostBody: (lives: number) =>
    ` ${lives} canın var; her hayaletin kendi biçimi ve huyu var (kovalayan, önünü kesen, gezinen, çekingen).`,
  powerTitle: 'Mavi halka = güç.',
  powerBody: ' Alınca hayaletler solup kesik kenarlı olur; o sürede onları yakalayıp eve gönderebilirsin.',
  touchKeys: 'Kaydır ya da alttaki yön tuşlarını kullan.',
  keys: 'Klavye: ok tuşları / WASD · Esc duraklat',
  won: 'Tüm labirentler bitti!',
  lost: (lvl: number) => `Oyun bitti — seviye ${lvl}`,
  trophies: (n: number) => `3 kupadan ${n}`,
  ofMax: (max: number) => ` / ${max} yıldız`,
  statLevel: 'Seviye',
  statCaught: 'Yakalanan',
  statTime: 'Süre',
  seconds: (n: number) => `${n} sn`,
  passedRanked: 'Ödül eşiğini geçtin — oyun sunucuda yeniden oynatılıp doğrulandıktan sonra ödül hesaplanır.',
  remaining: (threshold: number, left: number) => `Ödül eşiği ${threshold} yıldız; ${left} yıldız kaldı.`,
  dpad: 'Yön tuşları',
  footRanked: 'Sıralı: oyun sunucuda yeniden oynatılarak doğrulanır.',
};
type Copy = typeof tr;
const en: Copy = {
  canvas: canvasEn,
  star: (lvl, per, total) => `Star: ${lvl} / ${per} this level, ${total} total.`,
  pellet: 'Power capsule! The ghosts are scared for a moment, so you can catch them.',
  powerWarn: 'Power is about to run out.',
  caught: (lives) => (lives > 0 ? `Caught. ${lives} ${lives === 1 ? 'life' : 'lives'} left.` : 'Caught. You’re out of lives.'),
  cleared: (lvl) => `Level ${lvl} cleared.`,
  levelStart: (lvl, total) => `Level ${lvl} / ${total} starting.`,
  thresholdAnnounce: 'Reward threshold reached.',
  endAnnounce: (won, level, score, trophies) =>
    `${won ? 'All levels complete' : `Game over on level ${level}`}. ${score} stars. ${trophies} trophies.`,
  shareWon: (levels, score) => `I finished all ${levels} mazes in Qratex Star Hunt: ${score} stars!`,
  shareLost: (level, score) => `I made it to level ${level} in Qratex Star Hunt: ${score} stars. Can you beat it?`,
  shareTitle: 'Star Hunt',
  hudSummary: (lvl, total, ls, per, score, threshold, lives) =>
    `Level ${lvl} / ${total}. ${ls} / ${per} stars this level, ${score} total, reward threshold ${threshold}. ${lives} lives.`,
  level: 'Level',
  levelStars: (n) => `${n} stars this level`,
  total: 'Total',
  power: (n) => `Power ${n}s`,
  rules:
    'Steer with the arrow keys or W, A, S, D; Esc pauses. Collect the orange five-pointed stars and don’t touch the ghosts. The blue ring is a power capsule: grab it and the ghosts get scared for a moment, so you can catch them.',
  arena: 'Star Hunt maze',
  starTitle: 'Collect 5 stars to clear the level.',
  starBody: (levels, threshold) => ` There are ${levels} mazes, each a bit harder. The first ${threshold} stars are the reward threshold.`,
  ghostTitle: 'Don’t touch the ghosts.',
  ghostBody: (lives) => ` You have ${lives} lives; each ghost has its own shape and habit (chaser, ambusher, wanderer, shy one).`,
  powerTitle: 'Blue ring = power.',
  powerBody: ' Grab it and the ghosts fade with jagged edges; while that lasts, you can catch them and send them home.',
  touchKeys: 'Swipe or use the direction buttons below.',
  keys: 'Keyboard: arrow keys / WASD · Esc pause',
  won: 'All mazes done!',
  lost: (lvl) => `Game over on level ${lvl}`,
  trophies: (n) => `${n} of 3 trophies`,
  ofMax: (max) => ` / ${max} stars`,
  statLevel: 'Level',
  statCaught: 'Ghosts caught',
  statTime: 'Time',
  seconds: (n) => `${n}s`,
  passedRanked: 'You passed the reward threshold. The reward is calculated after the server replays and verifies your game.',
  remaining: (threshold, left) => `Reward threshold ${threshold} stars; ${left} to go.`,
  dpad: 'Direction buttons',
  footRanked: 'Ranked: your game is verified by replaying it on the server.',
};
export function useStarHuntCopy(): Copy {
  return useLocaleSafe() === 'en' ? en : tr;
}
