# /dealer/operations-brief

**Amaç:** İşletme sahibine "bugün işletmede ne oluyor" sorusunun tek ekranlık cevabını vermek: okunmamış geri bildirim, bugünkü/haftalık tüketim, açık aksiyonlar, bekleyen telafi teklifleri, katalog (QR/ürün) durumu, 7 günlük günlük seri ve altta LLM ile üretilen "Cortex 2.0 Proaktif Analiz" paneli.

**Genel puan: 4.5/10** · **Karar: birleştir** (bayi ana panosundaki `morning-briefing` + `/dealer/weekly-brief` + `/dealer/copilot` özetleriyle tek bir "Bugün / Komuta merkezi" yüzeyinde birleşmeli; AI paneli ise `/dealer/ai-insights`'ın kalıcı rapor altyapısına bağlanmalı.)

İncelenen dosyalar: `app/dealer/operations-brief/page.tsx`, `app/dealer/operations-brief/layout.tsx`, `components/dealer/operations-brief-daily-chart.tsx`, `app/api/dealer/operations-brief/route.ts`, `app/api/dealer/ai-proactive-analysis/route.ts`, `lib/ai-engine.ts` (`generateInsightReport`, `withRetry`, `getAIClient`), `lib/utc-calendar-day-buckets.ts`, `lib/redis.ts`, `lib/module-controls.ts`, `lib/visibility-controls.ts`, `lib/module-gate.ts`, `components/dashboard/sidebar.tsx`, `app/dealer/layout.tsx`, `messages/tr.json` + `messages/en.json` (`dealerOperationsBrief`), `prisma/schema.prisma` (Feedback, Consumption, ActionItem, RemedyOffer, Product, QRCode, ConsumptionReview, AIInsightReport). Karşılaştırma için: `app/api/dealer/morning-briefing/route.ts`, `app/api/dealer/notification-badges/route.ts`, `app/dealer/weekly-brief/page.tsx`, `app/api/ai/analyze/route.ts`.

> Not: Sayfa canlıda çalıştırılmadı (kural gereği dev server / DB yok). Tüm tespitler kod okunarak yapıldı; çalışma zamanı davranışına dayanan iddialar "doğrulanmadı" olarak işaretlendi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Ana sayaçlar doğru sorgulanıyor ve dealer izolasyonu sağlam; fakat "bugün" UTC'ye göre, telafi kartı yanlış kuyruğu sayıyor, AI skor/trend/tahmin uydurma ve trend göstergesi "stable"ı "Düşüş" diye gösteriyor. |
| UX | 4/10 | Sayılar var ama karar yok: KPI'lar tıklanamıyor, dönem kıyası yok, "sonraki adımlar" veri bağımsız sabit linkler, hata durumunda yeniden dene yok, AI paneli sessizce kayboluyor. |
| Görsel | 5/10 | shadcn kartlarıyla temiz ama jenerik; hiyerarşi düz (4 eşit KPI), AI uyarı kutuları sadece açık tema renkleriyle sabit kodlu, ▲▼⭐ emoji ikonları sistemin geri kalanıyla tutarsız. |
| Mimari | 4/10 | Ana API iyi (Promise.all + date_trunc + Redis); ancak AI paneli her sayfa açılışında cache'siz, rate-limit'siz, kalıcılıksız LLM çağrısı yapıyor; modül/menü kapıları uygulanmıyor; `any` kaçakları ve gereksiz soft-delete yoklama sorgusu var. |
| Performans | 5/10 | Recharts lazy chunk ve 60 sn Redis iyi; ama AI çağrısı ana veri geldikten sonra başlayan şelale (waterfall), 15 sn timeout + 429'da 3/6/9 sn bekleyen retry ile çok uzun sürebiliyor ve her ziyaret maliyet doğuruyor. |
| Erişilebilirlik + Mobil | 4/10 | Grid mobilde düzgün yığılıyor; fakat yükleniyor/hata durumlarında `role="status"`/`aria-live` yok, grafik için metin alternatifi yok, `animate-pulse` ve recharts animasyonu azaltılmış hareketi dinlemiyor, başlık hiyerarşisi h1→h3 atlıyor, 10px düşük opaklıklı metinler kontrastı zayıflatıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama, i18n) | ÇALIŞIYOR | `app/dealer/operations-brief/layout.tsx:4-6` | `layoutMetadata.dealerOperationsBrief*` iki dilde mevcut. |
| 2 | Hero (eyebrow/başlık/alt başlık/ikon) | ÇALIŞIYOR | `page.tsx:114-120` | Alt başlık "Rakamlar doğrudan veritabanından gelir" diyor; oysa 60 sn Redis cache var (`route.ts:145`). |
| 3 | Yetki ve kiracı izolasyonu | ÇALIŞIYOR | `route.ts:14-16`, `ai-proactive-analysis/route.ts:11-13` | `requireAuth(['DEALER'])`, `dealerId` oturumdan; cache anahtarı dealerId ile izole (`route.ts:20`). IDOR yok. STAFF rolü erişemez (bilinçli olabilir). |
| 4 | Ana veri çekme + unmount iptali | ÇALIŞIYOR | `page.tsx:52-70` | `cancelled` bayrağı doğru. |
| 5 | Yükleniyor durumu | KISMİ | `page.tsx:122-126` | Ortada spinner; iskelet yok → içerik gelince büyük yerleşim kayması; `role="status"` yok. |
| 6 | Hata durumu | KISMİ | `page.tsx:127-128` | Tek satır metin; "Yeniden dene" yok, 401/403/503 ayrımı yok, `role="alert"` yok. |
| 7 | Boş durum (yeni işletme, her şey 0) | EKSİK | `page.tsx:138-263` | Sıfırlar gösteriliyor; "ilk QR'ını oluştur" gibi yönlendirme yok. |
| 8 | CSV indir | KISMİ | `page.tsx:78-110` | Çalışıyor, BOM + TR'de `;` ayırıcı iyi; ama satır başına `key,value` formatında İngilizce teknik anahtarlar (`feedbackUnread`, `day_2026-10-01_feedbacks`) — Excel'de tablo olarak işe yaramaz. `revokeObjectURL` `click()` ile aynı tikte (`:107-108`). |
| 9 | CSV başarı toast'ı | ÇALIŞIYOR | `page.tsx:109` | |
| 10 | Okunmamış geri bildirim KPI | KISMİ | `route.ts:52-57` | Tanım `dealerFirstViewedAt: null`; kenar çubuğu rozeti ise `dealerReply: null` sayıyor (`notification-badges/route.ts:18-23`) → iki ekranda farklı "okunmamış". ConsumptionReview (tüketim yorumu) hiç sayılmıyor. 60 sn cache invalidasyonu yok. |
| 11 | "İncelenmeli" rozeti | ÇALIŞIYOR | `page.tsx:147-151` | Yalnızca >0 iken; eşik/öncelik mantığı yok. |
| 12 | Geri bildirim son 7 gün | ÇALIŞIYOR | `route.ts:58-63` | Kayan 168 saat; grafik ise takvim günü → toplamlar tutmaz (bkz. Bulgu 7). |
| 13 | Bugünkü tüketim | KISMİ | `route.ts:26`, `route.ts:64-66` | "Bugün" sunucu yerel gece yarısı (Vercel'de UTC) → TR saatiyle 03:00'te başlıyor. |
| 14 | Haftalık tüketim | ÇALIŞIYOR | `route.ts:67-69` | |
| 15 | Açık aksiyon kalemi | ÇALIŞIYOR | `route.ts:70-75` | Statüler şemayla uyumlu (`schema ActionItem.status`: pending/assigned/in_progress/done/cancelled). |
| 16 | Tamamlanan aksiyon (7 gün) | ÇALIŞIYOR | `route.ts:76-82` | |
| 17 | Bekleyen telafi teklifi | KISMİ | `route.ts:84`, `messages/tr.json dealerOperationsBrief.card.remedyHint` | `status:'pending'` = müşteriye açık teklif (şema yorumu: "pending=müşteriye açık; awaiting_dealer_approval=onay kuyruğu"). İşletmenin aksiyon alması gereken `awaiting_dealer_approval` kuyruğu sayılmıyor; oysa sabah brifingi onu sayıyor (`morning-briefing/route.ts` remedyOffer `awaiting_dealer_approval`). |
| 18 | 7 günlük günlük grafik | KISMİ | `page.tsx:197-214`, `operations-brief-daily-chart.tsx:26-86` | UTC gün kovası, etiket ham `MM-DD` (`chart:29`), tooltip tarihi yerelleştirilmemiş, ekran okuyucu alternatifi yok, ikinci seri rengi sabit `hsl(199 89% 48%)`. |
| 19 | Grafik lazy-load + iskelet | ÇALIŞIYOR | `page.tsx:25-28` | recharts ayrı chunk, `ssr:false`. |
| 20 | Aktif QR sayısı | ÇALIŞIYOR | `route.ts:85`, `page.tsx:226-229` | |
| 21 | Aktif ürün sayısı | ÇALIŞIYOR | `route.ts:83`, `page.tsx:230-233` | |
| 22 | "Önerilen sıradaki adımlar" linkleri (3) | ÇALIŞIYOR | `page.tsx:237-262` | Linkler doğru rotalara gidiyor ama veri bağımsız; "Önerilen" başlığı yanıltıcı (hiçbir öneri mantığı yok). |
| 23 | Redis cache (60 sn) | KISMİ | `route.ts:19-22`, `route.ts:145` | Çalışıyor; olay tabanlı invalidasyon yok (geri bildirimi okuyup dönen kullanıcı eski sayıyı görür). |
| 24 | Soft-delete şema yoklaması | KISMİ | `route.ts:28-37` | Her istekte ek bir `count` sorgusu; herhangi bir geçici hata da `useSoftDelete=false`'a düşürüp silinmiş kayıtları sayıma katıyor. Kolon şemada var (`schema.prisma:830`). |
| 25 | AI proaktif analiz veri çekme | KISMİ | `page.tsx:277-285`, `ai-proactive-analysis/route.ts:9-67` | Her açılışta yeni LLM çağrısı; cache/rate-limit/kalıcılık yok; `res.ok` kontrolü yok; iptal yok. |
| 26 | AI "Haftalık Stratejik Özet" kartı | KISMİ | `page.tsx:299-319` | Metinler sabit Türkçe; EN kullanıcıya da TR. |
| 27 | AI öneri çipleri (ilk 3) | KISMİ | `page.tsx:310-316` | Eyleme dönüştürülemiyor (aksiyon kalemi oluştur yok); `low` öncelik `medium` ile aynı turuncu (`:313`). |
| 28 | AI "Genel Performans Skoru" | SAHTE | `page.tsx:322-324`, `ai-engine.ts` overallScore `|| 50` | Deterministik bir metrikten değil, LLM'in serbest ürettiği sayı; 0 dönerse 50'ye çevriliyor. Kaynak/formül gösterilmiyor. |
| 29 | AI trend göstergesi (▲/▼ %x) | BOZUK | `page.tsx:325-327` | `trend` `'stable'` olduğunda kırmızı "▼ %0 Düşüş" basılıyor. Ayrıca `previousPeriodScore` hiç gönderilmediği için (`ai-proactive-analysis/route.ts:52-61`) trend ve yüzdesi LLM uydurması. |
| 30 | AI "Bir sonraki dönem tahmini ⭐" | SAHTE | `page.tsx:328` | Tarihsel veri olmadan LLM tahmini; değer yoksa ekranda yalnız "⭐" kalıyor; string dönerse `toFixed` patlar (doğrulanmadı, olası). |
| 31 | AI uyarı kartları | KISMİ | `page.tsx:333-352` | `alert.type` ham İngilizce enum ("churn", "urgent") gösteriliyor; ilgili geri bildirime link yok; yalnız açık tema renkleri (`bg-rose-50 text-rose-900`), koyu temada uyumsuz. |
| 32 | AI panel yükleniyor/boş/hata durumu | EKSİK | `page.tsx:287-288`, `ai-proactive-analysis/route.ts:35-40` | Yüklenirken `null` (sonradan aniden belirir), <3 geri bildirimde dönen açıklayıcı `message` hiç gösterilmiyor, hata sessiz. |
| 33 | `ai_features` modül kapısı | EKSİK | `ai-proactive-analysis/route.ts` (assert yok), `module-controls.ts:47` | Admin AI'ı kapatsa da bu sayfa LLM'i çağırmaya devam eder; diğer AI sayfaları kenar çubuğunda `moduleKey:'ai_features'` ile gizleniyor (`sidebar.tsx` ai_chat/ai_insights). |
| 34 | `operations_brief` modül/menü görünürlüğü | BOZUK | `module-controls.ts:34`, `visibility-controls.ts:55`, API'de `assertModuleEnabled` yok | Katalogda anahtar var, admin panelinde açılıp kapatılabiliyor; ama ne sayfa ne API bu ayarı uyguluyor → anahtar etkisiz. |
| 35 | Kenar çubuğunda yer alma | EKSİK | `components/dashboard/sidebar.tsx` dealer listesi | Sayfa sidebar'da yok; yalnızca `/dealer/discover`, `/dealer/growth-hub`, `/dealer/experience-guide` ve experience-pulse CTA'sından ulaşılıyor (yetim sayfa). |
| 36 | i18n (TR/EN) | KISMİ | `page.tsx:294,301,305,323,326,328` | Üst bölüm tamamen `t()`; AI paneli tamamen sabit TR; grafik başlığında son kullanıcıya "(UTC)" ifadesi. |
| 37 | Sayı biçimlendirme (locale) | ÇALIŞIYOR | `page.tsx:47-50` | |
| 38 | Duyarlı yerleşim | ÇALIŞIYOR | `page.tsx:138`, `:216`, `:242`, `:297`, `:334` | 400px'te tek kolon; linkler dikey yığılıyor. |
| 39 | Azaltılmış hareket desteği | EKSİK | `page.tsx:293` (`animate-pulse`), `chart` recharts varsayılan animasyon | `motion-reduce:` / `isAnimationActive` yok. |
| 40 | Yenile + veri tazeliği göstergesi | EKSİK | `page.tsx` | `generatedAt` sadece CSV dosya adında kullanılıyor; ekranda "x sn önce güncellendi" ve yenile düğmesi yok. |
| 41 | Dönem karşılaştırması / delta | EKSİK | `route.ts:119-144` | Hiçbir KPI'da önceki 7 güne göre değişim yok. |
| 42 | Şube/lokasyon filtresi | EKSİK | `schema QRCode.locationId` mevcut, sayfa filtre sunmuyor | Çok şubeli işletme için toplam sayı yetersiz. |
| 43 | KPI → detay (drill-down) | EKSİK | `page.tsx:139-194` | KPI kartları tıklanamıyor; ilgili filtreli listeye gitmiyor. |

**Durum özeti:** ÇALIŞIYOR 16 · KISMİ 14 · BOZUK 2 · SAHTE 2 · EKSİK 9 (toplam 43).

---

## Bulgular

### 1. AI paneli her sayfa açılışında cache'siz, kotasız LLM çağrısı yapıyor
- **Önem:** yüksek · **Kategori:** maliyet/güvenlik/performans · **Efor:** M
- **Kanıt:** `page.tsx:277-285` (her mount'ta `fetch('/api/dealer/ai-proactive-analysis')`), `ai-proactive-analysis/route.ts:52-61` (koşulsuz `generateInsightReport`), `lib/ai-engine.ts` `generateInsightReport` → `max_tokens: 2400`, `withRetry` 429'da 3/6/9 sn uyuyarak 3 kez yeniden dener; route'ta `checkRateLimitDb` yok (karşılaştırma: `app/api/dealer/ai-chat/route.ts:56` kullanıyor), sonuç `AIInsightReport` tablosuna yazılmıyor.
- **Sorun:** Her yenileme, her sekme, her geri-gel bir OpenAI çağrısı = doğrudan para. Kötü niyetli ya da sadece F5'e basan bir bayi sınırsız token yakabilir. Aynı hafta için aynı rapor tekrar tekrar ve her seferinde farklı üretiliyor (temperature 0.35) → kullanıcı sayfayı yenilediğinde "skorum 78'den 71'e düştü" gibi tutarsızlık görür. Serverless fonksiyon 15 sn timeout + retry uykularıyla uzun süre meşgul kalabilir.
- **Öneri:** Proaktif raporu istek anında değil, olay/zamanlama ile üret: (a) `AIInsightReport` tablosunu (`@@unique([dealerId, period, type])`) kullanarak `type:'weekly'`, `period:'2026-W41'` anahtarıyla **önce oku**; yoksa ya da 24 saatten eskiyse üret ve upsert et (aynı desen `app/api/ai/analyze/route.ts:520-560`'ta zaten var). (b) Üretimi mevcut harici cron altyapısına (cron-job.org → tek tetikleyici) "haftalık brifing" adımı olarak ekle; sayfa yalnızca okusun. (c) Manuel "Yeniden üret" düğmesi koyulacaksa `checkRateLimitDb('ai_proactive:'+dealerId, 3, 24h)` ve Redis kilidi (`SET NX`) ile eşzamanlı çift üretimi engelle. (d) `assertModuleEnabled('ai_features')` ekle.

### 2. AI skor, trend ve "sonraki dönem tahmini" veriye değil LLM uydurmasına dayanıyor; trend göstergesi "stable"ı düşüş gösteriyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu / güven · **Efor:** M
- **Kanıt:** `ai-proactive-analysis/route.ts:52-61` `previousPeriodScore` gönderilmiyor; prompt ise "Önceki dönemle karşılaştırarak trend ve tahmini bir sonraki dönem puanı ver" diyor (`lib/ai-engine.ts` system prompt madde 6). `page.tsx:325-326`: `report.trend === 'up' ? ... : 'text-rose-500'` ve `'İyileşme' : 'Düşüş'` — `'stable'` için kırmızı "▼ %0 Düşüş". `overallScore: report.overallScore || 50` (ai-engine) 0'ı 50 yapıyor. `predictedRating` sayıya zorlanmadan `toFixed(1)` çağrılıyor (`page.tsx:328`).
- **Sorun:** İşletme sahibine kesin görünen bir "Genel Performans Skoru 82, ▲ %5.2 İyileşme, tahmin ⭐4.3" sunuluyor; ama karşılaştırılacak önceki dönem modele hiç verilmemiş. Bu, Medallia/Qualtrics'te asla kabul edilmeyecek bir "kanıtsız metrik"tir ve güveni zedeler. Durağan dönemde kullanıcıya yanlış alarm veriliyor.
- **Öneri:** Skoru ve trendi **deterministik** hesapla (ör. CSAT = 4-5 puan oranı, NPS-benzeri net duygu, ortalama puan; önceki 7 günle yüzde değişim) ve sunucuda üret; LLM'i yalnızca bu sayıları **yorumlamak** (özet + öneri) için kullan. UI'da üç durumlu trend bileşeni (`up/down/stable`, nötr gri "—"), skorun yanında "nasıl hesaplandı" açılır bilgisi. `predictedRating` kaldırılmalı ya da gerçek bir zaman serisi tahmininden (ör. 4 haftalık hareketli ortalama + güven aralığı) gelmeli. Rapor alanları Zod ile şemaya zorlanmalı (`z.number().min(0).max(100)` vb.).

### 3. Modül ve menü görünürlük ayarları bu sayfada etkisiz; sayfa sidebar'da yok
- **Önem:** orta · **Kategori:** mimari / yetki · **Efor:** S
- **Kanıt:** `lib/module-controls.ts:34` (`operations_brief`), `lib/visibility-controls.ts:55` (menü kataloğunda), `components/dashboard/sidebar.tsx` dealer listesinde `/dealer/operations-brief` yok; `app/api/dealer/operations-brief/route.ts` ve `ai-proactive-analysis/route.ts` içinde `assertModuleEnabled` / `assertMenuItemVisible` yok (karşılaştırma: `app/api/dealer/campaigns/route.ts:6`).
- **Sorun:** Admin "Operasyon özeti"ni ya da "AI Özellikleri"ni (katalogda `severity:'critical'`) kapattığında hiçbir şey değişmiyor; ayar arayüzü yalan söylüyor. Aynı zamanda sayfa yalnızca dolaylı linklerden bulunabiliyor.
- **Öneri:** API'lere `assertModuleEnabled('operations_brief', { role:'dealer', userId })` ve AI ucuna `assertModuleEnabled('ai_features', …)` ekle; sayfa tarafında 403'ü "Bu modül yöneticiniz tarafından kapatıldı" boş durumu olarak göster. Sayfa birleştirilmeyecekse sidebar'a `moduleKey:'operations_brief'` ile eklenmeli; birleştirilecekse (önerilen) katalog kaydı yeni "Bugün" yüzeyine taşınmalı.

### 4. "Bekleyen telafi teklifi" işletmenin aksiyon alması gereken kuyruğu göstermiyor
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** S
- **Kanıt:** `route.ts:84` `status:'pending'`; şema yorumu `RemedyOffer.status`: "pending=müşteriye açık; awaiting_dealer_approval=onay kuyruğu"; sabah brifingi `awaiting_dealer_approval` sayıyor (`app/api/dealer/morning-briefing/route.ts`, remedyQueueCount). Kart altındaki link "Telafi merkezi"ne (`page.tsx:255-260`) gidiyor.
- **Sorun:** Bir operasyon özetinde asıl önemli olan "benim onayımı bekleyen" teklifler; sayfa ise topu müşteride olan teklifleri gösteriyor ve aynı ekosistemde iki farklı "telafi kuyruğu" sayısı ortaya çıkıyor.
- **Öneri:** İki ayrı sayaç döndür: `awaitingDealerApproval` (birincil, kırmızı vurgulu, tıklanınca `remedy-queue?status=awaiting_dealer_approval`) ve `pendingCustomer` (ikincil, "müşteride bekliyor"). Eski/terk edilmiş `pending` teklifleri için yaş bilgisi (en eskisi kaç gündür) ekle.

### 5. "Okunmamış geri bildirim" tanımı sistemde tutarsız ve tüketim yorumlarını kapsamıyor
- **Önem:** orta · **Kategori:** veri tutarlılığı · **Efor:** M
- **Kanıt:** `route.ts:52-57` `dealerFirstViewedAt: null`; `app/api/dealer/notification-badges/route.ts:18-23` `dealerReply: null` (ve `deletedAt` filtresi yok); `ConsumptionReview` modeli (`dealerReply` alanı var) bu sayfada hiç sorgulanmıyor.
- **Sorun:** Kenar çubuğu rozeti 12, operasyon özeti 4 diyebilir. Ürünün ana yorum kaynağı olan tüketim yorumları "okunmamış" hesabının dışında.
- **Öneri:** `lib/dealer-inbox-metrics.ts` gibi tek bir paylaşılan sayaç modülü oluştur: `unseen` (görülmedi), `unanswered` (yanıtsız), `negativeUnanswered` — Feedback + ConsumptionReview birleşik. Sidebar rozeti, sabah brifingi ve bu sayfa aynı fonksiyonu kullansın; Redis anahtarı `dealer-inbox:{dealerId}` ve `viewed`/`reply` uçlarında `redis.del` ile invalidasyon.

### 6. "Bugün" ve günlük seri UTC'ye göre; Türkiye'deki işletme için gün sınırı yanlış
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** M
- **Kanıt:** `route.ts:26` `new Date(now.getFullYear(), now.getMonth(), now.getDate())` (sunucu yerel saati; Vercel'de UTC), `route.ts:39` + `lib/utc-calendar-day-buckets.ts:7-23`, SQL `date_trunc('day', f."createdAt" AT TIME ZONE 'UTC')` (`route.ts:94,103`); i18n `chartTitle`: "Son 7 gün (UTC) — sizin işletme".
- **Sorun:** TR (UTC+3) için "Bugünkü tüketim" 03:00'te sıfırlanıyor; gece 00:00-03:00 arası (restoran/kafe için yoğun saat) bir önceki güne yazılıyor. Kullanıcıya "UTC" kavramı gösterilmesi de ürün dili değil.
- **Öneri:** Bayi profiline `timeZone` (varsayılan `Europe/Istanbul`) ekle; SQL'de `date_trunc('day', "createdAt" AT TIME ZONE ${tz})`, "bugün" başlangıcını `Intl`/`date-fns-tz` ile hesapla. Opsiyonel olarak "iş günü kesim saati" (ör. 05:00) ayarı — Toast/Square'in "business day cutoff" yaklaşımı. Başlıktan "(UTC)" kaldırılsın.

### 7. KPI "Son 7 gün" ile grafik farklı pencereleri sayıyor
- **Önem:** düşük · **Kategori:** veri tutarlılığı · **Efor:** S
- **Kanıt:** `route.ts:10,25,58-63` kayan 168 saat; `route.ts:39,90-91` 7 takvim günü (bugün kısmi dahil).
- **Sorun:** Grafikteki günlerin toplamı kart sayısıyla tutmuyor; dikkatli kullanıcıda "hangisi doğru?" sorusu.
- **Öneri:** Tek pencere tanımı kullan (takvim günü, bayi saat dilimi) ve kart değerini seriden türet (`sum(dailySeries)`); ayrıca önceki 7 günü de dönerek delta göster.

### 8. AI paneli tamamen sabit Türkçe, durum yönetimi yok, `any` kaçakları var
- **Önem:** orta · **Kategori:** i18n / sağlamlık · **Efor:** S
- **Kanıt:** `page.tsx:274` `useState<any>`, `:311` `rec: any`, `:335` `alert: any`; sabit metinler `:294,301,305,323,326,328`; `:287-288` yüklenirken ve veri yokken `null`; `ai-proactive-analysis/route.ts:35-40` dönen `message` UI'da kullanılmıyor; `:66` hata yanıtında `PRIVATE_NO_STORE_HEADERS` yok ve `success:false` alanı yok; `:18-33` sorguda `deletedAt: null` yok (silinmiş geri bildirimler AI'a gidiyor).
- **Sorun:** EN kullanıcı karışık dil görür; panel birkaç saniye sonra aniden belirerek yerleşimi kaydırır; az veride kullanıcı neden boş olduğunu bilmez; silinen (ör. toksik diye kaldırılan) yorumlar analize girer.
- **Öneri:** `AIInsightReportData` tipini `lib/ai-engine.ts`'ten içe aktar; `dealerOperationsBrief.ai.*` i18n anahtarları; panel için iskelet + "Analiz için en az 3 geri bildirim gerekli (şu an N)" boş durumu + "AI şu an kullanılamıyor" hata durumu; sorguya `deletedAt: null` ekle; LLM'e locale parametresi geçirip çıktı dilini seç.

### 9. Gereksiz soft-delete yoklama sorgusu ve sessiz yanlış moda düşme
- **Önem:** düşük · **Kategori:** performans / doğruluk · **Efor:** S
- **Kanıt:** `route.ts:28-37`.
- **Sorun:** Her cache-miss'te ek bir `feedback.count` sorgusu; ayrıca geçici bir DB hatası "kolon yok" sanılıp silinmiş kayıtların sayılmasına yol açar. `deletedAt` kolonu şemada kalıcı (`schema.prisma:830`).
- **Öneri:** Yoklamayı kaldır, `deletedAt: null`'ı sabit kullan; geçici hata zaten dış `catch` + `responseIfDatabaseUnavailable` tarafından ele alınıyor.

### 10. Erişilebilirlik ve hareket eksikleri
- **Önem:** düşük · **Kategori:** a11y · **Efor:** S
- **Kanıt:** `page.tsx:122-128` (canlı bölge yok), `:293` `animate-pulse` + `aria-hidden` yok, `:294` `h3` (h2 atlanmış), `:326-328` ▲▼⭐ emoji ekran okuyucuya okunuyor, `:346` `text-[10px] opacity-60`, `:340-341` yalnız açık tema renkleri; grafik (`operations-brief-daily-chart.tsx:41-84`) metin alternatifi ve `isAnimationActive` kontrolü yok.
- **Öneri:** Yükleniyor için `role="status" aria-live="polite"`, hata için `role="alert"`; AI başlığını `h2` yap; emojiler yerine lucide `TrendingUp/TrendingDown/Minus` + görsel olarak gizli metin; uyarı kutularında `dark:` varyantları veya semantik `Alert` bileşeni; grafiğe `aria-label` + görsel olarak gizli özet tablo (`<table className="sr-only">`); `useReducedMotion()` ile recharts animasyonunu ve `animate-pulse`'u kapat (`motion-reduce:animate-none`).

### 11. CSV dışa aktarımı analiz için kullanışsız
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `page.tsx:85-101`.
- **Sorun:** Tek kolon anahtar/değer listesi, İngilizce teknik anahtarlar; günlük seri satır satır `day_YYYY-MM-DD_feedbacks` şeklinde düzleştirilmiş. Bir işletme sahibi bunu Excel'de grafiğe dönüştüremez.
- **Öneri:** İki sayfalık çıktı: (1) "Özet" (yerelleştirilmiş başlıklarla Metrik | Değer | Önceki dönem | Değişim), (2) "Günlük" (Tarih | Geri bildirim | Tüketim). Tek CSV'de tutulacaksa yalnız günlük tablo + özet başlık bloğu. Uzun vadede `xlsx` sunucu tarafı export ucu ve tarih aralığı seçimi. `revokeObjectURL`'i `setTimeout(…, 0)` içine al.

### 12. "Önerilen sıradaki adımlar" veri bağımsız ve KPI'lar tıklanamıyor
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi · **Efor:** M
- **Kanıt:** `page.tsx:237-262` sabit üç link; `:139-194` KPI kartları `Link` değil; `lib/next-best-action.ts` ve `/api/dealer/next-best-actions` sistemde mevcut ama burada kullanılmıyor.
- **Sorun:** Sayfa "neyin önemli olduğunu" söylemiyor; kullanıcı sayıyı görüp başka sayfaya kendi gitmek zorunda.
- **Öneri:** KPI kartlarını filtreli derin linke çevir (`/dealer/feedbacks?filter=unseen`, `/dealer/action-items?status=open`, `/dealer/remedy-queue?status=awaiting_dealer_approval`). "Sıradaki adımlar"ı `next-best-actions` ucundan besle: öncelikli, gerekçeli ("3 tane 1-2 yıldızlı yorum 24 saattir yanıtsız → Yanıtla").

---

## Eksik özellikler (kıyas ürünlerle)

1. **Dönem karşılaştırması ve hedefler** (Square Dashboard, Toast): her KPI için "geçen haftaya göre +%12", hedef çizgisi ve sapma rengi. Şu an hiçbir delta yok.
2. **Şube/lokasyon ve zaman aralığı filtresi** (Medallia, Google Business Profile çoklu lokasyon): `QRCode.locationId` mevcut ama filtre yok; tarih aralığı sabit 7 gün.
3. **SLA / yanıt süresi metrikleri** (Medallia "close the loop", Yelp "response time"): ortalama ilk yanıt süresi, 24 saati aşan yanıtsız olumsuz geri bildirim sayısı, telafi teklifinin kabul oranı.
4. **Kalite sinyali KPI'ları** (Qualtrics CX): ortalama puan, CSAT, olumsuz oranı, en çok yükselen olumsuz tema — şu an yalnız hacim sayılıyor, kalite yok (sadece güvenilmez LLM skoru var).
5. **Zamanlanmış özet e-postası/push** (Square günlük satış özeti, Toast günlük rapor): "her sabah 08:00'de bu özeti gönder" aboneliği; mevcut mail ve push altyapısı buna hazır.
6. **Anomali uyarıları deterministik kurallarla** (Medallia alerts): "bugün olumsuz geri bildirim normalin 3 katı" gibi istatistiksel eşik tabanlı, LLM'e bağımlı olmayan uyarılar; tıklanınca ilgili kayıtlara gider.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bir kafe sahibi sabah telefonundan açtığında 5 saniyede şu üç soruya cevap almalı: (1) *Acil bir şey var mı?* (2) *Dün/bu hafta nasıl gitti?* (3) *Şimdi ne yapmalıyım?* Sayfa bir rakam vitrini değil, bir **iş kuyruğu + nabız** ekranı olmalı.

**Yerleşim (masaüstü → mobilde aynı sırayla tek kolon):**
1. **Dikkat şeridi (üstte, yalnız gerektiğinde):** deterministik kurallardan gelen 0-3 kritik kart — "2 telafi onayınızı bekliyor", "4 olumsuz yorum 24 saattir yanıtsız". Her kart tek dokunuşla ilgili filtreli listeye gider. Hiçbiri yoksa küçük, sakin bir "Her şey yolunda" onayı.
2. **Nabız satırı (4 KPI):** Yanıt bekleyen geri bildirim · Bugünkü tüketim · Ortalama puan (7g) · Açık aksiyon. Her biri büyük sayı + önceki döneme göre delta çipi + 7 günlük mini sparkline; tıklanabilir.
3. **Trend kartı:** geri bildirim ve tüketimi aynı eksende değil, iki küçük çoklu grafik (small multiples) veya hacim çubuğu + ortalama puan çizgisi; bayi saat diliminde, yerelleştirilmiş gün adlarıyla ("Pzt 6 Eki").
4. **Sıradaki en iyi 3 aksiyon:** `next-best-actions` ucundan, gerekçesiyle ve tek tık CTA ile ("Yanıtla", "Onayla", "Aksiyon oluştur").
5. **Haftalık AI yorumu (katlanabilir):** kalıcı `AIInsightReport`'tan okunan, oluşturulma tarihi görünen özet; öneriler "Aksiyona dönüştür" düğmesiyle `ActionItem` oluşturur; skor yerine deterministik metrikler + AI'ın yorumu.
6. **Alt bilgi:** "Son güncelleme 40 sn önce · Yenile · Dışa aktar (CSV/XLSX) · Her sabah e-posta ile al".

**Motion/3D:** Bu bir operasyon ekranı; 3D yersiz. Ölçülü framer-motion (`m as Motion`, global LazyMotion): KPI sayılarında 300-400 ms sayaç animasyonu (yalnız ilk yükte), dikkat şeridi kartlarında `layout` geçişi (bir iş tamamlanınca kart yumuşakça kaybolur), iskeletten içeriğe çapraz geçiş. Hepsi `useReducedMotion()` ile kapatılabilir; `animate-pulse` gibi sürekli hareketler kaldırılır.

**Veri/API değişiklikleri:**
- `GET /api/dealer/operations-brief?range=7d&locationId=…` → yanıt: `{ attention: Alert[], kpis: { key, value, previous, delta }[], series: { date, feedbacks, consumptions, avgRating }[], nextActions: [...], ai: { reportId, generatedAt, summary, recommendations } | null, generatedAt }`.
- Ortak sayaç katmanı (`lib/dealer-inbox-metrics.ts`) — sidebar rozeti, sabah brifingi ve bu sayfa aynı tanımı kullanır; Feedback + ConsumptionReview birleşik.
- Bayi `timeZone` alanı; SQL gruplaması bu saat diliminde.
- Redis cache anahtarı `dealer-ops-brief:{dealerId}:{range}:{locationId}`; `viewed`, `reply`, `remedy` ve `action-items` mutasyonlarında `del`.
- AI raporu: haftalık cron ile üretim + `AIInsightReport` upsert; sayfa yalnız okur; manuel yeniden üretim rate-limit'li.
- `assertModuleEnabled('operations_brief')` ve `assertModuleEnabled('ai_features')`.

---

## Çakışmalar / birleştirme önerisi

| Sayfa / uç | Çakışma | Öneri |
|---|---|---|
| `/dealer` (ana pano) → `/api/dealer/morning-briefing` | Son 24 saat: düşük puan, yeni geri bildirim, açık olay, telafi onay kuyruğu — bu sayfanın "dikkat" kısmıyla neredeyse aynı amaç, farklı tanımlarla. | Operasyon özetini ana panonun "Bugün" sekmesi/bölümü olarak birleştir; morning-briefing ve operations-brief API'lerini tek uçta topla. |
| `/dealer/weekly-brief` | Haftalık otomatik AI özeti (kalıcı, cron'lu) — bu sayfadaki "Haftalık Stratejik Özet" AI paneliyle aynı içerik, ikisi farklı kaynaktan. | AI paneli weekly-brief verisini okusun; weekly-brief sayfası "geçmiş özetler arşivi" olarak kalsın veya birleşik sayfanın sekmesine dönüşsün. |
| `/dealer/ai-insights` (`/api/ai/analyze?action=insights`) | Aynı `generateInsightReport` fonksiyonu; orada `previousPeriodScore` + kalıcılık var, burada yok. | Proaktif panel kaldırılıp yerine ai-insights'ın son kalıcı raporundan özet kart + "Detaylı içgörüler" linki konmalı. |
| `/dealer/copilot` (`/api/dealer/copilot-summary`) | Bekleyen aksiyon, açık olay gibi özet sayaçlar. | Copilot sohbet/öneri odaklı kalsın; sayaçlarını ortak metrik katmanından alsın. |
| `/dealer/growth-hub`, `/dealer/discover`, `/dealer/experience-guide` | Bu sayfaya yalnızca link veriyorlar (yetim sayfanın tek girişleri). | Birleştirme sonrası linkler yeni "Bugün" yüzeyine yönlendirilmeli. |

**Sonuç:** Sayfanın veri çekirdeği (ana API) sağlam ve yeniden kullanılabilir; fakat bağımsız bir sayfa olarak varlığı, sidebar'da bile olmaması ve ana panodaki sabah brifingiyle örtüşmesi nedeniyle zayıf. Önerilen yol: ana API'yi ortak metrik katmanına taşıyıp bayi ana panosunda "Bugün / Komuta merkezi" olarak birleştirmek; AI panelini kalıcı haftalık rapora bağlamak ve uydurma skor/trend/tahmin alanlarını deterministik metriklerle değiştirmek.

---

## Doğrulama (şüpheci inceleme)

### 1. Sınırsız LLM maliyeti: her sayfa yüklemesinde rate-limit'siz LLM çağrısı — **DOĞRULANDI** (ifadede küçük düzeltme ile)

Kanıt:
- `app/dealer/operations-brief/page.tsx:268` — `AIProactivePanel` her mount'ta `fetch('/api/dealer/ai-proactive-analysis')` çağırıyor; istemci tarafında önbellek yok.
- `app/api/dealer/ai-proactive-analysis/route.ts:9-63` — yalnızca `requireAuth(['DEALER'])`; `checkRateLimitDb` yok (karşılaştırma: `app/api/ai/analyze/route.ts:101` `checkRateLimitDb('ai_analyze:...')` kullanıyor), Redis/DB önbelleği yok, `AIInsightReport` upsert'i yok (karşılaştırma: `app/api/ai/analyze/route.ts:518-560` önceki raporu okuyor ve upsert ediyor). `assertModuleEnabled('ai_features')` ya da `operations_brief` kontrolü de yok.
- `lib/ai-engine.ts:623-750` — `generateInsightReport` `checkAiCostGuard`/`recordAiCostUsage` ÇAĞIRMIYOR (bu ikisi yalnız `runChatCompletion` `:116/:139` ve analiz yolu `:307/:404`'te). Yani bayi başına günlük AI kotası koruması da bu yolda devre dışı; `max_tokens: 2400` (`:750`) + `withRetry` (`:164`, 3 deneme) ile tek istek birden fazla sağlayıcı çağrısına dönüşebiliyor.
- `proxy.ts` içinde genel bir API rate-limit katmanı yok (grep ile `rate` eşleşmesi yok).

Düzeltme: iddia "OpenAI" diyor; `.env`'de `GROQ_API_KEY` tanımlı olduğundan `getAIClient()` (`lib/ai-engine.ts:42-50`) Groq'u, `getModel()` (`:65-70`) `llama-3.1-8b-instant`'ı seçiyor. Dolayısıyla etki doğrudan dolar maliyetinden çok **paylaşılan Groq kotasının tüketilmesi** (kod yorumu `:67-68`: ücretsiz katman ~500K token/gün). Bu kota her geri bildirimin otomatik AI analizini de besliyor; yani etki tek bayiyle sınırlı değil, tüm platformun AI analiz hattına yayılan bir hizmet engelleme riski.

Yeniden üretim: Son 7 günde ≥3 geri bildirimi olan (route `:35` eşiği) herhangi bir bayi hesabıyla oturum açıp `for i in $(seq 200); do curl -s -b "<oturum çerezi>" https://<alan>/api/dealer/ai-proactive-analysis >/dev/null; done` → her istek yeni bir ~2400 token'lık üretim; `AIUsageLog`'a bayi bazında kayıt düşmediği için cost-guard bunu durdurmuyor. Sayfayı ardışık yenilemek de aynı etkiyi verir. Modül anahtarı (`ai_features`) kapalı olsa bile uç çalışmaya devam eder.

Öneri: Raporu sayfa yüklemesinde ÜRETMEYİN. Haftalık cron (veya mevcut `weekly-brief` hattı) `AIInsightReport`'a upsert etsin; bu uç yalnız son kalıcı raporu okusun (Redis `dealer-ai-proactive:{dealerId}` 6-24 saat TTL). Manuel "yeniden üret" ayrı bir POST olsun: `checkRateLimitDb('ai_proactive:'+dealerId, 1-3, 1 saat)` + `checkAiCostGuard(dealerId)` + başarılı üretimde `recordAiCostUsage`. En sağlam yol, `generateInsightReport` imzasına zaten var olan `dealerId` ile cost-guard'ı fonksiyonun içine taşımak — böylece `ai/analyze` dahil tüm çağıranlar korunur. Ucun başına `assertModuleEnabled('ai_features')` eklenmeli.

### 2. AI skor/trend/tahmin veriye dayanmıyor; durağan trend "Düşüş" gösteriliyor — **DOĞRULANDI**

Kanıt:
- `app/api/dealer/ai-proactive-analysis/route.ts:52-61` — `previousPeriodScore`, `intentSummary`, `signalsSummary` gönderilmiyor; `topTopics`/`themeClusters` boş dizi.
- `lib/ai-engine.ts:728` — "Önceki Dönem Genel Skor" satırı yalnız `previousPeriodScore != null` iken prompt'a giriyor; bu uçta hiç girmiyor. Buna rağmen talimat `:679` ("Önceki dönemle karşılaştırarak trend ve tahmini bir sonraki dönem puanı ver") ve `:746` trend + tahmin istiyor. Model karşılaştıracak bir veri olmadan `trend`/`trendValue`/`predictedRating` üretiyor → uydurma.
- `app/dealer/operations-brief/page.tsx:315-316` — renk ve ok yalnız `trend === 'up'` ile ayrılıyor; `'stable'` ve `'down'` aynı dalda: kırmızı `▼ %{trendValue} Düşüş`. `lib/ai-engine.ts:762-763` varsayılanları `trend: 'stable'`, `trendValue: 0` olduğundan, model alanı atladığında bile ekran "▼ %0 Düşüş" (kırmızı) gösterir.
- `lib/ai-engine.ts:761` — `report.overallScore || 50`: meşru 0 skoru 50'ye çevriliyor (aynı kalıp `:763` ve `keyMetrics` alanlarında da var). Pratikte 0 skoru nadir olduğundan bu alt madde düşük önemde.
- Ek risk (doğrulanmadı, model çıktısına bağlı): `page.tsx:318` `report.predictedRating?.toFixed(1)` — model `predictedRating`'i string döndürürse (`"4.2"`) `toFixed is not a function` ile render çöker; `lib/ai-engine.ts:796` değeri tip/aralık doğrulaması yapmadan geçiriyor.

Yeniden üretim: ≥3 geri bildirimi olan, puanları geçen haftayla aynı seyreden bir bayi sayfayı açar; model `trend: "stable"` döndürür (ya da alanı atlar) → skor kartında kırmızı "▼ %0 Düşüş" görünür. Ayrıca her yenilemede (bkz. bulgu 1, önbellek yok) `temperature: 0.35` ile farklı skor/tahmin üretilebildiği için bayi aynı veri üzerinde değişen "Genel Performans Skoru" görür.

Öneri: Skor, trend ve tahmin deterministik hesaplanmalı ve AI yalnız yorum üretmeli. Uç bu dönem ve önceki 7 günün `avgRating`, olumsuz oranı, yanıt oranını SQL ile hesaplayıp `trend = sign(delta)` (eşik içi → `stable`) döndürsün; UI üç durumlu olsun (`up` yeşil ▲, `down` kırmızı ▼, `stable` nötr gri "—, Değişim yok"). `predictedRating` kaldırılmalı ya da açıkça "AI tahmini" etiketiyle ve sayısal doğrulamayla (`Number.isFinite`, 1-5 aralığı) gösterilmeli. `generateInsightReport` sonucunu zod ile doğrulayın, `||` yerine `??` kullanın. Önceki dönem için `AIInsightReport.overallScore` zaten `ai/analyze` yolunda okunuyor (`app/api/ai/analyze/route.ts:518-528`); aynı desen buraya da uygulanmalı.

| # | İddia | Karar |
|---|---|---|
| 1 | Rate-limit/önbellek/kalıcılık/modül kontrolü olmayan LLM çağrısı | Doğrulandı (sağlayıcı Groq; etki paylaşılan kota tükenmesi + cost-guard'ın atlanması) |
| 2 | Uydurma skor/trend/tahmin; `stable` → kırmızı "Düşüş" | Doğrulandı |
