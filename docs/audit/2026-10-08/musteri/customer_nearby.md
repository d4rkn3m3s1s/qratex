# /customer/nearby

**Amaç:** Müşterinin konumuna göre yakındaki işletmeleri (harita + liste), canlı happy-hour çarpanlarını, kısa süreli flash teklifleri, bölge trendlerini ve kişisel AI önerilerini tek ekranda göstermek. Sistemdeki tüm "mekana git / ayın işletmesi / favori işletme sayfası" bağlantılarının hedef sayfası.

**Genel puan: 4/10** · **Karar: yeniden tasarla** (veri katmanı + bilgi mimarisi; harita bileşeni ve konum izni akışı korunabilir)

> İnceleme salt okunurdur; kod çalıştırılmadı, DB'ye dokunulmadı. Tüm bulgular dosya okunarak doğrulandı; doğrulanamayanlar ayrıca işaretlendi.

İncelenen dosyalar:
- `app/customer/nearby/page.tsx` (713 satır, tek istemci bileşeni), `app/customer/nearby/layout.tsx`
- `components/map/nearby-map-lazy.tsx`, `components/map/nearby-map.tsx`, `components/dashboard/page-heading.tsx`
- API: `app/api/customer/discovery/route.ts`, `app/api/customer/innovation/nearby/route.ts`, `app/api/customer/innovation/radar/route.ts`, `app/api/customer/ai-recommendations/route.ts`
- `lib/happy-hour-live.ts`, `lib/ai-engine.ts` (askAI), `lib/discovery-config.ts`, `proxy.ts`, `next.config.*` (images), `prisma/schema.prisma` (User, DealerFlashOffer, CustomerFavoriteDealer, DealerWeeklyBrief), `messages/tr.json`
- Bu sayfaya bağlanan çağıranlar: `components/customer/dashboard/customer-dashboard.tsx`, `components/customer/business-of-month-badge.tsx`, `components/customer/recommendations-section.tsx`, `app/customer/favorites/page.tsx`, `app/customer/trends/page.tsx`, `app/customer/spending-overview/page.tsx`

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Konumu olmayan kullanıcı sonsuz iskelet görüyor, puan/trend verisi yakın mekanların çoğu için sıfır, "açık/kapalı" uydurma, sistemdeki tüm `?focus=` derin bağlantıları hiçbir şey yapmıyor. |
| UX | 4/10 | Asıl içerik (mekan listesi) altı kart aşağıda; ham koordinat, ham "Trend 42" sayısı, ham tema ağırlıkları gibi anlamsız veriler; mekan kartı hiçbir yere gitmiyor. |
| Görsel | 5/10 | Temiz shadcn kartları ama her bölüm farklı gradyan (mor/amber/cyan), hiyerarşi yok, "kart yığını" görünümü; harita karanlık temada beyaz. |
| Mimari | 3/10 | 713 satırlık tek dosya, `any`, React Query yok, her filtre değişikliğinde LLM çağrısı, discovery uç noktası sayfanın kullanmadığı 4 veri setini her istekte hesaplıyor, iki innovation ucu kimlik doğrulamasız. |
| Performans | 3/10 | Her tuş vuruşu 4 istek (biri LLM); discovery her istekte ~25k feedback + ~20k review + 8k kategori satırı tarıyor, önbellek yok. Harita lazy-load iyi. |
| Erişilebilirlik + Mobil | 5/10 | Mobil CTA ve 44px dokunma hedefleri düşünülmüş; ama etiketler input'a bağlı değil, `animate-pulse` reduced-motion'a uymuyor, yükleme durumu duyurulmuyor, karışık TR/EN. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (layout) | ÇALIŞIYOR | `app/customer/nearby/layout.tsx:4-6` | i18n anahtarlı başlık/açıklama. |
| 2 | Masaüstü başlık + "Konumu Güncelle" aksiyonu | KISMİ | `page.tsx:316-325`, `page-heading.tsx:21` | Konum hiç yokken de "Güncelle" yazıyor; mobilde gizli (tasarım gereği). |
| 3 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:327-332` | Mobil CTA butonunun ALTINDA duruyor; hiyerarşi ters (CTA başlıktan önce). |
| 4 | Mobil üst konum CTA'sı | ÇALIŞIYOR | `page.tsx:294-314` | min-h-11, touch-manipulation; durum etiketleri doğru. |
| 5 | Konum izni açıklama modalı (iOS jest uyumu) | ÇALIŞIYOR | `page.tsx:105-109, 267-291` | "Vazgeç" sabit Türkçe (`:283`); konum zaten varken "güncelle" için de modal açıyor (gereksiz sürtünme). |
| 6 | `navigator.geolocation` ile konum alma | ÇALIŞIYOR | `page.tsx:111-151` | Hata kodları ayrıştırılıyor; timeout 15 sn, maximumAge 2 dk. |
| 7 | Konumu localStorage'da 7 gün saklama | KISMİ | `page.tsx:73-74, 127-134, 153-178` | Bozuk kayıt temizleniyor (iyi); ama 7 günlük konum "taze" gibi kullanılıyor, yaş göstergesi yok; paylaşılan cihazda hassas koordinat kalıyor. |
| 8 | "Konumu paylaşın" bilgi kartı | ÇALIŞIYOR | `page.tsx:334-353` | Masaüstünde buton var, mobilde gizli (üst CTA'ya güveniyor). |
| 9 | Mesafe filtresi (km input) | KISMİ | `page.tsx:361-370` | Üst sınır (50) yalnız HTML attribute; `onChange` sadece alt sınırı kırpıyor, sunucu da kırpmıyor (`discovery/route.ts:116`). Debounce yok — her tuş 4 istek. |
| 10 | Kategori filtresi (Tümü/Kahve/Tatlı/Yemek) | KISMİ | `page.tsx:93-101, 372-384`; `discovery/route.ts:51-64, 411` | Sabit 4 kategori; normalizasyon kaba anahtar kelime eşleşmesi. |
| 11 | "Listeyi Yenile" butonu | ÇALIŞIYOR | `page.tsx:386-389` | Yan etki: konumsuz kullanıcıda sonsuz iskeleti kapatan TEK yol bu (bkz. Bulgu 1). |
| 12 | Discovery verisi çekme | KISMİ | `page.tsx:180-205` | Hata yalnız `console.error`; kullanıcıya hata UI'ı yok, AbortController yok (yarış). |
| 13 | Flash teklifler kartı ("Şimdi yakınımda") | KISMİ | `page.tsx:394-419`; `innovation/nearby/route.ts` | Sadece gösterim: talep/kullan butonu yok, `redemptionCount` hiçbir yerde artırılmıyor; bitiş yalnız saat (tarih yok); başlıklar sabit TR. |
| 14 | Bölge trendleri — öne çıkan temalar | KISMİ | `page.tsx:431-445`; `radar/route.ts:123-137` | Ham ağırlık sayısı rozet içinde (`:440`) — kullanıcıya anlamsız. |
| 15 | Bölge trendleri — deneyim ipuçları | SAHTE (kopya) | `page.tsx:446-457`; `radar/route.ts:139` | "İpuçları" aslında flash tekliflerin başlıklarının tekrarı; aynı içerik iki kartta. |
| 16 | Bölge trendleri — "öne çıkan 3 lezzet" | KISMİ | `page.tsx:458-475`; `radar/route.ts:95-121, 141-149` | Ürün yoksa tema kartlarına düşüyor ama başlık hâlâ "3 lezzet" diyor. |
| 17 | Radar açıklama metni | KISMİ | `radar/route.ts:68, 159` | Yazım hatası: "özetdir" → "özettir". |
| 18 | AI Keşif Önerileri kartı | SAHTE/KISMİ | `page.tsx:480-520`; `ai-recommendations/route.ts:121-146` | Konumu/mekanları hiç kullanmıyor ("Keşif" değil); AI hata metni ("Bir hata oluştu…") öneri gibi gösteriliyor; her filtre değişikliğinde yeniden LLM çağrısı. |
| 19 | AI istatistik şeridi (Genel Puan / Olumlu / Aciliyet) | KISMİ | `page.tsx:497-517` | "Aciliyet" müşteriye anlamsız iç metrik; `(aiStats.avgUrgency * 10)?.toFixed(1)` optional chaining yanlış yerde; `any` tipli. "Cortex 2.0 Analizi" süs rozeti. |
| 20 | Canlı Happy Hour çarpanları şeridi | KISMİ | `page.tsx:522-549`; `discovery/route.ts:415-474` | Global happy hour en yakın mekanın adıyla etiketleniyor (yanlış atıf); kartlar tıklanamaz. |
| 21 | Ham koordinat gösterimi | SAHTE değer / gizlilik | `page.tsx:551-557` | 6 ondalıklı enlem/boylam (~10 cm) ekrana basılıyor; kullanıcıya değer katmıyor. |
| 22 | Yükleniyor iskeleti | BOZUK | `page.tsx:78, 220-225, 559-566` | Konum yoksa `loading` hiç false olmuyor → sonsuz iskelet. |
| 23 | Konum hatası yardım kartı | BOZUK (erişilemez) | `page.tsx:569-586` | `!loading` dalının içinde; Bulgu 1 nedeniyle hiç render olmuyor. |
| 24 | Boş durum ("konum yok" / "filtrede yok") | KISMİ | `page.tsx:587-594` | API hatası da "filtrede mekan yok" olarak görünüyor (yanıltıcı). |
| 25 | Leaflet/OSM harita (lazy, ssr:false) | ÇALIŞIYOR | `nearby-map-lazy.tsx:13-16`, `nearby-map.tsx:62-118` | İyi: ayrı chunk, API key yok, attribution var, fitBounds. |
| 26 | Harita: kullanıcı konumu noktası | ÇALIŞIYOR | `nearby-map.tsx:86-92` | |
| 27 | Harita: mekan pinleri + popup | KISMİ | `nearby-map.tsx:94-113` | Popup'ta emoji (⭐🟢🔴) ve sabit TR; popup'tan aksiyon yok. |
| 28 | Harita pinine tıklayınca listeye kaydırma | KISMİ | `page.tsx:619-621` | Kaydırıyor ama hedef kart vurgulanmıyor; `scroll-behavior: smooth` reduced-motion'a bakmıyor. |
| 29 | Harita karanlık tema | EKSİK | `nearby-map.tsx:79-83` | Her zaman açık renk OSM döşemesi. |
| 30 | Mekan kartı: logo/avatar | KISMİ | `page.tsx:631-639`; `next.config` `images.remotePatterns` | `next/image` optimize ediliyor; işletme `image` alanı serbest URL (`api/user/profile/route.ts:13`), listede olmayan host'ta prod'da 400 → kırık görsel. Favoriler sayfası aynı sorun için `unoptimized` kullanıyor (`favorites/page.tsx:131`). |
| 31 | Mekan kartı: ad + adres | ÇALIŞIYOR | `page.tsx:640-643` | |
| 32 | Mekan kartı: mesafe rozeti | ÇALIŞIYOR | `page.tsx:66-71, 646` | Liste 2 ondalık km, harita 1 ondalık km — tutarsız biçim. |
| 33 | Mekan kartı: Açık/Kapalı | SAHTE | `discovery/route.ts:76-88, 315-320, 406` | Yalnız admin discovery config'deki saatlere bakıyor; yoksa varsayılan 09-23 "Açık". `User.businessHours` ve `User.holidayMode` (`schema.prisma:89,92`) hiç okunmuyor; ayrıca sunucu saat dilimiyle (`getHours`) hesaplanıyor. |
| 34 | Mekan kartı: puan + yorum sayısı | BOZUK (çoğu mekan için) | `discovery/route.ts:205-219, 321-323, 403-405` | Puan yalnız platform geneli ilk 8 "trend" mekan için var; diğer tüm yakın mekanlar "Henüz puan yok". |
| 35 | Mekan kartı: "Trend N" rozeti | BOZUK/anlamsız | `page.tsx:656`; `discovery/route.ts:208` | Aynı nedenle çoğunlukla "Trend 0"; ham skor kullanıcıya bir şey anlatmıyor. |
| 36 | Mekan kartı: kategori rozetleri | ÇALIŞIYOR | `page.tsx:658-666` | `justify-end` ile sağa yaslı, boş sol — hizalama garip. |
| 37 | Mekan kartı: Yol tarifi (Google Maps) | KISMİ | `page.tsx:668-684` | Elimizde lat/lng varken hedef olarak adres metni gönderiliyor (yanlış eşleşme riski); Apple Haritalar seçeneği yok. |
| 38 | Mekan kartı: Hemen Ara (`tel:`) | ÇALIŞIYOR | `page.tsx:685-703` | Telefon yoksa devre dışı görünüm. |
| 39 | Mekan detay / menü / favoriye ekle | EKSİK | `page.tsx:627-707`; `discovery/route.ts:477-485` | API `favoriteDealerIds` döndürüyor ama sayfa kullanmıyor; mekan detay sayfası sistemde yok. |
| 40 | Derin bağlantılar `?focus=`, `?dealerId=`, `?promo=` | BOZUK | Çağıranlar: `customer-dashboard.tsx:851, 943, 995`, `business-of-month-badge.tsx:49`, `recommendations-section.tsx:64`, `favorites/page.tsx:161` | Sayfa `useSearchParams` kullanmıyor; bu linkler genel sayfaya düşüyor, konumsuz kullanıcı sonsuz iskelete. |
| 41 | Sıralama seçenekleri (mesafe/puan/açık olanlar) | EKSİK | `discovery/route.ts:412` | Sadece mesafeye göre sabit, ilk 20. |
| 42 | Arama (mekan adı) | EKSİK | — | |
| 43 | Sayfalama / "daha fazla" | EKSİK | `discovery/route.ts:413` | 20'de sessizce kesiliyor. |
| 44 | Modül/menü kapısı | KISMİ | `discovery/route.ts:99-111` | Discovery ucu kapılı; sayfa kapısız, kapalı modülde kullanıcı "filtrede mekan yok" görüyor. Innovation uçları kapısız. |
| 45 | i18n | KISMİ | `page.tsx:283, 399-401, 426, 434, 449, 461, 469, 488-514`; `nearby-map.tsx:76, 91, 106-108` | ~20 sabit Türkçe metin; EN kullanıcı karışık dil görür. |
| 46 | Azaltılmış hareket desteği | EKSİK | `page.tsx:487, 562, 620` | `animate-pulse` (motion-safe değil), smooth scroll. |

**Durum özeti:** ÇALIŞIYOR 14 · KISMİ 20 · BOZUK 5 · SAHTE 3 · EKSİK 4 (toplam 46)

---

## Bulgular (önem sırasıyla)

### 1. [KRİTİK] Konumsuz kullanıcı sonsuz yükleniyor iskeleti görüyor; konum hatası kartı hiç görünmüyor
- **Kategori:** işlevsellik / hata durumu
- **Kanıt:** `page.tsx:78` (`useState(true)`), `page.tsx:220-225` (fetch yalnız koordinat varsa), `page.tsx:180-184` (loading=false sadece fetchNearby içinde), `page.tsx:559-586` (yardım kartı `!loading` dalında).
- **Sorun:** İlk ziyarette (localStorage boş) `fetchNearby` hiç çağrılmıyor, `loading` sonsuza dek `true`. Kullanıcı 4 nabız atan boş kart görüyor; izin reddedilince gösterilmesi gereken "Konum erişimi gerekli" yardım kartı (`:569`) asla render olmuyor. Dashboard'daki "Ziyaret Et"/"Ayın İşletmesi" linklerinden gelen her yeni kullanıcı bu ekranla karşılaşıyor.
- **Öneri:** Sayfa durumunu açık bir durum makinesine taşı: `needs-permission | locating | denied | loading | ready | error | empty`. `loading` ancak bir istek gerçekten uçuştayken true olmalı (React Query `isFetching`/`enabled: hasCoords` bunu bedavaya verir). `denied` durumunda platforma özel rehber (iOS/Android/masaüstü) + "konum yerine şehir/semt seç" alternatifi göster.
- **Efor:** S

### 2. [YÜKSEK] Sistemdeki tüm mekan derin bağlantıları ölü (`?focus=`, `?dealerId=`, `?promo=`)
- **Kategori:** işlevsellik / bilgi mimarisi
- **Kanıt:** Sayfa `useSearchParams` içermiyor (`page.tsx:3-14`). Çağıranlar: `customer-dashboard.tsx:851` ("Sayfasına Git"), `:943` ("Ziyaret Et"), `:995` (promo kartları), `business-of-month-badge.tsx:49`, `recommendations-section.tsx:64`, `favorites/page.tsx:161`.
- **Sorun:** Müşteri panelinin en görünür CTA'ları (Ayın İşletmesi, favori mekan, öneriler, promosyonlar) "mekanın sayfasına" gideceğini vaat ediyor ama genel listeye düşüyor; promo ID tamamen kayboluyor. Kullanıcı açısından "kırık link".
- **Öneri:** İki aşamalı çözüm: (a) Kısa vadede sayfa `focus/dealerId` parametresini okuyup ilgili kartı açık bir **mekan detay çekmecesi (Sheet)** olarak göstersin — konum olmasa da `GET /api/customer/venues/[dealerId]` ile mekan bilgisi gelsin; `promo` parametresi ilgili flash/sponsor kartını vurgulasın. (b) Orta vadede gerçek `/customer/venue/[dealerId]` rotası (menü, aktif teklifler, puan dağılımı, "QR okut ve puan kazan" CTA'sı, favori) oluşturulup tüm çağıranlar oraya yönlendirilsin.
- **Efor:** M (a) / L (b)

### 3. [YÜKSEK] Puan ve trend verisi yakın mekanların çoğu için sıfır
- **Kategori:** veri doğruluğu
- **Kanıt:** `discovery/route.ts:205-219` (`trendingVenues` platform genelinde ilk 8'e kesiliyor), `:321-323` (`scoreByDealerId` bu 8'den kuruluyor), `:403-405` (yakın mekanın puanı bu haritadan okunuyor).
- **Sorun:** Bir mekanın 30 günde 200 geri bildirimi olsa bile platformun genel ilk 8'i içinde değilse kartta "Henüz puan yok" ve "Trend 0" yazar. Bu, müşterinin karar vermek için baktığı tek kalite sinyalini yanlışlıyor ve iyi işletmelere haksızlık.
- **Öneri:** Puanı "global top-N" yerine yarıçaptaki mekan kümesi için hesapla: önce yakın dealer ID'lerini bul, sonra `feedback` üzerinde `qrCode.dealerId IN (...)` ile `groupBy`/ham SQL `AVG, COUNT` (30 gün). Daha iyisi: gece cron'u ile `DealerRatingSnapshot` (dealerId, avgRating30d, count30d, trendDelta) tablosu/Redis hash'i üret ve discovery bunu okusun. "Trend" ham skor yerine kullanıcı diliyle gösterilsin: "Bu hafta yükselişte", "Yeni", "Çok sevilen".
- **Efor:** M

### 4. [YÜKSEK] "Açık / Kapalı" durumu uydurma ve saat dilimi hatalı
- **Kategori:** veri doğruluğu
- **Kanıt:** `discovery/route.ts:76-88` (`now.getHours()` — sunucu TZ), `:77-78` (saat yoksa varsayılan 09:00-23:00), `:315-320` (sadece admin discovery config kaynak), `schema.prisma:89` (`businessHours` JSON) ve `:92` (`holidayMode`) okunmuyor. Proje standardı UTC (`lib/timezone.ts:1-4`, `lib/happy-hour-live.ts:22-24` UTC kullanıyor) — bu fonksiyon tutarsız.
- **Sorun:** İşletmenin kendi panelinde girdiği çalışma saatleri ve tatil modu yok sayılıyor; çoğu mekan 09-23 arası koşulsuz "Açık" görünüyor. Vercel sunucusu UTC'de çalıştığından TR saatiyle 3 saat kayık (09:00-12:00 TRT arası "Kapalı", 23:00-02:00 TRT arası "Açık"). Kullanıcıyı kapalı mekana yollamak güveni doğrudan zedeler.
- **Öneri:** `lib/business-hours.ts` içinde tek kaynak fonksiyon: `isOpenNow(businessHours, holidayMode, tz = 'Europe/Istanbul', now)` — `Intl.DateTimeFormat` ile hedef TZ'de gün/saat çıkarılsın; öncelik sırası holidayMode > businessHours > config > "bilinmiyor". Saat bilinmiyorsa "Açık" demek yerine rozet hiç gösterilmesin. Ek olarak "23:00'te kapanıyor", "Yarın 09:00'da açılıyor" gibi bağlamsal metin ver (Google Maps standardı).
- **Efor:** M

### 5. [YÜKSEK] Her filtre değişikliğinde LLM çağrısı (maliyet + gecikme), AI kartı aslında "keşif" değil
- **Kategori:** performans / maliyet / ürün dürüstlüğü
- **Kanıt:** `page.tsx:220-225` (`fetchAiRecommendations` bağımlılıkları `latitude, longitude, radiusKm, category`), `ai-recommendations/route.ts:135` (`askAI` her istekte, önbellek/oran sınırı yok), `:121-133` (prompt konumu/mekanları içermiyor), `lib/ai-engine.ts` askAI hata dalı `'Bir hata oluştu. Lütfen tekrar deneyin.'` ve `'AI asistanı şu anda kullanılamıyor.'` string döndürüyor → `page.tsx:480-495` bunu "Sana Özel AI Keşif Önerileri" olarak gösteriyor.
- **Sorun:** Kullanıcı mesafe kutusuna "15" yazdığında iki LLM çağrısı tetikleniyor; kategori değiştirmek bir LLM çağrısı daha. Sonuç ise konumla ilgisiz, geri bildirim davranışına dair genel tavsiye. Hata metni bile süslü mor kartta "öneri" gibi duruyor. Aynı uç `/customer/ai-insights` sayfasında da kullanılıyor (`ai-insights/page.tsx:179`) — içerik kopyası.
- **Öneri:** Bu kartı sayfadan kaldır veya gerçek bir "Sana uygun 3 mekan" önerisine dönüştür: yakın mekan kümesi + kullanıcının geçmiş kategori/puan tercihleri ile deterministik bir skor (LLM gerekmez), LLM yalnız tek cümlelik "neden" açıklaması için ve `userId+geohash5+gün` anahtarıyla Upstash'te 24 saat önbellekli. AI hata durumları `{ ok:false }` olarak dönmeli, UI kartı gizlemeli. Oran sınırı (kullanıcı başına günde N) ekle.
- **Efor:** M

### 6. [YÜKSEK] Debounce yok + yarış koşulu: her tuş 4 ağır istek, eski yanıt yenisini ezebilir
- **Kategori:** performans / doğruluk
- **Kanıt:** `page.tsx:368` (her tuşta `setRadiusKm`), `:220-225` ve `:227-262` (iki efekt, toplam 4 fetch), `:180-205` (AbortController/iptal bayrağı yok; innovation efektinde var `:229, 259-261`).
- **Sorun:** "25" yazmak = 8 istek (2 LLM). Yanıtlar sırasız dönerse `venues` 2 km sonucuyla kalabilir, ekranda 25 yazarken. Radar ucu her radius değişiminde tekrar çağrılıyor ama zaten sabit `radiusKm=25` kullanıyor (`:238`) — tamamen boşa.
- **Öneri:** Veri katmanını React Query'ye taşı (`useQuery(['nearby', geohash, radius, category])`, `placeholderData: keepPreviousData`, otomatik iptal), mesafeyi serbest input yerine **segment kontrol / slider** (1, 3, 5, 10, 25 km) yap ve 300 ms debounce uygula. Radar sorgusunun anahtarı sadece kaba konum (geohash5) olsun.
- **Efor:** S-M

### 7. [YÜKSEK] Discovery ucu her istekte platform geneli on binlerce satır tarıyor, önbellek yok
- **Kategori:** performans / mimari
- **Kanıt:** `discovery/route.ts:124-152` (25.000 feedback + 20.000 consumptionReview ilişkili), `:154-170` (QR kod chunk sorguları + 5.000 user), `:358-372` (8.000 productCategory), `:487-498` (`trendingVenues`, `weeklyBest`, `sponsored` döndürülüyor — bu sayfa hiçbirini kullanmıyor). Aynı uç dashboard'dan (`customer-dashboard.tsx:173`) ve trends sayfasından (`trends/page.tsx:133`) da çağrılıyor.
- **Sorun:** Konumdan bağımsız, tüm kullanıcılar için aynı olan "trend" hesabı her kullanıcının her filtre değişikliğinde baştan yapılıyor. Neon pooler bağlantı sınırıyla birlikte (bkz. perf notları) bu uç sayfanın en yavaş parçası olmaya aday. Ayrıca sunucu `radiusKm`'i üstten kırpmıyor (`:116`) — 100000 km istendiğinde `padLng=180` ile 2.000 dealer çekilip işleniyor.
- **Öneri:** Ucu ikiye böl: (1) `GET /api/customer/nearby?lat&lng&radius&category&sort&cursor` — yalnız yakın mekanlar, bbox sorgusu (ileride PostGIS/`earthdistance` veya geohash indeksi), `radiusKm` 0.5-50 aralığına kırpılmış, zod ile doğrulanmış; (2) global trend/weeklyBest/sponsored için Upstash'te 5-10 dk önbellekli ayrı uç (dashboard bunu kullanır). Puan snapshot'ı Bulgu 3'teki gibi önceden hesaplanmış olsun.
- **Efor:** L

### 8. [ORTA] Innovation uçları kimlik doğrulamasız ve modül kapısız
- **Kategori:** güvenlik / erişim
- **Kanıt:** `innovation/nearby/route.ts:12-31` ve `radar/route.ts:12-31` — `getServerSession` yok; `proxy.ts:104-118` `/api/*` için yalnız güvenlik/CORS başlığı ekliyor, auth uygulamıyor.
- **Sorun:** Herhangi bir anonim istemci rastgele koordinatlarla aktif flash teklifleri, `dealerId`'leri, işletme adlarını ve 0.1 km hassasiyetli mesafeleri toplayabilir; bu, radar'ın "işletme adresi paylaşılmaz" vaadiyle çelişiyor (birkaç noktadan trilaterasyonla konum çıkarılabilir). Ayrıca kapalı müşteri modülünde bile veri akıyor. İşletme konumları kamuya açık sayılabileceği için etki orta düzey.
- **Öneri:** Diğer customer uçlarıyla aynı deseni uygula: session zorunlu + `assertMenuItemVisible('nearby')` + `assertModuleEnabled('discovery')` + IP/kullanıcı oran sınırı. Mesafeyi 0.5 km kovalara yuvarla.
- **Efor:** S

### 9. [ORTA] Radar yalnız rastgele ilk 400 işletmeye bakıyor
- **Kategori:** veri doğruluğu / ölçeklenebilirlik
- **Kanıt:** `radar/route.ts:36-49` (`take: 400`, coğrafi filtre ve sıralama yok), `:51-57`.
- **Sorun:** İşletme sayısı 400'ü geçtiğinde kullanıcının yakınındaki işletmeler sorgu dışında kalabilir; "bölge trendleri" boş ya da başka bölgenin verisi olmasa da eksik olur. Sıralamasız `take` deterministik bile değil.
- **Öneri:** Discovery'deki bbox ön filtresini (`discovery/route.ts:326-345`) ortak `lib/geo-query.ts` yardımcısına çıkar ve radar + flash uçlarında kullan; sonucu geohash5 başına 15 dk önbellekle.
- **Efor:** S

### 10. [ORTA] Global happy hour yanlış işletmeye atfediliyor
- **Kategori:** veri doğruluğu / UX
- **Kanıt:** `discovery/route.ts:452-468` — `dealerId=null` happy hour için en yakın mekanın `businessName`'i kartta işletme adı olarak kullanılıyor; `page.tsx:537-543`.
- **Sorun:** Platform geneli bir "×2 puan saati", kullanıcıya "X Kafe" kampanyası gibi görünüyor. Mekan yoksa "Yakın bölge · 0 m" gösteriyor.
- **Öneri:** `scope === 'global'` kartları ayrı stil ve metinle göster: "Tüm Qratex mekanlarında ×2 — 18:00'e kadar". Mekana özel olanlar mekan kartının üstünde rozet olarak birleşsin (mekan kartında "Şu an ×1.5 puan").
- **Efor:** S

### 11. [ORTA] Flash teklifler kullanılamıyor; demo teklifleri gerçek müşterilere sızabilir
- **Kategori:** işlevsellik / veri bütünlüğü
- **Kanıt:** `page.tsx:404-416` (aksiyon yok), `redemptionCount` yalnız `internal/inngest/dealer-flash-offer-expiry/route.ts:30`'da okunuyor, hiçbir yerde artırılmıyor; `admin/innovation/demo-scenario/route.ts:65-77` gerçek `dealerFlashOffer` tablosuna "Senaryo: Mutlu saat %15" yazıyor, ayırıcı `isDemo` alanı yok (`schema.prisma:2693-2714`).
- **Sorun:** "Kısa süreli teklif" vaadi kullanıcıya bir şey kazandırmıyor (kupon kodu, kasada gösterilecek QR, sayaç yok). Admin demo senaryosu çalıştırıldığında o işletmenin yakınındaki gerçek müşteriler sahte teklif görür (doğrulanmadı: üretimde demo-scenario'nun ne sıklıkla çalıştırıldığı bilinmiyor).
- **Öneri:** Teklif kartına "Teklifi al" → kullanıcıya özel tek seferlik kod/QR üreten `POST /api/customer/flash-offers/[id]/claim` (atomik `redemptionCount` artışı, `maxRedemptions` kontrolü, kullanıcı başına tek talep — puan ekonomisi invariant'larıyla uyumlu). Geri sayım ("23 dk kaldı"), tarih dahil bitiş. `DealerFlashOffer.isDemo` ekleyip müşteri sorgularında hariç tut.
- **Efor:** M-L

### 12. [ORTA] Hata durumları yutuluyor; modül kapalı/API hatası "mekan yok" olarak görünüyor
- **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:200-202`, `:215-217`, `:252-257`; `:587-593`.
- **Sorun:** 500/403/ağ hatasında kullanıcı "Seçilen filtrede yakın mekan bulunamadı" görür ve filtreyle oynar; sorun filtre değil.
- **Öneri:** Ayrı hata durumu kartı (yeniden dene butonu, offline ise PWA önbellekteki son liste + "son güncelleme 2 saat önce"), modül kapalıysa sayfa seviyesinde açıklayıcı ekran.
- **Efor:** S

### 13. [ORTA] Bilgi mimarisi: asıl içerik altı kart aşağıda, gereksiz/anlamsız veriler önde
- **Kategori:** UX / görsel hiyerarşi
- **Kanıt:** Sıra: mobil CTA → başlık → izin kartı → filtre kartı → flash → radar → AI → happy hour → koordinat kartı → harita → liste (`page.tsx:294-709`). Ham koordinat `:554`, ham tema ağırlığı `:440`, ham trend skoru `:656`, "Aciliyet x/10" `:509-510`.
- **Sorun:** Mobilde kullanıcı haritaya ulaşmak için 4-6 ekran kaydırıyor. Anlamsız sayılar sayfayı "geliştirici paneli" gibi hissettiriyor; Starbucks/Google Maps tarzı keşif deneyiminden uzak.
- **Öneri:** Bkz. Yeniden tasarım vizyonu — harita/liste birinci sınıf, filtreler yapışkan çip satırı, fırsatlar tek yatay şerit, trendler ikincil sekme.
- **Efor:** L

### 14. [ORTA] Mekan kartları çıkmaz sokak: detay, favori, menü, "burada puan kazan" yok
- **Kategori:** eksik özellik / oyunlaştırma bağı
- **Kanıt:** `page.tsx:627-707` (kart tıklanamaz), `discovery/route.ts:477-485, 496` (`favoriteDealerIds` dönüyor, kullanılmıyor).
- **Sorun:** Sayfa, ürünün çekirdek döngüsüyle (QR okut → puan/XP/rozet) bağlantı kurmuyor. Kullanıcı "neden bu mekana gideyim" sorusunun Qratex'e özgü cevabını (×2 puan, aktif görev, rozet ilerlemesi, sürpriz kutu) görmüyor.
- **Öneri:** Mekan kartına: favori kalbi (mevcut `/api/customer/favorites` uçları, `customer-dashboard.tsx:377` deseni), "bu mekanda aktif: 1 görev · ×1.5 puan" rozetleri, kullanıcının o mekandaki ziyaret sayısı/son ziyaret, detay çekmecesi.
- **Efor:** M

### 15. [ORTA] Hassas konumun ekrana basılması ve 7 gün localStorage'da tutulması
- **Kategori:** gizlilik / KVKK
- **Kanıt:** `page.tsx:551-557` (6 ondalık ≈ 0.1 m), `page.tsx:73-74, 127-134` (7 gün, kesin koordinat).
- **Sorun:** Ekran paylaşımı/ekran görüntüsünde ev adresi seviyesinde konum açığa çıkar. 7 günlük eski konum sessizce kullanılır (kullanıcı başka şehirde olabilir), yaş bilgisi gösterilmez.
- **Öneri:** Koordinat kartını kaldır; yerine ters-geokodlu kaba etiket ("Kadıköy civarı · 3 dk önce") göster. localStorage'a 3 ondalık (≈100 m) yuvarlanmış konum yaz, süreyi 24 saate indir, eski konum kullanıldığında "Konum 2 gün önce alındı — güncelle" çipi göster.
- **Efor:** S

### 16. [DÜŞÜK] Mesafe sınırı istemci ve sunucuda kırpılmıyor
- **Kategori:** doğrulama
- **Kanıt:** `page.tsx:368` (`Math.max(1, …)` — üst sınır yok), `discovery/route.ts:116` (yalnız alt sınır), `innovation/nearby/route.ts:24` ve `radar/route.ts:24` üstten kırpıyor (tutarsız).
- **Öneri:** zod şeması (`lat ∈ [-90,90]`, `lng ∈ [-180,180]`, `radiusKm ∈ [0.5,50]`) ve UI'da preset seçici.
- **Efor:** S

### 17. [DÜŞÜK] Mekan görseli `next/image` host listesi dışında kırılır
- **Kategori:** görsel / sağlamlık
- **Kanıt:** `page.tsx:633`; `api/user/profile/route.ts:13` (`image` serbest URL), `next.config` `images.remotePatterns` (R2 public host listede değil — R2 public URL kullanılıyorsa doğrulanmadı).
- **Sorun:** Üretimde optimize edici listede olmayan host'a 400 döner → kırık görsel ikonu. Favoriler sayfası `unoptimized` ile atlatıyor — tutarsız.
- **Öneri:** Ortak `<VenueAvatar>` bileşeni: bilinen host'ta optimize, bilinmeyende `unoptimized` + `onError` ile baş harf/Store ikonu yedeği. R2 public domain'i remotePatterns'a ekle.
- **Efor:** S

### 18. [DÜŞÜK] Dil karışıklığı, tip kaçakları, yazım
- **Kategori:** kalite
- **Kanıt:** Sabit TR metinler `page.tsx:283, 399, 401, 411, 426, 434, 449, 461, 469, 488, 490, 501, 505, 509, 514`; `nearby-map.tsx:76, 80, 91, 106-108`; `aiStats: any` `page.tsx:89`; `(aiStats.avgUrgency * 10)?.toFixed(1)` `:510` (optional chaining işe yaramıyor, `undefined*10 = NaN` → "NaN/10"); "özetdir" `radar/route.ts:68,159`; `toLocaleTimeString([], …)` `:412` uygulama dilini değil tarayıcı dilini kullanıyor.
- **Öneri:** Tüm metinleri `customerNearby.*` anahtarlarına taşı; tarih/saat için `useAppLocale` ile `Intl`; API yanıtları için zod tipli şema paylaşımı (`lib/contracts/nearby.ts`).
- **Efor:** S

### 19. [DÜŞÜK] Erişilebilirlik eksikleri
- **Kategori:** a11y
- **Kanıt:** `<label>` öğeleri `htmlFor` olmadan (`page.tsx:362, 372`); iskelette `aria-busy`/canlı bölge yok (`:559-566`); `animate-pulse` motion-safe değil (`:487, 562`); pinden listeye kaydırma sonrası odak taşınmıyor ve kart vurgulanmıyor (`:620`); harita popup'larında emoji durum (`nearby-map.tsx:107-108`) ekran okuyucuda "yeşil daire" olarak okunur; liste ↔ harita senkronu klavyeyle mümkün değil.
- **Öneri:** `useId` ile label-input bağı, `aria-live="polite"` sonuç sayısı ("12 mekan bulundu"), `motion-safe:animate-pulse`, pin seçiminde kartı `focus()` + kısa vurgu halkası, durumları metin + ikon ile ver.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Mekan detay sayfası / çekmecesi** (Starbucks "Store details", Google Maps place sheet): menü, saatler, aktif teklifler, puan dağılımı, fotoğraflar, "QR okut ve puan kazan" CTA'sı; sistemdeki 6 derin bağlantının asıl hedefi olmalı.
2. **Oyunlaştırma katmanı haritada** (Duolingo/Pokémon GO hissi): mekan pininde "×2 puan", "görev var", "rozet ilerlemesi 2/3", "ilk ziyaret bonusu" işaretleri; "en yakın puan fırsatı" kartı.
3. **Talep edilebilir flash teklifler**: tek seferlik kod/QR, geri sayım, "kaç kişi aldı" sosyal kanıt, cüzdana kaydet.
4. **Sıralama + arama + gelişmiş filtre**: "şimdi açık", "en yüksek puan", "favorilerim", "daha önce gittiklerim", serbest metin arama; sayfalama.
5. **Konumsuz mod**: şehir/semt seçimi veya IP bazlı kaba konum; izin vermeyen kullanıcı da keşfedebilsin.
6. **Kişisel bağlam** (Monzo/Revolut tarzı): "Bu mekana 4 kez gittin, son ziyaret 12 gün önce", "Favorilerinden 2'si şu an açık", yakındaki favori mekan için push/bildirim tercihi (geofence, opt-in).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfayı açtığında 1 saniye içinde "şu an yakınımda nereye gidip puan kazanabilirim?" sorusunun cevabını görmeli. Sayfa bir "harita uygulaması klonu" değil, Qratex ödül ekonomisinin **sokağa açılan kapısı** olmalı.

**Yerleşim (mobil öncelikli):**
1. **Üst bar (yapışkan):** kaba konum etiketi ("Moda, Kadıköy · şimdi") + değiştir çipi; altında yatay kaydırılabilir filtre çipleri: `Şimdi açık` · `Puan fırsatı` · `Kahve` · `Tatlı` · `Yemek` · `Favoriler` · mesafe çipi (1/3/5/10 km).
2. **Fırsat şeridi:** tek yatay karusel — mekana özel happy hour, flash teklifler ve global çarpanlar tek bileşende, net etiketlerle ("Tüm mekanlarda ×2 · 18:00'e kadar" vs "Kahve Dünyası · %15 · 23 dk"). Her kart tıklanabilir.
3. **Harita + liste tek yüzey:** mobilde Google Maps benzeri alt çekmece (bottom sheet: kapalı/yarı/tam); masaüstünde iki sütun (liste solda, harita sağda, pin ↔ kart hover senkronu). Liste kartı: avatar, ad, "Açık · 23:00'te kapanır", mesafe + yürüme süresi, puan (yıldız + sayı), Qratex rozetleri (×1.5, görev, ilk ziyaret), favori kalbi.
4. **Mekan detay çekmecesi:** derin bağlantılar buraya açılır; yol tarifi (Google/Apple seçimi, lat/lng ile), ara, menü, aktif teklifi al.
5. **"Bölgende neler popüler" (ikincil):** radar verisi en altta veya sekmede, ham sayılar yerine "Bu hafta en çok konuşulan: latte, cheesecake" gibi doğal dil + mini çubuk.
6. **AI kartı:** kaldır veya "Sana uygun 3 mekan" önerisine dönüştür (Bulgu 5).

**Motion / 3D (yerinde ve ölçülü):**
- 3D gerekmiyor; bu bir fayda sayfası. three.js eklemek performansa zarar verir.
- framer-motion (`m as Motion`, global LazyMotion): filtre değişiminde liste kartları için `layout` animasyonu (yeniden sıralanırken kayma), bottom sheet için yay (spring) sürüklemesi, fırsat kartlarında geri sayımın son 5 dakikasında hafif nabız.
- Pin seçiminde haritada `flyTo` + kartta 600 ms vurgu halkası.
- Konum alınırken kullanıcı noktasında radar halkası (CSS keyframes).
- Hepsi `useReducedMotion()` ile koşullu; reduced-motion'da anında geçiş.

**Veri / API değişiklikleri:**
- `GET /api/customer/nearby` (yeni, discovery'den ayrılmış): zod doğrulamalı parametreler, bbox ön filtresi, `sort` + `cursor`, her mekan için `{ openState: { isOpen, closesAt, opensAt } | null, rating: { avg, count }, perks: { multiplier?, questCount?, firstVisitBonus? }, isFavorite, myVisitCount }`. Konum anahtarı geohash6 + filtrelerle Upstash'te 60 sn önbellek.
- `lib/business-hours.ts`: `businessHours` + `holidayMode` + TZ ile tek kaynak açık/kapalı.
- `DealerRatingSnapshot` (cron ile günlük) veya Redis hash: 30 günlük puan/sayı/trend.
- `GET /api/customer/venues/[dealerId]`: detay çekmecesi için.
- `POST /api/customer/flash-offers/[id]/claim`: atomik, tek seferlik, ekonomi invariant'larına uygun.
- Innovation uçlarına auth + modül kapısı + oran sınırı; `DealerFlashOffer.isDemo`.
- İstemci: tek dosyayı böl → `useNearbyLocation` (durum makinesi + izin + localStorage), `useNearbyVenues` (React Query), `<NearbyFilterChips>`, `<OffersRail>`, `<VenueCard>`, `<VenueSheet>`, `<NearbyMapView>`.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/ai-insights`** aynı `/api/customer/ai-recommendations` ucunu kullanıyor (`ai-insights/page.tsx:179`). Kişisel AI önerileri orada kalmalı; bu sayfadan kaldırılmalı (aynı içerik iki yerde + her filtrede LLM maliyeti).
- **`/customer/trends`** ve müşteri dashboard'u discovery ucunu konumsuz çağırıp `trendingVenues`/`weeklyBest` alıyor (`trends/page.tsx:133`, `customer-dashboard.tsx:173`). Global trend verisi ayrı, önbellekli bir uca taşınmalı; bu sayfa yalnız yakınlık verisine odaklanmalı. Radar'daki "bölge trendleri" kartı da `/customer/trends` ile kavramsal olarak çakışıyor — oraya "Bölgemde" sekmesi olarak taşınması değerlendirilmeli.
- **`/customer/favorites`** mekan listesini ayrı gösteriyor ve buraya `?dealerId=` ile bağlanıyor (çalışmıyor). Öneri: favoriler bu sayfada bir filtre çipi ("Favoriler") olarak da erişilebilir olsun; favoriler sayfası kalabilir ama "haritada gör" bu sayfanın odaklı moduna gitmeli.
- **`/customer/discover`** yalnız bir link merkezi (`discover/page.tsx:52-62`); çakışma yok.
- Sistemde **mekan detay sayfası yok**; dashboard, Ayın İşletmesi, öneriler ve favorilerdeki tüm "mekana git" CTA'ları bu sayfaya yükleniyor. Ya bu sayfa `?focus=` ile detay çekmecesi açmayı üstlenmeli ya da ayrı `/customer/venue/[dealerId]` rotası açılmalı — sayfa kaldırılmamalı, merkezileştirilmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çağıran/çağrılan taraflar, `proxy.ts`, Prisma şeması ve ilgili yardımcılar okunarak yeniden incelendi. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Konumsuz kullanıcıda sonsuz yükleniyor durumu — **DOĞRULANDI (önem: ORTA; "sayfa kullanılamaz" abartılı)**
- Kanıt: `app/customer/nearby/page.tsx:78` `loading` `true` başlıyor; `setLoading(false)` yalnız `fetchNearby` içinde (`:182`, `:203`). `fetchNearby` efektte yalnız koordinat varken çağrılıyor (`:220-225`); başka çağrı yeri yalnız "Listeyi Yenile" butonu (`:386`).
- Yeniden üretim: localStorage'da `qratex-customer-nearby-loc` yokken (ilk ziyaret ya da 7 günü aşmış kayıt) sayfayı aç → 4 iskelet kart (`:559-566`) süresiz kalır. "Konumumu Kullan" → tarayıcı izni reddet → `locationError=1` olur ama izin yardım kartı (`:569-586`) ve `emptyNoLocation` boş durumu (`:590-592`) `!loading` dalında olduğu için hiç render edilmez; kullanıcı iskeleti "hâlâ yükleniyor" sanar.
- Düzeltme notu: Sayfa tamamen kilitlenmiyor — konum paylaşma kartı (`:334-353`) ve üst CTA'lar (`:294-325`) görünür ve çalışır. Asıl sorun yanıltıcı durum ve izin reddinde yönlendirmenin kaybolması. Çözüm: `loading` başlangıcını `false` yapmak yerine konum durumunu açık bir durum makinesine (`idle | locating | denied | ready | loading | error`) bağlamak; iskelet yalnız `loading` durumunda, izin yardımı `denied` durumunda gösterilmeli.

### 2. Yakın mekanların çoğunda puan ve trend yanlış olarak sıfır — **DOĞRULANDI (önem: YÜKSEK)**
- Kanıt: `app/api/customer/discovery/route.ts:205-219` `trendingVenues` tüm platformdaki skora göre sıralanıp `.slice(0, 8)` ile kesiliyor; `scoreByDealerId` bu 8 kayıttan kuruluyor (`:321-323`); yakın listede `avgRating`/`trendScore`/`feedbackCount` buradan okunup yoksa `0` (`:403-405`). İstemci `avgRating > 0` değilse "Henüz puan yok", her durumda `Trend {trendScore}` yazıyor (`page.tsx:654-656`).
- Yeniden üretim: Platform genelinde trend skoruyla 9. veya daha alt sıradaki, son 30 günde onlarca geri bildirimi olan bir işletmenin yakınında sayfayı aç → kartında "Henüz puan yok" ve "Trend 0" görünür. İşletme sayısı arttıkça bu, yakın listedeki mekanların neredeyse tamamını etkiler.
- Not: `venueMap` (`:173-203`) zaten tüm işletmeler için toplamı tutuyor; skor haritası kesilmeden önceki `venueMap`'ten kurulmalı (uzun vadede raporda önerilen günlük puan snapshot'ı/Redis hash'i).

### 3. Açık/Kapalı durumu yanlış — **DOĞRULANDI (önem: YÜKSEK)**
- Kanıt: `computeIsOpenNow` (`discovery/route.ts:76-88`) program yoksa 09:00-23:00 her gün varsayıyor ve `now.getDay()`/`now.getHours()` (sunucu yerel saati) kullanıyor. Program yalnız admin discovery config `locations`'tan geliyor (`:315-320`); `User.businessHours` (`prisma/schema.prisma:89`) ve `User.holidayMode` (`:92`) dealer sorgusunda seçilmiyor bile (`:346-354`). Bayi bu alanları `app/dealer/settings/page.tsx:613-657` üzerinden ayarlayabiliyor, yani beklenti var.
- Yeniden üretim: (a) Tatil modunu açmış ve config'e eklenmemiş bir bayi, öğlen saatinde müşteriye "Açık" görünür. (b) Config'te `opensAt: "09:00"` olan bir mekan, TR saatiyle 09:00-12:00 arasında "Kapalı", 23:00-02:00 arasında "Açık" görünür (Vercel fonksiyonları UTC çalışır; `vercel.json`/`next.config` içinde TZ ayarı bulunmadı; aynı projede `lib/happy-hour-live.ts:22-24` bu sebeple açıkça UTC'ye geçmiş). (c) Gece 23:30 TR = 20:30 UTC'de varsayılan 09-23 penceresinde config'siz tüm mekanlar "Açık".
- Not: `businessHours` serbest metin (`messages/tr.json:521` örneği "Pzt-Cum 09:00-18:00"), dolayısıyla tek kaynaklı bir `lib/business-hours.ts` yapılandırılmış saat şeması + `Europe/Istanbul` (veya bayi bazlı TZ) + `holidayMode` ile birlikte gerekli; ayrıştırılamayan saat için "Açık" yerine `null` (bilinmiyor) dönülmeli.

### 4. Innovation nearby/radar uçları anonim erişime açık — **DOĞRULANDI (önem: ORTA; sızan verinin hassasiyeti iddiadan düşük)**
- Kanıt: `app/api/customer/innovation/nearby/route.ts:12-31` ve `radar/route.ts:12-31` içinde `getServerSession`/`requireAuth`, `assertMenuItemVisible` veya `assertModuleEnabled` yok; yalnız platform özellik bayrağı kontrol ediliyor. `proxy.ts:105-118` `/api/*` için `NextResponse.next()` dönüp auth uygulamıyor.
- Yeniden üretim: Oturumsuz `curl "https://<host>/api/customer/innovation/nearby?lat=41.0&lng=29.0&radiusKm=50"` → aktif tüm flash tekliflerin `id`, `title`, `body`, `value`, `dealerId`, işletme adı ve 0.1 km hassasiyetli mesafesi döner (`nearby/route.ts:75-85`). Izgara üzerinde tekrarlanarak platformdaki tüm aktif teklifler ve bayi kimlikleri toplanabilir. Radar uçu oturumsuz olarak bölgedeki son 7 günlük tüketimde en çok geçen ürün adlarını (`radar/route.ts:95-121`) ve bayilerin haftalık özet temalarını (`:89-137`) döndürür — bu, işletme düzeyinde ticari istihbarat sızıntısıdır. Ayrıca admin `discovery` modülünü/menüsünü müşteriler için kapatsa bile bu uçlar çalışmaya devam eder (modül kapısı atlanır) ve oran sınırı olmadan her istek 400 bayi + 3 sorgu çalıştırır.
- Düzeltme notu: İddiadaki "radar adres paylaşılmaz vaadiyle çelişir" kısmı radar için doğru değil — radar mesafe/dealerId döndürmüyor; mesafe ve dealerId `nearby` uçunda. İşletme konumları zaten kamuya açık dükkân adresleri olduğu için konum trilaterasyonu tek başına ciddi bir gizlilik ihlali değil. Asıl risk: kimlik doğrulamasız toplu kazıma, modül kapısının atlanması ve ürün/tema düzeyinde iş verisi sızıntısı. `discovery/route.ts:92-111` ile aynı oturum + menü + modül kapısı deseni ve IP/kullanıcı bazlı oran sınırı eklenmeli.

### 5. Admin demo senaryosu gerçek `DealerFlashOffer` tablosuna yazıyor — **DOĞRULANDI (koşullu; önem: DÜŞÜK-ORTA)**
- Kanıt: `app/api/admin/innovation/demo-scenario/route.ts:58-80` `runSeed: true` ile admin'in girdiği herhangi bir gerçek bayi için `isActive: true`, 30 dk geçerli "Senaryo: Mutlu saat %15" teklifi oluşturuyor. Model ayırıcı alan içermiyor (`prisma/schema.prisma:2693-2714`). Müşteri sorgusu yalnız `isActive` + tarih aralığı filtreliyor (`innovation/nearby/route.ts:35-40`). Aynı desen `app/api/admin/innovation/demo-package/route.ts:53-65` ("Demo: Mutlu saat %15") içinde de var. Tetikleyici UI: `app/admin/innovation/page.tsx:134-151` ("Plan + veri yaz", `:373`).
- Yeniden üretim: Admin, İnovasyon sayfasında gerçek bir bayinin ID'siyle "Plan + veri yaz"a basar → 30 dakika boyunca o bayinin 50 km çevresindeki müşteriler `/customer/nearby` flash bölümünde bu bayinin adıyla "%15" teklif görür; başlık ayrıca radar `experienceHints` listesine de düşer (`radar/route.ts:79-88`, `:139`). Ayrıca o bayinin `DealerWeeklyBrief` kaydı ve `SegmentCampaignProposal` listesi demo verisiyle değişir (`demo-scenario/route.ts:85-107`).
- Düzeltme notu: Etki, admin'in gerçek bir bayi üzerinde bilinçli olarak çalıştırmasına bağlı; üretimde ne sıklıkla kullanıldığı doğrulanmadı. Başlık "Senaryo:"/"Demo:" önekiyle kendini kısmen belli ediyor ve kodda flash teklif kullanma (redeem) akışı bulunmadığı için (`redemptionCount` yalnız `app/api/internal/inngest/dealer-flash-offer-expiry/route.ts:30`'da okunuyor) puan/ekonomi etkisi yok; zarar, müşterinin gerçek bayiden olmayan bir indirimi talep etmesi ve bayinin bilgisi dışında içeriğinin değişmesiyle sınırlı. Çözüm: `DealerFlashOffer.isDemo` (ve diğer seed modellerinde aynı bayrak) + müşteri sorgularında `isDemo: false` filtresi, ya da demo seed'i yalnız `isDemoTenant` olarak işaretli bayilerle sınırlamak.

---

## Uygulama (Dalga 2)

**Sonuç:** `/customer/nearby` emekli; içerik **Keşfet → Yakınımda** sekmesine taşındı (`/customer/places`, varsayılan sekme). Eski sayfa `legacyPlacesHref('nearby')` ile 308 yönlendiren sunucu koçanı. Ölü derin linkler (`?focus=`, `?dealerId=`) mekân detayına (`/customer/places/[dealerId]`, ayrı yüzey) gider; `?promo=` sponsorlu duyurunun mekânına, mekânı yoksa Fırsatlar sekmesine.

**Yeni yapı:** sunucu bileşeni `app/customer/places/page.tsx` (yetki + modül/menü kapısı sunucuda, etkin sekmenin verisi sunucuda) → istemci adası `components/customer/m-kesfet/*`. Veri: `GET /api/customer/places/nearby` (defineRoute: yalnız CUSTOMER, zod, oran sınırı, Keşfet kapısı) → `lib/places/data.server.ts#getNearbyPlaces`. Saf modüller: `lib/places/{business-hours,categories,geo,ranking,query-schemas}.ts` (Jest: `__tests__/places/*`).

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa metadata | ÇALIŞIYOR | `generateMetadata` (TR/EN "Keşfet"). |
| 2 | "Konumu Güncelle" aksiyonu | ÇALIŞIYOR | Konum yokken "Konumumu kullan", varken konum yaşı + "Konumu güncelle" + "Konumu unut" (`location-panel.tsx`). |
| 3 | Mobil başlık kartı | ÇALIŞIYOR | Tek `PageHeader` (mobilde de görünür); konum paneli başlığın altında. |
| 4 | Mobil üst konum CTA'sı | ÇALIŞIYOR | Konum paneli tüm genişliklerde aynı, ≥ 44 px. |
| 5 | İzin açıklama modalı | KALDIRILDI | Yerine satır içi açıklama kartı; düğme doğrudan izin ister (kullanıcı jesti korunur, ek modal sürtünmesi yok). |
| 6 | Geolocation ile konum | ÇALIŞIYOR | Durum makinesi `idle/locating/ready/denied/unavailable/unsupported` (`use-coarse-location.ts`); izin önceden verilmişse sormadan tazeler. |
| 7 | localStorage'da konum | ÇALIŞIYOR | ~110 m'ye yuvarlanmış, 24 saat; yaş göstergesi; eski 7 günlük ham GPS anahtarı silinir. |
| 8 | "Konumu paylaşın" kartı | ÇALIŞIYOR | Açıklamalı kart (masaüstü + mobil aynı). |
| 9 | Mesafe filtresi | ÇALIŞIYOR | 1/3/5/10/25 km çipleri (URL `?r=`); sunucu 0,5–50 km'ye kırpar (zod). Tuş başına istek yok. |
| 10 | Kategori filtresi | ÇALIŞIYOR | Kontrollü sözlük (`lib/places/categories.ts`); çipler sonuçta gerçekten bulunan kategorilerden (URL `?cat=`). |
| 11 | "Listeyi Yenile" | KALDIRILDI | React Query + `QueryState` "Tekrar dene" bunu karşılıyor; sonsuz iskelet kapandığı için kaçış düğmesine gerek kalmadı. |
| 12 | Veri çekme | ÇALIŞIYOR | Yeni BFF; iptal (signal), önceki veriyi tutma, hata `QueryState` ile görünür. |
| 13 | Flash teklifler | ÇALIŞIYOR (gösterim) | Fırsatlar sekmesinde: değer, tarihli geri sayım, mekân, "kasada belirt". Kişiye özel talep kodu → ŞEMA İSTEĞİ (aşağıda). |
| 14 | Bölge temaları (ham ağırlık) | KALDIRILDI | Anlamsız ham sayı + bayi haftalık özetinden ticari istihbarat. Uç (`innovation/radar`) artık yalnız oturumlu müşteriye ve Keşfet kapısıyla açık. |
| 15 | Deneyim ipuçları | KALDIRILDI | Flash başlıklarının kopyasıydı (SAHTE). |
| 16 | "Öne çıkan 3 lezzet" | KALDIRILDI | Yanlış etiketli yedek; k-anonim "bölgende popüler" kalanlara yazıldı. |
| 17 | Radar açıklama metni | ÇALIŞIYOR | Yazım düzeltildi ("özettir"); yüzeyde gösterilmiyor. |
| 18 | AI Keşif Önerileri | KALDIRILDI | Konumla ilgisizdi, her filtrede LLM çağırıyordu; ilke "GET'te LLM yok". Kişisel öneriler `/customer/ai-insights`'ta. |
| 19 | AI istatistik şeridi | KALDIRILDI | "Aciliyet" iç metrik, NaN hatası. |
| 20 | Canlı happy hour şeridi | ÇALIŞIYOR | Mekâna özel çarpan kartta çip ("1,5× puan · 18:00'e kadar"); platform geneli ayrı bant ("Tüm Qratex mekânlarında"), hiçbir mekâna atfedilmez; "Puan fırsatı" filtresi. |
| 21 | Ham koordinat | KALDIRILDI | Gizlilik; yerine konum yaşı. |
| 22 | Yükleniyor iskeleti | ÇALIŞIYOR | Yalnız istek uçuşurken; konum kararı beklenirken gereksiz istek atılmaz. |
| 23 | Konum hatası kartı | ÇALIŞIYOR | Reddedildi (iOS/Android rehberi), alınamadı, desteklenmiyor ayrı. |
| 24 | Boş durum | ÇALIŞIYOR | Hata ≠ boş: filtreli boş ("Filtreleri temizle"), sonuçsuz ("Mesafeyi artır"), hata ayrı (`QueryState`). |
| 25 | Leaflet/OSM harita | ÇALIŞIYOR | Lazy (`next/dynamic`, ssr:false); Liste/Harita görünümü (URL `?view=map`). |
| 26 | Kullanıcı noktası | ÇALIŞIYOR | |
| 27 | Pin + popup | ÇALIŞIYOR | Popup yerine pin → mekân detayı; pinlerin erişilebilir adı var, klavye Enter; canlı çarpanlı pin vurgulu + "×" rozeti. Emoji yok. |
| 28 | Pin → liste | ÇALIŞIYOR | Pin doğrudan mekân detayını açar (kaydırma + vurgu yerine). |
| 29 | Harita koyu tema | ÇALIŞIYOR | Koyu temada döşeme CSS filtresi. |
| 30 | Logo/avatar | ÇALIŞIYOR | `VenueAvatar`: optimizasyonsuz + hata yedeği (baş harfler); kırık görsel yok. |
| 31 | Ad + adres | ÇALIŞIYOR | |
| 32 | Mesafe rozeti | ÇALIŞIYOR | Tek biçim (`formatDistance`) + yürüme süresi. |
| 33 | Açık/Kapalı | ÇALIŞIYOR | Bayi saatleri + tatil modu, İstanbul saati; bilinmiyorsa rozet yok; "23:00'te kapanıyor", "Yarın 09:00'da açılıyor". |
| 34 | Puan + yorum sayısı | ÇALIŞIYOR | Ekrandaki her mekân için güvenilir oy (kişi başı tek oy; işaretli/anonim/gölge-ban/demo hariç; QR + tüketim yorumu); eşik altı "Yeni". |
| 35 | "Trend N" rozeti | KALDIRILDI | Ham skor kullanıcıya bilgi taşımıyordu. |
| 36 | Kategori rozetleri | ÇALIŞIYOR | Yerelleştirilmiş satır. |
| 37 | Yol tarifi | ÇALIŞIYOR | Koordinatla (adres metni değil); kartta ve mekân detayında. |
| 38 | Hemen Ara | ÇALIŞIYOR | Telefon varsa kartta `tel:`. |
| 39 | Detay / favori | ÇALIŞIYOR | Kalp her kartta (iyimser, geri al); kart → `/customer/places/[dealerId]`. Menü detay yüzeyinin işi. |
| 40 | Derin linkler | ÇALIŞIYOR | `?focus=`/`?dealerId=` → mekân detayı; `?promo=` → sponsorun mekânı ya da Fırsatlar. |
| 41 | Sıralama | ÇALIŞIYOR | Yakınlık / Puan (Bayes); konumsuzda puana göre. |
| 42 | Arama | ÇALIŞIYOR | Ad araması, gecikmeli, URL `?q=`. |
| 43 | Sayfalama | ÇALIŞIYOR | 20'şer, "Daha fazla göster", toplam sayı `aria-live`. |
| 44 | Modül/menü kapısı | ÇALIŞIYOR | Sayfa ve tüm BFF uçları (menü `nearby` + `discovery`, rol bazlı); kapalıysa açıklayıcı ekran. |
| 45 | i18n | ÇALIŞIYOR | TR/EN `copy.ts`; harita etiketleri dahil. |
| 46 | Azaltılmış hareket | ÇALIŞIYOR | Sonsuz nabız yok, `motion-safe:animate-spin`, `useMotionPolicy`. |

**Kapanan bulgular (19/19):** 1 sonsuz iskelet · 2 ölü derin linkler · 3 puan yalnız ilk 8 · 4 sahte açık/kapalı + saat dilimi · 5 her filtrede LLM (kart kaldırıldı) · 6 debounce/yarış (çip + React Query iptali) · 7 discovery tam tarama (yeni uç yalnız yarıçap kutusu + ekrandaki mekânlar; global sıralama Redis'li En iyiler'de) · 8 innovation uçları anonim (oturum + kapı + oran sınırı) · 9 radar rastgele 400 (enlem kutusu + demo/askıda hariç) · 10 global happy hour yanlış atıf · 11 flash: kişisel churn taslağı + demo/askıdaki bayi hariç (talep akışı → şema isteği) · 12 hata yutma · 13 bilgi mimarisi · 14 çıkmaz kartlar · 15 konum gizliliği · 16 mesafe sınırı · 17 görsel host · 18 dil/tip/yazım · 19 erişilebilirlik.

**Kalanlar:** (a) Flash teklif "teklifi al" tek seferlik kod/QR + atomik kullanım sayacı: kullanıcı başı talep kaydı yok → **ŞEMA İSTEĞİ** `DealerFlashOfferClaim(id, offerId, userId, code, createdAt, usedAt?; @@unique([offerId, userId]))`. (b) Konumsuz modda şehir/semt seçimi yok (konumsuz göz atma puana göre listeler). (c) "Bölgende popüler" (k-anonim ürün listesi) yapılmadı. (d) Görsel doğrulama: dev server ve derleme bu dalgada yasak olduğundan headless Chrome ekran görüntüsüyle doğrulanmadı.
