# /admin/ai-learning

**Amaç:** Platform operatörünün AI'ın "öğrenme" katmanını yönetmesi: (1) tüm veritabanıyla eğitilen sistem geneli profil + bu eğitimin ürettiği iki prompt (analiz için `systemPrompt`, sohbet için `chatSystemPrompt`) ve bunların elle düzenlenmesi; (2) her bayi için geri bildirim + düzeltmelerden çıkarılan adaptif JSON profilin (sektör, temalar, varlıklar, yap/kaçın kuralları) izlenmesi ve yeniden üretilmesi; (3) embedding ve düzeltme hacminin görünürlüğü.

**Genel puan: 4 / 10** · **Karar: yeniden tasarla** (UI + veri katmanı; prompt yönetimi ayrı, sürümlü bir alt modüle ve `/admin/ai-*` sayfalarıyla tek "AI Operasyon Merkezi"ne taşınmalı)

Kısa hüküm: Sayfa çalışıyor görünüyor ve temel eylemler (sistem eğitimi, prompt düzenleme, bayi profili yenileme) gerçek uçlara bağlı; sahte veri yok. Ancak bu ekran, **müşteri sohbeti dahil tüm `askAI` çağrılarının taban sistem promptunu tek textarea'dan, doğrulamasız, sürümsüz, denetim kaydı ve önizleme olmadan canlıya basan** bir kontrol noktası. Ayrıca "sistem eğitimi" çıktısının öğrenilmiş kısmı analiz yoluna hiç ulaşmıyor (800 karakter kırpması), yeniden eğitim elle yapılan prompt düzenlemelerini sessizce eziyor ve eğitim tüm bayilerin işletme/ürün adlarını ve geri bildirim metinlerini tek bir paylaşılan prompta karıştırarak kiracılar arası sızıntı riski doğuruyor. Bayi listesi ise istemcide 50 seri HTTP isteğiyle (≈350 DB sorgusu) kuruluyor ve yalnızca en yeni 50 bayiyi kapsıyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Eylemler gerçek uçlara bağlı ve çalışıyor; ama eğitimin etkisi analiz yolunda kırpılıyor, manuel düzenlemeler eziliyor, bayi kapsamı 50 ile sınırlı, API'nin döndürdüğü yeniden eğitim önerisi kullanılmıyor. |
| UX | 4/10 | Aynı sayılar üç kez (hero, sistem kartı, özet kartları) ve birbiriyle çelişen değerlerle gösteriliyor; arama/sıralama/sayfalama yok; prompt düzenleme riskli bir işlem olduğu halde düz bir textarea. |
| Görsel | 5/10 | Diğer admin sayfalarıyla tutarlı (AdminPremiumHero + cam kartlar), fakat öğrenilmiş profil ham `JSON.stringify` dökümü, hiyerarşi düz, ikon seçimi (Shield) anlamsız. |
| Mimari | 3/10 | Liste verisi istemcide N+1 seri istekle birleştiriliyor; uzun süren LLM eğitimi senkron HTTP isteğinde, kilitsiz ve durum makinesiz; prompt "tek satır singleton" modeli sürüm/geçmiş taşımıyor. |
| Performans | 3/10 | Sayfa açılışı 50 seri istek bitene kadar iskelette bekliyor; her tek bayi güncellemesinden sonra 50 istek yeniden atılıyor; sistem eğitimi `Feedback` tablosunu sınırsız olarak üç kez belleğe çekiyor. |
| Erişilebilirlik + Mobil | 4/10 | Global `MotionConfig reducedMotion="user"` var; ama satırlar klavyeyle açılamıyor, ikon-buton etiketsiz, `aria-expanded`/`aria-pressed` yok, textarea etiketleri bağlı değil; dar ekranda filtre + toplu güncelle satırı sarmıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim yetkisi (ADMIN + gizli kapı) | ÇALIŞIYOR | `proxy.ts:51,79-87`; `components/dashboard/sidebar.tsx:190` | `/admin/*` ADMIN rolü + `admin_gate` çerezi istiyor. |
| 2 | API yetkisi | KISMİ | `app/api/admin/ai-learning/system/route.ts:17,46,67`; `app/api/ai/learning/route.ts:22-27,67-69,104`; `proxy.ts:102-115` | Sistem uçları `requireAuth(['ADMIN'])`. Ancak gizli kapı çerezi API katmanında hiç kontrol edilmiyor (proxy `/api/*` için yalnız header ekliyor) — platform geneli. `/api/ai/learning` "CUSTOMER değilse" geçiyor; STAFF da kendi id'siyle LLM tetikleyebiliyor. |
| 3 | Tam sayfa yükleniyor iskeleti | KISMİ | `page.tsx:249-271` | Yalnız bayi listesine (`loading`) bağlı; ayrı ve hızlı olan sistem profili de 50 seri istek bitene kadar görünmüyor. |
| 4 | Bayi listesi hata durumu | KISMİ | `page.tsx:175-189` | Toplu hata → yalnız toast, yeniden dene yok. Tekil bayi hatası sessizce "0 embedding / profil yok" olarak gösteriliyor (yanlış veri). `res.ok` hiç kontrol edilmiyor. |
| 5 | Sistem profili hata durumu | BOZUK | `page.tsx:90-101,359,364-366` | Hata yutuluyor (`// ignore`); `systemStats` null kalınca buton "En az 3 geri bildirim gerekli" diye devre dışı — gerçek neden (500/ağ) yerine yanıltıcı mesaj. |
| 6 | Hero başlık/açıklama | ÇALIŞIYOR | `page.tsx:279-287` | `icon={<Shield/>}` bu sayfa için anlamsız (güvenlik çağrışımı). |
| 7 | Hero "Profil" sayacı | KISMİ | `page.tsx:273,292` | Yalnız yüklenen ≤50 bayinin toplamı. |
| 8 | Hero "Embedding" sayacı | KISMİ | `page.tsx:274,296` | ≤50 bayinin toplamı; hemen altındaki sistem kartındaki platform toplamıyla çelişir. |
| 9 | Hero "Düzeltme" sayacı | KISMİ | `page.tsx:275,300` | Aynı çelişki. |
| 10 | Sistem istatistik kartları (geri bildirim, düzeltme, bayi, embedding) | ÇALIŞIYOR | `page.tsx:319-340`; `system/route.ts:22-27` | Platform geneli doğru sayılar. |
| 11 | Sistem profili sürüm/durum rozetleri | KISMİ | `page.tsx:342-349`; `lib/ai-learning.ts:819` | `status` hiçbir zaman `training` yapılmıyor; "hiç eğitilmedi" durumu için metin yok, ham `idle` gösterilebilir. |
| 12 | Son eğitim zamanı | ÇALIŞIYOR | `page.tsx:350-354` | |
| 13 | "Sistem Profilini Eğit" | KISMİ | `page.tsx:103-121,357-363`; `system/route.ts:45-64`; `lib/ai-learning.ts:652-842` | Gerçek LLM eğitimi (3 çağrı). Kilit, iş kuyruğu, ilerleme, `maxDuration` yok; tüm tablo belleğe; öğrenilen ek analiz yolunda kırpılıyor (Bulgu 3). |
| 14 | "En az 3 geri bildirim" koruması | KISMİ | `page.tsx:359,364`; `system/route.ts:45-63` | Yalnız istemcide; sunucu POST bu koşulu zorlamıyor. |
| 15 | Eğitim onay penceresi | ÇALIŞIYOR | `page.tsx:105` | Native `confirm()`; panelin geri kalanındaki AlertDialog diliyle tutarsız. |
| 16 | "Sistem / Sohbet Promptunu Düzenle" | KISMİ | `page.tsx:368-374` | Profil yoksa veya iki prompt da boşsa düğme hiç görünmüyor (Bulgu 8). |
| 17 | Sistem promptu textarea | KISMİ | `page.tsx:393-401` | Uzunluk sınırı, karakter sayacı, diff yok; `<label>` `htmlFor` ile bağlı değil. |
| 18 | Sohbet promptu textarea | KISMİ | `page.tsx:402-410` | Aynı. Bu metin müşteri sohbeti dahil `askAI` taban promptunu tamamen değiştiriyor (Bulgu 1). |
| 19 | Prompt kaydet | KISMİ | `page.tsx:123-148`; `system/route.ts:66-89`; `lib/ai-learning.ts:845-860` | Boş alan `null` yazar; zod yok; audit log yok; sonraki eğitimde eziliyor (Bulgu 4). |
| 20 | Prompt iptal | ÇALIŞIYOR | `page.tsx:385-387` | Kirli-durum (unsaved changes) uyarısı yok. |
| 21 | Sistem promptunu göster/gizle | ÇALIŞIYOR | `page.tsx:414-437` | `aria-expanded` yok. |
| 22 | Sohbet promptunu göster/gizle | ÇALIŞIYOR | `page.tsx:438-461` | `aria-expanded` yok. |
| 23 | "Öğrenilen Profil Özeti" | KISMİ | `page.tsx:466-476` | Ham `JSON.stringify` dökümü; okunabilir kural/tema/varlık görünümü yok. |
| 24 | "Nasıl çalışır?" akordeonu | KISMİ | `page.tsx:482-510` | İçerik yanlış: sistem profilinin geri bildirim analizinde kullanıldığını söylüyor (`:502`), oysa yalnız `generateInsightReport` ve `askAI` kullanıyor (`lib/ai-engine.ts:657,877`). Bayi profilinin otomatik yenilendiğinden (`lib/inngest/feedback-analyze-pipeline.ts:135`) söz etmiyor. |
| 25 | Özet kartları (Toplam Dealer, Eğitilmiş Profil, Embedding, Düzeltme) | KISMİ | `page.tsx:513-535` | Hero ile birebir kopya; "Toplam Dealer" en fazla 50. |
| 26 | Bayi listesinin yüklenmesi | KISMİ | `page.tsx:156-193`; `app/api/admin/users/route.ts:164-168` | `pageSize=100` alınıp `slice(0,50)`; `createdAt desc` olduğundan yalnız en yeni 50 bayi; her biri için seri istek (Bulgu 5). |
| 27 | Filtre: Tümü / Profil var / Profil yok | ÇALIŞIYOR | `page.tsx:243-247,549-560` | İstemci tarafı, yalnız yüklenen 50 üzerinde; `aria-pressed` yok. |
| 28 | Arama | EKSİK | — | Bayi adına göre arama yok. |
| 29 | Sıralama | EKSİK | — | Son eğitim, düzeltme sayısı, "yeniden eğitim gerekli" gibi sıralamalar yok. |
| 30 | Sayfalama / tüm bayileri kapsama | EKSİK | `page.tsx:164` | 50'den sonrası hiç görünmüyor. |
| 31 | Toplu güncelle | KISMİ | `page.tsx:217-241,561-569` | İlk profil adaylarını (profil yok + embedding yok) dışlıyor; seri, ilerleme/iptal yok; satır spinner'ları güncellenmiyor; sekme kapanırsa yarıda kalıyor. |
| 32 | Satır başına "profili yenile" | KISMİ | `page.tsx:195-215,611-622`; `lib/ai-learning.ts:293-386` | Çalışıyor; ama veri yoksa da profil üretiyor (min-veri koruması yok), ikon-buton etiketsiz, sonrasında 50 bayi yeniden çekiliyor. |
| 33 | Satır genişletme detayı | KISMİ | `page.tsx:576-583,627` | Yalnız profili olan bayide açılıyor; profilsiz bayi seçilince yalnız vurgulanıyor, hiçbir şey göstermiyor; klavyeyle açılamıyor. |
| 34 | Detay: sürüm / eğitim geri bildirimi / düzeltme / son eğitim | ÇALIŞIYOR | `page.tsx:629-650` | |
| 35 | Detay: iş bağlamı, temalar, kurallar, varlıklar | ÇALIŞIYOR | `page.tsx:651-692` | Şemadaki `riskSignals` (`lib/ai-learning.ts:333`) hiç gösterilmiyor; öncelik bilgisi kayboluyor. |
| 36 | "Hazır" durum rozeti | ÇALIŞIYOR | `page.tsx:605-607` | |
| 37 | "Eğitiliyor" durum rozeti | SAHTE (ölü kod) | `page.tsx:608-610`; `lib/ai-learning.ts:371,380` | `status: 'training'` hiçbir yerde yazılmıyor; rozet asla görünmez. |
| 38 | Yeniden eğitim önerisi | EKSİK (API'de var) | `app/api/ai/learning/route.ts:49,57`; `lib/ai-learning.ts:393-445` | Her bayi için `retrainSuggestion` hesaplanıp dönüyor ama UI kullanmıyor. |
| 39 | Düzeltme kayıtları listesi | EKSİK (API'de var) | `app/api/ai/learning/route.ts:33-47,56` | 20 düzeltme + geri bildirim metni her bayi için tarayıcıya iniyor ama gösterilmiyor. |
| 40 | Boş liste durumu | EKSİK | `page.tsx:574-698` | 0 bayi veya filtre sonucu boşsa kart boş kalıyor. |
| 41 | Mobil düzen | KISMİ | `page.tsx:548-570,584-623` | Filtre grubu + toplu güncelle `flex` sarmıyor; satırda ad + rozetler + buton tek satırda (doğrulanmadı: tarayıcıda ölçülmedi). |
| 42 | Azaltılmış hareket | ÇALIŞIYOR | `components/providers.tsx:232`; `components/admin/admin-premium-hero.tsx:9,35` | Global `MotionConfig reducedMotion="user"`. |
| 43 | Klavye erişimi (satırlar) | BOZUK | `page.tsx:576-583` | `Motion.div onClick` — `role`, `tabIndex`, `onKeyDown` yok. |
| 44 | Prompt sürüm geçmişi / geri alma | EKSİK | `prisma/schema.prisma:2412-2425` | Tek satır; önceki prompt geri getirilemez. |
| 45 | Denetim kaydı (kim, ne zaman, neyi değiştirdi) | EKSİK | `system/route.ts:66-89` | Diğer admin uçları `auditLog` yazıyor (ör. `app/api/admin/api-keys/route.ts`); bu uç yazmıyor. |
| 46 | Prompt önizleme / test alanı | EKSİK | — | Kaydetmeden önce örnek soruyla deneme yok. |
| 47 | Maliyet / token izleme | EKSİK | `lib/ai-learning.ts:718-784` | Eğitim çağrıları `aIUsageLog`'a yazılmıyor; maliyet görünmüyor. |

**Durum özeti:** ÇALIŞIYOR 13 · KISMİ 21 · BOZUK 2 · SAHTE 1 · EKSİK 10 (toplam 47)

---

## Bulgular

### 1. Sohbet promptu düzenlemesi müşteri dahil tüm AI sohbetlerinin taban promptunu korumasız biçimde değiştiriyor
- **Önem:** Yüksek · **Kategori:** güvenlik / yönetişim · **Efor:** M
- **Kanıt:** `lib/ai-engine.ts:878-880` (`chatSystemPrompt` varsa `useChatPrompt = true`), `:903` (`basePrompt = useChatPrompt ? systemLearningBlock : CHAT_SYSTEM_PROMPT_BASE`), `:836-849` (taban promptta "Kişisel veri üretme", "Hassas konularda özet kullan" korumaları); `askAI` tüketicileri `app/api/customer/ai-chat/route.ts:147`, `app/api/customer/ai-recommendations/route.ts:135`, `app/api/dealer/ai-chat/route.ts:150`, `app/api/ai/analyze/route.ts:752`; düzenleme ucu `app/api/admin/ai-learning/system/route.ts:71-79` (zod yok, tür/uzunluk kontrolü yok); sohbet yolunda kırpma yok (`ai-engine.ts:880`).
- **Sorun:** Bu sayfadaki "Sohbet promptu" alanı bir ek değil, **taban promptun yerine geçen** metin. Kaydedildiği an müşteri sohbeti ve öneri motoru dahil her `askAI` çağrısında kullanılıyor; kişisel veri ve hassas içerik korumaları bu metinde yoksa devre dışı kalıyor. Taban prompt "İşletme sahiplerinin…" diye yazılmışken aynı metin müşteri rolüne de gidiyor. Uzunluk sınırı olmadığı için çok uzun bir metin her sohbet çağrısının token maliyetini katlıyor. Denetim kaydı, sürüm, önizleme ve geri alma yok; gizli kapı da API katmanında zorlanmadığı için ADMIN rolüne sahip herhangi bir oturum doğrudan PATCH atabiliyor.
- **Öneri:** Promptu "değiştirilebilir taban" olmaktan çıkarıp **katmanlı birleştirme** modeline geçin: değiştirilemeyen güvenlik/gizlilik çekirdeği (kodda) + yönetilebilir "davranış eki" (DB'de) + rol bazlı bölüm (dealer/customer ayrı). Prompt kayıtlarını `AIPromptVersion { id, key, body, createdBy, createdAt, note, status: draft|active|archived }` gibi sürümlü bir tabloya taşıyın; PATCH yerine "taslak oluştur → önizle → yayımla" akışı, yayımlamada `auditLog` kaydı ve tek tıkla önceki sürüme dönüş. Sunucuda zod ile `max(4000)` vb. sınır, istemcide karakter/token sayacı. Yayımlamadan önce aynı sayfada örnek soruyla A/B önizleme (eski vs yeni yanıt yan yana). İsteğe bağlı: yayımlama için ikinci admin onayı (Linear/Stripe'taki kritik ayar deseni).

### 2. Sistem eğitimi tüm kiracıların verisini tek paylaşılan prompta karıştırıyor (kiracılar arası sızıntı + harici LLM'e kişisel veri)
- **Önem:** Yüksek · **Kategori:** güvenlik / veri gizliliği · **Efor:** L
- **Kanıt:** `lib/ai-learning.ts:583-591` (tüm bayilerin işletme adları, 500 ürün adı), `:618-622` (200 geri bildirim metni örneği), `:627-630` (diğer bayilerin `customPrompt`'ları), `:686-701` (hepsi `contextBlob`'a), `:718-746` (harici LLM'e gönderim), `:779` (sohbet promptu üretimine `learnedRules` + veri özeti), `:793-797` (`entityAliases`, `learnedRules` profile yazılıyor); tüketim `lib/ai-engine.ts:880-893` (bu kurallar/temalar/sohbet promptu her bayinin ve müşterinin sohbetine giriyor).
- **Sorun:** Model, A bayisinin ürün/işletme adlarını, şikayet metinlerini veya özel promptunu `learnedRules` / `entityAliases` / `chatSystemPrompt` içine taşıyabilir; bu çıktı daha sonra B bayisinin ve müşterilerin sohbet bağlamına konuyor. Ayrıca serbest metin geri bildirimler (ad, telefon, e-posta içerebilir) maskelenmeden harici sağlayıcıya (Groq/OpenAI) gönderiliyor; KVKK açısından açık rıza/aktarım dayanağı belirsiz. *Üretimdeki mevcut profil çıktısında gerçekten bayi adı geçip geçmediği doğrulanmadı (canlı DB okunmadı); risk, veri akışından kesin olarak çıkıyor.*
- **Öneri:** Sistem profili yalnızca **anonimleştirilmiş, toplulaştırılmış** sinyallerle eğitilmeli: işletme/ürün adları ve diğer bayilerin özel promptları sistem eğitiminden tamamen çıkarılmalı (bunlar zaten bayi profiline ait). Örnek metinler PII maskelemeden geçirilmeli (mevcut moderasyon/PII yardımcıları varsa ona bağlanmalı). Eğitim çıktısı yayımlanmadan önce "bayi adı / ürün adı içeriyor mu" otomatik denetiminden geçmeli ve UI'da işaretlenmeli. Sayfaya "Eğitim verisi kapsamı" paneli eklenip hangi alanların harici LLM'e gittiği açıkça gösterilmeli.

### 3. Eğitilen sistem promptunun öğrenilmiş kısmı analiz/rapor yoluna hiç ulaşmıyor
- **Önem:** Yüksek · **Kategori:** doğruluk · **Efor:** S
- **Kanıt:** `lib/ai-learning.ts:704-716` (sabit taban metin ≈908 karakter), `:759` (`systemPrompt = taban + "\n\n" + öğrenilen ek`); `lib/ai-engine.ts:659` (`systemPrompt.slice(0, 800)`), `:897` (`slice(0, 600)`).
- **Sorun:** Taban metin tek başına 800 karakterden uzun olduğu için `generateInsightReport` yoluna yalnızca **sabit taban metnin ilk 800 karakteri** gidiyor; eğitimin ürettiği `systemPromptAppendix` her zaman kırpılıyor. Yani "Sistem Profilini Eğit" düğmesinin analiz/rapor tarafındaki etkisi fiilen sıfır; sayfa ise "Sistem promptu (analiz/rapor için)" diyerek (`page.tsx:394`) etkili olduğunu ima ediyor. Ayrıca yardım metni sistem profilinin geri bildirim analizinde kullanıldığını söylüyor (`page.tsx:502`) — `app/api/feedbacks/route.ts:456-457` ve `lib/inngest/feedback-analyze-pipeline.ts:42-43` yalnız bayi profilini kullanıyor.
- **Öneri:** Taban metni prompt'tan ayırın: DB'de yalnız "öğrenilmiş ek" tutulsun, taban kodda kalsın; tüketici tarafı `taban + ek(≤N karakter)` birleştirsin. Sayfada her promptun **nerede kullanıldığını** (tüketici uç listesi + son 24 saatte kaç çağrıda kullanıldığı) gösteren bir "Etki alanı" satırı ekleyin. Yardım metnini gerçek veri akışına göre düzeltin.

### 4. Yeniden eğitim, elle yapılan prompt düzenlemelerini sessizce eziyor
- **Önem:** Yüksek · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `lib/ai-learning.ts:759,814-828` (`systemPrompt: fullSystemPrompt` her eğitimde yazılıyor; `chatSystemPrompt` üretim başarılıysa yazılıyor), `page.tsx:105` (onay metninde bu uyarı yok), `prisma/schema.prisma:2412-2425` (geçmiş tutulmuyor).
- **Sorun:** Admin sohbet promptunu özenle düzenledikten sonra (kendisi ya da başka bir admin) "Sistem Profilini Eğit"e bastığında düzenleme geri dönüşsüz kayboluyor. Ters durumda, sohbet promptu üretimi başarısız olursa (`:789-791`) eski sohbet promptu yeni sistem promptuyla tutarsız biçimde kalıyor.
- **Öneri:** Prompt alanlarına "kilitli (manuel)" / "otomatik" modu ekleyin; eğitim yalnız "otomatik" moddaki alanları güncellesin, kilitli alanlar için yeni öneriyi **taslak** olarak kaydedip diff ile admin onayına sunsun. Bulgu 1'deki sürüm tablosu bu akışın zemini. Onay penceresi hangi alanların değişeceğini açıkça listelesin.

### 5. Bayi listesi istemcide N+1 seri istekle kuruluyor ve yalnız en yeni 50 bayiyi kapsıyor
- **Önem:** Yüksek · **Kategori:** performans / doğruluk · **Efor:** M
- **Kanıt:** `page.tsx:159-186` (önce `pageSize=100` bayi, sonra `slice(0,50)` ve her biri için `await fetch(...)` sırayla), `app/api/admin/users/route.ts:164-168` (`orderBy: createdAt desc`), `app/api/ai/learning/route.ts:22,30-49` (istek başına oturum + 4 sorgu + `getLearningRetrainSuggestion` içinde 3 sorgu = ≈7 sorgu), `page.tsx:206,240` (tek bir bayi güncellendikten sonra 50 isteğin tamamı yeniden).
- **Sorun:** Açılışta 1 + 50 seri HTTP çağrısı ve ≈350 DB sorgusu; sayfa bunlar bitene kadar tamamen iskelette. Eski (genellikle en çok veriye sahip) bayiler hiç görünmüyor ve toplamlar sessizce eksik. Her istek kullanılmayan 20 düzeltme kaydını geri bildirim metniyle birlikte tarayıcıya taşıyor.
- **Öneri:** Tek bir admin ucu: `GET /api/admin/ai-learning/dealers?cursor&search&sort&filter=needs_retrain|no_profile|with_profile`. Sunucuda `user` + `aIDealerLearningProfile` LEFT JOIN, embedding/düzeltme sayıları `groupBy({ by: ['dealerId'] })` ile tek sorguda; "yeniden eğitim gerekli" bayrağı `lastTrainedAt` sonrası yeni geri bildirim sayısıyla tek bir toplulaştırılmış sorgudan. İstemcide sunucu sayfalamalı tablo (TanStack Table + SWR); tek bayi güncellemesinden sonra yalnız o satırı `mutate` ile güncelleyin. Detay (düzeltmeler, profil) satır açıldığında ayrıca çekilsin.

### 6. Sistem eğitimi senkron, kilitsiz ve tüm `Feedback` tablosunu üç kez belleğe çekiyor
- **Önem:** Orta · **Kategori:** mimari / güvenilirlik · **Efor:** M
- **Kanıt:** `lib/ai-learning.ts:479-481` (varsayılan sınır 0 = sınırsız), `:500-517` (tüm metinli geri bildirimler), `:552-582` (topics ve themes için iki ayrı tam tarama), `:718-784` (2 LLM çağrısı × `withRetry` 3 deneme, zaman aşımı yok), `:811-833` (oku-sonra-yaz sürüm artırımı, kilit yok); `app/api/admin/ai-learning/system/route.ts` (`maxDuration` yok); `page.tsx:104` (yalnız yerel sekme koruması).
- **Sorun:** Veri büyüdükçe sunucusuz fonksiyon bellek/süre sınırına çarpar; istek zaman aşımına uğrarsa kullanıcı "Eğitim başarısız" görür ama işin durumu bilinmez. İki admin aynı anda tetiklerse iki pahalı eğitim koşar ve aynı sürüm numarası yazılabilir. `status` hiç `training` olmadığı için başka admin eğitimin sürdüğünü göremez. Eğitim çağrıları `aIUsageLog`'a yazılmadığından maliyet görünmez.
- **Öneri:** Projede zaten var olan Inngest'e (`lib/inngest/`) taşıyın: POST yalnız `status='training'` yapıp (koşullu `updateMany where status != 'training'` ile atomik kilit) iş kuyruğa atsın ve `jobId` dönsün; UI durum/ilerlemeyi yoklasın veya SSE ile izlesin. Topics/themes toplulaştırmasını Postgres tarafında (`jsonb_array_elements` ile `GROUP BY`) yapın; örnek metinleri `TABLESAMPLE`/rastgele `LIMIT` ile alın. Her eğitim için süre, token ve maliyeti kaydedip sayfada gösterin.

### 7. Aynı metrikler üç yerde ve birbiriyle çelişen değerlerle gösteriliyor
- **Önem:** Orta · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:** Hero `page.tsx:290-301` ve özet kartları `page.tsx:513-535` (≤50 bayinin toplamı), sistem kartı `page.tsx:322-337` (platform toplamı, `system/route.ts:22-27`).
- **Sorun:** Aynı ekranda "Embedding 1.240" ve "Embedding 860" gibi iki farklı sayı görülebilir; "Toplam Dealer" kartı en fazla 50, sistem kartındaki "Dealer" ise gerçek toplam. Operatör hangi sayıya güveneceğini bilemez.
- **Öneri:** Tek bir KPI şeridi: Toplam bayi · Profili olan (%) · Yeniden eğitim bekleyen · Son 7 günde düzeltme · Embedding kapsamı (% geri bildirim). Hepsi sunucudan, platform geneli; hero'daki yan kutular kaldırılsın veya bu şeridin özeti olsun.

### 8. Boş kaydedilen prompt silinir ve düzenleme düğmesi kaybolur
- **Önem:** Orta · **Kategori:** hata · **Efor:** S
- **Kanıt:** `page.tsx:131-132` (`editSystemPrompt || null`), `page.tsx:368` (düzenleme bloğu yalnız iki prompttan biri doluysa ya da düzenleme modundaysa görünür).
- **Sorun:** İki alan da boş kaydedilirse ikisi de `null` olur, `editPrompts=false` olur ve bölüm koşulu sağlanmadığı için "Düzenle" düğmesi tamamen kaybolur; tek geri dönüş yolu yeniden eğitimdir (o da Bulgu 4 nedeniyle istenmeyen metin üretir). Hiç eğitim yapılmamışsa da düzenleme imkânı yok (PATCH 404, `lib/ai-learning.ts:849-850`).
- **Öneri:** Düzenleme alanını her zaman görünür kılın; "boş = varsayılana dön" davranışını açık bir "Varsayılana sıfırla" eylemiyle ayırın; profil yoksa PATCH'in satırı oluşturmasına izin verin (upsert).

### 9. Bayi profili üretiminde veri eşiği, hata geri dönüşü ve kötüye kullanım sınırı yok
- **Önem:** Orta · **Kategori:** doğruluk / güvenlik · **Efor:** S
- **Kanıt:** `lib/ai-learning.ts:293-361` (0 geri bildirimde de LLM çağrılıyor), `:320-351` (`withRetry` hata fırlatırsa `buildFallbackProfile`'a düşülmüyor, uç 500 döner), `:355` (`JSON.parse` try'sız), `:363-385` (oku-sonra-upsert sürüm yarışı); `app/api/ai/learning/route.ts:103-108` (rate limit yok; DEALER ve STAFF sınırsız tetikleyebilir); `page.tsx:218` (toplu güncelle ilk profil adaylarını dışlıyor).
- **Sorun:** Verisi olmayan bayi için tek tıkla halüsinasyon içeren bir "v1" profil oluşur ve bu profil sonraki geri bildirim analizlerine bağlam olarak girer (`app/api/feedbacks/route.ts:456-457`). Bir bayi oturumu `update_profile`'ı döngüyle çağırarak LLM maliyeti üretebilir. Toplu güncelleme ise asıl ihtiyaç olan "verisi var ama profili yok" bayileri, embedding yoksa atlıyor.
- **Öneri:** Sunucuda `getLearningRetrainSuggestion` sonucuna dayalı eşik (ilk profil için ≥20 metinli geri bildirim) — yoksa 422 ve UI'da "Yetersiz veri (7/20)" durumu. LLM hatasında yedek profile düşün; JSON'u zod ile doğrulayın. `lib/rate-limit.ts` ile bayi başına saatlik sınır. Toplu güncelleme adaylarını sunucu tarafında "yeniden eğitim önerilen" listesinden seçin.

### 10. Hata yönetimi yanıltıcı ve kısmi
- **Önem:** Orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:92-100` (hata yutuluyor), `:359,364-366` (yanıltıcı "En az 3 geri bildirim"), `:166-183` (`res.ok` yok, tekil hata sıfır olarak gösteriliyor), `:233` (toplu güncellemede `res.json()` 500 HTML'de patlarsa sessizce atlanıyor), `system/route.ts:45-63` (3 geri bildirim koşulu sunucuda yok).
- **Öneri:** Her bölüm için ayrı yükleniyor/hata/boş durumu (SWR `error` + "Tekrar dene"); tekil satır hatası satırda "Yüklenemedi" rozeti; sunucu eşikleri zorlasın ve istemci sunucunun döndürdüğü nedeni göstersin.

### 11. API'nin hesapladığı "yeniden eğitim önerisi" ve düzeltme listesi kullanılmıyor
- **Önem:** Düşük · **Kategori:** kaçırılmış değer / veri minimizasyonu · **Efor:** S
- **Kanıt:** `app/api/ai/learning/route.ts:33-49,55-57`; `page.tsx:168-174` (yalnız `profile`, `embeddingsCount`, `correctionsCount` alınıyor).
- **Sorun:** Operatörün en çok ihtiyaç duyacağı sinyal ("bu bayi 34 yeni geri bildirim aldı, profil güncellenmeli") zaten hesaplanıyor ama gösterilmiyor; buna karşılık 50 × 20 düzeltme kaydı geri bildirim metniyle tarayıcıya gereksiz yere iniyor.
- **Öneri:** Listeye "Yeniden eğitim gerekli" rozeti ve filtresi; satır detayında son düzeltmeler (alan, eski → yeni, not, tarih) zaman çizelgesi. Liste ucu düzeltme metinlerini döndürmesin.

### 12. Ölü "Eğitiliyor" rozeti ve görünmeyen `riskSignals`
- **Önem:** Düşük · **Kategori:** ölü kod · **Efor:** S
- **Kanıt:** `page.tsx:608-610`; `lib/ai-learning.ts:369-371,378-380` (yalnız `ready` yazılıyor); `lib/ai-learning.ts:333` (`riskSignals` şemada), `page.tsx:653-691` (gösterilmiyor).
- **Öneri:** Bulgu 6'daki durum makinesiyle `training/failed` gerçek durumlar olsun; `riskSignals` detayda "Risk kalıpları" bölümü olarak gösterilsin.

### 13. Erişilebilirlik eksikleri
- **Önem:** Düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:576-583` (tıklanabilir `div`), `:611-622` (yalnız ikonlu buton, `aria-label` yok), `:485-495,416-423,440-447` (`aria-expanded` yok), `:551-559` (`aria-pressed` yok), `:394,403` (`label` ↔ `textarea` bağı yok), `:587,596,599` (dekoratif ikonlar `aria-hidden` değil).
- **Öneri:** Satırları shadcn `Collapsible`/`Accordion` ile `button` tetikleyiciye çevirin; filtreyi `ToggleGroup` (Radix) ile; ikon-butonlara "X profilini yenile" etiketi; `Label htmlFor`.

### 14. Dil ve terminoloji tutarsızlığı, geliştirici görünümlü çıktı
- **Önem:** Düşük · **Kategori:** UX / içerik · **Efor:** S
- **Kanıt:** "Dealer" (`:331,515,544`), "işletme" (`:223`), "Bayi" (`:504`); "Eğitim Feedback" (`:635`); ham JSON (`:472-474`); `lib/admin-toast.ts:17` ("Basarili: " — Türkçe karakter eksik, platform geneli).
- **Öneri:** Panel genelinde tek terim ("Bayi"); "Embedding" için "Anlamsal vektör" alt açıklaması; ham JSON yerine yapılandırılmış görünüm, JSON yalnız "Ham veriyi göster" ikincil eyleminde.

### 15. Liste giriş animasyonu sınırsız gecikme biriktiriyor
- **Önem:** Düşük · **Kategori:** motion · **Efor:** S
- **Kanıt:** `page.tsx:580` (`delay: 0.25 + index * 0.03`; 50. satır ≈1,75 sn), özet kartlarında ise sınır var (`:522`).
- **Öneri:** Gecikmeyi ilk 8 satırla sınırlayın veya liste girişini tek bir opaklık geçişine indirin; veri tablosunda kademeli giriş operatör için gecikme hissi yaratır.

---

## Eksik özellikler (kıyas ürünlerle)

- **Prompt yönetimi (PostHog/LangSmith/Humanloop deseni):** sürümlü prompt kayıtları, diff görünümü, taslak → yayımla akışı, tek tıkla geri alma, kimin değiştirdiğine dair denetim kaydı.
- **Prompt oyun alanı / değerlendirme:** kaydetmeden önce örnek soru(lar)la eski ve yeni promptu yan yana koşturma; `/admin/ai-quality`'deki puanlanmış örnekler üzerinde regresyon değerlendirmesi.
- **Arka plan işleri ve ilerleme (Stripe/Retool deseni):** eğitim ve toplu güncelleme için iş kuyruğu, ilerleme çubuğu, iptal, iş geçmişi (süre, token, maliyet, sonuç).
- **Sunucu sayfalamalı bayi tablosu:** arama, sıralama, "yeniden eğitim gerekli" / "yetersiz veri" / "hata" filtreleri, CSV dışa aktarma.
- **Profil sürüm geçmişi ve diff:** bayi profilinin v3 → v4 arasında hangi tema/kuralın değiştiği.
- **Zamanlanmış eğitim ve otomasyon görünürlüğü:** sistem profili için haftalık zamanlama; bayi profillerinin otomatik yenilendiğini (`maybeTriggerAdaptiveUpdate`) ve son otomatik tetiklemeyi gösteren durum satırı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya beş saniyede yanıt alır: (1) AI'ın şu an hangi talimatlarla çalıştığı ve bunun nereye uygulandığı, (2) hangi bayilerin öğrenme profilinin eskidiği veya eksik olduğu, (3) son eğitimlerin ne ürettiği ve neye mal olduğu. Riskli değişiklikler (prompt yayımlama) bilinçli, geri alınabilir ve kayıtlı bir akıştan geçer.

**Yerleşim (sekmeli, tek sayfa):**
1. **Genel bakış:** KPI şeridi (toplam bayi, profil kapsamı %, yeniden eğitim bekleyen, 7 günlük düzeltme, embedding kapsamı %), son eğitim işinin kartı (durum, süre, token/maliyet, sürüm), "Yeniden eğitim bekleyen ilk 5 bayi" kısa listesi.
2. **Promptlar:** Sol tarafta prompt anahtarları (Analiz eki, Sohbet eki — bayi, Sohbet eki — müşteri), her biri için "Etki alanı" (hangi uçlar kullanıyor). Sağda editör: aktif sürüm, taslak, diff görünümü, karakter/token sayacı, "Önizle" paneli (örnek soru → eski vs yeni yanıt), "Yayımla" (onay + not zorunlu) ve sürüm geçmişi listesi (geri al).
3. **Bayi profilleri:** Sunucu sayfalamalı tablo (ad, profil sürümü, son eğitim, yeni geri bildirim/düzeltme, öneri rozeti, durum). Satır tıklanınca sağdan açılan `Sheet`: yapılandırılmış profil (bağlam, temalar öncelikli, varlıklar, risk kalıpları, yap/kaçın), sürüm diff'i, son düzeltmeler zaman çizelgesi, "Profili yenile" (eşik altında devre dışı ve gerekçeli).
4. **İşler:** Eğitim ve toplu güncelleme iş geçmişi (başlatan, süre, sonuç, hata).

**Motion / 3D:** Bu bir operasyon aracı; 3B veya dekoratif animasyon gerekmiyor. Ölçülü öneriler: iş durumu değiştiğinde KPI sayısında kısa bir sayı geçişi; satır güncellendiğinde 600 ms'lik arka plan vurgusu (değişikliği işaretlemek için); Sheet açılışı için standart kaydırma. Liste kademeli girişi kaldırılmalı. Global `reducedMotion="user"` zaten bunları kapsıyor.

**Veri / API değişiklikleri:**
- `GET /api/admin/ai-learning/overview` — KPI'lar + son iş (Redis'te 60 sn önbellek).
- `GET /api/admin/ai-learning/dealers?cursor&search&sort&filter` — JOIN + `groupBy` ile tek sorgu, yeniden eğitim bayrağı sunucuda.
- `GET /api/admin/ai-learning/dealers/[id]` — profil, sürüm geçmişi, son düzeltmeler.
- `POST /api/admin/ai-learning/jobs` `{ kind: 'system' | 'dealer' | 'bulk', dealerIds? }` → Inngest işi, atomik `status='training'` kilidi, `jobId` döner; `GET /jobs/[id]` ilerleme.
- Yeni modeller: `AIPromptVersion` (anahtar, gövde, durum, oluşturan, not), `AILearningJob` (tür, durum, ilerleme, token, maliyet, hata), isteğe bağlı `AIDealerLearningProfileVersion`.
- `lib/ai-engine.ts`: taban + aktif ek birleştirme; güvenlik çekirdeği değiştirilemez; ek için karakter sınırı; aktif prompt Redis'te önbellekli (her `askAI` çağrısında DB sorgusu yerine).
- Sistem eğitiminden işletme/ürün adları ve diğer bayilerin özel promptları çıkarılmalı; örnek metinler PII maskelemeden geçmeli; tüm eğitim çağrıları `aIUsageLog`'a yazılmalı; tüm yazma uçları `auditLog` kaydı oluşturmalı.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ai-settings`** — bayi bazlı `customPrompt` düzenliyor (`app/admin/ai-settings/page.tsx:328-340`); bu sayfa ise sistem geneli promptları. İki prompt yüzeyi ayrı sayfalarda ve birbirinin varlığından habersiz. Prompt yönetimi tek bir "Promptlar" sekmesinde birleşmeli (sistem eki + bayi özel eki, aynı sürümleme altyapısıyla).
- **`/admin/ai-dashboard`** ve **`/admin/ai-detailed`** — her ikisi de bayi bazlı AI istatistikleri ve sistem geneli AI metrikleri gösteriyor; bu sayfanın KPI'ları ve bayi tablosu aynı veri ailesinden. Önceki denetimin (`admin_ai-dashboard.md`) önerdiği tek "AI Operasyon Merkezi" altında bu sayfa **"Öğrenme"** ve **"Promptlar"** sekmeleri olmalı.
- **`/admin/ai-quality`** — puanlanmış örnekler, prompt değişikliklerinin regresyon testi için doğal veri kaynağı; Promptlar sekmesindeki önizleme/değerlendirme buna bağlanmalı.
- **İlgili kırık bağlantı (bu sayfanın kapsamı dışında, aynı modül):** bayi tarafındaki `app/dealer/ai-settings/page.tsx:542` `/dealer/ai-learning`'e bağlanıyor, ancak `app/dealer/ai-learning` dizini yok → 404. Bayinin kendi öğrenme profilini göreceği yüz eksik; `/api/ai/learning` GET bayi için zaten hazır.
- **Karar:** Sayfa kaldırılmamalı; yetenek gerçek ve ürünün AI kalitesini doğrudan etkiliyor. Ancak mevcut haliyle ayrı bir menü öğesi olarak yaşamak yerine AI Operasyon Merkezi'nin sekmesine dönüştürülerek yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: İddialar salt okuma ile yeniden incelendi (`lib/ai-engine.ts`, `lib/ai-learning.ts`, `app/api/admin/ai-learning/system/route.ts`, `app/api/customer/ai-chat/route.ts`, `app/api/customer/ai-recommendations/route.ts`, `app/api/dealer/ai-chat/route.ts` çağrı listesi, `proxy.ts`, `prisma/schema.prisma`, `app/admin/ai-learning/page.tsx`). Veritabanına ve canlı profile bakılmadı; canlıdaki prompt içeriği **doğrulanmadı**.

### 1. Admin sohbet promptu tüm `askAI` taban promptunu değiştiriyor — **DOĞRULANDI** (önem: orta-yüksek, iddia kısmen abartılı)
- `lib/ai-engine.ts:878-880`: `chatSystemPrompt` doluysa `useChatPrompt=true`; `:903` `basePrompt = useChatPrompt ? systemLearningBlock : CHAT_SYSTEM_PROMPT_BASE`; `:928-929` tam içerik kırpılmadan sisteme giriyor. `CHAT_SYSTEM_PROMPT_BASE` içindeki gizlilik kuralları (`:848-849`, madde 4-5) bu durumda modele hiç gitmiyor.
- Etki alanı gerçek: `askAI` müşteri sohbeti (`app/api/customer/ai-chat/route.ts:147`), müşteri önerileri (`app/api/customer/ai-recommendations/route.ts:135`) ve bayi sohbeti (`app/api/dealer/ai-chat/route.ts`) tarafından çağrılıyor.
- **Asıl somut senaryo admin düzenlemesi değil, normal eğitim:** `updateSystemLearningProfile` sohbet promptunu LLM'e yazdırıyor (`lib/ai-learning.ts:762-790`) ve üretim talimatı gizlilik/hassas içerik kuralı istemiyor. Yani tek bir başarılı "Sistem Profilini Eğit" tıklamasından sonra tüm müşteri/bayi sohbetlerinin gizlilik korkulukları LLM'in o anki çıktısına bağlı hale geliyor. Yeniden üretim: Eğitimi çalıştır → `chatSystemPrompt` dolar → müşteri `/api/customer/ai-chat` ile soru sorar → sistem mesajında madde 4-5 yoktur.
- Abartılı kısımlar: PATCH ucu `requireAuth(['ADMIN'])` ile korunuyor (`route.ts:66-67`); gizli kapı çerezinin API'de zorlanmaması (`proxy.ts:104-117` `/api/` yollarını doğrudan geçiriyor) ADMIN rolü olmayan birine yol açmıyor; bu genel mimari bir derinlemesine-savunma eksiği, bu sayfaya özgü değil. Zod/uzunluk sınırı/audit log eksikliği yalnız güvenilir admin hatası/hesap ele geçirme senaryosunda önem kazanır.
- Öneri: Güvenlik çekirdeği (`CHAT_SYSTEM_PROMPT_BASE` gizlilik + injection kuralları) her koşulda sabit önek olarak kalmalı; öğrenilmiş/manuel metin yalnızca karakter sınırlı bir **ek** olarak birleştirilmeli. PATCH'e zod şeması, uzunluk sınırı ve `auditLog` kaydı eklenmeli.

### 2. Sistem eğitimi kiracılar arası veriyi paylaşılan prompta karıştırıyor — **BELİRSİZ** (veri akışı kesin, sızıntı LLM çıktısına bağlı)
- Kesin olan: `aggregateSystemTrainingData` tüm bayilerin `businessName`'lerini (`lib/ai-learning.ts:583-588`), ürün adlarını (`:589-591`), maskelenmemiş 180 karakterlik geri bildirim örneklerini (`:618-622`) ve diğer bayilerin `customPrompt`'larını (`:627-630`, `:701`) tek bir LLM çağrısına veriyor (`:686-701`). Çıktı tek bir global profile yazılıyor ve `askAI` üzerinden her kiracının sohbet bağlamına giriyor (`lib/ai-engine.ts:878-893`). LLM'e giden metinlerde PII maskeleme yok (`lib/pii-redact.ts` yalnızca `lib/auth-events.ts` tarafından kullanılıyor).
- Kesin olmayan: Bir kiracıya ait adın/metnin gerçekten başka kiracının sohbetine yansıması LLM'in `learnedRules`/`chatSystemPrompt` içine bunu yazıp yazmamasına bağlı; canlı profil incelenmedi. Ayrıca `entityAliases` `askAI` tarafından **tüketilmiyor** (`lib/ai-engine.ts:882-893` yalnızca `learnedRules`, `responseGuidelines`, `learnedThemes` okuyor) — bu kısım iddiada fazla. "PII harici LLM'e gidiyor" tespiti doğru ama bu yola özgü değil: platform her geri bildirim analizinde metni zaten Groq/OpenAI'ye gönderiyor (`lib/ai-learning.ts:26-41`).
- En somut risk senaryosu (doğrulanmadı, mantıksal): Bayi A kendi `customPrompt`'una "Yanıtlarda X Kafe'yi öner" yazar → sistem eğitimi bunu "işletme özel promptu" olarak okur → `learnedRules`'a girerse tüm kiracıların müşterilerine yansır. Bu, kiracılar arası prompt-injection kanalıdır.
- Öneri: Sistem eğitimi girdisinden işletme/ürün adları ve diğer bayilerin `customPrompt`'ları çıkarılmalı (bunlar zaten bayi profiline ait); örnek metinler e-posta/telefon/isim maskelemeden geçmeli; çıktı kaydedilmeden önce bilinen işletme adlarına karşı tarama yapılmalı.

### 3. Öğrenilmiş ek analiz yoluna ulaşmıyor — **DOĞRULANDI**
- `WORLD_CLASS_SYSTEM_PROMPT_BASE` uzunluğu ölçüldü: **920 karakter** (`lib/ai-learning.ts:704-716`). `fullSystemPrompt = base + "\n\n" + appendix` (`:759`). `generateInsightReport` yalnızca `systemPrompt.slice(0, 800)` alıyor (`lib/ai-engine.ts:659`) → ek **her zaman** kesiliyor; rapora giden şey her eğitimde aynı sabit metnin ilk 800 karakteri. `askAI` fallback'i de `slice(0, 600)` (`lib/ai-engine.ts:897`), yine eke ulaşmıyor.
- Ek olarak: Sayfadaki yardım metni "Yeni geri bildirim analiz edilirken sistem + dealer profili bağlam olarak kullanılır" diyor (`app/admin/ai-learning/page.tsx:502`); ancak `getSystemLearningProfile` yalnızca `lib/ai-engine.ts:657` (insight raporu) ve `:877` (`askAI`) tarafından çağrılıyor — tekil geri bildirim analizinde sistem profili kullanılmıyor. UI vaadi koddan fazla.
- Yeniden üretim: Eğit → `systemPromptAppendix` ne olursa olsun, `generateInsightReport`'un sistem mesajındaki önek sabit 800 karakterlik metindir.
- Öneri: Taban metni ön eke kopyalamak yerine yalnızca öğrenilmiş ek (+ kurallar) karakter sınırıyla insight raporuna verilmeli; yardım metni gerçek tüketicilere göre düzeltilmeli.

### 4. Yeniden eğitim manuel düzenlemeleri geri dönüşsüz eziyor — **DOĞRULANDI**
- `updateSystemLearningProfile` her çalışmada `systemPrompt: fullSystemPrompt` yazıyor (`lib/ai-learning.ts:816`); sohbet promptu başarılıysa onu da eziyor (`:817`). Şemada sürüm/geçmiş tablosu yok, tek satır güncelleniyor (`prisma/schema.prisma:2412-2426`; `version` yalnızca sayaç). Onay penceresi (`app/admin/ai-learning/page.tsx:105`) üzerine yazma uyarısı içermiyor.
- Tutarsızlık senaryosu da kesin: sohbet promptu üretimi hata verirse `chatSystemPrompt` `undefined` kalır, Prisma `update` bu alanı atlar (`lib/ai-learning.ts:817`, `:824-828`) → eski (manuel veya önceki) sohbet promptu yeni sistem promptu ve yeni `learnedRules` ile birlikte yaşar; kullanıcıya bildirilmez.
- Yeniden üretim: Admin sohbet promptunu elle düzenler ve kaydeder → "Sistem Profilini Eğit" → düzenleme kalıcı olarak kaybolur, geri alma yolu yok.
- Öneri: `AIPromptVersion` benzeri bir sürüm tablosu (taslak/aktif/arşiv, oluşturan, kaynak = manuel|eğitim); eğitim yeni sürümü **taslak** olarak üretmeli, aktifleştirme diff önizlemesiyle admin onayına bağlanmalı; manuel düzenlenmiş aktif sürüm varsa onay penceresi açıkça uyarmalı.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/admin/ai/studio` (Prompt ve Model Stüdyosu): Promptlar · Öğrenilen kurallar · Üsluplar · Bayiler · Modeller · Geçmiş. `/admin/ai-learning` → `/admin/ai/studio?tab=ogrenme` kalıcı yönlenir (sorgu parametreleri korunur). Sunucu bileşeni önce: KPI'lar ve aktif sekmenin verisi sunucuda okunur, sekmeler tembel yüklenir. BFF: `app/api/admin/ai/studio/**` (hepsi `defineRoute`, ADMIN, zod, rate limit; LLM yalnız POST'ta, mevcut geçitlerden). Çekirdek `lib/ai-studio/*`, arayüz `components/admin/a-prompt-studyosu/*`, test `__tests__/lib/ai-studio.test.ts` (22 test). Eski `/api/admin/ai-learning/system` silindi; tek tüketicisi bu sayfaydı.

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Sayfa erişimi | ÇALIŞIYOR. Admin kapısı ve sunucu bileşeninde `requireAuth(['ADMIN'])` |
| 2 | API yetkisi | ÇALIŞIYOR. Yeni uçlar yalnız ADMIN (`defineRoute`); bu yüzey `/api/ai/learning`'i artık kullanmıyor |
| 3 | Yükleniyor iskeleti | ÇALIŞIYOR. Her sekmenin kendi `QueryState`'i var; sistem öğrenmesi bayi listesini beklemiyor |
| 4 | Bayi listesi hata durumu | ÇALIŞIYOR. `DataTable` + `QueryState` hata kartı ve "Tekrar dene"; satır başına N+1 istek yok |
| 5 | Sistem profili hata durumu | ÇALIŞIYOR. Hata görünür; eğitim düğmesinin devre dışı gerekçesi sunucudan gelir (veri eşiği, sağlayıcı yok, bekleyen öneri) |
| 6 | Başlık | ÇALIŞIYOR. QDL `PageHeader`, anlamlı ikon |
| 7-9, 25 | Birbiriyle çelişen hero ve özet sayaçları | KALDIRILDI. Yerine tek KPI şeridi geldi; hepsi sunucudan, platform geneli (bayi, AI kapalı, bağlam, profil, bekleyen öneri, 7 günlük çağrı ve hata) |
| 10 | Sistem istatistik kartları | ÇALIŞIYOR. Öğrenme sekmesinde (metinli geri bildirim, düzeltme, bayi, embedding) |
| 11 | Sürüm ve durum rozetleri | ÇALIŞIYOR. "Yürürlükte · sürüm N", "Onaylı kural yok", "Eğitim sürüyor" (gerçek kilitten) |
| 12 | Son eğitim zamanı | ÇALIŞIYOR. İstanbul saati ve göreli zaman |
| 13 | Sistem profilini eğit | ÇALIŞIYOR. `POST …/learning/train`: atomik kilit (`status='training'`, 5 dk sonra bayat), sunucu veri eşiği (≥20 metinli geri bildirim, yoksa 422), `maxDuration=60`, 10 dakikada 3 istek. Çıktı ONAY BEKLER; sonuç denetim satırına yazılır. Token ve maliyet `AIUsageLog`'a çekirdekte yazılıyor |
| 14 | "En az N geri bildirim" koruması | ÇALIŞIYOR. Sunucuda zorlanıyor |
| 15 | Eğitim onay penceresi | ÇALIŞIYOR. `ConfirmAction` (native confirm kalktı); notlara ve temel prompta dokunmadığı açıkça yazılı |
| 16-19 | Sistem ve sohbet promptu düzenleme | ÇALIŞIYOR. Yerine **sürümlü yönetici notları** geldi: gerekçesi zorunlu taslak (uzunluk modele ulaşan tavanla sınırlı: 600 / 1200) → satır farkı → "Modele gideni önizle" (LLM yok, yalnız prompt kurucusu çalışır) → yayınla (onaylı, tek transaction + denetim, iyimser kilit 409) → geçmiş ve "taslağa al". Notlar temel promptun yerine geçmez |
| 20 | Prompt iptal | ÇALIŞIYOR. "Değişiklikleri bırak"; taslak ayrıca silinebilir |
| 21-22 | Göster / gizle | ÇALIŞIYOR. Native `<details>` (klavye ve ekran okuyucu durumu) |
| 23 | Öğrenilen profil özeti (ham JSON) | ÇALIŞIYOR. Yapılandırılmış görünüm (kurallar, temalar, yap/kaçın, ek not). Bayi profilinde sektör, terimler, temalar, risk kalıpları ve varlıklar |
| 24 | "Nasıl çalışır?" (yanlış içerik) | KALDIRILDI. Her bölümün açıklaması gerçek veri akışını ve "kullanıldığı yer"i anlatıyor |
| 26 | Bayi listesi (50 sınırı, N+1) | ÇALIŞIYOR. `GET …/dealers` User tabanlı, tek sorgu + sayım, sunucu sayfalı |
| 27 | Filtre | ÇALIŞIYOR. AI kapalı / otomatik analiz kapalı / bağlam var / profil var / profil yok (URL'de kalıcı) |
| 28 | Arama | ÇALIŞIYOR. İşletme adı, ad, e-posta |
| 29 | Sıralama | KALDIRILDI. Sıralama ada göre sabit. "Yeniden eğitim" sinyali satır başına sorgu gerektirdiği için listede değil, detayda |
| 30 | Sayfalama | ÇALIŞIYOR |
| 31 | Toplu güncelle | KALDIRILDI. Seri ve iptal edilemeyen bir istemci döngüsüydü; profil eşik aşılınca zaten kendiliğinden yenileniyor (`maybeTriggerAdaptiveUpdate`). Tekil yenileme kaldı |
| 32 | Satır başına "profili yenile" | ÇALIŞIYOR. Detayda; sunucu eşiği (≥5 metinli geri bildirim, yoksa 422 "Yetersiz veri x/5"), `ai` rate limit, denetim, AI geçidi |
| 33 | Satır genişletme | ÇALIŞIYOR. `DetailSheet` (`?bayi=` derin bağlantı, klavye) |
| 34-35 | Detay alanları | ÇALIŞIYOR. `riskSignals` artık gösteriliyor |
| 36 | "Hazır" rozeti | ÇALIŞIYOR. Sürüm ve son eğitim |
| 37 | "Eğitiliyor" (ölü kod) | KALDIRILDI (bayi satırında). Sistem öğrenmesinde durum gerçek kilitten türetiliyor |
| 38 | Yeniden eğitim önerisi | ÇALIŞIYOR. Detayda rozet, gerekçe ve yeni veri sayıları |
| 39 | Düzeltme kayıtları | ÇALIŞIYOR. Detayda son 10 (alan, eski → yeni, not, tarih) |
| 40 | Boş liste | ÇALIŞIYOR. İlk kullanım ve filtreli boş durumları |
| 41 | Mobil | ÇALIŞIYOR. `DataTable` mobil kartları, `FilterBar`, alttan açılan `DetailSheet`, ≥44px hedefler |
| 42 | Azaltılmış hareket | ÇALIŞIYOR. Dönen ikonlarda `motion-reduce:animate-none`; kademeli giriş yok |
| 43 | Klavye | ÇALIŞIYOR. Satırlar `DataTable` satır düğmesi |
| 44 | Prompt sürüm geçmişi | ÇALIŞIYOR. Notlar (Settings `ai.prompt-notes`, anahtar başına 30 sürüm, yayındaki sürüm asla budanmaz) ve öğrenilen kuralların onay geçmişi ("Öneri olarak geri yükle") |
| 45 | Denetim kaydı | ÇALIŞIYOR. Her yazım `auditEntry` ile; Geçmiş sekmesinde tür filtresi ve imleçli liste |
| 46 | Önizleme | ÇALIŞIYOR. Notlar için derlenmiş blok (LLM'siz) |
| 47 | Maliyet ve token | ÇALIŞIYOR. Modeller sekmesi: model başına 7 günlük çağrı, hata, girdi/çıktı token, ortalama gecikme (AIUsageLog) |

### Kapanan bulgular
1 (taban prompt değişimi: P0-33 çekirdeği üzerine yönetişim yüzü; notlar yalnız ek bağlam, sürümlü, onaylı, denetimli), 3 (yardım metni gerçeğe göre yazıldı; notun nerede kullanıldığı gösteriliyor), 4 (eğitim yalnız ÖNERİ üretir, notlara dokunmaz; onay penceresinde yazılı), 5, 6 (kilit + veri eşiği + maxDuration; çekirdek taraması zaten `take` ile sınırlı), 7, 8 (not alanı her zaman görünür, profil yoksa satır oluşturulur, "boş yayınla = notu kaldır" açıkça söyleniyor), 9 (sunucu eşiği + rate limit; LLM hatasında görünür 503), 10, 11, 12, 13, 14 (tek terim "Bayi"), 15. Bulgu 2 (kiracılar arası karışma) Dalga 1'de P0-33 ile çekirdekte kapanmıştı; bu yüzey onu görünür kılıyor (anonimlik açıklaması, k-anonim etiket eşiği).

### Kalanlar
- Eğitim hâlâ istek içinde, senkron çalışıyor (Inngest işi ve ilerleme göstergesi yok). Kilit, veri eşiği ve 60 sn sınırı sayesinde güvenli. Ayrı iş tablosu (`AILearningJob`) için **ŞEMA İSTEĞİ**.
- Sohbet notu için eski/yeni canlı yanıt karşılaştırması yok: `askAI` bayi verisi bağlamı istiyor. Önizleme bu yüzden derlenmiş blokla sınırlı tutuldu.
- Bayi profilinin sürüm geçmişi (v3 → v4 farkı) yok, çünkü model tek satır. **ŞEMA İSTEĞİ:** `AIDealerLearningProfileVersion`.
