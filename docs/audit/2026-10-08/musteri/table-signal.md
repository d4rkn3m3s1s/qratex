# /table-signal

**Amaç:** Masadaki misafirin, şikâyet ya da yorum formuna girmeden, işletme ekibine tek dokunuşla "her şey yolunda" ya da "bir şey var" sinyali göndermesi (QR veya kiosk ile açılan, oturum gerektirmeyen sayfa). Kayıt `TablePulse` modeline düşer; bayi tarafında `/dealer/innovation` sayfasında listelenir ve admin sağlık skoru 2.0 hesabına girer.

**Genel puan: 4.5 / 10** · **Karar: yeniden tasarla** (giriş noktası `/c/[token]` QR akışıyla birleştirilmeli; ayrıntısı en sonda)

> Özet: Sayfa küçük, temiz ve teknik olarak "kayıt oluşturma" işini yapıyor. Ama ürünün asıl vaadi olan kapalı döngü yok. Misafire "ekip ilgilenecek" deniyor; oysa ekibe bildirim gitmiyor, bayi arayüzü misafirin notunu göstermiyor, "kapat/çözüldü" API'sinin de arayüzde çağıranı yok. Uç nokta herkese açık ve rate limit içermiyor. Bu yüzden herkes, herhangi bir bayi için sınırsız sahte sinyal üretip admin sağlık skorunu ve masa bazlı personel içgörülerini manipüle edebiliyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Kayıt oluşuyor. Ancak vaat edilen "ekip ilgilenecek" döngüsü (bildirim, notun görünmesi, kapanış) uçtan uca kopuk, kötüye kullanıma karşı da koruma yok. |
| UX | 4/10 | İki büyük buton net. Ama işletme adı görünmüyor, başarı yalnızca köşede kaybolan bir toast, "bir şey var" dendiğinde neyin ters gittiği sorulmuyor ve tekrar basmayı engelleyen bir şey yok. |
| Görsel | 4/10 | Düz shadcn kartı. Marka, işletme kimliği, durum geçişi ve "gönderildi" anı yok. Platformun geri kalanındaki cilalı dilden kopuk. |
| Mimari | 4/10 | Ham `dealerId` (User.id) URL'de, bayi QR sisteminden ayrı bir yol. Feature flag'i sayfa bilmiyor. Route'ta try/catch yok, rate limit yok, sunucu mesajları yalnızca TR, Zod hataları da varsayılan İngilizce. |
| Performans | 7/10 | Sayfa hafif, 1 POST. Sunucuda istek başına önbelleksiz Settings okuma + 2 sorgu + oturum çözümü var; kabul edilebilir. Kök layout'tan gelen global chatbot ve PostHog yükü bu tek dokunuşluk sayfa için gereksiz. |
| Erişilebilirlik + mobil | 6/10 | Label/Input eşleşmesi doğru, butonlar 56px yüksekliğinde ve mobilde alt alta diziliyor. Emerald-600 üzerindeki beyaz metin AA'yı geçmiyor, alt metin 10px, sonuç için kalıcı/odaklanabilir bir durum yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (title/description) | KISMİ | app/table-signal/page.tsx:4-7 | Başlık sabit TR. `robots: noindex` yok; kök layout `alternates.canonical: '/'` mirası nedeniyle canonical ana sayfaya gidiyor (app/layout.tsx:66-67). Kiosk/QR sayfası index'lenebilir durumda. |
| 2 | Suspense fallback "Yükleniyor…" | KISMİ | page.tsx:11-16 | Çalışıyor ama metin sabit TR, i18n'e bağlı değil. `useSearchParams` için Suspense sarmalı doğru. |
| 3 | URL parametrelerini okuma (`dealerId`, `qrCodeId`, `table`) | ÇALIŞIYOR | table-signal-client.tsx:15-18 | `?table=` masa alanını ön dolduruyor. |
| 4 | `dealerId` yokken "Bağlantı eksik" kartı | KISMİ | table-signal-client.tsx:56-67 | Doğru metin var ama çıkış yolu yok: "QR tara", "Ana sayfa" gibi bir CTA bulunmuyor. Kart çıplak duruyor. |
| 5 | Geçersiz/var olmayan `dealerId` durumu | KISMİ | api/innovation/table-pulse/route.ts:38-44 | Sayfa açılışta doğrulama yapmıyor. Misafir formu doldurup bastıktan sonra öğreniyor ("İşletme bulunamadı", yalnızca TR toast). |
| 6 | Başlık bloğu (eyebrow + h1 + açıklama) | KISMİ | table-signal-client.tsx:72-78; messages/tr.json `tableSignal.description` | i18n'li. Ancak "Kişisel veri toplanmaz" iddiası, sessiz hesap eşlemesi ve serbest metin notla çelişiyor (bkz. Bulgu 4). |
| 7 | İşletme kimliği (ad/logo/şube) gösterimi | EKSİK | client bütünü | Misafir sinyali hangi işletmeye gönderdiğini görmüyor; yanlış/kopyalanmış QR'ı fark edemez. |
| 8 | Masa/bölüm alanı | KISMİ | table-signal-client.tsx:82-91; route.ts:14 | İstemcide `maxLength` yok, sunucu 32 karakter sınırı koyuyor. 33+ karakter girilirse Zod v3'ün varsayılan İngilizce mesajı toast'a düşüyor ("String must contain at most 32 character(s)"). Serbest metin olduğu için bilinen masalarla doğrulanmıyor. |
| 9 | Kısa not alanı | KISMİ | table-signal-client.tsx:92-101 | `maxLength={400}` var. Tek satırlık `Input`, karakter sayacı yok. Not bayi arayüzünde hiç gösterilmiyor (bkz. #24). |
| 10 | "Her şey yolunda" (OK) butonu | ÇALIŞIYOR | table-signal-client.tsx:104-116 → route.ts:60-69 | `TablePulse` kaydı `mood: 'OK'` ile oluşuyor. |
| 11 | "Bir şey var" (CONCERN) butonu | KISMİ | table-signal-client.tsx:117-130 | Kayıt oluşuyor. Ama sorunun ne olduğu sorulmuyor (neden çipi yok) ve karşılığında ekipte hiçbir aksiyon tetiklenmiyor (bkz. #23). |
| 12 | Gönderim sırasında spinner + iki butonu kilitleme | ÇALIŞIYOR | table-signal-client.tsx:22, 29, 108-114, 122-128 | Çift tıklamaya karşı gönderim süresince korumalı. |
| 13 | Başarı geri bildirimi (toast + notu temizleme) | KISMİ | table-signal-client.tsx:47-48 | Yalnızca sağ altta kaybolan bir sonner toast'ı var (components/ui/toaster.tsx:23 `position="bottom-right"`). Sayfa durumu değişmiyor, kalıcı bir "iletildi" ekranı ya da sonraki adım yok. |
| 14 | API hata mesajlarının gösterimi | KISMİ | table-signal-client.tsx:43-46; route.ts:26, 33, 43, 52 | Sunucu mesajları sabit TR. EN arayüzde misafir Türkçe hata görüyor; Zod hataları ise İngilizce. Dil karışıklığı var. |
| 15 | Ağ/sunucu hatası yakalama | KISMİ | table-signal-client.tsx:49-50; route.ts (try/catch yok) | Route'ta try/catch yok. DB hatasında Next'in HTML 500'ü dönüyor, `res.json()` patlıyor ve misafir yanıltıcı biçimde "Bağlantı hatası" görüyor. `responseIfDatabaseUnavailable` deseni (diğer route'larda var) burada kullanılmamış. |
| 16 | İstemci `dealerId` boş kontrolü (`send` içinde) | KISMİ (neredeyse ölü kod) | table-signal-client.tsx:25-28 vs 56 | `dealerId` boşken bileşen zaten 56. satırda erken dönüyor. Bu blok yalnızca `dealerId=%20` gibi boşluklu değerlerde çalışır. Mesaj da teknik ("dealerId eksik"), son kullanıcıya göre yazılmamış. |
| 17 | Alt bilgi metni (hesap eşlemesi) | KISMİ / yanıltıcı | table-signal-client.tsx:135-137; tr.json `tableSignal.footer` | "İsteğe bağlı hesap eşlemesi yapılabilir" yazıyor ama sayfada seçim yapılacak bir kontrol yok; eşleme otomatik. Metin 10px. |
| 18 | Oturum açmış CUSTOMER için `customerId` eşlemesi | KISMİ | route.ts:56-58, 67 | Teknik olarak çalışıyor ama rıza ve vazgeçme yok, misafire de gösterilmiyor (KVKK, Bulgu 4). |
| 19 | Feature flag (`features.tablePulse`) | KISMİ | route.ts:24-27; lib/innovation-config.ts:103-115 | Sunucuda kapı var. Sayfa ise bayrağı bilmiyor: özellik kapalıyken misafir formu dolduruyor, sonra "Özellik devre dışı" (TR) toast'ı alıyor. Bayrak kapalıyken sayfa baştan "bu işletmede kapalı" demeli. |
| 20 | `qrCodeId` sahiplik doğrulaması | KISMİ | route.ts:46-54 | QR'ın bu bayiye ait olduğu doğrulanıyor. `isActive`, `revokedAt`, `expiresAt` kontrol edilmiyor (prisma/schema.prisma `model QRCode`); iptal edilmiş/süresi dolmuş QR ile sinyal kabul ediliyor. |
| 21 | Bayi doğrulaması (`role: 'DEALER'`) | ÇALIŞIYOR | route.ts:38-44 | |
| 22 | Kötüye kullanım / rate limit | EKSİK | route.ts bütünü; lib/rate-limit.ts:96-102 (`checkPublicActionRateLimit` mevcut ama kullanılmıyor) | Herkese açık, kimliksiz, sınırsız POST (Bulgu 1). |
| 23 | CONCERN sonrası ekibe anlık bildirim (push/Notification/staff) | EKSİK | route.ts:60-71 (yalnızca `create`); repo genelinde `tablePulse` yalnızca api + dealer/innovation'da geçiyor | "Sinyal iletildi — ekip ilgilenecek" vaadi karşılıksız (Bulgu 2). |
| 24 | Misafir notunun bayiye ulaşması | EKSİK (uçtan uca) | api/dealer/innovation/table-pulses/route.ts:38-45 (`note` seçiliyor) vs app/dealer/innovation/page.tsx:337-347 (`note` render edilmiyor) | Misafirin yazdığı not hiçbir arayüzde görünmüyor. |
| 25 | Kapanış döngüsü (`resolvedAt`) | BOZUK | app/api/dealer/innovation/table-pulses/[id]/resolve/route.ts var; çağıran UI yok (grep: yalnızca api klasöründe) | `resolvedAt` hiç set edilmediği için sağlık skorundaki "kapanış" bonusu (lib/dealer-health-v2.ts:50-62) fiilen hep 0. |
| 26 | Misafire geri dönüş ("Ekip yolda / çözüldü") | EKSİK | — | Starbucks/Uber tipi durum takibi yok; misafir sinyalin görülüp görülmediğini bilmiyor. |
| 27 | Hızlı neden çipleri (servis yavaş, sipariş yanlış, temizlik, hesap…) | EKSİK | — | CONCERN tek başına aksiyon alınamaz bir veri. |
| 28 | Tam yorum/geri bildirim akışına köprü (`/c/[token]`) | EKSİK | grep: app/c/[token]/page.tsx'te sinyal entegrasyonu yok | CONCERN sonrası "Detay yazmak ister misiniz?" ya da OK sonrası "Deneyimini puanla, puan kazan" köprüsü yok. |
| 29 | Tekrar gönderim / bekleme süresi (cooldown) | EKSİK | table-signal-client.tsx:47-52 | Başarıdan sonra butonlar hemen tekrar aktif oluyor; aynı masadan art arda sınırsız sinyal gönderilebiliyor. |
| 30 | Açık/koyu tema | ÇALIŞIYOR | table-signal-client.tsx:120 (`dark:text-amber-400`) | |
| 31 | Mobil yerleşim | ÇALIŞIYOR | table-signal-client.tsx:70, 103 (`grid-cols-1 sm:grid-cols-2`, `h-14`) | Dokunma hedefleri yeterli. |
| 32 | Kontrast / tipografi erişilebilirliği | KISMİ | table-signal-client.tsx:106 (`bg-emerald-600` + beyaz metin ≈ 3.8:1), 135 (`text-[10px]`) | 16px normal metin için AA 4.5:1 sağlanmıyor; 10px alt bilgi okunaksız. |
| 33 | Ekran okuyucu için sonuç duyurusu | KISMİ | components/ui/toaster.tsx:20-26 | Sonner bölgesi canlı bölge olarak duyuruyor. Sayfa içinde kalıcı bir `role="status"` sonucu yok; odak hiçbir yere taşınmıyor. |
| 34 | Azaltılmış hareket | N/A | — | Sayfada animasyon yok (yalnızca `animate-spin`). Kök `PageTransition` var. |
| 35 | Çevrimdışı dayanıklılık (PWA) | EKSİK | table-signal-client.tsx:49-50 | Restoranda zayıf sinyal yaygın. İstek düşerse sinyal kayboluyor, kuyruğa alma/yeniden deneme yok. |
| 36 | Analitik/telemetri (PostHog olayı) | EKSİK | client'ta `posthog` çağrısı yok | Huni (açılış → gönderim → mood dağılımı) ölçülmüyor. |
| 37 | Global chatbot FAB'ı bu sayfada | KISMİ | app/layout.tsx:167; components/chat/chatbot.tsx (yol filtresi yok) | Tek dokunuşluk kiosk/QR sayfasında dikkat dağıtıyor ve gereksiz JS yüklüyor. |
| 38 | Dil seçimi | KISMİ | lib/app-locale.tsx:19-35 | Global locale'i izliyor (localStorage/oturum). Sayfada dil değiştirici yok; turist misafir EN'e geçemez. |
| 39 | Oyunlaştırma (XP/puan) | N/A (bilinçli yokluk) | — | Doğru karar: sinyale puan vermek sahte sinyali teşvik eder. Puan yalnızca köprülenen tam yorum akışında kazanılmalı. |

**Durum sayımı (N/A hariç 37 özellik):** ÇALIŞIYOR 7 · KISMİ 20 · BOZUK 1 · SAHTE 0 · EKSİK 9

---

## Bulgular

### 1. [YÜKSEK · Güvenlik/Veri bütünlüğü] Herkese açık, rate limit'siz POST ile her bayi için sınırsız sahte sinyal üretilebiliyor
- **Kanıt:** app/api/innovation/table-pulse/route.ts:23-71 (kimlik, captcha, IP/QR limiti yok); proxy.ts:105-119 (API'lere yalnızca header ekleniyor); lib/rate-limit.ts:96-102 (`checkPublicActionRateLimit` hazır ama kullanılmıyor); `dealerId` bayi paneli tarafından düz URL olarak dağıtılıyor (app/dealer/innovation/page.tsx:159).
- **Sorun:** `dealerId` bir kez görüldüğünde (QR'ın içinde açıkça yazıyor) bir script dakikada binlerce `CONCERN` kaydı atabilir. Etkiler:
  - Admin sağlık skoru 2.0'da `tableConcernRatio` cezası (lib/dealer-health-v2.ts:35-38, 47, 59) en fazla −25 puan ile manipüle edilir. Rakip bir işletme puanı düşürebilir, bayi de kendi puanını OK spam'iyle şişirebilir.
  - `table-performance` uç noktası masa koduna göre personel içgörüsü üretiyor (app/api/dealer/innovation/table-performance/route.ts:41-63). Serbest metin `tableCode` ile belirli bir masa veya personel hedef alınıp "itibarsızlaştırılabilir".
  - Tablo sınırsız büyür (`TablePulse` için retention/cleanup yok, doğrulanmadı).
- **Öneri:** (a) `checkPublicActionRateLimit` ile IP+dealer ve IP+tableCode kovaları açılmalı (ör. IP başına 10 dakikada 3 sinyal, aynı masa için 2 dakikada 1). (b) Ham `dealerId` yerine imzalı, bayi QR'ına bağlı kısa ömürlü bir token kullanılmalı (`/c/[token]` deseni): misafir QR'ı okutunca sunucu `QRCode` üzerinden bayiyi çözer. Böylece User.id dışarı sızmaz ve iptal edilen QR sinyal kabul etmez. (c) Sağlık skoru hesabı aynı IP/oturumdan gelen sinyalleri tekilleştirmeli, anormal patlamalar `SuspiciousActivity`'ye yazılmalı. (d) `TablePulse`'a `ipHash` ve `userAgentHash` alanları eklenip denetlenebilirlik sağlanmalı (KVKK uyumlu, tuzlu hash).
- **Efor:** M

### 2. [YÜKSEK · İşlevsellik/Ürün dürüstlüğü] "Ekip ilgilenecek" vaadi karşılıksız: bildirim yok, not görünmüyor, kapanış arayüzü yok
- **Kanıt:** messages/tr.json `tableSignal.concernMessage` = "Sinyal iletildi — ekip ilgilenecek."; route.ts:60-71 yalnızca `create` yapıyor, Notification/push/staff görevi yok; app/dealer/innovation/page.tsx:329-351 listede yalnızca masa, mood (ham `OK`/`CONCERN` İngilizce enum) ve tarih var, **not render edilmiyor**, liste ancak "Yenile" ile güncelleniyor; `PATCH /api/dealer/innovation/table-pulses/[id]/resolve` için arayüzde çağıran yok; `/staff` panelinde masa sinyali yok (grep).
- **Sorun:** Sayfanın var oluş nedeni olan "şikâyete dönüşmeden yakala" döngüsü işlemiyor. Misafir bir sorun bildiriyor, kimse anında görmüyor, not kayboluyor ve kayıt hiçbir zaman kapanmıyor. Sağlık skorundaki kapanış bonusu da bu yüzden hep 0 (lib/dealer-health-v2.ts:50-62). Kullanıcıya verilen mesaj fiilen yanıltıcı.
- **Öneri:** Uçtan uca "servis kurtarma" döngüsü kurulmalı:
  1. CONCERN geldiğinde `after()` içinde bayiye ve vardiyadaki STAFF'a web push ve `Notification` gönderilmeli (mevcut push merkezi altyapısı kullanılabilir), masa ve neden de eklenmeli.
  2. `/staff` ve `/dealer` için "Açık masa sinyalleri" canlı kuyruğu (SWR polling 15 sn ya da SSE): not, neden çipi, geçen süre (SLA rengi), "Gidiyorum" ve "Çözüldü" butonları. Bunlar mevcut `resolve` uç noktasını kullanır; `acknowledgedAt` ve `acknowledgedBy` alanları eklenir.
  3. Misafir tarafında başarı ekranı `pulseId` tutar ve kısa aralıklarla `GET /api/innovation/table-pulse/[id]/status` (yalnızca `status` döner, PII yok) çağırır: "Görüldü · Ekip yolda" → "Çözüldü olarak işaretlendi. Memnun kaldınız mı?".
  4. Döngü kurulana kadar metin dürüstçe "İşletmeye iletildi" olarak değiştirilmeli.
- **Efor:** L

### 3. [ORTA · Mimari/Güvenilirlik] Route'ta hata yönetimi yok; DB hatası misafire "Bağlantı hatası" olarak görünüyor
- **Kanıt:** route.ts:23-71 (try/catch yok; `getInnovationPlatformConfig` → lib/innovation-config.ts:103-115 de try'sız); table-signal-client.tsx:42, 49-50.
- **Sorun:** Neon soğuk başlatması veya kesintisinde Next HTML 500 döner, `res.json()` fırlatır ve misafir kendi internetini suçlar. Diğer route'larda kullanılan `responseIfDatabaseUnavailable` deseni burada uygulanmamış. Sinyal sessizce kaybolur.
- **Öneri:** Route'u try/catch ile sarıp `responseIfDatabaseUnavailable` ile 503 ve yerelleştirilmiş kod (`error: 'DB_UNAVAILABLE'`) dönmek gerekiyor. İstemci 5xx/ağ hatasında sinyali `localStorage` kuyruğuna alıp "Bağlantı zayıf, otomatik yeniden denenecek" demeli ve `online` olayında tekrar göndermeli (idempotency için istemcide üretilen `clientNonce` kullanılır; `IdempotencyKey` modeli zaten var). Innovation config için Upstash Redis cache (perf notlarındaki desen) eklenebilir.
- **Efor:** M

### 4. [ORTA · Gizlilik/KVKK + metin tutarlılığı] "Kişisel veri toplanmaz" iddiası koda uymuyor
- **Kanıt:** tr.json `tableSignal.description` "Kişisel veri toplanmaz"; route.ts:56-58, 67 oturum açık CUSTOMER'ın `customerId`'sini sessizce yazıyor; `note` serbest metin (400 karakter), içine isim veya telefon yazılabilir; alt metin "isteğe bağlı hesap eşlemesi yapılabilir" diyor ama seçim kontrolü yok (table-signal-client.tsx:135-137).
- **Sorun:** Kullanıcıya verilen gizlilik beyanı yanlış. "İsteğe bağlı" denen eşleme aslında otomatik. KVKK aydınlatma yükümlülüğü açısından risk taşıyor.
- **Öneri:** Varsayılan olarak anonim gönderim yapılmalı. Oturum açıksa görünür bir anahtar konulmalı: "Hesabımla ilişkilendir (işletme size geri dönebilir)", varsayılan kapalı. Açıklama metni "Adınız istenmez; yazdığınız not işletmeyle paylaşılır" gibi doğru bir ifadeyle değiştirilmeli. Not alanının altına "Kişisel bilgi yazmayın" ipucu eklenmeli. Sunucu notta telefon ve e-posta desenlerini maskeleyebilir.
- **Efor:** S

### 5. [ORTA · UX] İşletme kimliği yok, başarı anı yok, tekrar gönderim engeli yok
- **Kanıt:** table-signal-client.tsx:70-139 (işletme adı veya logosu çekilmiyor); 47-48 (yalnızca toast); butonlar başarıdan hemen sonra tekrar aktif (52).
- **Sorun:** Misafir doğru işletmeye yazdığından emin olamıyor. Başarı geri bildirimi köşede 4 saniye görünen bir toast'tan ibaret; mobilde global chatbot FAB'ı ile aynı köşeyi paylaşıyor (doğrulanmadı: üst üste binme görsel olarak test edilmedi). Aynı masadan art arda gönderim ekip tarafında gürültü üretiyor.
- **Öneri:** Sayfa sunucu bileşeninde bayinin herkese açık profilini (ad, logo, şube; `QRCode.location` üzerinden) çekmeli ve başlıkta göstermeli. Gönderimden sonra form yerine tam kart bir "iletildi" durumu açılmalı: ikonun ölçekle belirdiği ölçülü bir geçiş, masa kodu, saat ve sonraki adımlar ("Detay yaz", "Deneyimi puanla"). 2 dakikalık yerel bekleme süresi konmalı, ikinci basışta "Az önce bildirdiniz; ekip haberdar" denmeli.
- **Efor:** M

### 6. [ORTA · UX/Veri kalitesi] CONCERN tek başına aksiyon alınamaz: neden sorulmuyor, not tek satır ve önce yazılması gerekiyor
- **Kanıt:** table-signal-client.tsx:92-101 (tek satırlık `Input`, butonlardan önce); 117-130 (CONCERN tek dokunuşla doğrudan gönderiliyor).
- **Sorun:** Akış sırası ters: misafir notu butona basmadan önce yazmalı, bunu da çoğu kişi yapmaz. Ekip "bir şey var" bilgisini alıyor ama ne olduğunu bilmiyor.
- **Öneri:** İki adımlı mikro akış kurulmalı. "Bir şey var" → alttan açılan sheet: 5-6 neden çipi (Servis yavaş · Sipariş yanlış · Yemek soğuk/kalite · Temizlik · Hesap · Diğer) + opsiyonel `Textarea` + "Gönder". Veri modeline `reason String?` alanı eklenmeli; bayi panosu nedene göre gruplanır ve haftalık özete (weekly-brief) beslenir. OK ise tek dokunuşla kalır.
- **Efor:** M

### 7. [ORTA · i18n] TR/EN karışıklığı: sunucu mesajları sabit TR, Zod mesajları İngilizce
- **Kanıt:** route.ts:26, 33, 43, 52 (TR metinler); route.ts:14 + client'ta masa alanında `maxLength` yok (table-signal-client.tsx:84-90) → zod 3.25.76 varsayılanı "String must contain at most 32 character(s)"; messages/*.json `tableSignal.invalidConnection` "dealerId eksik" (teknik terim son kullanıcıya gösteriliyor); page.tsx:14 sabit "Yükleniyor…".
- **Sorun:** EN arayüzde misafir Türkçe hata görüyor, TR arayüzde ise İngilizce validation metni.
- **Öneri:** API hata kodu döndürmeli (`{ code: 'DEALER_NOT_FOUND' | 'FEATURE_DISABLED' | 'QR_MISMATCH' | 'RATE_LIMITED' | 'INVALID' }`), istemci bunları `tableSignal.errors.*` anahtarlarıyla çevirmeli. Masa alanına `maxLength={32}` eklenmeli. Sayfaya hafif bir TR/EN anahtarı konmalı (turist misafir).
- **Efor:** S

### 8. [DÜŞÜK · Mimari] Feature flag ve QR yaşam döngüsü sayfaya yansımıyor
- **Kanıt:** route.ts:24-27 (yalnızca POST'ta kontrol); route.ts:46-54 (`isActive`, `revokedAt`, `expiresAt` kontrol edilmiyor).
- **Sorun:** Özellik kapalıyken veya QR iptal edildiğinde misafir formu doldurup sonradan hata alıyor ya da iptal edilmiş QR'la sinyal kabul ediliyor.
- **Öneri:** `page.tsx` sunucu bileşeninde bayrak, bayi ve QR durumunu önceden çözüp kapalıysa sade bir "Bu işletmede masa sinyali kapalı" kartı göstermek, tam yorum akışına da yönlendirmek gerekiyor. Route'ta QR sorgusuna `isActive: true, revokedAt: null, OR expiresAt null/gelecek` koşulu eklenmeli.
- **Efor:** S

### 9. [DÜŞÜK · Erişilebilirlik] Kontrast ve okunabilirlik
- **Kanıt:** table-signal-client.tsx:106 (`bg-emerald-600` + beyaz 16px metin ≈ 3.8:1, AA 4.5:1 altında); 135 (`text-[10px]` alt metin); sonuç için sayfa içi `role="status"` yok.
- **Öneri:** `emerald-700` ya da token tabanlı `--success` kullanılmalı (≥4.5:1). Alt metin en az 12px olmalı. Başarı durumu kartı `role="status"` + `aria-live="polite"` taşımalı ve odak başlığa taşınmalı.
- **Efor:** S

### 10. [DÜŞÜK · SEO/Performans] İndekslenebilir kiosk sayfası ve gereksiz global yük
- **Kanıt:** page.tsx:4-7 (`robots` yok); app/layout.tsx:66-67 (canonical `/` mirası); app/layout.tsx:167 `ChatbotLazy` tüm yollarda.
- **Öneri:** `metadata.robots = { index: false }`. Chatbot'a yol bazlı hariç tutma listesi (`/table-signal`, kiosk modları) eklenmeli.
- **Efor:** S

### 11. [DÜŞÜK · Ölçüm] Telemetri yok
- **Kanıt:** client'ta PostHog çağrısı yok.
- **Öneri:** `table_signal_viewed`, `table_signal_sent {mood, reason, hasNote, hasTable}`, `table_signal_bridge_clicked` olayları. Bayi panosundaki "sinyal → çözülme süresi" metriği de bu verilerle beslenir.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Canlı durum takibi (Uber Eats / Domino's Tracker benzeri):** "İletildi → Görüldü → Ekip yolda → Çözüldü" adım çubuğu. Misafirin "biri gördü mü?" kaygısını giderir; sayfanın tek gerçek değer önerisi budur.
2. **Hızlı neden çipleri + iki adımlı CONCERN akışı (Duolingo/Revolut tarzı tek elle akış):** Aksiyon alınabilir veri.
3. **İşletme kimliği ve güven sinyali (Starbucks/Monzo):** Logo, ad, şube, "Bu işletme sinyallere ortalama X dk'da yanıt veriyor" rozeti.
4. **Tam deneyim akışına köprü:** OK sonrası "Deneyimini 30 saniyede puanla, +XP kazan"; CONCERN çözüldükten sonra "Sorun çözüldü mü? Kısa bir değerlendirme" (remedy timeline'a bağlanır). Puan yalnızca bu doğrulanmış akışta kazanılır, sinyalin kendisi ödüllendirilmez.
5. **Çevrimdışı kuyruk ve otomatik yeniden deneme (PWA):** Restoran bodrumu veya zayıf Wi-Fi senaryosu.
6. **Kiosk modu:** `?kiosk=1` ile chatbot/üst çubuk gizli, tam ekran, gönderimden 5 sn sonra kendini sıfırlayan sürüm (bayi tableti için).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Garsonu el kaldırarak çağırmak kadar kolay, şikâyet formu kadar aksiyon alınabilir, sipariş takibi kadar güven verici." Misafir 2 saniyede bildiriyor ve 2 dakika içinde birinin gördüğünü biliyor.

**Yerleşim (mobil öncelikli, tek ekran):**
1. **Üst bölüm:** İşletme logosu + adı + şube, sağda küçük TR/EN anahtarı. Masa kodu QR'dan geliyorsa "Masa M7" çipi (düzenlenebilir), yoksa ince bir "Masanız?" alanı.
2. **Ana soru:** "Her şey yolunda mı?" ve altında iki büyük, eşit ağırlıkta, başparmak bölgesinde (alt yarı) duran kart buton. Yeşil "Harika" kartı, kehribar "Bir şey var" kartı.
3. **"Bir şey var" → bottom sheet:** Neden çipleri (çoklu seçim), opsiyonel textarea ("Kişisel bilgi yazmayın"), oturum açıksa "Hesabımla ilişkilendir" anahtarı (kapalı), "Ekibe gönder".
4. **Başarı durumu (form yerine geçer):** Kalıcı kart. Adım çubuğu (İletildi ● → Görüldü ○ → Çözüldü ○), masa ve saat, altında köprü CTA'lar ("Detay ekle", "Deneyimi puanla"). Çözüldüğünde 1 tıklık "Memnun kaldım / Hâlâ sorun var".

**Motion (ölçülü):** framer-motion (`m as Motion`, global LazyMotion) ile yalnızca üç an: sheet'in yay tabanlı açılışı; gönderim sonrası ikonun 0.9→1 ölçek + opacity ile belirmesi ve kartın yerine kayan durum kartı; adım çubuğunda yeni adımın dolması. `prefers-reduced-motion` altında hepsi anlık opacity değişimine iner. 3B veya konfeti **önerilmez**: bu bir sorun bildirim anı, kutlama değil. OK için en fazla küçük bir onay mikro-etkileşimi yeterli.

**Veri ve API değişiklikleri:**
- **Prisma `TablePulse`:** `reason String?`, `acknowledgedAt DateTime?`, `acknowledgedById String?`, `ipHash String?`, `clientNonce String? @unique`, `locationId String?`. Ayrıca `@@index([dealerId, resolvedAt])`.
- **Giriş:** `/table-signal?dealerId=` yerine `/c/[token]?mode=signal&table=M7` (ya da `/s/[token]`). Sunucu bileşeni token → QRCode → bayi/şube/bayrak/QR durumu çözer. Eski URL geriye dönük uyumluluk için bayinin varsayılan QR'ına yönlendirilir.
- **`POST /api/innovation/table-pulse`:** Token tabanlı, `checkPublicActionRateLimit` (IP+bayi, IP+masa), try/catch + `responseIfDatabaseUnavailable`, hata kodları, `clientNonce` idempotency, `after()` ile bayi/staff push + `Notification`. Yalnızca `{ id, status }` döner.
- **`GET /api/innovation/table-pulse/[id]/status`:** Herkese açık ama yalnızca `pulseId` + imzalı kısa ömürlü bir `viewerKey` ile; yalnızca durum döner.
- **Bayi/Staff:** `/staff` ve `/dealer` için "Açık masa sinyalleri" kuyruğu (not + neden + SLA), "Gidiyorum" (`acknowledge`) ve mevcut `resolve` uç noktasının bağlanması. Ham `OK/CONCERN` enum'u da yerelleştirilmeli.
- **Sağlık skoru:** Tekilleştirilmiş sinyaller üzerinden hesaplanmalı; `acknowledgedAt - createdAt` medyanı yeni bir "yanıt hızı" bileşeni olarak eklenmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/c/[token]` (QR karşılama + tam geri bildirim akışı):** Aynı fiziksel QR anı için ikinci, kopuk bir giriş noktası. `/table-signal` bayi QR sisteminin dışında ham `dealerId` ile çalışıyor (app/dealer/innovation/page.tsx:159); QR yönetim ekranından üretilemiyor, bayi URL'yi elle kopyalayıp ayrı bir QR bastırmak zorunda. **Öneri:** Masa sinyali `/c/[token]` karşılamasının en üstünde bir "Hızlı durum" şeridi olarak birleştirilmeli (iki buton + sheet). Tam yorum akışı altta devam eder. `/table-signal` yalnızca kiosk modu ve geriye dönük uyumluluk için ince bir sarmalayıcı/yönlendirme olarak kalmalı.
- **`/dealer/innovation` "Son masa sinyalleri" kartı:** Bayi tarafında sinyalin tek görünümü bu. Notu göstermiyor, kapanış aksiyonu yok, canlı da değil. Asıl yeri bir operasyon kuyruğu (staff paneli + bayi canlı pano). İnovasyon sayfasında yalnızca ayar (URL/QR üretimi, gizlilik tercihi) kalmalı.
- **`/api/dealer/innovation/table-performance`:** Arayüzde çağıranı yok (grep). Masa sinyali panosuna "masa bazlı trend" sekmesi olarak bağlanmalı ya da kaldırılmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia, çağıran ve çağrılan taraflar baştan okunarak çürütülmeye çalışıldı (route, istemci, `proxy.ts`, `lib/rate-limit.ts`, `lib/dealer-health-v2.ts`, bayi/admin inovasyon sayfaları, Prisma `TablePulse` modeli). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Kimliksiz ve rate limit'siz public POST ile sağlık skoru / masa içgörüsü manipülasyonu — **DOĞRULANDI** (önem: YÜKSEK; personel içgörüsü kısmı daha düşük etkili)

- `app/api/innovation/table-pulse/route.ts:23-71`: Tek koruma `cfg.features.tablePulse` bayrağı (varsayılan `true`, `lib/innovation-config.ts:61`) ve `dealerId`'nin bir `DEALER` olması. Oturum zorunlu değil, rate limit yok, idempotency/tekilleştirme yok.
- `proxy.ts:105-118`: `/api/*` için yalnızca güvenlik + CORS başlıkları ekleniyor; proxy katmanında da sınırlama yok. `checkPublicActionRateLimit` (`lib/rate-limit.ts:96-102`) yalnızca `app/api/surveys/[id]/fill/route.ts:73`'te kullanılıyor.
- `dealerId` gizli değil: masaya basılan bağlantının kendisinde açık metin (`app/dealer/innovation/page.tsx:157-159`), QR'ı bir kez tarayan herkes elde eder.
- Etki (sağlık skoru): `lib/dealer-health-v2.ts:35-52,67` son 14 günün tüm sinyallerinden `concerns / total` oranı hesaplıyor, `score -= min(25, ratio*80)`. Bu skor admin panelinde sıralanıyor ve `< 55` erken uyarı listesine giriyor (`app/api/admin/innovation/health-score-v2/route.ts:36-38`, `app/admin/innovation/page.tsx:60,273-276`).
  - **Yeniden üretim:** Rakip, QR'dan `dealerId`'yi alır; `for i in 1..300: POST /api/innovation/table-pulse {"dealerId":"<id>","mood":"CONCERN"}` → oran ≈ 1, skor −25; kuyruktaki telafi cezalarıyla birlikte bayi erken uyarı listesine düşer. Tersi: bayi kendi `dealerId`'siyle binlerce `OK` gönderir ve gerçek CONCERN'leri seyrelterek cezayı ~0'a indirir.
- Etki (masa/personel): `table-performance` (`app/api/dealer/innovation/table-performance/route.ts:41-63`) serbest metin `tableCode` üzerinden gruplanıyor; belirli bir masaya CONCERN yağdırılabilir. **Ancak** bu uç noktanın arayüzde çağıranı yok (yalnızca `app/dealer/innovation/page.tsx:321`'de metin olarak geçiyor), bu yüzden bugünkü pratik etki "son masa sinyalleri" listesinin (take=30, `page.tsx:47`) spam ile doldurulup gerçek sinyallerin görünmez olmasıyla sınırlı. Bu da gerçek ve ayrıca kayda değer.
- Ek: Tablo için temizlik/retention yok; sınırsız satır büyümesi (Neon depolama) mümkün.
- **Öneri:** `dealerId` yerine imzalı QR token'ı (`/c/[token]` modeli) + `checkPublicActionRateLimit` (IP+bayi, IP+masa kovaları) + `clientNonce @unique` idempotency; sağlık skorunda ham sayım yerine (IP-hash/oturum, masa, 10 dk pencere) tekilleştirilmiş sinyaller ve minimum örneklem eşiği; `db-cleanup` cron'una 90 günlük retention.

### 2. CONCERN ekibe ulaşmıyor, not kayboluyor, kapanış döngüsü arayüzsüz — **DOĞRULANDI** (önem: YÜKSEK, ürün/işlev hatası)

- `route.ts:60-71` yalnızca `prisma.tablePulse.create` yapıyor; push, `Notification`, e-posta, staff kuyruğu veya `after()` tetikleyicisi yok. Bayi sinyali yalnızca `/dealer/innovation` sayfasını manuel yenilerse görür (`page.tsx:42-73`, polling/realtime yok).
- Not: API `note` alanını seçiyor (`app/api/dealer/innovation/table-pulses/route.ts:42`) ama bayi sayfası yalnızca `tableCode`, `mood`, `createdAt` render ediyor (`app/dealer/innovation/page.tsx:337-347`). Misafirin yazdığı not hiçbir arayüzde görünmüyor. Ham `OK/CONCERN` enum'u da yerelleştirilmeden basılıyor.
- Kapanış: `PATCH /api/dealer/innovation/table-pulses/[id]/resolve` var ama `app`/`components` altında onu çağıran hiçbir kod yok (grep). `resolvedAt`'i set eden başka yol da yok (demo route'ları dahil). Dolayısıyla `lib/dealer-health-v2.ts:68-70`'teki +15'e kadar kapanış bonusu üretimde fiilen hep 0; `tableResolvedRatio` CONCERN varsa hep 0.
- **Yeniden üretim:** Misafir "Bir şey var" + "soğuk yemek" notu gönderir → istemci "Sinyal iletildi — ekip ilgilenecek." der (`messages/tr.json:1385`, `table-signal-client.tsx:47`) → bayiye hiçbir bildirim gitmez; bayi inovasyon sayfasını açsa bile notu göremez ve kapatma butonu bulamaz.
- **Öneri:** CONCERN oluşturulunca `after()` ile bayi + vardiyadaki staff'a push/`Notification`; bayi/staff panelinde canlı "Açık masa sinyalleri" kuyruğu (not, masa, geçen süre, "Gidiyorum"=acknowledge, "Çözüldü"=mevcut resolve uç noktası); misafire sahte vaat yerine gerçek durum (İletildi → Görüldü → Çözüldü).

### 3. Gizlilik beyanı koda aykırı (KVKK) — **DOĞRULANDI** (önem: ORTA; "kritik" abartılı)

- Beyan: `messages/tr.json:1373` "Kişisel veri toplanmaz"; footer `messages/tr.json:1380` "isteğe bağlı hesap eşlemesi yapılabilir; zorunlu değildir".
- Kod: `route.ts:56-58,67` oturum açık `CUSTOMER` için `customerId`'yi her zaman, sessizce yazıyor; istemcide (`table-signal-client.tsx:33-40`) bunu kapatacak bir seçenek yok. Serbest metin `note` (400 karakter) kişisel veri içerebilir ve kişisel veri yazmama uyarısı yok. Dolayısıyla "toplanmaz" cümlesi oturum açık kullanıcı için yanlış, "isteğe bağlı" ifadesi de gerçek bir seçim olmadığı için yanıltıcı.
- Etkiyi sınırlayan gerçekler (çürütme denemesinden): `customerId` hiçbir okuma yolunda bayiye dönmüyor (`table-pulses/route.ts:38-45` select'inde yok; `table-performance` da seçmiyor); hesap silinince `onDelete: SetNull` (`prisma/schema.prisma:2686`). Yani bugün bayiye kimlik sızıntısı yok; sorun aydınlatma metninin kodla çelişmesi ve rıza/vazgeçme kontrolünün olmaması. Hukuki risk değerlendirmesi kod okumasının dışında.
- **Öneri:** Varsayılan anonim gönderim; oturum açıksa açıkça işaretlenen "Hesabımla ilişkilendir" anahtarı (varsayılan kapalı) ve yalnızca işaretliyse `customerId` yazılması; not alanına "Kişisel bilgi yazmayın" ipucu; beyan metninin gerçek davranışa göre yeniden yazılması ve gizlilik politikasına bağlantı.

---

## Uygulama (Dalga 2)

> Yüzey sahibi: `p-kart-masa-offline`. Sayfa sunucu bileşeni (`app/table-signal/page.tsx`): işletme, QR yaşam döngüsü, özellik bayrağı ve vaka kuyruğunun açıklığı ilk render'da çözülür. Etkileşim tek istemci adası: `components/customer/p-kart-masa-offline/table/table-signal-experience.tsx` (+ `signal-client.ts` gönderim/kuyruk, `copy.ts` TR/EN, `venue-badge.tsx`). Sunucu: `lib/table-signal/{kinds,venue,service,status-key}.ts`, `POST /api/innovation/table-pulse` (defineRoute, public) ve yeni `GET /api/innovation/table-pulse/status`. Masa sinyali artık bayinin **Gelen Kutusu › Vakalar** kuyruğuna (`Incident`) düşer. Testler: `__tests__/api/table-signal-route.test.ts` (17 test).

**Sinyal türleri:** `OK` (yalnız `TablePulse`), `CONCERN` (neden çipleri + not → `TablePulse` + `Incident(type=table_signal)`), `REQUEST` (garson / hesap → yalnız `Incident(type=table_request)`; duygu kaydı olmadığı için sağlık skoru 2.0'daki CONCERN oranını bozmaz). Puan yok (bilinçli).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa metadata | ÇALIŞIYOR | `robots: noindex`, canonical kök mirası kaldırıldı. |
| 2 | Yükleniyor durumu | ÇALIŞIYOR | `loading.tsx` statik iskelet + `role=status`. |
| 3 | URL parametreleri | ÇALIŞIYOR | `qr`/`code` (önerilen), eski `dealerId`+`qrCodeId`, `table`, `kiosk=1`. |
| 4 | Bağlantı eksik kartı | ÇALIŞIYOR | Durum ekranı + "QR okut" / "Ana sayfa". |
| 5 | Geçersiz işletme | ÇALIŞIYOR | İlk render'da "İşletme bulunamadı"; askıya alınmış/anonim bayi de reddedilir. |
| 6 | Başlık bloğu | ÇALIŞIYOR | Gizlilik beyanı gerçek davranışla uyumlu. |
| 7 | İşletme kimliği | ÇALIŞIYOR | Logo/baş harf + ad + şube/QR etiketi. |
| 8 | Masa alanı | ÇALIŞIYOR | `maxLength=32`, QR'dan gelirse çip + "Değiştir"; sunucuda normalize. |
| 9 | Kısa not | ÇALIŞIYOR | `Textarea` + sayaç + "kişisel bilgi yazmayın"; sunucu telefon/e-postayı maskeler; bayi vakasında görünür. |
| 10 | "Her şey yolunda" | ÇALIŞIYOR | |
| 11 | "Bir şey var" | ÇALIŞIYOR | İki adımlı: alttan açılan sayfa, neden çipleri (çoklu), not, isteğe bağlı hesap. |
| 12 | Gönderim kilidi | ÇALIŞIYOR | |
| 13 | Başarı geri bildirimi | ÇALIŞIYOR | Kalıcı durum kartı (toast değil), odak başlığa. |
| 14 | API hata mesajları | ÇALIŞIYOR | Makine-okur kodlar (`QR_INACTIVE`, `RATE_LIMITED`, …) istemcide TR/EN çevrilir. |
| 15 | Ağ/sunucu hatası | ÇALIŞIYOR | Merkezi catch (503 retryable); ağ düşerse sinyal kuyruğa alınır. |
| 16 | İstemci `dealerId` boş kontrolü | KALDIRILDI | Ölü kod; giriş sunucuda çözülüyor. |
| 17 | Alt bilgi metni | ÇALIŞIYOR | Doğru beyan, en az 12 px. |
| 18 | `customerId` eşlemesi | ÇALIŞIYOR | Varsayılan ANONİM; yalnız açık "Hesabımla ilişkilendir" anahtarı + doğrulanmış müşteri oturumu. |
| 19 | Özellik bayrağı | ÇALIŞIYOR | Sayfa bilir ("Masa sinyali kapalı" + QR verilmişse geri bildirime köprü). |
| 20 | QR sahiplik + yaşam döngüsü | ÇALIŞIYOR | Pasif/süresi dolmuş/iptal/arşivli QR reddedilir (sayfa ve uç aynı çözücü). |
| 21 | Bayi doğrulaması | ÇALIŞIYOR | |
| 22 | Kötüye kullanım / rate limit | ÇALIŞIYOR | IP 8/10 dk + IP×işletme 4/10 dk + aynı masa+tür 3 dk tekilleştirme + `Idempotency-Key`. |
| 23 | Ekibe anlık bildirim | ÇALIŞIYOR | Vaka + bayi ve aktif personele `Notification` + web push (`after()`). |
| 24 | Misafir notunun bayiye ulaşması | ÇALIŞIYOR | Vaka açıklamasında (Gelen Kutusu › Vakalar). |
| 25 | Kapanış döngüsü | ÇALIŞIYOR | Vaka "çözüldü" olunca bağlı `TablePulse.resolvedAt` dolar (`PATCH /api/dealer/incidents/[id]` + durum ucu, idempotent) → sağlık skoru kapanış bonusu artık gerçek. |
| 26 | Misafire geri dönüş | ÇALIŞIYOR | İletildi → Ekip ilgileniyor → Çözüldü (imzalı, 6 sa geçerli anahtar; 15 sn'de bir, yalnız görünürken). |
| 27 | Neden çipleri | ÇALIŞIYOR | `Incident.metadata.reasons` + başlıkta okunur metin. |
| 28 | Tam geri bildirime köprü | ÇALIŞIYOR | OK sonrası ve çözülen sorundan sonra `/feedback/<kod>` + puan matrisindeki gerçek taban puan. |
| 29 | Tekrar gönderim engeli | ÇALIŞIYOR | Bkz. #22; yinelenen istek "Az önce bildirdiniz; ekip haberdar" ve mevcut takip. |
| 30 | Açık/koyu tema | ÇALIŞIYOR | Rol token'ları. |
| 31 | Mobil yerleşim | ÇALIŞIYOR | Başparmak bölgesinde büyük kartlar, ≥ 44 px. |
| 32 | Kontrast / tipografi | ÇALIŞIYOR | `success/warning-subtle` + `text-fg`; en küçük metin 12 px. |
| 33 | Ekran okuyucu sonucu | ÇALIŞIYOR | `announce`, `role=status/alert`, adım çubuğu `aria-current`. |
| 34 | Azaltılmış hareket | ÇALIŞIYOR | `useMotionPolicy`: yalnız opaklık; konfeti/3B yok. |
| 35 | Çevrimdışı dayanıklılık | ÇALIŞIYOR | `localStorage` kuyruğu (≤ 5, 30 dk), `online` olayında ve sayfa yeniden açılınca aynı anahtarla gönderim; "iletildi" denmez, "bu cihazda bekliyor" denir. |
| 36 | Telemetri | ÇALIŞIYOR | `table_signal_viewed/sent/bridge_clicked` (rızaya bağlı `track`). |
| 37 | Global sohbet balonu | ÇALIŞIYOR | Bu sayfada yüklenmez (`lib/pwa/bare-chrome`); kurulum bandı da gizli. |
| 38 | Dil seçimi | ÇALIŞIYOR | Sayfada TR/EN anahtarı (uygulama dil tercihine yazılır). |
| 39 | Oyunlaştırma | ÇALIŞIYOR (bilinçli yokluk) | Sinyal ödüllendirilmez; puan yalnız köprülenen geri bildirimde. |

Eksik özellikler: 1 canlı durum takibi ✓ · 2 neden çipleri + iki adım ✓ · 3 işletme kimliği ✓ ("ortalama yanıt süresi" rozeti yapılmadı — vaka yanıt süresi verisi birikince) · 4 geri bildirime köprü ✓ · 5 çevrimdışı kuyruk ✓ · 6 kiosk modu (`?kiosk=1`: 8 sn'de kendini sıfırlar, takip/hesap/köprü yok) ✓.

### Kapanan bulgular (11/11)
1 (rate limit, QR'a bağlı giriş, tekilleştirme) · 2 (kapalı döngü: vaka + bildirim + kapanış + misafir durumu) · 3 (hata yönetimi + kuyruk + idempotency) · 4 (varsayılan anonim + açık rıza + doğru beyan + not maskesi) · 5 (işletme kimliği, durum kartı, tekrar engeli) · 6 (iki adımlı CONCERN + neden çipleri) · 7 (kodlu hatalar, TR/EN, `maxLength`) · 8 (bayrak + QR yaşam döngüsü ilk render'da) · 9 (kontrast + 12 px + canlı bölge) · 10 (noindex + sohbet balonu yok) · 11 (telemetri).

### Kalanlar (sahiplik dışı)
- `/dealer/innovation` bağlantı üreteci hâlâ `?dealerId=` veriyor (eski giriş çalışıyor); `?qr=<QR kodu>&table=` üretmeli (bayi yüzeyi).
- Bayi Vakalar sayfasının tür etiketi haritasında `table_signal` / `table_request` yok (başlık okunur, tür ham görünür) → bayi Gelen Kutusu ajanı. `/staff` için canlı "açık masa sinyalleri" kuyruğu personel yüzeyinin işi (bildirim gidiyor).
- Sağlık skoru 2.0'da tekilleştirme/en az örneklem eşiği (`lib/dealer-health-v2.ts`) ve `TablePulse` 90 günlük saklama (db-cleanup cron) yapılmadı.
- **ŞEMA İSTEĞİ:** `TablePulse.reason String[]` (şimdi `Incident.metadata.reasons`), `acknowledgedAt`, `ipHash` (denetim), `@@index([dealerId, resolvedAt])`.
