# /customer/games/word-spot

**Amaç:** Müşteri panelindeki mini oyunlardan "Sahteyi Yakala". Her turda 3x3 ızgarada 9 kelime çıkar. Sekizi doğru yazılmış, biri harf hatalı ("Harika" / "Harıka"). Oyuncu 5,5 saniye içinde hatalı olanı bulur. Oyun 12 turdan oluşur ve 3 can verilir. Skor ödül eşiğini (7) geçerse ve can bitmemişse günde bir kez 150 puan ve 75 XP verilir. Bunlara ek olarak günlük seri bonusu, başarım, tüm zamanlar liderliği ve haftalık turnuva var.

**Genel puan:** 4,5/10 · **Karar:** birleştir. Oyun döngüsü teknik olarak çalışıyor ve dokunma hissi iyi. Buna karşın içerik çok sığ: 10 sabit kelime çifti var ve hiçbir şey "hızlanmıyor", oysa metin bunu vaat ediyor. Ortak altyapıdaki "günde 1 hak" kuralı yenileyerek sonsuz denemeye açık. Kaybeden oyuncu ikinci kez oynatılıyor ve sonunda hata alıyor. 12 puanlık tavan liderliği ve turnuvayı eşitliklerle dolduruyor. Mekanik "Yorum Dedektifi" ile neredeyse birebir aynı ("biri sahte, onu bul", 3 can, tur süresi). Önerim bu oyunun ayrı bir sayfa olarak kalmaması, "Sahte Avı" adlı tek bir oyunun ilk (kelime) kademesi olması.

İncelenen dosyalar:
- `app/customer/games/word-spot/page.tsx`
- `components/customer/games/word-spot-game.tsx`
- `components/customer/games/game-shell.tsx`
- `components/customer/games/fx-layer.tsx`
- `components/customer/games/game-leaderboard.tsx`
- `components/customer/games/game-tournament.tsx`
- `components/dashboard/page-heading.tsx`
- `lib/use-mini-game.ts`
- `lib/minigame-config.ts`
- `lib/minigame-config-effective.ts`
- `lib/minigame-copy.ts`
- `lib/game-sounds.ts`
- `app/api/customer/games/[game]/start|complete|leaderboard/route.ts`
- `app/api/customer/games/status/route.ts`
- `app/api/customer/tournament/route.ts`
- `app/customer/layout.tsx`
- `components/providers.tsx` (MotionConfig)
- `prisma/schema.prisma`: `MiniGameSession` (satır 493-513)
- Kıyas için: `components/customer/games/review-detective-game.tsx`, `truth-vs-fake-game.tsx`

> Not: Kod çalıştırılmadı. Dev server, test ve DB kullanılmadı. Aşağıdakiler kodun okunmasıyla doğrulandı. Çalışma anına bağlı olup okunarak kesinleşmeyen noktalar "doğrulanmadı" diye işaretli.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Tur, can, kombo, ödül ve seri akışı çalışıyor. Ancak günlük hak kuralı iki yönden kırık. "7+ doğru = ödül" vaadi can bitince geçersiz kalıyor. "Turlar hızlanıyor" vaadi sahte. Admin override'ı istemciye yansımıyor. |
| UX | 4/10 | Yanlış seçimde ya da süre bitince doğru cevap gösterilmiyor, yani öğrenme anı yok. Sayaç "6s" ile başlıyor ama gerçek süre yaklaşık 5 saniye. Açıklama üç kez tekrarlanıyor. Kaybeden oyuncu oyunu sonuna kadar oynayıp "Oyun zaten tamamlandı" hatası alıyor. |
| Görsel | 6/10 | Neon kabuk, mor radyal arena ve partiküller tutarlı ve canlı. Kartlar sade ama karakter taşımıyor. "+1"/"Yanlış! -1" yüzen yazısı iyi. Sonuç ekranı 20 oyunla aynı. |
| Mimari | 5/10 | Registry, generic API ve ortak kabuk iyi tasarlanmış. Ama oyun mantığı tamamen istemcide ve skor güvene dayalı. Tur tabanlı bir oyun olduğu için sunucunun doğrulaması kolay olurdu, bu fırsat kullanılmıyor. Statik `DEF` effective config'i ezip geçiyor. `useCallback` zinciri her render'da yeniden oluşuyor. |
| Performans | 7/10 | Hafif bir DOM oyunu. FxLayer'ın RAF döngüsü boştayken de sürekli dönüyor. `complete` başarım istatistiğini iki kez hesaplıyor. Liderlik ve turnuva sorguları önbelleksiz. |
| Erişilebilirlik + mobil | 3/10 | Kartlar gerçek `<button>`. Ancak her turda DOM'dan söküldükleri için klavye odağı kayboluyor ve 5 saniyelik turda klavyeyle oynamak pratikte imkânsız. aria-live yok. Arka plan sekmesinde süre işliyor. Ses ayrı bir ayarla kapatılamıyor. 10 px'lik ipucu metninin kontrastı düşük. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı yetki kontrolü (yalnızca CUSTOMER) | KISMİ | `app/customer/games/word-spot/page.tsx:10-13` | Giriş yapmış BUSINESS/ADMIN kullanıcı da `/auth/signin`'e yönleniyor. "Yetkin yok" yerine giriş ekranı açılıyor. |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21`, `messages/tr.json:5` | Layout şablonu `%s \| Müşteri alanı` olduğundan sonuç "Sahteyi Yakala \| QRateX \| Müşteri alanı" oluyor (çift sonek). |
| 3 | Masaüstü sayfa başlığı + açıklama | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Yalnızca `sm` ve üstünde görünüyor. h1 içinde emoji var. Açıklama, kabuktaki açıklama ve `startHint` ile aynı cümleyi üç kez tekrarlıyor. |
| 4 | Oyun devre dışıysa sayfa davranışı | KISMİ | `page.tsx` (enabled kontrolü yok), `start/route.ts:34-39` | Admin oyunu kapatsa da doğrudan URL ile sayfa açılıyor ve başlat düğmesi görünüyor. Kullanıcı ancak tıklayınca 403 toast'ı görüyor. |
| 5 | Giriş ekranı: süzülen emoji | ÇALIŞIYOR | `game-shell.tsx:173-180` | Sonsuz döngü. `MotionConfig reducedMotion="user"` (`providers.tsx:232`) dönüşümü kapatıyor, filter animasyonu sürüyor. |
| 6 | Oyun başlığı/açıklaması/emoji/renk | KISMİ | `word-spot-game.tsx:13,182-185`, `minigame-config-effective.ts:40-57` | Statik registry'den geliyor. Admin'in `MiniGameConfig` override'ı hub'a yansıyor (`status/route.ts`) ama bu sayfaya yansımıyor. |
| 7 | Başlangıç ipucu şeridi | SAHTE (içerik) | `lib/minigame-copy.ts:164`, `lib/minigame-config.ts:259` | "Turlar hızlanıyor" / "hızlanan turlarda" diyor. Oysa `ROUND_TIME_MS` sabit 5500 (`word-spot-game.tsx:16`), ızgara da hep 3x3 (`:42`). Hiçbir şey hızlanmıyor. |
| 8 | Başlat düğmesi "🧩 Gözünü Aç" (nabız halkalı) | KISMİ | `game-shell.tsx:189-208`, `minigame-copy.ts:163` | Bugün oynamış kullanıcıya da gösteriliyor. Kilit ekranı ancak tıklanınca geliyor (`use-mini-game.ts:64-67`). |
| 9 | Oyun başlatma (sunucu oturumu) | KISMİ | `use-mini-game.ts:54-79`, `start/route.ts:51-84` | Çalışıyor. Ancak `active` ya da `failed` oturum varsa aynı oturum yeniden veriliyor (`start/route.ts:56-73`). Bkz. B1 ve B2. |
| 10 | "Yükleniyor" durumu | ÇALIŞIYOR | `game-shell.tsx:147-162` | Oyuna özel `loadingStart` metni yok, genel metin kullanılıyor. |
| 11 | Başlatma hatası toast'ı | KISMİ | `use-mini-game.ts:61-62,75`, `start/route.ts:44` | Oturum düşmüşse toast'ta İngilizce "Unauthorized", ağ hatasında tarayıcının "Failed to fetch" metni görünüyor. |
| 12 | Can göstergesi (3 kalp) | ÇALIŞIYOR | `word-spot-game.tsx:195-199` | Durum yalnızca renkle anlatılıyor. aria yok. |
| 13 | Tur sayacı "Tur x/12" | KISMİ | `word-spot-game.tsx:201` | Kusursuz oyunda skor 10. turda 12'ye ulaşıp oyun bitiyor (`:160-163`), yani sayaç 12'ye hiç varmıyor. |
| 14 | Kombo göstergesi (2x ve üstü) | ÇALIŞIYOR | `word-spot-game.tsx:202-204` | — |
| 15 | Skor göstergesi | ÇALIŞIYOR | `word-spot-game.tsx:207` | — |
| 16 | Tur geri sayımı | KISMİ | `word-spot-game.tsx:58,94,113-135` | `Math.round(5.5)` olduğu için "6s" ile başlıyor. Kalan süre 0,5 saniyenin altına inince 0'a yuvarlanıp can düşüyor, yani tur gerçekte yaklaşık 5,0 saniye sürüyor. Sekme arka plandayken de süre işliyor. |
| 17 | Süre dolunca can kaybı | KISMİ | `word-spot-game.tsx:119-130` | Can düşüyor ama doğru (sahte) kelime gösterilmiyor. Öğrenme anı yok. |
| 18 | 3x3 kelime ızgarası | ÇALIŞIYOR | `word-spot-game.tsx:39-50,220-244` | Sahtenin yeri rastgele. |
| 19 | Kelime havuzu | KISMİ | `word-spot-game.tsx:19-30,40` | Yalnızca 10 çift var ve yerine koymadan çekilmiyor. 12 turda tekrar kesin, art arda aynı çift de gelebiliyor. Dört çiftte uzunluk farkı (Mükemmel/Mükemel, Lezzetli/Lezetli, Memnun/Memnnun, Güler yüz/Güleryüz) metni okumadan bile ele veriyor. |
| 20 | Doğru seçim: skor +1, her 4. komboda +2 | ÇALIŞIYOR | `word-spot-game.tsx:144-159` | Partikül, halka, yüzen yazı, ses ve titreşim tetikleniyor. Kombo 4'ün katında fanfar, şok dalgası ve konfeti çalıyor. |
| 21 | Yanlış seçim: can -1 | KISMİ | `word-spot-game.tsx:164-174` | Geri bildirim güçlü (kırmızı patlama, "Yanlış! -1"). Ancak sahte kelime işaretlenmiyor. |
| 22 | Çift tıklama kilidi (`lockRef`) | ÇALIŞIYOR | `word-spot-game.tsx:139-140,121` | Tur içinde ikinci seçim ve süre ile seçim yarışı engelleniyor. |
| 23 | Kart animasyonları (giriş, çıkış, hover, tap) | ÇALIŞIYOR | `word-spot-game.tsx:223-233` | `layout` ile `popLayout` her turda 9 kartı söküp yeniden kuruyor. Azaltılmış hareket tercihinde dönüşümler kapanıyor. |
| 24 | Efekt katmanı (FxLayer) | ÇALIŞIYOR | `fx-layer.tsx:79-160,260` | `pointer-events-none`, tıklamayı engellemiyor. RAF boştayken de dönüyor. Klavyeyle seçimde `clientX=0` olduğundan efekt arenanın dışında çiziliyor (`word-spot-game.tsx:141-143`). |
| 25 | Ses ve titreşim | KISMİ | `lib/game-sounds.ts:10-17,158-159` | Sesi kapatmanın tek yolu "animasyonları azalt" tercihi. Ayrı bir ses düğmesi yok. |
| 26 | Arena içi ipucu "7+ doğru = ödül" | KISMİ | `word-spot-game.tsx:246`, `:86` | Yanıltıcı. Kazanmak için ayrıca `livesRef.current > 0` gerekiyor. 9 doğru yapıp 3. canını kaybeden oyuncu ödül alamıyor. |
| 27 | Oyun bitişi ve skor gönderimi | KISMİ | `word-spot-game.tsx:72-81,83-88`, `use-mini-game.ts:82-135` | Ağ hatasında sonuç kayboluyor ve yeniden gönderme yolu yok (`use-mini-game.ts:126-128`). |
| 28 | Sunucu ödül doğrulaması (cap, eşik, min süre) | KISMİ | `complete/route.ts:61,81-87`, `minigame-config-effective.ts:107-116` | Sunucu skoru 12'ye sıkıştırıyor ve süreye bakıyor. Ancak skorun gerçekten oynanarak alındığını doğrulayamıyor (bkz. B3). |
| 29 | Atomik tek seferlik ödül ve `points_credited` olayı | ÇALIŞIYOR | `complete/route.ts:97-175` | Ekonomi kurallarına uygun. |
| 30 | Günlük seri bonusu (+10, her 3. günde +30) | ÇALIŞIYOR | `complete/route.ts:115-150`, `use-mini-game.ts:118-121` | Atomik `GameStreakClaim`. |
| 31 | Yeni başarım tespiti ve toast | ÇALIŞIYOR | `complete/route.ts:89-94,196-215`, `use-mini-game.ts:123-125` | İstatistikler iki kez hesaplanıyor (performans). |
| 32 | Ödül bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194` | — |
| 33 | Sonuç ekranı (kupa, varyant başlık, skor, ödül rozeti, konfeti) | KISMİ | `game-shell.tsx:222-305` | "Bulunan: N" etiketi (`minigame-copy.ts:167`) kombo bonusunu da sayıyor. 10 kelime bulan oyuncu "Bulunan: 12" görüyor. Kaybedene "Ödül için 7 skor gerekiyordu" yazıyor, oysa skoru 9 olabilir (can bittiği için kaybetmiş). |
| 34 | "Tekrar oyna" ya da "Oyun Merkezi'ne dön" | EKSİK | `game-shell.tsx:222-305` | Sonuç ekranında hiçbir eylem yok. Kullanıcı çıkmaz sokakta kalıyor. |
| 35 | "Bugün oynandı" kilit ekranı | KISMİ | `game-shell.tsx:308-332` | Yalnızca kazanılmış oturumda (`completed`) çıkıyor. "00:00 (UTC)" Türkiye saatiyle 03:00 demek ve kullanıcıya böyle söylenmiyor. |
| 36 | Haftalık turnuva bloğu (geri sayım, ödül havuzu, sıralama, ödül alma) | KISMİ | `game-shell.tsx:210-217`, `game-tournament.tsx`, `tournament/route.ts:28-39,144-147` | Eşitlik çözücü yok (bkz. B4). `@/lib/admin-toast` müşteri arayüzünde kullanılıyor (`game-tournament.tsx:6`). |
| 37 | Tüm zamanlar liderliği | KISMİ | `game-leaderboard.tsx`, `leaderboard/route.ts:47-80` | Tavan 12 olduğundan ilk sıralar eşit puanla dolu ve sıra keyfi. Hata durumu da "Henüz skor yok, ilk rekoru sen kır!" diye gösteriliyor (`game-leaderboard.tsx:40,55-61`). |
| 38 | Mobil yerleşim | ÇALIŞIYOR | `word-spot-game.tsx:220,234` | 360 px'de kart yaklaşık 84 px genişlikte, en uzun kelime sığıyor (hesapla doğrulandı, cihazda doğrulanmadı). |
| 39 | Klavye ile oynanış | BOZUK (pratikte) | `word-spot-game.tsx:221-241` | Her turda kartlar yeniden mount oluyor ve odak `body`'ye düşüyor. 5 saniyede sidebar'dan ızgaraya kadar tab'lamak mümkün değil. |
| 40 | Ekran okuyucu duyuruları (can, süre, sonuç) | EKSİK | `word-spot-game.tsx:194-210` | `aria-live` veya `role="status"` yok. |
| 41 | Sekme görünürlüğüne göre duraklatma | EKSİK | `word-spot-game.tsx:113-135` | `visibilitychange` dinlenmiyor. |
| 42 | Zorluk ilerlemesi (hızlanma, ızgara büyümesi) | EKSİK | `word-spot-game.tsx:15-16,42` | Metin vaat ediyor (bkz. #7), kodda yok. |
| 43 | Hub'a dönüş, breadcrumb | EKSİK | `page.tsx:15-23` | — |
| 44 | i18n etiketi `labelKey: 'word_spot_game'` | ÖLÜ KOD | `lib/minigame-config.ts:256` | `messages/*.json` içinde karşılığı yok. Oyunun tüm metinleri sabit Türkçe. |

Toplam 44 özellik: 15 ÇALIŞIYOR, 21 KISMİ, 1 BOZUK, 1 SAHTE, 5 EKSİK, 1 ölü kod.

---

## Bulgular

### B1. "Günde 1 hak" kuralı sayfa yenilenerek sınırsız tekrar denemeye açık
- **Önem:** yüksek · **Kategori:** güvenlik / oyun ekonomisi · **Efor:** M
- **Kanıt:** `app/api/customer/games/[game]/start/route.ts:56-73`, yani `existing.status !== 'completed'` olduğunda aynı `sessionId` ile `canPlay: true` dönüyor. `lib/use-mini-game.ts:54-79`.
- **Sorun:** Oyuncu kötü gidiyorsa (örneğin 1 canı ve 3 puanı kaldıysa) sayfayı yeniler. Oturum hâlâ `active` durumda olduğundan "Gözünü Aç"a basınca sunucu aynı oturumu yeniden verir ve oyun 3 can, 0 puanla baştan başlar. Bu, kazanana kadar sınırsız tekrarlanabilir. Ödül günde bir kez verildiği için ek puan basılmıyor. Ama "günde 1 hak, beceri gerektirir" vaadi boşa çıkıyor ve aynı yöntem liderlik ile turnuvayı da kusursuz skorlarla dolduruyor (bkz. B4).
- **Öneri:** Oturuma "deneme sayacı" ve "başladı" damgası eklenmeli. `MiniGameSession`'a `attempts Int @default(0)` ve `lastStartedAt` alanları eklenir. `start` uç noktası, aktif oturum yeniden istenirse `attempts` değerini artırır. `attempts > 1` ise ya oturumu otomatik `failed` yapar ya da ödülü sıfırlar ("oyun yarıda bırakıldı" kuralı). Kullanıcıya şeffaf davranılmalı: başlatmadan önce "Sayfadan ayrılırsan hakkın yanar" uyarısı gösterilir. Ayrıca `beforeunload` ve `pagehide` anında `navigator.sendBeacon` ile `complete` çağrılıp mevcut skor `won:false` olarak kaydedilir. Bu altyapı 20 oyunun hepsine ortak olduğu için tek noktada düzeltilir.

### B2. Kaybeden oyuncu ikinci kez oynatılıyor ve sonunda "Oyun zaten tamamlandı" hatası alıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / UX · **Efor:** S
- **Kanıt:** `complete/route.ts:101` kaybedeni `status: 'failed'` yapıyor. `start/route.ts:57` yalnızca `'completed'` durumunu kilitliyor, `failed` oturumu `:70-73`'te "yarım kalan aktif oturum" gibi geri veriyor. `complete/route.ts:98-108` ise yalnızca `status: 'active'` olanı güncelliyor, bu yüzden 409 dönüyor. Hub da `status/route.ts` içinde yalnızca `completed` olanları "bugün oynandı" sayıyor.
- **Sorun:** Bugün kaybetmiş oyuncu hub'da oyunu "oynanmamış" görüyor, sayfaya girip 12 tur oynuyor ve sonunda kırmızı "Oyun zaten tamamlandı" toast'ı alıyor. Kazandıysa bile ödül yok. Bu durum güveni doğrudan zedeler ("oyun beni kandırdı").
- **Öneri:** `start` içinde `existing.status !== 'active'` olduğunda (yani `completed` veya `failed`) `alreadyPlayed: true` dönülmeli. `status` uç noktası `status in ['completed','failed']` saymalı. Kilit ekranı kayıp ile kazancı ayırt etmeli ("Bugün denedin, yarın yeni ızgara"). Daha iyisi, sayfa sunucu bileşeninde bugünkü oturum durumu okunup `GameShell`'e `initialStatus` olarak geçirilir. Böylece kullanıcı başlat düğmesini hiç görmez (bkz. B9).

### B3. Skor tamamen istemciye güvenilerek hesaplanıyor; tur tabanlı bu oyun sunucuda kolayca doğrulanabilirdi
- **Önem:** yüksek · **Kategori:** güvenlik / ekonomi · **Efor:** L
- **Kanıt:** Doğru cevap bilgisi `tile.fake` istemcide üretiliyor (`word-spot-game.tsx:39-50`). `complete/route.ts:15-22,61,81-87` yalnızca `score ≤ 12` ve `süre ≥ 8 sn` kontrol ediyor.
- **Sorun:** `POST /start` isteğinden sonra 8 saniye beklenip `POST /complete {score:12, won:true, durationSec:9}` gönderilirse oynamadan 150 puan, 75 XP, seri bonusu ve tüm zamanlar birinciliği alınıyor. 20 oyunda bu, günde yaklaşık 3000 puan eder. Refleks ve canvas oyunlarında bu kısmen kaçınılmaz. Ama word-spot ayrık ve tur tabanlı. Sunucunun turları üretip cevapları doğrulaması ucuz ve kesin bir çözüm.
- **Öneri:** Sunucu otoriter tur modeli kurulmalı. `start`, oturuma bağlı bir `seed` döner (HMAC ile imzalı, DB'de saklanır). İstemci ızgarayı seed'den deterministik üretir. `complete` gövdesine `picks: {round, index, tMs}[]` eklenir. Sunucu aynı seed'den turları yeniden üretip her seçimi doğrular, skoru kendisi hesaplar ve istemcinin bildirdiği skoru yok sayar. Ayrıca insan dışı tepki sürelerini işaretler (örneğin her turda 120 ms'nin altı). Bu desen hafıza ve sıralama oyunlarına da (memory-match, speed-order) genişletilebilir.

### B4. Liderlik ve turnuvada eşitlik çözücü yok; 12 puan tavanında ödül sırası keyfi, ilk 3 ödülü üçten fazla kişiye gidebilir
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ekonomi · **Efor:** M
- **Kanıt:** `tournament/route.ts:28-39` ve `leaderboard/route.ts:47-53` yalnızca `_max.starsCollected desc` ile sıralıyor, ikincil anahtar yok. Ödül alma (`tournament/route.ts:144-147`) sırayı her istekte yeniden hesaplıyor. Tekil kısıt `(userId, gameType, weekKey)` üzerinde, sıra üzerinde değil.
- **Sorun:** Word-spot'ta `maxScore` 12 ve bu değere 10 turda ulaşılabiliyor (B1 ile daha da kolay). Haftanın en iyi skoru büyük olasılıkla birden fazla kişide 12 olur. Postgres'te eşit değerlerin `ORDER BY` sırası garanti değil. Bu yüzden A, B, C ve D kullanıcılarının hepsi 12 ise, her birinin ödül alma isteğinde farklı bir sıra dönebilir. Teoride dördü de ilk 3'te görünüp ödül alabilir. Böylece 500+300+150 puanlık havuz aşılır ve "net-sıfır / tek seferlik" ekonomi kuralı delinir. Pratikte sıra çoğunlukla aynı kalır, bu yüzden aşım çalışma anında doğrulanmadı. Ancak kod bunu garanti etmiyor.
- **Öneri:** (1) Deterministik bir eşitlik çözücü eklenmeli: aynı skorda önce daha erken `completedAt` olan, sonra daha kısa süre, en son `userId`. (2) Hafta kapanınca bir cron işi sıralamayı `TournamentResult (gameType, weekKey, rank)` tablosuna **tek sefer** yazmalı ve `@@unique([gameType, weekKey, rank])` kısıtı olmalı. Ödül alma bu dondurulmuş tablodan okunmalı. (3) Word-spot için skoru "doğru sayısı ve kalan süre" biçiminde zenginleştirerek (örneğin `doğru*1000 + kalan_ms/10`) eşitlik olasılığı yapısal olarak düşürülmeli.

### B5. Vaat edilen zorluk ilerlemesi yok; içerik 10 sabit çiftten ibaret
- **Önem:** orta · **Kategori:** içerik / ürün · **Efor:** M
- **Kanıt:** `minigame-copy.ts:164` "Turlar hızlanıyor", `minigame-config.ts:259` "hızlanan turlarda". Oysa `word-spot-game.tsx:16` `ROUND_TIME_MS = 5500` sabit, `:42` `count = 9` sabit, `:19-30` yalnızca 10 çift ve `:40` yerine koymalı çekiliyor.
- **Sorun:** Kullanıcıya söylenen ile yaşatılan farklı, bu "SAHTE" bir vaat. 12 turda aynı çift en az iki kez geliyor. Birkaç gün sonra çiftler ezberleniyor. Dört çiftte uzunluk farkı okumayı gereksiz kılıyor. Günlük tekrar edilen bir oyun için tekrar oynama değeri çok düşük.
- **Öneri:** Kademeli zorluk eğrisi kurulmalı: tur 1-4'te 3x3 ve 6 sn, tur 5-8'de 4x3 ve 5 sn, tur 9-12'de 4x4 ve 4 sn. İçerik havuzu en az 150 çift olmalı ve şu kategorilerle zenginleşmeli: Türkçe karakter (ı/i, ş/s, ğ/g, ö/o), harf yer değiştirme, çift harf, benzer görünen harfler (rn/m, l/I) ve eşit uzunlukta sahteler. Havuz `lib/word-spot-pairs.ts` içinde tutulup tur başına yerine koymadan çekilmeli. Günlük seed (B3) ile herkes o gün aynı ızgarayı görür. Böylece "günün bulmacası" hissi (Wordle) ve adil turnuva birlikte sağlanır. Son olarak metin koda uydurulmalı ya da kod metne.

### B6. Hatadan sonra doğru cevap gösterilmiyor; öğrenme ve "ah, kaçırdım" anı kayıp
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** `word-spot-game.tsx:164-175` (yanlış seçim) ve `:119-130` (süre bitti) yalnızca can düşürüp 700 ms sonra yeni tura geçiyor. Sahte kart vurgulanmıyor.
- **Sorun:** Duolingo'nun temel ilkesi, hatadan sonra doğrunun gösterilmesidir. Burada kullanıcı neyi kaçırdığını hiç öğrenmiyor. Bir yazım farkındalığı oyunu için bu, ana değer önerisinin kaybı demek.
- **Öneri:** Hata ya da süre bitiminde tur 1,2 sn "açıklama" durumuna girmeli. Sahte kart yeşil halka ve hafif titreşimle vurgulanır, farklı harf (örneğin "Har**ı**ka") renkli gösterilir, yanlış seçilen kart kırmızıya döner. Bunun için `Tile` tipine `diffIndex` alanı eklenir. Sonuç ekranına "Kaçırdıkların" listesi (doğru/sahte çiftler) eklenmeli. Bu aynı zamanda paylaşılabilir bir özet (Wrapped benzeri) için de iyi bir malzeme.

### B7. "7+ doğru = ödül" metni yanıltıcı; sonuç ekranı kaybın nedenini yanlış anlatıyor; "Bulunan" etiketi bonusu sayıyor
- **Önem:** orta · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:** `word-spot-game.tsx:86` (`won = score ≥ eşik && lives > 0`), `:246` ("7+ doğru = ödül"), `game-shell.tsx:290-293` (genel "Ödül için 7 skor gerekiyordu"), `minigame-copy.ts:167` (`scoreLabel: 'Bulunan'`), `word-spot-game.tsx:147-148` (+2 kombo bonusu).
- **Sorun:** 9 doğru yapıp 3. canını kaybeden oyuncu kaybediyor ve ekranda "Ödül için 7 skor gerekiyordu" okuyor, oysa skoru 9. Kusursuz oyunda 10 kelime bulunuyor ama ekranda "Bulunan: 12" yazıyor. Bir de kombo bonusu yüzünden skor 11'den 13'e sıçrayabilir (yol: 7 doğru, 1 yanlış, sonra 4 doğru). Bu durumda istemci "Bulunan: 13" gösterirken sunucu 12 kaydeder (`complete/route.ts:61`).
- **Öneri:** Kayıp nedeni sonuçla birlikte taşınmalı: `finish(score, won, { reason: 'lives' | 'threshold' | 'time' })`. Kabukta nedene özel metin gösterilir ("Canların bitti, 9 doğru yaptın. Ödül için 7 doğru ve en az 1 can gerekiyor"). Skor ile "bulunan" ayrı gösterilmeli ("10 bulundu · 12 puan"). İstemci skoru da `Math.min(score, maxScore)` ile sınırlanmalı. Arena ipucu "7+ doğru ve canın bitmeden = ödül" olmalı.

### B8. Admin yapılandırması istemciye yansımıyor (statik `DEF`)
- **Önem:** orta · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `word-spot-game.tsx:13` (`getMiniGame('word-spot')`), `:86,160,182-189,246` hep `DEF.*` kullanıyor. `use-mini-game.ts:70` sunucudan `config` alıyor ama oyun bu değeri hiç okumuyor (`game.config` kullanılmıyor).
- **Sorun:** Admin eşiği 9'a çıkarırsa istemci 8 puanla "kazandın" diyor, sunucu 0 ödül veriyor ve toast "eşiği geçemedin" diyor. Eşik 5'e inerse 6 puanlı oyuncu istemcide kaybediyor (`failed`) ve hak ettiği ödülü alamıyor. Admin'in değiştirdiği başlık, emoji ve renk de bu sayfada görünmüyor.
- **Öneri:** Sayfa (server component) `getEffectiveMiniGame('word-spot')` ile etkin tanımı alıp `WordSpotGame`'e `def` prop'u olarak geçirmeli. `enabled=false` ise "Bu oyun şu anda kapalı" boş durumu gösterilmeli. `won` kararını istemci değil sunucu vermeli (B3). Bu düzeltme 20 oyunun hepsi için `GameShell` seviyesinde yapılmalı.

### B9. Sayfa açılırken bugünkü durum bilinmiyor; giriş ekranı her zaman "oyna" diyor
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** `use-mini-game.ts:48` (`alreadyPlayed` başlangıçta `false`), `:64-67` (ancak `start` sonrası öğreniliyor), `game-shell.tsx:165-219`.
- **Sorun:** Bugün oynamış kullanıcı nabız atan "Gözünü Aç" düğmesini görüyor, tıklıyor ve ancak o zaman kilit ekranını görüyor. Yanlış bir beklenti yaratılıp hemen kırılıyor.
- **Öneri:** Sayfa sunucuda `MiniGameSession` (bugün) okuyup `initialState` prop'u ile `GameShell`'e vermeli. Kilit durumunda "Yeni ızgara 03:00'te (TR)" geri sayımı, bugünkü skor ve "diğer oyunlara geç" CTA'sı gösterilmeli. UTC yerine yerel saat yazılmalı (`game-shell.tsx:323`).

### B10. Klavye ve ekran okuyucu için oynanamıyor; arka plan sekmesinde süre yanıyor
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** M
- **Kanıt:** `word-spot-game.tsx:221-241` (her turda yeni `key` verildiği için odak kayboluyor), `:194-210` (aria-live yok), `:113-135` (`visibilitychange` yok), `:141-143` (klavyede `clientX=0`), `:246` (`text-[10px] text-white/40`).
- **Sorun:** Klavye kullanıcısı her turda odağı kaybediyor. Ekran okuyucu can, süre ve doğru/yanlış sonucunu duyurmuyor. Bildirim yüzünden sekme değiştiren mobil kullanıcı dönünce can kaybetmiş oluyor. 10 px'lik, %40 opak ipucu WCAG kontrast eşiğinin altında (hesaplanmadı, gözle değerlendirildi).
- **Öneri:** Izgara `role="grid"` ile kurulmalı, ok tuşlarıyla gezilmeli, 1-9 tuşlarıyla doğrudan seçim yapılabilmeli (numpad eşlemesi). Yeni turda odak programatik olarak ilk karta taşınmalı. Görünmez bir `aria-live="polite"` bölgesi "Tur 5, 2 can, 4 saniye" ve "Doğru, sahte kelime: Harıka" duyurmalı. `document.hidden` iken tur duraklatılmalı ve "Devam et" kartı gösterilmeli. Kalan süre için ayrıca renk ve şekil değiştiren bir ilerleme çubuğu eklenmeli. Sabit "Xs" etiketi yerine `transform: scaleX` ile akan bar daha okunaklı olur. Erişilebilirlik ayarlarına "süre sınırını uzat" seçeneği eklenmeli (WCAG 2.2.1).

### B11. Sayaç gerçek süreyi yanlış gösteriyor
- **Önem:** düşük · **Kategori:** doğruluk · **Efor:** S
- **Kanıt:** `word-spot-game.tsx:58,94` `Math.round(5500/1000) = 6`. `:117-119` `Math.round` kullandığı için kalan süre 0,5 sn'nin altına inince 0 oluyor ve can düşüyor.
- **Sorun:** "6s" ile başlayan sayaç, can kaybını yaklaşık 5,0. saniyede tetikliyor. Kullanıcı açısından 1 saniyelik bir "hile" gibi duruyor.
- **Öneri:** Gösterimde `Math.ceil`, karar için ham milisaniye (`elapsed >= ROUND_TIME_MS`) kullanılmalı. Sayaç `requestAnimationFrame` ile akan bir bara dönüştürülmeli (B10).

### B12. Ağ hatasında kazanılan sonuç kayboluyor; hata mesajlarında İngilizce sızıntı var
- **Önem:** düşük · **Kategori:** hata yönetimi / dil · **Efor:** S
- **Kanıt:** `use-mini-game.ts:126-128` (catch bloğu ödülsüz sonuç yazıp `done` yapıyor, yeniden deneme yok), `:62,75,127` (`e.message` doğrudan gösteriliyor), `start/route.ts:44` ve `complete/route.ts:46` (`'Unauthorized'`).
- **Sorun:** Metroda bağlantısı kopan oyuncu kazandığı turu kaybediyor ve "Failed to fetch" ya da "Unauthorized" görüyor.
- **Öneri:** `finish` başarısız olursa sonuç `localStorage` (ya da IndexedDB) içinde sessionId ile beklemeye alınmalı, "Bağlantı yok, yeniden dene" düğmesi gösterilmeli ve `online` olayında otomatik yeniden gönderilmeli. Sunucu oturum guard'ı tekrar gönderimi zaten idempotent kılıyor. Hata metinleri sabit Türkçe bir sözlükten eşlenmeli (`401 → "Oturumun sona ermiş, yeniden giriş yap"`).

### B13. Performans: boşta dönen RAF, iki kez hesaplanan başarım istatistiği, önbelleksiz liderlik
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `fx-layer.tsx:79-160` (parçacık yokken de `clearRect` ve RAF), `complete/route.ts:90-94,199`, `leaderboard/route.ts:47-53` ve `tournament/route.ts:29-35` (her sayfa açılışında iki `groupBy`, Redis yok).
- **Öneri:** FxLayer, parçacık dizisi boşalınca RAF'ı durdurup yeni efekt gelince yeniden başlatmalı (mobil pil). Başarım farkı tek hesaplamayla bulunmalı: `before` hesaplanır, `after` için yalnızca bu oturumun katkısı eklenir. Liderlik ve turnuva, mevcut Upstash katmanıyla 30-60 sn önbelleğe alınıp `complete` sonrasında etiketle bayatlatılmalı.

### B14. Kod kalitesi: etkisiz `useCallback` zinciri, temizlenmeyen zamanlayıcılar, ölü `labelKey`
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `use-mini-game.ts:137` her render'da yeni bir nesne döndürüyor. Bu yüzden `word-spot-game.tsx:80` (`[game]`) ile `endGame`, `nextRound` ve `pick` her render'da yeniden oluşuyor. `:129,161,175` `setTimeout`'ları unmount'ta temizlenmiyor: oyun ortasında sayfadan çıkılırsa `nextRound` çalışıp `sfxPowerUp()` sesi bir kez daha çalıyor. `lib/minigame-config.ts:256` `labelKey` hiçbir `messages/*.json` dosyasında yok.
- **Öneri:** Hook dönüşü `useMemo` ile sabitlenmeli. Zamanlayıcılar bir `timeoutsRef` kümesinde toplanıp unmount'ta temizlenmeli. Oyun mantığı saf bir reducer'a (`wordSpotReducer(state, action)`) taşınmalı. Böylece aynı reducer B3'teki sunucu doğrulamasında da kullanılır ve birim test yazılabilir.

### B15. Bilgi tekrarı ve hub'a dönüş yolu yok
- **Önem:** düşük · **Kategori:** UX / bilgi mimarisi · **Efor:** S
- **Kanıt:** Aynı açıklama `page.tsx:19`, `minigame-config.ts:258-259` (kabuk açıklaması) ve `minigame-copy.ts:164` (ipucu) içinde üç kez geçiyor. Sayfada ve sonuç ekranında hub'a dönüş bağlantısı yok (`page.tsx:15-23`, `game-shell.tsx:222-305`).
- **Öneri:** Masaüstü başlığı yalnızca breadcrumb'a ("Oyun Merkezi / Sahteyi Yakala") indirilmeli. Açıklama tek yerde kalmalı. Sonuç ekranına "Sıradaki oyun" kartı (bugün oynanmamış ve önerilen oyun) ile "Oyun Merkezi" düğmesi eklenmeli.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Günün bulmacası ve paylaşılabilir sonuç (Wordle / Spotify Wrapped):** Herkese aynı günlük seed verilmeli. Sonuç "🧩 Sahteyi Yakala #212 · 10/12 · 🟩🟩🟥🟩…" biçiminde emoji ızgarası olarak paylaşılabilmeli.
2. **Hata sonrası öğretici geri bildirim (Duolingo):** Doğru cevap ve farklı harf vurgulanmalı, oyun sonunda "kaçırdıkların" listesi gösterilmeli.
3. **Kademeli zorluk ve kişisel rekor (Duolingo XP / Revolut hedefleri):** Hızlanan turlar, büyüyen ızgara, "kişisel en iyin: 11, bugün 9" karşılaştırması ve arkadaşlara karşı haftalık sıralama gelmeli.
4. **Antrenman modu (ödülsüz sınırsız oyun):** Günlük ödüllü hak bittikten sonra puansız pratik modu sunulmalı. Bu, B1'deki istismarın meşru karşılığı olur ve oturum süresini artırır.
5. **Ses/titreşim düğmesi ve süre ayarı (Monzo erişilebilirlik ayarları):** Oyun içi sessize alma ve "uzun süre" seçeneği eklenmeli.
6. **Sıradaki oyun önerisi ve seri koruması (Starbucks "challenge" kartları):** Sonuç ekranında bugünün kalan oyunları, seri durumu ("bugünkü seri için 1 oyun daha") ve ödüle ne kadar kaldığı (puan → ödül kataloğu) gösterilmeli.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60-90 saniyelik "günün göz testi". Herkes aynı ızgarayı oynar. Zorluk tur tur artar. Her hatada ne kaçırıldığı öğrenilir. Sonuç Wordle tarzında paylaşılır. Ödül sunucuda doğrulanmış ve adil olur.

**Yerleşim (mobil öncelikli):**
- Üst şerit (yapışkan): solda canlar, ortada akan süre barı ve tur noktaları (12 nokta: yeşil, kırmızı, gri), sağda skor ve kombo alevi.
- Orta: ızgara 3x3'ten başlayıp 4x4'e büyür. Kartlar en az 44 px dokunma alanına sahip olur. Fark harfi açıklama anında renklenir.
- Alt: "1-9 tuşlarıyla seç" ipucu (yalnızca masaüstü), ses düğmesi.
- Giriş ekranı: bugünkü durum sunucudan gelir (oynandı, kaldı ya da yarım). Kişisel rekor, günün bulmaca numarası ve turnuvadaki yerin gösterilir. Liderlik bölümü "arkadaşlar / bu hafta / tüm zamanlar" sekmelerine ayrılır.
- Sonuç ekranı: skor sayacı (count-up), paylaşılabilir emoji ızgarası, "kaçırdıkların" listesi, ödül rozeti, seri durumu, "sıradaki oyun" kartı.

**Motion (yerinde ve ölçülü):**
- Tur geçişi: kartlar 30 ms stagger ile çevrilerek (rotateY) yeni kelimeye döner. Mevcut sök-kur yerine aynı 9 kart DOM'da kalır, böylece klavye odağı korunur (B10).
- Doğru seçim: mevcut halka ve partikül efekti yeterli. Kombo 4'te shockwave korunur.
- Açıklama anı: sahte kart 1,2 sn yeşil kontur ve hafif `scale 1.04`. Diğer kartlar %40 opaklığa iner.
- Süre barı: `scaleX` ile GPU dostu akış. Son 1,5 sn'de renk turuncudan kırmızıya geçer ve hafif nabız atar.
- three.js bu oyun için gereksiz. 2B tipografi oyununa 3B sahne eklemek yük getirir, değer katmaz.
- `reduce-animations` tercihinde çevirme yerine anlık değişim kullanılır, ses ayrı ayarla yönetilir.

**Veri ve API değişiklikleri:**
- `MiniGameSession` için `seed String?`, `attempts Int @default(0)`, `picks Json?`, `durationMs Int?` alanları eklenir.
- `POST /api/customer/games/word-spot/start` günlük seed ile oturumu döner, yeniden başlatmada `attempts` artar (B1). `failed` ve `completed` oturumlar `alreadyPlayed` olur (B2).
- `POST .../complete` gövdesi `{ sessionId, picks: [{round, index, tMs}] }` olur. Sunucu `lib/games/word-spot-engine.ts` içindeki saf motoru (istemciyle paylaşılan) kullanarak skoru ve `won` sonucunu kendisi hesaplar (B3).
- Turnuva için hafta sonunda donan `TournamentResult` tablosu ve deterministik eşitlik çözücü eklenir (B4).
- Sayfa server component'i `getEffectiveMiniGame` ve bugünkü oturumu okuyup `def` ile `initialState` prop'larını geçer (B8, B9).
- Liderlik ve turnuva Upstash'te 60 sn önbelleğe alınır, `complete` sonrasında etiketle bayatlatılır.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/review-detective` (Yorum Dedektifi):** Mekanik neredeyse aynı. İkisi de "N öğe arasında sahte olanı bul" oyunu, ikisinde de 3 can, sabit tur sayısı ve tur süresi var (`review-detective-game.tsx`: `MAX_LIVES = 3`, `TOTAL_ROUNDS = 10`, `ROUND_TIME_MS = 9000`; word-spot: 3 / 12 / 5500). Fark yalnızca içeriğin ölçeği: kelime ile yorum metni.
- **`/customer/games/truth-vs-fake` (Gerçek mi Sahte mi):** Tema aynı (sahte yorum tespiti), mekanik farklı (kaydırma). Hub'da üç "sahteyi bul" oyunu yan yana duruyor ve marka kimliğini sulandırıyor.
- **Ad çakışması:** "Sahteyi Yakala" ile "Kar Tanesi Yakala" (`frost-catcher`) hub'da benzer adlar.

**Öneri:** Word-spot ve review-detective tek bir **"Sahte Avı"** oyununda birleştirilmeli. Kademe 1 "Göz" (kelime, 3x3 → 4x4, hızlı), kademe 2 "Dedektif" (yorum metni, 3-4 kart, daha uzun süre) olur. İkisi tek seed, tek oturum ve tek skor modeliyle oynanır ve sunucu otoriter motoru paylaşır. `truth-vs-fake` farklı mekaniği (kaydırma) nedeniyle ayrı kalabilir, ama hub'da üçü "Güven oyunları" başlığı altında gruplanmalı. Birleştirme yapılmazsa en azından B1, B2, B5, B6 ve B7 düzeltilmeli. Aksi halde bu sayfa hub'daki en sığ ve en kolay istismar edilen oyunlardan biri olarak kalır.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı. Kod değiştirilmedi, veritabanına ve çalışma zamanına dokunulmadı. Okunan dosyalar: `app/api/customer/games/[game]/start/route.ts`, `.../complete/route.ts`, `.../leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/tournament-core.ts`, `components/customer/games/word-spot-game.tsx`, `components/customer/games/game-shell.tsx`, `prisma/schema.prisma` (`MiniGameSession`, `TournamentRewardClaim`).

### 1. Günde 1 hak, sayfa yenilenerek sınırsız tekrar denemeye dönüşüyor — **DOĞRULANDI**
- `start/route.ts:56-73`: mevcut oturum `completed` değilse aynı `sessionId` ile `canPlay: true` dönüyor. Deneme sayacı ya da "yeniden başlatıldı" işareti yok (`schema.prisma:493-513` içinde böyle bir alan bulunmuyor).
- `word-spot-game.tsx:98-110`: `playing` olunca can 3'e, skor 0'a sıfırlanıyor. Oyun durumu sunucuda tutulmuyor.
- `complete` çağrısı yalnızca oyun bitince yapılıyor (`word-spot-game.tsx:72-81`, `use-mini-game.ts:82-96`). Oyun ortasında sayfa yenilenirse oturum `active` olarak kalıyor.
- **Yeniden üretim:** Oyunu başlat. 2 can kaybedip skor düşük kalınca F5'e bas. "Başla" düğmesine bas: aynı oturum, 3 can, 0 skor ile yeniden başlar. 12/12 alınana kadar tekrarla. Sunucuda `startedAt` eski kaldığı için `tooFast` kontrolü de (`complete/route.ts:81-83`) bu denemelerde hiç tetiklenmez.
- **Etki:** Ek puan basılmıyor, çünkü ödül günlük tek oturuma bağlı. Ama `completed` skor tüm zamanlar liderliğine (`leaderboard/route.ts:47-53`) ve haftalık turnuvaya (`tournament/route.ts:28-35`) yazılıyor. Turnuva gerçek puan ödülü (500/300/150) dağıttığı için beceri kapısı fiilen ortadan kalkıyor. Aynı mekanizma generic `[game]` uçlarını kullanan bütün oyunlarda ortak.

### 2. Kaybedilen (failed) oturum yeniden oynatılıyor ve sonunda 409 dönüyor — **DOĞRULANDI**
- `complete/route.ts:101`: kayıpta `status: 'failed'` yazılıyor.
- `start/route.ts:57`: yalnızca `'completed'` kilitleniyor. `failed` oturum `:70-73` üzerinden `canPlay: true` ve aynı `sessionId` ile geri veriliyor.
- `complete/route.ts:73`: erken 409 yalnızca `completed` için var. `failed` oturum buradan geçip `:98-99` içindeki `updateMany({ where: { status: 'active' } })` koşuluna takılıyor. `count === 0` olunca `:107-108` ve `:177-181` üzerinden **409 "Oyun zaten tamamlandı"** dönüyor.
- İstemcide `use-mini-game.ts:98-99,126-128` bunu `toast.error` olarak gösteriyor ve sonuç ekranını ödülsüz açıyor. Oyuncu 12 turu kazansa bile hiçbir şey kaydedilmiyor.
- `status/route.ts:33` yalnızca `completed` oturumları "oynandı" sayıyor. Bu yüzden hub, kaybedilen oyunu "oynanmadı" gösteriyor ve kullanıcıyı bu çıkmaza davet ediyor.
- **Yeniden üretim:** 3 canı da kaybet (oturum `failed` olur). Sayfayı yenile, "Başla" de: oyun açılır. 12 turu kazan: sonuç 409 hata toast'ı olur, puan ve skor kaydedilmez.
- **Not:** B1 ile birlikte tutarsız bir durum çıkıyor. Yarıda yenilenen oturum tekrar oynanıp ödül alabiliyor, dürüstçe bitirilip kaybedilen oturum ise tekrar oynanabildiği halde ödül alamıyor. Çözüm tek kural olmalı: `failed` da `alreadyPlayed` sayılmalı (start, status ve hub aynı yardımcıyı kullanmalı) ve yeniden başlatma politikası (B1) açıkça tanımlanmalı.

### 3. Skor istemciye güveniyor; oynamadan ödül alınabiliyor — **DOĞRULANDI**
- `complete/route.ts:15-22`: gövde `score`, `durationSec` ve `won` alanlarını doğrudan istemciden alıyor.
- `:61`: skor yalnızca `maxScore` (12, `minigame-config.ts:262`) ile sınırlanıyor.
- `:81-87`: tek sunucu kontrolü `serverElapsedSec >= minDurationSec` (8 sn, `minigame-config.ts:266`). `won` ve skor hiçbir oyun kanıtıyla eşleştirilmiyor.
- `computeEffectiveReward` (`minigame-config-effective.ts:107-116`) skor ≥ 7 ise 150 puan ve 75 XP veriyor.
- Turlar tamamen istemcide `Math.random()` ile üretiliyor (`word-spot-game.tsx:39-50`). Sunucuda seed yok.
- **Yeniden üretim:** Oturum çerezi ile `POST /api/customer/games/word-spot/start` çağır. 8 sn bekle. Sonra `POST .../complete {"sessionId":"<id>","score":12,"durationSec":9,"won":true}` gönder. Sonuç: 150 puan, 75 XP, günün ilk ödüllü oyunuysa seri XP'si, skor 12 ile tüm zamanlar ve haftalık sıralamada en üst.
- **Etki:** Günlük tek hak sınırı sayesinde oyun başına günde en fazla 150 puan basılıyor. Ancak betikle her generic oyun için tekrarlanınca günlük kazanç oyun sayısıyla çarpılıyor. Sıralama ve turnuva da tamamen manipüle edilebiliyor (bkz. 4). `points_credited` olayı (`:162-170`) yazıldığı için tutar velocity dedektöründe görünür, ama bu tespit sağlar, engellemez.

### 4. Turnuva ödülünde eşitlik çözücü yok; ilk 3 ödülü 3'ten fazla kişiye gidebilir — **DOĞRULANDI (kısmen; havuz aşımı çalışma anında doğrulanmadı)**
- `tournament/route.ts:29-35`: `orderBy: { _max: { starsCollected: 'desc' } }` dışında ikincil anahtar yok. SQL'de eşit değerlerin sırası tanımsız.
- `:143-147`: POST, sırayı her istekte yeniden hesaplıyor.
- `schema.prisma:1088`: tekillik `@@unique([userId, gameType, weekKey])` üzerinde. `(gameType, weekKey, rank)` için bir kısıt yok. Yani aynı hafta ve oyun için kaç kişinin 1. sıra ödülü alabileceğini DB sınırlamıyor.
- **Kesin olan kısım:** word-spot'ta 12 skoru dürüst oyunda bile ulaşılabilir (kombo bonusuyla yaklaşık 10 doğru yeterli, `word-spot-game.tsx:147,160`). B1 ve B3 ile ise herkes için önemsiz hale geliyor. Geçen hafta 12 alan 5 kişi varsa, 500/300/150 puanın kime gideceğine Postgres'in iç sıralaması karar veriyor. Bu, ürün açısından keyfi ve adaletsiz bir dağıtım. Ayrıca GET'te gösterilen sıra (`:62-76`) ile POST'ta ödüllendirilen sıra farklı olabilir.
- **Doğrulanmamış kısım:** Aynı (kapanmış) haftanın satır kümesi değişmediği için plan aynı kaldıkça çıktı sırası pratikte çoğunlukla sabit kalır. Havuzun gerçekten aşılması için istekler arasında sıranın değişmesi gerekir (tablo büyüyünce plan değişikliği, paralel sorgu, `VACUUM` sonrası fiziksel sıra). Bu mümkün, ama çalışma anında gösterilmedi.
- **Öneri:** Deterministik ikincil anahtar eklenmeli: önce en iyi skora ilk ulaşma zamanı (`MIN(completedAt)` ilgili skor için), sonra `userId`. Bu Prisma `groupBy` ile doğrudan ifade edilemediği için `$queryRaw` ile `ROW_NUMBER()` kullanılmalı. Bunun yanında hafta kapanınca sonuç bir `TournamentResult (gameType, weekKey, rank) @@unique` tablosuna bir kez dondurulmalı (cron'da, fail-closed). Ödül talebi canlı yeniden hesaplama yerine bu tablodan okumalı. Eşit skorlarda ödül paylaştırma ya da eşit dereceye eşit ödül gibi bir politika ürün kararı olarak yazılmalı.

### Özet
| # | İddia | Karar |
|---|---|---|
| 1 | Yenileyerek sınırsız tekrar | Doğrulandı |
| 2 | `failed` oturum yeniden oynatılıp 409 dönüyor | Doğrulandı |
| 3 | İstemci skoruna güven, oynamadan ödül | Doğrulandı |
| 4 | Turnuvada eşitlik çözücü yok | Doğrulandı (keyfi dağıtım kesin, havuz aşımı çalışma anında doğrulanmadı) |

## Uygulama (Dalga 2)

Bu oyun **Sahte Avcısı** (`/customer/games/fake-hunter`) amiral oyununun **Kelime** aşaması olarak yeniden kuruldu; eski rota `/customer/games/word-spot` sorgu parametrelerini koruyarak `/customer/games/fake-hunter?mod=kelime`'e kalıcı yönlenir, eski bileşen silindi.

Kapatılanlar:
- **Skor istemci beyanı / cevap anahtarı istemcide** → sınıflandırma doğrulayıcısı (`lib/games/validators/fake-hunter.ts`): tur tohumdan sunucuda kurulur, sıralıda içerik ETİKETSİZ ve açıklamasız gider, kararlar sunucuda puanlanır; tekrarlı/uydurma kimlik, sunucu süresinden sonra cevap ve insanüstü hız (≥ 3 cevap < 400 ms) reddedilir. Jest: `__tests__/lib/fake-hunter-verify.test.ts` (17 test: dürüst oyun ödüllenir, şişirilmiş skor sunucu skoruna iner, kanıtsız/betik/başka tohum reddedilir, "hep sahte de" eşiği geçemez).
- **Sabit 10–12 cümlelik, kendini ele veren içerik** → 122 özgün, gerçekçi Türkçe öğe (`lib/games/content/fake-hunter.server.ts`; 32 Kaydır, 30 Dosya, 30 Kelime, 30 Profil); "temiz görünen sahte" ve "şüpheli görünen gerçek" zor öğeler; pratik/sıralı havuzlar ayrı (pratikle sıralı etiketler kazınamaz). Kelime modunda ele veren cümlenin yeri kimlik karmasıyla dağıtıldı.
- **Yanlışa ceza yok (rastgele basmak kârlı)** → doğru +2, 3'lü seride +1, yanlış/süre dolması −1; her ikili aşamada iki etiket de bulunur.
- **Vaat edilen zorluk ilerlemesi yok** → aşama içinde zorluk kolaydan zora; pratikte sonraki vaka oyuncunun Elo'suna göre seçilir (unvan + seviye değişimi sonuçta).
- **Çift tık aynı kartı iki kez sayıyor / paylaşılan `x` sıfırlanmıyor** → 450 ms karar kilidi; her kart kendi hareket değeriyle anahtarla yeniden kurulur.
- **Süre dolunca bayat state** → süre ref tabanlı, duraklatmada durur, dolunca "timeout" kararı kanıta yazılır.
- **Admin override'ı yok sayılıyor** → eşik/tavan `config`'ten (etkin yapılandırma); başlık/renk kabukta.
- **Öğretici / "neden sahteydi?" yok** → ilk oynayışta 4 adımlı öğretici, her aşama başında açıklama kartı; pratikte her karardan sonra doğru cevap + gerekçe.
- **Klavye/ekran okuyucu yok** → ←/A, →/D, 1–4, Enter, Esc; `aria-live` özet, `role="timer"`, isimli düğmeler, ≥ 44 px hedefler; renk körü güvenli mavi/turuncu + ikon + yazı.
- **Sekme gizlenince süre akıyor / duraklatma yok** → `visibilitychange` ve Esc kabuğu duraklatır; süre durur.
- **Hareket/ses politikası** → ses, titreşim, sarsıntı, parçacık ve konfeti yalnız `fx` (useMotionPolicy + oyuncu tercihi) üzerinden; azaltılmış harekette radar dönmez, kart dönüşü kapalı.
- **Sonuç ekranı çıkmaz sokak** → pratik sonu: skor, yıldız, pratik rekoru, seviye, vaka özeti, paylaş; sıralı sonuç ve "günde 1 hak" kilidi ortak kabukta (`GameHost`/`game-session`).

Kalan açıklar: turnuva eşitlik kırıcı, günlük hak/409 ve ağ hatasında yeniden deneme ortak oyun altyapısının işi (bu oyunun dosyaları dışında). Sıralıda istemci doğruluğu bilemediği için skor beyanı 0 gönderilir → ortak doğrulayıcı `score_mismatch` sinyali yazar (sınıflandırma ailesinde bu sinyal anlamsız; ortak altyapıda ele alınmalı). `?mod=` ipucu şimdilik yalnız yönlendirmede taşınır; oyun her turda dört aşamayı oynatır.
