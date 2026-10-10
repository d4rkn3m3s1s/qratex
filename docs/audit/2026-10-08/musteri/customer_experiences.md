# /customer/experiences

**Amaç:** Müşterinin belirli bir işletmedeki geçmişini (ziyaret sayısı, sadakat kademesi, son 3 deneyim) görmesi; o işletme için arkadaşına anonim bir "deneyim kartı" linki üretmesi ve işletmeye "şikâyet değil, iyileştirme isteği" göndermesi.

**Genel puan: 3/10** · **Karar: yeniden inşa (ve "İşletme Detayı" deneyimine birleştir)**

Sayfanın arkasındaki üç fikir (işletme bazlı sadakat, anonim paylaşım, yapıcı geri bildirim) değerli. Ancak mevcut haliyle sayfa sıradan bir tüketici için **kullanılamaz**: girişi, müşterinin hiçbir yerde göremediği ham bir `dealerId` (cuid) yazmaya bağlı. Sayfa menüden bilerek çıkarılmış. "İyileştirme isteği" bayi tarafında hiçbir ekranda okunmayan, yalnızca veritabanına yazılan bir kayıt (kara delik). Paylaşım metni sabit kodlu. Ayrıca rate-limit ve işletme ilişkisi doğrulaması olmadığı için iki uç kötüye kullanıma açık.

İncelenen dosyalar: `app/customer/experiences/page.tsx`, `app/customer/experiences/layout.tsx`, `app/customer/layout.tsx`, `app/api/customer/experiences/at-dealer/route.ts`, `app/api/customer/experience-share/route.ts`, `app/api/customer/improvement-request/route.ts`, `app/api/public/experience-share/[token]/route.ts`, `app/(public)/experience/[token]/page.tsx`, `lib/customer-dealer-experiences.ts`, `lib/admin-toast.ts`, `lib/module-controls.ts`, `lib/visibility-controls.ts`, `components/dashboard/sidebar.tsx`, `app/customer/discover/page.tsx`, `prisma/schema.prisma` (ExperienceShareToken, ImprovementRequest, Feedback, ConsumptionReview), `messages/tr.json`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | API'ler teknik olarak çalışıyor, fakat giriş noktası (ham ID) kullanıcıya hiçbir yerde sunulmuyor; iyileştirme isteğinin okuyucusu yok; paylaşım metni sabit. |
| UX | 2/10 | Kullanıcıdan veritabanı kimliği istemek tüketici ürününde kabul edilemez; sayfa başlığı yok, payload yokken sayfa boş tek bir kart; müşteri bayinin SLA'sını kendisi seçiyor. |
| Görsel | 3/10 | Düz shadcn kartları; diğer müşteri sayfalarındaki `DashboardPageHero` kalıbı yok; sadakat/ilerleme görselleştirmesi yok; oyunlaştırma dilinden kopuk. |
| Mimari | 4/10 | API'ler küçük, zod ile doğrulanmış ve IDOR yok; ama modül anahtarı (`experiences`) API'lerde uygulanmıyor, rate-limit yok, iyileştirme isteği yaşam döngüsü (status) hiç kullanılmıyor, kayıt+bildirim transaction dışı. |
| Performans | 6/10 | Sorgular hafif (2+2 paralel sorgu); fakat `?dealerId=` ile açılışta her tuş vuruşunda yeni fetch ve sıralama-yarışı var. |
| Erişilebilirlik + mobil | 4/10 | Mobilde butonlar `min-h-10`/tam genişlik düşünülmüş; ama `Label`'lar input'a bağlı değil, h1 yok, "★" ekran okuyucuda anlamsız, Select'in erişilebilir adı yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Segment metadata (başlık/açıklama) | KISMİ | `app/customer/experiences/layout.tsx:4-6`, `messages/tr.json:103-104` | Açıklama "Seçilmiş işletme hikayeleri, damgalar ve tekrar oynatılabilir öne çıkanlar" — sayfada bunların hiçbiri yok. |
| 2 | Sayfa başlığı / hero (h1) | EKSİK | `page.tsx:142-161` | İlk eleman doğrudan "İşletme" kartı; diğer sayfalar `DashboardPageHero` kullanıyor (`app/customer/discover/page.tsx:71-77`). |
| 3 | Menüden erişim | EKSİK | `components/dashboard/sidebar.tsx:275-276` | Bilinçli olarak menüden çıkarılmış; tek giriş `/customer/discover` (o da menüde değil) `discover/page.tsx:62`. |
| 4 | İşletme ID manuel girişi | BOZUK (ürün olarak) | `page.tsx:146-156` | Açıklama "yakın sayfasından veya fişten edinebilirsiniz" diyor; `/customer/nearby` ID'yi yalnızca DOM `id`/`key` olarak kullanıyor (`app/customer/nearby/page.tsx:628`), hiçbir müşteri ekranı ID'yi metin olarak göstermiyor. |
| 5 | `?dealerId=` ile ön yükleme | KISMİ | `page.tsx:38-41, 75-77` | Hiçbir sayfa bu parametreyle link vermiyor (grep: `experiences?dealerId` sonuçsuz). Ayrıca tuş vuruşu başına fetch hatası (Bulgu B4). |
| 6 | "Yükle" butonu | KISMİ | `page.tsx:157-159`, `messages/tr.json:252` | `common.upload` = "Yükle/Upload" — anlam olarak yanlış (veri getiriliyor, dosya yüklenmiyor). |
| 7 | Yükleniyor durumu | KISMİ | `page.tsx:158` | Yalnız buton metni değişiyor; iskelet yok, `aria-busy` yok. |
| 8 | Hata durumu | KISMİ | `page.tsx:67-70`, `lib/admin-toast.ts:16-19` | Yalnız toast; admin toast'u "Dikkat: " / "Basarili: " (ş'siz, dil bağımsız sabit önek) ekliyor. Satır içi hata yok. |
| 9 | Boş durum (işletme seçilmemiş) | EKSİK | `page.tsx:163` | `payload` yoksa sayfanın geri kalanı tamamen boş; öneri/son ziyaret edilen işletmeler yok. |
| 10 | İşletme adı başlığı | ÇALIŞIYOR | `page.tsx:166-170`, `at-dealer/route.ts:45` | |
| 11 | Ziyaret sayısı | KISMİ | `lib/customer-dealer-experiences.ts:67-73` | Feedback sayısı + Consumption sayısı toplanıyor; aynı ziyarette hem tüketim hem geri bildirim varsa iki ziyaret sayılıyor. |
| 12 | Sadakat kademesi rozeti | SAHTE | `lib/customer-dealer-experiences.ts:75-88`, `page.tsx:178-180` | Sabit dizi etiket; hiçbir `UserBadge`/puan/ödül tetiklemiyor, kalıcı değil. |
| 13 | "Sonraki rozet eşiği" metni | SAHTE | `page.tsx:181-185` | Eşiğe ulaşınca rozet verilmiyor; vaat gerçek bir sistemle bağlı değil. İlerleme çubuğu yok. |
| 14 | Son 3 deneyim listesi | KISMİ | `page.tsx:188-212`, `lib/customer-dealer-experiences.ts:26-65` | Çalışıyor ama etiket `topics[0]` ham İngilizce anahtar ("service", "quality") — `schema.prisma` Feedback.topics yorumu; ya da metnin ilk >2 harfli kelimesi (anlamsız etiket). |
| 15 | Deneyim boş durumu | ÇALIŞIYOR | `page.tsx:193-194` | "Henüz kayıt yok." — CTA (QR okut) yok. |
| 16 | Deneyim türü (feedback / review) gösterimi | EKSİK | `page.tsx:27-33` vs `196-209` | `kind` API'den geliyor, tip tanımında var, UI'da kullanılmıyor. |
| 17 | Deneyim satırından detaya gitme | EKSİK | `page.tsx:197-208` | Satır tıklanabilir değil; `/customer/feedbacks` veya tüketim detayına link yok. |
| 18 | Deneyim kartı oluştur (paylaşım linki) | KISMİ | `page.tsx:79-104`, `experience-share/route.ts:17-67` | Çalışıyor; her tıklamada yeni token, tekrar kullanım yok. |
| 19 | Paylaşım notu / ruh hâli seçimi | SAHTE | `page.tsx:91-92` | Caption `'Bu hafta buradaydık — gelirsen şunu dene.'` ve `mood: 'good'` sabit kodlu; API ikisini de destekliyor (`experience-share/route.ts:12-13`). "şunu" hiçbir şeye işaret etmiyor. |
| 20 | Paylaşım linki gösterimi | ÇALIŞIYOR | `page.tsx:230-238` | `truncate` ile tek satır. |
| 21 | Kopyala | KISMİ | `page.tsx:136-140` | `writeText` await edilmiyor; izin reddi/HTTP'de de "Link kopyalandı" diyor. |
| 22 | Yerel paylaşım (Web Share API / WhatsApp) | EKSİK | `page.tsx:227-238` | Mobil öncelikli üründe `navigator.share` yok. |
| 23 | Paylaşım linkinin işletme değişince sıfırlanması | BOZUK | `page.tsx:45, 97` | `shareUrl` hiç sıfırlanmıyor; B işletmesine geçince A'nın linki görünmeye devam ediyor. |
| 24 | İyileştirme şablon seçimi | ÇALIŞIYOR | `page.tsx:254-266`, `improvement-request/route.ts:11` | Değerler API enum'u ile uyumlu. |
| 25 | İyileştirme mesajı | KISMİ | `page.tsx:268-275` | Karakter sayacı / `maxLength=2000` yok; 2000 üstü sunucuda İngilizce zod hatası döner. |
| 26 | "Tahmini dönüş (saat)" alanı | BOZUK (ürün mantığı) | `page.tsx:277-280`, `route.ts:13, 48` | Bayinin taahhüdünü müşteri belirliyor. 12 altı / ondalıklı değerde zod'un İngilizce mesajı toast'a düşüyor (`route.ts:32`). |
| 27 | İyileştirme isteği gönder | KISMİ | `page.tsx:106-134` | Gösterilen işletmeye değil, input'taki o anki ID'ye gidiyor (Bulgu B3). |
| 28 | Bayiye bildirim | KISMİ | `improvement-request/route.ts:60-71` | Bildirim mesajın içeriğini ve müşteriyi içermiyor; transaction dışı. |
| 29 | Bayi tarafında isteği görme / yanıtlama / durum güncelleme | EKSİK | grep `improvementRequest` → yalnız `create` (`route.ts:50`) | `status` alanı (`schema.prisma:2793`) hiç güncellenmiyor; hiçbir dealer sayfası/API bu tabloyu okumuyor. |
| 30 | Müşterinin geçmiş isteklerini / yanıtları görmesi | EKSİK | — | Müşteriye "tahmini dönüş" vaadi verilip takip ekranı yok. |
| 31 | Herkese açık paylaşım sayfası `/experience/[token]` | KISMİ | `app/(public)/experience/[token]/page.tsx` | Çalışıyor; ancak client-side, OG/SSR metadata yok (WhatsApp önizlemesi boş), işletmeye gitme/yol tarifi CTA'sı yok, başlık "Bu hafta şunu denedik" yine "şu"yu tanımlamıyor. |
| 32 | Paylaşım görüntülenme sayacı | KISMİ | `public/experience-share/[token]/route.ts:25-29` | Her GET artırıyor (yenileme, bot, sahibin kendisi); dedupe yok. Müşteri kendi kartının kaç kez görüldüğünü göremiyor. |
| 33 | Yetki (CUSTOMER/ADMIN) | ÇALIŞIYOR | `at-dealer/route.ts:14`, `experience-share/route.ts:18`, `improvement-request/route.ts:26` | Kullanıcı yalnızca kendi verisini görüyor; IDOR yok. |
| 34 | Modül kapatma (`experiences`) | BOZUK | `lib/module-controls.ts:30`; grep `'experiences'` app/api → sonuçsuz | Admin modülü kapatsa da üç API çalışmaya devam ediyor; `proxy.ts` sayfayı da engellemiyor. |
| 35 | Rate-limit | EKSİK | üç route'ta `rateLimit` yok | `lib/rate-limit.ts` mevcut ama kullanılmamış. |
| 36 | İşletme ilişkisi doğrulaması | EKSİK | `experience-share/route.ts:29-38`, `improvement-request/route.ts:37-46` | Yalnız "DEALER rolünde mi" kontrolü; müşterinin o işletmede hiç kaydı olması gerekmiyor. |
| 37 | Süresi dolan token temizliği | EKSİK | grep `experienceShare` cron → sonuçsuz | Tablo sınırsız büyür. |
| 38 | i18n | KISMİ | `page.tsx:81, 91, 98, 108, 125-126, 139, 146-155, 168-183, 189, 194, 220-283` | `useAppT` import edilmiş ama metinlerin ~%90'ı sabit Türkçe; placeholder "dealer id" İngilizce; tarih `toLocaleString()` uygulama dilini değil tarayıcıyı kullanıyor. |
| 39 | Form erişilebilirliği | KISMİ | `page.tsx:154-155, 254-255, 269-270, 278-279` | `Label`'larda `htmlFor`, input'larda `id` yok; Select'in erişilebilir adı yok. |
| 40 | Mobil düzen | KISMİ | `page.tsx:152-153, 227, 231-236` | Sarma ve dokunma hedefleri düşünülmüş; ama ID yazmak mobilde imkânsıza yakın; tamamen statik, hiçbir mikro-etkileşim yok. |
| 41 | `useSearchParams` için Suspense sınırı | doğrulanmadı | `page.tsx:38` | Üst layout dinamik olduğundan pratikte build kırmıyor olabilir; çalıştırılmadı. |

Durum sayımı (41 özellik): ÇALIŞIYOR 5 · KISMİ 17 · BOZUK 4 · SAHTE 3 · EKSİK 11 · doğrulanmadı 1.

---

## Bulgular

### B1 — Kritik · Güvenlik/Kötüye kullanım · İyileştirme isteği uç noktası sınırsız bildirim spam'ine açık
- **Kanıt:** `app/api/customer/improvement-request/route.ts:25-71` — rate-limit yok, müşterinin işletmeyle ilişkisi kontrol edilmiyor, her istek hem `ImprovementRequest` satırı hem bayiye `Notification` yaratıyor.
- **Sorun:** Herhangi bir müşteri hesabı (veya script) bir `dealerId` bildiği anda (ID'ler `favorites`, `nearby` gibi API yanıtlarında dönüyor) o işletmeye dakikada yüzlerce bildirim ve 2000 karakterlik kayıt yağdırabilir. Bayi bildirim akışı kullanılamaz hale gelir; veritabanı şişer.
- **Öneri:** (1) `lib/rate-limit.ts` ile kullanıcı+işletme başına (örn. 24 saatte 3) ve kullanıcı başına global sınır. (2) Uygunluk kuralı: müşterinin son N gün içinde o işletmede `Consumption` veya `Feedback` kaydı olmalı (`countVisitsAtDealer > 0` zaten mevcut, yeniden kullanılabilir). (3) Kayıt + bildirimi `prisma.$transaction` içine al ya da outbox'a (`OutboxEvent` modeli var) taşı. (4) Aynı işletmeye açık bir istek varken yeni istek yerine mevcuda ekleme yap.
- **Efor:** S

### B2 — Yüksek · Güvenlik/Marka · Paylaşım linki ile marka alan adında keyfi metin yayınlanabiliyor
- **Kanıt:** `app/api/customer/experience-share/route.ts:10-14, 43-52` (caption ≤200 karakter, serbest metin, moderasyon yok, ilişki kontrolü yok, rate-limit yok); `app/(public)/experience/[token]/page.tsx:73-83` işletme adının altında caption'ı olduğu gibi gösteriyor.
- **Sorun:** UI caption'ı sabit gönderse de API serbest metin kabul ediyor. Saldırgan, hiç gitmediği bir işletmenin adıyla, Qratex alan adında "anonim deneyim kartı" olarak iftira/yanıltıcı içerik barındıran linkler üretebilir; sınırsız token yaratabilir.
- **Öneri:** Caption'ı mevcut AI moderasyon/küfür filtresinden geçir; paylaşımı yalnızca müşterinin gerçek bir deneyim kaydına (`feedbackId` / `consumptionReviewId`) bağla, böylece kart doğrulanmış bir deneyimi temsil eder; kullanıcı başına günlük token sınırı; bayiye "kötüye kullanım bildir" yolu ve admin tarafında token iptali.
- **Efor:** M

### B3 — Yüksek · Veri bütünlüğü · Aksiyonlar ekranda gösterilen işletmeye değil, input'taki ID'ye gidiyor
- **Kanıt:** `page.tsx:90, 120` `dealerId.trim()` kullanıyor; ekranda gösterilen ise `payload.dealerId`/`payload.dealerLabel` (`page.tsx:169`).
- **Sorun:** Kullanıcı A işletmesini yükleyip input'u düzenlerse (Getir'e basmadan), "İyileştirme isteği gönder" ve "Deneyim kartı oluştur" B'ye (veya yarım bir ID'ye → 404) gider; ekranda hâlâ A yazıyor. Yanlış işletmeye şikâyet/link gitmesi mümkün.
- **Öneri:** Bütün aksiyonlar `payload.dealerId`'yi kullanmalı; daha doğrusu serbest ID girişi tamamen kaldırılıp işletme seçimi bir seçiciden (bkz. B5) gelmeli ve aksiyonlar seçilen işletmenin bağlamına kilitlenmeli.
- **Efor:** S

### B4 — Orta · Hata/Performans · `?dealerId=` ile açılınca her tuş vuruşunda fetch + hata toast'u + yarış koşulu
- **Kanıt:** `page.tsx:53-73` `load` `[dealerId]`'ye bağlı; `page.tsx:75-77` effect `[initialDealer, load]`'a bağlı. `initialDealer` doluyken `dealerId` her değiştiğinde `load` yeniden yaratılır → effect yeniden çalışır → yarım ID ile istek atılır → "Dikkat: İşletme bulunamadı" toast'u ve `payload=null`. İsteklerde `AbortController` yok; geç dönen eski yanıt yeni yanıtın üzerine yazabilir. Ayrıca `t` bağımlılık dizisinde yok.
- **Öneri:** Effect'i yalnızca mount'ta `initialDealer` ile çalıştır; veri katmanını TanStack Query'ye (projede zaten kullanılıyor, `favorites/page.tsx:50`) `queryKey: ['dealer-experience', selectedDealerId]` ile taşı — iptal, önbellek, yarış koruması otomatik gelir.
- **Efor:** S

### B5 — Yüksek · UX/Bilgi mimarisi · Giriş noktası kullanıcıya erişilemez (ham ID) ve sayfa menüde yok
- **Kanıt:** `page.tsx:146-156` ("Bayi / işletme kullanıcı ID", placeholder "dealer id"); ID hiçbir müşteri ekranında metin olarak gösterilmiyor (`nearby/page.tsx:628` yalnız DOM id); `?dealerId=` ile link veren sayfa yok; `components/dashboard/sidebar.tsx:275-276` sayfa menüden çıkarılmış.
- **Sorun:** Gerçek bir tüketici bu sayfayı işlevsel olarak kullanamaz. Sayfa pratikte demo senaryosu için var (`lib/innovation-demo-scenario.ts:44-55`).
- **Öneri:** ID girişini kaldır. İki yol: (a) Sayfayı "Mekânlarım" listesine dönüştür — müşterinin tüketim/geri bildirim yaptığı işletmeleri `GET /api/customer/experiences/venues` (groupBy dealerId, son ziyaret, ziyaret sayısı) ile kart grid'i olarak listele, karta tıklayınca `/customer/experiences/[dealerId]` detayına git. (b) Daha iyisi: bu içeriği tek bir "İşletme detayı" sayfasına birleştir ve `nearby`, `favorites`, `consumptions`, `feedbacks` listelerinden oraya link ver (bkz. Çakışmalar).
- **Efor:** M

### B6 — Yüksek · İşlevsellik · "İyileştirme isteği" bir kara delik: bayi okuyamıyor, müşteri takip edemiyor
- **Kanıt:** Kod tabanında `improvementRequest` yalnızca `create` ile kullanılıyor (`improvement-request/route.ts:50`); `status` alanı (`schema.prisma:2793`) hiç güncellenmiyor; bayiye giden bildirim mesajın içeriğini ve tıklanacak hedefi içermiyor (`route.ts:60-71`).
- **Sorun:** Müşteriye "Tahmini dönüş: …" toast'u ile somut bir zaman vaadi veriliyor (`page.tsx:125-127`) ama bayinin bu talebi görmesinin, yanıtlamasının bir yolu yok. Bu, ürünün en kritik vaadi olan "sesin duyuluyor" duygusunu tersine çeviriyor.
- **Öneri:** Ya tamamen kaldırılmalı ya da mevcut geri bildirim/telafi (`/customer/remedy`, `RemedyOffer`, `remedyTimelineEvent`) hattına bağlanmalı: iyileştirme isteği bir `Feedback` alt tipi veya `ActionItem` olarak bayinin mevcut geri bildirim kuyruğuna düşsün; bayi yanıtı `dealerReply` deseniyle (feedbacks sayfasında zaten var, `app/customer/feedbacks/page.tsx:44-45`) müşteriye dönsün; SLA'yı bayi ayarı belirlesin; durum (open → seen → replied → resolved) müşterinin geri bildirimler sayfasında zaman çizelgesi olarak görünsün.
- **Efor:** L

### B7 — Orta · Ürün mantığı · Müşteri bayinin yanıt süresini kendisi seçiyor
- **Kanıt:** `page.tsx:277-280` "Tahmini dönüş (saat)" input'u; `route.ts:13, 48, 64, 77` değer doğrudan bildirime ve "beklenen dönüş" yanıtına yazılıyor.
- **Sorun:** Tahmini dönüş bayinin taahhüdüdür; müşterinin 12 saat yazması bayiyi bağlamaz, yanlış beklenti yaratır. 12'nin altı veya ondalık değer girilince zod'un İngilizce hata metni ("Number must be greater than or equal to 12") toast'a düşer (`route.ts:31-33`).
- **Öneri:** Alanı kaldır; SLA'yı bayi profilinden/geri bildirim ayarlarından oku; müşteriye "Bu işletme genelde X saat içinde yanıt veriyor" bilgisini gerçek medyan yanıt süresinden (`dealerRepliedAt - createdAt`) hesaplayıp göster.
- **Efor:** S

### B8 — Orta · Oyunlaştırma dürüstlüğü · Sadakat "rozeti" ve "sonraki rozet eşiği" sahte
- **Kanıt:** `lib/customer-dealer-experiences.ts:75-88` sabit etiket dizisi; `page.tsx:178-185`. Hiçbir `UserBadge`, puan veya ödül oluşturulmuyor; ziyaret sayımı feedback+tüketimi çift sayıyor (`:67-73`).
- **Sorun:** Kullanıcıya "rozet eşiği" vaat edilip gerçek rozet sisteminden (karakter rozeti, `/customer/badges`) kopuk bir etiket gösteriliyor. Rozet koleksiyonunda hiç görünmeyecek. Ziyaret sayısı da şişik.
- **Öneri:** Ya gerçek işletme bazlı damga kartına (Starbucks "stars", kahve damga kartı) dönüştür — ziyaret = gün bazında tekilleştirilmiş tüketim (`date_trunc('day')` distinct), eşiklerde gerçek ödül/kupon (`Coupon`/`RemedyOffer` altyapısı) — ya da "rozet" kelimesini kaldırıp nötr "ziyaret kademesi" olarak sun. Ekonomi değişmezlerine (tek seferlik atomik kredi) uyulmalı.
- **Efor:** M (dürüst etiket: S; gerçek damga kartı: L)

### B9 — Orta · İşlevsellik · Paylaşım kartı içeriği sabit; kullanıcı ne paylaştığını seçemiyor
- **Kanıt:** `page.tsx:91-92` sabit caption ve mood; API caption/mood destekliyor (`experience-share/route.ts:12-13`); açık sayfa yalnız işletme adı + not gösteriyor (`app/(public)/experience/[token]/page.tsx:72-89`).
- **Sorun:** "gelirsen şunu dene" cümlesi bir ürünü işaret etmiyor; kart deneyimin kendisini (puan, ürün, fotoğraf) içermiyor; açılan sayfada işletmeye gitme CTA'sı, adres, menü yok; client-side olduğu için WhatsApp/Instagram önizlemesi (OG) boş. Viral döngü kurulmamış.
- **Öneri:** Paylaşımı belirli bir deneyim satırından başlat ("Bu deneyimi paylaş"); mood (Harika/Güzel/Tamam) ve kısa not seçimi; önerilen ürünü (`Consumption` → `Product`) karta ekle; açık sayfayı server component + `generateMetadata` + `opengraph-image` (Next `ImageResponse`) ile kartı görsel önizleme olarak üret; CTA: "Haritada aç", "Qratex ile QR okut, ilk ziyaret bonusu" → referral koduna bağla (`ReferralCode` var).
- **Efor:** M

### B10 — Orta · Mimari · Admin modül anahtarı uygulanmıyor
- **Kanıt:** `lib/module-controls.ts:30` (`experiences` modülü), `lib/visibility-controls.ts:89`; üç API'de `assertModuleEnabled`/`assertMenuItemVisible` yok (diğer customer API'leri kullanıyor, örn. `app/api/customer/discovery/route.ts:105`).
- **Sorun:** Admin "Deneyimler" modülünü kapatsa bile uçlar ve sayfa çalışır; admin paneli yanlış güvence verir.
- **Öneri:** Üç route'a `assertModuleEnabled('experiences', { role: 'customer', request, userId })` ekle; sayfa tarafında modül kapalıyken bilgilendirici boş durum göster.
- **Efor:** S

### B11 — Düşük · Hata · Paylaşım linki işletme değişince eski kalıyor; kopyalama sonucu doğrulanmıyor
- **Kanıt:** `page.tsx:45` (`shareUrl` hiç sıfırlanmıyor), `page.tsx:136-140` (`writeText` await edilmeden "kopyalandı").
- **Öneri:** `shareUrl`'i seçili işletmeye anahtarla (`Record<dealerId, url>`) veya payload değişiminde sıfırla; `await navigator.clipboard.writeText` + try/catch, başarısızsa input'u seçili hale getir; mobilde önce `navigator.share`.
- **Efor:** S

### B12 — Düşük · i18n/Tutarlılık · Sabit Türkçe metinler, İngilizce anahtar sızıntısı, admin toast önekleri
- **Kanıt:** `page.tsx` metinlerinin büyük kısmı sabit; `page.tsx:155` placeholder "dealer id"; `lib/customer-dealer-experiences.ts:12-14` `topics[0]` ham anahtar ("service"); `page.tsx:126, 206` locale'siz tarih; `lib/admin-toast.ts:17-19` müşteri sayfasında "Basarili: " (ş yok) / "Dikkat: " öneki; API hata metinleri sabit Türkçe (`at-dealer/route.ts:20, 30`).
- **Öneri:** Tüm metinleri `customerExperiences.*` anahtarlarına taşı; topic anahtarlarını mevcut topic çeviri sözlüğüyle çevir; `Intl.DateTimeFormat(locale)`; müşteri panelinde öneksiz `sonner` toast'u kullan; API'ler hata kodu (`DEALER_NOT_FOUND`) dönsün, UI çevirsin.
- **Efor:** S

### B13 — Düşük · Erişilebilirlik · Form etiketleri bağlı değil, başlık hiyerarşisi yok
- **Kanıt:** `page.tsx:154-155, 254-255, 269-270, 278-279` (`Label`'da `htmlFor` yok, input'ta `id` yok); `page.tsx:143-146` h1 yok; `page.tsx:201` "★" metin olarak okunuyor.
- **Öneri:** `useId()` ile label-input bağlantısı; `DashboardPageHero` ile h1; puanı `aria-label="5 üzerinden 4 puan"` ile ver, yıldızı `aria-hidden` yap; sonuç bölgesine `aria-live="polite"`.
- **Efor:** S

### B14 — Düşük · Veri hijyeni · Görüntülenme sayacı şişirilebilir, süresi dolan tokenlar temizlenmiyor
- **Kanıt:** `app/api/public/experience-share/[token]/route.ts:25-29` her GET'te artış; cron'larda `experienceShareToken` temizliği yok.
- **Öneri:** Redis'te `token:ip-hash` ile 24 saatlik tekil sayım; bot UA'larını hariç tut; mevcut `db-cleanup` cron'una süresi 30+ gün önce dolmuş tokenların silinmesini ekle.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **İşletme bazlı damga/ilerleme kartı (Starbucks Rewards, kahve damga kartları):** görsel damga ızgarası, bir sonraki ödüle kalan ziyaret, eşikte gerçek ödül; şu an yalnızca metin etiketi var.
2. **"Mekânlarım" listesi (Revolut/Monzo işyeri görünümü):** müşterinin gittiği tüm işletmeler, son ziyaret, toplam harcama, ortalama puan; işletmeye dokununca işlem geçmişi. Şu an ID yazmak gerekiyor.
3. **Deneyim zaman çizelgesi:** her ziyaretin puanı, ürünü, bayi yanıtı, kazanılan XP/puan tek akışta (Monzo işlem detayı); şu an yalnız 3 satır ve tıklanamaz.
4. **Paylaşılabilir görsel kart (Spotify Wrapped):** OG görseli otomatik üretilen, hikâye formatında (9:16) kart, Web Share API ile tek dokunuşla; referral koduna bağlı.
5. **Kapalı döngü geri bildirim takibi:** gönderilen iyileştirme isteğinin durumu, bayinin yanıtı, "çözüldü" onayı ve memnuniyet sorusu (Duolingo'nun net ilerleme geri bildirimi gibi şeffaf durum).
6. **Kişisel içgörü:** "Bu işletmede en çok X'i seviyorsun", "Son ziyaretinden beri 14 gün geçti — geri dön bonusu" gibi davranışsal teşvikler (mevcut AI içgörü altyapısıyla).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Mekânlarım" — müşterinin Qratex ile etkileşime girdiği her işletme için kişisel bir sadakat cüzdanı. Kullanıcı hiçbir şey yazmaz; içerik kendi geçmişinden gelir. Her işletme bir kart: damga ilerlemesi, son deneyim, bayinin son yanıtı ve iki net aksiyon (Paylaş, Daha iyi olabilirdi).

**Yerleşim:**
- `/customer/experiences` → `DashboardPageHero` ("Mekânlarım") + arama/sıralama (son ziyaret, en sık, en yüksek puan) + işletme kartları grid'i (mobilde tek sütun liste). Boş durumda "İlk QR'ını okut" CTA'sı → `/customer/scan`.
- `/customer/experiences/[dealerId]` (veya birleşik işletme detayı) → üstte işletme başlığı + damga kartı (örn. 10 hücre, dolanlar marka renginde), altında deneyim zaman çizelgesi (feedback/review türü ikonla ayrılmış, bayi yanıtları satır içinde), sağda/altta aksiyonlar:
  - "Deneyimi paylaş" → alt sayfa (sheet): mood seçimi, 200 karakterlik not, önizleme kartı, Web Share / kopyala.
  - "Daha iyi olabilirdi" → alt sayfa: kategori çipleri, mesaj, bayinin gerçek ortalama yanıt süresi bilgisi; gönderim sonrası durum zaman çizelgesine düşer.
- Açık sayfa `/experience/[token]` → server-rendered, OG görselli, "Yol tarifi al" + "Qratex'e katıl, ilk ziyaret bonusu" CTA'ları.

**Motion/3D (yerinde ve ölçülü):** Damga hücresinin dolması için küçük bir `m as Motion` scale+opacity animasyonu (yalnızca yeni kazanılan damgada, bir kez); eşik tamamlanınca mevcut ödül/kutu açılış diline bağlanan kısa bir kutlama — 3D gerekmez, sayfa bir yardımcı ekrandır. `useReducedMotion` ile tümü anında duruma geçmeli. Liste girişinde global stagger kalıbı yeterli.

**Veri/API değişiklikleri:**
- Yeni `GET /api/customer/experiences/venues`: `Consumption` + `Feedback` üzerinden dealerId bazında gruplanmış (gün bazında tekil ziyaret), son ziyaret, ortalama puan, damga ilerlemesi; Upstash Redis ile kısa süreli kullanıcı bazlı önbellek.
- `GET /api/customer/experiences/at-dealer` → zaman çizelgesi için sayfalı (`cursor`) ve `kind`, ürün, bayi yanıtı alanlarıyla genişletilmeli.
- `POST /api/customer/experience-share` → `experienceRef` (feedbackId/reviewId) zorunlu, sahiplik kontrolü, moderasyon, rate-limit; `GET /api/customer/experience-share` ile kullanıcının kartları ve görüntülenme sayıları.
- İyileştirme isteği → ayrı tablo yerine mevcut geri bildirim/telafi hattına (bayi kuyruğu + `dealerReply` + durum makinesi) bağlanmalı; değilse `ImprovementRequest` için bayi uçları (`GET /api/dealer/improvement-requests`, `PATCH status/reply`) ve müşteri listesi yazılmalı.
- Üç uca `assertModuleEnabled('experiences')` ve `lib/rate-limit.ts`.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/feedbacks`**: Geri bildirim listesi, bayi yanıtlarıyla zaten var (`app/customer/feedbacks/page.tsx:44-45, 133-134`). "Son 3 deneyim" bu listenin işletmeye filtrelenmiş alt kümesi — kopya.
- **`/customer/remedy`**: Olumsuz deneyim → telafi akışı. "İyileştirme isteği" aynı problemi (memnuniyetsizliği bayiye iletmek) paralel ve okunmayan ikinci bir kanalla çözmeye çalışıyor; birleştirilmeli.
- **`/customer/favorites` ve `/customer/nearby`**: İşletme odaklı listeler; ikisi de işletme detayına yönlenmesi gereken doğal giriş noktaları (`favorites/page.tsx:161` şu an `nearby?dealerId=`'ye gidiyor).
- **`/customer/consumptions`**: Tüketim geçmişi; ziyaret/damga verisinin kaynağı.
- **`/customer/discover`**: Bu sayfanın tek giriş noktası, kendisi de menüden kaldırılmış.

**Öneri:** Bu sayfayı bağımsız bir özellik olarak tutmayın. Tek bir **İşletme Detayı** (`/customer/venues/[dealerId]` veya `/customer/experiences/[dealerId]`) oluşturun: damga ilerlemesi + o işletmedeki geri bildirim/tüketim zaman çizelgesi + bayi yanıtları + paylaş + iyileştirme/telafi talebi. `favorites`, `nearby`, `consumptions`, `feedbacks` satırları buraya link versin. `/customer/experiences` kökü "Mekânlarım" listesi olarak kalsın ya da `favorites` ile birleşsin. Mevcut ID tabanlı sayfa kaldırılmalı.

---

## Doğrulama (şüpheci inceleme)

İncelenen dosyalar: `app/customer/experiences/page.tsx`, `app/api/customer/improvement-request/route.ts`, `app/api/customer/experience-share/route.ts`, `app/api/public/experience-share/[token]/route.ts`, `app/(public)/experience/[token]/page.tsx`, `app/api/customer/experiences/at-dealer/route.ts`, `lib/api-auth.ts`, `proxy.ts`, `lib/rate-limit.ts`, `app/api/auth/register/route.ts`, `prisma/schema.prisma` (`ImprovementRequest` 2787-2802, `ExperienceShareToken` 2768-2784).

### 1. İyileştirme isteği ucu ile sınırsız bayi bildirim spam'i — **DOĞRULANDI** (önem: Yüksek değil, Orta)

- `improvement-request/route.ts:26` yalnızca `requireAuth(['CUSTOMER','ADMIN'])`; `:37-46` sadece hedefin `role: 'DEALER'` olduğunu kontrol ediyor. Müşterinin o işletmede tüketim/geri bildirim kaydı olup olmadığına bakılmıyor; `checkRateLimitDb` (ör. `ai-chat`, `redeem-coupon` uçlarında kullanılıyor) bu uçta yok. `proxy.ts:105-119` `/api/*` için yalnızca güvenlik/CORS başlığı ekliyor, global rate-limit yok.
- `requireAuth` içindeki token-replay kontrolü (`lib/api-auth.ts:66-77`) aynı IP/UA'dan gelen döngüyü durdurmaz.
- Bayi ID'leri gizli değil: `/api/customer/discovery` yanıtında `dealer: { id, businessName }` dönüyor (`discovery/route.ts:145,168,432`); kayıt açık ve CUSTOMER rolü seçilebilir (`auth/register/route.ts:40,62`, IP başına dakikada 5).
- **Yeniden üretim:** Herhangi bir müşteri hesabıyla oturum aç → discovery'den bir `dealerId` al → `POST /api/customer/improvement-request` gövdesi `{dealerId, templateKey:'other', message:'xxxxx'}` ile döngü. Her istek bir `ImprovementRequest` satırı (`:50-58`) ve bayiye bir `Notification` (`:60-71`) yaratır; bayinin bildirim kutusu sınırsız dolar, tablo sınırsız büyür.
- Önem notu: Bildirim metni sabit (`:64`), müşteri mesajı bildirimde gösterilmiyor ve `ImprovementRequest` kod tabanında hiçbir yerde okunmuyor (yalnızca bu dosyada `create`). Yani içerik enjeksiyonu yok; etki bildirim kirliliği + DB şişmesi (kötüye kullanım/DoS sınıfı). "Transaction dışında" kısmı güvenlik sorunu değil: bildirim `create` hata verirse yetim bir istek satırı kalır, kullanıcı 500 görür — düşük önemli tutarlılık sorunu.
- **Düzeltme yönü:** `checkRateLimitDb(\`improve:${userId}:${dealerId}\`, 1, 24h)` + kullanıcı başına günlük genel tavan; müşterinin o bayide son N gün içinde `Feedback`/`Consumption` kaydı olmasını şart koş; iki yazımı `prisma.$transaction` içine al; bayi tarafında aynı müşteriden gelen bildirimleri birleştir (dedupe anahtarı).

### 2. Anonim paylaşım linkiyle doğrulanmamış serbest metin yayınlama — **DOĞRULANDI** (önem: Orta)

- `experience-share/route.ts:12` `caption: z.string().max(200).optional()` — istemci sabit metin gönderse de (`page.tsx:91`) API serbest metin kabul ediyor; `:29-38` yalnızca bayi varlığını kontrol ediyor, ilişki/moderasyon/rate-limit yok; `:43-52` sınırsız token yaratılabiliyor.
- Herkese açık uç (`api/public/experience-share/[token]/route.ts`) oturumsuz çalışıyor ve `caption`'ı ham olarak dönüyor; sayfa (`(public)/experience/[token]/page.tsx:74,83`) bunu bayinin gerçek `businessName`'i altında, "Anonim deneyim kartı" başlığıyla Qratex alan adında gösteriyor.
- **Yeniden üretim:** Müşteri hesabıyla discovery'den rakip bir işletmenin ID'sini al → `POST /api/customer/experience-share` `{dealerId, caption:"<200 karakter karalayıcı metin>", mood:"ok"}` → dönen `shareUrl` 7 gün boyunca herkese açık, işletme adıyla birlikte Qratex markası altında yayılabilir. Hesap işletmeye hiç gitmemiş olabilir.
- Sınırlar (şişirmemek için): React metni kaçışlıyor, XSS yok; link tahmin edilemez (`randomBytes(18)`), herhangi bir listede/aramada indekslenmiyor, 7 gün sonra 404; yani yayılım ancak saldırganın linki kendisinin dağıtmasıyla olur. Yine de içerik Qratex markası ve gerçek işletme adı taşıdığı için itibar/hukuki risk gerçek. Ayrıca her GET `viewCount`'u artırıyor (`:25-29`) — sayaç şişirilebilir, düşük önem.
- **Düzeltme yönü:** Serbest `caption`'ı API'den kaldırıp sunucu tarafında sabit şablon anahtarlarına (`captionKey` enum) bağla; ya da paylaşımı kullanıcının kendi `Feedback`/`ConsumptionReview` kaydına (`experienceRef` + sahiplik kontrolü) bağla ve serbest metni moderasyondan geçir; kullanıcı başına günlük token tavanı; bayiye "kartı bildir/kaldır" mekanizması.

### 3. İşlem ekranda gösterilmeyen işletmeye gönderilebiliyor — **DOĞRULANDI** (önem: Düşük; güvenlik değil, UX/doğruluk hatası)

- `page.tsx:90` ve `:117` gövdeye `dealerId.trim()` (düzenlenebilir input state'i, `:41,155`) koyuyor; ekrandaki kart ise `payload.dealerLabel`'ı (`:169`) gösteriyor. `payload.dealerId` (`:23`) hiç kullanılmıyor.
- **Yeniden üretim:** Sayfayı `?dealerId` olmadan aç → A'nın ID'sini yaz → "Yükle" → kart A'yı gösterir → input'u B'nin geçerli ID'siyle değiştir, "Yükle"ye basma → "İyileştirme isteği gönder" → istek ve bildirim B'ye gider; ekran hâlâ A'yı gösterir. B geçersizse 404 toast'u alınır.
- Nüans: Sayfa `?dealerId=...` ile açılmışsa `load` `dealerId`'ye bağımlı olduğu için (`:73`) `useEffect([initialDealer, load])` (`:75-77`) her tuş vuruşunda yeniden çalışıyor; bu da kısmi ID'lerde "İşletme bulunamadı" toast yağmuru ve `setPayload(null)` üretiyor (ayrı bir hata) — bu kipte kartlar kaybolduğu için yanlış yönlendirme pratikte maskeleniyor. Etki yalnızca kullanıcının kendi eylemiyle sınırlı, başka kullanıcıya erişim yok; "Kritik/Yüksek" sınıflaması abartılı.
- **Düzeltme yönü:** Aksiyonlar `payload.dealerId`'yi kullanmalı; input değişince `payload` sıfırlanmalı (veya ID girişi tamamen kaldırılıp önerilen `/customer/experiences/[dealerId]` rota parametresine geçilmeli); otomatik yükleme effect'i yalnızca mount'ta çalışmalı.
---

## Uygulama (Dalga 2)

**Karar uygulandı:** `/customer/experiences` emekli edildi; içerik yeni **mekân detayı** `/customer/places/[dealerId]` sayfasına taşındı (yol haritası §4.3, F3.1-d). Eski rota `permanentRedirect` ile yönlenir: `?dealerId=X` → `/customer/places/X`, diğer her şey (sorgu korunarak) → `/customer/places`. Eski `layout.tsx`, ölü `GET /api/customer/experiences/at-dealer` ve yalnız onun kullandığı `lib/customer-dealer-experiences.ts` kaldırıldı.

**Yeni yapı**
- Sayfa: `app/customer/places/[dealerId]/{page,loading,error,not-found}.tsx`. Sunucu bileşenidir; kritik veri tek turda `lib/venue-detail/detail.ts#getVenueDetail` ile (paralel sorgular) gelir. İstemci adaları yalnız etkileşimli parçalardır: `FavoriteButton`, `StampCard`, `HistoryList` (+ yalnız "Paylaş"a basılınca yüklenen `ShareSheet`), `ImprovementPanel` (`components/customer/m-mekan-detay/`).
- Sunucu mantığı: `lib/venue-detail/{detail,history,visits,improvement,share,types}.ts`. Açık/kapalı ve kategori Keşfet ile **aynı kaynaktan** gelir (`lib/places/business-hours`, `lib/places/categories`).
- Uçlar (hepsi `defineRoute`, yalnız `CUSTOMER`, rate limit, modül kapısı): `POST /api/customer/improvement-request` (yeniden yazıldı), `POST /api/customer/experience-share` (yeniden yazıldı), yeni `GET /api/customer/venue-detail/[dealerId]/history` (imleçli sayfalama).
- Ölü derin linkler bağlandı: `components/customer/business-of-month-badge.tsx` ve `components/customer/recommendations-section.tsx` (`/customer/nearby?focus=` → `/customer/places/[id]`). Ana sayfa (`customer-dashboard.tsx`) ve favoriler sayfası diğer ajanlarca kaldırıldı ya da yönlendirildi.
- Testler: `__tests__/api/customer-venue-detail.test.ts`, `__tests__/lib/venue-detail-logic.test.ts`, `__tests__/lib/venue-detail-loader.test.ts` (37 test, prisma mock).

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Segment metadata | ÇALIŞIYOR | Yanlış açıklamalı layout kaldırıldı; sayfa başlığı mekân adı (`generateMetadata`, `noindex`). |
| 2 | Sayfa başlığı / h1 | ÇALIŞIYOR | QDL `PageHeader`: tek h1 (mekân adı), Keşfet'e geri bağlantısı, logo, kategori ve adres. |
| 3 | Menüden erişim | ÇALIŞIYOR | Kayıtta `customer.places.detail` (gizli alt sayfa). Giriş noktaları: Keşfet, Ayın İşletmesi, öneriler ve eski `?dealerId=` yönlendirmesi. |
| 4 | İşletme ID manuel girişi | KALDIRILDI | Rota parametresi kullanılır; kullanıcı hiçbir kimlik yazmaz (B5). |
| 5 | `?dealerId=` ön yükleme | ÇALIŞIYOR | Eski rota `/customer/places/<id>`'ye kalıcı olarak yönlenir. |
| 6 | "Yükle" butonu | KALDIRILDI | Veri sunucuda yüklenir. |
| 7 | Yükleniyor durumu | ÇALIŞIYOR | `loading.tsx` statik iskelet (`aria-busy`); geçmiş sayfalamada buton durumu ve `aria-busy`. |
| 8 | Hata durumu | ÇALIŞIYOR | `error.tsx` (`ErrorState` + tekrar dene + Sentry) ve satır içi `InlineError`; admin toast önekleri yok. |
| 9 | Boş durum | ÇALIŞIYOR | Ziyaret yoksa kart ve "QR okut" CTA'sı; geçmiş boşsa `EmptyState` ve CTA. |
| 10 | İşletme adı | ÇALIŞIYOR | |
| 11 | Ziyaret sayısı | ÇALIŞIYOR | İstanbul takvim gününe göre tekil sayılır (tüketim ∪ QR geri bildirimi); çift sayım bitti. |
| 12 | Sadakat kademesi "rozeti" | ÇALIŞIYOR (dürüst) | "Rozet" sözcüğü ve ödül vaadi kaldırıldı. Nötr **ziyaret kademesi** (İlk adım → Tanıdık yüz → Müdavim → Evin bir parçası) yalnız ziyaret gününden türer. |
| 13 | Sonraki eşik | ÇALIŞIYOR | 10 hücreli **ziyaret kartı**: damga ızgarası, kart doldu/yeni kart, kalan gün ve sonraki kademe. Yeni damga yalnız bir kez canlanır; azaltılmış harekette statiktir. |
| 14 | Son 3 deneyim | ÇALIŞIYOR | Tam ve sayfalı zaman çizelgesi (10'ar). Konu anahtarları çevrilir; ham kelime etiketi yok. |
| 15 | Deneyim boş durumu | ÇALIŞIYOR | CTA'lı boş durum. |
| 16 | Deneyim türü gösterimi | ÇALIŞIYOR | Tüketim ve QR geri bildirimi ikon ve metinle ayrılır. |
| 17 | Satırdan detaya | ÇALIŞIYOR | Tüketim → `/customer/consumptions/[id]` (yorum yaz/ayrıntı); geri bildirim → `/customer/feedbacks/[id]/journey`. |
| 18 | Deneyim kartı oluştur | ÇALIŞIYOR | Belirli bir 4-5 puanlık deneyimden başlar; aynı kart varsa link yeniden kullanılır. |
| 19 | Not / ruh hâli seçimi | ÇALIŞIYOR | Kullanıcı ruh hâlini ve 4 şablon nottan birini seçer; puan karta yazılır; önizleme gösterilir. |
| 20 | Link gösterimi | ÇALIŞIYOR | Salt okunur alan; odaklanınca metin seçilir. |
| 21 | Kopyala | ÇALIŞIYOR | `await` edilir; hata olursa metin seçilir ve dürüst mesaj verilir. |
| 22 | Web Share / WhatsApp | ÇALIŞIYOR | `navigator.share` (destekleniyorsa), WhatsApp ve kopyala. |
| 23 | İşletme değişince link sıfırlama | ÇALIŞIYOR | Sayfa tek mekâna kilitli; alt sayfa hedef değişince sıfırlanır. |
| 24 | Şablon seçimi | ÇALIŞIYOR | Etiketli `ChoiceChips` radiogroup. |
| 25 | İyileştirme mesajı | ÇALIŞIYOR | 10–1000 karakter, sayaç, `maxLength`, Türkçe doğrulama mesajları. |
| 26 | "Tahmini dönüş (saat)" alanı | KALDIRILDI | Müşteri SLA seçemez (B7). Yerine işletmenin **gerçek** medyan yanıt süresi gösterilir (son 120 gün, en az 3 yanıt; yoksa "veri yok") ve kayda sunucuda yazılır. |
| 27 | İsteği gönder | ÇALIŞIYOR | Hedef rota parametresidir; isteğin yanlış işletmeye gitmesi imkânsız (B3). |
| 28 | Bayiye bildirim | ÇALIŞIYOR | Bildirim başlığı kategoriyi, gövdesi isteğin metnini taşır; kayıt ve bildirim tek transaction'da. |
| 29 | Bayinin görmesi / yanıtlaması / durum | KISMİ (kalan) | Bayi isteği bildirim merkezinde **okur**; müşteri "İşletme gördü" durumunu görür. Yanıt yazma ve durum makinesi bayi Gelen Kutusu yüzeyinin işidir ve şema alanı ister (aşağıda). |
| 30 | Müşterinin geçmiş istekleri | ÇALIŞIYOR | "Gönderdiğim istekler" listesi. Durum, bayi bildiriminin `readAt` alanından gelir ("Gönderildi" / "İşletme gördü · tarih"). |
| 31 | Herkese açık `/experience/[token]` | KAPSAM DIŞI (kalan) | F3.4 herkese açık yüzeyler ajanının işi (SSR + OG + CTA). Kart metni artık şablon + puan olduğundan "şu" belirsizliği bu taraftan bitti. |
| 32 | Görüntülenme sayacı | KISMİ (kalan) | Müşteri kendi kartlarını, açılma sayısını ve bitiş tarihini görür, linki yeniden kopyalar. Bot/yenileme tekilleştirmesi herkese açık uçta yapılmalı (F3.4). |
| 33 | Yetki | ÇALIŞIYOR | Tüm uçlar `defineRoute` + yalnız `CUSTOMER`; sayfa müşteri olmayanlara yetkisiz durumu gösterir. |
| 34 | Modül kapatma | ÇALIŞIYOR | Paylaşım ve istek uçları `module: 'experiences'`, geçmiş ucu ve sayfa `discovery` kapısında; kapalıyken arayüz dürüst bilgi gösterir. |
| 35 | Rate limit | ÇALIŞIYOR | Rota sınırı + DB'den günlük tavanlar (istek: mekân başına 2, kullanıcı başına 10; kart: kullanıcı başına 10). |
| 36 | İşletme ilişkisi doğrulaması | ÇALIŞIYOR | İstek için son 180 günde bu mekânda tüketim ya da QR geri bildirimi gerekir; kart için müşterinin kendi, silinmemiş ve bu mekâna ait kaydı gerekir. |
| 37 | Süresi dolan token temizliği | KAPSAM DIŞI (kalan) | Ortak `db-cleanup` cron'u başka sahipte. Yeni kart üretimi tekilleştirildi ve günlük tavana bağlandı; büyüme sınırlı. |
| 38 | i18n | ÇALIŞIYOR | Yüzeye özgü TR/EN metin modülü (`m-mekan-detay/copy.ts`); tarih ve para `Intl` + `Europe/Istanbul`; İngilizce anahtar sızıntısı yok. |
| 39 | Form erişilebilirliği | ÇALIŞIYOR | `Field` ile bağlı etiketler, radiogroup çipler, puanda `role="img"` + `aria-label`, `announce` canlı bölgesi. |
| 40 | Mobil düzen | ÇALIŞIYOR | Mobil öncelikli tek sütun, en az 44px dokunma hedefleri, paylaşım için alt sayfa; masaüstünde mekân bilgisi yan panelde. |
| 41 | Suspense / `useSearchParams` | KALDIRILDI | Sayfa sunucu bileşeni; istemcide `useSearchParams` yok. |

**Rota gereksinimiyle yeni eklenenler:**
- Açık/kapalı durumu: tatil modu, kapanışa 60 dakikadan az kala uyarı, sonraki açılış. Saat çözülemezse durum iddia edilmez, bayinin yazdığı ham metin gösterilir.
- Haftalık saat tablosu (bugün vurgulu).
- Aktif flash teklifler (kullanım tavanı dolanlar hariç, inovasyon bayrağına uyar) ve mutlu saatler ("Şu an" / "Bugün başlıyor"; yalnız alışverişe uygulandığı açıkça yazılı).
- Yol tarifi (mekân ve şubeler).
- Kaydet/çıkar (mevcut favori ucu; iyimser güncelleme, hata olursa geri alma).
- "QR okut, puan kazan" kısayolu.

### Bulgular

| Bulgu | Durum |
|---|---|
| B1 iyileştirme spam'i | KAPANDI: uygunluk kontrolü, günlük tavanlar, rota rate limit, tek transaction. |
| B2 keyfi metinli paylaşım | KAPANDI: serbest metin yok (şablon anahtarı); sahiplik, mekân ve en az 4 puan kontrolü; günlük tavan. Bayinin kartı bildirmesi ve admin iptali F3.4 ile birlikte kalıyor. |
| B3 yanlış işletmeye aksiyon | KAPANDI: aksiyonlar rota parametresine kilitli. |
| B4 tuş başına fetch / yarış | KAPANDI: sunucu bileşeni; sayfalama TanStack `useInfiniteQuery` ile. |
| B5 ham ID girişi | KAPANDI. |
| B6 kara delik | KISMİ: bayi metni okuyor, müşteri "gördü" durumunu izliyor; bayi yanıtı kalan. |
| B7 müşteri SLA seçiyor | KAPANDI: gerçek medyan yanıt süresi. |
| B8 sahte rozet | KAPANDI: dürüst ziyaret kartı ve kademe, gün bazında tekil sayım. |
| B9 sabit paylaşım içeriği | KAPANDI (bu taraf): ruh hâli ve not seçimi, puan, Web Share. OG görseli F3.4'te. |
| B10 modül anahtarı | KAPANDI. |
| B11 eski link / doğrulanmayan kopyalama | KAPANDI. |
| B12 i18n | KAPANDI. |
| B13 erişilebilirlik | KAPANDI. |
| B14 sayaç ve temizlik | KISMİ: müşteri görünürlüğü eklendi; tekilleştirme ve cron temizliği kapsam dışı. |

### Kalanlar ve gerekçeleri
- **Gerçek damga ödülü:** İşletmeye özel ödül/kupon altyapısı yok. Puan basmak bir ekonomi kararı (lib/economy, tavanlar) gerektirdiği için kart ödül vaat etmiyor. Ürün kararı verilirse `mintPoints` ile `idempotencyKey: stamp:<user>:<dealer>:<kartNo>` kullanılarak eklenebilir.
- **Bayi yanıtı ve durum makinesi (B6):** Bayi Gelen Kutusu (`/dealer/inbox`) yüzeyinin işi. **ŞEMA İSTEĞİ:** `ImprovementRequest` modeline `dealerReply String? @db.Text`, `dealerRepliedAt DateTime?` ve `seenAt DateTime?` alanları. Bugün "görüldü" bilgisi bildirimin `readAt` alanından türetiliyor.
- **Herkese açık kart sayfası (SSR + OG + CTA), görüntülenme tekilleştirmesi, süresi dolan token temizliği:** F3.4 ve ortak cron sahiplerinin işi.
- **Keşfet çekmecesiyle bağlantı:** `lib/places/legacy-redirect.ts` eski `?focus=`/`?dealerId=` linklerini `/customer/places?venue=<id>` çekmecesine yönlendiriyor. Çekmeceden bu sayfaya "Tüm ayrıntılar" bağlantısını Keşfet ajanı vermeli.
- **Görsel doğrulama:** Dev server ve build yasak olduğu için ekran görüntüsüyle doğrulanmadı. Doğrulama tsc (kendi dosyalarda 0 hata), eslint ve 37 jest testiyle yapıldı.
