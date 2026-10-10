# /customer/discover

**Amaç:** Müşteri panelindeki ödül, topluluk ve içgörü sayfalarına gruplanmış statik kısayollar sunan "Keşfet" merkez sayfası (bir site haritası / hub). Kendi verisi, API çağrısı ve etkileşimi yoktur; 3 kart içinde 17 `Link` listeler.

**Genel puan:** 4/10 · **Karar:** **birleştir** (ayrı sayfa olarak değil; sidebar ile aynı yapılandırmadan beslenen, görünürlük kurallarına uyan bir "Tüm özellikler" sheet'i / komut paleti olarak yeniden doğmalı)

> Kapsam notu: Sayfa tamamen statiktir. `fetch`/`useSWR`/server action YOKTUR; dolayısıyla okunacak bir `app/api` route'u veya Prisma modeli bulunmamaktadır. Denetim; sayfa, iki layout, `DashboardPageHero` → `AdminPremiumHero`, `Card` bileşenleri, i18n anahtarları (`messages/tr.json`, `messages/en.json`), sidebar menü kataloğu, `lib/visibility-controls.ts`, `lib/module-gate.ts`, `proxy.ts` ve bağlantı verilen 17 hedef route'un varlığı üzerinden yapıldı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | 17 linkin hepsi gerçek bir sayfaya gidiyor, ancak sayfaya uygulamada hiçbir yerden ulaşılamıyor (yetim) ve admin görünürlük ayarlarını yok sayıyor. |
| UX | 3/10 | Simgesiz, durumsuz, kişiselleştirmesiz düz bir link listesi; bilgi mimarisi sidebar gruplarıyla çelişiyor, oyunlar/etkinlik/davet gibi temel alanlar hiç yok. |
| Görsel | 4/10 | Ortak premium hero tutarlı, ama gövde üç beyaz karttaki metin satırlarından ibaret; kıyas ürünlerin "keşif" yüzeylerindeki görsel çekicilikten çok uzak. |
| Mimari | 3/10 | Menü yapısının elle kopyalanmış üçüncü bir kopyası (sidebar + visibility-controls + bu sayfa); tek kaynak yok, sapma zaten başlamış. |
| Performans | 8/10 | Veri çekmez, hafif; yalnız tamamen statik içerik için gereksiz `'use client'` ve hero'nun tema-mount gecikmesi var. |
| Erişilebilirlik + mobil | 6/10 | Global `:focus-visible` halkası ve tek sütuna düşen grid iyi; başlık hiyerarşisi h1→h3 atlıyor, link grupları `nav`/liste semantiği taşımıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rol bazlı erişim (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-73`, `proxy.ts:124` | `/customer/*` CUSTOMER dışındaki rolleri kendi paneline, oturumsuzu `/auth/login`'e yönlendirir. |
| 2 | Sayfa metadata (başlık/açıklama, i18n) | ÇALIŞIYOR | `app/customer/discover/layout.tsx:4-6`, `messages/tr.json:17-18`, `messages/en.json:17-18` | `segmentLayoutMetadata` DB'ye değil `getSeoSettings` cache'ine dayanıyor. |
| 3 | Hero (eyebrow, başlık, alt başlık, pusula simgesi) | ÇALIŞIYOR | `app/customer/discover/page.tsx:72-78`, `messages/tr.json:2655-2659` | Ortak `DashboardPageHero`, `tone="auto"`. |
| 4 | Hero azaltılmış hareket desteği | ÇALIŞIYOR | `components/admin/admin-premium-hero.tsx:35,73,126` | `useReducedMotion` ile "breathe" animasyonu ve `animate-in` kapanıyor. |
| 5 | Hero koyu/açık tema uyumu | KISMİ | `components/admin/admin-premium-hero.tsx:163-170` | `mounted` sonrası `resolvedTheme` okunduğu için koyu temada ilk karede simge kutusu açık stil ile çiziliyor (küçük flaş). |
| 6 | "Kazan ve keşfet" kartı (6 link: gelişim merkezi, ödüller, görevler, sürpriz kutular, rozetler, dükkân) | ÇALIŞIYOR | `page.tsx:30-41` | Hedef route'ların hepsi mevcut (`app/customer/{progress-hub,rewards,quests,surprise-boxes,badges,shop}/page.tsx`). |
| 7 | "Topluluk" kartı (4 link: ekipler, kampanyalar, liderlik, bağış) | ÇALIŞIYOR | `page.tsx:42-51` | Hedefler mevcut. |
| 8 | "İçgörü" kartı (7 link) | KISMİ | `page.tsx:52-64` | Linkler çalışıyor, fakat "Yakınımdakiler" ve "İşletmede deneyim" içgörü değil; başlık/açıklama (`tr.json:2663-2664`) içerikle uyuşmuyor. |
| 9 | Link etiketleri (i18n `sidebarNav.customer.*`) | ÇALIŞIYOR | `page.tsx:97` | 17 anahtarın 17'si TR ve EN'de mevcut (doğrulandı). |
| 10 | Link hedeflerinin varlığı (kırık link yok) | ÇALIŞIYOR | `app/customer/*/page.tsx` | 17/17 route dosyası var. |
| 11 | Duyarlı yerleşim (mobil tek sütun, `lg` 3 sütun) | ÇALIŞIYOR | `page.tsx:80` | Satır yüksekliği `py-2.5` ≈ 40px; 44px dokunma hedefinin biraz altında. |
| 12 | Klavye odak görünürlüğü | ÇALIŞIYOR | `app/globals.css:131-133` | Global `:focus-visible` halkası linklere de uygulanıyor. |
| 13 | Başlık hiyerarşisi | KISMİ | `admin-premium-hero.tsx:227` (h1), `components/ui/card.tsx:44` (h3) | h1'den doğrudan h3'e atlanıyor; h2 yok. |
| 14 | Navigasyon / liste semantiği | EKSİK | `page.tsx:87-100` | Linkler `div` içinde; `<nav aria-label>` + `<ul>/<li>` yok, ekran okuyucu "17 öğelik liste" bilgisini alamıyor. |
| 15 | Yükleniyor / hata durumu | ÇALIŞIYOR | `app/customer/loading.tsx`, `app/customer/error.tsx` | Sayfa asenkron iş yapmadığı için kendi durumu gerekmez; segment düzeyindeki sınırlar yeterli. |
| 16 | Sayfaya giriş noktası (sidebar / alt menü / dashboard / arama) | BOZUK | `components/dashboard/sidebar.tsx:274-276` | Sidebar'dan bilinçli olarak çıkarılmış ("Keşfet → chat bot"). Repo genelinde `/customer/discover`'a link veren tek bir UI yok (yalnız `lib/visibility-controls.ts:102` ve `lib/data/product-roadmap.json:107`). Sayfa yetim. |
| 17 | Admin "menü görünürlüğü" ayarına uyum | BOZUK | `page.tsx:81-101` vs `sidebar.tsx:438-454` | Sidebar `menuVisibility`/`featureVisibility`/`moduleControls` ile filtreliyor; bu sayfa hiçbirini okumuyor. Admin "Yakınımdakiler"i gizlerse link burada görünmeye devam ediyor, hedef sayfanın API'si 403 dönüyor (`app/api/customer/discovery/route.ts:99`). |
| 18 | Admin panelindeki `discover` menü anahtarı | SAHTE | `lib/visibility-controls.ts:102` | Admin bu öğeyi açıp kapatabiliyor ama hiçbir etkisi yok: sidebar'da öğe yok, sayfa da anahtarı kontrol etmiyor. Ölü kontrol. |
| 19 | `/customer/experiences`'a erişim yolu | BOZUK | `page.tsx:62`, `sidebar.tsx:275` | Deneyimler sayfasına uygulamada link veren TEK yer bu sayfa; bu sayfa da yetim olduğu için "Deneyimler" modülü pratikte ulaşılamaz (yalnız QRA bot bilgi tabanında geçiyor: `lib/qra-knowledge-base.ts:38`). |
| 20 | Tüm müşteri özelliklerini kapsama | EKSİK | `page.tsx:29-65` vs `sidebar.tsx:277-321` | Yok: Oyunlar (QGameX), Etkinlik Merkezi, Davet/Referral, Kartım, Yılım (Wrapped), Kategori liderliği, Tüketimlerim, Geri bildirimlerim, Telafi teklifleri, QR Tara, Favoriler, Lounge. "Menüde gizlenenleri burada hatırlayın" vaadiyle çelişiyor. |
| 21 | Link başına simge / görsel kimlik | EKSİK | `page.tsx:97-98` | Sadece metin + `ChevronRight`; sidebar'daki ikonlar bile yeniden kullanılmıyor. |
| 22 | Kişiselleştirilmiş durum (sayaç, "yeni", açılmamış kutu, aktif görev ilerlemesi) | EKSİK | `page.tsx:67-107` | Hiç veri çekilmiyor; her kullanıcıya aynı statik liste. |
| 23 | Hub içinde arama / filtre | EKSİK | — | 17+ öğelik bir haritada arama yok. |
| 24 | Metin tutarlılığı (TR/EN alt başlık, "Dükkân" adı) | KISMİ | `tr.json:2658` vs `en.json:2658`; `lib/visibility-controls.ts:94` vs `sidebarNav.customer.shop` | TR "Menüde gizlenen özellikleri hatırlayın", EN "menü kalabalık gelirse harita olarak kullanın" — farklı vaatler. Admin kataloğu "Avatar Dükkanı", i18n "Çerçeve Dükkanı". |

**Özet:** 24 özellik · ÇALIŞIYOR 11 · KISMİ 5 · BOZUK 3 · SAHTE 1 · EKSİK 4

---

## Bulgular

### 1. Sayfa yetim: uygulamada hiçbir yerden ulaşılamıyor
- **Önem:** yüksek · **Kategori:** bilgi mimarisi / navigasyon · **Efor:** S (karar) / M (yeniden konumlandırma)
- **Kanıt:** `components/dashboard/sidebar.tsx:274-276` ("`experiences` ve `discover` (Keşfet) menüden çıkarıldı (rapor kararı: Keşfet → chat bot…)"); repo genelinde `/customer/discover` grep'i yalnız `lib/visibility-controls.ts:102` ve `lib/data/product-roadmap.json:107` döndürüyor; `components/customer/dashboard/*` içinde bu sayfaya link yok.
- **Sorun:** Sayfa yalnızca URL'yi ezbere bilen kullanıcıya açık. Ürün yol haritası onu "shipped" gösteriyor (`product-roadmap.json:101-107`), admin paneli de görünürlük anahtarını sunuyor; yani sistemin üç ayrı yeri birbirine çelişik bilgi veriyor. Ölü yüzey bakım maliyeti üretiyor (i18n, metadata, route) ama değer üretmiyor.
- **Öneri:** Ürün kararını netleştirin. Sidebar zaten 9 blok + grup katlama ile tam haritayı veriyor; ayrı bir "Keşfet" sayfası ikinci bir menü olmaktan öteye geçmiyor. Önerilen hedef: bu sayfayı **kaldırıp** işlevini (a) mobilde sidebar sheet'inin üst kısmına konan arama alanı ve (b) `DashboardHeader` içindeki global aramaya eklenen "Sayfalar" sonuç grubu (komut paleti) olarak taşımak. Sayfa korunacaksa mobil alt eylem alanına/dashboard'a "Tüm özellikler" girişi eklenmeli. Her iki durumda `product-roadmap.json` ve `visibility-controls.ts` girişleri gerçek durumla hizalanmalı.

### 2. "Deneyimler" modülü fiilen ulaşılamaz durumda
- **Önem:** yüksek · **Kategori:** işlevsellik / ölü özellik · **Efor:** S
- **Kanıt:** `/customer/experiences` için tek UI linki `app/customer/discover/page.tsx:62`; sidebar'dan çıkarılmış (`sidebar.tsx:275`); `lib/module-controls.ts:30` modülü "optional" olarak katalogda tutuyor.
- **Sorun:** 290 satırlık bir müşteri sayfası (`app/customer/experiences/page.tsx`) yalnızca yetim bir hub'dan erişilebiliyor; zincirleme olarak modül kullanıcıya hiç görünmüyor. Ya modül ölü ya da bilgi mimarisi onu kaybetmiş.
- **Öneri:** Deneyimler modülü için bilinçli karar verin: değerliyse işletme detay/yakınımdakiler akışına ("bu mekandaki deneyimler") bağlam içinde yerleştirin — ayrı menü öğesi yerine `nearby` kartından ve tarama sonrası ekrandan bağlanmalı. Değersizse modülü `module-controls`, `visibility-controls`, QRA bilgi tabanı (`lib/qra-knowledge-base.ts:38`) dahil kaldırın.

### 3. Admin görünürlük ve modül kontrollerini yok sayıyor
- **Önem:** orta · **Kategori:** yetki tutarlılığı / hata · **Efor:** M
- **Kanıt:** Sidebar filtreleme mantığı `components/dashboard/sidebar.tsx:396-454` (`/api/settings/visibility` → `menuVisibility`, `featureVisibility`, `moduleControls`); bu sayfa `page.tsx:81-101` hiçbirini kullanmıyor. Hedef API'ler sunucu tarafında kapatılıyor: `app/api/customer/discovery/route.ts:99` (`assertMenuItemVisible('nearby', 'customer')`), `app/api/customer/donations/route.ts` (`'donations'`).
- **Sorun:** Admin "Yakınımdakiler"i ya da "AI Analizlerim"i kapattığında link burada görünmeye devam eder; kullanıcı tıklar ve "Bu sayfa yönetici tarafından geçici olarak gizlendi" 403'üyle boş/hatalı bir sayfaya düşer. Güvenlik açığı değil (sunucu kapısı çalışıyor) ama kırık bir deneyim ve admin ayarının sızması.
- **Öneri:** Sidebar'daki filtreyi `lib/customer-nav.ts` gibi ortak bir modüle (saf fonksiyon `filterNavItems(items, visibility)`) ve bir `useNavVisibility()` hook'una çıkarın; sidebar, hub (ya da komut paleti) ve mobil sheet aynı fonksiyonu kullansın. Böylece görünürlük kuralı tek yerde yaşar.

### 4. Menü yapısının elle kopyalanmış üçüncü kopyası (tek doğruluk kaynağı yok)
- **Önem:** orta · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `page.tsx:10-65` (yerel `CustomerLabelKey` birliği + `SECTIONS`), `sidebar.tsx:277-321` (`customerNavItems`), `lib/visibility-controls.ts:80-104` (`CUSTOMER_MENU_CATALOG`), `lib/qra-knowledge-base.ts:20-40` (QRA site haritası).
- **Sorun:** Dört ayrı liste aynı route'ları farklı gruplama ve etiketlerle tanımlıyor; sapma şimdiden görünür: hub'da Oyunlar/Etkinlik/Davet/Kartım/Yılım yok; "İçgörü" grubu `nearby` ve `experiences` içeriyor; admin kataloğu dükkânı "Avatar Dükkanı", i18n "Çerçeve Dükkanı" diye adlandırıyor. Yeni bir müşteri sayfası eklendiğinde dört yerin güncellenmesi gerekiyor ve unutulması kaçınılmaz.
- **Öneri:** `customerNavItems`'ı sidebar dosyasından çıkarıp tipli bir kayıt defterine taşıyın: `{ key, href, icon, labelKey, groupKey, featureKey, moduleKey, descriptionKey, keywords }`. Sidebar, hub/komut paleti, `CUSTOMER_MENU_CATALOG` ve QRA site haritası bu kayıttan türetilsin (QRA için `purpose` alanı i18n açıklamadan gelebilir). Jest'te "her `app/customer/*/page.tsx` kayıtta var mı" sözleşme testi eklenebilir (bkz. önceden kırık `menu-visibility-catalog` testi — bu sapmanın belirtisi).

### 5. Kapsam eksik ve bilgi mimarisi sidebar ile çelişiyor
- **Önem:** orta · **Kategori:** UX / IA · **Efor:** S
- **Kanıt:** `page.tsx:29-65` vs `sidebar.tsx:277-321`; `messages/tr.json:2658` ("Menüde gizlenen özellikleri burada hatırlayın").
- **Sorun:** Sayfa "her şeyin haritası" olduğunu iddia ediyor ama ürünün en canlı alanlarını (QGameX oyunları, Etkinlik Merkezi, Davet, Yılım/Wrapped, QR Tara, Kartım) listelemiyor. Grupları (Kazan / Topluluk / İçgörü) sidebar gruplarından (Kartım / Analizler / Geri bildirim / Trend / Ödüller / QGameX) farklı; kullanıcı iki zihinsel model öğrenmek zorunda.
- **Öneri:** Hub korunacaksa grupları sidebar'ın `NAV_GROUPS` yapısıyla birebir aynı yapın (kayıt defterinden türetince otomatik olur) ve tüm görünür öğeleri gösterin. "İçgörü" etiketi yalnızca analitik sayfalarını kapsamalı.

### 6. Tamamen statik, kişiselleştirmesiz "link listesi" — keşif değil
- **Önem:** orta · **Kategori:** UX / ürün · **Efor:** L
- **Kanıt:** `page.tsx:67-107` (veri çekimi yok, simge yok, durum yok).
- **Sorun:** Sayfa adı "Keşfet" ama kullanıcının bir sonraki değerli aksiyonuna dair hiçbir sinyal vermiyor: açılmamış sürpriz kutu, bitmek üzere olan görev, yeni kampanya, yeterli puanla alınabilecek ödül, oynanmamış oyun gibi bilgiler sistemde var (`/api/customer/stats` → progress-hub, dashboard) ama burada kullanılmıyor. Starbucks/Duolingo'da "keşif" yüzeyleri kişiye özel ve eyleme dönüktür.
- **Öneri:** Sayfa yaşayacaksa her kutucuğa hafif bir "durum rozeti" bağlayın: tek bir toplu uç (`GET /api/customer/nav-signals`, Upstash Redis'te kullanıcı başına 60 sn cache) → `{ surprise_boxes: { unopened: 2 }, quests: { nearlyDone: 1 }, rewards: { affordable: 3 }, campaigns: { new: 1 }, games: { dailyAvailable: true } }`. Aynı uç sidebar rozetlerini de besleyebilir (bayi tarafındaki `notification-badges` deseninin müşteri karşılığı).

### 7. Erişilebilirlik: başlık atlaması ve navigasyon semantiği
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** h1 `components/admin/admin-premium-hero.tsx:227`, kart başlıkları h3 `components/ui/card.tsx:44`; linkler düz `div` içinde `page.tsx:87-100`; satır yüksekliği `py-2.5` + `text-sm` (`page.tsx:93`).
- **Sorun:** h1→h3 atlaması ekran okuyucu gezinmesini bozar; link grubu bir navigasyon landmark'ı olarak duyurulmaz; dokunma hedefi ~40px ile önerilen 44px'in altında.
- **Öneri:** Kartları `<section aria-labelledby>` + `<h2>` yapın (`CardTitle asChild` ya da `as` prop'u), link listesini `<nav aria-label="…"><ul>` içine alın, satırları `min-h-11` yapın.

### 8. Gereksiz istemci bileşeni ve hero tema flaşı
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `page.tsx:1` (`'use client'`, ama state/efekt yok); `admin-premium-hero.tsx:163-170` (`mounted` sonrası koyu panel kararı).
- **Sorun:** Tamamen statik içerik istemci paketine giriyor; koyu temada ilk karede simge kutusu açık stille çizilip sonra değişiyor.
- **Öneri:** Sayfa yaşayacaksa server component yapıp `t(getServerLocale())` ile render edin, yalnız hero istemci kalsın. Hero'daki koyu/açık seçimini JS yerine Tailwind `dark:` varyantlarıyla çözmek flaşı tamamen kaldırır (bu tüm panellerdeki hero'ları iyileştirir).

### 9. Ölü admin kontrolü ve yanıltıcı yol haritası kaydı
- **Önem:** düşük · **Kategori:** tutarlılık · **Efor:** S
- **Kanıt:** `lib/visibility-controls.ts:102` (`discover` menü anahtarı), `lib/data/product-roadmap.json:101-107` ("shipped").
- **Sorun:** Admin, etkisi olmayan bir anahtarı açıp kapatıyor; yol haritası kullanıcıya erişilemeyen bir özelliği "yayında" gösteriyor.
- **Öneri:** Bulgu 1'deki karara göre ya anahtarı ve kaydı kaldırın ya da sayfayı gerçek bir giriş noktasına bağlayıp anahtarı sayfada da uygulayın.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kişiye özel "senin için" şeridi** (Starbucks Rewards "Offers for you", Duolingo "günlük hedef"): açılmamış kutu, bitmek üzere görev, satın alınabilir ödül gibi bir sonraki en iyi aksiyon kartları.
2. **Canlı rozet/sayaçlar her girişte** (Revolut/Monzo ana menü noktaları): "2 yeni", "1 hazır" gibi durum işaretleri; şu an hiçbir öğe durum taşımıyor.
3. **Anında arama / komut paleti** (Revolut arama, Spotify "Ara"): yazdıkça sayfaları ve eylemleri ("kupon kodu gir", "QR tara") bulan tek alan.
4. **Görsel kimlikli kutucuklar** (Spotify kategori karoları): ikon + renk + kısa açıklama ile taranabilir ızgara; şu an yalnız metin satırları.
5. **Sezon/etkinlik vitrini** (Spotify Wrapped, Duolingo etkinlikleri): "Yılım", aktif turnuva, sezonluk etkinlik gibi zamanlı içerik için üstte öne çıkan alan.
6. **Kişiselleştirilmiş sıralama / son kullanılanlar**: kullanıcının sık ziyaret ettiği özellikleri öne alma, yeni açılan modülleri "Yeni" etiketiyle tanıtma.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Keşfet" ayrı bir menü kopyası olmaktan çıkıp, kullanıcının **bir sonraki ödüllendirici aksiyonunu** gösteren ve tüm özelliklere **arama ile** anında erişim veren bir yüzeye dönüşmeli. Kullanıcı 3 saniyede "şu an benim için ne var?" sorusunun cevabını görmeli.

**Yerleşim (iki seçenek; önerilen A):**

- **A — Birleştir (önerilen):** Sayfayı kaldır. (1) `DashboardHeader` global aramasına "Sayfalar & eylemler" sonuç grubu ekle (kayıt defterindeki `labelKey` + `keywords` üzerinden istemci tarafı eşleşme, API gerekmez). (2) Mobil sidebar sheet'inin en üstüne aynı arama alanını koy. (3) Kişisel sinyalleri (açılmamış kutu, hazır ödül) sidebar öğelerine rozet olarak bağla. `/customer/discover` → `/customer` kalıcı yönlendirmesi (`next.config` redirects) ile eski bağlantılar kırılmaz.
- **B — Koru ama yeniden yap:** Üstte "Senin için" yatay şeridi (en fazla 3 eyleme dönük kart, `nav-signals` ucundan), altında arama alanı, ardından sidebar gruplarıyla birebir aynı başlıklar altında ikonlu 2/3/4 sütunlu karo ızgarası; her karoda durum rozeti. Mobilde karolar 2 sütun, en az 44px dokunma hedefi.

**Motion / 3D (yerinde ve ölçülü):** 3D gereksiz — bu bir navigasyon yüzeyi. Yalnızca: karo ızgarasında tek seferlik, 30–40 ms aralıklı stagger giriş (`m as Motion`, `useReducedMotion` ile kapatılabilir); durum rozetlerinde değer değiştiğinde küçük bir "pop" (scale 0.9→1, 150 ms); hover/press'te 1–2px kaldırma. Sürekli dönen/nefes alan animasyon eklenmemeli.

**Veri / API değişiklikleri:**
- `lib/customer-nav.ts`: tek tipli kayıt defteri (`href, icon, labelKey, descriptionKey, groupKey, featureKey, moduleKey, keywords`) + `filterNavItems(items, visibility)` saf fonksiyonu; sidebar, arama, (varsa) hub ve QRA site haritası buradan türetilir.
- `useNavVisibility()` hook'u: `/api/settings/visibility` çağrısını sidebar'dan çıkarıp SWR ile paylaşımlı hale getirir (şu an her sidebar mount'unda `no-store` ile yeniden çekiliyor).
- `GET /api/customer/nav-signals`: kullanıcı başına toplu sayaçlar, Upstash Redis 60 sn TTL, puan/kutu/görev değiştiren uçlarda cache tag invalidation. Yalnızca sayı döndürür; hassas veri yok.
- Sözleşme testi: `app/customer/*/page.tsx` ↔ kayıt defteri eşleşmesi (yetim sayfa ve unutulmuş menü öğesi CI'da yakalanır).

---

## Çakışmalar / birleştirme önerisi

- **`components/dashboard/sidebar.tsx` (müşteri menüsü):** Aynı route setinin daha güncel ve görünürlük kurallarına uyan sürümü. Hub, sidebar'ın eksik ve sapmış bir kopyası → **sidebar'a + global aramaya birleştirilmeli.**
- **`/customer/progress-hub`:** Kendisi de rozet/görev/ödül/harcama/yolculuk kısayolları içeren bir hub (`app/customer/progress-hub/page.tsx:161-242`); "Kazan ve keşfet" bölümüyle amaç olarak çakışıyor ama gerçek veriyle. Kişisel "senin için" sinyalleri gerekiyorsa doğal evi burası veya `/customer` dashboard'u.
- **`/customer` (dashboard):** Hızlı eylem linkleri (`components/customer/dashboard/*` — scan, games, quests, rewards, badges) zaten "sonraki aksiyon" rolünü üstleniyor.
- **QRA asistanı (`lib/qra-knowledge-base.ts`):** Sidebar yorumuna göre "Keşfet"in yerini alan resmi kanal; bu sayfa ile aynı site haritasını ayrı bir listede tutuyor — kayıt defterinden türetilmeli.
- **`/dealer/discover`:** Bayi tarafındaki ikiz sayfa, aynı nedenle bayi sidebar'ından da çıkarılmış (`sidebar.tsx:230-232`); aynı karar ve aynı birleştirme oraya da uygulanmalı (bu raporun kapsamı dışında, doğrulanmadı).

**Sonuç:** `/customer/discover` ayrı bir sayfa olarak değer üretmiyor ve şu an erişilemez. Kaldırılıp işlevi sidebar + global arama + kişisel rozet sinyallerine dağıtılmalı; kaldırmadan önce **Deneyimler** modülünün akıbeti (Bulgu 2) karara bağlanmalı, aksi halde o modül tamamen görünmez kalır.


---

## Uygulama (Dalga 2)

**Karar uygulandı: KALDIR (§6.1).**

- `app/customer/discover/page.tsx` artık küçük bir sunucu koçanı: sorgu parametrelerini koruyarak `/customer`'a `permanentRedirect` yapıyor. `discover/layout.tsx` silindi.
- Kayıt (`lib/navigation/registry.ts` → `customer.home.redirectFrom`) aynı eşlemeyi `next.config` yönlendirmesine taşıyor.
- Keşif işlevi, yani her özelliğe arama ile erişim, ⌘K paletinde ve sunucuda çözülen sidebar'da (navigasyon kaydı).
- Kişisel "senin için" sinyalleri yeni Ana Sayfa'da iki bölümde:
  - **Seni bekleyenler:** telafi teklifi, yorum bekleyen tüketim, kullanılmamış ödül, açılmamış kutu.
  - **Günlük hedefler.**

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Rol bazlı erişim | ÇALIŞIYOR | Proxy; koçan da `/customer` korumasına düşer. |
| 2 | Sayfa metadata | KALDIRILDI | sayfa emekli |
| 3 | Hero | KALDIRILDI | sayfa emekli |
| 4 | Hero azaltılmış hareket | KALDIRILDI | sayfa emekli |
| 5 | Hero tema flaşı (KISMİ) | KALDIRILDI | sayfa emekli |
| 6 | "Kazan ve keşfet" kartı | KALDIRILDI | ⌘K + sidebar (kayıttan) |
| 7 | "Topluluk" kartı | KALDIRILDI | ⌘K + sidebar |
| 8 | "İçgörü" kartı (KISMİ) | KALDIRILDI | ⌘K + sidebar |
| 9 | Link etiketleri | KALDIRILDI | Etiketler kayıtta (TR/EN). |
| 10 | Link hedeflerinin varlığı | KALDIRILDI | Kayıt ↔ dosya sistemi sözleşme testi navigasyon ajanında. |
| 11 | Duyarlı yerleşim | KALDIRILDI | |
| 12 | Klavye odak | KALDIRILDI | |
| 13 | Başlık hiyerarşisi (KISMİ) | KALDIRILDI | |
| 14 | Navigasyon/liste semantiği (EKSİK) | KALDIRILDI | |
| 15 | Yükleniyor/hata | KALDIRILDI | |
| 16 | Giriş noktası yok — yetim (BOZUK) | KAPANDI | Eski URL Ana Sayfa'ya yönlenir; yetim sayfa kalmadı. |
| 17 | Menü görünürlüğünü yok sayma (BOZUK) | KAPANDI | Ayrı liste yok; ⌘K ve sidebar sunucu kabuk yapılandırmasıyla filtreli. |
| 18 | Admin `discover` menü anahtarı (SAHTE) | KALAN (sahiplik dışı) | `lib/visibility-controls.ts` ve `product-roadmap.json` girdileri navigasyon/menü kataloğu ajanının. |
| 19 | `/customer/experiences` erişim yolu (BOZUK) | KALAN (sahiplik dışı) | Kayıtta `customer.places.redirectFrom` içinde. İçerik `/customer/places/[dealerId]`'e taşınacak (Keşfet ajanı). |
| 20 | Tüm özellikleri kapsama (EKSİK) | KAPANDI | ⌘K paleti kayıttaki tüm görünür yüzeyleri kapsar. |
| 21 | Link başına simge (EKSİK) | KAPANDI | Palet ve sidebar kayıttaki ikonları kullanır. |
| 22 | Kişiselleştirilmiş durum (EKSİK) | KAPANDI | Ana Sayfa "Seni bekleyenler" (DB sayıları; kapalı modül gizli). |
| 23 | Arama/filtre (EKSİK) | KAPANDI | ⌘K paleti |
| 24 | Metin tutarlılığı (KISMİ) | KALDIRILDI | sayfa emekli |

### Kapanan bulgular (7 / 9)

| Bulgu | Konu |
|---|---|
| 1 | Yetim sayfa |
| 3 | Görünürlüğü yok sayma |
| 4 | Menünün elle kopyası |
| 5 | Kapsam/IA çelişkisi |
| 6 | Kişiselleştirmesiz liste (kişisel sinyaller artık Ana Sayfa'da) |
| 7 | Erişilebilirlik |
| 8 | Gereksiz istemci bileşeni, tema flaşı |

### Kalanlar

- **Bulgu 2 (Deneyimler modülü)** ve **Bulgu 9 (ölü admin anahtarı / yol haritası kaydı):** sahiplik dışı; Keşfet ve navigasyon ajanlarının işi.
- **Navigasyon ajanına not:** `lib/navigation/next-redirects.js` içindeki `isRetirementStub`, JSX'i `/<[A-Za-z]/` ile arıyor. TS generic'i içeren koçanlar (`Promise<Record<…>>`; bu sayfa ve emekli oyun koçanları) bu yüzden "emekli değil" sayılıyor ve `next.config` yönlendirmesi atlanabiliyor. Sayfanın kendi `permanentRedirect`'i çalıştığı için kullanıcıya etkisi yok.
