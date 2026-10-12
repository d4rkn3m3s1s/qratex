/**
 * Günlük çark metinleri (kart + tam ekran çevirme). Ana Sayfa sözlüğünden (`copy.ts`) ayrı
 * tutulur: çark yüzeyi tek dosyada değişsin, paralel düzenlemelerle çakışmasın.
 */
import { useDsLocale, type DsLocale } from '@/components/ds/a11y/copy';

const tr = {
  overline: 'Günlük çark',
  readyTitle: 'Bugünkü çevirme hakkın hazır',
  readyBody: (max: string) => `Çarkta ${max} puana kadar dilim var.`,
  spinsLeft: (n: number) => (n === 1 ? '1 hak' : `${n} hak`),
  cta: 'Çarkı çevir',
  usedTitle: 'Çark yarın yeniden dönüyor',
  usedBody: (max: string) => `${max} puanlık dilim yine çarkta. Bakalım yarın kime denk gelecek.`,
  nextIn: 'Yeni hakka',
  countdownAria: (h: number, m: number) => `Yeni hakka ${h} saat ${m} dakika`,
  unitPoints: 'puan',
  unitXp: 'XP',
  nothingShort: 'Pas',
  dialogTitle: 'Günlük çark',
  dialogDesc: 'Sonuç sunucuda belirlenir; kazancın anında bakiyene işlenir.',
  spin: 'Çevir',
  spinAgain: 'Tekrar çevir',
  spinning: 'Çark dönüyor…',
  ready: (n: number) => (n === 1 ? 'Bugün 1 hakkın var.' : `Bugün ${n} hakkın var.`),
  wonTitle: 'Kazandın',
  nothingTitle: 'Bu sefer boş çıktı',
  nothingBody: 'Gece yarısı yeni bir hak açılıyor.',
  wonBody: 'Bakiyene işlendi.',
  capped: 'Günlük kazanç sınırına ulaştığın için bu çevirmede kredi işlenmedi.',
  error: 'Çark çevrilemedi. Lütfen tekrar dene.',
  used: 'Bugünkü hakkını kullandın.',
  close: 'Kapat',
  done: 'Tamam',
  prizes: 'Çarktaki dilimler',
  resultAnnounce: (label: string) => `Çark durdu: ${label}`,
};

type SpinCopy = typeof tr;

const en: SpinCopy = {
  overline: 'Daily wheel',
  readyTitle: 'Your spin for today is ready',
  readyBody: (max) => `Slices go up to ${max} pts.`,
  spinsLeft: (n) => (n === 1 ? '1 spin' : `${n} spins`),
  cta: 'Spin the wheel',
  usedTitle: 'The wheel turns again tomorrow',
  usedBody: (max) => `The ${max} pts slice is still on the wheel. Who knows who lands it tomorrow.`,
  nextIn: 'Next spin in',
  countdownAria: (h, m) => `Next spin in ${h} hours ${m} minutes`,
  unitPoints: 'pts',
  unitXp: 'XP',
  nothingShort: 'Miss',
  dialogTitle: 'Daily wheel',
  dialogDesc: 'The result is decided on the server and added to your balance instantly.',
  spin: 'Spin',
  spinAgain: 'Spin again',
  spinning: 'Spinning…',
  ready: (n) => (n === 1 ? 'You have 1 spin today.' : `You have ${n} spins today.`),
  wonTitle: 'You won',
  nothingTitle: 'No luck this time',
  nothingBody: 'A new spin opens at midnight.',
  wonBody: 'Added to your balance.',
  capped: 'You reached today’s earning cap, so this spin was not credited.',
  error: 'The wheel could not spin. Please try again.',
  used: 'You used today’s spin.',
  close: 'Close',
  done: 'Done',
  prizes: 'Slices on the wheel',
  resultAnnounce: (label) => `The wheel stopped: ${label}`,
};

const COPY: Record<DsLocale, SpinCopy> = { tr, en };

export type { SpinCopy };

export function useSpinCopy(): { copy: SpinCopy; locale: DsLocale } {
  const locale = useDsLocale();
  return { copy: COPY[locale], locale };
}
