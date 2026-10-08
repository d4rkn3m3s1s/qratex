# /dealer

**Amaç:** Bayi/işletme sahibinin panele girdiği ilk ekran: genel performans özeti (KPI), son 24 saatin brifingi, yapılacaklar, grafikler, son geri bildirimler ve QR kodlarının kısa özeti; ayrıntılı sayfalara (analitik, geri bildirimler, telafi kuyruğu, QR) yönlendiren "ana pano".

**Genel puan: 5/10** · **Karar: yeniden tasarla** (veri katmanı korunur ama düzeltilir; bilgi mimarisi "ne olmuş?" panosundan "bugün ne yapmalıyım?" panosuna çevrilir)

Dosyalar: `app/dealer/page.tsx`, `app/dealer/layout.tsx`, `app/dealer/loading.tsx`, `app/dealer/error.tsx`, `app/dealer/dealer-dashboard-client.tsx` (1030 satır), `app/dealer/components/dealer-helpers.tsx`, `app/dealer/types.ts`, `components/dealer/getting-started-card.tsx`, `components/charts/*`, `components/admin/admin-premium-hero.tsx` (DashboardPageHero), API: `app/api/dealer/stats`, `app/api/dealer/morning-briefing`, `app/api/dealer/next-best-actions` (+ `lib/next-best-action.ts`), `app/api/dealer/benchmark`, `app/api/dealer/dashboard-layout`, `app/api/dealer/offline-sync`, `app/api/user/profile`.

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Çekirdek KPI/grafikler çalışıyor; ancak benchmark widget'ı hiç görünmüyor, "Son 30 gün" kartı tüm zamanların toplamını gösteriyor, haftalık ortalama puan ve puan dağılımı yanlış/yanıltıcı hesaplanıyor. |
| UX | 5/10 | Bilgi çok ama öncelik yok: aynı metrik 2–3 kez, "Detaylı analitik" linki 4 kez; son geri bildirimler tıklanamıyor/yanıtlanamıyor; acil iş akışı (düşük puana yanıt) panodan başlatılamıyor. |
| Görsel | 6/10 | Ortak `DashboardPageHero` dili ve kart sistemi tutarlı; fakat her kartta hover-scale/rotate, sonsuz dönen ikonlar ve 10+ farklı gecikmeli giriş animasyonu "kalabalık" bir his veriyor. |
| Mimari | 4/10 | 1030 satırlık tek client bileşeni, 7 ayrı fetch, sunucu ile istemci arasında tutarsız widget listesi, hata durumunda `success:true` + sıfır dönen API, TR sabit metinlerin API'de üretilmesi. |
| Performans | 5/10 | Stats Redis cache'li ve ikincil sorgular ertelenmiş (iyi), ama stats ucu kullanılmayan veriyi (250 QR satırı, `recentConsumptions`) çekiyor, görünmeyen benchmark widget'ı için platform çapında 25k satırlık ağır sorgu tetikleniyor. |
| Erişilebilirlik + mobil | 5/10 | Skip-link, odak halkası ve OS reduced-motion (MotionConfig) var; sekmelerde ARIA yok, grafiklerin metin alternatifi yok, AnimatedCounter ve uygulama içi "animasyonları azalt" tercihi framer/JS animasyonlarını durdurmuyor, mobilde "Kart Tara" kısa yolu gizli. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama, i18n) | ÇALIŞIYOR | `app/dealer/page.tsx:5-7`, `app/dealer/layout.tsx:13-24` | |
| 2 | Rol kapısı (yalnız DEALER) | ÇALIŞIYOR | `proxy.ts:50-73` (`'/dealer': 'DEALER'`), `app/api/dealer/stats/route.ts:30` | Personel (STAFF) ayrı panelde; bayi hesabı tek kullanıcılı. |
| 3 | Sidebar + header arama + skip-link | ÇALIŞIYOR | `app/dealer/layout.tsx:31-37` | Paylaşılan layout; bu sayfaya özgü değil. |
| 4 | Onboarding sheet + gate banner | ÇALIŞIYOR | `app/dealer/layout.tsx:44,48` | GettingStartedCard ile kısmen mükerrer (bkz. #16). |
| 5 | Gerçek zamanlı bildirim toast'ları | KISMİ | `app/dealer/layout.tsx:50`, `components/dashboard/realtime-notifications.tsx` | Yalnızca toast; pano verisini tazelemiyor (60 sn polling'e kalıyor). |
| 6 | Route seviyesinde loading (dashboard iskeleti) | ÇALIŞIYOR | `app/dealer/loading.tsx:1` | |
| 7 | Route hata sınırı (Sentry + tekrar dene) | ÇALIŞIYOR | `app/dealer/error.tsx:31-36` | |
| 8 | İstemci iskelet (stats yüklenirken) | ÇALIŞIYOR | `dealer-dashboard-client.tsx:217-234` | |
| 9 | Stats hata durumu + "Yenile" | KISMİ | `dealer-dashboard-client.tsx:236-245` | API çoğu hatada `success:true` + sıfır döndüğü için bu ekran nadiren görünür (Bulgu 4). `res.json()` HTML yanıtta ham "Unexpected token" mesajı gösterir. |
| 10 | Stats 60 sn otomatik yenileme | ÇALIŞIYOR | `dealer-dashboard-client.tsx:88-89`, route Redis 45 sn `stats/route.ts:465` | Her yenilemede AnimatedCounter 0'dan yeniden sayar (titreme). |
| 11 | İkincil sorguları 150 ms erteleme | ÇALIŞIYOR | `dealer-dashboard-client.tsx:69-73,113,126,138,174` | |
| 12 | Kişisel selamlama (saat dilimine göre) | ÇALIŞIYOR | `dealer-dashboard-client.tsx:203-208,366` | |
| 13 | Performans halkası + seviye | KISMİ | `dealer-dashboard-client.tsx:374-377`, `stats/route.ts:370-380` | Seviye metni API'de sabit Türkçe ("Mükemmel"); EN kullanıcıda TR görünür. Skorun formülü kullanıcıya açıklanmıyor. |
| 14 | "Yeni QR kodu" CTA | ÇALIŞIYOR | `dealer-dashboard-client.tsx:381-383` | |
| 15 | "Kart Tara" CTA | KISMİ | `dealer-dashboard-client.tsx:384-391` | `hidden sm:inline-flex` → kasada en çok kullanılan cihaz olan telefonda görünmüyor. |
| 16 | Başlangıç kontrol listesi (QR / konum / ilk geri bildirim) | KISMİ | `dealer-dashboard-client.tsx:330-358,397-403`, `components/dealer/getting-started-card.tsx:37-39` | 1. ve 3. adım aynı sayfaya gider; stats API hata fallback'inde (sıfırlar) yerleşik bayiye de görünür. Kapatılamaz/ertelenemez. |
| 17 | Çevrimdışı kuyruk uyarısı + "Şimdi senkronize et" | SAHTE (ölü) | `dealer-dashboard-client.tsx:104-115,292-304,407-415` | Kod tabanında `/api/dealer/offline-sync`'e POST eden hiçbir istemci yok (grep: yalnız bu sayfa GET/PATCH yapıyor) → banner pratikte hiç görünmez. Sunucu tarafında güvenlik açığı var (Bulgu 1). |
| 18 | "Yapılacaklar" (next-best-actions) çipleri | KISMİ | `dealer-dashboard-client.tsx:117-128,416-425`, `lib/next-best-action.ts:23-80` | Etiketler sabit TR; `negativeCount` tüm zamanlar olduğundan "telafi gönder" önerisi bir kez negatif gelince sonsuza kadar kalır; `lowestRatedQrId` hesaplanıp kullanılmıyor; `?tab=qr` parametresini feedbacks sayfası okumuyor. |
| 19 | Konum ekle uyarısı | ÇALIŞIYOR (mükerrer) | `dealer-dashboard-client.tsx:426-432` | Aynı mesaj GettingStartedCard'da da var (#16). |
| 20 | 24 saatlik brifing satırı | ÇALIŞIYOR | `dealer-dashboard-client.tsx:433-453`, `morning-briefing/route.ts:37-77` | Yalnız QR `Feedback` sayar, `ConsumptionReview` yok → KPI'larla tutarsız. Tüm sayılar 0 olsa bile her zaman görünür. |
| 21 | Brifing "öne çıkanlar" listesi | KISMİ | `dealer-dashboard-client.tsx:454-460`, `morning-briefing/route.ts:91-106` | Sabit TR metin; brifing satırındaki sayıları birebir tekrar ediyor; `key={h}` metne bağlı. |
| 22 | Önerilen playbook kartı | KISMİ | `dealer-dashboard-client.tsx:461-471`, `morning-briefing/route.ts:108-124` | Başlık/etiket sabit TR; "playbook" sadece bir link — gerçek adım/şablon yok. |
| 23 | Acil (≤2★) geri bildirim listesi | KISMİ | `dealer-dashboard-client.tsx:472-488`, `morning-briefing/route.ts:79-91` | Her öğe genel `/dealer/feedbacks`'e gider; ilgili kayda derin link, hızlı yanıt veya telafi aksiyonu yok. |
| 24 | Brifing CTA'ları (telafi kuyruğu / geri bildirimler) | ÇALIŞIYOR | `dealer-dashboard-client.tsx:491-500` | |
| 25 | Widget düzeni (sunucudan sıra/görünürlük) | KISMİ | `dealer-dashboard-client.tsx:178-197,505`, `dashboard-layout/route.ts:22-49` | Sunucu listesi ile istemci varsayılanı farklı (benchmark yok). Varsayılan → sunucu düzenine geçişte yerleşim kayması. Ayarlarda kaydedince bu sorgu invalidate edilmiyor (5 dk stale). |
| 26 | KPI: Toplam geri bildirim + değişim + sparkline | KISMİ | `dealer-dashboard-client.tsx:320`, `stats/route.ts:248,258-263` | Değer tüm zamanlar, değişim 30g/30g, sparkline 7 gün — tek kartta üç farklı zaman penceresi, etiketlenmemiş. |
| 27 | KPI: Ortalama puan + puan değişimi + sparkline | KISMİ | `dealer-dashboard-client.tsx:321`, `stats/route.ts:265-274` | Sparkline'da geri bildirimsiz günler 0 olarak çiziliyor → sahte çöküşler. Ondalık ayırıcı TR'de "." (4.3). |
| 28 | KPI: Toplam tarama | ÇALIŞIYOR | `dealer-dashboard-client.tsx:322`, `stats/route.ts:169` | |
| 29 | KPI: Aktif QR / toplam | ÇALIŞIYOR | `dealer-dashboard-client.tsx:323` | |
| 30 | KPI: Dönüşüm oranı | KISMİ | `dealer-dashboard-client.tsx:324`, `stats/route.ts:433` | Paya tarama gerektirmeyen tüketim yorumları da giriyor → %100'ü aşabilir. #49 ile aynı metrik. |
| 31 | KPI: Aksiyon tamamlama (bu ay) | KISMİ | `dealer-dashboard-client.tsx:326-328`, `stats/route.ts:414-419` | API her zaman sayı döndürdüğü için koşul hep doğru; aksiyon yoksa "%0" gösterir. "Bu ay" sunucu saatine (UTC) göre; etikette dönem yok. |
| 32 | Sayaç animasyonu (AnimatedCounter) | KISMİ | `dealer-helpers.tsx:30-44` | Reduced-motion'a uymaz; binlik ayırıcı yok; her refetch'te 0'dan başlar. |
| 33 | Haftalık karşılaştırma kartı (bu hafta / geçen hafta / %) | KISMİ | `dealer-dashboard-client.tsx:543-591`, `stats/route.ts:432,313-325` | "Bu hafta" = kayan 168 saat; "geçen hafta" = UTC takvim günleri 7–13 → farklı pencereler karşılaştırılıyor. |
| 34 | Haftalık geri bildirim bar grafiği | ÇALIŞIYOR | `dealer-dashboard-client.tsx:593-625`, `stats/route.ts:300-311` | Gün etiketleri `tr-TR` sabit (`stats/route.ts:307`) → EN'de Türkçe gün adları. Günler UTC (TR'de 00:00–03:00 arası bir önceki güne yazılır). |
| 35 | Duygu dağılımı donut | KISMİ | `dealer-dashboard-client.tsx:626-649`, `stats/route.ts:276-296` | `sentiment` null olan (henüz analiz edilmemiş) geri bildirimler "nötr" sayılıyor → nötr şişer. |
| 36 | Haftalık ortalama puan trendi (area) | BOZUK | `dealer-dashboard-client.tsx:280,653-679`, `stats/route.ts:309` | Boş günler 0★ çiziliyor; trend okuması anlamsızlaşır. |
| 37 | Puan dağılımı (1–5★ barlar) | BOZUK (yanıltıcı) | `dealer-dashboard-client.tsx:286-290,695-699`, `stats/route.ts:410` | Yalnızca son **5** kayıttan hesaplanıyor; yüzdeler 20'nin katları. "Puan dağılımı" başlığıyla gösterilmesi yanıltıcı. |
| 38 | Son aktivite sekmeleri (Geri bildirim / QR) | KISMİ | `dealer-dashboard-client.tsx:716-731` | `role="tab"`, `aria-selected`, ok tuşu gezinmesi yok; `type="button"` yok. |
| 39 | Son geri bildirim listesi | KISMİ | `dealer-dashboard-client.tsx:739-786`, `stats/route.ts:396-410` | Tıklanamaz (`cursor-default`), yanıt/telafi yok; tüketim yorumlarında `qrName` olmadığı için QR ikonunun yanı boş kalır (Bulgu 7). |
| 40 | Geri bildirim boş durumu | ÇALIŞIYOR | `dealer-dashboard-client.tsx:741-746` | |
| 41 | QR kodları (ilk 6, tarama/geri bildirim/puan) | KISMİ | `dealer-dashboard-client.tsx:788-828`, `stats/route.ts:352-367` | Kart tıklanamaz (QR detayına/indirmeye gitmez); aktif/pasif nokta yalnız renkle anlatılıyor (erişilebilirlik). |
| 42 | QR boş durumu + "İlk QR'ı oluştur" | ÇALIŞIYOR | `dealer-dashboard-client.tsx:789-794` | |
| 43 | "Tümünü gör" (sekmeye göre) | ÇALIŞIYOR | `dealer-dashboard-client.tsx:732-734` | |
| 44 | Analitik özeti: "Bu hafta ortalama puan" | BOZUK | `dealer-dashboard-client.tsx:274,849-857` | Günlük ortalamaların basit ortalaması, boş günler 0 dahil → 1 gün 5★ + 6 boş gün = 0.7/5. |
| 45 | Analitik özeti: Baskın duygu | KISMİ | `dealer-dashboard-client.tsx:211-215,867-874` | #35'teki null→nötr sorunu buraya da taşınır. |
| 46 | Analitik özeti: "Son 30 gün özeti" | BOZUK | `dealer-dashboard-client.tsx:882-891`, `messages/tr.json` `summary30dTitle` | Değer `stats.totalFeedbacks` = tüm zamanlar; başlık "Son 30 gün". |
| 47 | Ek veri: Günlük ortalama | ÇALIŞIYOR | `dealer-dashboard-client.tsx:275,913-914` | Kayan 7 gün / 7. |
| 48 | Ek veri: En iyi gün | ÇALIŞIYOR | `dealer-dashboard-client.tsx:276,921-923` | Beraberlikte ilk gün seçilir; düşük değerli bilgi. |
| 49 | Ek veri: Tarama → geri bildirim | KISMİ (mükerrer) | `dealer-dashboard-client.tsx:277,930-931` | #30 Dönüşüm oranıyla birebir aynı hesap. |
| 50 | Ek veri: Tüketim kartı / "Daha fazla içgörü" | ÇALIŞIYOR | `dealer-dashboard-client.tsx:935-957` | API `consumptionStats`'ı her zaman döndürdüğü için "Daha fazla içgörü" dalı pratikte ölü. |
| 51 | Benchmark (siz vs platform, yüzdelik) widget'ı | BOZUK | `dealer-dashboard-client.tsx:961-1010`, `dashboard-layout/route.ts:22-30,43-49` | Sunucu widget listesinde `benchmark-comparison` yok → hiç render edilmez; yine de ağır benchmark isteği atılır. Yüzdelik metni ters (Bulgu 9). |
| 52 | Alt "Tüm analitik raporlar" butonu | ÇALIŞIYOR (mükerrer) | `dealer-dashboard-client.tsx:1016-1026` | `/dealer/analytics` linki sayfada 4 kez (621, 894, 952, 1019). |
| 53 | Giriş/hover animasyonları | KISMİ | `dealer-dashboard-client.tsx:507-513,855,870` vb. | OS reduced-motion `MotionConfig reducedMotion="user"` ile transform'lar kapanır (`components/providers.tsx:232`); uygulama içi "animasyonları azalt" (`app/globals.css:824-831`) yalnız CSS'i etkiler, framer döngülerini durdurmaz. |
| 54 | Avatar görseli | ÇALIŞIYOR | `dealer-dashboard-client.tsx:758-762` | `unoptimized`; harici URL'ler CSP'ye bağlı (doğrulanmadı). |
| 55 | Göreli zaman (TR/EN) | ÇALIŞIYOR | `dealer-dashboard-client.tsx:780` | |
| 56 | Dönem seçici (bugün/7g/30g/özel) | EKSİK | — | Tüm metrikler sabit ve karışık pencerelerde. |
| 57 | Lokasyon/şube veya QR filtresi | EKSİK | — | Çok noktalı işletmede kırılım yok. |
| 58 | Panodan hızlı yanıt / telafi | EKSİK | — | Acil geri bildirime 1 tıkla yanıt yok. |
| 59 | Dışa aktarma / paylaşılabilir özet | EKSİK | — | |
| 60 | Hedef/eşik ve uyarı ayarı (ör. ort. puan < 4) | EKSİK | — | |
| 61 | Yanıt oranı / ilk yanıt süresi KPI'ı | EKSİK | — | Veri var (`dealerRepliedAt`, `benchmark/route.ts:65`) ama panoda yok. |

**Sayım:** ÇALIŞIYOR 25 · KISMİ 24 · BOZUK 5 · SAHTE 1 · EKSİK 6 (toplam 61)

---

## Bulgular

### 1. Çevrimdışı senkron ucu, tüketim oluşturmanın tüm güvenlik kontrollerini atlıyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü (puan ekonomisi)
- **Kanıt:** `app/api/dealer/offline-sync/route.ts:136-145` (PATCH, kuyruktaki kaydın değil istemcinin gönderdiği `item.action` ve `item.payload`'ını işliyor), `:197-224` (`processConsumption`), `:228-249` (`processScan`); karşılaştırma `app/api/dealer/consumptions/route.ts:185-236` (oran sınırı, ürün sahipliği, audit log, müşteri bildirimi).
- **Sorun:** Bayi `POST /api/dealer/offline-sync` ile istediği kadar kuyruk öğesi oluşturup `PATCH` ile işletebilir. `processConsumption`: (a) `checkRateLimitDb('consumption:…')` yok, (b) `productId` başka bayiye ait olabilir (sahiplik kontrolü yok), (c) `cardAuditLog` yazılmıyor, (d) müşteri bildirimi yok. Her tüketim müşteriye `ConsumptionReview` hakkı açıyor; bu yorum puan veriyor (`app/api/customer/consumptions/[id]/review/route.ts:163-204`, günlük cap'li) ve karakter rozeti yalnız ConsumptionReview sayıyor → bayi–müşteri iş birliğiyle rozet/puan ilerlemesi şişirilebilir. Ayrıca PATCH, DB'deki `payload` yerine istemci payload'ına güveniyor ve istemci `retries` göndermediği için (`dealer-dashboard-client.tsx:109`) `DEAD` durumu hiç atanmıyor (`offline-sync/route.ts:150-151`). `processScan` herhangi bir kart token'ı için müşterinin e-postasını döndürüyor. Kuyruğa yazan hiçbir istemci kodu yok — yani bu yüzey yalnızca saldırı yüzeyi.
- **Öneri:** Kısa vadede: `offline-sync` POST/PATCH'i kapat (özellik ölü) ya da PATCH'te yalnız DB'deki `owned.action/payload`'ı işle ve `processConsumption`'ı `consumptions` POST'undaki ortak servis fonksiyonuna (oran sınırı + ürün sahipliği + BLOCKED kontrolü + audit + bildirim) delege et. Uzun vadede gerçek çevrimdışı ihtiyaç varsa (kasada internet kopması) bunu PWA tarafında Background Sync + idempotency key (`clientMutationId` unique) ile `/api/dealer/consumptions`'a yeniden oynatma şeklinde kur; ayrı bir "kuyruk" tablosu ve ikinci iş mantığı tutma. `processScan`'ı kaldır.
- **Efor:** M

### 2. Benchmark widget'ı hiçbir zaman görünmüyor, ama ağır sorgusu her açılışta çalışıyor
- **Önem:** yüksek · **Kategori:** bozuk özellik / performans
- **Kanıt:** `app/api/dealer/dashboard-layout/route.ts:22-30` (`DEFAULT_WIDGETS`'te `benchmark-comparison` yok), `:43-49` (yanıt yalnız `DEFAULT_WIDGETS` üzerinden map'leniyor → kayıtlı olsa bile düşer); `dealer-dashboard-client.tsx:188-197` (istemci varsayılanında var), `:505` (sunucu listesi geldiğinde istemci varsayılanı tamamen değişir), `:130-140` (benchmark yine de çekiliyor); `app/api/dealer/benchmark/route.ts:96-100` (25.000 satır tarama), `:141-205` (11 tur ardışık agregasyon), `:31` (dakikada 12 istek limiti — `/dealer/benchmark` sayfasıyla paylaşılıyor).
- **Sorun:** Widget kalıcı olarak ölü; ayarlar sayfası da aynı listeyi kullandığı için kullanıcı açamıyor. Her pano açılışında (5 dk staleTime) platform çapında pahalı bir hesap yapılıyor ve benchmark sayfasının oran limiti boşuna tüketiliyor.
- **Öneri:** Widget kayıt defterini tek kaynağa taşı (`lib/dealer-dashboard-widgets.ts`: id, i18n label key, varsayılan sıra, gereken veri kaynağı). Hem API hem istemci hem ayarlar sayfası bunu import etsin. Benchmark sorgusunu `enabled: isVisible('benchmark-comparison')` ile koşullu yap. Platform ortalaması/yüzdelik dağılımını istek anında değil, günlük cron ile önceden hesaplanmış bir `DealerBenchmarkSnapshot` tablosundan oku (zaten cron altyapısı mevcut).
- **Efor:** M

### 3. "Son 30 gün özeti" kartı tüm zamanların toplamını gösteriyor
- **Önem:** yüksek · **Kategori:** yanlış veri
- **Kanıt:** `dealer-dashboard-client.tsx:882-891` (`summary30dTitle` + `stats.totalFeedbacks`), `app/api/dealer/stats/route.ts:248` (`totalFeedbacks = qrFbCount + crRevCount`, tarih filtresi yok), `:256` (`currentPeriodLen` = gerçek 30 gün sayısı hesaplanıyor ama döndürülmüyor).
- **Sorun:** Bayi "son 30 günde 1.240 geri bildirim (+%12)" okur; oysa 1.240 tüm zamanların sayısı, +%12 ise 30g/30g. Karar verdiren bir rakam yanlış.
- **Öneri:** API'ye `last30Feedbacks` ve `prev30Feedbacks` alanlarını ekle ve kart bunları göstersin. Genel ilke: her KPI yanıtında `{ value, compareValue, period }` üçlüsü dönsün; kartta dönem etiketi zorunlu olsun (Bulgu 8 ile birlikte).
- **Efor:** S

### 4. Stats API hata durumunda `success:true` + sıfırlar döndürüyor
- **Önem:** yüksek · **Kategori:** hata yönetimi / yanlış veri
- **Kanıt:** `app/api/dealer/stats/route.ts:467-503` (yalnız "DB erişilemez" sınıfı 503 dönüyor; diğer tüm hatalarda 200 + `success:true` + sıfır payload), `dealer-dashboard-client.tsx:85` (yalnız `success:false`'u hata sayıyor), `:333-358` (sıfırlarla GettingStartedCard "ilk QR'ını oluştur" gösterir).
- **Sorun:** Bir sorgu hatası (ör. şema uyumsuzluğu, timeout) yerleşik bir bayiye "hiç verin yok, başlayalım" ekranı gösterir; hata Sentry'ye de gitmez (sadece `console.error`). Kullanıcı panik yapar, destek yükü artar ve sorun görünmez kalır.
- **Öneri:** Fallback'i kaldır: 500 + `{ success:false, error, code }` dön, `Sentry.captureException` ekle. İstemcide son başarılı veriyi (`placeholderData: keepPreviousData`) gösterip üstte "Veriler güncellenemedi · Tekrar dene" şeridi göster. `useSoftDelete` yoklama sorgusunu (`:51-56`) ve iki kopya SQL dalını (`:62-100`) da sil — şema artık `deletedAt` içeriyor.
- **Efor:** S

### 5. Haftalık ortalama puan ve puan trendi boş günleri 0★ sayıyor
- **Önem:** orta · **Kategori:** yanlış veri
- **Kanıt:** `dealer-dashboard-client.tsx:274` (`weeklyAvgRating` = günlük ortalamaların basit ortalaması), `:280` ve `:321` (area grafik + sparkline 0 değerleri), `app/api/dealer/stats/route.ts:309` (`cnt=0` → `avgRating: 0`).
- **Sorun:** Tek bir 5★ ve 6 boş gün → "Bu hafta ortalama puan 0.7/5". Trend grafiği her sessiz günde çöküş gösterir; gerçekte bozulma yokken alarm hissi yaratır.
- **Öneri:** API haftalık ağırlıklı ortalamayı (`SUM(rating)/COUNT(*)`) ayrı alan olarak döndürsün; günlük seride boş günler `null` olsun ve grafik `connectNulls`/boşluk ile çizilsin. Düşük örneklemde (n<5) değerin yanında "az veri" rozeti göster.
- **Efor:** S

### 6. "Puan dağılımı" yalnız son 5 kayıttan hesaplanıyor
- **Önem:** orta · **Kategori:** yanıltıcı veri
- **Kanıt:** `dealer-dashboard-client.tsx:286-290` (`recentFeedbacks` üzerinden), `app/api/dealer/stats/route.ts:410` (`.slice(0, 5)`).
- **Sorun:** Yüzdeler yalnızca 0/20/40/60/80/100 olabilir; istatistiksel anlamı yok ama grafik "dağılım" diye sunuluyor.
- **Öneri:** API'de `groupBy({ by:['rating'] })` (Feedback + ConsumptionReview, seçili dönem) ile gerçek dağılımı döndür. Kartı NPS/CSAT tarzı "promoter / passive / detractor" bölünmesine çevirmek kıyas ürünlerle (Medallia, Qualtrics) daha uyumlu olur.
- **Efor:** S

### 7. Tüketim yorumları son aktivite listesinde bozuk görünüyor
- **Önem:** orta · **Kategori:** hata
- **Kanıt:** `app/api/dealer/stats/route.ts:383-393` (tüketim yorumları `productName` taşıyor, `qrName` yok), `dealer-dashboard-client.tsx:779` (`fb.qrName` koşulsuz render), `app/dealer/types.ts:23-32` (tip `qrName: string` diyor — tip yalan söylüyor).
- **Sorun:** Tüketim yorumlarında QR ikonu yanında boş metin; kullanıcı hangi ürün/nokta olduğunu göremez. Ayrıca `type` alanı istemciye gelip kullanılmıyor.
- **Öneri:** Yanıtı ayrımlı birleşim tipine çevir (`{ source:'qr', qrName } | { source:'consumption', productName }`), satırda kaynak ikonunu (QR / ürün) buna göre seç. `types.ts`'i API'den türet (zod şeması + `z.infer`) ki sözleşme kırılmasın.
- **Efor:** S

### 8. KPI'lar karışık zaman pencereleri kullanıyor; aynı metrik iki kez gösteriliyor
- **Önem:** orta · **Kategori:** UX / veri tutarlılığı
- **Kanıt:** `dealer-dashboard-client.tsx:320` (tüm zamanlar değeri + 30g değişim + 7g sparkline), `:324` ve `:277,930` (Dönüşüm oranı = Tarama→geri bildirim, aynı formül), `stats/route.ts:433` (paya tüketim yorumları dahil → %100'ü aşabilir), `:432` vs `:313-325` (kayan 7 gün vs UTC takvim haftası), `morning-briefing/route.ts:37-77` (yalnız Feedback; stats ise Feedback+ConsumptionReview).
- **Sorun:** Aynı ekranda "geri bildirim" kelimesi üç farklı tanım ve dört farklı pencereyle ölçülüyor; bayi rakamlar arasında bağ kuramıyor.
- **Öneri:** Pano için tek bir "metrik sözlüğü" (`lib/dealer-metrics.ts`) tanımla: geri bildirim = QR + tüketim yorumu; dönüşüm = QR geri bildirimi / tarama; tüm pencereler bayinin saat dilimine (`Europe/Istanbul` varsayılan, profilde ayarlanabilir) göre. Üstte tek dönem seçici (Bugün / 7g / 30g / 90g) ve tüm kartlar ona bağlı.
- **Efor:** M

### 9. Benchmark yüzdeliği ters yorumlanıyor
- **Önem:** orta (widget görünmediği için gizli) · **Kategori:** yanlış veri
- **Kanıt:** `app/api/dealer/benchmark/route.ts:126-127` (`percentile` = sizden **düşük** bayilerin oranı), `dealer-dashboard-client.tsx:1000` + `messages/tr.json` `topPercentileLine: "Top %{pct}"`.
- **Sorun:** En iyi bayi "Top %100", en kötü "Top %0" görür. Ayrıca 0 geri bildirimli bayinin ortalaması 0 kabul edilip yüzdelik 0 ve fark negatif çıkar; benchmark yalnız Feedback kullanıp KPI'daki ortalama puanla (Feedback+ConsumptionReview) çelişir.
- **Öneri:** `topPercent = 100 - percentile` döndür, n < eşik ise "yeterli veri yok" göster, kategori bazlı (`neighborSegment`) kıyası öne çıkar. Bulgu 2'deki snapshot tablosuyla birlikte çöz.
- **Efor:** S

### 10. API'de üretilen sabit Türkçe metinler (i18n kaçakları)
- **Önem:** orta · **Kategori:** dil karışıklığı
- **Kanıt:** `stats/route.ts:307,321` (gün adları `tr-TR`), `:375-380` (performans seviyeleri), `:389-390,404` ("Ürün", "Müşteri", "Anonim"); `morning-briefing/route.ts:93-106,111-124` (highlights, playbook); `lib/next-best-action.ts:26,33,40,49,58,67` (öneri etiketleri); `dashboard-layout/route.ts:23-29` (widget etiketleri); `offline-sync/route.ts:181` (sonuç mesajı); `components/charts/rating-distribution-bar.tsx:31` ("Veri yok").
- **Sorun:** EN arayüzde pano yarı Türkçe görünür. `messages/en.json`'da `dealerDashboard` anahtarlarının hepsi var (eksik anahtar yok), sorun API'nin metin üretmesi.
- **Öneri:** API'ler yalnız kod/anahtar ve parametre döndürsün (`{ level:'excellent' }`, `{ key:'nba.pendingActions', params:{count:3} }`, gün için ISO tarih); istemci `t()` ve `Intl.DateTimeFormat(locale)` ile çevirsin.
- **Efor:** M

### 11. Panodan aksiyon alınamıyor: geri bildirimler tıklanamaz, derin link yok
- **Önem:** orta · **Kategori:** UX / iş akışı
- **Kanıt:** `dealer-dashboard-client.tsx:749-756` (`cursor-default`, link yok), `:481` (acil geri bildirim → genel liste), `lib/next-best-action.ts:34,41` (`?tab=qr`) — `app/dealer/feedbacks/page.tsx:307` yalnız `search` parametresini okuyor; `app/api/dealer/next-best-actions/route.ts:62-69` (`lowestRatedQrId` hesaplanıyor ama `lib/next-best-action.ts`'te href'e konmuyor); `:35-41` (`negativeCount` tüm zamanlar → öneri kalıcı).
- **Sorun:** Panonun en değerli anı ("2★ geldi") ile aksiyon (yanıtla / telafi teklif et / aksiyon maddesi aç) arasında 3–4 tık ve arama var. Medallia/Yelp for Business'ta bu tek tıklık "close the loop" akışıdır.
- **Öneri:** Geri bildirim satırını `/dealer/feedbacks?id=…` derin linkine ya da sağdan açılan bir Sheet'e (yanıt kutusu + AI yanıt önerisi + "telafi gönder" + "aksiyon maddesi oluştur") bağla. Next-best-action'ı "yanıtlanmamış negatif" (`dealerRepliedAt: null`, son 7 gün) üzerinden hesapla ve hedef kaydı parametreyle ilet; feedbacks sayfası `id`/`filter` parametrelerini desteklesin.
- **Efor:** M

### 12. Erişilebilirlik: sekmeler, grafikler, sayaçlar, renk-yalnız durum
- **Önem:** orta · **Kategori:** erişilebilirlik
- **Kanıt:** `dealer-dashboard-client.tsx:716-731` (sekme ARIA yok), `components/charts/mini-sparkline.tsx:60-75` (SVG'de `role="img"`/`aria-label` yok), `dealer-dashboard-client.tsx:812` (aktif/pasif yalnız renkli nokta), `:774` (yıldızlar metin alternatifsiz), `dealer-helpers.tsx:30-44` (AnimatedCounter `setInterval`, reduced-motion kontrolü yok), `:855,870` (sonsuz dönen ikonlar), `app/globals.css:824-831` (uygulama içi "animasyonları azalt" yalnız CSS), `components/providers.tsx:232` (MotionConfig yalnız OS tercihine bakar).
- **Sorun:** Ekran okuyucu kullanıcı KPI trendlerini ve puanları duyamaz; uygulama içinden animasyonu kapatan kullanıcıda sayaç ve dönen ikonlar çalışmaya devam eder.
- **Öneri:** Sekmeleri shadcn `Tabs` (Radix, ARIA hazır) ile değiştir; sparkline/grafiklere `aria-label="Son 7 gün: 3, 5, 2…"` ve görsel olarak gizli özet tablo ekle; yıldızlara `aria-label="5 üzerinden 4"`; durum noktasına metin. `html.reduce-animations` sınıfını okuyan bir `useReducedMotionPref()` hook'u yaz, MotionConfig'e ve AnimatedCounter'a bağla; sonsuz ikon döngülerini tamamen kaldır.
- **Efor:** S

### 13. Stats ucu fazla veri çekiyor; tek dosyada 1030 satır
- **Önem:** orta · **Kategori:** performans / mimari
- **Kanıt:** `stats/route.ts:114-126` (250 QR satırı + `_count` alt sorgusu; sadece 6'sı kullanılıyor, `:352-354`), `:213-222,455-462` (`recentConsumptions` include'larla çekiliyor; istemci kullanmıyor, `types.ts`'te yok), `:223-231` (10 yorum çekip 5 kullanılıyor), `:53` (her cache-miss'te ekstra yoklama sorgusu), `:415-418` (ana Promise.all'dan sonra ayrı tur); `morning-briefing/route.ts:12-147` (try/catch yok, `groupBy` ana Promise.all'dan önce ardışık); `dealer-dashboard-client.tsx` 1030 satır, 7 sorgu, her widget inline.
- **Sorun:** Soğuk istekte gereksiz DB turu ve payload; Neon pooler bağlantı sınırında (bkz. perf notları) gecikme. Tek bileşen değişiklik riskini ve yeniden render maliyetini artırıyor (60 sn refetch tüm ağacı yeniden çiziyor).
- **Öneri:** `take: 6`, `recentConsumptions` ve kullanılmayan alanları kaldır; actionItem sayımlarını ana `Promise.all`'a al; payload'ı zod ile sözleşmeye bağla. İstemciyi widget başına bileşene böl (`widgets/kpi-row.tsx`, `widgets/attention-inbox.tsx`…), widget kayıt defterinden render et; her widget kendi `useQuery` seçicisiyle (`select`) yalnız ihtiyacı olan dilimi dinlesin.
- **Efor:** M

### 14. Widget düzeni yerleşim kayması ve ayar senkronizasyonu
- **Önem:** düşük · **Kategori:** UX / durum yönetimi
- **Kanıt:** `dealer-dashboard-client.tsx:188-197,505` (varsayılan sıra 8 öğe, sunucu sırası 7 öğe → layout yüklendikten sonra yeniden dizilim), `:185` (5 dk staleTime), `app/dealer/settings/page.tsx:965-975` (PUT sonrası `invalidateQueries` yok), `dealer-dashboard-client.tsx:183` (`as any[]`).
- **Öneri:** Layout'u sunucu bileşeninde (page.tsx) okuyup prop olarak geç ya da stats ile aynı uçtan döndür; ayarlar kaydedince `['dealer','dashboard-layout']`'u invalidate et. Daha iyisi: düzenlemeyi panonun kendisinde "Düzenle" modunda (sürükle-bırak, gizle) yap.
- **Efor:** S

### 15. Tekrarlanan CTA'lar ve bilgi gürültüsü
- **Önem:** düşük · **Kategori:** bilgi mimarisi
- **Kanıt:** `/dealer/analytics` linki 4 kez (`:621,894,952,1019`); konum isteği 2 kez (`:342-349` ve `:426-432`); "ilk QR" 3 kez (hero `:381`, GettingStarted `:334-341`, next-best `lib/next-best-action.ts:24-29`); brifing satırı ve highlights aynı sayıları tekrar ediyor (`:440-460`).
- **Öneri:** Her niyet için tek yer: kurulum adımları yalnız GettingStartedCard'da (kapatılabilir, ilerleme kalıcı), analitik linki her bölüm başlığında tek "Ayrıntı →" olarak.
- **Efor:** S

### 16. Ölü kod ve küçük kusurlar
- **Önem:** düşük · **Kategori:** kod kalitesi
- **Kanıt:** kullanılmayan importlar `Badge` (`:37`), `BookOpen` (`:33`); kullanılmayan `pulseSoft` (`dealer-helpers.tsx:86`); `Number(undefined) ?? 0` NaN üretir (`:265`); sayfa içi `LazyMotion strict` (`:361`) global LazyMotion varken gereksiz (`components/providers.tsx:241`); "Daha fazla içgörü" dalı pratikte erişilemez (`:945-957`, çünkü `stats/route.ts:449` her zaman obje döner); mobilde "Kart Tara" gizli (`:388`).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **"Dikkat gerektirenler" gelen kutusu (close-the-loop):** Medallia/Qualtrics'teki gibi yanıtlanmamış düşük puanlar, SLA sayacı (ilk yanıta kalan süre), sahip atama ve tek tıkla yanıt/telafi — panonun merkezi olmalı.
2. **Dönem seçici + karşılaştırma ve şube/QR kırılımı:** Square Dashboard ve Toast'taki "Bugün / Bu hafta / Bu ay vs önceki dönem" standardı; çok noktalı işletmede lokasyon filtresi.
3. **Yanıt oranı, ortalama yanıt süresi, NPS/CSAT KPI'ları:** Google Business Profile ve Yelp for Business'ın temel "itibar sağlığı" metrikleri; veri (`dealerRepliedAt`) mevcut ama panoda yok.
4. **AI tema/konu özeti:** "Bu hafta en çok bahsedilen 3 konu (servis hızı ↑, fiyat ↓)" — Qualtrics Text iQ benzeri; sistemde AI içgörü sayfaları var ama panoya özet akmıyor.
5. **Uyarı/hedef kuralları:** "Ortalama puan 4'ün altına düşerse push/e-posta" ve hedef çubuğu (ör. bu ay 4.5★ hedefi).
6. **Paylaşılabilir/dışa aktarılabilir haftalık özet (PDF/e-posta)** ve sabitlenebilir pano görünümleri.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi panoyu açtığında 5 saniye içinde üç soruya cevap almalı: *"İşler iyi mi?"* (sağlık), *"Şu an neye bakmalıyım?"* (dikkat kutusu), *"Neden?"* (tema/trend). Bugünkü sayfa ilk soruya 15 kartla, ikinciye dağınık bannerlarla, üçüncüye hiç cevap veriyor.

**Yerleşim (masaüstü, 12 sütun):**
1. **Üst şerit:** selamlama + dönem seçici (Bugün/7g/30g/90g) + şube/QR filtresi + "Kart Tara" ve "QR oluştur" (mobilde sabit alt eylem çubuğunda "Tara" birincil).
2. **Sağlık satırı (4 KPI, dönem etiketli):** Ortalama puan (ağırlıklı, n ile), Geri bildirim sayısı, Yanıt oranı / ilk yanıt süresi, Dönüşüm (QR geri bildirimi / tarama). Her kartta önceki döneme göre değişim ve boşlukları `null` olan sparkline. "Performans skoru" halkası kaldırılır veya bileşenleri açıklanan bir "Deneyim Sağlığı" puanına dönüşür (tooltip'te formül).
3. **Sol 8 sütun — Dikkat Kutusu:** brifing + acil geri bildirimler + telafi kuyruğu + açık olaylar tek, önceliklendirilmiş listede; her satırda "Yanıtla / Telafi / Aksiyon aç" ve sağdan açılan Sheet. Boşsa "Her şey yolunda" boş durumu (olumlu pekiştirme).
4. **Sağ 4 sütun — Neden?:** AI tema özeti (3 konu, yön oklarıyla), gerçek puan dağılımı (promoter/passive/detractor), kategori içi kıyas (snapshot'tan).
5. **Alt:** trend grafiği (geri bildirim sayısı + ortalama puan çift eksen, önceki dönem gölge çizgi), en iyi/en kötü 3 QR noktası (tıklanabilir).
6. Kurulum kartı yalnız eksik adım varken, kapatılabilir; diğer bütün kurulum bannerları kaldırılır.

**Motion/3D:** 3D gereksiz — bu bir operasyon ekranı. Motion yalnız anlam taşıdığı yerde: KPI değeri değiştiğinde (refetch) kısa bir sayaç geçişi (0'dan değil, eski değerden), Dikkat Kutusu'na yeni öğe düştüğünde tek seferlik vurgu (realtime stream ile), Sheet açılış geçişi. Sonsuz dönen ikonlar, her kartta hover-scale/rotate ve 10 farklı gecikmeli giriş kaldırılır; tek bir sayfa giriş stagger'ı (≤ 300 ms) yeter. Tüm motion `useReducedMotionPref()` (OS + uygulama içi tercih) ile kapatılabilir.

**Veri/API değişiklikleri:**
- Tek bir `GET /api/dealer/dashboard?period=7d&qr=…` ucu (veya stats'ın yeniden yazımı): metrik sözlüğüne göre `{ kpis:[{key,value,compare,period,n}], series:[{date,count,avgRating|null}], distribution, attention:[…], themes:[…] }`; tüm metinler anahtar olarak; zod sözleşmesi istemci tipini üretir. Redis cache anahtarı dönem/filtre içerir; yeni geri bildirim yazıldığında `dealer-dashboard:{id}:*` invalidate edilir.
- Benchmark ve tema özeti günlük cron ile snapshot tablolarına yazılır; pano yalnız okur.
- `offline-sync` kaldırılır ya da PWA Background Sync + idempotent `consumptions` POST'una indirgenir.
- Widget kayıt defteri tek modülde; düzen tercihi panoda "Düzenle" moduyla yönetilir.
- Realtime notification stream'i `queryClient.invalidateQueries(['dealer','dashboard'])` tetikler (60 sn polling yerine).

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/analytics`:** Panodaki grafik satırları (#34–#37) analitik sayfasının küçük kopyası; pano yalnız trend özetini tutmalı, ayrıntılı kırılımlar analitikte kalmalı. Pano grafikleri ayrı `/api/dealer/analytics` yerine farklı bir hesapla üretildiği için iki sayfada aynı metrik farklı çıkabilir → metrik sözlüğü ortak olmalı.
- **`/dealer/benchmark`:** Pano benchmark widget'ı (ölü) aynı ağır ucu çağırıyor; panoda yalnız tek satırlık "kategori içi konum" özeti kalmalı, ayrıntı benchmark sayfasında.
- **`/dealer/operations-brief` ve `/dealer/weekly-brief`:** Panodaki 24 saatlik brifing (`/api/dealer/morning-briefing`) ile kavramsal olarak çakışıyor (üç ayrı "brifing" yüzeyi). Öneri: pano "bugün/24 saat" dikkat kutusunu sahiplensin; haftalık brifing ve operasyon brifingi tek bir "Brifingler" sayfasında sekme olarak birleşsin.
- **`/dealer/action-items`, `/dealer/remedy-queue`, `/dealer/incidents`:** Dikkat Kutusu bu üç kuyruğun birleşik ve önceliklendirilmiş görünümü olmalı; ayrı sayfalar ayrıntı/işlem ekranı olarak kalır.
- **Kaldırılacaklar:** offline-sync banner'ı ve ucu (Bulgu 1), konum uyarısı banner'ı (GettingStartedCard'a dahil), "Ek veri" satırı (dönüşüm mükerrer, "en iyi gün" düşük değerli).

---

## Doğrulama (şüpheci inceleme)

Üç KRİTİK/YÜKSEK iddia kod baştan okunarak çürütülmeye çalışıldı. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. offline-sync PATCH: oran sınırı, ürün sahipliği ve audit olmadan tüketim oluşturma: **DOĞRULANDI** (etki ifadesi kısmen düzeltildi)

- **Kanıt:**
  - `app/api/dealer/offline-sync/route.ts:101`: `items` istek gövdesinden alınıyor.
  - `:128-135`: sahiplik kontrolü yalnızca `id + dealerId`. `status` filtresi yok, bu yüzden `SYNCED` durumdaki bir kayıt da yeniden işlenebiliyor.
  - `:140-145`: `item.action` ve `item.payload` istemciden geliyor. DB'deki `offlineQueue.payload` hiç okunmuyor.
  - `:200-223` `processConsumption`: rate limit yok, `productId` sahiplik kontrolü yok, `cardAuditLog` yok, `amount` doğrulanmıyor (`parseFloat` negatif/dev değer kabul ediyor).
  - Canlı uçta bu kontroller var: `app/api/dealer/consumptions/route.ts:185-206` (`checkRateLimitDb`, kart+bayi başına dakikada 5), `:230-236` (başka bayinin ürününe 403), `:267` (audit).
- **Yeniden üretim:**
  1. DEALER oturumuyla `POST /api/dealer/offline-sync` `{action:"X", payload:{}}` gönder, kuyruk id'si `Q` alınır.
  2. `PATCH /api/dealer/offline-sync` `{items:[{id:"Q", action:"CREATE_CONSUMPTION", payload:{cardToken:"<ACTIVATED kart token'ı>", productId:"<başka bayinin ürünü>", amount:"-999999"}} ×100]}` gönder.
  3. Aynı `Q` her seferinde sahiplik kontrolünü geçer. Tek istekte 100 `Consumption` oluşur ve istek sınırsız tekrarlanabilir.
- **Etkide düzeltme:**
  - Bu yol **pasif puan basmıyor**. Canlı uçtaki `passivePoints` kredisi (`consumptions/route.ts:324-348`) burada yok.
  - Puan şişirmesi müşterinin her tüketime yorum yazmasını gerektiriyor (bayi–müşteri iş birliği). Yorum puanı `capFeedbackPoints` ile günlük/haftalık sınırlı (`customer/consumptions/[id]/review/route.ts:187`).
  - Sınırsız kalan kısımlar şunlar: karakter/aktivite rozeti ilerlemesi, çünkü `lib/character-badges.ts:458` ve `lib/activity-badges.ts:31` `consumptionReview` sayısını sınırsız sayıyor. Ayrıca harcama/CLV istatistikleri (negatif/dev `amount`), başka bayinin ürün adının müşteri geçmişine yazılması ve audit izinin olmaması.
- **`processScan`:** `:238-251`. BLOCKED/UNUSED dahil herhangi bir kart için ham müşteri `id`'si ve `email` döner. Bunun için token'a sahip olmak gerekiyor; canlı uç da e-posta döndürüyor (`consumptions/route.ts:250-255`). Bu yüzden ek sızıntı sınırlı ama gerçek: ham id ve BLOCKED kart.
- **Kuyruğa yazan istemci yok:** Grep'e göre `/api/dealer/offline-sync`'e POST eden istemci kod yok, yalnız `dealer-dashboard-client.tsx:107,296` GET/PATCH yapıyor. İddianın bu kısmı doğru.
- **Hüküm:** Gerçek bir yetki ve iş kuralı atlatması. Önerilen çözüm: ucu kaldırmak ya da PATCH'i DB'deki payload'ı okuyan, `status` ile atomik claim yapan (`updateMany where status in PENDING/FAILED`) ve canlı uçla aynı tüketim servisini çağıran tek bir yola indirmek.

### 2. Stats API hata durumunda success:true ve sıfır veri döndürüyor: **DOĞRULANDI**

- **Kanıt:**
  - `app/api/dealer/stats/route.ts:467-502`: `catch` içinde `responseIfDatabaseUnavailable` yalnız P1001/P1002/P1017/P2024 ve `PrismaClientInitializationError`'ı ayıklıyor (`lib/prisma.ts:26-34`). Geri kalan her hata (`$queryRaw` hatası/statement timeout, P2010, şema kayması, kod istisnası) `200 + success:true` ve sıfırlar döndürüyor.
  - İstemci `dealer-dashboard-client.tsx:85` yalnız `!result.success` durumunda hata fırlatıyor, dolayısıyla sıfırlar geçerli veri sayılıyor.
  - `:333-358`: `stats.totalQRCodes > 0` ve `totalFeedbacks > 0` false olduğu için yerleşik bayiye "ilk QR'ını oluştur" onboarding adımları gösteriliyor. Performans "Başlangıç" olarak görünüyor.
  - Hata yalnız `console.error` ile loglanıyor. `sentry.server.config.ts` ve `instrumentation.ts` içinde `captureConsole` yok, yakalanmış hata `onRequestError`'a da düşmez. Sonuç olarak Sentry'ye gitmiyor.
- **Yeniden üretim:** Herhangi bir agregasyon bağlantı dışı bir hata fırlatır (ör. Neon'da statement timeout veya `actionItem` tablosunda kolon uyumsuzluğu). Bayi "0 geri bildirim, Başlangıç" panosu ve onboarding kartı görür. Sorun 60 sn'lik `refetchInterval` boyunca sürer ve hiçbir alarm oluşmaz.
- **Hafifletici:** Fallback Redis'e yazılmıyor (`:465` yalnız başarılı yolda), dolayısıyla zehirli cache yok. Yine de sessiz ve yanıltıcı başarısızlık gerçek.

### 3. "Son 30 gün özeti" kartı tüm zamanların toplamını gösteriyor: **DOĞRULANDI**

- **Kanıt:**
  - `messages/tr.json:377`: `summary30dTitle` = "Son 30 gün özeti".
  - `dealer-dashboard-client.tsx:882-883`: değer olarak `stats.totalFeedbacks` gösteriliyor.
  - `stats/route.ts:248`: `totalFeedbacks = qrFbCount + crRevCount` hesaplanıyor. Bu iki sayaç `:161-162` içindeki tarih filtresiz `count({ where: fbWhere/crWhere })` sorgularından geliyor.
  - 30 günlük sayaçlar (`qrLast30 + crLast30`, `:256`) yalnız `feedbackGrowth` için kullanılıyor ve yanıtta ayrı bir alan olarak dönmüyor.
- **Yeniden üretim:** 2 yıldır çalışan, son 30 günde 12 geri bildirim alan bir bayi düşünelim. Kart "Son 30 gün özeti: 1.840 geri bildirim (+20%)" gösterir. Sayı tüm zamanları kapsarken yüzde 30g/30g karşılaştırmasıdır.
- **Hüküm:** Gerçek bir metrik hatası. Önerilen çözüm: API'ye `feedbacksLast30` alanı eklemek, karta bu alanı bağlamak ve metrik sözlüğünde dönem etiketini zorunlu kılmak.
