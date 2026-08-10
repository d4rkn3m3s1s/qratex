/**
 * STAJYER GÖREV MAİLLERİ — mülakat sonrası yeni stajyerlere gönderilen departman görev
 * maillerinin varsayılan şablonları. AYRI/BAĞIMSIZ modül (mevcut mail sistemine bağlı değil;
 * yalnız fiziksel gönderim için mail-sender + güzel HTML wrapper kullanılır).
 *
 * Bu liste VARSAYILANDIR — admin panelinden düzenlenip Settings'e kaydedilebilir (o zaman
 * DB kaydı bunun yerine geçer). Her şablon tek bir görev/alıcı içindir.
 */
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getPublicAppOrigin } from '@/lib/public-app-origin';

export const INTERN_EMAILS_SETTING_KEY = 'intern_task_emails';
export const INTERN_EMAILS_SETTING_CATEGORY = 'email';

/** Görev son teslim tarihi — maillerde "son teslim" rozeti + cron hatırlatması bunu kullanır. */
export const INTERN_TASK_DEADLINE_LABEL = '14 Ağustos 17.00';

/**
 * Mailde gömülen mutlak URL'ler (özellikle AÇILMA TAKİP PIXEL'i) için güvenilir origin.
 * KRİTİK: pixel URL'si asla `localhost` olmamalı — yoksa mail istemcisi (Gmail vb.) ona
 * ulaşamaz ve açılma HİÇ kaydedilmez. Öncelik: MAIL_PUBLIC_ORIGIN (açık ayar) → normal origin
 * (localhost değilse) → Vercel prod URL → normal origin (son çare). Böylece prod'da her zaman
 * gerçek domain gömülür; lokal testte bile MAIL_PUBLIC_ORIGIN verilirse canlı domaine gider.
 */
export function mailPublicOrigin(): string {
  const clean = (u: string) => u.replace(/\/$/, '');
  const explicit = process.env.MAIL_PUBLIC_ORIGIN?.trim();
  if (explicit) return clean(explicit);

  const base = getPublicAppOrigin();
  const isLocal = /localhost|127\.0\.0\.1|\.local(?::|$|\/)/i.test(base);
  if (!isLocal) return clean(base);

  // Origin localhost görünüyor → Vercel'in sağladığı prod/deployment URL'sine düş.
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${clean(vercelProd)}`;
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${clean(vercelUrl)}`;

  // Hiçbiri yoksa localhost döner — açılma takibi çalışmaz ama mail yine gider (uyarı loglanır).
  console.warn('[intern-mail] mailPublicOrigin localhost döndü; açılma takibi çalışmaz. MAIL_PUBLIC_ORIGIN ayarla.');
  return clean(base);
}

// Şablon türü sabitleri client-safe ayrı dosyada (prisma sızmasın). İçeride kullanmak için
// import ediyoruz; geriye uyum için de re-export ediyoruz.
import { INTERN_EMAIL_KINDS, isInternEmailKind, type InternEmailKind } from '@/lib/intern-email-kinds';
export { INTERN_EMAIL_KINDS, isInternEmailKind, type InternEmailKind };

export interface InternTaskEmail {
  /** Stabil id (düzenleme/silme için). */
  id: string;
  /** Şablon türü (görsel kimlik + bölümler). Yoksa 'task'. */
  kind?: InternEmailKind;
  /** Departman etiketi (gruplama). */
  department: string;
  /** Alıcı adı (metinde hitap). */
  recipientName: string;
  /** Alıcı e-postası. */
  email: string;
  /** Mail konusu. */
  subject: string;
  /** Mail gövdesi (düz metin/markdown; HTML wrapper gönderimde uygulanır). */
  body: string;
  /**
   * Bu görevin son teslim tarihi (serbest metin etiketi, ör. "14 Ağustos 17.00").
   * Yalnız 'task' türünde "son teslim" kartında + hatırlatma cron'unda kullanılır. Boşsa varsayılan.
   */
  deadline?: string;
}

export const DEFAULT_INTERN_TASK_EMAILS: InternTaskEmail[] = [
  // ── HUKUK ──
  {
    id: 'hukuk-zerda',
    department: 'Hukuk',
    recipientName: 'Zerda Cebeci',
    email: 'zerdacebeci@gmail.com',
    subject: 'QRateX — Hukuki Uyum İncelemesi (KVKK / VERBİS / Metin Analizi)',
    body: `Selamlar Zerda Cebeci,

Reverbot bünyesinde geliştirdiğimiz QRateX projesi kapsamında, sistem altyapımızın ve hukuki metinlerimizin güncel regülasyonlara uyumunu denetlemek istiyoruz. Müsaitliğinde aşağıdaki üç ana başlık üzerinden bir inceleme yaparak bize yol gösterebilir misin?

1. Yapay Zeka (AI) Analizi ve KVKK Etkileri
Platformumuzda yer alan her yorum otomatik olarak analiz ediliyor, bu verilerden bir müşteri profili çıkarılıyor ve işletmeye özel öneriler sunuluyor.
• Risk Analizi: Bu işleyişin KVKK kapsamında yarattığı hukuki riskler nelerdir?
• Hassas Veri Senaryosu: Müşterilerin serbest metin (free-text) kutularına istemsizce özel nitelikli kişisel veri (sağlık, din, siyasi görüş vb.) yazması durumunda sorumluluğumuz nedir? Sistemin ve bizim bu duruma karşı nasıl bir teknik/idari aksiyon almamız gerekir?

2. Kayıt ve İdari Yükümlülükler
QRateX'in mevcut operasyonel durumu göz önüne alındığında;
• Bugün itibarıyla yerine getirmemiz gereken herhangi bir kayıt/sicil (ör. VERBİS) yükümlülüğümüz bulunuyor mu?
• Şu an böyle bir zorunluluğumuz yoksa, bu yükümlülük hangi yasal eşiklerde (çalışan sayısı, mali bilanço vb.) doğacaktır?
• Olası bir yükümlülükten muaf olmamız neleri değiştirir ve hangi idari sorumluluklarımız aynen devam eder?

3. Mevcut Hukuki Metinlerin Uyum Açığı Analizi
Sitede yer alan mevcut 4 temel metnin (Aydınlatma Metni, Kullanım Koşulları vb.) okunarak sistemin mevcut işleyişiyle arasındaki uyum açıklarının tespit edilmesini rica ediyoruz. Bu analiz sonucunda en az 8 kalemden oluşan bir açık listesi bekliyoruz.
Raporlamanın takibini kolaylaştırmak adına her maddenin aşağıdaki formatta iletilmesini rica ederiz:
• Eksik/Hatalı Konu:
• İlgili Kanun/Madde:
• Risk Seviyesi: (Yüksek / Orta / Düşük)
• Önerilen Düzeltme Aksiyonu:

Desteğin için şimdiden teşekkürler.
ReverBot Yönetimi`,
  },
  {
    id: 'hukuk-ahmet-kerem',
    department: 'Hukuk',
    recipientName: 'Ahmet Kerem Boyacıgil',
    email: 'akboyacigil@gmail.com',
    subject: 'QRateX — Veri Sorumluluğu Statüsü ve Yurt Dışı Aktarım İncelemesi',
    body: `Selamlar Ahmet Kerem Boyacıgil,

QRateX projemizin hukuki altyapı çalışmaları kapsamında, veri sorumluluğu statümüz ve veri aktarım süreçlerimizle ilgili aşağıdaki iki ana başlıkta inceleme yaparak bizi yönlendirmeni rica ediyoruz.

1. QRateX'in Hukuki Statüsü: Veri Sorumlusu mu, Veri İşleyen mi?
Sistemi kullanan işletme (kafe/restoran vb.) ile QRateX arasındaki ilişkide rol dağılımının KVKK açısından nasıl olması gerektiğini gerekçeleriyle analiz etmeni bekliyoruz. Bu analiz sonucunda aşağıdaki pratik süreçlerin hukuken kimin sorumluluğunda olacağını netleştirmen operasyonumuz için kritik:
• Aydınlatma Yükümlülüğü: İlgili kişilere karşı aydınlatmayı kim yapacak?
• İlgili Kişi Başvuruları: Veri sahibi taleplerini kim karşılayacak ve yönetecek?
• İhlal Bildirimi: Olası bir veri ihlali durumunda Kişisel Verileri Koruma Kurumu'na bildirim yükümlülüğü kimde olacak?

2. Yurt Dışına Veri Aktarımı ve Hukuki Zemin
Platformdaki kullanıcı yorumları analiz süreçleri için ABD'deki sunuculara/servislere aktarılıyor. Güncel regülasyonlar ışığında:
• Hukuki Dayanak: Bugünkü mevzuata göre bu yurt dışı aktarımının hukuki dayanağı ne olmalıdır?
• Gerekli Belgeler: Taraflar arasında (veya Kurum ile) imzalanması gereken zorunlu belgeler/sözleşmeler nelerdir?
• Kurum Yükümlülükleri: Kuruma karşı doğan bildirim veya onay yükümlülüklerimiz nelerdir ve bunların yasal süreleri ne kadardır?
• Ceza ve Yaptırım Riskleri: Bu yükümlülüklerin yerine getirilmemesi durumunda karşı karşıya kalacağımız idari para cezası bantları nelerdir? (Lütfen rakamları ve ilgili kanun maddelerini kaynak göstererek ilet.)

Desteğin için şimdiden teşekkürler.
ReverBot Yönetimi`,
  },

  // ── İŞ GELİŞTİRME ──
  {
    id: 'isgel-batuhan-barutcu',
    department: 'İş Geliştirme',
    recipientName: 'Batuhan Barutçu',
    email: 'batuhanbarutcu40@gmail.com',
    subject: 'QRateX — Pazar Büyüklüğü, Gelir Modeli ve Rakip Analizi',
    body: `Selamlar Batuhan Barutçu,

QRateX projemizin büyüme stratejisi, pazar konumlandırması ve gelir modelini netleştirmek adına İş Geliştirme tarafında kapsamlı bir analiz yapılmasına ihtiyaç duyuyoruz. Müsaitliğinde aşağıdaki üç ana başlık altında detaylı bir çalışma hazırlayarak bizimle paylaşabilir misin?

1. Pazar Büyüklüğü Analizi (TAM – SAM – SOM)
Türkiye kafe ve restoran pazarındaki potansiyelimizi somut verilerle ortaya koymak istiyoruz:
• Pazar Metrikleri: Türkiye genelindeki kafe/restoran pazarı için TAM (Total Addressable Market), SAM (Serviceable Addressable Market) ve SOM (Serviceable Obtainable Market) değerlerinin hesaplanması.
• Kaynak Gösterimi: Rakamların TÜİK, TURYİD veya güvenilir sektör raporlarına dayandırılması ve kaynakların raporda açıkça belirtilmesi.

2. Gelir Modeli, Birim İktisadı (Unit Economics) ve Kurumsal Tier Önerisi
Mevcut fiyatlandırma yapımızın sürdürülebilirliğini ve karlılığını analiz etmemiz gerekiyor:
• Birim İktisadı: Aylık 1.000 TL ödeyen standart bir müşteri üzerinden yıllık ciro projeksiyonu nedir?
• Brüt Marj Hesaplaması: Yapay zeka (AI model/API) ve bulut altyapı maliyetleri düşüldüğünde müşteri başına kalan net brüt marj (%) ne kadardır?
• Zincir / Kurumsal (Enterprise) Paket Önerisi: Çok şubeli zincir işletmelere yönelik üst segment bir paket yapısı önerisi. Bu öneride hedef fiyatlama modeli, kurumsala özel özellik seti (çoklu şube yönetim paneli, gelişmiş AI analitiği, özel roller/yetkilendirmeler vb.) ve stratejik/finansal gerekçe yer almalıdır.

3. Rakip Analizi ve Karşılaştırma Tablosu
Pazardaki doğrudan ve dolaylı rekabetin haritalandırılması:
• Google Yorumlar / Google İşletme Profili en büyük rakip/alternatif olarak konumlandırılarak, pazardaki en az 5 rakibi içeren detaylı bir karşılaştırma tablosunun oluşturulması.
• Karşılaştırma Kriterleri: Fiyatlandırma modelleri, AI analiz derinliği, kullanım kolaylığı, şube yönetimi yetkinlikleri ve rakiplerin güçlü/zayıf yönleri.

Çalışma sonuçlarını birlikte değerlendirmek üzere sabırsızlıkla bekliyoruz. Desteğin için şimdiden teşekkürler!
ReverBot Yönetimi`,
  },
  {
    id: 'isgel-omer',
    department: 'İş Geliştirme',
    recipientName: 'Ömer Erdoğan',
    email: 'omer7erdogan@gmail.com',
    subject: 'QRateX — Odaklı SWOT ve Kampanya Takvimi',
    body: `Selamlar Ömer Erdoğan,

QRateX projesinin pazardaki konumlandırmasını ve zamanlama stratejisini netleştirmek adına, "Biz kimiz, mevcut durumumuz ne ve ne zaman harekete geçmeliyiz?" temel sorusuna yanıt verecek kapsamlı bir çalışmaya ihtiyacımız var. Müsaitliğinde aşağıdaki iki ana çıktıya odaklanan bir rapor hazırlayabilir misin?

1. Durum Tespiti (Odaklı SWOT Analizi)
Klasik bir SWOT analizinden ziyade, doğrudan en kritik noktalara odaklanarak aşağıdaki dört ana başlığı netleştirmeni rica ediyoruz:
• En Güçlü Yanımız (Strength): Bizi pazardaki diğer rakiplerden net bir şekilde ayıran en büyük avantajımız/farkımız nedir?
• En Büyük Eksiğimiz (Weakness): Sistemimizde, operasyonumuzda veya ürünümüzde acilen çözülmesi gereken en zayıf halka nedir?
• En Büyük Fırsat (Opportunity): Pazarda bizi bekleyen, hızlıca domine edebileceğimiz veya büyüme sağlayabileceğimiz en büyük boşluk nerede?
• En Büyük Risk (Threat): İş modelimizi, gelir akışımızı veya sürdürülebilirliğimizi dışarıdan tehdit edebilecek en ciddi risk nedir?

2. Kapsamlı Aksiyon ve Kampanya Takvimi
Yıl içerisindeki pazarlama ve operasyon hamlelerimizi belirleyecek detaylı bir zaman çizelgesi oluşturmanı bekliyoruz. Bu stratejik takvimde eksiksiz olarak yer alması gereken kırılımlar şunlardır:
• Resmi ve Genel Özel Günler: Kampanya ve iletişim fırsatı yaratabilecek ulusal ve dönemsel günler.
• Dönemsel Hareketlilikler: Markamızı doğrudan ilgilendiren ve tüketim alışkanlıklarını etkileyen eğitim/sınav dönemleri, vize/final haftaları ve ara tatiller gibi kritik dönüm noktaları.
• İç Aksiyonlar: Planlanmış büyük duyurumuz, lansman veya ürün güncellemeleri gibi kendi iç etkinliklerimizin genel zaman çizelgesine stratejik bir şekilde entegre edilmesi.

Çıktıları strateji toplantımızda değerlendirmek üzere bekliyoruz. Desteğin için şimdiden teşekkürler!
ReverBot Yönetimi`,
  },
  {
    id: 'isgel-batuhan-erbilgin',
    department: 'İş Geliştirme',
    recipientName: 'Batuhan Erbilgin',
    email: 'batuhanerbilgin0@gmail.com',
    subject: 'QRateX — Detaylı Rakip ve Sektör Dinamikleri Analizi',
    body: `Selamlar Batuhan Erbilgin,

QRateX projesinin pazardaki konumunu sağlamlaştırmak ve "Dışarıda neler oluyor, biz bu rekabet ortamında nasıl öne çıkarız?" sorusunu stratejik olarak yanıtlamak adına senden kapsamlı bir pazar ve rekabet araştırması bekliyoruz. Müsaitliğinde aşağıdaki iki ana başlık etrafında şekillenen bir rapor hazırlayabilir misin?

1. Detaylı Rakip Analizi
Sahadaki mevcut rekabeti haritalandırmak ve stratejik boşlukları tespit etmek adına:
• En Güçlü 3 Rakip: Pazarda karşımızda duran en güçlü 3 rakibin belirlenmesi.
• Karşılaştırmalı Güç Analizi: Bu rakiplerin bizden çok daha iyi yaptığı, pazarda onları öne çıkaran kasları nelerdir?
• Zayıflıklar ve Fırsatlar: Rakiplerin zayıf olduğu, müşteri tarafında şikayet yaratan veya eksik bıraktıkları noktalar nelerdir? Biz bu boşluklardan nasıl faydalanabiliriz?

2. Sektör Dinamikleri ve Rekabet Gücü Analizi
İş modelimizin dayanıklılığını test etmek için aşağıdaki kritik soruların veriler veya sektörel gözlemlerle yanıtlanmasını rica ediyoruz:
• Müşteri Geçişkenliği (Geçiş Maliyeti): Hedef kitlemiz (işletmeler) sistemimizden vazgeçip kolayca başka bir alternatife yönelebilir mi? Bize bağlılıklarını artıracak bariyerler nelerdir?
• Bağımlılık Seviyesi: QRateX olarak dış kaynaklara, platformlara veya belirli altyapılara (API, sunucu vb.) bağımlılığımız ne seviyede?
• İkame Tehdidi: Sunduğumuz hizmetin (analiz ve skorlama) yerini tamamen alabilecek, pazarda halihazırda mevcut daha ucuz veya farklı alternatif çözümler var mı?
• Pazara Giriş Bariyerleri: Sektöre yeni ve güçlü bir oyuncunun (startup veya kurumsal) girip bize doğrudan rakip olması ne kadar kolay?

Bu analizlerin sonuçlarını, ürün ve pazarlama stratejilerimize entegre etmek üzere sabırsızlıkla bekliyoruz. Desteğin için şimdiden teşekkürler!
ReverBot Yönetimi`,
  },

  // ── PAZARLAMA (Satış/Sponsorluk/Pazarlama — 3 alıcı, aynı görev) ──
  {
    id: 'pazarlama-sunum',
    department: 'Pazarlama',
    recipientName: 'Satış, Sponsorluk ve Pazarlama Ekibi',
    email: 'adauluer@gmail.com, shnenes80@gmail.com, ahmetiltekinn@gmail.com',
    subject: 'QRateX — B2B Satış Sunumu Hazırlığı ve Canlı Pitch',
    body: `Değerli Satış, Sponsorluk ve Pazarlama Ekibi Arkadaşımız,

ReverBot ailesi olarak üzerinde büyük bir titizlikle çalıştığımız QRateX projemizin pazardaki başarısı, onu ne kadar iyi anladığımıza ve karşı tarafa ne kadar etkili aktarabildiğimize bağlıdır. Ürünümüzün sahada, potansiyel müşterilere ve sponsorlara en doğru, en vurucu şekilde anlatılması departmanımızın en önemli önceliğidir.

Bu doğrultuda, hem ürün hakimiyetimizi artırmak hem de sunum yeteneklerimizi mükemmelleştirmek amacıyla sizlere kapsamlı bir görev ataması gerçekleştiriyoruz. Bu görevin temel amacı; QRateX'i potansiyel bir kurumsal müşteriye (işletmeye) veya sponsora satıyormuşçasına profesyonel bir sunum hazırlamanız ve bunu bize sunmanızdır.

Görev Adımları ve Beklentiler:
1. Kapsamlı Site Analizi ve Araştırma: QRateX platformunu baştan sona, bir kullanıcının ve bir işletmenin gözünden detaylıca incelemenizi bekliyoruz. Sitenin sunduğu değer önerilerini (value proposition), öne çıkan özelliklerini ve rakiplerden ayrışan yanlarını analiz etmelisiniz.
2. Bilgi Eksiklerini Giderme ve İletişim: Sistemin teknik altyapısı, iş modeli veya aklınıza takılan herhangi bir konu olduğunda mutlaka araştırma yapmalı ve gerektiğinde hiç çekinmeden bizimle irtibata geçmelisiniz.
3. İşletmelere Yönelik (B2B) Sunum Dosyası: Format kurumsal (PowerPoint/Keynote/Canva). Sayfa sınırı: Min 10, Maks 15 slayt. İçerik: QRateX nedir? İşletmelerin hangi acı noktalarını çözer? Sağlayacağı maddi/manevi faydalar? Neden ReverBot ve neden QRateX?
4. Canlı Sunum (Pitching): Hazırladığınız dosyayı, karşınızda satın alacak bir şirket yöneticisi (CEO, Pazarlama Müdürü vb.) varmış gibi sunacaksınız. Süre tam 15 dakika (zaman yönetimi değerlendirme kriteridir). Ardından 5 dakikalık soru-cevap seansı olacaktır.

Zaman Çizelgesi ve Teslimat:
• Sunum Dosyalarının Teslim Tarihi: 14 Ağustos saat 17.00
• Canlı Sunumların Gerçekleştirileceği Tarih: 14 Ağustos saat 22.00
(Kişi bazlı sunum saatleriniz takvimlerinize ayrıca davetiye olarak iletilecektir.)

Amacımız sizi test etmek değil, QRateX'in hikayesini hep birlikte en güçlü şekilde yazmak. Şimdiden araştırmalarınızda ve yaratıcı süreçlerinizde başarılar dileriz.

İyi çalışmalar,
ReverBot Yönetimi`,
  },

  // ── SOSYAL MEDYA ──
  {
    id: 'sosyal-aysu',
    department: 'Sosyal Medya',
    recipientName: 'Aysu Erdem',
    email: 'aysuerdeemm@gmail.com',
    subject: 'QRateX — 2 Haftalık İçerik Planı ve Reels Senaryosu',
    body: `Selamlar Aysu Erdem,

QRateX'in dijital varlığını güçlendirmek ve hedef kitlemizle olan etkileşimimizi artırmak adına, kısa vadeli içerik planlamamız ve üretim süreçlerimiz için senden aşağıdaki başlıklarda bir çalışma rica ediyoruz:

1. 2 Haftalık İçerik Planlaması
• Instagram ve LinkedIn platformları için önümüzdeki 2 haftayı kapsayacak, hedef kitlemize (işletme sahiplerine) hitap eden 10 adet yaratıcı post fikrinin listelenmesi.

2. Uçtan Uca İçerik Üretimi
Belirlediğin 10 fikirden en güçlü gördüğün 3 tanesinin paylaşıma hazır hale getirilmesi. Bu üç içerik için: görsel taslağı (veya tasarımcıya net brief), paylaşım metni (caption), stratejik hashtag kullanımı ve etkili bir aksiyon çağrısı (CTA).

3. Video İçerik (Reels) Senaryosu
• Tema: "İşletme sahibinin kötü yorum korkusu"
• Hedef kitlemizin en büyük acı noktalarından birine dokunan, dikkat çekici ve çözüm olarak QRateX'i işaret eden 30 saniyelik bir Instagram Reels senaryosu yazılması.

Çalışmalarını sabırsızlıkla bekliyoruz. Desteğin için şimdiden teşekkürler!
ReverBot Yönetimi`,
  },
  {
    id: 'sosyal-esin',
    department: 'Sosyal Medya',
    recipientName: 'Esin Kollugil',
    email: 'esin.kollugil@gmail.com',
    subject: 'QRateX — 90 Günlük Büyüme Planı ve Kriz Yönetimi',
    body: `Selamlar Esin Kollugil,

QRateX markasının sosyal medyada sıfırdan inşası, organik büyüme stratejisi ve olası kriz senaryolarına karşı hazırlıklı olmamız adına senden kapsamlı bir strateji ve eylem planı bekliyoruz. Çalışmayı aşağıdaki iki ana başlık altında hazırlayabilir misin?

1. 90 Günlük Büyüme ve Strateji Planı (Sıfır Takipçi)
• Platform Seçimi: Hangi sosyal medya platformlarına odaklanmalıyız ve bunun stratejik gerekçeleri nelerdir?
• Organik Büyüme Taktikleri: "İşletme sahiplerine" reklam bütçesi olmadan, organik yollarla ulaşmak ve dikkatlerini çekmek için hangi yöntemleri kullanacağız?
• Ölçümleme ve Hedefler: Haftalık bazda takip edilecek metrikler (KPI'lar) tablosu ve 90 günün sonundaki büyüme hedeflerimiz.

2. Kriz Yönetimi Senaryosu ve Eylem Planı
• Vaka: QRateX kullanan bir kafe, sistemimizin ilettiği olumsuz bir yorumu görmezden geliyor. Müşteri, sosyal medyada hem kafeyi hem de bizi etiketleyerek sert bir eleştiri paylaşıyor.
• Aksiyon: Bu krizin markamıza sıçramasını engellemek adına uygulayacağımız 3 saatlik acil müdahale planının (adım adım iletişim, verilecek yanıtlar ve yatıştırma stratejisi) yazılması.

Strateji planlarını değerlendirmek üzere bekliyoruz. Desteğin için şimdiden teşekkürler!
ReverBot Yönetimi`,
  },

  // ── DİZAYN VE KULLANICI DENEYİMİ ──
  {
    id: 'dizayn-ceren',
    department: 'Dizayn ve Kullanıcı Deneyimi',
    recipientName: 'Ceren Bindal',
    email: 'cerenbindal@gmail.com',
    subject: 'QRateX — QR Okutma Akışı ve Memnuniyetsiz Müşteri Ekranı Tasarımı',
    body: `Selamlar Ceren Bindal,

QRateX'in son kullanıcı (müşteri) tarafındaki deneyimini pürüzsüz ve keyifli bir hale getirmek adına senden aşağıdaki kısıtlara uygun, hızlı ve etkili bir akış tasarımı bekliyoruz:

1. Ana QR Okutma Akışı Tasarımı
Müşteri QR kodu okuttuğu andan itibaren sürecin aşağıdaki sıkı kurallara göre tasarlanması gerekiyor:
• Hız ve Süre: Tüm değerlendirme işlemi maksimum 20 saniye içinde tamamlanmalı.
• Bariyersiz Deneyim: Üyelik kaydı, giriş yapma adımı veya uzun formlar kesinlikle olmamalı.
• Ergonomi (Tek El Kullanımı): Kullanıcının telefonu tek elle tutarken (hareket halinde bile) rahatça tamamlayabileceği bir arayüz kurgulanmalı.
• Oyunlaştırma Hissi: Ekranlarda kullanıcının sadece bir anket doldurmadığı, puan kazandığı ve ödüllendirildiği hissi görsel ve etkileşimsel olarak net bir şekilde verilmeli.

2. Memnuniyetsiz Müşteri (Kriz) Akışı
• Dinamik Yönlendirme: Puanlama sırasında düşük not veren (memnuniyetsiz) müşteriler için standart akışın anında kırılarak ayrı bir ekrana yönlendirilmesi.
• Kullanıcıyı Kaçırmadan Detay Alma: Zaten kızgın olan müşteriyi uzun sorularla sıkmadan, sorunun kök nedenini toplayabileceğimiz nokta atışı bir geri bildirim ekranı tasarlanması.

Tasarımları ilk fırsatta birlikte üzerinden geçmek üzere bekliyoruz. Desteğin için şimdiden teşekkürler!
ReverBot Yönetimi`,
  },
  {
    id: 'dizayn-doga',
    department: 'Dizayn ve Kullanıcı Deneyimi',
    recipientName: 'Doğa',
    email: 'sueldoga@gmail.com',
    subject: 'QRateX — İşletme Dashboard Tasarımı ve Mini Stil Rehberi',
    body: `Selamlar Doğa,

QRateX'i kullanan işletme sahiplerinin (B2B tarafı) topladığımız veriyi en hızlı şekilde okuyup aksiyon alabilmesi ve markamızın tüm platformlarda görsel tutarlılığa kavuşması için senden aşağıdaki çalışmaları rica ediyoruz:

1. İşletme Sahibi Dashboard (Ana Ekran) Tasarımı
• Kullanıcı Personası: Teknik bilgisi düşük, yoğun çalışan bir işletme sahibi.
• Cihaz Odaklılık: Ekran tasarımı öncelikli olarak mobil (akıllı telefon) görünümüne göre kurgulanmalı.
• 30 Saniye Kuralı: Kullanıcı uygulamayı açtığı anda sadece 30 saniye içinde "Bugün ne oldu?" ve "Ne yapmalıyım?" sorularının net cevabını (karmaşık grafikler yerine aksiyon odaklı veri görselleştirmeleriyle) alabilmeli.

2. Marka Tutarsızlıkları ve Mini Stil Rehberi
• Görsel Denetim: Mevcut QRateX web sitesindeki renk, tipografi, buton yapısı veya logo kullanımı gibi tasarım/marka tutarsızlıklarının tespit edilmesi.
• Çözüm ve Standardizasyon: Tespit edilen açıkların kapatılması ve tüm tasarımlarda (ürün, site, sosyal medya) ekibin aynı görsel dili konuşabilmesi için temel kuralları içeren bir "Mini Stil Rehberi" (UI Kit / Style Guide) hazırlanması.

Çalışmaları ürün toplantımızda değerlendirmek üzere sabırsızlıkla bekliyoruz. Desteğin için şimdiden teşekkürler!
ReverBot Yönetimi`,
  },

  // ── ÜRETİM VE GELİŞTİRME ──
  {
    id: 'gelistirme-cagan',
    department: 'Üretim ve Geliştirme',
    recipientName: 'Çağan Erdal',
    email: 'caganerdl67@gmail.com',
    subject: 'QRateX — Sistem Tasarımı Görevi (100.000+ Geri Bildirim / Dashboard Performansı)',
    body: `Merhaba Çağan Erdal,

Aşağıdaki görevi tamamlayarak bize iletmenizi rica ederiz.

Senaryo
Qratex platformunda bulunan popüler bir restoranın QR kodu sosyal medyada viral oluyor ve kısa sürede aynı restorana ait 100.000'den fazla geri bildirim sisteme ulaşıyor. Bu yoğun trafik nedeniyle yönetim paneli (Dashboard) yavaşlıyor, raporlar geç yükleniyor ve kullanıcı deneyimi olumsuz etkileniyor.

Görev
Bu problemi çözmek için nasıl bir sistem tasarlayacağınızı detaylı şekilde açıklayın. Aşağıdaki başlıklar hakkında fikirlerinizi paylaşabilirsiniz:
• Dashboard performansını artırmak için hangi yöntemleri kullanırsınız?
• Veritabanında hangi optimizasyonları yaparsınız?
• Büyük veri kümelerinde Pagination veya Infinite Scroll kullanır mısınız? Neden?
• Filtreleme ve arama işlemlerini nasıl hızlandırırsınız?
• Hangi alanlara indeks (Index) eklenmelidir?
• Redis veya benzeri Cache sistemlerini nerelerde kullanırsınız?
• Grafik ve istatistikleri her istekte yeniden hesaplamak yerine nasıl optimize edersiniz?
• Aynı anda binlerce kullanıcı veri gönderdiğinde sistemi nasıl ölçeklendirirsiniz?
• Queue sistemlerini (RabbitMQ, Kafka, SQS vb.) hangi işlemlerde kullanırsınız?
• API performansını artırmak için hangi yöntemleri uygularsınız?
• Büyük raporları gerçek zamanlı mı yoksa belirli aralıklarla mı oluşturursunuz? Sebebini açıklayın.
• Dashboard'un ilk açılış süresini nasıl minimuma indirirsiniz?
• Sunucu yükünü azaltmak için hangi mimari değişiklikleri önerirsiniz?

Teslim Şekli: PDF veya Word dokümanı, diyagram/mimari çizim (isteğe bağlı), kod örneği (isteğe bağlı).
Değerlendirme: Problem çözme yaklaşımı, sistem tasarımı, performans odaklı düşünme, ölçeklenebilirlik, yazılım mimarisi bilgisi, açıklamaların kalitesi.

Başarılar dileriz.
ReverBot Yönetimi`,
  },
  {
    id: 'gelistirme-ibrahim',
    department: 'Üretim ve Geliştirme',
    recipientName: 'İbrahim Taylan Taplak',
    email: 'ibrahimtaylantaplak@gmail.com',
    subject: 'QRateX — AI Yorum Analizi ve Dashboard Görevi',
    body: `Merhaba İbrahim Taylan Taplak,

Bu görevde büyük miktardaki müşteri yorumlarının yapay zeka yardımıyla analiz edilmesine yönelik bir çözüm tasarlamanız beklenmektedir.

Senaryo
Qratex platformunda her gün binlerce kullanıcı restoranlar hakkında yorum bırakmaktadır. Restoran yöneticileri tüm yorumları tek tek okumak yerine, sistemin bunları otomatik analiz edip özetlemesini istemektedir.

Görev 1 — Yapay zekanın bu yorumlardan hangi bilgileri çıkarabileceğini açıklayın (duygu analizi, konu analizi, en çok şikayet/beğeni edilen alanlar, yemek kalitesi, servis, temizlik, personel, fiyat algısı, atmosfer, tekrar gelme/tavsiye etme ihtimali). Bunların dışında çıkarılabilecek yeni metrikleri de öneriniz.

Görev 2 — Bir restoran sahibi Dashboard'a giriş yaptığında ilk ekranda hangi bilgileri görmelidir? (Ortalama puan, günlük yorum sayısı, haftalık değişim, pozitif/negatif oranı, AI özeti, trend olan şikayetler, şubeler arası karşılaştırma, en sık geçen kelimeler, kritik uyarılar). Kendi tasarım fikirlerinizi de ekleyebilirsiniz.

Görev 3 — Bir restorana ait 500.000 yorum olduğunu varsayın: Analizleri nasıl hızlandırırsınız? Her istekte yeniden analiz yapar mısınız? Cache/Queue kullanır mısınız? Sonuçları nasıl saklarsınız? Dashboard'u nasıl hızlı tutarsınız?

Bonus — Qratex'i rakiplerinden ayıracak en az 5 yeni özellik öneriniz (AI cevap önerileri, rakip restoran analizi, günlük yönetici özeti, sesli yorum analizi, çok dilli analiz, otomatik aksiyon önerileri, müşteri memnuniyet skoru).

Teslim Şekli: PDF/Word, diyagram (isteğe bağlı), Figma/örnek Dashboard tasarımı (isteğe bağlı).
Değerlendirme: Analitik düşünme, yapay zeka bakış açısı, sistem tasarımı, performans yaklaşımı, ürün geliştirme vizyonu, yaratıcılık.

Başarılar dileriz.
ReverBot Yönetimi`,
  },
  {
    id: 'gelistirme-arda',
    department: 'Üretim ve Geliştirme',
    recipientName: 'Arda Cenker Karagöz',
    email: 'ardacenkerkaragoz@gmail.com',
    subject: 'QRateX — Modern Geri Bildirim Ekranı Tasarım/Geliştirme Görevi',
    body: `Merhaba Arda Cenker Karagöz,

Bu görevde kullanıcı deneyimini ön planda tutarak modern bir geri bildirim ekranı tasarlamanız beklenmektedir.

Senaryo
Müşteri restorandaki QR kodu telefonuyla okuttuktan sonra geri bildirim sayfasına yönlendirilmektedir. Amaç; kullanıcının yalnızca birkaç saniye içinde kolayca değerlendirme yapabilmesini sağlamaktır.

Sayfada Bulunması Gereken Temel Alanlar: Restoran logosu, restoran adı, 1–5 yıldız puanlama, yorum alanı, gönder butonu.

Bunlara Ek Olarak — Kullanıcı deneyimini artıracak geliştirmeleri siz tasarlayın (modern mobil tasarım, responsive yapı, büyük yıldız puanlama, emoji ile hızlı duygu seçimi, hazır geri bildirim etiketleri, karakter sayacı, minimum karakter kontrolü, loading animasyonu, başarılı gönderim ekranı, hata mesajları, Dark Mode, accessibility, hafif animasyonlar, tek elle kullanım, teşekkür ekranı, performans optimizasyonları). Kendi fikirlerinizi de ekleyebilirsiniz.

Teslim Şekli: Figma / Adobe XD / kodlanmış proje (React, Next.js, Vue, Flutter vb.) / PDF ekran tasarımı.

Kısa Açıklama — Ayrıca şu soruları da cevaplayınız: Tasarım kararlarınızı neden bu şekilde aldınız? Mobil kullanıcı deneyimini nasıl iyileştirdiniz? Performans için hangi optimizasyonları yaptınız? Kullanıcıyı daha fazla geri bildirim bırakmaya teşvik edecek hangi özellikleri eklediniz?

Değerlendirme: UI kalitesi, UX yaklaşımı, mobil uyumluluk, tasarım dili, yaratıcılık, kullanılabilirlik, performans düşüncesi.

Başarılar dileriz.
ReverBot Yönetimi`,
  },
];

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS OVERRIDE — admin panelinden düzenlenen şablonlar (yoksa varsayılan liste).
// ════════════════════════════════════════════════════════════════════════════

/** Ham JSON'ı güvenli şablon listesine çevirir (geçersizse varsayılan). */
export function normalizeInternEmails(value: unknown): InternTaskEmail[] {
  if (!Array.isArray(value)) return DEFAULT_INTERN_TASK_EMAILS;
  const out: InternTaskEmail[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null;
    const email = typeof r.email === 'string' ? r.email.trim() : '';
    const subject = typeof r.subject === 'string' ? r.subject.trim() : '';
    const body = typeof r.body === 'string' ? r.body : '';
    if (!id || !email || !subject) continue;
    out.push({
      id,
      kind: isInternEmailKind(r.kind) ? r.kind : 'task',
      department: typeof r.department === 'string' ? r.department : 'Genel',
      recipientName: typeof r.recipientName === 'string' ? r.recipientName : '',
      email, subject, body,
      deadline: typeof r.deadline === 'string' && r.deadline.trim() ? r.deadline.trim().slice(0, 60) : undefined,
    });
  }
  return out.length ? out : DEFAULT_INTERN_TASK_EMAILS;
}

/** Şablon listesini DB'den okur (yoksa varsayılan). */
export async function getInternTaskEmails(): Promise<InternTaskEmail[]> {
  const setting = await prisma.settings
    .findUnique({ where: { key: INTERN_EMAILS_SETTING_KEY }, select: { value: true } })
    .catch(() => null);
  return normalizeInternEmails(setting?.value);
}

/** Şablon listesini DB'ye kaydeder (admin düzenlemesi). */
export async function saveInternTaskEmails(list: InternTaskEmail[]): Promise<void> {
  await prisma.settings.upsert({
    where: { key: INTERN_EMAILS_SETTING_KEY },
    update: { value: list as unknown as Prisma.InputJsonValue, category: INTERN_EMAILS_SETTING_CATEGORY },
    create: { key: INTERN_EMAILS_SETTING_KEY, value: list as unknown as Prisma.InputJsonValue, category: INTERN_EMAILS_SETTING_CATEGORY },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ÇOK GÜZEL ÖZEL HTML RENDER — kendi kurumsal tasarımı: koyu gradient hero + GÖMÜLÜ
// beyaz logo (domain gerekmez) + departman renkli rozet + şık gövde + son teslim kartı.
// ════════════════════════════════════════════════════════════════════════════


/** Departman → { emoji, renk } — mailde görsel kimlik (her departmanın kendi rengi). */
function departmentTheme(dept: string): { emoji: string; color: string; soft: string } {
  const d = dept.toLowerCase();
  if (d.includes('hukuk')) return { emoji: '⚖️', color: '#0ea5e9', soft: '#0ea5e91a' };
  if (d.includes('iş gel') || d.includes('is gel')) return { emoji: '📊', color: '#10b981', soft: '#10b9811a' };
  if (d.includes('pazarlama')) return { emoji: '🎯', color: '#f43f5e', soft: '#f43f5e1a' };
  if (d.includes('sosyal')) return { emoji: '📱', color: '#8b5cf6', soft: '#8b5cf61a' };
  if (d.includes('dizayn') || d.includes('deneyim')) return { emoji: '🎨', color: '#ec4899', soft: '#ec48991a' };
  if (d.includes('üretim') || d.includes('gelişt')) return { emoji: '⚙️', color: '#f59e0b', soft: '#f59e0b1a' };
  return { emoji: '✨', color: '#9333ea', soft: '#9333ea1a' };
}

/** HTML-escape (XSS koruması). */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Görev gövdesini ŞIK HTML'e çevirir: "1. Başlık" / "N." ile başlayan satırlar numaralı
 * bölüm başlığı olur; "•" madde işaretli satırlar şık liste olur; diğerleri paragraf.
 */
function prettyBody(body: string, color: string): string {
  const blocks = body.split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    // Numaralı ana başlık (ör. "1. Pazar Analizi") — ilk satır ise vurgulu bölüm.
    const firstNumbered = /^\s*\d+\.\s/.test(lines[0]);
    const rows: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bullet = /^\s*[•\-]\s+/.test(line);
      const numHead = i === 0 && firstNumbered;
      if (numHead) {
        rows.push(`<p style="margin:22px 0 8px;font-size:16px;font-weight:800;color:#0f172a;">${escHtml(line.trim())}</p>`);
      } else if (bullet) {
        const txt = line.replace(/^\s*[•\-]\s+/, '');
        rows.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px;"><tr>
          <td style="vertical-align:top;padding:2px 10px 0 2px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};"></span></td>
          <td style="font-size:14.5px;line-height:1.65;color:#475569;">${escHtml(txt)}</td></tr></table>`);
      } else {
        rows.push(`<p style="margin:0 0 12px;font-size:14.5px;line-height:1.7;color:#475569;">${escHtml(line)}</p>`);
      }
    }
    out.push(rows.join(''));
  }
  return out.join('');
}

const EMAIL_HEAD = `<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>QRateX</title>
<!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
</head>`;

/**
 * Bir stajyer görev maili için ÇOK GÜZEL, modern, kurumsal HTML üretir.
 * - Koyu gradient hero + GÖMÜLÜ beyaz logo (domain gerekmez, asla kırılmaz).
 * - Departman renkli rozet + karşılama.
 * - Şık gövde (numaralı başlıklar + renkli madde işaretleri).
 * - Dikkat çekici son teslim kartı.
 * - trackToken verilirse görünmez açılma pixel'i.
 */
export function renderInternTaskEmailHtml(tpl: InternTaskEmail, trackToken?: string): { html: string; text: string } {
  const origin = mailPublicOrigin();
  const kind: InternEmailKind = tpl.kind ?? 'task';
  const theme = departmentTheme(tpl.department);
  const greetName = tpl.recipientName ? escHtml(tpl.recipientName) : 'Merhaba';
  // Bu şablonun kendi son teslim tarihi (yoksa genel varsayılan).
  const deadline = tpl.deadline && tpl.deadline.trim() ? tpl.deadline.trim() : INTERN_TASK_DEADLINE_LABEL;

  // Tür-özel görsel/metin. accent = hero şerit + vurgu rengi.
  const K = ((): { emoji: string; accent: string; badge: string | null; titleSuffix: string; sub: string; sign: string } => {
    switch (kind) {
      case 'general':
        return { emoji: '✉️', accent: theme.color, badge: null, titleSuffix: '', sub: '', sign: 'ReverBot & QRateX Ekibi' };
      case 'welcome':
        return { emoji: '🎉', accent: '#8b5cf6', badge: 'QRATEX EKİBİ', titleSuffix: ', aramıza hoş geldin!', sub: 'Seni ekibimizde görmekten mutluluk duyuyoruz.', sign: 'ReverBot & QRateX Ekibi' };
      case 'reminder':
        return { emoji: '🔔', accent: '#f59e0b', badge: 'HATIRLATMA', titleSuffix: '', sub: '', sign: 'ReverBot & QRateX Ekibi' };
      case 'minimal':
        return { emoji: '', accent: theme.color, badge: null, titleSuffix: '', sub: '', sign: 'QRateX' };
      case 'task':
      default:
        return { emoji: theme.emoji, accent: theme.color, badge: `${escHtml(tpl.department.toUpperCase())} DEPARTMANI`, titleSuffix: tpl.recipientName ? ', görevin hazır!' : '', sub: 'QRateX ekibine katılım sürecinin bir parçası olarak sana özel bir görev.', sign: 'ReverBot & QRateX Ekibi' };
    }
  })();
  const showDeadline = kind === 'task';
  const preheader = kind === 'task'
    ? `QRateX ekibinden görev ataması — son teslim ${escHtml(deadline)}.`
    : `QRateX — ${escHtml(tpl.subject || 'mesaj')}`;

  const pixel = trackToken
    ? `<img src="${origin}/api/track/email-open/${encodeURIComponent(trackToken)}" width="1" height="1" alt="" border="0" style="width:1px;height:1px;max-height:1px;max-width:1px;border:0;margin:0;padding:0;" />`
    : '';

  const html = `<!DOCTYPE html>
<html lang="tr">
${EMAIL_HEAD}
<body style="margin:0;padding:0;background:#eef2f7;-webkit-font-smoothing:antialiased;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.12);">

        <!-- HERO: koyu gradient + logo (HTTPS URL — Gmail data: URI'yi engeller) + parıltı şeridi -->
        <tr><td style="background:#0b0618;background:linear-gradient(135deg,#1a0a2e 0%,#0f0f1e 55%,#16213e 100%);padding:40px 40px 32px;text-align:center;">
          <img src="${origin}/logo/font-white.png" width="180" alt="QRateX" style="display:block;margin:0 auto ${K.badge ? '20px' : '0'};width:180px;max-width:60%;height:auto;border:0;" />
          ${K.badge ? `<div style="display:inline-block;padding:8px 18px;border-radius:999px;background:${K.accent}1a;border:1px solid ${K.accent}55;">
            <span style="font-size:13px;font-weight:800;letter-spacing:0.6px;color:${K.accent};">${K.emoji ? K.emoji + '&nbsp;&nbsp;' : ''}${K.badge}</span>
          </div>` : ''}
        </td></tr>
        <!-- Işıltı çizgisi -->
        <tr><td style="height:4px;background:linear-gradient(90deg,${K.accent},#e879f9,${K.accent});"></td></tr>

        <!-- GÖVDE -->
        <tr><td style="padding:36px 40px 8px;">
          <h1 style="margin:0 0 ${K.sub ? '4px' : '18px'};font-size:24px;line-height:1.25;font-weight:800;color:#0f172a;">
            ${K.emoji ? K.emoji + ' ' : ''}${greetName}${K.titleSuffix}
          </h1>
          ${K.sub ? `<p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">${escHtml(K.sub)}</p>` : ''}
          ${prettyBody(tpl.body, K.accent)}
        </td></tr>

        ${showDeadline ? `<!-- SON TESLİM kartı (dikkat çekici) -->
        <tr><td style="padding:8px 40px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1.5px solid #f59e0b66;border-radius:16px;padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="52" style="vertical-align:middle;"><div style="width:44px;height:44px;border-radius:12px;background:#f59e0b;text-align:center;line-height:44px;font-size:22px;">⏳</div></td>
                <td style="vertical-align:middle;padding-left:8px;">
                  <div style="font-size:11px;font-weight:800;letter-spacing:1.2px;color:#b45309;text-transform:uppercase;">Son Teslim Tarihi</div>
                  <div style="font-size:20px;font-weight:900;color:#78350f;margin-top:1px;">${escHtml(deadline)}</div>
                  <div style="font-size:13px;color:#92400e;margin-top:2px;">Görev sonucunu bu tarih ve saate kadar iletmeni bekliyoruz.</div>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>` : ''}

        <!-- İMZA -->
        <tr><td style="padding:24px 40px 32px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:18px;">
            ${kind === 'task' ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#94a3b8;">
              Bu görev, QRateX ekibine katılım sürecinin bir parçasıdır. Soruların için bize her zaman ulaşabilirsin. 🚀
            </p>` : ''}
            <p style="margin:0;font-size:14px;font-weight:800;color:#7c3aed;">${escHtml(K.sign)}</p>
          </div>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#0f0f1e;padding:22px 40px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#64748b;letter-spacing:0.3px;">QRateX · Yapay Zeka Destekli QR Geri Bildirim Platformu</p>
          <p style="margin:6px 0 0;font-size:11px;color:#475569;">Bu otomatik bir bildirimdir, lütfen yanıtlamayın.</p>
        </td></tr>

      </table>
      ${pixel}
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    ...(kind === 'task' ? [`${tpl.department} Departmanı`, ''] : []),
    tpl.body,
    '',
    ...(showDeadline ? [`⏳ Son teslim: ${deadline}`, ''] : []),
    K.sign,
  ];
  const text = textLines.join('\n');
  return { html, text };
}

/**
 * Basit ama ŞIK markalı e-posta (cron hatırlatmaları için) — GÖMÜLÜ beyaz logolu koyu hero +
 * beyaz kart gövdesi + opsiyonel CTA. Domain gerekmez (logo base64). renderInternTaskEmailHtml
 * ile aynı görsel dil, ama serbest içerik.
 */
export function renderSimpleBrandedEmail(input: {
  heading: string;
  bodyHtml: string;
  cta?: { href: string; label: string };
  accent?: string;
}): string {
  const accent = input.accent || '#9333ea';
  const origin = mailPublicOrigin();
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px;"><tr><td style="border-radius:12px;background:linear-gradient(135deg,${accent},#e879f9);">
        <a href="${input.cta.href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">${input.cta.label}</a>
       </td></tr></table>`
    : '';
  return `<!DOCTYPE html><html lang="tr">${EMAIL_HEAD}
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.12);">
      <tr><td style="background:linear-gradient(135deg,#1a0a2e,#0f0f1e 55%,#16213e);padding:36px 40px 28px;text-align:center;">
        <img src="${origin}/logo/font-white.png" width="170" alt="QRateX" style="display:block;margin:0 auto;width:170px;max-width:60%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,${accent},#e879f9,${accent});"></td></tr>
      <tr><td style="padding:34px 40px 30px;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:800;color:#0f172a;">${escHtml(input.heading)}</h1>
        ${input.bodyHtml}
        ${cta}
      </td></tr>
      <tr><td style="background:#0f0f1e;padding:20px 40px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#64748b;">QRateX · Yapay Zeka Destekli QR Geri Bildirim Platformu</p>
        <p style="margin:6px 0 0;font-size:11px;color:#475569;">Bu otomatik bir bildirimdir, lütfen yanıtlamayın.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Türkçe ay adları → ay numarası (1-12). Serbest-metin deadline'ı çözmek için. */
const TR_MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};

/**
 * Serbest-metin deadline etiketini ({gün} {ay adı}, ör. "14 Ağustos 17.00") bugünün TR
 * tarihiyle karşılaştırır. Cron her gün çalışıp bugüne denk gelen görevleri bulmak için kullanır.
 *
 * ÖNEMLİ: BOŞ/tanımsız deadline → false döner (varsayılana DÜŞMEZ). Yani deadline'ı olmayan
 * şablon için cron hatırlatması gönderilmez — 13 varsayılan şablonun hepsi 14 Ağustos'ta
 * beklenmedik toplu mail atmasın diye. (Varsayılan etiket yalnızca mailde GÖRSEL gösterim içindir.)
 *
 * Parse: önce "{gün} {ay adı}" (ör. "14 Ağustos") denenir; bulunursa SONUÇ ONA göre döner ve
 * sayısal biçim DENENMEZ — böylece metindeki SAAT kısmı ("...17.08") yanlışlıkla tarih sanılmaz.
 * Ay adı yoksa "{gün}.{ay}" / "{gün}/{ay}" sayısal biçimi denenir.
 */
export function deadlineIsToday(deadline: string | undefined, today: { day: number; month: number }): boolean {
  if (!deadline || !deadline.trim()) return false; // boş → hatırlatma yok
  const raw = deadline.toLowerCase();

  // 1) "14 ağustos ..." — gün + TR ay adı. Ay adı bulunursa SADECE bunu esas al (erken karar).
  const nameMatch = raw.match(/(\d{1,2})\s*([a-zçğıöşü]+)/i);
  if (nameMatch) {
    const month = TR_MONTHS[nameMatch[2]];
    if (month) {
      const day = parseInt(nameMatch[1], 10);
      return day === today.day && month === today.month; // saat kısmına BAKMA
    }
  }

  // 2) Ay adı yoktu → "14.08" / "14/08" sayısal biçim. (ay 1-12 olmalı.)
  const numMatch = raw.match(/\b(\d{1,2})[.\/](\d{1,2})\b/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10);
    if (month >= 1 && month <= 12) return day === today.day && month === today.month;
  }
  return false;
}
