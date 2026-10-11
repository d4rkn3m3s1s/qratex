/** Spam Kırıcı arayüz metinleri (TR/EN); uygulama dilini izler. */
import { useLocaleSafe } from '@/lib/app-locale';
import type { EndCause } from './sim';

export interface BreakerCanvasTexts {
  wide: string;
  life: string;
  threshold: string;
  level: (lvl: number, total: number) => string;
  launchHint: (coarse: boolean, sec: number) => string;
  cleared: string;
}

const canvasTr: BreakerCanvasTexts = {
  wide: 'Geniş kalkan!',
  life: '+1 can',
  threshold: 'Ödül eşiği geçildi!',
  level: (lvl, total) => `Seviye ${lvl} / ${total}`,
  launchHint: (coarse, sec) => `${coarse ? 'Dokunup bırak' : 'Boşluk / tıkla'}: fırlat · ${sec}`,
  cleared: 'Seviye temizlendi!',
};
const canvasEn: BreakerCanvasTexts = {
  wide: 'Wide shield!',
  life: '+1 life',
  threshold: 'Reward threshold reached!',
  level: (lvl, total) => `Level ${lvl} / ${total}`,
  launchHint: (coarse, sec) => `${coarse ? 'Tap and release' : 'Space / click'}: launch · ${sec}`,
  cleared: 'Level cleared!',
};
export const BREAKER_CANVAS_TEXTS_TR = canvasTr;

const tr = {
  canvas: canvasTr,
  end: { clear: 'Tüm seviyeler temizlendi', lives: 'Canların bitti', time: 'Süre doldu' } as Record<EndCause, string>,
  hits: (n: number) => `${n} isabet.`,
  capsule: (wide: boolean) => (wide ? 'Geniş kalkan kapsülü düşüyor.' : 'Can kapsülü düşüyor.'),
  caught: (wide: boolean) => (wide ? 'Kalkan 10 saniye genişledi.' : 'Bir can kazandın.'),
  thresholdAnnounce: (n: number) => `Ödül eşiği ${n} geçildi. Artık top kaçsa da skorun sayılır.`,
  lose: (lives: number) => (lives > 0 ? `Top kaçtı. ${lives} can kaldı.` : 'Son can gitti.'),
  levelAnnounce: (lvl: number, total: number) => `Seviye temizlendi. Sıradaki: ${lvl} / ${total}; top hızlanıyor.`,
  endAnnounce: (head: string, score: number, stars: number) => `${head}. Skor ${score}. ${stars} yıldız.`,
  shareWon: (levels: number, score: number) => `Qratex Spam Kırıcı'da ${levels} seviyenin hepsini temizledim: ${score} isabet!`,
  shareLost: (level: number, score: number) =>
    `Qratex Spam Kırıcı'da ${level}. seviyede ${score} isabet yaptım. Sen geçebilir misin?`,
  shareTitle: 'Spam Kırıcı',
  hudSummary: (lvl: number, total: number, bricks: number, lives: number, score: number, threshold: number) =>
    `Seviye ${lvl} / ${total}, ${bricks} tuğla kaldı, ${lives} can. Skor ${score}, ödül eşiği ${threshold}.`,
  level: 'Seviye',
  score: 'Skor',
  lives: (n: number) => `${n} can`,
  wideShield: 'Geniş kalkan',
  passedHint: 'Eşik geçildi — top kaçsa da skorun sayılır. Devam et, rekoru büyüt.',
  safeHint: (n: number) => `${n} isabetten sonra top kaçsa da ödül hakkın kalır.`,
  rules:
    'Sol ve sağ ok ya da A ve D ile kalkanı sür, Boşluk ile topu fırlat. Dokunmatikte oyun alanında parmağını kaydır, dokunup bırakınca top fırlar. Esc duraklatır.',
  arena: 'Spam Kırıcı oyun alanı',
  paddleTitle: 'Kalkanı kaydır, topu sektir.',
  paddleBody: ' Topun kalkanın neresine çarptığı açısını belirler: kenar = yatık, orta = dik.',
  spamTitle: 'Spam tuğlası',
  spamMid: ' (turuncu, @) tek vuruşta, ',
  botTitle: 'bot tuğlası',
  botBody: (levels: number) => ` (mavi, iki gözlü) iki vuruşta kırılır. Her vuruş 1 skor; ${levels} seviye, top her seviyede hızlanır.`,
  capsuleTitle: 'Kapsülleri yakala:',
  capsuleBody: ' sarı ↔ kalkanı 10 sn genişletir, pembe + bir can verir. 3 canla başlarsın.',
  thresholdTitle: (n: number) => `Ödül eşiği ${n}.`,
  thresholdBody: ' Eşiği geçtikten sonra top kaçsa bile skorun sayılır.',
  touchKeys: 'Oyun alanında parmağını kaydır ya da alttaki düğmeleri kullan; dokunup bırakınca top fırlar.',
  keys: '← / → ya da A / D · Boşluk: fırlat · fare ile de sürebilirsin · Esc: duraklat',
  statLevel: 'Seviye',
  statTime: 'Süre',
  passedRanked: 'Ödül eşiğini geçtin — sunucu oyunu yeniden oynatıp doğruladıktan sonra ödül hesaplanır.',
  remaining: (threshold: number, left: number) => `Ödül eşiği ${threshold}; ${left} isabet kaldı.`,
  controls: 'Kalkan kontrolleri',
  moveLeft: 'Kalkanı sola sür',
  moveRight: 'Kalkanı sağa sür',
  launch: 'Topu fırlat',
};
type Copy = typeof tr;
const en: Copy = {
  canvas: canvasEn,
  end: { clear: 'All levels cleared', lives: 'Out of lives', time: 'Time’s up' },
  hits: (n) => `${n} hits.`,
  capsule: (wide) => (wide ? 'A wide-shield capsule is falling.' : 'A life capsule is falling.'),
  caught: (wide) => (wide ? 'Shield widened for 10 seconds.' : 'You gained a life.'),
  thresholdAnnounce: (n) => `Reward threshold ${n} reached. Your score counts even if the ball gets away now.`,
  lose: (lives) => (lives > 0 ? `The ball got away. ${lives} ${lives === 1 ? 'life' : 'lives'} left.` : 'Last life lost.'),
  levelAnnounce: (lvl, total) => `Level cleared. Next: ${lvl} / ${total}; the ball speeds up.`,
  endAnnounce: (head, score, stars) => `${head}. Score ${score}. ${stars} stars.`,
  shareWon: (levels, score) => `I cleared all ${levels} levels of Qratex Spam Breaker: ${score} hits!`,
  shareLost: (level, score) => `I landed ${score} hits on level ${level} of Qratex Spam Breaker. Can you beat it?`,
  shareTitle: 'Spam Breaker',
  hudSummary: (lvl, total, bricks, lives, score, threshold) =>
    `Level ${lvl} / ${total}, ${bricks} bricks left, ${lives} lives. Score ${score}, reward threshold ${threshold}.`,
  level: 'Level',
  score: 'Score',
  lives: (n) => `${n} ${n === 1 ? 'life' : 'lives'}`,
  wideShield: 'Wide shield',
  passedHint: 'Threshold reached: your score counts even if the ball gets away. Keep going for a record.',
  safeHint: (n) => `After ${n} hits, you keep your reward even if the ball gets away.`,
  rules:
    'Move the shield with the left and right arrows or A and D; launch the ball with Space. On touch, slide your finger in the game area; tap and release to launch. Esc pauses.',
  arena: 'Spam Breaker game area',
  paddleTitle: 'Slide the shield, bounce the ball.',
  paddleBody: ' Where the ball hits the shield sets its angle: edge = shallow, center = steep.',
  spamTitle: 'Spam bricks',
  spamMid: ' (orange, @) break in one hit, ',
  botTitle: 'bot bricks',
  botBody: (levels) => ` (blue, two eyes) take two. Each hit is 1 point; ${levels} levels, and the ball speeds up every level.`,
  capsuleTitle: 'Catch capsules:',
  capsuleBody: ' yellow ↔ widens the shield for 10s, pink + gives a life. You start with 3 lives.',
  thresholdTitle: (n) => `Reward threshold ${n}.`,
  thresholdBody: ' Once you pass it, your score counts even if the ball gets away.',
  touchKeys: 'Slide your finger in the game area or use the buttons below; tap and release to launch.',
  keys: '← / → or A / D · Space: launch · you can steer with the mouse too · Esc: pause',
  statLevel: 'Level',
  statTime: 'Time',
  passedRanked: 'You passed the reward threshold. The reward is calculated after the server replays and verifies your game.',
  remaining: (threshold, left) => `Reward threshold ${threshold}; ${left} hits to go.`,
  controls: 'Shield controls',
  moveLeft: 'Move shield left',
  moveRight: 'Move shield right',
  launch: 'Launch the ball',
};
export function useSpamBreakerCopy(): Copy {
  return useLocaleSafe() === 'en' ? en : tr;
}
