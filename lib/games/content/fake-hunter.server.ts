/**
 * Sahte Avcısı — ETİKETLİ içerik havuzu (YALNIZ SUNUCU).
 *
 * Yalnız `lib/games/validators/fake-hunter.ts` içe aktarır (o da `registry/fake-hunter.server.ts`
 * üzerinden `registry/server.ts`'e bağlanır). İstemci paketine GİRMEZ.
 *
 * Dört mod:
 *   kaydir → tek yorum metni; etiket 'real' | 'fake'
 *   dosya  → yorumcu dosyası (hesap yaşı, yorum sayısı, ziyaret doğrulaması, geçmiş); 'real' | 'fake'
 *   kelime → bölümlere ayrılmış yorum; etiket şüpheli bölümün kimliği ('s0'…'s3')
 *   profil → hesap profili ve davranış izi; 'real' (insan) | 'fake' (bot / koordineli hesap)
 *
 * Kurallar: içerik kurgusal ve gerçekçi (karikatür değil); gerçek kişi/işletme adı yok. Sahte
 * örneklerin bir kısmı bilerek "temiz" görünür (zorluk 3), gerçeklerin bir kısmı bilerek şüpheli
 * görünür (yeni hesap, doğrulanmamış ziyaret). `payload` alanları etiketi ELE VERMEZ; `why`
 * (açıklama) yalnız pratik turunda istemciye gider — sıralı turda doğrulayıcı onu siler.
 *
 * Kimlikler KALICIDIR (`fh-<mod>-<sıra>`): değiştirmek öğeyi pratik/sıralı havuzlar arasında taşır.
 */
import { hashSeed } from '@/lib/games/engine/rng';
import type { ContentItem } from './pool';

export type FakeHunterMode = 'kaydir' | 'dosya' | 'kelime' | 'profil';
export type FakeHunterLabel = 'real' | 'fake' | 's0' | 's1' | 's2' | 's3';

export type FakeHunterPayload = { mode: FakeHunterMode; why: string } & Record<string, unknown>;
export type FakeHunterItem = ContentItem<FakeHunterLabel, FakeHunterPayload>;

type D = 1 | 2 | 3;
type RF = 'real' | 'fake';

const pad = (n: number) => String(n).padStart(2, '0');

// ───────────────────────────── Kaydır (32) ─────────────────────────────
// [etiket, zorluk, yıldız, yer, metin, neden]
const KAYDIR: [RF, D, number, string, string, string][] = [
  ['real', 1, 4, "Moda'da bir kahveci", "Filtre kahvesi gerçekten iyi ama hafta sonu 11'den sonra oturacak yer bulmak zor. Barista çekirdeklerin nereden geldiğini anlattı, hoşuma gitti.", 'Somut ayrıntı (saat, çekirdek) ve artı-eksi bir arada.'],
  ['real', 2, 3, "Çankaya'da bir burgerci", 'Köfte istediğim gibi orta pişmişti, patates ise soğuk geldi. Hesap iki kişi 780 TL tuttu, fiyatına göre idare eder.', 'Fiyat, pişirme derecesi ve somut bir şikâyet var.'],
  ['real', 1, 5, "Karşıyaka'da bir pideci", 'Kıymalı pide çıtır, yanında gelen közlenmiş biber güzel bir detay. Paket servis 35 dakikada geldi.', 'Ne yendiği ve teslim süresi belli; abartı yok.'],
  ['real', 3, 5, "Nişantaşı'nda bir kuaför", "Randevuma 10 dakika geç alındım ama Elif Hanım kesimi tam tarif ettiğim gibi yaptı. Fön biraz uzun sürdü.", '5 yıldız ama küçük aksaklıklar da dürüstçe yazılmış.'],
  ['real', 2, 2, "Bornova'da bir dönerci", 'Eskiden çok severdim, son iki gidişimde lavaş bayattı. Ayran hâlâ yayık, o yüzden 2 yıldız.', 'Zaman içindeki değişimi anlatan, gerekçeli düşük puan.'],
  ['real', 3, 4, "Beşiktaş'ta bir meyhane", 'Fava ve deniz börülcesi çok iyiydi, levrek biraz kuruydu. Garsonumuz ilgiliydi, müzik sesi konuşmayı zorlaştırdı.', 'Tek tek tabaklar ve karışık izlenim — yaşanmış bir akşam.'],
  ['real', 2, 1, "Ataşehir'de bir kargo şubesi", 'Paketi teslim almak için 40 dakika sırada bekledim, tek gişe açıktı. Görevli kibar ama sistem çok yavaş.', 'Öfkeli ama ölçülü; kime ve neye kızdığı net.'],
  ['real', 3, 3, "Konyaaltı'nda bir balıkçı", "Manzara için gidilir. Çipura tazeydi ama 1.150 TL'lik hesabı pek hak etmiyor; meze porsiyonları küçük.", 'Tutar ve porsiyon gibi doğrulanabilir ayrıntılar.'],
  ['real', 1, 5, "Üsküdar'da bir fırın", "Sabah 7'de sıcak simit alabildiğim tek yer. Pazar günleri poğaça 9'a kadar bitiyor, erken gelin.", 'Gerçek bir müdavimin pratik ipucu.'],
  ['real', 2, 4, "Eskişehir'de bir çiğ börekçi", 'Çiğ börek bol kıymalı, hamuru ince. Çay ikinci bardaktan sonra ücretli, bunu bilmiyorduk.', 'Küçük, şaşırtıcı bir ayrıntı: işletme bunu reklamda yazmaz.'],
  ['real', 3, 2, "Kızılay'da bir telefon tamircisi", 'Ekran değişimi için 2 saat dedi, ertesi gün teslim etti. Ekran sorunsuz ama haber vermemeleri can sıktı.', 'Sonuçtan memnun, süreçten değil — dengeli.'],
  ['real', 3, 5, "Bodrum'da bir otel", 'Oda temizliği her gün yapıldı, kahvaltıda yerel otlar vardı. Havuz bara yakın olduğu için öğleden sonra gürültülü.', 'Yüksek puana rağmen somut bir eksik var.'],
  ['real', 2, 3, "Trabzon'da bir kahvaltı salonu", 'Kuymak harika, tereyağı tadından belli. Ama serpme kahvaltıdaki reçeller hazır kavanoz gibiydi.', 'Yöresel ürün ve somut eleştiri.'],
  ['real', 1, 4, "Kadıköy'de bir sahaf", "Aradığım eski baskı Sait Faik'i buldum, sahibi fiyatta da yardımcı oldu. Dükkân dar, sırt çantasıyla dolaşmak zor.", 'Kişisel hikâye + gerçekçi bir eksik.'],
  ['real', 3, 1, "Mecidiyeköy'de bir spor salonu", "Üyelik iptali için üç kez gitmem gerekti, her seferinde 'müdür yok' dendi. Aletler iyi ama bu tavır kabul edilemez.", 'Sert ama olay anlatıyor; aletleri övmesi dengeli.'],
  ['real', 2, 5, "Gaziantep'te bir kebapçı", 'Simit kebabını ilk kez burada yedim, isot dengesi tam yerindeydi. Öğle saatinde 20 dakika masa bekledik.', 'Yemeğin adı, tadı ve bekleme süresi — yaşanmış deneyim.'],
  ['fake', 1, 5, "Moda'da bir kahveci", 'Harika bir mekan!!! Her şey mükemmel, kesinlikle tavsiye ederim. En iyisi burası!!!', 'Hiç somut ayrıntı yok; ünlemler ve genel övgü.'],
  ['fake', 2, 5, "Şişli'de bir diş kliniği", "İstanbul'un en iyi diş kliniği arıyorsanız Şişli'nin en iyi diş kliniği burası. En iyi diş hekimleri, en iyi fiyat.", 'Arama motoru için anahtar kelime tekrarı.'],
  ['fake', 2, 1, "Çankaya'da bir burgerci", 'Berbat. Hiç gitmeyin. Karşıdaki burgerci çok daha iyi, oraya gidin.', 'Deneyim yok, rakibe yönlendirme var.'],
  ['fake', 3, 5, "Bornova'da bir dönerci", 'Ailecek gittik, servis hızlıydı, dönerin lezzeti gerçekten çok iyiydi. Personel güler yüzlü, fiyatlar uygun. Kesinlikle tekrar geleceğiz.', 'Akıcı ama kalıp: ne yendi, ne tuttu belli değil; her mekâna yapıştırılabilir.'],
  ['fake', 3, 5, "Bodrum'da bir otel", 'Tatilimiz boyunca her şey kusursuzdu. Odalar ferah, personel ilgili, yemekler lezzetli. Bu fiyata bu kalite bulunmaz, herkese öneririm.', 'Her başlıkta kusursuz, tek somut ayrıntı yok.'],
  ['fake', 1, 5, "Nişantaşı'nda bir kuaför", 'Mükemmel hizmet 👍👍👍 5 yıldız hak ediyor 👍 teşekkürler ⭐⭐⭐⭐⭐', 'İçerik yerine emoji; puanı tekrar etmekten öteye geçmiyor.'],
  ['fake', 2, 5, "Ataşehir'de bir kargo şubesi", 'Firmamız müşterilerine en hızlı ve güvenilir hizmeti sunmaktadır. Memnuniyetiniz bizim önceliğimizdir.', 'İşletmenin ağzından kurumsal dil — müşteri deneyimi değil.'],
  ['fake', 3, 4, "Konyaaltı'nda bir balıkçı", 'Balıklar taze, mezeler lezzetli, manzara güzel. Garsonlar ilgili. Fiyatlar biraz yüksek ama değer. Tavsiye ederim.', 'Gerçekçi görünsün diye eklenmiş kalıp bir "eksi"; hangi balık, hangi meze yok.'],
  ['fake', 2, 1, "Gaziantep'te bir kebapçı", 'Hayatımda yediğim en kötü yemek, zehirlendim, hastanelik oldum, sakın gitmeyin!!! Herkese yayın.', 'Kanıtsız ağır iddia ve yayma çağrısı — karalama kalıbı.'],
  ['fake', 3, 5, "Kadıköy'de bir sahaf", 'Kitap severler için bir cennet. Atmosferi büyüleyici, sahibi çok bilgili ve yardımsever. Mutlaka uğrayın.', 'Broşür dili: ne aradı, ne buldu yok.'],
  ['fake', 1, 5, "Trabzon'da bir kahvaltı salonu", 'Kahvaltı süper. KAHVALTI20 koduyla %20 indirim kazanın, linke tıklayın!', 'Reklam ve kampanya içeriği.'],
  ['fake', 2, 5, "Mecidiyeköy'de bir spor salonu", 'Buraya yazılmak en iyi kararımdı. Hocalar müthiş, salon müthiş, her şey müthiş. Yorum yapana ilk ay ücretsiz!', 'Yorum karşılığı teşvik açıkça yazılmış.'],
  ['fake', 3, 5, "Eskişehir'de bir çiğ börekçi", "Eskişehir'e gelip de burada çiğ börek yemeyen çok şey kaybeder. Lezzet, hijyen ve hizmet bir arada. Şehrin en iyi adresi.", 'Turizm reklamı tonu; kişisel deneyim yok.'],
  ['fake', 2, 2, "Üsküdar'da bir fırın", 'Ürünler bayat, personel kaba, temizlik sıfır, fiyatlar fahiş, kesinlikle uzak durun.', 'Her şey kötü listesi, tek bir olay bile yok.'],
  ['fake', 3, 5, "Kızılay'da bir telefon tamircisi", "Telefonum tamamen bozulmuştu, 15 dakikada yeni gibi yaptılar. Hem ucuz hem hızlı. Ankara'da başka yere gitmeyin.", 'Gerçek dışı hız vaadi ve "başka yere gitmeyin" yönlendirmesi.'],
  ['fake', 1, 5, "Beşiktaş'ta bir meyhane", 'super super super mekan cok iyi cok guzel tavsiye ederim 5 yildiz', 'Tekrar ve içeriksiz övgü.'],
];

// ───────────────────────────── Dosya (30) ─────────────────────────────
// [etiket, zorluk, yorumcu, hesap yaşı, yorum sayısı, foto, ziyaret doğrulandı, yıldız, metin, geçmiş, neden]
const DOSYA: [RF, D, string, string, number, number, boolean, number, string, string, string][] = [
  ['real', 1, 'Selin K.', '2 yıl', 47, 3, true, 4, 'Mantı el açması, yoğurdu sarımsaklı istedim getirdiler. Masa biraz sallanıyordu.', 'Yorumları farklı şehir ve puanlara dağılmış (ort. 3,6).', 'Eski hesap, dağınık puanlar, doğrulanmış ziyaret ve somut metin.'],
  ['real', 1, 'Murat Ö.', '5 yıl', 112, 0, false, 2, 'Siparişim eksik geldi, telefonla aradım, ertesi gün getirdiler ama özür yoktu.', 'Ağırlıkla paket servis yorumları, puanları 1–5 arası.', 'Uzun geçmiş ve tutarlı bir yorumcu profili; paket serviste ziyaret doğrulaması olmaz.'],
  ['real', 2, 'Ayşe D.', '8 ay', 6, 2, true, 5, 'Kızımın doğum günü pastasını burada yaptırdık, tarif ettiğimiz tasarımı birebir yaptılar.', '6 yorumun 3\'ü pastane/kafe, aylar arayla yazılmış.', 'Az yorum ama doğal aralıklar ve kişisel hikâye.'],
  ['real', 2, 'Kerem T.', '3 yıl', 31, 1, true, 3, 'Ders çalışmak için uygun, priz çok. Wi-Fi saat 6\'dan sonra yavaşlıyor.', 'Çoğu kafe yorumu, ortalama 3,4.', 'Orta puan, pratik bilgi, dengeli geçmiş.'],
  ['real', 2, 'Hande Y.', '1 yıl', 14, 4, true, 1, 'Rezervasyonumuz sistemde görünmedi, 45 dakika ayakta bekledik. Yemekler sonunda güzeldi ama akşam mahvoldu.', 'Daha önce aynı mekâna 4★ vermiş.', 'Önceki olumlu yorumu, bu kötü deneyimin gerçek olduğunu destekliyor.'],
  ['real', 1, 'Onur B.', '6 yıl', 203, 58, false, 4, 'Lahmacun ince ve bol limonlu. Fiyatlar geçen yıla göre %40 artmış, bilginize.', 'Yerel rehber; fotoğraflı ve ayrıntılı yorumlar.', 'Uzun süreli, fotoğraflı ve ayrıntılı katkı geçmişi.'],
  ['real', 3, 'Zeynep A.', '4 ay', 3, 0, true, 4, 'Veteriner kedimin aşı takvimini düzenli hatırlatıyor. Bekleme salonu küçük.', '3 yorum: veteriner, eczane, market.', 'Yeni hesap ama gündelik, birbirinden farklı yerler ve doğrulanmış ziyaret.'],
  ['real', 2, 'Emre Ç.', '2 yıl', 22, 2, true, 5, 'Bisikletin vites ayarını aynı gün yaptılar, 350 TL aldılar. Usta ne yaptığını tek tek gösterdi.', 'Bisiklet ve spor mağazası yorumları, puanlar karışık.', 'Fiyat ve işlem ayrıntısı; ilgi alanıyla tutarlı geçmiş.'],
  ['real', 2, 'Gülşen P.', '7 yıl', 89, 12, false, 3, 'Ürünler kaliteli ama kasada tek kişi var, 15 dakika sıra.', 'Market ve mağaza yorumları, yıllara yayılmış.', 'Eski, dengeli hesap; ölçülü eleştiri.'],
  ['real', 1, 'Barış E.', '1 yıl', 9, 0, true, 2, 'Pizza hamuru çiğ kaldı. Söyledik, yenisini yaptılar ama 30 dakika sürdü.', 'Yorumları ayda bir civarında.', 'Somut olay ve işletmenin tepkisi anlatılmış.'],
  ['real', 3, 'Deniz M.', '3 hafta', 1, 2, true, 5, 'İlk yorumum. Annemin ameliyatı sonrası evde bakım için aradık, hemşire Gamze Hanım çok özenliydi.', 'Tek yorum; yeni hesap.', 'Yeni hesap tek başına sahte demek değildir: doğrulanmış ziyaret ve kişisel ayrıntı var.'],
  ['real', 3, 'Tuncay R.', '4 yıl', 56, 6, false, 5, "Rakı balık için Kumkapı'daki favorim. Kalamar tava çıtır, servis hızlı.", 'Restoran yorumları, puanları 2–5 arası.', 'Ziyaret doğrulanmamış ama geçmişi dengeli ve metin somut.'],
  ['real', 2, 'İpek S.', '2 yıl', 18, 0, true, 4, 'Kurs ilk ay biraz yavaş ilerledi ama hocamız konuşma pratiğine ağırlık verdi. B1\'i geçtim.', 'Eğitim ve kafe yorumları.', 'Süreç ve sonuç anlatılmış; dengeli.'],
  ['real', 1, 'Cem K.', '5 yıl', 74, 3, true, 1, 'Faturada istemediğimiz servis ücreti vardı, sorunca kaldırdılar. Yine de baştan söylenmeliydi.', 'Puanları geniş dağılımlı.', 'Olay + işletme tepkisi; tutarlı eski hesap.'],
  ['real', 2, 'Nur H.', '9 ay', 11, 5, true, 4, 'Çocuklu aileler için oyun alanı güzel; tuvaletler daha temiz olabilirdi.', 'Aile mekânları ağırlıklı.', 'İlgi alanıyla tutarlı, somut öneri.'],
  ['fake', 1, 'Mehmet Y.', '2 gün', 1, 0, false, 5, 'Harika bir deneyimdi, herkese tavsiye ederim. Çok memnun kaldık.', 'Hesabın tek yorumu; aynı gün açılmış.', 'Yeni hesap + doğrulanmamış ziyaret + içeriksiz metin.'],
  ['fake', 1, 'Kullanıcı 48213', '5 gün', 23, 0, false, 5, 'Mükemmel hizmet, güler yüzlü personel. Kesinlikle tekrar geleceğim.', '5 günde 23 yorum, hepsi 5★, farklı şehirlerde.', 'İnsanüstü yorum hızı ve coğrafi olarak imkânsız dağılım.'],
  ['fake', 2, 'Elif K.', '1 hafta', 7, 0, false, 1, 'Çok kötü bir yer, kimse gitmesin. Rezalet.', '7 yorumun hepsi aynı semtteki pastanelere 1★.', 'Bir bölgedeki rakiplere toplu düşük puan — karalama kampanyası.'],
  ['fake', 3, 'Ahmet D.', '3 yıl', 4, 0, false, 5, "Şehrin en iyi dişçisi! Dr. Kaan Bey'e teşekkürler. En iyi implant, en iyi fiyat.", '3 yıl sessiz kaldıktan sonra son 1 saatte 4 yorum; hepsi aynı klinik ağına.', 'Eski hesap yanıltıcı: uyuyan hesap bir anda tek bir ağ için çalışıyor.'],
  ['fake', 3, 'Burcu Ş.', '1 yıl', 15, 15, false, 5, 'Ürünler harika, kargo hızlı, paketleme özenli. 10/10.', 'Her yorumda fotoğraf var ama aynı fotoğraf 3 farklı mağazada kullanılmış.', 'Fotoğraf varlığı güven vermez; tekrar kullanılan görsel sahtelik işareti.'],
  ['fake', 3, 'Serkan A.', '4 gün', 2, 1, false, 5, 'Salı akşamı eşimle gittik, mantı ve içli köfte yedik. Servis hızlıydı, tatlıyı ikram ettiler.', 'Diğer yorumu aynı işletmenin ikinci şubesine, birebir aynı metinle.', 'Metin somut görünüyor ama aynı metin iki şubede — kopyala-yapıştır.'],
  ['fake', 2, 'Melis T.', '10 gün', 9, 0, false, 5, 'Kesinlikle bölgenin en kaliteli kuaförü. Fiyat performans ürünü.', '9 yorumun hepsi 02:00–02:20 arasında yazılmış.', 'Gece yarısı 20 dakikada 9 yorum — toplu üretim.'],
  ['fake', 2, 'Oğuz K.', '2 yıl', 31, 0, false, 1, 'Garson hakaret etti, yemekten saç çıktı, hesapta fazla para aldılar, polis çağırdık.', 'Son hafta 10 farklı restorana 1★, hepsinde "polis çağırdık".', 'Aynı dramatik iddia her yerde — şablon karalama.'],
  ['fake', 3, 'Aslı B.', '6 gün', 1, 0, true, 5, 'Yorum yapana tatlı ikram ediliyor 😊 harika mekan, kaçırmayın!', 'Tek yorum.', 'Ziyaret doğrulanmış olsa da yorum teşvikle yazılmış; tarafsız değil.'],
  ['fake', 1, 'Hakan U.', '3 gün', 12, 0, false, 5, 'Very good place. Çok güzel yemek. Recommend.', '12 yorum, karışık dil, hepsi 5★.', 'Kısa sürede çok yorum, makine çevirisi izi, tek tip puan.'],
  ['fake', 2, 'Gizem O.', '8 ay', 5, 0, false, 5, 'Bu işletmenin tedarikçisi olarak ürünlerinin kalitesine kefiliz. Herkese gönül rahatlığıyla öneririz.', 'Profilde işletmeyle aynı soyadı.', 'Çıkar çatışması: tedarikçi/akraba yorumu.'],
  ['fake', 1, 'Can E.', '1 ay', 3, 0, false, 5, "Ankara'nın en iyi düğün salonu. Düğün salonu Ankara denince akla ilk gelen. Ankara düğün salonları içinde birinci.", '3 yorumun hepsi aynı anahtar kelimelerle.', 'Arama motoru için anahtar kelime doldurma.'],
  ['fake', 3, 'Fatma G.', '2 hafta', 6, 2, true, 5, 'Personel çok ilgili, ortam çok temiz, fiyatlar çok uygun, yemekler çok lezzetli.', '6 yorumun 6\'sı da aynı cümle kalıbıyla, farklı işletmelere.', 'Doğrulanmış ziyaret olsa bile her işletmeye aynı kalıp — ücretli yorumcu deseni.'],
  ['fake', 2, 'Tolga N.', '5 yıl', 40, 4, false, 1, 'Bu işletme müşterilerini dolandırıyor, sahibi sahtekâr, herkesi uyarıyorum!!!', 'Aynı metni 1 saat içinde 3 farklı işletme adıyla paylaşmış.', 'Aynı suçlama farklı işletmelere — hedefli karalama.'],
  ['fake', 3, 'Pınar L.', '4 gün', 1, 0, false, 4, 'Gayet güzeldi, ortam hoş. 4 yıldız çünkü 5 yıldızı hiçbir yere vermem :)', 'Hesap, işletmeye aynı gün 40 yeni hesabın 4–5★ verdiği gün açılmış.', 'Tek başına masum; ama koordineli bir hesap dalgasının parçası.'],
];

// ───────────────────────────── Kelime (30) ─────────────────────────────
// [şüpheli bölüm, zorluk, bölümler (|), neden]
const KELIME: [0 | 1 | 2 | 3, D, string, string][] = [
  [2, 1, 'Akşam yemeği için gittik.|Kuzu tandır yumuşacıktı.|Yorum yazana tatlı ikram ediliyor!|Tekrar geliriz.', 'Yorum karşılığı teşvik: yorumun tarafsızlığını bozar.'],
  [2, 1, 'Kahvaltı tabağı doyurucu.|Çaylar sürekli tazelendi.|İzmir en iyi kahvaltı mekanı İzmir kahvaltı.|Otopark yok.', 'Anahtar kelime doldurma.'],
  [2, 1, 'Kargom 2 günde geldi.|Paketleme sağlamdı.|Daha ucuzu için başka bir siteye bakın, link profilimde.|Ürün tarif edildiği gibi.', 'Başka satıcıya yönlendirme.'],
  [1, 2, 'Kuaföre ilk kez gittim.|Biz salon olarak her müşterimize özel ilgi gösteriyoruz.|Kesim tam istediğim gibi oldu.|Fiyat ortalama.', '"Biz" diyen işletme ağzı — müşteri gibi görünen işletme yorumu.'],
  [2, 2, 'Doktor çok dikkatliydi.|Muayene 20 dakika sürdü.|Tek seansta bel fıtığım tamamen geçti.|Sekreter biraz ilgisizdi.', 'Tıbben gerçek dışı mucize iddiası.'],
  [1, 1, 'Pizza hamuru inceydi.|Karşıdaki fırına da mutlaka uğrayın, orası daha iyi.|Servis yavaş değildi.|Fiyatlar makul.', 'Rakibe yönlendirme.'],
  [2, 1, 'Otelin konumu merkeze yakın.|Oda temizdi.|Bu yorumu yazarak %15 indirim kodu kazandım.|Kahvaltı çeşidi azdı.', 'Teşvikli yorum.'],
  [2, 1, 'Dil kursunu tavsiye ederim.|Hocalar ilgili.|Kayıt için hemen WhatsApp hattımızdan yazın.|Sınıflar kalabalık değil.', 'Satış çağrısı — yorum değil reklam.'],
  [2, 2, 'Mantı çok lezzetliydi.|Yoğurdu sarımsaklı istedik.|Mekân sahibinin kuzeniyim, gönül rahatlığıyla öneririm.|Hesap uygundu.', 'Çıkar çatışması: akraba yorumu.'],
  [2, 2, 'Telefon kılıfı sağlam görünüyor.|Rengi fotoğraftakiyle aynı.|Ürünü henüz kullanmadım ama yorumlar iyi diye 5 veriyorum.|Kargo hızlıydı.', 'Deneyim olmadan verilen puan.'],
  [3, 2, 'Kebap tam kıvamındaydı.|Lavaş sıcak geldi.|Garsonlar biraz yavaştı.|Türkiye\'nin en iyi kebabı, dünyada rakibi yok!', 'Ölçülü bir yorumun sonuna eklenmiş abartılı reklam cümlesi.'],
  [2, 2, 'Spor salonu temiz.|Aletler yeni.|İlk ayımda diyet yapmadan 15 kilo verdim.|Soyunma odası küçük.', 'Gerçek dışı sonuç vaadi.'],
  [1, 2, 'Market geç saate kadar açık.|Mağazamızda en taze ürünleri en uygun fiyata sunuyoruz.|Kasiyerler hızlı.|Otopark var.', 'İşletme ağzı ("mağazamızda").'],
  [3, 2, 'Veteriner köpeğimi dikkatlice muayene etti.|Aşılarını zamanında yaptık.|Bekleme süresi kısaydı.|Kampanyalar için sayfamızı takip edin!', 'Takip/kampanya çağrısı — işletmenin pazarlama dili.'],
  [2, 2, 'Çiğ köfteyi acılı istedim.|Tam istediğim gibiydi.|Rakipleri gibi bayat malzeme kullanmıyorlar, yandaki dükkânınkiler hep bayat.|Dürüm büyük.', 'Rakibi karalama.'],
  [2, 3, 'Tatlılar taze.|Fıstıklı baklava çok iyiydi.|Personelimiz her zaman güler yüzle hizmet vermektedir.|Fiyat biraz yüksek.', 'İşletme ağzı ("personelimiz") araya sıkıştırılmış.'],
  [2, 1, 'Çocuklar çok eğlendi.|Oyun alanı güvenli.|Bu yorumu işletme rica etti, o yüzden 5 yıldız verdim.|Kafeterya pahalı.', 'İşletme talebiyle verilen puan.'],
  [2, 2, 'Araç bakımında yağ değişimi yaptırdım.|Fiyatı baştan söylediler.|Bugün arayan ilk 10 kişiye ücretsiz yıkama!|Bekleme salonunda çay var.', 'Kampanya duyurusu — reklam.'],
  [3, 3, 'Diş beyazlatma yaptırdım.|Sonuç güzel.|Hassasiyet 2 gün sürdü.|Diş beyazlatma Kadıköy en iyi diş beyazlatma.', 'Sona eklenmiş anahtar kelime doldurma.'],
  [2, 2, 'Çok kötü bir deneyimdi.|Siparişim gelmedi.|Herkes 1 yıldız versin, bu dükkânı kapattıralım!|Müşteri hizmetlerine ulaşılamıyor.', 'Organize düşük puan çağrısı.'],
  [2, 3, 'Eczacı ilaçlarımı anlattı.|Muadil önerdi.|Burası şehirdeki tek dürüst eczane, diğerleri sizi kandırıyor.|Sabah 9\'da açılıyor.', 'Tüm rakipleri kanıtsız suçlama.'],
  [3, 3, 'Kitap kafede saatlerce oturduk.|Kurabiyeler ev yapımı.|Çalışanlar ilgili.|Lütfen bu yorumu beğenin ki en üste çıksın.', 'Yorumu öne çıkarma çabası — sıralama manipülasyonu.'],
  [3, 3, 'Nakliye firması eşyaları özenle paketledi.|Bir sandalye çizildi, ücretini ödediler.|5 saatte tamamladılar.|Firma olarak tüm müşterilerimize teşekkür ederiz.', 'Son cümlede işletme ağzı.'],
  [2, 1, 'Balık ekmek tazeydi.|Sıra 10 dakika sürdü.|Bu yorum için bana ücret ödendi.|Turşu suyu güzeldi.', 'Ücretli yorum.'],
  [1, 2, 'Klinik temiz ve modern.|İşlemden sonra 10 yaş gençleştim, garantili!|Randevu kolay alındı.|Doktor açıklayıcıydı.', 'Garantili sonuç vaadi — reklam iddiası.'],
  [2, 2, 'Oda servisi hızlı.|Havuz temiz.|Daha ucuza almak için kısa linkten rezervasyon yapın.|Kahvaltı iyi.', 'Bağlantıyla yönlendirme.'],
  [2, 2, 'Ayakkabı rahat.|Numarası tam geldi.|Bu yorumu yazmam için ürün ücretsiz gönderildi.|Tabanı kaymıyor.', 'Ücretsiz ürün karşılığı yorum (beyan edilmiş teşvik).'],
  [3, 3, 'Hamburger köftesi sulu.|Patates kızartması çıtır.|Gece 3\'te bile açık olması büyük artı.|Bu markanın tüm şubeleri 5 yıldızı hak ediyor, hepsine gidin.', 'Tek ziyaretten zincir reklamına sıçrama.'],
  [3, 3, 'Temizlik ekibi geldi.|Banyo pırıl pırıl oldu.|Mutfakta dolap üstleri atlanmış.|10 yıllık tecrübemizle sektörün lideriyiz.', 'İşletme tanıtım cümlesi.'],
  [3, 3, 'Kombi servisi aynı gün geldi.|Arızayı yarım saatte buldu.|Parça fiyatını faturalı verdi.|Ustaya 5 yıldız veren herkese bir sonraki bakımda indirim var.', 'Yüksek puan karşılığı indirim — teşvik.'],
];

// ───────────────────────────── Profil (30) ─────────────────────────────
// [etiket, zorluk, ad, kullanıcı adı, katılım yılı, yorum sayısı, ort. puan, davranış izi, örnek1, örnek2, neden]
const PROFIL: [RF, D, string, string, string, number, number, string, string, string, string][] = [
  ['real', 1, 'Derya Aksoy', '@deryaaksoy', '2019', 64, 3.8, 'Ayda 1–2 yorum, hafta sonları yoğun', 'Kahvesi iyi ama tatlılar pahalı.', 'Otopark sorunu var, onun dışında memnunum.', 'Doğal tempo, karışık puanlar, somut cümleler.'],
  ['real', 2, 'Kaan Ertürk', '@kaanerturk', '2021', 23, 3.1, 'Yorumları seyahat dönemlerinde toplanmış', 'Otel konumu iyi, kahvaltı vasat.', 'Kuru temizleme bir günde teslim etti.', 'Tatil dönemlerinde yoğunlaşma insan davranışına uygun.'],
  ['real', 1, 'Sema Karaca', '@semak', '2017', 140, 4.2, 'Düzenli, çoğunlukla aynı şehirde', "İskender'in tereyağı sonradan döküldü, güzel.", 'Kırtasiyede fotokopi makinesi bozuktu.', 'Uzun, tutarlı, yerel geçmiş.'],
  ['real', 2, 'Yusuf Demirtaş', '@ydemirtas', '2023', 5, 2.6, '5 yorum, 8 aya yayılmış', 'Siparişim eksik geldi, iade süreci uzun.', 'Berber iyi, randevuya sadık.', 'Az ama doğal aralıklı yorumlar.'],
  ['real', 1, 'Ece Polat', '@ecepolat.ankara', '2020', 38, 4.0, 'Ağırlıkla kafe ve kitapçı', 'Çalışmak için sessiz bir köşe var.', 'Kek kuruydu ama çay taze.', 'İlgi alanı belli, puanlar dengeli.'],
  ['real', 1, 'Mert Can Uysal', '@mertcanu', '2018', 211, 3.5, 'Fotoğraflı, ayrıntılı yorumlar; puan dağılımı geniş', 'Ciğer şiş tam pişmiş, közlenmiş domates iyi.', 'Dondurma erimiş geldi, 2 yıldız.', 'Çok yorum ama yıllara yayılmış ve çeşitli.'],
  ['real', 3, 'Nazlı Er', '@nazlier', '2024', 2, 5.0, 'Hesap yeni, iki yorum 3 ay arayla', 'Kızımın diş tedavisinde çok sabırlıydılar.', 'Fırının pazar poğaçası bitmeden gidin.', 'Yeni hesap ve 5,0 ortalama tek başına bot demek değil: tempo doğal, metin kişisel.'],
  ['real', 2, 'Ali Rıza Gök', '@argok', '2016', 95, 2.9, 'Eleştirel ama her yorumda somut olay', 'Garson siparişi iki kez unuttu.', 'Fiyat listesi duvarda yazandan farklıydı.', 'Düşük ortalama ama gerekçeli; hedefli değil.'],
  ['real', 1, 'Buse Tan', '@busetan', '2022', 17, 4.4, 'Yorumları kendi semtinde', 'Pilates hocası duruşumu düzeltti.', 'Eczane gece nöbetteyken bile kibardı.', 'Yerel ve kişisel deneyimler.'],
  ['real', 2, 'Hüseyin Kılıç', '@hkilic63', '2015', 52, 3.7, 'Yorumların yarısı yemek, yarısı oto servis', 'Lastik değişimini 20 dakikada yaptılar.', 'Kuru fasulye biraz tuzlu.', 'Gündelik hayatla örtüşen karışık geçmiş.'],
  ['real', 2, 'Gökçe Arslan', '@gokcearslan', '2021', 29, 3.3, 'Yorumlar haftalara yayılmış', 'Kargo şubesinde tek gişe açıktı.', 'Veteriner fiyatları baştan söyledi.', 'Doğal tempo ve somut ayrıntı.'],
  ['real', 3, 'Okan Yavuz', '@okanyavuz', '2019', 8, 1.9, 'Az ama uzun yorum yazıyor', 'Kiralık aracın lastiği havasızdı, yolda kaldık.', 'Çağrı merkezi 40 dakika bekletti ama sorunu çözdüler.', 'Düşük ortalama, yine de adil: çözülen sorunu da yazıyor.'],
  ['real', 2, 'Sinem Uçar', '@sinemucar', '2020', 71, 4.1, 'Gezgin; farklı şehirler, makul aralıklar', "Mardin'de taş otelin odası serindi.", 'Balon turu iptal oldu, ücreti iade ettiler.', 'Farklı şehirler ama seyahat akışıyla tutarlı.'],
  ['real', 3, 'Volkan Şen', '@volkansen', '2018', 44, 4.6, 'Yüksek puan veriyor ama gerekçeli', 'Ustanın kaynak işçiliği temiz, fiyatı baştan söyledi.', 'Kasap kıymayı önümde çekti.', 'Cömert puan veren insanlar da vardır; ayrıntı gerçek.'],
  ['real', 1, 'Esra Duman', '@esraduman', '2023', 12, 3.0, 'Ağırlıkla çocuklu aile mekânları', 'Oyun alanı küçük ama güvenli.', 'Mama sandalyesi yoktu.', 'Yaşam tarzıyla tutarlı, dengeli puanlar.'],
  ['fake', 1, 'Ayhan G.', '@user83021945', '2025', 312, 5.0, 'Son 24 saatte 46 yorum, hepsi 5★', 'Harika hizmet, tavsiye ederim.', 'Mükemmel, çok memnun kaldım.', 'İnsanüstü hız, otomatik kullanıcı adı, tek tip puan.'],
  ['fake', 1, 'Hilal Ö.', '@hilal.oz_2025', '2025', 58, 1.0, 'Tüm yorumlar aynı caddedeki pastanelere', 'Berbat, gitmeyin.', 'Rezalet bir yer, hijyen yok.', 'Hedefli toplu 1★ — rakip karalama hesabı.'],
  ['fake', 1, 'Mağaza Yorum', '@magazayorum', '2025', 140, 4.9, 'Yorumlar 03:00–04:00 arası, dakika arayla', 'Ürün harika kargo hızlı.', 'Çok kaliteli ürün tavsiye ederim.', 'Gece toplu üretim, jenerik metin.'],
  ['fake', 2, 'Emine Yıldız', '@eyildiz1987', '2024', 37, 5.0, '37 yorumun 30\'u aynı zincirin şubelerine', 'Bu şube de diğerleri gibi mükemmel.', 'Zincirin her şubesi kaliteli.', 'Tek markaya yoğunlaşmış övgü — kiralık hesap.'],
  ['fake', 2, 'Cenk Bulut', '@cenkbulut', '2020', 9, 4.8, '4 yıl sessiz, sonra bir gecede 9 yorum', 'Şehrin en iyi oto kuaförü.', 'En iyi oto yıkama burada.', 'Uyuyan hesabın ani uyanışı — satın alınmış hesap.'],
  ['fake', 2, 'Merve Şahin', '@mervesahin', '2024', 64, 4.9, 'Aynı gün 12 farklı şehirde yorum', 'Personel ilgili, ortam temiz.', 'Ortam temiz, personel ilgili.', 'Fiziksel olarak imkânsız konum dağılımı + aynı cümlenin yeri değişmiş hâli.'],
  ['fake', 1, 'Ersin Aydın', '@ersinaydin', '2024', 22, 5.0, 'Her yorumda aynı indirim kodu', 'Harika! ERSIN10 koduyla %10 indirim.', 'Ürünler süper, ERSIN10 kodunu unutmayın.', 'Satış ortaklığı (affiliate) hesabı — yorum değil reklam.'],
  ['fake', 3, 'Selda Koç', '@seldakoc', '2023', 18, 4.7, 'Yorumların hepsi yeni açılan işletmelere, açılış haftasında', 'Yeni açılmış ama çok profesyonel.', 'Açılışa gittik, harika bir başlangıç.', 'Açılış kampanyalarına kiralanan hesap deseni.'],
  ['fake', 3, 'Tarık Erdem', '@tarikerdem', '2022', 41, 4.1, 'Puanlar çeşitli ama metinler başka hesaplarla birebir aynı', 'Mantısı güzel, servis biraz yavaş.', 'Kahvaltı çeşidi bol, çay tazelendi.', 'Doğal görünen metinler başka hesaplarda kelimesi kelimesine var — koordineli ağ.'],
  ['fake', 2, 'Kübra Aslan', '@kubraaslan', '2025', 73, 5.0, 'Profil fotoğrafı stok görsel; yorumların hepsi 2 hafta içinde', 'Mükemmel bir deneyim yaşadık.', 'Hizmet kalitesi çok yüksek.', 'Stok fotoğraf + sıkışık zaman + jenerik metin.'],
  ['fake', 3, 'Levent Ekinci', '@leventekinci', '2021', 26, 1.2, 'Bir işletmeye 1★ verdiği gün onun 6 rakibine 5★', 'Fiyatlar uygun, hizmet harika.', 'Bu mahallenin en iyisi.', 'Rakipleri yükseltip bir işletmeyi gömme deseni.'],
  ['fake', 2, 'Dilek Önal', '@dilekonal', '2025', 15, 5.0, 'Yorumların hepsi aynı ajansın müşterilerine', 'Çok profesyonel bir ekip.', 'İşini bilen insanlar.', 'Ajans müşteri listesiyle örtüşen yorumlar.'],
  ['fake', 2, 'Batuhan Çelik', '@batuhancelik', '2024', 88, 4.5, 'Saatte 10+ yorum, hiç fotoğraf yok', 'Güzel yer.', 'Tavsiye ederim, güzel.', 'Hız ve içeriksizlik — otomasyon.'],
  ['fake', 3, 'Nil Aydoğan', '@nilaydogan', '2023', 31, 4.3, 'Düşük puanlı yorumları birkaç gün sonra 5★\'a çevrilmiş', 'Önce memnun kalmadım ama sonra her şey düzeldi.', 'Puanımı güncelledim, aslında harika.', 'Puanı tazminat karşılığı değiştirme deseni — satın alınmış güncelleme.'],
  ['fake', 3, 'Ferhat Yalçın', '@ferhatyalcin', '2022', 50, 4.0, 'Yorumlarda otomatik çeviri izi', 'Yemek çok lezzetli ve personel çok dostça idi.', 'Ben bu yeri seviyorum ve tekrar gideceğim.', 'Türkçe dışı sözdizimi: yurtdışı yorum çiftliği.'],
];

/**
 * Şüpheli bölümün yerini kimlik karmasıyla dağıtır (yazımda çoğu 3. sırada; "hep 3.yü seç"
 * stratejisi işe yaramasın). Deterministik: aynı kimlik → aynı yer.
 */
function placeGiveaway(id: string, parts: string[], idx: number): { parts: string[]; index: number } {
  const target = hashSeed(`fh-place:${id}`) % parts.length;
  const rest = parts.filter((_, i) => i !== idx);
  const out = [...rest.slice(0, target), parts[idx], ...rest.slice(target)];
  return { parts: out, index: target };
}

export const FAKE_HUNTER_BANK: readonly FakeHunterItem[] = [
  ...KAYDIR.map(([label, difficulty, stars, place, text, why], i) => ({
    id: `fh-kaydir-${pad(i + 1)}`,
    label,
    difficulty,
    payload: { mode: 'kaydir' as const, stars, place, text, why },
  })),
  ...DOSYA.map(([label, difficulty, reviewer, accountAge, reviewCount, photoCount, visitVerified, stars, text, history, why], i) => ({
    id: `fh-dosya-${pad(i + 1)}`,
    label,
    difficulty,
    payload: { mode: 'dosya' as const, reviewer, accountAge, reviewCount, photoCount, visitVerified, stars, text, history, why },
  })),
  ...KELIME.map(([idx, difficulty, parts, why], i) => {
    const id = `fh-kelime-${pad(i + 1)}`;
    const placed = placeGiveaway(id, parts.split('|'), idx);
    return {
      id,
      label: `s${placed.index}` as FakeHunterLabel,
      difficulty,
      payload: { mode: 'kelime' as const, parts: placed.parts, why },
    };
  }),
  ...PROFIL.map(([label, difficulty, name, handle, joined, reviewCount, avgStars, pattern, s1, s2, why], i) => ({
    id: `fh-profil-${pad(i + 1)}`,
    label,
    difficulty,
    payload: { mode: 'profil' as const, name, handle, joined, reviewCount, avgStars, pattern, samples: [s1, s2], why },
  })),
];
