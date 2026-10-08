# /experience/[token]

**Amaç:** Bir müşterinin `/customer/experiences` ekranında ürettiği, 7 gün geçerli, herkese açık "anonim deneyim kartı" bağlantısının vardığı sayfa. Bağlantıyı açan kişi (genellikle henüz Qratex kullanıcısı olmayan bir arkadaş) işletme adını, kısa notu, ruh hali rozetini ve görüntülenme sayısını görür. Ürün açısından bu sayfa bir **büyüme / arkadaş daveti (viral döngü)** giriş kapısıdır: "arkadaşım burada güzel vakit geçirmiş → ben de gideyim / ben de katılayım".

Dosyalar: `app/(public)/experience/[token]/page.tsx` (93 satır, tamamı istemci bileşeni), `app/(public)/layout.tsx`, `app/(public)/loading.tsx`, `app/api/public/experience-share/[token]/route.ts` (okuma + sayaç artırma), `app/api/customer/experience-share/route.ts` (bağlantı üretimi), `app/customer/experiences/page.tsx` (üretici ekran), `prisma/schema.prisma:2768-2784` (`ExperienceShareToken`), `lib/app-locale.tsx`, `messages/tr.json:1674-1678` / `messages/en.json:1674-1678`, `app/layout.tsx` (kök metadata), `app/robots.ts`, `proxy.ts`, `components/landing/LandingBackground.tsx`.

**Genel puan: 3.3/10** · **Karar: yeniden tasarla** (kavram doğru ve değerli — anonim, kişisel veri sızdırmayan, işletmeye trafik getiren paylaşım kartı — ama bugünkü hali bir iskelet: içerik üretici tarafta sabit kodlu, paylaşım bağlantısının asıl işi olan önizleme kartı (OG) yok, ziyaretçiyi hiçbir yere yönlendiren tek bir aksiyon yok ve marka adına keyfi metin yayınlatılabiliyor)

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Token okunuyor, süre kontrolü ve sayaç çalışıyor; fakat not ve ruh hali üretici tarafta sabit kodlu olduğundan sayfa her paylaşımda aynı içeriği gösteriyor, hiçbir CTA yok, ham JSON ayrıştırma hatası kullanıcıya sızabiliyor. |
| UX | 2/10 | Ziyaretçi için "sonra ne yapmalıyım?" sorusunun cevabı yok (işletmeye git, yol tarifi, kayıt ol, davet kodu); başlık "Bu hafta şunu denedik" diyor ama "şu" hiçbir yerde yok; hata durumunda çıkış yolu yok. |
| Görsel | 3/10 | Tek bir shadcn kartı + ikon; Duolingo/Wrapped tarzı paylaşılabilir kart estetiği, işletme görseli, puan/yıldız, kategori rengi yok; aynı gizlilik mesajı iki kez tekrarlanıyor. |
| Mimari | 4/10 | Sorumluluk ayrımı basit ve okunur; ama paylaşım sayfası istemcide veri çekiyor (metadata üretilemiyor), GET isteği yan etkili (sayaç), API'de try/catch yok, oran sınırı yok, üretimde ziyaret doğrulaması yok, süresi dolmuş satırlar hiç temizlenmiyor. |
| Performans | 5/10 | Sayfa küçük; ancak HTML → JS → API şeklinde ardışık bir round-trip var ve bu kadar basit bir kart için tüm public layout (hareketli arka plan + `/api/settings/background` isteği) yükleniyor. |
| Erişilebilirlik + Mobil | 5/10 | `max-w-lg px-4` ile mobil yerleşim düzgün, `h1` var; ancak yükleniyor/hata durumları `aria-live`/`role` ile duyurulmuyor, başlık hiyerarşisi h1→h3 atlıyor, 10'dan fazla metin sabit Türkçe (EN dilde karışık arayüz). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | URL'den `token` okuma (`useParams`) | ÇALIŞIYOR | `page.tsx:20-21` | |
| 2 | Boş token → "Geçersiz link" | KISMİ | `page.tsx:26-29` | Dinamik segmentte token pratikte hiç boş gelmez (ölüye yakın dal); metin sabit Türkçe, `t()` kullanılmıyor. |
| 3 | Veri çekme (`fetch … cache:'no-store'`) | ÇALIŞIYOR | `page.tsx:33` | İstemci tarafı; SSR/metadata imkânı kaybediliyor (Bulgu 2). |
| 4 | Unmount iptal bayrağı | KISMİ | `page.tsx:30`, `41-43` | Yalnızca `setState`'i engeller; `AbortController` yok → istek yine gider ve sayaç yine artar (dev StrictMode'da çift artış). |
| 5 | Yanıt ayrıştırma + hata mesajı | BOZUK | `page.tsx:34-38`, `api/public/experience-share/[token]/route.ts:14-29` | API'de try/catch yok; Prisma/Neon hatasında gövdesiz/HTML 500 döner → `res.json()` `SyntaxError` fırlatır ve kullanıcıya "Unexpected end of JSON input" gibi ham teknik mesaj gösterilir (Bulgu 4). |
| 6 | Hata durumu ekranı | KISMİ | `page.tsx:46-52` | Sadece metin; CTA (ana sayfa, kayıt ol, işletmeyi keşfet) yok, `role="alert"` yok. |
| 7 | Yükleniyor durumu | KISMİ | `page.tsx:54-60`, `app/(public)/loading.tsx:14-95` | Sabit Türkçe "Yükleniyor…", `aria-live` yok; segment `loading.tsx` tam ekran markalı yükleyici ile sayfanın kendi düz yükleyicisi ardışık iki farklı görsel üretir (zamanlama tarayıcıda doğrulanmadı). Skeleton yok → içerik geldiğinde yerleşim sıçrar. |
| 8 | Başlık "Bu hafta şunu denedik" | SAHTE | `page.tsx:68` | Sabit metin; "şunu" ile işaret edilen bir ürün/deneyim verisi modelde yok (`schema.prisma:2768-2784`). Dil sabit Türkçe. |
| 9 | Gizlilik uyarısı (API'den `disclaimer`) | KISMİ | `page.tsx:69`, `route.ts:36-37` | Sunucuda sabit Türkçe metin; dil algısız. Kart açıklamasıyla aynı mesaj (bkz. #11). |
| 10 | İşletme adı (kart başlığı) | ÇALIŞIYOR | `page.tsx:74`, `route.ts:17`, `32` | `businessName` yoksa bayi kullanıcısının kişisel `name`'ine düşer — "kişisel veri sızdırmadan" iddiasıyla hafif çelişki. |
| 11 | "Anonim deneyim kartı — kişisel bilgi paylaşılmaz." açıklaması | KISMİ | `page.tsx:75` | #9 ile aynı içerik, ekranda iki kez; sabit Türkçe. |
| 12 | Ruh hali rozeti (great/good/ok) | SAHTE | `page.tsx:62`, `79`; `app/customer/experiences/page.tsx:92` | Üretici her zaman `mood:'good'` gönderiyor; `great`/`ok` dalları UI'den ulaşılamaz. Bilinmeyen değerler sessizce "Güzel"e düşer. Tek çevrilen metin bu. |
| 13 | Görüntülenme sayacı ("N görüntüleme") | KISMİ | `page.tsx:80`, `route.ts:25-29` | Her GET'te atomik `increment` (yarış güvenli) ama tekilleştirme yok: yenileme, paylaşanın kendi açışı, bot/script hepsi sayılır; oran sınırı yok. Değer başka hiçbir yerde okunmuyor (paylaşan ve işletme göremiyor). |
| 14 | Kısa not (caption) | SAHTE | `page.tsx:82-83`; `app/customer/experiences/page.tsx:91` | Üretici ekran her zaman sabit "Bu hafta buradaydık — gelirsen şunu dene." gönderiyor; kullanıcı not yazamıyor. |
| 15 | Not yoksa yedek metin | KISMİ | `page.tsx:84-87` | UI'den ulaşılamaz (not her zaman dolu); yalnız doğrudan API çağrısında görünür. Metin "davet linki" diyor ama davet işlevi yok. |
| 16 | 7 günlük süre kontrolü | ÇALIŞIYOR | `route.ts:21`; `api/customer/experience-share/route.ts:41` | |
| 17 | "Süresi dolmuş" ile "geçersiz" ayrımı | EKSİK | `route.ts:21-23` | Tek 404 ve tek mesaj; süresi dolmuş kartta "işletme hâlâ burada, keşfet" gibi kurtarma akışı yok. |
| 18 | Kişisel veri koruması (yaratıcı kimliği gizli) | ÇALIŞIYOR | `route.ts:16-18`, `31-38` | `creatorId` yanıtta yok. |
| 19 | Token entropisi | ÇALIŞIYOR | `api/customer/experience-share/route.ts:40` | 18 bayt `randomBytes`, base64url — tahmin edilemez. |
| 20 | i18n (TR/EN) | BOZUK | `page.tsx:27`, `38`, `57`, `68`, `75`, `80`, `86`; `route.ts:22`, `32`, `37` | Yalnız 3 ruh hali etiketi çevriliyor; EN arayüzde "Good" rozeti Türkçe başlık ve metinlerin ortasında kalır. |
| 21 | Sayfa metadata / sosyal önizleme (OG kartı) | EKSİK | `page.tsx:1` (`'use client'`), `app/layout.tsx:47-70` | Sayfa istemci bileşeni olduğu için `generateMetadata` yok; WhatsApp/Instagram/iMessage önizlemesi sitenin genel başlığını gösterir. Kök `alternates.canonical: '/'` miras alındığı için bu sayfanın canonical'ı ana sayfa (Bulgu 2). |
| 22 | Arama motoru dışında tutma (noindex) | EKSİK | `app/robots.ts:20-23` | `/experience/` disallow listesinde değil, sayfada `robots` meta yok; geçici, kullanıcı üretimli içerik dizinlenebilir. |
| 23 | Ziyaretçi CTA'sı (işletmeye git / yol tarifi / menü / kayıt ol) | EKSİK | `page.tsx:64-92` | Sayfada tek bir bağlantı veya buton yok. |
| 24 | Paylaşanın davet (referral) kodu ile kayıt | EKSİK | `page.tsx` tamamı; `app/customer/referral/page.tsx:123`, `app/(auth)/auth/register/page.tsx:60` | Referral altyapısı (`/auth/register?ref=`) mevcut ama bu kart onu taşımıyor. |
| 25 | Paylaşana ödül / bildirim (oyunlaştırma döngüsü) | EKSİK | `route.ts:25-29` | Görüntülenme ya da dönüşüm paylaşanı hiçbir şekilde ödüllendirmiyor veya bilgilendirmiyor. |
| 26 | Üretimde ziyaret doğrulaması | EKSİK | `api/customer/experience-share/route.ts:29-38` | Yalnızca hedefin `DEALER` olduğu kontrol ediliyor; müşterinin o işletmede tek bir ziyareti olması gerekmiyor (`lib/customer-dealer-experiences.ts:67` `countVisitsAtDealer` mevcut ama kullanılmıyor). |
| 27 | Üretimde oran sınırı / içerik denetimi | EKSİK | `api/customer/experience-share/route.ts:17-52` | Sınırsız sayıda kart, 200 karaktere kadar serbest not (Bulgu 1). |
| 28 | Okuma ucunda oran sınırı | EKSİK | `route.ts:8-29`; `proxy.ts:105-118` | Proxy API'de yalnız güvenlik/CORS başlıkları ekliyor. |
| 29 | Paylaşımı geri alma / silme | EKSİK | Uç yok (yalnız POST ve public GET mevcut) | Paylaşan kişi bağlantıyı iptal edemiyor; işletme kendi adına açılmış kartları göremiyor/itiraz edemiyor. |
| 30 | Süresi dolmuş kayıt temizliği | EKSİK | `app/api/cron/db-cleanup` (grep: `experienceShareToken` yalnız 2 route'ta geçiyor) | Satırlar sonsuza kadar birikir (düşük önem). |
| 31 | Modül kapatma (`experiences`) uygulanması | EKSİK | `lib/module-controls.ts:30`; iki API route'unda modül kontrolü yok | Admin modülü kapatsa da eski bağlantılar ve doğrudan API çalışmaya devam eder. |
| 32 | Public layout (Header, Footer, hareketli arka plan, çerez bandı, "İçeriğe atla") | ÇALIŞIYOR | `app/(public)/layout.tsx:13-32` | Arka plan reduced-motion'a uyuyor (`LandingBackground.tsx:49-55`). Ancak bu bir paylaşım kartı için ağır bir kabuk (pazarlama header'ı odaktan uzaklaştırır). |
| 33 | Hata sınırı | ÇALIŞIYOR | `app/error.tsx` | Segment özel `error.tsx` yok; kök sınır devreye girer. |
| 34 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:48`, `56`, `65` | Tek sütun, `px-4`, taşma yok. |
| 35 | Başlık hiyerarşisi | KISMİ | `page.tsx:68` (h1), `components/ui/card.tsx:44` (CardTitle = h3) | h2 atlanıyor. |
| 36 | Durum duyuruları (ekran okuyucu) | EKSİK | `page.tsx:47-59` | `role="status"` / `role="alert"` / `aria-live` yok. |
| 37 | Mikro-etkileşim / giriş animasyonu | EKSİK | `page.tsx` (framer-motion importu yok) | Kart statik belirir; "açılış" anı yok. Reduced-motion açısından risk de yok. |
| 38 | Analitik (kart açıldı → CTA → kayıt dönüşümü) | EKSİK | `page.tsx` tamamı | Viral döngünün hiçbir adımı ölçülmüyor. |

**Durum dağılımı:** ÇALIŞIYOR 11 · KISMİ 11 · BOZUK 2 · SAHTE 3 · EKSİK 11 (toplam 38)

---

## Bulgular

### 1. [YÜKSEK · Güvenlik/Marka] Herhangi bir müşteri, herhangi bir işletme adına Qratex alan adında keyfi metin yayınlatabiliyor
- **Kanıt:** `app/api/customer/experience-share/route.ts:10-14` (`caption: z.string().max(200)`), `29-38` (yalnızca `role: 'DEALER'` kontrolü), `43-52` (oran sınırı yok); `app/api/public/experience-share/[token]/route.ts:31-33`; `page.tsx:68`, `74`, `83`.
- **Sorun:** Üretici UI notu sabit gönderse de API serbest metin kabul ediyor. Her `CUSTOMER` hesabı (kayıt açık), hiç gitmediği bir işletme için `qratex.com/experience/…` adresinde "Bu hafta şunu denedik · <İşletme Adı> · <200 karakter serbest metin>" sayfası üretebilir: hakaret/karalama, rakip yönlendirmesi, sahte kampanya ("bu linkle %50 indirim, IBAN: …") veya oltalama metni. Sayfa Qratex'in kendi alan adında, Qratex header'ıyla ve "güvenilir anonim kart" çerçevesiyle göründüğü için itibar/hukuki risk taşır. React metni kaçışladığından XSS yok; risk içerik kötüye kullanımı. Oran sınırı olmadığından toplu üretim de mümkün; işletme bunu göremiyor ve kaldıramıyor.
- **Öneri:** (a) Üretimi yalnızca o işletmede doğrulanmış etkileşimi olan müşteriye aç: `countVisitsAtDealer(uid, dealerId) > 0` (veya son 30 gün içinde `ConsumptionReview`/`Feedback`) şartı; kartı mümkünse belirli bir geri bildirim/tüketim kaydına (`sourceFeedbackId`/`sourceReviewId`) bağla. (b) Serbest not yerine önce hazır şablon cümleler + isteğe bağlı kısa not; serbest not için mevcut AI moderasyon hattından (geri bildirim modülünde kullanılan) geçirme veya URL/telefon/IBAN desen filtresi. (c) `checkRateLimitDb` ile kullanıcı başına günlük kota (ör. 5). (d) `ExperienceShareToken`'a `revokedAt` + `reportedCount` alanları; public sayfada "Bu kartı bildir" bağlantısı; bayi panelinde "Sizin hakkınızda paylaşılan kartlar" listesi ve gizleme hakkı.
- **Efor:** M

### 2. [YÜKSEK · Ürün/Büyüme] Paylaşım bağlantısının sosyal önizlemesi yok; canonical ana sayfaya işaret ediyor
- **Kanıt:** `page.tsx:1` (`'use client'` → `generateMetadata` mümkün değil); `app/layout.tsx:47-70` (kök başlık/OG, `alternates.canonical: '/'`); `app/robots.ts:20-23`.
- **Sorun:** Bu sayfanın tek varoluş sebebi WhatsApp/Instagram/iMessage'da paylaşılmak. Bugün bağlantı, sitenin genel başlığı ve genel OG görseliyle önizlenir; "Arkadaşın X'te harika vakit geçirdi" bilgisi önizlemede yoktur, tıklanma oranını doğrudan düşürür. Ayrıca miras alınan `canonical: '/'` arama motorlarına "bu sayfa ana sayfanın kopyası" der; sayfa `noindex` da değil.
- **Öneri:** Sayfayı sunucu bileşenine çevir: `page.tsx` içinde token'ı Prisma ile oku (`cache()` sarmalı), `generateMetadata` ile işletme adı + ruh hali + not içeren `title/description`, `robots: { index:false, follow:false }`, `alternates.canonical` kaldır/kendi URL'si. `app/(public)/experience/[token]/opengraph-image.tsx` ile dinamik kart görseli (işletme adı, kategori rengi, ruh hali emojisi/ikon, Qratex markası) üret — Spotify Wrapped kartı gibi. Sayaç artırmayı OG/metadata yolundan **ayır** (bkz. Bulgu 5). Build-time DB fail-safe kuralına uygun olarak helper try/catch + `notFound()` ile korunmalı.
- **Efor:** M

### 3. [YÜKSEK · İşlevsellik/Sahte içerik] Not ve ruh hali üretici tarafta sabit kodlu; sayfa her kartta aynı içeriği gösteriyor
- **Kanıt:** `app/customer/experiences/page.tsx:89-93` (`caption: 'Bu hafta buradaydık — gelirsen şunu dene.'`, `mood: 'good'`); `page.tsx:62`, `68`, `79`, `82-87`.
- **Sorun:** Kullanıcı kart oluştururken not yazamıyor ve ruh hali seçemiyor. Sonuç: her paylaşım kartı birebir aynı cümle + "Güzel" rozeti; başlık "Bu hafta **şunu** denedik" diyor ama gösterilen bir ürün/deneyim yok. `great`/`ok` etiketleri ve boş-not yedek metni pratikte ölü kod. Ziyaretçi açısından kart kişisel değil, bu yüzden ikna edici değil.
- **Öneri:** Kartı gerçek veriye bağla: üretimde kullanıcının o işletmedeki son deneyimlerinden birini seçtir (`at-dealer` zaten son 3 deneyimi döndürüyor: `app/customer/experiences/page.tsx:27-33`) ve kart; ürün/kategori etiketi, yıldız puanı, ruh hali (kullanıcı seçimi) ve isteğe bağlı kısa not taşısın. Şema: `ExperienceShareToken`'a `sourceKind`, `sourceId`, `productLabel`, `rating` (anonim, kişisel olmayan alanlar). Başlık veriye göre üretilsin ("Arkadaşın burada **Flat White** denedi ve 5★ verdi").
- **Efor:** M

### 4. [ORTA · Hata yönetimi] API'de try/catch yok; istemci JSON olmayan yanıtta ham teknik hata gösteriyor
- **Kanıt:** `app/api/public/experience-share/[token]/route.ts:14-29` (try/catch yok; `lib/api-http.ts:18` `responseIfDatabaseUnavailable` kullanılmıyor); `page.tsx:34-38`.
- **Sorun:** Neon kesintisi veya herhangi bir Prisma hatasında route gövdesiz 500 döner; `res.json()` `SyntaxError` fırlatır ve `e.message` ("Unexpected end of JSON input" vb.) doğrudan kullanıcıya basılır. Ayrıca 503/404/500 ayrımı yapılmadığından "tekrar dene" ile "link geçersiz" aynı görünür.
- **Öneri:** Route'u try/catch ile sar, `responseIfDatabaseUnavailable` ile 503 + `retryable`, diğerlerinde `{ error, code }` şekli. Sunucu bileşenine geçildiğinde (Bulgu 2) bu doğal olarak `notFound()` / segment `error.tsx` ile çözülür; `app/(public)/experience/[token]/not-found.tsx` içinde "Bu kartın süresi dolmuş — yine de işletmeyi keşfet / Qratex'e katıl" kurtarma ekranı.
- **Efor:** S

### 5. [ORTA · Veri bütünlüğü] Görüntülenme sayacı GET yan etkisi, tekilleştirilmemiş ve manipüle edilebilir; üstelik kimse okumuyor
- **Kanıt:** `route.ts:25-29` (her GET'te `increment: 1`), `page.tsx:30-43` (abort yok), `page.tsx:80` (kamuya açık gösterim); grep: `viewCount` başka hiçbir dosyada okunmuyor.
- **Sorun:** Yenileme, paylaşanın kendi açışı, aynı kişinin tekrar açışı, basit bir `curl` döngüsü hepsi sayılır; oran sınırı yok. Sayaç ziyaretçiye "sosyal kanıt" olarak gösteriliyor ama değeri anlamsız; paylaşan ya da işletme bu veriyi göremediği için ürüne geri dönüşü de yok. Güvenli yöntemle (GET = salt okuma) çelişiyor; ileride sunucu bileşenine geçişte prefetch/metadata/OG istekleri sayacı şişirir.
- **Öneri:** Okumayı ve sayımı ayır: sayfa sunucuda salt okur; istemci mount sonrası `POST /api/public/experience-share/[token]/view` (veya `navigator.sendBeacon`) gönderir. Tekilleştirme: Upstash Redis'te `exp:view:{token}:{ipHash|anonId}` 24 saat TTL'li `SET NX`; yalnız yeni anahtar DB'ye artış yazar. Paylaşanın kendi oturumu sayılmaz. Ziyaretçiye ham sayı yerine eşikli sosyal kanıt ("Bu kartı 10+ kişi gördü"); asıl değer paylaşana bildirim ("Kartın 3 kişiye ulaştı, biri kayıt oldu → +50 XP") ve bayi paneline.
- **Efor:** M

### 6. [ORTA · UX/Büyüme] Sayfada hiçbir aksiyon yok — viral döngü kapanmıyor
- **Kanıt:** `page.tsx:64-92` (Link/Button yok); referral altyapısı: `app/customer/referral/page.tsx:123`, `app/(auth)/auth/register/page.tsx:60`.
- **Sorun:** Arkadaş kartı açıyor, okuyor ve çıkış yok: işletmenin konumu/yol tarifi, menüsü, açık olup olmadığı, "Qratex'e katıl, ilk ziyaretinde X puan kazan" teklifi, paylaşanın davet kodu — hiçbiri yok. Starbucks/Revolut davet sayfaları tek bir net birincil eylemle biter. Ayrıca paylaşan kişi bu kart üzerinden gelen kayıtlardan referral ödülü alamıyor; kartla davet ayrı iki mekanizma.
- **Öneri:** Birincil CTA: "Qratex'e katıl ve ilk ziyaretinde ödül kazan" → `/auth/register?ref=<paylaşanın kodu>&dealer=<id>&src=exp_card`. İkincil: "Yol tarifi" (işletme konumu varsa `DealerLocation`), "Diğer favorileri keşfet". Kartın token'ı üretimde paylaşanın `ReferralCode`'unu bağlasın (yanıt yine anonim; kod adı göstermez). Puan ekonomisi kurallarına uygun: ödül yalnızca kayıt + ilk doğrulanmış ziyaret sonrası, atomik tek seferlik kredi.
- **Efor:** M

### 7. [ORTA · i18n] Sayfa ve API metinlerinin çoğu sabit Türkçe
- **Kanıt:** `page.tsx:27`, `38`, `57`, `68`, `75`, `80`, `86`; `route.ts:22`, `32`, `37`; çevrilen tek anahtar grubu `messages/tr.json:1674-1678`.
- **Sorun:** EN dilinde ziyaretçi "Good" rozetini Türkçe başlık, açıklama ve sayaç metni arasında görür. Paylaşım sayfası dil bilmeyen turist/arkadaşa ulaşabilecek tek public yüzeylerden biri.
- **Öneri:** Tüm metinleri `publicExperience.*` altına taşı; API'den metin değil kod döndür (`disclaimer` sabitini istemciye/sunucu bileşenine al); `Accept-Language`'a göre sunucu tarafında yerelleştir (sunucu bileşenine geçişle birlikte).
- **Efor:** S

### 8. [ORTA · Yönetişim] Modül kapatma, iptal ve temizlik yok
- **Kanıt:** `lib/module-controls.ts:30` (`experiences` modülü tanımlı) ama iki route'ta modül kontrolü yok; silme/iptal ucu yok; `app/api/cron/db-cleanup` içinde `experienceShareToken` geçmiyor.
- **Sorun:** Admin "Deneyimler" modülünü kapatınca eski kartlar ve doğrudan API çalışmaya devam eder; paylaşan kişi kartını geri çekemez (KVKK açısından "paylaştığım içeriği kaldırma" beklentisi); süresi dolmuş satırlar birikir.
- **Öneri:** Okuma/üretim uçlarında modül bayrağını kontrol et (kapalıysa 404 + nazik ekran). `DELETE /api/customer/experience-share/[id]` + üretici ekranda "Paylaşımlarım" listesi (görüntülenme, kalan süre, iptal). `db-cleanup` cron'una `expiresAt < now() - 30 gün` silme adımı.
- **Efor:** S

### 9. [DÜŞÜK · Erişilebilirlik] Durum duyuruları ve başlık hiyerarşisi
- **Kanıt:** `page.tsx:47-59` (role/aria-live yok), `page.tsx:68` h1 → `components/ui/card.tsx:44` h3.
- **Sorun:** Ekran okuyucu yükleme bitişini ve hatayı duyurmaz; h2 atlanır.
- **Öneri:** Yükleniyor kapsayıcısına `role="status" aria-live="polite"`, hata kapsayıcısına `role="alert"`; kart başlığını `asChild`/`<h2>` ile render et. Sunucu bileşenine geçişte yükleniyor durumu tamamen ortadan kalkar.
- **Efor:** S

### 10. [DÜŞÜK · Gizlilik/Tutarlılık] İşletme adı yoksa bayi kullanıcısının kişisel adı gösteriliyor; aynı gizlilik mesajı iki kez
- **Kanıt:** `route.ts:17`, `32` (`businessName || name`); `page.tsx:69` ve `75`.
- **Sorun:** `businessName` boş bırakılmış bir bayide şahıs adı kamuya açık karta düşer — "kişisel veri sızdırmadan" yorumuyla (`route.ts:7`) çelişir. Aynı "anonim" mesajının iki kez yazılması görsel gürültü.
- **Öneri:** `businessName` yoksa kart üretimini engelle veya "İşletme" genel etiketi kullan; gizlilik mesajını tek, küçük bir alt bilgi satırına indir.
- **Efor:** S

### 11. [DÜŞÜK · Performans] Basit bir kart için ardışık round-trip ve ağır public kabuk
- **Kanıt:** `page.tsx:25-44` (HTML → JS hidrasyon → API), `app/(public)/layout.tsx:13-31` (Header/Footer + `LandingBackground` + `/api/settings/background` fetch: `LandingBackground.tsx:37-47`).
- **Sorun:** Mobil veride (QR/mesajlaşma ortamı) ilk anlamlı içerik gecikir; pazarlama header'ı ve hareketli arka plan karta odaklanmayı böler.
- **Öneri:** Sunucu bileşeni + kendi hafif layout'u (ör. `app/(share)/experience/[token]` route grubu: yalnız logo, kart, CTA, minimal footer). Veri tek sorgu; Redis'te 60 sn önbellek (sayaç ayrı olduğu için güvenli).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Dinamik paylaşım görseli (OG image) + "Hikâyeye paylaş" çıktısı** — Spotify Wrapped / Duolingo seri kartları gibi; kare (1080×1080) ve dikey (1080×1920) varyant, `navigator.share` ile dosya paylaşımı. Bugün ne önizleme ne görsel var.
2. **Tek net birincil eylem + davet ödülü** — Starbucks/Revolut "arkadaşını davet et" sayfası modeli: "Katıl, ilk ziyaretinde X puan; arkadaşın da Y puan kazansın", paylaşanın referral kodu otomatik iliştirili.
3. **İşletme bağlamı** — kategori, konum/yol tarifi, çalışma saati, ortalama puan, "en çok sevilen ürün"; ziyaretçinin gitme kararını destekleyen minimum bilgi.
4. **Paylaşan için geri bildirim döngüsü** — "Kartın N kişiye ulaştı, M kişi katıldı" bildirimi + rozet/XP (Duolingo "arkadaşın katıldı" anı); bugün sayaç kimseye gösterilmiyor.
5. **Bayi görünürlüğü ve moderasyon** — işletmenin kendisi hakkındaki kartları görmesi, bildirme/gizleme; Google Haritalar yorum yanıtı benzeri kontrol.
6. **Süresi dolmuş kart için kurtarma ekranı** — "Bu kartın süresi doldu ama işletme hâlâ burada" + keşfet/katıl CTA'sı; bugün düz bir hata metni.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Arkadaş WhatsApp'ta zengin bir önizleme görür ("Bir arkadaşın Kahve Durağı'nda 5★ verdi — Flat White"), dokunur; 1 saniyenin altında, tek ekranlık, telefona göre tasarlanmış bir "kart" açılır. Kart hafifçe ters dönerek açılır (Wrapped hissi), altında tek bir güçlü CTA vardır: "Katıl ve ilk ziyaretinde ödül kazan". İkincil olarak yol tarifi ve işletmenin öne çıkan bilgileri. Paylaşan kişi, kartının ulaştığı kişileri ve getirdiği kayıtları kendi panelinde görür ve ödüllendirilir.

**Yerleşim (mobil önce, tek sütun):**
1. Minimal üst bar (logo + dil), pazarlama header'ı yok.
2. **Kart** (kategori rengiyle kimlik — karakter rozeti sistemindeki "kategori rengi = kimlik" diliyle tutarlı): işletme adı, kategori ikonu, ürün etiketi, yıldız, ruh hali, kısa not; köşede "Anonim" mühürü (tek gizlilik bildirimi).
3. **Sosyal kanıt şeridi:** "Bu hafta 12 kişi burada geri bildirim verdi" (işletme düzeyi, anonim toplu veri).
4. **Birincil CTA** (tam genişlik, 48px+): "Katıl, ilk ziyaretinde 50 puan" → referral'lı kayıt.
5. **İkincil:** Yol tarifi · Menü/keşfet.
6. Alt bilgi: kalan süre, "Bu kartı bildir".

**Motion/3D (ölçülü):** Kartın tek seferlik 3B "flip-in" girişi (`m as Motion`, `rotateY` 90°→0°, ~450 ms, yay) ve CTA'nın gecikmeli yumuşak belirmesi; `useReducedMotion` ile sadece opaklık geçişine düş. three.js gereksiz — bu yüzey hızlı açılmalı; sürpriz kutusu gibi ağır sahneler buraya taşınmamalı. Hareketli public arka plan bu rota grubunda kapalı olmalı.

**Veri/API değişiklikleri:**
- `ExperienceShareToken`: `sourceKind`, `sourceId`, `productLabel`, `rating`, `referralCodeId?`, `revokedAt?`, `reportedCount`, `uniqueViewCount`, `conversionCount`.
- Üretim (`POST /api/customer/experience-share`): ziyaret doğrulaması, günlük kota, şablon/moderasyonlu not, kullanıcı seçimli ruh hali; `DELETE` ile iptal; `GET` ile "Paylaşımlarım".
- Okuma: sunucu bileşeni içinde `getExperienceShare(token)` (try/catch, Redis 60 sn); `generateMetadata` + `opengraph-image.tsx`; `robots: noindex`.
- Sayım: `POST …/[token]/view` + Redis `SET NX` tekilleştirme; dönüşüm `src=exp_card` parametresiyle kayıt akışında `Referral`'a bağlanır, ödül ekonomi değişmezlerine (atomik, tek seferlik, sahtecilik görünürlüğü) uygun verilir.
- Bayi paneli: "Sizin hakkınızda paylaşılan kartlar" (görüntülenme/dönüşüm, gizle/bildir).
- Analitik: `exp_card_view`, `exp_card_cta_click`, `exp_card_signup` PostHog olayları.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/referral` ile işlevsel çakışma:** İki ayrı "arkadaşa paylaş" mekanizması var — referral bağlantısı (`app/customer/referral/page.tsx:123`, ödüllü ama içeriksiz) ve deneyim kartı (içerikli ama ödülsüz, CTA'sız). Öneri: **birleştir** — deneyim kartı, referral'ın "içerikli" taşıyıcısı olsun; kartın token'ı paylaşanın referral kodunu taşısın, referral sayfası "Deneyim kartı ile davet et" seçeneğini sunsun. Tek dönüşüm hunisi, tek ödül kuralı.
- **`/customer/experiences` (üretici ekran):** Bu sayfanın kalitesi doğrudan üretici ekrana bağlı; üretici ekran bayi ID'sini elle yazdırıyor (`app/customer/experiences/page.tsx:148-155`) ve not/ruh halini sabitliyor. Kart üretimi, geri bildirim başarı ekranına ve karakter rozeti açılış anına ("Bu deneyimi arkadaşınla paylaş") taşınmalı; ayrı ID girişli ekran ya kaldırılmalı ya da "Paylaşımlarım" yönetim ekranına dönüşmeli.
- **`/c/[token]`:** Fiziksel kart aktivasyon sayfası; adlandırma benzerliği dışında çakışma yok.
- Sayfa **kaldırılmamalı** — anonim, kişisel veri sızdırmayan sosyal paylaşım kartı ürünün en ucuz büyüme kanalı olabilir; ama yukarıdaki biçimde yeniden tasarlanmadan bugünkü haliyle değer üretmiyor ve marka riski taşıyor.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; okunan dosyalar: `app/(public)/experience/[token]/page.tsx`, `app/api/public/experience-share/[token]/route.ts`, `app/api/customer/experience-share/route.ts`, `app/customer/experiences/page.tsx`, `lib/api-auth.ts` (`requireAuth`), `lib/prisma.ts`, `proxy.ts`, `prisma/schema.prisma` (`ExperienceShareToken`). Kod çalıştırılmadı, DB'ye dokunulmadı.

### 1. Keyfi metinle işletme adına public kart üretimi — **DOĞRULANDI** (önem: YÜKSEK yerine ORTA-YÜKSEK)

Çürütme denemeleri ve sonuçları:
- *"UI caption'ı sabit gönderiyor, kullanıcı metin giremez"* — Geçersiz. UI (`app/customer/experiences/page.tsx:89-93`) sabit metin gönderiyor ama sunucu bunu zorlamıyor: `bodySchema` (`app/api/customer/experience-share/route.ts:10-14`) serbest `caption` (≤200) kabul ediyor; istemci kontrolü güvenlik sınırı değildir. İstek doğrudan DevTools/curl ile atılabilir.
- *"Ziyaret/ilişki kontrolü vardır"* — Yok. Tek kontrol `role: 'DEALER'` varlığı (`route.ts:29-32`); `ConsumptionReview`, check-in, sipariş vb. hiçbir ilişki sorgulanmıyor.
- *"Global oran sınırı proxy'de vardır"* — Yok. `proxy.ts:103-119` `/api/*` için yalnızca güvenlik + CORS başlığı ekliyor; `requireAuth` (`lib/api-auth.ts:52-80`) yalnızca oturum/rol/token-replay kontrol ediyor. Uçta günlük kota veya sayım yok (`route.ts:40-52`).
- *"İşletme görüp kaldırabilir"* — Hayır. Kod tabanında `experienceShareToken` için yalnızca `create` (`route.ts:43`), `findUnique` ve `update(viewCount)` (`app/api/public/experience-share/[token]/route.ts:14,25`) var; şemada `revokedAt`/`hidden` alanı yok (`prisma/schema.prisma:2768-2784`), bayi tarafında liste/silme ucu yok. Tek sınır 7 günlük `expiresAt`.
- Hafifletici etkenler (önemi düşürür ama ortadan kaldırmaz): link tahmin edilemez (`randomBytes(18)`), 7 gün sonra 404 olur; sayfa `'use client'` olduğundan içerik ilk HTML'de yok, arama motoru/OG önizlemesi metni göstermez. Yani zarar, linkin elden ele (WhatsApp/Instagram) aktarılmasıyla oluşur — ama bu ürünün asıl kullanım biçimi zaten bu.

Yeniden üretim: Herhangi bir CUSTOMER hesabıyla oturum açıp, bir bayinin ID'sini (müşteriye zaten "işletme ID girin" alanıyla soruluyor, `app/customer/experiences/page.tsx:80-84`) kullanarak `POST /api/customer/experience-share` gövdesi `{"dealerId":"<id>","caption":"Bu hafta %90 indirim! Ödeme için IBAN: TR..","mood":"great"}` gönderilir. Dönen `shareUrl` açıldığında Qratex alan adında, başlığı işletmenin gerçek `businessName`'i olan kartta bu metin görünür (`page.tsx:74,83`). İstek döngüyle sınırsız tekrarlanabilir; işletmenin bunu görme/kaldırma yolu yoktur.

Öneri (raporun "Hedef deneyim" bölümüyle uyumlu): serbest metni kaldırıp şablon seçimli not veya moderasyon (AI sınıflandırma + kelime filtresi) uygulanmalı; üretim, kullanıcının o bayide doğrulanmış bir `ConsumptionReview`/ziyaret kaydına bağlanmalı; kullanıcı başına günlük kota (Upstash Redis sayaç) eklenmeli; şemaya `revokedAt` + `reportedCount` eklenip public sayfada "Bildir", bayi panelinde "Hakkınızda paylaşılan kartlar → gizle/bildir" akışı kurulmalı.

### 2. Public API'de hata yönetimi yok; ham JSON ayrıştırma hatası sızıyor — **DOĞRULANDI** (önem: YÜKSEK değil, DÜŞÜK-ORTA; güvenlik değil UX/dayanıklılık)

- `app/api/public/experience-share/[token]/route.ts:14-38` içinde try/catch yok; `findUnique` veya `update` fırlatırsa (Neon uyanma/bağlantı hatası, P1001/P2024; ya da okuma ile `update` arasında satırın silinmesi → P2025) Next.js App Router işlenmemiş hatayı gövdesiz 500 olarak döndürür (çerçeve davranışı; çalıştırılarak doğrulanmadı ama route handler'larda bilinen davranış).
- İstemci `res.ok` kontrolünden ÖNCE `await res.json()` çağırıyor (`page.tsx:34-35`); boş gövde `SyntaxError` fırlatır, `catch` bunu `e.message` olarak doğrudan ekrana basar (`page.tsx:38,49`). Kullanıcı Chrome'da "Failed to execute 'json' on 'Response': Unexpected end of JSON input" gibi İngilizce teknik metin görür.
- 404 (süresi dolmuş/geçersiz) ile geçici 5xx ayırt edilmiyor; yeniden dene düğmesi yok. `lib/prisma.ts`'te hazır `isPrismaConnectivityError` ve `withDbRetry` yardımcıları var ama bu uçta kullanılmıyor.
- Veri sızıntısı yok: Prisma hata mesajı/şema bilgisi istemciye gitmiyor, yalnızca JSON ayrıştırma hatası görünüyor. Bu yüzden "güvenlik" değil, kullanıcı deneyimi ve dayanıklılık bulgusudur.

Yeniden üretim: Neon soğuk başlangıcında/bağlantı kesintisinde geçerli bir `/experience/<token>` linki açılır → API gövdesiz 500 → sayfada "…Unexpected end of JSON input" yazar; link aslında geçerli olduğu hâlde alıcı bunu bozuk link sanar.

Öneri: Okumayı sunucu bileşenine taşıyıp (`getExperienceShare(token)`) `withDbRetry` + try/catch ile sarmak; sonucu `{ status: 'ok' | 'expired' | 'unavailable' }` olarak ayrıştırıp üç ayrı ekran (kart / "süresi doldu" / "geçici sorun, tekrar dene") göstermek; istemci tarafında kalınacaksa `res.json().catch(() => null)` ile ayrıştırmak ve kullanıcıya hiçbir zaman `e.message` göstermemek. `viewCount` artışı okuma yolundan ayrılıp hata toleranslı (fire-and-forget / ayrı `POST …/view`) yapılmalı ki sayaç hatası kartın görüntülenmesini engellemesin.
