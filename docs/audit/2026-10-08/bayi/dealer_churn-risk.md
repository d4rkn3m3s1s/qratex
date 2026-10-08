# /dealer/churn-risk

**Amaç:** İşletme sahibine son 30 günde AI'nin geri bildirim başına hesapladığı kayıp (churn) riskini özetlemek, yüksek riskli geri bildirimleri listelemek ve "otomatik churn müdahalesi" (günlük cron + uyarı + flash teklif taslağı) ayarını yönetmek.

**Genel puan: 4.5 / 10** · **Karar: birleştir** (/dealer/radar, /dealer/segment-actions ve /dealer/customers ile tek bir "Müşteri Elde Tutma Merkezi"ne)

Kapsam: `app/dealer/churn-risk/page.tsx` (364 satır), `app/dealer/churn-risk/layout.tsx`, `components/dealer/churn-intervention-settings.tsx`, `app/api/dealer/churn-risk/route.ts`, `app/api/dealer/churn-intervention/route.ts`, `lib/churn-intervention-core.ts`, `lib/clv-core.ts`, `app/api/internal/inngest/churn-intervention/route.ts`, `lib/inngest/functions.ts`, `messages/{tr,en}.json` (`dealerChurnRisk`), `prisma/schema.prisma` (Feedback, CustomerLifetimeValue, DealerFlashOffer). Salt okunur inceleme; hiçbir şey çalıştırılmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Okuma tarafı çalışıyor; ancak "yüksek risk müşteri" sayısı aslında geri bildirim sayısı, hata durumu "her şey yolunda" boş ekranına düşüyor, otomatik müdahale yanlış (platform geneli) veriyle çalışıyor ve hedefsiz teklif taslağı üretiyor. |
| UX | 4/10 | Sayfa "gör"ü veriyor ama "yap"ı vermiyor: satırdan aksiyon yok, "Detay" bağlamsız genel listeye gidiyor ve dokunmatikte görünmez, ayar kartı içgörüden önce geliyor. |
| Görsel | 6/10 | Panel diliyle tutarlı, temiz KPI ızgarası; ancak 3. ve 4. KPI aynı sayıyı tekrarlıyor, dağılım çubuğu aralıklı/erişilemez, dekoratif gradient `relative` olmayan karta konmuş. |
| Mimari | 4/10 | Aynı sayfada iki farklı churn modeli (Feedback.churnRisk vs. global CustomerLifetimeValue.predictedChurn), modül kapısı yok, i18n yarım, hazır `risk-segment` API'si bağlanmamış. |
| Performans | 7/10 | 5 sorgu paralel + Redis 60 sn önbellek iyi; üç ayrı `count` tek bir sorguya indirilebilir, ayar kartı ayrı istekle geç gelip düzen kayması yaratıyor. |
| Erişilebilirlik + mobil | 4/10 | `<a><button>` iç içe etkileşim, hover'a bağlı görünmez buton, `htmlFor`'suz input etiketleri, dağılım çubuğunun metin alternatifi yok; azaltılmış hareket global `MotionConfig reducedMotion="user"` ile karşılanıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | KISMİ | `app/dealer/churn-risk/layout.tsx:5`, `messages/tr.json` `layoutMetadata.dealerChurnRiskDescription` | Açıklama "Riskli kümeler, tetikleyiciler ve elde tutma hamleleri" vaat ediyor; sayfada küme (cohort) ve tetikleyici analizi yok. |
| 2 | Rol kontrolü (proxy + API) | ÇALIŞIYOR | `proxy.ts:52`, `app/api/dealer/churn-risk/route.ts:14-27` | DEALER yalnızca kendi `session.user.id`'sini görür; IDOR yok. |
| 3 | Modül kapısı (`churn_risk` modülü) | EKSİK | `lib/module-controls.ts:41` modül tanımlı; `route.ts` ve `churn-intervention/route.ts` içinde `assertModuleEnabled` yok (karş. `app/api/dealer/experience-pulse/route.ts:20`) | Admin modülü kapatsa bile URL ve API çalışmaya devam eder. |
| 4 | Veri çekme `/api/dealer/churn-risk` | ÇALIŞIYOR | `page.tsx:61-69`, `route.ts:40-99` | Son 30 gün, Redis 60 sn (`route.ts:30-35,126`). |
| 5 | Yükleniyor durumu | KISMİ | `page.tsx:71-84` | Tam sayfa spinner; iskelet (skeleton) yok, sonra tüm içerik birden gelir. |
| 6 | Hata durumu | BOZUK | `page.tsx:62-68` | `res.ok` kontrol edilmiyor; 401/403/429/500 JSON yanıtı `json.churnRisk` olmadığı için sessizce yutulur ve sayfa "AI analizi bekleniyor" + "Yüksek riskli kayıt yok" (yeşil kalkan) gösterir. |
| 7 | Hero (eyebrow, başlık, açıklama, ikon) | ÇALIŞIYOR | `page.tsx:99-104` | |
| 8 | Hero "Kampanyalar" bağlantısı | ÇALIŞIYOR | `page.tsx:105-117` | `asChild` ile doğru kullanılmış (sayfadaki diğer bağlantılardan farklı). |
| 9 | Otomatik Churn Müdahalesi kartı yüklenmesi | KISMİ | `churn-intervention-settings.tsx:28-33,60` | Ayrı istek; yüklenene kadar `null` döner, sonra KPI'ların üstüne "pop" eder (düzen kayması). GET hatası `catch(() => {})` ile sessiz; kart kaybolur. |
| 10 | "Etkin" anahtarı | ÇALIŞIYOR | `churn-intervention-settings.tsx:74-77`, `churn-intervention/route.ts:42-59` | Kaydet'e basılmadan kaydedilmez; kaydedilmemiş değişiklik göstergesi yok. |
| 11 | Churn eşiği (0-1) girişi | KISMİ | `churn-intervention-settings.tsx:79-89` | Ondalık (0.6) girilir, sayfanın geri kalanı yüzde (%60) konuşur. Boş alan `Number('')=0` olur. Etiket `htmlFor`'suz. |
| 12 | Pasif gün eşiği girişi | KISMİ | `churn-intervention-settings.tsx:90-98` | Boş bırakılırsa 0 gider, zod `min(1)` reddeder (`churn-intervention/route.ts:17`) ve kullanıcı yalnızca "Geçersiz ayar" görür. |
| 13 | "Koşu başına maks." girişi | KISMİ | `churn-intervention-settings.tsx:99-108` | Teknik kavram işletme sahibine açılmış; hangi alanın hatalı olduğu söylenmiyor. |
| 14 | Otomatik flash teklif taslağı anahtarı | SAHTE (etkisi yanıltıcı) | `lib/churn-intervention-core.ts:91-105`, `prisma/schema.prisma` `model DealerFlashOffer` (müşteri alanı yok), `app/api/customer/innovation/nearby/route.ts:35-40` | "Riskli müşteri için" denilen taslak hiçbir müşteriye bağlı değil; aktive edilirse yakındaki herkese görünen genel bir teklif olur. Bkz. Bulgu 1. |
| 15 | Kaydet düğmesi | ÇALIŞIYOR | `churn-intervention-settings.tsx:41-58,117-120` | Toast'lar sabit Türkçe. |
| 16 | Günlük müdahale cron'u (03:30) | KISMİ | `lib/inngest/functions.ts:174-182`, `app/api/internal/inngest/churn-intervention/route.ts` | Inngest üzerinden; Vercel `cron/daily` listesinde değil (`app/api/cron/daily/route.ts:50-58`). Prod'da Inngest'in tetiklendiği **doğrulanmadı**. Veri kaynağı yanlış kapsamda (Bulgu 2). |
| 17 | Müdahale bildirimi | KISMİ | `lib/churn-intervention-core.ts:129-139` | Yalnızca sayı içerir; hangi müşteriler, nereye gidilecek bilgisi yok (`data` içinde link/id listesi yok). |
| 18 | İşaretlenen müşterilerin listesi | EKSİK | `churn_intervention` event'i yalnızca `lib/churn-intervention-core.ts:76,116` içinde yazılıyor/okunuyor; hiçbir UI okumuyor | Bayi "kim?" sorusunun cevabını hiçbir ekranda göremez. |
| 19 | KPI: Ortalama risk + Progress + durum etiketi | ÇALIŞIYOR | `page.tsx:124-151` | Progress rengi riske göre değişmiyor (hep primary). |
| 20 | KPI: "AI analizi bekleniyor" durumu | ÇALIŞIYOR | `page.tsx:146-148` | Hata durumunda da görünüyor (bkz. #6). |
| 21 | KPI: Risk hesaplanan geri bildirim sayısı | ÇALIŞIYOR | `page.tsx:152-169`, `route.ts:41-50` | |
| 22 | KPI: Yüksek risk "müşteri" sayısı | BOZUK | `page.tsx:183-184`, `route.ts:90-96`, `messages/tr.json` `customersWord: "müşteri"` | Sayılan şey geri bildirim satırı; aynı müşterinin 3 yorumu 3 "müşteri" sayılır, anonimler de dahil. |
| 23 | KPI: Risk dağılım çubuğu + lejant | KISMİ | `page.tsx:193-237`, `route.ts:72-98` | Görsel olarak `gap-2` 8 px'lik boşluklar bırakıyor (sıfır genişlikli segmentlerde bile); metin alternatifi/ARIA yok; "Yüksek" değeri 3. KPI ile birebir aynı (gereksiz tekrar). Eşikler /dealer/ai-insights ile tutarsız (0.25/0.5/0.75 — `app/api/ai/detailed/route.ts:89-92`). |
| 24 | "Önerilen aksiyon" kartı | KISMİ | `page.tsx:241-266` | Sabit metin, AI önerisi değil; sayı yanlış birimde ("{count} yüksek riskli müşteri"). |
| 25 | "Kampanya oluştur" düğmesi | KISMİ | `page.tsx:259-261` | Genel `/dealer/campaigns`'e gider, segment ön-seçimi yok; hazır `POST /api/dealer/campaigns/risk-segment` (`app/api/dealer/campaigns/risk-segment/route.ts`) kullanılmıyor. `<Link><Button>` iç içe etkileşim. |
| 26 | Yüksek riskli geri bildirim listesi (ilk 20) | ÇALIŞIYOR | `page.tsx:295-357`, `route.ts:51-71` | Sayfalama yok; 20'den fazlası görünmez ve bunu söyleyen bir gösterge yok. |
| 27 | Avatar / isim / "Anonim" | ÇALIŞIYOR | `page.tsx:307-315` | |
| 28 | Göreli zaman | ÇALIŞIYOR | `page.tsx:316-318` | |
| 29 | Puan (yıldız) | ÇALIŞIYOR | `page.tsx:323-326` | |
| 30 | Risk rozeti (renkli) | ÇALIŞIYOR | `page.tsx:91-95,327-329` | Liste yalnızca ≥%50 içerdiği için yeşil dal hiç çalışmaz (ölü dal). |
| 31 | Duygu (sentiment) rozeti | KISMİ | `page.tsx:330-334`, şema yorumu `sentiment String? // positive, negative, neutral` | Ham İngilizce değer ("negative") Türkçe arayüzde gösteriliyor. |
| 32 | Yüksek aciliyet rozeti | ÇALIŞIYOR | `page.tsx:335-339` | |
| 33 | Yorum metni (2 satır) | ÇALIŞIYOR | `page.tsx:341-345` | Tamamını açma yok. |
| 34 | Niyet (intent) | EKSİK | API seçiyor `route.ts:67,118`; sayfa göstermiyor | "complaint/question" ayrımı önceliklendirme için değerli. |
| 35 | "Detay" düğmesi | BOZUK | `page.tsx:347-352`; `app/dealer/feedbacks/page.tsx:307` yalnızca `?search=` destekliyor | `opacity-0 group-hover:opacity-100`: dokunmatikte ve klavye odağında görünmez; hedef genel liste, ilgili geri bildirime gitmiyor. |
| 36 | Boş durum + "Geri bildirimlere git" | KISMİ | `page.tsx:283-293` | Hata durumunda da gösterilir (yanlış güven). |
| 37 | Giriş animasyonları (stagger) | ÇALIŞIYOR | `page.tsx:124-128,299-303`; `components/providers.tsx:232` | Ölçülü; azaltılmış hareket global olarak destekleniyor. |
| 38 | TR/EN yerelleştirme | KISMİ | `page.tsx` `t()` kullanıyor; `churn-intervention-settings.tsx:52,54,67,70,75,80,91,100,112-113,119` sabit Türkçe | EN kullanıcı karışık dil görür; ayrıca TR'de "Müşteri Kaybı Riski" başlığı altında "Churn eşiği" jargonu. |
| 39 | Müşteri bazında tekilleştirme | EKSİK | `route.ts:51-71` | Liste geri bildirim bazlı; aynı kişi birden fazla kez görünür. |
| 40 | "Yanıtlandı / ele alındı" durumu | EKSİK | Şemada `dealerReply`, `dealerRepliedAt` var; `route.ts:60-70` seçmiyor | Bayi hangi riskli müşteriyle zaten ilgilendiğini göremez; liste hiç küçülmez. |
| 41 | Dönem seçici | EKSİK | `route.ts:37-38,106` sabit `last_30_days` | |
| 42 | Zaman içinde trend | EKSİK | — | Risk artıyor mu azalıyor mu bilinmiyor. |
| 43 | Satır içi aksiyon (yanıtla / telafi / kişisel teklif) | EKSİK | — | /dealer/radar'da tekil teklif düğmesi var (`components/dealer/radar-interactive`), burada yok. |
| 44 | Skor açıklanabilirliği ("neden riskli?") | EKSİK | — | `themes`, `actionSuggestions` alanları şemada var, kullanılmıyor. |
| 45 | Sahte/güvensiz yorum filtresi | EKSİK | Şemada `fraudScore`, `trustFlagged`; `route.ts` filtrelemiyor | İşaretli yorumlar risk ortalamasını şişirir. |
| 46 | Dışa aktarma / yenileme | EKSİK | — | |
| 47 | Dekoratif köşe gradyanı | KISMİ | `page.tsx:129-130`; `components/ui/card.tsx` (`relative` yok) | `absolute` öğe `relative` olmayan kartta; konumu `backdrop-blur`/transform'un oluşturduğu kapsayıcı bloğa bağlı, kırılgan. Görsel olarak **doğrulanmadı**. |
| 48 | Dil değişiminde yeniden çekme | KISMİ | `page.tsx:69` (`[t]` bağımlılığı), `lib/app-locale.tsx:24-29,59` | EN kullanıcıda mount sonrası locale `tr→en` değişince ikinci istek atılır; AbortController yok (zararsız ama gereksiz). |

**Toplam: 48 özellik** — ÇALIŞIYOR 17 · KISMİ 16 · BOZUK 3 · SAHTE 1 · EKSİK 11

---

## Bulgular

### 1. Otomatik "flash teklif taslağı" riskli müşteriye değil, herkese açık genel teklife dönüşüyor
- **Önem:** Kritik · **Kategori:** Veri bütünlüğü / iş mantığı · **Efor:** M
- **Kanıt:** `lib/churn-intervention-core.ts:88-110` her riskli müşteri için `dealerFlashOffer.create` çağırır ama kayıtta müşteri kimliği yoktur; `prisma/schema.prisma` `model DealerFlashOffer` müşteri hedefleme alanı içermez; `app/api/customer/innovation/nearby/route.ts:35-40` aktif teklifleri konuma göre **tüm** müşterilere döner. Arayüz metni: "Riskli müşteri için %15 indirim taslağı" (`churn-intervention-settings.tsx:113`).
- **Sorun:** (a) 20 riskli müşteri işaretlenirse 20 birebir aynı "Seni özledik 🎁" taslağı oluşur. (b) Bayi birini aktive ederse teklif riskli müşteriye gönderilmez; yakındaki rastgele ilk kullanıcı (`maxRedemptions: 1`) kullanır. (c) Taslak 24 saat geçerli (`validTo: now + DAY`), bildirimde taslağın nerede olduğu yazmıyor; büyük olasılıkla görülmeden süresi dolar ve DB'de çöp olarak birikir (expiry işi yalnızca `isActive: true` olanları kapatır, `dealer-flash-offer-expiry/route.ts:20`). Arayüz bayiye var olmayan bir hedefleme vaat ediyor.
- **Öneri:** Teklifi müşteriye bağlı bir "kişisel teklif" (ör. `PersonalOffer { dealerId, customerId, sourceEvent, status: DRAFT|SENT|REDEEMED|EXPIRED, expiresAt }`) olarak modelle ya da mevcut tekil kupon akışını (/dealer/radar'daki `RadarSingleOfferButton`) yeniden kullan. Müdahale koşusu, müşteri başına bir taslak yerine **tek bir onay kuyruğu öğesi** üretsin: "12 müşteri için kişisel teklif hazır — Gözden geçir / Hepsini gönder". Gönderimde müşteriye bildirim + kupon kodu gitsin; kullanım `customerId` eşleşmesiyle doğrulansın. Mevcut genel taslaklar için tek seferlik temizlik betiği.

### 2. Otomatik müdahale platform geneli (çok bayili) churn verisiyle karar veriyor
- **Önem:** Yüksek · **Kategori:** Veri bütünlüğü / çok kiracılılık · **Efor:** M
- **Kanıt:** `CustomerLifetimeValue.userId @unique` (bayi alanı yok); `lib/clv-core.ts:80-87` harcamayı yalnızca `customerId` ile gruplar, `lib/clv-core.ts:94-105` churn'ü kullanıcının **tüm bayilerdeki** geri bildirimlerinden ortalar; `lib/churn-intervention-core.ts:59-63` bu global `predictedChurn` ve global `lastPurchaseAt` ile filtreler.
- **Sorun:** Bu bayiye 2 aydır gelmeyen ama başka bir işletmede dün harcama yapan müşteri "pasif değil" sayılıp kaçırılır (yanlış negatif); başka bir işletmede kötü deneyim yaşayan sadık müşteri bu bayi için "kayıp riski yüksek" işaretlenir (yanlış pozitif). Ayrıca bir işletmenin yorum verisi dolaylı olarak başka bir işletmenin bildirimlerini etkiler. Aynı sayfanın üst kısmı ise bayiye özel `Feedback.churnRisk` kullanıyor; iki model birbiriyle çelişen sayılar üretir (eşikler de farklı: ayarda 0.6, KPI'da 0.5).
- **Öneri:** Bayi-müşteri çifti için ilişki metriği hesaplayan bir tablo veya görünüm: `DealerCustomerStats { dealerId, customerId, lastVisitAt, visits, spend, avgChurn (yalnız bu bayinin feedback + consumptionReview'ları), updatedAt }`. CLV cron'u bunu da doldursun; müdahale ve bu sayfa **aynı** kaynağı okusun. Ayarlardaki eşik ile sayfadaki "yüksek risk" eşiği tek konfigürasyondan beslenmeli.

### 3. Hata yanıtları "her şey yolunda" boş ekranına dönüşüyor
- **Önem:** Yüksek · **Kategori:** Hata yönetimi / UX · **Efor:** S
- **Kanıt:** `page.tsx:62-68` (`res.ok` kontrolü yok, `json.churnRisk` yoksa hiçbir şey yapılmıyor); `page.tsx:283-289` yeşil kalkanlı "Yüksek riskli kayıt yok"; API'de try/catch yok (`route.ts:13-128`), `responseIfDatabaseUnavailable` kullanılmıyor (karş. `churn-intervention/route.ts:35-36`). Ayar kartı da `catch(() => {})` ile kendini sessizce gizliyor (`churn-intervention-settings.tsx:32,60`).
- **Sorun:** Oturum süresi dolduğunda, rate-limit'te veya DB uyurken bayi "riskli müşteri yok" mesajı görür; bu, bir risk panelinin verebileceği en tehlikeli yanlış sinyaldir.
- **Öneri:** `res.ok` ve `json.error` kontrolü; ayrı `error` durumu ("Veriler yüklenemedi — Tekrar dene"). API'de try/catch + `responseIfDatabaseUnavailable`. Boş durum yalnızca başarılı ve gerçekten boş yanıtta gösterilsin. SWR/`useSWR` ile yeniden deneme ve odaklanınca tazeleme.

### 4. "Yüksek risk — müşteri" sayısı aslında geri bildirim sayısı
- **Önem:** Yüksek · **Kategori:** Yanlış veri · **Efor:** S
- **Kanıt:** `route.ts:90-96` (`feedback.count`), `page.tsx:183-184` (`customersWord`), `page.tsx:256` + `messages/tr.json` `recommendedBody: "{count} yüksek riskli müşteriye..."`.
- **Sorun:** Aynı müşterinin birden çok yorumu çoklu sayılır; anonim yorumlar (ulaşılamaz kişiler) "müşteri" sayılır. Bayi kampanya büyüklüğünü buna göre planlar.
- **Öneri:** API'de `groupBy({ by: ['userId'] })` ile tekil kayıtlı müşteri sayısı + ayrı "anonim yüksek riskli yorum" sayısı döndür. KPI'yı "Ulaşılabilir riskli müşteri: 7 · Anonim: 4" olarak ikiye ayır. Liste de müşteri bazında gruplansın (en yüksek risk + yorum sayısı rozeti).

### 5. Sayfa aksiyona bağlanmıyor: "Detay" bağlamsız ve görünmez, kampanya genel
- **Önem:** Orta · **Kategori:** UX / işlevsellik · **Efor:** M
- **Kanıt:** `page.tsx:347-352` (`opacity-0 group-hover:opacity-100`, hedef `/dealer/feedbacks`); `app/dealer/feedbacks/page.tsx:307` yalnızca `?search=` okur; `page.tsx:259` genel kampanya sayfası; `app/api/dealer/campaigns/risk-segment/route.ts` mevcut ama bu sayfadan çağrılmıyor (yalnızca `lib/segment-action-center.ts:59`).
- **Sorun:** Riskli bir müşteriyi gören bayi; yanıt yazamaz, telafi başlatamaz, kişisel teklif gönderemez. "Detay"a basınca ilgili kaydı listede aramak zorunda kalır; mobilde ise düğmeyi hiç göremez.
- **Öneri:** Her satıra her zaman görünen bir aksiyon menüsü: "Yanıtla" (mevcut feedback yanıt API'si, yan panel/Sheet içinde), "Telafi başlat" (`/api/dealer/feedbacks/[id]/remedy`), "Kişisel teklif" (Bulgu 1'deki akış). Detay için `/dealer/feedbacks?focus=<id>` deep-link desteği ekle veya satırda yan panel aç. Üst karttaki "Kampanya oluştur" düğmesi `risk-segment` uç noktasını önizleme + onay diyaloğuyla çağırsın ("7 müşteriye bildirim gidecek").

### 6. Modül kapısı yok — admin kapatsa da sayfa ve API çalışır
- **Önem:** Orta · **Kategori:** Yetki / yapılandırma · **Efor:** S
- **Kanıt:** `lib/module-controls.ts:41` (`churn_risk`), `lib/visibility-controls.ts:61`; `app/api/dealer/churn-risk/route.ts` ve `app/api/dealer/churn-intervention/route.ts` içinde `assertModuleEnabled` yok; desen örneği `app/api/dealer/experience-pulse/route.ts:20`.
- **Sorun:** Admin'in "kapalı" kararı yalnızca menüyü gizler; doğrudan URL ile erişim sürer ve cron da müdahale etmeye devam eder.
- **Öneri:** Her iki route'a `assertModuleEnabled('churn_risk', { role: 'dealer', request, userId })`; cron tarafında `runChurnInterventionForAllDealers` başında modül kapalıysa erken çıkış. Sayfada kapalı modül için açıklayıcı durum.

### 7. Ayar kartı: bilgi mimarisi, doğrulama ve i18n sorunları
- **Önem:** Orta · **Kategori:** UX / i18n / erişilebilirlik · **Efor:** M
- **Kanıt:** Yerleşim `page.tsx:120` (KPI'lardan önce); sabit Türkçe metinler `churn-intervention-settings.tsx:52-120`; `htmlFor`'suz etiketler `:80,:91,:100`; ondalık eşik `:81-87`; kaydedilmemiş değişiklik takibi yok `:35-39`; genel hata "Geçersiz ayar" `churn-intervention/route.ts:47-48`.
- **Sorun:** Bayi önce yapılandırma formuyla karşılaşıyor; içgörü ikinci planda. EN kullanıcı karışık dil görüyor. Ekran okuyucu input'ları etiketleriyle eşleştiremiyor. "Koşu başına maks." gibi teknik kavramlar ve 0-1 ölçeği, sayfanın % diliyle çelişiyor. Son koşu ne zaman, kaç kişi işaretlendi bilgisi yok.
- **Öneri:** Ayarları sağ üstte bir "Otomasyon" düğmesiyle açılan Sheet/Dialog'a taşı; ana yüzeyde yalnızca durum çipi ("Otomatik müdahale: Açık · son koşu 03:30 · 5 müşteri"). Eşiği % kaydırıcısı (Slider) ile ve canlı önizlemeyle ("Bu eşikte şu an 9 müşteri") sun. `react-hook-form` + zod ile alan bazlı hata, dirty state ve "Kaydedilmemiş değişiklikler" uyarısı. Tüm metinler `messages/*.json`'a.

### 8. Müdahalenin sonucu hiçbir ekranda görünmüyor
- **Önem:** Orta · **Kategori:** İşlevsellik / şeffaflık · **Efor:** M
- **Kanıt:** `lib/churn-intervention-core.ts:113-125` `analyticsEvent` yazar; bu event'i okuyan UI yok (grep: yalnızca core dosyası). Bildirim yalnızca sayı içerir (`:129-139`).
- **Sorun:** Bayiye "5 müşteri riskli" denir ama kim oldukları, neden işaretlendikleri ve neler yapıldığı hiçbir yerde listelenmez. Otomasyonun güvenilirliği denetlenemez.
- **Öneri:** "Müdahale geçmişi" sekmesi: tarih, müşteri, skor, son ziyaret, yapılan aksiyon (teklif gönderildi/kullanıldı), sonuç (geri döndü mü — sonraki 30 günde consumption var mı). Bildirim `data`'sına `href: '/dealer/churn-risk?tab=interventions&run=<id>'` ekle.

### 9. Liste "ele alınmış" ve şüpheli yorumları ayırt etmiyor
- **Önem:** Orta · **Kategori:** Veri kalitesi / UX · **Efor:** S
- **Kanıt:** Şemada `dealerReply`, `dealerRepliedAt`, `fraudScore`, `trustFlagged` var; `route.ts:41-71` bunları ne filtreliyor ne seçiyor.
- **Sorun:** Bayi yanıtladığı müşteriyi 30 gün boyunca listede görmeye devam eder (iş listesi hiç azalmaz); sahte/güvensiz işaretli yorumlar ortalama riski şişirir.
- **Öneri:** API'ye `status` (açık/yanıtlandı) alanı ve "Yalnızca açık olanlar" varsayılan filtresi; `trustFlagged=true` olanları ortalamadan çıkarıp ayrı rozetle göster.

### 10. Erişilebilirlik ve mobil kusurları
- **Önem:** Orta · **Kategori:** Erişilebilirlik / mobil · **Efor:** S
- **Kanıt:** `<Link><Button>` iç içe: `page.tsx:259-261`, `:290-292`, `:347-352`; hover'a bağlı görünürlük `:348`; dağılım çubuğu metin alternatifi yok `:201-220`; Progress'te `aria-label` yok `:141`.
- **Sorun:** İç içe etkileşimli öğe geçersiz HTML ve çift sekme durağı; dokunmatik/klavye kullanıcısı "Detay"ı göremez; ekran okuyucu dağılımı okuyamaz.
- **Öneri:** Tüm bağlantılarda `Button asChild`; düğmeyi her zaman görünür yap (`sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100` en az). Dağılım için `role="img"` + `aria-label="Düşük 12, Orta 5, Yüksek 3"` veya görünür yüzde metni.

### 11. Tutarsız risk eşikleri ve ham İngilizce değerler
- **Önem:** Düşük · **Kategori:** Tutarlılık / i18n · **Efor:** S
- **Kanıt:** Bu sayfa 0.3/0.5 (`route.ts:72-98`), /dealer/ai-insights 0.25/0.5/0.75 (`app/api/ai/detailed/route.ts:89-92`), CLV 0.3/0.5 (`lib/clv-core.ts:41-44`), müdahale varsayılanı 0.6 (`lib/churn-intervention-core.ts:22`); sentiment ham değer `page.tsx:330-334`.
- **Öneri:** `lib/churn-thresholds.ts` gibi tek bir kaynak; tüm yüzeyler aynı kova adlarını ve sınırlarını kullansın. Sentiment için `t('sentiment.negative')` eşlemesi.

### 12. Yükleme deneyimi ve düzen kayması
- **Önem:** Düşük · **Kategori:** Performans / UX · **Efor:** S
- **Kanıt:** `page.tsx:71-84` tam sayfa spinner; ayar kartı ayrı istekle `null`'dan belirir `churn-intervention-settings.tsx:60`; `route.ts:73-98` üç ayrı `count` (her biri `qrCode` ilişkisi üzerinden alt sorgu).
- **Öneri:** KPI ve liste için iskelet; ayar durumunu ana API yanıtına ekleyip tek istekte getir. Üç `count`'u tek bir `$queryRaw` ile `COUNT(*) FILTER (WHERE ...)` biçiminde birleştir (ortalama ve toplam sayı da aynı sorguda).

### 13. Dekoratif gradyan ve küçük ölü kod
- **Önem:** Düşük · **Kategori:** Görsel / kod kalitesi · **Efor:** S
- **Kanıt:** `page.tsx:129-130` (`absolute` öğe; `components/ui/card.tsx` `relative` içermiyor); `getRiskColor` yeşil dalı listede asla çalışmaz (liste ≥0.5, `route.ts:55`); `userId`, `intent`, `period` API'den gelip kullanılmıyor (`page.tsx:34,46,48`).
- **Öneri:** Karta `relative` ekle veya gradyanı kaldır; kullanılmayan alanları ya arayüzde değerlendir (intent rozeti, dönem etiketi, müşteri profiline bağlantı) ya da API'den çıkar.

---

## Eksik özellikler (kıyas ürünlerle)

- **Müşteri bazlı risk profili ve "neden" açıklaması** (Medallia / Qualtrics XM "Predictive Intelligence"): her müşteri için risk sürücüleri (tema, son deneyim, ziyaret sıklığı düşüşü), AI'nin `themes` ve `actionSuggestions` alanlarından üretilmiş tek cümlelik gerekçe.
- **Kapalı döngü (closed-loop) iş akışı** (Medallia, Qualtrics): riskli müşteri → atanmış sorumlu → SLA → yanıt/telafi → sonuç ölçümü (müşteri geri döndü mü). Mevcut ekip modülü (`/dealer/team`) ile görev olarak atama.
- **Hedefli geri kazanım kampanyası** (Square Marketing "Win-back", Toast Marketing): segment önizlemesi, kişisel teklif, gönderim kanalı (push/e-posta), kullanım ve geri dönüş oranı raporu.
- **Trend ve kohort görünümü** (Qualtrics, Square Dashboard): haftalık ortalama risk eğrisi, "bu ay yeni riskli" vs. "kurtarılan" müşteri sayıları, şubeye/QR noktasına göre kırılım.
- **Kurtarma ROI'si**: kurtarılan müşterilerin sonraki harcaması (Consumption verisi mevcut) — "Bu ay müdahale ile 1.840 ₺ geri kazanıldı".
- **Filtre / sıralama / dışa aktarma**: dönem, şube/QR, niyet, yanıt durumu filtreleri; CSV dışa aktarma.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Kimi kaybetmek üzereyim, neden, ve şimdi ne yapmalıyım?" sorusunu tek ekranda, tek tıkla aksiyona bağlayan bir **Elde Tutma Merkezi**. Panel bir rapor değil, küçülen bir iş listesi gibi davranmalı: bayi müşteriyle ilgilendikçe liste azalır, kurtarılan müşteriler başarı olarak görünür.

**Yerleşim:**
1. **Üst şerit (özet):** "Ulaşılabilir riskli müşteri", "Bu ay kurtarılan", "Riskteki tahmini aylık gelir" (bayi-müşteri harcama ortalamasından), "Ortalama risk + 30 günlük mini trend (sparkline)". Otomasyon durumu çipi sağda ("Otomatik müdahale açık · son koşu 03:30") ve ayarları açan Sheet.
2. **Ana alan — iki sütun (masaüstü):** solda müşteri bazlı öncelik listesi (risk, son ziyaret, yorum sayısı, durum: Açık / İletişimde / Kurtarıldı / Kaybedildi; filtre çipleri ve arama). Sağda seçili müşterinin yan paneli: risk sürücüleri, son yorumları, harcama geçmişi ve aksiyon düğmeleri (Yanıtla, Telafi, Kişisel teklif, Ekibe ata). Mobilde liste tam genişlik, seçim alt sayfa (bottom sheet) açar; aksiyonlar başparmak bölgesinde.
3. **Sekmeler:** "Öncelik listesi" · "Müdahale geçmişi" (otomasyon koşuları ve sonuçları) · "Trend" (kova dağılımının haftalık yığılmış alan grafiği).

**Motion / 3D:** 3D gereksiz; bu bir operasyon ekranı. Ölçülü motion yeterli: liste öğesi "Kurtarıldı"ya geçtiğinde `layout` animasyonuyla listeden kayıp "Kurtarılan" sayacına akması (framer-motion `AnimatePresence` + `layoutId`), KPI sayılarında kısa sayı tween'i, yan panel için 200 ms'lik kayma. Mevcut `MotionConfig reducedMotion="user"` korunur; sayaç tween'i azaltılmış harekette devre dışı.

**Veri / API değişiklikleri:**
- `DealerCustomerStats` (veya materialized view): bayi-müşteri çifti bazında son ziyaret, ziyaret, harcama, bu bayiye özel ortalama churn. CLV cron'u bunu da doldurur; hem liste hem otomasyon bunu okur (Bulgu 2).
- `GET /api/dealer/retention?period=30d&status=open&cursor=` → müşteri bazlı sayfalı liste + özet + otomasyon durumu tek yanıtta; `assertModuleEnabled`; try/catch; Redis önbelleği müşteri durumu değişince `dealer-churn:{id}` anahtarını siler.
- `RetentionCase { dealerId, customerId, status, assigneeId?, openedAt, resolvedAt?, outcome? }` ile müşteri bazlı durum takibi; `PATCH /api/dealer/retention/[customerId]`.
- Kişisel teklif modeli (Bulgu 1) ve `POST /api/dealer/retention/offers` (önizleme + onay).
- Eşikler tek modülden (`lib/churn-thresholds.ts`); bayinin ayarladığı eşik hem otomasyonda hem "yüksek risk" kovasında kullanılır.

---

## Çakışmalar / birleştirme önerisi

Bu sayfa, aynı soruyu ("hangi müşterilerimi kaybediyorum?") farklı veri kaynaklarıyla yanıtlayan dört başka yüzeyle çakışıyor:

| Sayfa | Veri kaynağı | Çakışma |
|---|---|---|
| `/dealer/radar` | Consumption, 30+ gün pasif (`app/dealer/radar/page.tsx:25-45`) | "Uyuyan" müşteriler + tekil/toplu teklif düğmeleri — bu sayfanın sahip olmadığı aksiyonlar orada. |
| `/dealer/segment-actions` | CLV segmentleri; "Risk Altında" → `risk-segment` API (`lib/segment-action-center.ts:52-60`) | Riskli segmente tek tık aksiyon — bu sayfadaki "Kampanya oluştur"un olması gereken hali. |
| `/dealer/customers` | CLV `predictedChurn`, churn'e göre sıralama (`app/api/dealer/customers/route.ts:39,67`) | Müşteri bazlı churn listesi (global CLV ile). |
| `/dealer/ai-insights` | Feedback.churnRisk kovaları, farklı eşikler (`app/api/ai/detailed/route.ts:89-92`) | Aynı metriğin farklı kovalarla ikinci gösterimi. |

**Öneri:** `/dealer/churn-risk`, `/dealer/radar` ve `/dealer/segment-actions` tek bir **"Müşteri Elde Tutma"** (`/dealer/retention`) sayfasında birleştirilsin: risk (AI), pasiflik (ziyaret) ve segment (CLV) aynı müşteri satırında üç sinyal olarak görünür; aksiyonlar ortak. Eski rotalar yeni sayfanın ilgili sekmesine yönlendirilsin (`redirect`), sidebar ve `visibility-controls`/`module-controls` katalogları tek anahtara indirgensin. `/dealer/customers` müşteri dizini olarak kalıp her satırdan Elde Tutma yan paneline bağlansın; `/dealer/ai-insights` churn kovasını kaldırıp yalnızca özet + "Elde Tutma'ya git" bağlantısı göstersin.

---

## Doğrulama (şüpheci inceleme)

Her iddia, çağıran ve çağrılan kod baştan okunarak çürütülmeye çalışıldı (kod değiştirilmedi, DB'ye dokunulmadı).

### 1. Churn müdahalesinin flash teklif taslağı hedefsiz ve herkese açık — **DOĞRULANDI (bir ayrıntı düzeltilerek)**

- `lib/churn-intervention-core.ts:88-110`: her `fresh` müşteri için `dealerFlashOffer.create` çağrılıyor; `data` içinde müşteri kimliği yok, her taslak aynı (`'Seni özledik 🎁'`, %15, `maxRedemptions: 1`, `validTo = now + 24 saat`, `isActive: false`).
- `prisma/schema.prisma:2693-2714`: `DealerFlashOffer` modelinde müşteri ya da hedef alanı yok; teklif ile müşteri arasında ilişki kurmak şemada mümkün değil. `analyticsEvent` (`:113-125`) `customerId` taşıyor ama teklif kimliğini taşımıyor, yani bayi hangi taslağın hangi müşteri için olduğunu bile göremiyor.
- `app/api/dealer/innovation/flash-offers/[id]/route.ts:72`: bayi taslağı `isActive: true` yapabiliyor. `app/api/customer/innovation/nearby/route.ts:35-86` aktif teklifleri müşteri filtresi olmadan, yalnızca mesafeye göre **yakındaki tüm müşterilere** döndürüyor (radar da `app/api/customer/innovation/radar/route.ts:78-79` ile başlıkları kullanıyor).
- UI vaadi: `components/dealer/churn-intervention-settings.tsx:113` "Riskli müşteri için %15 indirim taslağı" diyor; bildirim (`churn-intervention-core.ts:135`) da taslakların "onayınızı beklediğini" söylüyor.
- **Düzeltme:** "Yakındaki ilk rastgele kullanıcı kullanır" ifadesi kesin değil. `redemptionCount` hiçbir yerde artırılmıyor (grep: yalnızca `nearby/route.ts:73` ve `dealer-flash-offer-expiry/route.ts:30` okuyor), yani `maxRedemptions: 1` fiilen hiçbir şeyi sınırlamıyor; teklif 24 saatlik pencere boyunca yakındaki **herkese** gösteriliyor. Bu, iddiadakinden daha geniş bir etki.
- **Birikme:** `app/api/internal/inngest/dealer-flash-offer-expiry/route.ts:19-31` yalnızca `isActive: true` kayıtları kapatıyor; `app/api/cron/db-cleanup/route.ts` flash teklife hiç dokunmuyor. Aktive edilmeyen taslaklar silinmiyor. Birikme hızı `maxPerRun` (≤100) ve 7 günlük tekrar engeliyle sınırlı, bu yüzden bu bir veri hijyeni sorunu, felaket değil.
- **Yeniden üretim:** Bayi müdahaleyi ve `autoFlashOffer`'ı açar. Gece koşusu 5 riskli müşteri bulur ve 5 özdeş pasif taslak oluşturur. Bayi bildirimdeki "onayınızı bekliyor" metnine güvenip birini aktive eder. 15 km içindeki her müşteri `/api/customer/innovation/nearby` üzerinden "Seni özledik %15" teklifini görür; riskli müşteriye özel bir şey gitmez.
- **Önem:** Yüksek (ürün mantığı ve marj kaybı). Veri sızıntısı yok.

### 2. Bayi bazlı müdahale, platform genelindeki CLV churn ve `lastPurchaseAt` değerleriyle çalışıyor — **DOĞRULANDI**

- `prisma/schema.prisma:2069-2087`: `CustomerLifetimeValue.userId @unique`; `dealerId` yok, yani her müşteri için tek bir global satır var.
- `lib/clv-core.ts:80-87`: `consumption.groupBy({ by: ['customerId'] })` bayi filtresi içermiyor; `lastPurchaseAt = _max.createdAt` tüm bayilerdeki son tüketim.
- `lib/clv-core.ts:93-106`: `feedback.groupBy(['userId'])` ve `consumptionReview.groupBy(['customerId'])` bayi filtresi içermiyor; `predictedChurn` tüm işletmelerdeki yorumların ağırlıklı ortalaması.
- `lib/churn-intervention-core.ts:54-68`: bayi yalnızca aday kümesini (`consumption.groupBy where dealerId`) daraltıyor; eşik (`predictedChurn`) ve pasiflik (`lastPurchaseAt`) filtreleri global değerler üzerinde çalışıyor.
- **Yeniden üretim (yanlış negatif):** Müşteri M, 40 gün önce X bayisinden aldı, dün Y bayisinden aldı. M'nin global `lastPurchaseAt` değeri dün, yani X için `inactiveDays=14` filtresine takılmıyor ve X'in kaybettiği müşteri hiç işaretlenmiyor.
- **Yeniden üretim (yanlış pozitif):** M, Y'de üç kötü yorum bıraktı (`churnRisk` ≈ 0.9), X ile ilişkisi sorunsuz ve son ziyareti 20 gün önce. X'e "kaybedilme riski yüksek" uyarısı gidiyor ve (açıksa) teklif taslağı oluşuyor.
- **Kiracılar arası etki:** Bir kiracının yorum verisi diğer kiracının uyarı sayısını ve taslak üretimini değiştiriyor. Ancak bayiye müşteri kimliği gösterilmiyor (bildirim yalnızca sayı taşıyor, `:129-139`; `churn_intervention` event'ini okuyan bir UI yok). Bu yüzden bu bir **doğruluk** hatası; kişisel veri sızıntısı **değil**.
- **Önem:** Yüksek (otomasyonun temel sinyali yanlış kapsamda).

### 3. Hata yanıtları sessizce "riskli kayıt yok" olarak gösteriliyor — **DOĞRULANDI**

- `app/dealer/churn-risk/page.tsx:62-68`: `res.ok` kontrol edilmiyor. JSON gövdeli bir hata yanıtında (`requireAuth`, `lib/api-auth.ts:58-77`: 401, rol 403, token-replay 403 hepsi JSON) `json.churnRisk` tanımsız kalıyor, `data` `null` oluyor ve **toast da gösterilmiyor**.
- `app/api/dealer/churn-risk/route.ts`: try/catch yok. Prisma ya da Neon hatasında Next.js gövdesiz 500 döndürüyor, `res.json()` patlıyor ve toast gösteriliyor, ama sayfa yine boş veriyle çiziliyor.
- Her iki durumda da render şöyle oluyor: `page.tsx:147` "AI analizi bekleniyor", `:183` yüksek risk `0`, `:283-289` yeşil kalkanlı "Yüksek riskli kayıt yok". Hata ile "sağlıklı" durum görsel olarak ayırt edilemiyor.
- **Yeniden üretim:** Mobil ağda IP değişir ve `checkTokenReplay` 403 JSON döner (ya da Neon zaman aşımı olur). Bayi, gerçekte 12 yüksek riskli yorumu varken yeşil kalkan ve "kayıt yok" görür.
- **Önem:** Orta. Yanlış güven sinyali, ama veri bozulması yok. Çözüm: `res.ok` kontrolü ile ayrı bir `error` durumu ("Veriler yüklenemedi, Tekrar dene") ve rotada `responseIfDatabaseUnavailable` + try/catch deseni.

### 4. "Yüksek risk müşteri" sayısı aslında geri bildirim sayısı — **DOĞRULANDI**

- `app/api/dealer/churn-risk/route.ts:90-96`: `highRiskCount = prisma.feedback.count(...)`, yani satır sayısı. `userId` üzerinde `distinct` yok.
- `prisma/schema.prisma:769`: `Feedback.userId String? // Can be anonymous`. Anonim yorumlar da sayıya giriyor.
- Etiketler: `page.tsx:184` → `customersWord` = "müşteri" (`messages/tr.json:1557`); `page.tsx:256` → `recommendedBody` = "{count} yüksek riskli müşteriye özel kampanya…" (`messages/tr.json:1563`). Aynı sayfa ikinci KPI'da (`:165-166`) aynı türden sayıyı doğru biçimde "geri bildirim" diye etiketliyor; bu tutarsızlık da hatayı teyit ediyor.
- **Yeniden üretim:** Tek bir müşteri 30 gün içinde 6 kez düşük puanlı yorum bırakır, 4 anonim yorum daha gelir. KPI "10 müşteri" ve "10 yüksek riskli müşteriye kampanya başlatın" der; ulaşılabilir müşteri sayısı 1'dir.
- **Önem:** Orta (karar destek metriği yanlış etiketli). Çözüm: ya `groupBy userId` (null hariç) ile tekil müşteri ve ayrıca "anonim yorum" sayısı verilmeli, ya da etiket "yüksek riskli geri bildirim" olarak düzeltilmeli. Tercih edilen, müşteri bazlı sayımdır, çünkü kampanya hedeflemesi müşteri üzerinden yapılır.

### Özet

| # | İddia | Karar |
|---|---|---|
| 1 | Hedefsiz flash teklif taslağı | Doğrulandı (gerçek etki daha geniş: kullanım sayacı hiç artmıyor) |
| 2 | Global CLV ile bayi bazlı müdahale | Doğrulandı (doğruluk hatası, kimlik sızıntısı yok) |
| 3 | Hata = "risk yok" görünümü | Doğrulandı |
| 4 | Müşteri yerine yorum sayısı | Doğrulandı |
