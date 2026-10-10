# /dealer/roi

**Amaç:** Bayiye "bu ay" için geri bildirim hacmi, yanıt oranı, aksiyon tamamlama oranı ve ortalama puanı; önceki aya göre değişimi; son 6 hafta ve son 7 gün trendini göstermek. Sayfa adı ve ikonografisi (ROI, `DollarSign`) bir **yatırım getirisi / gelir etkisi** paneli vaat ediyor, ancak hiçbir parasal veya tekrar-ziyaret metriği hesaplanmıyor.

**Genel puan:** 4.5 / 10 · **Karar:** **birleştir** (`/dealer/business-outcomes` ile tek bir "Etki ve ROI" paneline; gerçek gelir atfı eklenerek)

İncelenen dosyalar: `app/dealer/roi/page.tsx`, `app/dealer/roi/layout.tsx`, `app/dealer/layout.tsx`, `components/dealer/roi-charts.tsx`, `app/api/dealer/roi/route.ts`, `lib/api-auth.ts`, `lib/timezone.ts`, `lib/admin-toast.ts`, `lib/app-locale.tsx`, `lib/module-controls.ts`, `lib/module-gate.ts`, `lib/visibility-controls.ts`, `components/dashboard/sidebar.tsx`, `components/providers.tsx`, `proxy.ts`, `messages/tr.json` + `messages/en.json` (`dealerRoi`, `layoutMetadata.dealerRoi*`), `prisma/schema.prisma` (`Feedback`, `ActionItem`, `Consumption`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Temel sayımlar doğru, ama "ROI" vaadi karşılanmıyor; ay-içi karşılaştırma ve haftalık aksiyon trendi yanlış veri üretiyor; hata durumu "veri yok" gibi görünüyor. |
| UX | 4/10 | Dönem seçimi, kırılım, hedef, dışa aktarım yok; KPI'lar başka üç sayfada zaten var; "Hafta 1…6" gibi bilgi taşımayan etiketler. |
| Görsel | 6/10 | Tutarlı shadcn kartları ve temiz grid; ancak dört KPI kartı neredeyse aynı şablon, görsel hiyerarşi yok, "nasıl artar" kartı statik metin. |
| Mimari | 5/10 | Tek uç, Redis cache, N+1'den arındırılmış raw SQL iyi; ama tamamen istemci tarafı fetch, sunucu tarafı modül kapısı yok, ölü ADMIN dalı, sabit kodlu TR etiketleri API'de ve grafik bileşeninde. |
| Performans | 7/10 | 10 paralel `count` + 3 raw sorgu + 60 sn Redis; grafikler `dynamic(ssr:false)` ile bölünmüş. Raw sorgular gereksiz yere ardışık, `ActionItem` için bileşik indeks yok. |
| Erişilebilirlik + mobil | 5/10 | Mobilde grid düzgün yığılıyor; ancak `<a><button>` iç içe etkileşim, grafiklerin metin alternatifi yok, `Progress` etiketsiz, `AnimatedNumber` azaltılmış hareketi yok sayıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim yetkisi (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:52` (`'/dealer': 'DEALER'`) | ADMIN ve STAFF sayfaya giremez. |
| 2 | API kimlik + rol + token-replay kontrolü | ÇALIŞIYOR | `app/api/dealer/roi/route.ts:16-18`, `lib/api-auth.ts:52-83` | `dealerId = session.user.id` → IDOR yok; cache anahtarı bayiye izole (`route.ts:34`). |
| 3 | Modül kapatma (`roi` modülü) | KISMİ | `lib/module-controls.ts:42`, `components/dashboard/sidebar.tsx:450-454` | Yalnız menüde gizlenir; `route.ts` `assertModuleEnabled` çağırmıyor, doğrudan URL/API açık kalır. |
| 4 | Sayfa metadata (başlık/açıklama) | SAHTE | `app/dealer/roi/layout.tsx:5`, `messages/tr.json` `layoutMetadata.dealerRoiDescription` = "Kampanya ve kanal geri dönüş özeti; dışa aktarılabilir seriler." | Sayfada kampanya, kanal veya dışa aktarım yok. |
| 5 | Hero (eyebrow, "ROI Paneli", `DollarSign` ikonu) | KISMİ | `page.tsx:148-153` | Ad ve ikon parasal getiri vaat ediyor; içerik operasyon metrikleri. |
| 6 | Hero aksiyonu: "Geri Bildirimler" linki | ÇALIŞIYOR | `page.tsx:156-165` | `Button asChild` doğru kullanılmış. |
| 7 | Hero aksiyonu: "Aksiyonlar" linki | ÇALIŞIYOR | `page.tsx:166-171` | `/dealer/action-items` mevcut; menüden kaldırılmış olsa da (`sidebar.tsx:230-231` yorumu) erişilebilir. |
| 8 | Yükleniyor durumu | KISMİ | `page.tsx:129-142` | Hero dahil tüm sayfa yerine tek spinner; yüklenince sayfa sıçrar (CLS). İskelet yok. |
| 9 | Hata durumu | BOZUK | `page.tsx:111-119`, `176-183` | Hata sonrası `metrics` null kalır → "Henüz veri yok." boş durumu gösterilir. Kullanıcı hata ile veri yokluğunu ayırt edemez; yeniden dene yok. |
| 10 | Boş durum | KISMİ | `page.tsx:176-183`, `route.ts:183-210` | API bayiye her zaman `metrics` döner; boş durum pratikte yalnız hatada görünür. Gerçek "sıfır veri" durumunda sıfırlarla dolu kartlar ve boş grafikler çıkar. |
| 11 | KPI: Bu ayki geri bildirim sayısı | KISMİ | `route.ts:39-45`, `60`; `page.tsx:188-211` | Ay sınırı sunucu yerel saatiyle (Vercel'de UTC) hesaplanır; İstanbul saatine göre ayın ilk 3 saati önceki aya düşer. `endOfMonth` milisaniyesiz (`23:59:59`). |
| 12 | Alt metin: "{count} yanıtlandı" | ÇALIŞIYOR | `page.tsx:205-207`, `route.ts:61` | |
| 13 | Değişim rozeti: geri bildirim sayısı | BOZUK | `route.ts:41-46`, `82`; `page.tsx:208` | Yarım ay (örn. ayın 8'i) tam önceki ayla kıyaslanıyor → ay başında neredeyse her zaman kırmızı negatif. Bkz. Bulgu 1. |
| 14 | KPI: Yanıt oranı + ilerleme çubuğu | ÇALIŞIYOR | `route.ts:72`, `188`; `page.tsx:213-236` | |
| 15 | Değişim rozeti: yanıt oranı | KISMİ | `route.ts:79`; `page.tsx:80-91`, `232` | Fark yüzde puan (pp) ama "%" olarak gösteriliyor; önceki ay oranı 0 ise değişim `null` → 0'dan iyileşme hiç gösterilmez. `change === 0` da gizlenir. |
| 16 | KPI: Aksiyon tamamlama oranı | KISMİ | `route.ts:62-63`, `73` | Kohort mantığı: yalnız bu ay **oluşturulan** aksiyonlar; geçen ay oluşturulup bu ay tamamlananlar sayılmaz. `cancelled` paydada kalır, oranı düşürür. |
| 17 | Alt metin: "{done} / {total} tamamlandı" | ÇALIŞIYOR | `page.tsx:255-259` | |
| 18 | Değişim rozeti: aksiyon oranı | KISMİ | `route.ts:80`; `page.tsx:262` | #15 ile aynı pp/% ve 0-taban sorunu. |
| 19 | KPI: Ortalama puan | ÇALIŞIYOR | `route.ts:64`, `76`; `page.tsx:273-297` | `null` ise "-" gösterir. |
| 20 | Alt metin: "{count} geri bildirim" (puan kartında) | KISMİ | `route.ts:64`, `193`; `prisma/schema.prisma` `Feedback.rating Int` (zorunlu) | `rating` zorunlu olduğundan `_count` = `feedbackTotal`; ilk kartın sayısını tekrar eder, bilgi katmaz. |
| 21 | Değişim rozeti: ortalama puan | ÇALIŞIYOR | `route.ts:81`; `page.tsx:293-295` | Sayfadaki koşul `ChangeBadge` içindeki kontrolü tekrar ediyor (ölü koruma). |
| 22 | Sayı sayma animasyonu (`AnimatedNumber`) | KISMİ | `page.tsx:61-78` | `setInterval` ile 40 adım; `prefers-reduced-motion` dikkate alınmaz (global `MotionConfig reducedMotion="user"` bunu kapsamaz, `components/providers.tsx:232`). Ekran okuyucu ara değerleri okuyabilir. |
| 23 | Kart giriş animasyonları (framer `m`) | ÇALIŞIYOR | `page.tsx:188-191` vb.; `components/providers.tsx:232` | Ölçülü, azaltılmış hareket global olarak saygı görüyor. |
| 24 | Haftalık alan grafiği: geri bildirim + yanıt serileri | ÇALIŞIYOR | `route.ts:99-113`, `components/dealer/roi-charts.tsx:76-77` | Tek raw sorguda `date_trunc('week')`; oturum saat dilimi UTC varsayımı **doğrulanmadı**. |
| 25 | Haftalık grafik: "Aksiyon tamamlanan" serisi | BOZUK | `route.ts:114-123` | `createdAt`'e göre kovalanıyor; `completedAt` alanı var (`schema.prisma` `ActionItem.completedAt`) ama kullanılmıyor → tamamlanma haftası yanlış. Bkz. Bulgu 2. |
| 26 | Haftalık grafikte ortalama puan | EKSİK | `messages/tr.json` `weeklyTrendSubtitle` "…ve ortalama puan."; `roi-charts.tsx:76-78` | API `avgRating` döndürüyor, alt başlık vaat ediyor, legend formatter'da dalı var; ama `<Area>` olarak çizilmiyor. |
| 27 | Haftalık grafik etiketleri / tooltip başlığı | BOZUK | `route.ts:132` (`Hafta ${i + 1}`), `roi-charts.tsx:61` (`Hafta: ${label}`) | Tooltip "Hafta: Hafta 3" yazar; `weekStart` tarihi dönüyor ama gösterilmiyor → kullanıcı hangi haftaya baktığını bilemez. |
| 28 | Grafik dili (i18n) | BOZUK | `roi-charts.tsx:58-72`, `96`; `route.ts:132`, `143` | Seri adları, tooltip, gün adları ("Paz", "Pzt"…) ve "Hafta" sabit Türkçe; EN locale'de karışık dil. |
| 29 | Günlük bar grafiği (son 7 gün) | ÇALIŞIYOR | `route.ts:141-181`, `roi-charts.tsx:85-103` | Günler UTC'ye göre; İstanbul gece 00-03 arası önceki güne yazılır. |
| 30 | Grafiklerin koşullu gösterimi | KISMİ | `page.tsx:302`, `324`; `route.ts:128`, `171` | API her zaman 6/7 eleman döndüğünden `length > 0` hep doğru; sıfır veri için grafik-içi boş durum yok. |
| 31 | Grafiklerin code-split + iskelet yüklemesi | ÇALIŞIYOR | `page.tsx:30-37` | Recharts ilk paketten ayrılmış. |
| 32 | "ROI nasıl artar?" kartı ("Hedef özeti") | SAHTE | `page.tsx:345-370`, `messages/tr.json` `howToImproveBody` | Kod yorumu "Hedef özeti" diyor; hedef yok, veri yok, her bayiye aynı statik metin. |
| 33 | CTA "Geri bildirime yanıt ver" | KISMİ | `page.tsx:361-366` | Çalışıyor ama `<Link><Button>` → `<a><button>` iç içe etkileşimli öğe (geçersiz HTML, çift tab durağı). Hero'da doğru desen (`asChild`) var. |
| 34 | Redis önbellek (60 sn) | ÇALIŞIYOR | `route.ts:33-36`, `211` | Yanıt verdikten sonra geri dönünce 60 sn'ye kadar eski oran görülür; invalidation yok (kabul edilebilir, ama bilinmeli). |
| 35 | ADMIN için `?dealerId=` desteği | SAHTE | `route.ts:15`, `21-28` | Mesaj "dealerId query ile belirtin" diyor; `GET()` `request` bile almıyor, parametre hiç okunmuyor. Ayrıca `proxy.ts:52` ADMIN'i sayfaya sokmadığı için dal fiilen ölü. |
| 36 | Parasal ROI / gelir / tekrar ziyaret etkisi | SAHTE | `route.ts:2` (yorum: "aksiyonların gelir, memnuniyet, tekrar ziyaret etkisi"), `page.tsx:8`, `152` | Hiçbir para birimi veya tekrar ziyaret hesaplanmıyor; `Consumption.amount` şemada mevcut ama kullanılmıyor. |
| 37 | Dönem seçimi (bu ay / 30 gün / 90 gün / özel) | EKSİK | `route.ts:185` `period: 'this_month'` sabit | |
| 38 | Dışa aktarım (CSV/PDF) | EKSİK | — | Metadata vaat ediyor (#4). |
| 39 | Şube / QR / personel kırılımı | EKSİK | — | Çok şubeli bayi için kritik. |
| 40 | Yenile / yeniden dene / son güncelleme zamanı | EKSİK | `page.tsx:100-127` | Tek seferlik fetch; hata sonrası tek yol sayfayı yenilemek. |
| 41 | Hata toast metni | BOZUK | `lib/admin-toast.ts:18-19` | `toast.error` her mesaja "Dikkat: " (ASCII, TR) önekler → EN'de "Dikkat: Could not load ROI". Bayi sayfası "admin" toast yardımcısını kullanıyor. |
| 42 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:187` (`sm:grid-cols-2 lg:grid-cols-4`), `353` (`flex-col sm:flex-row`) | Grafikler `ResponsiveContainer` ile akışkan. |
| 43 | Grafiklerin erişilebilir alternatifi (tablo/özet) | EKSİK | `roi-charts.tsx` | Renk tek ayırt edici; klavye ile veri noktasına erişim yok. |
| 44 | Otomatik test | EKSİK | `__tests__`, `tests`, `e2e` altında `dealer/roi` referansı yok | Tarih kovalama mantığı test edilmemiş. |

**Durum dağılımı:** ÇALIŞIYOR 15 · KISMİ 12 · BOZUK 6 · SAHTE 4 · EKSİK 7 (toplam 44)

---

## Bulgular

### 1. Ay-içi kısmi dönem, tam önceki ayla kıyaslanıyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `app/api/dealer/roi/route.ts:39-46` (`thisMonthWhere` = ayın 1'i → bugün; `prevMonthWhere` = önceki ayın tamamı), `route.ts:82` (`feedbackChange = feedbackTotal - prevFeedbackTotal`), `page.tsx:208`, `messages/tr.json` `changeVsPrevMonth`.
- **Sorun:** Ayın 8'inde bu ay 40, geçen ay 150 geri bildirim varsa rozet "-110 önceki aya göre" kırmızı gösterir. Bayi ay başında her gün "düşüşte" olduğuna inanır; bu, panelin en görünür sayısının sistematik olarak yanıltıcı olması demektir. Oran metriklerinde (yanıt, tamamlama, puan) bu etki daha az ama yine de küçük örneklemle tam ayı kıyaslıyor.
- **Öneri:** Karşılaştırmayı **eş uzunlukta pencere** ile yap: "ayın ilk N günü" ↔ "önceki ayın ilk N günü" (MTD vs. önceki MTD) ya da varsayılanı "son 30 gün ↔ önceki 30 gün"e çevir. API'de `period` ve `compare` parametreleri (`?range=30d&compare=previous_period`) tanımla; yanıtta `periodStart/periodEnd/compareStart/compareEnd` döndür ve UI'da rozetin altına "1–8 Eki vs 1–8 Eyl" gibi açık etiket yaz. Sayı farkı yerine yüzde değişim + yön göster; hacim için "kötü" kırmızısı yerine nötr renk kullan (hacim azalması her zaman kötü değildir).

### 2. Haftalık "aksiyon tamamlanan" serisi tamamlanma tarihine değil oluşturulma tarihine göre kovalanıyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `route.ts:114-123` (`WHERE "status" = 'done' AND "createdAt" >= …` ve `date_trunc('week', "createdAt")`); `prisma/schema.prisma` `ActionItem.completedAt DateTime?`.
- **Sorun:** 1. hafta oluşturulup 6. hafta tamamlanan aksiyon grafikte 1. haftaya yazılır; son haftalar sistematik olarak düşük görünür ve "aksiyonlarınız etkili mi" sorusunun cevabı tersine döner. Ayrıca KPI'daki tamamlama oranı (`route.ts:62-63`) sadece bu ay oluşturulan kohortu ölçüyor; geçen ayın birikmiş işini kapatan bayi bunun karşılığını görmüyor. `cancelled` aksiyonlar paydada kalıyor.
- **Öneri:** Trendde `COALESCE("completedAt", "updatedAt")` ile kovala. KPI'yı iki ayrı metriğe böl: (a) **Bu dönem tamamlanan** (completedAt dönem içinde) ve (b) **Açık iş yükü** (dönem sonunda pending/assigned/in_progress sayısı + gecikmiş `dueAt`). Oran gösterilecekse paydadan `cancelled`'ı çıkar. Ortalama kapanış süresi (`completedAt - createdAt` medyanı) eklemek, Medallia/Qualtrics'teki "close-the-loop time" metriğinin karşılığı olur.

### 3. "ROI" adı ve vaadi karşılıksız — sayfa ad olarak yalan söylüyor
- **Önem:** yüksek · **Kategori:** ürün / bilgi mimarisi · **Efor:** L
- **Kanıt:** `page.tsx:8`, `152` (`DollarSign`), `messages/tr.json` `dealerRoi.title` "ROI Paneli", `route.ts:2` (yorum: "gelir, memnuniyet, tekrar ziyaret etkisi"), `layoutMetadata.dealerRoiDescription` ("Kampanya ve kanal geri dönüş özeti; dışa aktarılabilir seriler"), `lib/module-controls.ts:42` ("Yatırım getirisi analitiği").
- **Sorun:** Sayfadaki dört metrik (hacim, yanıt oranı, aksiyon tamamlama, ortalama puan) ROI değil, operasyonel CX metrikleri. Para, tekrar ziyaret, kampanya, kanal, dışa aktarım yok. Aynı metrikler `/dealer` (dashboard, `dealer-dashboard-client.tsx:249-259`, `321`), `/dealer/analytics` (`analytics-client.tsx:600-602`) içinde zaten var. Oysa şemada gerçek ROI için gereken veri mevcut: `Consumption.amount`, `Consumption.customerId`, `@@index([dealerId, createdAt])`.
- **Öneri:** Ya gerçek bir ROI motoru kur ya da sayfayı yeniden adlandırıp birleştir (bkz. Çakışmalar). Gerçek ROI için: (1) **Kapanan döngü → geri dönüş**: yanıtlanmış olumsuz geri bildirim bırakan müşterilerin 30/60 gün içinde tekrar `Consumption` oranı vs. yanıtlanmamışların oranı (doğal kontrol grubu); (2) **Atfedilen gelir**: bu geri dönen müşterilerin `amount` toplamı; (3) **Telafi maliyeti** (remedy teklifleri) ile net getiri; (4) kampanya başına getiri `app/api/dealer/campaigns/[id]/performance` ile birleşik. Tüm bunlar tek bir `lib/roi-engine.ts` servisinde, dönem parametreli ve Redis'te önbellekli hesaplanmalı; `amount` boşsa "tahmini" etiketiyle ortalama sepet varsayımı kullanılmalı ve UI'da açıkça belirtilmeli.

### 4. Hata durumu "veri yok" olarak gösteriliyor, kurtarma yolu yok
- **Önem:** orta · **Kategori:** UX / hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:111-114` (hata → toast + return), `page.tsx:176-183` (`!metrics` → "Henüz veri yok."), `lib/admin-toast.ts:18-19`.
- **Sorun:** Ağ hatası, 403 (token-replay), 500 — hepsi kısa bir toast ve ardından kalıcı "Henüz veri yok. Bu ay geri bildirim … eklendikçe…" mesajı. Bayi gerçekte verisi olduğu halde sıfır sanabilir. Toast "Dikkat: " TR önekini her dilde ekliyor.
- **Öneri:** `error` durumunu ayrı state olarak tut ve inline hata kartı ("Veriler yüklenemedi" + **Yeniden dene** düğmesi + hata kodu) göster. Veri katmanını SWR/React Query'ye taşı (`revalidateOnFocus`, `retry` ile); bayi paneli için ayrı, i18n'e uygun `toast` yardımcısı kullan (`lib/admin-toast` yerine doğrudan `sonner` veya locale'e duyarlı sarmalayıcı).

### 5. Haftalık grafik bilgi vermiyor: "Hafta 1…6", çizilmeyen ortalama puan, ölçek karışıklığı
- **Önem:** orta · **Kategori:** dataviz / UX · **Efor:** S
- **Kanıt:** `route.ts:132`, `roi-charts.tsx:61` ("Hafta: Hafta 3"), `roi-charts.tsx:64-72` (legend'da `avgRating` dalı var), `76-78` (yalnız 3 seri), `messages/tr.json` `weeklyTrendSubtitle` ("…ve ortalama puan").
- **Sorun:** Göreli haftalar mutlak tarih vermediği için olay-sonuç ilişkisi (ör. "menü değişikliğinden sonra puan arttı mı?") kurulamaz. Alt başlık puanı vaat ediyor ama çizilmiyor. Üst üste binen üç gradyan alan, sayıları farklı büyüklükteki serilerde birbirini örtüyor.
- **Öneri:** X eksenini `weekStart`'tan locale'e göre "29 Eyl" biçiminde üret (etiket üretimini API'den kaldırıp istemciye `Intl.DateTimeFormat` ile taşı). İki eksenli kombine grafik: sayımlar (feedback/yanıt) bar, ortalama puan sağ eksende çizgi (1–5 sabit domain). Aksiyonları ayrı küçük sparkline'a ayır. Tooltip'te "Yanıt oranı %X" türetilmiş değerini de göster.

### 6. Grafik ve API etiketlerinde sabit Türkçe — EN locale'de dil karışıklığı
- **Önem:** orta · **Kategori:** i18n · **Efor:** S
- **Kanıt:** `components/dealer/roi-charts.tsx:58-72`, `96`; `route.ts:132` (`Hafta`), `route.ts:143` (`['Paz','Pzt',…]`); `lib/admin-toast.ts:18-19`.
- **Sorun:** Sayfa metinleri `useAppT` ile çevrilirken grafik serileri, gün adları ve tooltip Türkçe kalıyor.
- **Öneri:** API yalnız ham tarih (`weekStart`, `date`) döndürsün; gün/hafta etiketlerini istemcide `Intl.DateTimeFormat(locale, { weekday: 'short' })` ile üret. `roi-charts.tsx` bileşenlerine `labels` prop'u ver ya da içeride `useAppT` kullan; `dealerRoi.chart.*` anahtarlarını `messages/*.json`'a ekle.

### 7. Sunucu tarafında modül kapısı yok
- **Önem:** orta · **Kategori:** yetki / yapılandırma · **Efor:** S
- **Kanıt:** `lib/module-controls.ts:42` (`roi` modülü), `components/dashboard/sidebar.tsx:450-454` (yalnız menü filtresi), `app/api/dealer/roi/route.ts` (`assertModuleEnabled` yok); karşılaştırma: `app/api/dealer/campaigns/route.ts` modül kapısını kullanıyor.
- **Sorun:** Admin `roi` modülünü kapatsa bile bayi URL ile sayfaya girip API'yi çağırabilir. Veri sızıntısı değil (yalnız kendi verisi), ama "modül kapalı" kararı fiilen uygulanmıyor.
- **Öneri:** `route.ts` başında `assertModuleEnabled('roi', { role: 'dealer', userId })` çağır; sayfa tarafında kapalı modül için açıklayıcı bir "Bu modül yöneticiniz tarafından kapatıldı" durumu göster. Bu deseni tüm `/api/dealer/*` analitik uçlarına yayan ortak bir `withDealerModule(key, handler)` sarmalayıcısı düşün.

### 8. Ölü/yanıltıcı ADMIN dalı
- **Önem:** düşük · **Kategori:** mimari / ölü kod · **Efor:** S
- **Kanıt:** `route.ts:15` (`GET()` parametresiz), `route.ts:20-29` ("?dealerId=xxx ile belirtin" mesajı), `proxy.ts:52`.
- **Sorun:** Var olmayan bir parametreyi tarif eden mesaj; `dealerId` değişkeni ADMIN için `undefined` olacak şekilde hesaplanıp hiç kullanılmıyor. Gelecekte biri erken dönüşü kaldırırsa `qrCode: { dealerId: undefined }` filtresi **tüm bayilerin** verisini toplar (Prisma'da `undefined` filtre yok sayılır) ve `dealer-roi:undefined` anahtarıyla önbelleğe yazar.
- **Öneri:** Ya admin desteğini gerçekten uygula (`request.nextUrl.searchParams.get('dealerId')` + varlık doğrulaması + ayrı cache anahtarı) ya da rolü `['DEALER']`'a indirip dalı sil. `dealerId`'yi `string` olarak daraltıp `undefined` ile sorgu yapılmasını tip düzeyinde engelle.

### 9. İç içe etkileşimli öğe ve erişilebilirlik eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:361-366` (`<Link><Button>`), `page.tsx:230`, `260` (`Progress` aria-label yok), `page.tsx:197`, `247`, `277`, `311`, `333`, `355` (dekoratif ikonlarda `aria-hidden` yok; `222` ve `152`'de var — tutarsız), `page.tsx:61-78` (`AnimatedNumber`).
- **Sorun:** `<a><button>` çift tab durağı ve geçersiz HTML; ilerleme çubuklarını ekran okuyucu bağlamsız okur; sayaç animasyonu `prefers-reduced-motion`'ı yok sayar ve canlı ara değerler üretir; grafiklerin metin alternatifi yok.
- **Öneri:** CTA'da `Button asChild` kullan. `Progress`'e `aria-label={t('dealerRoi.kpiReplyRate')}` ver. `AnimatedNumber`'ı `useReducedMotion()` ile koşullandır ve `aria-hidden` sayaç + `sr-only` nihai değer ikilisine çevir (veya framer `animate()`/`useMotionValue` ile tek RAF döngüsüne geçir). Her grafiğin altına "Tabloyu göster" açılır bölümü ekle (sr-only değil, görünür seçenek).

### 10. Yükleme deneyimi: tam sayfa spinner, hero'nun yok olması
- **Önem:** düşük · **Kategori:** UX / performans algısı · **Efor:** S
- **Kanıt:** `page.tsx:129-142`.
- **Sorun:** Hero ve navigasyon aksiyonları veri gelene kadar render edilmiyor; geldiğinde tüm düzen kayıyor. Proje genelinde iskelet deseni zaten var (`page.tsx:32`, `36`).
- **Öneri:** Hero'yu her zaman render et; KPI grid'i ve grafikler için boyutu eşleşen `Skeleton` blokları göster. Daha iyisi: sayfayı Server Component + `Suspense` sınırlarına böl; KPI verisini sunucuda aynı servis fonksiyonundan al (ek HTTP turu yok), grafikleri istemci adası olarak bırak.

### 11. Sorgu düzeni: raw sorgular ardışık, `ActionItem` bileşik indeksi yok, 10 ayrı count
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `route.ts:48-70` (10 paralel sorgu), `route.ts:99`, `114`, `154` (3 raw sorgu sırayla `await`), `schema.prisma` `ActionItem` indeksleri yalnız `[feedbackId]`, `[dealerId]`, `[status]`.
- **Sorun:** Önbellek boşken 10 paralel sorgu Neon pooler'da (`connection_limit=5`, bkz. proje hafızası) kuyruğa girer; ardından 3 raw sorgu seri çalışır. Etki 60 sn cache ile sınırlı ama soğuk istekte gereksiz gecikme.
- **Öneri:** 3 raw sorguyu `Promise.all` içine al. Feedback için iki dönemi tek sorguda `COUNT(*) FILTER (WHERE …)` ile topla (10 → 2 sorgu). `ActionItem`'a `@@index([dealerId, createdAt])` ve `@@index([dealerId, completedAt])` ekle (migration canlı Neon'da planlı yapılmalı).

### 12. Saat dilimi: ay/gün sınırları UTC
- **Önem:** düşük · **Kategori:** veri doğruluğu · **Efor:** M
- **Kanıt:** `route.ts:39-42` (`new Date(y, m, 1)` sunucu yerel = UTC), `lib/timezone.ts:19-30` (UTC gün/hafta), `route.ts:102`, `157` (`AT TIME ZONE 'UTC'`).
- **Sorun:** Türkiye'deki bir restoranın gece 00:00–03:00 arası (yoğun bar/kafe saatleri) geri bildirimleri önceki güne/aya yazılır; "Son 7 gün" grafiğinde Cumartesi gecesi Cuma'ya düşer.
- **Öneri:** Bayinin saat dilimini (varsayılan `Europe/Istanbul`) kullanıcı/ayar modelinden okuyup sınırları o dilimde hesapla; SQL'de `date_trunc('day', f."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})` kullan. Bu, tüm bayi analitik uçlarında ortak bir `lib/dealer-period.ts` yardımcısına çıkarılmalı.

### 13. Statik "ROI nasıl artar?" kartı ve gereksiz tekrarlar
- **Önem:** düşük · **Kategori:** UX / içerik · **Efor:** M
- **Kanıt:** `page.tsx:345-370` (yorum "Hedef özeti"), `page.tsx:290-292` + `route.ts:193` (feedbackCount = feedbackTotal), `page.tsx:293` (çift koşul).
- **Sorun:** Her bayiye aynı tavsiye; hedef belirleme veya kişisel öneri yok. Puan kartındaki "{count} geri bildirim" ilk kartı tekrar ediyor.
- **Öneri:** Kartı veri odaklı "Sonraki en iyi adım"a çevir: "12 yanıtlanmamış olumsuz geri bildirim var — yanıtlarsanız tahmini +%X yanıt oranı" + doğrudan filtreli link (`/dealer/feedbacks?status=unreplied&rating=lte2`). Bayinin aylık hedef (yanıt oranı ≥ %90, puan ≥ 4.5) tanımlayabildiği küçük bir hedef modeli ekle; KPI kartlarında hedef çizgisi göster. Puan kartının alt metnini "Olumlu %X / Olumsuz %Y" dağılımıyla değiştir.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Gerçek getiri atfı** (Medallia "Closed-loop ROI", Qualtrics XM ROI): yanıtlanan şikayetçilerin geri dönüş oranı ve atfedilen gelir; `Consumption.amount` ile mümkün.
2. **Dönem seçici ve eş-dönem karşılaştırma** (Square Dashboard, Toast): 7g/30g/90g/özel aralık, "önceki dönem" ve "geçen yıl aynı dönem".
3. **Şube/QR/personel kırılımı** (Yelp for Business, Google Business Profile çok-konum): hangi QR noktasının veya hangi personelin yanıt hızını düşürdüğü.
4. **Yanıt süresi metrikleri** (Google Business Profile "yanıt süresi", Medallia "time to close"): medyan ilk yanıt süresi, SLA ihlal sayısı.
5. **Hedefler ve uyarılar**: KPI başına hedef, hedef çizgisi, eşik altına düşünce bildirim/e-posta özeti (Qualtrics dashboards + alerts).
6. **Dışa aktarım ve paylaşım**: CSV/PDF rapor, zamanlanmış haftalık e-posta (Square, Toast) — metadata zaten vaat ediyor.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfayı açtığında tek bir soruya 5 saniyede cevap almalı: *"Geri bildirimlerle ilgilenmem bana ne kazandırdı ve bu ay neyi düzeltmeliyim?"* Sayfa operasyon metriği tekrarı değil, **etki ve getiri** hikâyesi anlatmalı.

**Yerleşim (masaüstü, yukarıdan aşağı):**
1. **Başlık şeridi:** Hero sabit; sağda dönem seçici (Bu ay MTD / 30g / 90g / Özel) + karşılaştırma anahtarı + "Dışa aktar" menüsü + "Son güncelleme: 14:02 · Yenile".
2. **Kahraman metrik ("North Star"):** Tek büyük kart — *"Kapanan döngüden atfedilen gelir: ₺18.400"* (tahmini ise rozetli), altında "Yanıtlanan şikayetçilerin %42'si 30 gün içinde geri döndü (yanıtlanmayanlarda %17)". Kıyas iki yatay çubuk olarak.
3. **Destek KPI'ları (4'lü, kompakt):** Yanıt oranı (hedef çizgili), medyan yanıt süresi, aksiyon kapanış sayısı + açık iş yükü, ortalama puan (dağılım mini-histogramı ile). Her kartta eş-dönem değişimi doğru birimle (pp / puan / %).
4. **Trend paneli:** Sekmeli tek grafik (Hacim & yanıt | Puan | Aksiyonlar), mutlak tarih ekseni, "Tabloyu göster" alternatifi.
5. **Kırılım tablosu:** QR noktası / personel bazında yanıt oranı, yanıt süresi, puan; sıralanabilir, satırdan filtreli geri bildirim listesine derin link.
6. **Sonraki en iyi adım:** Veriden türetilmiş 1–3 öneri kartı (yanıtlanmamış olumsuzlar, gecikmiş aksiyonlar), her biri tek tık aksiyon.

**Mobil:** Kahraman metrik tam genişlik; KPI'lar yatay kaydırılabilir kart şeridi (snap); trend grafiği sekmeli; kırılım tablosu kart listesine dönüşür; dönem seçici alt sayfa (sheet).

**Motion / 3D:** 3D gereksiz — bu bir karar panosu. Motion ölçülü: KPI'larda tek seferlik sayaç (framer `animate()`, `useReducedMotion` ile kapanır), dönem değişiminde grafik serilerinin 200 ms çapraz geçişi, kahraman metrikte geri dönüş oranı çubuklarının bir kez dolması. Kart başına kademeli gecikme yeterli; sürekli/tekrarlayan animasyon yok.

**Veri / API değişiklikleri:**
- `GET /api/dealer/roi?range=mtd|30d|90d|custom&from&to&compare=prev|yoy&groupBy=qr|staff` — yanıt şeması `{ period, compare, kpis, closedLoop: { repliedReturnRate, unrepliedReturnRate, attributedRevenue, isEstimated }, trend: [{ bucketStart, ... }], breakdown: [...], nextActions: [...] }`.
- Hesaplama `lib/roi-engine.ts` servisine taşınır (Server Component ve API aynı fonksiyonu çağırır); dönem/saat dilimi `lib/dealer-period.ts`'ten.
- Cache anahtarı `dealer-roi:{dealerId}:{range}:{compare}`; feedback yanıtı/aksiyon kapanışı olaylarında `redisDel` ile invalidation.
- `assertModuleEnabled('roi')` sunucu kapısı; i18n'siz etiketler API'den çıkarılır.
- Şema: `ActionItem @@index([dealerId, completedAt])`; isteğe bağlı bayi hedefleri için `DealerGoal { dealerId, metric, target, period }`.

---

## Çakışmalar / birleştirme önerisi

| Sayfa | Çakışan içerik | Kanıt |
|---|---|---|
| `/dealer` (dashboard) | Ortalama puan, aksiyon toplam/tamamlanan, haftalık puan trendi | `app/dealer/dealer-dashboard-client.tsx:249-259`, `274-280`, `321` |
| `/dealer/analytics` | Ortalama puan + değişim, yanıt oranı, dönem seçicili trend grafiği | `app/dealer/analytics/analytics-client.tsx:488`, `600-602`, `670` |
| `/dealer/business-outcomes` | "Gelir etkisi (proxy)", tekrar ziyaret, şikayet düşüşü — yani ROI'nin gerçekte vaat ettiği şey | `app/api/dealer/business-outcomes/route.ts:1-3`, `21-40` |
| `/dealer/growth-hub`, `/dealer/discover` | ROI'ye yalnız link | `app/dealer/growth-hub/page.tsx:13`, `app/dealer/discover/page.tsx:57` |

**Öneri:** `/dealer/roi` ile `/dealer/business-outcomes` **tek bir "Etki ve ROI" sayfasında birleştirilmeli**: business-outcomes'un tekrar ziyaret/gelir proxy'si + ROI'nin kapanan döngü metrikleri, yukarıdaki vizyondaki tek API ve servis üzerinden. Saf operasyon metrikleri (hacim, ortalama puan) `/dealer/analytics`'te kalmalı ve bu sayfada yalnızca bağlam olarak (küçük, tekrar etmeyen biçimde) yer almalı. `/dealer/roi` rotası yeni sayfaya yönlendirme (redirect) ile korunmalı; menüde (`sidebar.tsx:250`, `255`) tek giriş kalmalı; `module-controls` / `visibility-controls` anahtarları birleştirilmeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod değiştirilmedi, veritabanına dokunulmadı. Okunan dosyalar: `app/api/dealer/roi/route.ts`, `app/dealer/roi/page.tsx`, `components/dealer/roi-charts.tsx`, `app/api/dealer/action-items/[id]/route.ts`, `app/dealer/action-items/page.tsx`, `prisma/schema.prisma` (ActionItem), `messages/tr.json`.

### 1. Geri bildirim değişim rozeti yarım ayı tam önceki ayla kıyaslıyor — **DOĞRULANDI** (önem: orta; güvenlik değil, veri doğruluğu)

- `route.ts:39-40,45`: `thisMonthWhere` = ayın 1'i → ay sonu; ay henüz bitmediği için fiilen ayın 1'i → şimdi (ay-başından-bugüne, MTD).
- `route.ts:41-42,46`: `prevMonthWhere` = önceki ayın tamamı (1'i 00:00 → son gün 23:59:59).
- `route.ts:82`: `feedbackChange = feedbackTotal - prevFeedbackTotal` — ham adet farkı, gün sayısına normalize edilmiyor.
- `page.tsx:208` → `ChangeBadge` (`page.tsx:80-91`): negatifse kırmızı `TrendingDown` + "önceki aya göre" (`messages/tr.json:1497`).
- **Yeniden üretim:** Bayi önceki ay 150 geri bildirim almış, bu ay günlük tempo aynı (~5/gün). Ayın 8'inde panel açılınca `feedbackTotal≈40`, `prevFeedbackTotal=150` → rozet kırmızı "-110 önceki aya göre". Tempo değişmemişken düşüş gösteriliyor; ayın son günlerine kadar her ay sistematik olarak negatif.
- Not: Oran temelli rozetler (`replyRateChange`, `actionRateChange`, `ratingChange`) dönem uzunluğundan etkilenmez; sorun yalnız mutlak adet rozetinde. Ayrıca sınırlar `new Date(y, m, 1)` ile sunucu yerel saatinde (Vercel'de UTC) hesaplanıyor; TR (UTC+3) bayi için ay sınırı 3 saat kayık — ikincil.
- **Düzeltme yaklaşımı:** Karşılaştırmayı eş-dönem yap: `prevMonthWhere` için önceki ayın 1'i → önceki ayda aynı gün/saat (ay kısa ise son gün) kullan; ya da tam ay yerine "son 30 gün vs önceki 30 gün" kayan pencere. Rozet metnini dönemi açıkça söyleyecek şekilde güncelle ("geçen ayın aynı dönemine göre"); adet farkı yerine yüzde değişim göster. Dönem sınırları `lib/timezone` yardımcılarıyla Europe/Istanbul'a göre hesaplanmalı.

### 2. Haftalık "aksiyon tamamlanan" serisi completedAt yerine createdAt'e göre kovalanıyor — **DOĞRULANDI** (önem: orta)

- `route.ts:114-123`: `WHERE "status"='done' AND "createdAt" BETWEEN …` ve `date_trunc('week', "createdAt")`.
- `prisma/schema.prisma:1311`: `ActionItem.completedAt DateTime?` mevcut ve dolduruluyor: `app/dealer/action-items/page.tsx:121` durum `done` yapılırken `completedAt: new Date().toISOString()` gönderiyor, `app/api/dealer/action-items/[id]/route.ts:53-55` yazıyor. Yani doğru alan veri olarak var, rapor onu kullanmıyor.
- `components/dealer/roi-charts.tsx:72,77`: seri lejantta "Aksiyon tamamlanan" diye etiketleniyor — kullanıcı "o hafta tamamlanan" diye okuyor.
- **Yeniden üretim:** Bayi 5 hafta önce oluşturulmuş 4 aksiyonu bu hafta `done` yapar. Grafikte bu haftanın "Aksiyon tamamlanan" değeri 0 kalır, 4 adet 5 hafta önceki kovaya yazılır; 6 haftalık pencereden eski oluşturulmuşlar (ör. 8 hafta önce) hiç görünmez. Son haftalar yapısal olarak düşük görünür.
- Alt iddia (KPI): `route.ts:62-63,67-68` tamamlama oranı yalnız ilgili ayda **oluşturulan** kohortu sayıyor ve payda `status` filtresiz olduğundan `cancelled` dahil — doğru. Kohort mantığı kendi başına savunulabilir bir tanım olabilir, ancak kart etiketi ("Aksiyon tamamlama", `page.tsx:248`) bunu söylemiyor; geçen ay oluşturulup bu ay kapatılan işler hiçbir aya "tamamlandı" olarak yansımıyor; iptaller oranı aşağı çekiyor. Bu kısım tanım/etiket tutarsızlığı olarak doğrulandı.
- **Düzeltme yaklaşımı:** Haftalık sorguyu `"completedAt"` üzerinden filtrele ve kovala (`status='done' AND "completedAt" IS NOT NULL`); eski kayıtlar için `completedAt IS NULL AND status='done'` olanlara `updatedAt` geri dönüşü (COALESCE) uygulanabilir. KPI'yı ikiye ayır: "Bu ay kapatılan aksiyon" (completedAt ∈ dönem) ve "Açık iş yükü"; oran gösterilecekse paydadan `cancelled` çıkarılmalı ve tanım kart alt metninde açıkça yazılmalı. Performans için `ActionItem @@index([dealerId, completedAt])` eklenmeli (vizyon bölümündeki öneriyle uyumlu).

**Genel not:** İki bulgu da gerçek ve kullanıcıya yanlış karar sinyali veriyor; ancak veri sızıntısı/yetki sorunu içermedikleri için "KRİTİK" değil, "YÜKSEK/ORTA" veri doğruluğu hatası olarak sınıflanmalı.

---

## Uygulama (Dalga 2)

**Yeni rota:** `/dealer/analytics/impact` (Analitik › Etki). ROI ve İş sonuçları tek ekranda birleşti. `/dealer/roi` sorgu parametrelerini koruyarak kalıcı olarak yönlendiriliyor; `layout.tsx`, `/api/dealer/roi` ve `components/dealer/roi-charts.tsx` silindi. BFF: `GET /api/dealer/analytics/impact` (`defineRoute`; DEALER + ADMIN salt-okunur, modül `roi`, zod dönem şeması) ve `PUT /api/dealer/analytics/impact/settings` (varsayımlar + hedefler, sıkı zod). Hesap: `lib/dealer-impact/{core,load,types}.ts`; testi `__tests__/lib/b-kiyas-etki/impact-core.test.ts`.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1–2 | Erişim + API yetkisi | ÇALIŞIYOR | `requireAuth` + `tenant: 'dealer'`. |
| 3 | Modül kapısı | ÇALIŞIYOR | API'de `module: 'roi'`, sayfada `moduleDisabled` ekranı. |
| 4 | Metadata | ÇALIŞIYOR | Etki ekranı vaadini karşılıyor; getiri ve dışa aktarma gerçek. |
| 5 | Hero | ÇALIŞIYOR | Başlık "Etki". Kahraman metrik kapanan döngünün tahmini ek cirosu ("Tahmini" rozetli). |
| 6–7 | Hero linkleri | KALDIRILDI | "Şimdi ne yapmalı?" kartı gerçek iş yüküne derin link veriyor. |
| 8 | Yükleniyor | ÇALIŞIYOR | SSR + iskelet; CLS yok. |
| 9 | Hata durumu | ÇALIŞIYOR | `QueryState` + tekrar dene. |
| 10 | Boş durum | ÇALIŞIYOR | `hasAnyData=false` → kurulum boş durumu; sıfırlarla dolu kart yok. |
| 11 | Geri bildirim sayısı KPI | ÇALIŞIYOR | Eğilim grafiğinde ve CSV'de; İstanbul günü, `[from, to)`. |
| 12 | "{count} yanıtlandı" | ÇALIŞIYOR | Yanıt oranı kartı ve n. |
| 13 | Değişim rozeti (kısmi ay) | ÇALIŞIYOR | Eşit uzunlukta önceki dönem ya da geçen yıl; yarım ay kıyası yok (Bulgu 1). |
| 14 | Yanıt oranı | ÇALIŞIYOR | Hedef satırıyla birlikte. |
| 15 | Yanıt oranı değişimi | ÇALIŞIYOR | Yüzde puanı (`points`); iki dönemde de en az 10 kayıt gerekiyor. |
| 16–18 | Aksiyon tamamlama | ÇALIŞIYOR | "Kapanan aksiyon" tamamlanma tarihine göre; açık iş yükü ve gecikmiş sayısı da gösteriliyor. |
| 19 | Ortalama puan | ÇALIŞIYOR | Eğilimde "Puan" sekmesi. |
| 20 | Tekrarlayan alt metin | KALDIRILDI | Bilgi katmıyordu. |
| 21 | Puan değişimi | ÇALIŞIYOR | |
| 22 | AnimatedNumber | KALDIRILDI | Yerine `MetricTile` (hareket politikasına uyan tek seferlik sayaç). |
| 23 | Kart animasyonları | ÇALIŞIYOR | Kapanan döngü çubukları bir kez doluyor; azaltılmış harekette anında. |
| 24 | Haftalık hacim/yanıt | ÇALIŞIYOR | İstanbul saatine göre Pazartesi kovaları. |
| 25 | Aksiyon serisi | ÇALIŞIYOR | `completedAt`'e göre kovalanıyor (Bulgu 2). |
| 26 | Ortalama puan çizgisi | ÇALIŞIYOR | Boş hafta boşluk olarak kalıyor. |
| 27 | Hafta etiketleri | ÇALIŞIYOR | Mutlak tarih ("Hafta: 6 Eki 2026"). |
| 28 | Grafik dili | ÇALIŞIYOR | TR/EN kopya; API metin üretmiyor. |
| 29 | 7 gün bar grafiği | KALDIRILDI | Dönem seçici ve haftalık eğilim aynı soruyu doğru saat dilimiyle cevaplıyor. |
| 30 | Koşullu gösterim | ÇALIŞIYOR | Boş durum gerçek veriye bağlı. |
| 31 | Code-split | ÇALIŞIYOR | `lazyChart`. |
| 32 | "ROI nasıl artar?" | KALDIRILDI | Yerini veriden türetilen sonraki adımlar ve gerçek hedefler aldı. |
| 33 | İç içe CTA | ÇALIŞIYOR | `asChild`. |
| 34 | Redis cache | ÇALIŞIYOR | 120 sn. Anahtar ayar sürümünü içeriyor; ayar kaydedilince tazeleniyor. |
| 35 | ADMIN `?dealerId` | ÇALIŞIYOR | BFF'te salt-okunur; ayarları yalnız DEALER yazabiliyor. |
| 36 | Parasal ROI | ÇALIŞIYOR | Kapanan döngü: yanıtlanan ve yanıtlanmayan şikâyetçilerin geri dönüş farkı × ortalama sepet. Yöntem açık, "deney değil" uyarısı var. |
| 37 | Dönem seçimi | ÇALIŞIYOR | 7/30/90 gün, bu ay, geçen ay, bu yıl, özel. Karşılaştırma: önceki dönem / geçen yıl / yok. |
| 38 | Dışa aktarım | ÇALIŞIYOR | CSV (KPI + kapanan döngü + haftalık seri). |
| 39 | Şube kırılımı | ÇALIŞIYOR | En az 2 şubede tablo. Personel kırılımı yok: şemada yanıtlayan kişi kaydı tutulmuyor. |
| 40 | Yenile / son güncelleme | ÇALIŞIYOR | `fresh=1` + "Hesaplandı". |
| 41 | Hata toast metni | ÇALIŞIYOR | `admin-toast` kullanılmıyor; hata satır içinde. |
| 42 | Mobil | ÇALIŞIYOR | Tek kolon, ≥ 44px dokunma hedefleri, yatay kaydırılabilir tablolar. |
| 43 | Grafik alternatifi | ÇALIŞIYOR | `ChartFrame` tablo görünümü. |
| 44 | Otomatik test | ÇALIŞIYOR | Saf çekirdeğin jest testi var (dönem, kohort, KPI, hedef, trend). |

**Kapanan bulgular:** 1–13 (13/13). Tek açık nokta: Bulgu 11'deki `ActionItem` bileşik indeksi, şema dondurulduğu için eklenemedi (ŞEMA İSTEĞİ: `@@index([dealerId, completedAt])`).

**Eksik özelliklerden uygulananlar:**
- gerçek getiri atfı (kapanan döngü)
- dönem seçici ve eş-dönem karşılaştırma
- şube kırılımı
- medyan yanıt süresi
- hedefler (kayıtlı; kartlarda tuttu/tutmadı)
- CSV

**Kalanlar:**
- **Eşik altı bildirim / e-posta özeti:** bildirim altyapısı başka bir yüzeyde.
- **Personel kırılımı:** şemada yanıtlayan kişi tutulmuyor.
