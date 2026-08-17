/**
 * KARAKTER AÇILIŞ METİNLERİ — rozet altında gösterilen, karakteri anlatan yazılar.
 *
 * Yapı (kullanıcı tarafından belirlendi):
 *   source  → dizi/film adı ("Breaking Bad")
 *   essence → karakterin özü, italik alt satır ("Stratejik, planlı")
 *   quote   → "Rozetini kazandın! …" ile başlayan, kişiye seslenen kutlama cümlesi
 *   tags    → karakter özellik etiketleri (büyük harf, rozet gibi dizilir)
 *   points  → kademe puanı: 2500 (Yaygın) | 5000 (Nadir) | 10000 (Efsanevi)
 *
 * PUAN KADEMESİ = NADİRLİK:
 *   2500  Yaygın   — sık rastlanan, kolay bağ kurulan kişilik tipleri
 *   5000  Nadir    — belirgin, stratejik veya derin karakter özellikleri
 *   10000 Efsanevi — en özgün / gizemli arketipler
 *
 * Metni olmayan karakterlerde sistem eski davranışa düşer (katalog açıklaması).
 */

/** Puan kademesi → nadirlik sınıfı. */
export type RevealTier = 'common' | 'rare' | 'legendary';

export type CharacterRevealText = {
  source: string;
  essence: string;
  quote: string;
  tags: string[];
  points: number;
};

/** Puandan kademe türet (tek doğruluk kaynağı: puan). */
export function tierFromPoints(points: number): RevealTier {
  if (points >= 10000) return 'legendary';
  if (points >= 5000) return 'rare';
  return 'common';
}

/** Kademe → kullanıcıya gösterilen etiket. */
export const TIER_LABELS: Record<RevealTier, string> = {
  common: 'YAYGIN',
  rare: 'NADİR',
  legendary: 'EFSANEVİ',
};

export const CHARACTER_REVEAL_TEXTS: Record<string, CharacterRevealText> = {
  // ─────────── 🎭 KOMEDİ ───────────
  'badge-barney-stinson': {
    source: 'How I Met Your Mother',
    essence: 'Hazır cevap, eğlenceli, bazen kararsız',
    quote: 'Rozetini kazandın! "Legen— bekle bitmedi —dary!" Sosyal enerjin resmen skoru patlattı, hazır cevapların cabası.',
    tags: ['DUYGUSAL', 'EĞLENCELİ', 'KOMİK', 'ABARTI', 'EGOİST'],
    points: 2500,
  },
  'badge-sheldon': {
    source: 'The Big Bang Theory',
    essence: 'Analitik zeka, farklı bakış açısı',
    quote: 'Rozetini kazandın! Bilimsel olarak kanıtlandı: analitik zekan sıradanlıktan bir tık öteye geçti. Tebrikler, artık "benim yerim" burası.',
    tags: ['MANTIK', 'KURALCI', 'ZEKİ', 'TAKINTI', 'KİBİR'],
    points: 5000,
  },
  'badge-chandler': {
    source: 'Friends',
    essence: 'Keskin espri anlayışı',
    quote: 'Rozetini kazandın! "Yani ben mi... yoksa yorumların mı daha alaycı, karar veremedim." Mizahını yorumlarına böyle taşıdın.',
    tags: ['ALAYCI', 'İĞNELEYİCİ', 'KONUŞMA', 'SADIK', 'GÜVEN VERMEYEN'],
    points: 2500,
  },
  'badge-the-office': {
    source: 'The Office',
    essence: 'Fazla mizah ve samimiyet',
    quote: 'Rozetini kazandın! "That\'s what she said" enerjisiyle geldin, samimiyetinle topluluğa gülümseme kattın.',
    tags: ['SAMİMİ', 'ONAY BEKLEYEN', 'ÇOCUKSU', 'İYİ NİYETLİ'],
    points: 2500,
  },

  // ─────────── 🐉 FANTASTİK ───────────
  'badge-eleven': {
    source: 'Stranger Things',
    essence: 'Fedakâr, gizemli',
    quote: 'Rozetini kazandın! Tek kelime etmeden bile "dostum" dedirttin — sadakatin ve sıcaklığın seni ayırt etti.',
    tags: ['SESSİZ', 'CESUR', 'ARKADAŞÇA'],
    points: 2500,
  },
  'badge-witcher': {
    source: 'The Witcher',
    essence: 'Sessiz ama güçlü',
    quote: 'Rozetini kazandın! "Hmm." dedin ve mesele çözüldü. Az konuştun ama her kelimen ağırlıklıydı.',
    tags: ['SOĞUKKANLI', 'ÇÖZÜM ODAKLI'],
    points: 2500,
  },
  'badge-jon-snow': {
    source: 'Game of Thrones',
    essence: 'Onurlu, sadık, cesur',
    quote: 'Rozetini kazandın! "Hiçbir şey bilmiyorsun" dediler ama dürüstlüğünle topluluğun güvenini fazlasıyla kazandın.',
    tags: ['MELANKOLİK', 'LİDER RUHLU'],
    points: 10000,
  },
  'badge-daenerys': {
    source: 'Game of Thrones',
    essence: 'Vizyoner, idealist, güçlü',
    quote: 'Rozetini kazandın! Zincirlerin Kıranı gibi, fikirlerinle sınırları zorladın — topluluk şimdiden peşinden gidiyor.',
    tags: ['VİZYONER', 'GÜÇLÜ', 'İDEALİST'],
    points: 10000,
  },
  'badge-dean-winchester': {
    source: 'Supernatural',
    essence: 'Cesur, eğlenceli, sadık, koruyucu',
    quote: 'Rozetini kazandın! "Aile her şeyden önce gelir" — koruyucu ve destekleyici duruşunla herkesin güvendiği isim oldun.',
    tags: ['İSYANKAR', 'GÖZÜ KARA', 'EĞLENCELİ'],
    points: 5000,
  },

  // ─────────── 🔪 DRAM / SUÇ ───────────
  'badge-walter-white': {
    source: 'Breaking Bad',
    essence: 'Stratejik, planlı',
    quote: 'Rozetini kazandın! "Ben tehlikeyim." Kriz anında bile soğukkanlılığını koruyup çözümü buldun.',
    tags: ['HIRS', 'PLANLI', 'KULLANICI'],
    points: 2500,
  },
  'badge-tommy-shelby': {
    source: 'Peaky Blinders',
    essence: 'Soğukkanlı ve planlı',
    quote: 'Rozetini kazandın! By order of the Peaky Blinders — yorumların hesaplı, duruşun kusursuzdu.',
    tags: ['HESAPÇI', 'PLANLI', 'SOĞUKKANLI'],
    points: 5000,
  },
  'badge-elizabeth': {
    source: 'The Crown',
    essence: 'Ciddi, sorumluluk sahibi',
    quote: 'Rozetini kazandın! Taç ağırdır ama sen istikrarını hiç kaybetmedin — düzenli duruşunla güven verdin.',
    tags: ['GELENEKÇİ', 'DİSİPLİN', 'CİDDİ'],
    points: 5000,
  },
  'badge-sherlock': {
    source: 'Sherlock',
    essence: 'Analitik, gözlemci',
    quote: 'Rozetini kazandın! "Basit, sevgili dostum." Kimsenin fark etmediği detayı sen yakaladın.',
    tags: ['ANALİTİK', 'DETAYCI'],
    points: 5000,
  },
  'badge-professor': {
    source: 'La Casa de Papel',
    essence: 'Planlı, stratejik, soğukkanlı',
    quote: 'Rozetini kazandın! Bella Ciao çalmaya başlasın — planın kusursuzdu, yorumların herkesin işini kolaylaştırdı.',
    tags: ['STRATEJİK', 'FAYDACI'],
    points: 5000,
  },
  'badge-michael-scofield': {
    source: 'Prison Break',
    essence: 'Stratejik zeka',
    quote: 'Rozetini kazandın! Cildindeki plan gibi, her yorumun bir sonrakine zemin hazırladı — mantık zincirin kusursuz.',
    tags: ['STRATEJİK', 'MANTIK ZİNCİRİ'],
    points: 5000,
  },

  // ─────────── 🕵️ GİZEM / GERİLİM ───────────
  'badge-joe': {
    source: 'You',
    essence: 'Takıntılı ama analitik, gözlemci',
    quote: 'Rozetini kazandın! "Sen..." diye başlasa da, aslında en küçük detayı bile atlamayan gözlem gücünle fark yarattın.',
    tags: ['GÖZLEMCİ', 'TAKINTILI', 'DETAYCI'],
    points: 5000,
  },
  'badge-villanelle': {
    source: 'Killing Eve',
    essence: 'Karizmatik, kurnaz, sıra dışı',
    quote: 'Rozetini kazandın! "Oh, çok sevdim seni." Kurnaz ve sıra dışı enerjinle tam da fark edilecek bir profil çizdin.',
    tags: ['KARİZMATİK', 'KURNAZ', 'SIRA DIŞI'],
    points: 2500,
  },
  'badge-pablo-escobar': {
    source: 'Narcos',
    essence: 'Karizmatik, güçlü, korkusuz',
    quote: 'Rozetini kazandın! Plata o plomo — orta yolu sevmedin, iddialı yorumlarınla dikkatleri üzerine çektin.',
    tags: ['KARİZMATİK', 'İDDİALI', 'KORKUSUZ'],
    points: 5000,
  },
  'badge-dark-jonas': {
    source: 'Dark',
    essence: 'Derin düşünceli, sorgulayıcı',
    quote: 'Rozetini kazandın! Aynı sorular seni de takip etti — merak uyandıran yorumlarınla tartışmalara yeni bir boyut kattın.',
    tags: ['SORGULAYICI', 'DERİN DÜŞÜNCE'],
    points: 5000,
  },
  'badge-frank-underwood': {
    source: 'House of Cards',
    essence: 'Stratejik ve güçlü',
    quote: 'Rozetini kazandın! "Perdeyi aralayayım mı?" — ince hesaplarınla tartışmaları sessizce yönlendirdin.',
    tags: ['STRATEJİK', 'YÖNLENDİRİCİ'],
    points: 2500,
  },
  'badge-carrie': {
    source: 'Homeland',
    essence: 'Sezgileri güçlü, cesur',
    quote: 'Rozetini kazandın! Herkes yanıldığını düşünse de içgüdülerin seni doğru noktaya götürdü.',
    tags: ['SEZGİSEL', 'CESUR'],
    points: 5000,
  },

  // ─────────── 🌑 GİZEMLİ (özel/zor kategori) ───────────
  'badge-wednesday': {
    source: 'Wednesday',
    essence: 'Karanlık, bağımsız',
    quote: 'Rozetini kazandın! Gülümsemedim ama etkilendim — karanlık ve bağımsız tarzın kalabalıktan sıyrıldı.',
    tags: ['KARANLIK', 'BAĞIMSIZ', 'SIRA DIŞI'],
    points: 10000,
  },
  'badge-the-doctor': {
    source: 'Doctor Who',
    essence: 'Zaman yolcusu, bilge, maceraperest',
    quote: 'Rozetini kazandın! "Allons-y!" Keşfetmeyi seven, meraklı ruhunla topluluğa yeni ufuklar açtın.',
    tags: ['BİLGE', 'MACERAPEREST', 'MERAKLI'],
    points: 10000,
  },
  'badge-castiel': {
    source: 'Supernatural',
    essence: 'Gizemli, bilge, koruyucu',
    quote: 'Rozetini kazandın! "Ben Rab\'bin Meleğiyim." Dinginliğinle ortamı dengeleyen, güven veren bir varlık oldun.',
    tags: ['GİZEMLİ', 'BİLGE', 'KORUYUCU'],
    points: 10000,
  },
  'badge-dexter': {
    source: 'Dexter',
    essence: 'Çift yönlü, soğukkanlı, planlı',
    quote: 'Rozetini kazandın! Dış görünüşün sakin, iç dünyan hesaplı — en karmaşık durumları bile netleştirdin.',
    tags: ['ÇİFT YÖNLÜ', 'SOĞUKKANLI', 'PLANLI'],
    points: 10000,
  },
  'badge-mr-robot': {
    source: 'Mr. Robot',
    essence: 'Gizemli, içe kapanık',
    quote: 'Rozetini kazandın! "Merhaba dostum." Sessizce izledin, sonra ani ama çarpıcı bir yorumla herkesi şaşırttın.',
    tags: ['GİZEMLİ', 'İÇE KAPANIK', 'ÇARPICI'],
    points: 10000,
  },
  'badge-john-locke': {
    source: 'Lost',
    essence: 'İnançlı, keşifçi',
    quote: 'Rozetini kazandın! "Bana ne yapacağımı söyleme." Yeni fikirleri denemekten çekinmeyen keşifçi ruhunu gösterdin.',
    tags: ['İNANÇLI', 'KEŞİFÇİ'],
    points: 10000,
  },
  'badge-hannibal': {
    source: 'Hannibal',
    essence: 'Zarif ama keskin',
    quote: 'Rozetini kazandın! Nazik bir sesle söylenen en keskin sözler senden çıktı — yorumların bir sanat eserine dönüştü.',
    tags: ['ZARİF', 'KESKİN'],
    points: 10000,
  },
  'badge-crowley': {
    source: 'Good Omens',
    essence: 'Kaotik ama eğlenceli',
    quote: 'Rozetini kazandın! Şeytanın işi kolay değil ama sen beklenmedik, sürpriz dolu yorumlarınla ortama kaos ve eğlence kattın.',
    tags: ['KAOTİK', 'SÜRPRİZ', 'EĞLENCELİ'],
    points: 10000,
  },
  'badge-house-md': {
    source: 'House M.D.',
    essence: 'Alaycı, keskin zeka',
    quote: 'Rozetini kazandın! "Herkes yalan söyler." Gerçekçi ve eleştirel yorumlarınla ortalığı sarstın.',
    tags: ['ALAYCI', 'ELEŞTİREL', 'KESKİN ZEKA'],
    points: 10000,
  },
};

/** Bu rozet için özel açılış metni var mı. */
export function getCharacterRevealText(badgeId?: string | null): CharacterRevealText | null {
  if (!badgeId) return null;
  return CHARACTER_REVEAL_TEXTS[badgeId] ?? null;
}

/** Rozetin kademesi (metin varsa puandan, yoksa null). */
export function getCharacterTier(badgeId?: string | null): RevealTier | null {
  const t = getCharacterRevealText(badgeId);
  return t ? tierFromPoints(t.points) : null;
}
