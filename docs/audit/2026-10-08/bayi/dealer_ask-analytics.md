# /dealer/ask-analytics

**Amaç:** Bayi, işletme verisine doğal dille tek seferlik bir soru sorar ("Geçen hafta puanım neden düştü?"). API, son 7 günün toplu metriklerini (ortalama puan, sentiment, tema, churn) ve soruyla anlamca eşleşen geri bildirimleri (embedding ile RAG) toplar, bunları LLM'e topraklanmış bir prompt olarak verir ve tek bir yanıt döndürür.

**Genel puan:** 4/10 · **Karar:** **birleştir** (AI Sohbet ile tek bir "Veriye Sor / AI Analist" deneyimi olarak; bu sayfanın RAG + haftalık kıyas motoru korunmalı, sayfanın kendisi kalkmalı)

> Bağlam: Sayfa bayi menüsünden bilinçli olarak çıkarılmış (`components/dashboard/sidebar.tsx:230-231`: "`ask_analytics` (Veriye Sor → AI sohbete birleşir) … menüden çıkarıldı"), ancak birleştirme yapılmamış. Kod tabanında bu rotaya giden tek bir link yok (`grep "ask-analytics"` yalnızca sayfanın kendisini ve API'yi buluyor). Sayfa şu an yalnızca URL'yi bilen tarafından açılabilen yetim bir sayfa; buna karşın arkasındaki motor, menüde duran `/dealer/ai-chat`'ten teknik olarak daha güçlü.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel soru→yanıt akışı çalışıyor; fakat silinmiş/toksik yorumlar prompt'a sızıyor, maliyet limiti 500 olarak dönüyor, önerilen soruların bir kısmı verinin cevaplayamayacağı sorular. |
| UX | 4/10 | Tek atımlık, geçmişsiz, takip sorusuz; yanıtın dayandığı kaynaklar gösterilmiyor; menüden erişilemiyor. |
| Görsel | 4/10 | Hero + düz kartlar; yanıt markdown render edilmiyor, tema çipleri İngilizce anahtar, eyebrow "Yönetim paneli" yazıyor. |
| Mimari | 4/10 | AI Sohbet ile iki ayrı, birbirinden farklı bağlam toplayan AI uç noktası; modül kapısı yok; i18n yok; metadata layout'u yok. |
| Performans | 3/10 | Her soruda bayinin en güncel 1000 embedding vektörü JSON olarak DB'den çekilip Node'da kosinüs benzerliği hesaplanıyor (text-embedding-3-small = 1536 boyut). |
| Erişilebilirlik + mobil | 5/10 | Mobilde yığılıyor ve kullanılabilir; ama input'un etiketi yok, yükleniyor/yanıt bölgesi `aria-live` değil, odak yönetimi yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero başlık "Veriye Sor" + açıklama + ikon | ÇALIŞIYOR | `app/dealer/ask-analytics/page.tsx:61-65` | Metin Türkçe sabit kodlu. |
| 2 | Hero eyebrow etiketi | BOZUK | `components/admin/admin-premium-hero.tsx:151`, `:197-222` | `eyebrow` verilmediği için varsayılan **"Yönetim paneli"** bayi sayfasında görünüyor; diğer bayi sayfaları kendi eyebrow'unu veriyor (`app/dealer/analytics/analytics-client.tsx:564`, `app/dealer/churn-risk/page.tsx:100`). |
| 3 | "AI Sohbet'e geç" bağlantısı | KISMİ | `page.tsx:68-74` | Çıplak `<a href>` → tam sayfa yeniden yükleme (Next `Link` değil). Hedef `/dealer/ai-chat` farklı ve daha zayıf bir bağlamla çalışıyor (bkz. Bulgu 5); soru/yanıt taşınmıyor. |
| 4 | Soru input'u | KISMİ | `page.tsx:78-84` | Görünür ya da `aria-label` etiket yok (yalnız placeholder). `maxLength` yok; sunucu 500 karakterde kesiyor (`route.ts:21`) ve kullanıcı yalnızca "Geçersiz soru" görüyor. |
| 5 | Enter ile gönderme | ÇALIŞIYOR | `page.tsx:81` | `isComposing` kontrolü yok (IME klavyelerde erken gönderim riski — düşük). |
| 6 | "Sor" butonu + spinner + disabled | ÇALIŞIYOR | `page.tsx:85-88` | `question.trim().length < 3` iken pasif. |
| 7 | İstemci min. 3 karakter doğrulaması | ÇALIŞIYOR | `page.tsx:35-38`, `route.ts:21` | Sunucuda zod ile tekrar doğrulanıyor. |
| 8 | Önerilen soru çipleri (4 adet) | KISMİ | `page.tsx:20-25`, `:92-107` | Tıklanınca soruyu doldurup gönderiyor. Ancak "Kaybetme riski yüksek müşterilerde ortak tema ne?" sorusu için API yalnızca bir **sayı** veriyor (`route.ts:79`, `:118`); tema kırılımı yok → LLM ya "veri yetersiz" der ya da uydurur. "…neden?" sorusu için önceki haftanın teması verilmiyor. |
| 9 | Yanıttan sonra öneri çiplerinin gizlenmesi | KISMİ | `page.tsx:92` | Yanıt gelince öneriler kayboluyor; yerine bağlama uygun takip soruları sunulmuyor. |
| 10 | Yükleniyor kartı | ÇALIŞIYOR | `page.tsx:109-116` | `aria-live`/`role="status"` yok; ekran okuyucu duyurmaz. |
| 11 | Yanıt kartı | KISMİ | `page.tsx:118-128` | Düz `whitespace-pre-wrap` metin; LLM'in sıkça ürettiği markdown (`**`, listeler) ham görünür (system prompt markdown'ı yasaklamıyor, `route.ts:128-130` — çıktı biçimi doğrulanmadı). Kopyala/paylaş/beğen yok. |
| 12 | "Yalnızca gerçek işletme verinize dayanır." iddiası | KISMİ (yanıltıcı) | `page.tsx:125` | Yanıt doğrulanmıyor, kaynak gösterilmiyor; ayrıca silinmiş yorumlar da girdiye dahil (Bulgu 1). |
| 13 | Dayanak çipi: Son 7g geri bildirim sayısı | ÇALIŞIYOR | `page.tsx:131`, `route.ts:151` | |
| 14 | Dayanak çipi: Ortalama puan + önceki hafta | ÇALIŞIYOR | `page.tsx:132-138`, `route.ts:152-153` | Değişim yönü/farkı görselleştirilmiyor. |
| 15 | Dayanak çipi: Yüksek kayıp riski sayısı | ÇALIŞIYOR | `page.tsx:139-143`, `route.ts:79` | Churn sayfasına derin link yok. |
| 16 | Dayanak çipi: En çok geçen temalar | KISMİ | `page.tsx:144-148`, `lib/ai-engine.ts:198-199` | Konular İngilizce anahtar olarak saklanıyor (`service`, `quality`, `price`…) ve çevrilmeden gösteriliyor → Türkçe arayüzde "service (12)". |
| 17 | İlgili geri bildirim sayısı (`relevantCount`) | EKSİK | `route.ts:156` | API döndürüyor, UI'de hiç gösterilmiyor (`Grounding` tipinde var: `page.tsx:17`). |
| 18 | Kaynak alıntılar (yanıtın dayandığı yorumlar) | EKSİK | `route.ts:95-106` | Snippet'ler yalnız prompt'a giriyor, istemciye dönmüyor. |
| 19 | Hata bildirimi (toast) | KISMİ | `page.tsx:48-53` | JSON olmayan bir yanıtta (ör. platform 504 HTML) `res.json()` İngilizce `SyntaxError` mesajını toast'a basar. 503'te dönen `context` (`route.ts:138`) atılıyor; AI yokken bile metrikler gösterilebilirdi. |
| 20 | Rate limit (15/dk) | ÇALIŞIYOR | `route.ts:46-52` | Mesaj toast'ta görünüyor; `Retry-After` UI'de kullanılmıyor (geri sayım yok). |
| 21 | Günlük AI token limiti | BOZUK | `lib/ai-engine.ts:115-117`, `lib/ai-cost-guard.ts:47-53`, `route.ts:161-166` | `AiCostLimitExceededError` (429 niyetli) route'un catch'ine düşüp **500 "Analiz yapılamadı"** olarak dönüyor. |
| 22 | Semantik ilgili yorum araması (RAG) | KISMİ | `route.ts:81`, `lib/ai-learning.ts:171-202` | Çalışıyor ama: silinmiş/toksik dahil, tarihsiz, tüm zamanlardan, her istekte 1000 vektör JSON çekiliyor. |
| 23 | Toplu metrik bağlamı (7g vs önceki 7g, sentiment, tema, churn) | KISMİ | `route.ts:66-92` | Tema örneklemi `take: 200` sıralamasız (`route.ts:74-78`) → yoğun haftada keyfi alt küme. Zaman penceresi sabit 7 gün. |
| 24 | Sayfa erişim yetkisi (proxy) | ÇALIŞIYOR | `proxy.ts:50-73` | `/dealer/*` yalnız DEALER. |
| 25 | API çok-rol yetkisi (DEALER/STAFF/ADMIN) | KISMİ | `route.ts:27-44` | STAFF ve ADMIN dalları bu sayfadan asla tetiklenmiyor (proxy DEALER dışını yönlendirir; UI `dealerId` göndermez). ADMIN dalında `dealerId` varlığı doğrulanmıyor ve AI maliyeti o bayinin günlük kotasına yazılıyor (`lib/ai-engine.ts:138-146`). |
| 26 | Modül kapısı (`ai_features`) | EKSİK | `lib/module-controls.ts:47`, `lib/module-gate.ts:92` | Admin AI modülünü kapatsa da bu uç AI çağırmaya devam eder; `assertModuleEnabled` çağrılmıyor. |
| 27 | Menü / gezinme girişi | BOZUK (yetim) | `components/dashboard/sidebar.tsx:230-270` | Menüde yok, hiçbir sayfadan link yok; i18n anahtarı (`messages/tr.json:2558`) ölü. |
| 28 | Sayfa `<title>` metadata'sı | EKSİK | `app/dealer/ask-analytics/` (layout yok) | Diğer AI sayfalarında `segmentLayoutMetadata` var (`app/dealer/ai-chat/layout.tsx`); burada sekme başlığı genel "Bayi Paneli" kalır. |
| 29 | Çok dillilik (i18n) | EKSİK | `page.tsx:20-25`, `:62-63`, `:113`, `:125`, `:131-141` | Tüm metin TR sabit; `useAppT` kullanılmıyor (kardeş sayfa `app/dealer/ai-chat/page.tsx:16` kullanıyor). EN kullanıcıya Türkçe sayfa + Türkçe LLM yanıtı. |
| 30 | Soru geçmişi / takip sorusu | EKSİK | `page.tsx:28-31` | Durum yalnızca tek yanıt; sayfa yenilenince her şey kaybolur. |
| 31 | Zaman aralığı / şube / QR filtresi | EKSİK | `route.ts:60-63` | Sabit "son 7 gün, tüm QR'lar". |
| 32 | İstek iptali (Abort) | EKSİK | `page.tsx:43-47` | Uzun LLM çağrısını iptal etmenin yolu yok. |
| 33 | Boş veri durumu (hiç geri bildirimi olmayan işletme) | EKSİK | `page.tsx:92-116` | Kullanıcı soru sorup AI maliyeti harcadıktan sonra "veri yetersiz" öğrenir; önceden uyarı yok. |
| 34 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:77`, `:93` | Input/buton `sm:` altında alt alta; çipler sarılıyor. `p-6` iç boşluğu layout'un kendi yatay boşluğuyla üst üste (`app/dealer/layout.tsx:35`) — dar ekranda fazladan ~24px. |
| 35 | Azaltılmış hareket | ÇALIŞIYOR | `admin-premium-hero.tsx:162`, `:207` | Sayfada motion yok; hero ping'i `useReducedMotion`'a uyuyor. |

**Sayım:** 35 özellik — ÇALIŞIYOR 13 · KISMİ 12 · BOZUK 3 · SAHTE 0 · EKSİK 7

---

## Bulgular

### 1. Silinmiş, toksik ve işaretlenmiş yorumlar AI prompt'una ve yanıtına sızıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / gizlilik · **Efor:** S
- **Kanıt:** `app/api/dealer/ask-analytics/route.ts:97-100` — `prisma.feedback.findMany({ where: { id: { in: … } } })` içinde `deletedAt: null` yok. `prisma/schema.prisma` (Feedback) `deletedAt DateTime? // soft delete`, `isToxic`, `trustFlagged`, `fraudScore` alanları var. `AIEmbedding` yalnızca `onDelete: Cascade` ile siliniyor (hard delete), soft delete'te vektör yerinde kalıyor. Aynı dosyada toplu metrikler `baseWhere = { …, deletedAt: null }` kullanıyor (`route.ts:63`) — yani tutarsız.
- **Sorun:** Moderasyonla ya da kullanıcı talebiyle (KVKK silme) kaldırılmış bir yorum, semantik olarak soruya yakınsa LLM'e "Soruyla en ilgili geri bildirimler" olarak verilir ve yanıtta alıntılanabilir. Toksik içerik de filtresiz gider.
- **Öneri:** Detay sorgusunu `where: { id: { in }, deletedAt: null, isToxic: false, qrCode: { dealerId } }` olarak sıkılaştır (son koşul, embedding'in `dealerId`'sine güvenmek yerine sahipliği ikinci kez doğrular — savunma derinliği). Kalıcı çözüm: feedback soft-delete akışında `AIEmbedding` kaydını da sil (ya da `findSimilarFeedback` sorgusuna `feedback: { deletedAt: null }` ilişki filtresini ekle) ki silinen yorumlar aday listesinde yer bile kaplamasın.

### 2. Her soruda bayinin 1000 embedding vektörü JSON olarak çekiliyor (bellek içi KNN)
- **Önem:** yüksek · **Kategori:** performans / maliyet · **Efor:** L
- **Kanıt:** `lib/ai-learning.ts:184-201` — `aIEmbedding.findMany({ …, take: 1000 })` + Node'da `cosineSimilarity`; `lib/ai-learning.ts:9` model `text-embedding-3-small` (1536 boyut); şemada `vector Json`.
- **Sorun:** 1000 × 1536 sayı JSON olarak metin halinde ~20-30 MB mertebesinde (tahmini, ölçülmedi) Neon'dan fonksiyona taşınıp parse ediliyor; soru başına ciddi gecikme, Neon egress maliyeti ve bellek baskısı. Ayrıca "en güncel 1000" sınırı, eski ama alakalı yorumları sessizce dışarıda bırakıyor. Ek olarak her soru için yeni bir embedding çağrısı yapılıyor (OpenAI yoksa Groq LLM tabanlı "feature embedding" = ikinci bir LLM çağrısı, `lib/ai-learning.ts:121-125`).
- **Öneri:** pgvector'e geç (Neon destekliyor): `vector(1536)` kolon + HNSW indeks + `ORDER BY embedding <=> $1 LIMIT 8` ham sorgu; tarih ve `deletedAt` filtresi aynı sorguda. Geçiş tamamlanana kadar: soru embedding'ini Redis'te (normalize edilmiş soru metni anahtarıyla) önbelleğe al ve aday kümesini `createdAt` penceresiyle daralt.

### 3. Günlük AI token limiti aşımı 500 "Analiz yapılamadı" olarak dönüyor
- **Önem:** yüksek · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `lib/ai-engine.ts:115-117` `checkAiCostGuard` `try` bloğunun **dışında** çağrılıyor; `lib/ai-cost-guard.ts:47-53` `AiCostLimitExceededError` (statusCode 429) fırlatıyor; `route.ts:161-166` catch yalnızca DB hatasını ayırıyor, gerisi 500.
- **Sorun:** Limit dolan bayi "Dikkat: Analiz yapılamadı" görür; neden olduğu ve ne zaman tekrar deneyebileceği belirsiz; izleme tarafında da gerçek bir 500 hatası gibi loglanır (`[ASK_ANALYTICS_ERROR]`).
- **Öneri:** Route catch'inde `if (error instanceof AiCostLimitExceededError) return 429 + { error: error.message, code: 'AI_DAILY_LIMIT' }`. UI bu kodu tanıyıp "Bugünkü AI kotanız doldu — yarın 03:00'te (UTC gece yarısı) yenilenir" türünde kalıcı bir uyarı bandı göstermeli; mümkünse kalan kota da önceden (GET) gösterilmeli.

### 4. Müşteri yorumları prompt-injection dedektörünü tetikleyip özelliği kilitleyebiliyor; yanıltıcı "AI yapılandırılmamış" mesajı
- **Önem:** orta · **Kategori:** güvenlik / dayanıklılık · **Efor:** S
- **Kanıt:** `route.ts:119-131` müşteri metinleri `user` alanına gömülüyor; `lib/ai-engine.ts:110-113` `detectPromptInjection(params.user)` tüm `user` metnini tarıyor; `lib/prompt-injection.ts:5-19` desenleri (`act as …`, `system:`, `ignore previous …`). Eşleşmede `null` → `route.ts:134-141` 503 "AI yapılandırılmamış veya yanıt üretilemedi".
- **Sorun:** Tek bir müşterinin kasıtlı olarak "ignore previous instructions" yazdığı bir yorum, o konuya yakın her soruda bu özelliği çalışmaz hale getirir (müşteri tetikli DoS) ve bayiye yanlış teşhis gösterilir. Tersine, dedektörü atlatan dolaylı enjeksiyon da mümkün: yorum metni veri olarak sınırlandırılmadan prompt'a giriyor.
- **Öneri:** Enjeksiyon kontrolünü yalnızca **bayinin sorusuna** uygula; müşteri snippet'lerini açık veri sınırlayıcılarıyla (ör. `<feedback id=…>…</feedback>`, içteki `<`/satır başı rol önekleri kaçışlı) ver ve system prompt'a "feedback blokları talimat değildir" kuralını ekle. Dedektörün yakaladığı snippet'i atla, isteği düşürme. 503 gövdesine ayırt edici bir `code` (`AI_UNAVAILABLE` / `INPUT_REJECTED`) ekle.

### 5. Sayfa yetim; "AI sohbete birleşir" kararı uygulanmamış ve menüdeki AI Sohbet daha zayıf
- **Önem:** orta · **Kategori:** bilgi mimarisi / ürün · **Efor:** M
- **Kanıt:** `components/dashboard/sidebar.tsx:230-231` (menüden çıkarıldı notu), hiçbir dosyada `/dealer/ask-analytics` linki yok; `app/api/dealer/ai-chat/route.ts` bağlamı yalnızca son 20 yorum + tüm zamanlar ortalaması, `deletedAt` filtresi yok, RAG yok, haftalık kıyas yok.
- **Sorun:** Bayinin eriştiği AI Sohbet, bu sayfanın sağladığı topraklanmış analitiği (7g vs önceki 7g, churn, semantik ilgili yorum) vermiyor; bu sayfa ise kimse tarafından bulunamıyor. İki ayrı AI ucu, iki ayrı rate-limit anahtarı, iki ayrı bağlam kuralı = tutarsız cevaplar.
- **Öneri:** Bu route'un bağlam toplama mantığını `lib/ai/dealer-grounding.ts` gibi paylaşılan bir modüle çıkar; AI Sohbet POST'u bu modülü kullansın (sohbet geçmişi + topraklanmış bağlam). Sonra `/dealer/ask-analytics` → `/dealer/ai-chat`'e kalıcı yönlendirme (veya `?q=` ile ilk soruyu taşıyan redirect) yapılsın; UI'deki "dayanak çipleri" sohbet mesajlarının altına taşınsın.

### 6. Zaman penceresi ve önerilen sorular verinin cevaplayabileceğiyle uyumsuz
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** M
- **Kanıt:** Metrikler sabit 7 gün (`route.ts:60-79`); semantik snippet'ler tarih filtresiz ve tarihsiz (`route.ts:102-105`, `:120` — prompt'ta tarih yok); churn için yalnız sayı (`route.ts:79`); öneriler `page.tsx:20-25`.
- **Sorun:** LLM, iki yıl önceki bir yorumu "bu haftanın nedeni" gibi yorumlayabilir; "kaybetme riski yüksek müşterilerde ortak tema" sorusunun cevabı için veri hiç gönderilmiyor; "geçen ay" gibi sorular cevapsız kalır ama model bunu fark etmeyebilir.
- **Öneri:** (a) Soru niyetinden ya da UI'deki bir tarih seçicisinden (7g / 30g / 90g / özel) pencere belirle; (b) snippet'lere tarih ekle ve pencereyle sınırla; (c) churn ≥ 0.7 yorumlarının tema dağılımını ayrıca hesapla; (d) önceki pencerenin tema dağılımını da vererek "neden" sorularına gerçek fark (delta) sun; (e) öneri çiplerini yalnızca veriyle cevaplanabilir sorulardan, işletmenin o anki sinyallerine göre dinamik üret.

### 7. Yanıt doğrulanamıyor: kaynak gösterilmiyor, "yalnızca gerçek veri" iddiası kanıtsız
- **Önem:** orta · **Kategori:** güven / UX · **Efor:** M
- **Kanıt:** `page.tsx:125` iddia; `route.ts:156` `relevantCount` dönüyor ama UI'de yok; snippet'ler istemciye dönmüyor.
- **Sorun:** Medallia/Qualtrics tarzı "Ask" ürünlerinde her cümle kaynak yorumlara bağlanır; burada bayi cevabın uydurma olup olmadığını kontrol edemez.
- **Öneri:** API, kullanılan snippet'leri `{ feedbackId, excerpt, rating, createdAt }` olarak döndürsün; LLM'den `[1]`, `[2]` atıf işaretleri iste; UI atıfları tıklanabilir çip yapıp ilgili yorumu yan panelde (`/dealer/feedbacks?id=`) açsın. İddia metni "Yanıt şu N yoruma ve 7 günlük metriklere dayanır" şeklinde ölçülebilir hale gelsin.

### 8. Tema çipleri İngilizce ham anahtar gösteriyor
- **Önem:** orta · **Kategori:** dil karışıklığı · **Efor:** S
- **Kanıt:** `lib/ai-engine.ts:198-199` konu sözlüğü İngilizce (`service, quality, price…`); `page.tsx:144-148` çevirmeden basıyor; prompt'a da İngilizce gidiyor (`route.ts:117`).
- **Öneri:** Konu anahtarı → yerel etiket sözlüğünü (`messages/*.json` altında `topics.*`) tek yerde tanımla, hem UI'de hem prompt bağlamında kullan; böylece LLM de Türkçe etiketlerle düşünür.

### 9. `ai_features` modül kapısı sunucuda uygulanmıyor
- **Önem:** orta · **Kategori:** yetki / maliyet kontrolü · **Efor:** S
- **Kanıt:** `lib/module-controls.ts:47` (`ai_features`, severity critical); `lib/module-gate.ts:92` `assertModuleEnabled`; `route.ts` içinde çağrı yok. (AI Sohbet route'unda da yok; menüde sadece görünürlük filtresi var: `sidebar.tsx` `ai_chat` öğesi `moduleKey: 'ai_features'`.)
- **Öneri:** Route başında `const gate = await assertModuleEnabled('ai_features', { userId, request, routeKey: 'dealer.ask_analytics' }); if (gate) return gate;` — tüm bayi AI uçlarında ortak bir sarmalayıcı (`withAiGate`) ile.

### 10. İstemci hata/biçim/erişilebilirlik kusurları
- **Önem:** düşük · **Kategori:** UX / a11y · **Efor:** S
- **Kanıt ve sorunlar:**
  - `page.tsx:48` `res.json()` HTML yanıtta İngilizce `SyntaxError` toast'ı üretir.
  - `page.tsx:49` 503'teki `context` atılıyor; AI yokken metrik çipleri yine gösterilebilirdi.
  - `page.tsx:78` input etiketsiz; `page.tsx:109-153` yükleniyor/yanıt bölgesi `aria-live` değil; yanıt gelince odak yanıta taşınmıyor.
  - `page.tsx:128` markdown render yok.
  - `page.tsx:68` `<a>` yerine `next/link`.
  - `lib/admin-toast.ts` "Dikkat: " öneki + "Basarili" (Türkçe karakter eksik) bayi tarafında da kullanılıyor.
  - Hero eyebrow "Yönetim paneli" (`admin-premium-hero.tsx:151`).
  - Sayfa `layout.tsx` yok → sekme başlığı spesifik değil.
- **Öneri:** `res.headers.get('content-type')` kontrolü + yerelleştirilmiş genel hata; `<label className="sr-only">` veya `aria-label`; sonuç kabını `role="region" aria-live="polite"` yapıp yanıt geldiğinde başlığa odak; güvenli markdown (ör. `react-markdown` + izinli eleman listesi) ya da system prompt'ta düz metin zorunluluğu; `eyebrow={t('dealerAskAnalytics.eyebrow')}`; `segmentLayoutMetadata` ile layout.

### 11. API'nin STAFF/ADMIN dalları bu sayfadan ölü; ADMIN dalı doğrulamasız
- **Önem:** düşük · **Kategori:** mimari / ölü kod · **Efor:** S
- **Kanıt:** `route.ts:32-44`; `proxy.ts:50-73` `/dealer` yalnız DEALER; UI `dealerId` göndermiyor (`page.tsx:43-47`).
- **Sorun:** STAFF için ayrı bir UI yok, ADMIN için de. ADMIN dalında `dealerId` var mı/bayi mi kontrol edilmiyor; admin denemeleri bayinin günlük AI kotasından düşüyor (`lib/ai-engine.ts:138-146`) ve audit log'a yazılmıyor.
- **Öneri:** Birleştirme sırasında ya STAFF/ADMIN için gerçek bir giriş noktası tasarla (ör. admin bayi detayında "Bu bayinin verisine sor") ya da dalları kaldır. ADMIN dalında `prisma.user.findFirst({ where: { id, role: 'DEALER' } })` doğrulaması, ayrı maliyet hesabı (admin dealerId'si değil) ve `auditLog` kaydı.

### 12. Tema örneklemi sıralamasız `take: 200`
- **Önem:** düşük · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `route.ts:74-78` `findMany({ …, take: 200 })` `orderBy` yok.
- **Sorun:** Haftada 200'den fazla yorum alan işletmede tema sayımı veritabanının döndürdüğü keyfi alt kümeye dayanır; "en çok geçen konular" yanlış olabilir.
- **Öneri:** Postgres'te `jsonb_array_elements_text(topics)` ile `GROUP BY` ham sorgusu (tek sorgu, tam sayım) ya da en azından `orderBy: { createdAt: 'desc' }` + sınırın UI'de belirtilmesi. Sonuç 5 dk Redis'te önbelleklenebilir (soru bağımsız).

---

## Eksik özellikler (kıyas: Medallia Ask, Qualtrics CX "Ask a question", Google Business Profile Insights, Yelp for Business, Toast/Square analitik)

1. **Kaynaklı yanıt (citations):** Her iddianın altında tıklanabilir müşteri yorumları ve metrik kartı; Qualtrics/Medallia'nın standart güven deseni.
2. **Sohbet sürekliliği ve geçmiş:** Takip sorusu ("peki sadece hafta sonu?"), kaydedilen sorular, sık sorulanlar; ekiple paylaşma.
3. **Zaman, şube/QR, kanal filtresi:** Soruyu bir pencere ve kapsamla sınırlama (Square/Toast raporlarında temel).
4. **Yanıt içinde mini grafik:** Puan trendi sparkline'ı, tema dağılım çubuğu, haftalık delta göstergesi — yalnız çip değil.
5. **Yanıttan aksiyona köprü:** "Bu temada aksiyon oluştur", "Etkilenen müşterilere telafi gönder", "Kampanya taslağı yap" butonları (mevcut `/dealer/action-items`, `/dealer/remedy-queue`, `/dealer/campaigns` ile).
6. **Yanıt kalitesi geri bildirimi:** 👍/👎 + "yanlış" işaretleme → `AIQualitySample` / öğrenme döngüsüne bağlanması.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayinin "verime soru sorma" ihtiyacı tek bir yerde — **AI Analist** (mevcut AI Sohbet'in yerini alan) — karşılanır. Her yanıt üç katmanlıdır: (1) kısa, aksiyon odaklı sentez; (2) dayandığı ölçülebilir kanıt (metrik kartları + atıflı yorumlar); (3) tek tıkla aksiyon. Kullanıcı yanıtın uydurma olmadığını görebilir, ve yanıttan doğrudan iş üretebilir.

**Yerleşim:**
- Üst: kompakt hero (eyebrow "AI Analist"), sağda kapsam seçicileri — dönem (7/30/90 gün, özel), şube/QR, kanal.
- Sol (masaüstü) / çekmece (mobil): sohbet geçmişi + kaydedilmiş sorular.
- Orta: sohbet akışı. Asistan mesajı = markdown sentez + altında "Dayanak" şeridi (N yorum, ort. puan Δ, churn sayısı, tema çubukları) + atıf çipleri `[1] [2]`; atıfa tıklayınca sağda yorum önizleme paneli.
- Boş durum: işletmenin anlık sinyallerinden üretilmiş 3-4 dinamik öneri ("Bu hafta 'bekleme süresi' şikâyetleri %40 arttı — nedenini sor"); veri yoksa önce "QR'ını paylaş" yönlendirmesi, AI çağrısı yapılmadan.
- Alt sabit giriş: `Textarea` (otomatik yükseklik), karakter sayacı (500), gönder/iptal, kalan günlük kota göstergesi.

**Motion (ölçülü):** framer-motion (`m as Motion`) ile yalnızca anlamlı geçişler — yanıt token akışı (streaming) ile kademeli belirme, dayanak şeridinin 150 ms'lik fade/slide'ı, atıf panelinin yandan kayması. `useReducedMotion` ile hepsi anında görünmeye düşer. 3D/three.js bu sayfada **yerinde değil**: analitik güven ve okunabilirlik odağında dekoratif 3D dikkat dağıtır.

**Veri / API değişiklikleri:**
1. `lib/ai/dealer-grounding.ts`: `buildGrounding({ dealerId, from, to, qrCodeIds?, question })` → metrikler, önceki dönem kıyası, churn-yüksek tema dağılımı, `deletedAt: null`/`isToxic: false` filtreli ve tarihli snippet'ler. Soru-bağımsız kısım Redis'te 5 dk önbellek.
2. pgvector + HNSW ile KNN; soft-delete'te embedding temizliği.
3. `POST /api/dealer/ai-chat` (birleşik): `assertModuleEnabled('ai_features')`, injection kontrolü yalnız soruya, snippet'ler sınırlandırılmış veri bloğu, `AiCostLimitExceededError` → 429 + `code`, SSE ile streaming; yanıt gövdesi `{ answer, citations[], grounding, conversationId }`.
4. Konu anahtarı → yerel etiket sözlüğü (UI + prompt).
5. `/dealer/ask-analytics` → `/dealer/ai-chat?q=…` kalıcı yönlendirme; ölü i18n anahtarı ve STAFF/ADMIN dalları ya gerçek bir giriş noktasıyla yaşatılır ya da kaldırılır.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/ai-chat`** — Doğrudan çakışma: ikisi de "bayi doğal dille AI'a işletme verisini sorar". AI Sohbet'in sohbet/geçmiş kabuğu + bu sayfanın topraklanmış RAG motoru birleştirilmeli; bu sayfa kaldırılıp yönlendirilmeli. Sidebar'daki not (`sidebar.tsx:230-231`) zaten bu kararı söylüyor ama uygulama yarım.
- **`/dealer/copilot`** — Kısmi çakışma: copilot özet (`/api/dealer/copilot-summary`) üretiyor; "Bu hafta neye öncelik vermeliyim?" önerisi copilot'un işiyle örtüşüyor. Copilot özet kartlarından "Bunu AI Analist'e sor" derin bağlantısı verilmeli.
- **`/dealer/ai-insights`, `/dealer/weekly-brief`, `/dealer/churn-risk`** — Aynı metrikleri (tema, sentiment, churn, haftalık kıyas) farklı yüzeylerde gösteriyor; birleşik `dealer-grounding` modülü bu sayfaların sayılarıyla AI yanıtının sayılarının tutarlı olmasını da garanti eder.

**Sonuç:** Sayfa olarak **kaldır + AI Sohbet'e birleştir**; motor olarak **koru ve sağlamlaştır** (Bulgu 1, 3, 4 birleştirmeden bağımsız, hemen düzeltilmeli).

---

## Doğrulama (şüpheci inceleme)

Yöntem: iddiaların her biri çağıran/çağrılan kod baştan okunarak çürütülmeye çalışıldı (`app/api/dealer/ask-analytics/route.ts`, `lib/ai-engine.ts`, `lib/ai-cost-guard.ts`, `lib/prompt-injection.ts`, `lib/ai-learning.ts`, `lib/api-http.ts`, `app/api/admin/feedbacks/route.ts`, `app/api/feedbacks/route.ts`, `lib/inngest/feedback-analyze-pipeline.ts`, `prisma/schema.prisma`, `app/dealer/ask-analytics/page.tsx`). Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. Soft-delete edilmiş ve toksik geri bildirim metinleri LLM prompt'una sızıyor — **DOĞRULANDI (soft-delete kısmı; ciddiyet: orta)**

- Soft-delete gerçekten var: admin silme akışı `prisma.feedback.updateMany({ data: { deletedAt: new Date() } })` (`app/api/admin/feedbacks/route.ts:366-369`). Bu akış `AIEmbedding` kaydına dokunmuyor; `onDelete: Cascade` (`prisma/schema.prisma:2365`) yalnız hard delete'te tetiklenir.
- `findSimilarFeedback` (`lib/ai-learning.ts:184-189`) adayları yalnızca `aIEmbedding` tablosundan `dealerId + model + dimension` ile çeker; Feedback'in `deletedAt` alanına bakmaz.
- Detay sorgusu `route.ts:97-100` yalnız `id: { in: ... }` filtreler; aynı dosyadaki `baseWhere` (`route.ts:63`) ve `app/api/dealer/**` altındaki 18 route'taki 42 `deletedAt: null` kullanımı, sistemin genel kuralının "silinmiş yorum bayiye gösterilmez" olduğunu teyit ediyor. Bu route o kuralı yalnız bu noktada ihlal ediyor.
- **Yeniden üretim:** Admin, KVKK talebiyle veya moderasyonla bir bayinin "garson X çok kaba" yorumunu siler (soft delete). Bayi `/dealer/ask-analytics`'te "personel hakkında ne diyorlar?" diye sorar → silinmiş yorumun embedding'i benzerlik ≥ 0.3 ile aday olur → metni "Soruyla en ilgili geri bildirimler" bloğunda LLM'e gider, yanıtta alıntılanabilir ve `grounding.relevantCount` onu sayar. Ek yan etki: silinmiş kayıtlar `take: 1000` penceresinde yer kapladığı için güncel yorumları dışarı itebilir.
- **Abartılan kısım:** `isToxic` filtresi eksikliği bir "sızıntı" değil. Toksik yorumlar bayinin kendi verisi ve bayi zaten bunlar için bildirim alıyor (`app/api/feedbacks/route.ts:496-498`, `feedback-analyze-pipeline.ts:87-95`) ve kendi listelerinde görüyor. Bu bir prompt kalitesi tercihi; güvenlik bulgusu değil. Ayrıca `qrCode: { dealerId }` eklemek kiracılar arası bir açığı kapatmıyor: embedding'in `dealerId`'si feedback sahibinden yazılıyor (`lib/ai-learning.ts:150-153`). Yine de derinlemesine savunma için zararsız.
- **Öneri:** Detay sorgusuna `deletedAt: null` (ve tutarlılık için `qrCode: { dealerId }`) eklenmeli. Admin soft-delete akışında aynı işlemde `aIEmbedding.deleteMany({ where: { feedbackId: { in } } })` çalışmalı. Mevcut yetim embedding'ler için tek seferlik bir temizlik cron'u gerekir. Toksik snippet'lerin prompt'a girip girmemesi ise ürün kararı olmalı; önerilen yol, snippet'i maskeleyerek vermek.

### 2. AI günlük token limiti aşımı 429 yerine 500 dönüyor — **DOĞRULANDI (ciddiyet: orta, UX/izleme)**

- `runChatCompletion` içinde `await checkAiCostGuard(params.dealerId)` çağrısı `try` bloğunun **dışında** (`lib/ai-engine.ts:115-117`; `try` 120. satırda başlıyor). Limit aşıldığında `AiCostLimitExceededError` (`statusCode = 429`, `lib/ai-cost-guard.ts:13-19, 47-53`) yukarıya fırlatılıyor.
- Route'un `catch` bloğu (`route.ts:161-166`) yalnızca `responseIfDatabaseUnavailable`'ı (`lib/api-http.ts:18-28`, yalnız Prisma bağlantı hatası) ayırıyor. Geri kalan her şey `console.error` + 500 `'Analiz yapılamadı'` oluyor.
- İstemci (`app/dealer/ask-analytics/page.tsx:49-53`) `data.error`'ı toast olarak gösteriyor. Bayi "Analiz yapılamadı" görüyor; ne kota bilgisi ne de `Retry-After` var.
- **Yeniden üretim:** Bir bayinin o günkü `aIUsageLog` toplamı (giriş + çıkış token) ≥ `AI_DAILY_TOKEN_LIMIT_PER_DEALER` (varsayılan 100.000) olsun. Herhangi bir soru → 500 + `[ASK_ANALYTICS_ERROR] AiCostLimitExceededError` logu. Hacimli feedback analizi de aynı kotayı tükettiği için bu yoğun bayilerde gerçekçi bir senaryo.
- **Öneri:** Route'ta `error instanceof AiCostLimitExceededError` için 429 + `code: 'AI_QUOTA_EXCEEDED'` + UTC gece yarısına göre `Retry-After` dönülmeli. UI bu kodu ayırıp "Bugünkü AI kotanız doldu, X saat sonra yenilenir" durum kartını göstermeli; kalan kota göstergesi de aynı veriden beslenmeli. Daha iyi çözüm: `runChatCompletion`'ın sözleşmesini (null / throw karışımı) ayrık bir sonuç tipine (`{ ok:false, reason:'quota'|'injection'|'provider' }`) çevirmek.

### 3. Müşteri yorumu içeriğiyle özelliği kilitleme (yanlış girdiye injection dedektörü) — **DOĞRULANDI (ciddiyet: orta-yüksek, dışarıdan tetiklenebilir)**

- `route.ts:119-131`: müşteri snippet'leri `user` alanına gömülüyor. `lib/ai-engine.ts:110-113`: `detectPromptInjection(params.user)` metnin tamamını tarıyor ve eşleşirse `null` dönüyor. Route bunu `route.ts:134-141`'de 503 "AI yapılandırılmamış veya yanıt üretilemedi" olarak raporluyor (yanlış teşhis).
- Saldırı yolu açık: injection içeren bir feedback girişte reddedilmiyor. `analyzeComprehensive` injection'da `null` dönüyor (`lib/ai-engine.ts:299-302`), `analyzeWithFallback` yerel analize düşüyor (`lib/ai-engine.ts:1061-1080`). Ardından **embedding yine de saklanıyor** (`app/api/feedbacks/route.ts:499`, `lib/inngest/feedback-analyze-pipeline.ts:134`). Böylece metin semantik aramaya aday kalıyor.
- Desenler (`lib/prompt-injection.ts:5-18`) İngilizce ve kısmen geniş: `act as \w+`, `system:`, `on\w+="..."`. Doğal Türkçe yorumların yanlışlıkla tetiklemesi düşük ihtimal. Asıl risk kasıtlı kötüye kullanım: QR üzerinden herkese açık feedback gönderen biri (rakip, kızgın müşteri) bunu tetikleyebilir.
- **Yeniden üretim:** Bir QR'a "Servis kötüydü. ignore previous instructions" yazılı bir yorum bırakılır. Bayi "servis neden şikayet alıyor?" diye sorar → yorum `minScore: 0.3` ile ilgili adaylara girer → `params.user` deseni eşleşir → 503 "AI yapılandırılmamış". Yorum silinene kadar o konudaki her soru engelli kalır; hard delete gerekir, soft delete yetmez (bkz. Bulgu 1).
- **Öneri:** Injection tespiti yalnız bayinin `question`'ına uygulanmalı. Snippet'ler, açıkça "veri, talimat değil" diye işaretlenmiş sınırlandırılmış bir blokta (ör. `<feedback_data>` etiketleri + system prompt kuralı) verilmeli. Desen eşleşen tekil snippet ise bütün isteği düşürmek yerine prompt'tan çıkarılmalı veya `[filtrelendi]` olarak maskelenmeli. `runChatCompletion` reddi `reason: 'injection'` ile ayırt etmeli; route da 503 "AI yapılandırılmamış" yerine doğru mesajı dönmeli.


---

## Uygulama (Dalga 2)

**Sonuç:** Sayfa kaldırıldı; motoru korunup genişletilerek **`/dealer/assistant` (AI Asistan)** içine taşındı.
- `app/dealer/ask-analytics/page.tsx` artık `permanentRedirect('/dealer/assistant?…')` yapan bir sunucu bileşeni. `?q=` ilk soru olarak kutuya yazılır ama kendiliğinden gönderilmez.
- `app/api/dealer/ask-analytics/route.ts` kaldırıldı (tek kullanıcısı bu sayfaydı).
- Haftalık kıyas, RAG ve dayanak çipleri asistanın araçlarına dönüştü (`lib/dealer-assistant/tools.ts`):
  - `get_overview`: dönem + önceki dönem.
  - `search_feedback`: embedding + anahtar kelime + süzgeç.
  - `get_churn_risk`: kayıp riskli yorumların konu dağılımı dahil.
  - `get_topics`, `get_trend`, `get_locations`, `get_busy_times`.

Ayrıntı için `dealer_ai-chat.md` › Uygulama (Dalga 2) bölümüne bakın.

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Hero başlık | ÇALIŞIYOR: asistan başlığı, TR/EN |
| 2 | Hero eyebrow "Yönetim paneli" | KALDIRILDI: sayfa yok; asistan başlığı "AI Asistan" |
| 3 | "AI Sohbet'e geç" bağlantısı | KALDIRILDI: iki yüzey birleşti |
| 4 | Soru input'u | ÇALIŞIYOR: etiketli, `maxLength` 2000 + sayaç |
| 5 | Enter ile gönderme | ÇALIŞIYOR: `isComposing` denetimi |
| 6 | Sor butonu | ÇALIŞIYOR: gönder/durdur |
| 7 | Min. karakter doğrulaması | ÇALIŞIYOR (2 karakter; sunucuda zod) |
| 8 | Önerilen soru çipleri | ÇALIŞIYOR: veriden türetilir. "Kayıp riskli müşterilerde ortak tema" artık `get_churn_risk` konu dağılımıyla cevaplanabiliyor |
| 9 | Yanıttan sonra öneriler | ÇALIŞIYOR: sohbet devam eder (takip sorusu) |
| 10 | Yükleniyor kartı | ÇALIŞIYOR: `role="status"`, çalışan aracın adı |
| 11 | Yanıt kartı | ÇALIŞIYOR: markdown, kopyala, 👍/👎, yeniden üret |
| 12 | "Yalnızca gerçek veriye dayanır" iddiası | ÇALIŞIYOR: iddia yerine kanıt (dayanak kartları + atıflı kaynaklar) |
| 13–15 | Dayanak çipleri (adet, ort. puan + önceki, kayıp riski) | ÇALIŞIYOR: dayanak kartları; değişim yönü/farkı gösterilir; Müşteriler › Risk derin linki |
| 16 | Tema çipleri İngilizce anahtar | ÇALIŞIYOR: yerel etiket hem arayüzde hem modele giden araç sonucunda |
| 17 | `relevantCount` | ÇALIŞIYOR: arama kartında eşleşen / gösterilen sayısı |
| 18 | Kaynak alıntılar | ÇALIŞIYOR: `[K#]`, alıntı, puan, tarih, kanal, Gelen Kutusu linki |
| 19 | Hata bildirimi | ÇALIŞIYOR: içerik türü denetlenir; kodlu, yerelleştirilmiş hata; yeniden dene |
| 20 | Rate limit | ÇALIŞIYOR: `Retry-After` arayüzde gösterilir |
| 21 | Günlük AI token limiti | ÇALIŞIYOR: 429 `AI_BUDGET_EXCEEDED` (ön kontrolde + akış içinde), kota göstergesi ve sıfırlanma saati |
| 22 | RAG | ÇALIŞIYOR: adaylar dönem/kiracı/`deletedAt`/toksik/güven bayrağı süzgecinden geçer; sonuç azsa anahtar kelimeyle tamamlanır |
| 23 | Toplu metrik bağlamı | ÇALIŞIYOR: Analitik yükleyicisinden tam sayım (örneklem yok); dönem seçilebilir |
| 24 | Sayfa erişim yetkisi | ÇALIŞIYOR |
| 25 | API çok-rol dalları | KALDIRILDI: uçlar yalnız DEALER (ADMIN/STAFF dalları ölü koddu) |
| 26 | Modül kapısı | ÇALIŞIYOR |
| 27 | Menü / gezinme | ÇALIŞIYOR: kayıtta `dealer.assistant` (navigasyon ajanı), eski rota yönlendiriliyor |
| 28 | `<title>` | ÇALIŞIYOR |
| 29 | i18n | ÇALIŞIYOR: TR/EN kopya + yanıt dili |
| 30 | Geçmiş / takip sorusu | ÇALIŞIYOR |
| 31 | Zaman aralığı filtresi | ÇALIŞIYOR: 7/30/90 gün, bu ay, geçen ay; sohbet başına saklanır. QR/şube filtresi kaldı |
| 32 | İstek iptali | ÇALIŞIYOR: Durdur |
| 33 | Boş veri durumu | ÇALIŞIYOR: hiç veri yoksa AI çağrılmadan "QR kodlarına git" gösterilir |
| 34 | Mobil yerleşim | ÇALIŞIYOR |
| 35 | Azaltılmış hareket | ÇALIŞIYOR |

### Kapanan bulgular (12'nin 11'i)

- 1: Silinmiş/toksik/işaretli yorum sızıntısı.
- 3: Kota aşımı 500 yerine 429 dönüyor.
- 4: Müşteri yorumuyla özelliği kilitleme. Kalıplı yorum atlanır, istek düşmez; yanlış "yapılandırılmamış" teşhisi yok.
- 5: Yetim sayfa.
- 6: Pencere/öneri uyumsuzluğu.
- 7: Doğrulanamayan yanıt.
- 8: İngilizce tema anahtarı.
- 9: Modül kapısı.
- 10: İstemci hata/biçim/a11y.
- 11: Ölü STAFF/ADMIN dalları.
- 12: Sıralamasız `take: 200` (artık tam sayım).

### Kalanlar

- **Bulgu 2 (1000 vektörlük bellek içi KNN):** `findSimilarFeedback` paylaşılan modülde (`lib/ai-learning.ts`) ve çözümü pgvector şema değişikliği istiyor; ŞEMA İSTEĞİ. Asistanda etkisi azaltıldı: anlamsal arama her soruda değil, yalnız `search_feedback` aracı bir sorgu ifadesiyle çağrıldığında çalışır. Hata verirse anahtar kelime aramasına düşer.
- QR/şube/kanal kapsam filtresi (araçlara parametre olarak) sonraki adım.
