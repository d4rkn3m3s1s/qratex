# /dealer/ai-insights

**Amaç:** Bayinin (işletme sahibinin) tüm geri bildirim verisini yapay zekâ ile özetleyen "AI İçgörü" merkezi: genel skor, duygu/niyet/aciliyet/churn dağılımları, tema ve varlık analizi, AI önerileri → aksiyon listesine aktarma, AI'a soru sorma (sohbet), toplu AI analizi ve "öğrenme / düzeltme" döngüsü.

**Genel puan: 3.5 / 10** · **Karar: yeniden tasarla** (veri katmanı kısmen sağlam; ancak sayfa her açılışta LLM raporu üretiyor, ekrandaki KPI'ların bir kısmı LLM'in uydurduğu değerler, dönem seçici veriyi filtrelemiyor, kullandığı API'lerde STAFF rolü üzerinden kiracılar arası veri sızıntısı var ve 2558 satırlık tek bileşen 20+ bölümü alt alta diziyor.)

> Kapsam: `app/dealer/ai-insights/page.tsx` → `ai-insights-client.tsx` (2558 satır), `layout.tsx`, `loading.tsx`; API: `app/api/ai/analyze/route.ts`, `app/api/ai/detailed/route.ts`, `app/api/ai/learning/route.ts`, `app/api/dealer/action-items/route.ts`, `app/api/dealer/staff/route.ts`; kütüphane: `lib/ai-engine.ts`, `lib/ai-learning.ts`, `lib/action-items-ai.ts`; erişim: `proxy.ts`, `components/providers.tsx`. Kod salt okunur incelendi; çalıştırılmadı, canlı veritabanına dokunulmadı. "Doğrulandı" ifadesi kod okumasıyla doğrulandı demektir; çalışma zamanında denenmedi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Sinyal dağılımları, varlık/duygu/tema toplamaları ve aksiyon aktarımı gerçek veriyle çalışıyor; ama dönem seçici, trend, boş durum ve no-AI yedeği bozuk, NPS/CSAT/CES/yanıt oranı/korelasyon/tahmin ise LLM'in uydurduğu sayılar. |
| UX | 3/10 | 20'den fazla kart sekme/çapa olmadan alt alta diziliyor; en eyleme dönük bölüm (AI önerileri) en altta; "düzeltme" formu ham JSON ve İngilizce alan adı istiyor. |
| Görsel | 5/10 | Kart dili ve renk kodlaması tutarlı, hero premium kabukla uyumlu; ancak her kart aynı ağırlıkta, görsel hiyerarşi yok ve çok sayıda gecikmeli giriş animasyonu sayfayı "yükleniyor" gibi gösteriyor. |
| Mimari | 3/10 | 2558 satırlık tek client bileşen, 40'a yakın `useState`, kopyalanmış dönem hesaplama mantığı, SWR/React Query yok; API'ler rol ayrımında `STAFF`'ı unutuyor. |
| Performans | 2/10 | Her ziyaret 2 LLM çağrısı + 6000 satırlık JSON tarama + 3 paralel, her biri tüm geri bildirimleri N+1 ile tarayan aksiyon otomatik tetikleyicisi çalıştırıyor; sayfa en yavaş LLM yanıtına kadar tam ekran spinner'da bekliyor. |
| Erişilebilirlik + Mobil | 4/10 | Mobilde ızgaralar katlanıyor; ancak toggle/akordeon butonlarında `aria-pressed`/`aria-expanded` yok, form etiketleri bağlı değil, ikon buton etiketsiz, sonsuz `boxShadow` animasyonu azaltılmış hareket tercihinde de dönüyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Segment metadata (başlık/açıklama) | ÇALIŞIYOR | `app/dealer/ai-insights/layout.tsx:4-6` | EN açıklaması "across feedback and revenue" diyor; gelir verisi sayfada hiç kullanılmıyor. |
| 2 | Route `loading.tsx` iskeleti | ÇALIŞIYOR | `loading.tsx:4-21` | `role="status"` + `aria-busy` doğru. |
| 3 | `dynamic(ssr:false)` ile ayrı chunk + iskelet | ÇALIŞIYOR | `page.tsx:7-20` | Ardından gelen tam ekran spinner (#4) ile üç ayrı yükleme görünümü art arda geliyor. |
| 4 | Tam sayfa yükleniyor spinner'ı | KISMİ | `ai-insights-client.tsx:898-905`, `354-362` | Üç isteğin hepsi bitene kadar (LLM dahil) hiçbir içerik görünmüyor; dönem değişiminde de tüm sayfa spinner'a dönüyor (`489`). |
| 5 | Boş durum (<3 geri bildirim) | BOZUK | `ai-insights-client.tsx:908`; `app/api/ai/detailed/route.ts:204-224` | Koşul `!signals` de istiyor; `/api/ai/detailed` 0 kayıtta bile sıfırlı `signals` döndürdüğü için boş durum pratikte hiç görünmüyor, kullanıcı sıfırlarla dolu kartlar görüyor. |
| 6 | Hata durumu | KISMİ | `397-399` | Yalnızca toast; satır içi hata/yeniden dene yok. 429/403 gibi JSON hatalar (`success` yok) sessizce yutuluyor (`365`). |
| 7 | Hero (çip, başlık, alt başlık) | ÇALIŞIYOR | `936-963` | |
| 8 | Haftalık / Aylık dönem seçici | BOZUK | Client `338-348`, `487-510`; API `analyze/route.ts:383-430` | `period` API'de verinin filtrelenmesinde kullanılmıyor (yalnızca rapor anahtarı ve prompt metni); iki mod aynı son 300+300 kaydı analiz ediyor. Hafta numarası formülü yanlış (2026-10-08 → `2026-W05`), farklı aylardaki haftalar aynı anahtara yazılıp birbirini eziyor. Hızlı geçişte yarış koşulu. |
| 9 | "Son güncelleme" saati | KISMİ | `369`, `989-994` | Raporun `generatedAt`'i değil, istemcinin fetch zamanı. |
| 10 | Genel skor halkası (CircularProgress) | KISMİ | `1003-1005`; `lib/ai-engine.ts:714,761` | Skor deterministik bir formülle değil LLM tarafından üretiliyor; aynı veriyle her yenilemede farklı skor gelebilir. |
| 11 | Trend oku ve değeri | BOZUK | `analyze/route.ts:518-529` | "Önceki dönem" skoru = dönemden bağımsız olarak en son kaydedilen rapor; yani bir önceki sayfa yüklemesi. Trend dönemsel karşılaştırma değil. |
| 12 | "N geri bildirim analiz edildi" satırı | ÇALIŞIYOR | `1029` | ConsumptionReview dahil toplam. |
| 13 | Yenile butonu | KISMİ | `405-410` | `fetchInsights` hatayı kendi içinde yutuyor; ardından her durumda "yenilendi" başarı toast'ı gösteriliyor (hata + başarı toast'ı birlikte). Her tık yeni LLM raporu üretiyor. |
| 14 | "AI'a sor" paneli aç/kapa | ÇALIŞIYOR | `1038-1041`, `1084-1176` | |
| 15 | "Bu rapor nasıl üretildi?" akordeonu | KISMİ | `1049-1081`; `messages/tr.json` methodologyStep3/4 | Metin "makine öğrenmesiyle gruplanır", "nedensel faktörler" diyor; gerçekte LLM istemi veya yerel sayım var. `aria-expanded` yok. |
| 16 | Hızlı soru çipleri | ÇALIŞIYOR | `1110-1114` | |
| 17 | Sohbet mesajı gönderme (Enter/buton) | KISMİ | `689-714`, `1159-1171`; `lib/ai-engine.ts:840,959-962` | Yanıt Markdown olarak render edilmiyor (`whitespace-pre-wrap`), EN arayüzde de "Her zaman Türkçe" yanıt veriyor; LLM hatası `success:true` ile Türkçe hata cümlesi olarak dönüyor ve konuşmaya kaydediliyor. Gönder ikon butonunda `aria-label` yok. |
| 18 | Konuşma sürekliliği (`conversationId`) | KISMİ | `700-705`; `analyze/route.ts:776-805` | Sunucuda saklanıyor ama sayfada geçmiş konuşma listesi/yükleme yok; yenilemede kayboluyor. |
| 19 | Yazıyor göstergesi | ÇALIŞIYOR | `1142-1155` | `animate-bounce` için `motion-reduce` yok. |
| 20 | Uyarılar (alerts) | KISMİ | `1179-1203` | LLM üretimi; `alert.type` ham İngilizce (`churn`, `toxic`) rozet olarak basılıyor; ilgili geri bildirime link/aksiyon yok. |
| 21 | KPI: Ortalama puan | KISMİ | `1215`; `lib/ai-engine.ts:799` | Gerçek `stats.averageRating` varken LLM'in döndürdüğü `keyMetrics.avgRating` gösteriliyor; ikisi farklı olabilir. |
| 22 | KPI: NPS | SAHTE | `1216`; `lib/ai-engine.ts:707,800` | Sistemde 0-10 tavsiye sorusu verisi bu akışta yok; NPS'i LLM "−100 ile 100" aralığında uyduruyor. |
| 23 | KPI: CSAT | SAHTE | `1217`; `lib/ai-engine.ts:708,801` | Hesaplanmıyor, LLM tahmini. |
| 24 | KPI: CES | SAHTE | `1218`; `lib/ai-engine.ts:709,802` | Hesaplanmıyor; üstelik gerçek `avgEffort` sinyali (`signals.avgEffort`) varken kullanılmıyor. |
| 25 | KPI: Yanıt oranı | SAHTE | `1219`; `lib/ai-engine.ts:705,798` | LLM'e yanıt verisi hiç gönderilmiyor; sayı tamamen uydurma. |
| 26 | Duygu dağılımı (3 kutu + çubuk) | ÇALIŞIYOR | `1238-1274`; `analyze/route.ts:458-466` | Gerçek sayımdan; ancak "mixed" dışarıda ve dönem filtresi yok. |
| 27 | Deneyim sinyalleri (5 metrik) | ÇALIŞIYOR | `1283-1326`; `detailed/route.ts:99-109` | Tüm zamanlar, en fazla 6000 kayıt örneklemi. |
| 28 | Niyet / Aciliyet / Churn dağılımları | ÇALIŞIYOR | `1329-1404`; `detailed/route.ts:72-97` | |
| 29 | AI özeti | KISMİ | `1407-1426`; `lib/ai-engine.ts:687,720` | EN arayüzde de Türkçe metin. |
| 30 | Güçlü yönler | KISMİ | `1441-1463` | Skorlar LLM üretimi; `key={item.title}` çakışabilir. |
| 31 | Zayıf yönler | KISMİ | `1478-1500` | Aynı. |
| 32 | Anahtar faktörler + "Korelasyon %" | SAHTE | `1508-1547`; `lib/ai-engine.ts:701,718` | Hiçbir korelasyon hesaplanmıyor; LLM'den "impact/correlation 0-1" uydurması isteniyor ve istatistik gibi sunuluyor. |
| 33 | Tema kümeleri + "tümünü göster" | KISMİ | `1550-1601`; `lib/ai-engine.ts:567-615` | Yıldız puanı `avgScore*5`; oysa `score` tema duygusunun güven skoru (0-1). Yüksek güvenli olumsuz tema 4.5/5 yıldız gösteriyor. |
| 34 | Tema performansı (topThemes) | KISMİ | `1604-1649`; `detailed/route.ts:164-184` | Aynı yıldız hatası; #33 ile büyük ölçüde aynı veri ikinci kez. |
| 35 | En çok bahsedilen konular | ÇALIŞIYOR | `1652-1686` | |
| 36 | Varlık tanıma (entity) | ÇALIŞIYOR | `1689-1732` | `entity.type` ham İngilizce; yüzde renkleri yalnız renkle ayrışıyor. |
| 37 | Duygu haritası (emotions) | ÇALIŞIYOR | `1735-1769` | |
| 38 | En sık aksiyon önerileri + "daha fazla" | ÇALIŞIYOR | `1772-1855`; `detailed/route.ts:146-161` | |
| 39 | "Aksiyon listesine ekle" diyaloğu (atanan + bitiş tarihi) | KISMİ | `443-485`, `2492-2554`; `action-items/route.ts:177-187` | `critical` öncelik `medium` olarak kaydediliyor; yeniden yüklemede anahtar uyuşmuyor (`text::critical` ≠ `text::medium`). Sunucu `assignedToId`'nin bayinin personeli olduğunu doğrulamıyor. |
| 40 | "Listede" önyüklemesi (3 durum için GET) | BOZUK | `415-441`; `action-items/route.ts:71-78`; `lib/action-items-ai.ts:212-218` | Her GET `runActionItemsAutoTrigger` çalıştırıyor; 3 paralel çağrı "say→oluştur" yarışında mükerrer ActionItem ve gerekirse 3 ayrı LLM çağrısı üretebiliyor. Durum başına en fazla 100 kayıt. |
| 41 | "Aksiyonlara git" linki (`?q=`) | ÇALIŞIYOR | `1834-1836`; `app/dealer/action-items/page.tsx:104` | |
| 42 | Öğrenme özeti kutuları (kapsam/son güncelleme/derinlik) | ÇALIŞIYOR | `1875-1901` | AI kapsamı #27'de de var (tekrar). |
| 43 | Toplu AI analizi + ilerleme | KISMİ | `612-678`, `1904-1942`; `analyze/route.ts:226` | Yalnızca ekrandaki en son 50 geri bildirimi tarıyor ama metin "tüm geri bildirimlerinizi" diyor; `analyzeBulk` `dealerId` almadığı için bayi maliyet limiti devre dışı. Bazı batch'ler başarısız olsa da başarı toast'ı. |
| 44 | Yeniden eğitim önerisi bandı | KISMİ | `1945-1955`; `lib/ai-learning.ts:418,426,434` | `reason` metni sunucuda Türkçe sabit; EN arayüzde Türkçe görünüyor. |
| 45 | Öğrenme profili durumu + "Profili güncelle" | KISMİ | `532-553`, `1958-1983`; `learning/route.ts:103-108` | Durum ham `ready`; aynı buton iki yerde; uçta hız limiti yok (her tık LLM). |
| 46 | Embedding / düzeltme sayaçları | ÇALIŞIYOR | `1985-2004` | |
| 47 | Düzeltme formu | KISMİ | `2007-2090`; `learning/route.ts:12-18,91-98` | Geri bildirim seçimi + serbest ID + ham alan adları (`churnRisk`, `actionSuggestions`) + JSON textarea; düzeltme geri bildirimin kendisini güncellemiyor (ekranda eski duygu kalıyor); `<label>`lar alanlara bağlı değil. |
| 48 | Düzeltme geçmişi | ÇALIŞIYOR | `2092-2133` | Son 20 kayıt; sayfalama yok. |
| 49 | Detaylı geri bildirim araması | KISMİ | `815-824`, `2152-2160` | Yalnızca istemcideki son 50 kayıtta arar. |
| 50 | Duygu filtresi butonları | ÇALIŞIYOR | `2161-2173` | `aria-pressed` yok. |
| 51 | Geri bildirim kartı (yıldız, rozetler, toksik) | ÇALIŞIYOR | `2176-2237` | Yıldızların metin alternatifi yok. |
| 52 | "Düzelt" → forma kaydırma | ÇALIŞIYOR | `680-687`, `2219-2227` | |
| 53 | Kart detayı (skorlar, konular, cümle duygusu, varlık, tema, öneri, AI meta) | KISMİ | `2239-2359` | `2351`'de i18n dışı sabit Türkçe metin; `aria-expanded` yok. |
| 54 | "Tümünü göster" (geri bildirim) | ÇALIŞIYOR | `2365-2369` | |
| 55 | AI önerileri + "daha fazla" | KISMİ | `2376-2438` | Aksiyon listesine ekleme yok (yalnızca #38'de var); en eyleme dönük blok sayfanın en altında; `key={index}`. |
| 56 | "AI tahmini" kartı (30 gün puan) | SAHTE | `2441-2491`; `messages/*.json` aiPredictionLead; `lib/ai-engine.ts:719` | LLM'in "makul tahmin"i kesin tahmin gibi sunuluyor; haftalık modda da "30 gün" diyor; güven aralığı yok. Sonsuz `boxShadow` animasyonu. |
| 57 | Personel listesi (atama için) | ÇALIŞIYOR | `319-332`; `staff/route.ts:19-53` | |
| 58 | AI yapılandırılmamışken yedek metin (legacy insights) | BOZUK | `analyze/route.ts:597-616`; client `364-370` | API `insights` metni döndürüyor, istemci bu alanı hiç okumuyor; AI anahtarı yoksa rapor alanları sessizce boş. |
| 59 | Sunucu tarafı modül/plan kapısı (`ai_features`) | EKSİK | `components/dashboard/sidebar.tsx:265`; `lib/module-controls.ts:47` | Yalnızca menü gizleniyor; sayfa ve API'ler modül kapalıyken de çalışıyor. Bayinin `AISettings.isEnabled` ayarı da kontrol edilmiyor. |
| 60 | Tarih aralığı / şube (QR) filtresi | EKSİK | `analyze/route.ts:67-73` | API `qrCodeId/startDate/endDate` destekliyor, arayüz göndermiyor. |
| 61 | Rapor geçmişi ve dönem karşılaştırma | EKSİK | `analyze/route.ts:551` | `AIInsightReport` kaydediliyor ama hiçbir yerde geri okunmuyor. |
| 62 | Dışa aktarma / paylaşma / planlı e-posta özeti | EKSİK | — | |
| 63 | Geri bildirimden yanıtla / detaya git | EKSİK | `2176-2237` | Kartta `/dealer/feedbacks` detayına veya yanıt akışına bağlantı yok. |
| 64 | Azaltılmış hareket desteği (sonsuz animasyonlar) | EKSİK | `2447-2457`, `1149-1151`; `components/providers.tsx:232` | `MotionConfig reducedMotion="user"` transform dışı `boxShadow` döngüsünü durdurmaz; CSS `animate-bounce`'ta `motion-reduce:` yok. |
| 65 | Bölüm içi gezinme (sekme/çapa) | EKSİK | `933-2555` | 20+ kart tek sütunda; sekme, çapa menüsü veya yapışkan özet yok. |

**Sayım:** 65 özellik — ÇALIŞIYOR 24 · KISMİ 23 · BOZUK 5 · SAHTE 6 · EKSİK 7

---

## Bulgular

### 1. [KRİTİK · Güvenlik] STAFF rolü sayfanın kullandığı AI API'lerinden tüm platformun geri bildirimlerini okuyabiliyor
- **Kanıt:** `app/api/ai/detailed/route.ts:24-37,56-60` (yalnızca `CUSTOMER` engelleniyor, kapsam yalnızca `DEALER` için ekleniyor); `app/api/ai/analyze/route.ts:373-390` (insights), `653-660` (ask: "ADMIN: tüm verilere erişir" yorumu, `STAFF` da aynı dala düşüyor), `207-213` (bulk_analyze); `prisma/schema.prisma:22-27` (`STAFF` rolü); `app/api/dealer/staff/route.ts:120-130` (her bayi istediği e-posta/şifreyle STAFF hesabı açabiliyor).
- **Sorun:** `where` yalnızca `role === 'DEALER'` iken bayiye daraltılıyor. STAFF oturumu `/api/ai/detailed?limit=100` ile tüm bayilerin son 100 geri bildirim metnini ve yazan kullanıcı adını, 6000 kayıt üzerinden de varlık/tema/aksiyon toplamalarını alıyor. `action=insights` ve `action=ask` platform geneli veriyi LLM bağlamına koyup özetliyor; `bulk_analyze` başka bayilerin geri bildirimlerini yeniden analiz edip üzerine yazabiliyor. Herhangi bir bayi kendine STAFF hesabı açarak rakiplerinin verisini okuyabilir. (Kod okumasıyla doğrulandı; canlıda denenmedi.)
- **Öneri:** Rol başına kapsam çözümlemesini tek bir yardımcıya taşıyın: `resolveDataScope(session)` → `{ kind: 'dealer', dealerId } | { kind: 'admin' } | deny`. STAFF için `session.user.dealerId` (token'da zaten var: `lib/auth.ts:254-255`) kullanılsın veya bu uçlar STAFF'a tamamen kapatılsın. Varsayılan "filtresiz" dal **asla** olmamalı: tanınmayan rol 403 almalı. Bu üç route `requireAuth(['DEALER','ADMIN'])` ile başlamalı. Ek olarak `action=analyze` (`analyze/route.ts:147-173`) `feedbackId` için sahiplik kontrolü yapmadan **her rolde** `feedback.update` yapıyor (CUSTOMER dahil); aynı düzeltme oraya da uygulanmalı. Regresyon için her uçta rol matrisi testi yazılmalı.
- **Efor:** M

### 2. [KRİTİK · Veri bütünlüğü] STAFF rolü başka bayinin öğrenme profiline düzeltme yazabiliyor (veri zehirleme)
- **Kanıt:** `app/api/ai/learning/route.ts:82-98` (sahiplik yalnızca `DEALER` için kontrol ediliyor; `dealerId: fb.qrCode.dealerId` hedef bayiden alınıyor); `lib/ai-learning.ts:301-318` (düzeltmeler profil üretim istemine giriyor); `lib/inngest/feedback-analyze-pipeline.ts:42-43` (profil sonraki tüm analizlere ekleniyor).
- **Sorun:** STAFF oturumu herhangi bir `feedbackId` ile kurban bayinin hesabına `AIFeedbackCorrection` yazabiliyor. `field` serbest metin, `newValue` `z.any()`; bu değerler kurbanın adaptif profil istemine girip sonraki analizlerini çarpıtabiliyor (istem enjeksiyonu yüzeyi).
- **Öneri:** #1'deki kapsam çözümleyicisiyle aynı kontrol; ayrıca `field`'i `z.enum([...])` ile sınırlayın, `newValue`'yu alan başına şemayla doğrulayın (örn. sentiment için `z.enum(['positive','negative','neutral','mixed'])`, urgency için `z.number().min(0).max(1)`), `note`'u istem içine koymadan önce temizleyin.
- **Efor:** S

### 3. [YÜKSEK · Doğruluk / Güven] Ekrandaki KPI'ların bir kısmı ölçülmüş değil, LLM'in uydurduğu sayılar
- **Kanıt:** `lib/ai-engine.ts:700-711` (istem LLM'den `responseRate`, `nps`, `csat`, `ces`, `keyDrivers.correlation`, `predictedRating` üretmesini istiyor), `797-803`; client `1214-1219`, `1535`, `2441-2491`.
- **Sorun:** NPS, CSAT, CES, yanıt oranı ve "korelasyon %" için LLM'e hiçbir girdi verisi gönderilmiyor; LLM bunları uyduruyor ve arayüz bunları ölçülmüş metrik gibi gösteriyor. `avgRating` için gerçek değer (`stats.averageRating`) varken LLM'inki gösteriliyor. Bayi bu sayılarla karar alırsa yanlış yönlenir; Medallia/Qualtrics sınıfı bir üründe bu güveni temelden sarsar.
- **Öneri:** Metrikleri deterministik hesaplayın ve LLM'i yalnızca anlatı (özet, öneri metni) için kullanın: CSAT = 4-5 puanların oranı; CES = `avgEffort`'tan veya ayrı soru varsa ondan; NPS yalnızca 0-10 tavsiye sorusu toplanıyorsa gösterilsin, yoksa kart kaldırılsın; yanıt oranı = `Feedback`'lerde bayi yanıtı olanların oranı (ilgili alan neyse oradan). "Anahtar faktörler" için puan ile tema/konu varlığı arasında gerçek bir ilişki ölçüsü (ör. tema geçen/geçmeyen kayıtların ortalama puan farkı, n ile birlikte) hesaplansın. "Tahmin" kartı ya basit bir trend modeline (son 8 haftanın doğrusal eğilimi + güven aralığı) bağlansın ya da kaldırılsın. Her metrik kartına "nasıl hesaplandı" ipucu ve örneklem büyüklüğü (n) eklensin.
- **Efor:** L

### 4. [YÜKSEK · İşlevsellik] Dönem seçici veriyi filtrelemiyor, hafta anahtarı yanlış, trend anlamsız
- **Kanıt:** Client `338-348` (hafta formülü), `487-510` (kopya formül); `analyze/route.ts:383-430` (`period` sorguda kullanılmıyor, yalnızca son 300 kayıt), `518-529` (önceki skor = dönemden bağımsız en son rapor), `551-556` (rapor `dealerId_period_type` ile upsert).
- **Sorun:** (a) "Haftalık" ve "Aylık" aynı veri kümesini analiz ediyor; yalnızca LLM'e verilen dönem etiketi değişiyor. (b) `Math.ceil((start.getDate() + öncekiAyınGünSayısı)/7)` ISO hafta değil: 2026-10-08 için `2026-W05` üretiyor (doğrusu W41); farklı aylardaki haftalar aynı anahtara düşüp raporları eziyor. (c) Trend, bir önceki dönemle değil son sayfa yüklemesiyle kıyaslanıyor. (d) Hızlı geçişte iki istek yarışıyor; geç dönen yanıt, seçili olmayan dönemin raporunu ekrana basabiliyor. (e) Aylık dönem `toISOString()` (UTC) ile hesaplandığından Türkiye saatiyle ayın 1'i 00:00-03:00 arasında bir önceki ay seçiliyor.
- **Öneri:** Dönemi sunucuda tarih aralığına çevirin (`date-fns` `startOfISOWeek`/`getISOWeek`, bayinin saat dilimiyle) ve hem Feedback hem ConsumptionReview sorgusunda `createdAt` filtresi olarak uygulayın. Önceki dönem skorunu `{ dealerId, type, period: öncekiDönem }` ile okuyun; yoksa trendi "karşılaştırma yok" diye gösterin. İstemcide React Query `queryKey: ['ai-insights', type, period]` kullanın; yarış ve önbellek kendiliğinden çözülür. Dönem değişiminde tüm sayfayı spinner'a çevirmek yerine yalnızca rapor kartlarını iskeletle gösterin.
- **Efor:** M

### 5. [YÜKSEK · Performans / Maliyet] Her sayfa ziyareti LLM raporu üretiyor; maliyet limiti üç yolda devre dışı
- **Kanıt:** Client `315-317`, `354-362` (açılışta otomatik `action=insights`); `analyze/route.ts:483-491` (clusterThemes, LLM olabilir), `532-544` (generateInsightReport, 2400 token); `lib/ai-engine.ts:624-664`, `477-482`, `854-870` (cost guard çağrısı yok); `analyze/route.ts:226` → `lib/ai-engine.ts:422-440` (`analyzeBulk` `options={}`, `dealerId` yok → `checkAiCostGuard` atlanıyor, `lib/ai-engine.ts:306-308`); `learning/route.ts:103-108` (hız limiti yok).
- **Sorun:** Rapor kaydediliyor ama geri okunmuyor; her açılış/yenileme yeni rapor üretiyor (yavaş ilk boya, yüksek LLM maliyeti, her seferinde farklı skor). İçgörü raporu, tema kümeleme, sohbet ve toplu analiz bayi başı maliyet koruyucusunu kullanmıyor; "Profili güncelle" sınırsız tıklanabiliyor.
- **Öneri:** "Oku, gerekirse üret" modeli: GET `/api/dealer/ai-insights/report?type&period` son kaydedilmiş `AIInsightReport`'u (Upstash cache + DB) döndürsün; yeni rapor yalnızca (a) cron ile dönem sonunda, (b) yeni veri eşiği aşıldığında veya (c) kullanıcı "yeniden üret" dediğinde (cooldown ile) arka planda (Inngest zaten var) üretilsin. Tüm LLM çağrılarına `dealerId` geçirip `checkAiCostGuard`/`recordAiCostUsage` uygulayın; `update_profile` için `checkRateLimitDb` ekleyin.
- **Efor:** L

### 6. [YÜKSEK · Veri bütünlüğü / Performans] "Listede mi?" önyüklemesi aksiyon otomatik tetikleyicisini 3 kez paralel çalıştırıyor
- **Kanıt:** Client `415-441` (3 durum için paralel GET); `action-items/route.ts:71-78` (her GET'te `runActionItemsAutoTrigger`); `lib/action-items-ai.ts:34-76` (tüm geri bildirimleri sınırsız tarayıp her biri için ayrı `count` → N+1, ardından `create`), `212-218` (açık aksiyon <3 ise LLM ile üretim).
- **Sorun:** Üç eşzamanlı çağrı aynı "say → oluştur" döngüsüne giriyor; aynı öneri için mükerrer ActionItem ve en kötü durumda 3 ayrı LLM üretimi oluşabilir. Sınırsız `findMany` + kayıt başına `count`, geri bildirim sayısı büyüdükçe sayfa açılışını doğrusal yavaşlatıyor. Ayrıca durum başına 100 kayıt sınırı "eklendi" rozetini kaçırabiliyor.
- **Öneri:** Otomatik tetiklemeyi GET'ten çıkarıp geri bildirim analiz hattına (Inngest) veya cron'a taşıyın; idempotency için `ActionItem` üzerinde `(feedbackId, suggestionHash)` benzersiz indeksi ve `createMany({ skipDuplicates: true })` kullanın. Sayfa için tek bir hafif uç ekleyin: `POST /api/dealer/action-items/lookup { texts: string[] }` → açık aksiyonu olan metinlerin kümesi (normalize edilmiş hash ile). Öncelik eşlemesini istemci ve sunucuda aynı yapın (`critical → high`).
- **Efor:** M

### 7. [YÜKSEK · Doğruluk] Tema yıldız puanı yanlış alandan hesaplanıyor
- **Kanıt:** Client `1581`, `1634` (`avgScore * 5` → "/5" yıldız); `types/index.ts:203-208`, `lib/ai-engine.ts:263` (`score` = tema duygusunun güven skoru, örn. `"sentiment":"positive","score":0.9`); `lib/ai-engine.ts:598-613`.
- **Sorun:** Güven skoru memnuniyet puanı gibi gösteriliyor: %90 güvenle "olumsuz" sınıflanmış bir tema 4.5/5 yıldız alıyor. Bayiye tam ters sinyal veriyor.
- **Öneri:** Tema başına gerçek memnuniyet ölçüsü olarak o temayı içeren geri bildirimlerin **ortalama yıldız puanını** (`Feedback.rating`) ve olumlu/olumsuz oranını hesaplayın (`detailed` toplamasına `ratings[]` eklemek yeterli). Güven skoru gösterilecekse ayrı ve açıkça "model güveni" olarak etiketlensin.
- **Efor:** S

### 8. [ORTA · İşlevsellik] Boş durum ve no-AI yedeği hiç devreye girmiyor
- **Kanıt:** Client `908` (`!signals` koşulu); `detailed/route.ts:204-224` (her zaman `signals` döner); `analyze/route.ts:446-452` (<3 kayıtta `report/stats` yok), `597-616` (legacy `insights` metni); client `364-370` (`insights` alanı okunmuyor).
- **Sorun:** Yeni bayi, açıklayıcı "en az 3 geri bildirim gerekli" ekranı yerine sıfırlarla dolu onlarca kart görüyor. AI anahtarı yoksa veya LLM hata verirse rapor kartları sessizce kayboluyor; kullanıcı neden boş olduğunu bilmiyor.
- **Öneri:** API yanıtını açık bir durum alanıyla zenginleştirin: `status: 'ok' | 'insufficient_data' | 'ai_unavailable' | 'rate_limited'`. İstemci bu duruma göre boş durum, "AI şu an kullanılamıyor, istatistikler gösteriliyor" bandı veya "1 dk sonra tekrar deneyin" mesajı göstersin. Boş durumda "QR kodlarını paylaş" ve "örnek rapor göster" gibi birincil CTA'lar olsun.
- **Efor:** S

### 9. [ORTA · UX / Bilgi mimarisi] 20+ eşit ağırlıklı kart, tekrar eden bölümler, eylem en altta
- **Kanıt:** Bölüm sırası `1178-2491`: uyarılar → KPI → duygu → sinyaller → dağılımlar → özet → güçlü/zayıf → faktörler → tema kümeleri → tema performansı → konular → varlıklar → duygular → aksiyonlar → öğrenme (+form, +geçmiş) → detaylı liste → **AI önerileri** → tahmin. Tekrarlar: AI kapsamı (`1300-1302` ve `1876-1879`), "Profili güncelle" (`1950`, `1975`), tema kümeleri ve tema performansı (`1550`, `1604`), iki ayrı öneri listesi (`1772` ve `2376`).
- **Sorun:** Bayinin "ne yapmalıyım?" sorusunun cevabı sayfanın en altında; aynı bilgi farklı adlarla iki kez gösteriliyor; öğrenme/düzeltme gibi yönetici-dışı bir araç ana akışın ortasına yerleşmiş. Mobilde sayfa çok uzun.
- **Öneri:** Sayfayı 3 sekmeye bölün: **Özet** (deterministik KPI şeridi + AI anlatısı + "Bu hafta yapılacak 3 şey" öneri kartları, tek tıkla aksiyona/atanana), **Keşfet** (tema/varlık/duygu/niyet; tek bir birleşik "Tema" görünümü, tıklanınca ilgili geri bildirimlere filtreli drill-down), **Geri bildirimler** (sunucu taraflı arama/sayfalama). Öğrenme profili ve düzeltme geçmişi `/dealer/ai-settings`'e taşınsın. İki öneri listesi tek "Öneriler" listesinde birleşsin (kaynak etiketi: rapor / geri bildirim kalıbı).
- **Efor:** L

### 10. [ORTA · UX] Düzeltme formu geliştirici aracı gibi
- **Kanıt:** Client `2016-2090` (serbest ID girişi, ham alan adları `churnRisk`, `actionSuggestions`; JSON textarea, placeholder `{"label":"positive"}`); `learning/route.ts:91-98`, `lib/ai-learning.ts:204-222` (düzeltme geri bildirimi güncellemiyor).
- **Sorun:** İşletme sahibi JSON yazmaz. Düzeltme kaydedildikten sonra kartta eski duygu görünmeye devam ettiği için kullanıcı "işe yaramadı" sanıyor. Açılır listedeki seçenekler aktif filtreye ve ilk 10 kayda bağlı (`2025`).
- **Öneri:** Satır içi düzeltme: her kartın duygu/niyet rozetine tıklayınca açılan küçük bir popover (`Popover` + seçenekli `RadioGroup`), aciliyet/churn için kaydırıcı. Kaydedince kartın üzerinde "Düzeltildi (sizin tarafınızdan)" işareti ve `Feedback` alanının da güncellenmesi (`correctedBy`, `correctedAt` alanları ile), denetim izi `AIFeedbackCorrection`'da kalsın.
- **Efor:** M

### 11. [ORTA · i18n] Dil karışıklığı: LLM çıktısı ve sunucu metinleri her zaman Türkçe
- **Kanıt:** `lib/ai-engine.ts:687,720` ("Tüm metinler Türkçe"), `840` ("Dil: Her zaman Türkçe"), `859`, `962`; `lib/ai-learning.ts:418,426,434`; client `2351` (i18n dışı sabit TR); `1194` (`alert.type` ham EN), `1712`, `1963` (`profile.status` ham `ready`), `2045-2053` (alan adları ham EN).
- **Sorun:** EN arayüzde özet, öneriler, uyarılar, sohbet yanıtları ve yeniden eğitim bandı Türkçe; TR arayüzde ise teknik İngilizce anahtarlar görünüyor.
- **Öneri:** API'ye `locale` geçirin ve istemlerde "Yanıt dili: {locale}" kullanın; rapor anahtarına dil ekleyin (`dealerId_period_type_locale`). Sunucu tarafı sabit metinleri kod olarak döndürün (`reasonCode: 'new_feedback' , count`) ve istemcide çevirin. Enum değerleri için `t('dealerAiInsights.alertType.' + type)` haritaları ekleyin.
- **Efor:** M

### 12. [ORTA · Güvenlik] Aksiyon atamasında atanan kişi doğrulanmıyor; modül kapısı yalnızca menüde
- **Kanıt:** `action-items/route.ts:27,184` (`assignedToId` serbest string); `components/dashboard/sidebar.tsx:265`, `lib/module-controls.ts:47` (sunucu tarafında `ai_features` kontrolü yok).
- **Sorun:** Bayi, kendi personeli olmayan herhangi bir kullanıcı ID'sine aksiyon atayabiliyor (kayıt başka hesabın görev listesine düşebilir — tüketen ekranlar doğrulanmadı). Admin AI modülünü kapatsa bile URL ile sayfa açılıyor ve LLM çağrıları yapılıyor.
- **Öneri:** POST'ta `assignedToId` varsa `dealerStaff.findFirst({ where: { dealerId, userId: assignedToId, isActive: true } })` ile doğrulayın. `requireModule('ai_features')` gibi bir sunucu kapısı yazıp hem sayfa (server component sarmalayıcı) hem ilgili API'lerde uygulayın; `AISettings.isEnabled` ve `weeklyReportEnabled/monthlyReportEnabled` de dikkate alınsın.
- **Efor:** S

### 13. [ORTA · Hata yönetimi] Yenile ve toplu analiz, başarısızlıkta başarı toast'ı gösteriyor
- **Kanıt:** Client `405-410` (`fetchInsights` hatayı yutar, ardından koşulsuz `toast.success`); `643-656` (batch hataları yalnızca `console.error`, sonda koşulsuz başarı); `365` (429/403'te `success` yok → sessiz).
- **Öneri:** `fetchInsights` bir sonuç nesnesi (`{ ok, partial, errors }`) döndürsün; toast buna göre seçilsin. Toplu analizde başarısız batch sayısı ilerleme çubuğunda gösterilsin ("43/50 analiz edildi, 7 hata — tekrar dene"). 429'da `Retry-After` okunup geri sayım gösterilsin.
- **Efor:** S

### 14. [ORTA · Performans] `/api/ai/detailed` her açılışta 6000 satırlık JSON taraması yapıyor
- **Kanıt:** `detailed/route.ts:13,56-68` (6000 kayıt; `entities`, `themes`, `actionSuggestions`, `emotions` JSON sütunlarıyla), `71-202` (bellek içi toplama); `ratingDist`/`sentimentByRating` hesaplanıyor ama istemcide kullanılmıyor (client'ta `signals.ratingDist` geçmiyor).
- **Öneri:** Toplamaları geri bildirim analizi tamamlandığında artımlı güncellenen bir özet tabloya (örn. `DealerAiSignalDaily`: dealerId, gün, niyet/aciliyet/churn kovaları, tema sayıları) taşıyın; sayfa son N günü SUM ile okusun. Kısa vadede sonucu Upstash'te dealer+dönem anahtarıyla 5-10 dk önbelleğe alın. Kullanılmayan alanları yanıttan çıkarın.
- **Efor:** M

### 15. [DÜŞÜK · Erişilebilirlik] Durum bildiren kontrollerde ARIA eksik, sonsuz animasyon
- **Kanıt:** Dönem toggle `966-987` (`aria-pressed`/`role="radiogroup"` yok); akordeon `1051-1061` ve detay `2228-2235` (`aria-expanded` yok); filtre butonları `2164-2171`; gönder ikon butonu `1168`; sohbet listesi `1104` (`aria-live` yok); etiketsiz form alanları `2018`, `2039`, `2060`, `2069`; yıldızlar `2214-2216` metin alternatifi yok; `2449-2456` sonsuz `boxShadow`; `1149-1151` `animate-bounce`.
- **Öneri:** shadcn `ToggleGroup`, `Collapsible`, `Tabs` ve `Label htmlFor` kullanın; sohbet kabına `role="log" aria-live="polite"`; yıldızlara `aria-label={`${rating}/5`}`; sonsuz animasyonları `useReducedMotion()` ile koşullu yapın ve CSS animasyonlarına `motion-reduce:animate-none` ekleyin.
- **Efor:** S

### 16. [DÜŞÜK · Mimari] 2558 satırlık tek bileşen, ölü kod ve gereksiz sarmalayıcı
- **Kanıt:** `ai-insights-client.tsx` 2558 satır, 40'a yakın `useState` (`261-313`); dönem hesabı iki kez (`338-348`, `490-492`); kullanılmayan importlar `Clock`, `Award` (`19`, `22`); global `LazyMotion` varken (`components/providers.tsx:241`) sayfa kendi `LazyMotion strict` sarmalayıcısını ekliyor (`910`, `934`); `fetchInsights` useEffect bağımlılığı dışında tanımlı (`315-317`); `key={index}` (`1185`, `2397`); `detailed/route.ts:115,138,149,167` `any` kaçakları.
- **Öneri:** Özellik klasörü: `components/dealer/ai-insights/{InsightsHeader, KpiStrip, SignalsPanel, ThemesExplorer, RecommendationsList, FeedbackExplorer, AskAiDrawer}.tsx`; veri için `useInsightsReport`, `useAiSignals`, `useActionLookup` React Query hook'ları; dönem yardımcıları `lib/periods.ts`'te tek yerde ve birim testli.
- **Efor:** L

---

## Eksik özellikler (kıyas ürünlerle)

1. **Tarih aralığı + şube/QR + kanal filtresi ve dönem karşılaştırması** (Medallia, Qualtrics CX, Square Dashboard): "bu ay vs geçen ay" deltası, şube kırılımı; API'de parametreler var, arayüzde yok.
2. **Tema → kanıt drill-down** (Qualtrics Text iQ, Medallia Text Analytics): bir temaya/varlığa tıklayınca o temayı içeren geri bildirimlerin filtreli listesi, örnek alıntılar ve zaman serisi.
3. **Gerçek, açıklanabilir metrikler ve "neden değişti?" açıklaması** (Qualtrics Driver Analysis): hesaplanmış CSAT/NPS (veri varsa), puan ile tema arasındaki istatistiksel ilişki, örneklem büyüklüğü ve güven göstergesi.
4. **Rapor geçmişi, planlı özet e-postası ve dışa aktarma** (Yelp for Business, Google Business Profile performans e-postaları): haftalık/aylık PDF veya e-posta özeti, CSV/PDF dışa aktarma, ekip içi paylaşım linki.
5. **Kapalı döngü (close-the-loop)** (Medallia, Toast reviews): uyarı veya olumsuz geri bildirimden tek tıkla yanıt/telafi (remedy) akışına geçiş, atanan kişi ve SLA takibi.
6. **Anomali ve eşik uyarıları** (Medallia alerts, Square insights): "bugün olumsuz geri bildirim normalin 3 katı" gibi istatistiksel uyarılar, push/e-posta ile bildirim; LLM'in serbest metin uyarıları yerine kural + istatistik tabanlı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sayfayı açtığında 1 saniye içinde "işletmem bu hafta nasıl ve ne yapmalıyım?" sorusunun cevabını görmeli. Sayılar her zaman ölçülmüş olmalı; AI yalnızca anlatı, önceliklendirme ve öneri üretmeli ve bunu kaynağıyla göstermeli.

**Yerleşim:**
- **Üst şerit (yapışkan):** dönem seçici (Bu hafta / Bu ay / Özel aralık) + şube çoklu seçimi + "son üretim: 2 saat önce · Yeniden üret" (cooldown'lı).
- **Sekme 1 — Özet:**
  - 4 deterministik KPI kartı (Ortalama puan, CSAT, Olumsuz oranı, Yüksek churn riskli müşteri sayısı); her birinde önceki döneme göre delta ve küçük bir sparkline.
  - AI anlatı kartı: 3 cümle, içinde tıklanabilir tema çipleri (örn. "Servis hızı ↓ 12 geri bildirim").
  - "Bu hafta yapılacak 3 şey": öncelik + beklenen etki + "Ata" (personel + tarih) + "Yapıldı". Kaynak geri bildirimlerin sayısı ve örnek alıntı da kartta.
  - Uyarılar: kural tabanlı; her birinde "İlgili geri bildirimleri gör" ve "Telafi başlat".
- **Sekme 2 — Keşfet:** sol tarafta tek bir birleşik tema/varlık listesi (hacim, ortalama yıldız, delta, olumsuz oranı; sıralanabilir); sağ tarafta seçili temanın zaman serisi, alt temaları ve kanıt alıntıları. Niyet/aciliyet/churn dağılımları bu sekmede ikincil grafikler olarak yer alır.
- **Sekme 3 — Geri bildirimler:** sunucu taraflı arama, filtre ve sayfalama; satır içi duygu/niyet düzeltme popover'ı; "Yanıtla" ve "Detay" bağlantıları.
- **AI'a sor:** sağdan açılan `Sheet` (mobilde tam ekran). Markdown render, konuşma geçmişi listesi, yanıtta kullanılan veri penceresinin gösterimi. `/dealer/ai-chat` ile aynı bileşen kullanılmalı.

**Motion / 3D:** 3D gerekmiyor; bu bir analiz ekranı. Motion ölçülü kullanılmalı:
- KPI değerleri ilk yüklemede bir kez sayarak gelsin (≤600 ms).
- Sekme geçişinde `layoutId` ile alt çizgi kaysın.
- Tema seçilince sağ panel `AnimatePresence` ile yumuşak geçsin.
- Kartlara tek tek kademeli gecikme (şu an 0.9 s'ye kadar uzuyor) ve sonsuz parıltı animasyonu kaldırılmalı.
- Tüm animasyonlar `useReducedMotion` ile kapatılabilmeli.
- Rapor yeniden üretilirken yalnızca anlatı kartında hafif bir shimmer gösterilsin.

**Veri / API değişiklikleri:**
1. `GET /api/dealer/ai-insights/summary?from&to&qrCodeIds[]`: deterministik KPI'lar + delta. `DealerAiSignalDaily` gibi bir özet tablodan okunur, Upstash'te önbelleğe alınır.
2. `GET /api/dealer/ai-insights/report?type&period&locale`: kaydedilmiş `AIInsightReport`'u döndürür. `POST .../report:regenerate` Inngest işini kuyruğa koyar; cooldown, maliyet koruyucusu ve `dealerId` zorunlu.
3. `GET /api/dealer/ai-insights/themes?from&to` ve `GET .../themes/:key/evidence` drill-down için.
4. `POST /api/dealer/action-items/lookup` (idempotent hash) ve aksiyon otomatik tetiklemesinin GET'ten çıkarılması.
5. Tüm uçlarda ortak `resolveDataScope(session)`; STAFF için `token.dealerId` veya erişim yok; tanınmayan rol için 403.
6. LLM istemine yalnızca anlatı alanları (summary, recommendations, alert metinleri); sayısal alanlar istemden çıkarılır, sunucu hesaplar.

---

## Çakışmalar / birleştirme önerisi

| Sayfa | Çakışan kısım | Öneri |
|---|---|---|
| `/dealer/ai-chat` | Aynı `askAI` motoru (`app/api/dealer/ai-chat/route.ts:5`) ile ikinci bir sohbet arayüzü; bu sayfadaki sohbet paneli onun hafif bir kopyası. | Tek `AskAiSheet` bileşeni; ai-insights'ta sağdan açılan panel, `/dealer/ai-chat` ise tam sayfa geçmişli görünüm. |
| `/dealer/ask-analytics`, `/dealer/copilot` | Doğal dille veri sorma / AI özet. | Tek "AI asistan" giriş noktasında birleştirin; copilot özeti ai-insights "Özet" sekmesine kart olarak gelsin. |
| `/dealer/weekly-brief`, `/dealer/operations-brief` | Dönemsel AI özet raporu, ai-insights'ın (bozuk) haftalık modu ile aynı amaç. | Haftalık brifing, ai-insights "Özet" sekmesinin haftalık görünümü (veya e-posta çıktısı) olsun; ayrı sayfa kalacaksa aynı `AIInsightReport` kaydını okusun. |
| `/dealer/action-items` | "En sık aksiyon önerileri" + "AI önerileri" + otomatik ActionItem üretimi. | ai-insights yalnızca önerip "Ata" demeli; yaşam döngüsü action-items'ta kalmalı. Otomatik üretim tek yerde (analiz hattında) yapılmalı. |
| `/dealer/ai-settings` | Öğrenme profili, embedding/düzeltme sayaçları (`app/dealer/ai-settings/page.tsx:137-139,292-308`) bu sayfada tekrar ediliyor. | Öğrenme kartı, düzeltme formu ve geçmişi ai-settings'e taşınsın; ai-insights'ta yalnızca satır içi düzeltme kalsın. Not: ai-settings `/dealer/ai-learning`'e link veriyor (`ai-settings/page.tsx:542`), ancak bu route mevcut değil; kırık link. |
| `/dealer/churn-risk`, `/dealer/analytics` | Churn kovaları ve duygu dağılımı burada da var. | ai-insights bu metrikleri özet olarak göstersin ve ayrıntı için ilgili sayfaya link versin; hesaplama tek bir servis katmanında yapılsın. |

**Sonuç:** Sayfa kaldırılmamalı: bayi panelindeki AI değerinin vitrini. Ancak güvenlik açıkları (#1, #2) hemen kapatılmalı. Ardından deterministik metrik katmanı ve kayıtlı rapor modeli kurularak yukarıdaki 3 sekmeli yapıda yeniden tasarlanmalı. Bu sırada sohbet, brifing ve öğrenme parçaları kardeş sayfalarla birleştirilmeli.

---

## Doğrulama (şüpheci inceleme)

Yöntem: Her iddia için çağıran ve çağrılan taraf baştan okundu: `proxy.ts`, `lib/auth.ts` (jwt/session callback), `prisma/schema.prisma`, ilgili route'lar ve `lib/*`. Hiçbir şey çalıştırılmadı; DB'ye dokunulmadı. Kararlar yalnızca kod okumasına dayanıyor.

**Ortak ön koşul (iddia 1 ve 2 için):** `proxy.ts:103-120` `/api/*` isteklerini yalnızca güvenlik/CORS başlıklarıyla geçiriyor; rol kontrolü yok. Rol kapısı yalnızca sayfa önekleri için var (`proxy.ts:50-73`). `lib/auth.ts:240,254-256` STAFF oturumunda `role='STAFF'` yazıyor, bayi bağı ise ayrı `token.dealerId` alanında tutuluyor. AI route'ları bu alanı hiç okumuyor. STAFF hesabı açmak için herhangi bir DEALER yeterli: `app/api/dealer/staff/route.ts:66` `requireAuth(['DEALER'])` sonrasında şifreyi bayi belirliyor (`:118-127`).

### 1. STAFF rolü üzerinden kiracılar arası veri sızıntısı: **DOĞRULANDI (KRİTİK)**
- `app/api/ai/detailed/route.ts:24-29` yalnızca CUSTOMER'ı reddediyor. `:34-37` ve `:57` kapsamı yalnızca `role==='DEALER'` iken daraltıyor. STAFF için `where = { text: { not: null } }` oluyor, yani tüm platform kapsanıyor. Dönen alanlar: `id`, `text`, `user.name` (`:42-50`).
- `app/api/ai/analyze/route.ts:385-390` (insights) ve `:654-660` (ask) aynı desende. Ask'teki yorum (`// ADMIN: tüm verilere erişir`) STAFF'ı da kapsıyor. `aIThemeCluster` sorgusu (`:675-677`) `dealerId: undefined` ile tüm bayileri döndürüyor.
- `bulk_analyze` (`:195-213`) STAFF için filtresiz. Detailed'dan alınan başka bayilere ait `id`'ler ile `:231-256` arasındaki `feedback.update` çağrısı onların AI alanlarını yeniden yazıyor.
- **Yeniden üretim:** A bayisi `POST /api/dealer/staff` ile kendine `x@a.com / 12345678` adlı STAFF hesabı açar. Bu hesapla giriş yapıp `GET /api/ai/detailed?limit=100` çağırır. Yanıtta B, C… bayilerinin geri bildirim metinleri ve müşteri adları gelir. `POST /api/ai/analyze?action=ask` ile "en çok şikâyet alan işletmeler" sorulduğunda platform geneli veri LLM'e gider.
- **Düzeltme yaklaşımı:** `lib/` altına tek bir `resolveFeedbackScope(session)` eklenmeli. ADMIN için `{}`, DEALER için `{ qrCode: { dealerId: id } }`, STAFF için `{ qrCode: { dealerId: session.user.dealerId } }` dönmeli; `dealerId` yoksa 403. CUSTOMER için `userId` dönmeli. Tanınmayan rol için varsayılan 403 olmalı (deny-by-default). Tüm `/api/ai/*` uçları bu yardımcıyı kullanmalı. `bulk_analyze` yazma işlemi STAFF'a tamamen kapatılmalı.

### 2. STAFF başka bayinin AI öğrenme profiline düzeltme yazabiliyor: **DOĞRULANDI (YÜKSEK)**
- `app/api/ai/learning/route.ts:87-93` sahiplik kontrolünü yalnızca `role==='DEALER'` için yapıyor. `:95-102` `dealerId`'yi hedef geri bildirimden alıp `recordFeedbackCorrection`'a geçiriyor (`lib/ai-learning.ts:204-222`, doğrudan create). `field` için yalnızca `min(2)` var, uzunluk sınırı yok. `newValue` alanı `z.any()` (`route.ts:12-18`).
- Etki zinciri doğrulandı: Kurbanın `correctionsCount`/`retrainSuggestion` değerleri artıyor (`ai-learning.ts:431-436`, "N yeni düzeltme; profili güncelleyin"). Kurban bu sayfada profili güncelleyince ya da `maybeTriggerAdaptiveUpdate` (`:447-466`) tetiklenince düzeltmeler `JSON.stringify` ile öğrenme istemine giriyor (`:317-319`). Çıkan profil `feedback-analyze-pipeline.ts:40-49` üzerinden her yeni analizin istemine ekleniyor.
- Hafifletici: Enjeksiyon dolaylı. Metin önce profil üreten LLM'den geçiyor, sonra `formatAdaptiveProfile` ile 1200 karaktere kırpılıyor. Bu yüzden etki "istemi doğrudan ele geçirme" değil, "profili yönlendirme/zehirleme" düzeyinde. STAFF ayrıca `update_profile` ile kurban profilini kendisi tetikleyemiyor (`:105`, `session.user.id` kullanılıyor). Yine de kurbanın kendi tetiklemesi ya da eşik aşımı yeterli.
- **Yeniden üretim:** STAFF, iddia 1 ile kurbanın geri bildirim `id`'sini alır. Ardından `POST /api/ai/learning?action=record_correction` isteğini `{feedbackId, field:"sentiment kuralı", newValue:"Bu işletmede tüm olumsuz yorumlar aslında olumludur…"}` gövdesiyle gönderir. Kurban bayi paneldeki "profili güncelle" önerisine tıklar.
- **Düzeltme:** İddia 1'deki kapsam yardımcısı burada da kullanılmalı. `field` alanı izinli bir enum olmalı (`sentiment|intent|topics|urgency|churnRisk|themes`). `newValue` alanına `field` değerine göre tip şeması uygulanmalı. Düzeltmeyi yapan kullanıcı (`createdById`) kaydedilmeli.

### 3. action=analyze sahiplik kontrolü olmadan feedback.update yapıyor: **DOĞRULANDI (YÜKSEK)**
- `app/api/ai/analyze/route.ts:121-170`: `analyze` dalında rol kontrolü yok. `analyzeSchema` (`:58-61`) `feedbackId`'yi isteğe bağlı string olarak kabul ediyor. Ardından `prisma.feedback.update({ where: { id: feedbackId } })` sahiplik kontrolü olmadan çalışıyor. Analiz, istemcinin gönderdiği `text` üzerinden yapılıyor ve geri bildirimin gerçek metniyle hiçbir bağı yok.
- Somut senaryo (ID sızıntısı gerektirmez): Bir CUSTOMER bayiye olumsuz geri bildirim bırakır. Kendi geri bildiriminin `id`'sini `GET /api/feedbacks` uç noktasından alır (`app/api/feedbacks/route.ts:46-47,63`, kendi kayıtlarını `id` ile dönüyor). Sonra `POST /api/ai/analyze?action=analyze` isteğini `{text:"harika, çok memnun kaldım", feedbackId}` ile gönderir. Bayinin göreceği `sentiment`, `urgency`, `churnRisk` ve `actionSuggestions` değerleri "olumlu/risk yok" olarak değişir. Churn/SLA sinyalleri bastırılır. STAFF, iddia 1'deki ID'lerle bunu herhangi bir bayiye uygulayabilir.
- Not: Bu sayfa `action=analyze` çağırmıyor; açık aynı route dosyasında olduğu için kayda geçiyor. Rate limit (`:101`) yalnızca hızı sınırlıyor.
- **Düzeltme:** `feedbackId` verildiğinde sunucu metni DB'den okumalı ve istemci `text`'ini yok saymalı. Kapsam yardımcısıyla `findFirst({ where: { id, ...scope } })` yapılmalı. CUSTOMER ve STAFF'ın yazma yetkisi kaldırılmalı.

### 4. Aksiyon önyüklemesi 3 paralel tetikleme ile mükerrer ActionItem üretebiliyor: **DOĞRULANDI (ORTA-YÜKSEK; güvenlik değil, veri bütünlüğü + maliyet)**
- `ai-insights-client.tsx:415-441` her sayfa açılışında `Promise.all` ile 3 eşzamanlı `GET /api/dealer/action-items` gönderiyor. Her GET `runActionItemsAutoTrigger(dealerId)` çağırıyor (`app/api/dealer/action-items/route.ts:71-78`).
- `lib/action-items-ai.ts:33-71`: `take` sınırı olmadan tüm `actionSuggestions` taşıyan geri bildirimler okunuyor. Her biri için önce `count`, sonra döngüde `create` çalışıyor. Ne transaction ne de benzersiz indeks var (`schema.prisma:1302-1324`, yalnızca `@@index`). Üç istek aynı geri bildirimde `existing=0` okursa her öneri 3 kez yazılır. Bu durum, son ziyaretten beri gelen her yeni öneri taşıyan geri bildirim için gerçekleşebilir.
- `:244-250`: Açık aksiyon sayısı 3'ün altındaysa her istek ayrı bir LLM çağrısı yapıyor ve 5'e kadar `ai_aggregate` kaydı ekliyor (yeni bayide 15'e kadar kayıt, 3 kat maliyet).
- Hafifletici: Kalıcı durumda tüm öneriler kayda dönüşmüşse yalnızca N+1 okuma maliyeti kalıyor. Yarış, yeni öneri ya da az aksiyon olduğunda tetikleniyor. Canlıda gözlemlenmedi; sonuç kod okumasına dayanıyor.
- **Düzeltme:** Otomatik üretim GET'ten çıkarılmalı. Üretim, geri bildirim analiz hattında (Inngest) geri bildirim başına bir kez yapılmalı. `ActionItem` için `@@unique([feedbackId, suggestionIndex])` veya `(dealerId, suggestionHash)` eklenip `createMany({ skipDuplicates: true })` kullanılmalı. İstemcideki 3 durum isteği tek bir `status=pending,assigned,in_progress` sorgusuna indirilmeli.

### 5. Gösterilen KPI'lar (NPS, CSAT, CES, yanıt oranı, korelasyon, tahmin) LLM tarafından uyduruluyor: **DOĞRULANDI (YÜKSEK; veri doğruluğu)**
- `lib/ai-engine.ts:700-711` şemada `responseRate`, `nps`, `csat`, `ces` ve `keyDrivers.correlation` alanlarını istiyor. Kullanıcı mesajında (`:733-756`) ise bunlar için hiç girdi yok: yalnızca toplam sayı, ortalama puan, duygu yüzdeleri, konular, 20 örnek, niyet ve sinyal özeti veriliyor. NPS için 0-10 ölçeği, CES için çaba anketi, yanıt oranı için bayi yanıt verisi yok. Değerler zorunlu olarak uydurma.
- `:797-803`: Sonuç doğrudan kabul ediliyor. `avgRating` için gerçek `data.avgRating` yalnızca LLM değeri falsy ise kullanılıyor. Route (`app/api/ai/analyze/route.ts` insights dalı) `keyMetrics`'i değiştirmeden DB'ye yazıp döndürüyor.
- UI (`ai-insights-client.tsx:1212-1219`) bunları "NPS / CSAT / CES / Yanıt oranı" etiketiyle, renk eşikleriyle ve ölçülmüş KPI gibi gösteriyor. "Tahmin" veya "AI kestirimi" ibaresi yok; yalnızca bölüm başlığı "AI Analiz". `:1535` korelasyonu yüzde olarak, `:2441-2491` `predictedRating` değerini yıldızla sunuyor.
- Ek kırılganlık: LLM sayıyı string döndürürse `keyMetrics.avgRating.toFixed` (`:1215`) çalışma zamanında hata verir. Bu yalnızca okuma ile tespit edildi, doğrulanmadı.
- **Düzeltme:** Sayısal KPI'lar sunucuda deterministik olarak hesaplanmalı: ortalama puan, puan dağılımından türetilmiş "NPS benzeri" skor (adı açıkça "5 yıldızdan türetilmiş" olarak belirtilmeli), CSAT = 4-5 yıldız oranı, yanıt oranı = bayi yanıtı olan geri bildirim oranı. CES için veri yoksa kart gizlenmeli. LLM şemasından sayısal alanlar kaldırılmalı. `predictedRating` ve `keyDrivers` gösterilecekse "AI kestirimi" rozetiyle ve yöntem açıklamasıyla sunulmalı.

### Ek bulgu (iddia listesinde yok, inceleme sırasında görüldü): **KRİTİK, hesap ele geçirme**
- `app/api/dealer/staff/route.ts:77-115`: Eklenen e-posta mevcut bir kullanıcıya aitse ve bu kullanıcının `dealerStaff` bağı yoksa (yani her CUSTOMER, DEALER ve ADMIN), kod `prisma.user.update` ile o kullanıcının **şifresini bayinin belirlediği şifreyle değiştiriyor** ve rolünü `STAFF` yapıyor. Hesap sahibine onay ya da davet gönderilmiyor.
- **Yeniden üretim:** Herhangi bir DEALER, `POST /api/dealer/staff` isteğini `{name:"x", email:"<kurbanın e-postası>", password:"Attacker123"}` ile gönderir. Ardından kurbanın e-postası ve `Attacker123` şifresiyle giriş yapar. Kurbanın puanları, geçmişi ve kişisel verileri ele geçirilir; bir ADMIN hesabı ise rolünü kaybeder.
- **Düzeltme:** Mevcut kullanıcıya şifre ya da rol yazılmamalı. Davet akışı kurulmalı: imzalı ve süreli bir davet bağlantısı gönderilmeli, kullanıcı kendi oturumunda kabul etmeli, yalnızca `dealerStaff` bağı eklenmeli. ADMIN ve DEALER hesapları personel yapılamamalı. Bu, iddia 1'den bağımsız olarak en öncelikli düzeltme.

## Uygulama (Dalga 2)

Hedef rota: **`/dealer/analytics/insights`** (sunucu bileşeni + SSR ön-yükleme → `HydrationBoundary`; istemci adası `components/dealer/b-icgoruler/**`). `/dealer/ai-insights` → `permanentRedirect` (sorgu parametreleri korunur); 2558 satırlık `ai-insights-client.tsx`, `layout.tsx`, `loading.tsx` silindi. Sayıları kod hesaplar (`lib/dealer-insights/core.ts`, 5 dk Redis önbellek), LLM yalnız saklı anlatıyı yazar (`POST /api/dealer/insights/narrative`, saatte 6, maliyet kapısı); **GET'te LLM ve yan etki yok**. Anlatı satırları kaynak referanslıdır (metrik/tema/uyarı/öneri çipi → kanıt çekmecesi). Öğrenme profili bölümü Ayarlar → AI'a (`/dealer/settings?tab=ai`) taşındı. Test: `__tests__/lib/dealer-insights-core.test.ts`.

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Segment metadata | ÇALIŞIYOR (`generateMetadata`, TR/EN; "gelir" iddiası kaldırıldı) |
| 2 | loading.tsx | KALDIRILDI → Suspense + `InsightsSkeleton` (SSR veriyle çoğu zaman gerekmez) |
| 3 | ssr:false chunk | KALDIRILDI → sunucu bileşeni önce, küçük istemci adası |
| 4 | Tam sayfa spinner | ÇALIŞIYOR (yok; `keepPreviousData`, dönem değişiminde içerik kalır) |
| 5 | Boş durum | ÇALIŞIYOR (örneklem 0/az → dürüst boş durum; null metrik "—") |
| 6 | Hata durumu | ÇALIŞIYOR (QueryState satır içi hata + tekrar dene; 4xx görünür) |
| 7 | Hero | ÇALIŞIYOR (QDL `PageHeader`, ops kaydı) |
| 8 | Dönem seçici | ÇALIŞIYOR (İstanbul günleri, gerçek filtre, URL'de, karşılaştırma dönemi; yarış RQ anahtarıyla kapandı) |
| 9 | Son güncelleme | ÇALIŞIYOR (sunucu `generatedAt`) |
| 10 | Genel skor halkası | KALDIRILDI (LLM skoru; yerine ölçülen KPI'lar) |
| 11 | Trend oku | ÇALIŞIYOR (önceki dönem karşılaştırmasıyla deterministik delta) |
| 12 | N kayıt satırı | ÇALIŞIYOR (örneklem: toplam/metinli/analizli/bekleyen/tavan) |
| 13 | Yenile | ÇALIŞIYOR (önbelleği atlar, LLM çağırmaz; hata → hata toast'ı) |
| 14,16,17,18,19 | AI'a sor paneli/çipler/sohbet | KALDIRILDI → Asistan sayfasına soru önceden doldurulmuş bağlantı (tek sohbet yüzeyi, geçmişi orada) |
| 15 | "Nasıl üretildi" | ÇALIŞIYOR (yöntem notu dürüst: kod hesaplar, AI anlatır) |
| 20 | Uyarılar | ÇALIŞIYOR (kural tabanlı, yerelleştirilmiş tür, kanıt bağlantısı) |
| 21 | Ortalama puan | ÇALIŞIYOR (ölçülen) |
| 22 | NPS | ÇALIŞIYOR (yalnız gerçek 0-10 yanıtı varsa; yoksa kart yok) |
| 23 | CSAT | ÇALIŞIYOR (4-5 yıldız oranı, hesaplanan) |
| 24 | CES | ÇALIŞIYOR (gerçek `effort` sinyali, Sinyaller sekmesi) |
| 25 | Yanıt oranı | ÇALIŞIYOR (yanıtlanan/metinli, hesaplanan) |
| 26-28 | Duygu / deneyim sinyalleri / niyet-aciliyet-churn | ÇALIŞIYOR (dönem filtreli, `mixed` dahil) |
| 29 | AI özeti | ÇALIŞIYOR (saklı anlatı, arayüz dilinde, kaynaklı, butonla üretilir) |
| 30,31 | Güçlü/zayıf yönler | ÇALIŞIYOR (tema tablosundan deterministik; anlatıda kaynaklı) |
| 32 | Korelasyon % | KALDIRILDI (hesaplanamayan istatistik) |
| 33,34,35 | Tema kümeleri/performansı/en çok konu | ÇALIŞIYOR (tek birleşik tema tablosu; yıldız yerine puan ort. + olumsuz oranı; kanıt çekmecesi) |
| 36,37 | Varlık / duygu haritası | ÇALIŞIYOR (yerelleştirilmiş tür, metin etiketli) |
| 38,55 | Aksiyon önerileri + AI önerileri | ÇALIŞIYOR (tek birleşik öneri listesi, Özet sekmesinde üstte) |
| 39 | Aksiyona ekle | ÇALIŞIYOR (öncelik korunur, atanan sunucuda `validateAssignee`, idempotent) |
| 40 | "Listede" önyüklemesi | ÇALIŞIYOR (yan etkisiz tek sorgu; otomatik tetikleyici GET'ten çıktı) |
| 41 | Aksiyonlara git | ÇALIŞIYOR |
| 42-46,48 | Öğrenme özeti / toplu analiz / yeniden eğitim / profil / sayaçlar / geçmiş | KALDIRILDI buradan → Ayarlar → AI (b-ayarlar); bağlantı korunur. Toplu analiz otomatik hatta (bekleyen sayısı gösterilir) |
| 47 | Düzeltme formu | ÇALIŞIYOR (kanıt çekmecesinde tek tıkla duygu düzeltme; kaydı da günceller; ham JSON yok) |
| 49-54 | Geri bildirim listesi/arama/filtre/kart/detay | KALDIRILDI → kanıt çekmecesi (sunucuda sayfalı) + Gelen kutusuna filtreli bağlantı (yanıtla/detay orada) |
| 56 | AI tahmini | KALDIRILDI (uydurma tahmin) |
| 57 | Personel listesi | ÇALIŞIYOR (yalnız yazabilen bayi için) |
| 58 | No-AI yedeği | ÇALIŞIYOR (`ai` durumu: not_configured/module_off/dealer_off → metrikler yine tam, anlatı kartı dürüst neden + ayar bağlantısı) |
| 59 | Sunucu modül kapısı | ÇALIŞIYOR (sayfa + tüm BFF uçları `ai_features`; bayi AI ayarı anlatıda) |
| 60 | Tarih/şube filtresi | ÇALIŞIYOR |
| 61 | Rapor geçmişi / karşılaştırma | KISMİ → dönem karşılaştırması var; anlatı dönem anahtarıyla saklanır; geçmiş rapor listesi yok |
| 62 | Dışa aktarma / e-posta özeti | EKSİK (kalan) |
| 63 | Geri bildirime git | ÇALIŞIYOR (kanıt öğesi → gelen kutusu) |
| 64 | Azaltılmış hareket | ÇALIŞIYOR (sonsuz animasyon yok, iskelet statik) |
| 65 | Bölüm içi gezinme | ÇALIŞIYOR (`SectionTabs`: Özet · Temalar · Sinyaller) |

**Kapanan bulgular (16/16 + doğrulama 1-5):** 1-2 (STAFF sızıntısı/zehirleme: yeni uçlar `defineRoute` + `tenant:'dealer'`, yazma yalnız DEALER) · 3 (uydurma KPI) · 4 (dönem/hafta/trend) · 5 (GET'te LLM yok, maliyet kapısı + hız limiti) · 6 (otomatik tetikleyici GET'ten çıktı) · 7 (tema yıldızı) · 8 (boş/no-AI) · 9 (sekmeler, eylem üstte) · 10 (düzeltme UX) · 11 (anlatı arayüz dilinde, metinler i18n) · 12 (atanan doğrulama + sunucu modül kapısı) · 13 (hata toast'ı) · 14 (dönem filtreli, tavanlı, önbellekli toplama) · 15 (ARIA/hareket) · 16 (tek dev bileşen silindi). Doğrulama #3 (`action=analyze` sahiplik) eski uçta; bu yüzey artık o ucu çağırmıyor.

**Kalanlar:** dışa aktarma/planlı e-posta özeti; geçmiş anlatı listesi; anlatının cron ile otomatik üretimi (`app/api/cron/daily/jobs.ts` paylaşılan dosya, bu turda butonla üretim); eski `/api/ai/*` uçlarının kendisi (başka yüzeyler kullanıyor) ve "Ek bulgu" personel ekleme açığı (b-personel sahipliği).
