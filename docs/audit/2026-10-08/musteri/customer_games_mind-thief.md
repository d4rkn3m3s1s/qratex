# /customer/games/mind-thief

**Amaç:** Müşteriye günde bir kez oynanan, 45 saniyelik bir "bozuk yorumu yok et, gerçeğe dokunma" refleks oyunu sunmak. Eşik (15) aşılırsa sunucu 160 puan + 80 XP, günlük seri bonusu, başarım ve haftalık turnuva sıralaması veriyor. Oyunlaştırma döngüsünde "günlük geri dönüş" kancası olarak çalışıyor.

**Genel puan:** 5/10 · **Karar:** koru-iyileştir. Oyun döngüsü ve "juice" iyi. Ancak ekonomi bütünlüğü, kaybedince yeniden oynama akışı, admin ayarlarıyla uyumsuzluk ve mobil/erişilebilirlik tarafında ciddi kusurlar var. Orta vadede "yorum ayıklama" oyun ailesiyle (truth-vs-fake, troll-slayer, guardian-of-trust) konumlandırması yeniden düşünülmeli.

İncelenen dosyalar: `app/customer/games/mind-thief/page.tsx`, `app/customer/layout.tsx`, `components/customer/games/mind-thief-game.tsx`, `game-shell.tsx`, `boss-3d.tsx`, `fx-layer.tsx`, `game-leaderboard.tsx`, `game-tournament.tsx`, `games-hub.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/admin-toast.ts`, `lib/tournament-core.ts`, `lib/points-caps.ts`, `components/dashboard/page-heading.tsx`, `components/providers.tsx`, `app/globals.css`, `app/api/customer/games/[game]/{start,complete,leaderboard}/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma` (MiniGameSession, GameStreakClaim), `node_modules/framer-motion` 11.18.2 (`buildHTMLStyles` / `useStyle`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oyun döngüsü ve sunucu ödülü çalışıyor. Ancak kaybedince yeniden oynama her zaman 409 ile bitiyor, istemci admin'in etkin eşiğini görmüyor ve skor tamamen istemcinin bildirdiğine dayanıyor. |
| UX | 5/10 | His iyi (kombo, öfke modu, power-up). Buna karşın öğretici yok, "bugün oynandı" bilgisi ancak butona basınca çıkıyor, sonuçtan sonra hiçbir sonraki adım yok ve bazı metinler yanıltıcı ("Patron her seviyede güçleniyor", "Zaman Dondur", "Günde 1 hak"). |
| Görsel | 7/10 | Neon arena, 3B boss ve parçacık katmanı güçlü. Kartların konumlandırması framer'ın transform'u ezmesi yüzünden bozuk, ayrıca turnuva bloğu açık temada koyu zemine koyu yazı basıyor. |
| Mimari | 4/10 | State updater içinde yan etki var. Statik registry kullanılıyor ama sunucu effective config kullanıyor. Boss3D her öfke geçişinde WebGL bağlamını yeniden kuruyor. Skor doğrulanmıyor, 20 oyunun her biri aynı iskeleti kopyalıyor. |
| Performans | 6/10 | three.js ayrı chunk'a bölünmüş, iyi. Ancak 45 sn'lik turda ~7 kez WebGL renderer yaratılıyor, hareketli kartlarda `backdrop-blur` var ve tamamlamada başarım istatistikleri iki kez hesaplanıyor. |
| Erişilebilirlik + mobil | 3/10 | Ayrım yalnızca kırmızı/yeşil renkle yapılıyor. Dokunma hedefleri ~24 px, lejant 10 px ve %40 opaklıkta, aria-live yok, sabit 420 px arenada kartlar sağdan kırpılıyor. Mobilde sayfa başlığı gizli, duraklatma da yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı rol kapısı (CUSTOMER değilse signin'e) | ÇALIŞIYOR | `app/customer/games/mind-thief/page.tsx:10-13` | API'ler de ayrıca CUSTOMER kontrolü yapıyor (`start/route.ts:41-47`, `complete/route.ts:44-50`). |
| 2 | Sayfa `<title>` metadata | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s \| <panel>` ekliyor, sayfa da `\| QRateX` yazıyor. Sonuç çift son ek: "Zihin Hırsızı \| QRateX \| …". |
| 3 | Sayfa başlığı + açıklama (DashboardPageHeading) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` olduğu için mobilde hiç görünmüyor. Masaüstünde GameShell içindeki başlıkla (h2) tekrar ediyor. "Günde 1 hak!" vaadi gerçek davranışla örtüşmüyor (bkz. #42-43). |
| 4 | Neon oyun çerçevesi (ızgara + köşe aksanları) | ÇALIŞIYOR | `game-shell.tsx:97-129` | |
| 5 | Giriş ekranı (emoji, başlık, açıklama, ipucu şeridi) | KISMİ | `game-shell.tsx:165-188`, `lib/minigame-config.ts:76-77`, `lib/minigame-copy.ts:53` | "Patron her seviyede güçleniyor!" deniyor ama oyunda seviye yok, yalnızca 12 sn'lik öfke döngüsü var (`mind-thief-game.tsx:209-222`). |
| 6 | Başlat CTA "🧠 Zihne Sız" ve `POST /start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79` | |
| 7 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162`, `minigame-copy.ts:54` | |
| 8 | Başlatma hatasında toast | ÇALIŞIYOR | `use-mini-game.ts:74-77` | |
| 9 | Sayfa açılışında "bugün oynandı mı" ön kontrolü | EKSİK | `use-mini-game.ts:46` (phase her zaman `idle` ile başlıyor) | Kullanıcı kilitli olduğunu ancak "Oyna"ya basınca öğreniyor. Hub bu bilgiyi zaten `/api/customer/games/status` üzerinden alıyor. |
| 10 | "Bugün oynadın" kilit ekranı | KISMİ | `game-shell.tsx:308-331` | Çalışıyor. Ancak "Her gün 00:00 (UTC) sıfırlanır" (`:323`) Türk kullanıcısı için 03:00 demek, jargon ve geri sayım yok. |
| 11 | Admin'in pasifleştirdiği oyun | KISMİ | `start/route.ts:34-39` | Sayfa normal render ediliyor, kullanıcı ancak tıklayınca 403 toast'ı görüyor. Sunucu sayfasında `enabled` kontrolü yok. |
| 12 | Admin override'larının (başlık, açıklama, emoji, renk, eşik, maxScore) istemciye yansıması | BOZUK | `mind-thief-game.tsx:24` (`getMiniGame` statik), `:233`, `:271`, `:335`; `use-mini-game.ts:70` (config set ediliyor ama oyun okumuyor) | Ayrıntı Bulgu B3'te. |
| 13 | HUD: can kalpleri | ÇALIŞIYOR | `mind-thief-game.tsx:342-348` | Kaybedilen kalp için ölçek animasyonu var. |
| 14 | HUD: skor (değiştiğinde "pop") | ÇALIŞIYOR | `mind-thief-game.tsx:350-352` | |
| 15 | HUD: kombo göstergesi (≥3) | ÇALIŞIYOR | `mind-thief-game.tsx:353-359` | |
| 16 | HUD: 45 sn geri sayım | ÇALIŞIYOR | `mind-thief-game.tsx:224-235`, `:361` | Son saniyelerde aciliyet işareti yok, aria-live yok. |
| 17 | Aktif power-up rozetleri (Dondur / Çift) | ÇALIŞIYOR | `mind-thief-game.tsx:365-371` | |
| 18 | Öfke modu (12 sn'de bir 4 sn; rozet, vinyet, boss kızarır, spawn hızlanır) | KISMİ | `mind-thief-game.tsx:209-222`, `:372-374`, `:388-399`, `:411` | Oyun mekaniği çalışıyor. Ancak boss rengini değiştirmesi Boss3D'yi baştan kuruyor (Bulgu B6). |
| 19 | Arena arka planı (radyal gradyan + yıldız dokusu) | ÇALIŞIYOR | `mind-thief-game.tsx:378-408` | |
| 20 | 3B boss (three.js ikozahedron + tel kafes + parçacık halkası) | KISMİ | `boss-3d.tsx:30-174`, `mind-thief-game.tsx:9` | Ayrı chunk'a bölünmüş, dispose yapılıyor. Ama `[color]` bağımlılığıyla her öfke geçişinde yeniden kuruluyor. `reduce-animations` açıkken veya WebGL yokken yerine hiçbir şey konmuyor (boş alan). |
| 21 | Yüzen yorum kartları (spawn, en fazla 9, rastgele konum) | KISMİ | `mind-thief-game.tsx:153-206`, `:414-447` | Çakışma önleme yok. Mobilde sağ kenardan kırpılıyor (Bulgu B5). |
| 22 | Kartların 3B derinliği (`translateZ` + `perspective`) ve merkezlenmesi (`translate(-50%,-50%)`) | BOZUK | `mind-thief-game.tsx:426-433`; `framer-motion/dist/cjs/index.js` `useStyle` + `buildHTMLStyles` | Framer, `scale`/`y` animasyonu varken inline `transform`'u kendi ürettiği transform'la eziyor. Ayrıntı Bulgu B5'te. |
| 23 | Kartların üst üste binmesini önleme | EKSİK | `mind-thief-game.tsx:177-178` | Tamamen rastgele x/y. Gerçek yorum bozuk yorumun üstüne düşebiliyor ve haksız can kaybına yol açıyor. |
| 24 | Bozuk yoruma dokunma: +puan, kombo, ses, haptik, FX | ÇALIŞIYOR | `mind-thief-game.tsx:252-272` | |
| 25 | Kombo bonusu (her 5 komboda +1, fanfar, şok dalgası) | ÇALIŞIYOR | `mind-thief-game.tsx:256-270` | Kullanıcıya hiçbir yerde anlatılmıyor. |
| 26 | Gerçek yoruma dokunma cezası (-1 can, kombo sıfırlanır) | ÇALIŞIYOR | `mind-thief-game.tsx:275-278`, `:113-131` | |
| 27 | Bozuk yorum süresi dolunca -1 can | KISMİ | `mind-thief-game.tsx:184-192` | Yan etki (`loseLife`, `setTimeout`, `endGame` ile fetch) `setComments` updater'ının içinde çalışıyor (Bulgu B4). |
| 28 | "❄️ Zaman Dondur" power-up | KISMİ | `mind-thief-game.tsx:285-286`, `:187`, `:202`, `:224-228` | Tur sayacı DONMUYOR. Yalnızca spawn yavaşlıyor ve süresi dolan bozuk kart ceza vermeden siliniyor. `:182`'deki yorum ("süre uzar") koda uymuyor. |
| 29 | "⭐ Çift Puan" power-up (6 sn) | ÇALIŞIYOR | `mind-thief-game.tsx:255`, `:287-289` | |
| 30 | "💗 Can" power-up | ÇALIŞIYOR | `mind-thief-game.tsx:290-298` | Ayrıca +1 skor veriyor. Belgelenmemiş, ama zararsız. |
| 31 | Zorluk artışı (spawn aralığı 1050 ms'den 420 ms'ye) | ÇALIŞIYOR | `mind-thief-game.tsx:201-202` | |
| 32 | maxScore'a (30) ulaşınca erken zafer | ÇALIŞIYOR | `mind-thief-game.tsx:271` | Statik `DEF.maxScore` kullanılıyor (#12). |
| 33 | Süre bitince eşik kontrolüyle kazan/kaybet | KISMİ | `mind-thief-game.tsx:229-234` | Statik `DEF.rewardThreshold` kullanılıyor, sunucunun etkin eşiğiyle ayrışabilir (B3). |
| 34 | Canlar bitince kaybetme | ÇALIŞIYOR | `mind-thief-game.tsx:128` | |
| 35 | Sonucu gönderme (`POST /complete`) | KISMİ | `use-mini-game.ts:82-135`, `complete/route.ts:15-22` | Skor ve `won` tamamen istemciden geliyor. Sunucu yalnızca üst sınır ve süre kontrolü yapıyor (B1). |
| 36 | Sunucu ödül hesabı ve atomik tek-kredi | ÇALIŞIYOR | `complete/route.ts:61`, `:86-87`, `:97-106`, `:152-175` | `updateMany where status='active'` ile çift ödül önleniyor, `points_credited` olayı yazılıyor. |
| 37 | Günlük oyun serisi bonus XP'si (GameStreakClaim) | ÇALIŞIYOR | `complete/route.ts:111-150`, `schema.prisma:1066-1074` | Gün sınırı UTC. |
| 38 | Yeni başarım tespiti ve toast'ları | ÇALIŞIYOR | `complete/route.ts:90-94`, `:196-215`, `use-mini-game.ts:123-125` | `computeAchievementStats` her tamamlamada iki kez çalışıyor (B10). |
| 39 | Ödül ve başarım bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194`, `:203-211` | |
| 40 | Sonuç ekranı (kupa/kurukafa, rastgele başlık, skor, ödül çipi) | KISMİ | `game-shell.tsx:222-305` | Sunucu 409 döndüğünde de istemcinin `won` değeriyle "Zihin Temizlendi! 🏆" yazıyor, altında da "Ödül için 15 skor gerekiyordu" görünüyor (B2). |
| 41 | Ödül konfetisi | ÇALIŞIYOR | `game-shell.tsx:19-31`, `:86-94` | `reduce-animations` sınıfına uyuyor. |
| 42 | Kaybettikten sonra aynı gün tekrar oynama | BOZUK | `complete/route.ts:101` (`failed`), `start/route.ts:56-74`, `status/route.ts:33` | Yeni oyun başlıyor ama sonucu her zaman 409 ile reddediliyor (B2). |
| 43 | "Günde 1 hak" kuralı | BOZUK | `start/route.ts:69-73` | Aktif oturum her yenilemede baştan oynatılabiliyor: kaybedeceğini gören oyuncu sayfayı yenileyip sınırsız deneme yapabiliyor (B2). |
| 44 | Sonuçtan sonra "Tekrar / Sıradaki oyun / Hub'a dön" CTA'sı | EKSİK | `game-shell.tsx:222-305` | Sonuç ekranı çıkmaz sokak. Hub'daki 20 oyuna geçiş yok. |
| 45 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx:24-113`, `leaderboard/route.ts:47-80` | Hata durumunda "Henüz skor yok — ilk rekoru sen kır!" yazıyor (`:40`, `:55-60`). `take: 100` yüzünden ilk 100 dışındaki kullanıcı kendi sırasını göremiyor, "N oyuncu" da en fazla 100 gösteriyor. 30 puan tavanında eşitlikler belirsiz sıralanıyor. |
| 46 | Haftalık turnuva (canlı sıralama, geri sayım, ödül havuzu) | KISMİ | `game-tournament.tsx:53-182`, `tournament/route.ts:28-38` | Koyu sabit zeminde tema token'ları kullanılıyor (`text-muted-foreground`, varsayılan foreground), açık temada okunmuyor. Eşit skorlarda ilk 3 belirsiz (B8). |
| 47 | Geçen haftanın turnuva ödülünü talep etme | KISMİ | `game-tournament.tsx:84-97`, `tournament/route.ts:155-191` | Sunucu tarafı sağlam. Ancak müşteri bileşeni `@/lib/admin-toast` kullanıyor, toast'lar "Basarili: …" / "Dikkat: …" önekiyle (ASCII, ş/ı yok) çıkıyor (`lib/admin-toast.ts:14-20`). |
| 48 | Arena içi lejant ("🔴 Bozuk yok et · 🟢 Gerçeğe dokunma · 🟣 power-up topla") | KISMİ | `mind-thief-game.tsx:451-453` | 10 px, `text-white/40`: kontrast yetersiz. Yarı İngilizce ("power-up"). |
| 49 | Nasıl oynanır / ilk oyun öğreticisi | EKSİK | — | Kombo bonusu, öfke modu, power-up süreleri ve "süresi dolan bozuk kart can götürür" kuralı hiç anlatılmıyor. |
| 50 | Duraklatma / sekme gizlenince durdurma | EKSİK | `mind-thief-game.tsx:224-235` (`Date.now()` tabanlı) | Sekme değişince sayaç akmaya devam ediyor, kısılan zamanlayıcılar ceza veriyor ve oyun arka planda kaybediliyor. |
| 51 | Ses aç/kapa | EKSİK | `lib/game-sounds.ts:10-13` | Ses yalnızca "animasyonları azalt" erişilebilirlik ayarıyla kapanıyor. Ayrı bir mute yok. |
| 52 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232`, `boss-3d.tsx:33`, `fx-layer.tsx:45-48`, `app/globals.css:801-832` | İki ayrı sistem birbirini tamamlamıyor (B11). |
| 53 | Ekran okuyucu / klavye ile oynanabilirlik (aria-live, etiketler) | EKSİK | `mind-thief-game.tsx:341-362`, `:421-444` | Can, skor ve süre duyurulmuyor. Kartlarda tür etiketi yok. Odak halkası yok. |
| 54 | Dokunsal geri bildirim (titreşim) | ÇALIŞIYOR | `mind-thief-game.tsx:122`, `:262`, `:282`; `game-sounds.ts:158-165` | |
| 55 | Ses efektleri (WebAudio) | ÇALIŞIYOR | `mind-thief-game.tsx:15-22`, `use-mini-game.ts:55` (`primeAudio`) | |
| 56 | Hub'a geri dönüş bağlantısı / breadcrumb | EKSİK | `page.tsx:16-22` | Sidebar yalnızca hub'a link veriyor, oyun sayfasında geri dönüş öğesi yok. |

**Özet:** 56 özellik. ÇALIŞIYOR 26 · KISMİ 18 · BOZUK 4 · SAHTE 0 · EKSİK 8.

---

## Bulgular (önem sırasıyla)

### B1. Skor ve kazanma bayrağı tamamen istemciden geliyor; oyun puanı ve turnuva ödülü betikle toplanabilir
- **Önem:** yüksek · **Kategori:** güvenlik / ekonomi bütünlüğü · **Efor:** L
- **Kanıt:** `app/api/customer/games/[game]/complete/route.ts:15-22` (zod yalnızca `score ≤ 10000`, `won: boolean`), `:61` (skor yalnızca `maxScore`a sıkıştırılıyor), `:81-87` (tek ek koşul `minDurationSec = 8` sn). Oyun kategorisi için günlük puan tavanı yok: `lib/points-caps.ts` yalnızca `category: 'feedback'` sayıyor, complete route'ta caps çağrısı yok, sadece yorumda geçiyor (`:159-161`). Turnuva sıralaması da aynı `starsCollected` alanından çıkıyor (`tournament/route.ts:28-38`).
- **Sorun:** Oturum açmış bir müşteri `/start` ile oturum alıp 8 sn sonra `/complete`'e `{score:30, won:true, durationSec:9}` gönderirse her gün 160 puan + 80 XP + seri XP'si alır. Skor da 30 tavanında olduğundan haftalık turnuvada ilk 3'e (500/300/150 puan) eşitlikle girebilir. Bu sorun 19 registry oyununun hepsinde ortak; mind-thief'e özgü değil, ama bu sayfa onun bir girişi. "Points economy invariants" belleğindeki "puan basan her yol doğrulanmalı" ilkesi burada yalnızca kısmen sağlanıyor.
- **Öneri:**
  1. **Kısa vadede:** oyun kategorisine günlük/haftalık puan tavanı ekle (`points-caps.ts`'e `category:'game'`). `points-velocity` dedektöründe oyun olaylarını eşik tetikleyici yap. Turnuva ödülünü yalnızca hesap yaşı ve geri bildirim geçmişi olan kullanıcılara aç.
  2. **Orta vadede (yeniden üretilebilir oturum):** `/start` bir `seed` ve imzalı (HMAC) oturum belirteci dönsün. İstemci spawn dizisini bu seed'le deterministik PRNG'den üretsin, `/complete`'e skor yerine olay günlüğünü göndersin (`[{id, t, action:'hit'}]`, en fazla ~200 olay). Sunucu aynı seed'le spawn dizisini yeniden kurup her vuruşu zaman penceresine göre doğrulasın ve skoru kendisi hesaplasın. Bu mimari 20 oyunun çoğuna `lib/minigame-replay/<game>.ts` doğrulayıcılarıyla genişletilebilir.
  3. **İnsanüstü desen reddi:** vuruşlar arası < 120 ms, tüm vuruşlar kusursuz, kart görünmeden vuruş gibi desenleri reddet.

### B2. Kaybeden oyuncu aynı gün "tekrar" oynayabiliyor ama sonucu her zaman reddediliyor; yenileyerek sınırsız deneme mümkün
- **Önem:** yüksek · **Kategori:** işlevsellik / veri bütünlüğü · **Efor:** M
- **Kanıt:**
  - Kaybedilen tur `status: 'failed'` yazılıyor (`complete/route.ts:101`).
  - `/start` yalnızca `completed`'ı kilitliyor, diğer her durumda (`failed` dahil) aynı oturum kimliğini "yarım kalan" diye geri veriyor (`start/route.ts:56-73`).
  - İkinci turun `/complete` çağrısı `updateMany where status:'active'` ile 0 satır güncelliyor ve 409 "Oyun zaten tamamlandı" dönüyor (`complete/route.ts:97-110`, `:177-182`).
  - Hub `playedToday`'i yalnızca `completed` ile hesapladığı için kaybedilen oyun "oynanmadı" görünüyor (`status/route.ts:33`) ve kullanıcıyı bu döngüye davet ediyor.
  - İstemci 409'da hata toast'ı basıp istemcinin `won` değeriyle sonuç ekranı kuruyor (`use-mini-game.ts:126-128`). İkinci turu kazanan kullanıcı "Zihin Temizlendi! 🏆" başlığının altında "Ödül için 15 skor gerekiyordu" görüyor (`game-shell.tsx:274-294`).
  - Ayrıca `active` oturum her `/start`'ta yeniden veriliyor (`start/route.ts:69-73`). Turu kaybedeceğini gören oyuncu sayfayı yenileyerek sınırsız yeniden deneme hakkı kazanıyor. "Günde 1 hak" vaadi (`page.tsx:19`) fiilen yok.
- **Sorun:** Kaybeden kullanıcı oynayıp emeğinin "kaydedilemedi" diye çöpe atıldığını görüyor, bu en kötü duygusal an. Kazananlar ise sınırsız deneme hakkıyla kuralı deliyor. Turnuva adaleti de bozuluyor.
- **Öneri:** Oturum durum makinesini netleştir: `active → completed | failed | abandoned`. `/start` `failed`'ı da kilitlemeli (`canPlay:false, alreadyPlayed:true, lastResult`). Bilinçli bir "ikinci şans" isteniyorsa açık bir ürün kararı olarak modelle: `attempts` sayacı, en fazla 2 deneme, ikincisi ödülsüz ya da yarım ödüllü. Yarım kalan aktif oturum yeniden başlatılabilir olmamalı. `/start` yeni bir `attemptNonce` üretsin ve önceki aktif deneme otomatik `abandoned` sayılsın (ödülsüz, "deneme hakkını harcadın" mesajıyla). Hub (`status`) `completed` ve `failed` için birlikte "bugün oynandı" demeli. İstemcide 409 yanıtında sunucunun döndürdüğü kayıtlı sonuç gösterilmeli; istemci `won`'u asla kullanılmamalı.

### B3. Oyun bileşeni statik registry'yi kullanıyor; admin'in etkin ayarları (eşik, maxScore, başlık, renk) istemciye ulaşmıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / mimari · **Efor:** S
- **Kanıt:** `mind-thief-game.tsx:24` `const DEF = getMiniGame('mind-thief')!` (statik). Kazanma kararı `:233` (`DEF.rewardThreshold`) ve `:271` (`DEF.maxScore`) üzerinden veriliyor. Kabuk metinleri ve rengi `:328-338`. Sunucu ise `getEffectiveMiniGame` + `computeEffectiveReward` kullanıyor (`complete/route.ts:35`, `:87`, `lib/minigame-config-effective.ts:40-57`). `/start` etkin config'i dönüyor (`start/route.ts:96-102`) ve hook bunu `config` olarak saklıyor (`use-mini-game.ts:70`), ama bileşen `game.config`'i hiç okumuyor.
- **Sorun:** Admin eşiği 15'ten 10'a düşürürse 12 skorla bitiren oyuncuya istemci `won=false` der ve sunucu ödül vermez (`eligible = won && …`, `complete/route.ts:86`). Admin eşiği 20'ye çıkarırsa istemci "Kazandın" gösterir, sunucu 0 puan verir ve oturumu `completed` yapar. Hub admin'in başlık ve rengini gösterirken (`games-hub.tsx:53-60`) oyun sayfası eski adı ve rengi gösterir.
- **Öneri:** Bu tasarımda kazanma kararını istemciye bırakmak zaten hatalı. `won` sunucuda `clampedScore >= effective.rewardThreshold` (veya B1'deki replay doğrulaması) ile türetilmeli, istemci bayrağı kaldırılmalı. Görsel taraf için sayfa sunucu bileşeninde `getEffectiveMiniGame('mind-thief')` çağırıp `def` prop'unu oyun bileşenine geçirmeli. Bu, `enabled=false` ise "Oyun bakımda" boş durumunu render etmeyi ve metadata başlığını da çözer. Erken bitiş eşiği (`maxScore`) `game.config ?? def`'ten okunmalı. 20 oyunda aynı desen olduğundan bu değişiklik `GameShell`/`useMiniGame` seviyesinde tek seferde yapılmalı.

### B4. State updater içinde yan etki: can kaybı, zamanlayıcı ve ağ isteği `setComments(prev => …)` içinde tetikleniyor
- **Önem:** orta · **Kategori:** doğruluk / React kuralları · **Efor:** S
- **Kanıt:** `mind-thief-game.tsx:184-192`: updater içinde `loseLife(...)` çağrılıyor. Bu çağrı `livesRef` azaltıyor, `setBossAngry`/`setLives`/`setCombo` çağırıyor, `setTimeout` kuruyor, ses ve haptik tetikliyor, can 0'sa `endGame` → `game.finish` → `fetch('/complete')` (`:113-131`, `:100-111`). `next.config` içinde `reactStrictMode: true` (`next.config.*:258`), React 19.
- **Sorun:** React updater'ların saf olmasını şart koşuyor. StrictMode (geliştirme) updater'ı iki kez çağırdığı için süresi dolan her bozuk kart geliştirmede **2 can** götürüyor; bu, geliştirici testini yanıltıyor. Üretimde, eşzamanlı render'da kuyruk yeniden uygulanırsa (ör. tıklama ile zamanlayıcı güncellemesi aynı anda) updater yeniden çalışıp çift ceza verebilir. Bu doğrulanmadı, ama React'in garanti vermediği bir davranış. Render sırasında `fetch` başlatmak da aynı sınıfta bir ihlal.
- **Öneri:** Kart durumunu ref tabanlı bir oyun modeline taşı (`commentsRef: Map<id, Comment>`). Süre aşımında önce ref'te "hâlâ var mı" kontrolü yapılsın, ceza updater dışında uygulansın, sonra `setComments(prev => prev.filter(...))` saf kalsın. Daha iyisi: tek bir `requestAnimationFrame` oyun döngüsü (spawn, ttl, öfke, sayaç tek saatte) ve React'e yalnızca anlık görüntü (`useSyncExternalStore` veya 10 Hz state). Bu, B7'deki duraklatmayı da kolaylaştırır. Dağınık per-kart `setTimeout`'lar (`:184`, `:217`, `:116`) da temizlenmiyor; tek döngü bunları ortadan kaldırır.

### B5. Framer-motion inline `transform`'u eziyor: kartlar merkezlenmiyor, 3B derinlik hiç çalışmıyor, mobilde sağdan kırpılıyor
- **Önem:** orta · **Kategori:** görsel / mobil · **Efor:** S
- **Kanıt:** `mind-thief-game.tsx:426` `animate={{ scale, y: [...] }}`, `:433` `style.transform: translate(-50%,-50%) translateZ(z)`. framer-motion 11.18.2 `useStyle` önce ham stili kopyalıyor, sonra `buildHTMLStyles` transform değerleri (`scale`, `y`) olduğu için `style.transform`'u kendi ürettiği string ile değiştiriyor (`node_modules/framer-motion/dist/cjs/index.js` `useStyle` ~11137-11146, `buildHTMLStyles` ~5821-5856). Animasyon karelerinde de `element.style.transform` framer tarafından yazılıyor. Proje belleğindeki "framer inline transform … ezer" tuzağıyla aynı sınıf. Kod okumayla doğrulandı; ekran görüntüsüyle doğrulanmadı.
- **Sorun:**
  1. `translate(-50%,-50%)` kayboluyor, kartın sol üst köşesi (x%, y%) noktasına oturuyor. FX patlamaları (`toPx(c.x,c.y)`) kart merkezine değil köşesine düşüyor.
  2. `translateZ` + `perspective: 900px` (`:383`) ile kurgulanan derinlik efekti fiilen yok.
  3. x %84'e kadar çıkabiliyor (`:177`). 375 px telefonda arena ≈ 319 px (layout `px-3` + GameShell `p-4`), kart genişliği 168 px'e kadar, yani kartın ~115 px'i `overflow-hidden` ile kesiliyor. Metin okunmadan karar verilmesi gerekiyor.
- **Öneri:** Konumlamayı framer'a ver: dış `div` (konum: `left/top` + `translate(-50%,-50%)` sınıfı, framer'sız), iç `Motion.button` (scale/y). Ya da `x: '-50%', y: '-50%'` değerlerini framer'ın kendi transform değerlerine ekle, derinlik için `z`/`transformPerspective` kullan. Spawn konumunu arena genişliği ve ölçülen kart genişliğine göre sınırla (`xMin = cardW/2`, `xMax = W - cardW/2`). Mobilde kartlar 2 satırlı ve en fazla `min(168px, 46vw)` olsun.

### B6. Boss3D her öfke geçişinde WebGL renderer'ı baştan yaratıyor
- **Önem:** orta · **Kategori:** performans · **Efor:** S
- **Kanıt:** `mind-thief-game.tsx:411` `color={rage ? '#f43f5e' : DEF.accent}`. `boss-3d.tsx:30-174` efektin bağımlılıkları `[color, size]`, her değişimde `new THREE.WebGLRenderer` (`:37`) ve cleanup'ta yalnızca `renderer.dispose()` (`:161`), `forceContextLoss()` yok. Öfke 12/24/36. saniyelerde açılıp kapanıyor (`:209-222`), yani bir turda ~7 renderer yaratılıyor.
- **Sorun:** Her yeniden kurulum, tam da öfke anında (en çok aksiyonun olduğu an) bir kare düşmesi, canvas'ın kaybolup belirmesi ve geometri/materyal/ışık yeniden derlemesi demek. `dispose()` bağlamı hemen bırakmadığı için tarayıcının ~16 WebGL bağlamı sınırına yaklaşılıp "Too many active WebGL contexts" uyarısı alınabilir. Bu doğrulanmadı, ama bilinen bir three.js davranışı. Ayrıca boss bileşeni zaten bir "kızgın" rengine (`#ff2d55`) sahip (`boss-3d.tsx:51`, `:145-152`), dışarıdan renk değiştirmek gereksiz.
- **Öneri:** `color`'ı da `angry` gibi bir ref üzerinden animasyon döngüsünde lerp'le. Efekt yalnızca `size` değişince kurulsun, `rage` için ayrı bir `mood` prop'u olsun. Cleanup'ta `renderer.forceContextLoss()` ekle. `reduce-animations` ve WebGL'siz durumda boş div yerine statik bir SVG/PNG boss göster, yoksa arenanın merkezi boş kalıyor.

### B7. Duraklatma ve sekme görünürlüğü yönetimi yok
- **Önem:** orta · **Kategori:** UX / adalet · **Efor:** M
- **Kanıt:** Sayaç `Date.now() - startedAt` (`mind-thief-game.tsx:224-229`). Kart süre aşımları bağımsız `setTimeout` (`:184`). `visibilitychange` veya `pagehide` dinleyicisi yok.
- **Sorun:** Mobilde bildirim, arama ya da uygulama değiştirme sırasında tur arka planda akıyor. Kısılan zamanlayıcılar geri gelince toplu can cezası kesiyor, oyuncu "hiç oynamadan" günlük hakkını kaybediyor. Kullanıcıların çoğu QR sonrası mobilde olduğu için bu yaygın bir senaryo.
- **Öneri:** Tek oyun saatine (B4) `paused` durumu ekle. `document.visibilitychange` ile otomatik duraklat ve "Devam et" kaplaması göster (3-2-1 geri sayımla). Duraklatma toplamını `durationSec` hesabından düş, sunucu tarafında da "duraklatma sayısı" sınırı koy (hile kaçağı olmasın).

### B8. Turnuva ve liderlik: eşit skorlar belirsiz, hata durumu yanıltıcı, ilk 100 dışı görünmez
- **Önem:** orta · **Kategori:** veri doğruluğu / UX · **Efor:** M
- **Kanıt:** `maxScore = 30` (`lib/minigame-config.ts:80`), 30'a ulaşınca tur erken bitiyor (`mind-thief-game.tsx:271`), dolayısıyla çok sayıda oyuncu tavanda toplanıyor. Sıralama yalnızca `_max.starsCollected desc` (`leaderboard/route.ts:47-53`, `tournament/route.ts:29-35`), ikincil anahtar yok. Turnuva GET ve POST sırayı ayrı ayrı yeniden hesaplıyor (`tournament/route.ts:85-94`, `:147`). `take: 100` olduğu için `me` ve `totalPlayers` 100'le sınırlı (`leaderboard/route.ts:52`, `:76-84`). İstemci hata durumunda boş liste gösteriyor (`game-leaderboard.tsx:40`, `:55-60`).
- **Sorun:** Haftalık 500/300/150 puanlık ödüllerin sahibi eşitlikte veritabanı sırasına kalıyor. GET'te "Geçen hafta 2. oldun" görüp POST'ta farklı sıraya düşmek (ödülün değişmesi veya 400) mümkün. Bu doğrulanmadı, ama sorgu deterministik değil. Ağ hatasında "Henüz skor yok — ilk rekoru sen kır!" yazması yanlış bilgi.
- **Öneri:** Skora ikincil anahtar ekle: en erken `completedAt` (ilk ulaşan kazanır) veya süre (`durationSec` asc). Bunun için `MiniGameSession`'a `durationMs` alanı ve groupBy yerine `DISTINCT ON (userId)` ile ham SQL ya da günlük materyalize tablo gerekiyor. Turnuva kapanışında sırayı cron ile **dondur** (`TournamentResult` tablosu), POST bu donmuş sonucu okusun. Kendi sıram için `COUNT(*) WHERE best > myBest` sorgusu kullan, 100 sınırı kalksın. Hata durumunu ayrı bir "Tablo yüklenemedi · Yeniden dene" durumuyla göster. Tavanı yükseltmek (ör. maxScore 60 + süre bonusu) skorları ayrıştırır.

### B9. Turnuva bloğu tema token'larıyla koyu sabit zemine basılıyor; müşteri tarafında admin toast'ı kullanılıyor
- **Önem:** orta · **Kategori:** görsel / dil · **Efor:** S
- **Kanıt:** GameShell zemini sabit koyu (`game-shell.tsx:101-102`). Turnuva satırları renk vermeden (varsayılan `foreground`) ve `text-muted-foreground`, `text-yellow-600`, `bg-primary/10`, `bg-muted/40` ile çiziliyor (`game-tournament.tsx:117`, `:136-150`, `:161-177`). Liderlik bileşeni ise doğru biçimde `text-white/..` kullanıyor (`game-leaderboard.tsx:72-107`). Toast kaynağı `@/lib/admin-toast` (`game-tournament.tsx:6`), bu kaynak "Basarili: " ve "Dikkat: " öneklerini ekliyor (`lib/admin-toast.ts:14-20`).
- **Sorun:** Açık temada turnuva isimleri ve skorları koyu yazı olarak koyu zemine düşüyor ve okunmuyor. Bu ekran görüntüsüyle doğrulanmadı, ama token'lar açık temada koyu. Ödül alma toast'ı "Basarili: 🏆 1. oldun — +500 puan!" biçiminde, Türkçe karakter eksik ve admin paneli tonunda.
- **Öneri:** Oyun kabuğu için bir "koyu yüzey" token seti tanımla (`--game-fg`, `--game-muted`, `--game-surface`) ve GameShell'de `className="dark"` kapsamı veya `data-theme="dark"` ile alt bileşenleri koyu temaya zorla. Bu, tüm oyun içi bileşenleri tutarlı yapar. Müşteri bileşenlerinde doğrudan `sonner` kullanılmalı. `admin-toast` için ESLint `no-restricted-imports` kuralıyla `components/customer/**` engellenmeli.

### B10. Tamamlamada başarım istatistikleri iki kez hesaplanıyor
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `complete/route.ts:90-94` (işlemden önce) ve `:199` (işlemden sonra) `computeAchievementStats(prisma, userId)` çağrılıyor. Her biri kullanıcının tüm oyun oturumlarını tarıyor (`lib/game-achievement-stats.ts:18`).
- **Sorun:** Her oyun bitişinde gereksiz iki ağır sorgu çalışıyor. Neon gecikmesiyle sonuç ekranı ("Sonuç kaydediliyor…") uzuyor. İşlem dışında "önce" ölçümü yarış koşullarına da açık: aynı anda iki oyun bitirilirse aynı başarım iki kez "yeni" sayılabilir.
- **Öneri:** Başarım açılışını kalıcı hale getir (`UserAchievement` tablosu, `@@unique([userId, achievementId])`, `createMany skipDuplicates`). "Yeni" bilgisi insert'ten dönen sayıdan gelsin, tek hesaplama yeter. Bildirim oluşturmayı `after()` ile yanıttan sonra yap.

### B11. Azaltılmış hareket iki ayrı sistemle ve birbirini tamamlamadan uygulanıyor
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** Framer `MotionConfig reducedMotion="user"` yalnızca işletim sistemi tercihini dinliyor (`components/providers.tsx:232`). Boss3D, FxLayer, ses ve haptik yalnızca uygulama içi `html.reduce-animations` sınıfını dinliyor (`boss-3d.tsx:33`, `fx-layer.tsx:45-48`, `game-sounds.ts:10-13`). CSS kuralları (`globals.css:801-832`) JS tabanlı framer ve three.js animasyonlarını durdurmuyor.
- **Sorun:** İşletim sisteminde "hareketi azalt" açık olan kullanıcı dönen 3B boss'u, parçacık patlamalarını ve şok dalgalarını yine görüyor. Uygulama içi ayarı açan kullanıcı ise sonsuz kart sallanması (`mind-thief-game.tsx:426-428`) ve öfke nabzını (`:373`) yine görüyor. Ayrıca ses, hareket tercihine bağlanmış; bunlar ilgisiz iki tercih.
- **Öneri:** Tek bir `usePrefersReducedMotion()` kancası: OS tercihi veya uygulama sınıfı. Sınıfı `MotionConfig reducedMotion` değerine de bağla (`"always"`). Boss3D azaltılmış modda dönmeyen statik bir kare çizsin. Sesi ayrı bir `sound` tercihine taşı (B12).

### B12. Erişilebilirlik ve mobil oynanabilirlik: renk-tek ayrım, küçük dokunma hedefleri, duyuru yok
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil · **Efor:** M
- **Kanıt:** Bozuk ve gerçek ayrımı kırmızı/yeşil gradyan (`mind-thief-game.tsx:303-324`) ve 11 px metinle yapılıyor (`:429`). Kart ölçeği 0.78–1.18 (`:416`), `px-3 py-2` ile ~24-30 px yükseklik. Lejant 10 px ve `text-white/40` (`:451`). Can, skor ve süre için `aria-live` yok (`:341-362`). Mobilde sayfa başlığı gizli (`page-heading.tsx:21`).
- **Sorun:** Deuteranopi ve protanopide (erkeklerin ~%8'i) kırmızı-yeşil kartlar zaman baskısı altında ayırt edilemiyor; yalnızca metni okumak kalıyor ve oyun haksızlaşıyor. Dokunma hedefleri WCAG 2.5.8 (24 px) sınırında, Apple/Google önerisi olan 44 px'in çok altında. Ekran okuyucu kullanıcısı için oyun hiç oynanamaz, alternatif yol da yok.
- **Öneri:** Kart türünü şekil ve ikonla da kodla: bozuk kart için çatlak kenar + `Skull`/`Bug` ikonu + titreşen kenarlık, gerçek kart için yuvarlak + `ShieldCheck`. En küçük dokunma hedefi 44 px olsun (görsel kart küçük kalsa bile `::before` ile görünmez genişletilmiş alan). Yüksek kontrast modunda (`html.high-contrast`) desen dolguları kullan. HUD için `role="status" aria-live="polite"` ile can ve kombo duyurusu yap. Ekran okuyucu için "erişilebilir mod" sun: sırayla gelen yorumlar, "Bozuk / Gerçek" iki butonu, süre 2×. Ödül eşiği bu modda da aynı kalsın.

### B13. Yanıltıcı ürün metinleri ve dil karışıklığı
- **Önem:** düşük · **Kategori:** içerik / UX · **Efor:** S
- **Kanıt:** "Patron her seviyede güçleniyor!" (`lib/minigame-config.ts:77`, `lib/minigame-copy.ts:53`), oyunda seviye yok. "❄️ Zaman Dondur" (`mind-thief-game.tsx:62`) tur sayacını dondurmuyor (`:224-228`). `:182`'deki yorum "Dondurulduğunda süre uzar" ama kod kartı cezasız siliyor (`:187-190`). "Günde 1 hak!" (`page.tsx:19`) B2 nedeniyle doğru değil. Lejantta "power-up" (`:452`). Kilit ekranında "00:00 (UTC)" (`game-shell.tsx:323`).
- **Sorun:** Oyuncu power-up'ın etkisini yanlış anlıyor ve beklenti kırılıyor. Teknik terimler (UTC, power-up) tüketici diline uymuyor.
- **Öneri:** Power-up'ı ya gerçekten zaman donduracak hale getir (tek oyun saatinde `frozen` iken `elapsed` artmasın; B4 ile kolay) ya da adını "❄️ Kalkan: 3,5 sn ceza yok" yap. "Seviye" vaadi için gerçek bir faz sistemi kur (B-vizyon: 3 dalga + boss fazı) ya da metni "Patron öfkelendikçe hızlanıyor" diye düzelt. Sıfırlama saatini yerel saatle ve geri sayımla ver ("Yeni hak 03:00'te · 5 sa 12 dk").

### B14. Ölü kod ve küçük kod kalitesi sorunları
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt:** `mind-thief-game.tsx:155` `const elapsed` spawn içinde kullanılmıyor. `:243` `eslint-disable react-hooks/exhaustive-deps`. `:24` non-null assertion (`getMiniGame(...)!`). `:67` modül seviyesinde `let _seq` (HMR veya çoklu örnekte paylaşılıyor, zararsız ama gereksiz). `boss-3d.tsx:141-142` her karede `Math.random()` sarsıntı (sarsıntı 0'a yakınken de çalışıyor, ihmal edilebilir).
- **Öneri:** B4'teki tek döngü yeniden yazımında bu dağınıklık doğal olarak gider. `DEF` prop olarak gelirse (B3) assertion kalkar.

---

## Eksik özellikler (kıyas ürünlerle)

1. **İlk oyun öğreticisi ve "nasıl puan kazanılır" paneli** (Duolingo'nun ilk derste el tutması gibi): 3 adımlı etkileşimli tanıtım (bozuğa dokun, gerçeğe dokunma, power-up), kombo ve öfke kurallarının görsel anlatımı. Bir kez gösterilsin, sonra "?" düğmesiyle açılsın.
2. **Günlük hak ve sıfırlama sayacı** (Starbucks Rewards "Next reward in…" gibi): sayfa açılır açılmaz durum (oynandı / oynanmadı / kayıp) ve yerel saatle geri sayım. Hub'daki seri (streak) bilgisi oyun sayfasında da görünsün ("🔥 4 gün, bugün oynarsan 5").
3. **Sonuç ekranında sonraki adım ve paylaşım** (Spotify Wrapped / Duolingo ders sonu): "Kişisel rekor!" ve "Dünkünden +6" karşılaştırması, ödülün cüzdana akış animasyonu, "Sıradaki oyun: Gerçek mi Sahte mi →" CTA'sı, paylaşılabilir skor kartı (OG görseli).
4. **Kişisel istatistik ve ilerleme**: en iyi skor, isabet oranı (bozuk/gerçek doğruluğu), ortalama tepki süresi, son 7 günün mini grafiği. Revolut/Monzo'nun "Insights" yaklaşımı gibi, oyunun "yorum okuryazarlığı" becerisini geliştirdiğini somutlaştırır.
5. **Duraklatma, ses kapatma ve titreşim tercihleri**: oyun içi ayar çekmecesi (mobil oyunların standardı).
6. **Arkadaş ve lig katmanı**: "Arkadaşların arasında 3.sün", turnuvada kendi ligin (Duolingo ligleri gibi benzer seviyedeki 30 kişi). Mevcut "tüm zamanlar top 10" tablosu yeni kullanıcı için ulaşılamaz ve motive etmiyor.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı QR okuttuktan sonra 60 saniyelik, adil ve "bir daha" dedirten bir mikro oyun oynamalı. Sonunda ödülünü cüzdanına akarken görmeli ve ertesi gün neden döneceğini bilmeli. Oyunun "yorum okuryazarlığı" fikri (sahte ve öfke dolu yorumu ayırt etmek) Qratex'in güven anlatısını pekiştirmeli. Bunun için sahte yorum metinleri gerçek platform dilinden üretilmiş ve çeşitlendirilmiş olmalı (şu an 8+8 sabit cümle var, `mind-thief-game.tsx:41-60`; 2-3 oyunda ezberleniyor).

**Yerleşim (mobil öncelikli):**
1. **Üst şerit (sticky, safe-area uyumlu):** geri (hub), oyun adı, "?" (kurallar), ses/duraklat.
2. **Durum kartı (oyun öncesi):** büyük boss önizlemesi; bugünkü hak durumu ve sıfırlama sayacı; seri; kişisel rekor; ödül eşiği ilerleme çubuğu ("15 temizlikte 160 puan").
3. **Arena:** yükseklik `min(420px, 60dvh)`, kartlar ızgara tabanlı "slot"larda (3×3 sanal ızgara + jitter) belirsin. Böylece çakışma olmaz ve kenar taşması biter. HUD üstte tek satırda; süre çubuğu ilerleme halkası olarak boss'un etrafına sarılsın (gözü arenadan ayırmadan).
4. **Fazlar:** 0-15 sn ısınma, 15-30 sn öfke dalgaları, 30-45 sn "boss fazı": boss'un kalkanı var, bozuk kartlar kalkanı düşürüyor, son 5 sn'de boss'a dokunarak bitirme vuruşu. Böylece "her seviyede güçleniyor" vaadi gerçek olur.
5. **Sonuç:** skor sayacı yukarı sayar, eşik çizgisi geçilince ödül çipi cüzdan ikonuna uçar. Ardından kişisel istatistik, turnuva sırasındaki değişim ("12. → 7.") ve "Sıradaki oyun" kartı gelir.

**Motion / 3D (yerinde ve ölçülü):**
- Boss3D kalsın ama tek kalıcı renderer olsun, ruh hali (sakin / öfkeli / yenilgi) uniform/lerp ile değişsin. Yenilgi anında kısa bir parçalanma animasyonu (ikozahedron yüzlerinin dağılması, ~600 ms) oyunun tek "vay" anı olsun.
- Kart çıkışında `rotateZ: 25` yerine "zihinden sökülme" efekti: kart boss'a doğru emilir (bozuk) ya da yeşil kalkanla parlar (gerçek kart korunmuşsa, süre dolunca ödül olarak +0 ama kombo korunur).
- Sonsuz y-bob animasyonu kaldırılsın veya amplitüdü azaltılsın (okunabilirliği düşürüyor). `backdrop-blur` kartlarda kapatılsın (WebGL üstünde pahalı).
- Azaltılmış harekette: statik boss görseli, FX yok, kartlar opaklıkla belirsin. Oynanış süresi aynı kalsın.

**Veri / API değişiklikleri:**
1. `GET /api/customer/games/mind-thief/state` (veya `status` genişletmesi): `{ playedToday, lastResult, attemptsLeft, resetsAt, personalBest, streak, effectiveConfig }`. Sayfa sunucu bileşeninde ön yüklesin, istemci SWR ile tazelesin.
2. `/start`: `seed`, imzalı `attemptToken`, `config`. `failed` ve `abandoned` kilitlesin (B2).
3. `/complete`: skor yerine olay günlüğü. Sunucu replay ile skoru ve `won`'u hesaplasın (B1, B3). Yanıt kayıtlı sonucu her zaman döndürsün, 409'da da.
4. `MiniGameSession`: `durationMs`, `attempt`, `eventsHash`, `accuracy` alanları. Liderlik ve turnuva için eşitlik kırıcı (B8).
5. Oyun kategorisi için `points-caps` tavanı ve velocity tetikleyici (B1).
6. `UserAchievement` kalıcı tablo (B10).

---

## Çakışmalar / birleştirme önerisi

- **Mekanik çakışması:** Mind-thief'in çekirdek becerisi ("bozuk/sahte yorumu ayırt et, gerçeğe dokunma") şu oyunlarla büyük ölçüde örtüşüyor:
  - `/customer/games/truth-vs-fake`: aynı ayrım, kaydırma ile (`lib/minigame-config.ts:87-91`).
  - `/customer/games/troll-slayer`: dokun-yok et, aynı dalga ve zamanlayıcı iskeleti (`troll-slayer-game.tsx:14`, `:226`).
  - `/customer/games/guardian-of-trust`: "bozuk yorumlar enfekte etmeden koru", aynı can ve süre kalıbı (`guardian-of-trust-game.tsx:14-15`).
  - `/customer/games/review-detective`: sahte yorumu bul.

  Ayrıca `network-defender` ve `spam-defense` aynı "enfeksiyon/çekirdeği koru" anlatısını paylaşıyor. 20 oyunluk katalogda en az 5 oyun aynı fikrin varyasyonu. Bu, Hub'da seçim yorgunluğu yaratıyor ve günde 20 × 160 puanlık potansiyel ekonomi baskısını (B1) büyütüyor.
- **Öneri:** Mind-thief'i (3B boss'u en güçlü sunum olduğu için) bu ailenin **amiral oyunu** olarak koru. `truth-vs-fake` ve `troll-slayer`'ı ya mind-thief'in fazları/modları olarak birleştir ("Kaydırma modu", "Dalga modu") ya da haftalık dönüşümlü "öne çıkan oyun" havuzuna al. Teknik tarafta 20 oyunun kopyaladığı iskeleti (zamanlayıcılar, can/kombo, endGame, HUD) `useArcadeLoop` + `<ArcadeHud>` ortak katmanına çıkar. B3/B4/B7/B11 düzeltmeleri böylece tek seferde tüm oyunlara yayılır.
- **Kaldırma:** Önerilmiyor. Sayfa günlük geri dönüş kancası olarak değerli ve görsel kalitesi katalogda üst sırada.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod çalıştırılmadı, veritabanına dokunulmadı. Okunan dosyalar: `app/customer/games/mind-thief/page.tsx`, `components/customer/games/mind-thief-game.tsx`, `components/customer/games/game-shell.tsx`, `lib/use-mini-game.ts`, `app/api/customer/games/[game]/{start,complete}/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/points-velocity.ts`, `lib/points-caps.ts`, `lib/tournament-core.ts`, `app/api/admin/games/route.ts`.

### 1. İstemci kaynaklı skor/won ile oyun ve turnuva puanı basılabiliyor: **DOĞRULANDI**

- `complete/route.ts:15-22`: `score`, `durationSec` ve `won` doğrudan istemciden alınıyor. Sunucu yalnızca `maxScore`'a sıkıştırıyor (`:61`) ve iki süre koşuluna bakıyor (`:81-83`). Sunucu `startedAt` ölçümü gerçek bir alt sınır, ancak 8 sn beklemek yetiyor (`lib/minigame-config.ts:84` → `minDurationSec: 8`). Oynanış kanıtı (olay günlüğü, tohumlu replay, sunucu tarafı tick sayısı) yok.
- Puan tavanı yok: `lib/points-caps.ts:23,43` yalnızca `feedback` kategorisini kapsıyor. `lib/points-velocity.ts` engellemiyor, yalnızca leaderboard'da işaretliyor (`app/api/leaderboard/route.ts:8`). Eşik 500/24 saat; 160'lık tek oyun bunu tetiklemiyor.
- Yeniden üretim: Müşteri oturumuyla `POST /api/customer/games/mind-thief/start` gönderilip `sessionId` alınır. ≥8 sn sonra `POST .../complete` `{sessionId, score:30, won:true, durationSec:9}` gönderilir. Sonuç `eligible=true` (`:86`) ve 30≥15 olduğu için `computeEffectiveReward` 160 puan + 80 XP döner. Günün ilk ödüllü oyunuysa seri XP'si de eklenir (`:116-147`). Oturum `completed` olur ve `starsCollected=30` yazılır.
- Turnuva: `tournament/route.ts:28-38` `completed` oturumlarda kullanıcı başına `max(starsCollected)` alıp sıralıyor. 30 tavan skor olduğundan hile yapan herkes 30 ile eşitleniyor. Eşitlik bozucu yok (yalnızca `orderBy _max desc`), bu yüzden ilk 3 (500/300/150, `lib/tournament-core.ts:13`) DB'nin keyfi sırasıyla belirleniyor. Dürüst bir oyuncunun ödüle girmesi de pratikte imkânsızlaşıyor.
- Kapsamı sınırlayan etken: `@@unique([userId, gameType, dayKey])` nedeniyle her oyun günde en fazla bir kez ödül veriyor. Yani hile "sınırsız" değil, tasarlanan günlük tavanı becerisiz ve otomatik toplamaya izin veriyor. Registry'de 20 tanım var (`grep -c gameType` = 20, pacman ayrı akışta). Tümü aynı generic `complete` rotasını kullandığı için açık ortak. Bu yalnızca mind-thief'e özgü değil, ama bu sayfa da etkileniyor.
- Not: Saf istemci tarafı oyunlarda bu tam olarak kapatılamaz. Gerçekçi hedef, maliyeti yükseltmek ve ekonomiyi sınırlamak: (a) `start` sunucu tohumu (seed) döndürür, istemci tıklama olaylarını (zaman damgası ve hedef id) gönderir, sunucu tohumdan spawn dizisini yeniden üretip skoru hesaplar. (b) Bu yapılana kadar `category:'game'` için günlük/haftalık `points-caps` tavanı eklenir. (c) Turnuvada tavan skorlu eşitlikleri ilk ulaşma zamanı (`completedAt asc`) ve süre ile bozan deterministik bir sıralama kullanılır. (d) Velocity dedektörü yalnızca işaretlemek yerine turnuva ödül talebini (`POST`) bloke eder.

### 2. failed oturum yeniden başlatılıyor ama tamamlaması hep 409; aktif oturum yenilemeyle sınırsız deneniyor: **DOĞRULANDI**

- `start/route.ts:56-73`: Mevcut oturum yalnızca `status === 'completed'` ise kilitleniyor. `failed` oturum "yarım kalan aktif oturum" dalına düşüyor ve aynı `sessionId` `canPlay:true` ile geri dönüyor. Yorum (`:69`) bu durumu aktif oturum varsayıyor, ama `failed` için yanlış.
- `complete/route.ts:97-110`: `updateMany where status:'active'` `failed` oturumda `count=0` veriyor ve `:175-179` 409 "Oyun zaten tamamlandı" döner. `status/route.ts:33` yalnızca `completed`'i "bugün oynandı" sayıyor, yani hub kaybedene oyunu hâlâ oynanabilir gösteriyor.
- Yeniden üretim (UX): Oyuncu 3 canını kaybeder. `endGame(false)` (`mind-thief-game.tsx:128`) çalışır ve oturum `failed` olur. Hub'dan tekrar girer, `start` aynı id'yi verir, oyuncu 45 sn oynayıp 15+ yapar ve `endGame(true)` çağrılır. Sunucu 409 döner. `use-mini-game.ts:126-128` hata toast'ı gösterir ve `won=true, rewarded=false` sonucunu kurar. `game-shell.tsx:80-81` "Kazandın! 🎉" başlığını, `:290-293` ise "Ödül için … skor gerekiyordu" notunu birlikte gösterir. Ekrandaki mesaj çelişkili ve yanıltıcı.
- Yeniden üretim (kural ihlali): Oyuncu kaybedeceğini anlayınca (son can, düşük skor) `endGame` tetiklenmeden sayfayı yeniler. Oturum `active` kalır ve `start` aynısını döner (`:70-73`). Deneme sayısı sınırsız. `startedAt` sıfırlanmadığı için süre kontrolü buna engel olmuyor. "Günde 1 hak" (page.tsx:19) fiilen "günde 1 başarılı gönderim" anlamına geliyor.
- Öneri: `MiniGameSession`'a `attempts` sayacı veya `attemptStartedAt` eklenmeli. `start` `failed` için `canPlay:false, alreadyPlayed:true` dönmeli (ya da kasıtlı "kaybedersen tekrar dene" kuralı varsa oturumu açıkça `active`'e çevirmeli). Aktif oturumun yeniden alınması sayılmalı (örneğin 2. yeniden alışta oturum `failed`'e düşer). `status` rotası `failed`'i de "oynandı" saymalı. İstemcide 409 geldiğinde sonuç ekranı "Kazandın" yerine "bugünkü hakkın kullanılmış" durumunu göstermeli.

### 3. İstemci statik eşik kullanıyor; admin override'ı ile won kararı ve ödül ayrışıyor: **DOĞRULANDI**

- `mind-thief-game.tsx:24` `DEF = getMiniGame('mind-thief')` (statik registry). `:233` süre sonunda `won = scoreRef >= DEF.rewardThreshold`, `:271` ise `DEF.maxScore`. `:334` GameShell'e de `DEF.rewardThreshold` veriliyor. `use-mini-game.ts:70` sunucudan gelen `config`'i saklıyor ama bileşen onu hiç kullanmıyor.
- Admin eşiği gerçekten ezebiliyor: `app/api/admin/games/route.ts:144,182` ve `lib/minigame-config-effective.ts:49`. Sunucu ödülü effective eşikle hesaplıyor (`complete/route.ts:87`, `minigame-config-effective.ts:112`).
- Yeniden üretim (eşik 15→10): Oyuncu süre sonunda 12 skor yapar. İstemci `won=false` gönderir, sunucuda `eligible=false` olur ve oturum `failed`'e düşer (`:101`). Sunucu eşiğini geçtiği hâlde ödül alamaz. Üstelik iddia 2 yüzünden günün hakkı da yanar.
- Yeniden üretim (eşik 15→20): Oyuncu 16 yapar. İstemci `won=true` gönderir, sunucu 0 puan verir ve oturumu `completed` yapar. Ekranda "Kazandın" başlığı, "Kazandın ama ödül eşiğini geçemedin" toast'ı (`use-mini-game.ts:115`) ve yanlış "Ödül için 15 skor gerekiyordu" notu (statik `DEF` değeri) görünür.
- Öneri: Bileşen `game.config` (sunucunun effective `rewardThreshold`/`maxScore` değerleri) yüklenmeden oyunu başlatmamalı ve bütün eşik/tavan karşılaştırmalarını ve GameShell prop'unu buradan beslemeli. Daha sağlamı, `won` kararını sunucuya taşımak: istemci yalnızca skoru göndersin, sunucu `won`/`status`'ü effective eşikle türetsin. Aynı statik `DEF` deseni diğer registry oyunlarında da varsa ortak hook düzeyinde (`useMiniGame` `threshold`/`maxScore` döndürür) çözülmeli. Bu doğrulamada diğer oyun bileşenleri tek tek okunmadı.
