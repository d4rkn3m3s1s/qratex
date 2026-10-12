/**
 * Ana sayfa (`/`) metinleri — TR/EN. Sunucuda dil çerezine göre seçilir; istemci adalarına
 * yalnız ihtiyaç duydukları alt nesne geçer (eski ~400 KB TR+EN sözlüğü bu sayfa için
 * istemciye gitmez). `{ad}` yer tutucuları `fmt()` ile doldurulur; sayılar sunucudan.
 */
import type { PublicLocale } from './fmt';

export interface LandingCopy {
  hero: {
    eyebrow: string;
    titleLead: string;
    titleAccent: string;
    sub: string;
    ctaPrimary: string;
    ctaBusiness: string;
    loginPrompt: string;
    loginLink: string;
    qrHint: string;
    shotCustomerAlt: string;
    shotBusinessAlt: string;
    shotCaption: string;
  };
  story: {
    exampleTag: string;
    scanTitle: string;
    scanBody: string;
    rateTitle: string;
    rateBody: string;
    rewardTitle: string;
    rewardBody: string;
    staticSummary: string;
  };
  stats: {
    eyebrow: string;
    heading: string;
    members: string;
    businesses: string;
    feedbacks: string;
    feedbacksLast30d: string;
    rating: string;
    ratingSuffix: string;
    updated: string;
    earlyTitle: string;
    earlyBody: string;
  };
  earn: {
    eyebrow: string;
    title: string;
    sub: string;
    steps: Array<{ title: string; body: string }>;
    note: string;
  };
  tryIt: {
    eyebrow: string;
    title: string;
    sub: string;
    ratingLabel: string;
    textLabel: string;
    textPlaceholder: string;
    counter: string;
    resultIdle: string;
    result: string;
    detailedHint: string;
    detailedDone: string;
    cta: string;
    reset: string;
    pointsUnit: string;
  };
  collection: {
    eyebrow: string;
    title: string;
    sub: string;
    categoryCount: string;
    mysteryNote: string;
    /** Katalog adları Türkçe; yoksa katalog adı gösterilir (anahtar → yerel ad). */
    categoryNames?: Record<string, string>;
    leagueNames?: Record<string, string>;
    leaguesTitle: string;
    leaguesSub: string;
    leagueFrom: string;
    extrasTitle: string;
    referral: string;
    streak: string;
    streakItem: string;
    spin: string;
  };
  business: {
    eyebrow: string;
    title: string;
    sub: string;
    points: string[];
    priceFree: string;
    priceFrom: string;
    priceUnknown: string;
    ctaWhy: string;
    ctaPricing: string;
    ctaRegister: string;
    priceLabel: string;
  };
  faq: {
    eyebrow: string;
    title: string;
    trustLink: string;
    items: Array<{ q: string; a: string }>;
    businessQuestion: string;
    freePlanAnswer: string;
    paidOnlyAnswer: string;
    contactAnswer: string;
  };
  final: {
    title: string;
    sub: string;
    ctaPrimary: string;
    ctaBusiness: string;
  };
  schema: { breadcrumbHome: string };
  meta: { title: string; description: string };
}

const tr: LandingCopy = {
  hero: {
    eyebrow: 'QR ile geri bildirim, puanla ödül',
    titleLead: 'Fikrin',
    titleAccent: 'puan eder.',
    sub:
      'QR kodu okut, deneyimini birkaç saniyede paylaş. Her geri bildirim puan ve XP kazandırır; puanların rozete, lige ve ödüle dönüşür. İşletme de seni gerçekten duyar.',
    ctaPrimary: 'Ücretsiz üye ol',
    ctaBusiness: 'İşletmem için',
    loginPrompt: 'Zaten üye misin?',
    loginLink: 'Giriş yap',
    qrHint: 'Uygulama indirmen gerekmez: telefonunun kamerasıyla QR kodu okutman yeter.',
    shotCustomerAlt: 'Müşteri ana ekranı: puan bakiyesi, seviye, alınabilir ödüller ve QR tara düğmesi',
    shotBusinessAlt: 'İşletme paneli Bugün ekranı: günün geri bildirimleri, ortalama puan ve yanıt oranı',
    shotCaption: 'Gerçek ürün ekranları (demo hesap).',
  },
  story: {
    exampleTag: 'Örnek görünüm',
    scanTitle: 'QR kodu okut',
    scanBody: 'Masadaki kodu kameranla tara.',
    rateTitle: 'Deneyimini puanla',
    rateBody: 'Yıldızları seç, istersen birkaç cümle yaz.',
    rewardTitle: '+{points} puan',
    rewardBody: 'Üye hesabınla cüzdanına geçer. +{xp} XP',
    staticSummary: 'QR kodu okut → deneyimini puanla → +{points} puan, +{xp} XP',
  },
  stats: {
    eyebrow: 'Canlı rakamlar',
    heading: 'Uydurma yok. Gerçek sayılar.',
    members: 'Kayıtlı üye',
    businesses: 'İşletme',
    feedbacks: 'Geri bildirim',
    feedbacksLast30d: 'Son 30 günde geri bildirim',
    rating: 'Ortalama puan',
    ratingSuffix: '/ 5',
    updated: 'Rakamlar {time} itibarıyla; 10 dakikada bir yenilenir. Demo hesaplar ve silinen geri bildirimler sayılmaz.',
    earlyTitle: 'Yeni başlıyoruz',
    earlyBody:
      '{brand} topluluğu büyüyor. İlk üyeler ve işletmeler arasında yer al; rakamlar anlamlı büyüklüğe ulaştığında burada gerçek değerleriyle görünecek.',
  },
  earn: {
    eyebrow: 'Nasıl çalışır',
    title: 'Dört adımda kazan',
    sub: 'Aşağıdaki rakamlar platformun güncel puan kurallarından gelir.',
    steps: [
      { title: 'Okut', body: 'Kafede, restoranda ya da mağazada masadaki QR kodu telefonunun kamerasıyla okut.' },
      {
        title: 'Paylaş, puan kazan',
        body:
          'Her geri bildirim +{base} puan ve +{baseXp} XP. {threshold} karakteri geçen detaylı yorum +{detailed} puan ve +{detailedXp} XP.',
      },
      {
        title: 'Rozet aç, ligde yüksel',
        body: 'Yorum üslubuna göre {characters} karakter rozetinden birini açarsın; toplam puanınla {leagueCount} lig basamağında ilerlersin.',
      },
      { title: 'Ödülünü al', body: 'Puanlarını ödül kataloğunda harca; serini koru, görevleri tamamla, mini oyunlarla eğlen.' },
    ],
    note:
      'Puan yalnız üye hesabıyla verilen geri bildirimlerde kazanılır. Geri bildirimden günde en fazla {dailyCap} puan kazanılır; kampanya dönemlerinde çarpan uygulanabilir.',
  },
  tryIt: {
    eyebrow: 'Dene',
    title: 'Geri bildirimin kaç puan eder?',
    sub: 'Bu bir deneme alanı: hiçbir şey gönderilmez, yalnızca puan kuralını gösterir.',
    ratingLabel: 'Deneyimini puanla',
    textLabel: 'Birkaç cümle yaz (isteğe bağlı)',
    textPlaceholder: 'Örneğin: Kahve çok iyiydi ama sıra biraz uzundu.',
    counter: '{n} / {threshold} karakter (detaylı yorum eşiği)',
    resultIdle: 'Bir puan seçtiğinde kazancın burada görünür.',
    result: 'Bu geri bildirim üye hesabıyla +{points} puan ve +{xp} XP kazandırırdı.',
    detailedHint: '{remaining} karakter daha yazarsan detaylı yorum sayılır: +{detailed} puan.',
    detailedDone: 'Detaylı yorum eşiğini geçtin.',
    cta: 'Gerçeğini yapmak için üye ol',
    reset: 'Sıfırla',
    pointsUnit: 'puan',
  },
  collection: {
    eyebrow: 'Koleksiyon ve lig',
    title: 'Üslubun, karakterin.',
    sub:
      'Yapay zekâ yorumlarının üslubunu okur ve seni {categoryCount} kategorideki {characters} karakterden biriyle eşleştirir. Hangisi olduğun, kategori barın dolunca açılır.',
    categoryCount: '{n} karakter',
    mysteryNote: 'Gizemli kategori yalnız uzun ve özenli yorumları sayar.',
    leaguesTitle: 'Lig basamakları',
    leaguesSub: 'Toplam puanın seni bir üst lige taşır.',
    leagueFrom: '{points} puandan itibaren',
    extrasTitle: 'Daha fazla kazanma yolu',
    referral: 'Arkadaşını davet et: davet tamamlanınca sen +{referrer}, arkadaşın +{referred} puan.',
    streak: 'Seri ödülleri: {list}.',
    streakItem: '{days}. gün +{points}',
    spin: 'Her gün şans çarkını çevir.',
  },
  business: {
    eyebrow: 'İşletmeler için',
    title: 'Müşterin konuşsun. Sen duy.',
    sub:
      'Geri bildirim QR ile anında paneline düşer; yapay zekâ duyguyu ve konuyu özetler, oyunlaştırma müşteriyi geri getirir.',
    points: [
      'QR ile anında geri bildirim; kâğıt anket ya da e-posta formu yok',
      'Yapay zekâ ile duygu, konu ve niyet özeti',
      'Olumsuz deneyime otomatik yanıt ve telafi teklifi',
      'Puan, rozet ve kampanyalarla sadakat',
    ],
    priceFree: 'Ücretsiz planla başlayabilirsin.',
    priceFrom: 'Ücretli planlar {price}{interval} başlar.',
    priceUnknown: 'Planlar ve kotalar işletme sayfasında.',
    ctaWhy: 'İşletmeler için {brand}',
    ctaPricing: 'Planları gör',
    ctaRegister: 'İşletme hesabı aç',
    priceLabel: 'Fiyat',
  },
  faq: {
    eyebrow: 'Sık sorulanlar',
    title: 'Kısa sorular, net cevaplar.',
    trustLink: 'Güven ve gizlilik ayrıntıları',
    items: [
      {
        q: 'Geri bildirim vermek için üye olmam gerekir mi?',
        a: 'Hayır. QR kodu okutup üye olmadan da geri bildirim verebilirsin. Puan, XP ve rozet kazanmak için ücretsiz üye hesabıyla vermen gerekir.',
      },
      {
        q: 'Puanları nasıl kazanırım?',
        a: 'Her geri bildirim +{base} puan, {threshold} karakteri geçen detaylı yorum +{detailed} puan kazandırır. Davet, seri ödülleri, görevler ve mini oyunlar ek puan sağlar. Geri bildirimden günde en fazla {dailyCap} puan kazanılır.',
      },
      {
        q: 'Puanlarımı nerede kullanırım?',
        a: 'Cüzdanındaki ödül kataloğunda. Aldığın ödül, kasada gösterebileceğin bir koda dönüşür ve "Ödüllerim" bölümünde saklanır.',
      },
      {
        q: 'İşletme benim hakkımda neyi görür?',
        a: 'Üye olarak verdiğin geri bildirimde işletme adını ve profil fotoğrafını görür. Telefon numaran hiçbir işletmeyle paylaşılmaz. Hangi bilginin kimde göründüğünü Güven sayfasında tek tek anlattık.',
      },
      {
        q: 'Verilerimi indirip hesabımı silebilir miyim?',
        a: 'Evet. Ayarlar → Gizlilik bölümünden verilerinin bir kopyasını indirebilir, hesabını silebilir ya da KVKK başvurusu yapabilirsin.',
      },
    ],
    businessQuestion: 'İşletmeler için ücretli mi?',
    freePlanAnswer:
      'İşletmeler ücretsiz planla başlayıp ihtiyaç duyduğunda ücretli plana geçebilir. Güncel planlar ve kotalar işletme sayfasında.',
    paidOnlyAnswer: 'Güncel planlar, fiyatlar ve kotalar işletme sayfasında listelenir.',
    contactAnswer: 'Plan ve fiyat bilgisi için {email} adresine yazabilirsin; işletmene uygun planı birlikte belirleriz.',
  },
  final: {
    title: 'Sıradaki QR senin.',
    sub: 'Ücretsiz üye ol, bir sonraki ziyaretinde QR kodu okut ve kazanmaya başla.',
    ctaPrimary: 'Ücretsiz üye ol',
    ctaBusiness: 'İşletme hesabı aç',
  },
  schema: { breadcrumbHome: 'Ana Sayfa' },
  meta: {
    title: '{brand}: Geri bildirim ver, ödül kazan',
    description:
      'Masadaki QR kodu okut, deneyimini paylaş; her geri bildirimle puan, rozet ve ödül kazan. İşletmeler için QR geri bildirim, yapay zekâ analizi ve oyunlaştırma.',
  },
};

const en: LandingCopy = {
  hero: {
    eyebrow: 'Share feedback, earn rewards',
    titleLead: 'Your opinion',
    titleAccent: 'pays off.',
    sub:
      'Scan the QR code and share your experience in seconds. Every piece of feedback earns points and XP that turn into badges, leagues and rewards. And the business actually hears you.',
    ctaPrimary: 'Join for free',
    ctaBusiness: 'For my business',
    loginPrompt: 'Already a member?',
    loginLink: 'Sign in',
    qrHint: 'No app needed: just scan the QR code with your phone camera.',
    shotCustomerAlt: 'Customer home screen: points balance, level, claimable rewards and the scan QR button',
    shotBusinessAlt: 'Business dashboard Today screen: feedback of the day, average rating and reply rate',
    shotCaption: 'Real product screens (demo account).',
  },
  story: {
    exampleTag: 'Example view',
    scanTitle: 'Scan the QR code',
    scanBody: 'Point your camera at the code on the table.',
    rateTitle: 'Rate your experience',
    rateBody: 'Pick the stars and add a few words if you like.',
    rewardTitle: '+{points} points',
    rewardBody: 'Added to your wallet with a member account. +{xp} XP',
    staticSummary: 'Scan the QR code → rate your experience → +{points} points, +{xp} XP',
  },
  stats: {
    eyebrow: 'Live numbers',
    heading: 'No made-up figures. Real numbers.',
    members: 'Registered members',
    businesses: 'Businesses',
    feedbacks: 'Feedback entries',
    feedbacksLast30d: 'Feedback in the last 30 days',
    rating: 'Average rating',
    ratingSuffix: '/ 5',
    updated: 'Numbers as of {time}; refreshed every 10 minutes. Demo accounts and deleted feedback are excluded.',
    earlyTitle: 'We are just getting started',
    earlyBody:
      'The {brand} community is growing. Be among the first members and businesses; real numbers will appear here once they are meaningful.',
  },
  earn: {
    eyebrow: 'How it works',
    title: 'Earn in four steps',
    sub: 'The numbers below come from the platform’s current points rules.',
    steps: [
      { title: 'Scan', body: 'At a café, restaurant or store, scan the QR code on the table with your phone camera.' },
      {
        title: 'Share and earn',
        body:
          'Every feedback earns +{base} points and +{baseXp} XP. A detailed review over {threshold} characters earns +{detailed} points and +{detailedXp} XP.',
      },
      {
        title: 'Unlock badges, climb leagues',
        body: 'Your writing style unlocks one of {characters} character badges; your total points move you through {leagueCount} league tiers.',
      },
      { title: 'Claim rewards', body: 'Spend points in the reward catalog; keep your streak, finish quests and play mini games.' },
    ],
    note:
      'Points are earned only for feedback given with a member account. Feedback earns at most {dailyCap} points per day; multipliers may apply during campaigns.',
  },
  tryIt: {
    eyebrow: 'Try it',
    title: 'How many points is your feedback worth?',
    sub: 'This is a sandbox: nothing is sent, it only shows the points rule.',
    ratingLabel: 'Rate your experience',
    textLabel: 'Write a few words (optional)',
    textPlaceholder: 'For example: Great coffee, but the queue was a bit long.',
    counter: '{n} / {threshold} characters (detailed review threshold)',
    resultIdle: 'Pick a rating to see what you would earn.',
    result: 'With a member account this feedback would earn +{points} points and +{xp} XP.',
    detailedHint: 'Write {remaining} more characters to count as a detailed review: +{detailed} points.',
    detailedDone: 'You passed the detailed review threshold.',
    cta: 'Join to do it for real',
    reset: 'Reset',
    pointsUnit: 'points',
  },
  collection: {
    eyebrow: 'Collection and leagues',
    title: 'Your style, your character.',
    sub:
      'AI reads the style of your reviews and matches you with one of {characters} characters across {categoryCount} categories. Which one you are is revealed when the category bar fills up.',
    categoryCount: '{n} characters',
    mysteryNote: 'The mystery category only counts long, thoughtful reviews.',
    categoryNames: {
      'dram-suc': 'Drama / Crime',
      komedi: 'Comedy',
      fantastik: 'Fantasy',
      'gizem-gerilim': 'Mystery / Thriller',
      gizemli: 'Enigma',
    },
    leagueNames: { BASLANGIC: 'Starter', SAVASCI: 'Warrior' },
    leaguesTitle: 'League tiers',
    leaguesSub: 'Your total points move you up a league.',
    leagueFrom: 'from {points} points',
    extrasTitle: 'More ways to earn',
    referral: 'Invite a friend: once the invite completes you get +{referrer}, your friend +{referred} points.',
    streak: 'Streak rewards: {list}.',
    streakItem: 'day {days} +{points}',
    spin: 'Spin the daily wheel.',
  },
  business: {
    eyebrow: 'For businesses',
    title: 'Let customers talk. You listen.',
    sub: 'Feedback lands in your dashboard the moment a QR code is scanned; AI summarizes sentiment and topics, gamification brings customers back.',
    points: [
      'Instant feedback via QR; no paper surveys or email forms',
      'AI summary of sentiment, topics and intent',
      'Automatic replies and recovery offers for bad experiences',
      'Loyalty with points, badges and campaigns',
    ],
    priceFree: 'You can start on the free plan.',
    priceFrom: 'Paid plans start at {price}{interval}.',
    priceUnknown: 'Plans and quotas are on the business page.',
    ctaWhy: '{brand} for business',
    ctaPricing: 'See plans',
    ctaRegister: 'Create business account',
    priceLabel: 'Pricing',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Short questions, clear answers.',
    trustLink: 'Trust and privacy details',
    items: [
      {
        q: 'Do I need an account to give feedback?',
        a: 'No. You can scan the QR code and give feedback without an account. To earn points, XP and badges you need a free member account.',
      },
      {
        q: 'How do I earn points?',
        a: 'Every feedback earns +{base} points; a detailed review over {threshold} characters earns +{detailed}. Invites, streak rewards, quests and mini games add more. Feedback earns at most {dailyCap} points per day.',
      },
      {
        q: 'Where can I use my points?',
        a: 'In the reward catalog in your wallet. A claimed reward becomes a code you can show at the counter and is kept under "My rewards".',
      },
      {
        q: 'What does a business see about me?',
        a: 'For feedback you give as a member, the business sees your name and profile photo. Your phone number is never shared with any business. The Trust page explains exactly who sees what.',
      },
      {
        q: 'Can I download my data and delete my account?',
        a: 'Yes. From Settings → Privacy you can download a copy of your data, delete your account or submit a data protection request.',
      },
    ],
    businessQuestion: 'Is it paid for businesses?',
    freePlanAnswer: 'Businesses can start on the free plan and upgrade when needed. Current plans and quotas are on the business page.',
    paidOnlyAnswer: 'Current plans, prices and quotas are listed on the business page.',
    contactAnswer: 'For plans and pricing, write to {email}; we will find the right plan for your business together.',
  },
  final: {
    title: 'The next QR is yours.',
    sub: 'Join for free, scan on your next visit and start earning.',
    ctaPrimary: 'Join for free',
    ctaBusiness: 'Create business account',
  },
  schema: { breadcrumbHome: 'Home' },
  meta: {
    title: '{brand}: Share feedback, earn rewards',
    description:
      'Scan the QR code on the table, share your experience and earn points, badges and rewards. QR feedback, AI analysis and gamification for businesses.',
  },
};

export function getLandingCopy(locale: PublicLocale): LandingCopy {
  return locale === 'en' ? en : tr;
}
