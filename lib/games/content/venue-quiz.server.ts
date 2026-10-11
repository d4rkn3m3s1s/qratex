/**
 * Mekân Bilgi Yarışması — ETİKETLİ soru havuzu (yalnız sunucu).
 *
 * YALNIZ `lib/games/validators/venue-quiz.ts` içe aktarır (o da yalnız sunucu modülleri ve
 * düello API'si tarafından). İstemci paketine GİRMEZ: doğru şık burada.
 *
 * Yazım kuralları:
 *  - Kimlik kalıcı: `vq-<kategori>-<nn>`. Kimliği değiştirmek soruyu pratik/sıralı havuz
 *    arasında taşır (`splitPools` kimlik karmasıyla ayırır).
 *  - `options[0]` DOĞRU şıktır (yazım kolaylığı); tur kurulurken şıklar tohumla karıştırılır,
 *    istemciye opak şık kimlikleri (`o0…o3`) gider.
 *  - `why` kısa açıklama: pratikte ve düello sonrası gösterilir, sıralıda SİLİNİR.
 *  - Tartışmalı/tarihi kesin olmayan bilgiler yazılmaz; yalnız yaygın kabul gören bilgiler.
 *
 * Bayi sponsorlu sorular (`SPONSORED_QUESTIONS`): aynı şema + sponsor alanları. Bir bayi
 * sorusu yalnız (a) admin incelemesinden geçtiyse (`reviewed: true`) ve (b) `active: true`
 * iken turlara girer; sıralı turda en fazla 1 sponsorlu soru olur ve kartta "Sponsorlu"
 * etiketiyle bayinin adı gösterilir. Şema değişikliği gerektirmez: içerik bu dosyada
 * (sürüm kontrollü, kod incelemesinden geçerek) tutulur. Bugün onaylı sponsorlu soru YOK.
 */
import type { ContentItem } from './pool';
import type { CategoryId } from '@/components/customer/games/venue-quiz/rules';

export interface VenueQuizPayload extends Record<string, unknown> {
  category: CategoryId;
  prompt: string;
  /** options[0] doğru şık. */
  options: [string, string, string, string];
  why?: string;
  /** Yalnız sponsorlu sorularda: kartta gösterilen bayi adı. */
  sponsorName?: string;
}

export type VenueQuizItem = ContentItem<'o0', VenueQuizPayload>;

export interface SponsoredQuestion {
  /** `vqs-<bayi-kısa>-<nn>` */
  id: string;
  /** Sponsor bayinin `Dealer.id`'si (kayıt/denetim için; istemciye gitmez). */
  dealerId: string;
  /** Kartta gösterilecek bayi adı. */
  sponsorName: string;
  category: CategoryId;
  difficulty: 1 | 2 | 3;
  prompt: string;
  /** options[0] doğru şık. */
  options: [string, string, string, string];
  why?: string;
  /** Admin içerik incelemesi tamamlandı mı (yanıltıcı/reklam dili/yanlış bilgi yok). */
  reviewed: boolean;
  /** Yayında mı (bayi sözleşmesi süresince true). */
  active: boolean;
}

/** Onaylı bayi soruları. Gerçek bir bayi sözleşmesi ve inceleme olmadan EKLENMEZ. */
export const SPONSORED_QUESTIONS: readonly SponsoredQuestion[] = [];

type Opts = [string, string, string, string];

function q(id: string, category: CategoryId, difficulty: 1 | 2 | 3, prompt: string, options: Opts, why?: string): VenueQuizItem {
  return { id: `vq-${id}`, label: 'o0', difficulty, payload: { category, prompt, options, ...(why ? { why } : {}) } };
}

const K = 'kahve' as const;
const M = 'mutfak' as const;
const T = 'tatli' as const;
const I = 'icecek' as const;
const S = 'sehir' as const;
const X = 'mekan' as const;

export const VENUE_QUIZ_BANK: readonly VenueQuizItem[] = [
  // ───────────── Kahve & Çay ─────────────
  q('kahve-01', K, 1, 'Türk kahvesi geleneksel olarak hangi kapta pişirilir?', ['Cezve', 'Moka pot', 'French press', 'Semaver'], 'Cezve, uzun saplı ve dar ağızlı küçük bir kaptır.'),
  q('kahve-02', K, 3, '“Türk kahvesi kültürü ve geleneği” UNESCO Somut Olmayan Kültürel Miras listesine hangi yıl girdi?', ['2013', '2008', '2017', '2003'], 'Türk kahvesi kültürü 2013’te listeye alındı.'),
  q('kahve-03', K, 1, 'Espressonun üzerindeki açık kahverengi köpük tabakasına ne denir?', ['Krema (crema)', 'Latte art', 'Telve', 'Ristretto'], 'Krema, basınçla demlemede yağların ve gazların oluşturduğu köpüktür.'),
  q('kahve-04', K, 2, 'Daha az suyla çekilen, normal espressodan daha kısa ve yoğun shot hangisidir?', ['Ristretto', 'Lungo', 'Americano', 'Doppio'], 'Ristretto “kısıtlanmış” demektir; lungo ise daha uzun çekilir.'),
  q('kahve-05', K, 1, 'Espressoya sıcak su eklenerek hazırlanan içecek hangisidir?', ['Americano', 'Macchiato', 'Cortado', 'Affogato']),
  q('kahve-06', K, 2, 'Bir top dondurmanın üzerine sıcak espresso dökülerek yapılan tatlı hangisidir?', ['Affogato', 'Frappé', 'Granita', 'Cortado'], 'Affogato İtalyanca “boğulmuş” demektir.'),
  q('kahve-07', K, 2, 'Arabica ve Robusta çekirdeklerinden hangisi genellikle daha fazla kafein içerir?', ['Robusta', 'Arabica', 'İkisi eşittir', 'İkisi de kafein içermez'], 'Robusta çekirdeği Arabica’nın yaklaşık iki katı kafein içerir.'),
  q('kahve-08', K, 1, 'Türkiye’de çay üretiminin en yoğun olduğu il hangisidir?', ['Rize', 'Bolu', 'Giresun', 'Sinop']),
  q('kahve-09', K, 1, 'İki katlı Türk çaydanlığında üstteki küçük demlikte ne bulunur?', ['Yoğun demlenmiş çay', 'Yalnız kaynar su', 'Süt', 'Şeker şurubu'], 'Alttaki büyük kapta su kaynar; demlik üstte buharla ısınır.'),
  q('kahve-10', K, 2, 'İyi demlenmiş, berrak kırmızı çayın rengi için hangi deyim kullanılır?', ['Tavşan kanı', 'Kuzu kanı', 'Kiremit rengi', 'Bal rengi']),
  q('kahve-11', K, 1, 'Türk kahvesinin yanında geleneksel olarak ne ikram edilir?', ['Bir bardak su', 'Ayran', 'Limonata', 'Süt'], 'Su, ağzı temizleyip kahvenin tadını daha iyi almayı sağlar.'),
  q('kahve-12', K, 2, 'Cold brew kahve nasıl hazırlanır?', ['Soğuk suda saatlerce demlenerek', 'Sıcak kahvenin buzla soğutulmasıyla', 'Buhar basıncıyla', 'Cezvede kaynatılarak'], 'Cold brew genellikle 12–24 saat soğuk demlenir.'),
  q('kahve-13', K, 2, 'Cappuccino ile latte arasındaki temel fark nedir?', ['Cappuccino’da süt köpüğü daha fazladır', 'Latte’de espresso yoktur', 'Cappuccino soğuk servis edilir', 'Latte çay bazlıdır']),
  q('kahve-14', K, 3, 'Flat white’ın kökeni en çok hangi ülkelerle ilişkilendirilir?', ['Avustralya ve Yeni Zelanda', 'İtalya ve Fransa', 'ABD ve Kanada', 'Brezilya ve Kolombiya']),
  q('kahve-15', K, 1, 'Dünyanın en büyük kahve üreticisi ülke hangisidir?', ['Brezilya', 'Kolombiya', 'Etiyopya', 'Kenya']),
  q('kahve-16', K, 2, 'Kahvenin anavatanı olarak yaygın kabul gören ülke hangisidir?', ['Etiyopya', 'Brezilya', 'Endonezya', 'Türkiye'], 'Kahve bitkisi Etiyopya’nın Kaffa bölgesinden yayılmıştır.'),
  q('kahve-17', K, 2, 'Kahve çekirdeği aslında bitkinin hangi kısmıdır?', ['Meyvesinin çekirdeği', 'Kökü', 'Yaprağı', 'Çiçeğinin tozu'], 'Kahve meyvesine “kiraz” denir; çekirdek onun içindedir.'),
  q('kahve-18', K, 2, 'Menengiç kahvesi neyden yapılır?', ['Menengiç ağacının yabani fıstığından', 'Nohuttan', 'Arpadan', 'Hurma çekirdeğinden'], 'Kafeinsizdir; menengiç (çitlembik) meyvesi kavrulup dövülür.'),
  q('kahve-19', K, 2, 'Dibek kahvesi adını nereden alır?', ['Taş ya da ahşap dibekte dövülmesinden', 'Bir şehirden', 'Kavurma derecesinden', 'Kahve çeşidinden']),
  q('kahve-20', K, 2, 'Acı ve koyu bir kahve olan mırra hangi bölgemizle özdeşleşir?', ['Güneydoğu Anadolu', 'Karadeniz', 'Ege', 'Trakya']),
  q('kahve-21', K, 2, 'V60 hangi demleme yöntemine örnektir?', ['Filtre (dökme / pour-over)', 'Espresso', 'Türk kahvesi', 'Soğuk demleme']),
  q('kahve-22', K, 3, 'Bir espresso makinesinin standart demleme basıncı yaklaşık kaç bardır?', ['9 bar', '2 bar', '25 bar', '50 bar']),
  q('kahve-23', K, 2, 'Türk kahvesinde şeker ne zaman eklenir?', ['Pişirmeden önce cezveye', 'Servisten sonra fincana', 'Telve çöktükten sonra', 'Kahve kavrulurken'], 'Şeker sonradan eklenemediği için sipariş “sade / orta / şekerli” diye verilir.'),
  q('kahve-24', K, 1, 'Türk kahvesinde fincanın dibine çöken kısma ne denir?', ['Telve', 'Krema', 'Kaymak', 'Posa yağı']),
  q('kahve-25', K, 1, 'Matcha nedir?', ['Toz hâline getirilmiş yeşil çay', 'Fermente siyah çay', 'Bir kahve çeşidi', 'Bitki karışımı'], 'Matcha, gölgede yetiştirilen çay yapraklarının taş değirmende öğütülmesiyle yapılır.'),
  q('kahve-26', K, 2, 'Earl Grey çayına karakteristik aromasını veren nedir?', ['Bergamot', 'Vanilya', 'Tarçın', 'Lavanta']),
  q('kahve-27', K, 1, 'Baharatlı ve sütlü “masala chai” hangi ülkeyle özdeşleşir?', ['Hindistan', 'Japonya', 'Fas', 'Rusya']),
  q('kahve-28', K, 2, 'Fas’ta geleneksel çay hangi bitkiyle birlikte demlenir?', ['Nane', 'Adaçayı', 'Ihlamur', 'Kekik']),
  q('kahve-29', K, 2, 'Rus ve Türk çay kültüründe suyu sürekli sıcak tutan büyük metal kap hangisidir?', ['Semaver', 'Cezve', 'Güğüm', 'İbrik']),
  q('kahve-30', K, 2, 'İtalyanca “macchiato” kelimesinin anlamı nedir?', ['Lekeli', 'Köpüklü', 'Sıcak', 'Küçük'], 'Espresso bir parça süt köpüğüyle “lekelenir”.'),
  q('kahve-31', K, 3, 'Nitro cold brew, kremamsı dokusunu hangi gazla servis edilmesinden alır?', ['Azot', 'Karbondioksit', 'Oksijen', 'Helyum']),

  // ───────────── Türk Mutfağı ─────────────
  q('mutfak-01', M, 1, 'İskender kebabı hangi şehirle özdeşleşmiştir?', ['Bursa', 'Adana', 'Gaziantep', 'Konya']),
  q('mutfak-02', M, 1, 'Uzun, ince hamuru ve kıymalı harcıyla “etli ekmek” hangi şehrin lezzetidir?', ['Konya', 'Rize', 'Edirne', 'İzmir']),
  q('mutfak-03', M, 1, 'Küçük bohçalarıyla ünlü mantısı en çok hangi şehirle anılır?', ['Kayseri', 'Trabzon', 'İzmir', 'Edirne']),
  q('mutfak-04', M, 1, 'Tava ciğeriyle ünlü şehir hangisidir?', ['Edirne', 'Bolu', 'Muğla', 'Rize']),
  q('mutfak-05', M, 1, 'Hamsili pilav hangi bölgenin mutfağına aittir?', ['Karadeniz', 'Akdeniz', 'İç Anadolu', 'Ege']),
  q('mutfak-06', M, 2, 'Karadeniz’in mıhlaması (kuymak) hangi temel malzemelerle yapılır?', ['Mısır unu, tereyağı ve peynir', 'Pirinç ve kıyma', 'Bulgur ve nohut', 'Patates ve yumurta']),
  q('mutfak-07', M, 1, 'Çiğ köftenin ana tahılı hangisidir?', ['İnce bulgur', 'Pirinç', 'Arpa', 'Mısır irmiği']),
  q('mutfak-08', M, 1, 'Hünkâr beğendinin “beğendi” kısmı neyden yapılır?', ['Közlenmiş patlıcan', 'Patates püresi', 'Nohut', 'Kabak'], 'Közlenmiş patlıcan sütlü beşamelle ezilir; üstüne et yahnisi konur.'),
  q('mutfak-09', M, 1, 'İmam bayıldı hangi sebzeyle yapılır?', ['Patlıcan', 'Biber', 'Kabak', 'Enginar']),
  q('mutfak-10', M, 2, 'Karnıyarık ile imam bayıldı arasındaki temel fark nedir?', ['Karnıyarık kıymalı, imam bayıldı etsiz zeytinyağlıdır', 'Karnıyarık kabakla yapılır', 'İmam bayıldı kızartılmaz, haşlanır', 'Aralarında fark yoktur']),
  q('mutfak-11', M, 1, 'Ezogelin çorbasının ana malzemesi hangisidir?', ['Kırmızı mercimek', 'Yeşil mercimek', 'Nohut', 'Kuru fasulye'], 'Kırmızı mercimeğe bulgur, pirinç, nane ve pul biber eşlik eder.'),
  q('mutfak-12', M, 2, 'Tarhana nasıl hazırlanır?', ['Yoğurt, un ve sebzeler mayalandırılıp kurutularak', 'Et suyu ve pirinç kaynatılarak', 'Mısır ve süt fırınlanarak', 'Balık ve sebze tütsülenerek']),
  q('mutfak-13', M, 2, 'Toprak testide pişirilip masada kırılarak servis edilen testi kebabı hangi yöreyle özdeşleşir?', ['Nevşehir (Kapadokya)', 'Rize', 'Tekirdağ', 'Aydın']),
  q('mutfak-14', M, 1, 'Yatay şişte pişirilen cağ kebabı hangi şehrin lezzetidir?', ['Erzurum', 'Adana', 'Bursa', 'Manisa']),
  q('mutfak-15', M, 1, 'Tantuni hangi şehrin lezzetidir?', ['Mersin', 'Hatay', 'Antalya', 'Muğla']),
  q('mutfak-16', M, 2, 'Pilavın tane tane olması için pirinç pişirilmeden önce genellikle ne yapılır?', ['Suda bekletilip nişastası yıkanır', 'Sirkeyle yoğrulur', 'Una bulanır', 'Dondurulur']),
  q('mutfak-17', M, 2, 'Kuzu tandır nasıl pişirilir?', ['Kuyu tipi fırında (tandırda) uzun süre', 'Tavada birkaç dakikada', 'Haşlanarak', 'Mangalda şişte']),
  q('mutfak-18', M, 1, 'Mercimek köftesinin temel malzemeleri hangileridir?', ['Kırmızı mercimek ve ince bulgur', 'Kıyma ve pirinç', 'Nohut ve patates', 'Yeşil mercimek ve un']),
  q('mutfak-19', M, 2, 'Sarma ile dolma arasındaki fark nedir?', ['Sarmada harç yaprağa sarılır, dolmada sebzenin içi doldurulur', 'Sarma etsiz, dolma etlidir', 'Sarma fırında, dolma tavada pişer', 'Aralarında fark yoktur']),
  q('mutfak-20', M, 2, 'Sabah kahvaltısında içilen, etli ve pirinçli acılı beyran çorbası hangi şehrin lezzetidir?', ['Gaziantep', 'Bolu', 'İzmir', 'Samsun']),
  q('mutfak-21', M, 2, 'Kokoreç nasıl hazırlanır?', ['Kuzu bağırsağı sakatatın etrafına sarılarak', 'Dana dili haşlanarak', 'Tavuk derisi kızartılarak', 'İşkembe çorbası koyulaştırılarak']),
  q('mutfak-22', M, 1, 'Midye dolmanın içinde ne bulunur?', ['Baharatlı pilav', 'Kıyma', 'Bulgur ve et', 'Patates']),
  q('mutfak-23', M, 2, 'Su böreğinin hamuru nasıl işlenir?', ['Yufkalar haşlanıp kat kat dizilir', 'Yufkalar kızartılır', 'Hamur mayalanıp kabartılır', 'Yufkalar çiğ bırakılır']),
  q('mutfak-24', M, 3, 'Düğün ve bayramlarda pişirilen, buğday ve etle yapılan, 2011’de UNESCO listesine giren yemek hangisidir?', ['Keşkek', 'Kavurma', 'Etli pilav', 'Kuru fasulye']),
  q('mutfak-25', M, 1, 'Menemenin temel malzemeleri hangileridir?', ['Yumurta, domates ve biber', 'Kıyma ve patlıcan', 'Pirinç ve nohut', 'Peynir ve ıspanak']),
  q('mutfak-26', M, 2, 'Pastırma kurutulurken üzerine sürülen baharatlı karışıma ne denir?', ['Çemen', 'Tahin', 'Pekmez', 'Salça'], 'Çemen; çemen otu tohumu, sarımsak ve kırmızıbiberle hazırlanır.'),
  q('mutfak-27', M, 1, 'Pastırmasıyla en çok anılan şehir hangisidir?', ['Kayseri', 'Trabzon', 'Muğla', 'Edirne']),
  q('mutfak-28', M, 1, 'Adana kebabı ile Urfa kebabı arasındaki temel fark nedir?', ['Adana acılı, Urfa acısızdır', 'Adana tavuktan, Urfa kuzudan yapılır', 'Urfa fırında, Adana haşlanarak pişer', 'Fark yoktur']),
  q('mutfak-29', M, 1, 'Zeytinyağlı sebze yemekleri genellikle nasıl servis edilir?', ['Soğuk ya da oda sıcaklığında', 'Çok sıcak', 'Dondurulmuş', 'Yeniden kızartılarak']),
  q('mutfak-30', M, 2, 'Lahmacunun yanında genellikle ne sıkılır?', ['Limon', 'Portakal', 'Bal', 'Sirke'], 'Limon ve maydanozla dürülerek yenir.'),
  q('mutfak-31', M, 3, 'Hamur işlerinde “yufka” ile “milföy” arasındaki fark nedir?', ['Milföy hamuru katlar arasında tereyağı katlanarak hazırlanır', 'Yufka mayalıdır', 'Milföy haşlanır', 'Yufka şekerle yapılır']),

  // ───────────── Tatlı & Fırın ─────────────
  q('tatli-01', T, 1, 'Baklavasıyla ünlü, coğrafi işaretli şehir hangisidir?', ['Gaziantep', 'Sinop', 'Çanakkale', 'Kars']),
  q('tatli-02', T, 3, 'Türkiye’den Avrupa Birliği’nde coğrafi işaret tescili alan ilk ürün hangisidir?', ['Antep baklavası', 'Malatya kayısısı', 'Aydın inciri', 'Afyon kaymağı'], 'Antep baklavası 2013’te AB tescili aldı.'),
  q('tatli-03', T, 1, 'Peynirli künefesiyle ünlü il hangisidir?', ['Hatay', 'Bolu', 'Sinop', 'Bartın']),
  q('tatli-04', T, 1, 'Künefe hangi hamurla yapılır?', ['Tel kadayıf', 'Yufka', 'Milföy', 'Pişi hamuru']),
  q('tatli-05', T, 2, 'Tavuk göğsü tatlısında gerçekten tavuk var mıdır?', ['Evet, ince didiklenmiş tavuk göğsü', 'Hayır, yalnız adı öyle', 'Yalnız tavuk suyu kullanılır', 'Yalnız tavuk yağı kullanılır'], 'Haşlanıp lif lif ayrılan tavuk göğsü muhallebiye karıştırılır.'),
  q('tatli-06', T, 2, 'Kazandibinin karakteristik özelliği nedir?', ['Tepsi dibinin karamelize edilmesi', 'Üstüne dondurma konması', 'Kızgın yağda kızartılması', 'Şerbete batırılması']),
  q('tatli-07', T, 2, 'Aşure geleneksel olarak hangi ayda pişirilip dağıtılır?', ['Muharrem', 'Ramazan', 'Şevval', 'Recep']),
  q('tatli-08', T, 1, 'Lokumun İngilizcedeki yaygın adı nedir?', ['Turkish delight', 'Sweet cube', 'Rose candy', 'Sultan gum']),
  q('tatli-09', T, 2, 'Şerbetli tatlılarda genel kural nedir?', ['Biri sıcakken diğeri soğuk olmalı', 'İkisi de kaynar olmalı', 'İkisi de buz gibi olmalı', 'Şerbet pişirilmeden dökülmeli'], 'Sıcaklık farkı hamurun şerbeti çekip hamurlaşmamasını sağlar.'),
  q('tatli-10', T, 1, 'Sütlacın süt dışındaki ana malzemesi nedir?', ['Pirinç', 'İrmik', 'Bulgur', 'Yulaf']),
  q('tatli-11', T, 1, 'Güllaç en çok hangi ayla özdeşleşmiştir?', ['Ramazan', 'Muharrem', 'Recep', 'Şaban']),
  q('tatli-12', T, 2, 'Güllaç yaprakları neyle ıslatılır?', ['Gül suyu katılmış şekerli sütle', 'Şerbetle', 'Pekmezle', 'Eritilmiş tereyağıyla']),
  q('tatli-13', T, 2, 'Keşkülün ana aroması nedir?', ['Badem', 'Kakao', 'Kahve', 'Tarçın'], '“Keşkül-ü fukara” bademli sütlü bir muhallebidir.'),
  q('tatli-14', T, 1, 'Revaninin hamurunda kullanılan temel malzeme nedir?', ['İrmik', 'Pirinç', 'Bulgur', 'Mısır unu']),
  q('tatli-15', T, 2, 'İrmikli kurabiye hamurundan yapılan, üstüne genellikle badem ya da fındık konan şerbetli tatlı hangisidir?', ['Şekerpare', 'Lokma', 'Tulumba', 'Kemalpaşa']),
  q('tatli-16', T, 1, 'Tulumba tatlısı nasıl pişirilir?', ['Kızgın yağda kızartılıp şerbete batırılır', 'Fırında pişirilir', 'Suda haşlanır', 'Buharda pişirilir']),
  q('tatli-17', T, 2, 'Kruvasanın hamuru nasıl bir hamurdur?', ['Tereyağıyla katlanmış mayalı hamur', 'Kurabiye hamuru', 'Mayasız pide hamuru', 'Haşlanmış hamur']),
  q('tatli-18', T, 2, 'Fransızca “croissant” kelimesinin anlamı nedir?', ['Hilal', 'Tereyağı', 'Sabah', 'Katman']),
  q('tatli-19', T, 1, 'Simidin üzerine bulanan tohum hangisidir?', ['Susam', 'Haşhaş', 'Çörek otu', 'Keten tohumu']),
  q('tatli-20', T, 2, 'Simit fırına girmeden önce neye batırılır?', ['Pekmezli suya', 'Yumurta sarısına', 'Süte', 'Zeytinyağına'], 'Pekmezli su, simidin parlak ve koyu kabuğunu verir.'),
  q('tatli-21', T, 2, 'Profiterolün hamuru hangisidir?', ['Şu (choux) hamuru', 'Milföy', 'Yufka', 'Kurabiye hamuru']),
  q('tatli-22', T, 1, 'Tiramisu hangi ülkenin tatlısıdır?', ['İtalya', 'Fransa', 'İspanya', 'Avusturya']),
  q('tatli-23', T, 2, 'Tiramisuda kullanılan krem peynir hangisidir?', ['Mascarpone', 'Ricotta', 'Lor', 'Cheddar']),
  q('tatli-24', T, 2, 'Fransız macaronunun kabuğunda kullanılan ana un hangisidir?', ['Badem unu', 'Hindistan cevizi unu', 'Mısır unu', 'İrmik']),
  q('tatli-25', T, 2, 'San Sebastián cheesecake’i hangi özelliğiyle tanınır?', ['Üstü yüksek ısıda koyu karamelize edilir', 'Fırına hiç girmez', 'Çikolatalı bisküvi tabanı vardır', 'Dondurularak servis edilir']),
  q('tatli-26', T, 2, 'Brownie hangi ülkede ortaya çıkmıştır?', ['ABD', 'Belçika', 'İsviçre', 'İngiltere']),
  q('tatli-27', T, 1, 'Kaymağıyla ünlü il hangisidir?', ['Afyonkarahisar', 'Sinop', 'Kırklareli', 'Hakkari']),
  q('tatli-28', T, 2, 'Mersin’in meşhur cezeryesi hangi sebzeden yapılır?', ['Havuç', 'Pancar', 'Kabak', 'Patates']),
  q('tatli-29', T, 1, 'Kabak tatlısının üzerine geleneksel olarak ne konur?', ['Tahin ve ceviz', 'Dondurma', 'Çikolata sosu', 'Hindistan cevizi']),
  q('tatli-30', T, 1, 'İnce iplik gibi yapısıyla bilinen pişmaniye hangi ille özdeşleşir?', ['Kocaeli', 'Mardin', 'Van', 'Muğla']),
  q('tatli-31', T, 1, 'Kestane şekeriyle ünlü şehir hangisidir?', ['Bursa', 'Konya', 'Kars', 'Mardin']),

  // ───────────── İçecekler ─────────────
  q('icecek-01', I, 1, 'Ayranın temel malzemeleri hangileridir?', ['Yoğurt, su ve tuz', 'Süt ve şeker', 'Kefir ve bal', 'Peynir altı suyu ve limon']),
  q('icecek-02', I, 1, 'Şalgam suyu en çok hangi şehirle özdeşleşir?', ['Adana', 'Bolu', 'Rize', 'Edirne']),
  q('icecek-03', I, 2, 'Şalgam suyuna koyu kırmızı-mor rengini veren nedir?', ['Mor (siyah) havuç', 'Pancar', 'Nar', 'Kırmızı lahana']),
  q('icecek-04', I, 2, 'Türk bozası geleneksel olarak neyden yapılır?', ['Darı gibi tahılların mayalanmasıyla', 'Üzüm suyundan', 'Elmadan', 'Pirinç ve sütten']),
  q('icecek-05', I, 1, 'Bozanın üzerine geleneksel olarak ne serpilir?', ['Tarçın ve leblebi', 'Hindistan cevizi', 'Susam', 'Kakao']),
  q('icecek-06', I, 2, 'Salep neyden elde edilen unla yapılır?', ['Orkide yumrularından', 'Mısır nişastasından', 'Pirinçten', 'Bademden']),
  q('icecek-07', I, 1, 'Sıcak salebin üzerine genellikle ne serpilir?', ['Tarçın', 'Tuz', 'Karabiber', 'Kimyon']),
  q('icecek-08', I, 1, 'Kefir nedir?', ['Fermente bir süt içeceği', 'Gazlı meyve suyu', 'Bir bitki çayı', 'Tahıl suyu']),
  q('icecek-09', I, 2, 'Ev yapımı limonatada kabuk aromasını çıkarmak için limon kabuğu neyle ovulur?', ['Şekerle', 'Tuzla', 'Unla', 'Sirkeyle']),
  q('icecek-10', I, 2, 'Kombucha nedir?', ['Mayalandırılmış şekerli çay', 'Gazlı süt', 'Kahve şurubu', 'Meyveli soda']),
  q('icecek-11', I, 1, 'Doğal olarak mineralli ve gazlı çıkan içme suyuna ne denir?', ['Maden suyu', 'Şıra', 'Hoşaf', 'Şerbet']),
  q('icecek-12', I, 2, 'Şıra nedir?', ['Üzümün tazeyken sıkılan, az mayalanmış suyu', 'Elma sirkesi', 'Tahıl birası', 'Bir bitki çayı']),
  q('icecek-13', I, 1, 'Hoşaf nasıl yapılır?', ['Kuru meyveler şekerli suda pişirilerek', 'Taze meyveler sıkılarak', 'Gazlı suya meyve katılarak', 'Yoğurtla çırpılarak']),
  q('icecek-14', I, 2, 'Köpüklü ayranıyla ünlü Balıkesir ilçesi hangisidir?', ['Susurluk', 'Ayvalık', 'Edremit', 'Gönen']),
  q('icecek-15', I, 1, 'Alkolsüz mojitonun temel aroması nedir?', ['Nane ve misket limonu', 'Çilek ve vanilya', 'Tarçın ve karanfil', 'Zencefil ve bal']),
  q('icecek-16', I, 1, 'Smoothie ile milkshake arasındaki temel fark nedir?', ['Smoothie meyve püresi bazlı, milkshake süt ve dondurma bazlıdır', 'Smoothie sıcak servis edilir', 'Milkshake meyvesizdir ve gazlıdır', 'Fark yoktur']),
  q('icecek-17', I, 3, 'Köpüklü soğuk kahve “frappé” hangi ülkede ortaya çıkmıştır?', ['Yunanistan', 'İtalya', 'Brezilya', 'ABD'], '1957’de Selanik’te bir fuarda hazır kahve çalkalanarak bulunduğu anlatılır.'),
  q('icecek-18', I, 2, 'İçinde tapyoka incileri olan bubble tea hangi ülkede doğmuştur?', ['Tayvan', 'Japonya', 'Güney Kore', 'Tayland']),
  q('icecek-19', I, 2, 'Kakao ağacının anavatanı neresidir?', ['Orta ve Güney Amerika', 'Batı Afrika', 'Güneydoğu Asya', 'Akdeniz']),
  q('icecek-20', I, 2, 'Yayık ayranı nedir?', ['Tereyağı çıkarılırken yayıkta kalan ayran', 'Paketli ayran', 'Gazlı ayran', 'Tuzsuz ayran']),
  q('icecek-21', I, 1, 'Gazlı içeceklerdeki kabarcıkları oluşturan gaz hangisidir?', ['Karbondioksit', 'Oksijen', 'Azot', 'Helyum']),
  q('icecek-22', I, 2, 'Osmanlı mutfağında şerbet genellikle ne zaman içilirdi?', ['Yemekle birlikte ya da sonrasında', 'Yalnız sabah aç karnına', 'Yalnız kışın sıcak olarak', 'Hiç içilmezdi; yalnız tatlıya dökülürdü']),
  q('icecek-23', I, 2, 'Ihlamur genellikle bitkinin hangi kısmından demlenir?', ['Çiçekleri ve yaprakçıklarından', 'Kökünden', 'Kabuğundan', 'Meyvesinden']),
  q('icecek-24', I, 3, 'Çayın siyah, yeşil ya da beyaz olmasını belirleyen asıl etken nedir?', ['Yaprağın işlenmesi ve oksidasyon derecesi', 'Bitkinin türü', 'Demleme suyunun sıcaklığı', 'Yetiştiği ülke'], 'Hepsi aynı Camellia sinensis bitkisinden gelir.'),
  q('icecek-25', I, 2, 'Sütlü kahve için Fransızca “café au lait” ne demektir?', ['Sütlü kahve', 'Köpüklü kahve', 'Şekerli kahve', 'Soğuk kahve']),

  // ───────────── Şehir Kültürü ─────────────
  q('sehir-01', S, 1, 'Teknelerde pişen balık ekmekle ünlü İstanbul semti hangisidir?', ['Eminönü', 'Bağcılar', 'Ümraniye', 'Esenyurt']),
  q('sehir-02', S, 1, 'Kumpiriyle ünlü İstanbul semti hangisidir?', ['Ortaköy', 'Eyüpsultan', 'Zeytinburnu', 'Pendik']),
  q('sehir-03', S, 2, 'İstanbul’un Sarıyer semti hangi lezzetiyle tanınır?', ['Böreği', 'Kumpiri', 'Tantunisi', 'Lahmacunu']),
  q('sehir-04', S, 1, 'İzmir kahvaltısının meşhur, yağlı ve kat kat hamur işi hangisidir?', ['Boyoz', 'Pişi', 'Gözleme', 'Katmer']),
  q('sehir-05', S, 1, 'İzmir’de “gevrek” denilen şeye İstanbul’da ne denir?', ['Simit', 'Poğaça', 'Açma', 'Pide']),
  q('sehir-06', S, 3, 'Ankara’nın tescilli yemeği “Ankara tava” neyle yapılır?', ['Kuzu eti ve arpa şehriye', 'Balık ve pirinç', 'Tavuk ve bulgur', 'Nohut ve patates']),
  q('sehir-07', S, 2, 'Bolu’nun Mengen ilçesi neyle ünlüdür?', ['Aşçılarıyla', 'Halısıyla', 'Madenleriyle', 'Balığıyla'], 'Mengen’de her yıl Aşçılar Festivali düzenlenir.'),
  q('sehir-08', S, 2, 'Gaziantep, UNESCO Yaratıcı Şehirler Ağı’na hangi alanda katıldı?', ['Gastronomi', 'Müzik', 'Edebiyat', 'Tasarım']),
  q('sehir-09', S, 2, 'Aşağıdakilerden hangisi UNESCO “Gastronomi Şehri” unvanı alan Türk şehirlerindendir?', ['Hatay', 'Rize', 'Kırşehir', 'Bartın']),
  q('sehir-10', S, 2, 'Büyük, odun fırınında pişen Vakfıkebir ekmeği hangi ile bağlıdır?', ['Trabzon', 'Rize', 'Bolu', 'Ordu']),
  q('sehir-11', S, 1, 'Akçaabat köftesi hangi ilin lezzetidir?', ['Trabzon', 'Samsun', 'Giresun', 'Artvin']),
  q('sehir-12', S, 1, 'İnegöl köftesi hangi ilin lezzetidir?', ['Bursa', 'Kütahya', 'Bilecik', 'Eskişehir']),
  q('sehir-13', S, 3, 'Eskişehir’in meşhur çiböreği şehre hangi toplulukla gelmiştir?', ['Kırım Tatarları', 'Yörükler', 'Lazlar', 'Boşnaklar']),
  q('sehir-14', S, 2, 'Ankara’nın Beypazarı ilçesi hangi lezzetiyle ünlüdür?', ['Kurusu (kuru pasta)', 'Tantunisi', 'Lahmacunu', 'Hamsisi']),
  q('sehir-15', S, 1, 'Safranbolu adını hangi baharattan alır?', ['Safran', 'Kimyon', 'Sumak', 'Pul biber']),
  q('sehir-16', S, 2, 'Urfa mutfağındaki “isot” nedir?', ['Güneşte terletilerek koyulaşan Urfa pul biberi', 'Bir tatlı', 'Bir çorba', 'Bir peynir']),
  q('sehir-17', S, 2, 'Maraş dondurmasına esnek, uzayan kıvamını veren malzeme hangisidir?', ['Salep', 'Jelatin', 'Pirinç unu', 'Yumurta akı']),
  q('sehir-18', S, 1, 'Kars hangi ürünleriyle ünlüdür?', ['Kaşar ve gravyer peyniri', 'Fındık', 'Çay', 'Zeytinyağı']),
  q('sehir-19', S, 2, 'Çanakkale’nin Ezine ilçesi hangi ürünüyle ünlüdür?', ['Beyaz peynir', 'Kaymak', 'Kestane', 'Lokum']),
  q('sehir-20', S, 1, 'Balıkesir’in Ayvalık ilçesi en çok hangi ürünüyle tanınır?', ['Zeytinyağı', 'Fındık', 'Çay', 'Pamuk']),
  q('sehir-21', S, 1, 'Kayısısıyla ünlü il hangisidir?', ['Malatya', 'Rize', 'Kars', 'Sinop']),
  q('sehir-22', S, 2, 'Tandırda pişen kuzu büryanıyla ünlü il hangisidir?', ['Siirt', 'Mersin', 'Sinop', 'Kırklareli']),
  q('sehir-23', S, 2, 'Gaziantep’in tereyağlı, fıstıklı katmeri geleneksel olarak ne zaman yenir?', ['Sabah kahvaltısında', 'Gece yarısı', 'Yalnız bayramda öğlen', 'Akşam yemeğinden sonra']),
  q('sehir-24', S, 1, 'Dev karpuzlarıyla bilinen il hangisidir?', ['Diyarbakır', 'Rize', 'Bartın', 'Ardahan']),
  q('sehir-25', S, 1, 'Türkiye’nin fındık üretimiyle en çok özdeşleşen ili hangisidir?', ['Giresun', 'Konya', 'Aksaray', 'Van']),
  q('sehir-26', S, 1, 'Kütahya hangi el sanatıyla ünlüdür?', ['Çini', 'Halı dokuma', 'Bakır işleme', 'Ebru']),
  q('sehir-27', S, 1, 'İstanbul’daki Mısır Çarşısı (Baharatçılar Çarşısı) hangi semttedir?', ['Eminönü', 'Kadıköy', 'Beşiktaş', 'Üsküdar']),
  q('sehir-28', S, 2, 'Erzurum’un iplik iplik ayrılan meşhur peyniri hangisidir?', ['Civil peyniri', 'Ezine peyniri', 'Hellim', 'Lor']),
  q('sehir-29', S, 2, 'Şavak tulum peyniriyle en çok anılan il hangisidir?', ['Erzincan', 'Aydın', 'Edirne', 'Kırklareli']),
  q('sehir-30', S, 2, 'Zonguldak’ın Devrek ilçesi el yapımı hangi ürünüyle ünlüdür?', ['Bastonu', 'Bıçağı', 'Halısı', 'Seramiği']),
  q('sehir-31', S, 2, 'Edirne’nin badem ezmesi dışında meşhur hediyelik ürünü hangisidir?', ['Meyve biçimli kokulu sabun', 'Çini tabak', 'Bakır cezve', 'Bıçak'], 'Edirne’nin “meyve sabunu” geleneği Osmanlı’dan kalmadır.'),

  // ───────────── Mekân Bilgisi ─────────────
  q('mekan-01', X, 1, 'Restoranlarda “à la carte” menü ne demektir?', ['Yemeklerin tek tek seçilip ayrı fiyatlandığı menü', 'Sabit fiyatlı set menü', 'Açık büfe', 'Çocuk menüsü']),
  q('mekan-02', X, 2, 'Mutfakta “mise en place” ne demektir?', ['Servis öncesi malzemelerin hazırlanıp yerleştirilmesi', 'Tatlı servisi', 'Masa rezervasyonu', 'Hesabın ödenmesi']),
  q('mekan-03', X, 1, 'Kahve hazırlama ve servis uzmanına ne denir?', ['Barista', 'Sommelier', 'Komi', 'Maître'], 'Sommelier içecek ve şarap eşleştirme uzmanıdır.'),
  q('mekan-04', X, 2, 'Mutfak hiyerarşisinde “sous chef” kimdir?', ['Şefin yardımcısı (ikinci adam)', 'Pasta şefi', 'Bulaşıkçı', 'Salon şefi']),
  q('mekan-05', X, 1, 'Makarnanın “al dente” pişirilmesi ne demektir?', ['Dişe gelen, tam yumuşamamış', 'Çok yumuşak', 'Kızarmış', 'Soğuk servis edilen']),
  q('mekan-06', X, 1, '“Medium rare” pişirilen bifteğin içi nasıldır?', ['Pembe-kırmızı ve ılık', 'Tamamen pişmiş ve gri', 'Çiğ ve soğuk', 'Kömürleşmiş']),
  q('mekan-07', X, 2, '“Sous vide” pişirme tekniği nedir?', ['Vakumlanmış yiyeceğin sabit ve düşük ısıda su banyosunda pişirilmesi', 'Yüksek ısıda fırınlama', 'Derin yağda kızartma', 'Soğuk tütsüleme']),
  q('mekan-08', X, 1, '“Brunch” nedir?', ['Kahvaltı ile öğle yemeğini birleştiren geç öğün', 'Akşam atıştırmalığı', 'Gece yarısı menüsü', 'Bir tatlı türü']),
  q('mekan-09', X, 2, 'Restoranlarda “kuver” (couvert) nedir?', ['Masa başına alınan ekmek ve başlangıç servisi ücreti', 'Bahşiş', 'Rezervasyon kaporası', 'Paket servis ücreti']),
  q('mekan-10', X, 3, 'Türkiye’de lokanta ve kafeler fiyat listesini nerede göstermekle yükümlüdür?', ['Girişte dışarıdan görülebilecek yerde ve masada', 'Yalnız hesap fişinde', 'Yalnız internet sitesinde', 'Hiçbir yerde, istenirse sözlü'], 'Fiyat Etiketi Yönetmeliği değişikliğiyle (2024) zorunlu hâle geldi.'),
  q('mekan-11', X, 2, 'Mutfak stok yönetiminde “FIFO” ilkesi nedir?', ['İlk giren ilk çıkar', 'Son giren ilk çıkar', 'En pahalı önce kullanılır', 'En hafif önce kullanılır']),
  q('mekan-12', X, 3, 'Gıda güvenliğinde bakterilerin hızla çoğaldığı “tehlikeli sıcaklık aralığı” yaklaşık hangisidir?', ['5–60 °C', '60–100 °C', '−18–0 °C', '0–2 °C']),
  q('mekan-13', X, 2, 'Dondurucularda önerilen standart saklama sıcaklığı nedir?', ['−18 °C', '0 °C', '4 °C', '−5 °C']),
  q('mekan-14', X, 2, 'Buzdolabının soğutucu bölmesi için önerilen sıcaklık aralığı hangisidir?', ['0–4 °C', '8–12 °C', '15–20 °C', '−18 °C ve altı']),
  q('mekan-15', X, 1, 'Mutfakta çapraz bulaşmayı önlemek için çiğ et ve sebze için ne yapılır?', ['Ayrı kesme tahtaları kullanılır', 'Aynı tahta durulamadan kullanılır', 'Önce et sonra sebze doğranır', 'Tahta kullanılmaz, tabakta doğranır']),
  q('mekan-16', X, 3, 'HACCP nedir?', ['Tehlike analizi ve kritik kontrol noktalarına dayalı gıda güvenliği sistemi', 'Bir kahve sertifikası', 'Bir vergi türü', 'Menü tasarım yöntemi']),
  q('mekan-17', X, 3, 'Şefin menüde olmayan, tek lokmalık ikramına ne denir?', ['Amuse-bouche', 'Entrée', 'Digestif', 'Sorbet'], 'Fransızca “ağzı eğlendiren” demektir.'),
  q('mekan-18', X, 1, '“Tadım menüsü” (tasting menu) nedir?', ['Çok sayıda küçük porsiyondan oluşan şef menüsü', 'Ücretsiz deneme yemeği', 'Yalnız tatlılardan oluşan menü', 'Çocuk menüsü']),
  q('mekan-19', X, 1, '“Take away” ne demektir?', ['Paket servis, al götür', 'Masaya servis', 'Açık büfe', 'Rezervasyon iptali']),
  q('mekan-20', X, 1, '“Açık mutfak” ne demektir?', ['Mutfağın salondan görülebilecek şekilde açık olması', 'Mutfağın 24 saat açık olması', 'Mutfağın bahçede olması', 'Misafirin kendi yemeğini pişirmesi']),
  q('mekan-21', X, 1, 'Servis personeline bırakılan gönüllü ödemeye ne denir?', ['Bahşiş', 'Kuver', 'KDV', 'Kapora']),
  q('mekan-22', X, 2, 'Rezervasyon dilinde “no-show” ne demektir?', ['Rezervasyonu olup haber vermeden gelmeyen misafir', 'Rezervasyonsuz gelen misafir', 'Erken gelen misafir', 'Masa değiştiren misafir']),
  q('mekan-23', X, 2, 'Sebzelerin ince uzun kibrit çöpü biçiminde doğranmasına ne denir?', ['Jülyen', 'Brunoise', 'Chiffonade', 'Paysanne']),
  q('mekan-24', X, 3, 'Sebzelerin çok küçük (2–3 mm) küpler hâlinde doğranmasına ne denir?', ['Brunoise', 'Jülyen', 'Chiffonade', 'Tourné']),
  q('mekan-25', X, 2, 'Benmari (bain-marie) nedir?', ['Sıcak su banyosunda yavaşça ısıtma ya da pişirme', 'Buzlu suda soğutma', 'Kızgın yağda kızartma', 'Fırında közleme']),
  q('mekan-26', X, 3, 'Sosları koyulaştırmak için un ve tereyağının birlikte pişirilmesiyle yapılan karışıma ne denir?', ['Roux', 'Glaze', 'Coulis', 'Purée']),
  q('mekan-27', X, 1, 'Tatlı, tuzlu, ekşi ve acıdan sonra “beşinci tat” olarak bilinen tat hangisidir?', ['Umami', 'Baharatlı', 'Metalik', 'Serinletici']),
  q('mekan-28', X, 3, 'Etin ya da ekmeğin ısıyla kızarıp aroma kazanmasını açıklayan tepkime hangisidir?', ['Maillard tepkimesi', 'Fermentasyon', 'Emülsiyon', 'Kristalleşme']),
  q('mekan-29', X, 2, 'Ekşi maya nedir?', ['Yabani maya ve bakterilerle beslenen doğal hamur kültürü', 'Hazır kuru maya', 'Kabartma tozu', 'Sirkeli su']),
  q('mekan-30', X, 1, 'Aşağıdakilerden hangisi gluten içerir?', ['Buğday', 'Pirinç', 'Mısır', 'Karabuğday'], 'Karabuğday adına rağmen buğday değildir ve glutensizdir.'),
  q('mekan-31', X, 2, 'Vegan bir menüde aşağıdakilerden hangisi bulunmaz?', ['Bal', 'Mercimek', 'Zeytinyağı', 'Nohut'], 'Veganlar bal dahil hiçbir hayvansal ürünü tüketmez.'),
  q('mekan-32', X, 1, 'Vejetaryen ile vegan beslenme arasındaki fark nedir?', ['Vejetaryenler süt ve yumurta tüketebilir, veganlar hiçbir hayvansal ürün tüketmez', 'Veganlar balık yer', 'Vejetaryenler et yer ama tavuk yemez', 'Fark yoktur']),
  q('mekan-33', X, 1, 'Menülerde alerjen olarak en sık belirtilmesi gerekenlerden biri hangisidir?', ['Yer fıstığı', 'Su', 'Tuz', 'Şeker']),
  q('mekan-34', X, 2, '“Table d’hôte” menü ne demektir?', ['Sabit fiyatlı, belirli seçeneklerden oluşan set menü', 'Tek tek fiyatlanan menü', 'Yalnız içecek menüsü', 'Mevsimlik meyve menüsü']),
  q('mekan-35', X, 2, 'Mutfakta “flambe” nedir?', ['Yiyeceğin üzerine dökülen alkolün tutuşturularak yakılması', 'Buharda pişirme', 'Sıvı azotla dondurma', 'Hamuru katlama']),
];

/** Sponsorlu soruların yayına uygun olanları (incelenmiş + aktif) → havuz öğesi. */
export function sponsoredBankItems(list: readonly SponsoredQuestion[] = SPONSORED_QUESTIONS): VenueQuizItem[] {
  return list
    .filter((s) => s.reviewed && s.active)
    .map((s) => ({
      id: s.id,
      label: 'o0' as const,
      difficulty: s.difficulty,
      payload: {
        category: s.category,
        prompt: s.prompt,
        options: s.options,
        ...(s.why ? { why: s.why } : {}),
        sponsorName: s.sponsorName,
      },
    }));
}
