# /customer/favorites

**Amaç:** Müşterinin "kalp"lediği (kaydettiği) işletmeleri listelemek, oradan işletmeye geçmek ve favoriden çıkarmak. Veri kaynağı `CustomerFavoriteDealer` tablosu (`prisma/schema.prisma:247-259`), uç `GET/POST/DELETE /api/customer/favorites` (`app/api/customer/favorites/route.ts`).

**Genel puan: 3.8 / 10** · **Karar: yeniden tasarla** ("Mekanlarım" merkezine dönüştür ve dashboard şeridiyle birleştir; aşağıya bakın)

> Özet: Backend küçük, doğru ve güvenli. Sayfanın kendisi ise **yetim** (hiçbir menüde ve hiçbir linkte yok), **çıkmaz sokak** (tek eylem linki "Profili Gör" var olmayan bir profile gidiyor; boş durumdaki CTA'nın yönlendirdiği sayfada favori ekleme butonu yok), **hata durumunu "favoriniz yok" diye gösteriyor** ve API'nin döndürdüğü verinin yarısını (konum, eklenme tarihi) kullanmıyor. Bir sadakat/yeniden ziyaret ürünü için "kaydettiğim mekanlar" çok değerli bir yüzey; şu hâli bir sprint görevinin (sprint-6.md:10, S6-T4) iskeletinde kalmış.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Listeleme ve silme çalışıyor; ama tek gezinme eylemi kırık, hata durumu yok, ekleme yolu neredeyse yok ve sayfaya hiçbir yerden ulaşılamıyor. |
| UX | 3/10 | Kullanıcıya hiçbir bağlam vermiyor (ne zaman eklendi, açık mı, ne kadar uzak, orada kaç puanım var) ve boş durum CTA'sı favori eklenemeyen bir sayfaya gidiyor. |
| Görsel | 5/10 | Temiz, tutarlı shadcn kartı; ama tamamen jenerik, marka/oyunlaştırma dili yok, kart başına tek düğme ile çok boşluk. |
| Mimari | 5/10 | API sade, `userId` kapsamlı, zod'lu; fakat dashboard ile iki ayrı önbellek anahtarı, `admin-toast` müşteri panelinde, i18n yok, ölü importlar, `layout` animasyonu yüklenmeyen bir özelliğe bağlı. |
| Performans | 6/10 | Tek sorgu + include (N+1 yok), 60 sn staleTime; `take: 500` sessiz kesme ve `unoptimized` logo dışında sorun yok. |
| Erişilebilirlik + Mobil | 4/10 | Dokunma hedefleri 40px ve global reduced-motion var; ama silme düğmesinin erişilebilir adı yok, başlık hiyerarşisi h1→h3 atlıyor, hata hiç duyurulmuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota rol koruması (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-75` | Diğer rol kendi paneline yönlendiriliyor. |
| 2 | Sayfa metadata (başlık/açıklama) | KISMİ | `app/customer/favorites/layout.tsx:4-6`, `messages/tr.json:107-108` | Açıklama "Kayıtlı işletmeler, **ürünler** ve **hızlı dönüş kısayolları**" diyor; sayfada ürün de kısayol da yok (yanlış vaat). |
| 3 | Navigasyonda giriş noktası (sidebar/alt menü) | EKSİK | `components/dashboard/sidebar.tsx:281-315` | Müşteri menüsünde `/customer/favorites` yok; `REDESIGN.md:89` "zaten menüde değil" diye not düşmüş. Repo genelinde bu rotaya link veren tek dosya yok (yalnız `scripts/customer-responsive-scan.mjs:32`). |
| 4 | Dashboard "Favorilerim" şeridinden sayfaya "Tümünü gör" | EKSİK | `components/customer/dashboard/customer-dashboard.tsx:823-857` | Şeritte başlık var ama bu sayfaya link yok. |
| 5 | Başlık kartı (ikon + başlık + alt metin) | ÇALIŞIYOR | `page.tsx:67-81` | Sayaç (kaç favori) yok. |
| 6 | Favori listesini çekme (GET) | ÇALIŞIYOR | `page.tsx:37-45`, `route.ts:14-58` | `orderBy createdAt desc`, `take: 500`. |
| 7 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:83-88`, `components/ui/inline-loading-status.tsx:28-31` | `role="status"` + `aria-live` doğru; iskelet yerine spinner. |
| 8 | Hata durumu | BOZUK | `page.tsx:37` (`isError` alınmıyor), `page.tsx:47`, `page.tsx:89` | 401/403/500/503'te `data` undefined → `favorites = []` → "Henüz favoriniz yok" gösteriliyor. Kullanıcı favorilerinin silindiğini sanar; tekrar dene yok. |
| 9 | Boş durum metni + "Mekan Keşfet" CTA | KISMİ | `page.tsx:90-108` | CTA `/customer/nearby`'e gidiyor; o sayfada favori ekleme düğmesi yok (`app/customer/nearby/page.tsx:628-700`, Heart/favorite geçmiyor). Çıkmaz sokak. |
| 10 | Kart: logo veya yer tutucu ikon | ÇALIŞIYOR | `page.tsx:124-138` | `unoptimized` → ham boyutta logo indiriliyor. |
| 11 | Kart: kalp rozeti | ÇALIŞIYOR | `page.tsx:139-141` | Dekoratif; lucide 0.303 `aria-hidden` eklemiyor. |
| 12 | Kart: işletme adı (+ "İsimsiz İşletme" yedeği) | ÇALIŞIYOR | `page.tsx:145-147` | Kart tıklanabilir değil, yalnız hover rengi değişiyor (yanıltıcı affordance). |
| 13 | Kart: adres (+ yedek) | ÇALIŞIYOR | `page.tsx:149-152` | Yol tarifi/harita linki yok. |
| 14 | "Profili Gör" düğmesi | BOZUK | `page.tsx:161` → `/customer/nearby?dealerId=…` | Nearby sayfası hiçbir query param okumuyor (`useSearchParams` yok; `app/customer/nearby/page.tsx` grep), müşteri tarafında işletme profil sayfası da yok (`app/` altında venue/[id] rotası yok). Kullanıcı genel yakın listesine düşüyor; favori mekan 5 km dışındaysa listede hiç yok. Dashboard aynı amaçla `?focus=` kullanıyor (`customer-dashboard.tsx:853`) — o da okunmuyor. |
| 15 | Favoriden kaldır (çöp kutusu) | KISMİ | `page.tsx:49-62`, `169-177`; `route.ts:121-151` | Çalışıyor ve IDOR yok; ama onay/geri al yok, iyimser güncelleme yok, `disabled={removeMutation.isPending}` tüm kartlardaki düğmeleri birlikte kilitliyor, düğmenin erişilebilir adı yok. |
| 16 | Kaldırma toast bildirimi | KISMİ | `page.tsx:57,60`, `lib/admin-toast.ts:17,19` | Müşteri sayfası **admin** toast sarmalayıcısını kullanıyor → metin "**Basarili:** Favorilerden kaldırıldı" (ş/ı eksik, ASCII). Hata toast'ı sunucunun mesajını yok sayıp "Bir hata oluştu" diyor. |
| 17 | Kart giriş animasyonu + stagger | ÇALIŞIYOR | `page.tsx:113-118` | `min(i,10)*0.05` makul. |
| 18 | Silinen kartın çıkışı + kalanların kayması (`layout`, `popLayout`) | KISMİ | `page.tsx:111,117,119`; `components/providers.tsx:241` (`domAnimation`); `node_modules/framer-motion/dist/es/render/dom/features-animation.mjs` | Global `LazyMotion` yalnız `domAnimation` yüklüyor; `layout` özelliği `domMax`'ta. `layout` prop'u sessizce etkisiz → kalan kartlar animasyonsuz zıplıyor. Çıkış animasyonu çalışıyor. |
| 19 | Azaltılmış hareket desteği | ÇALIŞIYOR | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`) | Global. |
| 20 | Eklenme tarihi (`addedAt`) gösterimi | EKSİK | API döndürüyor `route.ts:43`; UI kullanmıyor | |
| 21 | Konum/mesafe/harita (`latitude`,`longitude`) | EKSİK | API döndürüyor `route.ts:47-48`; UI kullanmıyor | Nearby'da hazır `NearbyMap` bileşeni var (`nearby/page.tsx:614-622`). |
| 22 | Favori ekleme (POST) yolu | KISMİ | `route.ts:71-118`; tek UI çağıranı `customer-dashboard.tsx:370-413, 936` | Yalnız dashboard'daki "Trend Mekanlar" ilk 4 kaydında kalp var (`customer-dashboard.tsx:917`). Nearby, keşfet, kategori liderliği (`category-leaderboard/page.tsx:94` yalnız salt-okunur kalp), geri bildirim/tüketim detayında ekleme yok. |
| 23 | Dashboard ile önbellek senkronu | BOZUK | `page.tsx:56` yalnız `['customer','favorites']`; `customer-dashboard.tsx:407` yalnız `['customer','dashboard']` | Birinde yapılan değişiklik diğerinde 60 sn'ye kadar (staleTime) eski görünür; dashboard'dan eklenen mekan bu sayfaya, önbellekte veri varsa, geç düşer. |
| 24 | Arama / filtre / sıralama | EKSİK | `page.tsx` | 500'e kadar kayıt düz liste. |
| 25 | Sayfalama / limit bildirimi | EKSİK | `route.ts:38` (`take: 500`) | 500 üzeri sessizce kesilir (pratikte düşük olasılık). |
| 26 | Çoklu dil (TR/EN) | EKSİK | `page.tsx:77-78,87,98-106,146,151,162` sabit TR | Uygulama i18n'li (`messages/en.json:107`, nearby `t()` kullanıyor); EN kullanıcı bu sayfayı Türkçe görür. |
| 27 | Mekan canlı durumu (açık/kapalı, tatil modu, aktif kampanya/happy hour) | EKSİK | `User.holidayMode`, `businessHours` şemada (`schema.prisma` User ~ satır 89-92); discovery'de `isOpenNow` hesabı var | Favori sayfasının asıl değer önerisi bu olmalı. |
| 28 | Kişisel bağlam (o mekandaki ziyaret sayım, puanım, son geri bildirimim) | EKSİK | — | Analytics zaten hesaplıyor (`app/api/customer/analytics/route.ts:262-270`). |
| 29 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:65,158,172` | 40px dokunma hedefi, `touch-manipulation`, `max-w-2xl`. Kaydırarak silme gibi mobil jest yok. |
| 30 | Başlık hiyerarşisi | KISMİ | `page.tsx:77` h1 → `98`, `145` h3 | h2 atlanıyor. |
| 31 | API yetki/IDOR | ÇALIŞIYOR | `route.ts:15-20, 24, 102-104, 138-140` | Tüm işlemler `session.user.id` kapsamlı; rol kontrolü var. |
| 32 | POST doğrulama | ÇALIŞIYOR | `route.ts:9-11, 81-98` | zod + hedefin `role: 'DEALER'` olduğu kontrol ediliyor; upsert idempotent. Rate limit yok (düşük risk). |

**Durum sayımı (32 özellik):** ÇALIŞIYOR 13 · KISMİ 7 · BOZUK 3 · SAHTE 0 · EKSİK 9. (#2 metadata vaadi SAHTE'ye yakın, ama sayfa içeriği gerçek olduğu için KISMİ sayıldı.)

---

## Bulgular

### 1. [YÜKSEK · İşlevsellik/IA] Sayfa yetim: hiçbir yerden ulaşılamıyor
- **Kanıt:** `components/dashboard/sidebar.tsx:281-315` (müşteri menüsü listesi, favorites yok); repo genelinde `customer/favorites` linki yok (yalnız `scripts/customer-responsive-scan.mjs:32`); `components/customer/dashboard/customer-dashboard.tsx:823-857` şeritte "Tümünü gör" yok; `REDESIGN.md:89`.
- **Sorun:** Sayfa ancak URL elle yazılarak açılıyor. Kullanıcı açısından özellik yok hükmünde; bakım maliyeti ise var.
- **Öneri:** Ya (a) "Yakınımdakiler" altına ikinci sekme olarak taşıyıp ("Yakınımda / Kaydettiklerim") ana navigasyona bağla, ya da (b) dashboard'daki "Favorilerim" şeridine "Tümünü gör → /customer/favorites" ekle ve sidebar'da `nearby` grubuna `saved_venues` girdisi aç (aynı `featureKey: 'discovery'` ile). Hangisi seçilirse seçilsin `visibility-controls.ts`'e de kaydedilmeli ki admin menü görünürlüğünü yönetebilsin.
- **Efor:** S

### 2. [YÜKSEK · İşlevsellik] "Profili Gör" var olmayan bir profile gidiyor
- **Kanıt:** `app/customer/favorites/page.tsx:161` (`/customer/nearby?dealerId=…`); `app/customer/nearby/page.tsx` hiçbir query param okumuyor (`useSearchParams`/`searchParams` yok); müşteri tarafında işletme detay rotası yok (`app/` altında `[dealerId]`/venue rotası bulunamadı). Dashboard aynı iş için `?focus=` kullanıyor (`customer-dashboard.tsx:853`, `944`) — o da okunmuyor.
- **Sorun:** Kartın tek birincil eylemi kullanıcıyı konuma göre filtrelenmiş genel listeye atıyor; favori mekan yarıçap dışındaysa listede bile değil. Bu, ürünün en temel sözünü ("sevdiğin mekanı takip et") bozuyor.
- **Öneri:** Müşteri tarafı **İşletme Profili** yüzeyi oluştur: `app/customer/venue/[dealerId]/page.tsx` (veya bottom-sheet). İçerik: logo/kapak, açık/kapalı + tatil modu, adres + "Yol tarifi" (nearby'deki Google Maps deseni `nearby/page.tsx:670-680`), aktif kampanya/happy hour, kullanıcının o mekandaki geçmişi (ziyaret sayısı, verdiği puanlar, kazandığı XP), favori kalbi. API: `GET /api/customer/venues/[dealerId]` (public alanlar + oturumdaki kullanıcıya ait özet; `userId` kapsamlı). Kısa vadeli yama: nearby'de `?focus=` okuyup `venue-${id}`'ye `scrollIntoView` + vurgulama; favorites ve dashboard aynı parametreyi kullanmalı.
- **Efor:** L (profil) / S (yama)

### 3. [YÜKSEK · İşlevsellik/Hata yönetimi] Hata "Henüz favoriniz yok" olarak gösteriliyor
- **Kanıt:** `page.tsx:37` yalnız `{ data, isLoading }`; `page.tsx:47` `data?.data || []`; `page.tsx:89` boş-dizi dalı.
- **Sorun:** 401 (token replay ihlali `lib/api-auth.ts:70-76`), 403, 500 veya 503'te kullanıcı tüm favorilerinin silindiğini sanır; tekrar deneme yolu yok, olay da hiçbir yere duyurulmaz.
- **Öneri:** `isError`/`refetch` al; ayrı hata kartı (`role="alert"`, "Tekrar dene" düğmesi, `toast` değil inline). 401'de oturum yenileme yönlendirmesi. Yükleme için spinner yerine 3 kart iskeleti (layout shift'i önler).
- **Efor:** S

### 4. [YÜKSEK · Ürün/Akış] Favori ekleme yolu neredeyse yok; boş durum CTA'sı çıkmaz sokak
- **Kanıt:** `POST` çağıran tek UI: `customer-dashboard.tsx:370-413`, kalp yalnız "Trend Mekanlar" ilk 4'te (`customer-dashboard.tsx:917, 934-940`). Boş durum CTA'sı `page.tsx:106` → `/customer/nearby`, orada kalp yok (`nearby/page.tsx:628-700`). Kategori liderliğinde kalp salt-okunur (`app/customer/category-leaderboard/page.tsx:94`).
- **Sorun:** Boş durum "keşfettiğiniz mekanları favorilerinize ekleyerek" diyor (`page.tsx:99-101`) ama yönlendirilen sayfada ekleme imkânı yok. Liste pratikte hep boş kalır.
- **Öneri:** Paylaşılan bir `<FavoriteToggle dealerId>` bileşeni + `useFavorites()` hook'u (tek `queryKey: ['customer','favorites']`, iyimser `setQueryData`, hata geri alma). Bunu nearby kartlarına, harita pin popup'ına, kategori liderliğine (salt-okunur kalbi düğmeye çevir), geri bildirim/tüketim detayına ve QR geri bildirim sonrası teşekkür ekranına ("Bu mekanı kaydet") yerleştir. Geri bildirim sonrası an, Starbucks'ın "favori mağaza" ve Google Maps "Kaydet" akışlarındaki en yüksek dönüşümlü andır.
- **Efor:** M

### 5. [ORTA · Mimari/Veri tutarlılığı] Dashboard ile favoriler iki ayrı önbellekte
- **Kanıt:** `page.tsx:38,56` (`['customer','favorites']`); `customer-dashboard.tsx:174, 320, 407` (kendi `useState` kopyası + yalnız `['customer','dashboard']` invalidate).
- **Sorun:** Bir yüzeyde ekleme/çıkarma diğerinde 60 sn'ye kadar eski görünür; dashboard ayrıca favorileri iki kez taşıyor (discovery'deki `favoriteDealerIds` + favorites ucu, `discovery/route.ts:477-485`).
- **Öneri:** Bulgu 4'teki `useFavorites()` tek doğruluk kaynağı olsun; dashboard şeridi ve trend kalpleri bu hook'tan okusun, `favoriteDealerIds` discovery yanıtından kaldırılabilir (veya hook'un `select` ile türetilmiş seti kullanılır). Her mutasyon `['customer','favorites']`, `['customer','dashboard']` ve `['customer','category-leaderboard']` anahtarlarını birlikte invalidate etmeli.
- **Efor:** M

### 6. [ORTA · Erişilebilirlik] Silme düğmesinin erişilebilir adı yok, onay/geri al yok
- **Kanıt:** `page.tsx:169-177` (yalnız `<Trash2/>`, `aria-label` yok); lucide-react 0.303 varsayılan `aria-hidden` eklemiyor (`node_modules/lucide-react/dist/esm/defaultAttributes.js`); `page.tsx:174` global `isPending`.
- **Sorun:** Ekran okuyucu "düğme" der; yanlış dokunuşta favori geri dönüşsüz gider; bir silme sürerken tüm kartların düğmeleri kilitlenir; iyimser güncelleme olmadığı için kart ağ gidiş-dönüşü boyunca ekranda kalır, toast kartın gitmesinden önce görünür.
- **Öneri:** `aria-label={\`${name} favorilerden çıkar\`}`; iyimser kaldırma (`onMutate` ile `setQueryData`, `onError` ile geri koy) + "Geri al" eylemli toast (Gmail/Monzo deseni; geri al = POST). Kilit yalnız ilgili kart için (`removeMutation.variables === fav.dealerId`). Çöp kutusu yerine dolu kalp ikonu (toggle anlamı) daha doğru bir metafor; dashboard'daki şerit de kalp kullanıyor (`customer-dashboard.tsx:839`).
- **Efor:** S

### 7. [ORTA · Dil/Tutarlılık] Müşteri sayfasında admin toast'ı: "Basarili:" (Türkçe karakter eksik)
- **Kanıt:** `page.tsx:19` `import { toast } from '@/lib/admin-toast'`; `lib/admin-toast.ts:17` `'Basarili: '`, `:19` `'Dikkat: '`; `page.tsx:60` sunucu hata mesajını (`route.ts:145-148`) yok sayıyor.
- **Sorun:** Tüketiciye admin panelinin dili ve bozuk Türkçe gösteriliyor ("Basarili: Favorilerden kaldırıldı").
- **Öneri:** Müşteri panelinde doğrudan `sonner` (veya müşteri tonu için ayrı bir `customer-toast`) kullan; `admin-toast` önekini de `Başarılı` olarak düzelt (bu dosya başka yerleri de etkiliyor — ayrı denetim kalemi). Hata toast'ı `res.json().error`'u göstermeli.
- **Efor:** S

### 8. [ORTA · Motion] `layout` animasyonu yüklü olmayan bir özelliğe bağlı
- **Kanıt:** `page.tsx:111,119`; `components/providers.tsx:241` `LazyMotion features={domAnimation}`; `framer-motion` 11.18.2 `features-animation.mjs` `domAnimation` = animations + gestures (layout yok).
- **Sorun:** Silmeden sonra kalan kartların yumuşak kayması beklenirken anlık zıplama oluyor; kod niyeti ile davranış farklı (ölü kod).
- **Öneri:** Ya bu listeyi lokal `<LazyMotion features={domMax}>` ile sar (yalnız bu sayfada ~+10-15 KB, dinamik import edilebilir), ya da `layout`'u kaldırıp çıkışta yükseklik çöktürme (`exit: { height: 0, opacity: 0 }`, `overflow-hidden`) uygula. İkincisi bundle'a dokunmaz ve yeterlidir.
- **Efor:** S

### 9. [ORTA · i18n] Sayfa tamamen sabit Türkçe
- **Kanıt:** `page.tsx:77-78, 87, 98-106, 146, 151, 162`; karşılaştırma: `app/customer/nearby/page.tsx` `t('customerNearby.*')`.
- **Sorun:** EN dil tercihli kullanıcı karışık dil görür; metadata (`messages/en.json:107-108`) İngilizce, gövde Türkçe.
- **Öneri:** `useAppT()` ile `customerFavorites.*` anahtar ailesi; metadata açıklamasını gerçek içerikle hizala ("ürünler ve kısayollar" ifadesini kaldır, `messages/tr.json:108`).
- **Efor:** S

### 10. [DÜŞÜK · Veri/UX] API'nin döndürdüğü bağlam UI'da çöpe gidiyor
- **Kanıt:** `route.ts:43,47-48,55` (`addedAt`, `latitude`, `longitude`, `dealerIds`) — `page.tsx` hiçbirini kullanmıyor.
- **Sorun:** Mesafe, harita ve "x gün önce kaydettin" gibi bilgiler bedavaya hazırken kart yalnız ad+adres gösteriyor.
- **Öneri:** Konum izni varsa mesafe rozeti ve "Yakına göre sırala"; kartta "Ekim 2026'dan beri favorin" alt satırı. `dealerIds` alanı yalnız bu sayfa için gereksiz — `useFavorites` hook'u ortaya çıkınca tek biçimde birleştirilmeli.
- **Efor:** S

### 11. [DÜŞÜK · Kod kalitesi] Ölü importlar ve yanıltıcı affordance
- **Kanıt:** `page.tsx:3` (`useState`, `useEffect` kullanılmıyor), `page.tsx:11-12` (`Star`, `ExternalLink` kullanılmıyor); `page.tsx:145` `group-hover:text-primary` ama kart tıklanamaz.
- **Öneri:** Temizle; kartın tamamını profil linki yap (çöp/kalp düğmesi `stopPropagation` ile ayrık), hover efekti ancak o zaman anlamlı.
- **Efor:** S

### 12. [DÜŞÜK · Erişilebilirlik/Semantik] Başlık hiyerarşisi atlıyor
- **Kanıt:** `page.tsx:77` h1, `98` ve `145` h3.
- **Öneri:** Liste başlığı için görsel olarak gizli `h2` ("Kaydettiğin mekanlar, N adet") ve kart adları `h3`; liste `<ul role="list">` olmalı.
- **Efor:** S

### 13. [DÜŞÜK · Güvenlik/Sağlamlık] POST'ta hız sınırı yok; 500 kayıt sessiz kesilir
- **Kanıt:** `route.ts:71-118` (rate limit yok; `lib/rate-limit.ts` mevcut), `route.ts:38` `take: 500`.
- **Sorun:** Upsert idempotent olduğu için suistimal etkisi düşük; ama favori sayısı ileride dealer'a "N kişi favoriledi" metriği olarak açılırsa (şu an `favoritedByCustomers` hiçbir yerde okunmuyor) betikli şişirme mümkün. Kullanıcı başına üst sınır da tanımlı değil.
- **Öneri:** Kullanıcı başına makul üst sınır (ör. 200) + `lib/rate-limit.ts` ile dakikalık limit; liste için imleç tabanlı sayfalama.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Canlı mekan durumu kartı** (Starbucks "Favori mağaza", Google Maps "Kaydedilenler"): açık/kapalı + kapanışa kalan süre, tatil modu (`User.holidayMode`), aktif kampanya/happy hour rozeti, puan çarpanı ("Bugün 2x XP"). Favori listesini "neden şimdi gideyim" listesine çevirir.
2. **Kişisel mekan geçmişi** (Spotify Wrapped / Monzo merchant sayfası): "Burada 12 kez bulundun, 340 XP kazandın, son puanın 4★" + mekan bazlı rozet ilerlemesi ("Müdavim rozeti: 3/5 ziyaret").
3. **Favori mekan bildirimleri** (Starbucks/Revolut push): favori mekan kampanya başlattığında veya happy hour açıldığında push; ayarlarda mekan bazlı aç/kapa. Altyapı (push merkezi) mevcut, favorilerle bağlanmamış.
4. **Harita görünümü + mesafe sıralaması**: liste/harita sekmesi; `NearbyMap` bileşeni yeniden kullanılabilir.
5. **Koleksiyonlar/etiketler** (Google Maps listeleri, Pinterest panoları): "Kahve", "İş toplantısı", "Hafta sonu" gibi kullanıcı listeleri; arkadaşla/squad ile paylaşım.
6. **Oyunlaştırma bağı** (Duolingo): "Favori mekanında geri bildirim bırak" günlük görevi, favorideki mekanı uzun süre ziyaret etmeyene "Seni özledik" hatırlatması; favori mekan sayısına bağlı küçük rozet.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Mekanlarım" — kullanıcının sevdiği yerlerin canlı panosu. Açtığında 2 saniyede şunu görmeli: *şu an hangi favorim açık, nerede bana özel bir şey var, en çok nerede puan kazanıyorum.*

**Yerleşim (mobil öncelikli):**
1. **Üst şerit:** başlık + sayaç ("7 mekan") + segment kontrol `Liste | Harita` + sıralama menüsü (`Yakın`, `Son eklenen`, `En çok ziyaret`, `Şu an açık`).
2. **"Şu an" vurgu kartı (koşullu):** favorilerden aktif kampanyası / happy hour'u olan ilk mekan; tek CTA "Yol tarifi" veya "Kampanyayı gör".
3. **Mekan kartları (tamamı tıklanabilir → profil):** sol: logo; orta: ad, `açık · 1,2 km · 4,6★`, altında kişisel satır "12 ziyaret · 340 XP"; sağ: dolu kalp toggle (iyimser + geri al toast'ı). Kampanya varsa kartın alt kenarında ince renkli bant.
4. **Boş durum:** illüstrasyon + "QR okuttuğun mekanları buraya kaydet" + iki CTA ("Yakındaki mekanlar", "Son ziyaret ettiklerim" — son geri bildirimlerden 3 mekanı tek dokunuşla favorile). Boş durum, ekleme yapılabilen bir yerde bitmeli.
5. **Hata durumu:** inline kart + "Tekrar dene".

**Motion (ölçülü):**
- Kalp toggle'da kısa ölçek-pulse (120 ms, `scale 1→1.2→1`) ve 4-6 parçacıklık mikro patlama — yalnız ekleme anında; global `reducedMotion="user"` zaten saygı gösterir.
- Silmede kart yüksekliği çöker (`exit: height 0`), `layout` yerine — `domMax` yüklemeye gerek yok.
- Liste girişinde mevcut stagger kalabilir; 3B/three.js **gereksiz** — bu bir fayda sayfası, hız ve okunabilirlik öncelikli.

**Veri/API değişiklikleri:**
- `GET /api/customer/favorites` genişlet: her mekan için `isOpenNow` (discovery'deki hesap `lib/`'e taşınıp paylaşılmalı), `holidayMode`, aktif kampanya/happy hour özeti, kullanıcının o mekandaki `visitCount`/`lastVisitAt`/`xpEarned` (tek `groupBy` sorgusu ile, N+1 olmadan). Redis cache uygun değil (kişisel); 60 sn istemci staleTime yeterli.
- `GET /api/customer/venues/[dealerId]`: müşteri tarafı profil (Bulgu 2).
- Paylaşılan `useFavorites()` + `<FavoriteToggle>`: tek queryKey, iyimser güncelleme, çapraz invalidate (Bulgu 4-5).
- İleride: `CustomerFavoriteDealer`'a `notify Boolean @default(true)` ve opsiyonel `listId` (koleksiyonlar) alanları; dealer tarafında "favorileyen müşteri sayısı" metriği ve kampanyayı favorileyenlere hedefleme (segment merkezi mevcut).

---

## Çakışmalar / birleştirme önerisi

- **Dashboard "Favorilerim" şeridi** (`components/customer/dashboard/customer-dashboard.tsx:823-857`): aynı veriyi kendi state'iyle, farklı link parametresiyle (`?focus=`) ve farklı kart tasarımıyla gösteriyor. Öneri: şerit yalnız önizleme olsun (ilk 5 + "Tümünü gör → Mekanlarım"), veri `useFavorites()`'ten gelsin.
- **Analytics "Favori İşletmelerim"** (`app/customer/analytics/page.tsx:475-500`, kaynak `app/api/customer/analytics/route.ts:262-270`): kullanıcının kaydettiği değil, *en çok ziyaret ettiği* mekanlar — aynı adla farklı kavram, kafa karıştırıcı. Öneri: analytics'teki başlığı "En çok ziyaret ettiklerin" olarak yeniden adlandır; bu veri Mekanlarım'da "En çok ziyaret" sıralaması olarak da kullanılsın.
- **`/customer/nearby`**: favoriler doğal olarak "mekan" alanına ait. Önerilen birleşim: `nearby` sayfasında `Yakınımda | Kaydettiklerim` sekmeleri (veya Mekanlarım ayrı rota + aynı kart bileşeni). Ayrı rota korunacaksa bile kart bileşeni, harita ve profil linki iki sayfada ortak olmalı.
- **`/customer/category-leaderboard`**: favori kalbini gösteriyor ama değiştiremiyor (`page.tsx:94`); `<FavoriteToggle>` ile birleşmeli.

**Sonuç:** Rota kaldırılmamalı — kaydedilen mekan, yeniden ziyaret/sadakat döngüsünün çekirdek verisi. Ama mevcut hâliyle ulaşılamaz ve çıkmaz sokak olduğu için "Mekanlarım" olarak yeniden tasarlanıp nearby + dashboard şeridiyle tek bileşen/tek veri kaynağında birleştirilmeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdu: kod değiştirilmedi, veritabanına dokunulmadı. Okunan dosyalar: `app/customer/favorites/page.tsx`, `app/api/customer/favorites/route.ts`, `lib/api-auth.ts`, `lib/api-http.ts`, `components/providers.tsx` (QueryClient varsayılanları), `app/customer/nearby/page.tsx` + `layout.tsx`, `components/customer/dashboard/customer-dashboard.tsx`, `app/` altındaki dinamik rota dizinleri.

### İddia 1 — "API hatası boş favori listesi olarak gösteriliyor" → **DOĞRULANDI** (ciddiyet: Orta; Kritik/Yüksek abartılı)

- `app/customer/favorites/page.tsx:37` yalnız `{ data, isLoading }` alınıyor; `isError`/`error`/`refetch` kullanılmıyor.
- `:41` `!res.ok` durumunda hata fırlatılıyor → useQuery `error` durumuna geçer, `data` `undefined` kalır.
- `:47` `data?.data || []` → `favorites = []`; `:83` `isLoading` artık `false`; `:89` `favorites.length === 0` dalı → "Henüz favoriniz yok" + "Mekan Keşfet" CTA'sı.
- `components/providers.tsx:207-216`: `retry: 1`, global `QueryCache.onError`/toast yok → hata hiçbir yerde kullanıcıya bildirilmiyor.
- Hata kaynakları gerçek: route `403` (rol `CUSTOMER` değil, `route.ts:18-20`), `503` (`responseIfDatabaseUnavailable`, `lib/api-http.ts:18-28`), `500` (`route.ts:63-66`), `requireAuth` içinden `401` (`getSessionOr401`) ve token-replay `403`.
- Düzeltme: denetçinin "token replay 401" ifadesi yanlış; `lib/api-auth.ts:68-75` replay için **403** döndürüyor. Sonuç değişmiyor.
- Sınır: Önbellekte veri varken yapılan arka plan yenilemesi başarısız olursa React Query eski veriyi korur, yani boş durum görünmez. Sorun, ilk yüklemede ya da `gcTime` (5 dk) dolduktan sonra ortaya çıkar.

**Yeniden üretim:** Neon kısa bir süre erişilemez olsun (cold start/pooler kesintisi) → `GET /api/customer/favorites` 503 döner → 1 tekrar denemeden sonra da 503 gelir → sayfada "Henüz favoriniz yok" görünür. Kullanıcı favorilerinin silindiğini düşünür, tekrar deneme yolu yoktur. Veri kaybı yoktur (`deleteMany` yalnız açık DELETE ile çalışır); sorun yanıltıcı arayüz.

**Öneri:** `isError` için ayrı bir hata durumu bileşeni gösterilmeli: "Favoriler yüklenemedi" metni, `refetch()` bağlı "Tekrar dene" düğmesi, 503'te `retryable: true` alanına göre otomatik geri çekilmeli yeniden deneme, 401/403'te giriş sayfasına yönlendirme. Boş durum yalnız `isSuccess && data.data.length === 0` koşulunda gösterilmeli. Paylaşılan `useFavorites()` kancasına taşınırsa dashboard şeridi de aynı sözleşmeyi kazanır.

### İddia 2 — "'Profili Gör' linki hedefe ulaşmıyor" → **DOĞRULANDI** (ciddiyet: Orta-Yüksek; kartın tek birincil eylemi çalışmıyor)

- `app/customer/favorites/page.tsx:161` → `/customer/nearby?dealerId=${fav.dealerId}`.
- `app/customer/nearby/page.tsx` içinde `useSearchParams`/`searchParams` yok (dosyada grep ile arandı; `dealerId` geçen yerler yalnız tip tanımı ve `venue-${dealerId}` DOM id'si). `layout.tsx` de parametreye bakmıyor.
- Sayfa, konum alınmadan `fetchNearby`'ı çalıştırmıyor (`nearby/page.tsx:180-183`, `:220-225`). İlk gelişte konum yoksa kullanıcı izin modalıyla karşılaşır. Konum varsa liste `radiusKm` (varsayılan 5, `:82`) ile filtrelenir; favori mekan bu yarıçapın dışındaysa hiç listelenmez. İçerdeyse de otomatik kaydırma ya da vurgulama yapılmaz (`scrollIntoView` yalnız haritadan seçimde, `:619-620`).
- Müşteri tarafında işletme detay rotası yok (`app/` altında `dealer|venue|mekan|isletme` adlı müşteri/genel dinamik rota bulunamadı; dinamik rotalar yalnız `consumptions/[id]`, `feedbacks/[id]`, `remedy/[offerId]` vb.).
- Aynı kusur başka yerlerde de var: `customer-dashboard.tsx:851`, `:943`, `business-of-month-badge.tsx:49` ve `recommendations-section.tsx:64` `?focus=` kullanıyor; o parametre de okunmuyor.

**Yeniden üretim:** İstanbul'daki bir müşteri, Ankara'daki bir mekanı favorilemiş olsun → Favoriler'de "Profili Gör" → `/customer/nearby?dealerId=X` açılır → konum izni modalı ya da 5 km'lik yakın liste gelir, X mekanı listede yoktur. Yarıçap içindeyse de kullanıcı onu listede kendisi aramak zorunda kalır.

**Öneri:** Müşteri tarafı bir mekan profil rotası (`/customer/venues/[dealerId]`) ve `GET /api/customer/venues/[dealerId]` eklenmeli: ad, logo, adres, harita, açık/kapalı durumu, aktif kampanya/happy hour, kullanıcının bu mekandaki ziyaret/XP özeti ve favori düğmesi. Favoriler, dashboard, ayın işletmesi ve öneriler linklerinin tamamı bu rotaya bağlanmalı. Kısa vadeli ara çözüm olarak `nearby` sayfası `useSearchParams` ile `focus`/`dealerId` okuyup, hedef sonuç listedeyse kaydırıp vurgulamalı; listede değilse "Bu mekan seçili yarıçapın dışında" bildirimiyle yarıçapı genişletme seçeneği sunmalı.

---

## Uygulama (Dalga 2)

**Sonuç:** `/customer/favorites` emekli → **Keşfet → Kaydettiklerim** (`/customer/places?tab=saved`). Eski sayfa 308 koçanı; `?dealerId=` → mekân detayı (`/customer/places/[dealerId]`). Veri aynı tablo (`CustomerFavoriteDealer`), yeni uçlar: `GET /api/customer/places/saved` (canlı durum + kişisel bağlam + mesafe + öneriler) ve `PUT/DELETE /api/customer/places/saved/:dealerId` (defineRoute, CUSTOMER, oran sınırı, kullanıcı başı 200 sınırı, yalnız herkese açık işletme). Ana sayfa şeridinin kullandığı `/api/customer/favorites` geriye uyum için değişmedi.

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Rota rol koruması | ÇALIŞIYOR | Sayfa sunucuda CUSTOMER; uçlar `roles: ['CUSTOMER']`. |
| 2 | Metadata | ÇALIŞIYOR | Gerçek içerikle uyumlu ("Keşfet"); "ürünler/kısayollar" vaadi yok. |
| 3 | Navigasyonda giriş | ÇALIŞIYOR | Keşfet birincil sekme (kayıt: `customer.places`), Kaydettiklerim sekmesi. |
| 4 | Ana sayfa şeridinden "Tümünü gör" | KISMİ | Şerit ana sayfa yüzeyinin; bağlantı `/customer/nearby` → Keşfet'e düşüyor, `?tab=saved` için sahibine bildirildi. |
| 5 | Başlık + sayaç | ÇALIŞIYOR | "Kaydettiğin N mekân" + "N/200 kayıt". |
| 6 | Liste çekme | ÇALIŞIYOR | İlk veri sunucuda (sekme açıkken), sonra BFF. |
| 7 | Yükleniyor | ÇALIŞIYOR | Kart iskeleti (statik). |
| 8 | Hata durumu | ÇALIŞIYOR | `QueryState`: hata asla "favorin yok" görünmez; tekrar dene. |
| 9 | Boş durum + CTA | ÇALIŞIYOR | "Yakınımdakileri keşfet" (artık orada kalp var) + "Son gittiğin mekânlar" tek dokunuşla kaydet. |
| 10 | Logo | ÇALIŞIYOR | Hata yedeği. |
| 11 | Kalp rozeti | ÇALIŞIYOR | Dekor değil: `aria-pressed` aç/kapa düğmesi. |
| 12 | Ad (+ tıklanabilir kart) | ÇALIŞIYOR | Kartın tamamı mekân detayına gider. |
| 13 | Adres | ÇALIŞIYOR | + koordinatla yol tarifi, telefon. |
| 14 | "Profili Gör" | ÇALIŞIYOR | Mekân detayı (`/customer/places/[dealerId]`). |
| 15 | Favoriden kaldır | ÇALIŞIYOR | İyimser, hata olursa geri alınır, "Geri al" eylemli bildirim, yalnız ilgili kart kilitlenir, erişilebilir ad. |
| 16 | Toast | ÇALIŞIYOR | Müşteri tonu (`sonner`), tam Türkçe, sunucu mesajı gösterilir; admin önekli toast yok. |
| 17 | Giriş animasyonu | ÇALIŞIYOR | Bütçeli stagger (`listItem`). |
| 18 | Silinen kartın çıkışı | ÇALIŞIYOR | Yükseklik çökmesi (`layout`/domMax gerekmez); azaltılmış harekette anında. |
| 19 | Azaltılmış hareket | ÇALIŞIYOR | |
| 20 | Eklenme tarihi | ÇALIŞIYOR | "… tarihinden beri kayıtlı". |
| 21 | Konum/mesafe | ÇALIŞIYOR | Konum varsa mesafe + "Yakın" sıralaması (harita Yakınımda'da). |
| 22 | Ekleme yolu | ÇALIŞIYOR | Yakınımda kartları, En iyiler (podyum + liste), boş durum önerileri, mekân detayı. |
| 23 | Önbellek senkronu | ÇALIŞIYOR | Tek mutasyon tüm Keşfet önbelleklerini iyimser günceller; `['customer','favorites']` ve `['customer','dashboard']` da tazelenir. |
| 24 | Arama/filtre/sıralama | ÇALIŞIYOR | Sıralama: Son eklenen · Yakın · En çok ziyaret · Şu an açık (URL `?ssort=`). Ad araması Yakınımda'da (≤ 200 kayıtta gerek görülmedi). |
| 25 | Sınır bildirimi | ÇALIŞIYOR | Kullanıcı başı 200; dolunca 409 + açıklayıcı mesaj. |
| 26 | i18n | ÇALIŞIYOR | TR/EN. |
| 27 | Canlı mekân durumu | ÇALIŞIYOR | Açık/kapalı/tatil, canlı çarpan, teklif sayısı; "Kaydettiklerinden şu an fırsatı olan" vurgu kartı. |
| 28 | Kişisel bağlam | ÇALIŞIYOR | Ziyaret sayısı (kartlı harcama + QR); ayrıntı mekân detayında. |
| 29 | Mobil yerleşim | ÇALIŞIYOR | ≥ 44 px hedefler. |
| 30 | Başlık hiyerarşisi | ÇALIŞIYOR | h1 (sayfa) → h2 (liste) → h3 (kart). |
| 31 | API yetki/IDOR | ÇALIŞIYOR | Tüm işlemler oturum kullanıcısına kapsamlı (test). |
| 32 | POST doğrulama | ÇALIŞIYOR | zod parametre + yalnız herkese açık bayi + oran sınırı + üst sınır. |

**Kapanan bulgular (13/13):** 1 yetim sayfa · 2 "Profili Gör" · 3 hata = boş · 4 ekleme yolu yok · 5 iki ayrı önbellek · 6 silme a11y/geri al · 7 admin toast · 8 `layout` animasyonu · 9 i18n · 10 kullanılmayan bağlam · 11 ölü import/yanıltıcı hover · 12 başlık hiyerarşisi · 13 oran sınırı/üst sınır.

**Kalanlar:** Ana sayfa şeridinin "Tümünü gör"/"Sayfasına Git" bağlantıları ana sayfa yüzeyinde (sahibine bildirildi). Favori mekân bildirimleri ve koleksiyonlar (eksik özellik 3, 5) yapılmadı — mekân bazlı bildirim tercihi için **ŞEMA İSTEĞİ**: `CustomerFavoriteDealer.notify Boolean @default(true)`.
