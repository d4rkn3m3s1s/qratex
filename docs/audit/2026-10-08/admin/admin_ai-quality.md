# /admin/ai-quality

**Amaç** · AI'ın geri bildirim analizlerinden (sentiment, intent, tema vb.) haftalık örnek alıp insan inceleyicinin 0–100 arası "doğruluk skoru" ve not vermesini sağlayan manuel kalite değerlendirme (human-in-the-loop eval) ekranı.
**Genel puan** · **3.9 / 10**
**Karar** · **yeniden tasarla** (ve uzun vadede `/admin/ai-learning` ile tek bir "AI Değerlendirme" merkezinde birleştir)

Sayfa ilk bakışta "çalışıyor" görünüyor, ama değerlendirme döngüsünün iki ucu kopuk. Bir yanda örnekleme yanlı ve kirli: sezgisel (heuristic) sahte "AI" kayıtları da havuza giriyor. Öbür yanda verilen skor hiçbir yerde okunmuyor: `accuracyScore` yalnızca yazılıyor, ortalama, trend ya da modele dönen bir sinyal yok. Ana eylem olan "Skor Ver" ise kart kapalıyken ekranda hiçbir şey yapmıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Listeleme/filtre/kaydetme uçtan uca çalışıyor; ancak ana CTA ("Skor Ver") kapalı kartta görünmez, skorlar hiçbir metrikte kullanılmıyor, yeniden skorlama ve sayfalama yok. |
| UX | 3/10 | Ham JSON dökümüyle "doğruluk" puanlatılıyor; değerlendirme rubriği, model/versiyon/bayi bağlamı, klavye akışı yok. 0–100 serbest sayı tutarsız skora davet ediyor. |
| Görsel | 4/10 | Standart shadcn kartları temiz ama kardeş AI sayfalarının (`AdminPremiumHero`) dilinden kopuk; bilgi hiyerarşisi zayıf (metin tek satır truncate, AI çıktısı 128px'lik `<pre>`). |
| Mimari | 4/10 | Tek dosyalık istemci bileşeni, SWR/abort yok, i18n hook'u içe aktarılıp kullanılmıyor; "demo" seed'i gerçek feedback üzerinde çalışıyor ve sil butonu insan emeğini siliyor. |
| Performans | 6/10 | Tek sorgu + iki `count`, 50 kayıt limiti; sorun yok. Filtre değişiminde yarış koşulu ve her yenilemede tüm listenin yeniden animasyonu küçük kusurlar. |
| Erişilebilirlik + Mobil | 3/10 | Tıklanabilir `div` klavyeyle açılamıyor, `aria-expanded` yok, `label`–`input` bağlı değil; 5 butonluk filtre satırı `flex-wrap` olmadan ~400px'te taşıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı ve açıklaması (`PageHeader`) | ÇALIŞIYOR | `app/admin/ai-quality/page.tsx:112-115` | Sabit Türkçe metin; kardeş AI sayfaları `AdminPremiumHero` kullanıyor (`app/admin/ai-learning/page.tsx:27`). |
| 2 | "Bekleyen" sayaç kartı | ÇALIŞIYOR | `page.tsx:119-130`, `app/api/admin/ai-quality/route.ts:47-50` | Global sayım, filtreden bağımsız. |
| 3 | "İncelendi" sayaç kartı | ÇALIŞIYOR | `page.tsx:131-142`, `route.ts:49` | Ortalama skor gibi kalite metriği yok. |
| 4 | Filtre: Bekleyen | ÇALIŞIYOR | `page.tsx:147-153`, `route.ts:28` | |
| 5 | Filtre: İncelendi | ÇALIŞIYOR | `page.tsx:154-160` | |
| 6 | Filtre: Tümü | ÇALIŞIYOR | `page.tsx:161-167`, `route.ts:28` | `status` parametresi doğrulanmıyor (`route.ts:24`). Rastgele bir değer boş liste döner, zararsız. |
| 7 | "Demo örnek üret" (`seed_ai_quality_samples`) | SAHTE | `page.tsx:168-172`, `app/api/admin/bootstrap/route.ts:385-430` | "Demo" etiketli ama **gerçek üretim geri bildirimlerinden** örnek açıyor, yalnızca `notes:'[bootstrap-demo]'` işaretiyle ayrılıyor (`bootstrap/route.ts:414`). `deletedAt` filtresi yok (`:387-392`). |
| 8 | "Demo örnekleri sil" (`clear_ai_quality_samples`) | KISMİ | `page.tsx:173-178`, `bootstrap/route.ts:432-446` | Onay adımı yok; izleyicideki (tracker) ID'ler **incelenmiş (reviewed) kayıtlar dahil** siliniyor. İnsanın verdiği skor kaybolur. |
| 9 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:182-187` | |
| 10 | Boş durum + "Şimdi örnek üret" | KISMİ | `page.tsx:188-202` | "Haftalık cron ile 100 örnek eklenir" vaadi doğrulanmadı (bkz. #30). Seed butonu boş durumda da gerçek veriden örnek açıyor. |
| 11 | Hata durumu | KISMİ | `page.tsx:73-76` | Hata yalnızca toast'la bildiriliyor. Liste boşaltıldığı için ekranda "İncelenecek örnek yok" yazıyor, yani hata boş durum gibi görünüyor. Sunucu mesajı (`t('common.failedToLoad')`) hiç gösterilmiyor. |
| 12 | Örnek satırı: geri bildirim metni | ÇALIŞIYOR | `page.tsx:219-221` | Tek satır `truncate`. Kart açılınca bile **tam metin hiçbir yerde gösterilmiyor**, bu da inceleme için kritik bir eksik. |
| 13 | Yıldız puanı rozeti | ÇALIŞIYOR | `page.tsx:223` | |
| 14 | Sentiment rozeti | KISMİ | `page.tsx:224` | Ham İngilizce değer (`positive`/`negative`) TR arayüzde basılıyor; "Sentiment" etiketi de İngilizce. |
| 15 | Doğruluk skoru rozeti | ÇALIŞIYOR | `page.tsx:225-227` | |
| 16 | İncelendi ikonu | ÇALIŞIYOR | `page.tsx:228-230` | Yalnızca renk ve ikon var, metin alternatifi yok. |
| 17 | Satırı aç/kapa | KISMİ | `page.tsx:214-216`, `:246-250` | Fareyle çalışıyor. `div onClick` olduğu için klavye ve ekran okuyucuyla erişilemez (`role`, `tabIndex`, `aria-expanded` yok). |
| 18 | "Skor Ver" butonu | BOZUK | `page.tsx:234-245`, `:104-108`, `:254`, `:263` | `startEdit` yalnızca `editingId` atıyor, `expandedId` atamıyor ve `e.stopPropagation()` satırın açılmasını engelliyor. Form yalnızca `expandedId === s.id` iken render edildiği için **kapalı kartta tıklama görünür hiçbir şey yapmıyor**. |
| 19 | AI analizi görünümü | KISMİ | `page.tsx:256-261`, `route.ts:39` | Legacy `aiAnalysis` JSON'u 128px yüksekliğindeki `<pre>` içine dökülüyor. Yapılandırılmış alanlar (`topics`, `themes`, `actionSuggestions`, `urgency`, `churnRisk`…) seçilmiyor. Model ve versiyon (`aiModelUsed`/`aiVersion`) görünmüyor. |
| 20 | Doğruluk skoru girişi (0–100) | KISMİ | `page.tsx:266-276` | Değer sınırlanıyor (clamp), ama rubrik yok, kaydırıcı ya da hazır seviye yok. Alanı boşaltmak değeri anında 0 yapıyor (`parseInt('')` sonucu `\|\| 0`). `label` input'a bağlı değil. |
| 21 | Notlar alanı | KISMİ | `page.tsx:278-287`, `:107` | Seed örneklerinde alan iç işaret olan `[bootstrap-demo]` ile önceden doluyor. Kaydedilirse kayıt "demo" sayılmaya devam ediyor ve silinmeye aday kalıyor. |
| 22 | Kaydet | KISMİ | `page.tsx:85-102`, `route.ts:61-93` | Çalışıyor. Yükleniyor ya da devre dışı durumu yok, çift tıklamada iki PATCH gidiyor. Denetim kaydı (`auditLog`) yazılmıyor. Eşzamanlı iki admin aynı örneği sessizce ezebiliyor. |
| 23 | İptal | ÇALIŞIYOR | `page.tsx:292-302` | |
| 24 | Kayıtlı notun gösterimi | KISMİ | `page.tsx:305-311` | Seed örneklerinde "Not: [bootstrap-demo]" iç işareti kullanıcıya sızıyor. |
| 25 | İncelenmiş örneği yeniden skorlama / düzeltme | EKSİK | `page.tsx:234` | Buton yalnızca `pending` iken görünüyor. API izin veriyor (`route.ts:78-90`), UI vermiyor. |
| 26 | Sayfalama / "daha fazla yükle" | EKSİK | `page.tsx:68`, `route.ts:25` | Sabit 50 kayıt, `createdAt desc`. Haftada 100 örnek eklenirse eski bekleyenler hiç görünmez (aç kalma, starvation). |
| 27 | Arama, sıralama, bayi/model/sentiment filtresi | EKSİK | `page.tsx:146-179` | |
| 28 | Kalite metrikleri (ortalama doğruluk, trend, model başına kırılım) | EKSİK | `grep accuracyScore`: yalnızca `page.tsx` ve `route.ts` | Skor **yalnızca yazılıyor, hiçbir yerde okunmuyor**. |
| 29 | Bağlam: QR/bayi adı, intent, işlenme zamanı | EKSİK | `route.ts:38-41` çekiyor, `page.tsx` göstermiyor | `qrCode.name`, `intent`, `aiProcessedAt` gereksiz yere ağ üzerinden geliyor. |
| 30 | Haftalık örnekleme işi (sayfayı besleyen arka uç) | KISMİ | `lib/inngest/functions.ts:114-122`, `app/api/internal/inngest/ai-quality-sample/route.ts:16-39` | Rastgele değil, en yeni 200 kayıttan ilk 100'ü alınıyor (yanlı). Tetikleme Inngest'e bağlı. `/api/cron/daily` orkestratöründe yok (`app/api/cron/daily/route.ts:51-59`). Inngest'in üretimde bağlı olup olmadığı **doğrulanmadı** (yerel `.env*` dosyalarında `INNGEST_` anahtarı bulunamadı). |
| 31 | Yetki | ÇALIŞIYOR | `route.ts:20-21`, `:62-63` (`requireAuth(['ADMIN'])`), `proxy.ts:51`, `:79` | Sayfa proxy'nin ADMIN rolü ve gizli kapı (gate) çerezi kontrolüyle korunuyor; API rol kontrolü yapıyor. IDOR yok: tek kiracılı admin verisi. |
| 32 | Denetim günlüğü (kim, neyi, ne zaman skorladı) | EKSİK | `route.ts:81-90` | Yalnızca `reviewerId` tutuluyor, UI'da gösterilmiyor. Diğer admin uçları `prisma.auditLog.create` kullanıyor (`app/api/admin/api-keys/route.ts:74`). |
| 33 | Çok dillilik | KISMİ | `page.tsx:24`, `:55`, `:113-308` | `useAppT` içe aktarılmış ama yalnızca fırlatılan hata metninde kullanılıyor. Sayfadaki tüm metinler sabit Türkçe; EN locale'de sidebar "AI Quality" diyor, sayfa Türkçe kalıyor. Toast öneki "Basarili: " Türkçe karaktersiz (`lib/admin-toast.ts:17`). |
| 34 | Mobil filtre ve aksiyon satırı | KISMİ | `page.tsx:146` (`flex gap-2`, wrap yok), `app/admin/layout.tsx:38` (`overflow-x-hidden`) | 3 filtre ve 2 ikonlu uzun buton yaklaşık 550px tutuyor; 400px'te sağ taraf **kırpılır**. Ekranda doğrulanmadı, sınıflardan hesaplandı. Rozet satırı (`:222`) da sarmıyor. |
| 35 | Liste giriş animasyonu (`Motion.div` opacity) | ÇALIŞIYOR | `page.tsx:206-211` | Ölçülü (0.2s opacity). Her yeniden yüklemede tüm liste yeniden soluyor. `prefers-reduced-motion` için açık bir `MotionConfig` yok; yalnızca opaklık değiştiği için risk düşük. |

---

## Bulgular

### 1. "Skor Ver" kapalı kartta hiçbir şey yapmıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / hata · **Efor:** S
- **Kanıt:** `app/admin/ai-quality/page.tsx:238-241` (`e.stopPropagation(); startEdit(s);`), `:104-108` (`startEdit` yalnızca `setEditingId`), `:254` (form `expandedId === s.id` koşuluna bağlı), `:263`.
- **Sorun:** Sayfanın birincil görevi skor vermek. Listede kartlar varsayılan olarak kapalı. Kullanıcı "Skor Ver"e bastığında `editingId` değişiyor ama form, kapalı kartın içinde olduğu için render edilmiyor. Görünürde hiçbir şey olmuyor. Kullanıcının önce kartı açması, sonra butona yeniden basması gerekiyor (açık kartta buton hâlâ görünüyor). Klasik "ölü buton" algısı.
- **Öneri:** Kısa vadede `startEdit` içinde `setExpandedId(s.id)` çağrılmalı. Doğru çözüm ise "Skor Ver"i ayrı bir mod olmaktan çıkarmak: açık kartta (ya da sağ panelde) skor formu her zaman görünür olmalı. Böylece inceleyici "oku → değerlendir → kaydet → sonraki" akışını tek bağlamda tamamlar (bkz. Yeniden tasarım vizyonu).

### 2. Sezgisel (sahte) AI analizleri kalite örneklem havuzuna giriyor; değerlendirme verisi kirleniyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `app/api/admin/bootstrap/route.ts:466-484`. `synthesize_ai_signals` (AI Kontrol sayfasından tetikleniyor, `app/admin/ai-dashboard/page.tsx:181`) gerçek feedback'lere `aiModelUsed:'bootstrap-heuristic'` (`:477`) ve `aiProcessedAt: new Date()` (`:479`) yazıyor. Örnekleme ise yalnızca `aiProcessedAt: { not: null }` koşuluna bakıyor (`app/api/internal/inngest/ai-quality-sample/route.ts:20`, `bootstrap/route.ts:388`). Gerçek pipeline yerel yedekte (fallback) özellikle `aiProcessedAt`'i NULL bırakıyor (`lib/inngest/feedback-analyze-pipeline.ts:53-62`). Yani bu ayrım bilinçli tasarlanmış, bootstrap yolu onu deliyor.
- **Sorun:** İnceleyici, LLM'in değil bir kural setinin ürettiği "analizi" (`{source:'bootstrap', note:'Heuristic synthesis…'}`) skorluyor ve bunu ekranda ayırt edemiyor, çünkü `aiModelUsed`/`aiVersion` seçilmiyor ve gösterilmiyor. Ortaya çıkan doğruluk verisi model kalitesini değil, sentetik veriyi ölçüyor.
- **Öneri:** Örnekleme sorgularına `aiModelUsed: { notIn: ['bootstrap-heuristic','local-fallback'] }` filtresi eklenmeli. `AIQualitySample` satırına örnekleme anında `modelUsed` ve `promptVersion` anlık kopyası (snapshot) yazılmalı: feedback sonradan yeniden analiz edilirse skor yanlış modele atfedilmesin. UI her örnekte model ve versiyon rozetini göstermeli. Uzun vadede bootstrap'ın gerçek feedback satırlarına "AI" alanı yazması kaldırılmalı; demo verisi ayrı demo bayiler üzerinde üretilmeli (`seed_demo_cafes` deseni gibi).

### 3. "Demo örnekleri sil" insanların verdiği skorları da siliyor; "demo" örnekler aslında gerçek veri
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / UX · **Efor:** S–M
- **Kanıt:** Seed `bootstrap/route.ts:385-430`: gerçek, en yeni 200 feedback'ten 80 örnek açıyor ve `notes:'[bootstrap-demo]'` yazıyor (`:414`). Sil işlemi `bootstrap/route.ts:432-441`: tracker ID'lerini **durumdan bağımsız** `deleteMany` ile siliyor. UI'da onay yok (`page.tsx:173-178`). Not alanı bu işaretle önceden doluyor (`page.tsx:107`).
- **Sorun:** (a) "Demo" diye üretilen örnekler gerçek müşteri yorumları üzerinde. Cron'un açtığı örneklerle aynı feedback'leri `@@unique([feedbackId])` (`prisma/schema.prisma:2224`) nedeniyle **kilitliyor**, cron artık o feedback'leri örnekleyemiyor. (b) Bir admin bu örneklerden birini skorlarsa ve (c) başka biri tek tıkla "Demo örnekleri sil"e basarsa, incelenmiş iş geri dönüşsüz siliniyor. (d) Not alanına `[bootstrap-demo]` iç işareti dolduğu için admin ya kafası karışıyor ya da notu silip kaydı "demo" sayımından düşürüyor (`app/api/admin/bootstrap/summary/route.ts:25-29` yalnızca notes'a bakıyor), sonuçta iki kaynak (tracker ve notes) birbirini tutmuyor.
- **Öneri:** Demo işaretini serbest metin olan `notes` alanından çıkarıp şemaya `source: 'cron' | 'manual' | 'demo'` enum alanı eklenmeli. Silme yalnızca `status='pending' AND source='demo'` kayıtlarını kapsamalı. Butonda kaç kaydın silineceğini gösteren satır içi bir onay adımı olmalı. Daha doğrusu, üretim ortamında bu iki buton gizlenmeli (ya da bir ortam bayrağına bağlanmalı) ve yerlerini "Şimdi örnekle" (gerçek örnekleme işini elle tetikleyen) aksiyonu almalı.

### 4. Doğruluk skoru "veri mezarlığı": hiçbir yerde okunmuyor, hiçbir karara dönüşmüyor
- **Önem:** yüksek · **Kategori:** ürün / mimari · **Efor:** M
- **Kanıt:** `accuracyScore` yalnızca `app/admin/ai-quality/page.tsx` ve `app/api/admin/ai-quality/route.ts` içinde geçiyor (repo genelinde `grep`). İstatistik ucu yalnızca iki `count` dönüyor (`route.ts:47-55`).
- **Sorun:** Bir değerlendirme ekranının değeri, ürettiği sinyalde yatar: "Bu hafta model doğruluğu %78, geçen hafta %84; düşüş `v3` prompt'unda ve şikâyet (complaint) intent'inde." Şu an skorlar toplanıyor ama ortalama, dağılım, trend, model veya prompt versiyonu kırılımı, bayi kırılımı yok. AI ayarlarına ya da öğrenme profillerine (`/admin/ai-learning`) geri besleme de yok. İnceleyicinin emeği boşa gidiyor.
- **Öneri:** API'ye `GET /api/admin/ai-quality/metrics?range=12w` eklenmeli: haftalık ortalama doğruluk, p25/p50, örnek sayısı, `modelUsed`/`aiVersion`/`sentiment`/`intent` kırılımları (Prisma `groupBy` ya da `$queryRaw`, Upstash'te 5 dk cache). Sayfanın üstüne KPI şeridi (ortalama doğruluk ve delta, incelenme oranı, en zayıf boyut) ve 12 haftalık bir çizgi grafik konmalı. Eşik altı haftalarda (ör. <70) admin bildirimi üretilmeli.

### 5. Değerlendirme birimi yanlış: tek bir 0–100 sayı, rubriksiz ve ham JSON üzerinden
- **Önem:** orta · **Kategori:** UX / ürün · **Efor:** M
- **Kanıt:** `page.tsx:256-261` (`JSON.stringify(s.feedback?.aiAnalysis)`, `max-h-32`), `:266-276` (serbest sayı girişi), `route.ts:33-41` (yapılandırılmış alanlar seçilmiyor).
- **Sorun:** AI çıktısı onlarca alandan oluşuyor (sentiment, intent, topics, themes, entities, urgency, churnRisk, actionSuggestions). İnceleyiciden bunun tamamı için tek bir "doğruluk" yüzdesi isteniyor ve çıktı ham, kesilmiş bir JSON'dan okunuyor. Bu, değerlendiriciler arası tutarlılığı (inter-rater reliability) düşürür, skoru eyleme dönüştürülemez kılar ve yorumun **tam metni hiçbir yerde gösterilmiyor** (`:219-221` truncate).
- **Öneri:** Alan bazlı değerlendirmeye geçilmeli. Her boyut için "Doğru / Kısmen / Yanlış" üçlü seçimi (sentiment, intent, temalar, aciliyet, önerilen aksiyon) ve "Yanlış" seçilince doğru değerin girilmesi. Genel skor bu seçimlerden türetilmeli. Düzeltilen değerler mevcut `AIFeedbackCorrection` tablosuyla (`prisma/schema.prisma`, `field` alanı aynı sözlüğü kullanıyor) aynı biçimde saklanarak öğrenme döngüsüne beslenmeli. Görünümde sol tarafta tam yorum metni, sağda AI çıktısı okunabilir alanlar halinde, JSON yalnızca "ham çıktı" açılır bölümünde durmalı.

### 6. Örnekleme yanlı ve tetiklenip tetiklenmediği belirsiz
- **Önem:** orta · **Kategori:** veri / güvenilirlik · **Efor:** S–M
- **Kanıt:** `app/api/internal/inngest/ai-quality-sample/route.ts:17-34` (`orderBy createdAt desc`, `take N*2`, ardından `slice(0,N)`). Tetikleme yalnızca Inngest cron'unda (`lib/inngest/functions.ts:114-122`, `'0 3 * * 0'`). Tek uyanış kuralına göre toplanan `/api/cron/daily` listesinde yok (`app/api/cron/daily/route.ts:51-59`).
- **Sorun:** "Rastgele örnek" yerine haftanın son günlerinin en yeni yorumları seçiliyor. Hacimli bayiler ve hafta sonu yorumları baskın çıkıyor, negatif ya da nadir intent'ler yeterince temsil edilmiyor. Ayrıca projenin cron'ları tek orkestratörde toplama kararına rağmen bu iş Inngest'e bağlı kalmış. Inngest'in üretimde bağlı olduğu **doğrulanmadı**. Bağlı değilse boş durumdaki "Haftalık cron ile 100 örnek eklenir" (`page.tsx:193`) yanlış bir vaat.
- **Öneri:** Örneklemeyi `ORDER BY random()` ya da `TABLESAMPLE` ile, `sentiment × intent` katmanlı (stratified) kotalarla yapan saf bir fonksiyon yazılmalı ve `/api/cron/daily` içinde "Pazar günü çalış" koşuluyla çağrılmalı. Sayfada "Son örnekleme: tarih, N örnek" satırı gösterilmeli: kaynak bir `Settings` anahtarı ya da örneklerin en yeni `createdAt` değeri olabilir.

### 7. Sayfalama yok, eski bekleyen örnekler görünmez kalıyor
- **Önem:** orta · **Kategori:** işlevsellik · **Efor:** S
- **Kanıt:** `page.tsx:68` (`limit=50`), `route.ts:25` ve `:30` (`createdAt desc`). `parseInt` NaN döndürürse `take: NaN` olur ve sorgu hata verir (`route.ts:25`). GET'te try/catch yok.
- **Sorun:** Haftada 100 (seed'le +80) örnek eklenirken ilk 50 dışındakiler ancak öndekiler incelendikçe görünür. Yeni hafta geldiğinde eski bekleyenler sürekli geride kalır. Sayaç "Bekleyen 180" derken liste 50 gösteriyor ve kullanıcıya bu söylenmiyor.
- **Öneri:** İmleç (cursor) tabanlı sayfalama (`cursor`/`take`) ve "Bekleyen" görünümünde `createdAt asc` (önce en eski, FIFO) sıralaması. `limit` için `z.coerce.number().int().min(1).max(100).catch(50)` kullanılmalı. GET gövdesi try/catch ile sarılıp anlamlı bir 500 dönmeli.

### 8. Kaydetme akışı: çift gönderim, yarış koşulu, denetim izi yok
- **Önem:** orta · **Kategori:** güvenilirlik / denetlenebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:85-102` (yükleniyor ya da devre dışı durumu yok), `page.tsx:81-83` (filtre değişiminde `AbortController` yok; geç dönen eski yanıt yeni filtrenin listesini ezebilir), `route.ts:78-90` (koşulsuz `update`, `auditLog` yok).
- **Sorun:** Hızlı filtre değişiminde liste ile seçili filtre birbirini tutmayabilir. Kaydet butonuna çift basılabilir. İki admin aynı örneği aynı anda skorlarsa son yazan sessizce kazanır. Kimin hangi skoru ne zaman değiştirdiği denetim günlüğünde görünmez. Diğer admin uçları `prisma.auditLog.create` kullanıyor (`app/api/admin/api-keys/route.ts:74`).
- **Öneri:** Veri katmanı SWR ya da React Query'ye taşınmalı (anahtar: `['ai-quality', status, cursor]`). Böylece yarış koşulu ve iptal sorunu kendiliğinden çözülür. Kaydet için `isSaving` durumu ve iyimser (optimistic) güncelleme eklenmeli. PATCH'te `where: { id, status: 'pending' }` ya da bir `updatedAt` versiyon kontrolüyle çakışmada 409 dönmeli. `auditLog` kaydı yazılmalı. İnceleyici adı UI'da gösterilmeli.

### 9. Silinmiş (soft-delete) geri bildirimler örneklenip gösterilebiliyor
- **Önem:** orta · **Kategori:** veri / gizlilik · **Efor:** S
- **Kanıt:** Seed sorgusunda `deletedAt` filtresi yok (`bootstrap/route.ts:387-392`). GET, ilişkili feedback'in `deletedAt` değerine bakmıyor (`route.ts:27-45`). Cron filtreliyor (`ai-quality-sample/route.ts:19`).
- **Sorun:** Kullanıcının ya da bayinin sildiği bir yorumun metni inceleme ekranına düşebilir (gizlilik talepleri açısından hassas).
- **Öneri:** GET'te `where: { ..., feedback: { deletedAt: null } }`, seed'de `deletedAt: null` filtresi kullanılmalı. Sonradan silinen feedback'e ait bekleyen örnekler otomatik olarak `status:'void'` yapılmalı.

### 10. Erişilebilirlik ve mobil kusurları
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil · **Efor:** S
- **Kanıt:** `page.tsx:214-216` (`div onClick`; `role`, `tabIndex`, `aria-expanded`, `aria-controls` yok), `:266` ve `:279` (`<label>` için `htmlFor` yok), `:146` (`flex gap-2`, wrap yok), `:222` (rozet satırı wrap yok), `:229` (yalnızca renkli ikon).
- **Sorun:** Klavye kullanıcısı kartı açamıyor. Ekran okuyucu formu etiketsiz okuyor. ~400px'te filtre satırı yatay kırpılıyor (layout `overflow-x-hidden`, `app/admin/layout.tsx:38`). Görsel doğrulama yapılmadı, sınıflardan hesaplandı.
- **Öneri:** Kart başlığı `<button aria-expanded aria-controls>` olmalı, ya da shadcn `Collapsible`/`Accordion` kullanılmalı. Filtreler bir `ToggleGroup`/`Tabs` içine alınmalı, demo aksiyonları sağda bir `DropdownMenu`'ye taşınmalı (`flex-wrap`). İncelendi durumu metinli bir rozet olmalı. Klavye kısayolları eklenmeli (bkz. vizyon).

### 11. Dil ve tutarlılık
- **Önem:** düşük · **Kategori:** i18n / tutarlılık · **Efor:** S
- **Kanıt:** `page.tsx:24` ve `:55` (`useAppT`), metinler sabit (`:113-308`). `:224` (ham `positive`/`negative` değerleri, "Sentiment" etiketi). `lib/admin-toast.ts:17` ve `:19` ("Basarili: ", Türkçe karaktersiz). Kullanılmayan importlar: `Eye`, `Star`, `Loader2` (`page.tsx:6`, `:11`, `:13`); `catch (err)` değişkenleri kullanılmıyor (`:73`, `:99`). `qrCode`, `intent` ve `aiProcessedAt` çekiliyor ama gösterilmiyor (`route.ts:38-41`). Kardeş AI sayfaları `AdminPremiumHero` kullanıyor, bu sayfa `PageHeader`.
- **Öneri:** Metinler `messages/{tr,en}.json` altında `adminAiQuality.*` anahtarlarına taşınmalı. Sentiment ve intent için ortak etiket sözlüğü kullanılmalı (diğer AI sayfalarında bir eşleme varsa o tekrar kullanılmalı). Ölü importlar temizlenmeli. Başlık bileşeni AI ailesiyle hizalanmalı.

---

## Eksik özellikler (kıyas: PostHog / LangSmith-tarzı eval araçları, Linear triage, Retool iç araçları)

1. **Kalite gösterge paneli:** haftalık ortalama doğruluk, trend çizgisi, model × prompt versiyonu × intent kırılımı, eşik alarmı (PostHog Insights / LangSmith eval dashboards).
2. **Odaklı triage modu:** tam ekran tek örnek görünümü, klavye kısayolları (`1/2/3` doğru/kısmen/yanlış, `J/K` sonraki/önceki, `S` atla, `⌘↵` kaydet) ve ilerleme göstergesi ("23 / 100"). Linear Triage'ın akışına benzer.
3. **Alan bazlı düzeltme ve öğrenme döngüsü:** yanlış alanı düzeltip `AIFeedbackCorrection` ya da öğrenme profiline yollamak; "bu hatayı tekrar gösterme" etiketleri; hata taksonomisi (yanlış sentiment, kaçırılmış ironi, yanlış tema…).
4. **Çoklu inceleyici ve uzlaşı:** aynı örneğe 2 inceleyici atama, anlaşma oranı (Cohen's kappa), çakışmaları hakeme düşürme; atama ve "bana atananlar" filtresi.
5. **Filtre, arama ve dışa aktarma:** bayi, model, sentiment, intent, skor aralığı, tarih; tam metin arama; CSV/JSONL dışa aktarma (prompt iyileştirme ve fine-tune veri seti için).
6. **Örnekleme kontrolü:** örneklem boyutu, katman kotaları, "şimdi örnekle" düğmesi, son çalışma zamanı ve sonucu; ayrıca "atla / geçersiz (spam, boş metin)" durumu.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "AI Kalite" bir liste değil bir **değerlendirme tezgâhı** olmalı. Admin sayfayı açtığında üç saniyede "AI bu hafta ne kadar iyi, nerede kötüleşti?" sorusunun cevabını görmeli. Sonra tek tıkla odaklı inceleme moduna girip klavyeyle dakikada 4–6 örnek değerlendirebilmeli. Her değerlendirme hem bir metrik noktası hem de öğrenme sistemine giden bir düzeltme olmalı.

**Yerleşim:**
1. **Üst şerit (KPI):** Ortalama doğruluk (haftalık delta oku), incelenme oranı (incelenen / örneklenen), en zayıf boyut (ör. "Intent: %61"), son örnekleme zamanı. Dataviz kurallarına uygun, tek renk ailesinde stat kartları.
2. **Trend paneli:** 12 haftalık doğruluk çizgisi; model ya da prompt versiyonu değişimleri dikey işaretçilerle gösterilir (prompt değişikliği ile kalite düşüşü korelasyonu tek bakışta görünür).
3. **Kuyruk (sol, %40):** `Tabs` (Bekleyen / İncelendi / Atlandı / Tümü), filtre çipleri (bayi, model, sentiment, intent), sanal (virtualized) liste. Her satırda yorum ilk satırı, yıldız, model rozeti ve durum rozeti.
4. **İnceleme paneli (sağ, %60):** tam yorum metni ve bağlam (bayi/QR, tarih, puan). Altında AI çıktısı alan alan; her alanın yanında `Doğru · Kısmen · Yanlış` segment kontrolü; "Yanlış" seçilince satır içi düzeltme girişi. En altta not alanı ve `Kaydet ve sonraki` (`⌘↵`). Ham JSON katlanır bir "Geliştirici görünümü" içinde.
5. **Mobilde:** kuyruk tam ekran liste; satıra dokununca inceleme paneli alttan açılan bir `Sheet` olarak gelir; değerlendirme kontrolleri dokunmaya uygun (≥44px) segment butonlar.

**Motion (ölçülü):** Kayıttan sonra satır kuyruktan kısa bir `layout` geçişiyle çıkar ve bir sonraki örnek panelde 150ms'lik çapraz geçişle (crossfade) gelir. KPI delta'sında sayı yuvarlanması (count-up) yalnızca ilk yüklemede olur. Liste girişindeki tüm-liste fade kaldırılmalı. Tüm geçişler `useReducedMotion` ile kapatılabilir olmalı. 3B ya da dekoratif efekt **gereksiz**: bu bir iş tezgâhı ve hız, süsten önemli.

**Veri ve API değişiklikleri:**
- `AIQualitySample` şemasına şu alanlar eklenmeli: `source` (`cron|manual|demo`), `modelUsed`, `promptVersion` (örnekleme anı snapshot'ı), `fieldVerdicts Json` (alan → doğru/kısmen/yanlış ve düzeltme), `status` için `skipped|void` değerleri, `updatedAt` (iyimser kilit), `reviewer` ilişkisi. İndeks: `[status, createdAt]`, `[modelUsed, reviewedAt]`.
- `GET /api/admin/ai-quality`: imleç (cursor) sayfalama, zod ile doğrulanmış filtreler, `feedback.deletedAt: null`, yapılandırılmış AI alanları ve `aiModelUsed`/`aiVersion` seçimi.
- `PATCH /api/admin/ai-quality/[id]`: alan bazlı karar, versiyon kontrolü (409), `auditLog`, isteğe bağlı olarak `AIFeedbackCorrection` ya da öğrenme profiline yazma.
- `GET /api/admin/ai-quality/metrics`: haftalık agregasyon ve kırılımlar, Upstash cache (5 dk), `revalidateTag` ile PATCH sonrası geçersizleştirme.
- `POST /api/admin/ai-quality/sample`: katmanlı rastgele örnekleme (ortak saf fonksiyon). Aynı fonksiyon `/api/cron/daily` içinde haftada bir çağrılır; Inngest bağımlılığı kalkar.
- Bootstrap `seed_/clear_ai_quality_samples` üretim ortamında kapatılmalı; `synthesize_ai_signals` yolu örnekleme havuzundan dışlanmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ai-learning`** (öğrenme profilleri, `AIFeedbackCorrection` verisi) ile amaç örtüşmesi yüksek: biri bayi düzeltmelerinden öğreniyor, diğeri admin düzeltmesi topluyor ama ikisi birbirine bağlı değil. Öneri: "AI Değerlendirme" başlığı altında iki sekme olmalı: **İnceleme kuyruğu** (bu sayfa) ve **Düzeltmeler ve öğrenme** (ai-learning). Ortak düzeltme veri modeli kullanılmalı.
- **`/admin/ai-dashboard`** (AI Kontrol) sayfası `synthesize_ai_signals` ile bu sayfanın veri havuzunu kirletiyor (Bulgu 2). Kalite KPI şeridi AI Kontrol panosunda da özet kart olarak gösterilmeli: tek doğru kaynak metrics ucu.
- **`/admin/ai-detailed`** ve **`/admin/qra-chat-logs`**: farklı amaçlar (detaylı analiz ve sohbet kayıtları). Doğrudan çakışmıyorlar, ama sohbet yanıtlarının kalitesi de ileride aynı değerlendirme tezgâhına bir "kaynak türü" olarak eklenebilir.
- Navigasyonda `/admin/ai-detailed` ve `/admin/ai-quality` aynı `Eye` ikonunu kullanıyor (`components/dashboard/sidebar.tsx:189`, `:191`; `app/admin/admin-utils.ts:118`, `:120`). Ayırt edilebilirlik için farklı ikon (ör. `ClipboardCheck`/`Gauge`) kullanılmalı.
- **Kaldırma önerilmez:** insan değerlendirmesi AI ürününde vazgeçilmez bir kalite kapısı. Sorun sayfanın varlığında değil, döngünün kapanmamasında.

---

## Doğrulama (şüpheci inceleme)

Üç iddia, kod baştan okunarak çürütülmeye çalışıldı (salt okunur; DB/komut çalıştırılmadı).

### 1. "Skor Ver" butonu kapalı kartta görünür hiçbir etki üretmiyor — **DOĞRULANDI**
- `app/admin/ai-quality/page.tsx:238-241`: buton `e.stopPropagation()` çağırıp yalnızca `startEdit(s)` çalıştırıyor; satırın `onClick`'i (`:216`, `setExpandedId`) tetiklenmiyor.
- `startEdit` (`:104-108`) yalnızca `editingId/score/notes` atıyor, `expandedId`'ye dokunmuyor.
- Skor formu `expandedId === s.id` bloğunun içinde (`:254`) ve ancak orada `editingId === s.id` (`:263`) kontrol ediliyor. `expandedId` başlangıçta `null` (`:60`).
- **Yeniden üretim:** sayfayı aç → kapalı herhangi bir kartta "Skor Ver"e tıkla → hiçbir şey olmaz (görsel geri bildirim yok). Kartı sonradan açınca form "kendiliğinden" belirir. Ek olarak: A kartı açıkken B'de "Skor Ver"e basılırsa yine hiçbir şey görünmez ve A'nın açık formu (varsa) sessizce kapanır, girilen skor/not B'nin değerleriyle ezilir.
- Düzeltme yönü: `startEdit` içinde `setExpandedId(s.id)` (veya genişletme ve düzenleme durumunu tek bir `activeSampleId` durumunda birleştirmek). Rapordaki "inceleme paneli" yeniden tasarımı bu ikili durumu zaten ortadan kaldırır.

### 2. Sahte (heuristic) AI analizleri kalite değerlendirmesine giriyor — **DOĞRULANDI** (bir nüansla)
- `app/api/admin/bootstrap/route.ts:449-488`: `synthesize_ai_signals` (son 250 metinli feedback içinden `aiProcessedAt` boş olanlar) gerçek `Feedback` satırlarına `aiModelUsed:'bootstrap-heuristic'`, `aiProcessedAt:new Date()`, rating'den türetilmiş sentiment/intent/urgency/churnRisk yazıyor. Tetikleyen UI: `app/admin/ai-dashboard/page.tsx:181` (AI Kontrol sayfasındaki bootstrap butonu); uç yalnızca `requireAuth(['ADMIN'])` ile korunuyor, üretimde kapalı değil.
- Gerçek pipeline fallback'te `aiProcessedAt`'i bilinçli olarak NULL bırakıyor (`lib/inngest/feedback-analyze-pipeline.ts:53-62`). Bootstrap yolu bu satırları da (local-fallback olanlar dahil) "işlenmiş" yapıyor.
- Örnekleme filtresi yalnızca `aiProcessedAt: { not: null }` (`app/api/internal/inngest/ai-quality-sample/route.ts:20`; demo seed'de de aynı, `bootstrap/route.ts:388`); `aiModelUsed` hariç tutulmuyor. Dolayısıyla heuristic satırlar kuyrukta "AI çıktısı" olarak skorlanıyor ve ortalama doğruluk metriğine giriyor.
- **Ek (iddiada olmayan, daha ağır) etki:** `app/api/cron/ai-retry/route.ts:38` yalnızca `aiProcessedAt: null` satırları yeniden analiz ediyor; sentezlenen satırlar bir daha asla gerçek LLM analizine yükseltilmiyor. Yani bu yol sadece kalite metriğini değil, bayinin gördüğü sentiment/churn verisini de kalıcı olarak heuristic'e kilitliyor.
- **Nüans (iddianın bir kısmı abartılı):** "UI model bilgisini göstermediği için fark edilemiyor" kısmen yanlış. Kart açıldığında ham `aiAnalysis` JSON'ı gösteriliyor (`page.tsx:257-259`) ve bu JSON `source:'bootstrap'`, `note:'Heuristic synthesis…'` içeriyor (`bootstrap/route.ts:480-484`). Dikkatli bir inceleyici fark edebilir; ancak liste satırında, filtrede ve API seçiminde (`app/api/admin/ai-quality/route.ts:31-40`, `aiModelUsed` seçilmiyor) model ayrımı yok, toplu metrikte ise hiç ayrışmıyor.
- **Yeniden üretim:** GROQ geçici olarak yokken gelen bir yorum `aiProcessedAt=null` kalır → admin AI Kontrol'de bootstrap'a basar → satır heuristic ile "işlenmiş" olur → haftalık örnekleme veya "Demo örnek üret" bu satırı kuyruğa alır → inceleyici rating'den türetilmiş sahte analizi AI'ın çıktısı sanıp skorlar.

### 3. Demo temizleme incelenmiş insan skorlarını geri dönüşsüz siliyor — **DOĞRULANDI**
- Seed gerçek üretim feedback'leri üzerinde örnek açıyor (`bootstrap/route.ts:387-418`, `notes:'[bootstrap-demo]'` `:414`, ID'ler tracker'a `:419-424`). Bu satırlar `deletedAt` filtresi de uygulamıyor (`:388`), cron ise uyguluyor.
- Temizlik `aiQualitySampleIds` içindeki ID'leri **status'tan bağımsız** siliyor (`:434-441`); `status:'pending'` ya da `reviewedAt: null` koşulu yok.
- `BootstrapActionButton` hiçbir onay adımı içermiyor (`components/admin/bootstrap-action-button.tsx:40-70`, doğrudan `fetch`); sayfada `variant="destructive"` buton tek tıkla çalışıyor (`page.tsx:173-178`). Aynı eylem `app/admin/settings/settings-client.tsx:627-628, :844` üzerinden de (toplu temizlik dahil) tetiklenebiliyor.
- `@@unique([feedbackId])` (`prisma/schema.prisma:2224`) ve cron'un `existingIds` dışlaması (`ai-quality-sample/route.ts:29-34`) nedeniyle demo örnekler, aynı haftadaki gerçek feedback'lerin cron tarafından örneklenmesini engelliyor; silindiklerinde ise o haftanın insan skoru da kayboluyor.
- İşaret tutarsızlığı da gerçek: `startEdit` notu `[bootstrap-demo]` ile önceden dolduruyor (`page.tsx:107`). İnceleyici notu değiştirirse PATCH (`app/api/admin/ai-quality/route.ts:85`) işareti siler; tracker ID'si yine de silmeyi garanti eder. Tersine, tracker kaydı kaybolursa (ör. elle `Settings` sıfırlanırsa) not değiştirilmiş demo örnekleri artık temizlenemez ve kalıcı olarak "gerçek" örnek gibi kalır.
- **Yeniden üretim:** "Demo örnek üret" → bir örneği aç, "Skor Ver" → 40 gir, kaydet (`status:'reviewed'`) → "Demo örnekleri sil" → toast "silinen: N"; incelenmiş örnek ve skoru geri dönüşsüz yok olur, "İncelendi" sayacı düşer.
- Düzeltme yönü: demo kaynağını şemada bir `source` alanıyla işaretlemek (not alanını işaret olarak kullanmamak), temizliği `status:'pending'` ile sınırlamak veya incelenmişleri `source:'manual'`'a terfi ettirmek, yıkıcı bootstrap eylemlerine onay diyaloğu eklemek ve üretimde bootstrap seed/clear uçlarını ortam bayrağıyla kapatmak.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/admin/ai/quality` (sekme `?tab=inceleme`). `/admin/ai-quality` sorgu parametreleri korunarak buraya kalıcı yönlenir (`permanentRedirect`). Eski `GET/PATCH /api/admin/ai-quality` silindi.

**Yeni yapı:** Sunucu bileşeni (`app/admin/ai/quality/page.tsx`) metrikleri ve kuyruğun ilk sayfasını sunucuda okur. İstemci adası `components/admin/a-ai-kalite/**` içinde: QDL v2 `PanelPage`, `SectionTabs`, `MetricTile`, `DataTable` ve `DetailSheet` ile ops kaydında kuruldu. Sunucu mantığı `lib/ai-quality/{contract,quality.server,sampler,pii-mask,time}.ts` dosyalarında. BFF uçları `defineRoute` ile tanımlı (ADMIN, zod, rate limit; admin kapısı `requireAuth` içinde): `GET /api/admin/ai/quality/samples`, `GET|PATCH /samples/[id]`, `GET /metrics`, `POST /run`. Haftalık iş (`/api/internal/inngest/ai-quality-sample`, `/api/cron/daily` Pazar günü çağırır) aynı `runSampling` fonksiyonunu kullanır. Test: `__tests__/lib/ai-quality.test.ts` (23 test).

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Başlık | ÇALIŞIYOR | QDL `PageHeader` (ops) ve "Yenile" aksiyonu |
| 2 | Bekleyen sayacı | ÇALIŞIYOR | KPI kutusu ve sekme rozeti. Altında incelendi, atlandı ve geçersiz kırılımı var. |
| 3 | İncelendi sayacı | ÇALIŞIYOR | Artık kalite metriğiyle birlikte gösteriliyor: haftalık ortalama doğruluk, delta ve 12 haftalık seri. |
| 4–6 | Filtreler (Bekleyen/İncelendi/Tümü) | ÇALIŞIYOR | URL'ye bağlı `FilterBar`: durum (Bekliyor, İncelendi, Atlandı, Geçersiz, Tümü), model, duygu, niyet ve arama. Değerler zod ile doğrulanır. |
| 7 | "Demo örnek üret" | KALDIRILDI | Gerçek veride örnek açan bu butonun yerini onaylı "Şimdi örnekle" aldı; gerçek örnekleme işini elle tetikler. Bootstrap eylemi Ayarlar'da duruyor. Demo bayi örnekleri "Demo bayi" rozetiyle ayrılır ve metriğe girmez. |
| 8 | "Demo örnekleri sil" | KALDIRILDI | Bu sayfadan kaldırıldı. Bootstrap temizliği zaten yalnızca `pending` kayıtları siliyor; bunu başka bir yüzey düzeltmiş. |
| 9 | Yükleniyor iskeleti | ÇALIŞIYOR | `QueryState`/`DataTable` iskeleti. Sayfa geçişinde önceki veri yerinde kalır. |
| 10 | Boş durum | ÇALIŞIYOR | "Kuyruk temiz" ile "bu filtreyle örnek yok" ayrı gösterilir. Yanlış "haftalık 100 örnek" vaadinin yerine son örneklemenin zamanı ve örnek sayısı yazılır. |
| 11 | Hata durumu | ÇALIŞIYOR | Hata artık boş liste gibi görünmüyor: `ErrorState` ve "Tekrar dene" var. 404 ve 403 ayrı gösterilir. |
| 12 | Yorum metni | ÇALIŞIYOR | Listede 2 satırlık önizleme, detayda tam metin (PII maskeli). |
| 13 | Yıldız | ÇALIŞIYOR | Ekran okuyucu için metin eklendi. |
| 14 | Sentiment rozeti | ÇALIŞIYOR | Türkçe etiket ("Olumlu", "Olumsuz"…). Niyet de Türkçe gösterilir. |
| 15 | Doğruluk rozeti | ÇALIŞIYOR | Renk tonunun yanında metin de var; durum yalnızca renkle anlatılmıyor. |
| 16 | İncelendi ikonu | ÇALIŞIYOR | Metinli `StatusBadge` |
| 17 | Satırı aç/kapa | ÇALIŞIYOR | `DataTable` satırı Enter ya da Space ile açılır. `DetailSheet` `?id=` derin bağlantısını ve önceki/sonraki gezinmeyi destekler. |
| 18 | "Skor Ver" (BOZUK) | ÇALIŞIYOR | Ayrı düzenleme modu kaldırıldı; satır açılınca değerlendirme formu her zaman görünür. |
| 19 | AI analizi görünümü | ÇALIŞIYOR | Alanlar tek tek gösterilir: duygu ve duygular, niyet ve güven, tema ve konu, aciliyet, kayıp riski ve çaba, aksiyon önerileri. Model, prompt sürümü ve analiz zamanı görünür. Ham JSON, katlanır "geliştirici görünümü"nde maskeli olarak durur. |
| 20 | Skor girişi 0–100 | KALDIRILDI (yerine alan bazlı karar) | Her alan Doğru, Kısmen, Yanlış ya da Değerlendirilemez olarak işaretlenir. Skor sunucuda türetilir (1 / 0,5 / 0). Yanlış ya da kısmen işaretlenen alanlara doğru değer girilebilir. |
| 21 | Notlar | ÇALIŞIYOR | `[bootstrap-demo]` iç işareti nota hiç dolmaz ve gösterilmez. |
| 22 | Kaydet | ÇALIŞIYOR | Yükleniyor ve devre dışı durumu var. İyimser kilit (beklenen durum ve reviewedAt) çakışmada 409 döner. `auditLog` kararları, düzeltmeleri, eski ve yeni değeri tutar. "Kaydet ve sonraki" Ctrl/⌘+Enter ile de çalışır. |
| 23 | İptal | ÇALIŞIYOR | Çekmeceyi kapatmak (Esc) |
| 24 | Kayıtlı not | ÇALIŞIYOR | İç işaret sızmaz. Geçmiş zaman çizelgesi kimin, ne zaman, hangi skoru verdiğini gösterir. |
| 25 | Yeniden skorlama (EKSİK) | ÇALIŞIYOR | İncelenmiş örnekte "Değerlendirmeyi güncelle", atlanan ve geçersiz örneklerde "Kuyruğa geri al" var. |
| 26 | Sayfalama (EKSİK) | ÇALIŞIYOR | Sunucu tarafında sayfalı ve durumu URL'de. Bekleyen görünümü FIFO çalışır (en eski önce). |
| 27 | Arama/filtre (EKSİK) | ÇALIŞIYOR | Metin, işletme ve QR araması; model, duygu ve niyet filtresi |
| 28 | Kalite metrikleri (EKSİK) | ÇALIŞIYOR | İstanbul haftasına göre haftalık ortalama, delta ve seri. 12 haftalık grafik (lazy recharts ve erişilebilir tablo). Model kırılımı, alan kırılımı, en zayıf alan, inceleme oranı ve %70 eşik uyarısı. |
| 29 | Bağlam (EKSİK) | ÇALIŞIYOR | İşletme, QR, yorum ve analiz zamanı, model, sürüm |
| 30 | Örnekleme işi (KISMİ) | ÇALIŞIYOR | Duygu × niyet katmanlarıyla rastgele örnekleme. LLM dışı analizler (`bootstrap-heuristic`, `local-fallback`) ve demo bayiler hariç tutulur. Yorumu silinmiş bekleyen örnekler geçersiz sayılır. `/api/cron/daily` işi Pazar günü tetikler. Her çalışma denetim kaydına yazılır ve "son örnekleme" satırını besler. |
| 31 | Yetki | ÇALIŞIYOR | `defineRoute` ile ADMIN rolü, admin kapısı (requireAuth) ve rate limit |
| 32 | Denetim günlüğü (EKSİK) | ÇALIŞIYOR | review, skip, void, reopen ve sample_run kaydedilir. İnceleyici adı listede ve geçmişte görünür. |
| 33 | Çok dillilik (KISMİ) | ÇALIŞIYOR (TR) | Tüm metinler tam Türkçe karakterli. Diğer Dalga 2 admin yüzeyleri gibi metin sabit Türkçe; admin genelinde EN çevirisi yok. |
| 34 | Mobil satır (KISMİ) | ÇALIŞIYOR | `FilterBar` satır kaydırır, tablo `md` altında karta dönüşür, çekmece alttan açılır, dokunma hedefleri en az 44px. |
| 35 | Liste animasyonu | ÇALIŞIYOR | Tüm listenin fade animasyonu kaldırıldı. Yalnızca örnek değişirken `fadeIn` çapraz geçişi var; `useMotionPolicy` ile azaltılmış harekette kapanır. |

### Kapanan bulgular (11/11)

1. "Skor Ver" ölü butondu. Düzeltildi.
2. Sezgisel analizler havuza giriyordu. Artık örneklemeden ve metrikten dışlanıyor, bekleyen örnekleri geçersiz sayılıyor ve model rozeti görünüyor.
3. Demo temizliği ve iç işaret sorunu. Butonlar sayfadan kaldırıldı, iç işaret gizlendi, demo rozeti eklendi.
4. Skor hiçbir yerde okunmuyordu. Metrik paneliyle kapandı.
5. Rubriksiz tek sayı. Yerine alan bazlı karar geldi ve tam metin gösteriliyor.
6. Örnekleme yanlıydı. Artık katmanlı rastgele, son çalışma da görünüyor.
7. Sayfalama yoktu, eski örnekler görünmüyordu. Liste sayfalı ve FIFO; `limit` ve `page` zod ile doğrulanıyor.
8. Çift gönderim, yarış koşulu ve denetim izi eksikti. React Query, iyimser kilit (409) ve auditLog ile kapandı.
9. Silinmiş yorumlar görünebiliyordu. Liste de örnekleme de bunları dışlıyor.
10. Erişilebilirlik ve mobil kusurları giderildi.
11. Dil ve tutarlılık: Türkçe etiket sözlüğü eklendi, ölü importlar temizlendi.

### Eksik özelliklerden uygulananlar

- Kalite gösterge paneli (1).
- Odaklı inceleme akışı (2, kısmen): tam metin, alan kararı, Ctrl/⌘+Enter ile "kaydet ve sonraki", önceki/sonraki gezinme.
- Alan bazlı düzeltme (3): düzeltmeler denetim kaydında tutuluyor.
- Filtre ve arama (5).
- Örnekleme kontrolü ile atla ve geçersiz durumları (6).

### Kalanlar

- **ŞEMA İSTEĞİ:** `AIQualitySample` için `source` (cron/manual/demo), `modelUsed` ve `promptVersion` anlık kopyası, `fieldVerdicts Json` ve `updatedAt` alanları. Bugün alan kararları ve düzeltmeler `AuditLog.newData` içinde tutuluyor; alan kırılımı da buradan okunuyor. Model bilgisi, örneğin bağlı olduğu yorumun güncel `aiModelUsed` değerinden okunuyor; yorum yeniden analiz edilirse bu değer kayabilir.
- Düzeltmeler `AIFeedbackCorrection` tablosuna ya da öğrenme profiline yazılmıyor. Bu tablo bayi düzeltmesi anlamı taşıyor (`dealerId`) ve `/admin/ai/studio` (ai-learning) yüzeyine ait. Yönetici düzeltmesi bayi profiline karışmasın diye bilinçli olarak bırakıldı.
- Çoklu inceleyici, uzlaşı (kappa) ve inceleme verisinin CSV/JSONL dışa aktarımı yapılmadı; atama ve uzlaşı şema değişikliği ister.
- Eşiğin altında kalan haftalar için admin bildirimi gönderilmiyor; uyarı yalnızca sayfada görünüyor. Bildirim akışı başka bir yüzeye ait.
