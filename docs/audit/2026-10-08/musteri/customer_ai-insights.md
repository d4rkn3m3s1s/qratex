# /customer/ai-insights

**Amaç:** Tüketicinin kendi yazılı geri bildirimlerini AI analiziyle (duygu, konu, niyet, tema, cümle bazlı duygu) kendisine yansıtmak; bu verilerle bir AI sohbet asistanı ve kişisel AI önerileri sunmak.
**Genel puan:** 4/10
**Karar:** **birleştir.** Sayfadaki asıl değerli parça olan geri bildirim başına "AI ne anladı?" açıklaması /customer/feedbacks detayına taşınmalı. Özet/profil kısmı Spotify Wrapped tarzında /customer/my-year ile birleşmeli. Sohbet ise rol farkını bilen tek bir müşteri asistanına dönüşmeli. Sayfa şu haliyle bayi CX analitiğinin (efor skoru, kaybetme riski, aciliyet) tüketiciye kopyalanmış hali.

Kapsam: `app/customer/ai-insights/page.tsx` (714 satır), `app/customer/ai-insights/layout.tsx`, `app/api/customer/ai-insights/route.ts`, `app/api/customer/ai-recommendations/route.ts`, `app/api/customer/ai-chat/route.ts`, `lib/ai-engine.ts` (`askAI`, `CHAT_SYSTEM_PROMPT_BASE`, analiz promptu), `lib/sentiment-percentages.ts`, `lib/admin-toast.ts`, `lib/module-gate.ts`, `proxy.ts`, `components/providers.tsx`, `prisma/schema.prisma` (`Feedback`, `AIConversation`). Kod çalıştırılmadı. Bulgular okuyarak doğrulandı, görsel taşma tahmini ayrıca belirtildi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Genel bakış veri getiriyor. Ancak 1 geri bildirimi olan kullanıcıda "AI Öneriler" sekmesi sayfayı çökertiyor, hata durumu boş durum gibi görünüyor, sayılar 50 kayıtla sınırlı ama "Toplam" diye etiketli, silinmiş geri bildirimler de analize giriyor. |
| UX | 4/10 | Tüketiciye "Kaybetme Riski", "Efor Skoru", "Acil" gibi işletme metrikleri gösteriliyor. Duygu ve konu adları İngilizce (happy, service). AI sohbeti kendini işletme sahibine konuşuyor sanıyor. |
| Görsel | 5/10 | shadcn kartlarıyla düzgün ama jenerik bir panel görünümü. Oyunlaştırmalı müşteri panelinin (rozet/lig/sürpriz kutu) görsel diliyle bağı yok. Her kart aynı `bg-card/50 backdrop-blur` ile çizildiği için hiyerarşi düz. |
| Mimari | 3/10 | Üç API aynı sorguyu ve aynı istatistikleri üç farklı sınırla (50/50/30) tekrar hesaplıyor. Modül anahtarı sunucuda uygulanmıyor. LLM uç noktasında rate limit ve cache yok. Konuşmalar yazılıyor ama hiç geri okunmuyor. 13 kullanılmayan import var. |
| Performans | 5/10 | Genel bakış React Query ile önbellekleniyor (60 sn). Ancak her "AI Öneriler" açılışı ve her "Yenile" tıklaması önbelleksiz bir LLM çağrısı (800 token). /customer/nearby da aynı ucu yarıçap/kategori değişiminde tetikliyor. Yanıt, kullanılmayan ağır JSON alanları (`aiAnalysis`, `actionSuggestions`) da taşıyor. |
| Erişilebilirlik + mobil | 3/10 | Geri bildirim kartları klavyeyle açılamıyor (`div onClick`). Sekmeler `tablist` değil. Gönder butonu ve sohbet girişi etiketsiz, sohbet akışı `aria-live` değil. 3 sekme butonu `text-base` ile 375 px'te büyük olasılıkla taşıyor (görsel olarak doğrulanmadı). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (i18n başlık/açıklama) | ÇALIŞIYOR | `app/customer/ai-insights/layout.tsx:4-6` | `segmentLayoutMetadata` ile yerelleştirilmiş başlık. |
| 2 | Rol koruması (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-75` | Sayfa rotası korunuyor. API rotaları rol kontrolü yapmıyor, yalnız oturum kontrolü var (`route.ts:13-19`). |
| 3 | Modül aç/kapa (`customer_ai_insights`) | KISMİ | `components/dashboard/sidebar.tsx:287`, `lib/module-controls.ts:26` | Yalnız menüden gizleniyor. Sayfada ve üç API'de `assertModuleEnabled` yok (diğer müşteri API'leri kullanıyor, ör. `app/api/customer/squads/route.ts:5`). |
| 4 | Genel bakış veri çekme (React Query) | KISMİ | `page.tsx:140-149`, `api/customer/ai-insights/route.ts:22-56` | `take: 50`. Tüm istatistikler son 50 kayıttan. `deletedAt` filtresi yok. |
| 5 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:216-224` | `InlineLoadingStatus` `role="status"` + `aria-live` ile. İskelet yok, tam sayfa spinner var. |
| 6 | Hata bildirimi (toast) | ÇALIŞIYOR | `page.tsx:173` | `admin-toast` kullanılıyor ve mesaja "Dikkat: " öneki ekliyor (`lib/admin-toast.ts:20`). |
| 7 | Hata durumu UI | BOZUK | `page.tsx:226` | `!stats` olunca "Henüz Analiz Yok" boş durumu gösteriliyor. Ağ/500 hatası "hiç geri bildirimin yok" gibi okunuyor, tekrar dene butonu yok. |
| 8 | Boş durum (hero + açıklama kartı) | ÇALIŞIYOR | `page.tsx:226-247` | Eylem çağrısı (QR tara butonu) yok. |
| 9 | Hero başlığı | ÇALIŞIYOR | `page.tsx:251-257` | "derin öğrenme ile analiz" ifadesi pazarlama abartısı (LLM çağrısı, `lib/ai-engine.ts:310-321`). |
| 10 | Sekme çubuğu (Genel Bakış / AI Sohbet / AI Öneriler) | KISMİ | `page.tsx:260-279` | `role="tablist"`/`aria-selected` yok, URL'de sekme durumu yok, `flex` sarmıyor (mobil taşma riski). |
| 11 | KPI: Toplam Geri Bildirim | BOZUK | `page.tsx:454`, `route.ts:55,78` | En fazla 50 gösterebiliyor. 50'den fazla geri bildirimi olan kullanıcıya yanlış toplam. |
| 12 | KPI: Ort. Puanım | KISMİ | `page.tsx:455`, `route.ts:79` | Yalnız son 50 kayıt üzerinden ama etiket bunu belirtmiyor. |
| 13 | KPI: Genel Duygu | KISMİ | `page.tsx:456`, `route.ts:84,100-102` | AI'ın henüz analiz etmediği (`sentiment=null`) kayıtlar "nötr" sayılıyor, dağılımı nötre kaydırıyor. |
| 14 | KPI: Ort. Efor Skoru | KISMİ | `page.tsx:457`, `route.ts:139-141` | Veri yoksa 0 dönüyor ve yeşil "0/10" görünüyor. Tüketici için anlamsız bir CX metriği. |
| 15 | Duygu dağılımı yüzde kutuları | ÇALIŞIYOR | `page.tsx:485-501` | API zaten normalize ediyor (`route.ts:93`), sayfa tekrar ediyor (`page.tsx:151-157`). Zararsız ama gereksiz. |
| 16 | Duygu dağılımı yığılmış çubuk | ÇALIŞIYOR | `page.tsx:502-506` | Ekran okuyucu metni yok. Renk tek bilgi taşıyıcısı. |
| 17 | En Sık Duygularım | KISMİ | `page.tsx:513-533` | Etiketler İngilizce ham anahtar (`happy`, `frustrated`, `lib/ai-engine.ts:195`). `getEmotionColor` hesaplanıp kullanılmıyor (`page.tsx:521`). |
| 18 | En Çok Bahsettiğim Konular | KISMİ | `page.tsx:535-555` | Konular İngilizce (`service`, `price`, `lib/ai-engine.ts:198`) ve `capitalize` ile "Service" görünüyor. |
| 19 | Geri bildirim AI analiz listesi | ÇALIŞIYOR | `page.tsx:559-709` | Liste son 50 kayıtla sınırlı. |
| 20 | Kart rozetleri (işletme, duygu, niyet, "Acil") | KISMİ | `page.tsx:583-588` | Analizsiz kayıt "Nötr" görünüyor (`route.ts:159`). "Acil" etiketi bayi triyaj metriği, tüketiciye anlamsız. |
| 21 | Yıldız + tarih | ÇALIŞIYOR | `page.tsx:591-598` | Yıldızlarda `aria-label`/sr-only "5 üzerinden 4" yok. |
| 22 | Kartı aç/kapa (detay) | KISMİ | `page.tsx:574-578` | `div onClick`: `role="button"`, `tabIndex`, `aria-expanded`, klavye işleyicisi yok. |
| 23 | AI Özet | ÇALIŞIYOR | `page.tsx:604-609`, `route.ts:171` | Eski `aiAnalysis` JSON'unun tamamı sırf `summary` için çekiliyor. |
| 24 | Aciliyet / Efor / Kaybetme Riski kutuları | KISMİ | `page.tsx:611-635` | "Kaybetme Riski %80" tüketiciye kendisi hakkında işletmenin churn tahmini olarak gösteriliyor. Ürün açısından yanlış kitle. |
| 25 | Detayda konular | KISMİ | `page.tsx:636-641` | İngilizce ham konu anahtarları. |
| 26 | Cümle bazlı duygu analizi | ÇALIŞIYOR | `page.tsx:644-659` | `key={i}` indeks anahtarı. Statik liste olduğu için zararsız. |
| 27 | Tespit edilen varlıklar | KISMİ | `page.tsx:661-672` | `entity.type` İngilizce (`product`, `person`). Duygu emoji ile (👍/👎/➖) ve sr metni yok. |
| 28 | Temalar | ÇALIŞIYOR | `page.tsx:674-685` | Temalar AI promptunda Türkçe isteniyor (`lib/ai-engine.ts:240-241`). |
| 29 | "Daha fazla yükle" | KISMİ | `page.tsx:691-706` | Yalnız istemcideki 50 kayıt içinde sayfalıyor. Gerçek sayfalama/cursor yok. |
| 30 | Sohbet boş durumu + 4 hazır soru | KISMİ | `page.tsx:293-305` | "Hangi işletmelere olumlu feedback verdim?" ve "en sık hangi duygu" sorularının verisi AI bağlamına hiç verilmiyor (`ai-chat/route.ts:139-144`, `lib/ai-engine.ts:819-833`). |
| 31 | Mesaj balonları | KISMİ | `page.tsx:306-320` | Model markdown üretiyor (prompt "madde işaretleri kullan" diyor, `lib/ai-engine.ts:845`), ama `whitespace-pre-wrap` ham metin olarak basılıyor: `**` ve `-` görünür. |
| 32 | Yazıyor göstergesi | ÇALIŞIYOR | `page.tsx:321-330` | `animate-bounce` azaltılmış hareket tercihine uymuyor. |
| 33 | Otomatik kaydırma | KISMİ | `page.tsx:174` | `scrollIntoView` iç kutu yerine tüm sayfayı da kaydırıyor (mobilde sıçrama). |
| 34 | Mesaj girişi + Enter ile gönder | KISMİ | `page.tsx:334-337` | `aria-label` yok, IME `isComposing` kontrolü yok, çok satır desteği yok. |
| 35 | Gönder butonu | KISMİ | `page.tsx:338` | Yalnız ikon, `aria-label` yok. |
| 36 | Çok turlu sohbet (`conversationId`) | KISMİ | `page.tsx:166,200,205` | Yalnız bellekte. Sayfadan çıkınca kayboluyor, her ziyaret yeni `AIConversation` satırı açıyor. |
| 37 | Sohbet kalıcılığı / geçmiş | SAHTE | `ai-chat/route.ts:156-185` | Konuşmalar DB'ye yazılıyor ama müşterinin bunları listeleyeceği bir GET ucu veya UI yok. Yalnız yazılan veri, temizleme cron'u da yok. |
| 38 | Rate limit (10/dk) + 429 mesajı | ÇALIŞIYOR | `ai-chat/route.ts:19,31-43`, `page.tsx:206-208` | 429 hatası asistan balonu olarak gösteriliyor, kabul edilebilir. |
| 39 | AI hata yönetimi | BOZUK | `lib/ai-engine.ts:859,867,962`, `ai-chat/route.ts:187-194` | `askAI` hatada metin döndürüyor ("Bir hata oluştu…"). Rota bunu `success: true` cevap olarak dönüyor ve konuşma geçmişine kaydediyor. |
| 40 | Asistan kişiliği (system prompt) | BOZUK | `lib/ai-engine.ts:836`, `lib/ai-engine.ts:877-903` | "İşletme sahiplerinin… sorularını yanıtlıyorsun" diyor. Tüketiciye işletme danışmanı gibi cevap veriyor. Global `chatSystemPrompt` da bayi odaklı. |
| 41 | Öneriler: sekmeye girince tembel yükleme | ÇALIŞIYOR | `page.tsx:271` | Yükleme sürerken sekmeye tekrar tıklanırsa ikinci paralel LLM çağrısı tetikleniyor (`!recData` koşulu, `recLoading` kontrol edilmiyor). |
| 42 | Öneriler yükleniyor durumu | ÇALIŞIYOR | `page.tsx:348-353` | |
| 43 | Öneriler: 1 geri bildirimli kullanıcı | BOZUK | `ai-recommendations/route.ts:48-58`, `page.tsx:411` | API `stats: { totalFeedbacks }` dönüyor. `recData.stats.topBusinesses.length` TypeError fırlatıyor ve sayfa `app/customer/error.tsx`'e düşüyor. "En az 2 geri bildirim gerekli" mesajı hiç gösterilmiyor. |
| 44 | Memnuniyet trendi kartı | KISMİ | `page.tsx:357-388`, `ai-recommendations/route.ts:82-87` | 10 veya daha az kayıtta `older` boş olduğundan her zaman "Stabil". `ratingTrendValue` kullanılmıyor. "(tek tek puanlar daha az önemli)" açıklaması belirsiz. |
| 45 | Kişisel AI Önerilerim | KISMİ | `page.tsx:391-408` | İşletme kişiliği sorunu (#40), ham markdown (#31). AI hata metni "öneri" kartında gösteriliyor. |
| 46 | En Çok Gittiğim İşletmeler | KISMİ | `page.tsx:411-430`, `ai-recommendations/route.ts:110-118` | Yazılı geri bildirim sayısını "ziyaret" diye etiketliyor. /customer/analytics'teki `favoriteDealers` ile çakışıyor. |
| 47 | Önerileri Yenile | KISMİ | `page.tsx:432-434` | Her tıklama yeni LLM çağrısı. Rate limit/cache yok. Başarısız yenilemede eski veri sessizce kalıyor. |
| 48 | Öneriler hata kartı + Tekrar Dene | ÇALIŞIYOR | `page.tsx:436-444` | |
| 49 | Silinmiş (soft-delete) geri bildirimlerin hariç tutulması | BOZUK | `ai-insights/route.ts:23-26`, `ai-recommendations/route.ts:25`, `ai-chat/route.ts:73`, `schema.prisma:830` | `deletedAt: null` filtresi yok. Admin'in sildiği kayıtlar (`api/admin/feedbacks/route.ts:368`) listeleniyor ve LLM'e gönderiliyor. |
| 50 | Azaltılmış hareket | KISMİ | `components/providers.tsx:232` | Global `MotionConfig reducedMotion="user"` var. Tailwind `animate-bounce` ve genişlik animasyonları buna dahil değil. |
| 51 | Çok dillilik (i18n) | EKSİK | `page.tsx` tamamı | Tüm metinler sabit Türkçe. Komşu sayfalar `tc()`/`t()` kullanıyor (ör. `app/customer/feedbacks/page.tsx:233`). |
| 52 | Gizlilik kontrolü (AI analizinden çıkma / konuşma silme) | EKSİK | — | KVKK açısından kullanıcının kendi metninin LLM'e gönderildiğine dair bilgilendirme veya çıkış (opt-out) yok. |

**Durum özeti:** ÇALIŞIYOR 18 · KISMİ 25 · BOZUK 6 · SAHTE 1 · EKSİK 2 (toplam 52).

---

## Bulgular (önem sırasıyla)

### 1. Kritik · Hata · "AI Öneriler" sekmesi 1 geri bildirimli kullanıcıda sayfayı çökertiyor
- **Kanıt:** `app/api/customer/ai-recommendations/route.ts:48-58` → `{ success: true, recommendations: null, stats: { totalFeedbacks: 1 } }`; `app/customer/ai-insights/page.tsx:354` `recData` dolu sayılıyor; `page.tsx:411` `recData.stats.topBusinesses.length` → `TypeError: Cannot read properties of undefined`.
- **Sorun:** Genel bakışın boş durumu yalnız `totalFeedbacks === 0` olunca devreye giriyor (`page.tsx:226`). İlk geri bildirimini bırakan kullanıcı, en meraklı olduğu anda sekmeye tıklayınca hata ekranı görüyor. API'nin döndürdüğü `message` alanı hiç okunmuyor.
- **Öneri:** API sözleşmesini ayrıştırılmış birleşim (discriminated union) tipine çevir: `{ status: 'insufficient', required: 2, have: 1 } | { status: 'ready', … }`. Tip `lib/types/customer-ai.ts` gibi ortak bir dosyada dursun, sayfa ve /customer/nearby aynı tipi import etsin. İstemci bu durumda "1 geri bildirim daha bırak, kişisel önerilerin açılsın" ilerleme kartını göstersin (Duolingo'daki kilitli ders deseni: 1/2 dolu ilerleme halkası ve QR tara butonu). Gelen yanıtı zod ile doğrula.
- **Efor:** S

### 2. Yüksek · Veri bütünlüğü · Silinmiş geri bildirimler analizde görünüyor ve LLM'e gönderiliyor
- **Kanıt:** `ai-insights/route.ts:23-26`, `ai-recommendations/route.ts:25`, `ai-chat/route.ts:73` içinde `deletedAt` filtresi yok. Şema soft delete kullanıyor (`prisma/schema.prisma:830`), admin soft-delete yapıyor (`app/api/admin/feedbacks/route.ts:368`). Diğer müşteri uçları filtreliyor (`app/api/customer/journey-score/route.ts:21`, `app/api/feedbacks/route.ts:43`).
- **Sorun:** Moderasyonla kaldırılan (ör. toksik veya spam) metin kullanıcının analiz listesinde, istatistiklerinde ve üçüncü taraf LLM'e giden bağlamda kalmaya devam ediyor. Bu tutarsız veri ve gizlilik sorunu.
- **Öneri:** Üç sorguyu tek bir `getCustomerFeedbackCorpus(userId, { limit })` yardımcısına topla. `where: { userId, deletedAt: null, text: { not: null } }` (boş string de hariç) tek yerde dursun. `@@index([userId, createdAt])` zaten var, sorgu planı etkilenmez.
- **Efor:** S

### 3. Yüksek · Güvenlik/maliyet · Öneri ucunda rate limit, cache ve rol kontrolü yok
- **Kanıt:** `ai-recommendations/route.ts:11-146` her GET'te `askAI` çağırıyor (max_tokens 800, `lib/ai-engine.ts:953`). `checkRateLimitDb` yok (sohbette var: `ai-chat/route.ts:31`). `checkAiCostGuard` yalnız bayi analizinde çağrılıyor (`lib/ai-engine.ts:306-308`). `proxy.ts:105-118` `/api/*` için rol kontrolü yapmıyor. /customer/nearby bu ucu konum, yarıçap ve kategori her değiştiğinde tetikliyor (`app/customer/nearby/page.tsx:207-225`).
- **Sorun:** Oturum açmış herhangi bir hesap (bayi/staff dahil) döngüyle sınırsız LLM maliyeti üretebilir. Normal kullanımda bile her sekme açılışı ve her "Yenile" yeni bir ücretli çağrı demek. Öneriler aynı veriyle tekrar tekrar üretiliyor.
- **Öneri:** (a) `session.user.role === 'CUSTOMER'` kontrolü ve `assertModuleEnabled('customer_ai_insights')`. (b) Upstash Redis'te `ai-rec:{userId}:{feedbackCorpusHash}` anahtarıyla 24 saat cache. Hash, son geri bildirim id'si ve toplam sayıdan türetilir, yeni geri bildirim gelince kendiliğinden geçersizleşir. (c) Kullanıcı başına günlük yenileme kotası (ör. 3/gün) ve UI'da "Bugün 2 yenileme hakkın kaldı". (d) Daha iyisi: öneriyi istek anında değil, geri bildirim analiz pipeline'ının sonunda (`lib/inngest/feedback-analyze-pipeline.ts`) asenkron üretip `CustomerInsightSnapshot` gibi bir tabloya yaz. Sayfa yalnız okusun.
- **Efor:** M

### 4. Yüksek · Ürün/doğruluk · AI asistanı tüketiciye "işletme sahibi" kişiliğiyle konuşuyor
- **Kanıt:** `lib/ai-engine.ts:836` `CHAT_SYSTEM_PROMPT_BASE = "… İşletme sahiplerinin geri bildirim verileri hakkındaki sorularını …"`. `lib/ai-engine.ts:877-903` global `chatSystemPrompt` varsa onu kullanıyor (sistem öğrenme profili, bayi verisinden). Müşteri sohbeti (`ai-chat/route.ts:147`) ve müşteri önerileri (`ai-recommendations/route.ts:135`) aynı `askAI` fonksiyonunu kullanıyor.
- **Sorun:** Öneri sorusu "Müşteriye doğrudan hitap et" dese de system prompt modeli bayi danışmanı olarak konumluyor. Bunun sonucunda "personel eğitimine yatırım yapın" ya da "olumsuz yorumlara hızlı yanıt verin" gibi tüketiciye anlamsız tavsiyeler çıkabilir. "Hassas konularda müşteri isimleri…" kuralı da tüketici bağlamında ters çalışıyor.
- **Öneri:** `askAI`'a `audience: 'dealer' | 'customer'` parametresi ekle ve ayrı bir `CUSTOMER_CHAT_SYSTEM_PROMPT` yaz (sen, kendi deneyimlerini anlamana yardım eden kişisel bir asistansın; işletmelere değil kullanıcıya fayda; puan/rozet/keşif bağlamı). Global `chatSystemPrompt` yalnız `audience === 'dealer'` için uygulansın. Tüketiciye özel güvenlik kuralı da eklenmeli: işletme hakkında hukuki veya karalayıcı yönlendirme yapma.
- **Efor:** M

### 5. Yüksek · Doğruluk · "Toplam Geri Bildirim" en fazla 50; sekmeler arası tutarsız sınırlar (50/50/30)
- **Kanıt:** `ai-insights/route.ts:55` `take: 50`, `route.ts:78` `totalFeedbacks = feedbacks.length`, `page.tsx:454`. Sohbet `take: 30` (`ai-chat/route.ts:94`) ve AI'a "Toplam Geri Bildirim: 30" diyor (`lib/ai-engine.ts:918`).
- **Sorun:** 120 geri bildirimi olan sadık bir kullanıcı (sistemin en değerli kullanıcısı) "50" görüyor, AI asistanı ise "30 geri bildiriminiz var" diyor. Ortalama puan ve duygu dağılımı da etiketsiz biçimde yalnız son kayıtları yansıtıyor.
- **Öneri:** Toplamlar için `prisma.feedback.count` ve `aggregate({ _avg: { rating } })` (ya da `groupBy sentiment`) kullan. Liste için cursor tabanlı sayfalama (`/api/customer/ai-insights/feedbacks?cursor=`) ve React Query `useInfiniteQuery`. İstatistiklere dönem filtresi ekle ("Son 30 gün / 90 gün / Tümü") ve etikette açıkça yaz.
- **Efor:** M

### 6. Orta · UX/ürün · Bayi CX metrikleri tüketiciye gösteriliyor
- **Kanıt:** `page.tsx:457` (Ort. Efor Skoru), `page.tsx:588` ("Acil" rozeti), `page.tsx:611-635` (Aciliyet, Efor, **Kaybetme Riski %**). Bu alanlar analiz promptunda işletme triyajı için tanımlı (`lib/ai-engine.ts:206-226`).
- **Sorun:** "Kaybetme Riski %80" tüketiciye kendi metninden işletmenin onu kaybetme olasılığını gösteriyor. Bu kullanıcıya hiçbir eylem sunmuyor, hatta "beni etiketlemişler" hissi yaratabilir. "Efor skoru" jargon. Veri yoksa 0 dönen değer yeşil "0/10" olarak iyi bir şey gibi okunuyor (`route.ts:139-141`).
- **Öneri:** Bu alanları müşteri API yanıtından tamamen çıkar (`select`'ten de kaldır, yanıt hafifler). Yerine tüketici diline çevrilmiş sinyaller koy: "Bu yorumun işletmeye ulaştı mı?" (bayi okundu/yanıt durumu, remedy akışıyla bağlantı), "Yorumun X kişiye yol gösterdi", "Bu yorumla +Y puan kazandın". Bunlar Qratex'in puan ve rozet ekonomisiyle doğrudan bağlantılı ve gerçek eylem/motivasyon üretiyor.
- **Efor:** M

### 7. Orta · Hata yönetimi · Hata durumu "Henüz Analiz Yok" olarak gösteriliyor
- **Kanıt:** `page.tsx:226` `if (!stats || stats.totalFeedbacks === 0)`.
- **Sorun:** API 500 veya ağ hatası verdiğinde kullanıcı "hiç geri bildiriminiz yok" mesajını görüyor ve tekrar deneme imkânı yok. Toast'tan sonra ekran yanlış bilgi veriyor.
- **Öneri:** `isError` için ayrı bir hata kartı (`refetch` butonlu) göster. Boş durum yalnız `success && totalFeedbacks === 0` olunca görünsün. Boş duruma "QR tara" butonu (`/customer/scan`) ekle.
- **Efor:** S

### 8. Orta · Dil karışıklığı · Duygu, konu ve varlık tipleri İngilizce ham anahtar
- **Kanıt:** Analiz promptunda duygu sözlüğü `happy, satisfied, …` (`lib/ai-engine.ts:195`), konular `service, quality, price…` (`:198`). Sayfa bunları olduğu gibi basıyor (`page.tsx:524,546,639,667`). Kod tabanında TR karşılık haritası yok (grep ile doğrulandı).
- **Sorun:** Türkçe arayüzde "Happy", "Service", "(product)" görünüyor. Profesyonellik algısını düşürüyor.
- **Öneri:** `lib/feedback-taxonomy.ts` dosyasında `EMOTION_LABELS`, `TOPIC_LABELS` ve `ENTITY_TYPE_LABELS` sözlükleri oluştur: i18n anahtarları, ikon ve renk tonu ile. Bayi panelinde de aynı sözlük kullanılsın. Bilinmeyen anahtar için güvenli bir geri dönüş tanımla. Kullanılmayan `getEmotionColor` (`page.tsx:112-119,521`) bu sözlüğün renk alanıyla birleştirilsin.
- **Efor:** S

### 9. Orta · Hata yönetimi · AI hata metinleri başarılı cevap gibi dönüyor ve konuşmaya kaydediliyor
- **Kanıt:** `lib/ai-engine.ts:859` ("AI asistanı şu anda kullanılamıyor."), `:867` (prompt injection reddi), `:962` ("Bir hata oluştu…") → `ai-chat/route.ts:147-194` `success: true` olarak dönüyor ve `messages`'a yazıyor (`:160-169`). Öneriler sekmesinde aynı metin "Kişisel AI Önerilerim" kartında görünüyor (`page.tsx:403`).
- **Sorun:** Hata, AI'ın gerçek cevabıymış gibi sunuluyor ve sonraki turlarda `previousMessages` ile modele geri besleniyor.
- **Öneri:** `askAI`'ı `{ ok: true, text } | { ok: false, reason: 'unavailable' | 'blocked' | 'error' }` döndürecek şekilde değiştir. Rota `ok:false` durumunda kaydetmesin ve uygun HTTP kodu dönsün (503/422). İstemci hatayı ayrı stilde bir sistem balonu olarak "Tekrar dene" aksiyonuyla göstersin.
- **Efor:** S

### 10. Orta · Mimari · Modül kapatma sunucu tarafında uygulanmıyor
- **Kanıt:** `customer_ai_insights` yalnız `components/dashboard/sidebar.tsx:287` ve `lib/module-controls.ts:26` içinde geçiyor. Üç API'de `assertModuleEnabled` yok. Kıyas: `app/api/customer/donations/route.ts:6`.
- **Sorun:** Admin modülü kapattığında (ör. LLM maliyetini durdurmak için) doğrudan URL ve API çalışmaya devam ediyor.
- **Öneri:** Üç rotaya `assertModuleEnabled('customer_ai_insights', { role: 'customer', … })` ve `assertMenuItemVisible` ekle. Sayfada modül kapalıysa bilgilendirici bir ekran göster.
- **Efor:** S

### 11. Orta · Doğruluk · Hazır sohbet sorularının yarısının verisi AI'a verilmiyor
- **Kanıt:** `page.tsx:298` "Hangi işletmelere olumlu feedback verdim?" ve "…en sık hangi duygu var?". `ai-chat/route.ts:86-91` işletme adını, `:78` duyguları çekiyor ama `recentFeedbacksForAI` (`:139-144`) ve `AskAIContext` (`lib/ai-engine.ts:819-833`) bunları taşımıyor.
- **Sorun:** Model ya "yeterli veri yok" diyor ya da uyduruyor. Kullanıcıya önerilen ilk soruların cevapsız kalması güveni ilk temasta kırıyor.
- **Öneri:** Müşteri bağlamına `businessName`, `emotions` ve `topBusinesses` alanlarını ekle (`AskAIContext`'e opsiyonel alanlar). Hazır soruları bağlamda gerçekten bulunan veriden üret: sunucu, cevaplanabilecek 3-4 soruyu `suggestions` alanında dönsün.
- **Efor:** S

### 12. Orta · Erişilebilirlik · Klavye ve ekran okuyucu desteği eksik
- **Kanıt:** Kart açma `div onClick` (`page.tsx:574-578`). Sekmeler düz `Button` (`:268`). Gönder butonu etiketsiz (`:338`). Giriş etiketsiz (`:334`). Sohbet akışında `role="log"`/`aria-live` yok (`:292`). Yıldızlar sr metni olmadan (`:593-595`). Duygu çubuğu yalnız renkle bilgi veriyor (`:502-506`).
- **Öneri:** Kartları `<button aria-expanded aria-controls>` başlığı ile Radix `Collapsible`/`Accordion`'a çevir. Sekmeler için shadcn `Tabs` (Radix, ok tuşu navigasyonu dahil). Gönder butonuna `aria-label="Mesajı gönder"`, girişe görünmez `<label>`. Mesaj listesine `role="log" aria-live="polite"`. Yıldızlara `aria-label={`${rating}/5 puan`}`. Yığılmış çubuğa `role="img"` ve özet `aria-label`.
- **Efor:** S

### 13. Orta · Mobil · Sekme çubuğu dar ekranda büyük olasılıkla taşıyor
- **Kanıt:** `page.tsx:260` `flex gap-2` (sarma veya kaydırma yok). Button varsayılanı `h-11 px-4 text-base sm:text-sm` (`components/ui/button.tsx:30`). Üç etiket + ikon kabaca 430-450 px ediyor. Layout `overflow-x-hidden` olduğu için taşma kırpılır (`app/customer/layout.tsx:33`). **Görsel olarak doğrulanmadı.**
- **Öneri:** Mobilde tam genişlikte segmented control (`grid grid-cols-3`, kısa etiketler "Özet / Sohbet / Öneriler"). Sekme durumu `?tab=` ile URL'de tutulsun ki geri tuşu ve paylaşım çalışsın.
- **Efor:** S

### 14. Düşük · UX · Ham markdown, sayfa sıçraması, IME
- **Kanıt:** `page.tsx:313,403` `whitespace-pre-wrap` ham metin. Prompt madde işareti istiyor (`lib/ai-engine.ts:845`). `page.tsx:174` `scrollIntoView` sayfayı da kaydırıyor. `page.tsx:335` Enter işleyicisinde `isComposing` kontrolü yok.
- **Öneri:** Hafif ve güvenli bir markdown renderer kullan (`react-markdown` + `rehype-sanitize`, yalnız liste/kalın/paragraf). Kaydırma için konteyner ref'iyle `el.scrollTop = el.scrollHeight`. `if (e.nativeEvent.isComposing) return`.
- **Efor:** S

### 15. Düşük · Mimari · Konuşmalar yalnız yazılıyor; her ziyaret yeni satır açıyor
- **Kanıt:** `ai-chat/route.ts:170-181` (`create`). Müşteri için listeleme ucu yok. `aIConversation` için temizleme yok (grep: yalnız `ai/analyze` ve `dealer/ai-chat` kullanıyor). `conversationId` yalnız state'te tutuluyor (`page.tsx:166`).
- **Sorun:** Kullanıcının göremediği ve silemediği AI sohbet verisi birikiyor (KVKK "erişim/silme" hakkı açısından zayıf).
- **Öneri:** Ya geçmişi gerçekten sun (`GET /api/customer/ai-chat` son N konuşma, "Yeni sohbet", "Sohbeti sil") ya da müşteri sohbetini kalıcı yapma. İkisinde de 90 günlük saklama cron'u (`db-cleanup`'a ek) olsun. Konuşma güncellemesi read-modify-write yapıyor (`:160-169`), iki sekmede yarış koşulu var. JSON `push` yerine ayrı `AIMessage` satırları daha sağlam olur.
- **Efor:** M

### 16. Düşük · Doğruluk · Etiket ve metin hataları
- **Kanıt:** "ziyaret" aslında yazılı geri bildirim sayısı (`page.tsx:425`, `route.ts:110-114`). 10 veya daha az kayıtta trend her zaman "Stabil" (`ai-recommendations/route.ts:83-87`). "derin öğrenme" iddiası (`page.tsx:254`). Toast "Dikkat: " öneki (`lib/admin-toast.ts:20`), müşteri tarafında admin yardımcısı kullanılıyor.
- **Öneri:** "X yorum" de. Ziyaret isteniyorsa `Consumption`/scan verisinden gerçek ziyareti say. Trend için en az 6 kayıt şartı koy ve altında "Trend için 6 yorum gerekli" yaz. Hero metnini dürüst ve kullanıcı odaklı yaz: "Yorumlarından senin için çıkardıklarımız". Müşteri panelinde doğrudan `sonner` kullan veya bir müşteri toast sarmalayıcısı yaz.
- **Efor:** S

### 17. Düşük · Ölü kod / performans
- **Kanıt:** 13 kullanılmayan import (`AnimatePresence, AlertTriangle, Target, Shield, Zap, Smile, Frown, Meh, Eye, Users, Hash, Clock, CheckCircle2`, `page.tsx:5-36`), kullanılmayan `colorClass` (`:521`). Yanıtta kullanılmayan alanlar: `actionSuggestions`, `isToxic`, `emotions` (kart başına), `avgUrgency`, `avgChurnRisk` (`route.ts:42,166-170,186-189`). Öneri API'sinde kullanılmayan `sentimentDist`, `avgUrgency`, `avgEffort`, `avgChurnRisk`, `topTopics`, `ratingTrendValue`. Tam `aiAnalysis` JSON'u yalnız `summary` için çekiliyor (`route.ts:43,171`). Duygu yüzdesi iki kez normalize ediliyor (`route.ts:93`, `page.tsx:151-157`).
- **Öneri:** `select`'i ve yanıtı sadeleştir. `summary`'yi ayrı bir kolona taşı veya Postgres JSON path ile çek. Yanıt tipini zod ile tanımlayıp istemci ve sunucuda paylaş. Öneri state'ini de React Query'ye taşı (`useQuery({ enabled: activeTab==='recommendations' })`), böylece #41'deki çift çağrı yarışı da kendiliğinden çözülür.
- **Efor:** S

### 18. Düşük · Tutarlılık · i18n yok
- **Kanıt:** `page.tsx` tamamında sabit Türkçe metin. Komşu müşteri sayfaları `tc()`/`t()` kullanıyor (`app/customer/feedbacks/page.tsx:233`, `app/customer/journey-score/page.tsx:130`).
- **Öneri:** Metinleri `customerAiInsights.*` anahtarlarına taşı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Hikâyeleştirilmiş özet (Spotify Wrapped):** Ham metrik ızgarası yerine kaydırılabilir 4-6 kartlık "Senin sesin" hikâyesi: en çok övdüğün şey, en çok yorum bıraktığın mekân, en etkili yorumun, kazandığın puan. Paylaşılabilir görsel kart da içermeli (`/customer/my-year` ile birleşik).
2. **Etki geri bildirimi döngüsü (Starbucks/Monzo "işlem sonrası" netliği):** "Yorumun işletmeye ulaştı · okundu · yanıtlandı · telafi önerildi" zaman çizelgesi. Remedy akışı (`/api/customer/remedy`) ve bayi okuma durumu zaten var ama burada gösterilmiyor.
3. **Oyunlaştırma bağlantısı (Duolingo):** Analizden çıkan "detaylı yorum yazarı" ya da "yapıcı eleştirmen" gibi sinyallerin rozet/XP ilerlemesine bağlanması: "Bir sonraki rozet için 2 detaylı yorum daha". Karakter rozeti sistemi (`ConsumptionReview` kategorisi) ile anlatı birliği.
4. **Dönem filtresi ve gerçek trend grafiği (Revolut analitiği):** 30/90/365 gün seçimi ve aylık ortalama puan çizgi grafiği. Şu an yalnız ok işareti ve metin var.
5. **Sohbet geçmişi, yeni sohbet ve akış (streaming) cevap:** ChatGPT/Revolut asistanı standardında konuşma listesi, akan yanıt ve "bu cevap yararlı mı?" geri bildirimi.
6. **Gizlilik kontrolü:** "Yorumlarım AI ile analiz edilsin" anahtarı, "sohbetlerimi sil" ve LLM'e hangi verinin gittiğinin açıklaması (KVKK aydınlatma).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "AI paneli" değil, **"Senin sesin"**. Kullanıcı yorumlarının ne işe yaradığını, kendi zevk profilini ve bir sonraki adımı (hangi mekânı denemeli, hangi rozete yakın) 10 saniyede görmeli. Bayi metrikleri tamamen çıkar. Her blok bir eyleme veya ödüle bağlanır.

**Yerleşim (mobil öncelikli):**
1. **Üst hikâye şeridi:** 3-5 dikey kart (Wrapped tarzı, yatay kaydırma, snap). "Bu ay en çok *lezzet* hakkında konuştun", "En sevdiğin yer: X (4,8 ortalama)", "Yorumların 3 işletmenin yanıtını aldı". Kart başına tek büyük sayı ve tek cümle.
2. **Zevk profili:** Türkçe etiketli konu kümesi (radar yerine yatay "ilgi çubukları"), olumlu ve olumsuz eğilim ayrımıyla. "Hizmet hızına hassassın" gibi tek cümlelik AI özeti (önbellekli snapshot).
3. **Etki zaman çizelgesi:** Her yorum kompakt bir satır (mekân, yıldız, duygu ikonu, durum çipi: *okundu / yanıtlandı / telafi*). Dokununca açılan alt sayfada (mobilde Sheet) "AI ne anladı": özet, cümle bazlı vurgulama (metnin içinde olumlu cümleler yeşil, olumsuzlar kırmızı alt çizgiyle) ve temalar.
4. **Sıradaki adım kartı:** Kişisel öneri (önbellekli, en fazla 3 madde, her biri eyleme bağlı: "Keşfet'te benzer mekânlar" veya "Bu rozete 1 yorum kaldı").
5. **Asistan:** Ayrı sekme yerine sağ altta yüzen bir "Sor" butonu ve alt sayfa (sheet). Akış halinde cevap, geçmiş, bağlamdan üretilmiş hazır sorular.

**Motion/3D (yerinde ve ölçülü):** Hikâye kartları arasında `Motion` ile yatay geçiş ve sayı sayaç animasyonu (`useReducedMotion` ile kapatılabilir). Cümle vurguları açılırken soldan sağa çizgi animasyonu (opacity + `scaleX`). Three.js **gereksiz**: bu sayfa okuma ve anlama sayfası. 3B yalnız rozet/ödül anlarında kalmalı. Mevcut kademeli giriş gecikmeleri (`delay: 0.45 + index*0.05`, `page.tsx:575`) liste uzadıkça algılanan yavaşlık yaratıyor. Liste öğeleri için toplam gecikme sınırı (ör. en fazla 0,3 sn) olmalı.

**Veri/API değişiklikleri:**
- `GET /api/customer/insights/summary`: `count`/`aggregate`/`groupBy` ile gerçek toplamlar ve dönem parametresi. `deletedAt: null`. Modül ve rol kapısı. Redis cache (`insights:{userId}:{lastFeedbackId}`).
- `GET /api/customer/insights/feedbacks?cursor=`: sayfalı liste. Yalnız tüketiciye uygun alanlar (summary, statementSentiments, themes, entities, bayi okuma/yanıt durumu). `urgency/effort/churn/actionSuggestions` çıkarılır.
- `CustomerInsightSnapshot` tablosu (veya `User.insightSnapshot Json`): geri bildirim analiz pipeline'ının (`lib/inngest/feedback-analyze-pipeline.ts`) sonunda asenkron üretilen öneri ve zevk profili. İstek anında LLM çağrısı yok.
- `askAI` → `audience` parametresi ve tüketici system promptu. Dönüş tipi `{ok, text}`.
- `lib/feedback-taxonomy.ts`: duygu, konu ve varlık için TR/EN etiket, ikon ve renk sözlüğü (bayi paneliyle ortak).
- Sohbet: `AIMessage` tablosu ya da kalıcılığı kaldırma. Saklama cron'u.

---

## Çakışmalar / birleştirme önerisi

| Çakışan sayfa | Çakışan içerik | Öneri |
|---|---|---|
| `/customer/feedbacks` | Kullanıcının kendi geri bildirim listesi ve duygu ikonu (`app/customer/feedbacks/page.tsx:181,541`) | Geri bildirim başına AI detayı ("AI ne anladı" alt sayfası) buraya taşınmalı. Aynı liste iki yerde tutulmamalı. |
| `/customer/my-year` | Yıllık özet ve kilometre taşları ("QRateX'te Yılım") | Özet/zevk profili ve hikâye kartları burayla birleşip tek "Senin sesin / Yılın" deneyimi olmalı. |
| `/customer/analytics` | `favoriteDealers` (`app/customer/analytics/page.tsx:486`) ve ortalama puan | "En Çok Gittiğim İşletmeler" kopyası kaldırılmalı. Gerçek ziyaret verisi zaten analytics'te. |
| `/customer/nearby` | Aynı `/api/customer/ai-recommendations` ucunu çağırıyor (`app/customer/nearby/page.tsx:207-225`) ve `aiStats.avgUrgency` gibi bayi metriklerini gösteriyor (`:510`) | Öneriler snapshot'tan okunmalı. Nearby'de konum bazlı öneri ayrı bir uçla verilmeli. |
| `/dealer/ai-insights`, `/dealer/ai-chat` | Aynı `askAI` ve aynı system prompt | `audience` ayrımı zorunlu. Müşteri sohbeti bayi sohbetinin kopyası olmamalı. |

**Sonuç:** `/customer/ai-insights` ayrı bir menü öğesi olarak kalmamalı. Değerli parçaları /customer/feedbacks (detay), /customer/my-year (özet/hikâye) ve global müşteri asistanı (sohbet) arasında paylaştırılmalı. Bayi metrikleri ise tamamen kaldırılmalı. Birleştirme yapılmadan önce acil düzeltilmesi gerekenler: Bulgu 1 (çökme), Bulgu 2 (silinmiş veri), Bulgu 3 (sınırsız LLM maliyeti) ve Bulgu 4 (yanlış kişilik).

---

## Doğrulama (şüpheci inceleme)

Her iddia çağıran ve çağrılan taraflarla birlikte baştan okundu: `proxy.ts`, `lib/prisma.ts`, `lib/ai-engine.ts`, `lib/ai-learning.ts`, `lib/module-gate.ts`, `lib/module-controls.ts`, `prisma/schema.prisma` ve `app/customer/nearby/page.tsx`. Kod çalıştırılmadı, veritabanına dokunulmadı.

| # | İddia | Karar | Ciddiyet (yeniden değerlendirme) |
|---|---|---|---|
| 1 | 1 geri bildirimli kullanıcıda AI Öneriler sekmesi çöküyor | **DOĞRULANDI** | Yüksek (kesin çökme, dar kitle) |
| 2 | Soft-delete edilmiş geri bildirimler listeleniyor ve LLM'e gidiyor | **DOĞRULANDI** | Yüksek (moderasyon/gizlilik) |
| 3 | `ai-recommendations` sınırsız ücretli LLM çağrısına açık | **DOĞRULANDI** | Yüksek (maliyet istismarı) |
| 4 | Müşteri asistanı bayi system promptuyla çalışıyor | **DOĞRULANDI** (kod kesin, çıktı etkisi olasılıksal) | Orta (kalite). Ek bir risk aşağıda: platform geneli bağlam |
| 5 | Toplam sayısı 50 ile sınırlı ama "Toplam" diye gösteriliyor | **DOĞRULANDI** | Orta (veri doğruluğu, kritik değil) |

### 1. AI Öneriler sekmesi TypeError ile çöküyor: DOĞRULANDI
- **Kanıt:** Her iki uç aynı filtreyi kullanıyor: `where: { userId, text: { not: null } }` (`app/api/customer/ai-insights/route.ts:22-26`, `app/api/customer/ai-recommendations/route.ts:24-25`). Yazılı geri bildirimi 1 olan kullanıcı için `ai-insights` `totalFeedbacks: 1` döner ve sayfa boş durum kapısını geçer (`page.tsx:226`, yalnız `=== 0`). Sekmeye tıklanınca `fetchRecommendations` çağrılır (`page.tsx:271`). `ai-recommendations` `{ success: true, recommendations: null, message, stats: { totalFeedbacks: 1 } }` döner (`route.ts:48-58`). `page.tsx:181` `data.success` true olduğu için `setRecData(data)` yapar. `page.tsx:354` dalı `recData` dolu sayar. `:360-381` `ratingTrend` undefined olduğu için sessizce "Stabil" çizer. `:391` `recommendations` null olduğu için atlanır. `:411` `recData.stats.topBusinesses.length` → `TypeError: Cannot read properties of undefined (reading 'length')`. Render hatası olduğu için en yakın sınır `app/customer/error.tsx` (dosya mevcut) devreye girer.
- **Yeniden üretim:** Tek bir yazılı geri bildirim bırakmış CUSTOMER hesabıyla `/customer/ai-insights` → "AI Öneriler" sekmesi → sayfa müşteri hata ekranına düşer. API'nin `message` alanı UI'da hiçbir yerde okunmuyor.
- **Not:** Tip tanımı (`page.tsx:82-96`) `stats`'ı her zaman tam şekilli kabul ediyor. Sorun tek satırlık bir `?.` değil, sözleşme sorunu. Doğru çözüm uçtan ayrık bir sonuç tipi döndürmek (`{ status: 'insufficient_data', required: 2, current: 1 } | { status: 'ready', ... }`) ve sayfada bunun için ayrı bir "1 yorum daha bırak, öneriler açılsın" durum kartı göstermek. Aynı yanıt `/customer/nearby` içinde `setAiStats(data.stats)` ile kullanılıyor (`app/customer/nearby/page.tsx:211-213`). Orada çökme değil, `undefined` türevli NaN gösterimi riski var (bu ayrıntı doğrulanmadı).

### 2. Soft-delete edilmiş geri bildirimler: DOĞRULANDI
- **Kanıt:** `lib/prisma.ts` düz `new PrismaClient()`. `$extends` ya da `$use` ile genel bir `deletedAt` filtresi yok (dosya baştan sona okundu). Üç uçta da `deletedAt: null` yok (`ai-insights/route.ts:23-26`, `ai-recommendations/route.ts:25`, `ai-chat/route.ts:73`). Şema soft delete kullanıyor (`prisma/schema.prisma:830`). Admin silmesi gerçekten soft delete (`app/api/admin/feedbacks/route.ts:366-369`, `updateMany … deletedAt: new Date()`). Aynı klasördeki kardeş uçlar filtreliyor (`journey-score/route.ts:21`, `journey-timeline/route.ts:26`, `squads/weekly-goal/route.ts:47`, `category-leaderboard/route.ts:52`). Sistem öğrenme sayımı bile filtreliyor (`lib/ai-learning.ts:666`).
- **Yeniden üretim:** Admin, bir müşterinin yorumunu (ör. hakaret içeriyor diye) `/admin/feedbacks` üzerinden siler. Müşteri `/customer/ai-insights` sayfasını açar. Yorum listede (`page.tsx:568-590`) ve sayılarda görünmeye devam eder. "AI Sohbet" veya "AI Öneriler" kullanıldığında metin `recentFeedbacks` içinde üçüncü taraf LLM sağlayıcısına gönderilir (`ai-chat/route.ts:139-152`, `ai-recommendations/route.ts:140-145`, `lib/ai-engine.ts:926`).
- **Not:** Müşteri kendi yazdığı metni görüyor, yani başka bir kişinin verisi sızmıyor. Ancak moderasyon kararı bu yüzeyde etkisiz kalıyor, silinmiş içerik sağlayıcıya yeniden gönderiliyor ve sayılar `/customer/journey-*` ile tutarsız. Çözüm: Feedback için ortak bir `activeFeedbackWhere(userId)` yardımcısı (veya `prisma.$extends` ile model düzeyinde varsayılan filtre) kullanılmalı ve bu üç uç ona taşınmalı.

### 3. `ai-recommendations` sınırsız LLM çağrısı: DOĞRULANDI
- **Kanıt:** `ai-recommendations/route.ts:11-146` her GET'te (2 veya daha fazla yazılı geri bildirimde) `askAI` çağırıyor. Önbellek, `checkRateLimitDb` ya da maliyet koruması yok. Kardeş sohbet ucunda dakikada 10 sınırı var (`ai-chat/route.ts:19,31`). `askAI` içinde de sınır yok, yalnız `withRetry` var (`lib/ai-engine.ts:948-955`, `max_tokens: 800`). Bu yüzden başarısız çağrılar tekrar denenir ve maliyet artar. `proxy.ts:105-119` `/api/*` isteklerini rol kontrolü olmadan geçiriyor. Uç yalnız `session.user` arıyor (`route.ts:14`), dolayısıyla DEALER, STAFF ve ADMIN oturumları da çağırabilir. Admin panelinde `customer_ai_insights` modülü tanımlı (`lib/module-controls.ts:26`) ama hiçbir müşteri AI ucu `assertModuleEnabled` çağırmıyor. Aynı klasördeki `discovery`, `donations`, `lounge` ve `squads` uçları çağırıyor. `/customer/nearby` her `latitude/longitude/radiusKm/category` değişiminde ucu yeniden tetikliyor (`app/customer/nearby/page.tsx:220-225`).
- **Yeniden üretim:** Herhangi bir oturumlu hesap (en az 2 yazılı yorumu olan) tarayıcı konsolunda `for (let i=0;i<500;i++) fetch('/api/customer/ai-recommendations')` çalıştırır. Bu, 500 ücretli LLM çağrısı demek ve 429 hiç dönmez. Admin "Müşteri AI içgörüleri" modülünü kapatsa da uç cevap vermeye devam eder.
- **Not:** Doğru yapı: istek anında LLM çağırmamak. Öneri, geri bildirim analiz pipeline'ının sonunda üretilen bir snapshot olmalı ve `lastFeedbackId` anahtarıyla Redis/DB'de önbelleklenmeli. Ek olarak kullanıcı başına `checkRateLimitDb` (ör. saatte 5 yenileme), `assertModuleEnabled('customer_ai_insights')` ve rol kontrolü (`requireAuth(['CUSTOMER'])`) eklenmeli. Nearby'deki bağımlılık dizisinden `radiusKm/category` çıkarılmalı.

### 4. Müşteri asistanı bayi system promptuyla çalışıyor: DOĞRULANDI (etkisi olasılıksal)
- **Kanıt:** `lib/ai-engine.ts:836` `CHAT_SYSTEM_PROMPT_BASE` "İşletme sahiplerinin geri bildirim verileri hakkındaki sorularını…" ifadesiyle başlıyor. Rolü "Veri analisti ve danışman" olarak tanımlıyor. `askAI` hedef kitle parametresi almıyor (`:854-857`). Hem müşteri sohbeti (`ai-chat/route.ts:147`) hem müşteri önerileri (`ai-recommendations/route.ts:135`) bu fonksiyonu kullanıyor. DB'de `chatSystemPrompt` varsa taban prompt tamamen onunla değiştiriliyor (`lib/ai-engine.ts:878-880, 903`). O prompt, platform genelindeki veri özetinden (toplam geri bildirim, bayi sayısı, işletme adları, tüm DB'den örnek metinler) LLM'e ürettiriliyor (`lib/ai-learning.ts:677-701, 764-787`, `contextBlob.slice(0, 1500)`).
- **Somut senaryo:** Müşteri hazır soru "Memnuniyet trendim nasıl?" butonuna basar (`page.tsx:298`). Model "işletme sahibi" personasıyla "işletmenizin müşteri memnuniyeti…" çerçevesinde cevap verme eğilimindedir. Öneriler ucunda kullanıcı mesajı "Müşteriye doğrudan hitap et" diyerek bunu kısmen dengeliyor (`route.ts:133`), sohbet ucunda ise böyle bir dengeleme yok. LLM çıktısı deterministik olmadığı için yanlış hitap her yanıtta garanti değil. Bu yüzden ciddiyet "kritik" değil "orta (kalite)". Personanın yanlış bağlandığı ise kod düzeyinde kesin.
- **Ek gözlem (doğrulanmadı, ayrı incelenmeli):** Admin tarafından üretilmiş bir `chatSystemPrompt` platform geneli veri özetinden türetildiği için içinde başka işletmelerin adları ya da genel sayılar bulunabilir. Bu durumda müşteri sohbeti bu bilgiyi müşteriye aktarabilir. Prompt LLM tarafından üretildiği için içeriği koddan kanıtlanamıyor. Canlı `SystemLearningProfile.chatSystemPrompt` değeri salt okunur olarak kontrol edilmeli.
- **Not:** Çözüm: `askAI(question, context, { audience: 'consumer' | 'dealer' })`. Tüketici için ayrı, sabit bir system prompt yazılmalı (sistem öğrenme promptu müşteri kitlesine uygulanmamalı). Sohbet bağlamına işletme adları eklenmeli, çünkü hazır soru "Hangi işletmelere olumlu feedback verdim?" (`page.tsx:298`) şu anda `recentFeedbacksForAI` içinde işletme adı olmadığı için (`ai-chat/route.ts:139-144`) veriyle cevaplanamıyor.

### 5. "Toplam" sayısı 50 ile sınırlı: DOĞRULANDI
- **Kanıt:** `ai-insights/route.ts:55` `take: 50`, `:78` `totalFeedbacks = feedbacks.length`, `page.tsx:454` "Toplam Geri Bildirim" etiketi. Ortalama puan (`:79`), duygu dağılımı (`:82-97`) ve duygu çubuğu oranları (`page.tsx:525`, `count / totalFeedbacks`) da yalnız son 50 kayıttan hesaplanıyor. Sohbette `take: 30` (`ai-chat/route.ts:94`) ve bu sayı `- Toplam Geri Bildirim: 30` diye LLM'e veriliyor (`lib/ai-engine.ts:918`). Ayrıca `text: { not: null }` filtresi nedeniyle yalnız puan bırakılan geri bildirimler hiç sayılmıyor.
- **Yeniden üretim:** 73 yazılı yorumu olan müşteri kartta "50", sohbette "kaç yorum yaptım?" sorusuna "30" görür. `/customer/journey-score` gibi tüm kayıtları sayan uçlarla tutarsızlık oluşur.
- **Not:** Veri doğruluğu hatası, güvenlik ya da çökme değil. Bu yüzden "kritik/yüksek" yerine "orta". Toplamlar `prisma.feedback.count`/`aggregate`/`groupBy` (`deletedAt: null` ile) üzerinden ayrı hesaplanmalı. Liste sayfalı (`cursor`) dönmeli. Örneklemden hesaplanan metrikler UI'da "son 50 yorumuna göre" diye açıkça etiketlenmeli.

**Doğrulama sonucu:** Beş iddianın beşi de kodda doğrulandı. Hiçbiri çürütülmedi. 4 ve 5 numaralı iddiaların ciddiyeti "orta" seviyeye indirildi. Öncelik sırası değişmiyor: 1 (çökme) → 3 (maliyet istismarı ve modül kapısı) → 2 (silinmiş veri) → 4 → 5.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/customer/me/voices` (Ben › Seslerim). Sunucu bileşeni `app/customer/me/voices/page.tsx` özet + ilk liste sayfası + telafileri paralel ön yükler; istemci adası `components/customer/m-seslerim/**` (çekmece gövdeleri `next/dynamic` ile yalnız açılınca yüklenir). Veri katmanı `lib/customer-voices/{types,core,server}.ts`; BFF uçları `GET /api/customer/voices` (imleç sayfalı birleşik liste), `GET /api/customer/voices/summary` ("Sesin"), `GET /api/customer/voices/[key]` (detay; `fb-<id>` / `cs-<consumptionId>`), `GET /api/customer/remedy` (telafi listesi, yeniden yazıldı). Hepsi `defineRoute` (yalnız CUSTOMER, zod, hız sınırı, zarf v2). Eski rotalar sorgu parametrelerini koruyarak `permanentRedirect` ile Seslerim'e gider. Testler: `__tests__/lib/customer-voices.test.ts`, `__tests__/api/customer-voices-routes.test.ts`, `__tests__/api/customer-review-write.test.ts` (35 test, yeşil).
### Özellik envanteri — yeni durum

| # | Yeni durum | Not |
|---|---|---|
| 1 | KALDIRILDI | Rota Seslerim'e yönlenir ("Sesin" kartı). |
| 2 | ÇALIŞIYOR | Özet ve detay uçları yalnız CUSTOMER. |
| 3 | ÇALIŞIYOR | AI türevli kısımlar (duygu tonu, konular, "AI ne anladı") sunucuda `customer_ai_insights` modül kapısına bağlı. |
| 4 | ÇALIŞIYOR | `count`/`aggregate`/`groupBy`, `deletedAt: null`. |
| 5 | ÇALIŞIYOR | |
| 6 | KALDIRILDI | Toast yerine `ErrorState`. |
| 7 | ÇALIŞIYOR | BOZUK düzeldi: hata ≠ boş. |
| 8 | ÇALIŞIYOR | Boş durumda "QR okut". |
| 9 | KALDIRILDI | "Derin öğrenme" abartısı. |
| 10 | KALDIRILDI | Sekmeler kalktı. |
| 11 | ÇALIŞIYOR | BOZUK düzeldi: gerçek `count`. |
| 12 | ÇALIŞIYOR | Gerçek ağırlıklı ortalama (QR + tüketim). |
| 13 | ÇALIŞIYOR | Yalnız analiz edilmiş kayıtlar, "analiz edilen N yorumuna göre" etiketiyle. |
| 14 | KALDIRILDI | Efor skoru bayi metriği. |
| 15 | KALDIRILDI | Yüzde kutuları yerine sayılı çubuk + lejant. |
| 16 | ÇALIŞIYOR | `role="img"` + özet `aria-label`. |
| 17 | KALDIRILDI | Ham İngilizce duygu etiketleri tüketiciye değer katmıyordu. |
| 18 | ÇALIŞIYOR | TR/EN konu sözlüğü, örneklem etiketi. |
| 19 | ÇALIŞIYOR | Ayrı analiz listesi yerine birleşik Seslerim listesi + çekmece. |
| 20 | KALDIRILDI | Duygu, niyet ve "Acil" rozetleri (bayi triyajı). |
| 21 | ÇALIŞIYOR | Erişilebilir yıldız + tarih. |
| 22 | ÇALIŞIYOR | Kart `<button>` → çekmece. |
| 23 | ÇALIŞIYOR | Yalnız `summary` alanı. |
| 24 | KALDIRILDI | Aciliyet, efor, kaybetme riski müşteriye gösterilmez (yanıtta da yok). |
| 25 | ÇALIŞIYOR | TR/EN. |
| 26 | ÇALIŞIYOR | Cümle bazlı vurgu (metin etiketi + alt çizgi; yalnız renge dayanmaz). |
| 27 | KALDIRILDI | Varlık tipleri İngilizce ve düşük değerli. |
| 28 | ÇALIŞIYOR | |
| 29 | ÇALIŞIYOR | Gerçek imleç sayfalama. |
| 30–39 | KALDIRILDI | AI sohbet bu yüzeyden çıktı (yol haritası: rol farkını bilen global müşteri asistanı). `/api/customer/ai-chat` dokunulmadan duruyor (KALAN). |
| 40 | KALDIRILDI | Yüzeyde LLM yok; `lib/ai-engine` persona ayrımı sahiplik dışı (KALAN). |
| 41–45, 47, 48 | KALDIRILDI | Öneriler sekmesi: GET'te LLM çağrısı yasak; `/api/customer/ai-recommendations` `/customer/nearby`'nin ucu (sahiplik dışı). Çökme (#43) yüzeyle birlikte ortadan kalktı. |
| 46 | ÇALIŞIYOR | "En çok sesini duyurduğun yer" (yorum sayısı olarak doğru etiketli, en az 2 yorum). |
| 49 | ÇALIŞIYOR | BOZUK düzeldi: tüm sorgularda `deletedAt: null`. |
| 50 | ÇALIŞIYOR | `bounce`/genişlik animasyonu yok; global politika. |
| 51 | ÇALIŞIYOR | TR/EN. |
| 52 | KALAN | AI analizinden çıkma tercihi ayarlar/gizlilik yüzeyinin işi (sahiplik dışı). |

### Kapanan bulgular
1, 2, 3 (yüzeyden LLM çağrısı kalktı; uç nearby'nin), 4 (yüzeyde asistan yok), 5, 6, 7, 8, 9 (yüzeyde AI metni yok), 10, 11, 12, 13, 14, 15 (yüzeyden; uç kalan), 16, 17, 18 — **18/18** (yüzey düzeyinde).

### Kalanlar
- `/api/customer/ai-chat` (bu sayfadan başka tüketicisi yoktu; global asistan işine bırakıldı) ve `lib/ai-engine` müşteri personası.
- `/api/customer/ai-recommendations` maliyet ve önbellek (nearby'nin sahibi).
