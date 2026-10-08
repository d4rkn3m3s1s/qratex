# /dealer/ai-settings

**Amaç:** Bayinin (işletme sahibi) kendi geri bildirimleri üzerinde çalışan AI motorunu yapılandırması: ana anahtar, otomatik analiz, 9 analiz modülü, 3 uyarı türü, 2 periyodik rapor, işletmeye özel prompt; ayrıca AI kullanım istatistikleri ve son 7 günün analiz grafiği.

**Genel puan: 3.5/10** · **Karar: yeniden tasarla**

Kısa özet: Sayfa görsel olarak derli toplu görünüyor ama vaat ettiği 17 ayarın yalnızca 3'ü (`isEnabled`, `autoAnalyze`, `customPrompt`) gerçekten bir şeye bağlı. 14 anahtar veritabanına yazılıyor ama hiçbir analiz/uyarı/rapor yolu bunları okumuyor. Okunan 2 anahtar ise `ai-retry` cron'u tarafından fiilen atlatılıyor: "AI kapalı" diyen bayinin verisi birkaç dakika sonra yine LLM'e gönderiliyor. Özel prompt alanı sınırsız ve doğrulamasız, üstelik platform geneli sistem öğrenme promptuna sızıyor (kiracılar arası prompt enjeksiyonu yüzeyi).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | 17 ayarın 14'ü SAHTE (hiçbir yerde okunmuyor). Ana anahtar ve otomatik analiz cron tarafından atlatılıyor. Öğrenme kartı 404'e gidiyor. |
| UX | 4/10 | Temiz liste düzeni var ama kaydedilmemiş değişiklik takibi yok, "Yenile" düzenlemeleri sessizce siliyor, ana anahtarı kapatmak granüler ayarları geri dönüşsüz sıfırlıyor, iki ayrı Kaydet düğmesi var. |
| Görsel | 5/10 | Kartlar tutarsız (iki stat kartı `border/backdrop-blur`, ikisi `border-0`). 7 günlük grafik CSS hatası yüzünden çubuk göstermiyor. İkon renkleri gelişigüzel. |
| Mimari | 3/10 | UI ile pipeline arasında sözleşme yok. Aynı tablo için iki ayrı yazma ucu var (`/api/dealer/ai-settings` PATCH ve `/api/ai/analyze?action=update_settings`), ikisi de doğrulamasız. Modül kapısı uygulanmıyor. |
| Performans | 6/10 | GET'te 9 sorgu var, biri ölü "soft-delete probe" sorgusu. Kabul edilebilir ama gereksiz bir round-trip içeriyor. İstemci tarafında sorun yok. |
| Erişilebilirlik + mobil | 4/10 | 17 `Switch`'in hiçbirinde erişilebilir ad yok. Textarea'nın etiketi yok. Grafik ipucu yalnızca `title` ile veriliyor (dokunmatik ve klavyede yok). Mobilde sabit kaydet çubuğu yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama) | KISMİ | `app/dealer/ai-settings/layout.tsx:4-6`, `messages/tr.json` → `layoutMetadata.dealerAiSettingsDescription` | Açıklama "İstemler, ton, veri kapsamları ve güvenlik anahtarları" diyor. Sayfada ton ve veri kapsamı yok, yani yanıltıcı. |
| 2 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:207-219` | Gerçek yerleşimle uyuşmuyor (4 stat + 1 blok, gerçekte 8 bölüm var), ama işini görüyor. |
| 3 | Hero (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `page.tsx:223-228` | |
| 4 | Chip "{n}/9 özellik aktif" | SAHTE | `page.tsx:205, 231-233` | Saydığı 9 modülün hiçbiri pipeline'da okunmuyor (bkz. #17-25). |
| 5 | Chip "{n} geri bildirim analiz edildi" | ÇALIŞIYOR | `page.tsx:234-238`, `route.ts:86-88` | |
| 6 | "Yenile" düğmesi | KISMİ | `page.tsx:243-251, 143-156` | Kaydedilmemiş düzenlemeleri uyarmadan sunucu değeriyle eziyor. |
| 7 | "Kaydet" (hero) | KISMİ | `page.tsx:162-183, 252-255` | Tüm state'i gönderiyor (last-write-wins). Yükleme başarısızsa varsayılanları yazıyor (bkz. B4). |
| 8 | Stat: Analiz edilen | ÇALIŞIYOR | `page.tsx:263-273`, `route.ts:86-88` | |
| 9 | Stat: Son 24 saat | ÇALIŞIYOR | `page.tsx:274-284`, `route.ts:89-95` | |
| 10 | Stat: Öğrenme profili | KISMİ | `page.tsx:285-300`, `schema.prisma:2397` | Ham enum gösteriliyor (`idle`/`training`/`ready`), çevrilmiyor. `lastTrainedAt` ve `correctionsUsed` API'den gelip gösterilmiyor. |
| 11 | Stat: Embedding sayısı | ÇALIŞIYOR | `page.tsx:301-311`, `route.ts:84` | Teknik jargon. Restoran sahibi için anlamsız bir metrik. |
| 12 | 7 günlük analiz grafiği | BOZUK | `page.tsx:104-126` | Çubuk `div`'inin yüksekliği/`flex-1`'i yok (`min-h-[4px]`), animasyonlu yükseklik sarmalayıcıya veriliyor. Sonuçta çubuklar hep 4px kalıyor, değer kadar yükselen şey sayı ve gün etiketi oluyor. 0 değerli günlerde etiketler kapsayıcıdan taşıyor. CSS okunarak çıkarıldı, tarayıcıda doğrulanmadı. |
| 13 | Grafik ipucu | KISMİ | `page.tsx:119` | Yalnızca `title` attribute'u var: dokunmatikte ve klavyede çalışmıyor, ekran okuyucu tablo alternatifi yok. |
| 14 | AI motoru ana anahtarı (`isEnabled`) | KISMİ | `page.tsx:333-356`; tüketici: `app/api/feedbacks/route.ts:433-441` | Yalnızca ilk analizde okunuyor. `ai-retry` cron'u ayarı okumadan analiz ediyor (bkz. B1). Ayrıca AI sohbet, içgörü ve otomatik yanıtı kapatmıyor, oysa açıklama "Tüm AI özelliklerini" diyor. |
| 15 | Ana anahtar kaskadı | KISMİ | `page.tsx:195-200` | Kapatınca 15 alt ayar `false` oluyor, açınca geri gelmiyor: kullanıcının granüler yapılandırması kayboluyor. |
| 16 | Otomatik analiz (`autoAnalyze`) | KISMİ | `page.tsx:358-376`; `feedbacks/route.ts:441` | #14 ile aynı cron atlatması var. |
| 17 | Duygu analizi | SAHTE | `page.tsx:82`; grep: yalnızca `app/admin/ai-settings`, `app/api/ai/analyze/route.ts:901` (CRUD) ve `lib/ai-learning.ts:529` (sistem istatistiği) | `analyzeComprehensive` ve pipeline okumuyor (`lib/ai-engine.ts:269-320`). |
| 18 | Duygu tespiti (emotion) | SAHTE | `page.tsx:83` | Hiçbir analiz yolunda okunmuyor. |
| 19 | Konu çıkarma | SAHTE | `page.tsx:84` | Aynı durum. |
| 20 | Niyet analizi | SAHTE | `page.tsx:85` | Aynı durum. |
| 21 | Aciliyet tespiti | SAHTE | `page.tsx:86` | Aynı durum. |
| 22 | Varlık tanıma | SAHTE | `page.tsx:87` | Aynı durum. |
| 23 | Toksisite kontrolü | SAHTE | `page.tsx:88` | Aynı durum. |
| 24 | Churn tahmini | SAHTE | `page.tsx:89` | Aynı durum. |
| 25 | Tema kümeleme | SAHTE | `page.tsx:90` | Aynı durum. |
| 26 | Duygu → alt katman bağımlılığı ve ipucu | SAHTE | `page.tsx:185, 192-194, 416-420` | Bağımlılık yalnızca UI'da var, sunucu zorlamıyor, tüketen de yok. |
| 27 | Toksik içerik uyarısı | SAHTE | `page.tsx:94`; `lib/inngest/feedback-analyze-pipeline.ts:87-95`, `app/api/feedbacks/route.ts:497` | Bildirim, ayar okunmadan koşulsuz gönderiliyor. |
| 28 | Acil durum uyarısı | SAHTE | `page.tsx:95`; `feedback-analyze-pipeline.ts:97-105` | Koşulsuz gönderiliyor. |
| 29 | Churn risk uyarısı | SAHTE | `page.tsx:96`; `feedback-analyze-pipeline.ts:107-115` | Koşulsuz gönderiliyor. |
| 30 | Haftalık AI raporu | SAHTE | `page.tsx:100`; `lib/inngest/functions.ts` (hiçbir rapor cron'u yok), `app/api/cron/daily/route.ts:5-11` | Bu bayrağı okuyan bir üretici yok. |
| 31 | Aylık AI raporu | SAHTE | `page.tsx:101` | Aynı durum. |
| 32 | Özel prompt | KISMİ | `page.tsx:516-538`; tüketici `lib/ai-engine.ts:276-277`, `feedback-analyze-pipeline.ts:30-49` | Çalışıyor ama uzunluk sınırı, enjeksiyon kontrolü ve önizlemesi yok. Sistem promptuna sızıyor (bkz. B2). |
| 33 | "AI öğrenme profili" bağlantı kartı | BOZUK | `page.tsx:542` → `/dealer/ai-learning` | Böyle bir rota yok; yalnızca `app/admin/ai-learning` var. 404'e gidiyor. |
| 34 | Alt "Ayarları kaydet" düğmesi | KISMİ | `page.tsx:559-564` | #7'nin kopyası. Mobilde sayfanın en altında kalıyor. |
| 35 | Yükleme hatası durumu | BOZUK | `page.tsx:143-156` | `res.ok` kontrol edilmiyor. Hata olursa toast çıkıyor ama form "hepsi açık" varsayılanlarla gösteriliyor ve kaydedilebiliyor; gerçek ayarlar ve özel prompt eziliyor. |
| 36 | Kaydetme toast'ları | ÇALIŞIYOR | `page.tsx:171-180` | |
| 37 | Boş durum | KISMİ | `page.tsx:261, 316` | `stats` yoksa kartlar sessizce kayboluyor. Hiç analiz yoksa grafik 7 sıfır çubuk gösteriyor, açıklayıcı bir boş durum yok. |
| 38 | API rol yetkisi | ÇALIŞIYOR | `route.ts:35-36, 166-167`; `proxy.ts:50-73` | Sahiplik `session.user.id` ile sağlanıyor, IDOR yok. Ancak ADMIN için kendi id'siyle anlamsız bir satır oluşturuyor (`route.ts:170`). |
| 39 | `ai_features` modül kapısı | EKSİK | `components/dashboard/sidebar.tsx:268` yalnızca menüyü gizliyor; `route.ts`'de `assertModuleEnabled` yok | Admin AI modülünü kapatsa bile URL ve API çalışmaya devam ediyor. |
| 40 | PATCH girdi doğrulaması | EKSİK | `route.ts:171-182` | zod yok, tip kontrolü yok, try/catch yok. Bozuk JSON veya yanlış tip 500 döndürüyor. |
| 41 | Analiz dili (`analysisLanguage`) seçimi | EKSİK | Şemada var (`schema.prisma:2191`), API taşıyor (`route.ts:122`), UI'da kontrol yok | Motor da okumuyor. |
| 42 | 7 günlük AI kullanım sayısı (`usageLogsLast7d`) | EKSİK | `route.ts:96-98` hesaplıyor; `page.tsx:136` tipte var ama render edilmiyor | Boşa harcanan bir sorgu. |
| 43 | Kaydedilmemiş değişiklik koruması | EKSİK | `page.tsx` içinde dirty state veya `beforeunload` yok | |
| 44 | Switch erişilebilir adları | EKSİK | `page.tsx:351, 372, 413, 464, 507` | `aria-label`/`aria-labelledby`/`id` + `<Label htmlFor>` yok. |
| 45 | Azaltılmış hareket | KISMİ | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`) | Transform'lar kapanıyor ama grafikteki `height` animasyonu ve opacity sürmeye devam ediyor. |
| 46 | Mobil yerleşim | KISMİ | `page.tsx:337-352` | Satırlarda `min-w-0` yok. Ana anahtar satırında başlık + rozet + switch dar ekranda sıkışıyor. Sabit kaydet çubuğu yok. |
| 47 | Değişiklik denetim kaydı (kim, ne zaman AI'ı kapattı) | EKSİK | `route.ts:184-210` | AuditLog yazılmıyor. |

**Sayım:** ÇALIŞIYOR 8 · KISMİ 13 · BOZUK 3 · SAHTE 16 · EKSİK 7 → toplam 47 özellik.

---

## Bulgular (önem sırasıyla)

### B1. KRİTİK · Güvenlik/Gizlilik + Veri · "AI motoru kapalı" ve "otomatik analiz kapalı" ayarları `ai-retry` cron'u tarafından atlatılıyor
- **Kanıt:** `app/api/feedbacks/route.ts:433-441` ayarı okuyor ve analizi atlıyor, `aiProcessedAt` NULL kalıyor. `app/api/cron/ai-retry/route.ts:36-46` 3 dakikadan eski ve `aiProcessedAt: null` olan TÜM geri bildirimleri bayi ayarına bakmadan seçiyor. `:65` bunları `runFeedbackAnalyzePipeline`'a veriyor. `lib/inngest/feedback-analyze-pipeline.ts:30-36` yalnızca `customPrompt` okuyor, `isEnabled`/`autoAnalyze` okumuyor. Cron `app/api/cron/daily/route.ts:58` üzerinden koşuyor.
- **Sorun:** Bayi AI'ı kapattığında (KVKK, maliyet ya da güven nedeniyle) müşteri metinleri yine harici LLM sağlayıcısına (Groq/OpenAI) gönderiliyor, analiz alanları dolduruluyor, toksik/acil/churn bildirimleri üretiliyor, otomatik telafi taslağı ve otomatik yanıt tetikleniyor. Kullanıcıya verilen söz ihlal ediliyor ve bu bir veri işleme ihlali riski. Ayrıca kapalı bayinin kayıtları "takılı" sayıldığı için cron'un 15'lik kotasını boşa harcıyor.
- **Öneri:** "AI izni" tek bir sunucu fonksiyonunda toplanmalı: `lib/ai-settings.ts → getDealerAiPolicy(dealerId)` (Redis'te 60 sn önbellekli, `revalidateTag` ile PATCH'te bayatlatılan). Bu fonksiyon `runFeedbackAnalyzePipeline`'ın başında çağrılmalı ve kapalıysa `{ skipped: true, reason: 'ai-disabled' }` dönmeli. Cron sorgusu da `qrCode: { dealer: { aiSettings: { isEnabled: true, autoAnalyze: true } } }` (veya `aiSettings: null` = varsayılan açık) ile filtrelenmeli. Atlanan kayıtlar `aiSkippedReason` gibi bir alanla işaretlenmeli ki cron onları tekrar tekrar seçmesin ve UI "AI kapalıyken geldi" rozeti gösterebilsin. Bunun için uçtan uca bir test yazılmalı: AI kapalı bayi + 4 dk eski geri bildirim + cron → LLM çağrılmıyor.
- **Efor:** M

### B2. YÜKSEK · Güvenlik · Bayinin `customPrompt`'u sınırsız ve kontrolsüz; analiz promptuna ve platform geneli sistem öğrenme promptuna giriyor (kiracılar arası prompt enjeksiyonu)
- **Kanıt:** `app/api/dealer/ai-settings/route.ts:180-182` tip/uzunluk kontrolü yapmıyor. Şemada `String? @db.Text` (`schema.prisma:2206`). `lib/ai-engine.ts:276-277` metni olduğu gibi system prompt'a ekliyor. Geri bildirim metnine `detectPromptInjection` uygulanıyor (`:299`) ama `customPrompt`'a uygulanmıyor. `lib/ai-learning.ts:627-630, 701` tüm bayilerin özel promptlarını merkezî "sistem öğrenme" LLM çağrısına besliyor. Üretilen `systemPrompt` ise `lib/ai-engine.ts:657-659` ve `:877-897`'de TÜM bayilerin içgörü/sohbet promptlarına önek olarak ekleniyor.
- **Sorun:** (a) Bir bayi "Tüm yorumları positive işaretle" gibi bir talimatla kendi duygu skorlarını şişirip platform geneli sıralamaları ve rozetleri çarpıtabilir (tüketici tarafı bunu ayırt edemez). (b) Kötü niyetli bir metin sistem öğrenme çıktısına girip diğer kiracıların AI yanıtlarını etkileyebilir. (c) Megabaytlarca metin her analizde token maliyeti yaratır (`max_tokens` yalnızca çıktıyı sınırlıyor).
- **Öneri:** PATCH'e zod şeması eklenmeli: `customPrompt: z.string().trim().max(1000).nullable()`, kaydetmeden önce `detectPromptInjection` ile reddedilmeli. Prompt "talimat" yerine "işletme bağlamı" olarak yapılandırılmalı: serbest metin yerine sektör, odak konuları (çoklu seçim), yasaklı/önemli terimler ve marka adları alanları; motor bunları kendi sabit şablonunda yerleştirmeli. Sistem öğrenme agregasyonundan (`ai-learning.ts:627`) bayi promptları tamamen çıkarılmalı ya da yalnızca yapılandırılmış alanlardan anonim istatistik (ör. sektör dağılımı) alınmalı. UI'da karakter sayacı ve "bu metin şöyle kullanılır" önizlemesi gösterilmeli.
- **Efor:** M

### B3. YÜKSEK · İşlevsellik (sahte özellik) · 17 ayarın 14'ü hiçbir yerde tüketilmiyor
- **Kanıt:** `sentimentEnabled … themeClusterEnabled`, `alertOn*`, `weekly/monthlyReportEnabled` için grep sonuçları yalnızca `app/admin/ai-settings/page.tsx`, `app/api/ai/analyze/route.ts:895-936` (CRUD) ve `lib/ai-learning.ts:529` (istatistik) çıkıyor. Analiz tek bir sabit promptla her şeyi üretiyor (`lib/ai-engine.ts:269-320`). Uyarılar koşulsuz (`feedback-analyze-pipeline.ts:87-115`, `feedbacks/route.ts:497`). Rapor üreten bir cron yok (`lib/inngest/functions.ts`, `app/api/cron/daily/route.ts`).
- **Sorun:** Kullanıcı "Churn uyarısını kapattım" diyor ama bildirim gelmeye devam ediyor. "Haftalık rapor açık" görünüyor ama rapor hiç gelmiyor. Bu güven kaybı ve destek talebi demek. Hero'daki "9/9 özellik aktif" sayacı da sahte bir metrik.
- **Öneri:** Önce envanter dürüstleştirilmeli: tüketilmeyen anahtarlar ya bağlanmalı ya da kaldırılmalı. Bağlanacaklar şöyle:
  - **Uyarılar:** Pipeline'daki 3 `notification.create` bloğu `policy.alertOnToxic/Urgent/ChurnRisk` ile koşullanmalı. Eşikler (0.7) bayi tarafından ayarlanabilir hâle getirilmeli. Kanal seçimi (uygulama içi, e-posta, push, sessiz saatler) push merkezine bağlanmalı.
  - **Analiz modülleri:** Ayrı LLM çağrısı olmadığı için kapatmak maliyeti düşürmüyor. Ya JSON şemasından ilgili alanlar çıkarılmalı (`buildAnalysisSystemPrompt(policy)`) ve kayıtta NULL yazılmalı, ya da (daha doğrusu) bu 9 anahtar kaldırılıp yerine "Gösterim tercihleri" (hangi sinyaller panolarda görünsün) konmalı.
  - **Raporlar:** `/dealer/weekly-brief` zaten var. Haftalık Pazartesi cron'u bayi başına brief üretip e-posta/push ile göndermeli ve bu bayrağı okumalı. Aylık için aynı altyapı kullanılmalı.
- **Efor:** L

### B4. YÜKSEK · Veri bütünlüğü · Yükleme başarısız olursa sayfa varsayılanları gösteriyor; "Kaydet" gerçek ayarları ve özel promptu siliyor
- **Kanıt:** `page.tsx:145-149` `res.ok` kontrol edilmiyor. `{error}` JSON'u gelirse ayar set edilmiyor, `defaultSettings` (hepsi açık, `customPrompt: null`) kalıyor. Gövde JSON değilse `catch` → toast, ama form yine düzenlenebilir ve kaydedilebilir durumda. `page.tsx:168` tüm state'i gönderiyor, `route.ts:180-186` hepsini `update` ediyor.
- **Sorun:** Geçici bir 500/403 (ör. token-replay 403'ü, `lib/api-auth.ts:69-77`) sonrası kullanıcı fark etmeden Kaydet'e basarsa AI'ı kapatmış bayinin ayarları "hepsi açık"a döner, özel prompt silinir.
- **Öneri:** Yükleme hatasında form yerine "Ayarlar yüklenemedi, Tekrar dene" hata kartı gösterilmeli ve Kaydet devre dışı kalmalı. PATCH yalnızca değişen alanları (diff) göndermeli. Sunucuya `updatedAt` tabanlı iyimser eşzamanlılık eklenmeli (`If-Match`/`version`, uyuşmazlıkta 409 + "başka sekmede değişti" diyaloğu). SWR/React Query'ye geçilerek `error/isLoading` durumları standartlaştırılmalı.
- **Efor:** S-M

### B5. ORTA · Kırık link · "AI öğrenme profili" kartı 404'e gidiyor
- **Kanıt:** `page.tsx:542` `href="/dealer/ai-learning"`. `app/dealer/` altında `ai-learning` yok, yalnızca `app/admin/ai-learning` var.
- **Öneri:** Bayi tarafında öğrenme profili için gerçek bir yüzey kurulmalı. En doğrusu bu sayfada bir "Öğrenme" sekmesi: `AIDealerLearningProfile` durumu (çevrilmiş), son eğitim zamanı, kullanılan düzeltme sayısı, `getLearningRetrainSuggestion` (`app/api/ai/learning/route.ts`) önerisi ve "Yeniden eğit" düğmesi. Bu yapılana kadar kart kaldırılmalı.
- **Efor:** S (kaldırma) / M (sekme)

### B6. ORTA · Yetki/Modül · `ai_features` modül kapısı API'de ve sayfada uygulanmıyor
- **Kanıt:** Menü `components/dashboard/sidebar.tsx:268` `moduleKey: 'ai_features'` ile gizleniyor. `app/api/dealer/ai-settings/route.ts` içinde `assertModuleEnabled` yok. Kıyas için `app/api/dealer/campaigns/route.ts:28` bu kapıyı uyguluyor. `grep "assertModuleEnabled('ai"` hiç sonuç vermiyor.
- **Sorun:** Admin, AI modülünü "kritik" olarak kapatsa bile (`lib/module-controls.ts:47`) bayi URL'yi yazarak ayarları değiştirebiliyor. Plan veya özellik yönetimi tutarsız kalıyor.
- **Öneri:** GET/PATCH'e `assertModuleEnabled('ai_features', { role: 'dealer', request, userId })` eklenmeli. Sayfada kapalı modül için "Bu özellik hesabınızda kapalı" boş durumu gösterilmeli. Aynı kapı `/dealer/ai-chat`, `/dealer/ai-insights` uçlarında da denetlenmeli (bu sayfanın kapsamı dışında, doğrulanmadı).
- **Efor:** S

### B7. ORTA · Sağlamlık · PATCH'te girdi doğrulaması ve hata yönetimi yok
- **Kanıt:** `route.ts:171` `await request.json()` try/catch dışında. `:180-182` değerler ham olarak Prisma'ya veriliyor (`isEnabled: "evet"` → Prisma validation error → 500). `:170` `session.user.role === 'DEALER' ? session.user.id : session.user.id` ölü bir ternary; ADMIN kendi id'siyle `AISettings` satırı oluşturuyor.
- **Öneri:** Kısmi zod şeması (`AiSettingsPatchSchema.partial().strict()`) ile 400 + alan hataları dönülmeli. Bağımlılık kuralları (duygu kapalıysa alt katmanlar kapalı; `isEnabled=false` ise `autoAnalyze=false`) sunucuda zorlanmalı. ADMIN rolü bu uçtan çıkarılmalı; admin zaten `/api/ai/analyze?action=update_settings` ile hedef bayiyi seçiyor. İki yazma ucu tek bir servise (`lib/ai-settings.ts`) indirgenmeli. Değişiklikler AuditLog'a yazılmalı (önceki → yeni).
- **Efor:** S-M

### B8. ORTA · Görsel/Bozuk · 7 günlük grafik çubuk çizmiyor; gün adları her dilde Türkçe; günler UTC'ye göre gruplanıyor
- **Kanıt:** `page.tsx:109-121`: yükseklik animasyonu sarmalayıcıda, çubuk `div`'inde yalnızca `min-h-[4px]` var (flex-grow yok). `route.ts:113` `Intl.DateTimeFormat('tr-TR', …)` sabit, bu yüzden EN kullanıcı "Pzt" görüyor. `route.ts:51` `date_trunc('day', …)` ve `:108-110` `toISOString()` UTC günü veriyor; İstanbul'da 00:00-03:00 arası gelen kayıtlar önceki güne yazılıyor. Grafik davranışı CSS okunarak çıkarıldı, tarayıcıda doğrulanmadı.
- **Öneri:** Grafik `dataviz` standartlarında yeniden yazılmalı: sabit yükseklikte eksen, çubuk `flex-1 justify-end` + iç çubuk `height: %`, değer etiketi çubuğun üstünde, gün etiketi tabanda sabit. Erişilebilirlik için `role="img"` + `aria-label` özeti ve gizli `<table>` eklenmeli. Günler bayinin saat dilimine göre gruplanmalı: `lib/timezone` (zaten dealer route'larında kullanılıyor) ile `AT TIME ZONE` kullanılmalı. Etiket istemcide `useAppT` locale'iyle formatlanmalı; API ham ISO tarih döndürmeli.
- **Efor:** S

### B9. ORTA · UX · Ana anahtar kaskadı geri dönüşsüz; kaydedilmemiş değişiklik takibi yok; "Yenile" düzenlemeleri siliyor
- **Kanıt:** `page.tsx:195-200` kapatınca 15 alanı `false` yapıyor, açınca hiçbirini geri getirmiyor. `:247` "Yenile" düzenlemeleri ezip sunucu değerini getiriyor. Dirty state yok; iki Kaydet düğmesi var (`:252`, `:560`).
- **Öneri:** Ana anahtar alt ayarları değiştirmemeli; yalnızca etkisiz kılmalı (UI'da soluk + "Motor kapalı, bu ayarlar şu an uygulanmıyor" bandı). Sunucu "efektif politika"yı `isEnabled && alt` olarak hesaplamalı. Form, `react-hook-form` + dirty state ile yönetilmeli. Değişiklik varsa altta yapışkan bir "Kaydedilmemiş N değişiklik · Geri al · Kaydet" çubuğu gösterilmeli (mobilde `env(safe-area-inset-bottom)` ile). `beforeunload` ve rota değişiminde onay istenmeli. "Yenile" yalnızca istatistikleri yenilemeli.
- **Efor:** M

### B10. DÜŞÜK · Erişilebilirlik · Switch'ler ve textarea isimsiz
- **Kanıt:** `page.tsx:351, 372, 413, 464, 507`: `aria-label`/`aria-labelledby` yok. `:527` Textarea'nın `<label>`'ı yok. `:552` "→" karakteri `aria-hidden` değil. Bazı ikonlarda `aria-hidden` eksik (`:288, 304, 340, 365, 405, 435, 457, 478, 500, 521`).
- **Öneri:** Her satır `<Label htmlFor={id}>` ile tıklanabilir hâle getirilmeli (dokunma hedefi de büyür). Switch'e `id` ve `aria-describedby` (açıklama metni) verilmeli. Ortak bir `SettingRow` bileşeni (`components/settings/setting-row.tsx`) çıkarılıp üç döngüdeki kopyalanmış JSX (`:390-424, 442-467, 485-510`) tekilleştirilmeli.
- **Efor:** S

### B11. DÜŞÜK · Performans/Ölü kod · Soft-delete probe sorgusu ve gösterilmeyen metrik
- **Kanıt:** `route.ts:42-70`: her istekte `feedback.count` probe'u yapılıyor ve iki SQL varyantı tutuluyor. Oysa aynı handler `:87, :92`'de `deletedAt: null`'ı koşulsuz kullanıyor; kolon olmasaydı zaten patlardı, yani probe anlamsız. `:96-98` `usageLogsLast7d` hesaplanıyor ama UI kullanmıyor. `learningProfile.lastTrainedAt/correctionsUsed` da kullanılmıyor.
- **Öneri:** Probe ve ikinci SQL varyantı silinmeli. İstatistikler `unstable_cache` (60 sn, `dealer:{id}:ai-stats` tag'i) ile önbelleğe alınabilir. Ayar okuma ile istatistik okuma iki uca ayrılmalı (ayarlar hızlı, istatistikler ertelenmiş). Böylece form hemen açılır.
- **Efor:** S

### B12. DÜŞÜK · Görsel tutarlılık/İçerik · Kart stilleri karışık, ham enum ve jargon kullanılıyor
- **Kanıt:** `page.tsx:263, 274` (`border-border/60 bg-card/50 backdrop-blur-sm`) ile `:285, 301` (`border-0`) farklı. `:292` `idle`/`ready` ham gösteriliyor. "Embedding" etiketi (`tr.json` → `statEmbedding`) bayi için anlamsız. Meta açıklama yanıltıcı (#1).
- **Öneri:** Tek bir `StatTile` bileşeni ve tasarım token'ları kullanılmalı. Durum `t('dealerAiSettings.learningStatus.{status}')` ile çevrilmeli. "Embedding" yerine iş dilinde bir metrik konmalı: "Benzer yorum araması için dizinlenen" ya da hiç gösterilmemeli. Kullanım ve maliyet (`AIUsageLog`, kota) gibi işletme için anlamlı metrikler öne alınmalı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Uyarı yönlendirme ve eşikleri** (Medallia Alerts, Qualtrics Tickets): Uyarı türü başına eşik (aciliyet ≥ X, puan ≤ Y), kanal (uygulama içi, e-posta, push, WhatsApp), alıcı (ekip üyesi veya rol), sessiz saatler ve günlük özet modu. Şu an anahtarlar sahte ve tek alıcı sabit.
2. **AI kullanım, kota ve maliyet görünürlüğü** (Square/Toast eklenti faturalaması, Qualtrics XM usage): Bu ay kullanılan analiz sayısı / plan limiti, `checkAiCostGuard` durumu, limit dolunca ne olacağı. `AIUsageLog` zaten tutuluyor ama gösterilmiyor.
3. **Önizleme / "promptumu test et" alanı** (Qualtrics Text iQ, Medallia Text Analytics): Örnek bir yorum yapıştırıp mevcut ayar + bağlamla analiz sonucunu canlı görme, kaydetmeden önce karşılaştırma.
4. **Yapılandırılmış işletme bağlamı ve sözlük** (Qualtrics Text iQ topic models, Medallia custom themes): Serbest prompt yerine sektör, ürün/menü adları, şube adları, eşanlamlı ve yasaklı terimler, özel konu/tema tanımları. `Product` verisinden otomatik doldurulabilir.
5. **Veri işleme ve gizlilik kontrolleri** (Medallia PII redaction, Qualtrics data retention): Analizden önce PII maskeleme anahtarı, hangi AI sağlayıcısına veri gittiği bilgisi, KVKK açıklaması, analiz verisinin saklama süresi, "AI verilerimi sil". Sayfanın meta açıklaması bunu vaat ediyor ama karşılığı yok.
6. **Değişiklik geçmişi ve geri alma** (Google Business Profile, Square ayar geçmişi): Kim, ne zaman, neyi değiştirdi; önceki sürüme dön. Toplu yeniden analiz ("ayar değişti, son 30 günü yeniden analiz et", ilerleme çubuğu ve maliyet tahminiyle).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi sahibi bu sayfaya geldiğinde 5 saniyede şunu anlamalı: "AI açık mı, ne yapıyor, bana ne kadara mal oluyor, ne zaman haber verecek?" Ve her anahtarın gerçekten bir şeyi değiştirdiğine güvenmeli. Sayfa bir "kontrol paneli" değil, **AI asistanının iş tanımı** gibi okunmalı.

**Yerleşim (sekmeli, tek kaydet çubuklu):**
1. **Durum şeridi (üst):** Motor durumu (Açık/Kapalı/Kota doldu), bu ay analiz/kota halkası, son analiz zamanı, başarısız ya da bekleyen analiz sayısı (cron kuyruğu). Ana anahtar burada durmalı; kapatınca kırmızı bir onay diyaloğu "Yeni yorumlar analiz edilmeyecek ve harici AI sağlayıcısına gönderilmeyecek" demeli.
2. **Sekme: İşletme bağlamı:** Sektör seçici, odak konuları (çip çoklu seçim), ürün/menü sözlüğü (Product tablosundan önerilir), max 1000 karakterlik ek not ve sağda canlı "Örnek yorumla dene" paneli (analiz sonucunun duygu/konu/aciliyet rozetleri).
3. **Sekme: Uyarılar:** Her uyarı türü için bir kart: eşik kaydırıcısı, kanal çipleri, alıcı (ekip modülü rolleri), sessiz saatler ve "son 7 günde bu ayarla N uyarı alırdınız" simülasyonu (mevcut veriden hesaplanır).
4. **Sekme: Raporlar:** Haftalık/aylık brief zamanlaması (gün/saat, saat dilimi), alıcı listesi, son raporun önizlemesi ve "Şimdi gönder".
5. **Sekme: Öğrenme:** Profil durumu (çevrilmiş), düzeltme sayısı, yeniden eğitme önerisi, "Yeniden eğit" düğmesi. Bugün 404 veren kartın yerini alır.
6. **Sekme: Gizlilik ve kullanım:** PII maskeleme, sağlayıcı bilgisi, saklama süresi, kullanım grafiği (7/30 gün, analiz + sohbet + içgörü ayrımıyla), değişiklik geçmişi.
- Altta yapışkan bir **kaydet çubuğu** (dirty state, "Geri al", "Kaydet") olmalı; mobilde güvenli alan payıyla.

**Motion/3D:** 3D gereksiz; bu bir ayar yüzeyi. Motion ölçülü olmalı: sayfa girişinde tek bir 120-160 ms'lik fade (bugünkü 0.7 sn'ye uzanan 20+ kademeli giriş animasyonu ayar sayfası için fazla, `page.tsx:398, 450, 493, 559`). Switch değişiminde satırın arka planına 150 ms'lik renk geçişi, kaydet çubuğunun alttan `spring` ile girişi, kota halkasında tek seferlik dolma animasyonu yeterli. Hepsi `useReducedMotion` ile yükseklik/opacity dahil kapatılabilmeli.

**Veri/API değişiklikleri:**
- `lib/ai-settings.ts`: `getDealerAiPolicy(dealerId)` (Redis önbellekli, tag'li) ve `updateDealerAiPolicy(dealerId, patch, actorId)` (zod, iş kuralları, AuditLog, `revalidateTag`). Pipeline, cron, uyarılar, rapor cron'u, ai-chat ve insights yalnızca buradan okumalı.
- Uçlar: `GET /api/dealer/ai-settings` (yalnızca ayarlar + `version`), `GET /api/dealer/ai-settings/stats` (önbellekli istatistik + kullanım/kota), `PATCH` (kısmi diff + `If-Match: version`), `POST /api/dealer/ai-settings/preview` (rate-limitli, cost-guard'lı test analizi), `POST /api/dealer/ai-settings/reanalyze` (Inngest işi, idempotent).
- Şema: `AISettings`'e `version Int`, `alertThresholds Json`, `alertChannels Json`, `reportSchedule Json`, `businessContext Json` (yapılandırılmış), `piiRedaction Boolean` eklenmeli. Kullanılmayacak modül anahtarları kaldırılmalı veya `displayPrefs`'e taşınmalı. `Feedback`'e `aiSkippedReason String?` eklenmeli (B1).
- `lib/ai-learning.ts:627` sistem agregasyonundan bayi serbest promptları çıkarılmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ai-settings`** (`app/admin/ai-settings/page.tsx`, 386 satır): Aynı 17 bayrağı başka bir uç (`/api/ai/analyze?action=get_settings|update_settings`, `route.ts:851-936`) üzerinden yönetiyor ve bu uç da bayi rolüne açık (yalnızca CUSTOMER engelleniyor). Ortada iki yazma yolu, iki varsayılan tanımı (`route.ts:13-32` ve `analyze/route.ts:975-994`) ve iki farklı doğrulamasız kod var. **Öneri:** Tek bir `lib/ai-settings.ts` servisi kurulmalı. `/api/ai/analyze`'daki `get_settings`/`update_settings` dalları kaldırılıp admin sayfası `/api/admin/dealers/[id]/ai-settings` üzerinden aynı servisi çağırmalı. Bayi sayfası ile admin sayfası paylaşılan bir `AiSettingsForm` bileşenini kullanabilir (ekip modülündeki çift-panel deseni gibi).
- **`/dealer/settings`** ve **`/dealer/settings/auto-replies`**: Otomatik yanıt da bir AI davranışı, ama ana anahtar onu kapatmıyor. Ayrıca bayi "AI ile ilgili her şey" için iki ayrı yere gitmek zorunda. **Öneri:** `/dealer/ai-settings`, `/dealer/settings` altında bir "AI" sekmesi olarak birleştirilmeli; otomatik yanıt tonu ve onay kuralları aynı politika nesnesinde yer almalı. Sidebar'daki "AI Ayarları" girişi (`sidebar.tsx:268`) o sekmeye yönlendirilmeli.
- **`/dealer/weekly-brief`, `/dealer/operations-brief`**: "Otomatik raporlar" anahtarlarının gerçek karşılığı bu sayfalar; rapor teslim zamanlaması bu brief'lerin üreticisine bağlanmalı. Birleştirme gerekmiyor, sözleşme bağlantısı gerekiyor.
- **`/admin/ai-learning`**: Bayi tarafının öğrenme yüzeyi yok (B5). Bayi için ayrı bir sayfa açmak yerine bu sayfaya "Öğrenme" sekmesi eklenmeli.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod, veritabanı, build ve test çalıştırılmadı. Her iddia çağıran ve çağrılan taraflardan okunarak sınandı.

### 1. AI kapalı bayinin geri bildirimleri ai-retry cron'u ile yine LLM'e gönderiliyor — **DOĞRULANDI** (zamanlama düzeltmesiyle)

- İlk analiz yolu ayarı okuyor: `app/api/feedbacks/route.ts:436-441`, `isEnabled=false` ya da `autoAnalyze=false` ise `shouldAnalyze=false` olur ve hiçbir alan yazılmaz. Sonuçta `aiProcessedAt` NULL kalır.
- `app/api/cron/ai-retry/route.ts:36-46` yalnızca `aiProcessedAt: null, text != null, deletedAt: null, createdAt < 3 dk önce` filtresini kullanıyor. Bayi ayarına (`AISettings`) hiç bakmıyor.
- `lib/inngest/feedback-analyze-pipeline.ts:30-36` yalnızca `customPrompt` seçiyor. `isEnabled` ve `autoAnalyze` okunmuyor. `analyzeWithFallback` da ayarı kontrol etmiyor; `grep aISettings` ile `lib/ai-engine.ts`, `lib/auto-reply-engine.ts` ve `lib/remedy-automation-core.ts` içinde eşleşme yok.
- Pipeline gerçek LLM çağrısının ardından bildirim (`:87-116`), otomatik telafi taslağı (`:122`), embedding (`:134`) ve otomatik yanıt (`:136`) adımlarını çalıştırıyor.
- **Düzeltme:** İddiadaki "3 dk sonra" ifadesi yanlış. Commit `953c8fe` ile `ai-retry` artık günlük toplayıcının içinde çalışıyor (`app/api/cron/daily/route.ts:58`, `vercel.json` `0 3 * * *`). Sızıntı en geç ertesi gece 03:00'te oluyor. Her koşuda en yeni 15 kayıt işleniyor, bu yüzden birikmiş kayıtlar da sırayla gönderiliyor.
- **Yeniden üretim:** Bayi `/dealer/ai-settings` sayfasında ana anahtarı kapatır. Müşteri bu bayinin QR'ı üzerinden en az 5 karakterlik metinle yorum bırakır. Kayıt `aiProcessedAt=NULL` olarak kalır. 03:00'te daily → ai-retry → `runFeedbackAnalyzePipeline` çalışır, metin GROQ/OpenAI'a gider, `aiProcessedAt` dolar ve gerekirse "Acil/Toksik" bildirimi ile otomatik yanıt üretilir. Manuel mod (`autoAnalyze=false`) seçen bayi için de aynı şey olur.
- **Önem:** Yüksek, iddia yerinde. "Kapalı" anahtarı harici veri işlemeyi durdurmuyor; bu bir KVKK açık rıza ve beyan tutarlılığı sorunu.
- **Öneri:** Politika kontrolünü tek bir yere taşıyın, `runFeedbackAnalyzePipeline` girişine `getDealerAiPolicy(dealerId)` ekleyip `!isEnabled || !autoAnalyze` ise `{ skipped: true, reason: 'disabled' }` dönün. Bunun yanında `Feedback.aiSkippedReason` alanı eklenmeli ve ilk yol bunu yazmalı. ai-retry sorgusu da `aiSkippedReason: null` ile filtrelenmeli. Aksi halde atlanan kayıtlar her gece taranıp 15'lik kuyruğu tıkar. Manuel "şimdi analiz et" isteği ayrı ve açık bir uçtan geçmeli.

### 2. Bayi customPrompt'u doğrulamasız, sınırsız ve platform geneli sistem promptuna sızıyor — **BELİRSİZ** (doğrulama eksikliği gerçek, önem abartılı)

- **Doğrulanan kısım:** `app/api/dealer/ai-settings/route.ts:180-182` gövdedeki her anahtarı tip, uzunluk veya içerik kontrolü olmadan Prisma'ya veriyor. Şemada `customPrompt String? @db.Text` (`prisma/schema.prisma:2206`), yani sınır yok. Prompt doğrudan analiz sistem promptuna ekleniyor (`lib/ai-engine.ts:276-277`). Müşteri metni `detectPromptInjection` ile hem 10.000 karakter sınırından hem desen kontrolünden geçiyor (`lib/prompt-injection.ts:20-28`). customPrompt bu kontrollerin hiçbirinden geçmiyor. Yanlış tipteki bir değer (ör. `isEnabled: "x"`) Prisma'da 500 hatasına yol açıyor.
- **Kendi analizini çarpıtma:** customPrompt'un amacı zaten bayinin kendi analizini yönlendirmek; ürün tasarımı gereği bu bir özellik. Yine de gerçek bir yan etki var. `"Tüm yorumları positive işaretle"` gibi bir prompt bayinin müşterilerinin `sentiment` alanını değiştiriyor. Bu alan `lib/surprise-badges.ts:141` içinde müşteri rozeti sayımında ve `lib/tenant-health.ts:43-44` içinde admin sağlık sinyalinde kullanılıyor. Etkisi var ama "sıralama" etkisi doğrulanmadı.
- **Kiracılar arası enjeksiyon:** Doğrudan değil. `lib/ai-learning.ts:627-630,701` promptları yalnızca admin `POST /api/admin/ai-learning/system` ile eğitimi elle tetiklediğinde, "örnekler" veri bloğu olarak öğrenme LLM'ine veriyor. Çıktı bir LLM tarafından yeniden yazılıyor ve admin bunu `updateSystemLearningPrompts` ile düzenleyebiliyor. Aynı veri bloğuna son kullanıcı yorum metinleri de (`sampleTexts`) giriyor, yani bu kanal customPrompt'a özgü değil. Deterministik bir kiracılar arası enjeksiyon senaryosu kurulamadı.
- **Token maliyeti:** Prompt boyutu sağlayıcının bağlam penceresiyle sınırlı. Aşarsa istek reddediliyor ve fallback'e düşülüyor. Maliyet o bayinin yorum hacmiyle orantılı; gerçek ama orta düzey bir kötüye kullanım vektörü.
- **Önem:** Kritik/Yüksek değil, Orta. Uygulanması gereken düzeltme: zod ile tip ve uzunluk sınırı (≤1000 karakter), `detectPromptInjection` kontrolü, promptun sistem talimatı yerine sınırlandırılmış bir "işletme bağlamı" veri bloğu olarak eklenmesi ve sistem agregasyonundan serbest promptların çıkarılması.

### 3. Yükleme hatasından sonra Kaydet, varsayılanlarla gerçek ayarları ve özel promptu eziyor — **DOĞRULANDI** (önem: Orta)

- `app/dealer/ai-settings/page.tsx:143-156`: `res.ok` kontrol edilmiyor. `data.settings` yoksa state `defaultSettings` olarak kalıyor (`:60-79`, hepsi `true`, `customPrompt: null`) ve `loading=false` olduğu için form düzenlenebilir hale geliyor.
- `:162-170` `saveSettings` tüm state'i gönderiyor. API `:180-182` gönderilen her anahtarı `update` ile yazıyor ve `customPrompt: null` gerçek promptu siliyor.
- **Yeniden üretim:** AI'ı kapalı ve özel promptu dolu bir bayi düşünelim. GET'teki 8 paralel sorgudan biri geçici olarak hata verir (Neon soğuk başlangıç, `$queryRaw` zaman aşımı). Route handler yakalanmamış hata yüzünden gövdesiz bir 500 döner, `res.json()` fırlatır ve "yüklenemedi" toast'u görünür, ama form "hepsi açık" gösterilir. Bayi bir anahtarı değiştirip Kaydet'e basar ve PATCH başarılı olur. Sonuçta `isEnabled=true` olur, uyarılar açılır, prompt silinir. Sonraki yorumlar harici AI'a gitmeye başlar.
- **Not:** 401 ya da token-replay kaynaklı 403 senaryosunda PATCH de aynı nedenle reddedilir, yani ezme olmaz. Risk geçici 5xx durumuyla sınırlı ve kullanıcının hata toast'una rağmen kaydetmesini gerektiriyor. Bu yüzden önem Yüksek değil Orta.
- **Öneri:** Yükleme hatasında formu kilitleyip "Yeniden dene" durumu gösterin (`loadError` state'i, `res.ok` kontrolü). PATCH'te yalnızca değişen alanların diff'i gönderilmeli ve `If-Match: version` ile iyimser kilit kullanılmalı.

### 4. Uyarı anahtarları sahte: toksik/acil/churn bildirimleri ayardan bağımsız gönderiliyor — **DOĞRULANDI** (önem: Orta, güvenlik değil işlev sözleşmesi)

- `alertOnToxic|alertOnUrgent|alertOnChurnRisk` yalnızca CRUD yollarında geçiyor: `app/api/dealer/ai-settings/route.ts`, `app/api/ai/analyze/route.ts:912-935,991-993` ve admin sayfası. Hiçbir tüketici okumuyor.
- `lib/inngest/feedback-analyze-pipeline.ts:87-116` üç bildirimi de koşulsuz oluşturuyor. Ayar sorgusu yalnızca `customPrompt` seçiyor (`:34`). Inline yol `app/api/feedbacks/route.ts:497` de toksik bildirimini koşulsuz yazıyor.
- **Yeniden üretim:** Bayi AI açıkken yalnızca "Toksik içerik uyarısı"nı kapatır. Küfürlü bir yorum gelir ve analiz `isToxic=true` döner. "Toksik İçerik Tespit Edildi" bildirimi yine oluşur.
- **Öneri:** Pipeline politikayı okumalı. Uyarı üretimi `emitAiAlert(kind, policy)` gibi tek bir yardımcıya taşınmalı ve eşik ile kanal tercihi aynı politikadan gelmeli. İki analiz yolu (inline ve pipeline) birleştirilip tek pipeline'a indirilmeli; inline yol zaten acil/churn bildirimlerini hiç üretmiyor, yani iki yolun davranışı da birbirinden farklı.
