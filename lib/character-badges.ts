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
  { badgeId: 'badge-walter-white', name: 'Walter White', trait: 'Stratejik, planlı, hırslı; kriz anında çözüm bulur' },
  { badgeId: 'badge-tommy-shelby', name: 'Tommy Shelby', trait: 'Soğukkanlı, hesapçı, planlı; yorumlarına yön veren lider' },
  { badgeId: 'badge-sherlock', name: 'Sherlock Holmes', trait: 'Analitik, gözlemci, detaycı; en küçük ayrıntıyı yakalar' },
  { badgeId: 'badge-professor', name: 'El Profesor', trait: 'Planlı, stratejik, soğukkanlı; düşünülmüş faydalı yorumlar' },
  { badgeId: 'badge-michael-scofield', name: 'Michael Scofield', trait: 'Stratejik zeka, mantık zinciri kuran, planlı' },
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
  { badgeId: 'badge-joe', name: 'Joe Goldberg', trait: 'GÖZLEMCİ/DETAY AVCISI: başkalarının fark etmediği küçük detayları tek tek not düşer, takıntı derecesinde ("şunu da fark ettim... bir de..."). "Ne fark ettim?" — saf gözlem, hüküm değil.' },
  { badgeId: 'badge-frank-underwood', name: 'Frank Underwood', trait: 'HESAP/STRATEJİ ŞÜPHESİ: işletmenin bilinçli bir hesabı olduğundan şüphelenir ("menüde 300 hesapta 350, tesadüf değil; adisyonu inceleyin"). "Burada kimin hesabı var?" — finansal/çıkar şüphesi.' },
  { badgeId: 'badge-carrie', name: 'Carrie Mathison', trait: 'İZ SÜRÜCÜ: detayları birleştirip şüpheli bir sonuca ulaşmaya çalışır ("önce tesadüf sandım, ikinci kez olunca şüphelendim"). Joe fark eder, Carrie soruşturur. "Gerçekte ne oluyor?"' },
  { badgeId: 'badge-villanelle', name: 'Villanelle', trait: 'ÇARPICI/ÖZGÜN: sıradan değerlendirme değil, okuyanı şaşırtan keskin-özgün üslup, kendinden emin ("300 TL kahvenin 350’ye dönüşmesi oldukça yaratıcı bir matematik"). Absürt değil, keskin özgünlük.' },
  { badgeId: 'badge-pablo-escobar', name: 'Pablo Escobar', trait: 'KESİN/İDDİALI: geri adım atmadan net hüküm verir ("hiç tartışmasız en iyilerden biri"). Gizem belirsizlikten değil ÖZGÜVENDEN gelir. "Benim hükmüm ne?"' },
  { badgeId: 'badge-dark-jonas', name: 'Jonas (Dark)', trait: 'SORGULAYICI/DERİN: cevapsız bir "neden böyle?" sorusu bırakır, olayın arkasındaki sebebi merak eder, felsefi/derin ("bunun bir sebebi olmalı"). "Bunun arkasında ne var?"' },
  // ── FANTASTİK: keşif/davetiye ──
  { badgeId: 'badge-jon-snow', name: 'Jon Snow', trait: 'DÜRÜST/DENGELİ: güvenilir değerlendirme, hem artıyı hem küçük bir eksiyi adil ve abartısız sunar ("dürüst olmak gerekirse... ama... genel olarak memnun"). Güven veren ton.' },
  { badgeId: 'badge-daenerys', name: 'Daenerys', trait: 'KEŞİF/REHBER: mekanı bir keşif/öneri gibi sunar, başkasına yol gösterir ("keşfedilmeyi bekleyen gizli bir yer, yolunuz düşerse mutlaka uğrayın, iyi bir alternatif"). "Burası keşfedilmeli."' },
  { badgeId: 'badge-dean-winchester', name: 'Dean Winchester', trait: 'KORUYUCU UYARI + TAVSİYE: "şuna dikkat et ama yine de git, pişman olmazsın" tarzı; küçük bir uyarı + genel olumlu tavsiye, enerjik-samimi arkadaş tonu.' },
  { badgeId: 'badge-eleven', name: 'Eleven', trait: 'ARKADAŞLIK/PAYLAŞIM: "ben geldim"den çok "sevdiklerimle güzel vakit geçirdim"; sıcak ortam, sohbet, samimiyet vurgusu ("arkadaşlarla saatlerce oturduk, evimizde gibi"). "Burada birlikte güzel vakit geçilir."' },
  { badgeId: 'badge-witcher', name: 'Geralt', trait: 'AZ VE ÖZ: kısa, doğrudan, net yargı + vurucu sonuç, gereksiz hikaye yok ("Kahvesi çok iyi. Ortamı sakin. Tavsiye ederim."). Ama yalnız "iyi/güzel" tek kelime DEĞİL — fantastik öneri de taşımalı. "Kısa söyledim, net söyledim."' },
  { badgeId: 'badge-elizabeth', name: 'Kraliçe Elizabeth', trait: 'Ciddi, sorumluluk sahibi; düzenli, istikrarlı' },
  { badgeId: 'badge-rick-morty', name: 'Rick Sanchez', trait: 'Dahi ama kaotik, alaycı ve umursamaz; sıra dışı bakış' },
  { badgeId: 'badge-sam-winchester', name: 'Sam Winchester', trait: 'Araştırmacı, mantıklı, sadık; detaylı ve düşünceli' },
  { badgeId: 'badge-tyrion', name: 'Tyrion Lannister', trait: 'Zeki, hazırcevap, ince mizahlı; kelimelerin gücünü bilir' },
  { badgeId: 'badge-ragnar', name: 'Ragnar Lothbrok', trait: 'Cesur, hırslı, keşifçi; iddialı ve lider ruhlu' },
  { badgeId: 'badge-spartacus', name: 'Spartacus', trait: 'İsyankâr, onurlu, kararlı; adalet için savaşan' },
  { badgeId: 'badge-rome-julius', name: 'Julius Caesar', trait: 'Stratejik, otoriter, vizyoner; güçlü ve kararlı' },
  { badgeId: 'badge-tokyo', name: 'Tokyo', trait: 'Ateşli, dürtüsel, cesur; tutkulu ve doğrudan' },
  { badgeId: 'badge-jesse-pinkman', name: 'Jesse Pinkman', trait: 'Duygusal, samimi, gözü kara; içten ve savunmasız' },
  { badgeId: 'badge-khalesi', name: 'Khaleesi', trait: 'Güçlü, adaletli, lider; koruyucu ve kararlı' },
  { badgeId: 'badge-this-is-us', name: 'This is Us', trait: 'Duygusal, sıcak, aile odaklı; içten ve düşündürücü' },
  { badgeId: 'badge-good-omens', name: 'Aziraphale & Crowley', trait: 'Zıt ama uyumlu; esprili, keyifli ve sıcak' },
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
 * Kullanıcının yorum geçmişini agregeleyip LLM ile 2 AŞAMADA sınıflandırır:
 *   1) Yorum üslubuna göre KATEGORİ (Dram/Suç, Komedi, Fantastik, Gizem…).
 *   2) O kategorinin karakterlerinden en uygun olanı.
 * Tek LLM çağrısında ikisini de ister (maliyet: 1 çağrı). AI kategoriyi şaşırırsa
 * güvenli fallback devreye girer. LLM yoksa/başarısızsa null (sessiz degradasyon).
 */
export async function classifyCharacter(userId: string): Promise<CharacterClassification> {
  const feedbacks = await prisma.feedback.findMany({
    where: { userId, deletedAt: null, text: { not: null } },
    select: { text: true, rating: true, sentiment: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const withText = feedbacks.filter((f) => f.text && f.text.trim().length > 0);
  if (withText.length < CHARACTER_BADGE_THRESHOLD) return null;

  const sample = withText
    .slice(0, 20)
    .map((f, i) => `${i + 1}. (${f.rating}★, ${f.sentiment || '?'}) ${f.text!.slice(0, 200)}`)
    .join('\n');

  // Kategori altyapısı burada TÜKETİLİR (genişletilebilir): kategoriler + her
  // kategorinin karakterleri prompt'a otomatik yansır.
  const { CHARACTER_CATEGORIES, CATEGORY_BY_KEY, charactersInCategory, FALLBACK_CATEGORY_KEY } =
    await import('@/lib/character-categories');

  const categoryBlock = CHARACTER_CATEGORIES.map((cat) => {
    const chars = charactersInCategory(cat.key)
      .map((c) => `    - ${c.badgeId} = ${c.name}: ${c.trait}`)
      .join('\n');
    return `• KATEGORİ "${cat.key}" (${cat.name}) — ${cat.aiHint}\n  Bu kategorinin karakterleri:\n${chars}`;
  }).join('\n\n');

  try {
    const { runChatCompletion } = await import('@/lib/ai-engine');
    const res = await runChatCompletion({
      system:
        'Sen bir kişilik/üslup analisti asistanısın. Kullanıcının yorumlarını oku ve İKİ AŞAMADA karar ver: ' +
        '(1) Yorumların genel ÜSLUBUNU en iyi anlatan KATEGORİ\'yi seç (categoryKey). ' +
        '(2) O kategorinin karakterleri arasından kişiliğe EN UYGUN olanı seç (badgeId). ' +
        'badgeId, seçtiğin categoryKey\'in karakterlerinden BİRİ olmak ZORUNDA. ' +
        'why: kullanıcının YAZIM TARZINI bu karaktere benzeten OLUMLU açıklama. ' +
        '"Sen ... yazıyorsun, tıpkı ... gibi" tarzında, gurur verici. Yorumları eleştirme, ' +
        'soru sorma, öneri verme. TAM cümle, en fazla 30 kelime, nokta ile bitir. ' +
        'JSON döndür: {"categoryKey":"...","badgeId":"...","why":"..."}.',
      user: `KATEGORİLER VE KARAKTERLERİ:\n${categoryBlock}\n\nKULLANICININ YORUMLARI:\n${sample}\n\nÖnce kategori, sonra o kategoriden karakter seç. why kısa ve tam bitsin. JSON:`,
      temperature: 0.4,
      maxTokens: 260,
      jsonMode: true,
    });
    const content = res && typeof res !== 'string' ? res.content : (res as string | null);
    if (!content) return null;
    const parsed = JSON.parse(content) as { categoryKey?: string; badgeId?: string; why?: string };

    // Karakter geçerli mi?
    let match = CHARACTER_PROFILES.find((c) => c.badgeId === parsed.badgeId);
    // Kategori geçerli mi? (AI uydurmuşsa karakterin gerçek kategorisine düş.)
    let categoryKey = parsed.categoryKey && CATEGORY_BY_KEY[parsed.categoryKey] ? parsed.categoryKey : undefined;

    if (!match) {
      // Karakter tutmadı ama kategori tuttuysa, o kategoriden ilk karakteri seç (güvenli).
      const fallbackCat = categoryKey ?? FALLBACK_CATEGORY_KEY;
      const inCat = charactersInCategory(fallbackCat);
      match = inCat[0] ? CHARACTER_PROFILES.find((c) => c.badgeId === inCat[0].badgeId) : undefined;
      if (!match) return null;
    }
    // Kategori yoksa karakterin gerçek kategorisinden türet.
    if (!categoryKey) {
      const { CATEGORY_BY_CHARACTER } = await import('@/lib/character-categories');
      categoryKey = CATEGORY_BY_CHARACTER[match.badgeId]?.key;
    }
    const cat = categoryKey ? CATEGORY_BY_KEY[categoryKey] : undefined;

    return {
      badgeId: match.badgeId,
      name: match.name,
      why: tidyWhy(parsed.why),
      categoryKey: cat?.key,
      categoryName: cat?.name,
    };
  } catch {
    return null;
  }
}

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

export async function awardCharacterBadge(userId: string, badgeId: string): Promise<boolean> {
  // Badge kaydı DB'de var mı? Yoksa KATALOGDAN otomatik oluştur (seed eksikliğine dayanıklı).
  const badge = await ensureCharacterBadgeRecord(badgeId);
  if (!badge) return false;

  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId } },
    select: { id: true },
  });
  if (existing) return false; // zaten var

  await prisma.userBadge.create({ data: { userId, badgeId } });

  // Bildirim (fire-and-forget; hata rozet atamayı bozmasın)
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: 'badge',
        title: 'Yeni Karakter Rozeti! 🎭',
        message: `Yorumlarına göre karakterin belirlendi: ${badge.name}`,
      },
    });
  } catch {
    /* bildirim başarısız olsa da rozet atandı */
  }
  return true;
}

/**
 * Uçtan uca: kullanıcıyı sınıflandır ve rozeti ata. Eşik altındaysa/LLM yoksa no-op.
 * Döndürür: atanan karakter (yeni atandıysa) ya da null.
 */
export async function assignCharacterBadge(userId: string): Promise<CharacterClassification> {
  const classification = await classifyCharacter(userId);
  if (!classification) return null;
  await awardCharacterBadge(userId, classification.badgeId);
  return classification; // kategori + why içerir (reveal ekranı bunları kullanır)
}

/**
 * Feedback POST'undan çağrılır (fire-and-forget). Kullanıcı karakter eşiğine TAM
 * ulaştığında (ilk kez threshold'a değince) bir kez sınıflandırma tetikler — böylece
 * her yorumda LLM çağrılmaz. Zaten karakter rozeti varsa da atlanır.
 *
 * @deprecated Kategori-bazlı akış için processFeedbackForCharacterBadge kullanılır.
 * Bu fonksiyon geriye dönük uyum için tutulur (çağrılırsa yeni akışa yönlendirir).
 */
export async function maybeAssignCharacterOnThreshold(userId: string): Promise<void> {
  // Yeni akışta bu no-op'tur; kategori işleme processFeedbackForCharacterBadge içinde.
  void userId;
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
