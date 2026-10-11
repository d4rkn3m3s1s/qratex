/** Veri Yılanı arayüz metinleri (TR/EN); uygulama dilini izler. */
import { useLocaleSafe } from '@/lib/app-locale';
import type { DeathCause } from './sim';

export interface SnakeCanvasTexts {
  ready: string;
  pickDirection: string;
  level: (n: number) => string;
  botsOut: string;
  newWalls: string;
}

const canvasTr: SnakeCanvasTexts = {
  ready: 'Hazır ol',
  pickDirection: 'Yön seçebilirsin',
  level: (n) => `Seviye ${n}`,
  botsOut: 'Devriye botları sahada — yollarına girme',
  newWalls: 'Yeni bot duvarları belirdi',
};
const canvasEn: SnakeCanvasTexts = {
  ready: 'Get ready',
  pickDirection: 'Pick a direction',
  level: (n) => `Level ${n}`,
  botsOut: 'Patrol bots are out: stay off their paths',
  newWalls: 'New bot walls appeared',
};
export const SNAKE_CANVAS_TEXTS_TR = canvasTr;

const tr = {
  canvas: canvasTr,
  death: {
    edge: 'Kenara çarptın',
    wall: 'Bot duvarına çarptın',
    bot: 'Devriye botuna çarptın',
    self: 'Kendi kuyruğuna çarptın',
  } as Record<DeathCause, string>,
  packets: (n: number) => `${n} paket.`,
  thresholdAnnounce: (n: number) => `Ödül eşiği ${n} geçildi. Artık çarpsan da skorun sayılır.`,
  levelAnnounce: (lvl: number, total: number, bots: boolean) =>
    `Seviye ${lvl} / ${total}. ${bots ? 'Devriye botları sahada.' : 'Yeni bot duvarları belirdi.'}`,
  allLevels: 'Tüm seviyeler tamamlandı',
  endAnnounce: (head: string, score: number, stars: number) => `${head}. Skor ${score}. ${stars} yıldız.`,
  shareWon: (levels: number, score: number, stars: number) =>
    `Qratex Veri Yılanı'nda ${levels} seviyenin hepsini bitirdim: ${score} paket, ${stars} yıldız!`,
  shareLost: (level: number, score: number) =>
    `Qratex Veri Yılanı'nda ${level}. seviyede ${score} paket topladım. Sen geçebilir misin?`,
  shareTitle: 'Veri Yılanı',
  hudSummary: (lvl: number, total: number, eaten: number, per: number, score: number, threshold: number) =>
    `Seviye ${lvl} / ${total}, bu seviyede ${eaten} / ${per} paket. Skor ${score}, ödül eşiği ${threshold}.`,
  level: 'Seviye',
  score: 'Skor',
  passedHint: 'Eşik geçildi — çarpsan da skorun sayılır. 30 = tam tur.',
  safeHint: (n: number) => `${n} paketten sonra çarpsan da ödül hakkın kalır.`,
  rules: 'Ok tuşları ya da WASD ile yön ver, dokunmatikte kaydır ya da yön düğmelerini kullan. Esc duraklatır.',
  arena: 'Veri Yılanı oyun alanı',
  eatTitle: 'Sarı veri paketlerini yut.',
  eatBody: (levels: number, total: number) => ` Her paket 1 skor; her 6 pakette seviye atlarsın (${levels} seviye, toplam ${total}).`,
  wallTitle: 'Bot duvarlarından kaç.',
  wallBody: ' Çapraz taralı turuncu kareler 2. seviyede belirir; kenara ve kendi kuyruğuna da çarpma.',
  botTitle: 'Devriye botları',
  botBody: ' 4. seviyeden itibaren soluk yollarında gidip gelir. Hız her seviyede artar.',
  thresholdTitle: (n: number) => `Ödül eşiği ${n}.`,
  thresholdBody: ' Eşiği geçtikten sonra çarpsan bile skorun sayılır.',
  touchKeys: 'Kaydır ya da alttaki yön düğmelerini kullan.',
  keys: 'Ok tuşları / WASD · Esc duraklat',
  won: 'Tam tur! Tüm seviyeler bitti',
  statLevel: 'Seviye',
  statLength: 'Uzunluk',
  passedRanked: 'Ödül eşiğini geçtin — sunucu oyunu yeniden oynatıp doğruladıktan sonra ödül hesaplanır.',
  remaining: (threshold: number, left: number) => `Ödül eşiği ${threshold}; ${left} paket kaldı.`,
};
type Copy = typeof tr;
const en: Copy = {
  canvas: canvasEn,
  death: {
    edge: 'You hit the edge',
    wall: 'You hit a bot wall',
    bot: 'You hit a patrol bot',
    self: 'You hit your own tail',
  },
  packets: (n) => `${n} packets.`,
  thresholdAnnounce: (n) => `Reward threshold ${n} reached. Your score counts even if you crash now.`,
  levelAnnounce: (lvl, total, bots) => `Level ${lvl} / ${total}. ${bots ? 'Patrol bots are out.' : 'New bot walls appeared.'}`,
  allLevels: 'All levels complete',
  endAnnounce: (head, score, stars) => `${head}. Score ${score}. ${stars} stars.`,
  shareWon: (levels, score, stars) => `I finished all ${levels} levels of Qratex Data Snake: ${score} packets, ${stars} stars!`,
  shareLost: (level, score) => `I collected ${score} packets on level ${level} of Qratex Data Snake. Can you beat it?`,
  shareTitle: 'Data Snake',
  hudSummary: (lvl, total, eaten, per, score, threshold) =>
    `Level ${lvl} / ${total}, ${eaten} / ${per} packets this level. Score ${score}, reward threshold ${threshold}.`,
  level: 'Level',
  score: 'Score',
  passedHint: 'Threshold reached: your score counts even if you crash. 30 = full run.',
  safeHint: (n) => `After ${n} packets, you keep your reward even if you crash.`,
  rules: 'Steer with the arrow keys or WASD; on touch, swipe or use the direction buttons. Esc pauses.',
  arena: 'Data Snake game area',
  eatTitle: 'Eat the yellow data packets.',
  eatBody: (levels, total) => ` Each packet is 1 point; every 6 packets you level up (${levels} levels, ${total} in total).`,
  wallTitle: 'Avoid bot walls.',
  wallBody: ' Orange cross-hatched squares appear from level 2; don’t hit the edge or your own tail either.',
  botTitle: 'Patrol bots',
  botBody: ' move back and forth along faint paths from level 4. Speed goes up every level.',
  thresholdTitle: (n) => `Reward threshold ${n}.`,
  thresholdBody: ' Once you pass it, your score counts even if you crash.',
  touchKeys: 'Swipe or use the direction buttons below.',
  keys: 'Arrow keys / WASD · Esc pause',
  won: 'Full run! All levels done',
  statLevel: 'Level',
  statLength: 'Length',
  passedRanked: 'You passed the reward threshold. The reward is calculated after the server replays and verifies your game.',
  remaining: (threshold, left) => `Reward threshold ${threshold}; ${left} packets to go.`,
};
export function useDataSnakeCopy(): Copy {
  return useLocaleSafe() === 'en' ? en : tr;
}
