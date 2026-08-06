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

export const CHARACTER_BADGE_THRESHOLD = 5; // En az bu kadar yorum sonrası atanır

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
        'JSON döndür: {"categoryKey":"...","badgeId":"...","why":"tek cümle Türkçe gerekçe"}.',
      user: `KATEGORİLER VE KARAKTERLERİ:\n${categoryBlock}\n\nKULLANICININ YORUMLARI:\n${sample}\n\nÖnce kategori, sonra o kategoriden karakter seç. JSON:`,
      temperature: 0.4,
      maxTokens: 160,
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
      why: parsed.why?.slice(0, 200) || '',
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
export async function awardCharacterBadge(userId: string, badgeId: string): Promise<boolean> {
  // Badge kaydı DB'de var mı (katalogdan seed edilmiş olmalı)?
  const badge = await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true, name: true } });
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
 */
export async function maybeAssignCharacterOnThreshold(userId: string): Promise<void> {
  try {
    const textCount = await prisma.feedback.count({
      where: { userId, deletedAt: null, text: { not: null } },
    });
    // Yalnızca eşiğe ilk kez ulaşıldığında (tam eşik değeri) çalıştır → tek LLM çağrısı.
    if (textCount !== CHARACTER_BADGE_THRESHOLD) return;

    // Zaten bir karakter rozeti varsa tekrar analiz etme.
    const characterIds = CHARACTER_PROFILES.map((c) => c.badgeId);
    const existing = await prisma.userBadge.findFirst({
      where: { userId, badgeId: { in: characterIds } },
      select: { id: true },
    });
    if (existing) return;

    await assignCharacterBadge(userId);
  } catch (err) {
    console.error('[CHARACTER_BADGE] threshold assign failed:', err);
  }
}
