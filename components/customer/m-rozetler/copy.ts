'use client';

import { useDsLocale } from '@/components/ds/a11y';

/**
 * Rozet yüzeyi metinleri (TR/EN) — DS katmanlarıyla aynı desen: uygulama dili `useDsLocale`
 * (AppLocaleProvider; yoksa `tr`). Paylaşılan `messages/*.json` dosyalarına dokunmadan tam iki dil.
 */
export type BadgesLocale = 'tr' | 'en';

const CATEGORY_LABELS: Record<BadgesLocale, Record<string, string>> = {
  tr: {
    feedback: 'Geri bildirim',
    engagement: 'Etkileşim',
    speed: 'Hız',
    exploration: 'Keşif',
    streak: 'Seri',
    rating: 'Puanlama',
    expertise: 'Uzmanlık',
    special: 'Özel',
    general: 'Genel',
    dizi: 'Dizi',
    etkinlik: 'Etkinlik',
    sadakat: 'Sadakat',
    diger: 'Diğer',
    custom: 'Özel',
  },
  en: {
    feedback: 'Feedback',
    engagement: 'Engagement',
    speed: 'Speed',
    exploration: 'Exploration',
    streak: 'Streak',
    rating: 'Rating',
    expertise: 'Expertise',
    special: 'Special',
    general: 'General',
    dizi: 'Series',
    etkinlik: 'Event',
    sadakat: 'Loyalty',
    diger: 'Other',
    custom: 'Custom',
  },
};

const TR = {
  locale: 'tr' as BadgesLocale,
  dateTag: 'tr-TR',
  pageTitle: 'Rozetler',
  pageDescription: 'Kazandığın rozetler, karakter koleksiyonun ve vitrinin.',
  heroEyebrow: 'Koleksiyonun',
  statCollected: 'Toplanan rozet',
  statPoints: 'Rozetlerden puan',
  statThisMonth: 'Bu ay',
  statRarest: 'En nadir rozetin',
  rarestOf: (pct: string) => `kullanıcıların %${pct}'inde`,
  featuredLabel: 'Ana karakterin',
  noFeatured: 'Henüz ana karakter seçmedin',
  showcaseLabel: (n: number, max: number) => `Vitrin ${n}/${max}`,
  tabs: { badges: 'Rozetler', characters: 'Karakterler', community: 'Topluluk' },
  tabsLabel: 'Koleksiyon bölümleri',
  // Sürpriz bölmesi
  surpriseTitle: 'Sıradaki sürpriz',
  charBarText: (n: number) => `Yorumların gizemli bir koleksiyonu besliyor. ${n} yorum daha, yeni bir karakter açığa çıkabilir.`,
  charBarHint: 'Hangi karakter? Sürpriz.',
  charReadyText: 'Bir karakter senin için hazırlandı. Ne çıkacağını kimse bilmiyor…',
  revealCta: 'Karakterini aç',
  variantLabel: 'Açılış görünümü',
  variantOrb: 'Küre',
  variantMascot: 'Maskot',
  barUnavailable: 'Karakter ilerlemen şu an yüklenemedi.',
  nextSurpriseText: (n: number) => `${n} yorum daha yaz, yeni bir sürpriz rozet seni bekliyor olabilir.`,
  nextSurpriseAria: (cur: number, tgt: number) => `Sıradaki sürpriz rozet ilerlemesi: ${cur} / ${tgt} yorum`,
  charBarAria: (cur: number, tgt: number) => `Karakter ilerlemesi: ${cur} / ${tgt} yorum`,
  // Izgara
  sortLabel: 'Sıralama',
  sort: { recent: 'Yeni', rarity: 'Nadirlik', category: 'Kategori' },
  categoryFilterLabel: 'Kategori',
  allCategories: 'Tümü',
  searchLabel: 'Rozetlerde ara',
  searchPlaceholder: 'Rozet adı ya da açıklaması',
  resultCount: (n: number) => `${n} rozet`,
  showMore: (n: number) => `Daha fazla göster (${n})`,
  newBadge: 'Yeni',
  pinned: 'Vitrinde',
  secretBadge: 'Gizli rozet',
  discoverTile: 'Keşfedilecek rozetler var',
  discoverHint: 'Ne olduklarını kazanınca göreceksin.',
  tileAria: (name: string, rarity: string, date: string) => `${name}, ${rarity}, ${date} tarihinde kazanıldı`,
  emptyTitle: 'Henüz rozetin yok',
  emptyBody: 'Rozetler sürprizdir: yorum yazdıkça, keşfettikçe ve oynadıkça kendiliğinden açılır.',
  emptyCta: 'QR okut, ilk yorumunu yaz',
  noResultsTitle: (q: string) => (q ? `"${q}" için sonuç yok` : 'Bu filtrede rozet yok'),
  noResultsBody: 'Aramayı ya da kategori filtresini değiştir.',
  clearFilters: 'Filtreleri temizle',
  // Karakterler
  charactersCollected: (n: number) => `${n} karakter toplandı`,
  categoryComplete: 'Kategori tamamlandı',
  undiscoveredChar: 'Henüz keşfedilmedi',
  moreInCategory: 'Bu kategoride keşfedilecek karakterler var',
  charEmptyTitle: 'İlk karakterini keşfetmek üzeresin',
  charEmptyBody: 'Tüketim yorumların gizli kategorilerde birikir. Barı doldur, sürprizini aç.',
  mainBadge: 'Ana',
  // Detay
  detailEarnedOn: (d: string) => `${d} tarihinde kazanıldı`,
  detailRarityShare: (pct: string) => `Kullanıcıların %${pct}'inde var`,
  detailCredited: (p: string) => `+${p} puan hesabına eklendi`,
  detailNoCredit: 'Bu rozet için puan eklenmedi',
  detailPinLabel: 'Profil vitrinimde göster',
  detailPinHint: (n: number, max: number) => `Vitrinde ${n}/${max} öge (rozet ve kozmetik birlikte).`,
  detailPinFull: (max: number) => `Vitrin dolu (${max}/${max}). Önce bir ögeyi kaldır.`,
  detailShare: 'Paylaş',
  detailSharing: 'Hazırlanıyor…',
  detailFeature: 'Ana karakter yap',
  detailFeatured: 'Ana karakterin',
  detailFeaturing: 'Ayarlanıyor…',
  detailNotFound: 'Bu rozet koleksiyonunda bulunamadı.',
  detailQuoteLabel: 'Kazanım notu',
  kvEarned: 'Kazanım',
  kvPoints: 'Puan',
  kvRarity: 'Nadirlik',
  pinOn: 'Rozet vitrine eklendi.',
  pinOff: 'Rozet vitrinden kaldırıldı.',
  pinFailed: 'Vitrin güncellenemedi. Tekrar dene.',
  featureOk: (name: string) => `${name} artık ana karakterin.`,
  featureFailed: 'Ana karakter ayarlanamadı. Tekrar dene.',
  shareShared: 'Paylaşıldı.',
  shareDownloaded: 'Görsel indirildi.',
  shareCopied: 'Paylaşım metni panoya kopyalandı.',
  shareFailed: 'Paylaşım hazırlanamadı.',
  shareText: (name: string, rarity: string) => `QRateX'te ${rarity} rozetimi kazandım: ${name}`,
  shareTitle: (name: string) => `QRateX rozetim: ${name}`,
  shareCardKicker: 'ROZET KAZANDIM',
  shareCardFooter: 'Sen de keşfet',
  // Topluluk
  communityTitle: 'Karakter liderliği',
  communityModes: { rarest: 'En nadir', weekly: 'Bu hafta' },
  communityModesLabel: 'Liderlik türü',
  rarestHint: 'En az kişide bulunan karakterler en üstte. Sende varsa gerçekten nadirsin.',
  weeklyHint: 'Bu hafta (Pazartesi 00:00’dan beri) en çok karakter kazananlar. Adlar gizlilik için kısaltılır.',
  hiddenCharacter: 'Gizli karakter',
  hiddenCharacterHint: 'Kim olduğu sürpriz',
  mine: 'Sende',
  holders: (n: number) => `${n} kişide`,
  you: 'Sen',
  anonymous: 'İsimsiz',
  weeklyCount: (n: number) => `${n} karakter`,
  yourRank: (r: number | null) => (r ? `Senin sıran: ${r}.` : 'Bu hafta henüz karakter kazanmadın.'),
  rarestEmpty: 'Henüz kimse karakter kazanmadı',
  weeklyEmpty: 'Bu hafta henüz karakter kazanılmadı',
  communityEmptyBody: 'İlk sırayı sen kapabilirsin: tüketim yorumu yazmaya devam et.',
  loadError: 'Rozetlerin yüklenemedi',
  loadErrorBody: 'Bağlantıda bir sorun oldu. Rozetlerin kaybolmadı, tekrar dene.',
};

export type BadgesCopy = typeof TR & { categoryLabel: (key: string) => string };

const EN: typeof TR = {
  locale: 'en',
  dateTag: 'en-GB',
  pageTitle: 'Badges',
  pageDescription: 'Your badges, character collection and showcase.',
  heroEyebrow: 'Your collection',
  statCollected: 'Badges collected',
  statPoints: 'Points from badges',
  statThisMonth: 'This month',
  statRarest: 'Your rarest badge',
  rarestOf: (pct) => `held by ${pct}% of users`,
  featuredLabel: 'Your main character',
  noFeatured: 'No main character yet',
  showcaseLabel: (n, max) => `Showcase ${n}/${max}`,
  tabs: { badges: 'Badges', characters: 'Characters', community: 'Community' },
  tabsLabel: 'Collection sections',
  surpriseTitle: 'Next surprise',
  charBarText: (n) => `Your reviews are feeding a mysterious collection. ${n} more and a new character may appear.`,
  charBarHint: 'Which one? It’s a surprise.',
  charReadyText: 'A character has been prepared for you. Nobody knows who it will be…',
  revealCta: 'Reveal your character',
  variantLabel: 'Reveal style',
  variantOrb: 'Orb',
  variantMascot: 'Mascot',
  barUnavailable: 'Your character progress could not be loaded right now.',
  nextSurpriseText: (n) => `Write ${n} more reviews — a new surprise badge may be waiting.`,
  nextSurpriseAria: (cur, tgt) => `Next surprise badge progress: ${cur} / ${tgt} reviews`,
  charBarAria: (cur, tgt) => `Character progress: ${cur} / ${tgt} reviews`,
  sortLabel: 'Sort',
  sort: { recent: 'Newest', rarity: 'Rarity', category: 'Category' },
  categoryFilterLabel: 'Category',
  allCategories: 'All',
  searchLabel: 'Search badges',
  searchPlaceholder: 'Badge name or description',
  resultCount: (n) => `${n} badges`,
  showMore: (n) => `Show more (${n})`,
  newBadge: 'New',
  pinned: 'Showcased',
  secretBadge: 'Secret badge',
  discoverTile: 'More badges to discover',
  discoverHint: 'You’ll see what they are once you earn them.',
  tileAria: (name, rarity, date) => `${name}, ${rarity}, earned on ${date}`,
  emptyTitle: 'No badges yet',
  emptyBody: 'Badges are surprises: they unlock on their own as you review, explore and play.',
  emptyCta: 'Scan a QR, write your first review',
  noResultsTitle: (q) => (q ? `No results for "${q}"` : 'No badges in this filter'),
  noResultsBody: 'Change your search or category filter.',
  clearFilters: 'Clear filters',
  charactersCollected: (n) => `${n} characters collected`,
  categoryComplete: 'Category complete',
  undiscoveredChar: 'Not discovered yet',
  moreInCategory: 'More characters to discover in this category',
  charEmptyTitle: 'You’re about to discover your first character',
  charEmptyBody: 'Your consumption reviews build up in hidden categories. Fill the bar, reveal your surprise.',
  mainBadge: 'Main',
  detailEarnedOn: (d) => `Earned on ${d}`,
  detailRarityShare: (pct) => `Held by ${pct}% of users`,
  detailCredited: (p) => `+${p} points added to your balance`,
  detailNoCredit: 'No points were credited for this badge',
  detailPinLabel: 'Show on my profile showcase',
  detailPinHint: (n, max) => `${n}/${max} items in showcase (badges and cosmetics).`,
  detailPinFull: (max) => `Showcase is full (${max}/${max}). Remove an item first.`,
  detailShare: 'Share',
  detailSharing: 'Preparing…',
  detailFeature: 'Make main character',
  detailFeatured: 'Your main character',
  detailFeaturing: 'Saving…',
  detailNotFound: 'This badge is not in your collection.',
  detailQuoteLabel: 'Earned note',
  kvEarned: 'Earned',
  kvPoints: 'Points',
  kvRarity: 'Rarity',
  pinOn: 'Badge added to showcase.',
  pinOff: 'Badge removed from showcase.',
  pinFailed: 'Showcase could not be updated. Try again.',
  featureOk: (name) => `${name} is now your main character.`,
  featureFailed: 'Main character could not be set. Try again.',
  shareShared: 'Shared.',
  shareDownloaded: 'Image downloaded.',
  shareCopied: 'Share text copied to clipboard.',
  shareFailed: 'Share could not be prepared.',
  shareText: (name, rarity) => `I earned a ${rarity} badge on QRateX: ${name}`,
  shareTitle: (name) => `My QRateX badge: ${name}`,
  shareCardKicker: 'BADGE EARNED',
  shareCardFooter: 'Discover yours',
  communityTitle: 'Character leaderboard',
  communityModes: { rarest: 'Rarest', weekly: 'This week' },
  communityModesLabel: 'Leaderboard type',
  rarestHint: 'Characters held by the fewest people are on top. If you have one, you’re truly rare.',
  weeklyHint: 'Most characters earned this week (since Monday 00:00). Names are shortened for privacy.',
  hiddenCharacter: 'Hidden character',
  hiddenCharacterHint: 'Who it is stays a surprise',
  mine: 'Yours',
  holders: (n) => `${n} holders`,
  you: 'You',
  anonymous: 'Anonymous',
  weeklyCount: (n) => `${n} characters`,
  yourRank: (r) => (r ? `Your rank: #${r}` : 'You haven’t earned a character this week yet.'),
  rarestEmpty: 'Nobody has earned a character yet',
  weeklyEmpty: 'No characters earned this week yet',
  communityEmptyBody: 'Grab the top spot: keep writing consumption reviews.',
  loadError: 'Your badges could not be loaded',
  loadErrorBody: 'Something went wrong with the connection. Your badges are safe — try again.',
};

const DICT: Record<BadgesLocale, typeof TR> = { tr: TR, en: EN };

export function getBadgesCopy(locale: BadgesLocale): BadgesCopy {
  const base = DICT[locale] ?? TR;
  const labels = CATEGORY_LABELS[locale] ?? CATEGORY_LABELS.tr;
  return { ...base, categoryLabel: (key: string) => labels[key] ?? labels.general };
}

export function useBadgesCopy(): BadgesCopy {
  const locale = useDsLocale();
  return getBadgesCopy(locale === 'en' ? 'en' : 'tr');
}

/** Tarih (Europe/Istanbul). */
export function formatEarnedDate(iso: string, copy: Pick<BadgesCopy, 'dateTag'>, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(copy.dateTag, { timeZone: 'Europe/Istanbul', ...opts });
  } catch {
    return '';
  }
}

export function formatPct(pct: number, copy: Pick<BadgesCopy, 'dateTag'>): string {
  return new Intl.NumberFormat(copy.dateTag, { maximumFractionDigits: pct < 1 ? 1 : 0 }).format(pct);
}

export function formatInt(n: number, copy: Pick<BadgesCopy, 'dateTag'>): string {
  return new Intl.NumberFormat(copy.dateTag).format(n);
}
