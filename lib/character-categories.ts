import { CHARACTER_PROFILES } from '@/lib/character-badges';

/**
 * KARAKTER ROZETİ KATEGORİ ALTYAPISI (genişletilebilir).
 *
 * Sistem iki aşamalı çalışır:
 *   1) AI kullanıcının yorum ÜSLUBUNU bir KATEGORİ'ye oturtur (Dram/Suç, Komedi…).
 *   2) O kategorinin karakterlerinden en uygun olanı seçer (character-badges.ts).
 *
 * Yeni kategori eklemek için: CHARACTER_CATEGORIES'e bir giriş ekle + o kategoriye
 * ait karakterlerin badgeId'lerini `characterIds`'e yaz. Karakter tanımları
 * (kişilik) zaten CHARACTER_PROFILES'te; burada yalnızca gruplama yapılır.
 *
 * Bir karakter yalnızca BİR kategoriye ait olmalı (AI seçimini netleştirir).
 * Hiçbir kategoriye atanmamış karakterler `fallback` kategorisine düşer.
 */

export interface CharacterCategory {
  /** Kısa, stabil anahtar (DB/analitik için) — asla değiştirme. */
  key: string;
  /** Kullanıcıya gösterilen ad. */
  name: string;
  /** Kategori teması / açıklaması (AI seçim ipucu + UI alt metni). */
  description: string;
  /** UI aksanı: emoji + renk (reveal ekranı ve rozet gruplaması bu paleti kullanır). */
  emoji: string;
  /** Tailwind/HSL uyumlu vurgu rengi (hex) — küre/kart temasında kullanılır. */
  accent: string;
  /** Bu kategorinin AI'a verilecek "ne zaman bu kategori" ipucu (Türkçe). */
  aiHint: string;
  /** Bu kategoriye ait karakter badgeId'leri (CHARACTER_PROFILES ile eşleşir). */
  characterIds: string[];
  /**
   * Bu kategoride bir karakter açmak için gereken yorum sayısı (bar eşiği).
   * Belirtilmezse DEFAULT_CATEGORY_THRESHOLD (6). Gizemli kategori daha yüksek (zor).
   */
  threshold?: number;
  /**
   * Bu kategoride bir yorumun SAYILMASI için gereken minimum karakter uzunluğu.
   * Belirtilmezse 0 (uzunluk şartı yok). Gizemli kategori yalnız DETAYLI yorumları sayar.
   */
  minReviewLength?: number;
}

/** Kategori eşiği belirtilmemişse kullanılan varsayılan (normal kategoriler). */
export const DEFAULT_CATEGORY_THRESHOLD = 6;

/**
 * KATEGORİLER — sıralama önemsiz. Yeni kategori buraya eklenir.
 * (Kullanıcının tarif ettiği 4 çekirdek kategori + ileride kolayca büyütülür.)
 */
export const CHARACTER_CATEGORIES: CharacterCategory[] = [
  {
    key: 'dram-suc',
    name: 'Dram / Suç',
    description: 'TANIKLIK / DELİL SUNMA: isim vererek, somut kanıt göstererek, dengeli (artı+eksi) hüküm kuran, madde madde/sistematik anlatan yorumlar. Olumlu da olabilir olumsuz da.',
    emoji: '🎭',
    accent: '#dc2626',
    aiHint:
      'TANIKLIK/DELİL kategorisidir (olumsuzluk ŞART DEĞİL — olumlu da olabilir). Yorumcu bir TANIK gibi ' +
      'yazar: (a) İSİM verir ("özellikle Ayşe Hanım’ın ilgisi"), (b) SOMUT kanıt/olay sunar ("sıramız gelmeden ' +
      'sonrakiler aldı", "yemediğimiz ürünün parasını ödedik", "menüde 300 hesapta 350"), (c) DENGELİ hüküm kurar ' +
      '("tek eksiği...", "hakkını yemeyeyim", "ellerine sağlık"+detay, "fiyat performans"), (d) madde madde/sistematik ' +
      'sıralar ("öncelikle... ilaveten... tüm bunlara ek olarak..."). DELİL→OLAY→HÜKÜM zinciri kurar. AYRIM: Fantastik ' +
      '"davetiye" gibi biter (tavsiye/uğrayın, kanıtsız his); Dram/Suç "rapor/tanıklık" gibi biter (isim+kanıt+dengeli hüküm).',
    characterIds: [
      'badge-walter-white', 'badge-tommy-shelby', 'badge-sherlock', 'badge-professor',
      'badge-michael-scofield', 'badge-elizabeth', 'badge-jesse-pinkman', 'badge-spartacus',
      'badge-rome-julius', 'badge-tokyo', 'badge-this-is-us',
    ],
  },
  {
    key: 'komedi',
    name: 'Komedi',
    description: 'Abartı (hiperbol), gülünç benzetme, "o kadar ... ki ..." kalıbı; sıradan bir gözlemi absürt bir sonuca bağlayan mizah.',
    emoji: '😂',
    accent: '#f59e0b',
    aiHint:
      'HİPERBOL/MİZAH kategorisidir. Neredeyse zorunlu iskelet: "o kadar ... ki ..." yapısı — sıradan bir övgü/şikayet ' +
      'gerçeklikten kopan ABSÜRT bir sonuca/benzetmeye bağlanır (hayvana dönüşme, Narnia, mikroskop/nanoteknoloji, ' +
      'bekleme süresini "bir dil öğrendim/tez bitirdim" diye uzatma, kendini alaya alma). Espri altında genelde gerçek ' +
      'bir yargı saklıdır. Ton eğlenceli/ironik/absürt. AYRIM: Komedi güldürmek için GERÇEKLİKTEN kopar; diğer kategoriler ' +
      'gerçekçi kalır.',
    characterIds: [
      'badge-chandler', 'badge-barney-stinson', 'badge-the-office', 'badge-rick-morty',
      'badge-tyrion', 'badge-good-omens', 'badge-sheldon',
    ],
  },
  {
    key: 'fantastik',
    name: 'Fantastik',
    description: 'KEŞİF / DAVETİYE: mekanı bir keşif/macera/öneri objesi gibi sunan; sıcak, davetkâr, atmosfer ve his ağırlıklı yorumlar. Kanıt sunmaz, hisle konuşur.',
    emoji: '🐉',
    accent: '#8b5cf6',
    aiHint:
      'KEŞİF/DAVETİYE kategorisidir (genelde olumlu). Yorumcu mekanı bir KEŞİF/MACERA/ÖNERİ objesi gibi sunar, ' +
      'başkalarına yol gösterir. Sinyaller: öneri ("gidip deneyin", "keşfedin", "uğrayın", "tavsiye ederim", "iyi bir ' +
      'alternatif"), atmosfer ("sakin", "dingin", "huzurlu köşe", "aurası harika"), keşif ("gizli bir yer", "saklı ' +
      'kalmış", "tesadüfen bulduk"), arkadaşlık/paylaşım ("arkadaşlarla vakit", "sevdiklerinizle"). "Davetiye" gibi ' +
      'biter: kanıt sunmaz, HİSle konuşur, keşif çağrısıyla kapanır. AYRIM: Dram/Suç isim+kanıt+dengeli hüküm verir; ' +
      'Fantastik his + öneri + davet verir.',
    characterIds: [
      'badge-daenerys', 'badge-jon-snow', 'badge-khalesi', 'badge-witcher', 'badge-ragnar',
      'badge-eleven', 'badge-sam-winchester', 'badge-dean-winchester', 'badge-kelly-yorkie',
    ],
  },
  {
    key: 'gizem-gerilim',
    name: 'Gizem / Gerilim',
    description: 'ŞÜPHE / İMA: bir tuhaflık, çelişki veya çözülmemiş gerilim hisseden; olayı doğrudan anlatmak yerine ima ederek/ipucu bırakarak aktaran gözlemci-dedektif yorumlar.',
    emoji: '🕵️',
    accent: '#0ea5e9',
    aiHint:
      'ŞÜPHE/İMA kategorisidir. Yorumcu bir tuhaflık/çelişki/çözülmemiş gerilim hisseder; olayı DOĞRUDAN anlatmak ' +
      'yerine İMA ederek/ipucu bırakarak aktarır. Sinyaller: ima/çelişki ("aslında", "sanki", "galiba", "öyle görünüyor ' +
      'ki"), sorgulama ("neden böyle?", "anlam veremedim"), gizli detay ifşası ("dikkatinizi çekerim", "fark ettim ki", ' +
      '"meğerse", "menüde yazmıyor ama"), finansal şüphe ("adisyonu inceleyin", "bilerek yapılmış", "kafalarına göre ' +
      'ekleme"), tedirginlik ("içim rahat etmedi", "bir şeyler tuhaftı"). AYRIM: Dram/Suç AÇIK öfke/mağduriyet + net kanıt; ' +
      'Gizem/Gerilim BELİRSİZLİK/sorgulama, olay net sonuca bağlanmadan asılı kalır.',
    characterIds: [
      'badge-joe', 'badge-villanelle', 'badge-pablo-escobar', 'badge-dark-jonas',
      'badge-frank-underwood', 'badge-carrie', 'badge-martha',
    ],
  },
  {
    key: 'gizemli',
    name: 'Gizemli',
    description: 'ÖZEL/ZOR KATEGORİ: yalnızca çok DÜZENLİ, DERİN ve ÖZENLİ yorumlar. Soğukkanlı analiz, zarif keskinlik, felsefi sorgulama, deadpan ironi gibi ustalık isteyen üsluplar. Kolay kazanılmaz.',
    emoji: '🕯️',
    accent: '#7c3aed',
    aiHint:
      'ÖZEL/ZOR kategoridir — ustalık isteyen ÖZGÜN ÜSLUPLAR buraya girer. UZUN OLMAK ŞART DEĞİL: kısa ama ' +
      'ustaca/keskin/derin bir yorum da girer (House’un tek cümlelik teşhisi, Crowley’nin deadpan ironisi, ' +
      'Villanelle’nin keskin özgünlüğü gibi). Önemli olan uzunluk değil, üslubun USTALIĞI/ÖZGÜNLÜĞÜ. Ustalık üslupları: ' +
      '(House) keskin teşhis + ironi; (The Doctor) merak + keşif + objektif denge; (Mr. Robot) olayları kayıt/log gibi ' +
      'zaman+liste+detayla tutma; (Wednesday) "herkes seviyor ben sorguluyorum" ters görüş; (Castiel) eksiği söyle + ' +
      'hakkını teslim et adaleti; (Dexter) verileri PARÇALA→değerlendir→net sonuca bağla soğukkanlı analiz; (John Locke) ' +
      'inan→şans ver→deneyimle; (Hannibal) zarif/nazik başla→soğuk keskin final; (Crowley) beklenmedik karşılaştırma + ' +
      'deadpan kara ironi. Sıradan/düz bir yorumu (özel bir üslup ustalığı yoksa) buraya ATMA.',
    characterIds: [
      'badge-house-md', 'badge-the-doctor', 'badge-mr-robot', 'badge-wednesday', 'badge-castiel',
      'badge-dexter', 'badge-john-locke', 'badge-hannibal', 'badge-crowley',
    ],
    // ZOR kategori: 20 yorum gerekir (normal 6 yerine) — herkese kolayca verilmez.
    // NOT: uzunluk şartı YOK — kısa ama özenli/derin yorum da gizemli olabilir (House'un
    // tek cümlelik keskin teşhisi, Crowley'nin deadpan ironisi gibi). Zorluk EŞİK sayısında
    // ve AI'ın "yeterince özenli/derin mi" değerlendirmesinde (aiHint) — metin uzunluğunda değil.
    threshold: 20,
  },
];

/** Bir kategorinin eşiği (belirtilmemişse varsayılan). */
export function categoryThreshold(cat: CharacterCategory): number {
  return cat.threshold && cat.threshold > 0 ? cat.threshold : DEFAULT_CATEGORY_THRESHOLD;
}

/** Bir kategorinin min. yorum uzunluğu (0 = şart yok). */
export function categoryMinReviewLength(cat: CharacterCategory): number {
  return cat.minReviewLength && cat.minReviewLength > 0 ? cat.minReviewLength : 0;
}

/** key → kategori (hızlı erişim). */
export const CATEGORY_BY_KEY: Record<string, CharacterCategory> = Object.fromEntries(
  CHARACTER_CATEGORIES.map((c) => [c.key, c]),
);

/** badgeId → ait olduğu kategori (yoksa undefined). */
export const CATEGORY_BY_CHARACTER: Record<string, CharacterCategory> = (() => {
  const map: Record<string, CharacterCategory> = {};
  for (const cat of CHARACTER_CATEGORIES) {
    for (const id of cat.characterIds) map[id] = cat;
  }
  return map;
})();

/** Bir kategorinin karakter profillerini (kişilik tanımlarıyla) döndürür. */
export function charactersInCategory(categoryKey: string): { badgeId: string; name: string; trait: string }[] {
  const cat = CATEGORY_BY_KEY[categoryKey];
  if (!cat) return [];
  const idSet = new Set(cat.characterIds);
  return CHARACTER_PROFILES.filter((p) => idSet.has(p.badgeId));
}

/** Kategorisi olmayan karakterler için varsayılan (AI fallback güvenliği). */
export const FALLBACK_CATEGORY_KEY = 'dram-suc';

/**
 * Geliştirme/tutarlılık yardımcısı: her CHARACTER_PROFILES kaydının bir kategoriye
 * atanıp atanmadığını kontrol eder. Test veya dev-log için kullanılabilir.
 */
export function unassignedCharacterIds(): string[] {
  return CHARACTER_PROFILES.map((p) => p.badgeId).filter((id) => !CATEGORY_BY_CHARACTER[id]);
}
