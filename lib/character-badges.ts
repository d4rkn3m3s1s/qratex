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
  { badgeId: 'badge-sheldon', name: 'Sheldon Cooper', trait: 'Analitik zeka, kuralcı, detaycı; her şeyi mantık ve bilgiyle açıklar' },
  { badgeId: 'badge-chandler', name: 'Chandler Bing', trait: 'Keskin espri, alaycı-ironik mizah; yorumlarında iğneleyici şakalar' },
  { badgeId: 'badge-barney-stinson', name: 'Barney Stinson', trait: 'Hazır cevap, sosyal enerji, eğlenceli-abartılı; kendinden emin' },
  { badgeId: 'badge-the-office', name: 'Michael Scott', trait: 'Fazla samimi, çocuksu, onay bekleyen, iyi niyetli; sürprizli mizah' },
  { badgeId: 'badge-walter-white', name: 'Walter White', trait: 'Stratejik, planlı, hırslı; kriz anında çözüm bulur' },
  { badgeId: 'badge-tommy-shelby', name: 'Tommy Shelby', trait: 'Soğukkanlı, hesapçı, planlı; yorumlarına yön veren lider' },
  { badgeId: 'badge-sherlock', name: 'Sherlock Holmes', trait: 'Analitik, gözlemci, detaycı; en küçük ayrıntıyı yakalar' },
  { badgeId: 'badge-professor', name: 'El Profesor', trait: 'Planlı, stratejik, soğukkanlı; düşünülmüş faydalı yorumlar' },
  { badgeId: 'badge-michael-scofield', name: 'Michael Scofield', trait: 'Stratejik zeka, mantık zinciri kuran, planlı' },
  { badgeId: 'badge-hannibal', name: 'Hannibal Lecter', trait: 'Zarif ama keskin; yorumlarını çok incelikli yapar' },
  { badgeId: 'badge-house-md', name: 'Dr. House', trait: 'Alaycı, keskin zeka, gerçekçi ve eleştirel' },
  { badgeId: 'badge-dexter', name: 'Dexter Morgan', trait: 'Soğukkanlı, planlı; karmaşık durumları netleştirir' },
  { badgeId: 'badge-joe', name: 'Joe Goldberg', trait: 'Takıntılı ama analitik ve gözlemci; farklı yaklaşımlar' },
  { badgeId: 'badge-frank-underwood', name: 'Frank Underwood', trait: 'Stratejik, ince hesaplarla tartışmaları yönlendirir' },
  { badgeId: 'badge-carrie', name: 'Carrie Mathison', trait: 'Sezgileri güçlü, cesur; doğru noktaları yakalar' },
  { badgeId: 'badge-jon-snow', name: 'Jon Snow', trait: 'Onurlu, sadık, cesur; dürüstlüğüyle saygı uyandırır' },
  { badgeId: 'badge-daenerys', name: 'Daenerys', trait: 'Vizyoner, idealist, güçlü; ilham veren fikirler' },
  { badgeId: 'badge-dean-winchester', name: 'Dean Winchester', trait: 'Cesur, eğlenceli, sadık, koruyucu; destekleyici' },
  { badgeId: 'badge-eleven', name: 'Eleven', trait: 'Sessiz, cesur, arkadaşça; fedakâr ve gizemli' },
  { badgeId: 'badge-witcher', name: 'Geralt', trait: 'Sessiz ama güçlü; kısa ama etkili, çözüm odaklı' },
  { badgeId: 'badge-wednesday', name: 'Wednesday Addams', trait: 'Karanlık, bağımsız; alışılmışın dışında yorumlar' },
  { badgeId: 'badge-mr-robot', name: 'Elliot (Mr. Robot)', trait: 'Gizemli, içe kapanık; ani ama çarpıcı yorumlar' },
  { badgeId: 'badge-dark-jonas', name: 'Jonas (Dark)', trait: 'Derin düşünceli, sorgulayıcı; merak uyandıran' },
  { badgeId: 'badge-villanelle', name: 'Villanelle', trait: 'Karizmatik, kurnaz, sıra dışı; farklı enerji' },
  { badgeId: 'badge-pablo-escobar', name: 'Pablo Escobar', trait: 'Karizmatik, güçlü, korkusuz; iddialı yorumlar' },
  { badgeId: 'badge-castiel', name: 'Castiel', trait: 'Gizemli, bilge, koruyucu; dinginliğiyle dengeler' },
  { badgeId: 'badge-john-locke', name: 'John Locke', trait: 'İnançlı, keşifçi; yeni fikirler dener' },
  { badgeId: 'badge-crowley', name: 'Crowley', trait: 'Kaotik ama eğlenceli; beklenmedik, sürpriz dolu yorumlar' },
  { badgeId: 'badge-the-doctor', name: 'The Doctor', trait: 'Bilge, maceraperest; keşfetmeyi sever' },
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
    // Bu kategoride tam-katına ulaşıldıysa bir kez bildir.
    const total = await prisma.consumptionReview.count({
      where: { customerId: userId, characterCategory: categoryKey },
    });
    // Bu kategoride alınmış rozet sayısı kadar eşik tüketilmiş; yeni katına TAM ulaştıysa bildir.
    const { CATEGORY_BY_KEY } = await import('@/lib/character-categories');
    const cat = CATEGORY_BY_KEY[categoryKey];
    if (cat) {
      const takenInCat = await prisma.userBadge.count({
        where: { userId, badgeId: { in: cat.characterIds } },
      });
      const justCrossed = total === (takenInCat + 1) * CATEGORY_BADGE_THRESHOLD;
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
    const { CHARACTER_CATEGORIES } = await import('@/lib/character-categories');

    // Kategori bazlı TÜKETİM YORUMU sayıları (karakter barı tüketim yorumlarını sayar).
    const grouped = await prisma.consumptionReview.groupBy({
      by: ['characterCategory'],
      where: { customerId: userId, characterCategory: { not: null } },
      _count: { _all: true },
    });
    const countByCat = new Map<string, number>();
    for (const g of grouped) if (g.characterCategory) countByCat.set(g.characterCategory, g._count._all);

    // Kullanıcının sahip olduğu karakter rozetleri (kategori tükenmiş mi?).
    const allCharIds = CHARACTER_PROFILES.map((c) => c.badgeId);
    const ownedBadges = await prisma.userBadge.findMany({
      where: { userId, badgeId: { in: allCharIds } },
      select: { badgeId: true },
    });
    const ownedSet = new Set(ownedBadges.map((b) => b.badgeId));

    let best: CategoryProgress | null = null;
    for (const cat of CHARACTER_CATEGORIES) {
      const total = countByCat.get(cat.key) ?? 0;
      const availableChars = cat.characterIds.filter((id) => !ownedSet.has(id));
      if (availableChars.length === 0) continue; // bu kategoride alınacak karakter kalmadı

      // Kaç rozet zaten alınmış → o kadar eşik "tüketilmiş" say (aynı kategoride yeni karakter).
      const takenInCat = cat.characterIds.filter((id) => ownedSet.has(id)).length;
      const consumed = takenInCat * CATEGORY_BADGE_THRESHOLD;
      const current = Math.max(0, Math.min(CATEGORY_BADGE_THRESHOLD, total - consumed));
      const ready = total - consumed >= CATEGORY_BADGE_THRESHOLD;
      const cand: CategoryProgress = {
        topCategoryKey: cat.key, current, threshold: CATEGORY_BADGE_THRESHOLD,
        progress: current / CATEGORY_BADGE_THRESHOLD, ready,
      };
      // Öncelik: hazır olan > ilerlemesi yüksek olan.
      if (!best) best = cand;
      else if (cand.ready && !best.ready) best = cand;
      else if (cand.ready === best.ready && cand.current > best.current) best = cand;
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
  const { CATEGORY_BY_KEY } = await import('@/lib/character-categories');
  const cat = CATEGORY_BY_KEY[categoryKey];
  if (!cat) return null;

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
    // Bu kategorideki toplam (kategorize edilmiş) tüketim yorumu sayısı.
    const totalReviews = await tx.consumptionReview.count({
      where: { customerId: userId, characterCategory: categoryKey },
    });
    // Eşik hâlâ tüketilebilir mi? (total - takenNow*6 >= 6). Değilse başka istek aldı → iptal.
    if (totalReviews - takenNow * CATEGORY_BADGE_THRESHOLD < CATEGORY_BADGE_THRESHOLD) {
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
