# /admin/ai-settings

**Amaç:** Platform operatörünün her dealer (bayi) için AI analiz motorunu aç/kapat, otomatik analiz, 9 analiz modülü, rapor/uyarı tercihleri ve işletmeye özel prompt'u merkezden yönetmesi.
**Genel puan:** 4/10
**Karar:** yeniden tasarla (arka uç bağlantısı kurulmadan UI'ın büyük kısmı etkisiz; `/dealer/ai-settings` ile aynı veriyi yöneten ikinci bir yüz, ileride `/admin/ai-dashboard` ile tek bir "AI Kontrol Merkezi"nde birleşmeli)

Dosyalar: `app/admin/ai-settings/page.tsx` (386 satır, tek client bileşen), `app/admin/layout.tsx`, `components/admin/admin-premium-hero.tsx`, `lib/admin-toast.ts`, API: `app/api/ai/analyze/route.ts` (`get_settings`, `update_settings`), `app/api/admin/bootstrap/route.ts` (`ensure_ai_settings`, sayfada bağlı değil), model: `prisma/schema.prisma:2185-2209` (`AISettings`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | 16 anahtarın 14'ü kaydediliyor ama sistemde hiçbir kod tarafından okunmuyor; "AI kapalı" bile `ai-retry` cron'u tarafından 3 dk sonra deliniyor. |
| UX | 4/10 | İki sütunlu liste-detay deseni doğru, ama arama yok, kaydedilmemiş değişiklik koruması yok, hata durumunda "dealer yok" gösteriliyor, bağımlı anahtarlar pasifleşmiyor. |
| Görsel | 6/10 | Premium hero + kart dili diğer admin sayfalarıyla tutarlı; emoji durum ikonları, renk-metin uyumsuz rozet ve "Derin Öğrenme" gibi abartılı etiketler profesyonelliği düşürüyor. |
| Mimari | 3/10 | Ayarlar iki ayrı API'den (`/api/ai/analyze?action=update_settings` ve `/api/dealer/ai-settings` PATCH) doğrulamasız yazılıyor; audit log yok; admin kararı bayi tarafından geri alınabiliyor; ölü kod + bozuk kodlama. |
| Performans | 6/10 | Tek istek, küçük yük; ancak `findMany` sayfalamasız ve her dealer'ın `customPrompt` metnini taşıyor; kaydetmeden sonra tüm liste yeniden çekiliyor. |
| Erişilebilirlik + Mobil | 4/10 | `Switch`'lerin erişilebilir adı yok, durum emojiyle anlatılıyor; mobilde 600px liste altında seçim sonrası detaya kaydırma yok. Azaltılmış hareket global olarak destekleniyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Admin yetki kontrolü (sunucu) | ÇALIŞIYOR | `app/api/ai/analyze/route.ts:96-99, 853-872` | `all:true` yalnız ADMIN'e döner; CUSTOMER 403. Sayfa ayrıca admin gizli kapısının (proxy) arkasında. |
| 2 | Tam sayfa yükleniyor ekranı | ÇALIŞIYOR | `page.tsx:155-162` | Spinner; iskelet (skeleton) yok, hero bile gösterilmiyor. |
| 3 | Tüm ayarların yüklenmesi (`get_settings`, `all:true`) | KISMİ | `page.tsx:85-102`, `route.ts:868-872` | Yalnızca `AISettings` satırı OLAN dealer'lar gelir; satırı olmayanlar (varsayılanla AI açık) hiç görünmez. Sayfalama yok. |
| 4 | Hata durumu | BOZUK | `page.tsx:92-95` | `res.ok` kontrol edilmiyor: 403/429/500'de `data.allSettings` undefined → hata toast'ı yok, ekranda "Henüz AI ayarı olan dealer yok" yazar. Tekrar dene butonu yok. |
| 5 | KPI "Toplam dealer" | KISMİ | `page.tsx:177-180` | Gerçek dealer sayısı değil, `AISettings` satır sayısı. |
| 6 | KPI "AI aktif" | KISMİ | `page.tsx:181-184` | Satırı olmayan (varsayılan aktif) dealer'ları saymaz. |
| 7 | Dealer listesi | KISMİ | `page.tsx:199-222` | Çalışır, fakat madde 3'teki eksik küme yüzünden eksik liste. |
| 8 | Satır durum göstergesi | ÇALIŞIYOR | `page.tsx:212-214` | 🟢/🔴 emoji; ekran okuyucu "yeşil daire" okur. |
| 9 | "Otomatik/Manuel" rozeti | KISMİ | `page.tsx:216-218` | Rozetin RENGİ `isEnabled`'a, METNİ `autoAnalyze`'a bağlı → "AI kapalı + Otomatik" gri rozeti gibi çelişkili sinyal. |
| 10 | Liste boş durumu | KISMİ | `page.tsx:200-201` | CTA yok; oysa varsayılan ayar oluşturan `bootstrapSettings` fonksiyonu sayfada yazılı ama bağlanmamış (madde 33). |
| 11 | Dealer seçimi | ÇALIŞIYOR | `page.tsx:120-126, 204-207` | `aria-pressed`/`aria-current` yok. |
| 12 | "Dealer Seçin" boş durumu | ÇALIŞIYOR | `page.tsx:229-236` | |
| 13 | AI Analiz Motoru (`isEnabled`) | KISMİ | UI `page.tsx:253`; tüketim `app/api/feedbacks/route.ts:432-441` | Yalnız yeni feedback'in anlık analizini durdurur. `app/api/cron/ai-retry/route.ts:36-44` `aiProcessedAt:null` olanları dealer ayarına bakmadan `runFeedbackAnalyzePipeline` ile işler; pipeline `isEnabled`'ı hiç okumaz (`lib/inngest/feedback-analyze-pipeline.ts:30-36`). Ayrıca bayi kendi sayfasından tekrar açabilir. |
| 14 | Otomatik Analiz (`autoAnalyze`) | KISMİ | UI `page.tsx:260`; tüketim `feedbacks/route.ts:441` | Aynı cron delmesi geçerli; `isEnabled` kapalıyken pasifleşmiyor. |
| 15 | Duygu Analizi (`sentimentEnabled`) | SAHTE | UI `page.tsx:63, 291` | Kaydedilir; analiz yolunda hiçbir kod okumaz (yalnız `lib/ai-learning.ts:528` istatistik amaçlı seçer). |
| 16 | Duygu Tespiti (`emotionEnabled`) | SAHTE | `page.tsx:64` | Repo genelinde yalnız ayar UI/route dosyalarında geçiyor (grep doğrulandı). |
| 17 | Konu Çıkarma (`topicEnabled`) | SAHTE | `page.tsx:65` | Aynı. |
| 18 | Niyet Tespiti (`intentEnabled`) | SAHTE | `page.tsx:66` | Aynı. |
| 19 | Aciliyet Tespiti (`urgencyEnabled`) | SAHTE | `page.tsx:67` | Aynı. |
| 20 | Varlık Tanıma (`entityEnabled`) | SAHTE | `page.tsx:68` | Aynı. |
| 21 | Toksisite Kontrolü (`toxicityEnabled`) | SAHTE | `page.tsx:69` | Aynı; toksisite her analizde hesaplanır. |
| 22 | Churn Tahmini (`churnEnabled`) | SAHTE | `page.tsx:70` | Aynı. |
| 23 | Tema Kümeleme (`themeClusterEnabled`) | SAHTE | `page.tsx:71` | Aynı. |
| 24 | Haftalık AI Raporu | SAHTE | `page.tsx:310` | `weeklyReportEnabled`'ı okuyan cron/rapor kodu yok. |
| 25 | Aylık AI Raporu | SAHTE | `page.tsx:311` | Aynı. |
| 26 | Toksik İçerik Uyarısı | SAHTE | `page.tsx:312` | Bildirim koşulsuz gönderiliyor: `feedback-analyze-pipeline.ts:87-95`, `feedbacks/route.ts:496-498`. |
| 27 | Acil Geri Bildirim Uyarısı | SAHTE | `page.tsx:313` | Koşulsuz: `feedback-analyze-pipeline.ts:97-105`. |
| 28 | Churn Riski Uyarısı | SAHTE | `page.tsx:314` | Koşulsuz: `feedback-analyze-pipeline.ts:106-115`. |
| 29 | Özel Prompt | ÇALIŞIYOR | UI `page.tsx:338-344`; tüketim `lib/ai-engine.ts:269-277`, `feedback-analyze-pipeline.ts:46` | Sistem prompt'una eklenir. Uzunluk sınırı, karakter sayacı, önizleme, test-et yok (madde F4). |
| 30 | AI Yanıt Üslupları kartı | KISMİ | `page.tsx:350-370` | Yalnızca `/admin/modules/ai-tones` linki; düz `<a>` (tam sayfa yenileme), kullanıcıya görünen geliştirici notu ("'modules/ai-tones' sayfasını ziyaret edin"), global bir ayar olduğu hâlde dealer seçilmeden görünmüyor. |
| 31 | Ayarları Kaydet | ÇALIŞIYOR | `page.tsx:132-153, 374-377` | `saving` durumu var; değişiklik yokken de aktif; dirty göstergesi yok. |
| 32 | Başarı/hata toast'ları | ÇALIŞIYOR | `page.tsx:143-149`; `lib/admin-toast.ts:16-19` | Önek "Basarili: " Türkçe karaktersiz. |
| 33 | Varsayılan AI ayarı oluştur (`bootstrapSettings`) | BOZUK | `page.tsx:104-118` | Hiçbir yerden çağrılmıyor (ölü kod) ve metinler bozuk kodlanmış: `'AI ayarlar? haz?rlanamad?'`, `dealer i?in varsay?lan` (bayt düzeyinde `?` doğrulandı). |
| 34 | Giriş animasyonları | ÇALIŞIYOR | `page.tsx:191, 240, 267, 301, 329, 350, 373` | Kademeli fade/slide; Kaydet butonu 0.5 sn gecikmeyle beliriyor. |
| 35 | Azaltılmış hareket | ÇALIŞIYOR | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`), `admin-premium-hero.tsx:73` | Global olarak karşılanıyor. |
| 36 | Mobil yerleşim | KISMİ | `page.tsx:189, 199` | Tek sütuna iniyor; seçim sonrası detaya kaydırma yok, 600px'lik liste üstte kalıyor. |
| 37 | Anahtarların erişilebilir adı | BOZUK | `page.tsx:250-253, 287-291, 317-321` | `Label`'da `htmlFor`, `Switch`'te `id`/`aria-label` yok → ekran okuyucu "switch, kapalı" der, neyin anahtarı olduğunu söylemez. |
| 38 | Analiz dili (`analysisLanguage`) kontrolü | EKSİK | `page.tsx:44` | Arayüzde tipte var, UI yok. (Analiz yolunda da okunmuyor.) |
| 39 | Dealer arama / filtre / sıralama | EKSİK | `page.tsx:199-222` | Yüzlerce dealer'da kullanılamaz. |
| 40 | Kaydedilmemiş değişiklik koruması | EKSİK | `page.tsx:120-126` | Başka dealer'a tıklamak düzenlemeleri sessizce siler. |
| 41 | Değişiklik geçmişi / audit log | EKSİK | `route.ts:885-930` | Diğer admin uçları `prisma.auditLog.create` kullanıyor (örn. `app/api/admin/api-keys/route.ts:74`); burada yok. |
| 42 | Sunucu tarafı doğrulama | EKSİK | `route.ts:890-929` | Zod şeması yok; yanlış tipte alan Prisma hatası → 500. `dealerId` gerçekten DEALER mı kontrol edilmiyor. |
| 43 | Bağımlılık mantığı (motor kapalıyken alt anahtarlar pasif) | EKSİK | `page.tsx:253-291` | Bayi sayfasında var (`app/dealer/ai-settings/page.tsx:372, 416`), adminde yok. |
| 44 | i18n | EKSİK | tüm metinler sabit | Bayi sayfası `t()` kullanıyor; burada TR sabit + "dealer" İngilizcesi karışık (admin sayfalarının 15'i "Bayi" diyor, bu sayfa tek "Dealer'lar" diyen). |
| 45 | Admin kilidi (bayinin geri alamayacağı zorunlu ayar) | EKSİK | `app/api/dealer/ai-settings/route.ts:177-184` | Bayi PATCH'i admin'in kapattığı `isEnabled`'ı koşulsuz geri açar. |

**Durum özeti:** ÇALIŞIYOR 10 · KISMİ 10 · BOZUK 3 · SAHTE 14 · EKSİK 8 (toplam 45)

---

## Bulgular

### 1. [YÜKSEK] Veri bütünlüğü/maliyet — "AI Analiz Motoru kapalı" ayarı cron tarafından deliniyor
- **Kanıt:** `app/api/feedbacks/route.ts:432-441` yalnızca anlık analizde `isEnabled/autoAnalyze`'a bakar. `app/api/cron/ai-retry/route.ts:36-44` `aiProcessedAt: null` olan, 3 dk'dan eski her feedback'i seçer ve `runFeedbackAnalyzePipeline` çağırır; `lib/inngest/feedback-analyze-pipeline.ts:30-36` yalnız `customPrompt` okur, `isEnabled` kontrolü yoktur.
- **Sorun:** Admin bir dealer'ın AI'ını kapattığında (maliyet, KVKK veya sözleşme gerekçesiyle) o dealer'ın yeni feedback'leri anlık analiz edilmez ama `aiProcessedAt` NULL kaldığı için cron birkaç dakika sonra LLM'e gönderir, bildirim üretir, otomatik yanıt/telafi zincirini tetikler. Ayar yalnızca analizi geciktiriyor. Üstelik kapalı dealer'ların feedback'leri cron'un 15'lik partisinde yer kaplayıp gerçekten sıkışmış olanları geciktirir.
- **Öneri:** Kararı tek bir yerde toplayın: `lib/ai-settings.ts` içinde `getEffectiveAISettings(dealerId)` (Redis'te kısa TTL'li cache, admin/dealer yazımında `revalidate`) ve `shouldAnalyze(settings, trigger: 'inline' | 'retry' | 'manual')`. Pipeline'ın başında bu kapıyı çalıştırın; kapalıysa feedback'i `aiSkippedReason='disabled'` gibi bir alanla işaretleyin ki cron sorgusu (`aiSkippedReason: null`) bunları bir daha seçmesin. Manuel "yeniden analiz" bile kapalı dealer için 409 dönmeli.
- **Efor:** M

### 2. [YÜKSEK] İşlevsellik/güven — 16 anahtarın 14'ü sahte
- **Kanıt:** 9 modül + 2 rapor + 3 uyarı alanı (`page.tsx:62-72, 309-315`) repo genelinde yalnızca iki ayar sayfası ve iki ayar route'unda geçiyor (grep: `sentimentEnabled` yalnız `lib/ai-learning.ts:528`'de istatistik için seçiliyor). Uyarılar koşulsuz: `feedback-analyze-pipeline.ts:87-115`, `feedbacks/route.ts:496-498`.
- **Sorun:** Operatör "Toksik İçerik Uyarısı"nı kapatıp bayiyi bildirimden kurtardığını düşünür ama bildirim gelmeye devam eder; "Churn Tahmini"ni kapatır ama LLM churn skorunu üretmeye ve token harcamaya devam eder. Kontrol paneli, sistemin gerçek davranışı hakkında yanlış bir model kuruyor; destek talebinde admin'in "kapattım" dediği ayarın hiçbir etkisi olmuyor.
- **Öneri:** İki seçenek, ikisi de dürüst: (a) **Bağla:** `buildAnalysisSystemPrompt` içinde etkin modüllere göre JSON şemasını daraltın (kapalı alanlar istenmesin → token tasarrufu), `prisma.feedback.update`'te kapalı alanları yazmayın, bildirim üç bloğunu `settings.alertOnX` ile koşullayın, haftalık/aylık rapor için `app/api/cron/daily` içine bir dal ekleyin. (b) **Kaldır:** bağlanmayacak alanları UI'dan çıkarın veya "Yakında" etiketiyle disabled gösterin. Her anahtarın yanına "Etki: yeni analizlerden itibaren / bildirimler" gibi bir etki satırı ekleyin. Kısa vadede (b), orta vadede (a).
- **Efor:** L (a) / S (b)

### 3. [YÜKSEK] Mimari/yönetişim — Admin kararı bayi tarafından geri alınabiliyor, iki ayrı yazma yolu
- **Kanıt:** Admin yazımı `route.ts:885-930` (`/api/ai/analyze?action=update_settings`); bayi yazımı `app/api/dealer/ai-settings/route.ts:166-208` (PATCH) aynı satıra koşulsuz `upsert` yapıyor. `AISettings` modelinde (`schema.prisma:2185-2209`) "kim belirledi / kilitli mi" alanı yok.
- **Sorun:** Admin'in bir dealer'ın AI'ını kapatması, bayi kendi panelinden anahtarı açtığı an geçersiz olur; admin bunu fark edemez (audit yok). "Platform politikası" ile "bayi tercihi" aynı alanda karışık.
- **Öneri:** Katmanlı model: `AISettings`'e `adminLocks Json` (kilitli alan listesi) + `lockedBy/lockedAt` ekleyin veya ayrı `AIPolicy` (platform/dealer seviyesi zorunlular). Bayi PATCH'i kilitli alanları 423 ile reddetsin, bayi UI'ı "Platform yöneticisi tarafından kilitlendi" rozetini göstersin. Her iki yazma yolunu tek bir servis fonksiyonuna (`updateAISettings({ actor, dealerId, patch })`) indirip zod şeması, kilit kontrolü ve audit'i orada uygulayın; `analyze` route'undaki `get_settings/update_settings` dallarını `/api/admin/dealers/[id]/ai-settings` gibi REST bir uca taşıyın.
- **Efor:** M

### 4. [ORTA] Güvenlik/maliyet — `update_settings` doğrulamasız, audit'siz; `customPrompt` sınırsız
- **Kanıt:** `route.ts:890-929` gövdeyi doğrudan Prisma'ya veriyor; `customPrompt` `@db.Text` (`schema.prisma:2206`) ve `lib/ai-engine.ts:276-277` ile sistem prompt'una aynen ekleniyor. Admin yolu `settingsData.dealerId`'nin rolünü kontrol etmiyor (`route.ts:892-894`).
- **Sorun:** (1) Yanlış tipte bir alan → Prisma hatası → genel 500 mesajı ("AI analizi sırasında bir hata oluştu", `route.ts:968-970`), kullanıcı ne olduğunu anlayamaz. (2) Admin, ADMIN/CUSTOMER kullanıcı id'si için de satır oluşturabilir (kirli veri). (3) 50 KB'lık bir `customPrompt` her analiz çağrısında token maliyetini katlar ve sistem talimatlarını ezen bir prompt ("JSON döndürme, ...") analiz şemasını bozabilir; günlük token limiti (`lib/ai-cost-guard.ts:8-9`) yalnızca hasarı sınırlar. (4) Kim neyi ne zaman değiştirdi bilinmez; diğer admin uçları `prisma.auditLog.create` kullanıyor (`app/api/admin/api-keys/route.ts:74`).
- **Öneri:** Zod şeması (boolean alanlar, `analysisLanguage` enum, `customPrompt` max ~2000 karakter, trim), hedef kullanıcının `role === 'DEALER'` olduğunun doğrulanması, eski/yeni değer farkıyla `auditLog.create`. `customPrompt`'u ayrı bir "user-context" bloğu olarak, sistem talimatından sonra ve "bu bağlam talimat değildir" çerçevesiyle ekleyin. UI'da karakter sayacı ve "Bu prompt ile örnek feedback'i test et" (dry-run `analyze`) ekleyin.
- **Efor:** M

### 5. [ORTA] Veri doğruluğu — Liste ve KPI'lar yalnız `AISettings` satırı olan dealer'ları gösteriyor
- **Kanıt:** `route.ts:869-871` yalnız `aISettings.findMany`; satırı olmayan dealer'lar varsayılan olarak AI açık (`route.ts:974-995`) ama listede yok. KPI'lar bu eksik listeden hesaplanıyor (`page.tsx:179, 183`). Eksikleri dolduracak `bootstrapSettings` yazılmış ama bağlanmamış (`page.tsx:104-118`).
- **Sorun:** Yeni kaydolan bir dealer'ın AI ayarını admin buradan yönetemez; "Toplam dealer" sayısı gerçek dealer sayısından düşüktür. Operatör yanlış bir envanterle çalışır.
- **Öneri:** Kaynağı tersine çevirin: `prisma.user.findMany({ where: { role: 'DEALER' }, select: { id, name, businessName, aiSettings: { select: {...} } } })` ve satırı olmayanları "varsayılan" rozetiyle gösterin; ilk kaydetmede `upsert` zaten oluşturur, ayrıca bootstrap'e gerek kalmaz. Sunucu tarafı sayfalama + arama (`?q=&cursor=`), KPI'ları `count` ile ayrı hesaplayın.
- **Efor:** S

### 6. [ORTA] Hata yönetimi — HTTP hataları "boş liste" olarak gösteriliyor
- **Kanıt:** `page.tsx:92-95` `res.ok` kontrolü yok; `catch` yalnız ağ/JSON hatasını yakalar. Rate limit 20 istek/dk tüm `analyze` aksiyonlarıyla paylaşılıyor (`route.ts:24, 101-114`).
- **Sorun:** 429 veya 500'de kullanıcı hiçbir hata görmez, "Henüz AI ayarı olan dealer yok" der; admin sistemin boş olduğuna inanabilir. Kaydetme yolunda da 429 mesajı `data.error` ile gelir ama `res.ok` kontrolü yine yok (`page.tsx:141-147`).
- **Öneri:** `useSWR`/React Query'ye geçip `error` durumunu ayrı bir "Yüklenemedi — Tekrar dene" kartıyla gösterin; 429'da `Retry-After`'ı okuyun. Admin ayar uçlarını genel `ai_analyze` rate-limit kovasından ayırın.
- **Efor:** S

### 7. [ORTA] UX — Kaydedilmemiş değişiklikler sessizce kayboluyor; kaydetme modeli belirsiz
- **Kanıt:** `selectDealer` `editSettings`'i doğrudan üzerine yazar (`page.tsx:120-126`); dirty karşılaştırması yok; Kaydet butonu her zaman aktif ve tüm kartların en altında (`page.tsx:373-378`).
- **Sorun:** Admin 6 anahtar değiştirip yanlışlıkla başka dealer'a tıklarsa hepsi gider. Anahtarlar anlık-kayıt hissi veriyor (Switch) ama kayıt ayrı butonla; bayi sayfası ise anahtar başına anlık kaydediyor (`app/dealer/ai-settings/page.tsx:165`) — iki panel arasında tutarsız zihinsel model.
- **Öneri:** Linear/Stripe deseni: dirty olduğunda yapışkan alt çubuk ("3 değişiklik · Geri al · Kaydet"), başka dealer'a geçişte onay iç diyaloğu, `beforeunload` koruması. Alternatif olarak her anahtar için iyimser anlık kayıt + geri al toast'ı; hangisi seçilirse bayi paneliyle aynı olmalı.
- **Efor:** S

### 8. [ORTA] Erişilebilirlik — Anahtarların adı yok, durum emojiyle veriliyor
- **Kanıt:** `page.tsx:250-253, 287-291, 317-321` (`Label` `htmlFor`'suz, `Switch` `id`/`aria-label`'sız); `page.tsx:213` emoji durum; `page.tsx:204-207` seçili dealer için `aria-pressed`/`aria-current` yok.
- **Sorun:** Ekran okuyucu kullanıcısı 16 adet "switch" duyar, hangisinin ne olduğunu bilemez. Renk/emoji tek başına durum taşıyor.
- **Öneri:** Her satırı `<Label htmlFor={key}>` + `<Switch id={key} aria-describedby={key+'-desc'}>` yapısına çevirin; dealer listesini `role="listbox"` + `aria-selected` veya `aria-current="true"` ile işaretleyin; emoji yerine metinli `Badge` + ikon.
- **Efor:** S

### 9. [DÜŞÜK] Kod kalitesi — Ölü kod, bozuk kodlama, kullanılmayan import'lar, tip kaçakları
- **Kanıt:** `bootstrapSettings` hiç çağrılmıyor ve metinleri `?` ile bozulmuş (`page.tsx:104-118`; aynı bozulma `app/admin/ai-dashboard/page.tsx:191-193`'te de var). Kullanılmayan import'lar: `Eye, TrendingUp, CheckCircle2, RefreshCw, BarChart3` (`page.tsx:14, 18, 19, 21, 25`). `(editSettings as Record<string, unknown>)` cast'leri ve `toggleModule(key: string, ...)` (`page.tsx:128, 279, 319`) anahtar adını tip dışına çıkarıyor. Kullanıcıya görünen geliştirici notu (`page.tsx:362-363`). Düz `<a href>` (`page.tsx:365`) tam sayfa yenileme yapar.
- **Öneri:** Ölü kodu silin veya madde 5'teki gibi gereksiz kılın; `keyof DealerSettings` tabanlı tipli toggle; `next/link`; geliştirici notunu kaldırın; ai-dashboard'daki bozuk metinleri de düzeltin.
- **Efor:** S

### 10. [DÜŞÜK] Dil/terminoloji tutarsızlığı
- **Kanıt:** "Dealer'lar", "Toplam dealer", "Churn" (`page.tsx:173, 178, 195`) — `app/admin` altındaki 15 sayfa "Bayi" kullanırken bu sayfa tek "Dealer'lar" diyen sayfa (grep). Toast öneki "Basarili: " (`lib/admin-toast.ts:17`). Sayfa i18n kullanmıyor; bayi eşleniği `t()` kullanıyor. "Derin Öğrenme Modülleri" (`page.tsx:271`) bir LLM prompt alanı için yanıltıcı.
- **Öneri:** "Bayi" terimine geçin, `adminAiSettings.*` anahtarlarıyla i18n'e alın, başlığı "Analiz modülleri" yapın; `admin-toast` öneklerini Türkçe karakterle düzeltin.
- **Efor:** S

### 11. [DÜŞÜK] Bilgi mimarisi — Global "Üslup" kartı dealer bağlamının içinde
- **Kanıt:** `page.tsx:349-370` kart yalnız `selectedDealer` doluyken render ediliyor; üsluplar ise global (`/api/admin/settings/ai-tones`, `app/admin/modules/ai-tones/page.tsx:28`).
- **Sorun:** Platform genelindeki bir ayar, bir bayinin ayar formunun ortasında, o bayiye aitmiş gibi duruyor; bayi seçmeden erişilemiyor.
- **Öneri:** Sayfayı "Platform varsayılanları" ve "Bayi istisnaları" sekmelerine ayırın; üslup yönetimi (ve global token limiti, varsayılan model) "Platform" sekmesinde yaşasın.
- **Efor:** S

### 12. [DÜŞÜK] Mobil — Seçim sonrası bağlam kaybı
- **Kanıt:** `page.tsx:189` `lg` altında tek sütun; liste `max-h-[600px]` (`page.tsx:199`); seçimde `scrollIntoView` yok.
- **Öneri:** Mobilde liste → detay için tam ekran `Sheet`/drawer veya route tabanlı detay (`/admin/ai-settings/[dealerId]`), sticky kaydet çubuğu `env(safe-area-inset-bottom)` ile.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Platform varsayılanları + bayi istisnaları (override) modeli:** Stripe/Retool'daki "account default → per-entity override" deseni. Şu an her bayi bağımsız satır; "tüm bayilerde churn uyarısını kapat" gibi toplu politika yok. Bir de "varsayılandan farklı olan alanları vurgula" görünümü.
- **Toplu işlem:** çoklu seçim (checkbox) + "seçilenlere uygula" (Linear bulk edit). Kategoriye (restoran/kafe) göre şablon uygulama.
- **Değişiklik geçmişi ve geri alma:** alan bazlı diff'li audit akışı (PostHog activity log gibi), "bu sürüme dön".
- **Kullanım/maliyet bağlamı:** her bayi satırında son 7 gün analiz sayısı, token/maliyet, hata oranı, fallback oranı; bayi başı günlük token limiti düzenleme (şu an yalnız env: `lib/ai-cost-guard.ts:8-9`). Veri zaten var: `aIUsageLog`, `/api/admin/dealers-ai-stats`.
- **Prompt laboratuvarı:** `customPrompt` için sürümleme, örnek feedback üzerinde dry-run, önce/sonra çıktı karşılaştırması, token tahmini.
- **Arama, filtre ("AI kapalı", "özel prompt'u olan", "kilitli"), sıralama, sayfalama, URL'de seçili bayi (`?dealer=`) ile paylaşılabilir derin link.**

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında "AI platformumun durumu ne, hangi bayi standarttan sapıyor, neyi değiştirirsem ne olur" sorularına tek bakışta cevap alır; her anahtar gerçek ve ölçülebilir bir etkiye bağlıdır; her değişiklik izlenir ve geri alınabilir.

**Yerleşim:**
1. **Üst şerit (kompakt hero):** gerçek KPI'lar — toplam bayi, AI açık, kilitli, özel prompt'lu, son 24 saat analiz, bugünkü token harcaması/limit oranı. Mevcut `AdminPremiumHero` korunur ama KPI'lar `count` sorgularından gelir.
2. **Sekmeler:** `Platform varsayılanları` | `Bayiler` | `Üsluplar` | `Geçmiş`.
3. **Bayiler sekmesi:** solda aranabilir/filtrelenebilir sanal liste (durum çipleri: Açık/Kapalı/Kilitli/Özel); sağda detay paneli: üstte bayinin canlı AI metrikleri (7 günlük sparkline, maliyet), altında gruplanmış ayarlar — "Motor" (açık/otomatik + kilit ikonu), "Modüller" (yalnızca bağlı olanlar, her birinde "varsayılandan farklı" noktası ve tahmini token etkisi), "Bildirimler", "Bağlam (prompt)" (sayaç + test-et). Yapışkan alt çubuk: "N değişiklik · Geri al · Kaydet".
4. **Mobil:** liste tam ekran, detay `Sheet` veya ayrı route; sticky kaydet çubuğu safe-area'lı.

**Motion/3D:** 3B gerekmez, bu bir operasyon aracı. Framer-motion ölçülü kalmalı: liste ↔ detay geçişinde 150-200 ms çapraz geçiş, dirty çubuğunun alttan kayarak gelmesi, kaydetme sonrası değişen satırda kısa bir vurgu (highlight fade). Mevcut 0.1-0.5 sn kademeli girişler kaldırılmalı (özellikle Kaydet'in 0.5 sn gecikmesi). Global `MotionConfig reducedMotion="user"` zaten var.

**Veri/API değişiklikleri:**
- `lib/ai-settings.ts`: `getEffectiveAISettings(dealerId)` (platform varsayılanı ⊕ bayi satırı ⊕ admin kilitleri, Redis cache) ve `updateAISettings({ actor, dealerId, patch })` (zod + kilit + audit + cache bust).
- Uçlar: `GET /api/admin/ai-settings?q=&status=&cursor=` (User tabanlı, sayfalı), `PATCH /api/admin/ai-settings/[dealerId]`, `POST /api/admin/ai-settings/bulk`, `GET/PUT /api/admin/ai-settings/defaults`. `analyze` route'undaki `get_settings/update_settings` dalları bu servise delege edip zamanla kaldırılmalı.
- Şema: `AISettings.adminLocks Json?`, `updatedById String?`; platform varsayılanları için `Settings` tablosunda bir anahtar.
- Tüketiciler: pipeline + inline analiz + `ai-retry` cron + bildirimler + rapor cron'u `getEffectiveAISettings` kapısından geçmeli (Bulgu 1-2).

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/ai-settings`** (`app/dealer/ai-settings/page.tsx`, `app/api/dealer/ai-settings/route.ts`): aynı `AISettings` satırını yöneten bayi yüzü. Çakışma değil, doğru bir ikili — ama ortak bir `AISettingsForm` bileşeni (bayi sayfasındaki bağımlılık mantığı ve i18n'iyle) ve ortak servis fonksiyonu kullanmalılar; admin kilitleri bayi yüzünde görünmeli.
- **`/admin/ai-dashboard`**: `ensure_ai_settings` bootstrap'ini çağırıyor (`app/admin/ai-dashboard/page.tsx:175-193`) ve `/api/admin/dealers-ai-stats` ile bayi başı AI istatistiklerini zaten gösteriyor. Bu sayfanın "Bayiler" sekmesi, dashboard'un bayi istatistik tablosuyla birleşip tek "AI Kontrol Merkezi" (Genel bakış / Bayiler / Kalite / Öğrenme / Ayarlar) altında toplanabilir; sidebar'daki 5 ayrı AI girdisi (`components/dashboard/sidebar.tsx:187-192`: ai-dashboard, ai-detailed, ai-learning, ai-quality, ai-settings) bilgi mimarisini dağıtıyor.
- **`/admin/modules/ai-tones`**: global üslup yönetimi; bu sayfadaki link kartı yerine "Üsluplar" sekmesi olarak içeri alınmalı (sidebar'da kendi girdisi yok, yalnız buradan erişiliyor).

---

## Doğrulama (şüpheci inceleme)

Yöntem: iddialar salt okunur kod okumasıyla tek tek çürütülmeye çalışıldı; çağıran/çağrılan zincirler (`app/api/feedbacks/route.ts`, `app/api/cron/ai-retry/route.ts`, `app/api/cron/daily/route.ts`, `lib/inngest/feedback-analyze-pipeline.ts`, `app/api/ai/analyze/route.ts`, `app/api/dealer/ai-settings/route.ts`, `prisma/schema.prisma`) uçtan uca izlendi. Kod, DB, build, test çalıştırılmadı.

### 1. Admin'in kapattığı AI analizi cron üzerinden yine çalışıyor — **DOĞRULANDI**

- Ayar kontrolü yalnızca inline yolda: `app/api/feedbacks/route.ts:432-442` (`isEnabled`/`autoAnalyze` false ise `shouldAnalyze=false`, ne Inngest ne `after()` tetiklenir; feedback `aiProcessedAt=NULL` kalır).
- `app/api/cron/ai-retry/route.ts:36-46` filtresi yalnız `aiProcessedAt: null, text != null, deletedAt: null, createdAt < 3 dk`; bayi ayarına bakan hiçbir koşul yok. `createdAt` için alt sınır da yok → geçmişteki tüm "kapalı bayi" feedback'leri zamanla tek tek işlenir.
- Cron gerçekten koşuyor: `app/api/cron/daily/route.ts:11,58` `ai-retry`'ı günlük orkestratörde çağırıyor (ayrıca uç bağımsız olarak harici tetiklenebilir, bkz. aynı dosya :27-28 notu).
- `lib/inngest/feedback-analyze-pipeline.ts:30-36` yalnız `customPrompt` seçiyor; `isEnabled`/`autoAnalyze` okunmuyor. Ardından LLM çağrısı (:48), `aiProcessedAt` yazımı (:76), toksik/acil/churn bildirimleri (:87-115), otomatik telafi taslağı (:120-129), embedding + adaptif güncelleme + `processAutoReplies` (:134-136) koşulsuz çalışıyor.
- Yeniden üretim: Admin `/admin/ai-settings`'te bayi X için "AI Analiz Motoru"nu kapatır (veya bayi kendi panelinde kapatır — `app/dealer/ai-settings/page.tsx:195-199` aynı alanı yazar). Müşteri X'in QR'ına ≥5 karakter metinli feedback bırakır → inline analiz atlanır. Bir sonraki günlük cron'da `ai-retry` bu kaydı seçer, GROQ'a gönderir, analiz alanlarını doldurur, gerekirse bayiye "⚡ Müşteri Kaybı Riski" bildirimi ve otomatik yanıt/telafi taslağı üretir. "Kapalı" ayarı yalnızca gecikme yaratır.
- Ek gözlem (iddiayı güçlendirir): GROQ yoksa pipeline `local-fallback` döndürür ve `aiProcessedAt` NULL kalır (:57-63); bu kayıtlar her koşuda yeniden seçilir. Kapalı bayilerin kayıtları 15'lik partide (:43) yer kaplar; `orderBy: createdAt desc` olduğu için eski gerçek arızalı kayıtlar sürekli geriye itilebilir.
- Önem: Yüksek (maliyet + bayiye/kullanıcıya verilen "AI kapalı" sözünün çiğnenmesi, KVKK açısından veri işlemeye itiraz senaryosunda uyum riski). Düzeltme yönü raporun öneri bölümündeki `getEffectiveAISettings` kapısıyla aynı: cron sorgusuna `qrCode: { dealer: { aiSettings: { is: { isEnabled: true, autoAnalyze: true } } } }` benzeri koşul (veya satırı olmayan bayiler için `OR` ile varsayılan-açık), pipeline'ın başında da aynı kontrol (savunma derinliği; Inngest/internal uç da aynı fonksiyonu kullanıyor: `app/api/internal/inngest/feedback-analyze/route.ts:35`).

### 2. Uyarı ve modül anahtarları etkisiz — **DOĞRULANDI**

- Repo genelinde `alertOnToxic|alertOnUrgent|alertOnChurnRisk|sentimentEnabled|themeClusterEnabled|weeklyReportEnabled|monthlyReportEnabled` arandı; yalnızca şu dosyalarda geçiyor: `app/admin/ai-settings/page.tsx`, `app/dealer/ai-settings/page.tsx`, `app/api/ai/analyze/route.ts` (yalnız get/update_settings dalları, :851-940, ve varsayılanlar :975-997), `app/api/dealer/ai-settings/route.ts` (CRUD) ve `lib/ai-learning.ts:528-529` (yalnız `sentimentEnabled` istatistik amaçlı okunuyor). `AISettings` okuyan tüm noktalar (`grep prisma.aISettings`) incelendi: hiçbir analiz, bildirim veya rapor yolu bu bayrakları okumuyor.
- Bildirimler: `lib/inngest/feedback-analyze-pipeline.ts:87-115` toksik/acil/churn bildirimlerini bayrağa bakmadan oluşturuyor; inline yol `app/api/feedbacks/route.ts:496-498` toksik bildirimini koşulsuz atıyor (inline yol acil/churn bildirimi hiç atmıyor — iki yol arasında ayrıca tutarsızlık var).
- Modüller: `analyzeWithFallback` çağrılarına (`feedback-analyze-pipeline.ts:48-52`, `feedbacks/route.ts:458`) yalnız `customPrompt`, `adaptiveProfile`, `dealerId` geçiyor; modül bayrakları prompt'u/çıktıyı kısıtlamıyor, tüm alanlar her seferinde yazılıyor (pipeline :64-79).
- Yeniden üretim: Admin bayi X için "Churn Riski Uyarısı"nı ve "Churn Tahmini" modülünü kapatıp kaydeder (`page.tsx:136-139` → `analyze/route.ts:895-916` satırı günceller). X'e churn riski yüksek bir feedback gelir → `churnRisk` yine hesaplanıp kaydedilir ve bayiye "⚡ Müşteri Kaybı Riski" bildirimi düşer. Haftalık/aylık rapor anahtarları için tüketici kod hiç yok (rapor üreticileri bu satırı okumuyor).
- Önem: Yüksek değil, **Orta-Yüksek** — güvenlik açığı değil, ama kontrol paneli sistemin gerçek davranışını yanlış temsil ediyor ve bayi bildirim yorgunluğu/maliyet etkisi gerçek. Ya bayraklar tüketicilere bağlanmalı (tek `getEffectiveAISettings` kapısı + bildirim üretiminde `if (s.alertOnChurnRisk && churn > 0.7)`), ya da bağlanmayanlar UI'dan "yakında" olarak kaldırılmalı.

### 3. Bayi, admin'in kapattığı AI ayarını koşulsuz geri açabiliyor — **BELİRSİZ**

- Mekanik doğru: `app/api/dealer/ai-settings/route.ts:166-208` PATCH, `requireAuth(['DEALER','ADMIN'])` sonrası oturum sahibinin satırına beyaz listeli 18 alanı kilit kontrolü olmadan upsert ediyor; `prisma/schema.prisma:2185-2209` modelinde kilit/sahiplik/`updatedById` alanı yok; admin yazımı (`app/api/ai/analyze/route.ts:884-938`) ve bayi yazımı hiçbir audit kaydı bırakmıyor (iki dosyada `audit` geçmiyor). Bayi UI'si `isEnabled` anahtarını açıkça sunuyor (`app/dealer/ai-settings/page.tsx:351`). Ayrıca bayi `/api/ai/analyze?action=update_settings` ile de kendi satırını yazabiliyor (`analyze/route.ts:884-893`, `dealerId` hedefleme yalnız ADMIN'e açık — yetki yükseltmesi yok).
- Ancak bunun bir **hata/güvenlik açığı** olduğu doğrulanamadı: Kod tabanında (şema, admin sayfası metni `page.tsx:173` "ayarlarını yönetin", bayi sayfası) admin ayarının bayiyi bağlayan bir **politika/kilit** olarak tasarlandığına dair hiçbir işaret yok; `AISettings` satırı açıkça bayiye ait (`dealerId @unique`, bayi kendi sayfasından yönetiyor). Yani bugünkü tasarımda admin, bayinin tercihini onun adına düzenleyen bir "destek" aracı; bayinin kendi ayarını değiştirmesi yetki ihlali değil. Bir kullanıcının/verinin zarar gördüğü somut senaryo, ancak "admin maliyet/kötüye kullanım nedeniyle AI'yı zorla kapatmak istiyor" ürün gereksinimi varsayılırsa kurulabiliyor; bu gereksinim kodda tanımlı değil.
- Ayrıca 1. bulgu düzelmedikçe "kilit" anlamsız: admin kazansa bile `ai-retry` analizi yine çalıştırır.
- Önem: KRİTİK/YÜKSEK değil; **ürün kararı + denetlenebilirlik eksikliği (Orta)**. Öneri: admin tarafına plan/politika düzeyinde ayrı bir alan (`adminLocks Json?` veya `aiForcedOff Boolean` + `lockedById`, `lockedReason`) eklenip etkin ayar `bayi tercihi ∧ admin politikası` olarak hesaplanmalı; bayi UI'si kilitli anahtarı devre dışı + açıklamalı göstermeli; her iki yazım yolu `AuditLog`'a aktör/önce/sonra yazmalı.

---

## Uygulama (Dalga 2)

`/admin/ai-settings` → `/admin/ai/studio?tab=bayiler` kalıcı yönlenir. Bayi AI politikası Stüdyo'nun **Bayiler** sekmesine, global üslup kartı **Üsluplar** sekmesine, model ve kullanım bağlamı **Modeller** sekmesine taşındı. Yazım ucu `PATCH /api/admin/ai/studio/dealers/:id`: zod `.strict()`, hedefin DEALER olduğu doğrulanır, bayinin kendi yazım yoluyla aynı advisory kilit ve `baseVersion` (409), yalnız değişen alan yazılır, injection reddedilir, gerekçe zorunlu, denetim satırı ADMIN aktörüyle düşer, ardından `invalidateDealerAiPolicy` çağrılır. `analyze?action=get_settings/update_settings` dalları paylaşılan bir route'ta olduğu için silinmedi; bu yüzey artık onları çağırmıyor.

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Yetki | ÇALIŞIYOR |
| 2 | Yükleniyor | ÇALIŞIYOR. İskelet ve sunucu ön yüklemesi |
| 3 | Ayarların yüklenmesi | ÇALIŞIYOR. User(role=DEALER) tabanlı; ayar satırı olmayan bayi listede "Varsayılan" rozetiyle görünür |
| 4 | Hata durumu | ÇALIŞIYOR. `QueryState` hata kartı ve "Tekrar dene"; 429 metni zarftan gelir |
| 5-6 | Toplam bayi / AI aktif KPI'ları | ÇALIŞIYOR. `count` sorguları (gerçek bayi sayısı, AI kapalı, bağlamlı) |
| 7 | Bayi listesi | ÇALIŞIYOR. Sayfalı, aranabilir, filtreli |
| 8 | Durum göstergesi (emoji) | ÇALIŞIYOR. Metinli ve ikonlu `StatusBadge` |
| 9 | Otomatik/Manuel rozeti (çelişkili) | ÇALIŞIYOR. "AI açık/kapalı" ve ayrı bir "Otomatik analiz kapalı" rozeti |
| 10 | Boş durum | ÇALIŞIYOR |
| 11 | Bayi seçimi | ÇALIŞIYOR. `DetailSheet` (`?bayi=`), aktif satır işaretli |
| 12 | "Bayi seçin" boş durumu | KALDIRILDI. Liste + çekmece deseninde gerek kalmadı |
| 13 | AI ana anahtarı | ÇALIŞIYOR. Dalga 1'deki P0-32 ile tüm yollar (`ai-retry` dahil) `lib/ai-policy`'den okuyor; açıklama gerçek etkiyi anlatıyor |
| 14 | Otomatik analiz | ÇALIŞIYOR. Ana anahtar kapalıyken "etkisiz (değeri korunur)" olarak gösteriliyor |
| 15-23 | 9 analiz modülü anahtarı | KALDIRILDI. Hiçbir kod okumuyordu; sahte kontrol sunulmuyor (gönderilirse zod `.strict()` reddeder) |
| 24 | Haftalık rapor | ÇALIŞIYOR. `lib/weekly-digest-core` `weeklyReportEnabled`'ı okuyor ("Haftalık özet e-postası") |
| 25 | Aylık rapor | KALDIRILDI. Tüketicisi yok |
| 26-28 | Toksik / acil / kayıp riski uyarıları | ÇALIŞIYOR. Analiz hattı bildirimleri `policy.alertOn*` ile koşulluyor |
| 29 | Özel prompt | ÇALIŞIYOR. "İşletme bağlamı" adıyla; 1000 karakter sayaçlı, injection reddi; denetime yalnız uzunluğu yazılır |
| 30 | Üslup kartı | ÇALIŞIYOR. Ayrı **Üsluplar** sekmesi (global; bayi seçmek gerekmiyor) |
| 31 | Kaydet | ÇALIŞIYOR. "N değişikliği kaydet"; değişiklik yoksa pasif; "Geri al" |
| 32 | Toast'lar | ÇALIŞIYOR. `sonner`, Türkçe karakterli |
| 33 | `bootstrapSettings` (ölü kod, bozuk kodlama) | KALDIRILDI. Gerek yok: satır ilk kayıtta oluşturuluyor |
| 34 | Giriş animasyonları | KALDIRILDI. Ops kaydı sakin; Kaydet düğmesinde gecikme yok |
| 35 | Azaltılmış hareket | ÇALIŞIYOR |
| 36 | Mobil | ÇALIŞIYOR. Alttan açılan çekmece, tek kolon, ≥44px |
| 37 | Anahtarların erişilebilir adı | ÇALIŞIYOR. `Label htmlFor` + `Switch id` + `aria-describedby` |
| 38 | Analiz dili | KALDIRILDI. Analiz yolunda okunmuyor |
| 39 | Arama ve filtre | ÇALIŞIYOR |
| 40 | Kaydedilmemiş değişiklik koruması | ÇALIŞIYOR (kısmi). Değişiklik sayacı ve "Geri al" var; çekmece kapanınca form atılıyor, uyarı diyaloğu yok |
| 41 | Denetim | ÇALIŞIYOR. `ADMIN_UPDATE_AI_SETTINGS` (önce/sonra + gerekçe); bayinin kendi değişiklikleri de Geçmiş sekmesinde görünür |
| 42 | Sunucu doğrulaması | ÇALIŞIYOR |
| 43 | Bağımlılık mantığı | ÇALIŞIYOR. Ana anahtar kapalıyken alt anahtarlar etkisiz olarak işaretlenir |
| 44 | Terminoloji / i18n | ÇALIŞIYOR (TR). Her yerde "Bayi"; admin panelinde bu yüzey için i18n anahtar düzeni yok, metinler tam Türkçe karakterli |
| 45 | Admin kilidi | AÇIK. Bkz. Kalanlar |

### Kapanan bulgular
1 (Dalga 1 + bu yüzeyde dürüst açıklama), 2 (sahte anahtarlar kaldırıldı, gerçek olanlar bağlı), 4, 5, 6, 7 (kısmi: değişiklik sayacı ve geri al), 8, 9, 10, 11, 12.

### Kalanlar
- **Bulgu 3 / #45 Admin kilidi:** Bayi, admin'in kapattığı ana anahtarı kendi panelinden yeniden açabiliyor. Bu bir ürün kararı ve **ŞEMA İSTEĞİ:** `AISettings.adminLocks Json?` (+ `lockedById`, `lockedReason`). Alan eklenince bayinin PATCH'i kilitli alanı 423 ile reddetmeli. Şimdilik admin değişikliği gerekçesiyle denetimde, çakışmalar da 409 ile görünür.
- Toplu işlem ve platform varsayılanı → bayi istisnası (override) modeli yok.
