/** Çekirdek Savunması arayüz metinleri (TR/EN); uygulama dilini izler. */
import { useLocaleSafe } from '@/lib/app-locale';
import type { UpgradeId } from './sim';

/** Tuval üstü kısa metinler (render.ts; React dışı). */
export interface CoreFxTexts {
  miss: string;
  wave: (n: number) => string;
  bossWave: (n: number) => string;
  bossSub: string;
  perfect: string;
  cleared: string;
  bonus: (n: number) => string;
  threshold: string;
}

const fxTr: CoreFxTexts = {
  miss: 'ıska',
  wave: (n) => `Dalga ${n}`,
  bossWave: (n) => `Dalga ${n} · BOSS`,
  bossSub: 'Altıgen dev geliyor',
  perfect: 'Kusursuz dalga!',
  cleared: 'Dalga temizlendi',
  bonus: (n) => `+${n} bonus`,
  threshold: 'Ödül eşiği geçildi!',
};
const fxEn: CoreFxTexts = {
  miss: 'miss',
  wave: (n) => `Wave ${n}`,
  bossWave: (n) => `Wave ${n} · BOSS`,
  bossSub: 'The hexagon giant is coming',
  perfect: 'Flawless wave!',
  cleared: 'Wave cleared',
  bonus: (n) => `+${n} bonus`,
  threshold: 'Reward threshold reached!',
};
export const CORE_FX_TEXTS_TR = fxTr;

const tr = {
  fx: fxTr,
  coreHit: (hp: number, max: number) => `Çekirdek hasar aldı: ${hp} / ${max} can.`,
  waveStart: (wave: number, total: number, boss: boolean) => `Dalga ${wave} / ${total} başladı${boss ? ', boss geliyor' : ''}.`,
  waveClear: (wave: number, bonus: number, more: boolean) =>
    `Dalga ${wave} temizlendi, ${bonus} bonus.${more ? ' Bir yükseltme seç: 1, 2 ya da 3.' : ''}`,
  thresholdAnnounce: 'Ödül eşiği geçildi.',
  endAnnounce: (won: boolean, wave: number, score: number, stars: number) =>
    `${won ? 'Tüm dalgalar püskürtüldü' : `Çekirdek düştü, dalga ${wave}`}. Skor ${score}. ${stars} yıldız.`,
  shareWon: (waves: number, score: number, stars: number) =>
    `Qratex Çekirdek Savunması'nda ${waves} dalganın hepsini püskürttüm: ${score} skor, ${stars} yıldız!`,
  shareLost: (wave: number, score: number) =>
    `Qratex Çekirdek Savunması'nda ${wave}. dalgaya kadar dayandım: ${score} skor. Sen geçebilir misin?`,
  shareTitle: 'Çekirdek Savunması',
  shared: 'Paylaşıldı.',
  copied: 'Panoya kopyalandı.',
  shareFailed: 'Paylaşılamadı; tarayıcın bu özelliği desteklemiyor olabilir.',
  hudSummary: (wave: number, total: number, score: number, threshold: number, hp: string) =>
    `Dalga ${wave} / ${total}. Skor ${score}, ödül eşiği ${threshold}. Çekirdek canı ${hp}.`,
  wave: 'Dalga',
  score: 'Skor',
  threshold: (n: number) => ` · eşik ${n}`,
  progress: 'Ödül eşiğine ilerleme',
  core: 'Çekirdek',
  combo: (n: number) => `Kombo ×${n}`,
  pause: 'Duraklat',
  rules:
    'Düşmanlara dokunarak ateş et. Klavyede Boşluk en tehlikeli düşmana ateş eder, Q kalkan darbesini patlatır, 1-3 yükseltme seçer, Esc duraklatır.',
  arena: 'Çekirdek Savunması oyun alanı',
  pickTitle: (wave: number) => `Dalga ${wave} temizlendi — yükseltme seç`,
  pickHint: (sec: number) => `${sec} sn içinde seçmezsen ilki seçilir. Tuşlar: 1 · 2 · 3`,
  upgradeLevel: (lvl: number, max: number) => `Sv ${lvl}/${max}`,
  tapTitle: 'Düşmana dokun, vur.',
  tapBody:
    ' Turuncu elmaslar (spam) hızlı ve tek vuruşluk; pembe boynuzlu kareler (trol) 3 vuruş ister. Altıgen dev = boss.',
  pulseTitle: 'Kalkan darbesi.',
  pulseBody: ' Öldürdükçe dolar; dolunca sağ alttaki düğmeyle (ya da Q) çevredeki herkese hasar ver ve geri it.',
  coreTitle: 'Çekirdeğin canı biterse oyun biter.',
  coreBody: (waves: number) => ` ${waves} dalga var; aralarda bir yükseltme seç. Seri vuruş kombo, hasarsız dalga bonus verir.`,
  keys: 'Klavye: Boşluk ateş · Q kalkan · 1-3 yükseltme · Esc duraklat',
  howTo: 'Nasıl oynanır?',
  gotIt: 'Anladım, başla',
  won: 'Tüm dalgalar püskürtüldü!',
  lost: (wave: number) => `Çekirdek ${wave}. dalgada düştü`,
  stars: (n: number) => `3 yıldızdan ${n}`,
  firstScore: 'İlk skorun bu cihazda kaydedildi.',
  newBest: (prev: number) => `Yeni kişisel rekor! (önceki ${prev})`,
  best: (n: number) => `En iyin: ${n}`,
  practiceSuffix: ' · Pratik',
  statWave: 'Dalga',
  statKills: 'Devrilen',
  statAccuracy: 'İsabet',
  statAccuracyValue: (n: number) => `%${n}`,
  statCombo: 'En iyi kombo',
  passedRanked: 'Ödül eşiğini geçtin — sunucu doğrulaması sonrası ödül hesaplanır.',
  passedPractice: 'Eşiği geçtin. Sıralı modda bu skor ödül getirirdi.',
  remaining: (threshold: number, left: number) => `Ödül eşiği ${threshold}; ${left} skor kaldı.`,
  share: 'Paylaş',
  save: (n: number) => `Sonucu kaydet (${n})`,
  cont: 'Devam',
  pulseReady: 'Kalkan darbesi hazır — patlat',
  pulseCharging: (pct: number) => `Kalkan doluyor, yüzde ${pct}`,
  footPractice: 'Pratik: ödülsüz, liderliğe girmez.',
  footRanked: 'Sıralı: skor sunucuda yeniden oynatılarak doğrulanır.',
  upgrades: null as null | Partial<Record<UpgradeId, { title: string; desc: string }>>,
};
type Copy = typeof tr;
const en: Copy = {
  fx: fxEn,
  coreHit: (hp, max) => `Core hit: ${hp} / ${max} health.`,
  waveStart: (wave, total, boss) => `Wave ${wave} / ${total} started${boss ? ', boss incoming' : ''}.`,
  waveClear: (wave, bonus, more) => `Wave ${wave} cleared, ${bonus} bonus.${more ? ' Pick an upgrade: 1, 2 or 3.' : ''}`,
  thresholdAnnounce: 'Reward threshold reached.',
  endAnnounce: (won, wave, score, stars) =>
    `${won ? 'All waves repelled' : `Core destroyed on wave ${wave}`}. Score ${score}. ${stars} stars.`,
  shareWon: (waves, score, stars) => `I repelled all ${waves} waves in Qratex Core Defense: ${score} points, ${stars} stars!`,
  shareLost: (wave, score) => `I held out until wave ${wave} in Qratex Core Defense: ${score} points. Can you beat it?`,
  shareTitle: 'Core Defense',
  shared: 'Shared.',
  copied: 'Copied to clipboard.',
  shareFailed: 'Couldn’t share; your browser may not support it.',
  hudSummary: (wave, total, score, threshold, hp) =>
    `Wave ${wave} / ${total}. Score ${score}, reward threshold ${threshold}. Core health ${hp}.`,
  wave: 'Wave',
  score: 'Score',
  threshold: (n) => ` · goal ${n}`,
  progress: 'Progress to the reward threshold',
  core: 'Core',
  combo: (n) => `Combo ×${n}`,
  pause: 'Pause',
  rules:
    'Tap enemies to shoot. On a keyboard, Space fires at the most dangerous enemy, Q triggers the shield pulse, 1-3 picks an upgrade, Esc pauses.',
  arena: 'Core Defense game area',
  pickTitle: (wave) => `Wave ${wave} cleared: pick an upgrade`,
  pickHint: (sec) => `If you don’t pick within ${sec}s, the first one is chosen. Keys: 1 · 2 · 3`,
  upgradeLevel: (lvl, max) => `Lv ${lvl}/${max}`,
  tapTitle: 'Tap an enemy to shoot it.',
  tapBody: ' Orange diamonds (spam) are fast and go down in one hit; pink horned squares (trolls) take 3 hits. The hexagon giant is the boss.',
  pulseTitle: 'Shield pulse.',
  pulseBody: ' It charges as you take enemies down; when full, use the button at the bottom right (or Q) to damage and push back everything nearby.',
  coreTitle: 'If the core runs out of health, the game ends.',
  coreBody: (waves) => ` There are ${waves} waves; pick an upgrade between them. Hit streaks build combos, and a no-damage wave gives a bonus.`,
  keys: 'Keyboard: Space fire · Q shield · 1-3 upgrade · Esc pause',
  howTo: 'How to play',
  gotIt: 'Got it, let’s go',
  won: 'All waves repelled!',
  lost: (wave) => `The core fell on wave ${wave}`,
  stars: (n) => `${n} of 3 stars`,
  firstScore: 'Your first score is saved on this device.',
  newBest: (prev) => `New personal best! (previous ${prev})`,
  best: (n) => `Your best: ${n}`,
  practiceSuffix: ' · Practice',
  statWave: 'Wave',
  statKills: 'Takedowns',
  statAccuracy: 'Accuracy',
  statAccuracyValue: (n) => `${n}%`,
  statCombo: 'Best combo',
  passedRanked: 'You passed the reward threshold. The reward is calculated after server verification.',
  passedPractice: 'You passed the threshold. In ranked mode, this score would earn a reward.',
  remaining: (threshold, left) => `Reward threshold ${threshold}; ${left} to go.`,
  share: 'Share',
  save: (n) => `Save result (${n})`,
  cont: 'Continue',
  pulseReady: 'Shield pulse ready: fire it',
  pulseCharging: (pct) => `Shield charging, ${pct} percent`,
  footPractice: 'Practice: no rewards, not on the leaderboard.',
  footRanked: 'Ranked: your score is verified by replaying it on the server.',
  upgrades: {
    damage: { title: 'Heavy Rounds', desc: 'Each shot deals +1 damage.' },
    rate: { title: 'Quick Trigger', desc: 'Shorter wait between shots.' },
    repair: { title: 'Repair', desc: 'The core regains 3 health.' },
    charge: { title: 'Shield Battery', desc: 'The shield pulse charges faster.' },
    radius: { title: 'Wide Pulse', desc: 'The shield pulse reaches farther.' },
    chain: { title: 'Chain Shot', desc: 'Hits jump to one more nearby target.' },
    slow: { title: 'Slow Field', desc: 'Enemies near the core slow down.' },
    armor: { title: 'Armor Layer', desc: 'Max health +3 and 3 health repaired.' },
  },
};
export function useCoreDefenseCopy(): Copy {
  return useLocaleSafe() === 'en' ? en : tr;
}
