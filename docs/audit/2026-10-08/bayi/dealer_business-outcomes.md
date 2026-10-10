# /dealer/business-outcomes

**Amaç:** İşletme sahibine "puan" yerine iş sonucunu göstermek. Sayfa üç KPI sunuyor: tekrar ziyaret, şikâyet düşüşü ve telafi teklifi kabul oranı. Rota açıklamasında (`app/api/dealer/business-outcomes/route.ts:2-3`) bu oranın "gelir etkisi (proxy)" olarak okunması isteniyor.

**Genel puan:** 4/10 · **Karar:** **birleştir** (`/dealer/roi` ile tek bir "Etki & Sonuçlar" ekranında yeniden tasarlanarak)

Kısa özet: Sayfa 98 satırlık tek bir istemci bileşeni. Bir GET ucundan dört sayı çekip üç karta basıyor. Yetki ve kapsam doğru. Sorun, gösterilen metriklerin tanımlarında: üçü de ya yanlış adlandırılmış ya yanlış paydayla hesaplanıyor ya da yanıltıcı bir dönemle karşılaştırılıyor. Dönem, trend, hedef ve drill-down yok. Metadata ve büyüme merkezindeki açıklama "hedef takibi" vaat ediyor ama böyle bir özellik yok. Boş durum ile hata durumu birbirine karışmış.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Üç KPI hesaplanıyor. Ancak "tekrar ziyaret" bir oran değil, "telafi kabul" paydası yanlış, "gelir etkisi" hiç hesaplanmıyor ve dönem seçimi yok. |
| UX | 3/10 | Bayi bu ekranda sayıyı görüyor ama ne yapacağını bilemiyor. Bağlam (trend, hedef, kıyas), açıklama ve aksiyon bağlantısı yok. Sıfır veride sayfa "başarılı" görünüyor. |
| Görsel | 4/10 | Standart shadcn kartları kullanılmış ama panelin ortak `DashboardPageHero` deseni yerine elle yazılmış bir başlık var. Hiyerarşi düz. Grafik ya da vurgu yok. |
| Mimari | 4/10 | Uç doğru şekilde dealer kapsamlı. Ancak metrik mantığı rota içine gömülü ve ROI ucuyla tekrar ediyor. UTC ay sınırı kullanılıyor, hata yutuluyor, modül kapısı yok. |
| Performans | 6/10 | 8 sorgu paralel çalışıyor. Ancak `groupBy(customerId)` tüm müşteri satırlarını belleğe taşıyor ve ROI ucundaki Redis önbelleği burada yok. |
| Erişilebilirlik + mobil | 6/10 | Yükleniyor durumu `role="status"` taşıyor ve grid mobilde yığılıyor. Başlık seviyesi h1'den h3'e atlıyor, ikonlarda açık `aria-hidden` yok ve sayılar yerel biçimde gösterilmiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rol kapısı (yalnız DEALER `/dealer/*` altına girer) | ÇALIŞIYOR | `proxy.ts:50-73` | Diğer roller kendi paneline yönlendiriliyor. STAFF bu sayfaya hiç ulaşamıyor. |
| 2 | API yetkisi ve bayi kapsamı | ÇALIŞIYOR | `app/api/dealer/business-outcomes/route.ts:13-15`, `:25-26`, `:37-59` | `requireAuth(['DEALER'])` var. Tüm sorgular `dealerId = session.user.id` ile kapsanmış, IDOR yüzeyi yok. |
| 3 | Sayfa metadata (başlık/açıklama) | KISMİ | `app/dealer/business-outcomes/layout.tsx:5`, `messages/tr.json:96` | Açıklamada "Kuzey yıldızı KPI kutucukları ve **hedefe yaklaşma**" yazıyor. Sayfada hedef kavramı yok. |
| 4 | Navigasyon girişleri (sidebar, büyüme merkezi, keşfet) | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:252`, `app/dealer/growth-hub/page.tsx:11`, `app/dealer/discover/page.tsx:59` | Büyüme merkezindeki kart açıklaması "KPI ve hedef takibi" diyor (`messages/tr.json:2932`); hedef takibi yine yok. |
| 5 | Modül kapısı (`business_outcomes`) | KISMİ | `lib/module-controls.ts:32`, `components/dashboard/sidebar.tsx:450-455`, `route.ts:12-15` | Modül kapatılınca yalnızca sidebar öğesi gizleniyor. Sayfa ve API doğrudan URL ile çalışmaya devam ediyor (`assertModuleEnabled` çağrılmıyor). |
| 6 | Veri çekme (mount'ta tek fetch) | KISMİ | `page.tsx:22-30` | `r.ok` kontrol edilmiyor. 401/403 JSON yanıtları sessizce "veri yok" olarak işleniyor. AbortController yok. |
| 7 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:32-36`, `components/ui/inline-loading-status.tsx:28-31` | `role="status"`, `aria-live` ve sr-only etiket var. Kartların yerini tutan iskelet (skeleton) yok, sadece spinner gösteriliyor. |
| 8 | Hata bildirimi (toast) | KISMİ | `page.tsx:7`, `:28`, `lib/admin-toast.ts:17-18` | Yalnızca ağ veya JSON parse hatasında tetikleniyor. `admin-toast` metnin başına sabit Türkçe "Dikkat: " ekliyor; EN arayüzde "Dikkat: Could not load business outcomes" çıkıyor. Bayi panelinde "admin" toast'ı kullanılıyor. |
| 9 | Boş durum ("Veri yok.") | BOZUK | `page.tsx:49-50`, `route.ts:69-76` | API başarılı yanıtta HER ZAMAN dolu bir obje döndürüyor, bu yüzden boş durum yalnızca hata durumunda görünüyor. Verisi olmayan yeni bayi `0.00`, yeşil `+0 puan` ve `%0` görüyor. Hata ve boş durum yer değiştirmiş durumda. |
| 10 | Başlık bloğu (h1 + açıklama) | ÇALIŞIYOR | `page.tsx:40-48` | Panelin ortak `DashboardPageHero` bileşeni yerine elle yazılmış blok kullanılıyor (`app/dealer/growth-hub/page.tsx:24-30` ile tutarsız). |
| 11 | KPI: Tekrar ziyaret (ortalama) | KISMİ | `route.ts:21-32`, `:62-63`, `:71`, `page.tsx:60` | Formül `tüketim/tekil müşteri − 1`. Bu bir oran değil, "müşteri başına ek ziyaret". Tüm zamanları kapsıyor, dönemi yok. Yalnızca fiziksel kart `Consumption` kayıtlarını sayıyor. Birimsiz ve `0.45` gibi noktalı ondalıkla gösteriliyor. |
| 12 | Tekrar ziyaret açıklama satırı | ÇALIŞIYOR | `page.tsx:61-63`, `messages/tr.json:1582` | Metin, bayiye anlam yerine ham formülü ("… sayısı - 1") veriyor. |
| 13 | KPI: Şikâyet düşüşü (önceki aya göre) | KISMİ | `route.ts:17-19`, `:34-57`, `:64-66` | İçinde bulunulan ayın ilk N günü, geçen ayın tamamıyla kıyaslanıyor. Asgari örneklem yok; ayın 1'inde tek bir negatif yorum oranı %100'e çıkarıyor. Ay sınırı sunucu saatine (UTC) göre hesaplanıyor. Yalnızca QR `Feedback` sayılıyor; `ConsumptionReview` olumsuzları hariç. |
| 14 | Şikâyet kartı renk kodlaması | KISMİ | `page.tsx:73-74` | `>= 0` yeşil kabul ediliyor: veri yokken (`0 - 0`) "+0 puan" yeşil görünüyor. "+" işareti "şikâyet arttı" diye okunmaya açık. "puan" kelimesi sadakat puanı ve yıldız puanıyla karışıyor (doğrusu "yüzde puan"). |
| 15 | "Bu ay negatif oranı" satırı | ÇALIŞIYOR | `page.tsx:77`, `route.ts:64`, `:74` | `t()` değişken desteklediği halde (`lib/app-locale.ts:59`) `.replace('{pct}')` ile elle yerleştiriliyor. Ondalık noktalı gösteriliyor. |
| 16 | KPI: Telafi kabul oranı | KISMİ | `route.ts:58-59`, `:67`, `prisma/schema.prisma:1334-1335` | Payda, bayi onayı bekleyen (`awaiting_dealer_approval`) ve hiç müşteriye gitmemiş teklifleri de içeriyor, bu yüzden oran sistematik olarak düşük çıkıyor. Tüm zamanları kapsıyor. `accepted` yalnızca "seçim yapıldı" demek, kullanıldığını göstermiyor (`app/api/customer/remedy/[offerId]/route.ts:159-166`). |
| 17 | "Gelir etkisi" iddiası (DollarSign ikonu, ipucu metni, rota açıklaması) | SAHTE | `page.tsx:84`, `messages/tr.json:1587`, `route.ts:3` | Gelir hiç hesaplanmıyor. `Consumption.amount` alanı mevcut (`prisma/schema.prisma:1580`) ama okunmuyor. Telafi kabulü aslında bir maliyet kalemi; gelir göstergesi olarak sunulması yanıltıcı. |
| 18 | Sayı biçimlendirme (yerel) | KISMİ | `page.tsx:60`, `:77`, `:88` | `toFixed`/`String` kullanılıyor; TR arayüzde `0,45` yerine `0.45` görünüyor. `Intl.NumberFormat` kullanılmıyor. |
| 19 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:52` | `md:grid-cols-3`, mobilde tek sütuna yığılıyor. Taşma riski yok. |
| 20 | Başlık hiyerarşisi ve ikon erişilebilirliği | KISMİ | `page.tsx:41-42`, `:55-57`, `components/ui/card.tsx:44` | `CardTitle` h3 olarak render ediliyor, h1'den h3'e atlanıyor. Dekoratif ikonlarda açık `aria-hidden` yok (lucide-react `^0.303.0`; varsayılan davranış doğrulanmadı). Renk anlamı yalnızca işaretle destekleniyor. |
| 21 | Tüketim sorgusu hata toleransı | KISMİ | `route.ts:23-32` | `try/catch` gerçek DB hatasını yutup 0 döndürüyor ("model şemada var" yorumu eskimiş). Hata görünmeden sahte "0.00" basılıyor. |
| 22 | Önbellek | EKSİK | `route.ts:12-76` ile `app/api/dealer/roi/route.ts:33-36` karşılaştırması | ROI ucu Redis'te 60 sn önbellekliyor, bu uç her açılışta 8 sorgu çalıştırıyor. |
| 23 | Dönem / tarih aralığı seçici | EKSİK | `route.ts:12` (parametresiz GET) | 7/30/90 gün veya özel aralık seçilemiyor. |
| 24 | Trend grafiği / sparkline | EKSİK | `page.tsx:52-94` | Yalnızca tek bir sayı var; zaman serisi yok. |
| 25 | Hedef (north-star) ve hedefe yaklaşma | EKSİK | `messages/tr.json:96`, `:2932` | Metadata ve hub metni hedef vaat ediyor; ne veri modeli ne UI var. |
| 26 | Drill-down / aksiyon bağlantıları | EKSİK | `page.tsx:53-93` | Kartlar tıklanabilir değil. Telafi kuyruğuna, negatif yorumlara veya tüketimlere bağlantı yok. |
| 27 | Yenile / tekrar dene | EKSİK | `page.tsx:22-30` | Hata sonrası kullanıcıya bir aksiyon sunulmuyor; sayfayı yeniden yüklemek gerekiyor. |
| 28 | Şube (lokasyon) filtresi | EKSİK | `prisma/schema.prisma:729`, `:747-764` | `QRCode.locationId` ve `DealerLocation` modeli mevcut ama sonuçlar şube bazında kırılmıyor. |
| 29 | Dışa aktarma / paylaşma / rapor e-postası | EKSİK | — | Medallia ve Qualtrics'te standart olan özellik burada yok. |
| 30 | Kıyas bağlamı (benchmark, önceki dönem değeri) | EKSİK | `route.ts:69-76` | Önceki dönemin mutlak değeri, sektör ortalaması ve güven aralığı döndürülmüyor. |
| 31 | Metrik tanımı / örneklem büyüklüğü göstergesi | EKSİK | `page.tsx:61-63`, `:89-91` | "n = kaç yorum/teklif" bilgisi ve "bu nasıl hesaplanır" açıklaması yok; küçük örneklem uyarısı da yok. |

**Durum sayıları:** ÇALIŞIYOR 8 · KISMİ 11 · BOZUK 1 · SAHTE 1 · EKSİK 10 (toplam 31)

---

## Bulgular

### 1. Telafi kabul oranının paydası yanlış ve metrik "gelir" olarak sunuluyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu
- **Kanıt:** `app/api/dealer/business-outcomes/route.ts:58-59`, `:67` · `prisma/schema.prisma:1334-1335` · `app/dealer/business-outcomes/page.tsx:84` · `messages/tr.json:1586-1587` · `app/api/customer/remedy/[offerId]/route.ts:159-166`
- **Sorun:** Payda, bayinin `remedyOffer` kayıtlarının tamamı. Buna durumu `awaiting_dealer_approval` olanlar (bayi henüz onaylamadığı için müşteriye hiç gitmemiş teklifler) ve hâlâ `pending` olanlar da giriyor. Yani bayi onay kuyruğunu ne kadar geç işlerse oran o kadar düşük görünüyor. Bu bir ölçüm hatası, müşteri davranışını yansıtmıyor. Ayrıca `accepted` yalnızca müşterinin seçim yaptığını kaydediyor; teklifin kullanılıp kullanılmadığı bilinmiyor. Kart DollarSign ikonu ve "gelir etkisi proxy" metniyle sunuluyor, ama telafi bir **maliyet** kalemi ve gelirle doğrudan ilişkisi yok.
- **Öneri:** Metriği "Telafi ile geri kazanım" olarak yeniden tanımlayın:
  - Payda: müşteriye ulaşmış teklifler (`status IN ('pending','accepted','expired','rejected')` ve `awaiting_dealer_approval` hariç), seçilen dönemde `createdAt` olanlar.
  - Pay: `accepted`. Şemaya `redeemedAt` eklendiğinde (müşteri telafi raporunda da öneriliyor) asıl başarı ölçüsü "kullanıldı" olmalı.
  - Gerçek etki ölçüsü olarak ikinci bir alt satır ekleyin: kabul eden müşterilerin kabul sonrasındaki 30 gün içinde `Consumption` kaydı olanların oranı, yani "geri dönüş". `Consumption.customerId` ile `RemedyOffer.userId` birleştirilerek hesaplanabilir.
  - Gelir iddiasını kaldırın veya `Consumption.amount` toplamından gerçek bir "geri kazanılan ciro" hesaplayın.
- **Efor:** M

### 2. "Tekrar ziyaret" metriği yanlış adlandırılmış, dönemsiz ve yorumlanamaz
- **Önem:** yüksek · **Kategori:** veri doğruluğu / UX
- **Kanıt:** `route.ts:24-29`, `:62-63`, `:71` · `page.tsx:56-63` · `messages/tr.json:1581-1582`
- **Sorun:** `consumptionCount / uniqueCount - 1` müşteri başına ortalama EK ziyareti verir; "tekrar ziyaret oranı" değildir. Sorgular `createdAt` filtresi içermediği için değer tüm zamanları kapsıyor ve bayinin yaptığı hiçbir aksiyon bu sayıyı görünür biçimde oynatamıyor. Değer birimsiz `0.45` olarak gösteriliyor, açıklama satırı da ham formülü veriyor. Ayrıca yalnızca fiziksel kart `Consumption` kayıtları sayılıyor; QR ile geri bildirim bırakan (kartsız) müşteriler hesaba katılmıyor.
- **Öneri:** Endüstri standardı iki metriğe geçin:
  1. **Geri dönen müşteri oranı:** dönem içinde en az bir ziyaret yapan müşterilerden 2 veya daha fazla ziyareti olanların yüzdesi. Tek SQL ile hesaplanabilir: `COUNT(*) FILTER (WHERE visits >= 2) / COUNT(*)`.
  2. **90 günlük elde tutma:** önceki dönemde gelen müşterilerin bu dönemde tekrar gelme oranı.

  Hesaplamada `@@index([dealerId, createdAt])` kullanılabilir (`prisma/schema.prisma:1597`). Değeri yüzde olarak `Intl.NumberFormat(locale, {style:'percent'})` ile gösterin; açıklamada formül yerine "Bu ay gelen 120 müşterinin 38'i daha önce de gelmişti" gibi bir cümle kurun.
- **Efor:** M

### 3. Şikâyet düşüşü yanıltıcı bir dönemle kıyaslanıyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu
- **Kanıt:** `route.ts:17-19`, `:36-57`, `:64-66` · `page.tsx:73-74`
- **Sorun:**
  - (a) Ayın ilk günlerinde birkaç yorum tüm geçen ayla kıyaslanıyor. Ayın 1'inde 1 yorumun 1'i negatifse oran %100 olur ve kart kırmızıyla "−80 puan" gösterir. Asgari örneklem veya güven eşiği yok.
  - (b) `new Date(y, m, 1)` sunucu yerel saatini kullanıyor. Vercel'de bu UTC demek; ay sınırı Türkiye saatiyle 03:00'te kayıyor. ROI ucu bunun için `lib/timezone` yardımcılarını kullanıyor (`app/api/dealer/roi/route.ts:11`).
  - (c) Değer `0` iken (veri yokken de) yeşil "+0 puan" gösteriliyor.
  - (d) "+3 puan" ifadesi "şikâyet 3 arttı" diye okunabiliyor. "puan" kelimesi panelde sadakat puanı ve yıldız puanı için de kullanılıyor.
- **Öneri:**
  - Kıyası "son 30 gün vs önceki 30 gün" kayan penceresine (ya da seçilebilir döneme) taşıyın.
  - Her iki pencerede asgari örneklem (ör. n ≥ 10) şartı koyun; altında kalırsa "Yeterli veri yok (n=4)" rozeti gösterin.
  - Metriği yön belirsizliği olmayan biçimde sunun: "Negatif yorum oranı %12 (önceki dönem %18) ↓ 6 yüzde puan". Ok yönü ve renk "iyi/kötü" anlamını birlikte taşısın; 0 değeri nötr griyle gösterilsin.
  - Tarih sınırlarını tek bir `lib/timezone` yardımcısıyla `Europe/Istanbul`'a sabitleyin.
  - Negatif tanımını `ConsumptionReview` olumsuzlarını da kapsayacak şekilde genişletin; telafi metriği iki kaynağı da sayıyor (`schema.prisma:1329-1330`), bu metrik yalnızca birini sayıyor.
- **Efor:** M

### 4. Boş durum ile hata durumu yer değiştirmiş
- **Önem:** orta · **Kategori:** hata yönetimi / UX
- **Kanıt:** `page.tsx:23-29`, `:49-50` · `route.ts:69-76` · `route.ts:30-32`
- **Sorun:** Başarılı API yanıtı her zaman dolu obje döndürüyor. Bu yüzden "Veri yok." kartı yalnızca 401/403 gibi hata yanıtlarında görünüyor (`r.ok` kontrol edilmediği için `j.businessOutcomes` undefined kalıyor ve toast da çıkmıyor). Tersi durumda, hiç verisi olmayan yeni bir bayi "0.00 / yeşil +0 puan / %0" gibi gerçek ölçüm sanılabilecek değerler görüyor. Buna ek olarak tüketim sorgusundaki `try/catch` gerçek DB hatasını yutup 0 döndürüyor.
- **Öneri:**
  - API'yi `{ data, sampleSizes: { customers, feedbacksThis, feedbacksPrev, offersSent } }` biçiminde döndürün; her KPI için örneklem 0 ise `null` verin.
  - İstemcide üç ayrı durum kurun:
    - **Hata:** açıklama ve "Tekrar dene" butonu.
    - **Boş:** "İlk QR yorumlarınız geldiğinde burada göreceksiniz" metni ve `/dealer/qr-codes` bağlantısı.
    - **Kısmi veri:** kart bazında "yetersiz veri".
  - `r.ok` kontrolü ekleyin ve 403 `moduleKey` yanıtını ayrı bir "Modül kapalı" durumu olarak gösterin.
  - Yutulan `catch` bloğunu kaldırın ya da loglayıp kartı `null` olarak işaretleyin.
- **Efor:** S

### 5. Vaat edilen "gelir etkisi" ve "hedef takibi" yok
- **Önem:** orta · **Kategori:** sahte özellik / ürün tutarlılığı
- **Kanıt:** `route.ts:2-3` ("gelir etkisi (proxy)") · `messages/tr.json:96` ("hedefe yaklaşma") · `messages/tr.json:2932` ("KPI ve hedef takibi") · `prisma/schema.prisma:1580` (`Consumption.amount` kullanılmıyor)
- **Sorun:** Sayfa üç farklı yerde var olmayan iki yetenek vaat ediyor. Bayi hub'dan "hedef takibi" beklentisiyle geliyor ve üç düz sayıyla karşılaşıyor.
- **Öneri:** Ya metinleri gerçeğe çekin ya da özelliği kurun. Kurulacaksa:
  - Basit bir `DealerGoal` modeli: `dealerId`, `metricKey`, `targetValue`, `period`, `createdAt`.
  - Her KPI kartında hedef halkası ve "hedefe %72" göstergesi.
  - Hedef düzenleme için küçük bir sheet.
  - Gelir için, `amount` doldurulan tüketimlerden "dönem cirosu" ve "geri dönen müşterilerden gelen ciro payı". `amount` opsiyonel olduğundan kartta "tutar girilen tüketimlerin %X'i üzerinden" kapsama notu da gösterilmeli.
- **Efor:** L

### 6. ROI sayfasıyla kavramsal çakışma ve kopya mantık
- **Önem:** orta · **Kategori:** mimari / bilgi mimarisi
- **Kanıt:** `app/api/dealer/roi/route.ts:1-3` ("aksiyonların gelir, memnuniyet, tekrar ziyaret etkisi") · `app/api/dealer/roi/route.ts:39-46` (aynı bu ay/önceki ay pencereleri) · `components/dashboard/sidebar.tsx:250-252` (ikisi de "analytics" grubunda) · `app/dealer/growth-hub/page.tsx:11-13`
- **Sorun:** İki sayfa aynı soruyu, "aksiyonlarım işe yarıyor mu?" sorusunu yanıtlıyor. İkisi de "bu ay vs geçen ay" penceresini kendi içinde hesaplıyor; biri UTC yardımcısıyla, diğeri yerel `new Date`. Bayi aynı grupta iki "etki" ekranı görüyor ve hangisine bakacağını bilemiyor.
- **Öneri:** Ortak bir `lib/dealer-outcomes.ts` servisi çıkarın. Bu servis dönem çözümleme (TZ, kayan pencere), negatif tanımı, örneklem eşiği ve tekrar ziyaret, telafi ve yanıt oranı hesaplarını içersin. ROI ve iş sonuçlarını tek bir `/dealer/impact` ("Etki & Sonuçlar") sayfasında birleştirin: üstte sonuç KPI'ları (bu sayfanın amacı), altta "bu sonuçlara katkı veren aksiyonlar" (ROI'nin yanıt ve aksiyon oranları). Eski rotalar yönlendirme ile korunsun.
- **Efor:** L

### 7. Modül kapısı yalnızca menüde uygulanıyor
- **Önem:** düşük · **Kategori:** yetki / tutarlılık
- **Kanıt:** `lib/module-controls.ts:32` · `components/dashboard/sidebar.tsx:450-455` · `app/api/dealer/business-outcomes/route.ts:12-15` (`assertModuleEnabled` yok; karşılaştırma için `app/api/dealer/campaigns/route.ts:28`)
- **Sorun:** Admin `business_outcomes` modülünü kapattığında yalnızca menü öğesi gizleniyor. Büyüme merkezi ve keşfet kartları (`growth-hub/page.tsx:11`, `discover/page.tsx:59`) bağlantıyı göstermeye devam ediyor; sayfa ve API de çalışıyor. Güvenlik açığı değil, çünkü veri bayinin kendisine ait. Ancak admin kontrolünün beklenen etkisi oluşmuyor.
- **Öneri:** Uca `assertModuleEnabled('business_outcomes', { role: 'dealer', userId, routeKey })` ekleyin. Hub ve keşfet listelerini sidebar ile aynı görünürlük filtresinden geçirin (ortak `useVisibleDealerLinks` hook'u).
- **Efor:** S

### 8. Tekil müşteri sayımı tüm satırları belleğe taşıyor; önbellek yok
- **Önem:** düşük · **Kategori:** performans
- **Kanıt:** `route.ts:26`, `:29` · karşılaştırma: `app/api/dealer/roi/route.ts:33-36`, `:211`
- **Sorun:** `prisma.consumption.groupBy({ by: ['customerId'] })` yalnızca `.length` için kullanılıyor. 50 bin müşterili bir zincirde 50 bin satır ağ üzerinden Node'a taşınıyor. Uç her açılışta 8 sorgu çalıştırıyor; ROI ucu aynı tür veriyi Redis'te 60 sn önbellekliyor.
- **Öneri:** Sayımı `SELECT COUNT(DISTINCT "customerId")` (raw) ile yapın veya madde 2'deki yeni tek-SQL tekrar ziyaret sorgusuna katın. Sonucu `dealer-outcomes:{dealerId}:{period}` anahtarıyla `redisGetJson/redisSetJson` üzerinden 60-300 sn önbellekleyin.
- **Efor:** S

### 9. Dil karışıklığı ve yerelleştirme kusurları
- **Önem:** düşük · **Kategori:** i18n
- **Kanıt:** `page.tsx:7`, `:28` · `lib/admin-toast.ts:17-18` ("Dikkat: ", "Basarili: " sabit TR ve Türkçe karakter eksik) · `page.tsx:60`, `:77`, `:88` (`toFixed`/`String`)
- **Sorun:** EN arayüzde hata toast'ı "Dikkat: Could not load…" olarak çıkıyor. Sayılar TR'de noktalı ondalıkla gösteriliyor. Yüzde işareti çeviri dizesine gömülü (`%{pct}` / `{pct}%`), sayı biçimlendirmesi ise yerelden bağımsız.
- **Öneri:** Bayi panelinde `sonner` toast'ını doğrudan veya prefiksi i18n'den gelen bir `appToast` ile kullanın. Tüm sayı ve yüzdeleri `Intl.NumberFormat(locale)` üzerinden geçiren küçük bir `formatPercent/formatDecimal` yardımcısı yazın. `t(key, { pct })` değişken desteğini kullanın.
- **Efor:** S

### 10. Görsel tutarsızlık ve erişilebilirlik ayrıntıları
- **Önem:** düşük · **Kategori:** tasarım / a11y
- **Kanıt:** `page.tsx:40-48` (elle yazılmış hero; `app/dealer/growth-hub/page.tsx:24-30` `DashboardPageHero` kullanıyor; `docs/audit/2026-10-08/sistem/tasarim-sistemi.md:233` bu sayfayı "hero'suz" listesinde sayıyor) · `components/ui/card.tsx:44` (h3) · `page.tsx:4` (`TrendingDown` import edilmiş ama kullanılmıyor, ölü kod)
- **Sorun:** Panelin geri kalanından farklı bir başlık deseni var. h1'den h3'e atlanıyor. Dekoratif ikonlarda açık `aria-hidden` yok (lucide 0.303 varsayılanı doğrulanmadı). Kullanılmayan bir import var. KPI kartları etkileşimsiz olduğu halde görsel olarak buton gibi yorumlanabilecek bir hover ipucu yok, ki bu da tutarlı. Asıl sorun, kartların görsel ağırlığının metriklerin önemini yansıtmaması.
- **Öneri:** `DashboardPageHero` kullanın (eyebrow "Büyüme", ikon Target). KPI başlıklarını `<h2>` bölüm başlığı altında `<h3>` yapın. Tüm dekoratif ikonlara `aria-hidden` ekleyin. Yön bilgisini renk yanında ok ikonu ve sr-only "azaldı/arttı" metniyle verin. Ölü importu kaldırın.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Dönem seçici ve kayan pencere kıyası** (Square Dashboard, Toast, Google Business Profile): 7/30/90 gün ve özel aralık; "önceki dönem" ve "geçen yıl aynı dönem" kıyası.
2. **KPI başına trend sparkline + hedef çizgisi** (Medallia, Qualtrics CX "Program KPI" kartları): tek sayı yerine son 12 hafta; tanımlanmış hedef ve eşik bantları.
3. **Driver / kök neden kırılımı** (Qualtrics "Key Drivers", Medallia "Text Analytics"): şikâyet düşüşü kartında "en çok azalan / artan konu" (`Feedback.topics`/`themes` alanları zaten var, `schema.prisma:779`, `:792`).
4. **Kapalı döngü (closed-loop) metrikleri** (Medallia): ilk yanıt süresi, telafi sonrası geri dönüş, kurtarılan müşteri sayısı ve "kurtarılan ciro".
5. **Şube kırılımı ve şube sıralaması** (Yelp for Business, Toast çoklu lokasyon): `DealerLocation` tabanlı filtre ve şubeler arası karşılaştırma tablosu.
6. **Zamanlanmış rapor / dışa aktarma** (Qualtrics, Medallia): haftalık e-posta özeti, CSV/PDF dışa aktarma ve paylaşılabilir bağlantı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfayı açtığında üç saniyede şu üç soruya yanıt almalı: "İşim iyiye mi gidiyor?", "Neden?" ve "Şimdi ne yapmalıyım?". Sayfa salt bir "metrik vitrini" değil, sonuç ile aksiyon arasında bir köprü olmalı.

**Yerleşim (ROI ile birleşik `/dealer/impact`):**
1. **Hero + dönem çubuğu:** `DashboardPageHero`; sağda segmentli dönem seçici (7g/30g/90g/özel), şube seçici ve "Dışa aktar" menüsü. Dönem URL search param'ında tutulsun (`?period=30d&location=…`) ki paylaşılabilsin.
2. **North-star şeridi (3-4 KPI kartı):** Geri dönen müşteri oranı · Negatif yorum oranı · Telafi ile geri kazanım · (tutar girilmişse) Geri dönen müşteri cirosu. Her kartta şunlar olsun: büyük değer, önceki döneme göre ok ve yüzde puan farkı, 12 noktalık sparkline, hedef halkası, `n=` örneklem rozeti ve "i" tooltip'inde sade dilde tanım. Kart tıklanınca ilgili listeye filtreli olarak gidilsin (negatif yorumlar, telafi kuyruğu, müşteriler/segment).
3. **"Neden?" bölümü:** Negatif oranındaki değişime en çok katkı veren 3 konu (topics/themes farkı) ve şube farkları.
4. **"Ne yapmalı?" bölümü:** ROI'nin yanıt ve aksiyon tamamlama oranları; açık telafi onayları ve yanıtsız negatif yorum sayısı, birer CTA butonuyla.
5. **Durumlar:** Kart bazında iskelet; boş durumda kurulum yönlendirmesi; hata durumunda "Tekrar dene"; modül kapalıysa açıklayıcı bir ekran.

**Motion / 3D:** 3D bu ekranda yerinde değil; veri ekranı sakin ve okunabilir olmalı. Ölçülü motion yeterli:
- KPI değerlerinde ilk yüklemede 400-600 ms'lik sayı sayma (`m as Motion` + `useSpring`).
- Sparkline'ların soldan sağa çizilmesi.
- Dönem değişiminde kartlarda çapraz geçiş (crossfade) ve layout animasyonu.

Hepsi `useReducedMotion()` ile devre dışı bırakılabilmeli. Hedefe ulaşan KPI için tek seferlik, küçük bir "hedef tamamlandı" vurgusu (halka parlaması) yeterli; konfeti gibi oyunlaştırma öğeleri iş ekranına uymaz.

**Veri / API değişiklikleri:**
- `lib/dealer-outcomes.ts` servisi: `resolvePeriod(period, tz='Europe/Istanbul')`, `negativeWhere()` (Feedback ve ConsumptionReview birlikte), `computeRepeatRate()`, `computeRemedyRecovery()` ve `MIN_SAMPLE` eşiği.
- `GET /api/dealer/outcomes?period=30d&locationId=` yanıt şeması:

  ```
  { period: { from, to, prevFrom, prevTo },
    kpis: [{ key, value, prevValue, delta, sampleSize, target?, series: [{t, v}] }],
    drivers: [...] }
  ```

  Redis'te `dealer-outcomes:{dealerId}:{period}:{loc}` anahtarıyla 120 sn önbellek; `assertModuleEnabled` kontrolü.
- Şema: `DealerGoal` (hedefler); `RemedyOffer.redeemedAt` (kullanım takibi; müşteri telafi akışındaki bulguyla birlikte).
- Ağır seriler için mevcut pre-aggregation altyapısı varsa (ROI'deki `date_trunc` deseni) haftalık bucket'lar tek SQL ile üretilsin; N+1 oluşmamalı.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/roi` ile doğrudan çakışma:** İkisi de "etki" sorusunu bu ay/geçen ay penceresiyle yanıtlıyor (`app/api/dealer/roi/route.ts:1-3`, `:39-46`; `app/api/dealer/business-outcomes/route.ts:2-3`, `:17-19`). Sistem bilgi mimarisi denetimi de aynı tespiti yapmış (`docs/audit/2026-10-08/sistem/bilgi-mimarisi-navigasyon.md:255`, `:493`). **Öneri:** `/dealer/impact` altında birleştirin; `/dealer/roi` ve `/dealer/business-outcomes` 308 ile buraya yönlendirsin; sidebar'da tek "Etki & Sonuçlar" öğesi kalsın.
- **`/dealer/growth-hub`:** Bu sayfaya yalnızca bir kartla bağlanıyor. Birleşmeden sonra hub kartı yeni sayfaya işaret etmeli ve "hedef takibi" metni ancak hedef özelliği yayına girince kullanılmalı (`messages/tr.json:2932`).
- **`/dealer/analytics` ve `/dealer/benchmark`:** Negatif oranı ve kıyas verisi kısmen örtüşüyor. Birleşik etki sayfası ham analitik yerine "sonuç" katmanını sahiplenmeli; benchmark verisi KPI kartlarında yalnızca bir "sektör ortalaması" işareti olarak kullanılmalı, ayrı ekran ayrı kalabilir.
- **`/dealer/remedy-queue`:** Telafi metriğinin drill-down hedefi. Birleşik sayfadaki telafi kartı kuyruğa filtreli bağlantı vermeli; kuyruğun kendisi ayrı kalmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: `app/api/dealer/business-outcomes/route.ts`, `app/dealer/business-outcomes/page.tsx`, `prisma/schema.prisma` (`RemedyOffer`, `Consumption`), `app/api/customer/remedy/[offerId]/route.ts`, `lib/remedy-automation-core.ts`, `app/api/dealer/remedy-offers/[id]/route.ts`, `messages/tr.json:1575-1588` baştan okundu. Kod değiştirilmedi, veritabanına dokunulmadı. Üç iddianın hiçbiri güvenlik açığı değil; üçü de veri doğruluğu ve yorumlanabilirlik sorunu. Önem derecesi buna göre okunmalı.

### İddia 1: Telafi kabul oranı paydası müşteriye gönderilmemiş teklifleri içeriyor
**Karar: DOĞRULANDI** (önem: yüksek değil, **orta-yüksek**; veri doğruluğu)

- Payda `prisma.remedyOffer.count({ where: { dealerId } })` (`route.ts:58`). Statü filtresi yok.
- `awaiting_dealer_approval` teklifler müşteriye görünmüyor. Müşteri liste ucu bunları gizliyor (`app/api/customer/remedy/route.ts:25`), detay ucu 404 döndürüyor (`app/api/customer/remedy/[offerId]/route.ts:58-62`). Bayinin reddettiği (`rejected`) taslaklar da müşteriye hiç gitmiyor (`app/api/dealer/remedy-offers/[id]/route.ts:16-17`), yine de paydada sayılıyor.
- Bu taslaklar bayi bir şey yapmadan da oluşuyor. Otomasyon düşük puanlı her geri bildirim için `status: 'awaiting_dealer_approval'` ile kayıt açıyor (`lib/remedy-automation-core.ts:97-106`).
- `expired` statüsünü yazan bir kod yolu bulunamadı. Yanıtlanmayan `pending` teklifler süresiz olarak paydada kalıyor. Metrikte tarih filtresi de yok (`route.ts:58-59`).
- `accepted` yalnızca müşterinin seçim yaptığını kaydediyor (`app/api/customer/remedy/[offerId]/route.ts:159-168`); kullanım bilgisi şemada yok (`schema.prisma:1327-1341`).
- Kart metni "Gönderilen telafi tekliflerinin kabul edilme oranı (gelir etkisi proxy)" diyor (`messages/tr.json:1587`). Hesap bu tanımla çelişiyor.

**Yeniden üretim:** Otomasyonu açık bir bayi ay içinde 4 teklifi müşteriye yayınlıyor, bunların 2'si kabul ediliyor. Aynı dönemde onay kuyruğunda 8 otomatik taslak bekliyor, 2 taslak da reddedilmiş. Kartta %50 yerine 2/14 = **%14,3** görünüyor. Bayi kuyruğu boşaltmadıkça (ya da taslakları reddettikçe) oran düşmeye devam ediyor. Oran müşteri davranışını değil kuyruk birikimini ölçüyor.

### İddia 2: Şikâyet düşüşü kısmi ayı tam ayla, UTC sınırla ve örneklem eşiği olmadan kıyaslıyor
**Karar: DOĞRULANDI** (alt maddelerden biri kısmen abartılı)

- **Örneklem eşiği yok, kısmi ay oynaklığı var: doğru.** Pencereler `thisMonth` ve `[lastMonth, thisMonth)` (`route.ts:17-19`, `:40`, `:48`). Oran yalnızca `total > 0` ile korunuyor (`route.ts:64-65`). Ayın 1'inde gelen tek yorum negatifse `negRateThis = 100` oluyor. Geçen ay %15 ise kart kırmızı "-85 puan" gösteriyor.
  - *Düzeltme:* Kıyaslanan şey sayı değil oran olduğu için kısmi ay tek başına sistematik bir yanlılık yaratmıyor. Sorun beklenen değerde değil, küçük örneklemde aşırı oynaklıkta.
- **UTC ay sınırı: doğru.** `new Date(y, m, 1)` sunucunun yerel saatini kullanıyor. Repoda `TZ` ayarı yok (`vercel.json`, `next.config.*` ve `.env*` dosyalarında aranıp bulunamadı). Vercel fonksiyonları varsayılan olarak UTC'de çalışıyor. Sonuç olarak ayın 1'inde TR saatiyle 00:00-03:00 arasında gelen yorumlar önceki aya yazılıyor.
  - *Not:* Raporun "ROI ucu `lib/timezone` ile Istanbul kullanıyor" ifadesi tam doğru değil. ROI de `startOfDayUTC/startOfWeekUTC` kullanıyor (`app/api/dealer/roi/route.ts:11`). Tutarsızlık sistem genelinde var.
- **Veri yokken yeşil "+0 puan": doğru.** İki ay da boşsa `0 - 0 = 0` çıkıyor ve `>= 0` dalı yeşil "+0" basıyor (`page.tsx:73-74`). Ek bir durum daha var: geçen ay hiç yorum yoksa `negRateLast = 0` kabul ediliyor (`route.ts:65`). Bu ay ilk yorumların bir kısmı negatifse kart, kıyaslanacak veri olmadığı halde büyük bir "artış" (kırmızı) gösteriyor.

**Yeniden üretim:** Geçen ay 40 yorum alıp 6'sı negatif olan (%15) bir bayi, ayın 2'sinde paneli açıyor. Bu ay 2 yorum var ve 1'i negatif (%50). Kartta kırmızı "-35 puan" görünüyor. Gerçek eğilim belirsiz olduğu halde bayi "şikâyet patladı" sinyali alıyor.

### İddia 3: Tekrar ziyaret metriği yanlış tanımlı ve tüm zamanları kapsıyor
**Karar: DOĞRULANDI** (önem **orta**; "yanlış tanımlı" kısmı abartılı)

- **Tüm zamanları kapsıyor: doğru.** `consumption.count` ve `groupBy` sorgularında yalnızca `dealerId` filtresi var, `createdAt` filtresi yok (`route.ts:25-26`). Değer dönemle değişmiyor. Bayinin bu ayki çabası, yıllık birikimin içinde neredeyse görünmez kalıyor.
- **Hata yutuluyor: doğru.** `try/catch` blokları yorum satırıyla boş bırakılmış (`route.ts:30-32`). DB zaman aşımı gibi geçici bir hata olduğunda diğer kartlar normal görünürken bu kart sessizce `0.00` basıyor. Ne log ne kullanıcı uyarısı var. Bu da raporun kendi 4. bulgusuyla örtüşüyor.
- **"Yanlış tanım" iddiası kısmen abartılı.** `consumption/unique - 1` "müşteri başına ortalama ek (tekrar) ziyaret" demek. Başlık "Tekrar ziyaret (ortalama)" (`messages/tr.json:1581`), ipucu da formülü açıkça yazıyor (`:1582`). Yani tanım matematiksel olarak gizlenmiş ya da yanlış değil. Asıl sorun bunun bir oran olmaması, birimsiz gösterilmesi ve bayiye eylem sinyali vermemesi; yani yorumlanabilirlik. Rotanın açıklaması ve alan adı `repeatVisitRate` (`route.ts:62`, `:71`) "oran" dediği için yanıltıcı.
- **Yalnızca fiziksel kart tüketimleri: doğru,** ama sistemdeki tek ziyaret kaydı `Consumption` (`schema.prisma:1574-1589`). Bu bir hata değil, kapsam sınırı. Kartta belirtilmeli.

**Yeniden üretim:** Bayinin bir DB sorgu zaman aşımı yaşadığını düşünelim. `consumption.groupBy` istisna atıyor, `catch` bloğu bunu yutuyor ve yanıt 200 dönüyor. Kart `0.00` gösteriyor. Bayi, "tekrar ziyaret sıfırlandı" diye yanlış bir sonuca varıyor. Normal günlerde ise 2 yıllık bir bayinin değeri ay ay pratikte sabit kalıyor (örneğin 1,84), çünkü yeni ziyaretler büyük bir tarihsel paydanın içinde eriyor.

### Özet

| # | İddia | Karar | Düzeltilmiş önem |
|---|---|---|---|
| 1 | Telafi paydası gönderilmemiş teklifleri içeriyor | Doğrulandı | Orta-yüksek (veri doğruluğu) |
| 2 | Şikâyet düşüşü: örneklem eşiği yok, UTC sınır, boş veride yeşil | Doğrulandı | Orta-yüksek (veri doğruluğu); "kısmi ay" yanlılığı oynaklık olarak düzeltildi |
| 3 | Tekrar ziyaret tüm zamanlı, hata yutuluyor | Doğrulandı | Orta; "yanlış tanım" kısmı abartılı, sorun yorumlanabilirlik |

Üç bulgunun hiçbiri yetki, IDOR ya da veri sızıntısı içermiyor. Tüm sorgular `dealerId = session.user.id` ile kapsanmış (`route.ts:13-15`). Önerilen tek servis yaklaşımı (`lib/dealer-outcomes.ts`: dönem çözümleme Europe/Istanbul, `MIN_SAMPLE`, gönderilmiş-teklif paydası, dönemli geri dönen müşteri oranı, null ile boş/hata ayrımı) üç sorunu birlikte kapatıyor.

---

## Uygulama (Dalga 2)

**Yeni rota:** `/dealer/analytics/impact` (ROI ile birleşik "Etki"). `/dealer/business-outcomes` sorgu parametrelerini koruyarak kalıcı olarak yönlendiriliyor; `layout.tsx` ve `/api/dealer/business-outcomes` silindi. Ayrıntı için bkz. `dealer_roi.md` › Uygulama (Dalga 2).

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1–2 | Rol + API kapsamı | ÇALIŞIYOR | `defineRoute` `tenant: 'dealer'`. |
| 3 | Metadata ("hedefe yaklaşma") | ÇALIŞIYOR | Hedefler gerçek: ayarlarda kayıtlı, kartta tuttu/tutmadı gösteriliyor. |
| 4 | Navigasyon | ÇALIŞIYOR | Analitik › Etki sekmesi (navigasyon kaydı navigasyon ajanında). |
| 5 | Modül kapısı | ÇALIŞIYOR | Etki `roi` modülüne bağlı; kapı hem sayfada hem API'de. |
| 6 | Veri çekme | ÇALIŞIYOR | Zarf v2, iptal, SSR ön-yükleme. |
| 7 | Yükleniyor | ÇALIŞIYOR | İskelet. |
| 8 | Hata toast'ı | ÇALIŞIYOR | Hata satır içinde `QueryState` ile; "Dikkat:" öneki yok. |
| 9 | Boş durum | ÇALIŞIYOR | Gerçek veri yokluğu ile hata ayrı gösteriliyor. |
| 10 | Başlık | ÇALIŞIYOR | `PageHeader`. |
| 11 | Tekrar ziyaret | ÇALIŞIYOR | "Geri dönen müşteri %": dönemli, n'li, tanımı açık. |
| 12 | Formül açıklaması | ÇALIŞIYOR | Sade dil + "Nasıl hesaplanır?". |
| 13 | Şikâyet düşüşü | ÇALIŞIYOR | "Olumsuz yorum oranı": eşit dönem kıyası, en az 10 örneklem, QR + tüketim yorumu, İstanbul günü. |
| 14 | Renk kodlaması | ÇALIŞIYOR | `DeltaBadge`'de iyi yön aşağı; birim "yüzde puanı". |
| 15 | Bu ay negatif satırı | ÇALIŞIYOR | KPI değeri, `Intl` biçimi. |
| 16 | Telafi kabul oranı | ÇALIŞIYOR | Payda yalnız müşteriye ulaşan teklifler (onay kuyruğu ve reddedilenler hariç), dönemli. |
| 17 | "Gelir etkisi" iddiası | ÇALIŞIYOR | Gerçek kayıtlı ciro ve kapanan döngünün tahmini ek cirosu; yöntem ve varsayım açık. |
| 18 | Sayı biçimi | ÇALIŞIYOR | `Intl.NumberFormat`. |
| 19 | Mobil | ÇALIŞIYOR | |
| 20 | Başlık hiyerarşisi / ikonlar | ÇALIŞIYOR | h1 → h2; dekoratif ikonlar `aria-hidden`. |
| 21 | Hata yutma | KALDIRILDI | try/catch → 0 yok; hata görünür. |
| 22 | Önbellek | ÇALIŞIYOR | Redis 120 sn. |
| 23 | Dönem seçici | ÇALIŞIYOR | |
| 24 | Trend / sparkline | ÇALIŞIYOR | Haftalık eğilim + KPI sparkline'ları (olumsuz oran, yanıt, ciro, aksiyon). |
| 25 | Hedef | ÇALIŞIYOR | 5 hedef anahtarı; her biri doğru yönde değerlendiriliyor. |
| 26 | Drill-down | ÇALIŞIYOR | Kartlar ilgili listeye gidiyor. |
| 27 | Yenile | ÇALIŞIYOR | |
| 28 | Şube filtresi | ÇALIŞIYOR | Filtre yerine şube kırılım tablosu (şube yalnız QR geri bildirimine bağlı). |
| 29 | Dışa aktarma | ÇALIŞIYOR | CSV. E-posta özeti kapsam dışı. |
| 30 | Kıyas bağlamı | ÇALIŞIYOR | Önceki döneme göre değişim; sektör kıyası Kıyas sekmesinde. |
| 31 | n / tanım | ÇALIŞIYOR | `n`, düşük örneklem uyarısı ve yöntem listesi. |

**Kapanan bulgular:** 1–10 (10/10).

**Kalanlar:**
- **"Neden?" konu katkısı bölümü:** Kıyas › Konu kıyası'na bırakıldı.
- **`RemedyOffer.redeemedAt` (kullanım takibi):** şema dondurulduğu için eklenemedi (ŞEMA İSTEĞİ).
- **Haftalık e-posta özeti:** yapılmadı.
