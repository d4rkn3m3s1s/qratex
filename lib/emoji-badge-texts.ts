/**
 * GENEL (EMOJİ) ROZET METİNLERİ — aktivite metriğiyle otomatik atanan rozetler.
 *
 * Karakter rozetlerinden ([[character-reveal-texts]]) FARKI: bunlar metin/üslup analizi
 * gerektirmez; tamamen backend sayaçlarıyla (yorum sayısı, sıklık, uzunluk, etkileşim)
 * tespit edilir. Kullanıcı tarafından yazılan kutlama metinleri burada tutulur.
 *
 * Alanlar:
 *   trait     → rozetin kime verildiği ("İlk defa yorum atan")
 *   quote     → "Rozetini kazandın! …" kutlama cümlesi (reveal/bildirimde gösterilir)
 *   points    → ödül puanı
 *   detection → backend tespit kuralı (uygulama notu; kod bunu OTOMATİK yorumlamaz,
 *               ilgili rozet-verme mantığı ayrıca yazılır — burası tek doğruluk kaynağı
 *               olarak kuralı kayıt altına alır)
 */

/**
 * Tespit türü — rozetin nasıl atandığını belirler:
 *  'behavioral' → SAF DAVRANIŞSAL: yalnız sayaç/zaman verisiyle atanır (metin okunmaz).
 *                 Cron veya olay tetikleyicisiyle otomatik verilebilir.
 *  'content'    → İÇERİK-BAZLI İSTİSNA: yorum METNİNİN incelenmesi gerekir (AI/uzunluk).
 *                 Bu sette yalnız 3 tane: Filozof, Katalizör, Tur Rehberi.
 */
export type BadgeDetectionKind = 'behavioral' | 'content';

export type EmojiBadgeText = {
  trait: string;
  quote: string;
  points: number;
  detection: string;
  /** Atama yöntemi — davranışsal mı, metin analizi mi gerektiriyor. */
  kind: BadgeDetectionKind;
};

export const EMOJI_BADGE_TEXTS: Record<string, EmojiBadgeText> = {
  'badge-yeni-ses': {
    trait: 'İlk defa yorum atan',
    quote: 'Rozetini kazandın! Sisteme ilk adımını attın — yeni sesinle topluluğa "merhaba" dedin.',
    points: 200,
    detection: 'Toplam yorum sayısı = 1',
    kind: 'behavioral',
  },
  'badge-hayalet-yorumcu': {
    trait: '1-2 yorum yapıp kaybolan',
    quote: 'Rozetini kazandın! "Buradaydım... galiba." Kısa süre göründün, izin kaldı ama kendin ortalıkta yoksun.',
    points: 1000,
    detection: 'Toplam yorum 1-2 VE sonrasında uzun süre aktivite yok',
    kind: 'behavioral',
  },
  'badge-konuk-oyuncu': {
    trait: 'Düzenli ama seyrek yorum yapan',
    quote: 'Rozetini kazandın! Ayda yılda bir sahneye çıkıyorsun ama geldiğinde mutlaka fark ediliyorsun.',
    points: 1000,
    detection: 'Yorumlar arası aralık DÜZENLİ ama uzun (örn. ayda/yılda bir)',
    kind: 'behavioral',
  },
  'badge-yorum-makinesi': {
    trait: 'Sürekli yorum yapan',
    quote: 'Rozetini kazandın! Dur durak bilmedin — neredeyse her fişe imzanı attın.',
    points: 4000,
    detection: 'Yorum sayısı çok yüksek + sürekli aktif',
    kind: 'behavioral',
  },
  'badge-nostalji': {
    trait: 'Uzun süre yok olup geri dönen',
    quote: 'Rozetini kazandın! "Özledin mi beni?" Bir anda geri döndün, eski günleri hatırlattın ve ortamı canlandırdın.',
    points: 1000,
    detection: 'Uzun pasiflik sonrası yeni yorum',
    kind: 'behavioral',
  },
  'badge-filozof': {
    trait: 'Çok detaylı uzun yorumlar yazan',
    quote: 'Rozetini kazandın! Yorumların adeta bir makale — derin, uzun ve düşündürücü.',
    points: 3000,
    detection: 'Kelime/cümle sayısı eşiği (örn. 100+ kelime) — AI metin uzunluğuna bakarak atar',
    kind: 'content',
  },
  'badge-usta-yorumcu': {
    trait: '20+ yorum yapan ve sürekli aktif',
    quote: 'Rozetini kazandın! İşletmeler için güvenilir, topluluk için yol gösterici bir isim oldun.',
    points: 1500,
    detection: 'Toplam yorum sayısı ≥ 20 VE düzenli aktiflik',
    kind: 'behavioral',
  },
  'badge-efsane': {
    trait: '50+ yorum ve en üst seviye',
    quote: 'Rozetini kazandın! Hem kullanıcılar hem işletmeler için vazgeçilmez oldun — sistemin yıldızısın.',
    points: 2500,
    detection: 'Toplam yorum sayısı ≥ 50',
    kind: 'behavioral',
  },
  'badge-taht-sahibi': {
    trait: '100+ yorum',
    quote: 'Rozetini kazandın! Topluluğun zirvesinde, en üst seviyede oturan gerçek lider sensin.',
    points: 5000,
    detection: 'Toplam yorum sayısı ≥ 100',
    kind: 'behavioral',
  },
  'badge-begeni-perisi': {
    trait: 'Beğeni / emoji bırakan',
    quote: 'Rozetini kazandın! Yorum yazmadın ama beğenilerin ve emojilerinle her zaman destek oldun.',
    points: 1000,
    detection: 'Yorum değil, beğeni/emoji etkileşim sayısı',
    kind: 'behavioral',
  },
  'badge-sessiz-sinema': {
    trait: 'Hiç yorum yapmayıp sadece okuyan',
    quote: 'Rozetini kazandın! Sessizce takip ettin, yorum yazmadın ama hep izledin.',
    points: 1000,
    detection: 'Yorum sayısı 0 VE uygulama kullanım logu mevcut',
    kind: 'behavioral',
  },
  'badge-tetikci': {
    trait: 'Hep ilk yorumu yapan',
    quote: 'Rozetini kazandın! Konu açılır açılmaz ilk hamleyi sen yaptın — hızlı oyuncu sensin.',
    points: 1000,
    detection: 'Mekana ait ilk yorum kaydının bu kullanıcıya ait olma sıklığı',
    kind: 'behavioral',
  },
  'badge-hizli-ofkeli': {
    trait: 'Çok hızlı yanıt veren',
    quote: 'Rozetini kazandın! Anında cevap verdin — her zaman aktif, her zaman tetikte.',
    points: 1000,
    detection: 'Uygulama kullanım sıklığı / session verisi (kısa yanıt süresi)',
    kind: 'behavioral',
  },
  'badge-firtina': {
    trait: 'Az zamanda çok katkı sunan',
    quote: 'Rozetini kazandın! Birden geldin, yorumlarınla ortalığı doldurdun ve hızla kayboldun.',
    points: 1000,
    detection: 'Kısa bir zaman diliminde yoğun yorum patlaması',
    kind: 'behavioral',
  },
  'badge-katalizor': {
    trait: 'Katkılarıyla topluluğu ileriye taşıyan',
    quote: 'Rozetini kazandın! Her hareketinle değişimi hızlandırdın, gelişime yön verdin.',
    points: 1000,
    detection: 'KARMA: yapıcı-eleştirel katkı + işletmenin bu katkıdan etkilendiğinin sistemce doğrulanması',
    kind: 'content',
  },
  'badge-tur-rehberi': {
    trait: 'Yeni katılanlara yol gösteren',
    quote: 'Rozetini kazandın! Yeni başlayanlara ışık tuttun, sistemi tanıttın ve destek oldun.',
    points: 1000,
    detection: 'Pratik bilgi/tavsiye verme dili — "gitmenizi tavsiye ederim", "en iyi zaman...", kombinasyon önerileri',
    kind: 'content',
  },
  'badge-mucevher': {
    trait: 'Nadiren aktif ama katkısı çok değerli',
    quote: 'Rozetini kazandın! Az göründün ama geldiğinde her seferinde büyük değer kattın.',
    points: 1000,
    detection: 'Düşük yorum sıklığı VE yüksek ortalama beğeni/etkileşim oranı',
    kind: 'behavioral',
  },
  'badge-filiz': {
    trait: 'Yeni başlayan ve hızlı büyüyen',
    quote: 'Rozetini kazandın! Kısa sürede kök saldın, hızla geliştin ve toplulukta yerini buldun.',
    points: 1000,
    detection: 'Üyelik süresi kısa (örn. <30 gün) VE yorum/aktiflik artış hızı yüksek',
    kind: 'behavioral',
  },
  'badge-ilham-kaynagi': {
    trait: 'Arka arkaya yaratıcı fikirlerle gelen',
    quote: 'Rozetini kazandın! Her hareketin yeni bir fikre dönüştü — topluluğa ilham oldun.',
    points: 1000,
    detection: 'Yorumlarının paylaşım/yanıt/beğeni oranı ortalamanın belirgin şekilde üzerinde',
    kind: 'behavioral',
  },
  'badge-copy-cv': {
    trait: 'Hep aynı yorumları tekrar eden',
    quote: 'Rozetini kazandın! Hazır kalıpları kullandın ama katkın hep sürekliydi.',
    points: 1000,
    detection: 'Kullanıcının yorumları arası metin benzerlik oranı yüksek',
    kind: 'behavioral',
  },
  'badge-emoji-ustasi': {
    trait: 'Hep emojilerle yorum yapan',
    quote: 'Rozetini kazandın! Kelimeler yerine simgelerle kendini ifade ettin.',
    points: 1000,
    detection: 'Yorumlardaki emoji/karakter oranı belirlenen eşiğin üzerinde',
    kind: 'behavioral',
  },
  'badge-kelime-buyucusu': {
    trait: 'Az ama öz yorum yapan',
    quote: 'Rozetini kazandın! Kısa yazdın ama en önemli noktayı söyledin.',
    points: 1000,
    detection: 'Ortalama yorum uzunluğu düşük VE ortalama beğeni oranı yüksek',
    kind: 'behavioral',
  },
  'badge-keskin-nisanci': {
    trait: 'Nokta atışı yorumlar',
    quote: 'Rozetini kazandın! Az konuştun, öz konuştun — yorumunu bir bıraktın, herkesin kalbine saplandı.',
    points: 1500,
    detection: 'Toplam yorum sayısı düşük VE yorum başına etkileşim oranı çok yüksek',
    kind: 'behavioral',
  },
};

/** Bu rozet için genel (emoji) rozet metni var mı. */
export function getEmojiBadgeText(badgeId?: string | null): EmojiBadgeText | null {
  if (!badgeId) return null;
  return EMOJI_BADGE_TEXTS[badgeId] ?? null;
}
