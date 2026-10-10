# /customer

**Amaç:** Müşteri panelinin ana sayfası ("Ana Sayfa / Dashboard"). Tüketiciye tek bakışta kim olduğunu (avatar, çerçeve, lig, seviye), ne kadar puanı olduğunu, bugün ne yapması gerektiğini (QR tara, çark, görevler, seri) ve nereye gidebileceğini (trend mekanlar, fırsatlar, ödüller, liderlik) göstermesi beklenen merkez ekran.

**Genel puan: 4.6 / 10** · **Karar: yeniden tasarla** (veri katmanı ve API'ler büyük ölçüde gerçek ve korunabilir; ancak ekran 1.364 satırlık tek bir istemci bileşeni, aynı bilgiyi üç kez tekrar ediyor, birkaç kartta sahte/sabit veri var ve birden fazla veri doğruluğu hatası, oyunlaştırma güvenini doğrudan zedeliyor.)

İncelenen dosyalar: `app/customer/page.tsx`, `app/customer/layout.tsx`, `app/customer/loading.tsx`, `app/customer/error.tsx`, `app/customer/types.ts`, `app/customer/customer-shell.css`, `components/customer/dashboard/customer-dashboard.tsx` (1.364 satır), `components/customer/dashboard/customer-dashboard-skeleton.tsx`, `components/customer/{login-streak-card,glow-card,animated-number,floating-orbs,customer-birthday-bonus-host,welcome-video-modal}.tsx`, `components/gamification/spin-wheel.tsx`, `components/onboarding/onboarding-sheet.tsx`, `components/ui/avatar-frame.tsx`, `lib/{utils,league-rules,reward-display-image,discovery-config,auth,effects/confetti}.ts`, `i18n/request.ts`, `messages/{tr,en}.json`, API: `app/api/customer/{stats,discovery,favorites,showcase,weekly-card,streak}/route.ts`, `app/api/leaderboard/route.ts`, `app/api/gamification/{rewards,spin}/route.ts`, `proxy.ts`, `prisma/schema.prisma` (User, Quest, UserQuest, Reward).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Ana akışlar (QR CTA, çark, seri, favori) çalışıyor; ama seri istatistiği sabit 0, "2 Saat Kaldı" sahte, liderlik tablosu karışık metrikli, sponsorlu kartlar ve 3 derin bağlantı parametreleri hedefte yok sayılıyor, seviye atlama kutlaması her ziyarette tekrar ediyor. |
| UX | 4/10 | Bilgi mimarisi dağınık: puan 3 yerde, seri 3 yerde, görevler 3 ayrı kaynaktan; oturum yüklenirken "Kullanıcı / 0 puan / hoş geldin" yanlış içeriği yanıp sönüyor; API hataları "henüz veri yok" gibi gösteriliyor. |
| Görsel | 6/10 | Premium hero kabı, lig çipi, puan kartı ve seri kartı iyi; fakat 10+ kartlık uzun dikey liste, her kartın farklı gradyan/kenarlık/yarıçap (rounded-2xl/3xl) dili ve sürekli parlayan stat kartları görsel gürültü üretiyor. |
| Mimari | 3/10 | Tek dev `'use client'` bileşen, 13 `useState` + `useEffect` ile React Query verisini kopyalama, `any` kaçakları, ölü gizli kart, iki ayrı lig kuralı kaynağı, puan/XP kavram karmaşası. |
| Performans | 4/10 | İlk boyamada ~11 istemci isteği (çark GET iki kez), her 60 sn'de 7 uç yeniden çağrılıyor; bunlardan `discovery` önbelleksiz olarak 25.000 feedback + 20.000 review satırı tarıyor; SSR verisi yok. |
| Erişilebilirlik + Mobil | 5/10 | Mobilde yatay şeritler ve büyük dokunma hedefleri iyi; ancak "Profili düzenle" yalnızca hover ile görünür, ikon butonlarında `aria-label` yok, lig Sheet'inde açık temada okunamayan metin, konfeti azaltılmış hareketi yok sayıyor, ~45 sabit Türkçe metin İngilizce arayüzü bozuyor. |

---

## Özellik envanteri

Durum anahtarı: ÇALIŞIYOR / KISMİ / BOZUK / SAHTE / EKSİK. Satır numaraları aksi belirtilmedikçe `components/customer/dashboard/customer-dashboard.tsx` içindir.

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rol koruması (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-73`, matcher `proxy.ts:124` | `/customer/:path*` kökü de kapsıyor; başka rol kendi paneline yönlendiriliyor. |
| 2 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/page.tsx:5-7`, `layout.tsx:12-24` | |
| 3 | Kenar çubuğu (menü görünürlüğüne uyumlu) | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:327,406,444` | Panel düzeyi; sayfa içeriği bu görünürlüğe uymuyor (bkz. #44). |
| 4 | Üst başlık + global arama | ÇALIŞIYOR | `layout.tsx:37`, `components/dashboard/header.tsx:109-178` | Bu denetimde derinlemesine doğrulanmadı. |
| 5 | "İçeriğe atla" bağlantısı | ÇALIŞIYOR | `layout.tsx:34`, `main#dashboard-main` `layout.tsx:38-44` | |
| 6 | Rota yükleme iskeleti (`loading.tsx`) | ÇALIŞIYOR | `app/customer/loading.tsx:1` | |
| 7 | Hata sınırı (Sentry + tekrar dene) | ÇALIŞIYOR | `app/customer/error.tsx:19-22,43-53` | Yalnız render hatalarını yakalar; API hataları yutuluyor (#62). |
| 8 | Onboarding Sheet (3 adım) | KISMİ | `components/onboarding/onboarding-sheet.tsx:17,56-65` | Anahtar kullanıcıya özel değil (`qratex-onboarding-done`); karşılama videosu ve doğum günü diyaloğuyla aynı anda açılabiliyor. |
| 9 | Karşılama videosu modalı | KISMİ | `components/customer/welcome-video-modal.tsx:39-60` | Kendi başına doğru (HEAD kontrolü, kullanıcı anahtarı); orkestrasyon yok, #8 ile üst üste biniyor. |
| 10 | Doğum günü bonus diyaloğu | ÇALIŞIYOR | `components/customer/customer-birthday-bonus-host.tsx:29-77` | |
| 11 | Web Vitals raporlayıcı | ÇALIŞIYOR | `layout.tsx:50` | |
| 12 | İstemci iskeleti (veri yüklenirken) | KISMİ | `:417,427-429`, `components/providers.tsx:220` | `SessionProvider` başlangıç oturumu almıyor → oturum gelene kadar `loading=false`; SSR ve ilk boyamada sahte içerik görünüyor (Bulgu 3). |
| 13 | Hero kabı + Spotlight + FloatingOrbs + bulanık lekeler | ÇALIŞIYOR | `:436-451`, `components/customer/floating-orbs.tsx:277-305` | 5 sonsuz `blur(40px)` animasyonu + 2 `blur-3xl` leke; mobilde GPU maliyeti. |
| 14 | Profil arka planı kozmetiği | BOZUK | `:441-444`, `lib/auth.ts:249` | Kozmetiğin `imageUrl` değeri `className` içine basılıyor; URL ise hiçbir etki yok, sınıf adıysa Tailwind JIT'te yoksa yine etki yok (`tailwind.config.ts:11` safelist yalnız z-index). Puanla satın alınan ürün görünmüyor. |
| 15 | Avatar + kozmetik çerçeve | KISMİ | `:457-470`, `components/ui/avatar-frame.tsx:123-145` | Yalnız `fire_effect` vb. kimlikleri tanıyor; URL tabanlı çerçeveler varsayılana düşüyor. Değer JWT'den geliyor; mağazada kuşanınca `update()` ile senkronlanıyor (`shop-interactive.tsx:66-75`). |
| 16 | Seviye rozeti (avatar köşesi) | ÇALIŞIYOR | `:471-473` | Seviyeye ilerleme (`levelProgress`) API'de var ama gösterilmiyor (#64). |
| 17 | "Profili düzenle" butonu | KISMİ | `:474-481` | Yalnız `group-hover` ile görünür; dokunmatik ve klavyede görünmez/erişilemez. |
| 18 | Lig çipi → Lig Detayları Sheet | KISMİ | `:484-495,1296-1361` | Admin'in düzenlediği DB lig kuralları yerine sabit `DEFAULT_LEAGUE_RULES` (`:1326`, `lib/utils.ts:142-168`) kullanılıyor; liderlik API'si ise DB kurallarını kullanıyor (`app/api/leaderboard/route.ts:79`). |
| 19 | Selamlama (Günaydın/İyi günler/İyi akşamlar) | KISMİ | `app/customer/types.ts:84-89`, `:497` | Yalnız Türkçe; SSR (UTC) ile istemci saati farklı dilimdeyse hidrasyon uyuşmazlığı. |
| 20 | Hero çipi: puan | KISMİ | `:505` | `user.points` "XP" olarak etiketleniyor; şemada ayrı `xp` alanı var (Bulgu 4). |
| 21 | Hero çipi: geri bildirim sayısı | ÇALIŞIYOR | `:509`, `app/api/customer/stats/route.ts:153` | QR feedback + tüketim değerlendirmesi toplamı. |
| 22 | Hero çipi: rozet sayısı | ÇALIŞIYOR | `:513`, `stats/route.ts:23` | |
| 23 | Hero çipi: gün serisi | SAHTE | `:515-520`, `stats/route.ts:157` | API `streak: 0` sabit döndürüyor; çip asla görünmez. `User.loginStreakCount` mevcut (`schema.prisma` User). |
| 24 | Vitrin (sabitlenmiş rozet/kozmetik) | ÇALIŞIYOR | `:329-358,524-545`, `showcase/route.ts:23-36` | API tüm sahip olunan kozmetik+rozetleri sınırsız ve tam nesne olarak döndürüyor; burada yalnız sabitlenenler kullanılıyor. |
| 25 | "İlk rozetin bir QR uzağında" ipucu + İlk görev | ÇALIŞIYOR | `:547-562` | Oturum yüklenirken herkes için yanıp sönüyor (#12). |
| 26 | Puan kartı (AnimatedNumber) | ÇALIŞIYOR | `:575-578`, `components/customer/animated-number.tsx:252-257` | Her değer değişiminde 0'dan yeniden sayıyor (çarktan +10 alınca 0 → 1.250). |
| 27 | Sonraki lig ilerleme çubuğu | KISMİ | `:579-591` | Sabit lig kuralları (#18). |
| 28 | "QR tara ve kazan" ana CTA | ÇALIŞIYOR | `:593-598` | |
| 29 | Günlük giriş serisi kartı | ÇALIŞIYOR | `components/customer/login-streak-card.tsx:39-66`, `app/api/customer/streak/route.ts:22-58` | GET isteği yan etkili (seriyi ilerletir, puan verir); aynı ekrandaki "Aktif seri: 0" ile çelişiyor. |
| 30 | Seri kilometre taşı kutlaması | ÇALIŞIYOR | `login-streak-card.tsx:49-55` | Konfeti azaltılmış hareketi dikkate almıyor (`lib/effects/confetti.ts:50-59`). |
| 31 | Haftalık görev kartı | KISMİ | `:616-672`, `weekly-card/route.ts:19-51` | Ödül değeri API'de hesaplanıyor ama UI yalnız "Ödül" yazıyor (`:662-664`); `expiresAt` filtrelenmiyor; görev tipi "weekly" değil, en yeni 24 aktif görev. |
| 32 | Haftalık zafer bandı | ÇALIŞIYOR | `:636-648`, `weekly-card/route.ts:54-63` | Mesaj sunucuda sabit Türkçe. |
| 33 | Sosyal sorumluluk bandı | ÇALIŞIYOR | `:675-709` | Statik içerik; kişisel bağış verisi yok; tamamı sabit Türkçe. |
| 34 | "Liderlik" → bağış liderliği | BOZUK | `:703`, `app/customer/donations/donations-client.tsx:422` | `?tab=leaderboard` okunmuyor; sekme `defaultValue="projects"` sabit. |
| 35 | Yeni müşteri rehberi (3 adım) | ÇALIŞIYOR | `:712-757` | |
| 36 | Stat kartı: Geri bildirim | ÇALIŞIYOR | `:761-766` | Hero çipinin kopyası. |
| 37 | Stat kartı: Toplam puan | ÇALIŞIYOR | `:767-773` | Hero çipi ve puan kartının kopyası (üçüncü gösterim). |
| 38 | Stat kartı: Rozetler | ÇALIŞIYOR | `:774-779` | Kopya. |
| 39 | Stat kartı: Aktif seri | SAHTE | `:780-785`, `stats/route.ts:157` | Daima 0; hemen üstteki seri kartı gerçek değeri gösteriyor. |
| 40 | Kompakt şans çarkı | KISMİ | `:796-805`, `components/gamification/spin-wheel.tsx:55-299` | Sunucu tarafı ağırlıklı çekiliş ve atomik günlük limit doğru (`spin/route.ts:61-75`); ama özellik kapalıyken "Yarın gel!" yazıyor (`spin-wheel.tsx:255-260`), durum GET'i iki kez çekiliyor. |
| 41 | Çark sonucu diyaloğu | ÇALIŞIYOR | `spin-wheel.tsx:266-297` | |
| 42 | Çark sonrası yerel puan güncellemesi + kutlama | KISMİ | `:800-803` | `triggerSuccessBurst()` "Tekrar Dene" (kayıp) sonucunda da patlıyor; XP ödülü hiçbir sayaca yansımıyor. |
| 43 | Hızlı eylemler (Tara/Oyunlar/Görevler/Rozetler/Ödüller) | KISMİ | `:807-820` | Bağlantılar çalışıyor; "Mini Oyunlar" sabit Türkçe (`:809`); `lg:grid-cols-7` içinde 6 öğe → boş hücre (`:793`). |
| 44 | Modül/menü görünürlüğüne uyum | EKSİK | `:807-820`, `sidebar.tsx:444` | Admin bir menüyü gizlese de dashboard bağlantıyı gösteriyor; `rewards` modülü kapalıyken ödül/liderlik kartları "boş" görünüyor. |
| 45 | Favorilerim şeridi | KISMİ | `:824-857` | API'nin döndürdüğü `businessLogo` kullanılmıyor, yalnız baş harf; "Tıkla & incele" yazıyor ama kart tıklanamıyor. |
| 46 | Favoriden çıkarma (şerit) | BOZUK (koşullu) | `:370-406,833-840` | "Favori mi?" bilgisi `discovery.favoriteDealerIds`'ten okunuyor; discovery 403/500 dönerse liste boş kalır → kalp POST (yeniden ekle) gönderir ve şeride kopya kart eklenir. |
| 47 | "Sayfasına Git" / "Ziyaret Et" (`?focus=`) | BOZUK | `:851,943`, `app/customer/nearby/page.tsx` | Nearby sayfası `focus` parametresini hiç okumuyor; kullanıcı genel listeye düşüyor. |
| 48 | Gizemli görev bandı | KISMİ | `:859-894` | Gerçek görevden besleniyor ama süresi dolmuş/pasif görevler de gelebilir (`stats/route.ts:24-28`). |
| 49 | "2 Saat Kaldı" geri sayımı | SAHTE | `:873` | Sabit metin; `Quest.expiresAt` mevcut ama API'den dönmüyor. |
| 50 | Trend Mekanlar listesi | KISMİ | `:899-953`, `discovery/route.ts:124-218` | Konum gönderilmiyor; liste global ama boş durumda "Yakınınızda… bulunamadı" yazıyor (`:915`). |
| 51 | Trend satırındaki "Yakında" etiketi | SAHTE | `:930` | Her satırda sabit; ne mesafe ne açık/kapalı bilgisi. |
| 52 | Trend satırı favori kalbi | ÇALIŞIYOR | `:935-941`, `favorites/route.ts:71-118` | `aria-label`/`aria-pressed` yok. |
| 53 | "Tümünü gör" → Yakındakiler | ÇALIŞIYOR | `:907-909` | |
| 54 | Haftanın Enleri (ambiyans/yemek/hizmet) | ÇALIŞIYOR | `:956-983`, `discovery/route.ts:220-262` | Kazananın puanı ve işletme bağlantısı gösterilmiyor; `key={i}`. |
| 55 | Size Özel Fırsatlar (sponsorlu) | BOZUK | `:987-1007`, `lib/discovery-config.ts:103-110` | Admin'in girdiği `linkUrl`, `dealerId`, `imageUrl`, `description`, `discountRate` tamamen yok sayılıyor; bağlantı `nearby?promo=` ve hedef parametreyi okumuyor. Gösterim/tıklama ölçümü yok. |
| 56 | Aktif Görevler kartı | KISMİ | `:1011-1057`, `stats/route.ts:24-28,93-106` | Pasif/süresi geçmiş görevler filtrelenmiyor, sıralama yok; ödül yoksa 50 puan uyduruluyor (`stats/route.ts:104`); haftalık kartla aynı görevleri farklı ödülle gösterebilir. |
| 57 | Gizli "Lig Durumu" kartı | ÖLÜ KOD | `:1061-1122` | `className="hidden"` ile DOM'da duruyor, animasyonları mount ediliyor. |
| 58 | Liderlik Tablosu (ilk 5 + ben) | BOZUK | `:247-274,1125-1188`, `leaderboard/route.ts:81,299-307,375-381` | Haftalık sentetik puan ile tüm zamanların puanı aynı listede; kullanıcı satırı "Siz (Sen)" görünür; dönem etiketi yok (Bulgu 2). |
| 59 | Son Aktivite Logu | KISMİ | `:1191-1248`, `stats/route.ts:109-133` | QR feedback puanı uyduruluyor (`rating >= 4 ? 75 : 50`, `stats/route.ts:113`); satırlar tıklanamaz; "Tümü" yalnız feedbacks'e gidiyor, tüketimler başka sayfada. |
| 60 | Ödül Vitrini (en ucuz 3 ödül) | KISMİ | `:1250-1293`, `rewards/route.ts:115-130` | "Kilitli" butonu `disabled` ama `asChild` + `Link` olduğu için yine gidiyor (`:1278-1280`); ikon `resolveRewardDisplayImage`'dan geçmiyor; stok/geçerlilik tarihi göz ardı. |
| 61 | Seviye atlama kutlaması | BOZUK | `:362-367`, `lib/auth.ts:212-270`, `messages/*.json` | Oturumdaki seviye yalnız girişte yazılıyor → seviye atladıktan sonra her ziyarette konfeti + toast; toast metni ham anahtar `customerDashboard.levelUpTitle` (çeviri yok). |
| 62 | API hata durumu | EKSİK | `:149-158` | `safeFetch` hatayı yutup `{}` döndürüyor; kullanıcı "Ödüller yakında geliyor", "Henüz hareket yok" gibi yanlış boş durumlar görüyor, tekrar dene yok. |
| 63 | 60 sn otomatik yenileme | KISMİ | `:192-193` | Her dakika 7 uç; ağır `discovery` dahil. Görsel bir "güncellendi" sinyali de yok. |
| 64 | Seviye ilerlemesi (XP → sonraki seviye) | EKSİK | `:107,240`, `stats/route.ts:85-90` | API hesaplıyor, state'e yazılıyor, hiçbir yerde çizilmiyor. |
| 65 | Çok dillilik (TR/EN) | KISMİ | `:388,410,425,490,526,686-703,809,828-851,872-876,905-1001,1020-1049,1133,1175,1199-1287,1299-1350`, `spin-wheel.tsx` tamamı | Yalnız 24 anahtar çevrilmiş; ~45 metin sabit Türkçe. |
| 66 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232`, `app/globals.css:801-807`, `lib/effects/confetti.ts:20-59` | Framer ve CSS animasyonları kısılıyor; canvas-confetti `disableForReducedMotion` almıyor. |
| 67 | Manuel yenileme / çek-bırak yenile | EKSİK | — | PWA kullanımında beklenen bir davranış. |

**Durum sayımı (67 madde):** ÇALIŞIYOR 29 · KISMİ 23 · BOZUK 7 · SAHTE 4 · EKSİK 4 (ölü kod satırı #57 sayıma "KISMİ" olarak dahil edildi; #46 koşullu bozuk olduğundan BOZUK sayıldı).

---

## Bulgular

### 1. Seri (streak) istatistiği sabit 0; aynı ekranda gerçek seri kartıyla çelişiyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu / sahte veri · **Efor:** S
- **Kanıt:** `app/api/customer/stats/route.ts:157` (`streak: 0`), `customer-dashboard.tsx:515-520,780-785`; gerçek veri `User.loginStreakCount` ve `components/customer/login-streak-card.tsx:87-125`.
- **Sorun:** Kullanıcı ekranın üstünde "5 günlük seri" kartını, iki kart aşağıda "Aktif seri: 0" stat kartını görüyor. Hero'daki 🔥 çipi `streak > 0` koşuluna bağlı olduğundan hiçbir zaman görünmüyor. Duolingo tarzı seri, oyunlaştırmanın en güçlü elde tutma kolu; çelişkili sayı güveni bozuyor.
- **Öneri:** Seri için tek kaynak belirleyin: `stats` API'si `loginStreakCount`/`loginStreakLongest` alanlarını döndürsün (ek sorgu gerekmez, `user` select'ine eklenir). Dashboard'da seriyi yalnız `LoginStreakCard` içinde gösterin; stat ızgarasındaki "Aktif seri" kartını kaldırın ya da kartla aynı veriyi paylaşan bir React Query anahtarına (`['customer','streak']`) bağlayın.

### 2. Liderlik tablosu farklı metrikleri aynı listede karıştırıyor ve kullanıcı satırı "Siz (Sen)" görünüyor
- **Önem:** yüksek · **Kategori:** veri doğruluğu · **Efor:** M
- **Kanıt:** Dashboard `?limit=5` ile çağırıyor (`customer-dashboard.tsx:170`) → API varsayılanı `period=weekly` (`app/api/leaderboard/route.ts:81`). Haftalık puan gerçek kazanç değil, feedback metin uzunluğuna göre sentetik 50/100 (`leaderboard/route.ts:299-307`). Kullanıcı ilk 5'te değilse sırası **tüm zamanların** puanına göre hesaplanıyor (`:375-381`), dashboard da satıra JWT'deki bayat `user.points` değerini koyuyor (`customer-dashboard.tsx:264-271`). Ad sabit `'Siz'` ve render'da `(Sen)` ekleniyor (`:1173`) → "Siz (Sen)". Haftanın başında katkı yoksa API sessizce tüm zamanlara düşüyor (`:233-275`). Kartta dönem etiketi yok (`:1133`).
- **Sorun:** Örnek: 12.000 puanlık kullanıcı "#37 — 12.000 XP" olarak, üstündeki "#5 — 300 XP" satırının altında görünür. Sıralama ve sayılar anlamsızlaşıyor; Starbucks/Duolingo liglerindeki "bu haftaki yerim" hissi kayboluyor.
- **Öneri:** Dashboard için ayrı, hafif bir uç (`/api/customer/home/league-snapshot`) tasarlayın: dönem açıkça `weekly`, puan kaynağı `PointsLedger`/`points_credited` olayları (gerçek kazanç), kullanıcı sırası aynı metrik ve aynı dönemle hesaplanır, yanıtta `periodLabel` döner. UI'da başlık "Bu hafta" rozetini taşısın; kullanıcı satırı `isCurrentUser` ile vurgulansın, ad olarak kullanıcının kendi adı + "Sen" etiketi kullanılsın. Duolingo'nun "üst 5 + sen + bir üstündeki rakibin" kalıbı (fark: "+120 puanla #4'ü geçersin") çok daha motive edici.

### 3. Oturum yüklenirken yanlış içerik yanıp sönüyor (SSR'da "Kullanıcı, 0 puan, hoş geldin rehberi")
- **Önem:** yüksek · **Kategori:** UX / render · **Efor:** M
- **Kanıt:** `loading = !!session?.user && dashboardData === undefined` (`customer-dashboard.tsx:417`); `SessionProvider` başlangıç oturumu almıyor (`components/providers.tsx:220`). Oturum `undefined` iken `loading=false` olduğundan ana içerik varsayılan state ile çiziliyor: ad "Kullanıcı" (`:425`), 0 puan, `feedbackCount === 0` olduğu için yeni müşteri rehberi (`:712`), "ilk rozet" ipucu (`:547`), "Ödüller yakında geliyor", "Henüz hareket yok" boş durumları.
- **Sorun:** Her açılışta deneyimli kullanıcı bir an "yeni kullanıcı" ekranı görüyor, ardından iskelete, sonra gerçek veriye geçiliyor (iki düzen kayması). Selamlama SSR'da sunucu saatine (UTC), istemcide yerel saate göre hesaplandığı için hidrasyon uyuşmazlığı da oluşabiliyor (`app/customer/types.ts:84-89`).
- **Öneri:** `page.tsx`'i sunucu bileşeni olarak bırakıp `getServerSession` ile kimliği ve ilk "hero özeti"ni (ad, puan, seviye, lig, seri) sunucuda okuyun; React Query'ye `initialData`/`HydrationBoundary` ile geçirin. Diğer bölümleri `Suspense` sınırlarıyla akış hâlinde getirin. En azından `status === 'loading'` durumunda iskelet gösterilmeli ve selamlama yalnız istemcide (`useEffect` sonrası) hesaplanmalı.

### 4. "Puan" ile "XP" kavramları birbirine karışmış
- **Önem:** yüksek · **Kategori:** ürün mantığı / bilgi mimarisi · **Efor:** M
- **Kanıt:** Şemada iki ayrı alan var: `User.points` (harcanabilir bakiye) ve `User.xp` (seviye). Dashboard `points` değerini her yerde "XP" diye gösteriyor (`:505,577,586,1178-1179,1276`), stat kartı aynı sayıyı "Toplam puan" diye etiketliyor (`:768`, `messages/en.json` `statPoints`). Ödül maliyeti "XP" yazıyor ama ödül alınırken `debitPoints` ile **puan** düşülüyor (`rewards/route.ts` import `debitPoints`). Çark "20 XP" kazandırdığında (`spin/route.ts:86-87`) dashboard'daki "XP" değişmiyor; seviye ilerlemesi (`stats/route.ts:85-90`, gerçek XP) ise hiç çizilmiyor (`:107,240`).
- **Sorun:** Kullanıcı neyi harcadığını, neyin seviye getirdiğini ayırt edemiyor; çarktan XP kazanınca "XP'm artmadı" algısı oluşuyor. Starbucks (Stars = harcanır) ve Duolingo (XP = ilerleme, Gems = harcanır) bu iki para birimini görsel olarak net ayırır.
- **Öneri:** Terminolojiyi ürün genelinde sabitleyin: "Puan" (cüzdan, ödül/mağaza/bağış) ve "XP" (seviye). Hero'da iki ayrı gösterge: büyük puan bakiyesi + seviye halkası (XP ilerlemesi). Tüm "{n} XP" etiketlerini doğru alana bağlayın; çeviri dosyalarına `currency.points` / `currency.xp` anahtarları ekleyin; lig mantığı hangi alana dayanıyorsa (şu an `points`) Sheet'te bunu açıkça yazın.

### 5. Seviye atlama kutlaması her ziyarette tekrarlanıyor ve ham çeviri anahtarı gösteriyor
- **Önem:** yüksek · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `customer-dashboard.tsx:362-367` `stats.level > user.level` olduğunda konfeti + toast. `user.level` JWT'den gelir ve yalnız oturum açılırken DB'den okunur (`lib/auth.ts:212-243`); hiçbir yerde `update({ level })` çağrılmıyor (yalnız `donations-client.tsx:236` puanı günceller). `customerDashboard.levelUpTitle` anahtarı `messages/tr.json` ve `messages/en.json`'da yok; `t()` bulunamayan anahtarı aynen döndürüyor (`i18n/request.ts:35-36`).
- **Sorun:** Bir kez seviye atlayan kullanıcı yeniden giriş yapana kadar dashboard'u her açışında "customerDashboard.levelUpTitle 5! 🎉" toast'ı ve 3 saniyelik tam ekran konfeti görüyor. Kutlamanın değeri sıfırlanıyor, ekran hatalı görünüyor.
- **Öneri:** Kutlamayı sunucu tarafında idempotent bir "an" olarak modelleyin: `levelUp` olayı oluştuğunda bir `Notification`/`moment` kaydı (görüldü bayrağıyla) yazılsın; dashboard yalnız görülmemiş anları gösterip `PATCH /seen` ile kapatsın (dalda `docs(spec): An Motoru` tasarımı tam bunun için uygun). Geçici düzeltme: `localStorage` yerine sunucudan dönen `lastCelebratedLevel` alanı ile karşılaştırın, toast metnini çeviri dosyalarına ekleyin, konfetiye `disableForReducedMotion: true` verin.

### 6. Hatalar boş durum gibi gösteriliyor; modül kapalıyken kartlar yanıltıcı
- **Önem:** yüksek · **Kategori:** hata yönetimi · **Efor:** M
- **Kanıt:** `safeFetch` her hatada `{}` döndürüyor (`:149-158`); işleme bloğu `success` yoksa state'i değiştirmiyor (`:226,252,278,308,319`). `rewards` modülü kapalıysa liderlik ve ödül uçları geçit yanıtı döner (`leaderboard/route.ts:76-77`, `rewards/route.ts:73-74`); `discovery` menüsü gizliyse 403 (`discovery/route.ts:99-111`).
- **Sorun:** DB kesintisinde kullanıcı "Ödüller yakında geliyor. Takipte kal!" (`:1286`), "Henüz hareket yok" (`:1241`), "Yakınınızda trend mekan bulunamadı" (`:915`) görüyor; liderlik kartı ise tamamen boş gövdeyle kalıyor (boş durumu yok, `:1141`). Admin'in kapattığı modüller dashboard'da "bozuk/boş" kart olarak görünmeye devam ediyor.
- **Öneri:** Her bölümü kendi `useQuery`'sine ayırın (bkz. Vizyon) ve üç durumu açıkça ayırın: yükleniyor (bölüm iskeleti), hata (satır içi "Yüklenemedi · Tekrar dene"), boş (gerçek boş metin). Modül/menü görünürlüğünü tek bir `/api/customer/home` yanıtında `sections: { rewards: true, discovery: false, ... }` olarak döndürüp kapalı bölümleri hiç render etmeyin; sidebar'ın kullandığı görünürlük haritasıyla aynı kaynağı paylaşın.

### 7. Ağır ve önbelleksiz veri yükü: 60 sn'de bir 7 uç, discovery her seferinde ~45.000 satır
- **Önem:** yüksek · **Kategori:** performans / maliyet · **Efor:** M
- **Kanıt:** Paralel 7 istek (`:168-176`) + weekly-card (`:197-206`) + streak (`login-streak-card.tsx:43`) + çark durumu ikinci kez (`spin-wheel.tsx:77`) + doğum günü + karşılama videosu HEAD. `refetchInterval: 60_000` (`:193`). `discovery` kullanıcıdan bağımsız trend hesabı için son 30 günün 25.000 feedback'ini, 7 günün 20.000 değerlendirmesini, ardından QR ve bayi tablolarını çekiyor (`discovery/route.ts:14-15,124-171`), hiçbir önbellek yok. `showcase` sınırsız `findMany` + `include` (`showcase/route.ts:24-31`), `rewards` 200 ödülü tam nesne olarak döndürüyor ve dashboard 3'ünü kullanıyor (`rewards/route.ts:115-130`, `:280`). `stats` aktif kart token'larını (200'e kadar) dönüyor ama dashboard kullanmıyor (`stats/route.ts:53-58,167-172`). Favori kalbine her basışta tüm 7 uç yeniden çekiliyor (`:408`).
- **Sorun:** Neon üzerinde açık her dashboard sekmesi dakikada onlarca ağır sorgu üretiyor; trend verisi herkes için aynı olduğu hâlde her kullanıcı için yeniden hesaplanıyor. Mobil ağda ilk anlamlı boyama gecikiyor.
- **Öneri:** (a) Trend mekanlar + haftanın enleri + sponsorlular kullanıcıdan bağımsız: Upstash Redis'te 5-10 dk TTL ile önbelleğe alın (projede `perf-backend-optimization` deseni zaten var); kullanıcıya özel `favoriteDealerIds` ayrı ve hafif kalsın. (b) Dashboard için tek bir BFF ucu (`/api/customer/home`) yazın; hero özeti, görev özeti, ödül önizlemesi `take: 3` ve `select` ile dar alanlar döndürsün. (c) `refetchInterval`'i kaldırın; bunun yerine puanı değiştiren mutasyonlardan (çark, QR, ödül) sonra hedefli `invalidateQueries` ve pencere odaklanınca yenileme kullanın. (d) Çark durumu tek yerden gelsin (`SpinWheel` prop'ları ile).

### 8. Sponsorlu fırsatlar ve derin bağlantılar hedefte yok sayılıyor
- **Önem:** orta · **Kategori:** işlevsellik / gelir · **Efor:** S
- **Kanıt:** Sponsorlu kayıt `linkUrl`, `dealerId`, `imageUrl`, `description`, `discountRate` taşıyor (`lib/discovery-config.ts:103-110`); dashboard yalnız `title` gösterip `nearby?promo=<id>`'ye bağlıyor (`:995`). Nearby sayfasında `promo` ve `focus` parametreleri hiç okunmuyor (`app/customer/nearby/page.tsx`, arama sonucu yok). Bağış sayfası `?tab=leaderboard`'u okumuyor (`donations-client.tsx:422`).
- **Sorun:** Admin'in yapılandırdığı reklam/kampanya hedefi hiç çalışmıyor; işletmeye ait sponsorlu yerleşimin ölçülebilir değeri (gösterim/tıklama) yok. "Sayfasına Git", "Ziyaret Et", "Liderlik" butonları kullanıcıyı genel bir sayfaya bırakıyor.
- **Öneri:** Sponsorlu kartı `linkUrl` (dahili ise `Link`, harici ise güvenli `rel`) veya `dealerId` varsa işletme detayına bağlayın; görsel + indirim oranı + açıklama gösterin; "Sponsorlu" etiketi korunsun. Gösterim ve tıklama için `AnalyticsEvent` (`sponsored_impression`, `sponsored_click`) yazın; admin panelinde CTR gösterin. Nearby sayfası `focus` ile ilgili işletmenin kartını açıp haritada ortalasın, bağış sayfası `tab` parametresini `Tabs value`'ya bağlasın.

### 9. Profil arka planı kozmetiği hero'da görünmüyor
- **Önem:** orta · **Kategori:** hata / ekonomi güveni · **Efor:** S
- **Kanıt:** `cn(..., (session?.user as any)?.equippedBackground)` (`:441-444`); değer kozmetiğin `imageUrl`'i (`lib/auth.ts:249`). Admin şemasında `imageUrl` serbest metin (`app/api/admin/cosmetics/route.ts:18`), örnek tohum verisi Unsplash URL'si (`scratch/seed-pulse-items.ts:17,27,37`). Tailwind safelist yalnız z-index sınıflarını içeriyor (`tailwind.config.ts:11`).
- **Sorun:** Kullanıcı mağazada puan harcayıp arka plan kuşanıyor, dashboard'da hiçbir değişiklik görmüyor. Değer URL ise sınıf adı olarak anlamsız; sınıf adıysa DB'den gelen dinamik sınıf JIT tarafından üretilmemiş olabilir (doğrulanmadı: canlı DB'deki gerçek değerler).
- **Öneri:** Kozmetik türlerine yapılandırılmış bir `renderSpec` alanı ekleyin (`{ kind: 'image', url }` veya `{ kind: 'preset', key: 'nebula' }`); hero'da `image` için `next/image` + koyulaştırma katmanı, `preset` için koddaki sabit bir haritadan sınıf seçilsin. Mağaza önizlemesi ve dashboard aynı `CosmeticBackground` bileşenini kullansın.

### 10. Görev verisi üç ayrı kaynaktan geliyor; pasif/süresi geçmiş görevler ve uydurma ödüller
- **Önem:** orta · **Kategori:** veri doğruluğu / bilgi mimarisi · **Efor:** M
- **Kanıt:** Haftalık kart `weekly-card` (Quest tablosu, `getQuestReward(matrix)`), Aktif Görevler ve Gizemli bant `stats.activeQuests` (UserQuest, `completedAt: null`, Quest `isActive`/`expiresAt` filtresi yok, `stats/route.ts:24-28`), ödül yoksa 50 puan varsayımı (`stats/route.ts:104`). Gizemli bantta sabit "2 Saat Kaldı" (`:873`).
- **Sorun:** Aynı görev iki kartta farklı ödülle görünebilir; admin'in kapattığı veya süresi dolmuş görev "aktif" listeleniyor; sahte geri sayım aciliyet manipülasyonu gibi okunuyor.
- **Öneri:** Görevleri tek bir sunucu fonksiyonunda (`getCustomerQuestSummary`) birleştirin: aktif + süresi geçmemiş + kullanıcıya atanmış, gerçek ödül (`getQuestReward`) ve `expiresAt`. Dashboard'da tek bir "Bugünün görevleri" modülü olsun (en fazla 3, gizemli görev öne çıkarılmış), geri sayım `expiresAt`'ten canlı hesaplansın; `expiresAt` yoksa geri sayım gösterilmesin.

### 11. Son Aktivite Logu'ndaki puanlar uyduruluyor
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `points: f.rating >= 4 ? 75 : 50` (`stats/route.ts:113`), UI bunu "+75" rozeti olarak gösteriyor (`:1230-1234`).
- **Sorun:** Gerçek kredilenen puan (puan matrisi, happy hour çarpanı, hile filtresi) farklı olabilir; kullanıcıya yanlış kazanç bilgisi veriliyor. Puan ekonomisi kurallarına göre (`points_credited` görünürlüğü) kaynak doğruluğu esas.
- **Öneri:** Aktivite akışını `AnalyticsEvent`(`points_credited`) veya bir puan defteri tablosundan okuyun: "Kahve Dünyası · QR değerlendirmesi · +80 puan · 2 sa önce" biçiminde, her satır ilgili feedback/tüketim detayına bağlansın. Revolut'un işlem akışı gibi gün başlıklarıyla gruplayın.

### 12. Ödül Vitrini: "Kilitli" buton gerçekte kilitli değil, ikon çözümlenmiyor
- **Önem:** orta · **Kategori:** işlevsellik / sağlamlık · **Efor:** S
- **Kanıt:** `Button asChild disabled` + `Link` (`:1278-1280`) — `disabled` bir `<a>` üzerinde etkisiz. İkon doğrudan `next/image`'a veriliyor (`:1272`); ödüller sayfası ise `resolveRewardDisplayImage` ile emoji/geçersiz değerleri eliyor ve kanonik görsele çeviriyor (`lib/reward-display-image.ts:12-27`, `app/customer/rewards/page.tsx:82,364`). Admin şeması ikon için yalnız `min(1)` istiyor (`lib/validations.ts:184`). Stok (`Reward.stock`) ve `metadata.validUntil` dikkate alınmıyor (`rewards/route.ts:115-130`).
- **Sorun:** Emoji ikonlu bir ödül geliştirmede `next/image` hatasıyla sayfayı düşürür, üretimde kırık görsel gösterir (Next'in dev-only src doğrulaması; üretim davranışı doğrulanmadı). Aynı ödül dashboard'da ve ödüller sayfasında farklı görselle görünür. Stoku bitmiş ödül "Al" diye sunulur.
- **Öneri:** `resolveRewardDisplayImage` kullanın, `null` ise ikon yer tutucusu gösterin. Ödül önizlemesini "hedef ödül" kavramına çevirin: kullanıcının ulaşabileceği en yakın 1-2 ödül + "1.250 / 1.500 puan" ilerleme çubuğu (Starbucks "bir sonraki ödüle kalan yıldız" kalıbı). Kilitli durumda `Link` yerine `aria-disabled` görünümlü ama detay açan bir kart kullanın.

### 13. Favori durumunun yanlış kaynaktan okunması (yarış/koşullu bozulma)
- **Önem:** orta · **Kategori:** hata · **Efor:** S
- **Kanıt:** `isFav = discovery.favoriteDealerIds.includes(dealerId)` (`:372`); Favorilerim şeridi `favorites` state'inden çiziliyor (`:824-857`). Discovery menü/modül geçidiyle 403 dönebilir (`discovery/route.ts:99-111`). Ekleme dalında yeni öğe koşulsuz eklenir (`:399-406`).
- **Sorun:** Discovery başarısızsa şeritteki kalbe basmak favoriyi kaldırmak yerine POST gönderir ve şeride aynı işletmeden ikinci kart (aynı `key`) eklenir. Ayrıca aynı anda iki işletmeye hızla basılırsa ikinci tıklama sessizce yok sayılır (`:371`).
- **Öneri:** Favori kümesini tek bir `useQuery(['customer','favorites'])` kaynağına bağlayın; `useMutation` ile iyimser güncelleme + hata durumunda geri alma; kilit tekil değil işletme bazlı (`Set<string>`) olsun; yalnız `['customer','favorites']` anahtarını geçersiz kılın.

### 14. Bilgi mimarisi: aynı veri üç kez, 13+ bölümlük uzun dikey liste
- **Önem:** orta · **Kategori:** UX / IA · **Efor:** L
- **Kanıt:** Puan: hero çipi (`:505`), puan kartı (`:575`), stat kartı (`:767`). Geri bildirim/rozet: hero çipi + stat kartı. Seri: hero çipi + seri kartı + stat kartı. Görevler: haftalık kart + gizemli bant + aktif görevler. Sayfa sırası: hero → seri → haftalık → sosyal sorumluluk → hoş geldin → stat ızgarası → hızlı eylemler+çark → favoriler → gizemli → trend+enler → sponsorlu → aktif görevler → liderlik → aktivite+ödül.
- **Sorun:** Mobilde kullanıcı en değerli aksiyonlara (çark, görev, ödül hedefi) ulaşmak için 4-5 ekran kaydırıyor; sosyal sorumluluk bandı görevlerin ve ödüllerin üstünde, yeni kullanıcı rehberi ise üç bandın altında. Hiyerarşi "ne yapmalıyım?" sorusuna yanıt vermiyor.
- **Öneri:** Bkz. Yeniden tasarım vizyonu: "Durum → Bugün → Hedef → Keşfet" sırası; stat ızgarası kaldırılır, tekrarlar tek bileşende toplanır, yeni kullanıcı rehberi ilk 0 feedback durumunda hero'nun yerini alır.

### 15. Erişilebilirlik açıkları
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** "Profili düzenle" yalnız hover'da görünür (`:474-481`); favori/kalp ikon butonlarında `aria-label` ve `aria-pressed` yok (`:833-840,935-941`); lig Sheet'inde `text-primary-foreground/80` açık zemin üzerinde (açık temada beyaza yakın metin, `:1311`) ve zirvedeyken bozuk cümle ("…geçmek için zirvedesin gerekiyor", `:1312-1320`); gizemli bantta açık temada `text-foreground/80` mor zemin üzerinde düşük kontrast (`:872-876`); liderlik satırları `whileHover` ile tıklanabilir gibi kayıyor ama etkileşimsiz (`:1142-1149`); konfeti `prefers-reduced-motion`'ı dikkate almıyor (`lib/effects/confetti.ts`); stat kartlarında sonsuz `animate-glow-pulse` (`components/customer/glow-card.tsx:225`, globals.css ile kısılıyor).
- **Öneri:** Profil düzenlemeyi avatarın kendisini `Link` yapıp odak halkasıyla görünür kılarak çözün; tüm ikon butonlarına `aria-label` ("Favorilere ekle: {işletme}") + `aria-pressed`; renk çiftlerini token düzeyinde AA kontrastına göre seçin; sahte hover affordance'ı kaldırın ya da satırı profile bağlayın; konfeti yardımcılarına `disableForReducedMotion: true` ve uygulamanın "animasyonları azalt" ayarını (`html.reduce-animations`) okuyan bir koruma ekleyin.

### 16. Çok dillilik kırık: ~45 sabit Türkçe metin
- **Önem:** orta · **Kategori:** i18n · **Efor:** M
- **Kanıt:** Envanter #65'teki satırlar; ayrıca `SpinWheel` tamamen Türkçe (`spin-wheel.tsx:38-46,178-183,250,259,270,287-289`), selamlama (`types.ts:86-88`), sunucu mesajları (`weekly-card/route.ts:59`, `leaderboard/route.ts:159`). `customerDashboard` ad alanında yalnız 24 anahtar var; `quickProgress` ve `quickGuide` tanımlı ama kullanılmıyor.
- **Öneri:** Tüm dashboard metinlerini `customerDashboard.*` altına taşıyın, sunucu mesajlarını anahtar + değişken olarak döndürün, `getGreeting`'i `Intl` + çeviri ile yazın. CI'da "kullanılan ama tanımsız anahtar" kontrolü ekleyin (levelUpTitle örneği bunu yakalardı).

### 17. Lig kuralları iki kaynaktan geliyor
- **Önem:** orta · **Kategori:** mimari / veri tutarlılığı · **Efor:** S
- **Kanıt:** Dashboard `getLeague*` → `DEFAULT_LEAGUE_RULES` (`lib/utils.ts:142-168`, `:1326`); liderlik API'si `getLeagueRules()` → DB `settings` (`lib/league-rules.ts:35-47`, admin: `app/api/admin/settings/leagues/route.ts`).
- **Sorun:** Admin lig eşiklerini değiştirdiğinde liderlik sayfası yeni ligi, dashboard eski ligi gösterir.
- **Öneri:** Lig kuralları hero özetiyle birlikte sunucudan dönsün (`league: { key, name, min, max, next, progress }`) ve Sheet aynı listeyi kullansın; istemcideki sabit hesaplama yalnız çevrimdışı yedek olarak kalsın.

### 18. Çark: kayıpta kutlama, kapalı özellikte "Yarın gel!", çift durum isteği
- **Önem:** düşük · **Kategori:** UX / mimari · **Efor:** S
- **Kanıt:** `onPrizeWon` her sonuçta `triggerSuccessBurst()` (`:800-803`); `canSpin=false` hem limit dolduğunda hem `enabled=false` olduğunda "Yarın gel!" (`spin-wheel.tsx:255-260`); dashboard `spinStatus.canSpin`'i hiç kullanmıyor (`:290-296`), bileşen aynı GET'i tekrar atıyor (`spin-wheel.tsx:74-118`); istemci yerel gün ile sunucu UTC günü karşılaştırması (`spin-wheel.tsx:65-72` vs `spin/route.ts:13-17`); POST `remainingToday: 0` sabit (`spin/route.ts:147`) — `dailyLimit > 1` yapılandırmasında yanlış.
- **Öneri:** Çark durumunu tek sorgudan prop olarak geçin; `enabled=false` ise kartı gizleyin; "kayıp" sonucunda nazik bir mikro animasyon (konfeti yok); sonraki çevirme zamanını UTC gün sınırından "14 sa 22 dk sonra" olarak gösterin; `remainingToday`'i gerçek hesaplayın.

### 19. Ölü kod, `any` kaçakları ve kopya state
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt:** Gizli "Lig Durumu" kartı (`:1061-1122`); kullanılmayan `userLevelProgress` (`:107,240`) ve `spinStatus.canSpin`; `StatCard(... : any)` (`:66`), `pinnedItems: any[]` (`:126,332`), `(session?.user as any)` (`:443,458,459`), `(dashboardData as any)` (`:330`); `weeklyCardData` için 5 ayrı tip dökümü (`:617,636,640,643,644`); React Query verisinin 10 ayrı `useState`'e kopyalanması (`:98-126,209-359`); `revardsResult` yazım hatası (`:277`); `key={idx}` (`:1143`, `:970`); iç içe ikinci `LazyMotion strict` (global zaten var, `components/providers.tsx:241`); anlamsız `col-span-12` (`:862`).
- **Öneri:** Bölüm bileşenlerine ayırırken (`HeroSummary`, `TodayPanel`, `QuestStrip`, `RewardGoal`, `LeagueSnapshot`, `DiscoverRail`, `ActivityFeed`) her biri kendi tipli `useQuery` seçicisini (`select`) kullansın; `next-auth.d.ts` ile oturum tipini genişletin; ölü kartı silin.

### 20. Overlay yığılması: ilk girişte üç katman aynı anda
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** Layout'ta bağımsız olarak açılan `OnboardingSheet` (`onboarding-sheet.tsx:56-65`), `WelcomeVideoModal` (`welcome-video-modal.tsx:39-60`), `CustomerBirthdayBonusHost` (`customer-birthday-bonus-host.tsx:48-50`), ayrıca sayfadaki seviye/seri konfetileri ve dashboard içi hoş geldin kartı.
- **Öneri:** Layout düzeyinde basit bir "an kuyruğu" (öncelik: doğum günü > karşılama videosu > onboarding > kutlamalar) ile aynı anda tek bir katman gösterin; onboarding anahtarını kullanıcıya özel yapın ve tamamlanma bilgisini sunucuda (`User.onboardingCompletedAt`) tutun.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Bir sonraki ödüle ilerleme (Starbucks Rewards):** "Ücretsiz kahveye 250 puan kaldı" tarzı tek büyük hedef göstergesi ve hedef ödül seçimi. Şu an ödül vitrini yalnız en ucuz üç ödülü listeliyor.
2. **Seri koruma ve haftalık takvim (Duolingo):** Haftanın 7 gününü gösteren seri şeridi, "bugün seriyi korudun / korumak için X yap" durumu, seri dondurma (streak freeze) gibi bir kurtarma mekaniği ve gece hatırlatma push'u.
3. **Lig/hafta rekabeti (Duolingo Leagues):** Haftalık lig grubu, terfi/düşme bölgesi, geri sayım ("Lig 2 gün 4 saat sonra kapanıyor") ve bir üstteki rakiple fark.
4. **Kişisel aktivite akışı ve cüzdan (Revolut/Monzo):** Gerçek puan defteri; kazanılan/harcanan puanların gün başlıklı akışı, filtre ve detaya iniş; "bu ay +1.240 puan" özet kartı.
5. **Kişiselleştirilmiş öneri ve yakınlık:** Konum izni varsa "yakınında açık + happy hour aktif" mekanlar (`liveBoosts` verisi API'de zaten var ama dashboard göstermiyor, `discovery/route.ts:276-418`); "favorilerinde yeni kampanya" bildirimi.
6. **Periyodik özet / paylaşılabilir an (Spotify Wrapped):** Haftalık "bu hafta 3 mekanı değerlendirdin, en sevdiğin kategori kahve" kartı ve `/customer/my-year` ile bağlantılı paylaşım; dashboard'da bu girişin hiç izi yok.

---

## Yeniden tasarım vizyonu

### Hedef deneyim
Açılışta kullanıcı üç saniyede şu üç soruya yanıt almalı: **Neredeyim?** (puan, seviye, lig, seri) · **Bugün ne yapmalıyım?** (çark, 1-3 görev, seriyi koru, QR tara) · **Neye yaklaşıyorum?** (hedef ödül, lig terfisi). Keşif ve sosyal içerik bunların altında, ikincil bir rafta durmalı. His olarak Revolut'un temiz "kart + akış" yapısı, Duolingo'nun tek odaklı "bugünün hedefi" dili ve Starbucks'ın tek büyük ilerleme göstergesi.

### Yerleşim (mobil öncelikli, masaüstünde 12 kolonlu iki sütun)
1. **Durum kartı (hero, tek bileşen `HeroSummary`):** avatar + çerçeve + kuşanılmış arka plan (gerçek render), ad, lig çipi (Sheet açar), solda büyük **puan bakiyesi**, sağda **seviye halkası** (XP ilerlemesi), altında 7 günlük seri şeridi. Ana CTA "QR tara" sabit; mobilde alt navigasyonla çakışmayan, başparmak bölgesinde yüzen buton olarak da düşünülebilir.
2. **Bugün paneli (`TodayPanel`):** yatay kaydırılabilir 3-4 "görev kartı": günlük çark (hak varsa), seriyi koru, gizemli görev (gerçek geri sayım), 1-2 aktif görev. Hepsi tamamlandığında "Bugünlük tamam" durumu ve haftalık zafer.
3. **Hedef kartı (`RewardGoal`):** seçili/önerilen ödüle ilerleme çubuğu + "Ödülleri gör". Yeni kullanıcıda bu kartın yerine 3 adımlı hoş geldin rehberi.
4. **Lig anlık görüntüsü (`LeagueSnapshot`):** "Bu hafta #12 · bir üsttekine 80 puan" + üst 3 avatar; tümü için liderlik sayfası.
5. **Keşfet rafı (`DiscoverRail`):** sponsorlu fırsatlar (görselli, ölçülen), trend mekanlar (konum varsa yakınlık + açık/kapalı), favoriler tek yatay şeritte sekmeli.
6. **Aktivite akışı (`ActivityFeed`):** gerçek puan defterinden son 5 hareket.
7. **Sosyal etki bandı:** yalnız kişisel bağış verisi varsa ("Bu ay 2 fidan") veya aktif bağış kampanyası varsa, akışın sonunda.

### Motion / 3D (yerinde ve ölçülü)
- Kaldırılacaklar: hero'daki 5 sonsuz yüzen küre + 2 bulanık leke + Spotlight üçlüsü (tek, statik bir gradyan yeterli), stat kartlarındaki sonsuz parlama, liderlik satırlarındaki sahte hover kayması.
- Korunacak/eklenecekler: puan değiştiğinde **farktan** sayan sayaç (0'dan değil) ve "+25" uçan rozet; seviye halkasının dolma animasyonu; seri alevinin yalnız o gün ilk kez korunduğunda tek seferlik canlanması; çarkın gerçek sonuç animasyonu. Tüm kutlamalar sunucu tarafı "an" kayıtlarından ve tek bir kuyruktan tetiklensin (dalda tasarlanan An Motoru ile uyumlu).
- 3D: Dashboard'da sürekli çalışan three.js sahnesi önerilmez (pil, mobil GPU). Tek yerinde kullanım: seviye atlama ya da lig terfisi anında açılan tam ekran "an" kartında, mevcut imza sürpriz kutusu/rozet render'ının kısa bir varyantı; `prefers-reduced-motion` ve "animasyonları azalt" ayarında statik görsele düşmeli.

### Veri / API değişiklikleri
- **`GET /api/customer/home`** (BFF): `{ hero: { name, image, points, xp, level, levelProgress, league{...DB kuralları}, streak{count, longest, week[7]} , cosmetics{frame, background(renderSpec)} }, today: { spin{enabled, remaining, nextAt}, quests[≤3 gerçek ödül + expiresAt] }, rewardGoal, leagueSnapshot{period:'weekly', rank, gapToNext, top3}, sections{rewards, discovery, games, donations görünürlüğü} }`. Kullanıcıya özel, `PRIVATE_NO_STORE`, hedef < 150 ms.
- **`GET /api/customer/discover-feed`**: trend + haftanın enleri + sponsorlu, Redis'te 5-10 dk; kullanıcıya özel favori kümesi ayrı ve küçük.
- **Puan defteri okuma ucu**: aktivite akışı için `points_credited`/`points_debited` olaylarından sayfalı okuma.
- Sayfa sunucu bileşeni olarak `getServerSession` + `HydrationBoundary` ile ilk veriyi gömmeli; `refetchInterval` yerine mutasyon sonrası hedefli geçersiz kılma.
- Oturumdaki `level/points` alanlarına UI kararlarında güvenilmemeli; JWT yalnız kimlik taşısın.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/progress-hub`, `/customer/journey-score`, `/customer/quests`:** Dashboard'daki "Aktif Görevler", "Haftalık görev kartı" ve "Gizemli bant" bu sayfaların özetini üç farklı veri kaynağından tekrar ediyor. Öneri: dashboard yalnız `TodayPanel` özeti göstersin; görev ayrıntısı tek kaynak olarak `/customer/quests`'te kalsın; `progress-hub` ile `journey-score` ayrı bir denetimde birleştirme adayı olarak ele alınmalı (çevirilerde `quickProgress` ve `quickGuide` anahtarlarının kullanılmadan kalması, bu girişlerin dashboard'dan daha önce çıkarıldığını gösteriyor).
- **`/customer/leaderboard` ve `/customer/donations` (liderlik sekmesi):** Dashboard'daki liderlik kartı farklı bir metrikle mini bir kopya; "Lig anlık görüntüsü" olarak sadeleştirilip tam sayfaya yönlendirmeli.
- **`/customer/nearby` ve `/customer/discover`:** Trend mekanlar + sponsorlu + favoriler dashboard'da üçüncü bir keşif yüzeyi oluşturuyor. Tek bir `DiscoverRail` bileşeni hem dashboard'da (özet) hem `nearby`'de (tam) paylaşılmalı; `focus`/`promo` derin bağlantıları `nearby` tarafından desteklenmeli.
- **`/customer/favorites`:** Dashboard'daki "Favorilerim" şeridi bu sayfanın kopyası; aynı `useQuery` anahtarını ve kart bileşenini paylaşmalı.
- **`/customer/rewards` ve `/customer/shop`:** Ödül görseli çözümleme mantığı (`resolveRewardDisplayImage`) ve kozmetik arka plan render'ı paylaşılan bileşenlere taşınmalı.
- **Kaldırma önerisi yok:** `/customer` sistemin merkez sayfası olarak kalmalı; ancak yukarıdaki sadeleştirmeyle "her şeyin kısa kopyası" olmaktan çıkıp "bugün + ilerleme" ekranına dönüşmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak çağıran/çağrılan kod baştan okundu (`lib/auth.ts`, `app/api/customer/stats`, `app/api/leaderboard`, `app/api/customer/discovery`, `app/api/customer/favorites`, `app/api/feedbacks`, `lib/points-rules.ts`, `lib/app-locale.ts`, `i18n/request.ts`, Prisma şeması). Kod çalıştırılmadı, DB'ye dokunulmadı. Beş iddianın beşi de doğrulandı. Hiçbiri güvenlik açığı değil; hepsi veri doğruluğu ya da UX hatası. 1. ve 5. iddia "yüksek", 2-4 ise "orta" önemde (kullanıcıya yanlış sayı gösteriyorlar ama veriyi bozmuyorlar).

### 1. Seviye atlama kutlaması her ziyarette tekrar ediyor: **DOĞRULANDI**
- `token.level` yalnızca giriş anında (`if (user)`) DB'den doluyor (`lib/auth.ts:212-243`). Sonrasında değişmesinin tek yolu `trigger === 'update' && session.level` (`lib/auth.ts:276`), ama repoda `update({ level })` çağrısı yok. Mevcut `update(...)` çağrıları yalnızca name/image/points/preferredLanguage/equippedFrame/customFrameColor gönderiyor (`app/customer/donations/donations-client.tsx:236`, `app/customer/rewards/page.tsx:229`, `components/customer/shop-interactive.tsx:72`, `components/customer/showcase-selector.tsx:137` vb.).
- DB'deki seviye ise oturum açıkken artıyor (`lib/points-wallet.ts:54-55`).
- Etki `components/customer/dashboard/customer-dashboard.tsx:362-367`. `stats` her mount'ta `level: 1` ile başlıyor (`:98-102`), ardından API'den gelen değerle güncelleniyor (`:234`). Bu yüzden React Query önbelleği dolu olsa bile her mount'ta `stats.level` değişiyor ve effect yeniden çalışıyor. "Bir kez göster" bayrağı ya da `sessionStorage` koruması yok.
- `customerDashboard.levelUpTitle` anahtarı `messages/tr.json` ve `messages/en.json` içinde yok (yalnızca başka bir ad alanında `levelUpRewardBase` var). `t()` bulamadığı anahtarı olduğu gibi döndürüyor (`i18n/request.ts:35-36`), yani toast ham anahtar metnini gösteriyor.
- **Yeniden üretim:** Seviye 2'deki kullanıcı giriş yapar, ardından 1000 XP sınırını geçecek bir geri bildirim gönderir (DB seviyesi 3 olur) ve `/customer`'a döner. Konfeti patlar ve "customerDashboard.levelUpTitle 3! 🎉" toast'u görünür. Başka sayfaya gidip geri döndüğünde aynısı yine olur, bu çıkış yapana kadar sürer.

### 2. Liderlik kartında karışık metrik ve yanlış sıra: **DOĞRULANDI** (önemi orta, güvenlik değil)
- Dashboard `/api/leaderboard?limit=5` çağırıyor (`customer-dashboard.tsx:170`). `period` parametresi verilmediği için varsayılan `weekly` (`app/api/leaderboard/route.ts:81`).
- Haftalık puan, gerçek kredilenen puan değil. Yalnızca `Feedback` metin uzunluğuna göre sentetik bir 50/100 toplamı (`route.ts:299-307`). `ConsumptionReview` (asıl kazanım yolu) bu hesaba hiç girmiyor.
- O hafta hiç feedback yoksa API sessizce tüm zamanlar listesine düşüyor (`route.ts:233-276`). Yanıttaki `periodLabel` yine "Bu Hafta" diyor ve dashboard bu etiketi zaten göstermiyor.
- Kullanıcı ilk 5'te değilse sırası tüm zamanlar puanıyla hesaplanıyor (`route.ts:375-381`). Dashboard bu satırı `name: 'Siz'` ve JWT'deki (bayat) `user.points` ile ekliyor (`customer-dashboard.tsx:262-271`), render sırasında da `(Sen)` ekleniyor (`:1173`). Sonuç ekranda "Siz (Sen)" olarak görünüyor. Birim etiketi ise "XP" (`:1179`), oysa gösterilen değer puan.
- **Yeniden üretim:** 4.000 puanlı bir müşteri bu hafta yalnızca tüketim değerlendirmesi yapmış olsun (QR feedback yok). Kartta ilk 5 kişi 100-300 "XP" ile listelenir. En altta "#37 Siz (Sen) · 4.000 XP" satırı çıkar: listedekilerden çok daha yüksek bir sayı, ama daha kötü bir sıra.

### 3. Seri istatistiği sabit 0: **DOĞRULANDI**
- `app/api/customer/stats/route.ts:157` → `streak: 0` sabit yazılmış. `User.loginStreakCount` şemada mevcut (`prisma/schema.prisma:58`) ama sorgunun `select` alanında yok (`route.ts:20`).
- Bu yüzden hero'daki seri çipi `stats.streak > 0` koşulu yüzünden hiç görünmüyor (`customer-dashboard.tsx:515-520`) ve "Aktif seri" kartı her zaman 0 gösteriyor (`:780-785`). Aynı sayfadaki `LoginStreakCard` (`:613`) `/api/customer/streak` üzerinden gerçek seriyi gösteriyor (`components/customer/login-streak-card.tsx:43`).
- **Yeniden üretim:** 5 gündür ardışık giriş yapan kullanıcı aynı ekranda "5 gün" (LoginStreakCard) ve "Aktif seri: 0" (StatCard) görür.

### 4. Aktivite logundaki puan uydurma: **DOĞRULANDI**
- `stats/route.ts:113` → `points: f.rating >= 4 ? 75 : 50`. Gerçek ödül ise yıldıza göre değil metin uzunluğuna göre belirleniyor (`lib/points-rules.ts:268-271`, `getFeedbackReward`). Üstüne VIP, sezonluk ve global çarpanlar ile günlük/haftalık tavan uygulanıyor (`app/api/feedbacks/route.ts:284-317`), sonuç da `points_credited` olayına yazılıyor (`:333-336`).
- UI bu sabit değeri "+N" rozeti olarak gösteriyor (`customer-dashboard.tsx:1230-1234`).
- **Yeniden üretim:** Günlük tavanı dolmuş bir kullanıcı 5 yıldızlı kısa bir yorum gönderir. Bildirim gelmez, çünkü gerçekte 0 puan kredilenmiştir. Dashboard ise "+75" gösterir. Puan ekonomisindeki "kaynak doğruluğu" ilkesine aykırı (gösterilen sayı defterle uyuşmuyor).

### 5. Favoriden çıkarma, discovery başarısızken kopya ekliyor: **DOĞRULANDI**
- `isFav` yalnızca `discovery.favoriteDealerIds` üzerinden hesaplanıyor (`customer-dashboard.tsx:372`). `discovery` state'i yalnızca `discoveryRes.ok && success` olduğunda doluyor (`:308-315`), aksi halde `[]` kalıyor.
- `/api/customer/discovery`, "nearby" menüsü gizlendiğinde ya da "discovery" modülü kapatıldığında 403 dönüyor (`app/api/customer/discovery/route.ts:99-111`). `/api/customer/favorites` ise bu geçide bağlı değil (`favorites/route.ts:14-20`), bu yüzden "Favorilerim" şeridi yine de render ediliyor (`customer-dashboard.tsx:824-834`).
- Kalbe basılınca `POST` gidiyor. Upsert idempotent olduğu için DB'de kopya oluşmuyor (`favorites/route.ts:98-104`, `@@unique([userId, dealerId])`). Ancak istemci listeye koşulsuz yeni bir eleman ekliyor (`customer-dashboard.tsx:399-406`). Aynı `key={fav.dealerId}` ile ikinci bir kart çıkıyor (`:832`) ve React "duplicate key" uyarısı veriyor. Ad da `trendingVenues` boş olduğu için "İşletme" olarak düşüyor. Kullanıcı favoriyi hiçbir zaman kaldıramıyor.
- **Yeniden üretim:** Admin müşteri menüsünden "Yakınımdaki" öğesini gizler. Favorisi olan müşteri `/customer`'da favori kartının kalbine basar. Kart kaybolmak yerine ikinci bir kopya belirir, DB'de favori yerinde kalır.
- **Öneri:** Favori kümesinin tek kaynağı `/api/customer/favorites` olsun (`dealerIds` alanı zaten dönüyor). Toggle, `useMutation` ile iyimser güncelleme yapsın, hata olursa geri alsın; durum discovery'den türetilmesin.


---

## Uygulama (Dalga 2)

**Yüzey:** `m-ana-sayfa` · **Hedef rota:** `/customer` (Ana Sayfa, §4.3) · **Emekli:** `/customer/discover` → `/customer` (308, sorgu korunur).

**Yeni mimari (§4.4 ilke 11):** `app/customer/page.tsx` artık bir sunucu bileşeni. Kimlik ve rol DB'den doğrulanıyor (`requireAuth(['CUSTOMER'])`). Veri `lib/customer-home/load.ts`'ten tek turda okunuyor ve `HydrationBoundary` ile React Query'ye gömülüyor. Açılışta istemci veri isteği yok. Tek yan etki `POST /api/customer/streak` (seri dokunuşu, günde bir kez). Tazeleme tek BFF'ten yapılıyor: `GET /api/customer/home` (`defineRoute`, yalnız CUSTOMER, okuma rate limiti, zarf v2).

İstemci adası `components/customer/m-ana-sayfa/**` altında. `HomeScreen` (QueryState) şu bölümleri çiziyor: `StatusHero`, `DailyGoals`, `PendingActions`, `StreakCard`, `SpinCard` + lazy `SpinDialog`, `SurpriseBoxCard`, `LeagueStrip`, `FirstSteps`. Metinler `copy.ts`'te (TR/EN, `useDsLocale`). Saf hesaplar `lib/customer-home/core.ts`'te: İstanbul günü/haftası, seviye eğrisi, seri şeridi, ödül hedefi, lig, hedefler, bekleyenler. Çark mantığı `lib/customer-home/spin.ts`'te: `mintPoints`, İstanbul günü, hak başına tek-kez anahtarı.

Silinenler: 1.364 satırlık `customer-dashboard.tsx` ve iskeleti, `app/customer/types.ts`, `components/gamification/spin-wheel.tsx` ve yalnız bunların kullandığı `/api/customer/weekly-card`.

**Doğrulama:**
- Görsel: headless Chrome tezgâhı (Tailwind derlemesi + rollup + playwright) ile ekran görüntüsü alındı. Kapsanan durumlar: 390 px açık ve koyu tema, 1280 px masaüstü, yeni müşteri, hata, seri kaydediliyor, çark (normal ve azaltılmış hareket). Yatay taşma yok; dokunma hedefleri ≥ 44 px. İlk turda lig basamakları ızgarayı 710 px'e itiyordu, `min-w-0` ile düzeltildi.
- Testler: `__tests__/lib/customer-home-core.test.ts` (40), `__tests__/api/customer-home.test.ts` (7), `__tests__/api/gamification-spin.test.ts` (8), `__tests__/lib/login-streak-core.test.ts` (13). 68/68 geçti.
- `tsc` ve eslint: kendi dosyalarımda 0 hata.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Rol koruması | ÇALIŞIYOR | proxy + sayfada `requireAuth(['CUSTOMER'])` (DB) + BFF `defineRoute` |
| 2 | Sayfa metadata | ÇALIŞIYOR | değişmedi |
| 3 | Kenar çubuğu | ÇALIŞIYOR | kabuk (navigasyon ajanı) |
| 4 | Üst başlık + global arama | ÇALIŞIYOR | kabuk (⌘K) |
| 5 | İçeriğe atla | ÇALIŞIYOR | layout |
| 6 | Rota yükleme iskeleti | ÇALIŞIYOR | segment `loading.tsx` |
| 7 | Hata sınırı | ÇALIŞIYOR | Render hataları `error.tsx`'te. API hataları artık `QueryState` ile görünür. |
| 8 | Onboarding Sheet | KISMİ (sahiplik dışı) | Layout'taki ilk açılış kuyruğu F3.1(a) `useFirstRunQueue` işi. |
| 9 | Karşılama videosu | KISMİ (sahiplik dışı) | Gerekçe #8 ile aynı. |
| 10 | Doğum günü diyaloğu | ÇALIŞIYOR | layout |
| 11 | Web Vitals | ÇALIŞIYOR | layout |
| 12 | İstemci iskeleti | ÇALIŞIYOR | SSR verisi gömülü. İskelet yalnız SSR başarısız olunca görünür ve statiktir. Sahte ad, puan ya da "hoş geldin" içeriği hiç çizilmez. |
| 13 | Spotlight + FloatingOrbs + bulanık lekeler | KALDIRILDI | 5 sonsuz blur animasyonunun yerine tek statik marka gradyanı (§4.2 kural 4). |
| 14 | Profil arka planı kozmetiği | ÇALIŞIYOR | Kuşanılmış arka plan DB'den okunur; güvenli bir https görsel URL'siyse gerçekten çizilir. Önayar/sınıf adı değerlerinin render tanımı yok → ŞEMA İSTEĞİ (`renderSpec`). |
| 15 | Avatar + çerçeve | ÇALIŞIYOR | Çerçeve ve renk DB'den gelir (JWT'den değil). URL tabanlı çerçeve desteği paylaşılan `components/ui/avatar-frame`'in işi. |
| 16 | Seviye rozeti | ÇALIŞIYOR | `XpRing` (seviye + ilerleme) |
| 17 | Profili düzenle | ÇALIŞIYOR | Avatarın kendisi `aria-label`'lı ve odak halkalı bir bağlantı; hover'a bağlı değil. |
| 18 | Lig çipi → detay | ÇALIŞIYOR | Çip lig şeridine gider. Şerit DB lig kurallarını kullanır; sabit `DEFAULT_LEAGUE_RULES` yok. |
| 19 | Selamlama | ÇALIŞIYOR | Sunucuda İstanbul saatiyle hesaplanır, TR/EN. Hidrasyon uyuşmazlığı yok. |
| 20 | Puan çipi ("XP" etiketi) | ÇALIŞIYOR | Puan (bakiye) ve XP (seviye) ayrı gösterilir. |
| 21 | Geri bildirim sayısı çipi | KALDIRILDI | Üçlü tekrar; Ben → Seslerim'in işi. |
| 22 | Rozet sayısı çipi | KALDIRILDI | Ben → Rozetler'in işi. |
| 23 | Gün serisi çipi (SAHTE) | ÇALIŞIYOR | `StreakCard` gerçek `User.loginStreak*` alanlarını gösterir. `/api/customer/stats` de artık gerçek seriyi döner. |
| 24 | Vitrin (sabitlenenler) | KALDIRILDI | Profil/rozet yüzeyinin içeriği; ana sayfa "bugün" ekranıdır. |
| 25 | "İlk rozet" ipucu + ilk görev | ÇALIŞIYOR | `FirstSteps` yalnız DB'de hiç değerlendirmesi olmayan müşteriye görünür, yükleme sırasında asla. |
| 26 | Puan sayacı | ÇALIŞIYOR | Önceki değerden sayar (0'dan değil). An Motoru puan kapsülünün hedefidir (`data-moment-anchor`) ve varışta nabız atar. |
| 27 | Sonraki lig ilerlemesi | ÇALIŞIYOR | DB kuralları; son lig açık uçlu. |
| 28 | QR tara CTA | ÇALIŞIYOR | Hero'da birincil eylem. |
| 29 | Günlük giriş serisi | ÇALIŞIYOR | GET yan etkisiz; dokunuş `POST` ile. Gün sınırı İstanbul. Kilometre taşı `mintPoints` + ömür boyu tek-kez anahtarıyla ödenir. |
| 30 | Seri kutlaması | ÇALIŞIYOR | An Motoru puan kapsülü; konfeti yok. |
| 31 | Haftalık görev kartı | KALDIRILDI | Uç silindi; yerine "günlük 3 hedef" geldi. Görev ayrıntısı Oyna → Görevler'de. |
| 32 | Haftalık zafer bandı | KALDIRILDI | Yerine "Bugünlük tamam" durumu. |
| 33 | Sosyal sorumluluk bandı | KALDIRILDI | Statik içerikti; Cüzdan → Bağış'ın işi. |
| 34 | Bağış liderliği bağlantısı (BOZUK) | KALDIRILDI | Ana sayfada ölü `?tab=` derin linki kalmadı. |
| 35 | Yeni müşteri rehberi | ÇALIŞIYOR | `FirstSteps` (#25 ile birleşti). |
| 36 | Stat kartı: Geri bildirim | KALDIRILDI | tekrar |
| 37 | Stat kartı: Toplam puan | KALDIRILDI | Tekrardı; bakiye artık tek yerde. |
| 38 | Stat kartı: Rozetler | KALDIRILDI | tekrar |
| 39 | Stat kartı: Aktif seri (SAHTE) | KALDIRILDI | Gerçek seri `StreakCard`'da. |
| 40 | Kompakt şans çarkı | ÇALIŞIYOR | Sunucu otoriter. Kapalıysa hiç çizilmez. Durum BFF'ten gelir (ikinci GET yok). Gün sınırı İstanbul; kalan hak gerçek. |
| 41 | Çark sonuç diyaloğu | ÇALIŞIYOR | Lazy chunk; çark sunucunun seçtiği dilime döner. |
| 42 | Çark sonrası güncelleme | ÇALIŞIYOR | Kayıpta kutlama yok. XP de gösterilir. Gösterilen miktar gerçekten kredilenen tutardır (tavan/gölge ban sonrası). |
| 43 | Hızlı eylemler | KALDIRILDI | Mobil alt sekme (TARA/Oyna/Cüzdan) + ⌘K. |
| 44 | Modül/menü görünürlüğüne uyum (EKSİK) | ÇALIŞIYOR | `sections` = modül kontrolleri + sunucu kabuk yapılandırması. Kapalı bölüm hiç çizilmez ve sorgulanmaz. |
| 45 | Favorilerim şeridi | KALDIRILDI | Keşfet → Kaydettiklerim. |
| 46 | Favoriden çıkarma (BOZUK) | KALDIRILDI | Hata sınıfı ana sayfadan çıktı. |
| 47 | "Sayfasına Git"/`?focus=` (BOZUK) | KALDIRILDI | Ana sayfada ölü derin link yok. |
| 48 | Gizemli görev bandı | KALDIRILDI | Süresi geçmiş/pasif görev sızıntısı yok. |
| 49 | "2 Saat Kaldı" (SAHTE) | KALDIRILDI | Yerine gerçek sayaçlar: çark ve kutu için İstanbul gece yarısına `CountdownChip`. |
| 50 | Trend Mekanlar | KALDIRILDI | Keşfet (§4.3) |
| 51 | "Yakında" etiketi (SAHTE) | KALDIRILDI | |
| 52 | Trend favori kalbi | KALDIRILDI | |
| 53 | "Tümünü gör" | KALDIRILDI | |
| 54 | Haftanın Enleri | KALDIRILDI | Keşfet → En iyiler |
| 55 | Sponsorlu fırsatlar (BOZUK) | KALDIRILDI | Keşfet → Fırsatlar'ın işi. |
| 56 | Aktif Görevler (uydurma 50 puan) | KALDIRILDI | Günlük hedefler ödül vaat etmez. |
| 57 | Gizli "Lig Durumu" kartı (ölü kod) | KALDIRILDI | |
| 58 | Liderlik tablosu (BOZUK) | KALDIRILDI | Yerine Lig şeridi: ligdeki sıra, lig büyüklüğü ve bir üst sıraya fark, hepsi aynı metrikle. Başka kullanıcının adı sızmaz. |
| 59 | Son Aktivite (uydurma puan) | KALDIRILDI | Cüzdan → Hareketler (defter). `stats` API'sindeki uydurma `points` da kaldırıldı. Ana sayfada yerine "Bu hafta +X puan" var (`points_credited` toplamı). |
| 60 | Ödül vitrini | ÇALIŞIYOR | "Sonraki ödüle X puan" (`RewardProgress`) + "N ödülü şimdi alabilirsin". Stok ve geçerlilik penceresine uyar; görsel `resolveRewardDisplayImage`'dan. Sahte "Kilitli" bağlantı yok. |
| 61 | Seviye atlama kutlaması (BOZUK) | KALDIRILDI | An Motoru (`CustomerMoment` + görüldü bayrağı) üstlendi; çark sonrası `moments.refresh()` çağrılır. |
| 62 | API hata durumu (EKSİK) | ÇALIŞIYOR | `QueryState`: yükleniyor / hata + tekrar dene / yetkisiz. 503 `retryable` döner. |
| 63 | 60 sn otomatik yenileme | KALDIRILDI | Yerine mutasyon sonrası hedefli tazeleme + sekmeye dönüşte tazeleme. |
| 64 | Seviye ilerlemesi (EKSİK) | ÇALIŞIYOR | `XpRing` + "850 / 3.375 XP". Kredi yolundaki `calculateLevel` eğrisi kullanılır; eski `level*1000` hatası yok. |
| 65 | Çok dillilik | ÇALIŞIYOR | Tüm metinler `copy.ts`'te TR/EN. Sunucu mesajı ham gösterilmez; çark ödül adları admin girdisidir. |
| 66 | Azaltılmış hareket | ÇALIŞIYOR | `useMotionPolicy`. Konfeti yok, çark anında sonuca geçer, giriş stagger'ı kapanır. |
| 67 | Manuel yenileme (EKSİK) | KISMİ | Sekmeye dönüşte tazeleme ve hata durumunda "Tekrar dene" var. Çek-bırak yenile uygulanmadı; kaydırma kabı `main` kabuğa ait. |

### Kapanan bulgular (17 tam + 1 kısmi / 20)

| Bulgu | Konu | Nasıl kapandı |
|---|---|---|
| 1 | Seri sabit 0 | Gerçek `loginStreak*` alanları; `stats` API'si de düzeltildi |
| 2 | Karışık metrikli liderlik, "Siz (Sen)" | Lig şeridi tek metrikle |
| 3 | Oturum flaşı, hidrasyon | SSR + HydrationBoundary; sunucuda selamlama |
| 4 | Puan/XP karmaşası | İkisi ayrı gösteriliyor |
| 5 | Her ziyarette seviye konfetisi, ham anahtar | An Motoru üstlendi |
| 6 | Hata = boş; kapalı modül kartları | `QueryState`; kapalı bölüm çizilmiyor |
| 7 | 11 istek, 60 sn yoklama, önbelleksiz discovery | Açılışta veri isteği 0, tek BFF, discovery çağrılmıyor |
| 10 | Üç görev kaynağı, uydurma ödül, sahte geri sayım | Günlük 3 hedef; gerçek sayaçlar |
| 11 | Uydurma aktivite puanı | Ana sayfadan ve `stats` API'sinden kaldırıldı |
| 12 | Sahte kilitli buton, ikon çözümleme, stok | `RewardProgress` + stok/geçerlilik filtresi |
| 13 | Favori çift kart | Şerit ana sayfadan kaldırıldı |
| 14 | Tekrarlar, 13+ bölüm | Sıra: Durum → Bugün → Bekleyenler → Lig |
| 15 | Erişilebilirlik | Profil bağlantısı, ikon etiketleri, kontrast token'ları, sahte hover ve konfeti giderildi |
| 16 | i18n | `copy.ts` TR/EN |
| 17 | İki lig kaynağı | Tek kaynak DB kuralları |
| 18 | Çark sorunları | Kayıpta kutlama yok; kapalıyken gizli; çift GET yok; İstanbul günü; gerçek kalan hak |
| 19 | Ölü kod, `any`, kopya state | Dosya baştan yazıldı |
| 8 (kısmi) | Sponsorlu/`focus`/`tab` derin linkleri | Ana sayfadan kaldırıldı; hedef sayfalardaki parametreler "Kalanlar"da |

Ek sağlamlaştırma: çark ve seri ödülleri artık `mintPoints` üzerinden geçiyor (defter + `points_credited` + tek-kez anahtarı + gölge ban kapısı). Gün sınırları Europe/Istanbul.

### Kalanlar

- **Bulgu 9 (kısmi):** https görsel arka planı çiziliyor. Önayar türündeki kozmetik için `renderSpec` gerekiyor → ŞEMA İSTEĞİ: `CosmeticItem.renderSpec Json?` (`{ kind: 'image', url } | { kind: 'preset', key }`).
- **Bulgu 20 / #8, #9:** ilk açılış katman kuyruğu (onboarding · karşılama videosu · doğum günü) layout'ta. Bu F3.1(a) kabuk işi; bu yüzey dokunmadı.
- **Bulgu 8 (hedef taraf):** `nearby` sayfasının `focus`/`promo` parametreleri, bağış sayfasının `tab` parametresi ve sponsorlu kart ölçümü Keşfet/Cüzdan yüzeylerinin işi.
- **Eksik özellikler:**
  1. Sonraki ödüle ilerleme: yapıldı.
  2. Haftalık seri takvimi: yapıldı. Seri dondurma ve gece hatırlatma push'u şema ve push altyapısı istediği için yapılmadı.
  3. Lig rekabeti: ligdeki sıra ve bir üst sıraya fark yapıldı. Haftalık lig grubu, terfi/düşme bölgesi ve geri sayım F4.4 sezon XP'sine bağlı.
  4. Aktivite akışı: Cüzdan → Hareketler'in işi. Ana sayfada "bu hafta +X puan" özeti var.
  5. Yakınlık önerisi: Keşfet'in işi.
  6. Paylaşılabilir dönem özeti: Ben → Yılım'ın işi.
- `/api/customer/stats` içindeki `levelProgress` hâlâ eski `level*1000` formülünü kullanıyor. Tüketicisi `progress-hub`; Ben → İlerleme yüzeyinin işi.
