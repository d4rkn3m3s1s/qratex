# Bayi / İşletme Paneli — Sentez Denetim Raporu (2026-10-08)

> Kapsam: `/dealer/**` altında 43 sayfa ve `/staff`, `/staff/field` olmak üzere toplam **45 sayfa**. Bunlar restoran, kafe ve mağaza sahibi ile personelinin kullandığı yüzeyler.
> Kıyas alınan ürünler: Medallia, Qualtrics CX, Google Business Profile, Yelp for Business, Toast, Square Dashboard.
> Kaynak: bu klasördeki 45 sayfa raporu (`dealer*.md`, `staff*.md`) ve her raporun "Doğrulama (şüpheci inceleme)" bölümü. Doğrulamada çürütülen bulgular sayılmadı. "Belirsiz" sonuç alanlar ayrıca işaretlendi.
> Bu sentez sırasında 4 kritik iddia kaynak koddan bir kez daha okundu: `app/api/dealer/staff/route.ts:77-103`, `app/api/happy-hour/route.ts:121-132`, `prisma/schema.prisma:2069-2087`, `next.config.js:323-340`. Ayrıca `assertModuleEnabled` kullanımı tarandı: `app/api/dealer` altında yalnız 5 dosyada geçiyor.
> Kod, veritabanı, build ve test komutlarına dokunulmadı.

---

## 1. Yönetici özeti

**Panel sağlık puanı: 3,6 / 10**

Sayfa puanlarının aritmetik ortalaması 4,14. Bunun altına inmemin nedeni şu: panelde birden fazla **kiracılar arası güvenlik açığı** ve **puan basma (para) açığı** doğrulandı. Bunlar tek tek sayfa puanlarına yansımıyor ama ürünün tamamını riske atıyor.

| Gösterge | Değer |
|---|---|
| Denetlenen sayfa | 45 |
| Envanterdeki özellik | 1.864 |
| Bozuk + sahte özellik | **218** (%11,7) |
| Karar dağılımı | 25 yeniden-tasarla · 14 birleştir · 4 yeniden-inşa · 1 kaldır · 1 koru-iyileştir |
| En iyi sayfalar | `/dealer/onboarding` 5,3 · `/dealer/copilot` 5,2 · `/dealer`, `/dealer/products`, `/dealer/reviews`, `/dealer/voc-wall` 5,0 |
| En zayıf sayfalar | `/dealer/experience-guide` 2,5 · `/dealer/team`, `/dealer/segment-actions`, `/staff/field` 3,0 · `/dealer/campaigns/[id]/performance` 3,2 |

**Ana sonuçlar:**

1. **Yetki modeli dağınık.** Tek bir "veri kapsamı" yardımcısı yok, her route kapsamı kendisi daraltıyor ve STAFF rolünü unutuyor. Sonuç: STAFF hesabı platformdaki bütün geri bildirimleri okuyabiliyor (`app/api/feedbacks/route.ts:28,43-51`, `app/api/ai/detailed/route.ts:34-37`). Bayi, personel ekleme formuyla herhangi bir hesabın şifresini değiştirebiliyor (`app/api/dealer/staff/route.ts:84-103`; bu sentezde yeniden okundu). Pasifleştirilen personelin erişimi de kesilmiyor.
2. **Puan ekonomisi değişmezleri bayi tarafında ihlal ediliyor.** Happy hour çarpanı sınırsız (`app/api/happy-hour/route.ts:121,132`, `multiplier || 2.0`; yeniden okundu). Tüketim yolu `points_credited` yazmadan, transaction dışında puan basıyor (`app/api/dealer/consumptions/route.ts:312-350`). `offline-sync` PATCH ucu bütün kontrolleri atlıyor.
3. **Müşteri metrikleri platform genelinden geliyor.** `CustomerLifetimeValue` tablosunda `dealerId` yok, `userId @unique` (`prisma/schema.prisma:2069-2087`; yeniden okundu). Bu yüzden bayi, müşterinin rakip işletmelerdeki harcamasını ve ziyaretlerini görüyor (`/dealer/customers`, `/dealer/segment-actions`, churn müdahalesi).
4. **"Hata" ile "boş" ayrılmıyor.** ~25 sayfada `res.ok` kontrol edilmiyor. Neon kesintisinde ya da token-replay 403'ünde bayi "Henüz veri yok", "Risk yok" veya "Onay bekleyen telafi yok" görüyor. Bazı sayfalar (billing, onboarding) bu durumda TypeError ile çöküyor.
5. **Sayıların önemli bir kısmı yanlış.** "Tarama" metriği aslında geri bildirim sayısı. "Son 30 gün" kartı tüm zamanları gösteriyor. KPI'lar o anda yüklü sayfadaki 20 kayıttan hesaplanıyor. Isı haritası bir gün ve 3 saat kaymış. Benchmark yüzdeliği ters yorumlanıyor. NPS/CSAT/CES değerleri LLM'e uyduruluyor.
6. **Pazarlama gönderimleri müşteri tercihini yok sayıyor.** Kampanya, win-back, risk segmenti ve inovasyon segment önerileri; müşteri "Kampanya & Sürprizler" bildirimini kapatmış olsa bile gidiyor. Hiçbiri atomik değil ve hiçbiri ölçülemiyor; kampanya atıf metrikleri üretimde hep 0.
7. **AI yönetişimi atlanıyor.** `ai_features` modül kapısı yalnız menüde uygulanıyor. `askAI` ve `generateInsightReport` maliyet korumasını çağırmıyor. "AI kapalı" ayarı `ai-retry` cron'u tarafından atlatılıyor; müşteri metni yine GROQ/OpenAI'a gidiyor.
8. **Sahte ayar ve vaat çok.** `/dealer/ai-settings` sayfasındaki 47 özelliğin 16'sı sahte. Bildirim tercihleri sekmesi `setTimeout` ile başarı toast'ı gösteriyor. Tatil modu ve çalışma saatleri kaydediliyor ama hiçbir yerde okunmuyor. Saha pingleri yöneticiye ulaşmıyor. Win-back "5X puan" vaadini hiçbir mekanizma karşılamıyor.
9. **Bilgi mimarisi parçalı.** 45 sayfanın 14'ü başka bir sayfayla birleştirilmeli. Navigasyon 4 yerde elle kopyalanmış. 6 sayfa menüde yok (yetim): `discover`, `ask-analytics`, `action-items`, `operations-brief`, `experience-guide`, `weekly-brief`. Bayinin "bugün ne yapmalıyım" sorusuna yanıt veren tek bir yüzey yok; Medallia/Qualtrics'in "closed-loop inbox" kavramının karşılığı 5 sayfaya dağılmış.

**Önerilen yön:** Önce 14 bağımsız P0 epiki paralel olarak kapatılsın (§7). Ardından ortak altyapı (veri kapsamı, DataState, dönem/zaman dilimi, gönderim servisi, nav kataloğu) kurulsun. Panel bundan sonra 9 üst menülük bir yapıya indirilsin (§5): **Bugün · Gelen Kutusu · Müşteriler · Pazarlama · Analitik · AI Asistan · İşletme · Otomasyon · Ayarlar**.

---

## 2. Tüm sayfaların puan tablosu

Puanlar /10. "B+S" = bozuk + sahte özellik sayısı. Liste genel puana göre artan sırada.

| # | Route | Genel | İşlev. | UX | Görsel | Karar | Özellik | B+S |
|---|---|---|---|---|---|---|---|---|
| 1 | `/dealer/experience-guide` | 2,5 | 2 | 2 | 5 | kaldır | 29 | 3 |
| 2 | `/dealer/team` | 3,0 | 2 | 3 | 4 | yeniden-inşa | 43 | 7 |
| 3 | `/dealer/segment-actions` | 3,0 | 2 | 4 | 5 | yeniden-inşa | 31 | 7 |
| 4 | `/staff/field` | 3,0 | 3 | 3 | 4 | birleştir | 31 | 7 |
| 5 | `/dealer/campaigns/[id]/performance` | 3,2 | 2 | 3 | 4 | yeniden-inşa | 25 | 5 |
| 6 | `/dealer/ai-insights` | 3,5 | 4 | 3 | 5 | yeniden-tasarla | 65 | 11 |
| 7 | `/dealer/ai-settings` | 3,5 | 2 | 4 | 5 | yeniden-tasarla | 47 | 19 |
| 8 | `/dealer/customers` | 3,5 | 2 | 3 | 4 | yeniden-inşa | 36 | 5 |
| 9 | `/dealer/incidents` | 3,5 | 3 | 3 | 5 | yeniden-tasarla | 42 | 2 |
| 10 | `/dealer/innovation` | 3,5 | 3 | 3 | 4 | birleştir | 41 | 7 |
| 11 | `/dealer/weekly-brief` | 3,5 | 3 | 3 | 4 | birleştir | 31 | 4 |
| 12 | `/dealer/ai-chat` | 3,8 | 4 | 3 | 5 | birleştir | 44 | 5 |
| 13 | `/dealer/campaigns` | 3,8 | 4 | 4 | 5 | yeniden-tasarla | 38 | 4 |
| 14 | `/dealer/action-items` | 4,0 | 4 | 3 | 5 | yeniden-tasarla | 39 | 3 |
| 15 | `/dealer/ask-analytics` | 4,0 | 5 | 4 | 4 | birleştir | 35 | 3 |
| 16 | `/dealer/business-outcomes` | 4,0 | 4 | 3 | 4 | birleştir | 31 | 2 |
| 17 | `/dealer/feedbacks` | 4,0 | 4 | 4 | 6 | yeniden-tasarla | 64 | 7 |
| 18 | `/dealer/growth-hub` | 4,0 | 5 | 3 | 5 | birleştir | 28 | 0 |
| 19 | `/dealer/radar` | 4,0 | 4 | 4 | 6 | birleştir | 43 | 7 |
| 20 | `/dealer/remedy-automation/templates` | 4,0 | 4 | 4 | 4 | yeniden-tasarla | 39 | 3 |
| 21 | `/dealer/scan` | 4,0 | 3 | 4 | 6 | yeniden-tasarla | 56 | 4 |
| 22 | `/dealer/heatmap` | 4,2 | 3 | 4 | 6 | yeniden-tasarla | 39 | 4 |
| 23 | `/dealer/settings` | 4,2 | 4 | 4 | 6 | yeniden-tasarla | 55 | 8 |
| 24 | `/dealer/surveys/create` | 4,2 | 4 | 4 | 5 | yeniden-tasarla | 42 | 2 |
| 25 | `/staff` | 4,2 | 3 | 4 | 5 | yeniden-tasarla | 44 | 4 |
| 26 | `/dealer/benchmark` | 4,5 | 4 | 4 | 6 | yeniden-tasarla | 43 | 7 |
| 27 | `/dealer/billing` | 4,5 | 4 | 4 | 5 | yeniden-tasarla | 38 | 2 |
| 28 | `/dealer/churn-risk` | 4,5 | 4 | 4 | 6 | birleştir | 48 | 4 |
| 29 | `/dealer/consumptions` | 4,5 | 4 | 4 | 6 | yeniden-tasarla | 40 | 1 |
| 30 | `/dealer/discover` | 4,5 | 6 | 4 | 5 | birleştir | 42 | 2 |
| 31 | `/dealer/operations-brief` | 4,5 | 5 | 4 | 5 | birleştir | 43 | 4 |
| 32 | `/dealer/remedy-automation` | 4,5 | 5 | 4 | 4 | yeniden-tasarla | 30 | 2 |
| 33 | `/dealer/remedy-queue` | 4,5 | 5 | 4 | 5 | yeniden-tasarla | 39 | 3 |
| 34 | `/dealer/roi` | 4,5 | 4 | 4 | 6 | birleştir | 44 | 10 |
| 35 | `/dealer/settings/auto-replies` | 4,5 | 4 | 4 | 6 | yeniden-tasarla | 45 | 5 |
| 36 | `/dealer/analytics` | 4,6 | 5 | 4 | 5 | yeniden-tasarla | 49 | 8 |
| 37 | `/dealer/surveys/[id]/results` | 4,6 | 5 | 4 | 5 | yeniden-tasarla | 37 | 1 |
| 38 | `/dealer/qr-codes` | 4,8 | 5 | 4 | 6 | yeniden-tasarla | 56 | 12 |
| 39 | `/dealer/surveys` | 4,8 | 5 | 4 | 6 | yeniden-tasarla | 31 | 2 |
| 40 | `/dealer` | 5,0 | 5 | 5 | 6 | yeniden-tasarla | 61 | 6 |
| 41 | `/dealer/products` | 5,0 | 5 | 4 | 5 | koru-iyileştir | 41 | 2 |
| 42 | `/dealer/reviews` | 5,0 | 4 | 5 | 6 | birleştir | 52 | 4 |
| 43 | `/dealer/voc-wall` | 5,0 | 5 | 4 | 6 | yeniden-tasarla | 35 | 3 |
| 44 | `/dealer/copilot` | 5,2 | 5 | 5 | 6 | birleştir | 40 | 5 |
| 45 | `/dealer/onboarding` | 5,3 | 5 | 5 | 6 | yeniden-tasarla | 32 | 2 |
| | **Toplam / ortalama** | **4,14** | | | | | **1.864** | **218** |

Hiçbir sayfa 6'yı geçmiyor; kıyas ürünlerin taban çizgisinin altında kalıyor. B+S sayısında öne çıkan üç sayfa: `ai-settings` (19 sahte ayar), `qr-codes` (10 bozuk; silme, tarama metriği, kota) ve `ai-insights` (6 LLM uydurması KPI).

---

## 3. Doğrulanmış kritik hatalar (P0)

Aşağıdakilerin hepsi sayfa raporlarındaki doğrulama bölümünde "doğrulandı" olarak işaretlendi. Önem derecesi doğrulama sonrasındaki düzeltilmiş halidir.

### 3.1 Güvenlik ve kiracı izolasyonu

| # | Hata | Kanıt | Etki |
|---|---|---|---|
| S1 | **Personel ekleme ile hesap ele geçirme.** Formda var olan bir e-posta girilince o hesabın şifresi ve rolü (STAFF) koşulsuz eziliyor. | `app/api/dealer/staff/route.ts:84-103` (yeniden okundu); `lib/validations.ts:39` (DEALER rolü kayıtta serbestçe seçilebiliyor) | Herhangi bir müşteri hesabı ele geçirilebilir. Bayi ve admin rolleri kalıcı olarak STAFF'a düşürülebilir. 2FA açıksa giriş engelleniyor ama rol düşürme yine gerçekleşiyor. |
| S2 | **STAFF rolü platformun bütün geri bildirimlerini okuyabiliyor.** | `app/api/feedbacks/route.ts:28,43-51`; `app/api/ai/detailed/route.ts:34-37,57`; `app/api/ai/analyze/route.ts:385-390,654-660,212`; `proxy.ts:107-120` (API'de rol kontrolü yok) | Bir bayi kendine STAFF hesabı açarak bütün kiracıların yorum metinlerini ve müşteri e-postalarını okuyabilir. `bulk_analyze` ile başka bayilerin AI alanlarının üzerine yazabilir. |
| S3 | **`action=analyze` IDOR yazma.** Sahiplik kontrolü yok; analiz istemcinin gönderdiği metinle yapılıyor. | `app/api/ai/analyze/route.ts:121-170` | Müşteri kendi olumsuz yorumunun sentiment/churn alanlarını "olumlu" olarak yeniden yazdırabilir; SLA ve churn sinyalleri bastırılır. |
| S4 | **STAFF başka bayinin AI öğrenme profilini zehirleyebiliyor.** | `app/api/ai/learning/route.ts:82-98`; `lib/ai-learning.ts:301-318` | Dolaylı prompt zehirleme. |
| S5 | **Pasif personelin erişimi kesilmiyor.** `DealerStaff.isActive` yetki zincirinin hiçbir yerinde okunmuyor. | `lib/auth.ts:136-207,254-256`; `lib/api-auth.ts:158-168`; `app/staff/layout.tsx:31` | İşten çıkarılan personel süresiz giriş yapabilir, mesai yazabilir, ekibin GPS konumlarını okuyabilir (`/api/staff/field-ping`). |
| S6 | **`assignedToId` doğrulanmıyor, atanan kişinin e-postası dönüyor.** | `app/api/dealer/action-items/[id]/route.ts:12,51`, `route.ts:88`; `app/api/dealer/incidents/route.ts:28,114,66-68` | Leaderboard veya churn-risk ucundan alınan id'lerle başka işletmelerin müşteri e-postaları toplu olarak okunabilir. |
| S7 | **Platform geneli CLV bayiye gösteriliyor.** | `prisma/schema.prisma:2069-2087` (yeniden okundu); `lib/clv-core.ts:80-87`; `app/api/dealer/customers/route.ts:53-88`; `app/api/dealer/segment-actions/route.ts:50-63` | Rakip işletmedeki harcama, ziyaret ve son ziyaret tarihi sızıyor; segmentler ve churn değeri yanlış hesaplanıyor. |
| S8 | **Müşteriye giden e-postada kaçışsız HTML.** `businessName` ve AI özeti doğrudan HTML'e yazılıyor. | `lib/notify-email.ts:79,113,116`; `lib/weekly-digest-core.ts:81-92` | Bayi, QRATEX markalı işlem e-postasına oltalama bağlantısı koyabilir. |
| S9 | **"AI kapalı" ayarı cron tarafından atlatılıyor.** | `app/api/cron/ai-retry/route.ts:36-46,65`; `lib/inngest/feedback-analyze-pipeline.ts:30-36` | AI'ı kapatmış bayinin müşteri metni her gece 03:00'te LLM sağlayıcısına gidiyor (gizlilik sözleşmesi ihlali). |

### 3.2 Para, puan ve veri bütünlüğü

| # | Hata | Kanıt | Etki |
|---|---|---|---|
| D1 | **Sınırsız happy-hour çarpanıyla puan basma.** Çarpan BASE_XP_CAP'ten sonra, tavansız uygulanıyor ve `points_credited` yazılmıyor. | `app/api/happy-hour/route.ts:121,132`; `app/api/dealer/consumptions/route.ts:304-350` | Bayi + suç ortağı müşteri ile dakikada yaklaşık 250M puan basılabilir. Fraud dedektörü (`lib/points-velocity.ts`) bunu görmez. Puan ekonomisinin değişmezleri ihlal ediliyor. |
| D2 | **`offline-sync` PATCH bütün tüketim kontrollerini atlıyor.** | `app/api/dealer/offline-sync/route.ts:128-145,197-224` | İstek başına 100 tüketim kaydı, başka bayinin ürünü, negatif tutar, audit kaydı yok. Rozet ilerlemesi sınırsız şişirilebiliyor. |
| D3 | **Plan değiştirince ikinci Stripe aboneliği açılıyor.** | `lib/billing-core.ts:51-78,117-126` | Çift ücretlendirme; eski aboneliğin olayları planı geri yazıyor. |
| D4 | **QR silmek bağlı bütün geri bildirimleri cascade ile siliyor.** | `prisma/schema.prisma:834` (+ ActionItem, RemedyOffer ve AI tabloları); `app/api/qr-codes/bulk/route.ts:40-42` | Tek tıkla yüzlerce yorum ve AI analizi geri dönüşsüz kaybolur. Toplu uç token-replay ve audit korumasını da atlıyor. |
| D5 | **Ayarlar Kaydet'e basınca işletme alanları siliniyor.** Profil yüklenemezse boş form + sahte telefon kaydediliyor. | `app/dealer/settings/page.tsx:71-87,121-123,164-181` | İşletme adı, konum ve açıklama NULL olur; keşif ve onboarding bozulur. |
| D6 | **AI ayarları yüklenemezse Kaydet varsayılanlarla eziyor**, özel prompt silinir. | `app/dealer/ai-settings/page.tsx:145-149,168` | Ayar kaybı. |
| D7 | **Telafi onay kuyruğu atlatılabiliyor.** 500 karakteri aşan mesajda doğrulama hata verince varsayılanlar "doğrudan gönder" yönüne düşüyor. | `app/api/dealer/feedbacks/[id]/remedy/route.ts:25,61-71`; `consumption-reviews/[id]/remedy/route.ts:62-75` | Onaylanmamış teklif müşteriye gider. |
| D8 | **Churn müdahalesinin "kişisel" flash teklifi herkese açık.** `redemptionCount` hiç artırılmıyor. | `lib/churn-intervention-core.ts:88-110`; `app/api/customer/innovation/nearby/route.ts:35-86` | Riskli müşteri için hazırlanan teklif 24 saat boyunca yakındaki herkese görünür; marj kaybı. |
| D9 | **Otomatik yanıt motoru idempotent değil.** | `lib/auto-reply-engine.ts:74-114`; `app/api/cron/ai-retry/route.ts:36-46` | Bayinin elle yazdığı yanıt eziliyor, müşteri ikinci e-postayı alıyor, yinelenen olay kaydı açılıyor. |
| D10 | **Haftalık özetin elle yenilenmesi Pazartesi digest'ini iptal ediyor.** | `app/api/dealer/innovation/weekly-brief/route.ts:62-79`; `lib/weekly-digest-core.ts:124-143` | Bildirim ve e-posta sessizce gönderilmiyor. |
| D11 | **Demo olay kalıcı yazılıyor.** | `app/api/dealer/incidents/route.ts:53-54`; `lib/incident-detection.ts:161-172` | Yeni bayi kapatamayacağı bir "açık olay" görür; sağlık skoru kalıcı olarak düşer. |
| D12 | **Telafi kabulünde seçilen değer doğrulanmıyor.** | `app/api/customer/remedy/[offerId]/route.ts:15-18,160-168` | Kasada "%100 indirim kabul edildi" gibi sahte bir ekran gösterilebilir. Fulfilment eklendiği anda bu açık para kaybına dönüşür. |

### 3.3 Kırık ana akışlar

| # | Hata | Kanıt | Etki |
|---|---|---|---|
| F1 | **Kamera taraması üretimde kapalı.** `Permissions-Policy: camera=()` tüm yollarda veriliyor. | `next.config.js:323-340` (yeniden okundu); `proxy.ts:17` | `/dealer/scan` (kasa akışı) ve `/customer/scan` Chromium'da kamera açamıyor; kullanıcıya yanıltıcı "izin reddedildi" mesajı gösteriliyor. |
| F2 | **Kamera geri çağrısı eski state'e bağlı.** | `app/dealer/scan/page.tsx:171-186,214-217` | F1 düzeltildiğinde saniyede yaklaşık 10 istek ve audit kaydı fırtınası başlar. F1 ile birlikte düzeltilmeli. |
| F3 | **Segment aksiyonlarındaki 5 butonun 4'ü her zaman 400 dönüyor.** Kalan 1 buton onay almadan gerçek bildirim gönderiyor. | `app/dealer/segment-actions/page.tsx:74-81`; `app/api/dealer/win-back/route.ts:108-110`; `risk-segment/route.ts:38-71` | Sayfanın ana işlevi çalışmıyor. |
| F4 | **Kampanya gönderimi müşteri tercihini, e-posta kanalını ve atomikliği yok sayıyor.** | `app/api/dealer/campaigns/[id]/send/route.ts:96-127`; `lib/notification-prefs.ts:49-53`. Win-back (`win-back/route.ts:149-159`) ve inovasyon segment önerileri (`segment-proposals/[id]/send/route.ts:59-95`) aynı sorunu taşıyor. | Bildirim tercihi ihlal ediliyor, "E-posta" kanalı sahte, kampanya "gönderildi" olarak işaretleniyor ama teslimat 0 olabiliyor. |
| F5 | **Kampanya atıf metrikleri her zaman 0.** | `app/(public)/feedback/[code]/page.tsx:83,118-125` (UTM taşınmıyor); `performance/route.ts:47` | Performans sayfası ve Copilot'un kampanya sinyali tamamen işlevsiz. |
| F6 | **Boş seçenekli anket kaydedilip yayına giriyor ve hiç yanıtlanamıyor.** Public doldurma ucu da değerleri doğrulamıyor. | `app/dealer/surveys/create/page.tsx:50,106-108`; `app/api/surveys/[id]/fill/route.ts:53-56,100-114` | Anket sıfır yanıt topluyor ya da sonuçları anonim olarak çarpıtılabiliyor. |
| F7 | **Isı haritası bir gün ve 3 saat kaymış.** | `app/api/dealer/heatmap/route.ts:29-31` (0 = Pazartesi) ile `messages/tr.json:1463-1471` (0 = Paz) çelişiyor; `lib/heatmap-track.ts:24-26` (UTC) | Cuma 20:00'deki yoğunluk "Perşembe 17:00" olarak görünür. |
| F8 | **Aksiyonlar listesindeki GET isteği yan etkili.** Bir işi tamamlamak yeni AI görevi doğuruyor; paralel GET'ler mükerrer kayıt üretiyor. | `app/api/dealer/action-items/route.ts:71-78`; `lib/action-items-ai.ts:183,212-218` | Bitmeyen iş döngüsü, mükerrer LLM çağrısı. |
| F9 | **AI sohbet ve operasyon özeti maliyet korumasını atlıyor.** | `lib/ai-engine.ts:854-958` (askAI), `623-750` (generateInsightReport); `app/api/dealer/ai-proactive-analysis/route.ts:52-61` | Paylaşılan Groq kotası tüketiliyor; bütün feedback analiz hattı için DoS riski. |
| F10 | **VoC duvarı (mağaza TV'si) toksik ve sahte yorumları müşterinin tam adıyla gösteriyor.** | `app/api/dealer/voc-wall/route.ts:40-41,133` | Müşteri onayı yok; itibar riski var; KVKK açısından sorunlu. |
| F11 | **Win-back "5X puan" vaadini hiçbir mekanizma karşılamıyor.** Gönderim 100 kişide sessizce kesiliyor ve tekrar tıklamada aynı kişilere tekrar gidiyor. | `components/dealer/radar-interactive.tsx:44`; `app/api/dealer/win-back/route.ts:15,116,141-159` | Müşteriye yerine getirilemeyen bir söz veriliyor. |
| F12 | **QR rotate işlemi ve `revoke:false` kotayı atlatıyor.** | `app/api/qr-codes/[id]/rotate/route.ts:48-56`; `app/api/qr-codes/[id]/route.ts:70-71` | Plan limiti sınırsız aşılabilir. |

**Doğrulamada "belirsiz" kalanlar (P0'a alınmadı):** QR içeriğinin `window.location.origin` ile üretilmesi (etkisi dağıtım yapılandırmasına bağlı). Stripe planının metadata'dan çözülmesi (tetikleyici yok). `customPrompt` üzerinden kiracılar arası enjeksiyon (önem orta). Remedy otomasyonundaki yarış koşulu (önem düşük).

---

## 4. Sayfalar arası ortak temalar ve kök nedenler

Aynı hata 45 sayfada tekrar tekrar karşımıza çıkıyor. Her tema **tek bir paylaşılan çözümle** kapatılmalı, sayfa sayfa yamayla değil.

| # | Tema | Görüldüğü sayfalar (örnek) | Kök neden | Tek çözüm |
|---|---|---|---|---|
| T1 | **Veri kapsamı her route'ta elle kuruluyor** | feedbacks, ai-insights, ai-chat, action-items, incidents, staff, staff/field | `requireAuth()` rol listesi almadan çağrılıyor; STAFF'ın `dealerId`'si `token.dealerId` alanında duruyor ve unutuluyor | `lib/auth/dealer-scope.ts`: `resolveDealerScope(session)` deny-by-default çalışsın, STAFF için aktiflik kontrolü (Redis'te kısa TTL) yapsın, tanınmayan rolde 403 dönsün. Her rol için yetki matrisi testi. |
| T2 | **Modül kapısı yalnız sidebar'da** | ai-chat, ai-settings, benchmark, heatmap, roi, surveys, voc-wall, remedy-queue, churn-risk, campaigns/[id], discover | `assertModuleEnabled` `app/api/dealer` altında yalnız 5 dosyada var (taranarak doğrulandı) | `withDealerModule(moduleKey, handler)` sarmalayıcısı, sayfa layout'unda sunucu tarafı kapı ve "modül kapalı" boş durumu. |
| T3 | **Hata = boş durum** | ~25 sayfa: action-items, ai-settings, billing, churn-risk, consumptions, customers, heatmap, incidents, onboarding, products, remedy-queue, segment-actions, surveys, weekly-brief, staff/field… | Ham `fetch` kullanılıyor, `res.ok` kontrol edilmiyor, React Query her yerde kullanılmıyor | `lib/http/fetch-json.ts` (ApiError fırlatır) + `<DataState>` bileşeni: loading / error / empty / forbidden / module-off. Sayfalar React Query'ye taşınsın. |
| T4 | **Saat dilimi UTC** | analytics, heatmap, copilot, operations-brief, voc-wall, business-outcomes, roi, benchmark, ai-settings, staff | Vercel UTC'de çalışıyor; `lib/timezone.ts` var ama kullanılmıyor | `lib/dealer-time.ts`: `User.timezone` (varsayılan Europe/Istanbul) ve SQL'de `AT TIME ZONE` gruplaması. Etiketler istemcide `Intl` ile üretilsin. |
| T5 | **Dönem tanımı ve karşılaştırma tutarsız** | dealer ("30 gün" = tüm zamanlar), roi (kısmi ay ile tam ay), business-outcomes, analytics (birim hataları), copilot | Her uç kendi tarih aralığını hesaplıyor | `lib/period.ts`: `{range, compare}` sözleşmesi, URL'de `?period=`, birimli delta (`abs|pct|pp`) ve ortak `<DeltaBadge>`. |
| T6 | **Platform geneli CLV** | customers, segment-actions, churn-risk, campaigns (VIP), radar | Şema hatası | `DealerCustomerStats` (`@@unique([dealerId,userId])`), günlük cron'a bağlanacak. |
| T7 | **GET isteğinde arka plan üretimi** | action-items, incidents, ai-insights, operations-brief | "Bakınca tetiklenir" tasarımı | Üretim Inngest veya günlük cron'a taşınsın; sayfa yalnız okusun; manuel yenileme rate-limit + Redis NX kilidiyle yapılsın. |
| T8 | **Kontrol-sonra-oluştur, benzersiz kısıt yok** | action-items, incidents, remedy (3 uç), auto-reply, weekly-brief | Uygulama seviyesinde tekilleştirme | Kısmi benzersiz index'ler + `createMany skipDuplicates` / `P2002` yakalama + `Idempotency-Key`. |
| T9 | **LLM sayı uyduruyor** | ai-insights (NPS/CSAT/CES), operations-brief (skor/trend), weekly-brief ("AI özeti" aslında playbook metni), copilot ("AI destekli" ama AI yok) | Metrik ile anlatı aynı prompt'tan geliyor | Metrikler sunucuda deterministik hesaplansın; LLM yalnız anlatı üretsin; her metrikte n ve "nasıl hesaplandı" bilgisi; çıktı Zod ile doğrulansın. |
| T10 | **AI maliyet ve politika kapısı parçalı** | ai-chat, ask-analytics, operations-brief, ai-insights, ai-settings, auto-replies | `runChatCompletion` dışındaki LLM yolları korumasız | Tek `aiGateway.call({dealerId, purpose})`: politika (isEnabled, modül) + cost guard + kayıt + 429 eşlemesi. |
| T11 | **Pazarlama gönderiminin tek bir servisi yok** | campaigns, radar/win-back, segment-actions, innovation | Her sayfa doğrudan `notification.createMany` çağırıyor | `lib/marketing/deliver.ts`: tercih ve rıza filtresi, frekans tavanı, `draft→sending→sent|failed` durumları, kuyruk, `CampaignRecipient`, `data.kind`. |
| T12 | **Ölçüm ve atıf yok** | campaigns/performance, copilot, radar, roi, business-outcomes | Kimlik tabanlı atıf yok; `scanCount` geri bildirim sayıyor | `Feedback.campaignId`, tarama olayının sayılması, kapalı döngü metrikleri (yanıt → geri dönüş → ciro). |
| T13 | **KPI'lar sayfa örnekleminden hesaplanıyor** | feedbacks (20/50 kayıt), qr-codes (12), dealer (dağılım son 5 kayıttan), churn-risk (satır = müşteri) | Özet ucu yok | Her listenin yanında bir `/summary` ucu (groupBy + Redis 60 sn). |
| T14 | **Sahte ve ölü ayarlar** | ai-settings (16), settings (bildirimler, tatil, saatler, şablon), team (5 salt-okunur sekme), onboarding (sahte kısıtlama), staff/field, discover | Önce arayüz yazılıp tüketici bağlanmamış | "Tüketicisi yoksa ayar yok" kuralı: ya bağlansın ya kaldırılsın. Açılış öncesi bütün ayarlar için tüketici taraması. |
| T15 | **Geri dönülmez işlemler onaysız** | qr-codes, surveys (cascade), campaigns (gönder/sil), remedy-queue, remedy templates, team (pasifleştirme) | `AlertDialog` ve arşiv deseni yok | Arşivleme varsayılan olsun; gerçek silmede etkiyi sayıyla anlatan onay diyaloğu ve "Geri al" toast'ı. |
| T16 | **Navigasyon 4 kez kopyalanmış, 6 yetim sayfa var** | sidebar, discover, growth-hub, experience-guide | Tek katalog yok | `lib/nav/dealer-nav.ts`: sidebar, ⌘K paleti ve hub'lar bu katalogdan türesin; sapma testi. |
| T17 | **Feedback ile ConsumptionReview iki ayrı dünya** | feedbacks, reviews, copilot, operations-brief, dealer, remedy | Birleşik VoC katmanı yok | `lib/voc/` birleşik satır şeması (`source: qr|consumption`) ve tek gelen kutusu ucu. |
| T18 | **NULLS FIRST sıralama** | copilot, customers | Prisma'da `nulls:'last'` kullanılmıyor | Lint kuralı ve ortak sıralama yardımcısı. |
| T19 | **API Türkçe metin döndürüyor** | dealer, copilot, voc-wall, roi, remedy-automation, segment-actions, innovation | i18n yalnız istemcide | API `{code, params}` döndürsün; istemci `t()` ile çevirsin; eksik anahtarlar CI'da yakalansın (auto-replies'ta 9 anahtar yok). |
| T20 | **Yalnız hover ile görünen aksiyonlar ve erişilemez kontroller** | copilot, churn-risk, products, radar, qr-codes (elle yazılmış modal), settings | `opacity-0 group-hover`; `components/ui/progress.tsx` `value`'yu Radix'e iletmiyor | Aksiyonlar her zaman görünür olsun; shadcn Dialog/Sheet kullanılsın; paylaşılan Progress düzeltilsin (birden çok sayfayı etkiliyor). |

---

## 5. Bilgi mimarisi önerisi

### 5.1 Sayfa kararları

| Karar | Sayfalar | Hedef |
|---|---|---|
| **Kaldır (redirect)** | `/dealer/experience-guide` | `/dealer`'a 301; yardım işlevi bağlamsal "?" çekmecesine taşınsın |
| | `/dealer/discover`, `/dealer/growth-hub` | ⌘K komut paleti + `/dealer/analytics`'e redirect |
| | `/dealer/ask-analytics` | `/dealer/assistant?q=` (grounding mantığı korunacak) |
| | `/dealer/operations-brief`, `/dealer/copilot` | "Bugün" ana sayfasına eritilsin |
| | `/dealer/weekly-brief` | "Bugün → Haftalık rapor" sekmesi + arşiv |
| **Birleştir** | `/dealer/feedbacks` + `/dealer/reviews` + `/dealer/remedy-queue` + `/dealer/incidents` | **Gelen Kutusu** (`/dealer/inbox`): Yanıt bekleyen / Telafi onayı / Vakalar / Tümü sekmeleri, sağda detay paneli |
| | `/dealer/action-items` | Gelen kutusu "Bana atananlar" görünümü + Bugün'deki "Yapılacaklar" bloğu |
| | `/dealer/customers` + `/dealer/churn-risk` + `/dealer/radar` + `/dealer/segment-actions` | **Müşteriler** (`/dealer/customers`): liste + 360 çekmecesi, "Risk" ve "Segmentler" sekmeleri, radar görselleştirmesi bir sekme olarak |
| | `/dealer/roi` + `/dealer/business-outcomes` | **Etki ve ROI** (`/dealer/analytics/impact`) |
| | `/dealer/heatmap` | `/dealer/analytics` "Yoğunluk" sekmesi |
| | `/dealer/ai-chat` + `/dealer/ask-analytics` | **AI Asistan** (sayfa + global çekmece) |
| | `/dealer/ai-insights` | Analitik → "İçgörü raporu" (öğrenme bölümü AI ayarlarına taşınsın) |
| | `/dealer/innovation` | Parçalansın: flash teklif → Pazarlama/Teklifler, segment önerileri → Pazarlama/Kampanyalar, masa sinyali → Gelen Kutusu/Vakalar, haftalık özet → Bugün |
| | `/staff/field` | `/staff` ana sayfasında "Saha bildirimi" butonu; yönetici tarafında `/dealer/team` "Saha akışı" |
| **Yeniden inşa** | `/dealer/team`, `/dealer/customers`, `/dealer/segment-actions` (Müşteriler içinde), `/dealer/campaigns/[id]/performance` | |
| **Koru ve iyileştir** | `/dealer/products` | |

### 5.2 Yeni menü yapısı (9 üst blok, 45 → yaklaşık 24 rota)

```
Bugün                    /dealer                    (dashboard + copilot + operasyon özeti + haftalık rapor + kurulum kartı)
Gelen Kutusu  [rozet]    /dealer/inbox              (QR + tüketim yorumları, telafi onayı, vakalar, bana atananlar)
Müşteriler               /dealer/customers          (liste, 360 çekmece, Risk, Segmentler, Geri kazanım)
Pazarlama
  ├ Kampanyalar          /dealer/campaigns          (+ /[id] performans hunisi)
  ├ Teklifler            /dealer/offers             (flash teklif, kupon, telafi şablonları)
  └ Anketler             /dealer/surveys            (+ /[id] sekmeli detay: düzenle/paylaş/sonuç)
Analitik
  ├ Genel bakış          /dealer/analytics          (trend, dağılım, yoğunluk sekmesi)
  ├ İçgörüler            /dealer/analytics/insights (deterministik metrik + AI anlatı)
  ├ Kıyas                /dealer/analytics/benchmark
  └ Etki ve ROI          /dealer/analytics/impact
AI Asistan               /dealer/assistant          (+ her sayfadan ⌘J çekmece)
İşletme
  ├ Kasa / Kart okut     /dealer/scan
  ├ İşlemler             /dealer/consumptions
  ├ Ürünler              /dealer/products
  ├ QR ve şubeler        /dealer/qr-codes           (şube yönetimi buraya taşınır)
  ├ Ekip                 /dealer/team
  └ Mağaza ekranı        /dealer/voc-wall           (yönetim) + /wall/[token] (signage)
Otomasyon
  ├ Otomatik yanıtlar    /dealer/automation/replies
  ├ Telafi otomasyonu    /dealer/automation/remedy
  └ Uyarı kuralları      /dealer/automation/alerts  (olay eşikleri + churn müdahalesi ayarları)
Ayarlar                  /dealer/settings           (İşletme · Hesabım · Bildirimler · Güvenlik · AI · Abonelik)
```

- Kurulum (`/dealer/onboarding`) ayrı bir menü öğesi olmasın. Kurulum tamamlanana kadar Bugün sayfasında bir kart olarak dursun; tamamlandığında kaybolsun.
- Menü, rozetler ve ⌘K paleti tek bir `dealer-nav` kataloğundan türesin. Görünürlük sunucuda `getModuleControls` ile hesaplansın.
- Personel paneli (`/staff`) tek ekran olsun: **Bugün** (vardiya sayacı, açık görevler, checklist, saha bildirimi). Sekmeler: Görevler · Vardiyalar · İzin · Eğitim.

---

## 6. Profesyonel tasarım ve motion vizyonu

**İlke: "Sakin operasyon kokpiti."** Bayi, işletmeyi yönetirken paneli günde birkaç kez kısa aralarla açıyor (Toast ve Square kullanım deseni). Bu yüzden panel her açılışta önce "ne değişti, ne bekliyor" sorusunu yanıtlamalı; süs ikinci planda kalmalı.

### 6.1 Görsel dil
- **Tek sayfa iskeleti:** `DashboardPageHero` (başlık + bağlam cümlesi + birincil aksiyon) → `FilterBar` (dönem / şube / kaynak, URL ile senkron) → KPI şeridi → ana içerik → detay `Sheet`. Bugün 4 farklı hero kullanılıyor (elle yazılmış hero, `admin-premium-hero` içinde "Yönetim paneli" eyebrow'u bayiye görünüyor); hepsi tek bileşende toplanmalı.
- **Ortak bileşen seti** (`components/dealer/kit/`): `KpiTile` (değer + `DeltaBadge` + sparkline + n), `DataState`, `DetailSheet`, `ConfirmDialog` (etkiyi sayıyla anlatan), `StatusPill` (ikon + metin; yalnız renge dayanmaz), `SegmentBadge` (renk yalnız nokta/kenarda, AA kontrast), `EmptyState` (onboarding CTA'lı).
- **Grafikler:** elle yazılmış SVG'ler bırakılsın (analytics, voc-wall, ai-settings'teki bozuk çubuklar). Yerine `recharts` + shadcn `ChartContainer` kullanılsın: boş dönem `null` olsun (0 değil), eksen ve tooltip olsun, `role="img"` + sr-only tablo eklensin.
- **Yoğunluk:** masaüstünde Linear/Stripe yoğunluğunda tablo ve listeler. Mobilde kart + alt `Sheet`; bütün aksiyonlar her zaman görünür ve en az 44 px dokunma hedefi.
- **Dil:** bayi terim sözlüğü ("Kaybedilme riski", "Sektör kıyası", "Getiri"). İngilizce jargon ("Churn", "VoC Wall", "Benchmark") Türkçe arayüzde kullanılmasın.

### 6.2 Motion
- **Token'lar:** `fast 120ms` (hover/press), `base 200ms` (panel/sheet), `slow 320ms` (sayfa giriş). Tek easing: `[0.2, 0, 0, 1]`. Global `LazyMotion` + `m as Motion` deseni korunsun; sayfalardaki yerel `LazyMotion strict` sarmalayıcıları (consumptions vb.) kaldırılsın.
- **Motion yalnız durum değişikliğini anlatsın:** yeni yorumun listeye girişi (`AnimatePresence`), KPI değeri değişince sayı tween'i (`useReducedMotion` ile kapatılabilir), sheet açılış/kapanışı, iyimser güncellemede satır geçişi.
- **Yasak:** sonsuz marquee (voc-wall'da 3 tane), kart başına sonsuz "nabız" animasyonu, 500 öğeye kademeli giriş (radar), her yenilemede iskelete dönüş (voc-wall TV modu). Kademeli gecikme toplamı 0,6 sn'yi aşmasın.

### 6.3 Nerede 3D/canvas, nerede sade
| Yüzey | Yaklaşım | Gerekçe |
|---|---|---|
| Gelen Kutusu, Müşteriler, Ayarlar, Kasa, Ürünler, Ekip | **Tamamen sade.** Animasyon yalnız mikro geçişlerde. | Hız ve okunurluk kritik; kasada her milisaniye önemli. |
| Analitik | Sade 2D grafik; ısı haritası klavye ile gezilebilir ızgara | Doğruluk ve erişilebilirlik süsten önce gelir. |
| Müşteriler → Geri kazanım (radar) | **Canvas 2D**, en fazla 24 öncelikli nokta + küme rozeti. Yarıçap = gecikme, boyut = değer, renk = durum. | Şu anki radar konumları sahte ve id sırasına göre çiziliyor; görselleştirme ancak gerçek bir anlam taşırsa kalmalı. |
| Mağaza ekranı `/wall/[token]` | **three.js / canvas ortam katmanı** (yavaş parçacık veya ışık) + büyük tipografi + "Puan ver" QR'ı | Signage bir marka sahnesi; uzaktan okunur olmalı ve gece boyunca açık kalabilmeli (düşük GPU profili, `prefers-reduced-motion`). |
| Kurulum tamamlandı / ilk 100 yorum gibi kilometre taşları | Tek seferlik kısa 3D kutlama (mevcut sürpriz kutusu tekniği) | Duygusal an; günlük akışı bölmüyor. |
| Personel paneli | Sade; büyük dokunma hedefleri; vardiya sayacı tek animasyon | Ortak tablet kullanımı. |

3D bileşenler `ssr:false` ile kod-bölünsün. Doğrulamada tahmin yürütülmesin; görsel 3B doğrulama tezgâhı (headless Chrome) ile kontrol edilsin.

---

## 7. Önceliklendirilmiş epikler

Her epik **bağımsız bir dosya kümesine** dokunacak şekilde bölündü, böylece ayrı ajanlara paralel verilebilir. Bağımlılıklar parantez içinde belirtildi. Efor: S ≤ 1 gün, M 2-4 gün, L 1-2 hafta, XL 2 hafta ve üzeri.

### P0 — Güvenlik, para ve veri kaybı (hepsi paralel)

| ID | Epik | Sayfalar | Gerekçe | Efor |
|---|---|---|---|---|
| P0-1 | Personel hesap güvenliği: var olan kullanıcı dalını kaldır ve davet akışına geç, `isActive` kontrolünü authorize + `requireActiveStaff`'a ekle, PIN'i hash'le ve audit'ten çıkar, signOut düzelt | team, staff, staff/field | S1, S5 — hesap ele geçirme ve işten çıkarılan personelin erişimi | M |
| P0-2 | Kiracı kapsamı: `resolveDealerScope`, `/api/feedbacks` + `/api/ai/{detailed,analyze,learning}` kapsamı, analyze IDOR (metin DB'den okunsun) | feedbacks, ai-insights, ai-chat | S2, S3, S4 — kiracılar arası okuma ve yazma | M |
| P0-3 | Puan basma kapıları: happy-hour çarpanı 1-3 arası clamp, tüketim kaydı + puan + `points_credited` tek `$transaction`, `Idempotency-Key`, `offline-sync` ucunu kapat | scan, consumptions, dealer | D1, D2 — ekonomi değişmezleri | M |
| P0-4 | Atanan kullanıcı ve PII: `assignedToId` → aktif DealerStaff doğrulaması; `...row` yayılımı yerine açık DTO (consumptions, reviews); müşteri e-postası maskelensin | action-items, incidents, consumptions, reviews, customers, scan | S6 + PII veri minimizasyonu | S |
| P0-5 | CLV acil yaması: API'de bayi bazlı `consumption.groupBy`, global segment ve churn gizlensin (kalıcı model P1-6'da) | customers, segment-actions, churn-risk | S7 — rakip verisi sızıntısı | S |
| P0-6 | AI politika kapısı: `aiGateway` (isEnabled + `ai_features` + cost guard), `ai-retry` cron'u ve pipeline'a AI-kapalı politikası, operations-brief rate-limit + kalıcı rapor | ai-chat, ai-insights, ai-settings, operations-brief, ask-analytics, auto-replies | S9, F9 — gizlilik ve kota DoS | M |
| P0-7 | Yıkıcı işlemler: QR arşivleme + Feedback `Restrict`, toplu uçta requireAuth + audit, ayarlar/AI ayarları formunu yüklenemezse kilitle + diff-PATCH | qr-codes, settings, ai-settings | D4, D5, D6 — geri dönülmez veri kaybı | M |
| P0-8 | Faturalama: aktif abonelikte checkout yerine `subscriptions.update`, webhook tekilliği (`StripeEvent`) ve sıra koruması, `res.ok` | billing | D3 — çift ücret | M |
| P0-9 | Kasa kamerası: tarama sayfalarına `camera=(self)` (next.config + proxy), `useQrScanner` ile ref kilidi ve pause | scan (+ müşteri tarama) | F1, F2 — ana kasa akışı kırık | S |
| P0-10 | Telafi bütünlüğü: geçersiz gövdede 400, açık teklif varsa 409 + kısmi unique, accept'te seçenek doğrulaması, `rejected` durumunu yeniden üretmeme, churn flash teklifini kişiye bağla | feedbacks, remedy-queue, remedy-automation, templates, churn-risk | D7, D8, D12 | M |
| P0-11 | Müşteriye dönük içerik güvenliği: VoC duvarında toksik/güven/fraud filtresi + isim maskeleme; auto-reply'da atomik tek seferlik kilit + elle yazılan yanıtı koruma; e-posta `escapeHtml` | voc-wall, settings/auto-replies, reviews, weekly-brief | F10, D9, S8 | M |
| P0-12 | Pazarlama gönderiminin acil kapısı: tercih filtresi (`isChannelEnabled` + `data.kind`), sahte e-posta kanalını devre dışı bırak, risk-segment'e onay, segment-actions 400'leri düzelt, win-back 5X vaadini kaldır | campaigns, radar, segment-actions, innovation | F3, F4, F11 (kalıcı servis P1-5'te) | M |
| P0-13 | Anket bütünlüğü: paylaşılan discriminated-union şeması (create + fill), seçenek/aralık/uzunluk doğrulaması, mevcut bozuk anketleri tespit et | surveys/create, surveys, surveys/[id]/results | F6 | S |
| P0-14 | Arka plan kayıt hataları: digest çakışması (tek üretici + `notifiedAt`), demo olayı kaldır + temizlik, QR rotate/revoke kota kontrolü | weekly-brief, innovation, incidents, qr-codes | D10, D11, F12 | S |

### P1 — Ortak altyapı ve metrik doğruluğu

| ID | Epik | Sayfalar | Gerekçe | Efor |
|---|---|---|---|---|
| P1-1 | `fetchJson` + `<DataState>` + React Query göçü (gruplara bölünüp paralel: Analitik / Gelen kutusu / İşletme / Ayarlar) | ~25 sayfa (T3) | Hata = boş durum, çökme ekranları | M |
| P1-2 | `withDealerModule` + sunucu layout kapısı + `dealer-nav` kataloğu | Bütün modüllü sayfalar, sidebar, discover, growth-hub | T2, T16 — kill-switch bütünlüğü | M |
| P1-3 | `lib/dealer-time` + `lib/period`: saat dilimi, dönem seçici, birimli delta; heatmap gün kayması ve veri taşıma | analytics, heatmap, copilot, operations-brief, voc-wall, roi, business-outcomes, benchmark, dealer, staff | T4, T5, F7 | M |
| P1-4 | Metrik doğruluğu: gerçek tarama sayacı, dönüşüm oranı, `/summary` uçları, benchmark `rank` DTO + k-anonimlik, `nulls:'last'`, "30 gün" kartı, tekil müşteri sayımı, benchmark widget kaydı | qr-codes, feedbacks, dealer, churn-risk, benchmark, customers, copilot, settings | T13, T18 | M |
| P1-5 | Pazarlama teslim servisi: `lib/marketing/deliver`, rıza modeli, frekans tavanı, kuyruk, `CampaignRecipient`, durum makinesi | campaigns, radar, segment-actions, innovation | T11 (P0-12'nin üzerine) | L |
| P1-6 | `DealerCustomerStats` modeli + günlük hesaplama + müşteri metrik servisi (churn ve segment tek kaynak) | customers, churn-risk, segment-actions, radar, campaigns | T6 kalıcı çözüm | L |
| P1-7 | GET yan etkilerini kaldır: action-items AI önerileri `suggested` durumuyla, olay tespiti Inngest/cron + `dedupeKey`, AI içgörü raporu kalıcı | action-items, incidents, ai-insights, operations-brief | T7, T8, F8 | M |
| P1-8 | Deterministik AI metrikleri: LLM'e verilen metrik alanlarını kaldır, n + açıklama ekle, weekly brief'e gerçek AI özeti ve metrik alanları | ai-insights, operations-brief, weekly-brief, copilot | T9 — kullanıcıya uydurma veri gösteriliyor | M |
| P1-9 | Kampanya atfı: `Feedback.campaignId`, public formun `cmp` parametresini taşıması, performans hunisi, `lib/campaign-attribution` (copilot ile paylaşılan) | campaigns/[id]/performance, campaigns, copilot | F5, T12 | L |

### P2 — Bilgi mimarisi ve yeniden inşa

| ID | Epik | Sayfalar | Gerekçe | Efor |
|---|---|---|---|---|
| P2-1 | IA göçü: redirect'ler, ⌘K paleti, yeni 9 bloklu menü (P1-2'ye bağlı) | discover, growth-hub, experience-guide, ask-analytics, operations-brief, weekly-brief | 6 yetim sayfa, 4 nav kopyası | M |
| P2-2 | **Gelen Kutusu**: birleşik VoC ucu (cursor sayfalama), detay paneli, yanıt editörü (şablonlar + `defaultReplyTemplate`), telafi, atama, SLA | feedbacks, reviews, remedy-queue, incidents, action-items | T17 — bayinin günlük ana işi 5 sayfaya dağılmış (Medallia closed-loop) | XL |
| P2-3 | **Bugün** ana sayfası: dikkat bekleyenler, dönem seçici, NBA, haftalık rapor sekmesi, kurulum kartı | dealer, copilot, operations-brief, weekly-brief, onboarding | Tek "ne yapmalıyım" yüzeyi | L |
| P2-4 | **Müşteriler 360**: liste + çekmece + Risk/Segment/Geri kazanım sekmeleri, toplu aksiyon (P1-5 ve P1-6'ya bağlı) | customers, churn-risk, radar, segment-actions | 4 çakışan sayfa | L |
| P2-5 | **Ekip yeniden inşa**: davet akışı, vardiya planlayıcı, görev atama, izin onayı, eğitim/checklist editörü, saha akışı; personel "Bugün" ekranı | team, staff, staff/field | 5 salt-okunur sekme, kapanmayan iş döngüsü | XL |
| P2-6 | **Analitik konsolidasyonu**: recharts kiti, yoğunluk sekmesi, şube kırılımı, Etki ve ROI birleşimi, drill-down | analytics, heatmap, benchmark, roi, business-outcomes | T5 ve çakışmalar | L |
| P2-7 | **AI Asistan**: kaynaklı (atıflı) yanıt, streaming, sohbet geçmişi ucu, mesaj tablosu, global çekmece | ai-chat, ask-analytics | Geçmiş sohbet açılmıyor, yarış koşulu | L |
| P2-8 | Ayar dürüstlüğü: sahte ayarları kaldır veya bağla, gerçek bildirim matrisi, yapılandırılmış çalışma saatleri, dil tercihinin uygulanması, oturum güvenliği | ai-settings, settings, onboarding | T14 | M |
| P2-9 | QR stüdyosu ve şubeler: `buildQrTargetUrl`, `/q/{code}`, `locationId` ataması, WYSIWYG baskı, şube yönetimini buraya taşı | qr-codes, remedy-automation/templates | Mekâna özel şablonlar ölü özellik | M |
| P2-10 | Anket modülü: düzenleme + sürümleme, arşiv, paylaş paneli (link + QR), SQL toplama, AI tema özeti | surveys, surveys/create, surveys/[id]/results | Yaşam döngüsü eksik | M |
| P2-11 | Otomasyon merkezi: kural kurucu (paylaşılan zod), dry-run, çalışma geçmişi, uyarı kuralları sayfası | settings/auto-replies, remedy-automation, incidents | Ölü kurallar, sonuç görünürlüğü yok | M |

### P3 — Cila ve tutarlılık

| ID | Epik | Sayfalar | Gerekçe | Efor |
|---|---|---|---|---|
| P3-1 | Tasarım kiti + motion token'ları (`components/dealer/kit`), hero standardizasyonu, sonsuz animasyonların kaldırılması | Bütün panel | §6 tutarlı dil | M |
| P3-2 | Erişilebilirlik taraması: hover-only aksiyonlar, `Progress` düzeltmesi, elle yazılmış modaller → Dialog, etiketler, başlık hiyerarşisi | products, qr-codes, copilot, churn-risk, settings, surveys, voc-wall, roi | T20 | M |
| P3-3 | i18n taraması: API `{code, params}`, eksik anahtar CI kontrolü, terim sözlüğü, Türkçe `toLocaleLowerCase('tr-TR')` | Bütün panel | T19 | M |
| P3-4 | Ürünler iyileştirme: görsel, tükendi/arşiv, kategori yönetimi, URL arama durumu, ürün başına deneyim analitiği | products | Tek "koru" kararı alan sayfa | M |
| P3-5 | Mağaza ekranı signage: `/wall/[token]` DisplayToken, tam ekran, 3D ortam katmanı, SSE akış | voc-wall | §6.3 marka sahnesi | M |

**Paralel uygulama notu:** P0 epiklerinin dosya kümeleri büyük ölçüde ayrık. Çakışmalar: P0-2 ile P0-6 `app/api/ai/analyze/route.ts`'i paylaşıyor; P0-10 ile P0-12 `app/dealer/feedbacks/page.tsx`'e dokunuyor; P0-7 ile P0-14 `app/api/qr-codes/**`'u paylaşıyor. Bu çiftler aynı ajana verilsin ya da sıralı birleştirilsin. Canlı Neon'u etkileyen şema değişiklikleri (P0-7 `Restrict`, P0-10 kısmi unique, P1-6, P1-9, P2-2) için ayrı ve yedekli bir migration planı şart: yerel `DATABASE_URL` canlı veritabanını gösteriyor.
