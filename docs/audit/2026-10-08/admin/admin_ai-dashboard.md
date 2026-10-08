# /admin/ai-dashboard

**Amaç:** Platform operatörüne tüm sistemdeki AI analizinin durumunu tek ekranda göstermek: geri bildirim duygu/niyet dağılımı, tema kümeleri, bayi bazlı AI sonuçları, kritik sinyaller (acil/toksik/churn), AI motorunun sağlığı (çağrı, başarı, gecikme, model) ve doğal dilde soru sorulabilen bir admin AI asistanı.

**Genel puan: 3.5 / 10** · **Karar: yeniden inşa** (veri katmanı baştan; `/admin/ai-detailed` ile tek "AI Operasyon Merkezi" altında birleştirilerek)

Kısa hüküm: Sayfa görsel olarak düzgün görünse de ekrandaki sayıların önemli bir kısmı ya yanlış ya da güvenilmez. En ağır sorun: "Veri doldur" düğmesi canlı üretim veritabanındaki gerçek `Feedback` satırlarına puandan türetilmiş sahte AI sinyalleri yazıyor ve bu satırları gerçek AI analizinden kalıcı olarak çıkarıyor. Bunun yanında sayfanın her açılışında ölçülmeyen (cost guard dışı) bir LLM raporu üretilip veritabanına yazılıyor ama ekranda hiç gösterilmiyor. "AI başarı / çağrı / model" kartları ise sunucusuz örneğin belleğinden okunuyor, yani fiilen sahte.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Chat çalışıyor; ancak AI sağlık metrikleri bellek-içi (sahte), toplam sayılar örnekleme sınırına takılıyor, "Veri doldur" üretim verisini bozuyor. |
| UX | 4/10 | Okunur bir dashboard iskeleti var ama tarih aralığı, drill-down, son güncelleme zamanı, aksiyon bağlantısı yok; uyarı kartları tıklanamıyor. |
| Görsel | 5/10 | Diğer admin sayfalarıyla tutarlı (AdminPremiumHero + cam kartlar) ama hiyerarşi düz; her kart aynı ağırlıkta, mojibake metinler ve TR/EN karışıklığı var. |
| Mimari | 3/10 | 3 farklı uçtan, 3 farklı zaman penceresi ve örneklemle toplanan veriler istemcide birleştiriliyor; GET niteliğindeki okuma bir POST + LLM + DB yazımı tetikliyor. |
| Performans | 2/10 | İlk boyama, LLM üretimi (retry ile ~18 sn ek gecikmeye kadar) bitene kadar tam sayfa spinner'da bekliyor; bayi ucu tüm bayiler × tüm QR × 500 feedback metnini belleğe çekiyor. |
| Erişilebilirlik + Mobil | 4/10 | Global `MotionConfig reducedMotion="user"` var; fakat ikon-butonlarda aria-label yok, chat'te `aria-live` yok, grafikler metinsel alternatifsiz, mobilde rozet satırı taşabiliyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Yetki kontrolü (sayfa + API) | ÇALIŞIYOR | `proxy.ts:51,79`; `app/api/admin/dealers-ai-stats/route.ts:11`; `app/api/ai/analyze/route.ts:945`; `app/api/admin/bootstrap/route.ts:106` | `/admin` proxy ile ADMIN + gizli kapı; `usage_stats` ve bootstrap ADMIN'e kilitli. `insights` DEALER'a da açık ama scope'lu. |
| 2 | Tam sayfa yükleniyor durumu | KISMİ | `page.tsx:236-243` | Tek spinner; 3 isteğin en yavaşı (LLM raporu) bitmeden hiçbir şey çizilmiyor. İskelet/kısmi render yok. |
| 3 | Hata durumu | KISMİ | `page.tsx:121-122,167-172` | `insightsRes.ok`/`usageRes.ok` kontrol edilmiyor; 403/500/429'da sayfa sessizce sıfırlarla dolu render ediliyor. Yalnız ağ istisnasında toast. Hata kartı/yeniden dene yok. |
| 4 | Hero başlık + açıklama | ÇALIŞIYOR | `page.tsx:247-255` | |
| 5 | Hero "Toplam analiz" rozeti | KISMİ | `page.tsx:261`; `dealers-ai-stats/route.ts:25,49` | Son 90 gün ve QR başına 500 kayıt sınırlı örneklem; "toplam" değil. |
| 6 | Hero "AI başarı %" rozeti | BOZUK | `page.tsx:265`, `page.tsx:160` | `successRate || 100`: gerçek %0 başarı (tam kesinti) **%100** gösterilir; veri yoksa da %100. Kaynak bellek-içi (bkz. #24). |
| 7 | "Yenile" düğmesi | KISMİ | `page.tsx:200-205` | `fetchStats` hatayı içeride yuttuğu için her durumda "güncellendi!" toast'ı çıkar; her tıklama yeni bir LLM raporu üretir (bkz. B2). |
| 8 | "Veri doldur" düğmesi | BOZUK (tehlikeli) | `page.tsx:175-198,273-276`; `app/api/admin/bootstrap/route.ts:449-488` | Gerçek feedback'lere sezgisel sahte sinyal yazar, `aiProcessedAt` doldurur → gerçek analiz bir daha yapılmaz. Onay yok, yükleniyor durumu yok, çift tıklamaya açık. (B1) |
| 9 | "AI'a Sor" aç/kapa | ÇALIŞIYOR | `page.tsx:277-280,301-303` | `aria-expanded` yok. |
| 10 | Boş veri uyarı kartı + "AI verisini başlat" | BOZUK | `page.tsx:286-298` | Metin mojibake: "hen?z ?retilmemi? g?r?n?yor", "ba?lat". Aynı tehlikeli bootstrap aksiyonunu tetikler. |
| 11 | Chat boş durumu + önerilen sorular | KISMİ / yanıltıcı | `page.tsx:318`; `app/api/ai/analyze/route.ts:752-774` | 4 sorudan 2'si ("En çok şikâyet alan dealer kim?", "Churn riski yüksek müşteriler hangi dealer'da?") bayi kırılımı gerektiriyor; `askAI` bağlamında bayi adı/kimliği **hiç yok** → model uydurmak zorunda. |
| 12 | Mesaj gönderme (Enter / Gönder) | ÇALIŞIYOR | `page.tsx:207-234,355-358` | IME (`isComposing`) koruması yok; Gönder ikon butonunda aria-label yok. |
| 13 | Çok turlu sohbet (`conversationId`) | ÇALIŞIYOR | `page.tsx:218,223`; `route.ts:639-651,776-805` | Sahiplik kontrolü doğru (`dealerId: conversationUserId`). |
| 14 | "Yazıyor" göstergesi | ÇALIŞIYOR | `page.tsx:341-352` | `animate-bounce` azaltılmış harekette de çalışıyor (doğrulanmadı: globals.css'teki reduce kuralının kapsamı). |
| 15 | Otomatik kaydırma | KISMİ | `page.tsx:99-101` | `scrollIntoView` tüm atası kaydırıcıları (ana `main`) da kaydırır; kullanıcı aşağıda bir kart okurken her yanıtta sayfa chat'e zıplar. |
| 16 | Chat hata gösterimi | KISMİ | `page.tsx:224-229`; `lib/ai-engine.ts:958-962` | `askAI` hata durumunda `'Bir hata oluştu…'` metnini **başarılı yanıt** gibi döndürür (`success:true`), sohbet geçmişine kaydedilir ve sonraki turların bağlamını kirletir. Hata ile cevap görsel olarak ayrışmıyor. |
| 17 | Sohbet geçmişi / yeni sohbet / temizle | EKSİK | `page.tsx:90-93` | Sohbetler DB'ye kaydediliyor (`AIConversation`) ama listelenemiyor, yeni sohbet başlatılamıyor (sayfa yenilemek dışında). |
| 18 | Yanıtta Markdown / kaynak gösterimi | EKSİK | `page.tsx:333-335` | Düz `whitespace-pre-wrap`; LLM'in liste/kalın biçimi ham görünür. Yanıtın hangi veriye dayandığı gösterilmiyor. |
| 19 | Kritik uyarı kartları (Acil / Toksik / Churn) | KISMİ | `page.tsx:366-408`; `dealers-ai-stats/route.ts:101-104` | Sayılar tıklanamıyor (ilgili feedback listesine drill-down yok); bootstrap sahte sinyalleri sayıları şişirir (puan ≤2 → urgency 0.78, churn 0.72 → ikisinde de sayılır). `border-0` + `border-red-500/20` çelişkili sınıf (`page.tsx:370,383,396`). |
| 20 | "Toplam Feedback" kartı | BOZUK | `page.tsx:148,413`; `route.ts:401-430,455` | Değer = son 300 feedback + son 300 ConsumptionReview örneği; en fazla 600'de tavan yapar, gerçek toplam değildir. Silinmiş (soft-delete) feedback'ler de dahil. |
| 21 | "AI Analiz Edilmiş" kartı | KISMİ | `page.tsx:149,414` | 90 günlük farklı bir örneklemden gelir → "AI Analiz Edilmiş" > "Toplam Feedback" çıkabilir. |
| 22 | "Ort. Puan" kartı | KISMİ | `page.tsx:150,415`; `route.ts:456` | Feedback ve ConsumptionReview karışık 600'lük örneklemin ortalaması; tarih filtresi yok. |
| 23 | "AI Model" kartı | SAHTE | `page.tsx:161,416`; `lib/ai-engine.ts:1096-1109` | Sunucusuz örneğin bellek dizisinden; soğuk başlangıçta boş → çoğunlukla "N/A". |
| 24 | AI Performans: Toplam Çağrı | SAHTE | `page.tsx:141,449`; `route.ts:949`; `lib/ai-engine.ts:1096` | `getRecentUsageLogs(100)` bellek-içi; o lambda örneğinin gördüğü ≤100 çağrı. DB'deki `aIUsageLog` (`dbLogs`) döndürülüyor ama sayfada kullanılmıyor. |
| 25 | AI Performans: Başarı Oranı | BOZUK | `page.tsx:453` | #6 ile aynı `|| 100` hatası. |
| 26 | AI Performans: Ort. Yanıt (ms) | KISMİ | `page.tsx:143-145,457` | Bellek-içi örnek; p50/p95 yok, ortalama tek başına yanıltıcı. |
| 27 | Başarı oranı ilerleme çubuğu | BOZUK | `page.tsx:463` | Aynı `|| 100` hatası; ARIA `progressbar` rolü yok. |
| 28 | Duygu dağılımı yüzdeleri | KISMİ | `page.tsx:479-495`; `route.ts:458-466` | Yüzde normalizasyonu doğru (`route.ts:26-55`) ama örneklem 600 kayıtla sınırlı, dönem belirtilmiyor. |
| 29 | Duygu yığılmış çubuğu | ÇALIŞIYOR | `page.tsx:496-500` | Metinsel alternatif/aria yok. |
| 30 | Niyet (Intent) dağılımı | KISMİ | `page.tsx:507-542`; `dealers-ai-stats/route.ts:63,105-109` | 90 günlük farklı pencere; bootstrap sahte `complaint/praise` atamaları karışır. Varsayılan nesne her zaman truthy olduğundan kart sıfırlarla da görünür. |
| 31 | En çok bahsedilen konular | KISMİ | `page.tsx:545-570`; `lib/ai-engine.ts:199-200` | Konu anahtarları İngilizce (`service`, `price`…) ve `capitalize` ile TR arayüzde İngilizce görünür. `w-24` etiket kesilme kontrolü yok. |
| 32 | Tema kümeleri | KISMİ | `page.tsx:573-604`; `lib/ai-engine.ts:602-605`; `types/index.ts:206` | `mixed` duygusu "Nötr" etiketlenir; `avgScore*5` "/5 yıldız" olarak sunuluyor ama `AITheme.score` bir puan değil tema skoru. Her sayfa yüklemesinde LLM ile yeniden hesaplanıyor. |
| 33 | Dealer AI Performansı listesi | KISMİ | `page.tsx:607-643`; `dealers-ai-stats/route.ts:133,140` | Açıklama "AI analiz sonuçlarına göre sıralama" diyor, gerçekte **feedback adedine** göre sıralı. Satırlar tıklanamaz; bayi detayına bağlantı yok; ilk 20 ile sınırlı ve bunu belirtmiyor. |
| 34 | Son AI analizleri | KISMİ | `page.tsx:646-680`; `dealers-ai-stats/route.ts:112-121` | Duygu/niyet ham İngilizce (`positive`, `complaint`); `bootstrap-heuristic` kayıtları "AI analizi" olarak listelenir (model rozeti yok); metin kesik, açılamaz, feedback'e gidilemez; rozet satırında `flex-wrap` yok. |
| 35 | AI içgörü raporu üretimi (arka plan) | SAHTE / ölü iş | `page.tsx:137`; `route.ts:532-595` | Her açılış/yenilemede LLM raporu üretilip `AIInsightReport`'a upsert ediliyor; `const report` sayfada hiç kullanılmıyor. Maliyet + DB yazımı, sıfır değer. |
| 36 | Tarih aralığı / dönem filtresi | EKSİK | `page.tsx:111` | `type:'monthly'` gönderiliyor ama tarih filtresi uygulanmıyor (yalnız rapor tipi etiketi). |
| 37 | Dışa aktarma (CSV) | EKSİK | — | |
| 38 | Son güncelleme zamanı / otomatik yenileme | EKSİK | — | Redis 60 sn cache'i (`dealers-ai-stats/route.ts:149`) var ama kullanıcı verinin yaşını bilmiyor. |
| 39 | AI maliyet / token / bütçe izleme | EKSİK | `prisma/schema.prisma:2229-2247` | `AIUsageLog` token alanları var; sayfa bunları göstermiyor. |
| 40 | Mobil yerleşim | KISMİ | `page.tsx:257-281,517,661` | Hero butonları alt alta tam genişlik (iyi); 5'li intent ızgarası 2 sütunda yetim kart bırakıyor; son analiz rozet satırı dar ekranda taşabilir. |
| 41 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232`; `page.tsx:72-81,497-499` | `MotionConfig reducedMotion="user"` transform'ları kapatır; `width`/`opacity` animasyonları ve CSS `animate-bounce/spin` sürer. |
| 42 | Erişilebilirlik (aria, etiket, canlı bölge) | KISMİ | `page.tsx:356-357,312` | Input'ta `aria-label`/`<label>` yok, ikon butonda erişilebilir ad yok, mesaj listesi `role="log"`/`aria-live` değil. |

**Durum özeti:** ÇALIŞIYOR 7 · KISMİ 20 · BOZUK 6 · SAHTE 3 · EKSİK 6 (toplam 42)

---

## Bulgular

### B1 — "Veri doldur" canlı üretim feedback'lerine sahte AI sinyali yazıyor ve gerçek analizi kalıcı engelliyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü
- **Kanıt:** `app/admin/ai-dashboard/page.tsx:175-198, 273-276, 292-295`; `app/api/admin/bootstrap/route.ts:449-488`; `app/api/cron/ai-retry/route.ts:36-40`
- **Sorun:** `synthesize_ai_signals` son 250 metinli feedback'ten `aiProcessedAt` boş olanların her birine puandan türetilmiş sabit değerler yazar (`urgency 0.78 / churnRisk 0.72 / intent 'complaint'` puan ≤2 için) ve `aiProcessedAt: new Date()` set eder. `ai-retry` cron'u yalnız `aiProcessedAt: null` olanları yeniden analiz ettiği için bu feedback'ler **bir daha asla gerçek LLM analizinden geçmez**. Aynı veriler bayi panellerindeki acil/churn uyarılarını, intent dağılımını, `Son AI analizleri` listesini besler; yani admin bir düğmeye bastığında tüm bayilerin AI içgörüleri sahte sinyalle kirlenir. Ek olarak: onay adımı yok, yükleniyor/disabled durumu yok (çift tıklama iki paralel yazım), 250 ardışık `update` (N+1), silinmiş feedback'ler filtrelenmiyor (`deletedAt` koşulu yok), işlem geri alınamaz ve kayıt (audit) tutulmuyor. Düğme adı "Veri doldur" demo seed izlenimi veriyor; gerçek verinin üzerine yazdığı anlaşılmıyor.
- **Profesyonel öneri:** Bu aksiyonu üretimden kaldırın. Gerçek ihtiyaç "analiz edilmemiş feedback birikimini eritmek" ise doğru araç, `ai-retry` kuyruğunu manuel tetikleyen bir "Bekleyen analizleri işle (N adet)" aksiyonudur: sunucuda bekleyen sayıyı gösteren bir `GET /api/admin/ai/backlog`, tetiklemek için `POST /api/admin/ai/backlog/process` (cron ile aynı fonksiyonu, zaman bütçesiyle çağırır), onay diyaloğu (etkilenecek adet + tahmini maliyet), işlem sırasında ilerleme ve `AdminAuditLog` kaydı. Halihazırda yazılmış sahte kayıtlar için `aiModelUsed = 'bootstrap-heuristic'` olanları `aiProcessedAt = null`'a geri çeken tek seferlik bir düzeltme betiği planlanmalı (ayrı, onaylı iş). Demo/seed ihtiyacı varsa yalnız `NODE_ENV !== 'production'` ve ayrı seed verisi üzerinde.
- **Efor:** M

### B2 — Her sayfa açılışı ve "Yenile" ölçülmeyen bir LLM raporu üretip DB'ye yazıyor; sonuç ekranda kullanılmıyor
- **Önem:** yüksek · **Kategori:** maliyet / performans / mimari
- **Kanıt:** `page.tsx:108-112, 137`; `app/api/ai/analyze/route.ts:483-491, 532-595`; `lib/ai-engine.ts:624-640` (cost guard çağrısı yok; karşılaştırma: `lib/ai-engine.ts:115-117, 307`)
- **Sorun:** Sayfa salt okuma için `POST ?action=insights` çağırıyor. Bu uç `clusterThemes` (çoğu durumda LLM) + `generateInsightReport` (LLM) çalıştırıyor ve `AIInsightReport`'a `dealerId:'system'` ile upsert ediyor. `report` değişkeni sayfada hiç okunmuyor (`page.tsx:137`). `generateInsightReport`, `clusterThemes` ve `askAI` `checkAiCostGuard`/`recordAiCostUsage` çağırmıyor; yani bu harcama bütçe korumasının ve `AIUsageLog` muhasebesinin tamamen dışında. Ayrıca `withRetry` rate limit'te 3+6+9 sn bekleyebildiği için ilk boyama 20 sn'yi aşabilir ve kullanıcı bu sürede yalnız spinner görür. Aynı uç dakikada 20 istekle sınırlı (`route.ts:24,101`) ve her yükleme 2 istek harcıyor; birkaç yenileme sonrası chat 429 alır.
- **Profesyonel öneri:** Okuma ile üretimi ayırın. (1) Dashboard için `GET /api/admin/ai/overview?from&to` adlı tek bir, saf okuma ucu: tüm sayılar Prisma `count/groupBy/aggregate` ile DB'de hesaplanır, Upstash'te 60–120 sn cache'lenir; LLM çağrısı yoktur. (2) Tema kümeleri ve "sistem içgörü raporu" cron ile (günlük) üretilip `AIThemeCluster`/`AIInsightReport`'tan okunur; sayfada "Son rapor: 08.10 03:00 · Yeniden üret" düğmesi açık bir maliyet uyarısıyla sunulur. (3) `generateInsightReport/clusterThemes/askAI` için `checkAiCostGuard('system')` + `recordAiCostUsage` zorunlu hale getirilir (proje bellek notundaki "her LLM yolu ölçülmeli" ilkesi).
- **Efor:** L

### B3 — AI sağlık metrikleri (çağrı, başarı, gecikme, model) sunucusuz örneğin belleğinden okunuyor ve %0 başarıyı %100 gösteriyor
- **Önem:** yüksek · **Kategori:** yanlış veri / gözlemlenebilirlik
- **Kanıt:** `lib/ai-engine.ts:1096-1109` (`const usageLog: AIUsageEntry[] = []`); `app/api/ai/analyze/route.ts:949-959`; `page.tsx:138-161, 265, 453, 463`
- **Sorun:** Vercel'de her istek farklı bir örneğe düşebilir; bellek dizisi soğuk başlangıçta boş, örnekler arası paylaşılmaz. Sonuç: "Toplam Çağrı" anlamsız (genelde 0), "AI Model" çoğunlukla `N/A`, başarı oranı veri yoksa sabit 100. Daha kötüsü `stats?.aiUsageStats.successRate || 100` ifadesi gerçek `0`'ı falsy saydığı için **tam bir AI kesintisinde ekranda %100 başarı** gösterir — bir kontrol merkezinin yapabileceği en tehlikeli yanılgı. DB'deki `aIUsageLog` (`dbLogs`) uçtan dönüyor ama hiç kullanılmıyor; üstelik `recordAiCostUsage` yalnız başarılı çağrıları ve yalnız `dealerId`'li yolları yazıyor (`lib/ai-cost-guard.ts:56-77`), başarısızlıklar DB'ye hiç düşmüyor.
- **Profesyonel öneri:** `logAIUsage`'ı kalıcı hale getirin: her LLM çağrısı (başarılı/başarısız, `action`, `model`, token, latency, hata kodu) `AIUsageLog`'a yazılsın (yüksek hacimde Redis'te tampon + toplu yazım). Dashboard'da `groupBy(action, success)` + p50/p95 latency (Postgres `percentile_cont`) ile son 24 sa / 7 gün metrikleri; "Yerel yedek analiz oranı" (`getFallbackStats` mantığının DB versiyonu) ayrı KPI. `||` yerine `??` kullanın ve "veri yok" durumunu "—" ile gösterin, asla varsayılan %100 değil.
- **Efor:** M

### B4 — KPI'lar üç farklı zaman penceresi ve örneklemden geliyor; "Toplam Feedback" gerçek toplam değil
- **Önem:** yüksek · **Kategori:** yanlış veri
- **Kanıt:** `app/api/ai/analyze/route.ts:401-430, 455` (son 300 Feedback + son 300 ConsumptionReview, tarih filtresi yok, `deletedAt` filtresi yok); `app/api/admin/dealers-ai-stats/route.ts:25-50` (son 90 gün, `deletedAt: null`); `page.tsx:148-149, 165`
- **Sorun:** "Toplam Feedback" ≤600'de tavan yapar ve iki farklı modeli karıştırır; "AI Analiz Edilmiş" 90 günlük başka örneklemden gelir, bu yüzden "analiz edilen > toplam" gibi tutarsızlıklar oluşabilir. Duygu, ortalama puan ve konular 600'lük karışık örneklemden; intent, acil/toksik/churn 90 günden. Soft-delete edilmiş feedback'ler bir uçta sayılıyor, diğerinde sayılmıyor. Kullanıcı hiçbir kartta hangi dönemi gördüğünü bilmiyor.
- **Profesyonel öneri:** Tek bir dönem kavramı (`from/to`, varsayılan son 30 gün) ve tek bir sorgu katmanı: `count`, `aggregate(_avg rating)`, `groupBy(sentiment|intent)`, `count(urgency>=0.7)` vb. DB'de, aynı `where` ile (her zaman `deletedAt: null`). ConsumptionReview ayrı bir seri olarak (ör. "Tüketim yorumları") ya da açıkça birleştirildiği belirtilerek gösterilmeli. Her KPI'da önceki döneme göre delta.
- **Efor:** M

### B5 — `dealers-ai-stats` tüm bayileri × tüm QR'ları × feedback metinlerini belleğe çekiyor; "bayi başına 500" sınırı aslında QR başına
- **Önem:** orta · **Kategori:** performans / doğruluk
- **Kanıt:** `app/api/admin/dealers-ai-stats/route.ts:21-26, 28-56, 133-141`
- **Sorun:** Yorum "bayi başına makul tavan" diyor ama `take: 500` iç içe `qrCodes.feedbacks` ilişkisinde, yani **QR başına** uygulanıyor; çok QR'lı bayilerde binlerce satır + tam `text` alanı çekilir. Kodun kendi notu bu taramanın canlıda ~19 sn sürdüğünü söylüyor; 60 sn Redis cache yalnızca semptomu gizliyor. Ayrıca sıfır feedback'li bayiler de yükleniyor, intent/acil sayımı JS'te yapılıyor, liste feedback adedine göre sıralanıp "AI sonuçlarına göre" diye sunuluyor (`page.tsx:614`).
- **Profesyonel öneri:** Bayi metriklerini `feedback.groupBy({ by: ['qrCodeId'] })` → QR→bayi eşlemesi veya tek bir `$queryRaw` (JOIN qr_codes, GROUP BY dealer_id: count, avg(rating), sum(sentiment='negative'), sum(urgency>=0.7)…) ile DB'de hesaplayın. "Son analizler" için ayrı `findMany({ take: 20, orderBy: aiProcessedAt desc, select: kısa alanlar })`. Liste için kullanıcı seçimli sıralama (hacim / olumsuz oran / acil sayısı / ortalama puan) ve "riskli bayiler" varsayılanı.
- **Efor:** M

### B6 — Önerilen chat soruları, asistanın elinde olmayan veriyi soruyor (halüsinasyon davetiyesi)
- **Önem:** orta · **Kategori:** ürün doğruluğu / AI güvenilirliği
- **Kanıt:** `page.tsx:318`; `app/api/ai/analyze/route.ts:752-774`; `lib/ai-engine.ts:868-880` (`AskAIContext` alanları)
- **Sorun:** "En çok şikâyet alan dealer kim?" ve "Churn riski yüksek müşteriler hangi dealer'da?" soruları bayi kırılımı ister; `askAI`'a verilen bağlamda bayi adı/kimliği yok (yalnız toplamlar, 15 son metin, temalar, intent, 7 günlük trend). Model ya "bilmiyorum" der ya da (daha olası) uydurur; admin yanlış bir bayiye aksiyon alabilir. Ayrıca `askAI` hata durumunda `success:true` ile hata metni döndürüyor ve bu metin sohbet geçmişine kaydediliyor (`lib/ai-engine.ts:958-962`, `route.ts:780-801`).
- **Profesyonel öneri:** Admin asistanını araç-çağırmalı (tool calling) hale getirin: `get_dealer_ranking(metric, period)`, `get_feedback_samples(filter)`, `get_kpis(period)` gibi sunucu taraflı, salt okunur araçlar; yanıtla birlikte kullanılan veri kaynağı "kaynak çipleri" olarak gösterilsin. Kısa vadede önerilen soruları bağlamın gerçekten karşılayabildiği sorularla değiştirin ve bağlama top-10 bayi özeti ekleyin. Hata yolunda `success:false` dönün, geçmişe yazmayın, UI'da hata balonu + "Tekrar dene" gösterin. Tüm bu yollar cost guard'a bağlanmalı (B2).
- **Efor:** M (kısa vade S, araç-çağırma L)

### B7 — Mojibake: Türkçe karakterler `?` olarak kaydedilmiş, kullanıcıya bozuk metin gösteriliyor
- **Önem:** orta · **Kategori:** i18n / kalite
- **Kanıt:** `page.tsx:191-193, 196, 290, 294` (bayt düzeyinde `?` doğrulandı); aynı hata `app/admin/ai-settings/page.tsx:112-113,116`
- **Sorun:** "AI analizi hen?z ?retilmemi? g?r?n?yor", "AI verisini ba?lat", "AI bootstrap tamamland?: … i?lendi". Bir dosya kaydı yanlış kodlamayla yapılmış; muhtemelen başka admin sayfalarına da yayılmış.
- **Profesyonel öneri:** Metinleri düzeltirken kök nedeni de kapatın: repo genelinde `rg "[a-z]\?[a-z]" app/admin` benzeri bir tarama + CI'da basit bir "şüpheli `?` dizisi" lint kuralı; admin metinlerini `i18n` sözlüğüne taşıyın (layout zaten `t(locale, …)` kullanıyor).
- **Efor:** S

### B8 — TR/EN dil karışıklığı ve ham enum değerleri
- **Önem:** düşük · **Kategori:** UX / i18n
- **Kanıt:** `page.tsx:318, 401, 413, 512, 612, 560, 664, 666`
- **Sorun:** "Dealer AI Performansı", "Toplam Feedback", "Churn", "Niyet Dağılımı (Intent)", önerilen sorulardaki "dealer"; son analizlerde `positive`/`complaint` ham değerleri; konu adları İngilizce anahtar (`service`, `price`). Tema kartında `mixed` → "Nötr" yanlış eşleme (`page.tsx:590-591`).
- **Profesyonel öneri:** Tek bir `sentimentLabel / intentLabel / topicLabel` sözlüğü (`lib/ai-labels.ts`) oluşturup tüm AI sayfalarında kullanın; "Bayi", "Geri bildirim", "Kayıp riski" gibi ürün sözlüğüne uygun terimler. `mixed` için ayrı "Karışık" rozeti.
- **Efor:** S

### B9 — Hata/başarı geri bildirimi tutarsız; "Yenile" her durumda başarı bildiriyor
- **Önem:** düşük · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:121-122, 167-172, 200-205`
- **Sorun:** `res.ok` kontrol edilmiyor; 403/429/500 durumunda sayfa sıfır değerlerle "sağlıklı" görünür. `handleRefresh`, `fetchStats` hatayı yuttuğu için hata toast'ının hemen ardından "güncellendi!" toast'ı da gösterir. Yenileme sırasında içerik bayat kalır ama işaretlenmez.
- **Profesyonel öneri:** SWR/React Query ile `useSWR('/api/admin/ai/overview?…')`: `isLoading`/`isValidating`/`error` durumları, kart bazlı hata yer tutucusu, "Son güncelleme: 12 sn önce" ve 60 sn arka plan yenilemesi. Toast yalnızca kullanıcı tetiklemeli aksiyonlarda.
- **Efor:** S

### B10 — Erişilebilirlik ve mikro-etkileşim eksikleri
- **Önem:** düşük · **Kategori:** a11y / mobil
- **Kanıt:** `page.tsx:99-101, 277, 312, 356-357, 496-500, 661`
- **Sorun:** İkon-only Gönder butonunda erişilebilir ad yok; input etiketsiz; mesaj listesi ekran okuyucuya duyurulmuyor; "AI'a Sor" `aria-expanded` taşımıyor; yığılmış duygu çubuğu ve ilerleme çubukları metinsel alternatifsiz; `scrollIntoView` tüm sayfayı kaydırıyor; son analiz rozet satırı `flex-wrap` olmadan dar ekranda taşabiliyor; her kartta bağımsız `delay` ile giriş animasyonu (0.05→0.75 sn) dashboard'u sahne gibi açıyor — veri aracında gereksiz bekleme hissi.
- **Profesyonel öneri:** `aria-label="Mesaj gönder"`, `<label className="sr-only">`, liste için `role="log" aria-live="polite"`, toggle'da `aria-expanded/aria-controls`; grafiklerde `role="img"` + özet `aria-label` veya gizli tablo. Kaydırmayı chat kabının `scrollTop`'u ile sınırlayın. Giriş animasyonlarını tek bir 150 ms opacity geçişine indirin; sayı değişimlerinde (yenileme sonrası) kısa bir "tick" vurgusu daha anlamlı.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, PostHog, Linear, Retool, Langfuse/Helicone tarzı LLM gözlemlenebilirliği)

1. **Dönem seçici + karşılaştırma:** Son 24 sa / 7 g / 30 g / özel aralık; her KPI'da önceki döneme göre delta ve sparkline (Stripe/PostHog standardı).
2. **LLM gözlemlenebilirliği:** Sağlayıcı/model bazında çağrı sayısı, hata oranı, p50/p95 gecikme, token ve tahmini maliyet, günlük bütçe kullanımı, yerel yedek (fallback) oranı, son hatalar listesi; zaman serisi grafiği.
3. **Drill-down ve aksiyon bağlantıları:** Acil/toksik/churn kartından filtrelenmiş feedback listesine, bayi satırından bayi detayına (`/admin/dealers-health`), analiz satırından feedback'e gidiş; toplu "yeniden analiz et" (mevcut `bulk_analyze`).
4. **Analiz kuyruğu görünürlüğü:** Bekleyen (aiProcessedAt=null) adet, en eski bekleyen yaşı, cron son koşu sonucu, "şimdi işle" düğmesi (B1'in güvenli karşılığı).
5. **Asistan için sohbet geçmişi, kaynak gösterimi ve dışa aktarma:** Kaydedilen `AIConversation`'ları listeleme, yanıtın hangi veriye dayandığını gösterme, yanıtı/raporu CSV/PDF olarak dışa aktarma.
6. **Uyarı kuralları:** "Acil feedback 1 saatte >N", "AI hata oranı >%10" gibi eşik tabanlı bildirim (mevcut push/mail altyapısına bağlanarak).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin sayfayı açtığında 1 saniyenin altında "AI sistemi sağlıklı mı, müşteri sesi nereye gidiyor, nereye müdahale etmeliyim?" sorularının üçüne de cevap alır. Her sayı bir döneme bağlı, tıklanabilir ve kaynağı belli; hiçbir şey sayfa açılışında LLM harcamaz.

**Yerleşim (masaüstü, 12 sütun):**
1. **Üst şerit (sticky):** Dönem seçici · son güncelleme · "Asistan" açma (sağ çekmece/Sheet). Hero küçültülür; dekoratif alan yerine durum çubuğu: `AI motoru: Sağlıklı · p95 1.8 sn · Hata %0.4 · Bekleyen analiz 12`.
2. **"Dikkat gerektiren" satırı:** Acil / Toksik / Kayıp riski / Analiz kuyruğu — her biri sayı + delta + tıklanınca filtrelenmiş liste. Sıfırsa sakin yeşil durum, gizlenmez (sıfır da bir bilgidir).
3. **Müşteri sesi bloğu (8 sütun):** Duygu zaman serisi (yığılmış alan, günlük), yanında intent dağılımı (yatay bar) ve TR etiketli konu sıralaması.
4. **AI motoru bloğu (4 sütun):** Çağrı/hata/latency mini zaman serisi, model ve sağlayıcı dağılımı, bugünkü token maliyeti / bütçe göstergesi.
5. **Bayi risk tablosu:** Sıralanabilir sütunlar (hacim, olumsuz %, acil, ort. puan, trend oku), satır → bayi detayı; varsayılan sıralama "risk skoru".
6. **Tema kümeleri + günlük AI raporu:** Cron'un ürettiği son rapor özeti, güçlü/zayıf yönler, "Yeniden üret (≈ maliyet)" düğmesi.
7. **Son analizler akışı:** Model rozeti (gerçek LLM / yerel yedek), açılabilir metin, feedback'e bağlantı.

**Mobil:** Dikkat satırı yatay kaydırmalı kartlar; bloklar tek sütun; bayi tablosu kart listesine dönüşür; asistan tam ekran Sheet.

**Motion / 3D:** 3D gerekmez — bu bir operasyon aracı. Motion ölçülü: ilk yüklemede tek seferlik 150 ms opacity; veri yenilendiğinde değişen sayıda kısa renk "pulse"; çekmece için standart Sheet geçişi. `useReducedMotion` ile tüm geçişler kapatılır; `animate-bounce` yerine azaltılmış harekette statik "Yanıt hazırlanıyor…" metni.

**Veri / API değişiklikleri:**
- `GET /api/admin/ai/overview?from&to` — tek uç, saf okuma, DB `count/groupBy/aggregate` + `$queryRaw` bayi kırılımı, Upstash 60–120 sn cache, her zaman `deletedAt: null`.
- `GET /api/admin/ai/usage?from&to` — `AIUsageLog` üzerinden çağrı/hata/latency/token; `logAIUsage` kalıcı hale getirilir (başarısızlıklar dahil).
- `GET/POST /api/admin/ai/backlog` — bekleyen analiz sayısı ve `ai-retry` fonksiyonunu manuel tetikleme (onay + audit log).
- Sistem içgörü raporu ve tema kümeleri günlük cron'a taşınır; sayfa yalnız okur.
- `askAI` için admin araçları (tool calling) + cost guard; hata yolunda `success:false`.
- `synthesize_ai_signals` üretimden kaldırılır; mevcut `bootstrap-heuristic` kayıtları için ayrı, onaylı düzeltme işi.
- İstemci tarafında SWR, bileşenlere bölünmüş yapı (`components/admin/ai/…`): `AiHealthStrip`, `AttentionRow`, `VoiceOfCustomer`, `DealerRiskTable`, `AiAssistantSheet`.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ai-detailed`** (`app/admin/ai-detailed/page.tsx:103,151,173,194,247,309`): "Sistem geneli Experience Signals" başlığıyla niyet dağılımı, aciliyet, churn, tema analizi ve duygu haritası gösteriyor — bu sayfanın intent/tema/duygu blokları ile doğrudan çakışıyor. İkisi tek bir "AI Operasyon Merkezi" altında sekmelere (Genel bakış · Müşteri sesi · AI motoru · Asistan) birleştirilmeli.
- **Admin ana panel `AiSection`** (`app/admin/components/AiSection.tsx:54,83`; veri: `app/admin/admin-dashboard-client.tsx:82` aynı `dealers-ai-stats` ucu): intent dağılımı ve son AI analizlerini tekrar ediyor. Ana panelde yalnız 3 KPI + "AI Operasyon Merkezi'ne git" bağlantısı kalmalı.
- **`/admin/ai-settings`** aynı `bootstrap ensure_ai_settings` aksiyonunu çağırıyor (`app/admin/ai-settings/page.tsx:104-118`) ve aynı mojibake'i taşıyor; bu sayfada da çağrılması (`page.tsx:183-187`) gereksiz tekrar — ayar oluşturma yalnız ayarlar sayfasında kalmalı.
- **`/admin/ai-quality`, `/admin/ai-learning`, `/admin/qra-chat-logs`**: farklı amaçlara hizmet ediyor (etiket kalitesi, öğrenme profili, QRA chat denetimi); birleştirilmemeli ama yeni merkezden bağlantı kartlarıyla erişilmeli.
- **`/admin/dealers-health`**: "Dealer AI Performansı" listesinin doğal hedefi; bayi satırları oraya drill-down etmeli, aynı sıralamayı ikinci kez üretmemeli.

---

## Doğrulama (şüpheci inceleme)

Üç KRİTİK/YÜKSEK iddia kod baştan okunarak çürütülmeye çalışıldı (salt okunur; kod/DB'ye dokunulmadı). Üçü de ayakta kaldı; yalnızca ciddiyet ve kapsamla ilgili düzeltmeler aşağıda.

### 1. "Veri doldur" / "AI verisini başlat" canlı Feedback verisini sahte AI sinyalleriyle kalıcı olarak bozuyor — **DOĞRULANDI**

- Her iki buton da `bootstrapAIData`'yı çağırıyor (`app/admin/ai-dashboard/page.tsx:273`, `:292`). Bu fonksiyon onay almadan `synthesize_ai_signals` ve `ensure_ai_settings` isteklerini paralel gönderiyor (`page.tsx:177-188`). Butonlarda `disabled` ya da yükleniyor durumu yok, bu yüzden çift tıklama iki paralel yazım üretir.
- Sunucu tarafında yalnız `requireAuth(['ADMIN'])` var (`app/api/admin/bootstrap/route.ts:106`). `synthesize_ai_signals` için ayrı bir dal bulunmuyor; eşleşmeyen aksiyon dosya sonundaki koda düşüyor (`route.ts:449-488`). Bu kod: `text != null` olan son 250 feedback'i alıyor; `deletedAt` filtresi yok (`:449-460`). `aiProcessedAt` boş olanlara puandan türetilmiş sabitleri yazıyor: puan ≤2 için urgency 0.78, churnRisk 0.72, intent `complaint` (`:466-468`). Ardından `aiProcessedAt=now`, `aiModelUsed='bootstrap-heuristic'` atıyor (`:477-479`). Yazımda tracker, audit log ya da geri alma (clear) aksiyonu yok; diğer seed aksiyonlarının aksine `getTracker` kullanılmıyor.
- Kalıcılık kesin: `ai-retry` cron yalnız `aiProcessedAt: null` kayıtları seçiyor (`app/api/cron/ai-retry/route.ts:36-41`). Gerçek analiz hattı `aiProcessedAt`'i yalnız gerçek LLM sonucunda dolduruyor; local-fallback'te bilerek NULL bırakıyor (`lib/inngest/feedback-analyze-pipeline.ts:54-81`). Yani bu kayıtlar tam olarak "LLM bekleyen" kuyruğu ve bootstrap onları kuyruktan kalıcı olarak çıkarıyor. `bootstrap-heuristic` değerini dışlayan bir okuyucu da yok; repo genelinde grep yalnız yazım yerini buluyor.
- **Yeniden üretim:** GROQ birkaç saat erişilemez olsun. Bu sürede gelen 1–2 yıldızlı feedback'ler `aiProcessedAt=NULL` kalır. Admin panelde uyarı kartını görüp "AI verisini başlat"a basar. Bu feedback'ler "complaint / urgency 0.78 / churn 0.72" olarak işaretlenir ve cron onları bir daha analiz etmez. Bayi panelleri (`app/api/dealer/churn-risk`, `next-best-actions`, `copilot-summary` vb. bu alanları okuyor) ve bu sayfadaki acil/churn sayaçları sahte değerlerle kalıcı olarak kirlenir. Son 3 dk içinde gelen, inline analizi henüz bitmemiş kayıtlar da etkilenir. Pipeline sonradan gerçek sonucu yazarsa bu kayıtlar düzelir; yazmazsa düzelmez.
- **Not:** "Tek tıkla üretim verisi etkilenir" iddiası doğru. Bu endpoint canlıda da aynı şekilde çalışıyor; bunun lokal `.env` ile ilgisi yok.

### 2. AI başarı oranı gerçek %0'ı %100 gösteriyor ve metriğin kaynağı sunucusuz ortamdaki bellek — **DOĞRULANDI**

- `page.tsx:265`, `:453` ve `:463` satırlarında `successRate || 100` kullanılıyor. `0` falsy olduğu için hesaplanan %0, %100 olarak gösterilir. Çağrı yoksa da `page.tsx:160` 100 döndürüyor.
- Kaynak, `lib/ai-engine.ts:1097` satırındaki modül seviyesindeki `usageLog` dizisi. `usage_stats` bu diziyi `getRecentUsageLogs(100)` ile döndürüyor (`app/api/ai/analyze/route.ts:949-958`). Dizi lambda örneğine özel: soğuk başlangıçta boş, örnekler arasında paylaşılmıyor. Aynı yanıtta `dbLogs` (AIUsageLog) da dönüyor ama sayfa onu okumuyor (`page.tsx:138`). DB'ye yazım yalnız `recordAiCostUsage` içinde ve her zaman `success: true` (`lib/ai-cost-guard.ts:64-72`). Başarısız çağrılar DB'ye hiç düşmüyor.
- Ek bulgu (iddiayı güçlendiriyor): `analyzeWithFallback` bir LLM hatasından sonra local-fallback'i `success=true` olarak logluyor (`lib/ai-engine.ts:1069`). Bu yüzden analiz kesintisinde oran %0'a bile inmez, yaklaşık %50 görünür. AI istemcisi hiç yoksa (`getAIClient()` null) `clusterThemes` ve `generateInsightReport` hiç log yazmadan dönüyor (`:483`, `:640`). Sonuç: "Toplam Çağrı" 0 iken başarı %100 görünür. "AI Model" kartı ise dizinin en eski kaydının modelini gösteriyor (`usageLogs[0]`; `slice(-limit)` en eskiyi başa koyar).
- **Yeniden üretim:** GROQ 5xx versin. Admin sohbette 2 soru sorar: `askAI` hata loglar (`:961`), aynı sıcak örnekte 2/2 çağrı başarısız olur. Yenile'ye bastığında `successRate = 0` hesaplanır ve ekranda yeşil "%100" ile dolu bir progress bar görünür. Farklı bir örneğe düşerse sayaç 0 olur, yine "%100" görünür. Kontrol merkezi kesintiyi gizler.

### 3. Her sayfa yüklemesi/yenilemesi cost guard dışında LLM çağrısı ve AIInsightReport upsert tetikliyor — **DOĞRULANDI** (ciddiyet: YÜKSEK yerine ORTA–YÜKSEK)

- Sayfa her mount'ta ve her "Yenile"de `POST /api/ai/analyze?action=insights` çağırıyor (`page.tsx:96`, `:108-112`, `:202`). Dönen `report` değişkeni atanıyor ama hiçbir yerde kullanılmıyor (`page.tsx:137`).
- Rota, en az 3 kayıt olduğunda (`route.ts:445`) sırayla iki LLM çağrısı yapıyor. Birincisi `clusterThemes` (`route.ts:484-492`); mevcut temalar %50'yi geçerse lokal kümelemeye düşüyor (`lib/ai-engine.ts:486-489`), bu yüzden bu çağrı koşullu. İkincisi `generateInsightReport` (`route.ts:532-544`), koşulsuz LLM çağrısı. Ardından `dealerId='system'` ile `aIInsightReport.upsert` yapılıyor (`route.ts:547-595`). `AIInsightReport.dealerId` FK değil (`prisma/schema.prisma` ~2147), dolayısıyla yazım başarılı oluyor. Rapor `null` dönerse ek olarak `generateInsights` (üçüncü LLM çağrısı) da çalışıyor (`route.ts:598-611`).
- `clusterThemes`, `generateInsightReport` ve `askAI` ne `checkAiCostGuard` ne de `recordAiCostUsage` çağırıyor; bu ikisi yalnız `:116`/`:139` ve `analyzeComprehensive` (`:307`/`:404`) içinde var. Bu nedenle harcama hem bütçe korumasının hem de AIUsageLog muhasebesinin dışında kalıyor.
- Sınırlayıcı etkenler (ciddiyeti düşürüyor): erişim yalnız ADMIN/DEALER rolüne açık (CUSTOMER 403, `route.ts:373`). Kullanıcı başına dakikada 20 istek rate limit var (`route.ts:24`, `:101`). Bu yüzden sınırsız değil, ama yenileme sayısıyla orantılı ve ölçülmeyen bir harcama.
- Gecikme iddiası makul: istemci timeout'u 15 sn, `maxRetries: 1` (`lib/ai-engine.ts:50-51`). `withRetry` 429'da 3/6/9 sn bekliyor (`:157-176`). Ardışık iki çağrı olduğundan ilk boyamanın 20 sn'yi aşması mümkün. Sayfa `Promise.all` ile bu yanıtı beklediği için tüm ekran spinner'da kalıyor (`page.tsx:107`, `:236`).
- **Yeniden üretim:** Admin sayfayı açar ve 5 kez "Yenile"ye basar. Bu, 5–10 ölçülmeyen LLM çağrısı ve 5 kez aynı `system/YYYY-MM/monthly` satırının üzerine yazılması demek. Ekranda bu raporun hiçbir alanı görünmez. AIUsageLog'da iz yok; günlük maliyet limiti devreye girmez.
