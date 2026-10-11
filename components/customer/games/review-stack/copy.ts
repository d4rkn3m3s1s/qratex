/** Yorum İstifi arayüz metinleri (TR/EN); uygulama dilini izler. */
import { useLocaleSafe } from '@/lib/app-locale';
import type { EndCause, PieceKind } from './sim';

/** Satır onay damgaları (render.ts; indeks = silinen satır sayısı). */
export const CLEAR_LABELS_TR: readonly string[] = ['', 'Onaylandı ✓', 'Çift onay ✓✓', 'Üçlü onay ✓✓✓', 'İSTİF! ✓✓✓✓'];
const CLEAR_LABELS_EN: readonly string[] = ['', 'Approved ✓', 'Double approval ✓✓', 'Triple approval ✓✓✓', 'FULL STACK! ✓✓✓✓'];

const tr = {
  clearLabels: CLEAR_LABELS_TR,
  end: { topout: 'İstif tavana ulaştı', max: 'Tam istif! Tavan skora ulaştın' } as Record<EndCause, string>,
  kind: { I: 'Çubuk', J: 'J', L: 'L', O: 'Kare', S: 'S', T: 'T', Z: 'Z' } as Record<PieceKind, string>,
  cleared: (n: number, gained: number, score: number) => `${n} satır onaylandı, +${gained}. Skor ${score}.`,
  levelAnnounce: (lvl: number) => `Seviye ${lvl}. Bloklar hızlandı.`,
  thresholdAnnounce: (n: number) => `Ödül eşiği ${n} geçildi.`,
  endAnnounce: (head: string, score: number, stars: number) => `${head}. Skor ${score}. ${stars} yıldız.`,
  share: (lines: number, score: number, stars: number) =>
    `Qratex Yorum İstifi'nde ${lines} satır onaylattım: ${score} puan, ${stars} yıldız. Sen geçebilir misin?`,
  shareTitle: 'Yorum İstifi',
  hudSummary: (score: number, threshold: number, max: number, lines: number, level: number, next: string, hold: string | null) =>
    `Skor ${score}, ödül eşiği ${threshold}, tavan ${max}. ${lines} satır, seviye ${level}. Sıradaki: ${next}. Saklanan: ${hold ?? 'yok'}.`,
  level: 'Seviye',
  lines: (n: number) => ` · ${n} satır`,
  score: 'Skor',
  rules:
    'Sol ve sağ ok kaydırır, yukarı ok ya da X döndürür, Z ters döndürür, aşağı ok yumuşak düşürür, boşluk sert düşürür, C saklar, Esc duraklatır.',
  arena: 'Yorum İstifi oyun alanı',
  stackTitle: 'Blokları diz.',
  stackBody: ' Dolan satır onaylanır ve silinir: 1 satır 1, 2 satır 4, 3 satır 9, 4 satır 16 puan.',
  levelTitle: (n: number) => `Her ${n} satırda seviye atlarsın`,
  levelBody: ', bloklar hızlanır. Kesik çizgi, bloğun düşeceği yeri gösterir.',
  holdTitle: 'Sakla:',
  holdBody: ' işine yaramayan bloğu kenara al (blok başına bir kez). Sağda sıradaki 3 blok görünür.',
  thresholdTitle: (n: number) => `Ödül eşiği ${n}.`,
  thresholdBody: (max: number) => ` İstif tavana değerse oyun biter; ${max} puanda tam istif.`,
  touchKeys: 'Sürükle: kaydır · dokun: döndür · aşağı fırlat: sert düşür · alttaki tuşlar da çalışır.',
  keys: '← → kaydır · ↑/X döndür · Z ters · ↓ yumuşak · Boşluk sert · C sakla · Esc duraklat',
  statLines: 'Satır',
  statLevel: 'Seviye',
  statPieces: 'Blok',
  statTetris: '4 satır',
  passedRanked: 'Eşiği geçtin — sunucu oyunu yeniden oynatıp doğruladıktan sonra ödül hesaplanır.',
  remaining: (threshold: number, left: number) => `Ödül eşiği ${threshold}; ${left} puan kaldı.`,
  hold: 'Sakla',
  next: 'Sıradaki',
  pad: 'Oyun tuşları',
  rotateCcw: 'Ters döndür',
  rotate: 'Döndür',
  hardDrop: 'Sert düşür',
  moveLeft: 'Sola kaydır',
  softDrop: 'Yumuşak düşür',
  moveRight: 'Sağa kaydır',
};
type Copy = typeof tr;
const en: Copy = {
  clearLabels: CLEAR_LABELS_EN,
  end: { topout: 'The stack hit the top', max: 'Full stack! You reached the top score' },
  kind: { I: 'Bar', J: 'J', L: 'L', O: 'Square', S: 'S', T: 'T', Z: 'Z' },
  cleared: (n, gained, score) => `${n} ${n === 1 ? 'row' : 'rows'} approved, +${gained}. Score ${score}.`,
  levelAnnounce: (lvl) => `Level ${lvl}. Blocks sped up.`,
  thresholdAnnounce: (n) => `Reward threshold ${n} reached.`,
  endAnnounce: (head, score, stars) => `${head}. Score ${score}. ${stars} stars.`,
  share: (lines, score, stars) =>
    `I got ${lines} rows approved in Qratex Review Stack: ${score} points, ${stars} stars. Can you beat it?`,
  shareTitle: 'Review Stack',
  hudSummary: (score, threshold, max, lines, level, next, hold) =>
    `Score ${score}, reward threshold ${threshold}, max ${max}. ${lines} rows, level ${level}. Next: ${next}. Held: ${hold ?? 'none'}.`,
  level: 'Level',
  lines: (n) => ` · ${n} rows`,
  score: 'Score',
  rules:
    'Left and right arrows move, up arrow or X rotates, Z rotates back, down arrow soft-drops, Space hard-drops, C holds, Esc pauses.',
  arena: 'Review Stack game area',
  stackTitle: 'Stack the blocks.',
  stackBody: ' Full rows get approved and cleared: 1 row 1, 2 rows 4, 3 rows 9, 4 rows 16 points.',
  levelTitle: (n) => `Every ${n} rows you level up`,
  levelBody: ' and blocks speed up. The dashed outline shows where the block will land.',
  holdTitle: 'Hold:',
  holdBody: ' set aside a block you don’t need (once per block). The next 3 blocks show on the right.',
  thresholdTitle: (n) => `Reward threshold ${n}.`,
  thresholdBody: (max) => ` If the stack reaches the top, the game ends; ${max} points is a full stack.`,
  touchKeys: 'Drag: move · tap: rotate · flick down: hard drop · the buttons below work too.',
  keys: '← → move · ↑/X rotate · Z rotate back · ↓ soft · Space hard · C hold · Esc pause',
  statLines: 'Rows',
  statLevel: 'Level',
  statPieces: 'Blocks',
  statTetris: '4-row clears',
  passedRanked: 'You passed the threshold. The reward is calculated after the server replays and verifies your game.',
  remaining: (threshold, left) => `Reward threshold ${threshold}; ${left} points to go.`,
  hold: 'Hold',
  next: 'Next',
  pad: 'Game buttons',
  rotateCcw: 'Rotate back',
  rotate: 'Rotate',
  hardDrop: 'Hard drop',
  moveLeft: 'Move left',
  softDrop: 'Soft drop',
  moveRight: 'Move right',
};
export function useReviewStackCopy(): Copy {
  return useLocaleSafe() === 'en' ? en : tr;
}
