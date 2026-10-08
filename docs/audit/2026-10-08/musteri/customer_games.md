# /customer/games

**Amaç:** Müşterinin "Oyun Merkezi" lobisi. Pacman + registry'deki 20 mini oyunu (toplam 21 kart) listeler; bugün hangi oyunların bittiğini, oyun-serisini (streak) ve mini oyun başarımlarını gösterir. Oyunların kendisi `/customer/games/<gameType>` alt sayfalarında oynanır.

**Genel puan:** 5.5 / 10 · **Karar:** yeniden tasarla (veri katmanı ve sunucu ödül doğrulaması sağlam; ancak lobinin bilgi mimarisi, durum doğruluğu ve oyunlaştırma çerçevesi Duolingo/Starbucks seviyesinin çok altında)

Dosyalar: `app/customer/games/page.tsx`, `components/customer/games/games-hub.tsx`, `components/customer/games/achievements-panel.tsx`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/game-achievements.ts`, `lib/game-achievement-stats.ts`, `app/api/customer/games/{status,streak,achievements}/route.ts`, (bağlam) `app/api/customer/games/[game]/{start,complete}/route.ts`, `app/api/customer/games/pacman/{start,complete}/route.ts`, `prisma/schema.prisma:493-541,1066-1074`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Liste, admin override, "bitti" rozeti ve başarımlar çalışıyor; fakat kaybedilen oyunlar "oynanmamış" görünüyor ve tekrar oynatınca 409 ile bitiyor, skor başarımları birim karmaşası yüzünden anlamsız. |
| UX | 5/10 | 21 kartlık düz ızgara, ödül/eşik bilgisi yok, turnuva ve bekleyen ödüller lobide görünmüyor, "21/21 bitir" hedefi gerçekçi değil, sıfırlama saati belirsiz (UTC). |
| Görsel | 6/10 | Koyu neon kartlar kendi içinde çekici; ama shadcn token'larından kopuk sabit renkler light temada "Yakında" kartı ve yükleniyor kutusunu neredeyse görünmez yapıyor. |
| Mimari | 6/10 | Registry + DB override + generic API iyi tasarlanmış; ancak üç ayrı client fetch, sunucuda zaten oturum varken RSC kullanılmıyor, başarımlar her seferinde tüm geçmiş satırlardan hesaplanıyor. |
| Performans | 6/10 | Sorgular indeksli ve küçük; ancak hidrasyondan sonra şelale (3 istek), streak banner'ı ve başarım paneli geç gelip yerleşim kaydırıyor (CLS), başarım istatistiği sınırsız `findMany`. |
| Erişilebilirlik + Mobil | 4/10 | Mobilde h1 hiç yok (başlık `hidden sm:flex`), ilerleme çubuklarında `role="progressbar"` yok, emojiler ekran okuyucuya okunuyor, 9–10px metinler, nadirlik etiketi İngilizce. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı rol kapısı (yalnız CUSTOMER) | ÇALIŞIYOR | `app/customer/games/page.tsx:10-13` | Giriş yapmış DEALER/ADMIN kendi paneline değil `/auth/signin`'e atılıyor (küçük UX kusuru). |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7` + `app/customer/layout.tsx:18-21` | `'Oyun Merkezi \| QRateX'` + layout template `%s \| <panel>` → çift sonekli sekme başlığı. |
| 3 | Sayfa başlığı + kural açıklaması (`DashboardPageHeading`) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` → mobilde başlık ve "her oyundan 1 hak" açıklaması hiç görünmüyor; layout `DashboardHeader`'a title geçmiyor (`layout.tsx:39`) → mobilde sayfada h1 yok. |
| 4 | Paralel durum + seri çekimi | ÇALIŞIYOR | `games-hub.tsx:44-74` | `alive` bayrağı ile unmount koruması var. |
| 5 | Hata durumu (API başarısız / 503) | EKSİK | `games-hub.tsx:48-49`, `lib/api-http.ts:18-27` | Hata `null`'a yutuluyor; 503'te `playedToday` gelmez, `loaded=true` olur → kullanıcı "0/21" ve tüm kartlarda "Oyna" görür, hiçbir uyarı yok. |
| 6 | Günlük seri (streak) banner'ı | KISMİ | `games-hub.tsx:101-143`, `streak/route.ts:69-84` | API `nextMilestone`/`nextRewardIn`/`milestoneStep` döndürüyor ama hub kullanmıyor; "Her gün +XP bonus" metni Pacman için yanlış (Pacman complete'te seri bonusu yok: `pacman/complete/route.ts:69-90`). |
| 7 | Seri alev animasyonu (sonsuz döngü) | KISMİ | `games-hub.tsx:117-124`, `components/providers.tsx:232` | OS `prefers-reduced-motion` `MotionConfig reducedMotion="user"` ile saygı görüyor; uygulama içi "Animasyonları azalt" (`html.reduce-animations`, `globals.css:825-831`) yalnızca CSS animasyonlarını keser, framer JS animasyonunu durdurduğu doğrulanmadı. |
| 8 | "Bugünkü ilerlemen" şeridi (x/21) | KISMİ | `games-hub.tsx:97-99,146-176`, `status/route.ts:31-34` | Yalnız `status:'completed'` (=kazanılan) sayılır; kaybedilen (`failed`) oyun hakkı yemesine rağmen ilerlemeye girmez → kaybeden kullanıcı asla %100'e ulaşamaz. |
| 9 | İlerleme çubuğu animasyonu | ÇALIŞIYOR | `games-hub.tsx:162-168` | `role="progressbar"`/`aria-valuenow` yok. |
| 10 | "Hepsini bitirdin" kutlama metni | ÇALIŞIYOR | `games-hub.tsx:171-173` | Konfeti/mikro-kutlama yok; ulaşılması gerçekçi olmayan hedef (21 oyun/gün). |
| 11 | Oyun kartı ızgarası (registry varsayılanı → sunucu listesi) | ÇALIŞIYOR | `games-hub.tsx:76-95` | Flicker önleme için registry ile ilk boyama — doğru yaklaşım. |
| 12 | Admin'in pasifleştirdiği oyunları gizleme | ÇALIŞIYOR | `status/route.ts:39-47`, `[game]/start/route.ts:33-38` | Doğrudan URL'de start 403 döner. |
| 13 | Admin görsel override (başlık/açıklama/emoji/renk) | KISMİ | `lib/minigame-config-effective.ts:39-58`, `app/api/admin/games/route.ts:130-142` | `accent` hex olarak doğrulanmıyor; hub `${accent}66` gibi alfa eki yapıyor (`games-hub.tsx:186-193`) → "red"/"rgb()" girilirse kenarlık/gölge sessizce bozulur; `backgroundImage` içine serbest metin enjekte edilebilir (yalnız admin). |
| 14 | Pacman sabit kartı | ÇALIŞIYOR | `games-hub.tsx:25-32` | Registry dışı → admin panelinden kapatılamaz/yeniden adlandırılamaz; tutarsız. |
| 15 | "Bitti" rozeti | KISMİ | `games-hub.tsx:198-205` | Kaybedilen oyunlarda rozet yok (bkz. #8, #16). |
| 16 | Kart CTA "Oyna" / "Tekrar gör" | BOZUK | `[game]/start/route.ts:56-75`, `[game]/complete/route.ts:89-95,108-121,169-174` | Kaybedilen oyun için kart "Oyna" der; start `failed` oturumu "yarım kalan" sayıp `canPlay:true` döndürür; oyuncu tüm oyunu oynar, complete `status:'active'` guard'ına takılıp **409 "Oyun zaten tamamlandı"** döner. Pacman'de aynı (`pacman/start/route.ts:35-52`). |
| 17 | Kart giriş stagger + hover motion | ÇALIŞIYOR | `games-hub.tsx:181-184,211-217` | Ölçülü; 0.5 sn üst sınırlı gecikme. |
| 18 | Kartta ödül bilgisi (puan/XP/eşik/süre) | EKSİK | `status/route.ts:41-47` | Sunucu bu alanları biliyor ama hub'a göndermiyor; kullanıcı neyin ne kazandırdığını görmeden seçiyor. |
| 19 | "Daha fazla oyun yolda… Her hafta yeni mini oyunlar" kartı | SAHTE | `games-hub.tsx:239-244` | Doğrulanabilir bir veriye bağlı olmayan sabit vaat; ayrıca `text-white/40` + şeffaf zemin → light temada okunmaz. |
| 20 | Başarımlar paneli veri çekimi | ÇALIŞIYOR | `achievements-panel.tsx:18-34`, `achievements/route.ts:16-41` | |
| 21 | Başarımlar yükleniyor durumu | KISMİ | `achievements-panel.tsx:36-42` | Spinner metni `text-white/50`, arka plansız → light temada görünmez; iskelet değil, yerleşim kayması yaratır. |
| 22 | Başarımlar hata/boş durumu | EKSİK | `achievements-panel.tsx:30` | `.catch(() => {})` → "Başarımlar 0/0" boş kutu. |
| 23 | Başarım kartları + nadirlik rozeti | KISMİ | `achievements-panel.tsx:82-87` | Nadirlik ham İngilizce (`common/rare/epic/legendary`) basılıyor → TR arayüzde dil karışıklığı. |
| 24 | Kilitli başarım ilerleme çubuğu | ÇALIŞIYOR | `achievements-panel.tsx:93-102` | 9px metin. |
| 25 | Skor başarımları ("Keskin Nişancı 20+", "Skor Avcısı 40+") | BOZUK | `lib/game-achievement-stats.ts:26`, `lib/minigame-config.ts:334-346,277-289` | `bestScore` tüm oyunların ham skorunun maksimumu; birimler kıyaslanamaz: trust-merge skoru = en yüksek karo (2048'e kadar) → 32/64 karo yapan herkes "epic" rozet alır; memory-match (max 8), bot-hunter (max 10) hiçbir zaman katkı veremez. |
| 26 | "Kâşif/Koleksiyoncu: N farklı oyun **oyna**" | KISMİ | `lib/game-achievements.ts:33-34`, `game-achievement-stats.ts:25` | Yalnız kazanılan (`completed`) oyunlar sayılıyor; metin "oyna" diyor. `explorer-all` id'si "hepsi" diyor ama hedef 10/21. |
| 27 | Başarım ödülü / kalıcı kayıt / paylaşım | EKSİK | `[game]/complete/route.ts:192-213` | Yalnız bildirim + toast; puan, XP, profil vitrini yok; ana rozet sistemiyle (`/customer/badges`) bağlantı yok. |
| 28 | Gün sınırı / sıfırlama zamanı | KISMİ | `status/route.ts:10-12`, `streak/route.ts:10-12` | `dayKey` UTC → Türkiye'de haklar 03:00'te yenilenir; arayüzde geri sayım yok, "yarın" ifadesi yanıltıcı. |
| 29 | Haftalık turnuva + bekleyen turnuva ödülü | EKSİK | `components/customer/games/game-shell.tsx:210-216`, `game-tournament.tsx:53-75` | Turnuva ve "Ödülü al" yalnız her oyunun kendi açılış ekranında; geçen hafta ilk 3'e giren kullanıcı 21 oyunun hangisinde ödülü olduğunu lobiden göremez. |
| 30 | Lobi düzeyinde liderlik/arkadaş özeti | EKSİK | — | Yalnız oyun içi `GameLeaderboard`; lobide kişisel en iyi/sıra yok. |
| 31 | Light/dark tema uyumu | KISMİ | `games-hub.tsx:108-111,150,239`, `achievements-panel.tsx:37,46` | Sabit koyu gradyanlar + `text-white/*`; uygulama `defaultTheme="system"` (`providers.tsx:225`) — light temada koyu adalar + görünmez öğeler. |
| 32 | Çok dillilik (i18n) | EKSİK | `games-hub.tsx` tamamı, `messages/en.json:2597` | Sidebar EN'de "Game Center", sayfa tamamen sabit Türkçe. |
| 33 | Mobil ızgara (1→2→3 sütun) | ÇALIŞIYOR | `games-hub.tsx:178` | 21 kartlık tek sütun mobilde ~21 ekran kaydırma. |
| 34 | Erişilebilirlik (aria, emoji, kontrast, font) | KISMİ | `games-hub.tsx:113-125,207-213`, `achievements-panel.tsx:85,92,99` | Emojiler `aria-hidden` değil; 9–10px metin; kart linki anlamlı `aria-label` taşımıyor (emoji + başlık + açıklama + "Oyna" tek blok okunur). |
| 35 | Kullanıcı verisi izolasyonu (IDOR) | ÇALIŞIYOR | `status/route.ts:31-34`, `streak/route.ts:37-42`, `achievements/route.ts:24-26` | Tüm sorgular `session.user.id` ile; dışarıdan userId alınmıyor. |
| 36 | Route yükleniyor/hata sınırı | ÇALIŞIYOR | `app/customer/loading.tsx`, `app/customer/error.tsx` | Genel panel iskeleti; sayfaya özel iskelet yok. |

---

## Bulgular

### 1. Kaybedilen oyun "oynanmamış" görünüyor ve tekrar oynatınca 409 ile bitiyor
- **Önem:** yüksek · **Kategori:** işlevsellik / veri bütünlüğü
- **Kanıt:** `app/api/customer/games/[game]/start/route.ts:56-75` (yalnız `completed` engellenir, diğer her durum "yarım kalan aktif oturum" sayılıp `canPlay:true` + aynı `sessionId` döner); `[game]/complete/route.ts:108-121` (`updateMany where status:'active'` → `failed` oturumda `count=0`) ve `:169-174` (409 "Oyun zaten tamamlandı"); `status/route.ts:31-34` (hub yalnız `completed` sayar); Pacman'de aynısı `pacman/start/route.ts:35-52`, `pacman/complete/route.ts:69-80`.
- **Sorun:** Kullanıcı bir oyunu kaybettiğinde oyun ekranı "Yarın yeni hakla tekrar dene" der (`game-shell.tsx` sonuç bölümü), ama lobi o kartı "Oyna" olarak gösterir ve günlük ilerlemeye saymaz. Kullanıcı karta tıklar, oyunu baştan sona oynar, sonunda kırmızı hata toast'ı alır. Ayrıca complete bu boşuna istekte bile `computeAchievementStats`'ı (tüm geçmiş satırlar) çalıştırır (`complete/route.ts:99-104`). Bu, oyunlaştırmanın en temel güven sözleşmesini ("hakkın var/yok") bozuyor.
- **Öneri:** Günlük hak durumunu tek bir kaynağa indir: `MiniGameSession.status ∈ {active, completed, failed}` için start route `failed`'i de `canPlay:false, alreadyPlayed:true, outcome:'lost'` ile reddetmeli; status API `playedToday` yerine `today: Record<gameType, 'won'|'lost'|'in_progress'>` döndürmeli. Hub kartı üç durumlu olmalı: "Kazandın ✓", "Bugünkü hakkını kullandın", "Devam et" (yarım oturum). İlerleme şeridi "hakkını kullandığın oyunlar"ı saymalı. Ürün kararı olarak "kaybedince bir kez daha dene" istenirse bu açıkça bir `retryAllowed` alanıyla modellenmeli (Duolingo "hearts" benzeri), sessiz bir yan etkiyle değil. Bu kural `lib/minigame-session.ts` gibi ortak bir yardımcıya taşınıp Pacman + generic route'larda tek yerden uygulanmalı.
- **Efor:** M

### 2. Skor başarımları farklı birimleri karşılaştırıyor (trust-merge "epic" rozeti bedavaya veriyor)
- **Önem:** orta · **Kategori:** veri doğruluğu / oyun tasarımı
- **Kanıt:** `lib/game-achievement-stats.ts:26` (`bestScore = max(starsCollected)` tüm oyunlarda), `lib/game-achievements.ts:35-36` (20+ ve 40+ hedefleri), `lib/minigame-config.ts:334-346` (trust-merge `maxScore: 2048`, skor = en yüksek karo), `:277-289` (memory-match `maxScore: 8`).
- **Sorun:** Bir oyuncu Güven Birleştir'de 64 karosuna ulaştığında "Skor Avcısı (epic)" açılır; Hafıza Eşleştir ustası hiçbir zaman alamaz. Başarımların değer algısı ve adaleti bozuluyor.
- **Öneri:** Skoru normalize et: `bestRatio = max(score / effectiveMaxScore)` veya "eşiği aş" tabanlı metrikler ("3 farklı oyunda ödül eşiğini geç", "bir oyunda maxScore'un %80'i"). İstatistik fonksiyonu `getEffectiveMiniGames()` ile oyun tanımlarını alıp oyuna göre değerlendirmeli. Mevcut kullanıcıların açılmış rozetleri kalıcı tutulmadığından (her seferinde yeniden hesaplanıyor) değişiklik geriye dönük rozet "kaybettirebilir" → önce başarımları kalıcılaştır (bkz. Bulgu 6), sonra kuralı değiştir.
- **Efor:** S–M

### 3. Hata ve bozulma durumları sessiz; lobi yanlış bilgiyi güvenle gösteriyor
- **Önem:** orta · **Kategori:** UX / dayanıklılık
- **Kanıt:** `games-hub.tsx:48-49,70` (`.catch(() => null)` + `finally setLoaded(true)`), `lib/api-http.ts:18-27` (503 gövdesinde `playedToday` yok), `status/route.ts:23-28` (401'de `games: []` → hub yalnız Pacman'i gösterir), `achievements-panel.tsx:30`.
- **Sorun:** Neon kesintisinde kullanıcı "0/21" ve her kartta "Oyna" görür; oturum süresi dolarsa (401) lobi tek karta (Pacman) iner; başarımlar "0/0" boş kutu olur. Hiçbir uyarı/yeniden dene yok.
- **Öneri:** Veri çekmeyi TanStack Query'ye (projede `QueryClientProvider` zaten var, `providers.tsx`) taşı: `useQuery(['games','hub'])` ile `isError` → satır içi uyarı + "Yeniden dene"; 401 → oturum yenileme yönlendirmesi; 503 → `Retry-After`'a uygun otomatik yeniden deneme. Durum bilinmiyorsa kartlarda "durum alınamadı" nötr ifadesi göster, asla "0/21" değil.
- **Efor:** S

### 4. Light temada görünmez/tutarsız öğeler; tasarım token'larından kopuk
- **Önem:** orta · **Kategori:** görsel / tema
- **Kanıt:** `games-hub.tsx:239` ("Yakında" kartı: şeffaf zemin + `text-white/40` + `border-white/10`), `achievements-panel.tsx:37` (yükleniyor kutusu `text-white/50`, arka plansız), `components/providers.tsx:225` (`defaultTheme="system"`).
- **Sorun:** Light temada "Daha fazla oyun yolda" kartı ve "Başarımlar yükleniyor" metni beyaz zeminde beyaz metin olur. Diğer kartlar koyu "adalar" olarak kalır; panelin geri kalanı (shadcn `Card`, `text-muted-foreground`) ile görsel dil kopuk.
- **Öneri:** Oyun Merkezi'ni bilinçli bir "arcade" yüzeyi olarak tasarlamak meşru; o zaman tüm sayfayı tek bir koyu `GamesSurface` kabına al (her iki temada koyu, `color-scheme: dark`), ya da kartları token tabanlı (`bg-card`, `text-foreground`) yapıp yalnız vurguyu `accent`'ten al. Karışık durum (bazı öğeler token'sız şeffaf) kaldırılmalı.
- **Efor:** S

### 5. Lobide ödül/eşik bilgisi yok; 21 kartlık düz ızgara karar vermeyi zorlaştırıyor
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi
- **Kanıt:** `status/route.ts:41-47` (yalnız görsel alanlar), `games-hub.tsx:178-237` (filtre/sıralama/öne çıkan yok), `games-hub.tsx:97-99` (hedef = tüm kartlar).
- **Sorun:** Kullanıcı hangi oyunun kaç puan/XP verdiğini, ödül eşiğini, tahmini süresini, kişisel rekorunu görmeden seçiyor. Günlük hedef "21/21" — Duolingo'nun 1 ders/gün yaklaşımına kıyasla terk ettirici. Mobilde 21 kart ≈ 21 ekran kaydırma.
- **Öneri:** Status yanıtını zenginleştir: `rewardPoints`, `rewardXp`, `rewardThreshold`, `estMinutes`, `personalBest`, `todayState`. Lobiyi üç katmana böl: (1) "Bugünün oyunu" öne çıkan büyük kart (rotasyonlu, ×1.5 bonus), (2) "Günlük hedef: 3 oyun" halkası (Apple Activity halkası tarzı), (3) kategorize ızgara (Refleks / Bulmaca / Strateji / Şans) + "Oynanmamışlar önce" sıralaması. Kartta "+150 puan · eşik 6/10 · ~1 dk" çipi.
- **Efor:** M

### 6. Başarımlar kalıcı değil, ödülsüz ve ana rozet sisteminden ayrık
- **Önem:** orta · **Kategori:** mimari / oyunlaştırma
- **Kanıt:** `lib/game-achievements.ts:1-9` ("ayrı tablo yok"), `lib/game-achievement-stats.ts:17-20` (her çağrıda tüm oturumlar), `[game]/complete/route.ts:99-104,192-213` (öncesi/sonrası iki tam tarama).
- **Sorun:** Başarım açılma anı kaydedilmiyor (ne zaman açıldı, kutlama gösterildi mi bilinmiyor), kural değişince rozet geri alınabilir, puan/XP vermiyor, profil vitrini yok. Her oyun bitişinde kullanıcının tüm geçmişi iki kez okunuyor; günde 21 satır büyüyen tabloda doğrusal maliyet.
- **Öneri:** `GameAchievementUnlock(userId, achievementId, unlockedAt, seenAt)` tablosu; complete route yalnız ilgili metriği artımlı kontrol etsin (veya `groupBy`/`aggregate` ile tek SQL'de istatistik). Açılışta küçük XP ödülü (puan ekonomisi değişmezleri: atomik + `points_credited` + tek-seferlik unique). Lobide "Yeni" etiketi ve tek seferlik açılış animasyonu `seenAt` ile. Uzun vadede `/customer/badges` rozet sistemiyle tek "Koleksiyon" altında birleştir.
- **Efor:** L

### 7. Turnuvalar ve bekleyen turnuva ödülleri lobide görünmüyor
- **Önem:** orta · **Kategori:** UX / ekonomi görünürlüğü
- **Kanıt:** `components/customer/games/game-shell.tsx:210-216` (turnuva yalnız oyun açılış ekranında), `components/customer/games/game-tournament.tsx:17-29,53-75` (`pendingReward` oyun bazında çekiliyor).
- **Sorun:** Haftalık turnuvada ilk 3'e giren kullanıcının "Ödülü al" butonu yalnız o oyunun sayfasında. 21 oyun arasında hangisinde bekleyen ödül olduğunu bilmesi için hepsini tek tek açması gerekir; ödül sahipsiz kalabilir.
- **Öneri:** `/api/customer/tournament/summary` (tüm oyunlar için bu haftaki sıram + bekleyen ödüller tek sorgu). Lobinin üstünde "🏆 Bekleyen turnuva ödülün var: Bot Avcısı #2 · 300 puan — Al" banner'ı; kartlarda "Turnuva sıran #4" çipi; haftalık geri sayım şeridi.
- **Efor:** M

### 8. Gün sınırı UTC; Türkiye'de haklar 03:00'te yenileniyor, geri sayım yok
- **Önem:** orta · **Kategori:** doğruluk / UX
- **Kanıt:** `status/route.ts:10-12`, `streak/route.ts:10-12`, `[game]/start/route.ts:10-12`, `[game]/complete/route.ts:132` (hepsi `toISOString().slice(0,10)`).
- **Sorun:** Gece 00:00–03:00 arasında oynayan TR kullanıcısı için "bugün" hâlâ dün; seri "Yarın da gel" mesajı 03:00 sınırını gizliyor; seri kırılmaları kullanıcıya haksız gelir.
- **Öneri:** Gün anahtarını tek bir `gameDayKey(date, tz='Europe/Istanbul')` yardımcısına taşı (tüm oyun/streak/status route'ları + `GameStreakClaim`); geçişte çift sayım olmaması için tek seferlik ileri geçiş penceresi tanımla. Lobide "Yeni haklar 4 sa 12 dk sonra" geri sayımı.
- **Efor:** M

### 9. Üç ayrı "günlük seri" kavramı aynı görsel dille sunuluyor
- **Önem:** orta · **Kategori:** bilgi mimarisi / tutarlılık
- **Kanıt:** `games-hub.tsx:126-128` ("🔥 N günlük seri"), `components/customer/login-streak-card.tsx:53,125` (aynı etiket, giriş serisi), `lib/login-streak.ts:5-14` (oyun serisi + `UserStreak` + giriş serisi birbirinden bağımsız).
- **Sorun:** Kullanıcı panoda "5 günlük seri", oyun merkezinde "0 günlük seri" görür; hangisinin neye ödül verdiği belirsiz. Oyun serisi kilometre taşları (her 3 günde +30 XP) API'de hesaplanıyor ama gösterilmiyor (`streak/route.ts:69-72`).
- **Öneri:** Seriyi adlandır ve ayrıştır: "Oyun serisi" (gamepad ikonlu, mor) vs "Ziyaret serisi". Banner'da sonraki kilometre taşı halkası ("2 gün sonra +30 XP"), seri koruma (streak freeze) fikri için alan. Pacman tamamlamaları da seri bonusu almalı ya da metin "bonus yalnız mini oyunlarda" demeli.
- **Efor:** S–M

### 10. Mobilde sayfa başlığı yok; erişilebilirlik eksikleri
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil
- **Kanıt:** `components/dashboard/page-heading.tsx:21` (`hidden sm:flex`), `app/customer/layout.tsx:39` (header'a title yok), `games-hub.tsx:156-169` (ilerleme çubuğu rolü yok), `:113-125,207-213` (emoji okunur), `achievements-panel.tsx:85,92,99` (9–10px metin).
- **Sorun:** Ekran okuyucu kullanıcısı mobilde sayfanın ne olduğunu (h1) bilmez; ilerleme yüzdesi anons edilmez; "uzaylı canavar Yıldız Avı …" gibi emoji okumaları gürültü yaratır; 9px metin WCAG okunabilirlik açısından zayıf.
- **Öneri:** Mobil kompakt başlık (`<h1 className="sr-only sm:not-sr-only">` veya mobil hero). İlerlemede `role="progressbar" aria-valuenow aria-valuemax aria-label="Bugünkü ilerleme"`. Emojileri `aria-hidden`, karta `aria-label="Yıldız Avı — bugün oynandı, kazandın"`. Minimum 11–12px.
- **Efor:** S

### 11. Hidrasyon sonrası istek şelalesi ve yerleşim kayması
- **Önem:** düşük · **Kategori:** performans / mimari
- **Kanıt:** `page.tsx:10` (sunucuda oturum hazır), `games-hub.tsx:46-49`, `achievements-panel.tsx:20` (3 ayrı client fetch, her biri `getServerSession`), `games-hub.tsx:102` (streak banner veriyle sonradan beliriyor).
- **Sorun:** Sayfa önce kartlarla gelir, sonra banner üstte belirip kartları aşağı iter (CLS); başarım paneli spinner→ızgara geçişinde zıplar.
- **Öneri:** Page'i RSC olarak tüm hub verisini tek `getGamesHubData(userId)` ile (Promise.all) sunucuda üretip prop olarak geçir; client yalnız etkileşim + `router.refresh()`. Alternatif: tek `/api/customer/games/hub` ucu + sabit yükseklikli iskeletler.
- **Efor:** S–M

### 12. Admin `accent` doğrulanmıyor
- **Önem:** düşük · **Kategori:** güvenlik sertleştirme / dayanıklılık
- **Kanıt:** `app/api/admin/games/route.ts:130-142` (`strOverride` 400 karakter serbest metin), `games-hub.tsx:186-193` (`${accent}66`, `radial-gradient(..., ${accent}, ...)`).
- **Sorun:** Hex dışı değer kenarlık/gölgeleri sessizce bozar; `backgroundImage`'e `red, transparent), url(https://...)` gibi bir değerle harici kaynak isteği eklenebilir (yalnız admin yazabildiği için düşük risk; CSP'nin engelleyip engellemediği doğrulanmadı).
- **Öneri:** Zod'da `accent: z.string().regex(/^#[0-9a-fA-F]{6}$/)`; client'ta alfa ekini string birleştirme yerine `color-mix()` veya hex→rgba yardımcısıyla üret.
- **Efor:** S

### 13. Dil karışıklığı ve sabit metinler
- **Önem:** düşük · **Kategori:** i18n / içerik
- **Kanıt:** `achievements-panel.tsx:86` (`{a.rarity}` → "EPIC/LEGENDARY"), `messages/en.json:2597` vs. `games-hub.tsx` sabit TR, `games-hub.tsx:239-244` ("Her hafta yeni mini oyunlar ekleniyor!" sabit vaat), `page.tsx:7` + `layout.tsx:20` (çift sonek).
- **Öneri:** Nadirlik için TR etiket haritası (Yaygın/Nadir/Epik/Efsanevi); hub metinlerini `messages/*.json`'a taşı; "Yakında" kartını gerçek veriye bağla (en son eklenen oyunun tarihi, "Yeni" etiketi) ya da kaldır; metadata'yı `title: 'Oyun Merkezi'` yap.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Günlük hedef ve tek odak (Duolingo):** "Bugün 3 oyun" hedef halkası + "Bugünün oyunu" öne çıkan kart (bonus çarpanlı). Şu an hedef 21/21.
2. **Ödül şeffaflığı ve kişisel rekor (Starbucks Rewards):** Kartta puan/XP, eşik, kişisel en iyi, bugünkü kazanç toplamı; lobi üstünde "Bugün oyunlardan +450 puan kazandın".
3. **Turnuva/arkadaş katmanı (Duolingo Ligleri):** Lobide haftalık turnuva özeti, bekleyen ödül banner'ı, arkadaş/squad karşılaştırması (`/customer/squads` ile bağlantı).
4. **Seri koruma ve kilometre taşı görselleştirmesi:** Streak freeze, sonraki bonus geri sayımı, takvim ısı haritası.
5. **Yenilenme geri sayımı ve hatırlatma:** "Yeni haklar 4 sa sonra" + push hatırlatma tercihi (push merkezi zaten var).
6. **Haftalık/aylık oyun özeti (Spotify Wrapped):** "Bu ay 42 oyun, en iyi oyunun Bot Avcısı, 1.840 puan" paylaşılabilir kart.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Lobiye giren kullanıcı 3 saniyede şunları anlamalı: bugün ne kadar hakkım kaldı, en çok ne kazandırır, serimi ne zaman kaybederim, bekleyen bir ödülüm var mı. Oyun seçmek "katalogda gezinmek" değil, "bugünün planını tamamlamak" gibi hissettirmeli.

**Yerleşim (mobil önce):**
1. **Üst şerit (sabit yükseklik, iskeletli):** Sol: oyun serisi alevi + sayı + sonraki kilometre taşı mini halkası; sağ: günlük hedef halkası (3 oyun) + "Yenilenme 4s 12dk".
2. **Uyarı yuvası (koşullu):** Bekleyen turnuva ödülü / yeni oyun / yeni başarım — tek, önceliklendirilmiş banner.
3. **Bugünün oyunu:** Geniş kahraman kart; mevcut `boss-3d.tsx` / imza sürpriz kutusu tekniğiyle hafif bir 3B önizleme (tek sahne, `reduce-animations` ve WebGL yoksa statik görsel). Ölçülü: yalnız bu kartta, viewport dışında render durur.
4. **Kategoriler:** Yatay kaydırmalı sekmeler (Tümü / Refleks / Bulmaca / Strateji / Şans) + "Oynanmamışlar önce" sıralaması. Kartlar kompakt: emoji, başlık, "+150 · ~1 dk", durum çipi (Kazandın / Hak kullanıldı / Devam et / Turnuva #4).
5. **Başarımlar:** Lobide yalnız "en yakın 3 başarım" (ilerlemeye göre), "Tümünü gör" ile koleksiyon sayfasına (`/customer/badges` ile birleşik).

**Motion:** Giriş stagger'ı kısalt (yalnız ilk 6 kart), sonsuz alev döngüsünü yalnız seri tehlikedeyken (bugün oynanmadı) çalıştır; hedef halkası dolarken tek seferlik konfeti (`ConfettiProvider` zaten var); `useReducedMotion()` + `html.reduce-animations` kontrolünü tek bir `useGamesMotion()` hook'unda birleştir.

**Veri/API değişiklikleri:**
- `GET /api/customer/games/hub` (veya RSC `getGamesHubData`): `{ games:[{gameType,title,emoji,accent,category,rewardPoints,rewardXp,rewardThreshold,estMinutes,todayState,personalBest,tournamentRank}], streak:{current,longest,nextMilestone,nextRewardIn}, dailyGoal:{target,done}, resetAt, pendingTournamentRewards:[...], featuredGameType, nearestAchievements:[...] }`.
- `MiniGameDef`'e `category` ve `estMinutes` alanları (registry + admin override).
- Start route'ta `failed` = hak kullanıldı (Bulgu 1); tüm `dayKey`'ler `Europe/Istanbul` (Bulgu 8).
- `GameAchievementUnlock` tablosu + normalize skor metrikleri (Bulgu 2, 6).
- Pacman'i registry'ye al (admin yönetimi + seri bonusu + başarım tespiti tek koddan).

---

## Çakışmalar / birleştirme önerisi

- **Seri sistemleri:** Oyun serisi (`/api/customer/games/streak`), giriş serisi (`login-streak-card.tsx`, `lib/login-streak.ts`) ve `UserStreak` (`/api/streak`) aynı "🔥 günlük seri" diliyle üç ayrı sayaç. Öneri: kullanıcıya tek "Seriler" bileşeni (sekme/çip ile ayrışan) ve net adlandırma; uzun vadede `/customer/progress-hub` altında birleştirme.
- **Başarımlar vs Rozetler:** Oyun başarımları (`lib/game-achievements.ts`) `/customer/badges` rozet sisteminden tamamen ayrık. Öneri: koleksiyon tek yerde (`/customer/badges` → "Oyun" sekmesi), lobide yalnız özet.
- **Turnuva/Liderlik:** Oyun içi `GameTournament`/`GameLeaderboard` ile `/customer/leaderboard` ve `/customer/category-leaderboard` arasında lobi düzeyinde köprü yok. Öneri: lobide turnuva özeti, `/customer/leaderboard`'a "Oyunlar" sekmesi.
- **Etkinlik merkezi (`/customer/event`) ve görevler (`/customer/quests`):** Aynı sidebar grubunda (`sidebar.tsx:310-313`); oyun tamamlama görev/etkinlik ilerlemesine bağlanıyorsa lobide gösterilmeli (bağlantı bu denetimde doğrulanmadı).
- **Sayfa kaldırılmamalı:** 21 oyunun tek giriş noktası ve sidebar'daki tek oyun linki (`sidebar.tsx:310`); korunup yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

### İddia: Kaybedilen (failed) mini oyun oturumu tekrar başlatılabiliyor ama tamamlanamıyor (409) ve hub onu oynanmamış gösteriyor

**Karar: DOĞRULANDI** (ciddiyet: puan ekonomisi açısından güvenli, kullanıcı deneyimi/durum tutarlılığı açısından YÜKSEK).

Çürütme denemesi ve kanıt zinciri (kod baştan okundu):

1. **Kaybetme `failed` yazar:** `app/api/customer/games/[game]/complete/route.ts:98-106` — `updateMany({ where: { id, status: 'active' }, data: { status: won ? 'completed' : 'failed', ... } })`. İstemci `finish(score, false)` çağrısında `won:false` gönderir (`lib/use-mini-game.ts:92-96`).
2. **Start yalnız `completed`'ı engeller:** `app/api/customer/games/[game]/start/route.ts:56-73` — `existing.status === 'completed'` değilse (yani `failed` dahil) "yarım kalan aktif oturum" yorumuyla `canPlay:true` ve **aynı** `sessionId` döner. `@@unique([userId, gameType, dayKey])` nedeniyle yeni oturum da açılamaz.
3. **İstemci bunu oynanabilir sayar:** `lib/use-mini-game.ts:64-72` yalnız `alreadyPlayed || canPlay === false` durumunda kilitler; aksi hâlde `phase='playing'` olur ve oyun baştan sona oynatılır.
4. **Complete reddeder:** `complete/route.ts:73` ön kontrol yalnız `completed`'ı yakalar, `failed` geçer; ardından `:89-94` `computeAchievementStats` tam taraması **boşuna** yapılır; `:98-108` `updateMany ... status:'active'` → `count 0` → `:177-181` **409 "Oyun zaten tamamlandı"**. İstemci `lib/use-mini-game.ts:98-99,126-128` bunu hata toast'ı olarak gösterir ve sonucu "ödülsüz" kaydeder.
5. **Hub `failed`'ı görmez:** `app/api/customer/games/status/route.ts:31-35` `playedToday` yalnız `status:'completed'`; `components/customer/games/games-hub.tsx:95-97,177,230` buna göre kartı "Oyna" gösterir, "Bitti" rozeti koymaz ve günlük ilerleme (`doneCount/cards.length`) kaybedilen oyunu saymaz → kaybeden kullanıcı o gün asla %100'e ("🎉 Bugün tüm oyunları bitirdin") ulaşamaz (`games-hub.tsx:169-171`).
6. **Pacman aynı kusuru taşır:** `app/api/customer/games/pacman/start/route.ts:35-52` ve `pacman/complete/route.ts:55-60, 71-83, 101-106`.

**Yeniden üretim:** Müşteri hesabıyla herhangi bir registry oyununu (örn. `/customer/games/memory-match`) aç → oyunu kaybet (complete `won:false` → oturum `failed`) → `/customer/games`'e dön: kart "Oyna" der, ilerleme şeridi artmamıştır → karta tıkla, "Başla" → oyun başlar (aynı `sessionId`) → oyunu sonuna kadar oyna → sonuçta "Oyun zaten tamamlandı" hata toast'ı. Bu döngü gün boyu sınırsız tekrarlanabilir.

**Çürütülemeyen noktalar / sınırlar:** Çift ödül YOK — atomik `status:'active'` guard'ı (`complete/route.ts:98-108`) ve `failed` satırının asla tekrar `active` olmaması ödül basmayı engeller; puan ekonomisi değişmezleri korunuyor. Ayrıca yeniden başlatılan oturumun `startedAt`'ı eski kaldığından `tooFast` kontrolü anlamsızlaşıyor, ama ödül zaten verilemediği için sömürülemez.

**Öneri (ürün seviyesi):** Önce ürün kararı netleşmeli: "Günde 1 hak" bir **deneme** mi yoksa bir **galibiyet** mi?
- *A — Hak = deneme (lobi rapor Bulgu 1 ile tutarlı, önerilen):* `start` route'larında `status !== 'active'` (yani `completed` **veya** `failed`) → `canPlay:false, alreadyPlayed:true, outcome:'won'|'lost'` dönülmeli; `status` route'u `playedToday`'i `status IN ('completed','failed')` ile doldurmalı ve kart başına `todayState: 'won'|'lost'|'none'` vermeli. Hub kartı kaybedilende "Yarın tekrar dene" + kaybetme rozeti göstermeli, ilerleme şeridi "denenen" oyunları saymalı. `GameShell` kilit ekranı da `outcome`'a göre farklı metin göstermeli.
- *B — Kaybeden aynı gün tekrar deneyebilir:* `start`'ta `failed` oturumu atomik `updateMany({ where:{ id, status:'failed' }, data:{ status:'active', startedAt: new Date(), starsCollected:0, rewardPoints:0, completedAt:null } })` ile sıfırlayıp yeniden açmalı (opsiyonel `attempts` sayacı + günlük deneme tavanı). Böylece `tooFast` yeniden anlamlı olur ve complete 409 vermez.
Her iki seçenekte de: pacman route'ları generic koda (registry) taşınmalı ki kural tek yerde yaşasın; `complete` içindeki pahalı `computeAchievementStats` "önce" taraması `claimed.count === 1` garantilendikten sonraya (veya ucuz bir ön kontrolün arkasına) alınmalı; ve bir regresyon testi (`failed` sonrası start → `canPlay` beklenen değer; complete → 409 olmamalı) eklenmeli.
