# /customer/category-leaderboard

**Amaç:** Müşteriye, seçtiği işletme kategorisinde (kafe, restoran vb.) son 90 günde en yüksek ortalama puanı alan işletmeleri sıralı olarak göstermek. Kısacası "Bu kategoride nereye gideyim?" sorusuna bir keşif listesiyle cevap vermek. Sidebar'da "Trend Analiz" grubunun altında "En İyi İşletmeler" adıyla yer alıyor (`components/dashboard/sidebar.tsx:297`).

**Genel puan: 3.9 / 10** · **Karar: birleştir** (bağımsız bir sayfa olarak kalmamalı; tek bir "İşletme Keşfi / Sıralamalar" yüzeyine taşınmalı. Ayrıntısı en sondaki bölümde.)

> Kısa hüküm: Kod derli toplu ve küçük (109 satır sayfa + 88 satır API). Teknik olarak "çalışıyor". Ama sayfanın beslendiği `User.businessCategory` alanını gerçek bir bayinin dolduracağı **hiçbir ürün yolu yok**; bu alanı yalnızca admin'in demo-seed aksiyonu ve demo kafe seed'i yazıyor. Sıralama formülü 3 anonim 5 yıldızla manipüle edilebiliyor. HTTP hataları ise kullanıcıya "yeterli yorum yok" diye gösteriliyor. Liste satırları tıklanamıyor ve aynı soruyu (en iyi işletme hangisi?) üç farklı formülle cevaplayan üç ayrı yüzey var.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Sorgu doğru çalışıyor; ama veri kaynağı (kategori) gerçek bayiler için dolmuyor, sıralama manipüle edilebiliyor, HTTP hataları sessizce yutuluyor ve satırlardan hiçbir aksiyona geçilemiyor. |
| UX | 3/10 | Ham slug'lar çip olarak görünüyor (`demo-cafe`, `cafe`), satırlar çıkmaz sokak, "boş" mesajı üç farklı durumu (veri yok / kategori yok / hata) aynı cümleyle anlatıyor. |
| Görsel | 4/10 | Temiz shadcn kart listesi, ama bir sıralama ekranından beklenen podyum, logo, hiyerarşi ve kutlama hissi tamamen yok. Duolingo / Starbucks kıyasında "admin tablosu" gibi duruyor. |
| Mimari | 5/10 | İnce, okunur, parametreli raw SQL; ancak yarış koşulu var, `res.ok` kontrolü yok, i18n ve metadata layout'u yok. Aynı sıralama mantığı üç yerde üç farklı biçimde yazılmış. |
| Performans | 6/10 | Tek ve indeksli bir JOIN (LIMIT 50) var, N+1 yok. Her istek `no-store` ve cache'siz; kategori listesi her açılışta yeniden `groupBy` ediliyor. |
| Erişilebilirlik + Mobil | 4/10 | İlk 3 sıranın numarası ekran okuyucuya hiç okunmuyor (yalnızca ikon var). Çiplerde `aria-pressed` yok. Layout padding'inin üstüne `p-6` eklendiği için mobilde çift boşluk oluşuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa hero'su (başlık "En İyi İşletmeler", açıklama, Trophy ikonu) | ÇALIŞIYOR | `page.tsx:49-53`, `components/admin/admin-premium-hero.tsx:182-193` | İkon rengi hero tarafından `!text-foreground` ile ezildiği için açık temada sorun yok. Metinler sabit TR. |
| 2 | Kategori listesinin yüklenmesi (`GET /api/customer/category-leaderboard`) | KISMİ | `page.tsx:22-32`, `route.ts:29-40` | Sorgu çalışıyor; ama `businessCategory` gerçek bayilerce doldurulamıyor (bkz. B1). Ham string olduğu için `Cafe` / `cafe` / `kafe` ayrı çip olarak görünür. |
| 3 | Kategori çipi ile seçim | KISMİ | `page.tsx:55-69` | Seçim çalışıyor; ancak hızlı geçişte yarış koşulu var (B4). `aria-pressed` yok. Seçim URL'e yazılmıyor. |
| 4 | Çip üzerindeki işletme sayısı `(n)` | KISMİ (yanıltıcı) | `route.ts:30-38`, `page.tsx:65` | Kategorideki TÜM bayileri sayıyor, sıralamaya girenleri değil. "(12)" yazan çipe tıklayınca "yeterli yorumlu işletme yok" görülebiliyor. |
| 5 | Varsayılan kategori seçimi (en çok bayisi olan) | ÇALIŞIYOR | `route.ts:38`, `page.tsx:28` | Kullanıcının kendi geçmişine (en çok gittiği kategoriye) göre kişiselleştirilmemiş. |
| 6 | Liderlik tablosunun yüklenmesi (`?category=`) | KISMİ | `page.tsx:34-41`, `route.ts:42-81` | `res.ok` kontrolü yok, istek iptali (abort) yok. |
| 7 | Sıralama algoritması (ortalama puan DESC, sonra adet DESC) | KISMİ | `route.ts:56` | Bayes düzeltmesi yok: 3 yorumla 5.0 alan, 400 yorumla 4.9 alanın önüne geçiyor. Eşit puanda belirleyici bir tiebreak yok (B3). |
| 8 | Minimum 3 yorum eşiği | ÇALIŞIYOR | `route.ts:10,55` | Eşik çok düşük ve manipülasyona açık (B2). |
| 9 | 90 günlük zaman penceresi | ÇALIŞIYOR | `route.ts:43,52` | Açıklama metniyle tutarlı (`page.tsx:51`). Kullanıcı pencereyi değiştiremiyor. |
| 10 | Silinmiş geri bildirimlerin hariç tutulması | ÇALIŞIYOR | `route.ts:52` (`deletedAt IS NULL`) | Fraud, trust ve toksik bayraklı yorumlar ise hariç tutulmuyor (B2). |
| 11 | En fazla 50 satır | ÇALIŞIYOR | `route.ts:57` | Sayfalama, "daha fazla" ya da "benim gittiğim işletme kaçıncı?" bilgisi yok. |
| 12 | İlk 3 için madalya ikonu (altın/gümüş/bronz) | KISMİ | `page.tsx:13-14,85-86` | Görsel olarak çalışıyor ama sıra numarası metin olarak hiç yok, ekran okuyucu "1." diye okuyamıyor (B8). |
| 13 | 4. sıradan itibaren sıra numarası | ÇALIŞIYOR | `page.tsx:88` | — |
| 14 | İlk 3 için kart kenarlığı vurgusu | ÇALIŞIYOR | `page.tsx:82` | Çok zayıf bir vurgu (`border-primary/30`). |
| 15 | İşletme adı | KISMİ | `route.ts:72`, `page.tsx:92-93` | `businessName` boşsa bayinin KİŞİSEL adı (`User.name`) müşteriye gösteriliyor (B9). Logo yok. |
| 16 | Favori göstergesi (kırmızı kalp) | KISMİ | `route.ts:60-67,75`, `page.tsx:94` | Yalnızca okunuyor; buradan favoriye ekleme/çıkarma yapılamıyor, oysa `POST /api/customer/favorites` mevcut (`app/api/customer/favorites/route.ts:71`). İkonun erişilebilir adı yok. |
| 17 | Yorum sayısı | ÇALIŞIYOR | `page.tsx:96`, `route.ts:74` | — |
| 18 | Ortalama puan (yıldız + 1 ondalık) | ÇALIŞIYOR | `page.tsx:98-101`, `route.ts:73` | API 2 ondalık, UI 1 ondalık gösteriyor; tutarlı. Ekran okuyucuya "puan" bağlamı verilmiyor. |
| 19 | Yükleniyor durumu (spinner kartı) | KISMİ | `page.tsx:20,35,71-72`; `components/ui/inline-loading-status.tsx:28-51` | Tek bir `loading` bayrağını iki akış paylaşıyor. İlk açılışta boş-durum mesajının bir kare görünme olasılığı var (B6, tarayıcıda doğrulanmadı). Skeleton yok. |
| 20 | Boş durum ("en az 3 yorum gerekir") | BOZUK | `page.tsx:73-78` | Hiç kategori olmadığında, API 401/500/503 döndüğünde ve gerçekten veri olmadığında aynı cümle gösteriliyor (B5). |
| 21 | Hata durumu / toast | BOZUK | `page.tsx:24-25,30,37-39` | Yalnızca ağ ya da JSON parse hatasında toast çıkıyor. HTTP hata gövdesi `{error}` başarı gibi işleniyor. Toast admin yardımcısından geldiği için "Dikkat: " önekiyle gösteriliyor (`lib/admin-toast.ts:18-19`). |
| 22 | Sayfa yetkisi (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-75` | — |
| 23 | API yetkisi | KISMİ | `route.ts:21-24` | Yalnızca oturum kontrol ediliyor, rol bakılmıyor. DEALER rolü rakip sıralamasını ve rakiplerin kişisel adlarını çekebilir. Menü görünürlük kapısı (`assertMenuItemVisible`) yok. |
| 24 | Satıra tıklayıp işletme detayına / haritaya gitme | EKSİK | `page.tsx:81-104` (Link ya da onClick yok) | Liste çıkmaz sokak. |
| 25 | Favoriye ekle/çıkar aksiyonu | EKSİK | `page.tsx:94` | API hazır olduğu halde kullanılmamış. |
| 26 | Arama, alt filtre, sıralama seçeneği (en çok yorum / yakınlık / trend) | EKSİK | — | — |
| 27 | Kategori etiketlerinin yerelleştirilmesi (ikon + TR/EN ad) | EKSİK | `page.tsx:61,65` (`capitalize` ile ham slug) | `discovery` route'unda bir normalize fonksiyonu var (`app/api/customer/discovery/route.ts:51+`) ama burada kullanılmıyor. |
| 28 | i18n (`useAppT`) | EKSİK | `page.tsx` içinde `useAppT` yok | Kardeş sayfalar (`trends`, `nearby`, `leaderboard`) i18n kullanıyor. EN kullanıcı bu sayfada Türkçe görür. |
| 29 | Sekme başlığı metadata'sı (segment `layout.tsx`) | EKSİK | `app/customer/category-leaderboard/` içinde yalnızca `page.tsx` var | Diğer müşteri sayfalarında `segmentLayoutMetadata` kullanılıyor (ör. `app/customer/trends/layout.tsx`). |
| 30 | Seçili kategorinin URL'de tutulması / derin bağlantı / geri tuşu | EKSİK | `page.tsx:18` (yalnızca local state) | Paylaşılamıyor; sayfa yenilenince ilk kategoriye dönüyor. |
| 31 | "Ayın İşletmesi" vurgusu | EKSİK | `lib/business-of-month.ts:9` kendini "category-leaderboard mantığıyla" diye tanımlıyor ama bu sayfa o rozeti göstermiyor | Rozet `/customer/trends`'te gösteriliyor (`app/customer/trends/page.tsx:406`). |
| 32 | Hareket/geçiş animasyonu, podyum | EKSİK | Sayfada framer-motion yok | Sıralama ekranının bütün duygusal değeri eksik. |
| 33 | Sunucu tarafı cache | EKSİK | `route.ts:39,79` (`PRIVATE_NO_STORE_HEADERS`) | Kategori sıralaması kullanıcıdan bağımsız olduğu için kısa süreli paylaşımlı cache'e uygun; yalnızca `isFavorite` kişisel. |
| 34 | Mobil yerleşim | KISMİ | `page.tsx:48` (`p-6`) + `app/customer/layout.tsx:36,41` | Layout zaten yatay ve dikey padding veriyor. `p-6` ekleyince 400px ekranda her yanda yaklaşık 36px boşluk kalıyor. Çok kategoride çipler bir "duvar"a dönüşüyor. |
| 35 | Yeniden dene / yenile | EKSİK | — | Hata sonrası kullanıcının tek seçeneği sayfayı yenilemek. |
| 36 | Sıralamaya katılım kriterlerinin açıklanması (şeffaflık) | KISMİ | `page.tsx:51,76` | 90 gün ve min 3 yorum yalnızca boş durumda söyleniyor. Puanın nasıl hesaplandığını anlatan bir "i" açıklaması yok. |

**Durum sayımı:** ÇALIŞIYOR 12 · KISMİ 12 · BOZUK 2 · SAHTE 0 · EKSİK 10 (toplam 36)

---

## Bulgular (önem sırasıyla)

### B1. Sayfanın veri kaynağı (`businessCategory`) gerçek bayiler için hiç dolmuyor
- **Önem:** kritik · **Kategori:** veri/ürün bütünlüğü · **Efor:** M
- **Kanıt:**
  - `prisma/schema.prisma:99`: `businessCategory String?`, açıklaması "for global insights".
  - Alanı yazan yalnızca iki yer var: `app/api/admin/bootstrap/route.ts:237-265` (`seed_insights_categories`, `demo-cafe` / `demo-restaurant` / … değerlerini atıyor) ve `lib/demo-cafes-seed.ts:139,149` (demo kafeler).
  - Bayi profil güncellemesi `app/api/user/profile/route.ts:15,41` `businessCategory` kabul etmiyor. Admin kullanıcı API'si de etmiyor (`app/api/admin/users/route.ts:23,39`). `app/dealer/settings/page.tsx` içinde de bir işletme kategorisi alanı yok (oradaki "category" avatar kategorisi).
  - Ek risk: `clear_insights_categories` (`app/api/admin/bootstrap/route.ts:267-278`) yalnızca demo kayıtları değil, **tüm** bayilerin kategorisini `null`'a çekiyor.
- **Sorun:** Üretimde iki olasılık var. Ya hiç kategori yoktur ve sayfa her zaman "yeterli yorum yok" der, ya da admin demo seed'i çalıştırmışsa gerçek müşteriye `demo-cafe` gibi iç test etiketleri çip olarak gösterilir. Hangisinin geçerli olduğu **canlı DB okunamadığı için doğrulanmadı**; ancak kod yolu iki durumda da kusurlu. Aynı alan `lib/visit-missions.ts:50,72` ve `app/api/dealer/benchmark/route.ts:219` tarafından da kullanılıyor, yani sorun bu sayfayla sınırlı değil.
- **Profesyonel öneri:** Kategoriyi serbest metin olmaktan çıkarıp bir **kontrollü sözlüğe** dönüştürün:
  1. `lib/business-categories.ts` içinde slug, TR/EN etiket, ikon ve renk tutan sabit bir katalog oluşturun (cafe, restaurant, bakery, bar, dessert, fast-food, hotel, market…).
  2. Bayi onboarding'ine ve `/dealer/settings` profil sekmesine zorunlu bir "İşletme kategorisi" seçici ekleyin; `app/api/user/profile/route.ts` zod şemasına `z.enum(CATEGORY_SLUGS)` koyun.
  3. Mevcut serbest değerleri bir kerelik normalize edin (LOWER + eşleme tablosu; `demo-*` olanları `NULL`'a çekin).
  4. Demo bayileri ayırt etmek için bir `isDemo` bayrağı ya da `demo-` önek filtresi ekleyin ve bunları tüm müşteri sıralamalarından hariç tutun.
  5. `clear_insights_categories` aksiyonunu, tracker'daki `insightsDealerIds` ile sınırlandırın.

### B2. Sıralama 3 anonim 5 yıldızla ele geçirilebiliyor; fraud ve trust sinyalleri yok sayılıyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** M
- **Kanıt:**
  - `route.ts:52-55`: Yalnızca `deletedAt IS NULL` ve `COUNT >= 3` koşulu var. `Feedback.trustFlagged` (`schema.prisma:826`), `fraudScore` (`:822`) ve `isToxic` hiç filtrelenmiyor; yorumu yazan kullanıcının `fraudStatus = 'shadow_ban'` durumu (`schema.prisma:100`) da kontrol edilmiyor.
  - `app/api/feedbacks/route.ts:243-246`: Anonim geri bildirim kabul ediliyor (`userId: session?.user?.id || null`) ve bayinin kendi QR'ına yorum yazmasını engelleyen bir kontrol yok. Rate limit IP başına 20/dk, QR+IP başına 5/dk (`lib/rate-limit.ts:163,167`); 3 yorumu dakikalar içinde atmaya yetiyor.
- **Sorun:** Yeni bir bayi, kendi QR'ına 3 tane 5 yıldız bırakarak kategorisinde 1. sıraya çıkabilir. Bu sayfa müşteriye "en iyi" iddiasıyla yön verdiği için güven zararı yüksek. Aynı manipülasyon `lib/business-of-month.ts:52-75` üzerinden "Ayın İşletmesi" rozetini de etkiler.
- **Profesyonel öneri:** Sıralama girdisini "güvenilir yorum" kümesine indirin: `userId IS NOT NULL` (ya da anonimlere düşük ağırlık), `trustFlagged = false`, `COALESCE(fraudScore,0) < 0.7`, yazar `fraudStatus <> 'shadow_ban'`, yazar ≠ bayi ve bayinin staff'ı. Ayrıca aynı kullanıcının bir bayi için 90 günde yalnızca son yorumunu saydırın (`DISTINCT ON (userId, dealerId)`). Eşiği "en az 3 yorum" yerine "en az N **farklı** doğrulanmış kullanıcı" yapın. Bu filtreyi tek bir `lib/business-ranking.ts` içinde toplayın ve hem bu sayfa hem business-of-month hem discovery aynı fonksiyonu kullansın.

### B3. Ortalama puana göre ham sıralama: küçük örneklem büyük örneklemi yeniyor, eşitlikte sıra rastgele
- **Önem:** yüksek · **Kategori:** doğruluk · **Efor:** S
- **Kanıt:** `route.ts:48-49,56`: `ORDER BY avg_rating DESC, n DESC`, benzersiz bir tiebreak yok.
- **Sorun:** 3 yorumla 5.00 alan işletme, 300 yorumla 4.93 alan işletmenin önünde. Bu, Google ve Yelp gibi ürünlerin bilinçli olarak kaçındığı klasik bir hata. Eşit `avg_rating` ve `n` değerlerinde Postgres sırayı garanti etmediği için sıra numaraları sayfa yenilendikçe değişebilir. Sıra `i + 1` ile verildiğinden (`route.ts:70`) eşit skorlu işletmeler bile farklı rütbe alıyor.
- **Profesyonel öneri:** Bayes ortalaması (IMDb formülü) kullanın: `score = (n/(n+m))·R + (m/(n+m))·C`; burada `C` kategori ortalaması, `m` yaklaşık 10. Bu tek bir SQL CTE ile yapılabilir. Bunun yanında Wilson alt sınırı ya da zaman ağırlığı (son 30 gün ×1.0, 31-90 gün ×0.6) da düşünülebilir. Tiebreak olarak `n DESC, u.id ASC` ekleyin. Eşit skorlara aynı rütbeyi vermek için `DENSE_RANK()` kullanın. UI'da "Puan nasıl hesaplanır?" açıklaması (popover) gösterin.

### B4. Kategori değiştirirken yarış koşulu: yanlış kategorinin listesi görünebiliyor
- **Önem:** yüksek · **Kategori:** hata (race condition) · **Efor:** S
- **Kanıt:** `page.tsx:34-45`: `loadBoard` her çağrıda `fetch` başlatıyor; `AbortController` ya da "iptal edildi" bayrağı yok. `setRows` ve `setLoading(false)` her yanıtta koşulsuz çalışıyor.
- **Sorun:** Kullanıcı "cafe" çipine, hemen ardından "restaurant" çipine basar ve cafe isteği daha geç dönerse, "restaurant" çipi seçili görünürken cafe sıralaması ekranda kalır. Ayrıca önce dönen istek `loading`'i false yapınca diğer istek hâlâ beklerken spinner kaybolur.
- **Profesyonel öneri:** Veri çekmeyi SWR (`useSWR(['/api/customer/category-leaderboard', cat])`) ya da `useEffect` içinde `AbortController` ile yazın; cleanup'ta `controller.abort()` çağırın. Kategori başına cache (SWR key) sayesinde çipler arasında geri dönüş anında olur. `keepPreviousData` ile eski liste soluk gösterilip yenisi geldiğinde değiştirilebilir.

### B5. HTTP hataları "yeterli yorum yok" diye gösteriliyor; kategori yokken de aynı mesaj çıkıyor
- **Önem:** yüksek · **Kategori:** hata yönetimi / UX · **Efor:** S
- **Kanıt:**
  - `page.tsx:24,37`: `.then((r) => r.json())`, `r.ok` kontrolü yok. 401, 500 ya da 503 (`responseIfDatabaseUnavailable`, `route.ts:83-84`) gövdesi `{error}` olarak başarıyla parse ediliyor, `d.categories` ya da `d.leaderboard` undefined geliyor ve liste boş diziye düşüyor.
  - `page.tsx:73-78`: `rows.length === 0` olduğunda her durumda "Bu kategoride yeterli yoruma sahip işletme yok" yazılıyor; buna `categories.length === 0` durumu da dahil.
- **Sorun:** Veritabanı kesintisi ya da oturum düşmesi kullanıcıya "bu kategoride iyi işletme yok" diye anlatılıyor. Bu hem yanlış bilgi hem de yeniden deneme şansı vermiyor. Ortada hiç kategori yokken "bu kategoride" demek anlamsız.
- **Profesyonel öneri:** Üç ayrı durum tasarlayın:
  1. **Hata:** ikon + "Sıralama şu an yüklenemedi" + "Tekrar dene" butonu (SWR `mutate`).
  2. **Kategori yok:** "Bölgendeki işletmeler henüz kategorilendirilmedi", yanında `/customer/nearby` CTA'sı.
  3. **Kategori var ama eşiği geçen yok:** "Bu kategoride henüz yeterli değerlendirme yok. İlk değerlendiren sen ol", yanında QR tara CTA'sı (`/customer/scan`). Bu, boş durumu bir oyunlaştırma fırsatına çevirir.

  Fetch yardımcısında `if (!res.ok) throw new HttpError(res.status, body.error)` deseni kullanılmalı.

### B6. Tek `loading` bayrağını iki akış paylaşıyor; ilk açılışta boş durum bir an görünebilir
- **Önem:** orta · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `page.tsx:25-31`: Kategori isteğinin `.finally` bloğu `setLoading(false)` çağırıyor. Tablo isteği ise ancak sonraki render'daki `useEffect` (`:43-45`) ile başlıyor. Arada `loading=false` ve `rows=[]` olduğu bir render oluşuyor.
- **Sorun:** Bu ara render'da "yeterli yorum yok" mesajı bir kare yanıp sönebilir. **Tarayıcıda gözlenmedi, doğrulanmadı**; React'in batching zamanlamasına bağlı. Kod yapısı bu titremeye açık.
- **Profesyonel öneri:** Kategori yükleme ve tablo yükleme durumlarını ayırın (`categoriesStatus` / `boardStatus`) ya da B4'teki SWR geçişiyle bu sorun kendiliğinden çözülür. Spinner yerine 5-6 satırlık bir skeleton kullanın.

### B7. Aynı soruya ("en iyi işletme hangisi?") üç farklı formül, üç farklı cevap
- **Önem:** orta · **Kategori:** mimari / bilgi mimarisi · **Efor:** M
- **Kanıt:**
  - Bu sayfa: 90 gün, yalnızca `Feedback`, ham ortalama, kategoriye göre (`route.ts:42-58`).
  - `/customer/trends`: discovery'deki `trendingVenues` skoru `avg*20 + min(30, n*1.5) + min(20, scan/10)`, son 25 bin yorum, kategorisiz (`app/api/customer/discovery/route.ts:205-219`). `weeklyBest` ise yalnızca `ConsumptionReview` kullanıyor (`:221-262`).
  - "Ayın İşletmesi": önceki ay, tüm kategoriler, bellekte toplanan ortalama (`lib/business-of-month.ts:48-75`).
  - Bu sayfa `ConsumptionReview` (kart tabanlı tüketim yorumları) verisini **hiç kullanmıyor**; dolayısıyla karta dayalı puan sinyali sıralamaya girmiyor.
- **Sorun:** Müşteri `/customer/trends`'te X'i "trend", "Ayın İşletmesi" olarak Y'yi, bu sayfada ise aynı kategoride 1. olarak Z'yi görebilir. Bu tutarsızlık güveni zedeler ve bakımı üç katına çıkarır.
- **Profesyonel öneri:** `lib/business-ranking.ts` adında tek bir sıralama servisi yazın (girdi: kategori?, pencere, konum?; çıktı: Bayes skoru, n, trend delta). `Feedback` ile `ConsumptionReview`'u birleşik bir puan akışında toplasın ve B2'deki güven filtresini içersin. Sonucu Upstash Redis'e kategori + pencere anahtarıyla 10-15 dk TTL ile yazın. Üç yüzey de bu servisi çağırsın.

### B8. İlk 3 sıranın numarası erişilebilir değil; çiplerin seçili durumu bildirilmiyor
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:**
  - `page.tsx:85-86`: Rank ≤ 3 için yalnızca `<Medal>` ikonu render ediliyor; metin, `aria-label` ya da `sr-only` yok.
  - `page.tsx:58-63`: Çip butonlarında `aria-pressed` ya da `role="tab"`/`aria-selected` yok.
  - `page.tsx:94`: Favori kalbinin etiketi yok.
  - `page.tsx:99-100`: Puan "4.8" olarak okunuyor, "5 üzerinden" bağlamı verilmiyor.
  - Liste semantik `<ol>` değil (`page.tsx:80`).
- **Sorun:** Ekran okuyucu kullanıcı sayfanın en önemli bilgisi olan 1., 2. ve 3. sırayı hiç duyamıyor ve hangi kategorinin seçili olduğunu bilemiyor.
- **Profesyonel öneri:** Listeyi `<ol aria-label="{kategori} sıralaması">` olarak kurun. Her satıra `<span className="sr-only">{rank}. sıra</span>` ekleyin. Madalya ikonuna `aria-hidden` verin ve görsel olarak da sıra numarasını madalyanın içine yazın. Çip grubunu `role="radiogroup"` + `aria-checked` ile (veya shadcn `ToggleGroup` ile) yapın. Puanı `aria-label="5 üzerinden 4.8 puan, 37 yorum"` ile okutun. Gümüş madalya için `text-gray-400` açık temada zayıf kontrastlı; madalyayı dolgu + kenarlık ile çizin.

### B9. `businessName` boşsa bayinin kişisel adı müşteriye gösteriliyor; API rol sınırı yok
- **Önem:** orta · **Kategori:** gizlilik / yetki · **Efor:** S
- **Kanıt:** `route.ts:47,72`: `name: r.businessName || r.name || 'İşletme'`. `route.ts:21-24`: Yalnızca oturum var mı diye bakılıyor; DEALER ya da STAFF rolüyle de çağrılabiliyor. Sayfa ise yalnızca CUSTOMER'a açık (`proxy.ts:53`).
- **Sorun:** İşletme adı girmemiş bir bayinin gerçek adı ve soyadı (ör. "Ahmet Yılmaz") sıralama listesinde herkese görünür. Ayrıca rakip bir bayi API'yi doğrudan çağırarak kendi kategorisindeki rakiplerin kişisel adlarını toplayabilir. Ciddi bir IDOR değil, çünkü veri zaten "kamuya dönük" bir sıralama; ama kişisel isim sızıntısı KVKK açısından gereksiz bir risk.
- **Profesyonel öneri:** Sıralamaya yalnızca `businessName IS NOT NULL` olan bayileri alın (profili tamamlanmamış işletme vitrine çıkmasın). `r.name` fallback'ini kaldırın. API'yi `requireAuth(['CUSTOMER'])` ile sınırlayın (ya da bayilere ayrı bir benchmark yüzeyi bırakın; o zaten var: `app/api/dealer/benchmark`). Menü kapısı için `assertMenuItemVisible('category_leaderboard','customer')` ekleyin.

### B10. Çip sayısı yanıltıcı ve kategori etiketleri ham slug olarak gösteriliyor
- **Önem:** orta · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:**
  - `route.ts:30-38`: `dealerCount`, kategorideki tüm bayileri sayıyor; sıralamaya giren (`>= 3` yorum) bayileri değil.
  - `page.tsx:61,65`: `capitalize` ile ham değer basılıyor (`Demo-cafe`, `Cafe`).
  - `groupBy` büyük/küçük harf duyarlı olduğu için `Cafe` ile `cafe` ayrı çip olur (admin insights bunu `LOWER()` ile çözmüş: `app/admin/insights/page.tsx:19,27`).
- **Profesyonel öneri:** Kategori listesi endpoint'i "sıralamaya uygun işletme sayısını" dönsün (aynı CTE'den `COUNT(*) FILTER (WHERE n >= m)`). Sıfır olan kategoriler ya gizlensin ya da soluk/devre dışı gösterilsin. Etiketleri B1'deki katalogdan ikon ve yerelleştirilmiş adla basın.

### B11. i18n ve metadata eksik, toast tonu admin'e göre ayarlı
- **Önem:** düşük · **Kategori:** tutarlılık / dil · **Efor:** S
- **Kanıt:**
  - `page.tsx:50-51,76,96`: Sabit TR metinler var, `useAppT` yok (kardeş sayfalar kullanıyor: `app/customer/trends/page.tsx:47`).
  - Klasörde `layout.tsx` yok, bu yüzden sekme başlığı genel "Müşteri" etiketinde kalıyor.
  - `lib/admin-toast.ts:16-19`: "Dikkat: " ve ASCII "Basarili: " önekleri müşteri panelinde de görünüyor.
  - `messages/tr.json:2578` ve `messages/en.json:2578` içinde yalnızca menü etiketi var.
- **Profesyonel öneri:** `customerCategoryLeaderboard.*` mesaj ad alanını açın. Diğer müşteri segmentleri gibi `segmentLayoutMetadata` ile bir `layout.tsx` ekleyin. Müşteri panelinde öneksiz bir `sonner` toast'ı (ya da ortak bir `customer-toast`) kullanın.

### B12. Mobilde çift padding ve çip duvarı
- **Önem:** düşük · **Kategori:** mobil · **Efor:** S
- **Kanıt:** `page.tsx:48` `p-6` var; `app/customer/layout.tsx:36` zaten `pl/pr-[max(0.75rem,…)]` ve `:41` `py-3 sm:py-5` veriyor. Kardeş sayfalar ek padding kullanmıyor (`app/customer/trends/page.tsx:225` `space-y-4 md:space-y-6`). Çipler `flex-wrap` (`page.tsx:56`).
- **Sorun:** 400px genişlikte içerik daralıyor. 8-10 kategoride çipler 3-4 satır yer kaplayıp listeyi ekranın altına itiyor.
- **Profesyonel öneri:** Kök sarmalayıcıdaki `p-6`'yı kaldırın. Çipleri mobilde yatay kaydırmalı tek satır yapın (`overflow-x-auto snap-x`, kenarlarda fade maskesi). Seçili çipi `scrollIntoView({inline:'center'})` ile ortalayın.

### B13. Cache yok; kategori listesi her açılışta yeniden hesaplanıyor
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `route.ts:39,79` `PRIVATE_NO_STORE_HEADERS`; Redis kullanımı yok. Proje Upstash cache desenine sahip (bkz. "Backend hız optimizasyonu" notu).
- **Sorun:** Bugünkü ölçekte ucuz (`@@index([role])` ve `Feedback @@index([qrCodeId, deletedAt, createdAt])` mevcut), ama sıralama tüm müşteriler için aynı olduğu için her istekte yeniden hesaplanması israf.
- **Profesyonel öneri:** Paylaşımlı kısmı (`categories` ve `leaderboard[category]`) Redis'e 10 dk TTL ile yazın. `isFavorite` kişisel olduğu için bu bilgiyi cache dışında, tek `findMany` ile ekleyin (bugünkü desen zaten böyle: `route.ts:60-67`).

---

## Eksik özellikler (kıyas ürünlerle)

1. **Podyum ve "kutlama" anı (Duolingo Ligleri, Spotify Wrapped):** İlk 3 işletme için logo, rozet ve hafif bir giriş animasyonu içeren görsel bir podyum. Bugün ilk 3, sıradan satırlardan yalnızca küçük bir madalya ikonuyla ayrılıyor.
2. **Kişisel bağ (Starbucks Rewards / Revolut "senin için"):** "Senin gittiğin işletmeler" vurgusu (kullanıcının yorum yaptığı ya da kart kullandığı bayiler), "favorilerinden 2'si bu listede" bilgisi ve kullanıcının en çok gittiği kategoriyle açılış.
3. **Aksiyon alınabilir satır:** Satıra tıklayınca işletme kartı (bottom sheet) açılmalı. İçinde logo, adres, mesafe, açık/kapalı durumu, aktif kampanya, "Yol tarifi", "Favorilere ekle" ve "Bu işletmede görev var" bilgileri olmalı. Bugün liste tamamen çıkmaz sokak.
4. **Hareket ve trend sinyali (Spotify listeleri):** Geçen döneme göre sıra değişimi (▲3 / ▼1 / YENİ) ve "Bu hafta yükselişte" etiketi.
5. **Bağlamsal filtreler:** "Yakınımda" (konum, `/customer/nearby` verisiyle), zaman penceresi (7 / 30 / 90 gün), "en çok değerlendirilen", "açık olanlar". Seçili filtreler URL'de tutulmalı ve paylaşılabilmeli.
6. **Oyunlaştırma köprüsü:** Boş ya da az veri olan kategorilerde "İlk değerlendiren ol, +X XP" çağrısı. Sıralamaya katkı sağlayan yorumlar için "Sıralamayı sen belirledin" rozeti (karakter rozeti sistemiyle uyumlu).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Şehrimin en iyileri" hissi veren, güvenilir, kişisel ve dokunulabilir bir keşif ekranı. Kullanıcı 3 saniyede seçili kategorinin şampiyonlarını görmeli, 1 dokunuşla bir işletmenin kartını açmalı, 2 dokunuşla favoriye eklemeli ya da yol tarifi almalı.

**Yerleşim (mobil öncelikli):**
1. **Üst şerit:** Kompakt bir başlık ("En İyi İşletmeler · Son 90 gün") ve sağda "Puan nasıl hesaplanır?" bilgi ikonu. Büyük hero kartı burada gereksiz yer kaplıyor; kardeş sayfalardaki `DashboardPageHeading` kullanılabilir.
2. **Kategori çipleri:** İkonlu, yatay kaydırmalı, tek satır. Çipte, sıralamaya giren işletme sayısı yazmalı. URL `?category=cafe` ile senkron olmalı.
3. **Podyum (ilk 3):** 2-1-3 dizilimi, logo avatarları, Bayes puanı, yorum sayısı. 1. sırada "Ayın İşletmesi" kraliyet rozeti (o işletme aynı kategorideyse).
4. **Liste (4-50):** `<ol>` yapısında, her satırda logo, ad, mahalle/mesafe, trend oku, puan ve favori toggle olsun. Kullanıcının gittiği işletmeler ince bir "Gittin" etiketiyle işaretlensin.
5. **"Senin yerin" yapışkan alt şeridi:** Kullanıcının favori işletmesi listede 50'nin altındaysa "Favorin X: 63. sırada" bilgisi.
6. **Durumlar:** Skeleton (podyum + 5 satır), hata ve tekrar dene, kategori yok ve Yakınımdakiler CTA'sı, yetersiz veri ve QR tara CTA'sı.

**Motion/3D (yerinde ve ölçülü):**
- Podyum: Sütunlar `m as Motion` ile alttan yükselsin (stagger yaklaşık 80ms, toplam 400ms'den kısa); 1. sırada tek seferlik hafif bir parıltı. 3D ya da three.js **gereksiz**; bu bir bilgi ekranı ve sürpriz kutusu tarzı 3D burada dikkat dağıtır.
- Kategori değişimi: Liste `AnimatePresence` + `layout` ile çapraz geçişsin; aynı işletme iki kategoride de varsa `layoutId` ile yer değiştirsin.
- Favori toggle: Kalbe 150ms'lik bir scale-pop ve optimistik güncelleme.
- `useReducedMotion()` true ise bütün bu animasyonlar opaklık geçişine insin. Hero zaten bu desteğe sahip (`admin-premium-hero.tsx:9`), aynı yaklaşım burada da izlenmeli.

**Veri/API değişiklikleri:**
- `lib/business-categories.ts` (kontrollü sözlük) yazılmalı, bayi profiline kategori seçici eklenmeli, mevcut değerler bir kerelik normalize edilmeli (B1).
- `lib/business-ranking.ts` yazılmalı: güven filtresi (B2) + Bayes skoru + `DENSE_RANK` + tiebreak (B3) + `Feedback ∪ ConsumptionReview` birleşik puan akışı + önceki döneme göre rank delta. Sonuç Redis'te `rank:{category}:{window}` anahtarıyla 10-15 dk TTL tutulmalı (B13).
- `GET /api/customer/category-leaderboard` yanıtı şunları içermeli: `{ categories:[{slug,label,icon,rankedCount}], leaderboard:[{rank, dealerId, name, logo, district, distanceKm?, score, avgRating, feedbackCount, rankDelta, isFavorite, visitedByMe, isBusinessOfMonth}], me:{favoritesOutsideTop?:[...]}, meta:{window, minReviewers, formula} }`. Rol kısıtı `CUSTOMER` ve menü kapısı eklenmeli.
- İstemci tarafında SWR + AbortController ile yarış koşulu (B4) kapatılmalı, `res.ok` ile hata ayrımı (B5) yapılmalı, favori için `POST/DELETE /api/customer/favorites` optimistik mutasyonla bağlanmalı.

---

## Çakışmalar / birleştirme önerisi

| Çakışan yüzey | Ne çakışıyor | Kanıt |
|---|---|---|
| `/customer/trends` | Aynı sidebar grubunda; "Trend mekanlar" (discovery `trendingVenues`), "Haftanın en iyileri" ve "Ayın İşletmesi" rozetini gösteriyor; yani aynı soruyu farklı formülle cevaplıyor. | `app/customer/trends/page.tsx:122-148,406-500`; `sidebar.tsx:296-297` |
| `/customer/nearby` | İşletme keşfi + kategori normalizasyonu + AI önerileri. "Ayın İşletmesi" bağlantısı buraya `?focus=` ile gidiyor, ama nearby sayfası bu parametreyi okumuyor (`useSearchParams` yok). | `components/customer/business-of-month-badge.tsx:49`; `app/customer/nearby/page.tsx` |
| `/customer/favorites` | Favori işletme listesi; bu sayfada favori yalnızca okunuyor. | `app/customer/favorites/page.tsx:40,51` |
| `/customer/leaderboard` | Adı ve ikonu benziyor (kullanıcı/oyuncu sıralaması, Trophy). Menüde üç Trophy ikonu var (`category_leaderboard`, `badges`, `leaderboard`) ve bu, bilgi mimarisinde karışıklık yaratıyor. | `sidebar.tsx:297,302,317` |

**Öneri: birleştir.** `/customer/category-leaderboard` bağımsız bir menü öğesi olarak kalmasın. `/customer/nearby` ile birlikte tek bir **"Keşfet" yüzeyinin "En İyiler" sekmesi** olsun. Bu sekme podyum + kategori sıralamasını içersin; "Yakınımda" sekmesi harita ve listeyi, "Trend" sekmesi ise `/customer/trends`'teki mekân kartlarını göstersin. Böylece `/customer/trends` yalnızca kullanıcının **kendi** istatistik trendlerine odaklanır (sayfanın asıl verisi zaten `summary/trends/sentiment`), işletme keşfi tek bir yerde ve tek bir sıralama servisiyle (B7) toplanır. Eski URL bir `redirect` ile `/customer/nearby?tab=top&category=…` adresine yönlendirilir. Sidebar'da Trophy ikonu yalnızca oyuncu sıralamasına kalır; burada `Award` ya da `Crown` kullanılır. "Ayın İşletmesi" rozetinin `?focus=` bağlantısı da bu birleşik yüzeyde gerçek bir odak davranışına kavuşur.

---

## Doğrulama (şüpheci inceleme)

Dört KRİTİK/YÜKSEK iddiayı çürütmeye çalıştım. Bunun için sayfayı, API'yi, `proxy.ts`'i, feedback POST akışını, rate-limit'i, Prisma şemasını ve `businessCategory` alanına yazan her yeri baştan okudum. Kod değiştirilmedi, DB'ye dokunulmadı. Canlı veri okunmadığı için "üretimde şu an hangi değerler var" sorusu doğrulanmadı. Kararlar kod okumasına dayanıyor.

### 1. Kategori verisi üretimde dolmuyor: **DOĞRULANDI**
- `businessCategory` alanına yazan kodun tamamı (`generated-prisma-client` hariç repo genelinde grep): `app/api/admin/bootstrap/route.ts:249-252` (`seed_insights_categories`), `:270-276` (`clear_insights_categories`) ve `lib/demo-cafes-seed.ts:139,149`. Başka yazan yer yok.
- Ürün yolu yok: `app/api/user/profile/route.ts:11-24` zod şemasında alan bulunmuyor. Admin kullanıcı düzenlemede de yok (`app/api/admin/users/route.ts:15-30`, `:337-339` `data: validatedData.data`). Kayıt akışında da yok (`app/api/auth/register/route.ts`).
- Raporun yazdığından daha kötü bir durum var: `seed_insights_categories` yalnızca demo bayileri değil, kategorisi boş olan **tüm** `role: 'DEALER'` kullanıcılarını dolaşıyor (`bootstrap/route.ts:239-252`). Gerçek bayilere de `demo-cafe`, `demo-hotel` gibi etiketleri kalıcı olarak yazıyor. `clear_insights_categories` ise `businessCategory` dolu olan **tüm** bayileri null'a çekiyor (`:270-276`). Buna `lib/demo-cafes-seed.ts` ile verilmiş `cafe/restaurant/bakery` değerleri de dahil.
- Senaryo: Admin bootstrap'tan "insights kategorileri"ni tohumlar. Müşteri sayfayı açar ve `demo-cafe (12)` gibi çipler görür (`page.tsx:57-66`, `capitalize` ile "Demo-cafe" olarak). Tohumlama yapılmamışsa çip hiç çıkmaz ve tek görünen şey "yeterli yorum yok" kartı olur. İki durumda da sayfa amacına hizmet etmiyor.

### 2. Anonim ve kendi yorumlarıyla sıralama manipülasyonu: **DOĞRULANDI**
- `app/api/feedbacks/route.ts:243-258`: `userId: session?.user?.id || null`. Anonim gönderime izin var ve gönderenin rolü ya da QR sahibi olup olmadığı kontrol edilmiyor. Trust Score değerlendirmesi yalnızca oturum açmış kullanıcıda çalışıyor (`:269`).
- Sınırlar IP başına: genel `20/dk` (`:171`) ve aynı QR+IP için `5/dk` (`lib/rate-limit.ts:167,267-272`; IP kaynağı `x-forwarded-for`, `:208-212`). Üç yorum bu sınırların çok altında kalıyor. Captcha ya da cihaz parmak izi yok (`lib/validations.ts:93-113`).
- Sıralama sorgusu `trustFlagged`, `fraudScore` ve `isToxic` alanlarını (`prisma/schema.prisma:780,822,826`) ya da yazarın `fraudStatus` değerini hiç filtrelemiyor. Tek koşullar `deletedAt IS NULL` ve `HAVING COUNT>=3`, sıralama da ham `ORDER BY avg_rating DESC` (`route.ts:52-56`).
- Senaryo: Kategorisi atanmış bir bayi kendi aktif QR'ına giriş yapmadan (ya da kendi bayi oturumuyla) bir dakika içinde 3 adet 5★ gönderir. Ortalaması 5.00, sayısı 3 olur ve 4.8 ortalamalı, 300 yorumlu rakibinin önüne geçerek 1. sıraya yerleşir. Bu durum iddia 1'e bağlı değil: `lib/business-of-month.ts:52-75` kategoriden bağımsız ve global olarak aynı ham ortalama + `MIN_FEEDBACKS` mantığını kullanıyor. Yani "Ayın İşletmesi" rozeti kategori verisi hiç olmasa bile aynı yöntemle ele geçirilebilir.
- Etki hafifletici: Bu yorumlar bayinin kendi paneline de düşer ve puan kazandırmaz (anonim). Yine de herkese açık sıralamanın güvenilirliği doğrudan bozuluyor.

### 3. Kategori değişiminde yarış koşulu: **DOĞRULANDI** (önem: orta, KRİTİK değil)
- `page.tsx:34-41`: `loadBoard` ne `AbortController` ne de istek kimliği kullanıyor. `setRows` ve `setLoading(false)` koşulsuz çağrılıyor. `useEffect` cleanup'ı yok (`:43-45`).
- Senaryo: Kullanıcı A çipine tıklar, hemen ardından B'ye tıklar. B'nin yanıtı önce döner ve liste B olur, spinner kapanır. A'nın yanıtı sonra döner ve `setRows(A)` çalışır. Ekranda B çipi seçili görünürken A kategorisinin işletmeleri listelenir. Ters sırada dönüşte de önce dönen yanıt `loading`'i erken kapatıyor. `force-dynamic` + no-store olduğu için (`route.ts:8,78-80`) yanıt süreleri gerçekten değişken. Veri sızıntısı yok (iki liste de herkese açık), sorun yanlış bilgi gösterilmesi.

### 4. API hataları "yeterli yorum yok" olarak gösteriliyor: **DOĞRULANDI** (önem: orta)
- `proxy.ts:105-119`: `/api/*` istekleri auth yönlendirmesine uğramadan geçiyor. Bu yüzden route'un JSON hata gövdeleri istemciye olduğu gibi ulaşıyor: 401 (`route.ts:22-24`), 503 (`lib/api-http.ts:18-27`), 500 (`route.ts:86`).
- `page.tsx:24,37`: `r.ok` kontrol edilmiyor. `{error}` gövdesinde `d.categories` ve `d.leaderboard` undefined olduğundan boş diziye düşüyor. `.catch` yalnızca ağ ya da JSON parse hatasında çalışıyor, yani toast çıkmıyor.
- Senaryo: Oturum süresi dolmuş ya da Neon geçici olarak erişilemez durumda. İlk istekte çip listesi boş geliyor, `selected` null kalıyor ve ekranda kategori yokken bile "Bu kategoride yeterli yoruma sahip işletme yok" yazıyor (`page.tsx:73-78`). İkinci istekte hata olursa önceki kategori listesi siliniyor ve aynı yanlış mesaj görünüyor. `retryable: true` bilgisi kullanılmıyor ve yeniden deneme düğmesi yok.

**Özet:** Dört iddianın dördü de kodda gerçek. 1 ve 2 ürün ve güvenlik açısından YÜKSEK önemde. 2'nin "Ayın İşletmesi" ayağı kategori verisinden bağımsız olarak da sömürülebilir. 3 ve 4 gerçek ama istemci tarafında kalan orta önemli doğruluk/UX hataları. Bunlar KRİTİK değil, düzeltmeleri de ucuz (AbortController/SWR ve `res.ok` + hata/yeniden dene durumu). Üretimdeki gerçek `businessCategory` değerleri canlı DB okunmadığı için doğrulanmadı.
