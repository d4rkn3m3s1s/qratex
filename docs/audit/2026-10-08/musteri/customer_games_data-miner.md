# /customer/games/data-miner

**Amaç:** Müşteri panelindeki 20 mini oyundan biri. 4×4 "holografik küp" ızgarasında kör açma yapılan, "bot tuzağı" ile risk-ödül vaat eden, günde 1 hakla 150 puan + 75 XP (eşik: 10 skor) ve haftalık turnuva / tüm zamanlar liderliği sunan oyun. (`app/customer/games/data-miner/page.tsx`, `components/customer/games/data-miner-game.tsx`, `lib/minigame-config.ts:143-155`)

**Genel puan: 4,5 / 10** · **Karar: yeniden tasarla** (oyun kabuğu ve sunucu akışı korunabilir. Ama oyun mekaniği beceri içermiyor, "günde 1 hak" kuralı delinebiliyor ve sunucu istemcinin skoruna güveniyor. Çekirdek döngünün baştan kurgulanması gerekiyor.)

> Yöntem notu: Yalnızca kod okundu. Dev server, build, test ya da DB çalıştırılmadı. Kazanma olasılığı, oyunun kurallarını birebir taklit eden, proje kodu içe aktarmayan bağımsız bir Monte Carlo hesabıyla (400 bin tur) bulundu. Görsel/kontrast bulguları kod okumasına dayanıyor; ekranda görülerek doğrulanmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Temel döngü çalışıyor. Ancak sayfa yenilenerek tahta yeniden karılabiliyor (sınırsız deneme), kaybedenler "oynandı" diye kilitlenmiyor, 0 canla bile skor kasalanabiliyor ve `maxScore` dalı ölü kod. |
| UX | 4/10 | Oyunda karar verdirecek bilgi yok, sonuç tamamen şans (en iyi stratejiyle ~%29 kazanma). "Skoru kasala" ödülün eşik altında sıfır olduğunu gizliyor. Gönüllü çıkış, "Tuzağa Düştün 💣" diye gösteriliyor. |
| Görsel | 6/10 | Neon/cyberpunk kabuk, kart çevirme ve parçacık efektleri iyi duruyor. Ama emoji tabanlı yüzler (💠💎🤖·) ucuz görünüyor ve turnuva bileşeni koyu kabuk içinde tema token'ları kullanıyor. |
| Mimari | 5/10 | `useMiniGame` + `GameShell` + `FxLayer` ayrımı temiz. Fakat istemci, sunucunun döndürdüğü `config` yerine statik `DEF` kullanıyor, state updater içinde yan etki var ve anti-cheat yalnızca eşik ile süre kontrolü yapıyor. |
| Performans | 7/10 | Hafif DOM ızgarası, 16 buton. FX canvas'ı oyun boyunca boşta da rAF döngüsünde çalışıyor. `complete` her çağrıda kullanıcının TÜM oturumlarını iki kez çekiyor. |
| Erişilebilirlik + Mobil | 4/10 | Hücreler native `button`. Ama aria-label, aria-live, can sayısını metinle veren bir öğe ve ses kapatma düğmesi yok. 10px'lik %40 beyaz metnin kontrastı düşük. OS'taki "hareketi azalt" ayarı canvas efektlerini kapatmıyor. Mobil yerleşim düzgün. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı rol kapısı (yalnız CUSTOMER) | ÇALIŞIYOR | `app/customer/games/data-miner/page.tsx:10-13` | Oturum yoksa veya rol farklıysa `/auth/signin`'e yönlendiriyor. Giriş yapmış ama rolü farklı biri de giriş sayfasına düşüyor, bu yanlış bir hedef. |
| 2 | Sayfa `<title>` | KISMİ | `page.tsx:7` + `app/customer/layout.tsx:17-21` | Şablonla birleşince "Veri Madencisi \| QRateX \| Müşteri alanı" oluyor, marka iki kez geçiyor. |
| 3 | Masaüstü sayfa başlığı (`DashboardPageHeading`) | ÇALIŞIYOR | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Mobilde gizli (`hidden sm:flex`). Başlık ve açıklama, admin'in override ettiği başlığı değil sabit metni gösteriyor. |
| 4 | Lobi: emoji, başlık, açıklama, ipucu şeridi | ÇALIŞIYOR | `game-shell.tsx:165-188`, `lib/minigame-copy.ts:95-103` | Aynı "küpleri aç, bot tuzağına dikkat" cümlesi üç yerde tekrar ediyor (sayfa açıklaması, registry açıklaması, `startHint`). |
| 5 | "⛏️ Kazmaya Başla" → `POST /api/customer/games/data-miner/start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79`, `app/api/customer/games/[game]/start/route.ts` | Hata olursa toast gösteriliyor ve `idle` durumuna dönülüyor. |
| 6 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | `loadingSubmit` bu oyun için özelleştirilmemiş. |
| 7 | Haftalık turnuva kartı (geri sayım, ödül havuzu, ilk 10, kendi sıram) | KISMİ | `game-tournament.tsx`, `app/api/customer/tournament/route.ts:28-39` | Eşit skorlarda sıralama belirsiz (bkz. B6). Koyu kabuk içinde açık tema token'ları kullanılıyor (bkz. B11). |
| 8 | Geçen haftanın turnuva ödülünü talep etme | KISMİ | `game-tournament.tsx:84-97`, `tournament/route.ts:128-200` | Atomik tek-claim doğru. Ama GET ile POST eşitlikleri farklı sıralayabilir. Toast'lar müşteriye "Basarili: " / "Dikkat: " önekiyle (ASCII, `ş` yok) gidiyor (`lib/admin-toast.ts`). |
| 9 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx`, `app/api/customer/games/[game]/leaderboard/route.ts:47-57` | Meşru skor 10-12 aralığına sıkışıyor, sahte gönderimler 20'ye kadar çıkabiliyor. Eşitlikleri ayıracak bir kural yok. |
| 10 | "Bugün oynadın" kilit ekranı | KISMİ | `game-shell.tsx:308-332`, `use-mini-game.ts:64-67` | Kilit ancak "Oyna"ya basıldıktan sonra görünüyor. Kaybedenler hiç kilitlenmiyor (B2). "00:00 (UTC)" ifadesi kullanıcıya teknik jargon ve TR saatinde 03:00'e denk geliyor. |
| 11 | HUD: can kalpleri | ÇALIŞIYOR | `data-miner-game.tsx:153-157` | Can sayısı yalnızca renkle anlatılıyor. Metin ya da aria karşılığı yok. |
| 12 | HUD: anlık skor | ÇALIŞIYOR | `data-miner-game.tsx:158` | aria-live yok. |
| 13 | HUD: "Hedef: 10" | KISMİ | `data-miner-game.tsx:159` | Statik `DEF.rewardThreshold` gösteriliyor. Admin override edince sunucuyla çelişiyor (B5). |
| 14 | 4×4 ızgara üretimi (4 bot, 2 nadir, 6 gem, 4 boş) | KISMİ | `data-miner-game.tsx:25-34` | `sort(() => Math.random() - 0.5)` yanlı bir karıştırma (B8). Tahta istemcide üretildiği için DevTools'ta okunabiliyor. |
| 15 | Hücre açma ve kart çevirme animasyonu | ÇALIŞIYOR | `data-miner-game.tsx:74-81`, `171-200` | `disabled={c.opened}` çift açmayı engelliyor. |
| 16 | 💠 Gem: +1, patlama, halka, "+1" yazısı, ses, titreşim | ÇALIŞIYOR | `data-miner-game.tsx:97-106` | — |
| 17 | 💎 Nadir: +3, fanfar, şok dalgası, konfeti | ÇALIŞIYOR | `data-miner-game.tsx:107-112` | Oyunun tek "an"ı ve iyi işliyor. |
| 18 | 🤖 Bot tuzağı: -1 can, kırmızı patlama, "Tuzak! -1" | ÇALIŞIYOR | `data-miner-game.tsx:82-89` | — |
| 19 | Boş hücre | KISMİ | `data-miner-game.tsx:113-115` | Boş hücre olumlu bir "power-up" sesi (`sfxPowerUp`) çalıyor. Geri bildirim hiçbir şey olmamasıyla uyuşmuyor. |
| 20 | Can bitince kaybetme | BOZUK | `data-miner-game.tsx:90-93`, `133-136` | 700 ms gecikme boyunca hücreler ve "Kasala" butonu hâlâ aktif. Ölü oyuncu `won=true` gönderebiliyor (B3). |
| 21 | Tüm güvenli hücreler açılınca turun bitmesi | ÇALIŞIYOR | `data-miner-game.tsx:121-128` | `setCells` updater'ının içinde `setTimeout` (yan etki) çalışıyor. StrictMode'da iki kez tetikleniyor, `finishedRef` koruyor (B12). |
| 22 | `maxScore` (20) ile otomatik kazanma | SAHTE (ölü kod) | `data-miner-game.tsx:117-120`, `minigame-config.ts:150` | Ulaşılabilecek en yüksek skor 6×1 + 2×3 = 12. 20'ye hiçbir zaman ulaşılamıyor. |
| 23 | "💰 Çık & Skoru Kasala" | KISMİ | `data-miner-game.tsx:133-136`, `205-211` | Skor 10'un altındayken sonuç kayıp, ödül 0. Ama metin skorun "kasaya" gireceğini ima ediyor. Onay adımı yok, skor 0'dayken de basılabiliyor (B4). |
| 24 | Alt bilgi efsanesi (💠 +1 · 💎 +3 · 🤖 -1 can) | ÇALIŞIYOR | `data-miner-game.tsx:212` | `text-[10px] text-white/40` ile kontrast ve okunabilirlik düşük. |
| 25 | Sonucu gönderme → `POST .../complete` | ÇALIŞIYOR | `use-mini-game.ts:82-133`, `complete/route.ts` | Ödül sunucuda, eşik ve süreye göre hesaplanıyor. Skorun kendisi doğrulanmıyor (B1). |
| 26 | Sonuç ekranı: kazanma/kaybetme başlığı, 🏆/💀 | KISMİ | `game-shell.tsx:222-305`, `minigame-copy.ts:99-100` | Bota hiç değmeden gönüllü çıkan oyuncuya da "Tuzağa Düştün 💣 / Bot Patladı" ve 💀 gösteriliyor. |
| 27 | Ödül rozeti ve konfeti | ÇALIŞIYOR | `game-shell.tsx:86-94`, `274-288` | — |
| 28 | Ödül, seri ve başarım toast'ları | ÇALIŞIYOR | `use-mini-game.ts:112-125` | "Kazandın ama ödül eşiğini geçemedin" dalı bu oyunda hiç çalışmıyor, çünkü `won` doğrudan eşiğe bağlı (ölü dal). |
| 29 | Günlük oyun serisi bonusu (+10 XP, her 3. gün +30) | ÇALIŞIYOR | `complete/route.ts:115-150` | `GameStreakClaim` UNIQUE kaydıyla atomik. |
| 30 | Yeni başarım tespiti ve bildirimi | ÇALIŞIYOR | `complete/route.ts:89-94`, `196-215` | `computeAchievementStats` kullanıcının bütün oturumlarını iki kez çekiyor (`lib/game-achievement-stats.ts:17-20`). |
| 31 | Ödül bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194` | Transaction dışında yazılıyor. Yazma başarısız olursa puan yine de verilmiş oluyor (kritik değil). |
| 32 | "Günde 1 hak" kuralı | BOZUK | `start/route.ts:56-74`, `complete/route.ts:101` | Sayfa yenilenince tahta yeniden karılıyor. `failed` durumundaki oturum "aktif" gibi dönüyor (B2). |
| 33 | Anti-cheat (skor ve sonuç doğrulama) | BOZUK | `complete/route.ts:59-87` | İstemcinin gönderdiği `score` ve `won` olduğu gibi kabul ediliyor. Tek koruma 8 sn'lik süre kontrolü (B1). |
| 34 | Admin'in oyunu pasifleştirmesi | KISMİ | `start/route.ts:34-39` | Sayfa normal açılıyor. Ancak "Oyna"ya basınca hata toast'ı çıkıyor. Sayfa düzeyinde "bu oyun kapalı" durumu yok. |
| 35 | Admin override'ı (başlık, eşik, emoji, renk) | KISMİ | `data-miner-game.tsx:13`, `139-150`, `lib/minigame-config-effective.ts:40-57` | İstemci yalnızca registry'deki `DEF`'i okuyor. `useMiniGame().config` hiç kullanılmıyor. |
| 36 | Ses ve titreşim | ÇALIŞIYOR | `lib/game-sounds.ts:10-31`, `158-165` | Sayfada ses kapatma düğmesi yok. Sesi kapatmanın tek yolu "animasyonları azalt" tercihi. |
| 37 | Azaltılmış hareket | KISMİ | `fx-layer.tsx:44-47`, `components/providers.tsx:232` | Framer, OS tercihine uyuyor (`reducedMotion="user"`). Ama canvas efektleri, konfeti ve ses yalnızca uygulama içindeki `reduce-animations` sınıfına bakıyor, OS'taki `prefers-reduced-motion` ayarını görmüyor. |
| 38 | Klavye ve ekran okuyucu | KISMİ | `data-miner-game.tsx:172-199` | Butonlar Tab ile geziliyor. Ama etiket yok (ekran okuyucu "⬡" okuyor), satır/sütun bilgisi yok, ok tuşlarıyla gezinme yok, sonuçlar için aria-live yok. |
| 39 | Mobil yerleşim | ÇALIŞIYOR | `data-miner-game.tsx:170`, `app/customer/layout.tsx:41` | 400px genişlikte hücreler ~75px, dokunmaya uygun. `whileHover` dokunmatikte anlamsız ama zararsız. |
| 40 | Hata sınırı | ÇALIŞIYOR | `app/customer/error.tsx` (panel geneli) | Oyuna özgü bir hata/yeniden deneme durumu yok. |
| 41 | Oyun bitince tahtanın tamamını gösterme | EKSİK | — | Oyuncu botların ve nadir taşların nerede olduğunu hiç görmüyor. Bu türün temel kapanış anı eksik. |
| 42 | Oyun Merkezi'ne dönüş / "sıradaki oyun" önerisi | EKSİK | `page.tsx:15-23` | Sayfada geri bağlantısı yok, sonuç ekranında da bir sonraki adım önerilmiyor. |
| 43 | Nasıl oynanır ve oran şeffaflığı (16 küpte 4 bot) | EKSİK | — | Efsane yalnızca puan değerlerini veriyor, bot sayısını söylemiyor. |
| 44 | Kişisel rekor ve oyun geçmişi | EKSİK | — | Liderlik tablosundaki "Sen" satırı dışında kişisel istatistik yok. |
| 45 | Sonucu paylaşma | EKSİK | — | — |
| 46 | Ses kapatma düğmesi | EKSİK | — | — |

**Durum sayıları (46 özellik):** ÇALIŞIYOR 22 (1, 3, 4, 5, 6, 11, 12, 15, 16, 17, 18, 21, 24, 25, 27, 28, 29, 30, 31, 36, 39, 40) · KISMİ 14 (2, 7, 8, 9, 10, 13, 14, 19, 23, 26, 34, 35, 37, 38) · BOZUK 3 (20, 32, 33) · SAHTE 1 (22) · EKSİK 6 (41-46).

---

## Bulgular

### B1 · KRİTİK · Güvenlik/Ekonomi · Sunucu, istemcinin bildirdiği skora ve "kazandım" bayrağına güveniyor
- **Kanıt:** `app/api/customer/games/[game]/complete/route.ts:59-61` (skor yalnızca 0..`maxScore` aralığına sıkıştırılıyor), `:81-87` (koşullar sadece `won && !tooFast` ve eşik), `lib/minigame-config-effective.ts:107-116`. Tahta istemcide üretiliyor (`data-miner-game.tsx:25-34`).
- **Sorun:** Oturum açmış herhangi bir müşteri, `start`'tan dönen `sessionId` ile 8 sn bekleyip `{score:20, won:true, durationSec:9}` gönderirse her gün 150 puan ve 75 XP alıyor. Buna seri bonusu da ekleniyor. Bu oyunda meşru en yüksek skor 12 olduğu için 20'lik sahte skor hem tüm zamanlar liderliğinde (`leaderboard/route.ts:47-53`) hem de haftalık turnuvada (`tournament/route.ts:28-35`) rakipsiz kalıyor. Turnuva birinciliği haftalık **500 puan** basıyor (`lib/tournament-core.ts:13`). Ekonomide puan basan bir yol, istemci doğrulaması olmadan açık duruyor. Bu, projenin "puan basan her yol sunucuda doğrulanmalı" ilkesine aykırı. Not: Sorun 19 registry oyununun ortak `complete` ucunda. Bu oyunda en görünür hâli, çünkü meşru tavan (12) ile sunucu tavanı (20) arasında açık bir fark var.
- **Profesyonel öneri:** Bu oyun, **sunucu otoriteli** yapıya geçirilmeye en uygun tür: tahta küçük ve ayrık, hamleler tek tek. `start` sırasında tahtayı sunucu üretmeli (`crypto.randomInt` ile Fisher-Yates), `MiniGameSession` üzerinde yeni bir `stateJson` alanında (ya da TTL'li Redis anahtarında) saklamalı ve istemciye göndermemeli. Yeni bir `POST /api/customer/games/data-miner/reveal {sessionId, index}` ucu hücreyi açıp türünü döndürmeli, canı ve skoru sunucuda tutmalı. `cashout`/`complete` artık istemcinin skorunu değil sunucudaki durumu kullanmalı. Hamle başına küçük bir gecikme sorun yaratmaz, açılış animasyonu bu süreyi örter. Genel çözüm olarak `complete` ucunda, oyunun registry'deki **meşru tavanı** (`legitMaxScore`) aşan skorlar reddedilmeli. Liderlik ve turnuva yalnızca sunucuda doğrulanmış oturumları saymalı.
- **Efor:** M (bu oyun için) / L (tüm oyunlara yayılırsa)

### B2 · YÜKSEK · Hata/Ekonomi · "Günde 1 hak" iki ayrı yoldan deliniyor
- **Kanıt:** `start/route.ts:56-74`. Yalnızca `status === 'completed'` kilitliyor. Diğer her durumda (aktif *veya* `failed`) aynı `sessionId` "tekrar başlatılabilir" diye geri dönüyor. `complete/route.ts:101` kaybı `failed` olarak yazıyor. Izgara her `playing` geçişinde yeniden üretiliyor (`data-miner-game.tsx:64-72`).
- **Sorun:**
  1. **Yenileyerek tahtayı yeniden karma:** Oyuncu 2 bota çarpıp skoru 10'un altındaysa sayfayı yeniliyor. Oturum hâlâ `active` olduğu için 3 canla yeni bir tahta geliyor. Bu her gün tekrarlanabildiği için ~%29 olan kazanma olasılığı (aşağıya bakın) DevTools gerekmeden pratikte %100'e yaklaşıyor. Sonuç: günlük 150 puan neredeyse garanti.
  2. **Kaybedeni kilitlememe:** Kaybeden ya da eşik altında çıkan oyuncunun oturumu `failed` oluyor. Hub bunu "oynanmadı" sayıyor (`status/route.ts:33`). Oyuncu tekrar "Oyna"ya bastığında oyun açılıyor, bütün tur oynanıyor, sonunda `complete` 409 dönüyor ve "Oyun zaten tamamlandı" hata toast'ı çıkıyor (`use-mini-game.ts:98-100,126-128`). Kullanıcıya boşa geçen bir tur ve hata mesajı kalıyor.
- **Profesyonel öneri:** `start` ucunda `failed` da `completed` gibi kilit sayılmalı (`alreadyPlayed: true`, sonucu da dönsün). Sayfa yenilemeyi çözmek için tahta sunucuda saklanmalı (B1): yenilemede *aynı* tahta, açılmış hücreler ve kalan canla devam edilir. Yarım bırakılan oturum için "Kaldığın yerden devam et" ekranı gösterilmeli. Ek olarak oturum başına deneme sayısı (`attempts`) tutulmalı ve analitikte izlenmeli.
- **Efor:** M

### B3 · YÜKSEK · Hata · Son canını kaybeden oyuncu 700 ms içinde "Kasala"ya basıp kazanmış sayılabiliyor
- **Kanıt:** `data-miner-game.tsx:90-93`. 3. bottan sonra `endGame(false)` 700 ms geciktiriliyor ve `finishedRef` o ana kadar `false` kalıyor. `cashOut` yalnızca `finishedRef`'e bakıyor (`:133-136`). Hücreler devre dışı bırakılmıyor (`:176` yalnızca `c.opened`).
- **Sorun:** Skor ≥ 10 iken 3. bota çarpan oyuncu, patlama animasyonu sürerken "Kasala"ya basarsa `endGame(true)` çalışıyor ve ödül alıyor. Aynı aralıkta kalan güvenli hücreler de açılabiliyor, canlar eksiye düşüyor. Oyunun kendi kuralıyla çelişen bir sonuç.
- **Profesyonel öneri:** Oyunun bittiği an (`livesRef <= 0`), animasyondan bağımsız olarak hemen kesinleşmeli: `finishedRef.current = true` ve bir `locked` state'i hemen ayarlanmalı. Animasyondan sonra yalnızca `game.finish` çağrısı geciktirilmeli. Bu durumdayken ızgara `aria-disabled`/`pointer-events-none` olmalı, Kasala butonu gizlenmeli. Kalıcı çözüm, sunucu otoriteli durum (B1): sunucu can 0 iken gelen cash-out isteğini reddeder.
- **Efor:** S

### B4 · YÜKSEK · Ürün/UX · Risk-ödül mekaniği kâğıt üzerinde var. Oyunda beceri yok, "kasala" ödülü yanlış anlatıyor
- **Kanıt:** Ödül ikili: eşik altında 0, üstünde sabit 150 (`minigame-config-effective.ts:111-115`). `cashOut`, `won = score >= 10` olarak gönderiyor (`data-miner-game.tsx:135`). Hücrelerde ipucu ya da bilgi yok (`:171-200`). Monte Carlo sonucu: en iyi strateji (10'a ulaşınca hemen çık) ile kazanma olasılığı **~%29,3**.
- **Sorun:** "Ne zaman çıkayım?" kararı aslında yok. 10'un altında çıkmak her zaman 0 kazandırıyor, 10'a ulaşınca devam etmenin hiçbir getirisi yok (10, 11 ve 12 aynı ödülü veriyor). "İstediğin an çıkıp skoru kasala" vaadi (`page.tsx:19`, `:210`) bu yüzden yanıltıcı. Hücre seçimi de bilgiye dayanmıyor, sonuç zar atmak gibi. Ortaya çıkan şey kullanıcının beceriyle etkileyemediği, ödüllü bir şans oyunu. Kumar benzeri bir algı riski var: 18 yaş altı kullanıcı ve mağaza politikaları için hassas bir konu. Hukuki değerlendirme yapılmadı.
- **Profesyonel öneri:** Mekanik baştan kurgulanmalı. İki seçenek var:
  - **(a) Beceri katmanı (Minesweeper benzeri):** Açılan her boş hücre komşu bot sayısını göstersin. Böylece seçimler tahmine değil çıkarıma dayanır. Bunun için 5×5 ızgara ve 5 bot daha dengeli olur.
  - **(b) Gerçek risk-ödül:** Ödül skora göre kademeli olsun (ör. 4 → 40 puan, 8 → 90, 12 → 150). Cash-out gerçekten anlamlı bir karar hâline gelir. Bu durumda `computeEffectiveReward` oyun başına "kademe tablosu" alacak şekilde genişletilmeli (`MiniGameDef.rewardTiers?`). Ekonomi tavanı aynı kalabilir.

  Her iki seçenekte de buton metni gerçeği söylemeli. Ör.: "Çık · 8 veri = 90 puan". Eşiğin altındaysa "Henüz ödül yok, çıkarsan 0 puan" uyarısı gösterilmeli.
- **Efor:** M (b) / L (a)

### B5 · ORTA · Mimari/Veri · İstemci, admin override'ını görmüyor. Hedef ve kazanma koşulu sunucuyla çelişebilir
- **Kanıt:** `data-miner-game.tsx:13` (`getMiniGame('data-miner')` statik registry), `:117`, `:125`, `:135`, `:159` (`DEF.rewardThreshold`/`DEF.maxScore`). `useMiniGame` sunucunun `config`'ini döndürüyor (`use-mini-game.ts:70,137`) ama bu oyun onu hiç okumuyor. Sunucu tarafı effective değerleri kullanıyor (`complete/route.ts:35,87`).
- **Sorun:** Admin `/admin/games` üzerinden eşiği 12'ye çıkarırsa istemci "Hedef: 10" gösteriyor ve 10'da "kazandın" diye gönderiyor. Sunucu 0 ödül veriyor ve oyuncu sebebini anlamıyor. Eşik 13'ün üstüne çıkarılırsa oyun kazanılamaz hâle geliyor ve bunu uyaracak bir mekanizma yok. Başlık, emoji ve renk override'ları da bu sayfada görünmüyor (`:139-150`, `page.tsx:18`).
- **Profesyonel öneri:** Effective config tek kaynak olmalı. Sayfa (server component) `getEffectiveMiniGame('data-miner')` ile yapılandırmayı çekip `DataMinerGame`'e prop olarak vermeli. Oyun `config ?? DEF` kullanmalı. Pasif oyun durumunda sayfa düzeyinde "Bu oyun şu an kapalı" boş durumu gösterilmeli. Admin paneline "meşru tavan < eşik" doğrulaması eklenmeli: registry'ye `legitMaxScore: 12` yazılır, PATCH sırasında kontrol edilir.
- **Efor:** S

### B6 · ORTA · Veri bütünlüğü · Turnuva ve liderlikte eşitlikleri ayıracak bir kural yok. Dar skor aralığında ödül sırası rastgeleleşiyor
- **Kanıt:** `tournament/route.ts:29-35` ve `leaderboard/route.ts:47-53`: yalnızca `_max.starsCollected desc` ile sıralanıyor, ikincil bir sıralama anahtarı yok. Meşru skor aralığı bu oyunda 10-12 (kazanılan oturumlar `completed`).
- **Sorun:** Haftada birden fazla kişi 12 yapınca 1., 2. ve 3. sıra Postgres'in döndürdüğü rastgele sıraya kalıyor. GET (`:83`) ile POST (`:145`) sırasındaki iki ayrı sorgu farklı sıralama döndürebilir. Kullanıcı "Geçen hafta 1. oldun" kartını görüp butona basar ve "Geçen hafta ödül kazanmadın" hatası alabilir, ya da 500 yerine 150 puan alır. Doğrulanmadı (eşitlik verisi canlı DB'de kontrol edilmedi), ama kod yolu bunu belirlenimci olmayan hâle getiriyor.
- **Profesyonel öneri:** İkincil sıralama anahtarı eklenmeli: en iyi skora ulaşma zamanı (`MIN(completedAt)` ya da süre). `groupBy` bunu desteklemediği için tek bir raw SQL ya da materyalize "haftalık sonuç" tablosu kullanılmalı. Hafta kapanınca bir cron ile sıralama **dondurulmalı** (`TournamentResult` satırları). Claim, yeniden hesaplanan sıraya değil bu dondurulmuş sonuca bakmalı. Şans oyununda turnuva anlamsız olduğundan, B4 çözülene kadar bu oyunun turnuvası kapatılabilir.
- **Efor:** M

### B7 · ORTA · UX · Sonuç dili gerçekte olanı yansıtmıyor
- **Kanıt:** Gönüllü çıkış ya da tüm can kaybı aynı yoldan geçiyor: `won=false` → `loseTitles: ['Tuzağa Düştün 💣', 'Damar Kurudu', 'Bot Patladı']` ve 💀 (`minigame-copy.ts:100`, `game-shell.tsx:255`). "Kazandın ama eşiği geçemedin" toast'ı bu oyunda hiç çalışmıyor (`use-mini-game.ts:114-115`).
- **Sorun:** Bota hiç dokunmadan 7 skorla çıkan oyuncuya "Bot Patladı 💀" deniyor. Ne olduğu (çıkış mı, tuzak mı), ne kadar kaldığı ("hedefe 3 veri") ve ne kaybettiği anlatılmıyor.
- **Profesyonel öneri:** `finish` çağrısına bir bitiş nedeni eklenmeli (`reason: 'cashout' | 'trapped' | 'cleared'`). GameShell ona göre başlık, ikon ve açıklama seçmeli. "Hedefe 3 kaldı" gibi bir fark göstergesi ve "Yarın tahtada X nadir taş var" gibi geri dönüş kancası eklenmeli. Tahtanın tamamı gösterilmeli (B13).
- **Efor:** S

### B8 · ORTA · Hata · Izgara karıştırma yanlı. Kazanma olasılığı oyuncunun tıklama sırasına göre değişiyor
- **Kanıt:** `data-miner-game.tsx:32`: `kinds.sort(() => Math.random() - 0.5)`. Simülasyon: düzgün Fisher-Yates ile optimal kazanma %29,3. Bu kodun karıştırmasıyla soldan sağa, yukarıdan aşağı açan oyuncu için **%20,7**.
- **Sorun:** Karşılaştırıcıya dayalı rastgele sıralama düzgün bir permütasyon üretmiyor. Bot ve taşların bazı konumlarda daha sık çıkması, öğrenilebilir bir "kör nokta" stratejisi yaratıyor ve oyuncular arasında adaletsizlik oluşturuyor.
- **Profesyonel öneri:** Fisher-Yates kullanılmalı. Tahta sunucuya taşındığında (B1) `crypto.randomInt` ile üretilmeli. Dağılım için birim test eklenmeli (her konumun bot olma sıklığı ≈ 4/16).
- **Efor:** S

### B9 · ORTA · Erişilebilirlik · Izgara ekran okuyucu ve klavye için anlaşılmıyor
- **Kanıt:** `data-miner-game.tsx:172-199`: hücrelerde `aria-label` yok, kapalı hücrenin içeriği "⬡". Canlar yalnızca renkle anlatılıyor (`:154-156`). Skor ve tuzak olayları için aria-live yok. Alt bilgi `text-[10px] text-white/40` (`:212`). Odak halkası stili yok.
- **Sorun:** Görme engelli kullanıcı neyin açıldığını, kaç canı kaldığını ve skoru öğrenemiyor. Klavyeyle 16 hücre arasında yalnızca Tab ile gezilebiliyor. Düşük kontrastlı metin WCAG AA'yı karşılamıyor (yaklaşık 3,9:1, doğrulanmadı).
- **Profesyonel öneri:** Izgara `role="grid"` olmalı, ok tuşlarıyla gezilebilmeli (roving tabindex). Her hücrenin etiketi olmalı: "Satır 2 sütun 3, kapalı küp" / "açıldı: nadir veri, +3". Görünmez bir `aria-live="polite"` bölgesi "Tuzak! 2 can kaldı · Skor 7/10" gibi olayları okumalı. Kalpler için metin karşılığı olmalı ("2/3 can"). Efsane en az 12px ve %70 opaklıkta olmalı. Belirgin bir `focus-visible` halkası eklenmeli.
- **Efor:** S

### B10 · ORTA · Erişilebilirlik/Motion · OS'taki "hareketi azalt" ayarı canvas efektlerini, konfetiyi ve sesi kapatmıyor
- **Kanıt:** `fx-layer.tsx:44-47`, `game-shell.tsx:13-16` ve `lib/game-sounds.ts:10-13` yalnızca uygulama içindeki `html.reduce-animations` sınıfına bakıyor. Framer tarafı `MotionConfig reducedMotion="user"` ile OS tercihine uyuyor (`components/providers.tsx:232`). `globals.css:824`'teki yorum iki ayarın bağımsız olduğunu açıkça söylüyor.
- **Sorun:** OS'ta hareket azaltmayı açmış bir kullanıcı şok dalgası, ekran boyu konfeti (`canvas-confetti`) ve titreşimle karşılaşıyor. Ses yalnızca "animasyonları azalt" ile kapanıyor, oysa ses ile hareket ayrı tercihler.
- **Profesyonel öneri:** Tek bir `useReducedMotion()` yardımcısı yazılmalı: `matchMedia('(prefers-reduced-motion: reduce)') || html.reduce-animations`. FxLayer, celebrate ve haptic bu yardımcıyı kullanmalı. Ses için ayrı bir `sound` tercihi (localStorage + accessibility prefs) ve oyun HUD'unda 🔊/🔇 düğmesi eklenmeli.
- **Efor:** S

### B11 · ORTA · Görsel/Tutarlılık · Turnuva bileşeni koyu oyun kabuğu içinde açık tema token'larıyla çiziliyor ve müşteriye admin önekli toast gösteriyor
- **Kanıt:** `game-tournament.tsx:102,116,151,159-160,174`: `text-muted-foreground`, `bg-primary/10`, `bg-muted/40`, renk verilmemiş satır metni. GameShell'in kökünde metin rengi tanımlı değil, arka plan koyu (`game-shell.tsx:97-104`). `game-tournament.tsx:6`: `toast` `@/lib/admin-toast`'tan geliyor, bu yüzden "Basarili: " / "Dikkat: " önekleri çıkıyor.
- **Sorun:** Açık temada isimler koyu (foreground) renkte, koyu lacivert zemine yazılıyor. Okunabilirlik büyük ihtimalle bozuk (görsel olarak doğrulanmadı). Kardeş bileşen `GameLeaderboard` ise doğru şekilde `text-white/*` kullanıyor, yani aynı kartta iki farklı dil var. Müşteri toast'ında Türkçe karakter içermeyen "Basarili:" yazıyor.
- **Profesyonel öneri:** GameShell'e `data-theme="dark"` ya da `dark` sınıfı verilmeli (kapsayıcı koyu temaya kilitlenir). Böylece tüm shadcn token'ları kabuk içinde koyu değerlerle çözülür. Turnuva toast'ı `sonner`'ın kendi `toast`'ına alınmalı. Turnuva ve liderlik tek bir "Sıralama" kartında birleştirilip sekmelere ayrılmalı (Bu hafta · Tüm zamanlar).
- **Efor:** S

### B12 · DÜŞÜK · Mimari · State updater içinde yan etki, ölü dallar, statik `_seq`
- **Kanıt:** `data-miner-game.tsx:122-128` (`setCells` updater'ı içinde `setTimeout(endGame)`, değişmeden `prev` dönüyor), `:117-120` (`maxScore` dalı ulaşılamaz), `use-mini-game.ts:114-115` (bu oyunda ulaşılamaz), `minigame-config.ts:144` (`labelKey` hiçbir yerde kullanılmıyor).
- **Sorun:** React updater'ları saf olmalı. StrictMode ve concurrent render'da iki kez çağrılabiliyorlar. Şu an `finishedRef` koruduğu için zarar yok, ama kırılgan bir yapı. Ölü dallar okuyanı yanıltıyor.
- **Profesyonel öneri:** Oyun durumu tek bir `useReducer` ya da saf bir `mineReducer(state, action)` fonksiyonunda toplanmalı. Bitiş tespiti, reducer'ın döndürdüğü `status`'u izleyen bir effect ile yapılmalı. Saf reducer, sunucu otoriteli sürümde sunucu ve istemci arasında paylaşılabilir ve birim testi yazılabilir.
- **Efor:** S

### B13 · DÜŞÜK · UX · Tur bitince tahta gösterilmiyor, kapanış anı ve sonraki adım eksik
- **Kanıt:** `game-shell.tsx:134-143`: `children` yalnızca `playing` sırasında render ediliyor. Bitişte ızgara anında kayboluyor. Sonuç ekranında hub'a dönüş ya da başka bir oyun önerisi yok (`:222-305`).
- **Sorun:** Bu türdeki en tatmin edici an olan "işte botlar buradaymış" anı kayboluyor. Kullanıcı sonuçtan sonra çıkmaz sokakta kalıyor.
- **Profesyonel öneri:** Bitişte 600-900 ms'lik bir "tahtayı aç" sekansı oynatılmalı: kalan hücreler sırayla, hafif bir stagger ile çevrilir, kaçırılan nadir taşlar parlar. Sonra sonuç kartı gelmeli. Sonuç kartına iki CTA eklenmeli: "Oyun Merkezi" ve "Bugün oynamadığın: Hafıza Eşle →" (`/api/customer/games/status` verisiyle).
- **Efor:** S

### B14 · DÜŞÜK · Performans · `complete` her çağrıda kullanıcının tüm oyun geçmişini iki kez okuyor. FX döngüsü boşta da çalışıyor
- **Kanıt:** `complete/route.ts:90-94` ve `:199`, `lib/game-achievement-stats.ts:17-20` (sınırsız `findMany`). `fx-layer.tsx:79-120` (parçacık olmasa da her karede `clearRect` ve rAF).
- **Sorun:** Oturum sayısı her gün 20 oyuna kadar arttığından iki sorgu da zamanla doğrusal büyüyor. Boşta dönen rAF mobilde pil tüketiyor.
- **Profesyonel öneri:** "Önce" istatistiği tek sorguyla alınmalı, "sonra" bellekte bu oturum eklenerek hesaplanmalı (ikinci sorgu kalkar). Ya da istatistikler `UserGameStats` gibi bir özet satırda artımlı tutulmalı. FxLayer'da parçacık yokken döngü durdurulmalı, `burst` çağrısı onu yeniden başlatmalı.
- **Efor:** S

### B15 · DÜŞÜK · İçerik · Tekrarlanan metinler ve teknik jargon
- **Kanıt:** Aynı açıklama `page.tsx:19`, `minigame-config.ts:146-147` ve `minigame-copy.ts:97`'de geçiyor. "Her gün 00:00 (UTC) sıfırlanır" (`game-shell.tsx:323`). Başlık marka adını iki kez içeriyor (`page.tsx:7`).
- **Profesyonel öneri:** Sayfa başlığındaki açıklama kısa bir değer önermesine indirilmeli ("Günlük 150 puan şansı"). Sıfırlama zamanı yerel saatle ve geri sayımla gösterilmeli ("Yeni hak 4 sa 12 dk sonra"). `metadata.title` yalnızca "Veri Madencisi" olmalı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Sunucu otoriteli, adil oyun ve şeffaf oranlar.** Duolingo ve Starbucks oyunlaştırmasında ödülü belirleyen her şey sunucuda tutuluyor ve kurallar açıkça yazılıyor ("16 küpte 4 bot"). Burada ödül istemcide belirleniyor ve oranlar gizli.
2. **Devam et / kaldığın yer.** Revolut ve Monzo'daki "mini oyun / kazı kazan" akışlarında yarım kalan bir tur aynı durumdan devam ediyor. Burada yenileme tahtayı yeniden kuruyor.
3. **Tahtayı açma ve paylaşılabilir sonuç kartı.** Spotify Wrapped benzeri, görsel olarak paylaşılabilir bir "bugünkü madenim" kartı (açılan tahtanın ızgara şeması, Wordle'daki 🟩 kare paylaşımı gibi). Sosyal yayılım için ucuz ve güçlü bir kanca.
4. **Kişisel ilerleme.** Kişisel rekor, toplam çıkarılan veri, nadir taş koleksiyonu, kazanma oranı ve son 7 günlük mini grafik. Duolingo'da her oturumdan sonra ilerleme görünür. Burada oyun sonrası yalnızca tek bir skor kalıyor.
5. **Ses ve hareket kontrolü HUD'da.** Neredeyse tüm mobil oyunlarda 🔊 düğmesi ve OS hareket tercihine saygı standart.
6. **Akıllı geri dönüş kancası.** Sıfırlamaya geri sayım, yerel saatle gösterilen yarınki hak ve push hatırlatma seçeneği ("Yarın 09:00'da hatırlat"). Serinin kırılmak üzere olduğunu bildiren uyarı (Duolingo streak freeze benzeri).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60-90 saniyelik, "bir sonraki küpü açayım mı?" gerilimini gerçekten hissettiren, kararları anlamlı bir mini oyun. Kaybetse bile oyuncu "botlar oradaymış" diyerek tahtayı görür, ne kadar yaklaştığını öğrenir ve yarın geri gelmek için bir sebebi olur.

**Yerleşim (mobil öncelikli):**
1. **Üst şerit (sticky, safe-area uyumlu):** ← Oyun Merkezi · başlık · 🔊 · "Yeni hak 4 sa 12 dk".
2. **HUD:** üç kalp ve "2/3 can" metni · skor göstergesi (hedefe ilerleme çubuğu; eşik ve kademe işaretleri üstünde) · "Kalan: 3 bot, 1 nadir" sayacı (bilgi katmanı).
3. **Arena:** 5×5 ızgara. Açılan boş hücrelerde komşu bot sayısı yazar. Uzun basınca (ya da sağ tıklayınca) "şüpheli" bayrağı konur.
4. **Alt aksiyon:** "Çık · 8 veri = 90 puan" (kademeli ödülle gerçek karar). Eşiğin altındaysa ikincil stilde gösterilir ve tek dokunuşluk bir onay ister.
5. **Sonuç:** Önce tahta açılır, sonra bitiş nedenine göre bir başlık gelir (çıkış / tuzak / temizlendi). Ardından ödül, seri ve başarım tek bir kartta toplanır. Toast'lar yalnızca sayfa dışı olaylar için kalır. Paylaşılabilir ızgara kartı · "Sıradaki oyun" CTA'sı.
6. **Lobi:** Sayfa açılırken bugünkü durum sunucudan gelir (oynandı mı, yarım mı). "Oyna" yerine doğrudan "Devam et" ya da "Yarın 03:00'te" gösterilir. Sıralama tek bir kartta, sekmelerle sunulur (Bu hafta / Tüm zamanlar · kişisel rekor).

**Motion / 3B (ölçülü):**
- Kart çevirme (rotateY) korunmalı. Nadir taş için mevcut şok dalgası ve konfeti yeterli, ek 3B gerekmiyor. Bu oyunda three.js kullanmak maliyetine değmez, DOM ve CSS 3B yeterli.
- Tuzakta kısa bir ekran sarsıntısı (4px, 120 ms) ve kırmızı vinyet, kayıp anını güçlendirir. Hepsi `useReducedMotion` ile kapatılabilmeli.
- Tahta açılışı stagger 25 ms/hücre, toplam 700 ms'yi geçmemeli.
- `prefers-reduced-motion` açıkken çevirme yerine opaklık geçişi, konfeti yerine statik bir "+3" rozeti kullanılmalı.

**Veri / API değişiklikleri:**
- `MiniGameSession`'a `stateJson Json?` (tahta, açılanlar, can, skor) ve `endReason String?` eklenmeli. Alternatif olarak tahta TTL'li bir Redis anahtarında `session:{id}:board` olarak tutulur, DB'ye yalnızca sonuç yazılır.
- `POST /api/customer/games/data-miner/reveal {sessionId, index}` → `{kind, adjacent, lives, score, ended}`. `POST .../cashout {sessionId}` sunucudaki durumla kapanmalı. Generic `complete` bu oyun için devre dışı bırakılmalı ya da istemcinin skorunu yok saymalı.
- `start`: `failed` durumu da kilit sayılmalı. Yarım oturum için `{resume: true, state}` dönmeli.
- Registry'ye `legitMaxScore` ve `rewardTiers` eklenmeli. `computeEffectiveReward` kademeli ödül hesaplamalı. Admin PATCH'te `rewardThreshold <= legitMaxScore` doğrulanmalı.
- Sayfa server component'te `getEffectiveMiniGame` ve bugünkü oturum durumunu çekip prop olarak geçirmeli (ilk boyamada doğru lobi, ekstra round-trip yok).
- Turnuva: ikincil sıralama anahtarı (en iyi skora ilk ulaşma zamanı) ve hafta kapanışında dondurulmuş `TournamentResult`.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/lucky-wheel`:** O da büyük ölçüde zamanlama ve şansa dayalı, ödüllü bir oyun. Veri Madencisi şu hâliyle "şans kategorisinde" ikinci bir oyun ve beceri içermiyor. Önerilen beceri katmanı (B4-a) eklenirse ayrışır. Eklenmezse ikisinden biri kaldırılmalı ya da şans oyunları puan ekonomisinden çıkarılıp yalnızca kozmetik ödüle bağlanmalı.
- **`/customer/games/memory-match`:** Aynı "ızgarada kart çevir" etkileşimi kullanılıyor. Görsel dil ve kart bileşeni ortak bir `FlipGrid` bileşeninde birleştirilebilir (kod tekrarını azaltır), ama oyunlar ayrı kalmalı.
- **`/customer/surprise-boxes`:** "Kutu/küp aç, değerli olanı bul" metaforu sürpriz kutularla örtüşüyor. Marka dilinde karışıklığı önlemek için Veri Madencisi'nin görsel dili kutudan çok "kristal/maden" yönüne çekilmeli.
- **Platform düzeyi:** B1, B2, B5 ve B11 bu sayfaya özgü değil. `[game]/start`, `[game]/complete`, `GameShell` ve `GameTournament` üzerinden 19 oyunun hepsini etkiliyor. Düzeltmeler tek tek oyunlarda değil bu ortak katmanda yapılmalı. Önce sunucu otoriteli bir oyun durumu altyapısı (`lib/minigame-state.ts`) kurulmalı, ilk uygulama da en basit tahta olan Veri Madencisi'nde yapılmalı.
- **Karar:** Sayfa korunmalı ama **yeniden tasarlanmalı**. Kaldırma önerilmiyor: tür, mobilde kısa ve tekrar oynanabilir, oyunlaştırma katalogunda yeri var. Ancak beceri katmanı ve sunucu otoritesi eklenene kadar puan ödülü düşürülmeli (ör. 150 → 50) ve haftalık turnuvası kapatılmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu: `app/customer/games/data-miner/page.tsx`, `components/customer/games/data-miner-game.tsx`, `components/customer/games/game-shell.tsx`, `lib/use-mini-game.ts`, `app/api/customer/games/[game]/{start,complete,leaderboard}/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/tournament-core.ts`, `lib/points-caps.ts`. Hiçbir kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Complete ucu istemci skorunu ve `won` bayrağını doğrulamadan puan basıyor — **DOĞRULANDI**

- `complete/route.ts:59` gövdeden `score`, `durationSec`, `won` olduğu gibi alınıyor. `:61` yalnızca `game.maxScore`'a kıstırıyor. `:86` `eligible = won && !tooFast`, `:87` ödül `computeEffectiveReward` ile hesaplanıyor (`minigame-config-effective.ts:107-116`, skor ≥ eşik ise sabit ödül). Sunucuda tahta, açılan hücre ya da can bilgisi yok; `won` tamamen istemci beyanı.
- `minigame-config.ts:150-154`: `maxScore: 20`, `rewardThreshold: 10`, `rewardPoints: 150`, `rewardXp: 75`, `minDurationSec: 8`. Tahtada 6 gem (×1) + 2 nadir (×3) var (`data-miner-game.tsx:28-30, 36`), meşru tavan 12. 20 meşru oyunla erişilemez.
- Süre kontrolü (`:81-83`) yalnız `startedAt`'ten 8 sn geçmesini istiyor, bu da beklemeyle aşılır.
- Tavan uygulayan bir katman yok: `lib/points-caps.ts` yalnız feedback için kullanılıyor (`capFeedbackPoints`). `points_credited` olayı (`:163-170`) yalnız görünürlük sağlıyor, engellemiyor.
- Liderlik (`leaderboard/route.ts:47-53`) ve turnuva (`tournament/route.ts:28-38`) `status:'completed'` olan `starsCollected` maksimumunu kullanıyor. Sahte 20, meşru 12'nin üstünde kalıyor. Turnuva 1.'liği 500 puan (`tournament-core.ts:13`), talep ucu (`tournament/route.ts:142-181`) sırayı sunucuda yeniden hesaplıyor ama skorun kendisi sahte olduğu için bu korumuyor. Birden çok hileci 20'de berabere kalırsa sıra belirsizleşir ama meşru oyuncu yine kazanamaz.
- **Yeniden üretim:** CUSTOMER oturumuyla `POST /api/customer/games/data-miner/start` → `sessionId`. 9 sn bekle → `POST /api/customer/games/data-miner/complete` gövde `{"sessionId":"…","score":20,"won":true,"durationSec":9}` → 200, `rewardPoints:150`, `rewardXp:75` (+ günün ilk ödüllü oyunuysa seri XP). Haftanın tüm zamanlar/turnuva tablosunda 20 ile ilk sıraya çıkılır. Aynı uç generic `[game]` üzerinden tüm registry oyunlarını etkiliyor.

### 2. Günde 1 hak, yenilemeyle tahta yeniden karılarak aşılıyor — **DOĞRULANDI**

- `start/route.ts:56-74`: bugünün kaydı `completed` değilse aynı `sessionId` ile `canPlay:true` döner. `startedAt` güncellenmediği için süre kontrolü sonradan kolayca geçilir.
- Sayfa yenilenince `useMiniGame` `phase='idle'` ile başlar (`use-mini-game.ts:46`), "Başla" ile `playing` olunca `data-miner-game.tsx:64-72` 3 can ve `buildGrid()` ile yepyeni, rastgele bir tahta kurar. Tahtanın, canın ve skorun sunucuda izi yok.
- Kural: tur `complete` gönderilmeden (3. bota basmadan ya da bastıktan sonraki 700 ms içinde) yenilenirse oturum `active` kalır. Oyuncu 2 can kaybedip skor 10'un altındaysa yeniler, yeni tahtayla baştan dener.
- Olasılık: rastgele açma stratejisiyle (10'a ulaşınca kasala) kazanma oranını 400.000 turluk Monte Carlo simülasyonuyla ölçtüm: **≈ %29,0**. İddiadaki rakam doğru. Yenileme sınırsız olduğu için bu pratikte %100'e çıkıyor, DevTools gerekmiyor.
- **Yeniden üretim:** Oyunu başlat, iki bota bas, skor < 10 iken F5 → "Başla" → 3 can ve yeni tahta. Skor ≥ 10 olana kadar tekrarla, sonra "Kasala" → 150 puan.

### 3. Kaybeden oyuncunun (`failed`) oturumu kilitlenmiyor, tekrar oynatılıp sonunda 409 veriliyor — **DOĞRULANDI**

- `complete/route.ts:101` kayıp/eşik altı için `status:'failed'` yazıyor. `start/route.ts:57` yalnız `completed`'ı kilit sayıyor, `failed` için `:70-73` aynı `sessionId` ile `canPlay:true` döndürüyor. Hub (`status/route.ts:33`) yalnız `completed`'ı "bugün oynandı" sayıyor, yani oyun kartı oynanmamış görünüyor.
- Yeni turun sonunda `complete` `updateMany where status:'active'` (`:98-99`) 0 satır günceller, `:177-181` 409 "Oyun zaten tamamlandı" döner. `use-mini-game.ts:98-99` bunu hata olarak fırlatır, `:126-128` hata toast'ı gösterir, sonuç ekranı ödülsüz kapanır.
- Bu hatanın puan basma etkisi yok (ekonomi güvenli), ama kullanıcıyı açıkça yanıltıyor. Sonuç ekranı "Yarın yeni hakla tekrar dene" (`game-shell.tsx:292`) derken yenileyen ya da hub'dan dönen kullanıcı oyunu baştan oynatılıyor ve sonunda hata alıyor. Ek olarak, `failed` oturum yeniden oynanınca tur sırasında oyuncunun ödül alamayacağını bilme yolu yok. Bu, iddia 2'deki "yenileyerek dene" desenini de yalnız `failed` öncesine sınırlayan şey (bilinçli bir kilit değil, yan etki).
- **Yeniden üretim:** Oyunu oyna, 3 bota bas (kayıp) → sonuç ekranı. Sayfayı yenile veya hub'a dön (kart "oynanmadı") → "Başla" → tam bir tur oyna → kasala → kırmızı "Oyun zaten tamamlandı" toast'ı.

### 4. Son can kaybından sonraki 700 ms içinde cash-out ile kazanmış sayılma — **DOĞRULANDI (etkisi düşük)**

- `data-miner-game.tsx:90-93`: can 0'a inince `endGame(false)` `setTimeout(…, 700)` ile ertelenir, `finishedRef` bu süre boyunca `false` kalır. `cashOut` (`:133-136`) yalnız `finishedRef`'e bakıyor ve `endGame(score >= 10)` çağırıyor. Kasala butonu (`:205-211`) can durumuna göre devre dışı değil. Ertelenen `endGame(false)` sonra `:55`'teki guard yüzünden etkisiz kalıyor.
- Ayrıca `open` (`:76`) da canı kontrol etmiyor. 700 ms içinde başka hücreler de açılabiliyor, yani skor 9 iken son bota basan oyuncu hızla bir gem açıp kasalayabiliyor.
- Etki: skor zaten ≥ 10 olan oyuncu bota basmadan önce de kasalayabilirdi, o yüzden asıl ek kazanç dar "9 + son can" penceresi. Ekonomiye etkisi iddia 1 ve 2'nin yanında önemsiz. Kritik/yüksek değil, **düşük** önem derecesinde bir kural tutarsızlığı. Kalıcı çözüm de aynı: oyun durumunun sunucuda tutulması (rapordaki `reveal`/`cashout` uçları). İstemci tarafında can 0'a inince `finishedRef`'i hemen `true` yapmak ve sonucu (`won:false`) anında kilitlemek, sadece animasyonu geciktirmek gerekiyor.
- **Yeniden üretim:** Skor ≥ 10 (ya da 9 ve kapalı bir gem varken) iken 3. bota bas, 700 ms içinde "Kasala"ya bas (veya önce bir gem aç) → `won:true` gider, 150 puan kazanılır.

**Özet:** 4 iddianın 4'ü de doğrulandı. 1 ve 2 gerçekten kritik/yüksek (sahte skorla günlük ödül, turnuva 500 puanı ve şansın sıfırlanması). 3 bir UX/durum makinesi hatası (puan basmıyor). 4 gerçek ama düşük önemde. Hepsinin kök nedeni ortak: oyun durumu yalnız istemcide, sunucu sonucu doğrulamıyor.

---

## Uygulama (Dalga 2)

**Karar uygulandı: oyun EMEKLİ** (yol haritası §7.3 #21 KALDIR; `lib/games/registry` `RETIRED_GAMES`). `app/customer/games/data-miner/page.tsx` artık tek satırlık sunucu bileşeni: `permanentRedirect` ile Oyna merkezine (`/customer/games?emekli=data-miner`, mevcut sorgu parametreleri korunur — `lib/play-hub/retired.ts`). Hub bu parametreyle tek seferlik, dürüst bir "Veri Madencisi artık oynanmıyor; geçmiş skorların ve puanların korunuyor" notu gösterir. Oyun kartı hub kataloğunda hiçbir koşulda yer almaz (`buildHubCatalog` emekli kimlikleri dışlar; test: `__tests__/lib/play-hub.test.ts`). Bileşen kodu ve geçmiş `MiniGameSession` verisi silinmedi (registry kuralı: geri alınabilir, arşiv).


### Özellik envanteri — yeni durum

| # | Özellik | Eski | Yeni durum |
|---|---|---|---|
| 1 | Sunucu tarafı rol kapısı (yalnız CUSTOMER) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 2 | Sayfa `<title>` | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 3 | Masaüstü sayfa başlığı (`DashboardPageHeading`) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 4 | Lobi: emoji, başlık, açıklama, ipucu şeridi | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 5 | "⛏️ Kazmaya Başla" → `POST /api/customer/games/data-miner/start` | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 6 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 7 | Haftalık turnuva kartı (geri sayım, ödül havuzu, ilk 10, kendi sıram) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 8 | Geçen haftanın turnuva ödülünü talep etme | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 9 | Tüm zamanlar liderlik tablosu | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 10 | "Bugün oynadın" kilit ekranı | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 11 | HUD: can kalpleri | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 12 | HUD: anlık skor | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 13 | HUD: "Hedef: 10" | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 14 | 4×4 ızgara üretimi (4 bot, 2 nadir, 6 gem, 4 boş) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 15 | Hücre açma ve kart çevirme animasyonu | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 16 | 💠 Gem: +1, patlama, halka, "+1" yazısı, ses, titreşim | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 17 | 💎 Nadir: +3, fanfar, şok dalgası, konfeti | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 18 | 🤖 Bot tuzağı: -1 can, kırmızı patlama, "Tuzak! -1" | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 19 | Boş hücre | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 20 | Can bitince kaybetme | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 21 | Tüm güvenli hücreler açılınca turun bitmesi | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 22 | `maxScore` (20) ile otomatik kazanma | SAHTE (ölü kod) | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 23 | "💰 Çık & Skoru Kasala" | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 24 | Alt bilgi efsanesi (💠 +1 · 💎 +3 · 🤖 -1 can) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 25 | Sonucu gönderme → `POST .../complete` | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 26 | Sonuç ekranı: kazanma/kaybetme başlığı, 🏆/💀 | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 27 | Ödül rozeti ve konfeti | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 28 | Ödül, seri ve başarım toast'ları | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 29 | Günlük oyun serisi bonusu (+10 XP, her 3. gün +30) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 30 | Yeni başarım tespiti ve bildirimi | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 31 | Ödül bildirimi (Notification) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 32 | "Günde 1 hak" kuralı | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 33 | Anti-cheat (skor ve sonuç doğrulama) | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 34 | Admin'in oyunu pasifleştirmesi | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 35 | Admin override'ı (başlık, eşik, emoji, renk) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 36 | Ses ve titreşim | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 37 | Azaltılmış hareket | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 38 | Klavye ve ekran okuyucu | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 39 | Mobil yerleşim | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 40 | Hata sınırı | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 41 | Oyun bitince tahtanın tamamını gösterme | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 42 | Oyun Merkezi'ne dönüş / "sıradaki oyun" önerisi | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 43 | Nasıl oynanır ve oran şeffaflığı (16 küpte 4 bot) | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 44 | Kişisel rekor ve oyun geçmişi | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 45 | Sonucu paylaşma | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 46 | Ses kapatma düğmesi | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |

Toplam 46 satır KALDIRILDI. Gerekçe: §7.3 portföy kararı (tavan 12; saf şans; skor tavanına ulaşılamıyor). Bu nedenle oyun içi bulgular (mekanik, animasyon, erişilebilirlik) düzeltilmedi; yüzey artık oynanmıyor.

### Bulgular

- Oyuna özgü bulguların tümü: **KAPANDI (yüzey kaldırıldı)** — oyun sayfası artık oyunu çizmiyor.
- Ortak bulgular başka yerde kapandı: "kaybedilen oyun tekrar başlatılıp 409" ve "yenileyerek sınırsız deneme" (oyun motoru, `lib/game-session` — `failed`/yarım = oynandı); hub'ın kaybedilen oyunu "oynanmamış" göstermesi (Oyna merkezi üç durumlu kart); turnuva eşitlik kırıcı (`lib/game-tournament`).

### Kalanlar

- Sunucuda zaten `hidden: true` (start 403 "emekliye ayrıldı"); turnuva rotasyonunda değil. Açık yok.
