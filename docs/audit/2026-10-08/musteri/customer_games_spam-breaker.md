# /customer/games/spam-breaker

**Amaç:** Müşteriye günde bir kez oynanabilen, "breakout" (tuğla kırma) türünde bir mini oyun sunmak. Kalkanı kaydırıp topu sektiren oyuncu spam tuğlalarını kırar; sunucu doğrulamasından geçen galibiyet puan + XP, günlük seri bonusu, başarım, haftalık turnuva ve tüm zamanlar liderliği besler.

**Genel puan: 5/10** · **Karar: koru-iyileştir.** Oyun döngüsü ve sunucu ekonomisi sağlam bir temel. Ancak ödül koşulu arayüzde yanlış anlatılıyor, mobilde ana fırlatma hareketi bozuk, fizik kare hızına bağlı ve kaybettikten sonra "günde 1 hak" akışı kırılıyor. Bunlar oyunun ürün değerini doğrudan düşürüyor; düzeltilmeleri M ölçeğinde iş.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oyun oynanıyor ve ödül atomik veriliyor. Ancak ödül yalnızca tahta tamamen temizlenince geliyor, "Hedef: 18" yanlış. Kayıptan sonra tekrar oynanan oyun 409 ile sonuçlanıyor. |
| UX | 4.5/10 | Aynı açıklama üç kez tekrarlanıyor. Sonuç ekranında hiçbir sonraki adım yok, "bugün oynandı" bilgisi tıklamadan önce gösterilmiyor ve duraklatma yok. |
| Görsel | 6/10 | Neon kabuk ve parlayan tuğlalar türe uygun. Ama canvas DPR'sız olduğu için retina ekranda bulanık. Turnuva bloğu açık temada okunmuyor. Anlatıdaki "çekirdek" görselde yok. |
| Mimari | 5/10 | Paylaşılan hook/shell/registry deseni iyi. Ancak istemci admin override'ını (`game.config`) yok sayıyor, skor ve galibiyet istemciden geliyor, eşit skorlarda sıralama belirsiz. |
| Performans | 6.5/10 | Sayfa hafif, döngü React'tan bağımsız. Her karede 35 tuğla için `shadowBlur` düşük güçlü Android cihazlarda kare düşürebilir. Turnuva ve liderlik verisi önbelleksiz. |
| Erişilebilirlik + Mobil | 3.5/10 | Mobilde kanvasa dokunarak fırlatma, spec gereği tıklama olayını bastırıyor. Canvas'ın `aria`/canlı bölge desteği yok, ipucu metni 10px ve %40 opaklıkta. OS'un `prefers-reduced-motion` ayarı canvas'a yansımıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum + CUSTOMER rol kapısı | ÇALIŞIYOR | `app/customer/games/spam-breaker/page.tsx:10-13` | Rol yanlışsa `/auth/signin`'e yönlendiriyor. |
| 2 | Sekme başlığı (metadata) | ÇALIŞIYOR | `page.tsx:7` | Statik; admin başlık override'ını yansıtmıyor. |
| 3 | Sayfa başlığı + açıklama (`DashboardPageHeading`) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Yalnızca masaüstünde görünüyor (`hidden sm:flex`). Metin sabit kodlu, admin override yok. Açıklama shell'de tekrar ediyor. |
| 4 | Başlangıç ekranı: yüzen emoji, başlık, açıklama | ÇALIŞIYOR | `components/customer/games/game-shell.tsx:165-184` | `DEF` statik değerleri kullanıyor (`spam-breaker-game.tsx:329-332`). |
| 5 | Başlangıç ipucu hapı (startHint) | ÇALIŞIYOR | `game-shell.tsx:185-188`, `lib/minigame-copy.ts:204` | Açıklamanın neredeyse aynısı; üçüncü tekrar. |
| 6 | "🧊 Topu Sek" başlat butonu → `POST /start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79` | Nabız halkası animasyonu var. |
| 7 | Haftalık turnuva: geri sayım, ödül havuzu, ilk 10 | KISMİ | `components/customer/games/game-tournament.tsx:108-180` | Açık temada isimler ve skorlar görünmüyor (Bulgu 7). Eşit skorlar belirsiz sıralanıyor (Bulgu 4). Birim "⭐" yanlış. |
| 8 | Turnuva ödülünü talep et butonu | KISMİ | `game-tournament.tsx:84-97,123-140`, `app/api/customer/tournament/route.ts:128-200` | Atomik. Ama eşit skorda sıra kayabiliyor, `admin-toast` "Basarili: " önekini müşteriye gösteriyor. |
| 9 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx`, `app/api/customer/games/[game]/leaderboard/route.ts:47-53` | Yalnızca `completed` (kazanan) oturumlar sayılıyor, hepsi 49 puanda. Hata durumunda "Henüz skor yok" yazıyor. |
| 10 | Yükleniyor durumu (başlatma/kaydetme) | ÇALIŞIYOR | `game-shell.tsx:147-162` | |
| 11 | Günde 1 hak kilidi / "Bugünün oyununu oynadın" ekranı | KISMİ | `start/route.ts:56-73`, `complete/route.ts:101`, `game-shell.tsx:308-332` | Kayıptan sonra kilit oluşmuyor; tekrar oynanan oyun 409 alıyor (Bulgu 2). |
| 12 | HUD: can kalpleri | ÇALIŞIYOR | `spam-breaker-game.tsx:342-346` | `aria-label` yok; durum yalnızca renkle anlatılıyor. |
| 13 | HUD: anlık skor | ÇALIŞIYOR | `spam-breaker-game.tsx:347-349` | |
| 14 | HUD: "Hedef: 18" | SAHTE | `spam-breaker-game.tsx:350` | Gerçek koşul 49/49 tam temizlik (Bulgu 1). |
| 15 | Canvas çizimi: tuğla, kalkan, top, glow | KISMİ | `spam-breaker-game.tsx:260-314,358-364` | DPR ölçeklemesi yok, retina ekranda bulanık. Kardeş oyun `frost-catcher-game.tsx:160` DPR kullanıyor. |
| 16 | Fareyle kalkan kontrolü | ÇALIŞIYOR | `spam-breaker-game.tsx:108-115,132` | Koordinat ölçeklemesi doğru (`W / rect.width`). |
| 17 | Dokunmatik kalkan kontrolü | ÇALIŞIYOR | `spam-breaker-game.tsx:116-119,133-134` | Mutlak konum kullanıyor; parmak kalkanı ve topu örtüyor. |
| 18 | Klavye ile kalkan (←/→, a/d) | KISMİ | `spam-breaker-game.tsx:120-127` | 28px'lik adımlarla ilerliyor ve OS tuş tekrarına bağlı. `A`/`D` (Caps Lock) çalışmıyor. Dinleyici `window` genelinde. |
| 19 | Space ile fırlatma | ÇALIŞIYOR | `spam-breaker-game.tsx:127-130` | |
| 20 | Tıklayarak fırlatma (masaüstü) | ÇALIŞIYOR | `spam-breaker-game.tsx:356` | Sarmalayıcı `div` `role`'süz ve odaklanamıyor. |
| 21 | Kanvasa dokunarak fırlatma (mobil) | BOZUK | `spam-breaker-game.tsx:117,134,356` | `touchstart` içindeki `preventDefault` uyumluluk `click`'ini bastırıyor. Kanvasın kendisi "Dokun → fırlat" diyor (`:312`). Spec'e göre böyle; gerçek cihazda doğrulanmadı. |
| 22 | Alt adımlı fizik (tünelleme önleme) | ÇALIŞIYOR | `spam-breaker-game.tsx:248-254` | |
| 23 | Zaman tabanlı hareket | BOZUK | `spam-breaker-game.tsx:244-254` | Hız piksel/kare olarak tanımlı. 120/144 Hz ekranda oyun 2–2.4× hızlı (Bulgu 5). |
| 24 | Kalkana göre açılı sekme | ÇALIŞIYOR | `spam-breaker-game.tsx:217-228` | ±60° sınırı ile yatay kilitlenme yok. |
| 25 | Çift canlı (hp 2) üst sıralar | ÇALIŞIYOR | `spam-breaker-game.tsx:77,278-285` | Fark yalnızca opaklık ve şeritle anlatılıyor; renk körü modu için ayrı bir işaret yok. |
| 26 | Kademeli hızlanma | ÇALIŞIYOR | `spam-breaker-game.tsx:177-181` | 5.2 → 8.5 px/kare. |
| 27 | Can kaybı + topun kalkana dönmesi | ÇALIŞIYOR | `spam-breaker-game.tsx:200-213` | |
| 28 | Kazanma / ödül koşulu | BOZUK | `spam-breaker-game.tsx:183-185,206-208`, `lib/minigame-config.ts:332-334` | `won` yalnızca 49 isabette `true`. Eşik 18 işlevsiz (Bulgu 1). |
| 29 | Ekran sarsıntısı + azaltılmış hareket | KISMİ | `spam-breaker-game.tsx:24-26,263-268` | Yalnızca uygulamanın `reduce-animations` sınıfını okuyor; OS `prefers-reduced-motion` ayarını yok sayıyor. |
| 30 | Ses efektleri | KISMİ | `spam-breaker-game.tsx:9`, `lib/game-sounds.ts:10-13` | Ayrı bir sessiz düğmesi yok; ses yalnızca "animasyonları azalt" ayarıyla kapanıyor. |
| 31 | Haptik geri bildirim | ÇALIŞIYOR | `lib/game-sounds.ts:158-165` | iOS Safari'de `navigator.vibrate` olmadığı için sessizce atlanıyor. |
| 32 | Alt ipucu satırı | KISMİ | `spam-breaker-game.tsx:365` | 10px ve `white/40` ile okunması zor; "18+ = ödül" ifadesi yanlış. |
| 33 | Sonuç ekranı: kupa/kurukafa, varyantlı başlık, skor | ÇALIŞIYOR | `game-shell.tsx:222-272`, `minigame-copy.ts:205-207` | |
| 34 | Ödül rozeti + konfeti | ÇALIŞIYOR | `game-shell.tsx:86-94,274-288` | Konfeti `reduce-animations`'a uyuyor. |
| 35 | Ödül kaçırma notu | SAHTE | `game-shell.tsx:290-293` | Spam-breaker için `rewardMissNote` tanımlı değil, bu yüzden "Ödül için 18 skor gerekiyordu" yazıyor. 40 isabet yapıp kaybeden oyuncuya yanlış bilgi veriyor. |
| 36 | Ödül, seri ve başarım toast'ları | ÇALIŞIYOR | `lib/use-mini-game.ts:112-125` | `tooFast` yanıtı yok sayılıyor ve yanlış mesaj gösteriliyor (Bulgu 12). |
| 37 | Günlük seri bonusu (atomik tek claim) | ÇALIŞIYOR | `complete/route.ts:115-150` | |
| 38 | Başarım tespiti (önce/sonra farkı) | ÇALIŞIYOR | `complete/route.ts:89-94,196-215` | Her tamamlamada iki tam istatistik hesabı yapılıyor. |
| 39 | Uygulama içi bildirim kaydı | ÇALIŞIYOR | `complete/route.ts:185-194` | |
| 40 | Sunucu ödül doğrulaması (cap, süre, atomik) | KISMİ | `complete/route.ts:61,81-87,97-108` | `won` ve `score` istemciden geliyor ve kanıt istenmiyor (Bulgu 6). |
| 41 | Admin override'ının oyunda uygulanması | EKSİK | `spam-breaker-game.tsx:11,183,350`, `use-mini-game.ts:70,137` | `game.config` döndürülüyor ama hiç kullanılmıyor. |
| 42 | Admin'in pasifleştirdiği oyunda sayfa davranışı | KISMİ | `start/route.ts:34-39` | Sayfa açılıyor; ancak "Oyna"ya basınca 403 toast'ı geliyor. |
| 43 | Oynamadan önce "bugün oynandı" bilgisi | EKSİK | `use-mini-game.ts:46-48` | Kilit ancak "Oyna"ya basıldıktan sonra öğreniliyor. |
| 44 | Duraklat / devam et | EKSİK | Bileşende yok | |
| 45 | Sonuç ekranında sonraki adım CTA'ları (hub, sonraki oyun, paylaş) | EKSİK | `game-shell.tsx:222-305` | |
| 46 | Canvas erişilebilirliği (`aria-label`, canlı skor bölgesi) | EKSİK | `spam-breaker-game.tsx:358-364` | |
| 47 | Sıfırlama saati bilgisi | KISMİ | `game-shell.tsx:323` | "00:00 (UTC)" yazıyor; Türkiye'de bu 03:00'e denk geliyor. |
| 48 | Kişisel rekor ve önceki denemeler | EKSİK | Yalnızca liderlikte `me` satırı var (`game-leaderboard.tsx:99-110`) | |
| 49 | Ortak efekt katmanı (`FxLayer`: kırılma parçacığı, yüzen metin) | EKSİK | Import yok; bkz. bellek notu "FxLayer ortak juice" | Diğer oyunlarla his tutarsız. |
| 50 | Renk körü / yüksek kontrast modu | EKSİK | `spam-breaker-game.tsx:35` | `ROW_COLORS` sabit; `colorblind` sınıfı okunmuyor. |

**Özet:** 24 ÇALIŞIYOR · 13 KISMİ · 3 BOZUK · 2 SAHTE · 8 EKSİK (toplam 50).

---

## Bulgular

### 1. [YÜKSEK · İşlevsellik/Ekonomi] Ödül eşiği gerçekte işlevsiz; arayüz yanlış hedef gösteriyor
- **Kanıt:**
  - `spam-breaker-game.tsx:183-185`: `if (scoreRef.current >= DEF.maxScore || bricksRef.current.length === 0) endGame(scoreRef.current >= DEF.rewardThreshold)`
  - `:206-208`: canlar bitince `endGame(false)`
  - `lib/minigame-config.ts:332-334`: tahta 2×7×2 + 3×7×1 = 49 isabet, `maxScore: 49`, `rewardThreshold: 18`
  - `complete/route.ts:86`: `eligible = won && !tooFast`
- **Sorun:** `won=true` yalnızca 49 isabetin tamamı yapıldığında oluşuyor, o anda skor her zaman 49. 18 ile 48 arasında kalıp topu kaçıran oyuncu `won=false` gönderiyor ve hiçbir ödül alamıyor. Buna karşın HUD "Hedef: 18" (`:350`), alt satır "18+ = ödül" (`:365`) ve sonuç ekranı "Ödül için 18 skor gerekiyordu" (`game-shell.tsx:291-292`) diyor. Oyuncuya vaat edilen ile sistemin uyguladığı kural farklı. Bu güveni doğrudan zedeleyen, sahte bir hedef. Admin `rewardThreshold`'u değiştirse de (49'dan küçük olduğu sürece) bir etkisi olmuyor.
- **Öneri:** Kazanma durumu ile ödül eşiğini ayırın. Ürün kararı olarak iki seçenek var:
  - (a) **Kademeli ödül (önerilen):** Skor ≥ eşik olduğunda, top kaçsa bile ödül verilsin. `endGame` canlar bitince `won = score >= threshold` göndersin. Sunucu tarafında `computeEffectiveReward` zaten eşik mantığıyla çalışıyor.
  - (b) **Tam temizlik şartı:** Arayüzdeki tüm "18" ifadeleri "Tüm tahtayı temizle" olarak değiştirilsin ve `rewardThreshold = maxScore` yapılsın.

  Her iki durumda da eşik, `useMiniGame().config.rewardThreshold`'tan (sunucunun etkin değeri) okunmalı; `DEF` değil. İlerisi için Duolingo'daki gibi 1/2/3 yıldız kademesi önerilir (örn. 18 / 35 / 49 isabet). Kademeler sunucuda `rewardTiers` olarak tanımlanır, ödül de kademeye göre ölçeklenir.
- **Efor:** S (a seçeneği) / M (kademeli yıldız)

### 2. [YÜKSEK · Hata/Veri] Kaybedilen oturum "günde 1 hak"ı kilitlemiyor; tekrar oynanan oyun 409 ile çöpe gidiyor
- **Kanıt:**
  - `complete/route.ts:101`: kayıp oturum `status: 'failed'` olarak kaydediliyor.
  - `start/route.ts:56-73`: yalnızca `completed` kilitleniyor; `failed` oturumda aynı `sessionId` ile `canPlay:true` dönüyor.
  - `complete/route.ts:98-108`: `updateMany where status:'active'` → `failed` için `count=0` → 409 "Oyun zaten tamamlandı".
  - `status/route.ts:33`: hub da yalnızca `completed`'i "oynandı" sayıyor.
- **Sorun:** Oyuncu kaybediyor, sonuç ekranı "Yarın tekrar dene" diyor. Ama hub oyunu "oynanmadı" gösteriyor ve sayfa yeniden açılınca "Oyna" çalışıyor. Oyuncu birkaç dakika oynayıp tahtayı temizlese bile `toast.error('Oyun zaten tamamlandı')` alıyor. Sonuç ekranında da ödülsüz, yanıltıcı bir "18 skor gerekiyordu" notu çıkıyor (`use-mini-game.ts:126-128`). Ekonomi açısından açık yok, ödül verilmiyor; ama bu bir güven kırıcı. Sorun tüm generic oyunlarda ortak.
- **Öneri:** "Günün hakkı kullanıldı" tek bir yerde tanımlansın: `status IN ('completed','failed')`. `start` ve `status` uçları bu kümeyi kilit saysın. `start`, `failed` için `alreadyPlayed:true` ile birlikte `lastResult: { score, won:false }` dönsün; shell kilit ekranında dünkü/bugünkü sonucu gösterebilsin. İstenirse ürün kararıyla "kayıptan sonra pratik modu (ödülsüz)" ayrı bir faz olarak sunulabilir. O durumda istemci `complete`'i hiç çağırmaz ve arayüz bunu açıkça "Pratik" diye etiketler.
- **Efor:** S

### 3. [YÜKSEK · Mobil] Kanvasa dokunarak fırlatma mobilde çalışmıyor (spec gereği)
- **Kanıt:**
  - `spam-breaker-game.tsx:116-118`: `onTouch` içinde `e.preventDefault()`, `:134` ile `touchstart`'a `passive:false` bağlanmış.
  - Fırlatma yalnızca sarmalayıcıdaki `onClick` ile yapılıyor (`:356`).
  - Kanvas içinde "Dokun / Boşluk → fırlat" yazıyor (`:312`).
- **Sorun:** Touch Events spec'ine göre `touchstart` üzerinde `preventDefault()` çağrılırsa uyumluluk fare olayları ve `click` üretilmez. Mobil oyuncu kanvasa dokunduğunda top fırlamıyor. Fırlatmak için ancak kanvasın dışındaki 12px'lik dolguya (`p-3`) veya alttaki ipucu metnine dokunması gerekiyor. Oyunun her canında tekrarlanan ana hareket bu. Gerçek cihazda doğrulanmadı, ancak davranış spec ile belirlenmiş.
- **Öneri:** Giriş katmanını Pointer Events'e taşıyın: `pointerdown` (fırlat + konumla), `pointermove` (kalkan), `touch-action: none`. Böylece fare, dokunma ve kalem tek yoldan işlenir. Daha iyi bir deneyim için göreli sürükleme kullanılabilir (parmak kalkanın altında değil, ekranın herhangi bir yerinde sürüklenir; Monzo/Revolut'taki gibi baskın bir hareket alanı). Fırlatma ayrıca "parmağı kaldırınca" (`pointerup`) da tetiklenebilir.
- **Efor:** S

### 4. [YÜKSEK · Veri bütünlüğü/Adalet] Turnuva ve liderlikte tüm kazananlar 49 puanda eşit; ödül sırası belirsiz
- **Kanıt:**
  - `tournament/route.ts:28-39`: `groupBy ... orderBy: { _max: { starsCollected: 'desc' } }` ile sıralanıyor, eşitlik kırıcı yok.
  - `tournament/route.ts:83-86,145-148`: geçen haftanın sırası her GET ve POST'ta yeniden hesaplanıyor.
  - `schema.prisma:1088`: `@@unique([userId, gameType, weekKey])` var; sıra başına tekillik yok.
  - Kazanan her oturumda skor 49 (Bulgu 1).
- **Sorun:** Spam Kırıcı'da tahtayı temizleyen herkes 49 puan alıyor. Haftalık 500/300/150 puanlık ödülleri hangi üç kişinin alacağını Postgres'in eşit satırları döndürdüğü sıra belirliyor; bu sıra garanti değil. Sıra GET ile POST arasında değişirse "Ödülü al" butonu 400 dönebilir. Daha kötüsü, sıra farklı zamanlarda farklı gelirse aynı haftada üçten fazla kişi ödül alabilir. Kilit sıra başına değil, kullanıcı başına. Bu senaryo doğrulanmadı; belirsiz sıralamadan çıkan teorik bir risk. Liderlik tablosunda da tüm satırlar 49 olduğu için tablo anlamsız.
- **Öneri:**
  1. Skoru ayrıştırıcı hale getirin: temizleme süresi + kalan can bonusu + kombo. Örn. `score = isabet×10 + kalanCan×50 + süreBonusu`. `maxScore`'u buna göre yeniden tanımlayın. Ödül eşiğini "isabet" biriminde tutmak için `MiniGameSession`'a `durationMs` ve `meta Json` alanları eklenebilir.
  2. Sıralamaya deterministik bir eşitlik kırıcı ekleyin: önce ilk ulaşılan zaman (`MIN(completedAt)`), sonra `userId`.
  3. Kapanan haftanın sonucunu bir kez dondurun: cron ile `TournamentResult(weekKey, gameType, rank, userId)` tablosu yazılsın. Claim bu tablodan okunsun ve `@@unique([gameType, weekKey, rank])` ile sıra başına tek ödül garanti edilsin.
- **Efor:** M

### 5. [YÜKSEK · Oynanış/Adalet] Fizik kare hızına bağlı; 120/144 Hz ekranlarda oyun iki kat hızlı
- **Kanıt:**
  - `spam-breaker-game.tsx:244-254`: `loop` her `requestAnimationFrame`'de `dt = 1/sub` ile ilerliyor, zaman damgası kullanılmıyor.
  - Hızlar px/kare cinsinden (`:94`, `:177`).
  - Kardeş oyunlar zaman tabanlı: `frost-catcher-game.tsx:201`, `spam-defense-game.tsx:186`, `troll-slayer-game.tsx:219` (`performance.now()`).
- **Sorun:** 120 Hz Android telefonlarda ve 144 Hz masaüstü monitörlerde top 2–2.4 kat hızlı gidiyor. Ödüllü ve turnuvalı bir oyunda donanıma göre zorluk değişiyor; bu adaletsiz. iOS Safari rAF'ı varsayılan olarak 60 fps'e sınırlayabildiği için etkisi orada daha az olabilir (doğrulanmadı). Ters yönde, düşük güçlü cihazda kare düşünce oyun ağır çekime giriyor.
- **Öneri:** `loop(ts)` içinde `dtMs = min(ts - last, 50)` hesaplayın, hızları px/sn'ye çevirin (`speed = 312 px/s`) ve alt adım sayısını `ceil(speed*dt / (BALL_R*0.7))` ile bulun. Bu, `frost-catcher`'daki desenle aynı. İsteğe bağlı olarak sabit adımlı bir akümülatör (1/120 sn) kullanılabilir; bu, tekrar oynatılabilir ve deterministik bir fizik sağlar ve ileride sunucu doğrulaması (Bulgu 6) için de zemin olur.
- **Efor:** S

### 6. [YÜKSEK · Güvenlik/Ekonomi — sistem geneli] Skor ve galibiyet istemcinin beyanına dayanıyor
- **Kanıt:**
  - `complete/route.ts:15-22`: `score`, `durationSec` ve `won` istemciden geliyor.
  - Doğrulama yalnızca cap (`:61`) ve en kısa süre (`:81-83`, `minDurationSec: 12`) ile yapılıyor.
- **Sorun:** Bir betik `POST /start`, 12 sn bekleme ve `POST /complete {score:49, won:true, durationSec:13}` ile her gün 170 puan + 85 XP alabilir. Aynı desen 19 generic oyunun hepsinde geçerli. `points_credited` olayı yazıldığı için (`:162-171`) hız dedektörü bunu görebilir, ama engellemiyor. 49 isabetli tam temizliğin 12 sn'de yapılması fiziksel olarak olası değil; yani `minDurationSec` bu oyun için anlamsız derecede düşük.
- **Öneri:**
  - **Kısa vade:** Oyuna özel gerçekçi bir alt süre belirleyin. Tahta en hızlı ~45–60 sn'de temizlenebilir; bu, ölçülerek doğrulanmalı. Ayrıca sunucuda skor/süre oranı kontrolü ekleyin (isabet/sn üst sınırı).
  - **Orta vade:** `start` bir `seed` dönsün ve istemci olay günlüğünü (fırlatma zamanları + kalkan konum örnekleri, sıkıştırılmış) `complete`'e göndersin. Deterministik fizik (Bulgu 5) ile sunucu bunu tekrar oynatıp skoru yeniden hesaplasın. En azından olay sayısının ve sürelerin istatistiksel tutarlılığı kontrol edilsin.
  - Tüm oyunlar için `lib/minigame-anticheat.ts` adında ortak bir doğrulayıcı tasarlanabilir.
- **Efor:** M (kısa vade S)

### 7. [ORTA · Görsel/Erişilebilirlik] Turnuva bloğu açık temada okunamıyor
- **Kanıt:**
  - `game-shell.tsx:101-102`: kabuğun arka planı sabit koyu (`rgba(6,4,16,0.98)`) ve metin rengi tanımlı değil.
  - `game-tournament.tsx:134,164,166,176-177`: isim, skor ve "Geçen hafta X. oldun" metinlerinde renk sınıfı yok; `body`'nin `text-foreground` değerini miras alıyor.
  - `app/globals.css:13`: açık temada `--foreground: 240 10% 10%`, yani neredeyse siyah.
  - `text-muted-foreground` (`globals.css:23`) koyu zemin üzerinde düşük kontrastlı.
- **Sorun:** Açık temadaki kullanıcı için turnuva sıralamasındaki isimler, skorlar ve hatta bekleyen ödül başlığı siyah zemin üzerinde siyah metin olarak görünüyor. `GameLeaderboard` ise `text-white/90` kullandığı için okunuyor; iki komşu bileşen tutarsız.
- **Öneri:** Oyun kabuğu bir "koyu sahne" bağlamı tanımlasın: `GameShell` köküne `dark` sınıfı veya `data-theme="dark"` uygulanırsa içindeki shadcn token'ları otomatik olarak koyu palete geçer. `GameTournament` ile `GameLeaderboard` da aynı `GameListRow` alt bileşenini paylaşsın. Böylece tek bir satır tasarımı ve kontrast güvencesi olur.
- **Efor:** S

### 8. [ORTA · Mimari/Tutarlılık] İstemci admin override'larını yok sayıyor
- **Kanıt:**
  - `spam-breaker-game.tsx:11` (`DEF = getMiniGame(...)` statik), `:183,:185,:329-336,:350` hep `DEF` kullanıyor.
  - `use-mini-game.ts:70,137`: sunucudan `config` alınıp döndürülüyor ama hiç okunmuyor.
  - `page.tsx:7,18-19`: başlık ve açıklama sabit kodlu.
  - Hub ise override'ı uyguluyor (`status/route.ts:40-48`).
- **Sorun:** Admin `/admin/games`'te başlık, emoji, renk veya eşik değiştirdiğinde hub kartı yeni değeri gösteriyor, oyun sayfası eskisini. Eşik veya `maxScore` değişirse istemcinin bitiş koşulu ile sunucunun ödül hesabı birbirinden ayrılıyor. Pasif oyunun sayfası da açılmaya devam ediyor (`start/route.ts:34-39` yalnızca "Oyna" anında 403 dönüyor).
- **Öneri:** Sayfa bir server component olarak `getEffectiveMiniGame('spam-breaker')` okusun. Oyun pasifse "Bu oyun şu an kapalı" boş durumu ve hub'a dönüş linki gösterilsin. Etkin tanım `SpamBreakerGame`'e `def` prop'u olarak geçsin; `generateMetadata` de buradan üretilsin. Böylece istemci ve sunucu tek kaynaktan beslenir. Aynı değişiklikle bugünkü durum (`alreadyPlayed`, kişisel rekor) da sunucuda okunup ilk render'da gösterilebilir (Bulgu 10).
- **Efor:** S–M

### 9. [ORTA · Erişilebilirlik] Canvas oyunu ekran okuyucuya kapalı; azaltılmış hareket ve ses ayarları birbirine bağlı
- **Kanıt:**
  - `spam-breaker-game.tsx:358-364`: `canvas`'ta `aria-label` ve `role` yok.
  - `:342-346`: canlar yalnızca renkle anlatılıyor.
  - `:356`: tıklanabilir `div` klavyeyle odaklanamıyor.
  - `:24-26`: azaltılmış hareket yalnızca uygulama sınıfına bakıyor, `matchMedia('(prefers-reduced-motion)')` kontrol edilmiyor. Oysa framer tarafında `MotionConfig reducedMotion="user"` var (`components/providers.tsx:232`).
  - `lib/game-sounds.ts:10-13`: ses yalnızca `reduce-animations` ile kapanıyor.
- **Sorun:** OS'ta azaltılmış hareketi açık olan kullanıcı ekran sarsıntısını görüyor, konfeti de bu tercihe bakmıyor (`game-shell.tsx:13-16`). Sesi kapatmak isteyen kullanıcının animasyonları da kapatması gerekiyor. Görme engelli kullanıcı skor ve can değişimini duyamıyor.
- **Öneri:**
  - Ortak bir `useGamePrefs()` hook'u oluşturun: `reducedMotion = appClass || mediaQuery` ve `muted` (ayrı, kalıcı). Shell başlığına 🔈 sessiz düğmesi eklenip tercih `localStorage` + profil üzerinde saklansın.
  - Canvas'a `role="img" aria-label="Spam Kırıcı oyun alanı"` verilsin. HUD'a `aria-live="polite"` bir özet eklensin ("Skor 12, 2 can kaldı"); her isabette değil, can kaybında ve 5'in katlarında güncellensin.
  - Fırlatma alanı `button` olsun.
- **Efor:** S–M

### 10. [ORTA · UX] Bilgi mimarisi: üçlü tekrar, gizli kilit, çıkışsız sonuç ekranı
- **Kanıt:**
  - Açıklama üç yerde neredeyse aynı: `page.tsx:19`, `minigame-config.ts:328-329` (`game-shell.tsx:184`), `minigame-copy.ts:204` (`game-shell.tsx:187`).
  - Kilit ancak tıklayınca öğreniliyor (`use-mini-game.ts:64-67`).
  - Sonuç ekranında CTA yok (`game-shell.tsx:222-305`).
  - Sıfırlama UTC olarak anlatılıyor (`:323`).
- **Sorun:** Masaüstünde aynı cümle üst üste üç kez okunuyor. Bugün oynamış kullanıcı yine büyük ve nabız atan bir "Oyna" butonu görüyor; butona basınca kilitle karşılaşıyor, bu hayal kırıklığı yaratan bir döngü. Oyun bitince "Diğer oyunlara geç", "Hub'a dön" ya da "Paylaş" gibi bir yol yok; kullanıcı tarayıcının geri tuşuna kalıyor. Bu, Duolingo'nun ders sonu "Devam" akışının tam tersi. "00:00 (UTC)" Türk kullanıcı için 03:00 demek ve anlaşılmıyor.
- **Öneri:**
  - Lobi tek bir hiyerarşiyle kurulsun: kahraman alan (emoji/3B önizleme + tek cümlelik kanca), altında "Bugünkü hakkın: 1/1" durumu ve kişisel rekor, birincil CTA, ardından sekmeli Turnuva | Tüm zamanlar.
  - Kilit durumu sunucudan ilk render'da gelsin ve CTA yerine yerel saatle "Yeni hak: 03:00'te (4 sa 12 dk)" geri sayımı gösterilsin.
  - Sonuç ekranına birincil "Sıradaki oyun →" (hub'da bugün oynanmamış en iyi öneri), ikincil "Oyun Merkezi" ve "Sonucu paylaş" eklensin.
- **Efor:** M

### 11. [ORTA · Görsel/Performans] Canvas DPR'sız (bulanık) ve her karede pahalı `shadowBlur`
- **Kanıt:**
  - `spam-breaker-game.tsx:358-361`: `width={340} height={440}` sabit; `devicePixelRatio` kullanılmıyor. Karşılaştırma: `frost-catcher-game.tsx:160`.
  - `:275-287`: 35 tuğlanın her biri için her karede `shadowBlur` 6–12 ile çiziliyor; kalkan (`:294`) ve top (`:302`) için de aynı.
- **Sorun:** 2x/3x ekranlarda (iPhone ve çoğu Android) tuğlalar ve top yumuşak/bulanık görünüyor; premium his zayıflıyor. Canvas 2D'de `shadowBlur` her çizimde Gauss bulanıklığı hesaplıyor ve düşük güçlü cihazlarda kare düşürebiliyor. Bu ölçülmedi, profil alınması önerilir.
- **Öneri:**
  - Canvas'ı `dpr = min(devicePixelRatio, 2)` ile ölçekleyip `ctx.setTransform(dpr, …)` uygulayın.
  - Parlayan tuğla sprite'larını (5 renk × 2 hp) bir kez `OffscreenCanvas`'a önceden çizip `drawImage` ile basın. Tuğlalar yalnızca kırılınca değiştiği için statik bir katman canvas'ı da düşünülebilir: tuğlalar bir katmanda, top ve kalkan üst katmanda.
  - İsteğe bağlı olarak genişliğe göre ölçek (`ResizeObserver`) eklenebilir; masaüstünde oyun 340px'te küçük kalıyor.
- **Efor:** S

### 12. [DÜŞÜK · UX/Dil] Yanıltıcı ya da tutarsız mikro metinler
- **Kanıt:**
  - `use-mini-game.ts:114-115`: `tooFast` durumunda bile "Kazandın ama ödül eşiğini geçemedin" diyor; sunucunun `tooFast` alanı okunmuyor (`complete/route.ts:226`).
  - `game-tournament.tsx:6,90,93`: müşteri bileşeni `@/lib/admin-toast` kullanıyor ve "Basarili: ", "Dikkat: " öneklerini Türkçe karakter olmadan gösteriyor (`lib/admin-toast.ts`).
  - `game-tournament.tsx:166,177`: skor birimi "⭐" ama bu oyunda birim tuğla.
  - Anlatıda "Çekirdeği koru" (`page.tsx:19`, `minigame-config.ts:329`, `minigame-copy.ts:204,206`) var, ama oyunda çekirdek diye bir görsel öğe yok (`spam-breaker-game.tsx:260-314`).
  - `🧊` emojisi kırmızı "spam" temasıyla örtüşmüyor.
- **Öneri:**
  - Sonuç mesajları sunucunun gerekçe kodundan üretilsin: `reason: 'below_threshold' | 'too_fast' | 'lost'`.
  - Müşteri tarafında `sonner` doğrudan kullanılsın.
  - Birim etiketi registry'de tanımlansın (`scoreUnit: 'tuğla'`).
  - Anlatı ya görselleştirilsin (alt kenarda nabız atan bir "Qratex çekirdeği" ve her can kaybında çatlayan bir kalkan çizgisi) ya da metinden çıkarılsın.
- **Efor:** S

### 13. [DÜŞÜK · Hata yönetimi] Liderlik hatası "boş" gibi görünüyor; turnuva hatası sessizce kayboluyor
- **Kanıt:**
  - `game-leaderboard.tsx:32-41,55-61`: `fetch` hatası veya 500 yanıtı gelince "Henüz skor yok — ilk rekoru sen kır!" yazıyor.
  - `game-tournament.tsx:69,106`: hata durumunda bileşen `null` dönüp yok oluyor.
  - Liderlik `take: 100` ile sınırlı (`leaderboard/route.ts:52`); "100 oyuncu" tavanına takılıyor ve 100. sıranın ötesinde `me` `null` dönüyor.
- **Öneri:** Her iki bileşen için `error` durumu ve "Tekrar dene" düğmesi eklensin. Oyuncu sayısı ayrı bir `count` sorgusuyla alınsın. Kullanıcının sırası, kendi en iyi skorundan büyük skora sahip kullanıcı sayısı + 1 olarak hesaplansın; bu, `take` sınırından bağımsız çalışır. Turnuva ve liderlik GET'leri için Upstash Redis'te 30–60 sn önbellek kullanılsın (perf notundaki desenle uyumlu). `complete`'te `revalidate` ile bayatlatılsın.
- **Efor:** S

### 14. [DÜŞÜK · Mimari] 19 neredeyse aynı `page.tsx` dosyası
- **Kanıt:** `app/customer/games/spam-breaker/page.tsx` ile `app/customer/games/spam-defense/page.tsx` yalnızca import ve metinle ayrılıyor.
- **Öneri:** `app/customer/games/[game]/page.tsx` dinamik rotası, `getEffectiveMiniGame` ve `next/dynamic` ile oyun bileşen haritası (`{ 'spam-breaker': dynamic(() => import(...)) }`) kullanılsın. `generateStaticParams` registry'den üretilsin. Böylece Bulgu 8 tüm oyunlarda tek seferde çözülür ve her oyun kendi chunk'ında kalır.
- **Efor:** M

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kademeli başarı ve kısmi ödül (Duolingo yıldızları, Starbucks "Bonus Star" kademeleri):** Bugün ya hep ya hiç; 48/49 isabet yapmak 0 ödül demek. 1/2/3 yıldız ve buna göre ölçeklenen puan, tekrar oynama ve elde tutma için en güçlü kaldıraç.
2. **Kişisel rekor ve ilerleme hafızası (Duolingo, Spotify Wrapped):** "En iyin: 41 tuğla · 3 gün önce", "Bu hafta 2. denemen" gibi kişisel bağlam yok. Sonuç ekranında "Yeni rekor!" anı da yok.
3. **Duraklat, devam et ve oturum kurtarma:** Gelen bir bildirim veya arama oyunu yarıda kesiyor; sayfa yenilenince aynı oturum yeniden başlıyor ama ilerleme kayboluyor.
4. **Sonraki adım akışı (Duolingo "Devam", Revolut başarı ekranları):** Sonuç ekranından sıradaki oyuna veya ödül mağazasına yönlendiren bir CTA yok; ayrıca "Kazandığın 170 puanla şunu alabilirsin" gibi bir köprü de yok.
5. **Paylaşılabilir sonuç kartı (Spotify Wrapped):** Turnuva sırası ve tahta temizleme süresiyle sosyal paylaşım kartı yok (Web Share API + OG görseli).
6. **Oyun içi güçlendirmeler ve zorluk eğrisi:** Tek tahta ve tek seviye var; çoklu top, geniş kalkan, "spam virüsü" gibi düşen güçlendirmeler yok. Günlük "tohumlu" tahta (her gün farklı desen, herkes aynı) ise turnuvayı adil ve konuşulabilir yapardı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfayı açtığında üç şeyi anında görsün: bugünkü hakkı, hedefi ve kişisel rekoru. Tek dokunuşla oyuna girsin, 60–90 sn'lik akıcı ve adil (zaman tabanlı fizik) bir tahta oynasın, kısmi başarısı da ödüllendirilsin. Sonuç ekranı onu bir sonraki anlamlı adıma taşısın: sıradaki oyun, turnuva konumu ya da ödül mağazası.

**Yerleşim (mobil öncelikli):**
1. **Lobi kahramanı:** Kompakt bir başlık satırı (emoji, ad, `?` kural sayfası, 🔈 sessiz). Altında üç istatistik çipi: "Bugünkü hak 1/1", "Rekorun 41", "Turnuva #7". Ardından tek bir birincil CTA. Hak kullanıldıysa CTA'nın yerinde yerel saate göre geri sayım ve "Sıradaki oyun" önerisi olsun.
2. **Hedef şeridi:** Üç yıldız kademesi (18 / 35 / 49) ve her birinin ödülü. Bu şerit oyun sırasında HUD'da da ilerleme çubuğu olarak dursun.
3. **Oyun alanı:** Tam genişlik, DPR-net bir canvas. Göreli sürükleme alanı canvas'ın altına taşan bir "parmak bölgesi" olsun, böylece parmak topu örtmez. Fırlatma `pointerup` ile yapılsın. Alt kenarda can sayısını görselleştiren bir "çekirdek kalkanı" çizgisi bulunsun.
4. **Sonuç:** Kazanılan yıldızlar sırayla dolsun, ardından ödül sayacı ve rekor rozeti gelsin. "Sıradaki oyun →", "Oyun Merkezi" ve "Paylaş" düğmeleri olsun. Turnuva ve tüm zamanlar sekmeleri en altta, katlanabilir halde dursun.

**Motion / 3B (yerinde ve ölçülü):**
- Oyun içinde three.js'e gerek yok; 2D canvas doğru tercih.
- Juice paylaşılan `FxLayer` ile verilsin: tuğla kırılınca 6–8 parçacıklık kıvılcım, "+1" yüzen metin, hp2 tuğlada çatlak dokusu, can kaybında kısa kırmızı vinyet.
- Sarsıntı 4px'i geçmesin. Hepsi `useGamePrefs().reducedMotion` ile kapanabilsin; bu tercih OS ayarını da kapsamalı.
- Lobideki emoji yerine, oyunun ilk karesinin statik önizlemesi (tuğla deseni) daha bilgilendirici.
- Sonuçtaki sonsuz dönen konik parlama 2 tur sonra dursun.
- Yıldız dolumu `spring` ile 3×150 ms gecikmeyle oynasın.

**Veri / API değişiklikleri:**
- `MiniGameSession`'a şu alanları ekleyin: `durationMs Int?`, `meta Json?` (kalan can, kademe, seed), `tier Int @default(0)`.
- Registry'ye `rewardTiers: [{ minScore, points, xp }]` ve `scoreUnit` alanlarını ekleyin. `computeEffectiveReward` kademeli hale gelsin.
- `start`: `failed` durumunu kilit saysın; `{ alreadyPlayed, lastResult, personalBest, seed, config(effective, tiers) }` dönsün.
- `complete`: `reason` kodu (`lost | below_threshold | too_fast | ok`) ile `tier` dönsün. Oyuna özel gerçekçi `minDurationSec` tanımlansın; olay günlüğü doğrulaması (tohumlu, deterministik fizik) ise ikinci faz olsun.
- Turnuva: kapanış cron'u `TournamentResult` tablosunu dondursun (`@@unique([gameType, weekKey, rank])`). Canlı sıralamada `best DESC, firstAchievedAt ASC` ile deterministik eşitlik kırılsın. GET'ler Redis'te 30–60 sn önbelleklensin.
- Sayfa: `app/customer/games/[game]/page.tsx` dinamik rotası; sunucuda etkin tanım + bugünkü durum + kişisel rekor okunup istemciye ilk render'da verilsin.

---

## Çakışmalar / birleştirme önerisi

- **/customer/games/spam-defense:** Aynı anlatı ("Qratex Çekirdeği'ni spam'den koru"), aynı vurgu rengi `#ef4444` ve aynı ödül (170 puan / 85 XP) (`lib/minigame-config.ts:129-141` ile `:325-338`). Mekanikler farklı (nişancılık ve breakout), bu yüzden birleştirme önerilmez. Ancak hub'da iki oyun neredeyse ikiz görünüyor. Kimlikler ayrıştırılmalı: Spam Kırıcı için farklı bir vurgu rengi ve "posta kutusunu temizle" gibi farklı bir anlatı.
- **/customer/games/frost-catcher:** Aynı "alt kenarda kaydırılan kalkan/eldiven" kontrol modeli. Frost-catcher zaman tabanlı fizik ve DPR'ı zaten doğru uyguluyor (`frost-catcher-game.tsx:160,201`). Spam Kırıcı bu ortak altyapıya taşınmalı; ortak bir `usePaddleCanvas` (pointer girişi + dt döngüsü + DPR) hook'u çıkarılabilir.
- **Sayfa katmanı:** 19 oyun sayfası aynı iskeleti kopyalıyor. Bunlar tek bir dinamik rota `app/customer/games/[game]/page.tsx` altında birleştirilmeli (Bulgu 14). Sayfa kaldırılmamalı; oyun özgün bir mekanik sunuyor ve hub'ın çeşitliliğine katkı sağlıyor.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (oyun bileşeni, `use-mini-game`, generic `start`/`complete`/`status` rotaları, `minigame-config-effective`, turnuva rotası, Prisma şeması). Kod değiştirilmedi, DB'ye dokunulmadı, hiçbir komut çalıştırılmadı.

### 1. Ödül koşulu arayüzle çelişiyor (18 eşiği işlevsiz) — **DOĞRULANDI**
- `endGame(won)` yalnızca iki yerden çağrılıyor: `spam-breaker-game.tsx:183-185` (skor ≥ `DEF.maxScore` (49) **veya** tahta boş) ve `:206-208` (canlar bitti → `endGame(false)`). Tahtayı temizlemek tam 49 isabet gerektirdiği için (`:72-79`, 2×7 hp2 + 3×7 hp1) birinci dalda skor her zaman 49; yani `won=true` yalnızca tam temizlikte üretiliyor.
- Sunucu `eligible = won && !tooFast` (`complete/route.ts:86`); `won=false` ise `computeEffectiveReward` hiç çağrılmıyor. Eşik kontrolü (`minigame-config-effective.ts:112`) ancak `won=true` iken devreye giriyor ve o anda skor zaten 49.
- Arayüz ise `Hedef: 18` (`:350`), `18+ = ödül` (`:365`) ve sonuç ekranında `Ödül için 18 skor gerekiyordu` (`game-shell.tsx:290-292`; `minigame-copy.ts` spam-breaker için `rewardMissNote` tanımlamıyor) diyor.
- Ek: istemci statik `DEF.rewardThreshold`'u kullanıyor, `game.config` (sunucunun etkin değeri) okunmuyor; admin override'ı 49'un altına indirilse de hiçbir etkisi yok, 49'un üstüne çıkarılırsa ise tam temizlik bile ödülsüz kalır.
- **Yeniden üretim:** Oyunu başlat, 30 tuğla kır (skor 30), topu üç kez kaçır → `won=false` → ödül yok, ekranda "Ödül için 18 skor gerekiyordu".

### 2. Kayıptan sonra tekrar oynanan oyun 409 alıyor — **DOĞRULANDI**
- Kayıp: `complete/route.ts:101` oturumu `failed` yapıyor.
- Hub: `status/route.ts:33` yalnız `completed` sayıyor → oyun "bugün oynanmadı" görünüyor.
- Yeniden başlatma: `start/route.ts:56-73` yalnız `completed` için kilitliyor; `failed` oturum "yarım kalan aktif oturum" gibi `canPlay:true` + aynı `sessionId` ile dönüyor (yorum satırı `:69` niyetin yalnız `active` olduğunu gösteriyor).
- Bitiş: `complete/route.ts:73` `completed` değil diye geçiyor, ama `:98-99` `updateMany where status:'active'` → `count 0` → `:177-181` 409 "Oyun zaten tamamlandı". `use-mini-game.ts:126-128` hatayı toast'layıp ödülsüz sonuç gösteriyor.
- Ekonomi açığı yok (puan basılmıyor), ama oyuncu tam temizlik yapsa bile ödülsüz kalıyor ve kafa karıştırıcı bir hata görüyor. Aynı desen tüm generic oyunlarda ve `pacman/complete/route.ts:75`'te var.
- **Yeniden üretim:** Oyunu kaybet → sayfayı yenile/hub'dan tekrar gir → "Oyna" çalışır → tahtayı temizle → 409 toast + "Ödül için 18 skor gerekiyordu".

### 3. Mobilde kanvasa dokunarak fırlatma çalışmıyor — **DOĞRULANDI (kod + spec düzeyinde; gerçek cihazda test edilmedi)**
- `:116-118` `onTouch` koşulsuz `e.preventDefault()` çağırıyor ve `:134` ile `touchstart`'a `passive:false` bağlı. Touch Events spec'ine ve Chrome/Safari davranışına göre iptal edilen `touchstart` uyumluluk fare olaylarını ve dokunmadan türeyen `click`'i bastırır.
- Fırlatma yalnızca sarmalayıcının React `onClick`'iyle (`:356`) ve klavye boşluğuyla (`:127-129`) tetikleniyor; `onTouch` içinde `launch()` çağrısı yok, Pointer Events de kullanılmıyor.
- Sonuç: kanvasa dokunma yalnızca kalkanı taşıyor; top ancak kanvas dışındaki 12 px dolguya (`p-3`) veya alt ipucu metnine dokunulunca fırlıyor. Kanvas içindeki "Dokun / Boşluk → fırlat" yazısı (`:312`) yanıltıcı.
- **Yeniden üretim:** Mobil tarayıcıda oyunu başlat, kanvasın ortasına dokun → top fırlamaz.

### 4. Turnuva ödül sırası eşit skorlarda belirsiz — **DOĞRULANDI (sıralama belirsizliği); fazla ödeme kısmı teorik**
- `tournament/route.ts:29-35` `groupBy ... orderBy {_max: desc}` ikincil sıralama anahtarı içermiyor. İddia 1 nedeniyle Spam Kırıcı'da `completed` olan her dürüst oturumun `starsCollected` değeri 49 (`complete/route.ts:102`); dolayısıyla tüm haftalık kazananlar eşit ve ilk 3 (500/300/150) Postgres'in eşit satırlar için ürettiği keyfi sırayla belirleniyor. "İlk ulaşan" gibi savunulabilir bir kural yok.
- Canlı hafta (GET) için yeni satırlar eklendikçe eşitlerin sırası değişebiliyor; oyuncu görünen sırasının oynadığını görebilir.
- Kapanmış hafta verisi statik olduğundan aynı plan altında sıra büyük olasılıkla kararlı kalır. Bu yüzden POST'ta sıranın değişip `400` dönmesi veya `@@unique([userId, gameType, weekKey])` (`schema.prisma:1088`) yalnız kullanıcı başına tekillik sağladığı için bir haftada 3'ten fazla ödül ödenmesi **teorik olarak mümkün ama doğrulanmadı**. Sıra başına tekillik (`[gameType, weekKey, rank]`) gerçekten yok.
- **Yeniden üretim:** 5 kullanıcı aynı hafta tahtayı temizler (hepsi 49) → kimin 1., 2., 3. olacağı oynama zamanı veya başka bir kuralla değil, DB'nin çıktı sırasıyla belirlenir.

### 5. Fizik kare hızına bağlı — **DOĞRULANDI**
- `loop` (`:244-254`) rAF zaman damgasını almıyor; alt-adım `dt = 1/sub` her karede toplam tam bir "kare birimi" ilerletiyor; hızlar px/kare (`:94` 5.2, `:177` en çok 8.5). 120 Hz ekranda saniyede 2×, 144 Hz'de 2.4× yol alınıyor.
- Kardeş oyunlar `frost-catcher-game.tsx:203-204` ve `spam-defense-game.tsx:186-187` `now - last` ile zaman tabanlı çalışıyor.
- Ödüllü ve turnuvalı bir oyunda zorluk donanıma göre değişiyor (aynı zamanda 120 Hz'de tur süresi kısalıyor).
- **Yeniden üretim:** Aynı oyunu 60 Hz ve 120 Hz ekranda aç → topun ekran üzerindeki hızı iki kat.

### 6. Skor ve galibiyet istemci beyanı (sistem geneli) — **DOĞRULANDI**
- `complete/route.ts:15-22` `score`, `won`, `durationSec` doğrudan istemciden geliyor; sunucu yalnız `:61` cap'i ve `:81-83` sunucu tarafı geçen süreyi (`minDurationSec` = 12, `minigame-config.ts:337`) kontrol ediyor. Olay günlüğü, tohum veya fizik doğrulaması yok; oyun puanları `points-caps` (yalnız feedback için, `lib/points-caps.ts:57`) ile de sınırlanmıyor, sadece `points_credited` ile velocity dedektörüne görünür.
- Tasarım gereği tavan "oyun başına günde 1 ödül"; ancak bu tavan oynamadan, betikle her gün her generic oyun için alınabilir. Tam temizlik (49 isabet, top 5.2–8.5 px/kare, paddle–tuğla mesafesi ~250 px) 12 sn'de fiziksel olarak mümkün değil; alt süre anlamsız derecede düşük. Ayrıca sahte `won:true, score:49` kayıtları turnuva sıralamasına da giriyor (İddia 4 ile birleşince ödül keyfi biçimde betik kullanıcılarına gidebilir).
- **Yeniden üretim:** Oturumlu müşteri `POST /api/customer/games/spam-breaker/start` → 12 sn bekle → `POST .../complete {sessionId, score:49, durationSec:12, won:true}` → 170 puan + 85 XP (+ seri XP).
