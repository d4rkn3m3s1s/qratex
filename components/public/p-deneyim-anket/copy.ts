/**
 * Herkese açık paylaşım yüzeyleri (`/experience/[token]`, `/surveys/[id]`) metinleri — TR/EN.
 * Paylaşılan i18n kataloğuna dokunmadan iki dilli (components/ds copy deseni). Sunucu ve
 * istemci bileşenleri aynı modülü kullanır (hook yok; dil sunucuda çözülür, prop ile iner).
 */
import type { PlaceCategory } from '@/lib/places/categories';
import type { ShareCaptionKey, ShareMood } from '@/lib/venue-detail/types';

export type ShareLocale = 'tr' | 'en';

const WEEKDAYS = {
  tr: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
} as const;

function minutesLabel(seconds: number, locale: ShareLocale): string {
  const min = Math.max(1, Math.round(seconds / 60));
  return locale === 'tr' ? `~${min} dk` : `~${min} min`;
}

const TR = {
  // Kabuk
  homeAria: 'Qratex ana sayfası',
  poweredBy: 'Qratex ile güçlendirildi',
  privacy: 'Gizlilik',
  kvkk: 'KVKK',
  venueFallback: 'İşletme',

  // ── Deneyim kartı ──
  expMetaTitle: (venue: string) => `Bir arkadaşın ${venue} mekânını önerdi`,
  expMetaTitleGeneric: 'Bir arkadaşın bir mekânı önerdi',
  expMetaDescription: (caption: string | null, rating: number | null) =>
    [caption, rating ? `${rating}/5 puan` : null, 'Qratex anonim deneyim kartı'].filter(Boolean).join(' · '),
  expMetaNotFound: 'Deneyim kartı',
  expEyebrow: 'Bir arkadaşın önerdi',
  expAnonymousSeal: 'Anonim kart',
  expAnonymousNote: 'Paylaşanın kişisel bilgisi gösterilmez.',
  expRatingAria: (n: number) => `${n} / 5 puan verdi`,
  expRatingLabel: (n: number) => `${n}/5`,
  expMoodLabel: 'Ruh hâli',
  moods: { great: 'Harika', good: 'Güzel', ok: 'Fena değil' } as Record<ShareMood, string>,
  moodEmoji: { great: '🤩', good: '😊', ok: '🙂' } as Record<ShareMood, string>,
  captions: {
    recommend: 'Gönül rahatlığıyla tavsiye ederim.',
    try_it: 'Yolun düşerse mutlaka uğra.',
    hidden_gem: 'Keşfedilmeyi bekleyen bir yer.',
    great_service: 'Hizmet gerçekten çok iyiydi.',
  } as Record<ShareCaptionKey, string>,
  categories: {
    kahve: 'Kahve',
    restoran: 'Restoran',
    tatli: 'Tatlı & Pastane',
    kahvalti: 'Kahvaltı',
    bar: 'Bar & Pub',
    konaklama: 'Konaklama',
  } as Record<PlaceCategory, string>,
  sharedOn: (date: string) => `Paylaşım: ${date}`,
  daysLeft: (n: number) => (n <= 0 ? 'Bugün sona eriyor' : `${n} gün daha açık`),
  // Mekân bilgisi
  open: 'Şu an açık',
  openUntil: (t: string) => `Şu an açık · kapanış ${t}`,
  openAllDay: 'Şu an açık · 24 saat',
  closingSoon: (t: string) => `Yakında kapanıyor · ${t}`,
  closed: 'Şu an kapalı',
  closedOpensToday: (t: string) => `Kapalı · bugün ${t}'de açılıyor`,
  closedOpensTomorrow: (t: string) => `Kapalı · yarın ${t}'de açılıyor`,
  closedOpensOn: (day: string, t: string) => `Kapalı · ${day} ${t}'de açılıyor`,
  holiday: 'Şu an tatilde',
  stats: (count: number, avg: string, days: number) => `Son ${days} günde ${count} geri bildirim · ortalama ${avg}/5`,
  statsLabel: 'Mekânın genel puanı',
  // Aksiyonlar
  ctaSectionTitle: 'Sıra sende',
  ctaJoin: "Qratex'e katıl",
  ctaJoinBody: 'Hesap açınca bu mekânı Keşfet’te açar, ziyaretinde QR okutup geri bildirim bırakarak puan kazanırsın.',
  ctaLogin: 'Zaten hesabım var',
  ctaVenue: 'Mekânı keşfet',
  ctaVenueBody: 'Açık/kapalı durumu, aktif teklifler ve yol tarifi mekân sayfasında.',
  ctaHome: "Qratex'i tanı",
  directions: 'Yol tarifi',
  directionsAria: (venue: string) => `${venue} için yol tarifi (yeni sekmede açılır)`,
  // Sahip paneli
  ownerTitle: 'Bu kart senin',
  ownerBody: 'Paylaştığın kişiler kartı böyle görüyor. Kimliğin gösterilmiyor.',
  ownerViews: (n: number) => (n === 0 ? 'Henüz görüntülenmedi' : `${n} tekil görüntüleme`),
  ownerShare: 'Bağlantıyı paylaş',
  ownerCopied: 'Bağlantı kopyalandı.',
  ownerCopyFailed: 'Bağlantı kopyalanamadı. Adres çubuğundan kopyalayabilirsin.',
  ownerShareText: (venue: string) => `${venue} mekânını sana öneriyorum`,
  ownerRevoke: 'Paylaşımı durdur',
  ownerRevokeConfirmTitle: 'Paylaşım durdurulsun mu?',
  ownerRevokeConfirmBody: 'Bağlantı hemen kapanır; açan kişiler "paylaşım sona erdi" ekranını görür. Geri alınamaz, istersen mekân sayfasından yeni kart oluşturabilirsin.',
  ownerRevokeConfirm: 'Evet, durdur',
  ownerRevokeCancel: 'Vazgeç',
  ownerRevoked: 'Paylaşım durduruldu.',
  ownerRevokeFailed: 'Paylaşım durdurulamadı. Lütfen tekrar deneyin.',
  // Durumlar
  expExpiredTitle: 'Bu kartın paylaşım süresi sona erdi',
  expExpiredBody: (venue: string | null) =>
    venue ? `${venue} hâlâ Qratex'te. Mekânı keşfedebilir ya da kendi deneyimini paylaşabilirsin.` : 'Kartlar 7 gün açık kalır. Qratex’te yakınındaki mekânları keşfedebilirsin.',
  expNotFoundTitle: 'Kart bulunamadı',
  expNotFoundBody: 'Bağlantı hatalı ya da kart kaldırılmış olabilir.',
  expDisabledTitle: 'Deneyim kartları şu an kapalı',
  expDisabledBody: 'Bu özellik geçici olarak devre dışı. Daha sonra tekrar deneyebilirsin.',
  unavailableTitle: 'Şu anda yüklenemedi',
  unavailableBody: 'Geçici bir bağlantı sorunu yaşıyoruz. Bağlantın geçerli; birazdan tekrar dene.',
  retry: 'Tekrar dene',
  goHome: 'Ana sayfaya git',
  explore: 'Mekânları keşfet',

  // ── Anket ──
  svMetaTitle: (title: string, venue: string | null) => (venue ? `${title} · ${venue}` : title),
  svMetaDescription: (venue: string | null, n: number) =>
    `${venue ? `${venue} görüşünü soruyor` : 'Görüşün önemli'} · ${n} soru`,
  svMetaNotFound: 'Anket',
  svQuestions: (n: number) => `${n} soru`,
  svDuration: (seconds: number) => minutesLabel(seconds, 'tr'),
  svRequiredCount: (n: number) => (n === 0 ? 'Hepsi isteğe bağlı' : `${n} zorunlu`),
  svPrivacySignedIn: 'Yanıtın hesabınla ilişkilendirilir (her kişi bir kez yanıtlar). İşletme cevaplarını görür; adını ve iletişim bilgini göremez.',
  svPrivacyAnon: 'Yanıtın anonim kaydedilir. İşletme cevaplarını görür; kim olduğunu göremez.',
  svStart: 'Başla',
  svResume: (n: number, total: number) => `Kaldığın yerden devam et (${n}/${total})`,
  svRestart: 'Baştan başla',
  svDraftRestored: 'Önceki cevapların geri yüklendi.',
  svProgressLabel: 'Anket ilerlemesi',
  svStepOf: (i: number, total: number) => `Soru ${i} / ${total}`,
  svRequired: 'Zorunlu',
  svOptional: 'İsteğe bağlı',
  svRequiredSr: '(zorunlu)',
  svRequiredError: 'Devam etmek için bu soruyu yanıtla.',
  svMultiHint: 'Birden fazla seçebilirsin.',
  svOpenPlaceholder: 'Düşüncelerini yaz…',
  svCharCount: (n: number, max: number) => `${n}/${max}`,
  svCharLeft: (n: number) => `${n} karakter kaldı`,
  svRatingLow: 'Hiç memnun değilim',
  svRatingHigh: 'Çok memnunum',
  svRatingItem: (n: number) => `5 üzerinden ${n}`,
  svBack: 'Geri',
  svNext: 'İleri',
  svSkip: 'Atla',
  svToReview: 'Gözden geçir',
  svBackToReview: 'Özete dön',
  svReviewTitle: 'Gönderilmeden önce',
  svReviewBody: 'Cevaplarını kontrol et; değiştirmek istediğin soruya dokun.',
  svReviewEmpty: 'Yanıtlanmadı',
  svReviewMissing: 'Zorunlu, yanıtlanmadı',
  svEditAria: (i: number) => `Soru ${i} cevabını düzenle`,
  svSubmit: 'Gönder',
  svSubmitting: 'Gönderiliyor…',
  svMissingCount: (n: number) => `${n} zorunlu soru yanıtlanmadı.`,
  svJump: 'Sorular',
  svJumpTo: (i: number, answered: boolean) => `Soru ${i}${answered ? ', yanıtlandı' : ''}`,
  svAnswered: (n: number, total: number) => `${n}/${total} yanıtlandı`,
  svNoQuestions: 'Bu ankette şu an yanıtlanabilir soru yok.',
  svSubmitFailed: 'Yanıt gönderilemedi. Bağlantını kontrol edip tekrar dene.',
  svRateLimited: 'Çok fazla deneme yapıldı. Birkaç saniye sonra tekrar dene.',
  svInvalidAnswer: 'Bu cevap geçerli değil. Lütfen kontrol et.',
  // Sonuç
  svThanksTitle: 'Teşekkürler!',
  svThanksBody: (venue: string | null) =>
    venue ? `Yanıtın ${venue} ekibine ulaştı. Görüşün hizmetin gelişmesine yardım ediyor.` : 'Yanıtın işletmeye ulaştı.',
  svAlreadyTitle: 'Bu anketi zaten yanıtladın',
  svAlreadyBody: 'Her kişi bir anketi bir kez yanıtlayabilir. Katkın için teşekkürler!',
  svClosedTitle: 'Bu anket artık yanıt kabul etmiyor',
  svClosedBody: (venue: string | null) =>
    venue ? `${venue} bu anketi kapattı ya da süresi doldu.` : 'İşletme bu anketi kapattı ya da süresi doldu.',
  svNotFoundTitle: 'Anket bulunamadı',
  svNotFoundBody: 'Bağlantı hatalı olabilir. İşletmeden yeni bağlantı isteyebilirsin.',
  svJoinTitle: "Qratex'e katıl",
  svJoinCardTitle: 'Görüşlerin puan kazandırsın',
  svJoinBody: 'Hesabınla mekânlara QR üzerinden geri bildirim bırakır, puan ve rozet kazanırsın.',
  svGoVenue: 'Mekân sayfasına git',
  svGoHome: 'Panelime git',
  svLogin: 'Giriş yap',
} as const;

type Widen<T> = T extends (...args: infer A) => unknown ? (...args: A) => string : T extends string ? string : T;
type Copy = { [K in keyof typeof TR]: Widen<(typeof TR)[K]> };

const EN: Copy = {
  homeAria: 'Qratex home',
  poweredBy: 'Powered by Qratex',
  privacy: 'Privacy',
  kvkk: 'KVKK',
  venueFallback: 'Venue',

  expMetaTitle: (venue) => `A friend recommends ${venue}`,
  expMetaTitleGeneric: 'A friend recommends a place',
  expMetaDescription: (caption, rating) =>
    [caption, rating ? `rated ${rating}/5` : null, 'Qratex anonymous experience card'].filter(Boolean).join(' · '),
  expMetaNotFound: 'Experience card',
  expEyebrow: 'A friend recommends',
  expAnonymousSeal: 'Anonymous card',
  expAnonymousNote: 'The sharer’s personal details are never shown.',
  expRatingAria: (n) => `Rated ${n} out of 5`,
  expRatingLabel: (n) => `${n}/5`,
  expMoodLabel: 'Mood',
  moods: { great: 'Great', good: 'Good', ok: 'Not bad' },
  moodEmoji: { great: '🤩', good: '😊', ok: '🙂' },
  captions: {
    recommend: 'I wholeheartedly recommend it.',
    try_it: 'Drop by if you’re nearby.',
    hidden_gem: 'A hidden gem waiting to be found.',
    great_service: 'The service was really great.',
  },
  categories: {
    kahve: 'Coffee',
    restoran: 'Restaurant',
    tatli: 'Desserts & Bakery',
    kahvalti: 'Breakfast',
    bar: 'Bar & Pub',
    konaklama: 'Stay',
  },
  sharedOn: (date) => `Shared: ${date}`,
  daysLeft: (n) => (n <= 0 ? 'Ends today' : `Open for ${n} more day${n === 1 ? '' : 's'}`),
  open: 'Open now',
  openUntil: (t) => `Open now · closes ${t}`,
  openAllDay: 'Open now · 24 hours',
  closingSoon: (t) => `Closing soon · ${t}`,
  closed: 'Closed now',
  closedOpensToday: (t) => `Closed · opens today at ${t}`,
  closedOpensTomorrow: (t) => `Closed · opens tomorrow at ${t}`,
  closedOpensOn: (day, t) => `Closed · opens ${day} at ${t}`,
  holiday: 'On holiday',
  stats: (count, avg, days) => `${count} reviews in the last ${days} days · average ${avg}/5`,
  statsLabel: 'Venue rating',
  ctaSectionTitle: 'Your turn',
  ctaJoin: 'Join Qratex',
  ctaJoinBody: 'With an account you’ll find this venue in Discover and earn points by scanning the QR code and leaving feedback on your visit.',
  ctaLogin: 'I already have an account',
  ctaVenue: 'Explore the venue',
  ctaVenueBody: 'Opening hours, live offers and directions are on the venue page.',
  ctaHome: 'Discover Qratex',
  directions: 'Directions',
  directionsAria: (venue) => `Directions to ${venue} (opens in a new tab)`,
  ownerTitle: 'This is your card',
  ownerBody: 'This is how people you share with see it. Your identity is hidden.',
  ownerViews: (n) => (n === 0 ? 'No views yet' : `${n} unique view${n === 1 ? '' : 's'}`),
  ownerShare: 'Share link',
  ownerCopied: 'Link copied.',
  ownerCopyFailed: 'Couldn’t copy the link. You can copy it from the address bar.',
  ownerShareText: (venue) => `I recommend ${venue}`,
  ownerRevoke: 'Stop sharing',
  ownerRevokeConfirmTitle: 'Stop sharing this card?',
  ownerRevokeConfirmBody: 'The link closes immediately and visitors will see “sharing ended”. This can’t be undone; you can create a new card from the venue page.',
  ownerRevokeConfirm: 'Yes, stop',
  ownerRevokeCancel: 'Cancel',
  ownerRevoked: 'Sharing stopped.',
  ownerRevokeFailed: 'Couldn’t stop sharing. Please try again.',
  expExpiredTitle: 'This card is no longer shared',
  expExpiredBody: (venue) =>
    venue ? `${venue} is still on Qratex. Explore the venue or share your own experience.` : 'Cards stay open for 7 days. Explore venues near you on Qratex.',
  expNotFoundTitle: 'Card not found',
  expNotFoundBody: 'The link may be wrong or the card was removed.',
  expDisabledTitle: 'Experience cards are turned off',
  expDisabledBody: 'This feature is temporarily disabled. Please try again later.',
  unavailableTitle: 'Couldn’t load right now',
  unavailableBody: 'We’re having a temporary connection issue. Your link is valid; try again shortly.',
  retry: 'Try again',
  goHome: 'Go to home page',
  explore: 'Explore venues',

  svMetaTitle: (title, venue) => (venue ? `${title} · ${venue}` : title),
  svMetaDescription: (venue, n) => `${venue ? `${venue} wants your opinion` : 'Your opinion matters'} · ${n} question${n === 1 ? '' : 's'}`,
  svMetaNotFound: 'Survey',
  svQuestions: (n) => `${n} question${n === 1 ? '' : 's'}`,
  svDuration: (seconds) => minutesLabel(seconds, 'en'),
  svRequiredCount: (n) => (n === 0 ? 'All optional' : `${n} required`),
  svPrivacySignedIn: 'Your response is linked to your account (one response per person). The venue sees your answers but never your name or contact details.',
  svPrivacyAnon: 'Your response is saved anonymously. The venue sees your answers but not who you are.',
  svStart: 'Start',
  svResume: (n, total) => `Continue where you left off (${n}/${total})`,
  svRestart: 'Start over',
  svDraftRestored: 'Your previous answers were restored.',
  svProgressLabel: 'Survey progress',
  svStepOf: (i, total) => `Question ${i} of ${total}`,
  svRequired: 'Required',
  svOptional: 'Optional',
  svRequiredSr: '(required)',
  svRequiredError: 'Answer this question to continue.',
  svMultiHint: 'You can pick more than one.',
  svOpenPlaceholder: 'Share your thoughts…',
  svCharCount: (n, max) => `${n}/${max}`,
  svCharLeft: (n) => `${n} characters left`,
  svRatingLow: 'Very dissatisfied',
  svRatingHigh: 'Very satisfied',
  svRatingItem: (n) => `${n} out of 5`,
  svBack: 'Back',
  svNext: 'Next',
  svSkip: 'Skip',
  svToReview: 'Review',
  svBackToReview: 'Back to summary',
  svReviewTitle: 'Before you send',
  svReviewBody: 'Check your answers; tap a question to change it.',
  svReviewEmpty: 'Not answered',
  svReviewMissing: 'Required, not answered',
  svEditAria: (i) => `Edit answer to question ${i}`,
  svSubmit: 'Send',
  svSubmitting: 'Sending…',
  svMissingCount: (n) => `${n} required question${n === 1 ? '' : 's'} not answered.`,
  svJump: 'Questions',
  svJumpTo: (i, answered) => `Question ${i}${answered ? ', answered' : ''}`,
  svAnswered: (n, total) => `${n}/${total} answered`,
  svNoQuestions: 'This survey has no answerable questions right now.',
  svSubmitFailed: 'Couldn’t send your response. Check your connection and try again.',
  svRateLimited: 'Too many attempts. Please try again in a few seconds.',
  svInvalidAnswer: 'This answer isn’t valid. Please check it.',
  svThanksTitle: 'Thank you!',
  svThanksBody: (venue) => (venue ? `Your response reached the ${venue} team. It helps them improve.` : 'Your response reached the venue.'),
  svAlreadyTitle: 'You already answered this survey',
  svAlreadyBody: 'Each person can answer a survey once. Thanks for contributing!',
  svClosedTitle: 'This survey is no longer accepting responses',
  svClosedBody: (venue) => (venue ? `${venue} closed this survey or it has ended.` : 'The venue closed this survey or it has ended.'),
  svNotFoundTitle: 'Survey not found',
  svNotFoundBody: 'The link may be wrong. You can ask the venue for a new link.',
  svJoinTitle: 'Join Qratex',
  svJoinCardTitle: 'Let your feedback earn points',
  svJoinBody: 'With an account you leave feedback at venues via QR and earn points and badges.',
  svGoVenue: 'Go to venue page',
  svGoHome: 'Go to my dashboard',
  svLogin: 'Sign in',
};

export type ShareCopy = Copy;

export function getShareCopy(locale: ShareLocale): ShareCopy {
  return locale === 'en' ? EN : (TR as unknown as Copy);
}

export function weekdayName(locale: ShareLocale, day: number): string {
  return WEEKDAYS[locale][((day % 7) + 7) % 7];
}

export function formatShareDate(iso: string, locale: ShareLocale): string {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Europe/Istanbul',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatRating(value: number, locale: ShareLocale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value);
}
