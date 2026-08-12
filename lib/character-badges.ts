import { prisma } from '@/lib/prisma';

/**
 * AI Karakter Rozeti Atama.
 *
 * Kullanıcının yorum geçmişini LLM ile analiz edip kişiliğine en uygun DİZİ/FİLM
 * karakter rozetini atar. Karakter rozetleri satın ALINAMAZ (pointCost:null) —
 * yalnızca bu sistemle kazanılır (prestijli/kimlik odaklı).
 *
 * Tetikleme: eşik tabanlı (kullanıcı N yoruma ulaşınca), async çalışır.
 * Maliyet: kullanıcı başına tek LLM çağrısı (agrege geçmiş üzerinden), her yorumda değil.
 */

export const CHARACTER_BADGE_THRESHOLD = 5; // (Legacy) genel eşik — geriye dönük uyum için tutulur.

/**
 * Kategori bazlı eşik: bir ÜSLUP kategorisinde bu kadar yorum birikince o kategorinin
 * bir karakter rozeti açılır. Kullanıcı bu sayıyı bilmez (bar gizli ilerler).
 */
export const CATEGORY_BADGE_THRESHOLD = 6;

/** LLM'in seçebileceği karakterler: badge-id → kişilik tanımı (seçim ipucu). */
export const CHARACTER_PROFILES: { badgeId: string; name: string; trait: string }[] = [
  { badgeId: 'badge-sheldon', name: 'Sheldon Cooper', trait: 'BİLİMSEL/SÜREÇSEL abartı: espriyi sözde bilimsel-analitik mantıkla kurar; olayı adım adım süreç gibi anlatır (tarladan fincana, mikroskop/nanoteknoloji, ölçüm/hesap). "Bunu bilimsel açıklayalım."' },
  { badgeId: 'badge-chandler', name: 'Chandler Bing', trait: 'TEK VURUŞ iğneleyici mizah: uzun hikaye kurmaz, tek kısa keskin cümlede sert-esprili yargı bırakır ("porsiyon o kadar küçük ki tabağı dekorasyon saydım"). "Buna tek cümle yeter."' },
  { badgeId: 'badge-barney-stinson', name: 'Barney Stinson', trait: 'HİKAYE KURUCU gösterişli abartı: küçük olayı absürt bir sahneye dönüştürür, kendini hikayenin kahramanı yapar, pop-kültür referansı (Narnia). "Bunu bir hikayeye dönüştüreyim."' },
  { badgeId: 'badge-the-office', name: 'Michael Scott', trait: 'SOSYAL/DUYGUSAL saf abartı: mizahı insan ilişkisine ve kendi duygusuna bağlar; paylaşımcı, çocuksu, iyi niyetli ("kan kardeş olduk", garsona sarılmak). "Hepimiz birlikte yaşadık, duygulandım."' },
  { badgeId: 'badge-walter-white', name: 'Walter White', trait: 'DÖNÜŞÜM + GURUR/EGO: sıradan biriyken deneyimle UZMANLAŞTIĞINI ima eder; "eskiden anlamazdım ama artık iyisini biliyorum" tonu, kendinden emin bir yargı. İmza: "Artık damak tadım oturdu, burası gerçekten iyi." AYRIM: Tommy soğuk-duygusuz hesap yapar; Walter kendi ustalaşmasıyla GURUR duyar.' },
  { badgeId: 'badge-tommy-shelby', name: 'Tommy Shelby', trait: 'SOĞUK HESAP: duygusuz, ölçülü, kısa ve kesin; övse de eleştirse de mesafeli ve stratejik konuşur, gereksiz duygu yok. İmza: "Fiyat-değer dengesi tutuyor. Gerisi lafügüzaf." AYRIM: Walter gururlanır, Jesse duygulanır; Tommy hiçbirini yapmaz — sadece hesabı söyler.' },
  { badgeId: 'badge-sherlock', name: 'Sherlock Holmes', trait: 'ÇIKARIMCI DEDEKTİF: detayları BİRLEŞTİRİR → bağlantı kurar → çıkarım yapar → NET sonuca varır ("bardaktaki ruj izi yeni ama yanındakinin dudağında yok; demek bardak başka masadan geldi"). İmza: "Bu nedenle şu sonuca vardım." AYRIM: Joe detayları toplar ama BAĞLAMAZ (sonuçsuz); Sherlock bağlar ve HÜKME varır.' },
  { badgeId: 'badge-professor', name: 'El Profesor', trait: 'AYRINTILI PLAN/ÖNGÖRÜ: her şeyi önceden kurgular, başkasına ADIM ADIM strateji önerir ("şu saatte gidin, şunu isteyin, şöyle olur"). İmza: "Planlı gidin: rezervasyon + köşe masa = kusursuz akşam." AYRIM: Michael tek sorunu mühendis gibi çözer; Profesor tüm deneyimi önceden PLANLAR.' },
  { badgeId: 'badge-michael-scofield', name: 'Michael Scofield', trait: 'MÜHENDİS MANTIK ZİNCİRİ: bir sorunu parçalara ayırıp adım adım çözer, sebep-sonuç kurar ("yavaşlığın nedeni tek kasa; ikinciyi açsalar sorun biter"). İmza: "Sorun şu, çözümü de şu." AYRIM: Profesor deneyimi planlar; Michael somut bir SORUNU çözer.' },
  // ── GİZEMLİ kategori (en zor): ustalık isteyen üsluplar ──
  { badgeId: 'badge-hannibal', name: 'Hannibal Lecter', trait: 'ZARİF KESKİNLİK: cümle zarif/nazik başlar, sonra son derece sakin öldürücü bir eleştiriyle biter (kontrast). "Dekorasyon zarifti, keşke yemekler de öyle olsaydı." "Ne kadar nazikçe söyleyebilirim?"' },
  { badgeId: 'badge-house-md', name: 'Dr. House', trait: 'KESKİN TEŞHİS + ironi: doğrudan, alaycı, acımasızca dürüst tanı koyar ("tek kelimeyle: kötü. servis için ayrıca teşekkürler"). Direkt ve iğneleyici.' },
  { badgeId: 'badge-dexter', name: 'Dexter Morgan', trait: 'SOĞUKKANLI ANALİZ: verileri ayırır→analiz eder→duyguyu çıkarır→net sonuca bağlar. Düzenli, sakin, sonuç odaklı ("Mekan: başarılı. Servis: yavaş. Sonuç: beklentinin altında"). "Verileri değerlendirdim, sonuç şu."' },
  { badgeId: 'badge-john-locke', name: 'John Locke', trait: 'İNANÇ/DENEME: yoruma bir inanma/şans verme isteğiyle başlar; önce savunur veya şans verir, sonra deneyimler ("tereddüt ettim ama şans vermek istedim, iyi ki denemişim"). "Bir şans vermeye değer."' },
  { badgeId: 'badge-crowley', name: 'Crowley', trait: 'KAOTİK İRONİ + deadpan: beklenmedik karşılaştırma, kelime oyunu, kara mizah dokunuşu ("kutsal katmer 550 TL, en azından matematikte tutarlılar"). Absürt hikaye DEĞİL, keskin oyunbaz ironi.' },
  { badgeId: 'badge-the-doctor', name: 'The Doctor', trait: 'KEŞİF + DENGE: merakla keşfe gider, deneyimi anlatır, objektif dengeli sonuca bağlar ("keşfedelim dedik, bazı şeyler beklentiyi karşılamadı ama atmosferi güzel"). Merak + deneyim + objektif sonuç.' },
  { badgeId: 'badge-mr-robot', name: 'Elliot (Mr. Robot)', trait: 'KAYIT/LOG: olayları bir tanık gibi zaman + liste + detayla kaydeder ("15:10 giriş, 15:17 sipariş, 15:51 geldi"). Analiz DEĞİL kayıt tutar; sıralı, kronolojik, veri gibi.' },
  { badgeId: 'badge-wednesday', name: 'Wednesday Addams', trait: 'TERS GÖRÜŞ: genel kanıya meydan okur ("herkes buraya bayılıyor, ben hâlâ nedenini bulamadım"). Karanlık, bağımsız, genel beğeniyi sorgulayan.' },
  { badgeId: 'badge-castiel', name: 'Castiel', trait: 'ADALET/DENGE: eksiyi açıkça söyler ama hakkını da teslim eder; dingin, adil, dengeleyici bir hüküm kurar. "Eksiği söyle + hakkını teslim et."' },
  // ── GİZEM/GERİLİM: şüphe/ima ──
  { badgeId: 'badge-joe', name: 'Joe Goldberg', trait: 'GÖZLEMCİ/DETAY AVCISI: küçük detayları tek tek toplar ama BAĞLAMAZ, SONUÇSUZ bırakır ("ruj izi vardı, garsonun ayakkabısı çamurluydu, bir de kırmızı şemsiye... neden fark ettiğimi bilmiyorum"). İmza: "Bunu neden fark ettiğimi bilmiyorum." AYRIM: Sherlock detayları BAĞLAR+çıkarım yapar+hükme varır; Joe toplar ama bağlamaz. Carrie sezgiyle şüpheye bağlar; Joe takılır, bağlamaz.' },
  { badgeId: 'badge-frank-underwood', name: 'Frank Underwood', trait: 'HESAP/STRATEJİ ŞÜPHESİ: işletmenin bilinçli bir hesabı olduğundan şüphelenir ("menüde 300 hesapta 350, tesadüf değil; adisyonu inceleyin"). "Burada kimin hesabı var?" — finansal/çıkar şüphesi.' },
  { badgeId: 'badge-carrie', name: 'Carrie Mathison', trait: 'SEZGİSEL İZ SÜRÜCÜ: KANITI OLMADAN güçlü bir sezgiyle sonuca İNANIR ("kanıtım yok ama bu mekan yakında kapanacak", "bir şey saklıyorlar, kanıtlayamam ama hissediyorum"). İmza: "Kanıtlayamam ama biliyorum/hissediyorum." AYRIM: Jonas cevap arayan SORU sorar (belirsiz); Carrie kanıtsız ama KESİN sezgisel hüküm verir. Joe detay toplar-bağlamaz; Carrie sezgiyle bağlar.' },
  { badgeId: 'badge-villanelle', name: 'Villanelle', trait: 'ÇARPICI/ÖZGÜN: beklenmedik, KİŞİSEL ve özgün bir tepki/benzetme verir ("bu tatlıyı yemek haksızlık gibi geldi", "yemek bana ‘beni yemeden saygı duy’ diyor"). İmza: "Garip ama bana ... hissettirdi." Absürt-güldürü DEĞİL (o Komedi), keskin ÖZGÜNLÜK. AYRIM: Escobar KESİN hüküm+meydan okuma verir; Villanelle özgün-kişisel HİS/bakış verir.' },
  { badgeId: 'badge-pablo-escobar', name: 'Pablo Escobar', trait: 'KESİN/İDDİALI + MEYDAN OKUMA: geri adım atmadan net hüküm verir ve tartışmaya KAPATIR ("şehrin en iyisi, aksini söyleyen ya ne yediğini bilmiyor ya hiç gelmemiştir", "bu konuda tartışacak bir şey yok. Bitti."). İmza: "Tartışmaya gerek yok, aksini söyleyen yanılıyor." AYRIM: Villanelle özgün-kişisel his verir; Escobar kesin-otoriter HÜKÜM verir.' },
  { badgeId: 'badge-dark-jonas', name: 'Jonas (Dark)', trait: 'CEVAP ARAYAN SORGULAYICI: bir problemi fark eder ve cevabını ARAR ama ulaşamaz; belirsizlik+neden arama ("geçen ay 180 şimdi 240, porsiyon aynı, neden arttı? malzeme mi pahalandı acaba?"). İmza: "Neden böyle olduğunu anlamıyorum, bir açıklaması olmalı." AYRIM: Carrie kanıtsız SEZGİSEL hüküm verir (biliyorum); Jonas cevap arayan açık SORU sorar (anlamıyorum).' },
  // ── FANTASTİK: keşif/davetiye ──
  { badgeId: 'badge-jon-snow', name: 'Jon Snow', trait: 'DÜRÜST/DENGELİ: güvenilir değerlendirme, hem artıyı hem küçük bir eksiyi adil ve abartısız sunar ("dürüst olmak gerekirse... ama... genel olarak memnun"). Güven veren ton.' },
  { badgeId: 'badge-daenerys', name: 'Daenerys', trait: 'KEŞİF/REHBER: mekanı bir keşif/öneri gibi sunar, başkasına yol gösterir ("keşfedilmeyi bekleyen gizli bir yer, yolunuz düşerse mutlaka uğrayın, iyi bir alternatif"). "Burası keşfedilmeli."' },
  { badgeId: 'badge-dean-winchester', name: 'Dean Winchester', trait: 'KORUYUCU UYARI + TAVSİYE: "şuna dikkat et ama yine de git, pişman olmazsın" tarzı; küçük bir uyarı + genel olumlu tavsiye, enerjik-samimi arkadaş tonu. UYARI/DİKKAT unsuru ZORUNLU ("kalabalık olabilir", "otopark sıkıntılı" gibi); yorumda uyarı YOKSA Dean DEĞİL (kısa+öneri ise Geralt).' },
  { badgeId: 'badge-eleven', name: 'Eleven', trait: 'ARKADAŞLIK/PAYLAŞIM: "ben geldim"den çok "sevdiklerimle güzel vakit geçirdim"; sıcak ortam, sohbet, samimiyet vurgusu ("arkadaşlarla saatlerce oturduk, evimizde gibi"). "Burada birlikte güzel vakit geçilir."' },
  { badgeId: 'badge-witcher', name: 'Geralt', trait: 'AZ VE ÖZ: kısa, doğrudan, net yargı + vurucu sonuç, gereksiz hikaye yok ("Kahvesi çok iyi. Ortamı sakin. Tavsiye ederim."). Ama yalnız "iyi/güzel" tek kelime DEĞİL — fantastik öneri de taşımalı. UYARI/dikkat unsuru YOKtur (uyarı varsa Dean); arkadaşlık/sohbet vurgusu YOKtur (varsa Eleven); keşif/rota çağrısı baskın DEĞİL (baskınsa Daenerys). "Kısa söyledim, net söyledim."' },
  { badgeId: 'badge-elizabeth', name: 'Kraliçe Elizabeth', trait: 'İSTİKRAR/DÜZEN: ciddi, ölçülü; güvenilirliği ve DEĞİŞMEZ kaliteyi över ("her gelişimde aynı"). İmza: "Burası sözünü tutuyor, istikrar önemli." AYRIM: Spartacus haksızlığa İSYAN eder; Elizabeth düzeni ve tutarlılığı över — asla başkaldırmaz.' },
  { badgeId: 'badge-rick-morty', name: 'Rick Sanchez', trait: 'Dahi ama kaotik, alaycı ve umursamaz; sıra dışı bakış' },
  { badgeId: 'badge-sam-winchester', name: 'Sam Winchester', trait: 'ARAŞTIRMACI/DÜŞÜNCELİ: gitmeden önce araştırır, detayları tartar, mantıklı ve titiz değerlendirir ("bakındım, okudum, sonra karar verdim"). İmza: "Araştırıp geldim, beklentimi karşıladı." AYRIM: Dean koruyucu UYARI verir; Sam sakince ARAŞTIRIP düşünceli bir sonuç sunar.' },
  { badgeId: 'badge-tyrion', name: 'Tyrion Lannister', trait: 'ZARİF NÜKTE/KELİME USTASI: kültürlü kelime oyunu, edebi gönderme, şarap/bilgelik teması; espri ZARİF ve zekicedir. İmza: "Bir kadeh şarap ve iyi bir sohbet — medeniyet dediğin bu." AYRIM: Chandler kaba-kısa iğneleme yapar; Tyrion zarif, kültürlü, edebi nükte kurar.' },
  { badgeId: 'badge-ragnar', name: 'Ragnar Lothbrok', trait: 'FATİH/CESARET-MEYDAN: mekanı fethedilecek bir diyar gibi görür, cüretkâr ve meydan okuyan bir keşif tonu ("cesuru buraya, korkak evde kalsın"). İmza: "Yeni topraklar keşfetmek isteyen buraya gelsin." AYRIM: Daenerys NAZİK rehber, davetkâr yol gösterir; Ragnar CÜRETKÂR fatih, meydan okur.' },
  { badgeId: 'badge-spartacus', name: 'Spartacus', trait: 'İSYAN/ADALET: haksızlığa BAŞKALDIRIR, müşteri hakkını savunur, sesini yükseltir ("bu kabul edilemez, birileri sesini çıkarmalı"). İmza: "Buna sessiz kalınmaz, hakkımızı arayalım." AYRIM: Elizabeth düzeni över; Spartacus adaletsizliğe İSYAN eder.' },
  { badgeId: 'badge-rome-julius', name: 'Julius Caesar', trait: 'OTORİTE/HÜKÜM: buyurgan, kesin, vizyoner; tartışmasız bir üstünlük ilan eder ("geldim, gördüm, en iyisi bu"). İmza: "Karar verildi: şehrin en iyisi burası." AYRIM: Escobar meydan okur (aksini diyen yanılır); Julius HÜKMEDER, imparator edasıyla ilan eder.' },
  { badgeId: 'badge-tokyo', name: 'Tokyo', trait: 'ATEŞLİ COŞKU: dürtüsel, doğrudan, tutkulu; abartısız ama yüksek enerjiyle över/yerer ("bayıldım, herkes koşsun!"). İmza: "Buraya aşık oldum, hemen gidin!" AYRIM: This-is-Us duygulanıp içlenir; Tokyo COŞAR, ateşli ve dürtüseldir.' },
  { badgeId: 'badge-jesse-pinkman', name: 'Jesse Pinkman', trait: 'DUYGUSAL/SAVUNMASIZ: içten, kırılgan, samimi; kendini açar, duygulanır ("kendimi evimde hissettim, gözlerim doldu"). İmza: "Buraya gelince içim ısındı resmen." AYRIM: This-is-Us AİLE/topluluk duygusu; Jesse KİŞİSEL, savunmasız, bireysel içtenlik.' },
  { badgeId: 'badge-khalesi', name: 'Khaleesi', trait: 'KORUYUCU ADİL LİDER: güçlü ama koruyucu; hakkı teslim eder, zayıfın/emeğin yanında durur ("emeğe saygı, hak edene hakkını"). İmza: "Emek veren herkes takdiri hak ediyor." AYRIM: Ragnar cüretkâr fatih; Khaleesi KORUYUCU, adil, sahip çıkan lider.' },
  { badgeId: 'badge-this-is-us', name: 'This is Us', trait: 'AİLE/DUYGU: sıcak, aile-topluluk odaklı, düşündürücü; paylaşılan anları yüceltir ("ailecek geldik, çocuklar mutlu oldu, duygulandık"). İmza: "Böyle sıcak aile ortamları giderek azalıyor." AYRIM: Jesse bireysel-savunmasız; This-is-Us AİLE/topluluk duygusudur.' },
  { badgeId: 'badge-good-omens', name: 'Aziraphale & Crowley', trait: 'ZIT İKİLİ + SICAK ESPRİ: iki zıt tonu (nazik ↔ afacan) harmanlayan keyifli, sıcak, dostane mizah; "bir yanım şöyle dedi, diğer yanım böyle" ikili bakış. İmza: "İçimdeki melek övdü, şeytan hesabı görünce homurdandı." AYRIM: Tyrion tek zekâ-nükte; Good-Omens ZIT iki sesin sıcak uyumu.' },
  { badgeId: 'badge-kelly-yorkie', name: 'Kelly & Yorkie', trait: 'Nostaljik, romantik, umutlu; duygu yüklü' },
  { badgeId: 'badge-martha', name: 'Martha', trait: 'Derin, bağlantı kuran, gizemli; düşündüren' },
];

/**
 * `why` metnini güvenli sınıra indirir AMA cümleyi/kelimeyi ortadan kesmez:
 * limit içindeki son cümle sonunda (. ! ?), yoksa son boşlukta keser; sonuna
 * yarım kalırsa "…" ekler. Böylece reveal ekranında yazı asla yarım görünmez.
 */
function tidyWhy(raw: string | undefined, limit = 220): string {
  const s = (raw || '').trim();
  if (s.length <= limit) return s;
  const slice = s.slice(0, limit);
  // Limit içindeki son cümle sonu.
  const lastSentence = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (lastSentence > limit * 0.5) return slice.slice(0, lastSentence + 1).trim();
  // Yoksa son kelime sınırı + üç nokta.
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim().replace(/[,;:]$/, '') + '…';
}

export type CharacterClassification = {
  badgeId: string;
  name: string;
  why: string;
  /** Seçilen kategori (2-aşamalı sınıflandırma sonucu). */
  categoryKey?: string;
  categoryName?: string;
} | null;


/**
 * Kullanıcıya bir karakter rozetini atar (kazanılır — puan düşülmez, satın alma değil).
 * İdempotent: aynı rozet ikinci kez atanmaz (@@unique([userId, badgeId])).
 * Kullanıcının önceki karakter rozetlerini (varsa) kaldırmaz — koleksiyon olarak birikir.
 */
/**
 * Bir karakter Badge kaydının DB'de var olmasını garanti eder (seed eksikliğine
 * dayanıklı — yoksa KATALOGDAN otomatik oluşturur). İdempotent (upsert). Rozet
 * ATAMAZ, yalnızca Badge tanımını hazırlar. Döndürür: badge var/oluşturuldu mu.
 */
export async function ensureCharacterBadgeRecord(badgeId: string): Promise<{ id: string; name: string } | null> {
  const badge = await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true, name: true } });
  if (badge) return badge;
  const { BADGE_CATALOG } = await import('@/lib/badge-catalog');
  const cat = BADGE_CATALOG.find((b) => b.id === badgeId);
  if (!cat) return null; // katalogda da yoksa gerçekten geçersiz
  return prisma.badge.upsert({
    where: { id: badgeId },
    update: {},
    create: {
      id: cat.id, name: cat.name, description: cat.description ?? '',
      icon: cat.icon ?? '/logo/logo.png', category: cat.category ?? 'special',
      rarity: cat.rarity ?? 'legendary', pointCost: cat.pointCost ?? null, isActive: true,
      requirement: { type: 'character', value: 1 } as object,
    },
    select: { id: true, name: true },
  }).catch(() => null);
}


// ─────────────────────────────────────────────────────────────────────────────
// KATEGORİ-BAZLI KARAKTER ROZETİ (yeni sistem)
//  • Her yorum yazıldığında AI o yorumu bir ÜSLUP kategorisine oturtur (gizli).
//  • Bir kategoride CATEGORY_BADGE_THRESHOLD (6) yorum birikince, o kategorinin
//    kullanıcıda HENÜZ OLMAYAN bir karakter rozeti sihirli reveal ile açılır.
//  • Aynı kategori tekrar dolarsa o kategoriden BAŞKA karakter verilir.
//  • Kullanıcı hangi kategoriyi doldurduğunu bilmez (bar gizli ilerler).
// ─────────────────────────────────────────────────────────────────────────────

/** Tek bir yorumu ÜSLUP kategorisine sınıflandırır (dram-suc|komedi|fantastik|gizem-gerilim). */
export async function classifyFeedbackCategory(text: string): Promise<string | null> {
  const clean = (text || '').trim();
  if (clean.length < 8) return null; // çok kısa yorum sınıflandırılmaz

  const { CHARACTER_CATEGORIES, CATEGORY_BY_KEY } = await import('@/lib/character-categories');
  const catLines = CHARACTER_CATEGORIES.map((c) => `- ${c.key} (${c.name}): ${c.aiHint}`).join('\n');
  const validKeys = CHARACTER_CATEGORIES.map((c) => c.key);

  try {
    const { runChatCompletion } = await import('@/lib/ai-engine');
    const res = await runChatCompletion({
      system:
        'Sen bir yorum ÜSLUP sınıflandırıcısısın. Verilen TEK yorumu, aşağıdaki kategorilerden ' +
        'üslubuna EN UYGUN olanına ata. Yalnızca bir categoryKey döndür. ' +
        'JSON: {"categoryKey":"..."}.',
      user: `KATEGORİLER:\n${catLines}\n\nYORUM:\n"${clean.slice(0, 500)}"\n\nEn uygun kategoriyi seç. JSON:`,
      temperature: 0.2,
      maxTokens: 40,
      jsonMode: true,
    });
    const content = res && typeof res !== 'string' ? res.content : (res as string | null);
    if (!content) return null;
    const parsed = JSON.parse(content) as { categoryKey?: string };
    if (parsed.categoryKey && CATEGORY_BY_KEY[parsed.categoryKey]) return parsed.categoryKey;
    // Güvenlik: geçersizse null (sayıma dahil edilmez).
    return validKeys.includes(parsed.categoryKey || '') ? parsed.categoryKey! : null;
  } catch {
    return null;
  }
}

/**
 * Bir kategoride, kullanıcının HENÜZ ALMADIĞI karakterlerden en uygun olanı seçer.
 * O kategorideki yorumlarına bakıp AI ile seçer + gerekçe (why) üretir.
 * Tüm karakterler alınmışsa null (o kategori tükendi).
 */
export async function pickCharacterInCategory(
  userId: string,
  categoryKey: string,
): Promise<CharacterClassification> {
  const { CATEGORY_BY_KEY, charactersInCategory } = await import('@/lib/character-categories');
  const cat = CATEGORY_BY_KEY[categoryKey];
  if (!cat) return null;

  // Kullanıcının bu kategoride zaten sahip olduğu karakterleri çıkar.
  const owned = await prisma.userBadge.findMany({
    where: { userId, badgeId: { in: cat.characterIds } },
    select: { badgeId: true },
  });
  const ownedSet = new Set(owned.map((b) => b.badgeId));
  const available = charactersInCategory(categoryKey).filter((c) => !ownedSet.has(c.badgeId));
  if (available.length === 0) return null; // bu kategorideki tüm karakterler alınmış

  // Bu kategorideki TÜKETİM YORUMLARINDAN örneklem (AI'ın karakteri seçmesi için).
  const reviews = await prisma.consumptionReview.findMany({
    where: { customerId: userId, characterCategory: categoryKey, text: { not: null } },
    select: { text: true, rating: true },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  const sample = reviews
    .map((f, i) => `${i + 1}. (${f.rating}★) ${f.text!.slice(0, 200)}`)
    .join('\n');

  const options = available.map((c) => `${c.badgeId} = ${c.name}: ${c.trait}`).join('\n');

  try {
    const { runChatCompletion } = await import('@/lib/ai-engine');
    const res = await runChatCompletion({
      system:
        `Sen bir kişilik analistisin. Kullanıcı "${cat.name}" üslubunda yorumlar yazan biri. ` +
        'Aşağıdaki karakterlerden yazım tarzına EN UYGUN olanı seç (badgeId). ' +
        'why alanı: kullanıcıyı BU KARAKTERE benzeten OLUMLU bir açıklama. Kullanıcının ' +
        'yazım tarzının bu karakterin kişiliğiyle (planlı, gözlemci, ironik vb.) nasıl ' +
        'örtüştüğünü anlat. "Sen ... yazıyorsun, tıpkı ... gibi" tarzında, gurur verici bir ton. ' +
        'Yorumları ASLA eleştirme, kullanıcıya soru sorma, öneri verme. Sadece neden bu karaktere ' +
        'benzediğini söyle. TAM cümle, en fazla 30 kelime, nokta ile bitir. ' +
        'Örnek doğru why: "Yorumlarını ince bir mizah ve keskin gözlemle yazıyorsun; tıpkı her ayrıntıyı yakalayan Sherlock gibi." ' +
        'JSON: {"badgeId":"...","why":"..."}.',
      user: `KARAKTERLER:\n${options}\n\nKULLANICININ YAZIM TARZINI GÖSTEREN ÖRNEK YORUMLAR:\n${sample || '(örnek yok)'}\n\nBu yazım tarzına en uygun karakteri seç ve neden benzediğini olumlu anlat. JSON:`,
      temperature: 0.5,
      maxTokens: 220,
      jsonMode: true,
    });
    const content = res && typeof res !== 'string' ? res.content : (res as string | null);
    let picked = available[0]; // güvenli varsayılan
    let why = '';
    if (content) {
      const parsed = JSON.parse(content) as { badgeId?: string; why?: string };
      const match = available.find((c) => c.badgeId === parsed.badgeId);
      if (match) picked = match;
      why = tidyWhy(parsed.why);
    }
    return { badgeId: picked.badgeId, name: picked.name, why, categoryKey: cat.key, categoryName: cat.name };
  } catch {
    // AI yoksa: kategoriden ilk uygun karakteri gerekçesiz ata (sessiz degradasyon).
    return { badgeId: available[0].badgeId, name: available[0].name, why: '', categoryKey: cat.key, categoryName: cat.name };
  }
}

/**
 * Tüketim yorumu (ConsumptionReview) POST/PUT'undan çağrılır (fire-and-forget).
 * KARAKTER ROZETİ SİSTEMİ ARTIK YALNIZCA TÜKETİM YORUMLARINI baz alır (QR feedback
 * değil). Yorumu KATEGORİYE sınıflandırıp ConsumptionReview.characterCategory'ye yazar.
 * Rozet ATAMASI burada YAPILMAZ — eşik dolunca kullanıcı badges'te barı dolu görür ve
 * sihirli reveal'i açar; rozet o an (POST /api/customer/character) atanır.
 */
export async function processConsumptionReviewForCharacterBadge(
  userId: string,
  reviewId: string,
  text: string,
): Promise<void> {
  try {
    const categoryKey = await classifyFeedbackCategory(text);
    if (!categoryKey) return;
    await prisma.consumptionReview.update({
      where: { id: reviewId },
      data: { characterCategory: categoryKey },
    }).catch(() => {});

    // Bar YENİ dolduysa (bu yorumla eşiğe/ katına ulaşıldı) VE o kategoride alınmamış
    // karakter varsa → kullanıcıya "karakterin hazır" bildirimi (sürpriz: hangi
    // karakter/kategori olduğu SÖYLENMEZ). Rozet reveal anında atanır.
    const prog = await getCategoryProgress(userId);
    if (!prog.ready) return; // eşik dolmadı → bildirim yok
    // getCategoryProgress zaten kategori-başına eşik + uzunluk şartını uyguluyor; hazır
    // olan kategori BU yorumla ilgili mi (spam bildirim önleme). Bar tam dolduysa bildir.
    const { CATEGORY_BY_KEY } = await import('@/lib/character-categories');
    const cat = CATEGORY_BY_KEY[categoryKey];
    if (cat) {
      // Bar TAM dolduğu (current === threshold) yorumda bir kez "hazır" bildir. prog.ready
      // + prog.current === threshold → bu yorum eşiği yeni doldurdu.
      const justCrossed = prog.topCategoryKey === categoryKey && prog.current >= prog.threshold;
      if (justCrossed) {
        // DEDUP (spam önleme): prog.current CLAMP'li olduğundan eşik geçildikten sonra HER
        // yorumda justCrossed=true kalır. Zaten OKUNMAMIŞ bir "character-ready" bildirimi
        // varsa tekrar bildirme (app + email) — kullanıcı açana/reveal edene kadar tek bildirim.
        const alreadyNotified = await prisma.notification.findFirst({
          where: { userId, isRead: false, type: 'badge', data: { path: ['kind'], equals: 'character-ready' } },
          select: { id: true },
        }).catch(() => null);
        if (alreadyNotified) return;

        // Kullanıcının e-postası + adı + bildirim tercihleri (tek okuma).
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true, notificationPrefs: true },
        }).catch(() => null);

        const { isChannelEnabled } = await import('@/lib/notification-prefs');
        const prefs = user?.notificationPrefs ?? null;

        // (1) Uygulama içi zil bildirimi — 'character' grubu 'app' kanalı açıksa yarat.
        if (isChannelEnabled(prefs, 'character', 'app')) {
          await prisma.notification.create({
            data: {
              userId,
              type: 'badge',
              title: '✨ Yeni bir karakter hazır!',
              message: 'Gizemli kürende bir karakter belirdi — açıp kim olduğunu keşfet!',
              data: { kind: 'character-ready', href: '/customer/badges' } as object,
            },
          }).catch(() => {});
        }

        // (2) E-posta bildirimi — kullanıcının e-postası varsa VE 'character'/'email' açıksa,
        //     sürprizi bozmadan "karakterin hazır" maili (fire-and-forget). Sürpriz: hangi
        //     karakter/kategori olduğu SÖYLENMEZ.
        if (user?.email && isChannelEnabled(prefs, 'character', 'email')) {
          const email = user.email;
          const name = user.name;
          import('@/lib/team-email')
            .then((m) => m.sendCharacterReadyEmail({ to: email, name }))
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[CHARACTER_BADGE] processConsumptionReview failed:', err);
  }
}

/** Bir kullanıcının kategori bazlı ilerleme durumu (bar + hazır rozet için). */
export interface CategoryProgress {
  /** En çok "hazır rozete yakın" kategori (adı UI'da GİZLENİR). */
  topCategoryKey: string | null;
  /** O kategoride mevcut eşik döngüsündeki yorum sayısı (0..threshold). */
  current: number;
  /** Eşik (6). */
  threshold: number;
  /** 0..1 ilerleme. */
  progress: number;
  /** Eşik dolu VE o kategoride alınmamış karakter var → reveal edilebilir. */
  ready: boolean;
}

/**
 * Kullanıcının kategori sayımlarını çıkarıp BAR için en uygun kategoriyi bulur.
 * "Hazır" (eşik dolu + alınmamış karakter olan) kategori varsa onu; yoksa eşiğe
 * en yakın kategoriyi seçer. Kategori ADI döndürülür ama UI'da gösterilmez (gizli).
 */
export async function getCategoryProgress(userId: string): Promise<CategoryProgress> {
  const base: CategoryProgress = { topCategoryKey: null, current: 0, threshold: CATEGORY_BADGE_THRESHOLD, progress: 0, ready: false };
  try {
    const { CHARACTER_CATEGORIES, categoryThreshold, categoryMinReviewLength } =
      await import('@/lib/character-categories');
    const { getCategoryThresholdOverrides } = await import('@/lib/character-thresholds');
    const overrides = await getCategoryThresholdOverrides(); // admin eşik/uzunluk override'ları

    // Kategori bazlı yorum sayıları. Genel sayım TÜM yorumları sayar; ama uzunluk-şartı
    // olan kategoriler (Gizemli) için yalnız DETAYLI (minReviewLength+) yorumlar sayılır.
    // Uzunluk şartı SQL groupBy'da ifade edilemediğinden, şartlı kategoriler için ayrı sayım.
    const grouped = await prisma.consumptionReview.groupBy({
      by: ['characterCategory'],
      where: { customerId: userId, characterCategory: { not: null } },
      _count: { _all: true },
    });
    const countByCat = new Map<string, number>();
    for (const g of grouped) if (g.characterCategory) countByCat.set(g.characterCategory, g._count._all);

    // Uzunluk-şartı olan kategoriler için: yalnız minLen+ uzunluktaki (özenli) yorumları say.
    // Prisma'da metin uzunluğu filtresi yok → o kategorinin metinlerini çekip kod tarafında filtrele.
    for (const cat of CHARACTER_CATEGORIES) {
      const minLen = categoryMinReviewLength(cat, overrides);
      if (minLen <= 0) continue;
      const rows = await prisma.consumptionReview.findMany({
        where: { customerId: userId, characterCategory: cat.key, text: { not: null } },
        select: { text: true },
      });
      const detailedCount = rows.filter((r) => (r.text?.trim().length ?? 0) >= minLen).length;
      countByCat.set(cat.key, detailedCount);
    }

    // Kullanıcının sahip olduğu karakter rozetleri (kategori tükenmiş mi?).
    const allCharIds = CHARACTER_PROFILES.map((c) => c.badgeId);
    const ownedBadges = await prisma.userBadge.findMany({
      where: { userId, badgeId: { in: allCharIds } },
      select: { badgeId: true },
    });
    const ownedSet = new Set(ownedBadges.map((b) => b.badgeId));

    let best: CategoryProgress | null = null;
    for (const cat of CHARACTER_CATEGORIES) {
      const threshold = categoryThreshold(cat, overrides); // admin override > kod-default (Gizemli=20/diğer=6)
      const total = countByCat.get(cat.key) ?? 0;
      const availableChars = cat.characterIds.filter((id) => !ownedSet.has(id));
      if (availableChars.length === 0) continue; // bu kategoride alınacak karakter kalmadı

      // Kaç rozet zaten alınmış → o kadar eşik "tüketilmiş" say (aynı kategoride yeni karakter).
      const takenInCat = cat.characterIds.filter((id) => ownedSet.has(id)).length;
      const consumed = takenInCat * threshold;
      const current = Math.max(0, Math.min(threshold, total - consumed));
      const ready = total - consumed >= threshold;
      const cand: CategoryProgress = {
        topCategoryKey: cat.key, current, threshold,
        progress: threshold > 0 ? current / threshold : 0, ready,
      };
      // Öncelik: hazır olan > ilerlemesi yüksek olan (oransal).
      if (!best) best = cand;
      else if (cand.ready && !best.ready) best = cand;
      else if (cand.ready === best.ready && cand.progress > best.progress) best = cand;
    }
    return best ?? base;
  } catch {
    return base;
  }
}

/**
 * Reveal anında çağrılır: kullanıcının EŞİĞİ DOLMUŞ bir kategorisinde, alınmamış
 * bir karakter rozeti seçer + atar + sınıflandırma döndürür. Hazır kategori yoksa null.
 */
export async function revealReadyCategoryBadge(userId: string): Promise<CharacterClassification> {
  const prog = await getCategoryProgress(userId);
  if (!prog.ready || !prog.topCategoryKey) return null;
  const categoryKey = prog.topCategoryKey;
  const picked = await pickCharacterInCategory(userId, categoryKey);
  if (!picked) return null;

  // ── ATOMİK EŞİK TÜKETİMİ (yarış koruması) ──
  // İki eşzamanlı reveal isteği, tx dışı getCategoryProgress'te aynı "ready" durumunu
  // okuyup TEK eşik döngüsünden ÇİFT karakter atayabilirdi (LLM temperature>0 farklı
  // badgeId seçince unique kısıt da çakışmaz). Guard: rozet atamayı tek $transaction
  // içinde yap; o kategoride TÜKETİLECEK eşik hâlâ geçerli mi tx içinde doğrula.
  const { CATEGORY_BY_KEY, categoryThreshold, categoryMinReviewLength } =
    await import('@/lib/character-categories');
  const { getCategoryThresholdOverrides } = await import('@/lib/character-thresholds');
  const cat = CATEGORY_BY_KEY[categoryKey];
  if (!cat) return null;
  // Reveal guard'ı progress bar ile AYNI override snapshot'ını kullanmalı (tutarlılık).
  const overrides = await getCategoryThresholdOverrides();
  const threshold = categoryThreshold(cat, overrides);
  const minLen = categoryMinReviewLength(cat, overrides);

  // Badge kaydını önceden hazırla (upsert tx dışında olabilir — idempotent, yarış yok).
  await ensureCharacterBadgeRecord(picked.badgeId);

  const created = await prisma.$transaction(async (tx) => {
    // YARIŞ KORUMASI: Read Committed altında iki eşzamanlı reveal tx'i birbirinin
    // commit EDİLMEMİŞ INSERT'ini count() ile göremez → ikisi de takenNow=0 okuyup
    // eşiği geçebilir, LLM farklı badgeId seçince skipDuplicates de çakışmaz → ÇİFT rozet.
    // Bu kullanıcıya özel advisory kilit tx boyunca aynı-kullanıcı reveal'lerini SERİLEŞTİRİR;
    // ikinci tx birinciyi bekler ve güncel (commit'lenmiş) sayımı görür.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`character-reveal:${userId}`}))`;

    // Bu kategoride ŞU AN sahip olunan rozet sayısı (kilit sonrası taze okuma).
    const takenNow = await tx.userBadge.count({
      where: { userId, badgeId: { in: cat.characterIds } },
    });
    // Bu kategorideki SAYILAN yorum adedi. Uzunluk-şartlı kategoride (Gizemli) yalnız
    // minLen+ (özenli) yorumlar sayılır; diğer kategorilerde tüm kategorize yorumlar.
    let totalReviews: number;
    if (minLen > 0) {
      const rows = await tx.consumptionReview.findMany({
        where: { customerId: userId, characterCategory: categoryKey, text: { not: null } },
        select: { text: true },
      });
      totalReviews = rows.filter((r) => (r.text?.trim().length ?? 0) >= minLen).length;
    } else {
      totalReviews = await tx.consumptionReview.count({
        where: { customerId: userId, characterCategory: categoryKey },
      });
    }
    // Eşik hâlâ tüketilebilir mi? (total - takenNow*threshold >= threshold). Değilse iptal.
    if (totalReviews - takenNow * threshold < threshold) {
      return false;
    }
    // Seçilen karakter hâlâ alınmamış mı? (createMany + skipDuplicates atomik son savunma).
    const res = await tx.userBadge.createMany({
      data: [{ userId, badgeId: picked.badgeId }],
      skipDuplicates: true,
    });
    if (res.count === 0) return false; // aynı badgeId zaten alınmış (unique guard)
    return true;
  });

  if (!created) return null; // eşzamanlı istek eşiği tüketti → bu istek boş döner

  // Bildirim + koleksiyon başarımları (fire-and-forget; hata reveal'i bozmaz).
  try {
    await prisma.notification.create({
      data: {
        userId, type: 'badge', title: 'Yeni Karakter Rozeti! 🎭',
        message: `Yorumlarına göre karakterin belirlendi: ${picked.name}`,
      },
    });
  } catch { /* bildirim başarısız olsa da rozet atandı */ }
  try {
    const { checkCollectionAchievements } = await import('@/lib/character-achievements');
    await checkCollectionAchievements(userId);
  } catch { /* başarım kontrolü başarısız olsa da karakter atandı */ }
  return picked;
}
