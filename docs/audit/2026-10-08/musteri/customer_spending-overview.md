# /customer/spending-overview

**Amaç:** Müşterinin tüm zamanlardaki tüketim (ziyaret) kayıtlarından türetilen özet: toplam ziyaret, ziyaret edilen işletme sayısı, kayıtlı harcama toplamı, tüketim yorumlarının ortalama puanı, son 6 ayın aylık ziyaret çubukları, en çok ziyaret edilen 8 işletme ve CSV dışa aktarım.

**Genel puan: 4,8 / 10** · **Karar: BİRLEŞTİR** (`/customer/analytics` içine "Tüm zamanlar" görünümü olarak veya `/customer/consumptions` sayfasının üst özet şeridi olarak taşınmalı; tek başına bir menü öğesi olarak kalması için yeterli değer üretmiyor)

İncelenen dosyalar: `app/customer/spending-overview/page.tsx` (256 satır), `app/customer/spending-overview/layout.tsx`, `app/customer/layout.tsx`, `app/api/customer/spending-overview/route.ts` (120 satır), `prisma/schema.prisma` (Consumption 1574, ConsumptionReview 1602, Feedback), `lib/admin-toast.ts`, `components/admin/admin-premium-hero.tsx`, `components/ui/card.tsx`, `components/dashboard/sidebar.tsx`, `lib/module-gate.ts`, `lib/module-controls.ts`, `lib/visibility-controls.ts`, `lib/redis.ts`, `lib/api-auth.ts`, `messages/tr.json` + `messages/en.json` (`customerSpendingOverview`), veri üreticileri `app/api/dealer/consumptions/route.ts`, `app/api/dealer/offline-sync/route.ts`, `app/api/admin/character-test/route.ts`, çakışan sayfalar `app/customer/analytics`, `app/customer/my-year`, `app/customer/consumptions`, `app/customer/progress-hub`, `app/customer/my-card`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Gösterdiği her sayı gerçek veriden geliyor ve doğru hesaplanıyor; ama dönem filtresi yok, aylık seride harcama yok, ay etiketleri ham `YYYY-MM`, ortalama puan ana ürün eylemi olan QR geri bildirimlerini (Feedback) hiç saymıyor. |
| UX | 4/10 | Tüketiciye "tüketim/bayi" jargonuyla konuşan, hikâyesi ve aksiyonu olmayan bir rapor ekranı; yeni kullanıcıya sıfırlar gösteriyor, hata durumunda tekrar dene yok, en çok gidilen işletmeler tıklanabilir görünüp hiçbir yere gitmiyor. |
| Görsel | 4/10 | Standart shadcn kart ızgarası + düz ilerleme çubukları; panelin geri kalanındaki oyunlaştırılmış, premium dil (rozet, küre, lig) ile kopuk; harcamayı görselleştiren tek bir grafik yok. |
| Mimari | 5/10 | Temiz ve küçük bir API, Redis önbellekli, tek gruplu ay sorgusu; ama modül kapatma kapısı (module-gate) uygulanmamış, aynı metrikler en az 3 farklı uçta tekrar hesaplanıyor, sayfa tamamen istemci tarafında `useEffect` ile veri çekiyor. |
| Performans | 6/10 | 5 sorgu (3 paralel + 2 ardışık), 60 sn Redis önbelleği, hafif istemci paketi; JS hidrasyonu → fetch şelalesi ve rota iskeleti + spinner çift yükleme durumu var. |
| Erişilebilirlik + Mobil | 5/10 | Metin tabanlı değerler okunabilir; ama KPI sayıları `<h3>` başlık olarak işaretli (h1 → h3 atlaması), yükleme/hata bölgeleri `aria-live`/`role` taşımıyor; 400 px'te 4 KPI kartı alt alta dizilip grafiği ekranın çok altına itiyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa meta verisi (başlık/açıklama) | ÇALIŞIYOR | `app/customer/spending-overview/layout.tsx:4-6`; `messages/tr.json` `layoutMetadata.customerSpendingOverview` | Açıklama "bayi dağılımı" diyor — iç jargon tüketiciye sızıyor. |
| 2 | Hero (eyebrow, başlık, açıklama, Wallet ikonu, `tone="auto"`) | ÇALIŞIYOR | `page.tsx:102-108`; `components/admin/admin-premium-hero.tsx:73,110` | Hero azaltılmış hareketi destekliyor (`useReducedMotion`). Bileşen admin hero'sunun yeniden dışa aktarımı (`components/layout/dashboard-page-hero.tsx:9-13`). |
| 3 | Kimlik doğrulama (yalnız CUSTOMER) | ÇALIŞIYOR | `route.ts:20-25` | Token-replay kontrolü `lib/api-auth.ts:64-77` üzerinden geliyor. Veri `session.user.id` ile sınırlı — IDOR yok. |
| 4 | ADMIN rolü davranışı | KISMİ | `route.ts:20` ADMIN'i kabul edip `route.ts:23-24` 403 dönüyor | Admin sayfayı açarsa yalnızca "Özet şu an yüklenemiyor" görür; neden 403 aldığı söylenmez. |
| 5 | Modül/menü görünürlük kapısı | EKSİK | `lib/module-controls.ts:28` ve `lib/visibility-controls.ts:92` `spending_overview` anahtarını tanımlıyor; `route.ts` içinde `assertModuleEnabled`/`assertMenuItemVisible` yok; yalnız `components/dashboard/sidebar.tsx:450-454` menüden gizliyor | Admin modülü kapatsa bile URL ve API çalışmaya devam ediyor. 43 müşteri API'sinden yalnız 10'u kapıyı uyguluyor. |
| 6 | Yükleniyor durumu | KISMİ | `page.tsx:110-114` | Spinner + metin; `role="status"`/`aria-live` yok. Rota düzeyinde `app/customer/loading.tsx` iskeleti zaten gösteriliyor → iskelet → spinner → içerik çift geçişi. |
| 7 | Hata durumu | KISMİ | `page.tsx:50,52-53,115-116` | 401/403/500/503 aynı tek cümleye indirgeniyor; "Tekrar dene" butonu yok; `role="alert"` yok. |
| 8 | Boş durum (hiç tüketimi olmayan kullanıcı) | KISMİ | `page.tsx:126-157` sıfır KPI'lar, `page.tsx:169-182` 6 boş çubuk, `page.tsx:204-205` "Henüz tüketim kaydı yok." | Kartı aktifleştir / ilk QR'ı okut gibi bir yönlendirme (CTA) yok; sayfa "0, 0, ₺0, —" ile karşılıyor. |
| 9 | CSV dışa aktarım butonu | KISMİ | `page.tsx:66-98, 119-124` | Çalışıyor; ama CSV formül enjeksiyonuna açık (bkz. B3), anahtarlar her dilde İngilizce (`generatedAt`, `recordedSpendTry`…), boş veride de aktif, `revokeObjectURL` tıklamadan hemen sonra çağrılıyor (`page.tsx:95-96`, bazı tarayıcılarda indirmeyi iptal edebilir — doğrulanmadı). |
| 10 | Dışa aktarım başarı bildirimi | KISMİ | `page.tsx:97`; `lib/admin-toast.ts:17` | Toast "Basarili: " önekiyle (Türkçe karakter yok) çıkıyor; İngilizce arayüzde "Basarili: CSV downloaded" görünür. Müşteri sayfası admin toast sarmalayıcısını kullanıyor. |
| 11 | KPI: Toplam ziyaret | ÇALIŞIYOR | `page.tsx:127-132`; `route.ts:36-40, 98` | `consumption.aggregate _count`. |
| 12 | KPI: Ziyaret edilen işletme | ÇALIŞIYOR | `page.tsx:133-138`; `route.ts:46-53` | `groupBy dealerId` uzunluğu. |
| 13 | KPI: Kayıtlı harcama (TRY) | KISMİ | `page.tsx:139-145`; `route.ts:39, 99` | Kaç tüketimin tutar taşıdığı (kapsam) gösterilmiyor; 40 ziyaretten 3'ünde tutar varsa toplam yanıltıcı. Üst akışta tutar doğrulanmadan yazılabiliyor (bkz. B1). |
| 14 | Harcama ipucu metni | KISMİ | `messages/tr.json` `metric.spendHint` = "İşletme tutarı girilmiş tüketimlerin toplamı." | Gerçekte tutar girilmediğinde ürün fiyatı otomatik yazılıyor (`app/api/dealer/consumptions/route.ts:246`), metin eksik/yanlış bilgilendiriyor. |
| 15 | KPI: Ortalama yorum puanı | KISMİ | `page.tsx:146-156`; `route.ts:41-45, 104` | Yalnız `ConsumptionReview`; müşterinin asıl eylemi olan QR geri bildirimleri (`Feedback.userId`, `rating`) sayılmıyor. Ondalık ayırıcı yerelleştirilmemiş (`4.5`, TR'de `4,5` olmalı), "/5" ölçeği ya da yıldız yok. |
| 16 | Yorum sayısı | ÇALIŞIYOR | `page.tsx:152-154`; `route.ts:103` | |
| 17 | Aylık ziyaret çubukları (son 6 ay) | KISMİ | `page.tsx:159-184`; `route.ts:79-92, 107` | Etiket ham anahtar: `label: key` → "2026-05" (`route.ts:90`); ay adı yerelleştirilmemiş. Yalnız ziyaret sayısı; aylık harcama yok. |
| 18 | Aylık sınırların saat dilimi | KISMİ | `route.ts:9-16` (sunucu yerel saati), `route.ts:83` (`date_trunc` UTC) | Vercel'de UTC'de tutarlı, ama Türkiye (UTC+3) için ayın 1'i 00:00–03:00 arası ziyaretler önceki aya yazılıyor. UTC olmayan ortamda (yerel Windows) ilk ayın başındaki satırlar haritada eşleşmeyip düşüyor. Yorum (`route.ts:77-78`) "yerel aya göre grupla" diyor ama SQL UTC'ye göre grupluyor. |
| 19 | En çok ziyaret edilen 8 işletme listesi | ÇALIŞIYOR | `page.tsx:186-235`; `route.ts:54-74` | Sıralama doğru, `#1…#8` rozetleri var. |
| 20 | İşletme logosu / baş harf yedeği | KISMİ | `page.tsx:218-224` | Ham `<img>` (next/image yok, `loading="lazy"` yok); `toUpperCase()` Türkçe değil (`i`→`I`, `İ` değil); ad yoksa etiket ham `dealerId` (cuid) olarak kullanıcıya gösteriliyor (`route.ts:71`). |
| 21 | İşletme satırı hover efekti | SAHTE | `page.tsx:208-213` `transition-colors hover:bg-muted/30` | Satır tıklanabilir gibi davranıyor ama ne link ne buton; hiçbir yere gitmiyor. Projede hazır desen var: `/customer/nearby?focus=<dealerId>` (`components/customer/recommendations-section.tsx:64`). |
| 22 | İşletmeler boş durumu | ÇALIŞIYOR | `page.tsx:204-205` | |
| 23 | "Tüketim geçmişi" bağlantısı | ÇALIŞIYOR | `page.tsx:195-201` | |
| 24 | "Geri bildirimlerim" / "Yakınımdakiler" bağlantıları | ÇALIŞIYOR | `page.tsx:238-251` | "Yakınımdakiler" `discovery` modülüne bağlı (`sidebar.tsx`); modül kapalıysa da link gösteriliyor (davranışı doğrulanmadı). |
| 25 | Redis önbelleği (60 sn) | ÇALIŞIYOR | `route.ts:28-31, 109` | Yeni tüketim/yorumda geçersiz kılınmıyor; QR okuttuktan hemen sonra sayfaya gelen kullanıcı 60 sn'ye kadar eski veri görür. İstemci `cache: 'no-store'` diyor (`page.tsx:47`) ama sunucu önbelleği bunu etkisizleştiriyor — bilinçli, ama kullanıcıya "son güncelleme" gösterilmiyor. |
| 26 | Yerel sayı / para biçimi | ÇALIŞIYOR | `page.tsx:29-41` | Puan kartı (#15) hariç. |
| 27 | TR/EN çeviri anahtarları | ÇALIŞIYOR | `messages/tr.json`, `messages/en.json` `customerSpendingOverview.*` — tümü mevcut | API hata metinleri sabit Türkçe (`route.ts:24, 116`) ama istemcide gösterilmiyor. |
| 28 | Azaltılmış hareket | ÇALIŞIYOR | Sayfada animasyon yok; hero `admin-premium-hero.tsx:35,126` | Hareket zaten yok denecek kadar az — mikro-etkileşim eksikliği ayrı bulgu. |
| 29 | Mobil yerleşim | KISMİ | `page.tsx:126` `sm:grid-cols-2 lg:grid-cols-4`; `page.tsx:119-124` | 400 px'te 4 KPI tek sütunda (~4 × 110 px), grafik ekranın altına itiliyor; CSV butonu tek başına bir satır kaplıyor. |
| 30 | Başlık semantiği / ekran okuyucu | KISMİ | `page.tsx:130,136,142,149` sayılar `CardTitle` (= `<h3>`, `components/ui/card.tsx:44`) | Başlık gezintisinde "128", "₺4.500" gibi başlıklar listelenir; h1→h3 atlaması. Tanım listesi (`dl/dt/dd`) olmalı. |
| 31 | Dönem filtresi (30 gün / 3 ay / yıl / tümü) | EKSİK | — | `/customer/analytics` bunu sunuyor (`app/customer/analytics/page.tsx:186-194`). |
| 32 | Aylık harcama serisi / ortalama sepet | EKSİK | — | Sayfanın adı "Harcama özeti" ama harcamanın zamana dağılımı yok. |
| 33 | Önceki döneme göre değişim (delta) | EKSİK | — | |
| 34 | Kategori / ürün kırılımı | EKSİK | — | `Consumption.productId` mevcut (`schema.prisma` Consumption). |
| 35 | Harcamadan kazanılan puan/XP bağlantısı | EKSİK | — | Tüketim pasif XP üretiyor (`app/api/dealer/consumptions/route.ts:300-305`) ama sayfa bunu göstermiyor. |
| 36 | İşletme detayına geçiş | EKSİK | — | Bkz. #21. |
| 37 | Paylaşılabilir özet / "Wrapped" kartı | EKSİK | — | `/customer/my-year` kısmen bu işi yapıyor. |
| 38 | Son güncelleme zamanı / yenile | EKSİK | `generatedAt` payload'da var (`route.ts:96`) ama UI'da gösterilmiyor | |

**Durum sayımı:** ÇALIŞIYOR 15 · KISMİ 14 · BOZUK 0 · SAHTE 1 · EKSİK 8 (toplam 38)

---

## Bulgular

### B1 — Tüketim verisi bayi tarafından doğrulanmadan şişirilebiliyor; bu sayfanın tüm sayıları etkileniyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / güvenlik (üst akış)
- **Kanıt:** `app/api/dealer/offline-sync/route.ts:100-101` (öğeler istek gövdesinden okunuyor), `:128-131` (yalnız kuyruk kaydının sahipliği kontrol ediliyor, durumu — `SYNCED` olup olmadığı — kontrol edilmiyor), `:142` (`item.payload` gövdeden geliyor, DB'deki kuyruk payload'ı değil), `:214-223` (`amount: amount ? parseFloat(amount) : null` — negatif, `NaN`, `Infinity` ya da 1e12 gibi değerler doğrulanmadan yazılıyor; yalnız `status: 'ACTIVATED'` kontrolü, rate limit yok). Normal uçta da üst sınır yok: `lib/validations.ts:274` `z.number().nonnegative()` (max yok).
- **Sorun:** Bir bayi aynı sahip olduğu kuyruk `id`'sini tekrar tekrar PATCH ederek bir müşterinin hesabına sınırsız tüketim ekleyebilir ve keyfi tutar yazabilir. Bu sayfada toplam ziyaret, işletme sıralaması (#1 olmak), aylık çubuklar ve "Kayıtlı harcama" doğrudan bundan beslenir. `NaN`/`Infinity` toplamı JSON'da `null`'a döner ve kullanıcı ₺0 görür; negatif tutarlar toplamı düşürür.
- **Profesyonel öneri:** (1) `processConsumption` payload'ını istek gövdesinden değil, `owned` kaydının DB'deki `payload`'ından okuyun ve yalnız `PENDING`/`FAILED` durumundaki öğeleri işleyin (idempotency: `updateMany where status in [PENDING, FAILED]` ile önce "işleniyor" kilidi alın). (2) Offline yolu, canlı uçla aynı `createConsumptionSchema` ve aynı rate-limit/kart durumu kontrollerinden geçirin — en temizi ortak bir `createConsumptionService()` fonksiyonu. (3) `amount` için iş kuralına dayalı üst sınır (`max(100_000)`) ve `Number.isFinite` kontrolü. (4) Gösterim tarafında `recordedSpend` için `Number.isFinite` koruması. Bu madde `[[points-economy-invariants]]` ile aynı aileden: her veri üreten yol aynı doğrulamadan geçmeli.
- **Efor:** M

### B2 — Modül kapatma kapısı uygulanmıyor; admin kapatsa da sayfa ve API açık
- **Önem:** orta · **Kategori:** yetki / mimari
- **Kanıt:** `lib/module-controls.ts:28` (`spending_overview`, `scope: 'customer'`), `lib/visibility-controls.ts:92`; `app/api/customer/spending-overview/route.ts:18-25` içinde `assertModuleEnabled` / `assertMenuItemVisible` çağrısı yok; yalnız `components/dashboard/sidebar.tsx:443-455` menüden gizliyor; `proxy.ts` modül kontrolü yapmıyor.
- **Sorun:** Admin panelindeki anahtar yalnız menüyü saklıyor; doğrudan URL, `/customer/discover` bağlantısı (`app/customer/discover/page.tsx:60`), `my-card` (`app/customer/my-card/page.tsx:624`) ve `progress-hub` (`app/customer/progress-hub/page.tsx:236`) bağlantıları çalışmaya devam ediyor. Admin "kapattım" sanıyor.
- **Profesyonel öneri:** API'nin başına `await assertModuleEnabled('spending_overview', { role: 'customer', request, userId })` ekleyin; sayfa tarafında da diğer sayfalardaki çapraz bağlantılar modül durumuna göre gizlenmeli. Sistem genelinde 43 müşteri API'sinden yalnız 10'u kapıyı uyguluyor — tek tek yamalamak yerine `lib/module-gate.ts` üzerinden rota → modül anahtarı haritası kuran bir `withModuleGate(handler, key)` sarmalayıcısı ve rota düzeyinde bir sunucu bileşeni koruması (`app/customer/<segment>/layout.tsx` içinde `notFound()`/yönlendirme) önerilir.
- **Efor:** S (bu sayfa) / M (sistem geneli)

### B3 — CSV dışa aktarımı formül enjeksiyonuna açık
- **Önem:** orta · **Kategori:** güvenlik
- **Kanıt:** `page.tsx:69-72` (`esc` yalnız çift tırnağı kaçırıyor), `page.tsx:84-87` (`d.label` = bayinin kontrol ettiği `businessName`/`name`, `route.ts:71`).
- **Sorun:** Bir işletme adını `=HYPERLINK("http://…","Tıkla")` veya `@SUM(...)`/`+cmd|...` ile başlatırsa, müşteri indirdiği CSV'yi Excel/Sheets'te açtığında formül çalışır (OWASP "CSV Injection"). Saldırgan bayi, kurban müşteri.
- **Profesyonel öneri:** `esc` içinde `=`, `+`, `-`, `@`, `\t`, `\r` ile başlayan hücrelerin başına `'` ekleyin. CSV üretimini istemciden alıp `lib/csv.ts` gibi ortak, test edilmiş bir yardımcıya taşıyın (projede başka CSV dışa aktarımları da varsa aynı yardımcıyı kullansınlar). Anahtarları kullanıcının diline çevirin ve tek "anahtar;değer" listesi yerine iki sayfa mantığında (özet + işletmeler tablosu) üretin.
- **Efor:** S

### B4 — Müşteri sayfası admin toast'ını kullanıyor: "Basarili: " öneki, dil karışıklığı
- **Önem:** orta · **Kategori:** i18n / tutarlılık
- **Kanıt:** `page.tsx:12, 97`; `lib/admin-toast.ts:13,17,19` (`'Bilgi: '`, `'Basarili: '`, `'Dikkat: '` sabit önekleri). `app/customer` altında 26 dosya aynı sarmalayıcıyı içe aktarıyor.
- **Sorun:** Tüketiciye Türkçe karakteri bozuk "Basarili: CSV indirildi" ya da İngilizce arayüzde "Basarili: CSV downloaded" gösteriliyor. Önek, sonner'ın zaten verdiği başarı ikonunu tekrar ediyor.
- **Profesyonel öneri:** Müşteri paneli için öneksiz, i18n'li bir `lib/app-toast.ts` (doğrudan `sonner` + `t()`) oluşturup 26 dosyayı oraya taşıyın; admin önekini de en azından `Başarılı` olarak düzeltip `t()`'den geçirin.
- **Efor:** S

### B5 — Ortalama puan ana ürün eylemini (QR geri bildirimi) saymıyor
- **Önem:** orta · **Kategori:** yanlış/eksik veri · UX
- **Kanıt:** `route.ts:41-45` yalnız `prisma.consumptionReview`; `Feedback` modelinde `userId` + `rating` mevcut (`prisma/schema.prisma` `model Feedback`). Sayfa aynı anda "Geri bildirimlerim" bağlantısı veriyor (`page.tsx:239-244`).
- **Sorun:** Qratex'in çekirdek eylemi QR okutup geri bildirim bırakmak. Kullanıcı 30 geri bildirim bırakmış olsa bile kart "— / 0 adet tüketim yorumu" gösterebilir; kullanıcı açısından bu sayı bozuk görünür. (Karakter rozeti için ConsumptionReview'ın ayrı tutulması bilinçli bir karar; ama bu ekran rozet ekranı değil.)
- **Profesyonel öneri:** KPI'yı "Değerlendirmelerin" olarak yeniden tanımlayın: Feedback + ConsumptionReview birleşik sayı ve ağırlıklı ortalama; alt satırda kırılım ("22 QR geri bildirimi · 8 ziyaret yorumu"). Ortalamayı `nf` ile yerelleştirin (`4,5`), "/5" ve 5 yıldızlık görsel ekleyin. Değerlendirilmemiş ziyaret sayısını ("3 ziyaretin yorum bekliyor") `/customer/consumptions` filtresine bağlayan bir CTA ekleyin — hem veri kalitesi hem XP için güçlü bir dönüşüm noktası.
- **Efor:** S–M

### B6 — Aylık seri ham `YYYY-MM` etiketli ve UTC sınırlı
- **Önem:** orta · **Kategori:** UX / doğruluk
- **Kanıt:** `route.ts:90` (`label: key`), `page.tsx:172` (etiket doğrudan basılıyor); `route.ts:9-16` sunucu yerel saati, `route.ts:83` `date_trunc('month', "createdAt")` (kolon UTC tutuluyor); `route.ts:77-78` yorumu davranışla çelişiyor.
- **Sorun:** Kullanıcı "2026-05" görüyor; "Mayıs" değil. Türkiye kullanıcısı için ayın ilk 3 saati önceki aya düşüyor (ör. 1 Ekim 01:30'daki gece ziyareti Eylül'de). UTC olmayan bir ortamda ilk ayın sınırındaki satırlar sessizce kayboluyor.
- **Profesyonel öneri:** API ayı `date_trunc('month', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')` ile gruplasın; sınırlar da aynı saat diliminde hesaplansın (ör. kullanıcı tercihine bağlı `tz`). Etiketi istemcide `Intl.DateTimeFormat(locale, { month: 'short' })` ile üretin; içinde bulunulan ayı "Bu ay" olarak vurgulayın. Yorum satırını düzeltin.
- **Efor:** S

### B7 — "Kayıtlı harcama" kapsamı görünmüyor; ipucu metni gerçeği yansıtmıyor
- **Önem:** orta · **Kategori:** veri sunumu / güven
- **Kanıt:** `route.ts:39, 99`; `app/api/dealer/consumptions/route.ts:246` (`amount: amount || product?.price || null`); `messages/tr.json` `spendHint`.
- **Sorun:** Tutar opsiyonel (`schema.prisma` `amount Float?`). Ziyaretlerin çoğunda tutar yoksa toplam, gerçek harcamanın küçük ve keyfi bir kesiti olur; kullanıcıya bunun ne kadarını kapsadığı söylenmiyor. İpucu "işletme tutarı girilmiş" diyor ama ürün fiyatı da otomatik yazılıyor.
- **Profesyonel öneri:** API'ye `_count: { amount: true }` ekleyip "40 ziyaretin 12'sinde tutar kayıtlı" kapsam göstergesi koyun; ortalama sepet (`sum / countWithAmount`) hesaplayın. Kapsam düşükse (%30 altı) sayıyı ikincil göstermek ve "harcama verisi işletmenin girdiğine bağlıdır" açıklaması eklemek güveni artırır. İpucu metnini "İşletmenin girdiği tutar veya ürün fiyatı" olarak düzeltin.
- **Efor:** S

### B8 — Tıklanabilir görünen ama işlevsiz işletme satırları; dealerId sızıntısı
- **Önem:** düşük · **Kategori:** UX / gizlilik-hijyen
- **Kanıt:** `page.tsx:208-213` (hover efekti, link yok); `route.ts:71` (`label: d?.businessName || d?.name || row.dealerId`); `page.tsx:222` (`toUpperCase()`); `page.tsx:219` ham `<img>`.
- **Sorun:** Hover geri bildirimi tıklama beklentisi yaratıyor. Adı olmayan bayide kullanıcıya cuid gösteriliyor. Türkçe baş harf hatası ("ilhan" → "IL").
- **Profesyonel öneri:** Satırı `Link href={`/customer/nearby?focus=${dealerId}`}` yapın (projede yerleşik desen) ve satıra "son ziyaret", "toplam harcama", "puanın" gibi ikinci satır bilgisi ekleyin. Etiket yedeğini çevrilmiş "İsimsiz işletme" yapın. `toLocaleUpperCase(locale)` ve `next/image` (ya da en azından `loading="lazy" decoding="async"` + boyut) kullanın.
- **Efor:** S

### B9 — Yükleme/hata/boş durumları ürün kalitesinde değil
- **Önem:** düşük · **Kategori:** UX / erişilebilirlik
- **Kanıt:** `page.tsx:110-116`; `app/customer/loading.tsx` (rota iskeleti); `page.tsx:126-157` (yeni kullanıcıda sıfırlar).
- **Sorun:** Rota iskeleti → spinner → içerik çift geçişi; hata durumunda tekrar deneme yok ve 401/403/503 ayırt edilmiyor; yeni kullanıcı sıfırlarla karşılanıyor.
- **Profesyonel öneri:** Sayfanın son düzenine birebir uyan bir iskelet (4 KPI + grafik + liste) ve `role="status"`; hata için `role="alert"` + "Tekrar dene" (aynı `load()` fonksiyonunu çağıran) + 503'te "bakım" mesajı; `totals.visits === 0` için illüstrasyonlu boş durum: "İlk ziyaretini kaydet — kartını işletmede okut" + `/customer/my-card` ve `/customer/scan` CTA'ları.
- **Efor:** S

### B10 — KPI'lar başlık olarak işaretli; mobilde bilgi yoğunluğu düşük
- **Önem:** düşük · **Kategori:** erişilebilirlik / mobil
- **Kanıt:** `page.tsx:130,136,142,149` → `components/ui/card.tsx:44` (`<h3>`); `page.tsx:126` (`sm:grid-cols-2`, mobilde tek sütun).
- **Sorun:** Ekran okuyucu başlık listesi sayılardan oluşuyor; hero `h1`'den sonra `h2` yok. 400 px'te ilk ekran yalnız KPI'larla doluyor.
- **Profesyonel öneri:** KPI'ları `<dl>` içinde `dt`/`dd` olarak işaretleyin, bölüm başlıklarını `h2` yapın. Mobilde 2×2 kompakt KPI ızgarası (`grid-cols-2`), CSV butonunu hero aksiyon alanına veya bir "…" menüsüne taşıyın.
- **Efor:** S

### B11 — Tamamen istemci tarafı veri çekme; önbellek geçersiz kılınmıyor
- **Önem:** düşük · **Kategori:** performans / mimari
- **Kanıt:** `page.tsx:1, 43-61` (`'use client'` + `useEffect` fetch); `route.ts:30-31, 109` (60 sn TTL, yazma yollarında `spending-overview:` anahtarı silinmiyor — repo genelinde başka referans yok); `route.ts:57-63` ve `82-88` ilk `Promise.all`'dan sonra ardışık.
- **Sorun:** JS yükle → hidrate et → fetch → render şelalesi; QR sonrası gelen kullanıcı yeni ziyaretini 60 sn görmeyebilir. Ay sorgusu ilk paralel gruba dahil edilebilecekken ardışık.
- **Profesyonel öneri:** Hesaplamayı `lib/customer/spending-summary.ts` gibi bir sunucu fonksiyonuna çıkarın; sayfayı sunucu bileşeni yapıp bu fonksiyonu doğrudan çağırın (istemci adası yalnız CSV/etkileşim için). Tüketim/yorum oluşturan yollarda `redis.del('spending-overview:'+customerId)` ile geçersiz kılın. Ay sorgusunu ilk `Promise.all` içine alın. `generatedAt`'ı "x dk önce güncellendi" olarak gösterin.
- **Efor:** M

### B12 — Aynı metrikler üç ayrı uçta, üç farklı tanımla hesaplanıyor
- **Önem:** düşük · **Kategori:** mimari / tutarlılık
- **Kanıt:** Bu sayfa: tüm zamanlar `_sum.amount` (`route.ts:39`); `/api/customer/analytics`: dönemli `totalSpent` + `favoriteDealers` + `monthlyData` (`app/api/customer/analytics/route.ts:82-84, 117, 299-306`; puan "tahmini" `amount * 2`, satır 306); `/api/customer/my-year`: yıllık `totalSpent` + `topDealer` (`app/api/customer/my-year/route.ts:63, 108-109`).
- **Sorun:** Kullanıcı üç sayfada üç farklı "harcama" ve "favori işletme" görebilir; tanımlar (dönem, ürün fiyatı yedeği, sayım sınırı) ayrışıyor. Her biri ayrı bakım yükü.
- **Profesyonel öneri:** Tek bir `getCustomerSpendSummary(customerId, { from, to })` servisi; üç ekran bu servisin farklı dönem parametreleriyle tüketicisi olsun. Bkz. "Çakışmalar".
- **Efor:** M

### B13 — Tüketiciye dönük metinlerde iç jargon
- **Önem:** düşük · **Kategori:** içerik / UX yazımı
- **Kanıt:** `messages/tr.json` `customerSpendingOverview.metric.visits` "Toplam tüketim / ziyaret", `subtitle` "Tüketim kayıtlarınızdan türetilen metrikler", `layoutMetadata.customerSpendingOverviewDescription` "bayi dağılımı"; eyebrow "Finans ve ziyaret".
- **Sorun:** "Tüketim", "bayi", "metrik", "türetilen" B2B/veri dili; tüketici uygulaması (Starbucks, Monzo) "Ziyaretlerin", "Bu ay 4 kez uğradın" gibi ikinci tekil, sıcak dil kullanır. "Toplam tüketim / ziyaret" eğik çizgili etiket kararsızlık hissi veriyor.
- **Profesyonel öneri:** Tüm metin setini tüketici sesiyle yeniden yazın: "Ziyaretlerin", "Uğradığın mekân", "Kayıtlı harcaman", "En sık uğradığın yerler"; açıklamayı bir cümlelik içgörüye çevirin ("Bu ay en çok X'e uğradın").
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Dönem seçici + karşılaştırma** (Monzo/Revolut "Bu ay vs geçen ay", yüzde değişim okları): Şu an yalnız "tüm zamanlar" + sabit 6 ay. 30 gün / 3 ay / bu yıl / tümü segmentli kontrol ve her KPI'da delta rozeti.
2. **Harcama zaman serisi ve ortalama sepet** (Revolut Analytics): Aylık harcama sütunları + ziyaret çizgisi; ortalama sepet ve "en pahalı/en sık" içgörüleri. Şu an yalnız ziyaret sayısı var.
3. **Kategori/ürün kırılımı** (Monzo kategorileri, Starbucks sipariş geçmişi): `Consumption.productId` → `Product` kategorisiyle halka grafik; "En sık içtiğin: Latte".
4. **Harcama → ödül bağlantısı** (Starbucks Rewards "Stars earned"): Bu ziyaretlerden kazanılan XP/puan, bir sonraki ödüle kalan mesafe, en çok puan getiren işletme. Sayfanın oyunlaştırılmış ekosisteme bağlanması için kritik.
5. **İşletme detay sayfası / tekrar ziyaret teşviki** (Starbucks "Favorite store"): Her işletme satırında son ziyaret, toplam harcama, açık kampanya; tıklanınca mekân sayfası.
6. **Paylaşılabilir özet kartı** (Spotify Wrapped): Ay/yıl sonu "Mekân kişiliğin" kartı; mevcut karakter rozeti sistemiyle doğal bir köprü. (Şu an `/customer/my-year` kısmen karşılıyor.)
7. **Bütçe / hedef** (Monzo "Budgets" — opsiyonel, ürün kararına bağlı): "Bu ay kahveye ₺X" hedefi ve ilerleme halkası.
8. **Değerlendirilmemiş ziyaret hatırlatıcısı**: "3 ziyaretin yorum bekliyor — +XP" kartı (Duolingo tarzı tek net sonraki adım).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Harcama raporu" değil, **"Mekân hayatın"**: kullanıcı açtığında 3 saniyede *bu ay ne kadar dışarıdaydım, en çok nereye gittim, bundan ne kazandım, sıradaki adımım ne* sorularının cevabını alsın. Ton: Monzo'nun sade, güven veren finans netliği + Starbucks'ın ödül bağlamı; Wrapped tarzı paylaşım yalnız dönem sonunda.

**Yerleşim (mobil öncelikli, tek sütun → masaüstünde 12 kolon):**
1. **Dönem şeridi** (sticky, `top: env(safe-area-inset-top)`): `Bu ay · 3 ay · Bu yıl · Tümü` segmentli kontrol.
2. **Kahraman sayı kartı:** Büyük tek sayı (dönem harcaması veya kapsam düşükse ziyaret sayısı), altında önceki döneme göre delta ve kapsam satırı ("12/40 ziyarette tutar kayıtlı"). Yanında 2×2 mini KPI: ziyaret, mekân, ortalama sepet, ortalama puan (yıldızlı).
3. **Zaman grafiği:** Aylık/haftalık sütun (harcama) + nokta çizgi (ziyaret); dokunma ile değer balonu; yerelleştirilmiş ay adları; içinde bulunulan dönem vurgulu. Hafif bir SVG/Recharts bileşeni yeterli.
4. **"Sık uğradıkların"** listesi: logo, ad, son ziyaret, ziyaret sayısı, harcama, bu mekândaki aktif kampanya rozeti; satır tıklanınca `/customer/nearby?focus=`.
5. **Kazanç bandı:** "Bu ziyaretlerden 1.240 XP kazandın · Sonraki ödüle 260 XP" → `/customer/rewards`.
6. **Sonraki adım kartı:** Değerlendirilmemiş ziyaretler / boş durumda "ilk ziyaretini kaydet".
7. **Taşma menüsü:** CSV / paylaş.

**Motion / 3B (ölçülü):** 3B bu sayfada yersiz — finansal netlik ekranı. Önerilen hareket yalnız anlam taşıyan yerlerde: kahraman sayıda ilk yüklemede kısa bir sayaç (count-up, 600 ms), grafik sütunlarının `scaleY` ile kademeli girişi (`m as Motion`, global LazyMotion ile, `stagger 40 ms`), dönem değişiminde çapraz geçiş. Tümü `useReducedMotion()` ile anında son duruma düşmeli. Paylaşım kartı (Wrapped) ayrı bir ekranda daha zengin olabilir; ana ekranda değil.

**Veri / API değişiklikleri:**
- `lib/customer/spend-summary.ts`: `getCustomerSpendSummary(customerId, { from, to, tz })` → `{ totals: { visits, dealers, spend, spendCoverage, avgBasket }, delta: {...}, series: [{ periodStart, visits, spend }], topDealers: [{ dealerId, label, logo, visits, spend, lastVisitAt }], ratings: { feedback: {count, avg}, consumptionReview: {count, avg} }, xpEarned, unreviewedCount }`.
- Tek SQL ile seri: `date_trunc(..., "createdAt" AT TIME ZONE 'Europe/Istanbul')` + `SUM(amount) FILTER (WHERE amount IS NOT NULL)`, `COUNT(amount)`.
- `GET /api/customer/spending-overview?range=month|quarter|year|all` (zod ile doğrulanmış), `assertModuleEnabled('spending_overview')`, Redis anahtarı `spend:{customerId}:{range}` ve tüketim/yorum yazma yollarında geçersiz kılma.
- Sayfa sunucu bileşeni olarak ilk dönemi önceden render etsin; dönem değişimi istemcide SWR ile.
- Üst akış: offline-sync tüketim yolunun canlı yolla aynı servis + doğrulamaya alınması (B1) — bu yapılmadan harcama ekranının güvenilirliği iddia edilemez.

---

## Çakışmalar / birleştirme önerisi

| Sayfa | Çakışan içerik | Kanıt |
|---|---|---|
| `/customer/analytics` | Dönemli toplam harcama, favori işletmeler, aylık veri (harcama dahil) — bu sayfanın neredeyse üst kümesi | `app/customer/analytics/page.tsx:186-194, 253, 486, 573`; `app/api/customer/analytics/route.ts:82-84, 299-306` |
| `/customer/my-year` | Yıllık ziyaret sayısı, toplam harcama, en çok gidilen işletme | `app/customer/my-year/page.tsx:15`; `app/api/customer/my-year/route.ts:63, 108-109` |
| `/customer/consumptions` | Aynı tüketim kayıtlarının listesi + sayaç kartları; bu sayfa ona bağlanıyor | `page.tsx:195-201`; `app/customer/consumptions/page.tsx:154, 319-321` |
| `/customer/progress-hub`, `/customer/my-card` | Bu sayfaya giriş kapıları (çapraz link) | `app/customer/progress-hub/page.tsx:236`; `app/customer/my-card/page.tsx:624` |

**Öneri:** `spending-overview` ayrı bir menü öğesi olarak kaldırılmalı ve iki yere bölünmeli:
1. **`/customer/consumptions` (Kartım grubu)** sayfasının üstüne kompakt bir "Özet" şeridi (ziyaret, mekân, harcama + kapsam, değerlendirilmemiş ziyaret CTA'sı) — kullanıcının ziyaretleriyle ilgili tek ev burası olur.
2. **`/customer/analytics` (Analizler grubu)** dönem seçicisine "Tümü" seçeneği + yukarıdaki yeniden tasarım vizyonundaki grafik/işletme/kazanç bölümleri; tek bir `getCustomerSpendSummary` servisi hem analytics'i hem `my-year`'ı besler.

`/customer/spending-overview` URL'si `next.config` yönlendirmesiyle `/customer/analytics?range=all` adresine 308 yönlendirilmeli; `components/dashboard/sidebar.tsx:285`, `app/customer/discover/page.tsx:60`, `app/customer/my-card/page.tsx:624`, `app/customer/progress-hub/page.tsx:236`, `lib/qra-knowledge-base.ts:37`, `lib/module-controls.ts:28`, `lib/visibility-controls.ts:92` ve `lib/data/product-roadmap.json:75` referansları güncellenmeli. Analizler grubundaki `progress-hub`, `journey-score`, `analytics`, `my-year` dörtlüsü de benzer şekilde birleştirme adayıdır (ayrı denetim konusu).

## Doğrulama (şüpheci inceleme)

### İddia: Offline-sync tüketim yolu doğrulamasız ve tekrar oynatılabilir

**Karar: DOĞRULANDI** (çekirdek iddia doğru; NaN/Infinity alt iddiası doğrulanmadı, şiddet "bayi rolü gerektirir" kaydıyla değerlendirilmeli).

**Okunan kod ve kanıt:**
- `app/api/dealer/offline-sync/route.ts:100-101` — `items` doğrudan istek gövdesinden alınıyor.
- `:128-131` — kuyruk kaydı için yalnız `{ id, dealerId }` sahipliği kontrol ediliyor; `status` seçilmiyor ve `PENDING/FAILED` filtresi yok. GET (`:21-26`) bu filtreyi uyguluyor ama PATCH uygulamıyor → `SYNCED` olmuş bir kuyruk id'si tekrar gönderildiğinde yeniden işleniyor.
- `:140-142` — hem `action` hem `payload` gövdeden geliyor (`item.payload`); DB'de saklanan `offlineQueue.payload` hiç okunmuyor. Yani bayi, sahip olduğu herhangi bir kuyruk id'si ile istediği yükü (başka `cardToken`, başka `amount`) işletebiliyor.
- `:200-223` — `processConsumption`: zod yok, rate limit yok, ürün sahipliği kontrolü yok (`productId` serbestçe yazılıyor), `amount: amount ? parseFloat(amount) : null`. `parseFloat("-1000000")` → `-1000000`, `parseFloat("1e300")` → `1e300`; `Consumption.amount` `Float?` (`prisma/schema.prisma:1580`), yani ikisi de kabul edilir.
- Karşılaştırma — canlı uç `app/api/dealer/consumptions/route.ts:131-139` `createConsumptionSchema` (negatif reddedilir, `lib/validations.ts:274`; üst sınır yok — iddiadaki bu not da doğru), `:180-207` kart+bayi başına 5/dk DB tabanlı rate limit, `:212-238` ürün sahipliği, `:251-264` audit log. Offline yolda bunların hiçbiri yok.
- Yan bulgu: `:153` ve `:168` `item.retries` gövdeden okunuyor; istemci (`app/dealer/dealer-dashboard-client.tsx:109`) `retries` göndermiyor → `nextRetries` daima 1, `DEAD` durumuna hiçbir zaman geçilmiyor (sonsuz retry koruması fiilen çalışmıyor).
- `proxy.ts` `/api/` için ek bir engel koymuyor; yetki yalnız `requireAuth(['DEALER','ADMIN'])`.

**Yeniden üretim senaryosu (bayi hesabıyla):**
1. `POST /api/dealer/offline-sync` gövde `{ "action": "CREATE_CONSUMPTION", "payload": {} }` → bir kuyruk id'si `Q` alınır.
2. `PATCH /api/dealer/offline-sync` gövde `{ "items": [ {"id":"Q","action":"CREATE_CONSUMPTION","payload":{"cardToken":"<müşteri kart token'ı>","amount":"-5000000"}} ×100 ] }` → aynı `Q` id'si 100 kez sahiplik kontrolünden geçer, her biri ayrı `Consumption` satırı oluşturur (rate limit yok). İstek sınırsız tekrarlanabilir.
3. Müşterinin `/customer/spending-overview` sayfasında (`app/api/customer/spending-overview/route.ts` `consumption.aggregate/groupBy`, 60 sn Redis önbelleği sonrası) ziyaret sayısı yüzlerce artar, bu bayi "Sık uğradıkların" listesinde 1. sıraya çıkar, aylık çubuklar şişer ve "Kayıtlı harcama" negatif bir değer (ör. `-₺500.000.000`) gösterir; CSV dışa aktarımı da aynı yanlış veriyi taşır.

**Kötü niyet gerektirmeyen ikinci senaryo:** Bayi panelini iki sekmede açık tutan (veya "Senkronize et"e çift tıklayan) bir bayi aynı bekleyen listeyi iki kez PATCH'ler; status kontrolü olmadığından aynı offline tüketim iki kez yazılır → müşteri sayfasında mükerrer ziyaret. Atomik bir "PENDING→PROCESSING" geçişi olmadığı için yarış da açık.

**Kayıtlar / sınırlar:**
- Saldırgan **bayi** rolünde olmalı ve hedef müşterinin kart token'ını bilmeli (QR taramasından elde edilir). Canlı uç da bayiye tüketim yazdırıyor; bu yolun farkı rate limit, negatif tutar, ürün sahipliği, audit log ve tekrar oynatma korumalarını atlatmasıdır.
- Offline yol pasif puan **basmıyor** (canlı uçtaki `:327-350` bloğu burada yok); dolayısıyla doğrudan puan enflasyonu yok. Ancak her sahte tüketim müşteriye "değerlendirilebilir ziyaret" açar; `ConsumptionReview` üzerinden ödül/rozet akışlarına etkisi bu incelemede doğrulanmadı.
- **NaN/Infinity alt iddiası doğrulanmadı:** `parseFloat("abc")` → `NaN`, `parseFloat("Infinity")` → `Infinity` üretir, fakat Prisma 5'in bu değerleri `Float` alanına yazıp yazmadığı (reddedip `catch`'e düşmesi daha olası) kod okumasıyla kesinleşmedi. Negatif ve çok büyük sonlu değerler ise kesin olarak yazılır.

**Önerilen düzeltme (ürün seviyesi):**
- Tüketim yaratmayı tek bir servis fonksiyonuna taşı (`lib/consumption/create-consumption.ts`): `createConsumptionSchema` (+ `amount` için makul üst sınır, ör. `.max(1_000_000)` ve `.finite()`), kart durumu, ürün sahipliği, DB tabanlı rate limit, audit log, bildirim ve puan mantığı burada; canlı uç ve offline-sync bu servisi çağırsın.
- PATCH yalnız `ids` kabul etsin; `action/payload` DB'deki kuyruk kaydından okunsun. İşlem başında atomik sahiplenme: `updateMany({ where: { id, dealerId, status: { in: ['PENDING','FAILED'] }, retries: { lt: MAX } }, data: { status: 'PROCESSING' } })` → `count === 0` ise atla. Böylece hem tekrar oynatma hem çift sekme yarışı kapanır.
- `retries` değeri gövdeden değil DB'den okunmalı (`DEAD` geçişi gerçekten çalışsın).
- Offline kayıtlarda `queuedAt` asıl ziyaret zamanı olarak `createdAt`'e yansıtılsın ve offline kaynaklı kayıtlar audit log'da işaretlensin; müşteri ekranında harcama toplamı negatif değerleri dışlayacak şekilde (`amount >= 0`) hesaplanmalı — bu, veri temizlenene kadar savunmacı bir katmandır, asıl çözüm yazma yolundadır.
