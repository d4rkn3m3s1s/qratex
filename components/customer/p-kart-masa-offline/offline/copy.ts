/**
 * Çevrimdışı yedek sayfa metinleri (TR/EN). Sayfa build anında statik üretilir ve SW
 * tarafından ön belleğe alınır; dil, satır içi betikte cihazdaki dil tercihinden
 * (`qratex-locale`) seçilir. Bu yüzden iki dil de JSON olarak sayfaya gömülür.
 */
export type OfflineLocale = 'tr' | 'en';

const tr = {
  title: 'İnternet bağlantısı yok',
  statusOffline: 'Çevrimdışı',
  statusChecking: 'Bağlantı deneniyor…',
  statusBack: 'Bağlantı geri geldi, sayfa açılıyor…',
  statusStill: 'Hâlâ çevrimdışı · sonraki deneme {seconds} sn',
  contextDefault: 'Bağlantı gelince kaldığın sayfa kendiliğinden açılacak.',
  contextCard: 'Kart bağlantın bu adreste duruyor; bağlantı gelince kart sayfası kendiliğinden açılacak.',
  contextFeedback: 'Masadaki QR bu adreste duruyor; bağlantı gelince değerlendirme sayfası kendiliğinden açılacak. QR’ı yeniden okutman gerekmez.',
  contextSignal: 'Masa sinyali sayfası bağlantı gelince kendiliğinden açılacak.',
  contextWallet: 'Kartını aşağıdan kasada gösterebilirsin; bağlantı gelince Cüzdan kendiliğinden açılacak.',
  retry: 'Şimdi tekrar dene',
  home: 'Ana sayfa',
  cardTitle: 'Son kaydedilen kartın',
  cardSaved: '{time} itibarıyla',
  cardNote: 'Kart kodu sabittir; kasada okutulabilir. Kartı dondurduysan ya da yeni kod aldıysan bu görüntü geçersizdir.',
  cardShow: 'Kasada göster',
  cardClose: 'Kapat',
  cardFullscreenTitle: 'Kasada okut',
  cardQrAlt: 'Kart QR kodu',
  cachedTitle: 'Çevrimdışı açılabilen sayfalar',
  cachedNote: 'Bu sayfaların son kopyası cihazında; bilgiler güncel olmayabilir.',
  pendingSignals: '{count} masa sinyali bu cihazda bekliyor; masa sinyali sayfası açılınca gönderilecek.',
  pages: {
    '/': 'Ana sayfa',
    '/customer': 'Ana sayfam',
    '/customer/wallet': 'Cüzdan',
    '/customer/wallet/card': 'Kartım',
    '/customer/wallet/activity': 'Hareketler',
    '/customer/wallet/rewards': 'Ödüller',
    '/customer/games': 'Oyna',
    '/customer/me': 'Ben',
    '/customer/places': 'Keşfet',
    '/dealer': 'İşletme paneli',
    '/staff': 'Personel paneli',
    '/blog': 'Blog',
  } as Record<string, string>,
};

export type OfflineCopy = typeof tr;

const en: OfflineCopy = {
  title: 'No internet connection',
  statusOffline: 'Offline',
  statusChecking: 'Checking connection…',
  statusBack: 'You’re back online, opening the page…',
  statusStill: 'Still offline · next try in {seconds}s',
  contextDefault: 'The page you were on will open automatically once you’re back online.',
  contextCard: 'Your card link is kept in this address; the card page opens automatically once you’re back online.',
  contextFeedback: 'The table QR is kept in this address; the review page opens automatically once you’re back online. No need to scan again.',
  contextSignal: 'The table signal page opens automatically once you’re back online.',
  contextWallet: 'You can show your card at checkout below; your Wallet opens automatically once you’re back online.',
  retry: 'Try now',
  home: 'Home',
  cardTitle: 'Your last saved card',
  cardSaved: 'as of {time}',
  cardNote: 'The card code is static and can be scanned at checkout. If you froze the card or got a new code, this copy is no longer valid.',
  cardShow: 'Show at checkout',
  cardClose: 'Close',
  cardFullscreenTitle: 'Scan at checkout',
  cardQrAlt: 'Card QR code',
  cachedTitle: 'Pages available offline',
  cachedNote: 'Your device has the last copy of these pages; details may be out of date.',
  pendingSignals: '{count} table signal(s) waiting on this device; they’ll be sent when the table signal page opens.',
  pages: {
    '/': 'Home',
    '/customer': 'My home',
    '/customer/wallet': 'Wallet',
    '/customer/wallet/card': 'My card',
    '/customer/wallet/activity': 'Activity',
    '/customer/wallet/rewards': 'Rewards',
    '/customer/games': 'Play',
    '/customer/me': 'Me',
    '/customer/places': 'Explore',
    '/dealer': 'Business panel',
    '/staff': 'Staff panel',
    '/blog': 'Blog',
  },
};

export const OFFLINE_COPY: Record<OfflineLocale, OfflineCopy> = { tr, en };
