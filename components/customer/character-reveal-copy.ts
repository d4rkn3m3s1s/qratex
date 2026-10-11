import type { Locale } from '@/i18n/core';
import { useLocaleSafe } from '@/lib/app-locale';

/** Karakter rozeti açılışı (character-reveal + paylaşım kartı) arayüz metinleri. */
export type CharacterRevealCopy = {
  preparingLines: string[];
  preparingHint: string;
  dialogLabel: string;
  close: string;
  categoryReady: string;
  tierLabel: { legendary: string; rare: string };
  tierNote: { legendary: string; rare: string };
  whyTitle: string;
  rarity: (pct: string) => string;
  veryRare: string;
  great: string;
  shareLabel: string;
  share: string;
  sharePreparing: string;
  errorUnavailable: string;
  errorNetwork: string;
  errorNone: string;
  numberLocale: string;
};

export const CHARACTER_REVEAL_COPY: Record<Locale, CharacterRevealCopy> = {
  tr: {
    preparingLines: [
      'Kaderin okunuyor…',
      'Yorumların fısıldıyor…',
      'Yıldızlar hizalanıyor…',
      'Ruhun eşleştiriliyor…',
      'Karakterin şekilleniyor…',
    ],
    preparingHint: 'Rozetin hazırlanıyor, biraz bekle…',
    dialogLabel: 'Karakter rozeti keşfi',
    close: 'Kapat',
    categoryReady: 'Kategorin belirlendi',
    tierLabel: { legendary: 'EFSANEVİ', rare: 'NADİR' },
    tierNote: { legendary: '· En özgün arketiplerden', rare: '· Belirgin, derin karakter' },
    whyTitle: 'Bu rozeti aldın çünkü',
    rarity: (pct) => `Oyuncuların yalnızca %${pct}'inde`,
    veryRare: '— çok nadir!',
    great: 'Harika!',
    shareLabel: 'Karakterini görsel olarak paylaş',
    share: 'Paylaş 📸',
    sharePreparing: 'Hazırlanıyor…',
    errorUnavailable: 'Karakterin şu an belirlenemedi, sonra tekrar dene.',
    errorNetwork: 'Bağlantı hatası — karakterin belirlenemedi.',
    errorNone: 'Gösterilecek karakter yok.',
    numberLocale: 'tr-TR',
  },
  en: {
    preparingLines: [
      'Reading your fate…',
      'Your reviews are whispering…',
      'Aligning the stars…',
      'Matching your spirit…',
      'Shaping your character…',
    ],
    preparingHint: 'Your badge is on its way, hang tight…',
    dialogLabel: 'Character badge reveal',
    close: 'Close',
    categoryReady: 'Your category is in',
    tierLabel: { legendary: 'LEGENDARY', rare: 'RARE' },
    tierNote: { legendary: '· One of the most original archetypes', rare: '· A distinct, deep character' },
    whyTitle: 'You got this badge because',
    rarity: (pct) => `Only ${pct}% of players have it`,
    veryRare: '— very rare!',
    great: 'Awesome!',
    shareLabel: 'Share your character as an image',
    share: 'Share 📸',
    sharePreparing: 'Preparing…',
    errorUnavailable: 'We couldn’t pick your character right now. Try again later.',
    errorNetwork: 'Connection error — we couldn’t pick your character.',
    errorNone: 'No character to show.',
    numberLocale: 'en-US',
  },
};

export function useCharacterRevealCopy(): CharacterRevealCopy {
  return CHARACTER_REVEAL_COPY[useLocaleSafe()];
}

/** Paylaşım kartı (canvas PNG) ve paylaşım metni — hook'suz modülde locale ile seçilir. */
export const CHARACTER_SHARE_COPY = {
  tr: {
    rarity: { legendary: 'EFSANEVİ', epic: 'EPİK', rare: 'NADİR' } as Record<string, string>,
    cardTitle: 'KARAKTER ROZETİ',
    fallbackName: 'Karakter',
    rateVeryRare: (pct: string) => `🏆  Oyuncuların yalnızca %${pct}'inde — çok nadir!`,
    rate: (pct: string) => `🏆  Oyuncuların %${pct}'inde`,
    cta: 'Sen de karakterini keşfet',
    shareTitle: (name: string) => `QRateX karakterim: ${name}!`,
    shareText: (rarity: string | null, name: string, site: string) =>
      `QRateX'te ${rarity ? `${rarity} ` : ''}karakter rozetimi kazandım: ${name} 🎭 → ${site}`,
    fileName: 'qratex-karakter.png',
  },
  en: {
    rarity: { legendary: 'LEGENDARY', epic: 'EPIC', rare: 'RARE' } as Record<string, string>,
    cardTitle: 'CHARACTER BADGE',
    fallbackName: 'Character',
    rateVeryRare: (pct: string) => `🏆  Only ${pct}% of players — very rare!`,
    rate: (pct: string) => `🏆  ${pct}% of players have it`,
    cta: 'Discover your own character',
    shareTitle: (name: string) => `My QRateX character: ${name}!`,
    shareText: (rarity: string | null, name: string, site: string) =>
      `I earned my ${rarity ? `${rarity} ` : ''}character badge on QRateX: ${name} 🎭 → ${site}`,
    fileName: 'qratex-character.png',
  },
} satisfies Record<Locale, unknown>;
