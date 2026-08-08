/**
 * Rozet kataloğu: isim, açıklama, kategori ve puan maliyeti.
 * Kategoriler: Komedi, Fantastik, Dram/Suç, Gizem/Gerilim, Tarih, Genel emoji, Gizemli
 * pointCost = puanla açılabilir (null = sadece requirement ile kazanılır).
 */

const B = '/images/badges';

export interface BadgeCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  pointCost: number | null;
  icon: string;
  rarity: string;
}

export const BADGE_CATALOG: BadgeCatalogEntry[] = [
  // Genel / Geri bildirim
  { id: 'badge-yeni-ses', name: 'Yeni Ses', description: 'İlk geri bildiriminizi gönderdiniz!', category: 'feedback', pointCost: 200, icon: `${B}/YENİ SES.svg`, rarity: 'common' },
  { id: 'badge-usta-yorumcu', name: 'Usta Yorumcu', description: '50 geri bildirim gönderdiniz!', category: 'feedback', pointCost: 1500, icon: `${B}/USTA YORUMCU.svg`, rarity: 'epic' },
  { id: 'badge-yorum-makinesi', name: 'Yorum Makinesi', description: 'Durmaksızın yorum yapıyorsunuz!', category: 'feedback', pointCost: 4000, icon: `${B}/YORUM MAKİNESİ.svg`, rarity: 'rare' },
  { id: 'badge-kelime-buyucusu', name: 'Kelime Büyücüsü', description: 'Uzun ve detaylı yorumlar yazdınız!', category: 'feedback', pointCost: 1000, icon: `${B}/KELİME BÜYÜCÜSÜ.svg`, rarity: 'rare' },
  { id: 'badge-hayalet-yorumcu', name: 'Hayalet Yorumcu', description: 'Gizlice yorum bırakıyorsunuz!', category: 'feedback', pointCost: 1000, icon: `${B}/HAYALET YORUMCU.svg`, rarity: 'common' },
  { id: 'badge-begeni-perisi', name: 'Beğeni Perisi', description: 'Hep olumlu geri bildirimler verdiniz!', category: 'engagement', pointCost: 1000, icon: `${B}/BEĞENİ PERİSİ.svg`, rarity: 'rare' },
  { id: 'badge-emoji-ustasi', name: 'Emoji Ustası', description: 'Yorumlarınızda emoji kullanma konusunda ustasınız!', category: 'feedback', pointCost: 500, icon: `${B}/EMOJİ USTASI.svg`, rarity: 'common' },
  { id: 'badge-flash', name: 'Flash', description: 'Çok hızlı geri bildirim gönderdiniz!', category: 'speed', pointCost: null, icon: `${B}/FLASH.svg`, rarity: 'common' },
  { id: 'badge-keskin-nisanci', name: 'Keskin Nişancı', description: 'Her yorumunuz isabetli ve yapıcı!', category: 'feedback', pointCost: 1500, icon: `${B}/KESKİN NİŞANCI.svg`, rarity: 'epic' },
  { id: 'badge-hizli-ofkeli', name: 'Hızlı ve Öfkeli', description: 'Çok hızlı ve tutkulu geri bildirimler!', category: 'speed', pointCost: 1000, icon: `${B}/HIZLI VE ÖFKELİ.svg`, rarity: 'rare' },
  { id: 'badge-sessiz-sinema', name: 'Sessiz Sinema', description: 'Fotoğraflarla geri bildirim verdiniz!', category: 'engagement', pointCost: 1000, icon: `${B}/SESSİZ SİNEMA.svg`, rarity: 'common' },
  { id: 'badge-konuk-oyuncu', name: 'Konuk Oyuncu', description: 'Yeni bir işletmeye ilk kez geri bildirim verdiniz!', category: 'exploration', pointCost: 1000, icon: `${B}/KONUK OYUNCU.svg`, rarity: 'common' },
  { id: 'badge-tur-rehberi', name: 'Tur Rehberi', description: '10 farklı işletmeyi ziyaret ettiniz!', category: 'exploration', pointCost: 1000, icon: `${B}/TUR REHBERİ.svg`, rarity: 'rare' },
  { id: 'badge-mucevher', name: 'Mücevher', description: '30 gün boyunca aktif kaldınız!', category: 'engagement', pointCost: 1000, icon: `${B}/MÜCEVHER.svg`, rarity: 'epic' },
  { id: 'badge-mukemmeliyetci', name: 'Mükemmeliyetçi', description: 'Her zaman 5 yıldız verdiniz!', category: 'rating', pointCost: null, icon: `${B}/MÜKEMMELLİYETÇİ.svg`, rarity: 'rare' },
  { id: 'badge-efsane', name: 'Efsane', description: 'Platformun efsanevi kullanıcısı oldunuz!', category: 'special', pointCost: null, icon: `${B}/EFSANE.svg`, rarity: 'legendary' },
  { id: 'badge-taht-sahibi', name: 'Taht Sahibi', description: 'Liderlik tablosunda zirveye çıktınız!', category: 'engagement', pointCost: 5000, icon: `${B}/TAHT SAHİBİ.svg`, rarity: 'legendary' },
  { id: 'badge-saatli-bomba', name: 'Saatli Bomba', description: 'Son dakikada yetişen geri bildirimler!', category: 'speed', pointCost: 1000, icon: `${B}/SAATLİ BOMBA.svg`, rarity: 'epic' },
  { id: 'badge-firtina', name: 'Fırtına', description: '7 gün üst üste geri bildirim gönderdiniz!', category: 'streak', pointCost: 1000, icon: `${B}/FIRTINA.svg`, rarity: 'epic' },
  { id: 'badge-filozof', name: 'Filozof', description: 'Derin ve düşündürücü yorumlar yazdınız!', category: 'feedback', pointCost: 3000, icon: `${B}/FİLOZOF.svg`, rarity: 'rare' },
  { id: 'badge-nostalji', name: 'Nostalji Rüzgarı', description: 'Eski bir işletmeyi tekrar ziyaret ettiniz!', category: 'engagement', pointCost: 1000, icon: `${B}/NOSTALJİ RÜZGARI.svg`, rarity: 'common' },
  { id: 'badge-ilham-kaynagi', name: 'İlham Kaynağı', description: 'Detaylı ve ilham verici geri bildirimler yazdınız!', category: 'feedback', pointCost: 1000, icon: `${B}/İLHAM KAYNAĞI.svg`, rarity: 'rare' },
  { id: 'badge-hayal-muhendisi', name: 'Hayal Mühendisi', description: 'Yaratıcı önerileriniz gerçeğe dönüştü!', category: 'special', pointCost: null, icon: `${B}/FİLOZOF.svg`, rarity: 'rare' },
  { id: 'badge-katalizor', name: 'Katalizör', description: 'Toplulukta değişime öncülük ettiniz!', category: 'engagement', pointCost: 1000, icon: `${B}/KATALİZÇR.svg`, rarity: 'epic' },
  { id: 'badge-ters-kose', name: 'Ters Köşe', description: 'Beklenmedik bir açıdan yorum yaptınız!', category: 'special', pointCost: null, icon: `${B}/TERS KÖŞE.svg`, rarity: 'rare' },
  { id: 'badge-yanki', name: 'Yankı', description: 'Yorumlarınız başkaları tarafından beğenildi!', category: 'feedback', pointCost: 1500, icon: `${B}/YANKI.svg`, rarity: 'common' },
  { id: 'badge-xray', name: 'X-Ray', description: 'Gizli detayları keşfettiniz!', category: 'special', pointCost: null, icon: `${B}/XRAY.svg`, rarity: 'epic' },
  { id: 'badge-tetikci', name: 'Tetikçi', description: 'Hızlı ve etkili geri bildirimler!', category: 'speed', pointCost: 1000, icon: `${B}/TETİKÇİ.svg`, rarity: 'rare' },
  { id: 'badge-surpriz-kutusu', name: 'Sürpriz Kutusu', description: 'Beklenmedik ödüller kazandınız!', category: 'special', pointCost: null, icon: `${B}/sürpriz kutusu.svg`, rarity: 'rare' },
  { id: 'badge-depresif', name: 'Depresif', description: 'Düşük puanlı geri bildirimler verdiniz!', category: 'general', pointCost: 1000, icon: `${B}/DEPRESİF.svg`, rarity: 'common' },
  { id: 'badge-drama-queen', name: 'Drama Queen', description: 'En dramatik yorumların sahibi!', category: 'general', pointCost: 1000, icon: `${B}/drama queen.svg`, rarity: 'common' },
  { id: 'badge-copy-cv', name: 'Copy CV', description: 'Profilinizi mükemmelleştirdiniz!', category: 'general', pointCost: 1000, icon: `${B}/copy cv.svg`, rarity: 'common' },
  { id: 'badge-havai-fisek', name: 'Havai Fişek', description: 'Kutlama zamanı! Büyük başarı!', category: 'special', pointCost: null, icon: `${B}/havai fişek.svg`, rarity: 'rare' },
  { id: 'badge-filiz', name: 'Filiz', description: 'Yeni başlayan ama büyüyen bir kullanıcı!', category: 'general', pointCost: 1000, icon: `${B}/filiz.svg`, rarity: 'common' },
  { id: 'badge-huysuz', name: 'Huysuz', description: 'Eleştirel ama yapıcı geri bildirimler!', category: 'general', pointCost: 1000, icon: `${B}/huysuz.svg`, rarity: 'common' },
  { id: 'badge-jet', name: 'Jet', description: 'İnanılmaz hızda geri bildirim!', category: 'speed', pointCost: 2000, icon: `${B}/jet.svg`, rarity: 'rare' },
  { id: 'badge-kafein-bagimlisi', name: 'Kafein Bağımlısı', description: 'Kafe kategorisinde uzman oldunuz!', category: 'expertise', pointCost: 1000, icon: `${B}/kafein bağımlısı.svg`, rarity: 'common' },
  { id: 'badge-leyla', name: 'Leyla', description: 'Gece saatlerinde aktif kullanıcı!', category: 'general', pointCost: null, icon: `${B}/leyla.svg`, rarity: 'common' },
  { id: 'badge-gurme', name: 'Gurme', description: 'Yemek kategorisinde uzman oldunuz!', category: 'expertise', pointCost: 1000, icon: `${B}/gurme.svg`, rarity: 'epic' },
  { id: 'badge-muhabbet-kusu', name: 'Muhabbet Kuşu', description: 'Çok konuşkan bir kullanıcısınız!', category: 'engagement', pointCost: 1000, icon: `${B}/muhabbet kuşu.svg`, rarity: 'common' },
  { id: 'badge-behzat-c', name: 'Behzat Ç', description: 'Adaletli ve dürüst geri bildirimler!', category: 'general', pointCost: null, icon: `${B}/behzat ç.svg`, rarity: 'rare' },
  { id: 'badge-joker', name: 'Joker', description: 'Beklenmedik ve eğlenceli yorumlar!', category: 'special', pointCost: null, icon: `${B}/JOKER.svg`, rarity: 'legendary' },
  // Komedi / Dizi-Film karakterleri
  { id: 'badge-barney-stinson', name: 'Barney Stinson', description: 'En küçük anı bile efsanevi bir hikayeye dönüştüren bir anlatıcısın!', category: 'special', pointCost: null, icon: `${B}/BARNEY STİNSON.svg`, rarity: 'legendary' },
  { id: 'badge-chandler', name: 'Chandler Bing', description: 'Tek cümlede herkesi güldüren keskin bir espri ustasısın!', category: 'special', pointCost: null, icon: `${B}/CHANDLER BİİG.svg`, rarity: 'legendary' },
  { id: 'badge-sheldon', name: 'Sheldon Cooper', description: 'Her ayrıntıyı bilimsel bir titizlikle adım adım çözümleyen bir kalemin var!', category: 'special', pointCost: null, icon: `${B}/SHELDON COOPER.svg`, rarity: 'legendary' },
  { id: 'badge-the-office', name: 'The Office', description: 'Yazdıklarına içten duyguları ve sıcak paylaşımları katan bir kalbin var!', category: 'special', pointCost: null, icon: `${B}/THE OFFİCE.svg`, rarity: 'epic' },
  { id: 'badge-this-is-us', name: 'This is Us', description: 'Sıcak ve içten kalbinle insanları birbirine bağlayan yorumlar yazıyorsun!', category: 'special', pointCost: null, icon: `${B}/THİS İS US.svg`, rarity: 'epic' },
  { id: 'badge-rick-morty', name: 'Rick & Morty', description: 'Dahice ve alaycı bakışınla her şeye sıra dışı bir açıdan yaklaşıyorsun!', category: 'special', pointCost: null, icon: `${B}/RİCK AND MORTY.svg`, rarity: 'legendary' },
  // Fantastik / Dram / Gizem
  { id: 'badge-walter-white', name: 'Walter White', description: 'Her durumu stratejiyle planlayıp çözüme kavuşturan hırslı bir zekan var!', category: 'special', pointCost: null, icon: `${B}/WALTER WHİTE.svg`, rarity: 'legendary' },
  { id: 'badge-jon-snow', name: 'Jon Snow', description: 'Artıyı da eksiyi de dürüstçe söyleyen güven veren bir kalemin var!', category: 'special', pointCost: null, icon: `${B}/JON SNOW.svg`, rarity: 'legendary' },
  { id: 'badge-sherlock', name: 'Sherlock Holmes', description: 'En küçük ayrıntıyı bile yakalayan keskin bir gözlem gücün var!', category: 'special', pointCost: null, icon: `${B}/SHERLOCK.svg`, rarity: 'legendary' },
  { id: 'badge-mr-robot', name: 'Mr. Robot', description: 'Her anı bir tanık titizliğiyle sırayla kaydeden düzenli bir kalemin var!', category: 'special', pointCost: null, icon: `${B}/MR ROBOT.svg`, rarity: 'legendary' },
  { id: 'badge-professor', name: 'Profesör', description: 'Her yorumunu ince ince düşünülmüş bir planla kuran stratejik bir zekan var!', category: 'special', pointCost: null, icon: `${B}/PROFESSOR.svg`, rarity: 'legendary' },
  { id: 'badge-the-doctor', name: 'The Doctor', description: 'Meraklı ruhunla keşfe çıkıp her deneyimi dengeli bir gözle değerlendiriyorsun!', category: 'special', pointCost: null, icon: `${B}/THE DOCTOR.svg`, rarity: 'legendary' },
  { id: 'badge-eleven', name: 'Eleven', description: 'Sevdiklerinle geçen anları paylaşan, sıcak ve samimi bir kalemin var!', category: 'special', pointCost: null, icon: `${B}/ELEVEN.svg`, rarity: 'epic' },
  { id: 'badge-wednesday', name: 'Wednesday', description: 'Kalabalığa uymadan kendi bağımsız görüşünü cesurca ortaya koyuyorsun!', category: 'special', pointCost: null, icon: `${B}/WEDNESDAY.svg`, rarity: 'epic' },
  { id: 'badge-dark-jonas', name: 'Dark Jonas', description: 'Olayların ardındaki sebebi merak eden derin ve sorgulayıcı bir zihnin var!', category: 'special', pointCost: null, icon: `${B}/DARK JONAS.svg`, rarity: 'epic' },
  { id: 'badge-dean-winchester', name: 'Dean Winchester', description: 'Samimi bir dostun sıcaklığıyla hem uyaran hem yol gösteren bir kalemin var!', category: 'special', pointCost: null, icon: `${B}/DEAN WİNCHESTER.svg`, rarity: 'epic' },
  { id: 'badge-castiel', name: 'Castiel', description: 'Eksiği de artıyı da adaletle teslim eden dingin bir bakışın var!', category: 'special', pointCost: null, icon: `${B}/CASTİEL.svg`, rarity: 'epic' },
  { id: 'badge-sam-winchester', name: 'Sam Winchester', description: 'Araştırmacı ve mantıklı üslubunla düşünceli, detaylı yorumlar yazıyorsun!', category: 'special', pointCost: null, icon: `${B}/SAM WİNCHESTR.svg`, rarity: 'epic' },
  { id: 'badge-witcher', name: 'Witcher Geralt', description: 'Az ve öz yazıp tam da isabetli bir öneriyle noktayı koyuyorsun!', category: 'special', pointCost: null, icon: `${B}/WİTCHER GERALT.svg`, rarity: 'legendary' },
  // Dram / Suç / Gizem
  { id: 'badge-tokyo', name: 'Tokyo', description: 'Ateşli ve tutkulu üslubunla düşündüğünü cesurca ve doğrudan söylüyorsun!', category: 'special', pointCost: null, icon: `${B}/TOKYO.svg`, rarity: 'epic' },
  { id: 'badge-tommy-shelby', name: 'Tommy Shelby', description: 'Soğukkanlı ve hesaplı üslubunla yorumlara yön veren bir lidersin!', category: 'special', pointCost: null, icon: `${B}/TOMMY SHELBY.svg`, rarity: 'legendary' },
  { id: 'badge-dexter', name: 'Dexter', description: 'Her detayı serinkanlılıkla çözümleyip net bir sonuca bağlıyorsun!', category: 'special', pointCost: null, icon: `${B}/DEXTER.svg`, rarity: 'epic' },
  { id: 'badge-pablo-escobar', name: 'Pablo Escobar', description: 'Özgüvenle net hükmünü koyan, sözü dinlenen bir kalemin var!', category: 'special', pointCost: null, icon: `${B}/PABLO ESCOBAR.svg`, rarity: 'legendary' },
  { id: 'badge-jesse-pinkman', name: 'Jesse Pinkman', description: 'İçten ve samimi kalbinle duygularını gözü kara bir cesaretle paylaşıyorsun!', category: 'special', pointCost: null, icon: `${B}/JESSE PİNKMAN.svg`, rarity: 'epic' },
  { id: 'badge-carrie', name: 'Carrie Mathison', description: 'Detayları birleştirip gerçeğin izini süren güçlü bir sezgin var!', category: 'special', pointCost: null, icon: `${B}/CARRİE MATHİNSON.svg`, rarity: 'epic' },
  { id: 'badge-frank-underwood', name: 'Frank Underwood', description: 'Rakamların ardındaki inceliği sezen stratejik bir zekan var!', category: 'special', pointCost: null, icon: `${B}/FRANK UNDERWOOD.svg`, rarity: 'legendary' },
  { id: 'badge-hannibal', name: 'Hannibal', description: 'Zarif bir dille yazıp en keskin gözlemi ustaca saklıyorsun!', category: 'special', pointCost: null, icon: `${B}/HANNİBAL.svg`, rarity: 'legendary' },
  { id: 'badge-house-md', name: 'House MD', description: 'Dobra ve zeki üslubunla gerçeği tam isabetle teşhis ediyorsun!', category: 'special', pointCost: null, icon: `${B}/HOUSE MD.svg`, rarity: 'legendary' },
  { id: 'badge-joe', name: 'Joe', description: 'Kimsenin fark etmediği küçük detayları tek tek yakalayan keskin bir gözün var!', category: 'special', pointCost: null, icon: `${B}/JOE.svg`, rarity: 'epic' },
  { id: 'badge-villanelle', name: 'Villanelle', description: 'Sıradanlığın uzağında, okuyanı şaşırtan çarpıcı ve özgün bir üslubun var!', category: 'special', pointCost: null, icon: `${B}/VİLLANEVİLLE.svg`, rarity: 'epic' },
  // Tarih
  { id: 'badge-ragnar', name: 'Ragnar Lothbrok', description: 'Cesur ve keşifçi ruhunla iddialı, lider bir kalemin var!', category: 'special', pointCost: null, icon: `${B}/RAGNAR LOTHBROK.svg`, rarity: 'legendary' },
  { id: 'badge-spartacus', name: 'Spartacus', description: 'Onurlu ve kararlı duruşunla adalet için sözünü esirgemiyorsun!', category: 'special', pointCost: null, icon: `${B}/SPARTACUS.svg`, rarity: 'legendary' },
  { id: 'badge-rome-julius', name: 'Julius Caesar', description: 'Vizyoner ve kararlı bakışınla güçlü, otoriter yorumlar yazıyorsun!', category: 'special', pointCost: null, icon: `${B}/ROME JULİUS.svg`, rarity: 'legendary' },
  { id: 'badge-elizabeth', name: 'Elizabeth', description: 'Ciddi ve sorumlu duruşunla düzenli, istikrarlı yorumlar yazıyorsun!', category: 'special', pointCost: null, icon: `${B}/ELİZABETH.svg`, rarity: 'epic' },
  { id: 'badge-tyrion', name: 'Tyrion Lannister', description: 'İnce mizahın ve hazırcevaplığınla kelimelerin gücünü ustaca kullanıyorsun!', category: 'special', pointCost: null, icon: `${B}/TYRİON LANNİSTER.svg`, rarity: 'legendary' },
  { id: 'badge-khalesi', name: 'Khaleesi', description: 'Güçlü ve adaletli duruşunla koruyucu, kararlı bir lidersin!', category: 'special', pointCost: null, icon: `${B}/KHALESİ.svg`, rarity: 'legendary' },
  { id: 'badge-michael-scofield', name: 'Michael Scofield', description: 'Her detayı mantık zinciriyle örüp kusursuz planlar kuran bir dehasın!', category: 'special', pointCost: null, icon: `${B}/MİCHAEL SCOLFİELD.svg`, rarity: 'legendary' },
  { id: 'badge-john-locke', name: 'John Locke', description: 'Yeni deneyimlere açık yüreğinle her yere hak ettiği şansı veriyorsun!', category: 'special', pointCost: null, icon: `${B}/JOHN LOCKE.svg`, rarity: 'epic' },
  { id: 'badge-good-omens', name: 'Good Omens', description: 'Zıtlıkları uyumla harmanlayan esprili ve sıcak bir üslubun var!', category: 'special', pointCost: null, icon: `${B}/GOOD OMENS.svg`, rarity: 'epic' },
  { id: 'badge-kelly-yorkie', name: 'Kelly & Yorkie', description: 'Nostaljik ve umutlu kalbinle duygu yüklü, romantik yorumlar yazıyorsun!', category: 'special', pointCost: null, icon: `${B}/KELLY AND YORKİE.svg`, rarity: 'epic' },
  { id: 'badge-martha', name: 'Martha', description: 'Derin ve gizemli bakışınla insanları düşündüren bağlar kuruyorsun!', category: 'special', pointCost: null, icon: `${B}/MARTHA.svg`, rarity: 'epic' },
  // Kullanıcı listesinden eklenen karakterler — kendi tematik rozet görselleri.
  { id: 'badge-daenerys', name: 'Daenerys Targaryen', description: 'Keşfettiğin güzellikleri herkese gösteren ilham verici bir rehbersin!', category: 'special', pointCost: null, icon: `${B}/DAENERYS.svg`, rarity: 'legendary' },
  { id: 'badge-crowley', name: 'Crowley', description: 'Beklenmedik ironin ve oyunbaz zekanla yorumlarına ayrı bir tat katıyorsun!', category: 'special', pointCost: null, icon: `${B}/CROWLEY.svg`, rarity: 'legendary' },
];

export function getBadgePointCostById(badgeId: string): number | null {
  return BADGE_CATALOG.find((b) => b.id === badgeId)?.pointCost ?? null;
}
