/**
 * Tara yüzeyinin metinleri (TR/EN). Sunucu bileşenleri `getScanCopy(locale)`,
 * istemci bileşenleri `useScanCopy()` (components/customer/m-tara/use-scan-copy.ts) kullanır.
 * Ortak messages/*.json'a dokunmadan yüzeye özgü metin tek yerde durur.
 */
import type { QrScannerErrorCode } from '@/lib/hooks/qr-scanner-controller';
import type { CardState, VenueStatus } from './scan-types';

export type ScanLocale = 'tr' | 'en';

export type PermissionGuidePlatform = 'ios' | 'android' | 'desktop';

const tr = {
  pageTitle: 'QR Tara',
  pageDescription: 'Masadaki QR’ı okut, deneyimini anlat, puanını kazan.',

  heroTitle: 'Mekânın QR’ını okut',
  heroBody: 'Kamerayı aç, masadaki QR kodu çerçeveye hizala. Geri bildirim sayfası saniyeler içinde açılır.',
  heroBodyDesktop: 'Bilgisayarının kamerasıyla okutabilir ya da QR’ın altındaki kodu aşağıya yazabilirsin.',
  openCamera: 'Kamerayı aç',
  openingCamera: 'Kamera açılıyor…',
  fromGallery: 'Galeriden QR seç',
  readingImage: 'Görsel okunuyor…',
  privacyNote: 'Görüntü yalnız cihazında işlenir; kaydedilmez, sunucuya gönderilmez.',

  permissionPromptTitle: 'Kamera iznine ihtiyacımız var',
  permissionPromptBody: 'QR’ı okuyabilmek için tarayıcın bir kez kamera izni isteyecek. “İzin ver”i seçmen yeterli.',
  permissionDeniedTitle: 'Kamera izni kapalı',
  permissionDeniedBody: 'Bu site için kamera engellenmiş. İzni açtıktan sonra “Tekrar dene”ye bas; beklemek istemezsen kodu elle gir ya da galeriden seç.',
  permissionGuide: {
    ios: [
      'Ayarlar › Safari › Kamera’yı aç ve “Sor” ya da “İzin Ver”i seç.',
      'Ana ekrana eklediysen: Ayarlar › Qratex › Kamera’yı aç.',
      'Bu sayfaya dönüp “Tekrar dene”ye bas.',
    ],
    android: [
      'Adres çubuğundaki kilit/ayar simgesine dokun.',
      '“İzinler” › “Kamera”yı “İzin ver” yap.',
      'Bu sayfaya dönüp “Tekrar dene”ye bas.',
    ],
    desktop: [
      'Adres çubuğunun solundaki kilit simgesine tıkla.',
      '“Kamera” iznini “İzin ver” yap.',
      'Sayfayı yenile ya da “Tekrar dene”ye bas.',
    ],
  } satisfies Record<PermissionGuidePlatform, string[]>,
  retry: 'Tekrar dene',

  cameraErrors: {
    'permission-denied': 'Kamera izni verilmedi.',
    'policy-blocked': 'Kamera bu sayfada güvenlik politikası nedeniyle kapalı. Sayfayı yenileyip tekrar dene.',
    'not-found': 'Bu cihazda çalışan bir kamera bulunamadı. Kodu elle girebilir ya da galeriden seçebilirsin.',
    'in-use': 'Kamera başka bir uygulama ya da sekme tarafından kullanılıyor. Onu kapatıp tekrar dene.',
    'insecure-context': 'Kamera yalnız güvenli bağlantıda (HTTPS) açılabilir.',
    unsupported: 'Bu tarayıcı kamerayla QR okumayı desteklemiyor. Kodu elle gir ya da galeriden seç.',
    'element-missing': 'Tarama alanı hazırlanamadı. Sayfayı yenileyip tekrar dene.',
    unknown: 'Kamera başlatılamadı. Tekrar dene ya da kodu elle gir.',
  } satisfies Record<QrScannerErrorCode, string>,

  viewfinderTitle: 'QR tarayıcı',
  viewfinderHint: 'QR’ı çerçeveye hizala',
  viewfinderStarting: 'Kamera açılıyor…',
  viewfinderChecking: 'Kod doğrulanıyor…',
  viewfinderRecognized: 'Tanındı',
  closeCamera: 'Kamerayı kapat',
  torchOn: 'Feneri aç',
  torchOff: 'Feneri kapat',
  switchCamera: 'Kamerayı değiştir',
  zoom: 'Yakınlaştırma',
  typeInstead: 'Kodu elle gir',

  manualTitle: 'Kodu elle gir',
  manualBody: 'QR’ın altındaki kodu yaz ya da bağlantıyı yapıştır.',
  manualLabel: 'Mekân kodu',
  manualPlaceholder: 'Örn. AB12CD34',
  manualSubmit: 'Devam et',
  manualEmpty: 'Önce kodu yaz.',

  notQratex: 'Bu bir Qratex kodu değil. Masadaki Qratex QR’ını okut.',
  venueErrors: {
    not_found: 'Bu kodla bir mekân bulunamadı. Kodu kontrol edip tekrar dene.',
    inactive: 'Bu QR şu anda kullanıma kapalı. İşletme yetkilisinden yardım iste.',
    expired: 'Bu masa kodunun süresi dolmuş. Garsondan güncel QR’ı iste.',
    revoked: 'Bu masa kodu yenilenmiş. Garsondan güncel QR’ı iste.',
    archived: 'Bu QR artık kullanılmıyor. Garsondan güncel QR’ı iste.',
  } satisfies Record<Exclude<VenueStatus, 'ok'>, string>,
  networkErrors: {
    offline: 'İnternet bağlantın yok. Bağlantı gelince tekrar dene.',
    network: 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.',
    rate_limited: 'Çok hızlı denedin. {seconds} sn sonra tekrar dene.',
    session: 'Oturumun sona ermiş. Devam etmek için yeniden giriş yap.',
    server: 'Kod şu an doğrulanamadı. Birazdan tekrar dene.',
  },
  galleryNoCode: 'Bu görselde okunabilir bir QR bulunamadı. Daha net bir fotoğraf dene.',
  signIn: 'Giriş yap',

  venueEyebrow: 'Mekân bulundu',
  lastVisit: 'Son geri bildirimin: {date}',
  firstVisit: 'Bu mekâna ilk geri bildirimin olacak',
  rewardTitle: 'Bu ziyaretin taban ödülü',
  rewardShort: '+{points} puan',
  rewardDetailed: '{threshold}+ karakterlik yorumla +{points} puan',
  rewardCapReached: 'Bugünkü geri bildirim puanı tavanına ulaştın. Görüşün yine işletmeye ulaşır; puan yarın devam eder.',
  rewardRemaining: 'Bugün geri bildirimden kazanabileceğin: {points} puan',
  rewardNote: 'Kampanya ve statü çarpanları gönderimde eklenir.',
  startFeedback: 'Geri bildirime başla',
  openingFeedback: 'Açılıyor…',
  scanAnother: 'Başka kod okut',
  close: 'Kapat',

  cardEyebrow: 'Qratex kartı',
  cardUnusedTitle: 'Bu kart henüz kimseye bağlı değil',
  cardUnusedBody: 'Hesabına bağladığında işletmede kartını okuttuğun her harcama hesabına işlenir.',
  cardUnusedHasOther: 'Hesabında zaten bir kart var; bu kart da hesabına eklenecek.',
  cardActivate: 'Kartı hesabıma bağla',
  cardActivating: 'Bağlanıyor…',
  cardActivatedTitle: 'Kart hesabına bağlandı',
  cardActivatedBody: 'Artık işletmede bu kartı okuttuğunda harcamaların hesabına işlenecek.',
  cardMineTitle: 'Bu kart zaten senin',
  cardMineBody: 'Kart hesabına bağlı. Kartının ayrıntılarını Kartım sayfasında görebilirsin.',
  goToMyCard: 'Kartıma git',
  cardErrors: {
    taken: 'Bu kart başka bir hesaba bağlı. Kart senin ise işletmeye ya da destek ekibine başvur.',
    blocked: 'Bu kart kullanıma kapatılmış. Ayrıntı için işletmeye başvur.',
    not_found: 'Bu kart bulunamadı. QR’ı yeniden okutmayı dene.',
    failed: 'Kart bağlanamadı. Birazdan tekrar dene.',
  } satisfies Record<Exclude<CardState, 'unused' | 'mine'> | 'failed', string>,

  sideRewardTitle: 'Okut ve kazan',
  sideBalance: 'Bakiyen',
  points: 'puan',
  sideRecentTitle: 'Son mekânların',
  sideRecentEmpty: 'Henüz bir mekâna geri bildirim vermedin. İlk QR’ını okut, burada görünsün.',
  sideRecentAll: 'Tüm geri bildirimlerim',
  summaryError: 'Ödül özetin şu an yüklenemedi. Tarama çalışmaya devam ediyor.',
  summaryRetry: 'Yeniden yükle',

  cardHintTitle: 'Fiziksel Qratex kartın var mı?',
  cardHintBody: 'Kartın arkasındaki QR’ı okut; tek dokunuşla hesabına bağlayalım.',
  cardHintAction: 'Kartımı okut',

  announceCameraOn: 'Kamera açık. QR kodu çerçeveye hizalayın.',
  announceCameraOff: 'Kamera kapandı.',
  today: 'bugün',
  yesterday: 'dün',
};

export type ScanCopy = typeof tr;

const en: ScanCopy = {
  pageTitle: 'Scan QR',
  pageDescription: 'Scan the QR on your table, share your experience, earn points.',

  heroTitle: 'Scan the venue’s QR',
  heroBody: 'Open the camera and line up the QR on your table. The feedback page opens in seconds.',
  heroBodyDesktop: 'Scan with your computer’s camera or type the code printed under the QR below.',
  openCamera: 'Open camera',
  openingCamera: 'Opening camera…',
  fromGallery: 'Pick a QR from gallery',
  readingImage: 'Reading image…',
  privacyNote: 'The image is processed only on your device; it is never stored or uploaded.',

  permissionPromptTitle: 'We need camera access',
  permissionPromptBody: 'Your browser will ask for camera permission once so we can read the QR. Just choose “Allow”.',
  permissionDeniedTitle: 'Camera access is off',
  permissionDeniedBody: 'The camera is blocked for this site. Turn it on, then tap “Try again” — or type the code / pick from gallery.',
  permissionGuide: {
    ios: [
      'Settings › Safari › Camera, choose “Ask” or “Allow”.',
      'If you added the app to your home screen: Settings › Qratex › Camera.',
      'Come back and tap “Try again”.',
    ],
    android: [
      'Tap the lock/settings icon in the address bar.',
      'Set “Permissions” › “Camera” to “Allow”.',
      'Come back and tap “Try again”.',
    ],
    desktop: [
      'Click the lock icon at the left of the address bar.',
      'Set “Camera” to “Allow”.',
      'Reload the page or click “Try again”.',
    ],
  },
  retry: 'Try again',

  cameraErrors: {
    'permission-denied': 'Camera permission was not granted.',
    'policy-blocked': 'The camera is disabled on this page by a security policy. Reload and try again.',
    'not-found': 'No working camera was found on this device. Type the code or pick from gallery.',
    'in-use': 'The camera is being used by another app or tab. Close it and try again.',
    'insecure-context': 'The camera only works over a secure (HTTPS) connection.',
    unsupported: 'This browser cannot scan QR codes with the camera. Type the code or pick from gallery.',
    'element-missing': 'The scan area could not be prepared. Reload the page and try again.',
    unknown: 'The camera could not start. Try again or type the code.',
  },

  viewfinderTitle: 'QR scanner',
  viewfinderHint: 'Line up the QR inside the frame',
  viewfinderStarting: 'Opening camera…',
  viewfinderChecking: 'Checking code…',
  viewfinderRecognized: 'Recognized',
  closeCamera: 'Close camera',
  torchOn: 'Turn on flashlight',
  torchOff: 'Turn off flashlight',
  switchCamera: 'Switch camera',
  zoom: 'Zoom',
  typeInstead: 'Type the code',

  manualTitle: 'Type the code',
  manualBody: 'Enter the code printed under the QR or paste the link.',
  manualLabel: 'Venue code',
  manualPlaceholder: 'e.g. AB12CD34',
  manualSubmit: 'Continue',
  manualEmpty: 'Type the code first.',

  notQratex: 'This is not a Qratex code. Scan the Qratex QR on your table.',
  venueErrors: {
    not_found: 'No venue matches this code. Check it and try again.',
    inactive: 'This QR is currently disabled. Ask the staff for help.',
    expired: 'This table code has expired. Ask the staff for the current QR.',
    revoked: 'This table code was renewed. Ask the staff for the current QR.',
    archived: 'This QR is no longer in use. Ask the staff for the current QR.',
  },
  networkErrors: {
    offline: 'You are offline. Try again once you are connected.',
    network: 'Could not reach the server. Check your connection and try again.',
    rate_limited: 'Too many attempts. Try again in {seconds}s.',
    session: 'Your session has ended. Sign in again to continue.',
    server: 'The code could not be checked right now. Try again shortly.',
  },
  galleryNoCode: 'No readable QR was found in this image. Try a sharper photo.',
  signIn: 'Sign in',

  venueEyebrow: 'Venue found',
  lastVisit: 'Your last feedback: {date}',
  firstVisit: 'This will be your first feedback here',
  rewardTitle: 'Base reward for this visit',
  rewardShort: '+{points} points',
  rewardDetailed: '+{points} points with a {threshold}+ character review',
  rewardCapReached: 'You reached today’s feedback points cap. Your feedback still reaches the venue; points resume tomorrow.',
  rewardRemaining: 'You can still earn {points} points from feedback today',
  rewardNote: 'Campaign and status multipliers are added on submit.',
  startFeedback: 'Start feedback',
  openingFeedback: 'Opening…',
  scanAnother: 'Scan another code',
  close: 'Close',

  cardEyebrow: 'Qratex card',
  cardUnusedTitle: 'This card isn’t linked to anyone yet',
  cardUnusedBody: 'Once linked, every purchase you scan this card for at a venue is added to your account.',
  cardUnusedHasOther: 'You already have a card; this one will be added to your account too.',
  cardActivate: 'Link card to my account',
  cardActivating: 'Linking…',
  cardActivatedTitle: 'Card linked to your account',
  cardActivatedBody: 'From now on, purchases scanned with this card are added to your account.',
  cardMineTitle: 'This card is already yours',
  cardMineBody: 'The card is linked to your account. See its details on the My Card page.',
  goToMyCard: 'Go to my card',
  cardErrors: {
    taken: 'This card is linked to another account. If it is yours, contact the venue or support.',
    blocked: 'This card has been disabled. Contact the venue for details.',
    not_found: 'This card was not found. Try scanning the QR again.',
    failed: 'The card could not be linked. Try again shortly.',
  },

  sideRewardTitle: 'Scan and earn',
  sideBalance: 'Your balance',
  points: 'points',
  sideRecentTitle: 'Your recent venues',
  sideRecentEmpty: 'You haven’t left feedback anywhere yet. Scan your first QR and it will show up here.',
  sideRecentAll: 'All my feedback',
  summaryError: 'Your reward summary could not be loaded. Scanning still works.',
  summaryRetry: 'Reload',

  cardHintTitle: 'Have a physical Qratex card?',
  cardHintBody: 'Scan the QR on the back of the card and we’ll link it to your account in one tap.',
  cardHintAction: 'Scan my card',

  announceCameraOn: 'Camera on. Line up the QR inside the frame.',
  announceCameraOff: 'Camera closed.',
  today: 'today',
  yesterday: 'yesterday',
};

export function getScanCopy(locale: string | null | undefined): ScanCopy {
  return locale === 'en' ? en : tr;
}

/** `{ad}` yer tutucularını doldurur. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const ISTANBUL_TZ = 'Europe/Istanbul';

function istanbulDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "bugün" / "dün" / "12 Eki" — gün sınırı Europe/Istanbul. */
export function formatVisitDate(iso: string, locale: ScanLocale, copy: ScanCopy, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = istanbulDayKey(d);
  if (day === istanbulDayKey(now)) return copy.today;
  if (day === istanbulDayKey(new Date(now.getTime() - 86_400_000))) return copy.yesterday;
  const sameYear =
    new Intl.DateTimeFormat('en', { timeZone: ISTANBUL_TZ, year: 'numeric' }).format(d) ===
    new Intl.DateTimeFormat('en', { timeZone: ISTANBUL_TZ, year: 'numeric' }).format(now);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d);
}

export function formatPoints(n: number, locale: ScanLocale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR').format(n);
}
