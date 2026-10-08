# /dealer/campaigns/[id]/performance

**Amaç:** Bayinin gönderdiği tek bir kampanyanın etkisini göstermek. Kampanya başlığından türetilen bir anahtarla `Feedback.utmCampaign` alanını gevşek biçimde eşleştirir ve son 30 günün özetini çıkarır: eşleşen geri bildirim, bayinin toplam geri bildirimi, pay ve ortalama puan.

**Genel puan:** 3.2 / 10

**Karar:** **yeniden inşa**. Sayfanın kabuğu düzgün. Ölçtüğü şey ise veri hattında hiç oluşmuyor. Kampanya gönderimi izlenebilir bir link üretmiyor, geri bildirim formu da `utm_campaign` değerini kaydetmiyor. Bu yüzden dört metrikten üçü üretimde her zaman 0, 0% veya "—" gösterir. Sorun arayüzde değil, atıf modelinin kendisinde. Sayfa, kampanya listesinin yanında açılan bir **kampanya detay ekranı** (`/dealer/campaigns/[id]`) olarak yeniden kurulmalı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Kimlik doğrulama ve sahiplik kontrolü doğru. Ana metrikler ise uçtan uca kopuk veri hattı yüzünden pratikte hep sıfır. |
| UX | 3/10 | Bayiye "neden 0?" sorusunun cevabı verilmiyor. Erişim (sentCount), gönderim tarihi ve durum API'den geldiği hâlde gösterilmiyor. Sonraki adım (UTM linki üret, kopyala) yok. |
| Görsel | 4/10 | Temiz shadcn kartları, ama dört eş ağırlıklı kutudan ibaret. Hiyerarşi, trend, karşılaştırma ve grafik yok. Panelin geri kalanındaki zengin kartlarla tutarsız. |
| Mimari | 3/10 | `slugToken` mantığı copilot ile kopyalanmış. Route'ta try/catch ve modül kapısı yok. Kampanya ile alıcı ve geri bildirim arasında kalıcı bir ilişki yok. Sayfadaki tip `Record<string, unknown>` + cast ile yazılmış. |
| Performans | 7/10 | Tek istek ve paralel üç sorgu, hafif bir istemci bileşeni. `ILIKE '%token%'` indekssiz çalışıyor ama dealer + 30 gün filtresi kümeyi daraltıyor. Aynı `where` iki kez çalışıyor. |
| Erişilebilirlik + Mobil | 5/10 | Mobilde tek sütun düzgün akıyor, `dl/dt/dd` semantiği doğru. Spinner'da `role="status"` ve etiket yok, h1'den sonra doğrudan h3 geliyor, hata kutusunda `role="alert"` yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | "Kampanyalar" geri dön butonu | ÇALIŞIYOR | `app/dealer/campaigns/[id]/performance/page.tsx:53-58` | Sabit `/dealer/campaigns` adresine gider. Copilot'tan gelen kullanıcıyı da kampanya listesine götürür (`app/dealer/copilot/page.tsx:328`), yani geldiği yere dönmez. |
| 2 | Başlık kartı (ikon + h1 + alt başlık) | ÇALIŞIYOR | `page.tsx:60-66` | Statik metin. Kampanya adı burada değil, aşağıdaki kartta. |
| 3 | Veri yükleme (`fetch` + iptal bayrağı) | KISMİ | `page.tsx:19-39` | `cancelled` koruması doğru. Ancak `r.json()` çağrısı `r.ok` kontrolünden önce yapılıyor (`:27`). JSON dönmeyen 500/502 yanıtlarında kullanıcı "Unexpected token <" gibi ham bir hata görür. |
| 4 | Yükleniyor durumu | KISMİ | `page.tsx:68-72` | Yalnızca ortada bir spinner var. Skeleton yok, `role="status"` / `aria-live` / görünmez etiket yok. |
| 5 | Hata durumu kartı | KISMİ | `page.tsx:73-77` | "Tekrar dene" butonu yok. Sunucu mesajları sabit Türkçe (`route.ts:33`) veya İngilizce "Forbidden" (`route.ts:36`), arayüz diliyle uyumsuz. `role="alert"` yok. |
| 6 | Kampanya başlığı (CardTitle) | ÇALIŞIYOR | `page.tsx:82` | Başlık yoksa çeviri anahtarındaki yedek metin kullanılıyor. |
| 7 | Açıklama notu (`data.note`) | KISMİ | `page.tsx:83`, `app/api/dealer/campaigns/[id]/performance/route.ts:84-85` | Not sunucuda sabit Türkçe yazılmış. EN arayüzde de Türkçe görünür. İçeriği teknik ("UTM şablonunu standartlaştırın") ve uygulanabilir bir adım içermiyor. |
| 8 | Eşleşen geri bildirim (30g) | BOZUK | `route.ts:51-54`; yazma yolu `app/(public)/feedback/[code]/page.tsx:115-125`, `:83` | Hiçbir istemci yolu `utmCampaign` göndermiyor. Public form gövdesinde UTM alanı yok, QR fetch'i de query parametrelerini iletmiyor. Değer pratikte hep **0**. Bkz. Bulgu 1. |
| 9 | Bayi toplam geri bildirim (30g) | ÇALIŞIYOR | `route.ts:55-57` | Doğru sayıyor, ama kampanyaya özgü bir metrik değil. Bağlam olarak kalabilir. |
| 10 | Pay (tahmini) | BOZUK | `route.ts:81-82`, `page.tsx:96-99` | #8'den türediği için hep %0. `matched > 0 && total === 0 → 100` dalı mantıken erişilemez, çünkü eşleşenler toplamın alt kümesi. Ölü kod. |
| 11 | Eşleşen ortalama puan | BOZUK | `route.ts:58-63,79`, `page.tsx:100-105` | #8 hep 0 olduğundan hep "—". |
| 12 | UTM eşleştirme anahtarı gösterimi | KISMİ | `page.tsx:106-110`, `route.ts:40-49,77` | Token 3 karakterden kısa olunca sorgu yapılmıyor ama anahtar yine de gösteriliyor (örn. "%20" başlığı "20" olarak). Kopyala butonu yok, UTM'li link veya QR üretici yok. Bayi bu anahtarla ne yapacağını bilmiyor. |
| 13 | Yetki: DEALER kendi kampanyası / ADMIN tümü | ÇALIŞIYOR | `route.ts:23-37` | IDOR yok. Ancak diğer kampanya uçları yabancı kaynağa 404 dönerken (`app/api/dealer/campaigns/[id]/route.ts:23-25`, `send/route.ts:30-32`) bu uç **403** dönüyor. Bu da kampanya ID'sinin var olup olmadığını sızdırıyor (düşük risk, cuid). |
| 14 | Modül / menü görünürlük kapısı | EKSİK | `route.ts:22-26` ile `app/api/dealer/campaigns/route.ts:23-33` karşılaştırması | Liste ucu `assertMenuItemVisible` ve `assertModuleEnabled('campaigns')` uyguluyor, gönderme ucu `assertModuleEnabled` uyguluyor. Performans ucunda ikisi de yok. Kampanya modülü kapalı bir bayi bu uca yine erişebilir. |
| 15 | Ölçüm penceresi | BOZUK | `route.ts:39` | Pencere `now − 30 gün` olarak hesaplanıyor, `sentAt` ile hiçbir bağı yok. 60 gün önce gönderilmiş bir kampanya için gösterilen sayılar kampanyayla ilgisiz. Taslak kampanyalarda da "performans" hesaplanıyor. |
| 16 | Kampanya meta verisi (durum, gönderim tarihi, erişim/sentCount, segment, kanal) | EKSİK | API dönüyor: `route.ts:68-75`; sayfa kullanmıyor: `page.tsx:79-115` | `status`, `sentAt`, `sentCount` ve `windowDays` yanıtta var ama ekranda yok. Segment, kanal ve mesaj ise API'den hiç dönmüyor. |
| 17 | Okunma / açılma oranı (bildirim) | EKSİK | `app/api/dealer/campaigns/[id]/send/route.ts:107-114`, `prisma/schema.prisma:990-1009` | `Notification` modelinde `isRead`, `readAt` ve `data` alanları var. Gönderim sırasında `data: { campaignId }` yazılmadığı için kampanyaya göre okunma oranı hesaplanamıyor. |
| 18 | Boş / açıklayıcı durum ("henüz eşleşme yok, şunu yapın") | EKSİK | `page.tsx:86-112` | 0 sonucunda da aynı dört kutu sessizce gösteriliyor. Taslak kampanya için "henüz gönderilmedi" durumu yok. |
| 19 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:52,87` | `max-w-2xl`, `grid-cols-1 sm:grid-cols-2` ve `touch-manipulation` var. Masaüstünde dar sütun kullanılmıyor; geniş ekranda alan boşa gidiyor. |
| 20 | Sayfa başlığı (metadata) | KISMİ | `app/dealer/campaigns/layout.tsx:4-6` | Sekme başlığı yalnızca "Kampanyalar". Kampanya adı ve "Performans" ifadesi yok. Sayfa `'use client'` olduğu için kendi metadata'sını veremiyor. |
| 21 | Dil tutarlılığı (TR/EN) | KISMİ | `messages/tr.json:665-677`, `messages/en.json:665-677`; `route.ts:33,36,85` | Etiketler çevrilmiş. Sunucu metinleri (hata mesajları, not) çevrilmemiş ve TR/EN karışık. |
| 22 | Dil değişince yeniden yükleme | ÇALIŞIYOR | `page.tsx:39`, `lib/app-locale.ts:57-60` | `t` `useMemo` ile stabil, sonsuz döngü yok. Dil değişince gereksiz bir istek daha atılıyor (zararsız). |
| 23 | Segment hata sınırı (error boundary) | ÇALIŞIYOR | `app/dealer/error.tsx` | Üst segmentten miras alınıyor. Route seviyesinde `loading.tsx` yok; panelin genel `app/dealer/loading.tsx` dosyası devreye giriyor. |
| 24 | Sunucu hata yönetimi | BOZUK | `route.ts:22-87` | Route'ta try/catch yok. Kardeş uçlardaki `responseIfDatabaseUnavailable` deseni burada eksik. Prisma/Neon hatasında Next'in varsayılan HTML 500 sayfası dönüyor ve istemcide #3'teki JSON parse hatasına yol açıyor. |
| 25 | Tarih aralığı seçici, karşılaştırma, trend grafiği, dışa aktarma | EKSİK | `page.tsx` tümü | Hiçbiri yok. |
| 26 | Motion / mikro-etkileşim | — (yok) | `page.tsx` tümü | Bu sayfada animasyon yok. Kampanya listesi ise `framer-motion`'dan doğrudan `motion` kullanıyor (`app/dealer/campaigns/page.tsx:5`); bu, global `LazyMotion` (`m as Motion`) kuralına aykırı (komşu sayfa notu). |

**Durum sayıları:** ÇALIŞIYOR 8 · KISMİ 7 · BOZUK 5 · SAHTE 0 · EKSİK 5 (toplam 25 değerlendirilen özellik; #26 bilgi amaçlı)

---

## Bulgular

### 1. Atıf hattı uçtan uca kopuk; ana metrikler üretimde hep sıfır
- **Önem:** KRİTİK · **Kategori:** veri bütünlüğü / işlevsellik · **Efor:** L
- **Kanıt:**
  - Sayfanın dayandığı tek alan `Feedback.utmCampaign` (`prisma/schema.prisma:818`, `route.ts:47`).
  - Bu alan yalnızca `POST /api/feedbacks` gövdesinden yazılıyor (`app/api/feedbacks/route.ts:198,253`).
  - Tek gerçek istemci olan public geri bildirim sayfası gövdeye UTM koymuyor (`app/(public)/feedback/[code]/page.tsx:118-125`) ve URL query'sini okumuyor (dosyada `searchParams` kullanımı yok). QR verisini de query'siz çekiyor (`:83`). Kod tabanında `utmCampaign`/`utmSource` gönderen başka bir `.tsx` yok (grep ile doğrulandı).
  - `app/api/qr-codes/public/[code]/route.ts:38-40` UTM'yi okuyor ama yalnızca `AnalyticsEvent` olarak kaydediyor (`:97-108`); geri bildirime taşınmıyor.
- **Sorun:** "Eşleşen geri bildirim", "Pay" ve "Eşleşen ort. puan" yalnızca dış bir API istemcisi `utmCampaign` gönderirse dolabilir. Normal kullanımda bayi her kampanyada 0 / %0 / "—" görür ve kampanyasının işe yaramadığı sonucuna varır. Yanlış bir ürün kararına götüren, sessizce bozuk bir metrik bu.
- **Profesyonel öneri:** Atıf hattını uçtan uca kurun:
  1. Public sayfa `useSearchParams()` ile `utm_*` ve yeni bir `cmp` (campaignId) parametresini okusun, QR fetch'ine iletsin ve `POST /api/feedbacks` gövdesine eklesin.
  2. `Feedback` modeline `campaignId String?` (+ `@@index([campaignId, createdAt])`) ekleyin. Başlıktan türetilmiş bir token yerine kampanyanın **kimliğiyle** kesin atıf yapın; `utmCampaign` yalnızca dış kanallar (Instagram, e-posta) için kalsın.
  3. Sunucu tarafında `cmp` değerinin ilgili QR'ın bayisine ait olduğunu doğrulayın (sahte atıfı engellemek için).

### 2. Kampanya gönderimi ölçülebilir bir iz bırakmıyor (link yok, alıcı kaydı yok)
- **Önem:** YÜKSEK · **Kategori:** mimari / veri modeli · **Efor:** M
- **Kanıt:**
  - `send/route.ts:107-114`: bildirimler `data` alanı olmadan oluşturuluyor; `campaignId` yok.
  - `send/route.ts:117-124`: push hedefi sabit `/customer/feedbacks`. UTM'li veya kampanya parametreli bir link yok.
  - Alıcı listesi (`customerIds`) hiçbir yerde kalıcı değil; yalnızca `sentCount` sayısı tutuluyor (`:96-99`).
- **Sorun:** Bayinin göndermesi ile müşterinin geri dönmesi arasında bağ kurulamıyor. Kampanya bildirimlerinin okunma oranı (`Notification.isRead/readAt`) hesaplanabilir durumdayken veri boşa gidiyor. Alıcılar bilinmediği için "kampanyayı alan müşterilerden kaçı X gün içinde geri geldi" gibi gerçek bir dönüşüm ölçülemiyor.
- **Profesyonel öneri:** `CampaignRecipient { campaignId, userId, notificationId, deliveredAt, readAt, convertedAt, convertedFeedbackId }` tablosu oluşturun ve gönderimde `createMany` ile doldurun. Bildirime `data: { campaignId }` yazın; push linkini `/customer/...?...&cmp=<id>` yapın. Okunma durumunu mevcut "bildirim okundu" ucundan `CampaignRecipient.readAt` alanına yansıtın. İsteğe bağlı olarak segmentin küçük bir bölümünü (%10) kontrol grubu olarak ayırıp **artış (lift)** hesaplayın; Braze/Klaviyo'daki holdout yaklaşımı budur.

### 3. Eşleştirme algoritması hatalı: Türkçe karakter kaybı, ayraç uyuşmazlığı, çapraz atıf
- **Önem:** YÜKSEK · **Kategori:** doğruluk · **Efor:** S (geçici düzeltme) / Bulgu 1 ile kalıcı çözüm
- **Kanıt:** `route.ts:10-17,47`. Node ile doğrulandı:
  - `"Kış İndirimi"` → `"ksindirimi"`. `ı` NFD'de ayrışmadığı için `[^a-z0-9]` filtresiyle siliniyor.
  - `"Yaz Kampanyası 2026"` → `"yazkampanyas2026"`.
  - Token ayraçlardan arındırılıyor, ama veritabanındaki `utmCampaign` ham hâliyle `contains` ile karşılaştırılıyor. `utm_campaign=yaz-kampanyasi` gibi tireli veya alt çizgili standart bir UTM değeri, çok kelimeli **hiçbir** başlıkla eşleşmez.
  - `contains` alt dize araması yapıyor. "İndirim" başlıklı bir kampanya, "Kış İndirimi" kampanyasına ait geri bildirimleri de sayar; iki kampanya aynı geri bildirimi paylaşır.
- **Sorun:** Bulgu 1 düzeltilse bile atıf hem eksik (false negative) hem çift sayımlı (false positive) olur.
- **Profesyonel öneri:** Asıl çözüm kimlik tabanlı atıftır (Bulgu 1). Geçiş döneminde iki tarafı aynı fonksiyonla normalize edin; `ı→i`, `ş→s`, `ğ→g` gibi açık bir harita kullanın. Kampanyaya `utmSlug String @unique([dealerId, utmSlug])` alanı ekleyin, gönderimde bir kez üretip saklayın ve **eşitlik** ile eşleştirin. Aynı fonksiyonu `lib/campaign-attribution.ts` altında toplayıp copilot ile paylaşın (Bulgu 8).

### 4. Ölçüm penceresi kampanya tarihinden bağımsız
- **Önem:** YÜKSEK · **Kategori:** doğruluk / UX · **Efor:** S
- **Kanıt:** `route.ts:39` (`since = now − 30g`). `campaign.sentAt` sorguda kullanılmıyor, yalnızca yanıtta dönüyor (`:72`).
- **Sorun:** Eski bir kampanyanın "performansı" o kampanyanın gönderildiği dönemi değil, bugünün son 30 gününü gösteriyor. Taslaklar için de metrik üretiliyor. Liste her kampanyada "Performans" butonu gösterdiği için (`app/dealer/campaigns/page.tsx:204-209`) taslak kampanyada anlamsız sayılar görülüyor.
- **Profesyonel öneri:** Pencereyi `[sentAt, sentAt + attributionWindowDays]` olarak tanımlayın (varsayılan 7/14/30, seçilebilir). Karşılaştırma için aynı uzunlukta bir ön dönem (`[sentAt − N, sentAt]`) hesaplayın ve **önce/sonra** farkını (geri bildirim hızı, ortalama puan, NPS) gösterin. `status !== 'sent'` olduğunda metrik yerine "Henüz gönderilmedi, gönderdikten sonra burada…" boş durumunu gösterin; listede butonu taslaklar için gizleyin veya "Önizleme" yapın.

### 5. Route'ta hata yönetimi yok; istemci ham parse hatası gösteriyor
- **Önem:** ORTA · **Kategori:** dayanıklılık · **Efor:** S
- **Kanıt:** `route.ts:22-87`'de try/catch yok. Kardeş uçlar `responseIfDatabaseUnavailable` kullanıyor (`send/route.ts:130-135`). İstemci `r.json()` çağrısını `r.ok` kontrolünden önce yapıyor (`page.tsx:27`).
- **Sorun:** Neon soğuk başlangıcı veya bağlantı hatasında kullanıcı "Unexpected token '<'…" gibi teknik bir metin görür. Tekrar deneme imkânı da yok.
- **Profesyonel öneri:** Route'u kardeşleriyle aynı desenle sarın (try/catch + `responseIfDatabaseUnavailable` + 500 JSON). İstemcide `await r.json().catch(() => ({}))` kullanın. Sayfayı liste sayfası gibi React Query'ye (`useQuery(['dealer','campaign',id,'performance'])`) taşıyın; böylece retry, `staleTime`, önbellek ve "Tekrar dene" butonu (`refetch`) hazır gelir.

### 6. Modül/menü kapısı atlanıyor; 403/404 tutarsızlığı
- **Önem:** ORTA · **Kategori:** güvenlik / politika · **Efor:** S
- **Kanıt:** `route.ts:23-37` ile `app/api/dealer/campaigns/route.ts:23-33` karşılaştırması. Yabancı kampanya için bu uç 403 dönüyor (`route.ts:35-37`), diğer uçlar 404 dönüyor (`[id]/route.ts:23-25`).
- **Sorun:** Admin bir bayi için kampanya modülünü kapatsa veya menüden gizlese bile performans ucu çalışmaya devam ediyor (veri yalnızca bayinin kendisine ait, sızıntı yok ama politika delinmiş oluyor). 403 cevabı kaynağın var olduğunu doğruluyor.
- **Profesyonel öneri:** Liste ucundaki `assertMenuItemVisible` ve `assertModuleEnabled` çağrılarını aynen ekleyin, yabancı kaynakta 404 dönün. Kampanya alt uçları için ortak bir `loadOwnedCampaign(id, session)` yardımcısı yazın; sahiplik, kapı ve 404 kuralları tek yerde toplansın.

### 7. Bilgi mimarisi zayıf: API'nin döndürdüğü kampanya bağlamı gösterilmiyor
- **Önem:** ORTA · **Kategori:** UX · **Efor:** M
- **Kanıt:** API `status`, `sentAt`, `sentCount` ve `windowDays` dönüyor (`route.ts:68-75`); sayfa bunların hiçbirini render etmiyor (`page.tsx:79-115`). Mesaj, segment ve kanal API'den hiç dönmüyor (`route.ts:30` select'i yalnızca `message`'ı çekiyor, o da yanıtta yok).
- **Sorun:** Bayi, hangi segmente ne mesajın ne zaman ve kaç kişiye gittiğini görmeden dört sayıya bakıyor. Medallia ve Qualtrics'teki "aksiyon → sonuç" anlatısı yok. Dört kutu eşit ağırlıkta, birincil KPI yok.
- **Profesyonel öneri:** Üstte kampanya şeridi: ad, durum rozeti, segment ve kanal çipleri, gönderim tarihi, mesaj önizlemesi. Altında bir **huni**: Gönderildi (sentCount) → Okundu (readAt) → Geri geldi (geri bildirim bıraktı) → Olumlu (rating ≥ 4). Birincil KPI dönüşüm oranı olsun; bayinin toplam geri bildirimi bağlam satırına düşsün.

### 8. Atıf mantığı kopyalanmış; copilot'ta N+1 sorgu
- **Önem:** DÜŞÜK · **Kategori:** mimari / bakım · **Efor:** S
- **Kanıt:** `route.ts:10-17` ve `app/api/dealer/copilot-summary/route.ts:196-201` aynı slug kodu. Copilot her kampanya için ayrı bir `count` çalıştırıyor (`:194-230`, `take: 4` → 4 sorgu). Bu sayfada aynı `utmWhere` hem `count` hem `aggregate` ile iki kez sorgulanıyor (`route.ts:52-63`); tek bir `aggregate({ _count: true, _avg })` yeterli.
- **Sorun:** Bulgu 3 düzeltilirken iki yerden biri unutulursa copilot ile bu sayfa farklı sayılar gösterir.
- **Profesyonel öneri:** `lib/campaign-attribution.ts` → `getCampaignAttribution(campaignIds[])`. Tek `groupBy({ by: ['campaignId'] })` ile toplu hesaplasın (Bulgu 1'deki `campaignId` sütunu sayesinde). Copilot ve bu sayfa aynı fonksiyonu çağırsın.

### 9. Erişilebilirlik ve dil eksikleri
- **Önem:** DÜŞÜK · **Kategori:** erişilebilirlik / i18n · **Efor:** S
- **Kanıt:**
  - Spinner'da etiket yok (`page.tsx:69-71`). Hata kartında `role="alert"` yok (`:74-76`).
  - Başlık sırası h1 → h3; `CardTitle` `h3` render ediyor (`components/ui/card.tsx:44`).
  - Sunucu metinleri sabit dilde: `route.ts:33,36,85`.
  - `t('…utmMatchKey')` ile token arasında `{value}` değişkeni yerine string birleştirme kullanılmış (`page.tsx:108`).
- **Profesyonel öneri:** API hata kodu (`code: 'CAMPAIGN_NOT_FOUND'`) dönsün, istemci kodu çeviri anahtarına çevirsin. Not metni sunucudan değil, istemcideki çeviriden gelsin. `InlineLoadingStatus` (liste sayfasında var) veya `role="status"` içeren bir skeleton kullanın. `CardTitle` için `asChild`/`h2` kullanın.

### 10. Sayfa metadata'sı ve gezinme bağlamı
- **Önem:** DÜŞÜK · **Kategori:** UX · **Efor:** S
- **Kanıt:** `app/dealer/campaigns/layout.tsx:4-6` yalnızca "Kampanyalar" başlığını veriyor. Geri butonu her zaman listeye gidiyor (`page.tsx:54`), oysa giriş noktalarından biri copilot (`app/dealer/copilot/page.tsx:328`).
- **Profesyonel öneri:** Sayfayı bir server `page.tsx` (+ `generateMetadata` ile kampanya adı) ve bir client içerik bileşeni olarak ayırın. Breadcrumb (Kampanyalar › {ad} › Performans) ekleyin; `router.back()` güvenli değilse listeye düşsün.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Gönderim hunisi ve okunma oranı** (Square Marketing, Toast Marketing, Klaviyo): gönderildi → teslim edildi → okundu/açıldı → tıklandı → geri geldi. Veri modeli kısmen hazır (`Notification.isRead/readAt`), yalnızca `campaignId` bağı eksik.
2. **Gerçek dönüşüm ve artış (lift)** (Square "kampanya kaynaklı ziyaret/satış", Braze holdout): alıcılar ile kontrol grubu kıyaslanmalı; kampanya sonrası N gündeki geri dönüş ve ortalama puan değişimi gösterilmeli.
3. **Önce/sonra trend grafiği** (Google Business Profile Insights, Yelp for Business): gönderim anı işaretli bir zaman çizgisi üzerinde günlük geri bildirim hacmi ve ortalama puan.
4. **UTM'li link ve QR üretici** (Google Campaign URL Builder, Square "kampanya QR'ı"): bayinin dış kanallarda (Instagram, masa kartı) kullanacağı `?cmp=` veya `utm_campaign=` parametreli QR veya linki tek tıkla kopyalama ve indirme.
5. **Kampanya karşılaştırma ve kıyaslama** (Medallia Action Planning, Qualtrics XM): bu kampanyayı bayinin önceki kampanyalarıyla ve segment ortalamasıyla kıyaslayan bir tablo; AI özetiyle "bu kampanya ortalamanın %X üstünde".
6. **Kampanya kaynaklı geri bildirim listesi ve dışa aktarma**: eşleşen geri bildirimlere tıklayınca filtrelenmiş geri bildirim kutusuna (`/dealer/feedbacks?campaignId=`) gitme, CSV dışa aktarma.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bayi kampanyaya tıkladığında tek bakışta "Kime ne gönderdim, kaçı gördü, kaçı geri geldi, memnuniyet değişti mi, şimdi ne yapmalıyım?" sorularının cevabını görür. Metrik sıfırsa sebebini ve çözümünü de görür ("Bu kampanya dış kanalda paylaşıldıysa şu linki kullanın").

**Yerleşim** (`/dealer/campaigns/[id]`; mevcut `/performance` adresi buraya yönlendirilsin):
1. **Başlık şeridi:** kampanya adı, durum rozeti, segment ve kanal çipleri, gönderim tarihi ve saati, "Benzerini oluştur" ve "Kopyala" aksiyonları. Taslakta "Gönder" ve "Düzenle" gelir.
2. **KPI satırı** (masaüstünde 4 sütun, mobilde 2×2): Erişim (sentCount) · Okunma oranı · Geri dönüş oranı (alıcıların N günde geri bildirim bırakma oranı) · Ort. puan farkı (önce→sonra, renkli delta). Birincil KPI "Geri dönüş oranı" biraz daha büyük gösterilir.
3. **Huni kartı:** yatay huni (gönderildi → okundu → geri geldi → olumlu). Mobilde dikey olur.
4. **Zaman çizgisi grafiği:** −14…+30 gün, gönderim anı dikey çizgiyle işaretli; geri bildirim hacmi (bar) ve ortalama puan (çizgi). Mevcut grafik kütüphanesiyle, `dataviz` kurallarına uygun, iki temada da okunur.
5. **Atıf kaynağı dökümü:** push/bildirim (kesin, `campaignId`) ile dış link/QR (UTM) ayrı ayrı gösterilir. "Kampanya linki" kartında kopyala butonu ve QR indir aksiyonu bulunur.
6. **Eşleşen geri bildirimler:** son 5 geri bildirim önizlemesi ve "Tümünü gör" (filtrelenmiş geri bildirim kutusuna gider).
7. **AI önerisi (isteğe bağlı):** mevcut AI içgörü altyapısıyla 2-3 cümlelik yorum ve sonraki kampanya önerisi.

**Motion / 3D:** 3D gerekmiyor; bu bir analitik ekranı. Ölçülü motion yeterli: KPI sayıları için kısa (≤400 ms) bir sayaç animasyonu, huni barlarının soldan dolması ve kartlar için ≤60 ms aralıklı stagger. Hepsi global `LazyMotion` ile `m as Motion` kullanılarak yapılmalı ve `useReducedMotion()` açıkken anında son duruma geçmeli. Liste sayfasındaki doğrudan `motion` importu da aynı kurala çekilmeli.

**Veri / API değişiklikleri:**
- Prisma:
  - `Feedback.campaignId String?` + `@@index([campaignId, createdAt])`.
  - Yeni `CampaignRecipient` modeli (`@@unique([campaignId, userId])`, `@@index([campaignId, readAt])`).
  - `Campaign.utmSlug String?` + `@@unique([dealerId, utmSlug])`.
  - `Campaign.attributionWindowDays Int @default(14)`.
- `send/route.ts`: aynı transaction içinde `CampaignRecipient.createMany`, `Notification.data = { campaignId }` ve push linkine `cmp` parametresi.
- Bildirim okundu ucu: `CampaignRecipient.readAt` alanını güncellesin.
- Public geri bildirim sayfası ve `POST /api/feedbacks`: `cmp` ve `utm_*` parametrelerini taşısın; sunucu, `cmp` değerinin QR bayisine ait olduğunu doğrulasın. Alıcı geri bildirim bıraktığında `CampaignRecipient.convertedAt` alanı set edilsin.
- `GET /api/dealer/campaigns/[id]/performance`: try/catch, modül ve menü kapısı, 404 politikası. Yanıt `{ campaign, funnel, kpis, timeline[], recentFeedback[], links }` biçiminde olsun. Gönderilmiş kampanyalar için 5-10 dakikalık Upstash önbelleği (anahtar `campaign:perf:{id}`) kullanılsın; yeni geri bildirimde invalidasyon gerekmez, kısa TTL yeterli.
- `lib/campaign-attribution.ts`: copilot ile paylaşılan tek hesaplama modülü.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/campaigns` (liste):** Performans, ayrı bir alt sayfa yerine kampanyanın **detay ekranı** olmalı. Liste kartında küçük bir özet (okunma ve geri dönüş oranı) gösterilsin, detaya tıklanınca bu ekran açılsın (masaüstünde yan panel veya sheet, mobilde tam sayfa). `/dealer/campaigns/[id]/performance` adresi `/dealer/campaigns/[id]` adresine kalıcı olarak yönlendirilsin.
- **`/dealer/copilot` → "Kampanya sinyali" kartı** (`app/dealer/copilot/page.tsx:310-335`, `app/api/dealer/copilot-summary/route.ts:194-230`): Aynı UTM token mantığını ve aynı (bozuk) metriği tekrarlıyor. Ortak `lib/campaign-attribution.ts` modülüne bağlanmalı; copilot yalnızca özet ve detaya giden linki göstermeli.
- **`/dealer/roi` ve `/dealer/business-outcomes`:** Kampanya kaynaklı sonuçları içermiyor (grep: "campaign" eşleşmesi yok). Yeniden inşadan sonra kampanya dönüşümü bu sayfalara bir veri kaynağı olarak beslenebilir; ayrı bir birleştirme gerekmiyor.
- **Kaldırma önerilmez:** Kampanya etkisini ölçmek, kıyas ürünlerin hepsinde temel bir özellik. Sorun sayfanın varlığında değil, beslendiği veri hattında.

---

## Doğrulama (şüpheci inceleme)

Yöntem: iddialar kod okunarak çürütülmeye çalışıldı; `slugToken` davranışı yalnızca saf bir `node -e` ifadesiyle (DB'ye dokunmadan) denendi. Kod, veritabanı veya build çalıştırılmadı.

### 1. Kampanya atıf metrikleri üretimde her zaman 0 (veri hattı kopuk) — **DOĞRULANDI**

- `Feedback.utmCampaign` alanına yazan tek üretim yolu `app/api/feedbacks/route.ts:198,253` (repo genelinde başka `feedback.create` yalnızca `prisma/seed.ts:417-438`).
- Bu uca POST eden tek istemci `app/(public)/feedback/[code]/page.tsx:115-125`; gövdede `utmSource/utmCampaign/utmMedium/attributionSource` yok. Sayfada `useSearchParams`/`searchParams`/`utm` hiç geçmiyor (grep boş). QR verisi `:83`'te query'siz çekiliyor.
- `app/api/qr-codes/public/[code]/route.ts:38-41,98-111` UTM'yi yalnızca `AnalyticsEvent.data` JSON'una yazıyor; `Feedback` ile ilişkilendirmiyor. QR URL'lerine UTM ekleyen bir üretici de yok (grep: `utm` yalnızca 7 dosyada, hiçbiri QR üretimi değil).
- Yeniden üretim: Bayi "Kış İndirimi" kampanyası gönderir; müşteri `/feedback/ABC?utm_campaign=kisindirimi` linkinden geri bildirim bırakır → kayıtta `utmCampaign = NULL` → `performance/route.ts:47` `contains` filtresi 0 döner → sayfa 0 / %0 / "—" gösterir (`page.tsx:90,98,103`). Aynı durum `copilot-summary/route.ts:211-227`'de "utm_campaign ile kampanya adını hizalayın" ipucunu her kampanya için üretir.
- Tek çürütme ihtimali: `POST /api/feedbacks` anonim çağrılabilir ve `openapi.yaml:130` alanı belgeliyor; harici bir entegrasyon `utmCampaign` gönderebilir. Repo içinde böyle bir istemci yok, dolayısıyla normal kullanımda iddia geçerli.

### 2. Kampanya gönderimi kampanyaya bağlanabilir hiçbir iz bırakmıyor — **DOĞRULANDI**

- `app/api/dealer/campaigns/[id]/send/route.ts:107-114`: `Notification.createMany` kayıtlarında `data` alanı boş; şemada `Notification.data Json?` mevcut (`prisma/schema.prisma:997`) ama kullanılmıyor. Bildirimler yalnızca `type: 'campaign'` + başlık/mesaj kopyası taşıyor; aynı başlıklı iki kampanya ayırt edilemez.
- `:116-124`: push linki sabit `'/customer/feedbacks'`, kampanya parametresi yok.
- `:96-99`: yalnızca `sentCount` tutuluyor; `Campaign` modelinde (`schema.prisma:2641-2658`) alıcı ilişkisi yok, `CampaignRecipient` benzeri bir tablo yok.
- Karşılaştırma: kardeş uç `app/api/dealer/innovation/segment-proposals/[id]/send/route.ts:75-78` aynı `type: 'campaign'` ile `data: { type, proposalId }` yazıyor; yani desen projede var, kampanya ucunda unutulmuş.
- Not: Bu bir çalışma zamanı hatasından çok veri modeli eksikliği; ama sonuç somut: okunma oranı (`isRead/readAt`), alıcı-bazlı dönüşüm ve kontrol grubuyla lift hiçbir sorguyla geriye dönük hesaplanamaz. Bugünden itibaren gönderilen her kampanyanın ölçüm verisi kalıcı olarak kayboluyor; düzeltme ne kadar geç gelirse geri kazanılamaz geçmiş o kadar büyür.

### 3. Başlık→UTM eşleşmesi Türkçe karakter kaybediyor ve çift sayım yapıyor — **DOĞRULANDI (gizli/latent; bugünkü etkisi iddia 1 nedeniyle sıfır)**

- `performance/route.ts:10-17` (ve birebir kopyası `copilot-summary/route.ts:196-201`) `node` ile denendi: `"Kış İndirimi" → "ksindirimi"`, `"Yaz Kampanyası 2026" → "yazkampanyas2026"`, `"Çılgın Cuma" → "clgncuma"`. Sebep: `ı` (U+0131) NFD ile ayrışmaz ve `[^a-z0-9]` tarafından silinir.
- Yanlış negatif: doğal UTM değeri `kis-indirimi` veya `kisindirimi`, token `ksindirimi`'yi içermez → eşleşme yok (denendi: `false`).
- Yanlış pozitif / çift sayım: "İndirim" kampanyasının token'ı `indirim`; `'kis-indirimi'.includes('indirim') === true` (denendi). Aynı geri bildirim hem "İndirim" hem (doğru yazılmışsa) "Kış İndirimi" kampanyasına sayılır; iki kartın "Pay" toplamı %100'ü aşabilir.
- Pencere: `route.ts:39` `since = now - 30 gün`; `campaign.sentAt` (`:30`'da seçiliyor) filtrede hiç kullanılmıyor. 3 ay önce gönderilmiş bir kampanya için sayfa, kampanyayla ilgisiz son 30 günü gösterir; henüz gönderilmemiş (`draft`) kampanyalar için de metrik üretir.
- Önem notu: Bugün `utmCampaign` hiç dolmadığı için kullanıcıya görünen ek bir sapma yok; ancak iddia 1 yalnızca "istemci UTM'yi taşısın" şeklinde yamalanırsa bu hatalar anında üretime çıkar. Bu yüzden düzeltme başlık-slug eşlemesi üzerine kurulmamalı: kampanya kimliği (`cmp=<campaignId>`) açıkça taşınmalı, eşleşme `Feedback.campaignId` (veya `CampaignRecipient`) üzerinden eşitlikle yapılmalı ve pencere `[sentAt, sentAt + attributionWindowDays]` olmalı. UTM serbest metni yalnızca harici kanal raporlaması için ayrı tutulmalı.
