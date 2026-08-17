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
      'TANIKLIK/DELİL kategorisidir (olumsuzluk ŞART DEĞİL — 3 yorumdan 2\'si olumlu olabilir). Yorumcu bir TANIK ' +
      'gibi yazar: "şahit oldum, size aktarıyorum". 5 SİNYAL GRUBU: ' +
      '(1) 👤 TANIK: personel ismi + somut davranış ("özellikle Ayşe Hanım\'ın ilgisi", "Mehmet Bey bizzat ilgilendi"). ' +
      '(2) 📋 DELİL: somut olay/kanıt ("sıramız gelmeden sonrakiler aldı", "yemediğimiz ürünün parasını ödedik", ' +
      '"menüde 300 hesapta 350", "40 dk bekledik, sipariş sisteme girilmemiş"). ' +
      '(3) ⚖️ DENGE: artı + tek eksi, adil ("tek eksiği/tek istediğim...", "hakkını yemeyeyim", "biraz yüksek ama porsiyona göre makul"). ' +
      '(4) 🔍 GÖZLEM: küçük somut ayrıntı ("dikkatimi çeken bir diğer husus...", "masaları sürekli kontrol ediyorlardı"). ' +
      '(5) 🧾 HÜKÜM: olaydan çıkan sonuç ("ellerine sağlık"+ürün detayı, "fiyat performans", "bir daha gitmem", "kimseye tavsiye etmem", "pişman oldum", "değmedi", "bu kafayla kaybeden siz olursunuz"). ' +
      '(6) 📋 SİSTEMATİK LİSTELEME: birden çok somut kriteri düz/madde madde sıralama — isim/kanıt olmasa bile ("mekan temiz, ' +
      'çalışanlar güler yüzlü, yemekler başarılı, fiyatlar makul", "öncelikle... ilaveten... tüm bunlara ek olarak..."). Bu ' +
      'ÇOK-KRİTERLİ DÜZ LİSTELEME tek başına Dram/Suç\'a yeter (abartı YOKtur → Komedi DEĞİL; öneri/davet YOKtur → Fantastik DEĞİL). ' +
      'ÇEKİRDEK KURAL: DELİL→OLAY→HÜKÜM zinciri. Salt hüküm TEK BAŞINA yetmez: "bir daha gitmem" tek başına Dram/Suç DEĞİL; ama ' +
      '"sipariş 40 dk gecikti, yanlış geldi, kimse ilgilenmedi, bu yüzden bir daha gitmem" → Dram/Suç (kanıt+olay+hüküm var). ' +
      'AYRIM: Fantastik "davetiye" gibi biter (uğrayın/keşfedin, kanıtsız his); Dram/Suç "rapor/tanıklık" gibi biter (isim+kanıt+dengeli hüküm). ' +
      'Gizem/Gerilim ise olayı NET anlatmaz, ima/şüphe bırakır — Dram/Suç açık ve kanıtlıdır.',
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
      'gerçeklikten kopan ABSÜRT bir sonuca/benzetmeye bağlanır (hayvana dönüşme, Narnia\'ya açılan kapı, mikroskop/' +
      'nanoteknoloji, bekleme süresini "bir dil öğrendim/master tezi bitirdim/kayıp ilan edildim" diye uzatma, "tabağı ' +
      'dekorasyon sandım", "yangın tüpüyle gidin", kendini alaya alma). Espri ALTINDA genelde gerçek bir yargı saklıdır ' +
      '("lezzet şahane ama..."/"porsiyon küçük"). Ton eğlenceli/ironik/absürt. ' +
      'İÇ KARAKTER TONLARI (hepsi Komedi): olayı absürt bir SAHNEYE/hikayeye dönüştürüp kendini kahraman yapma; sözde ' +
      'BİLİMSEL/süreçsel analiz mizahı (çekirdeğin yetişmesini simüle ettim); TEK CÜMLELİK keskin iğneleme (uzun kurgu yok); ' +
      'SOSYAL/duygusal saf abartı (kan kardeş olduk, garsona sarıldım). ' +
      'AYRIM: Komedi güldürmek için GERÇEKLİKTEN kopar; Dram/Suç kanıt sunar, Fantastik davet eder, Gizem tedirgin eder — ' +
      'hepsi GERÇEKÇİ kalır, Komedi absürde kaçar. ' +
      '⛔ ZORUNLU GİRİŞ GUARD\'ı (önce bunu uygula): absürt benzetme / hiperbol / gerçeklikten kopuş / gülünç abartı ' +
      'YOKSA yorum KOMEDİ DEĞİLDİR. Düz ve gerçekçi bir övgü/şikayet — özellikle çok kriterli sade liste ' +
      '("mekan temiz, çalışanlar güler yüzlü, yemekler başarılı, fiyatlar makul") — mizah İÇERMEZ, bu ASLA Komedi ' +
      'değildir; sistematik gözlem/değerlendirme olduğu için Dram/Suç\'tur. Sadece olumlu/nötr ton Komedi yapmaz; ' +
      'Komedi için MUTLAKA absürt bir espri unsuru şart. ' +
      '↔ ÇİFT YÖNLÜ: Şikayet/olumsuzluk bile ABSÜRT hiperbolle anlatılıyorsa ("servis o kadar yavaştı ki sakalım uzadı", ' +
      '"o kadar kötüydü ki tabağı komşuya hediye ettim") → yine KOMEDİ\'dir. Teslim biçimi absürt-komikse, içerik şikayet ' +
      'olsa da Komedi kazanır (Gizem/Dram DEĞİL); çünkü Gizem tedirgin eder, Dram kanıt sıralar — ikisi de GERÇEKÇİ kalır, ' +
      'oysa burada gerçeklikten komik bir kopuş var. ' +
      '⛔ KURU İRONİ DIŞLAMASI: absürt abartı OLMADAN yapılan keskin/deadpan/acımasız kısa eleştiri veya teşhis ' +
      '("tek kelimeyle: vasat", "kötü; gerisi teferruat", "mutfak kendini anlatıyor") KOMEDİ DEĞİLDİR — bu Gizemli ' +
      '(House) ustalık teşhisidir. Komedi güldürmeyi hedefleyen ABSÜRT abartı ister; salt iğneli/kuru keskinlik komedi değil.',
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
      'başkalarına yol gösterir; "davetiye" gibi biter, HİSle konuşur, kanıt sunmaz. Sinyaller: öneri ("gidip deneyin", ' +
      '"keşfedin", "mutlaka uğrayın", "tavsiye ederim", "iyi bir alternatif", "yolunuz düşerse"), atmosfer ("sakin", "dingin", ' +
      '"huzurlu köşe", "aurası/atmosferi harika", "kendinizi evinizde hissedersiniz"), keşif ("gizli/saklı bir yer", "saklı ' +
      'kalmış", "tesadüfen bulduk, iyi ki", "keşfedilmeyi bekliyor", "rotanıza ekleyin"), arkadaşlık ("arkadaşlarla saatlerce ' +
      'sohbet", "sevdiklerinizle"). ' +
      'AYRIM (kategori): Dram/Suç isim+kanıt+dengeli hüküm verir (tanıklık); Fantastik his+öneri+davet verir (davetiye). ' +
      'BURAYA GİRMEZ: analitik puanlama ("kahve 8/10, servis 6/10" → sıradan/değerlendirici); aşırı coşku çığlığı ' +
      '("MÜKEMMEL!!! HAYATIMDA EN İYİSİ!!!" → dengeli değil, Fantastik\'in sıcak-sakin tonu değil); tek kelimelik "güzel/iyi" ' +
      '(üslup yok). Fantastik ton SICAK, DAVETKÂR, KAŞİF ruhlu — çatışma/öfke/suçlama YOKtur (varsa Dram/Suç veya Gizem).',
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
      'yerine İMA ederek/ipucu bırakarak aktarır ve olay NET sonuca bağlanmadan ASILI kalır. Sinyaller: ima/çelişki ' +
      '("aslında", "sanki", "galiba", "öyle görünüyor ki"), sorgulama ("neden böyle?", "anlam veremedim"), gizli detay ifşası ' +
      '("dikkatinizi çekerim", "fark ettim ki", "meğerse", "menüde yazmıyor ama"), finansal şüphe ("adisyonu inceleyin", ' +
      '"bilerek yapılmış", "kafalarına göre ekleme"), tedirginlik ("içim rahat etmedi", "bir şeyler tuhaftı"). ' +
      'İÇ KARAKTER TONLARI (hepsi bu kategoriye girer): saf gözlem/detay avcısı (fark ettim, bir de...); iz sürme/soruşturma ' +
      '(önce tesadüf sandım, ikinci kez olunca şüphelendim); hesap/çıkar şüphesi (menüde 300 hesapta 350, bilerek); "neden ' +
      'böyle?" derin sorgulama; keskin-özgün çarpıcı ifade; kesin-iddialı özgüvenli hüküm. ' +
      'AYRIM: Dram/Suç AÇIK öfke/mağduriyet + NET kanıt sunar ve sonuca bağlar; Gizem/Gerilim BELİRSİZLİK/sorgulama, kanıtı ' +
      'ima eder ama olayı asılı bırakır. Komedi absürt-güldürür; Gizem gerçekçi kalıp tedirgin eder. ' +
      'DIŞLAMA: Yorum zaman damgalı sistematik LOG/kayıt formundaysa ("15:10..., 15:22..., 15:58...") bu Gizem değil, ' +
      'Gizemli (Mr. Robot) ustalığıdır — şüphe içerse bile kayıt disiplini baskındır, oraya bırak.',
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
    // Gizemli kategorisi YEŞİL (kullanıcı tema kararı) — Fantastik'in moru ile karışmasın.
    accent: '#10b981',
    aiHint:
      'ÖZEL/ZOR kategoridir — yalnızca üslup USTALIĞI/ÖZGÜNLÜĞÜ olan ÖZGÜN yorumlar. UZUN OLMAK ŞART DEĞİL: kısa ama ' +
      'ustaca/keskin/derin bir yorum da girer (House\'un tek cümlelik teşhisi, Crowley\'nin deadpan ironisi, Villanelle\'nin ' +
      'keskin özgünlüğü gibi). Önemli olan uzunluk değil, üslubun ustalığı. Ustalık üslupları: (House) keskin teşhis + ironi; ' +
      '(The Doctor) merak + keşif + objektif denge; (Mr. Robot) olayları kayıt/log gibi zaman+liste+detayla tutma — ÖZEL: zaman damgalı sistematik LOG ' +
      '("15:10 girdik, 15:22 sipariş, 15:58 geldi") tek başına ustalık formudur; içerik bir şüphe/haksızlık ima etse ' +
      'bile (üç masa önce yedi) bu GİZEMLİ\'dir (Mr. Robot) — olayı disiplinle KAYDETME üslubu, gizem-gerilim\'in salt ' +
      'sezgisel şüphesinden farklı bir ustalıktır; (Wednesday) ' +
      '"herkes seviyor ben sorguluyorum" ters görüş; (Castiel) eksiği söyle + hakkını teslim et adaleti; (Dexter) verileri ' +
      'PARÇALA→değerlendir→net sonuca bağla soğukkanlı analiz; (John Locke) inan→şans ver→deneyimle; (Hannibal) zarif/nazik ' +
      'başla→soğuk keskin final; (Crowley) beklenmedik karşılaştırma + deadpan kara ironi. ' +
      'KRİTİK GUARD: Bir yorum içerik olarak başka kategoriye (Dram/Fantastik/Gizem/Komedi) benziyor OLABİLİR; Gizemli\'ye ' +
      'ancak ÜSLUBUNDA istisnai bir ustalık/özgünlük/derinlik VARSA gir. Sıradan, düz, klişe veya sadece uzun bir yorumu ' +
      '(özel üslup ustalığı yoksa) buraya ASLA ATMA — o zaman gerçek kategorisine (Dram/Fantastik/Gizem/Komedi) ata.',
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

/**
 * Bir kategorinin eşiği. Admin override (opsiyonel 2. arg) varsa onu, yoksa kod-içi
 * cat.threshold'u, o da yoksa DEFAULT_CATEGORY_THRESHOLD'u kullanır. Override argümanı
 * opsiyonel → mevcut tüm çağrı yerleri ve testler değişmeden çalışır (bu modül prisma'ya
 * bağımlı DEĞİL; override'ı sadece argüman olarak alır — DB okuma character-thresholds'ta).
 */
export function categoryThreshold(
  cat: CharacterCategory,
  overrides?: Record<string, { threshold?: number; minReviewLength?: number }>,
): number {
  const ov = overrides?.[cat.key]?.threshold;
  if (typeof ov === 'number' && ov > 0) return ov;
  return cat.threshold && cat.threshold > 0 ? cat.threshold : DEFAULT_CATEGORY_THRESHOLD;
}

/** Bir kategorinin min. yorum uzunluğu (0 = şart yok). Admin override desteklenir. */
export function categoryMinReviewLength(
  cat: CharacterCategory,
  overrides?: Record<string, { threshold?: number; minReviewLength?: number }>,
): number {
  const ov = overrides?.[cat.key]?.minReviewLength;
  if (typeof ov === 'number' && ov >= 0) return ov;
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
