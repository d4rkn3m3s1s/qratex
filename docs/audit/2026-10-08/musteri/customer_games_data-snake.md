# /customer/games/data-snake

**Amaç:** Müşterinin günde bir kez oynayabildiği klasik "Snake" mekaniğine sahip mini oyun ("Veri Yılanı"). Oyuncu yılanı yönlendirip veri paketlerini yer; sunucu tarafında doğrulanan skorla puan + XP, günlük seri bonusu, başarım, tüm zamanlar liderliği ve haftalık turnuva ödülü kazanır.

**Genel puan:** 5.3 / 10 · **Karar:** koru-iyileştir (oyun çekirdeği sağlam; ödül kuralı, "günde 1 hak" tutarlılığı ve sıralama mantığı bozuk, sayfa sarmalayıcısı ise diğer 19 oyunla birleştirilmeli)

İncelenen dosyalar: `app/customer/games/data-snake/page.tsx`, `app/customer/layout.tsx`, `components/customer/games/data-snake-game.tsx`, `components/customer/games/game-shell.tsx`, `components/customer/games/game-leaderboard.tsx`, `components/customer/games/game-tournament.tsx`, `components/dashboard/page-heading.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/game-achievement-stats.ts`, `lib/tournament-core.ts`, `lib/admin-toast.ts`, `lib/accessibility-prefs.ts`, `app/globals.css`, `app/api/customer/games/[game]/{start,complete,leaderboard}/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma` (MiniGameSession, GameStreakClaim).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oynanış döngüsü sorunsuz, ancak ödül eşiği (12) fiilen ölü, kayıptan sonra "günde 1 hak" 409 hatasıyla kırılıyor ve liderlik/turnuva yalnızca 30'a ulaşanları eşit skorla sıralıyor. |
| UX | 5/10 | Ekranda "Hedef: 12" ve "12+ paket = ödül" yazıyor ama 20 paket yiyip ölen oyuncu "Ödül için 12 skor gerekiyordu" mesajıyla eli boş kalıyor; duraklatma, geri sayım, kişisel rekor ve sonuç sonrası yönlendirme yok. |
| Görsel | 6/10 | Neon yeşil tema tutarlı ve atmosferik; ancak canvas HiDPI ölçeklenmediği için retina ekranlarda bulanık, masaüstünde 323 px'lik küçük bir kare olarak kalıyor ve turnuva kartı açık temada koyu-üstüne-koyu metin üretiyor. |
| Mimari | 6/10 | Ortak `useMiniGame` + `GameShell` + registry deseni iyi; fakat sunucunun döndürdüğü `config` (admin override) istemcide yok sayılıyor, oyun ödül kuralı diğer oyunlardan sapıyor ve her oyun için ayrı, birebir aynı `page.tsx` var. |
| Performans | 7/10 | Tek canvas + RAF, yeniden render minimal; tamamlama ucu her çağrıda kullanıcının tüm oturum geçmişini iki kez tarıyor (`computeAchievementStats`). |
| Erişilebilirlik + mobil | 4/10 | Swipe + D-pad var, ancak D-pad düğmelerinde aria-label yok, canvas ve skor ekran okuyucuya kapalı, "Animasyonları azalt" tercihi framer-motion sonsuz animasyonlarını durdurmuyor, sesi kapatmanın tek yolu hareket tercihi. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum + CUSTOMER rol kontrolü | ÇALIŞIYOR | `app/customer/games/data-snake/page.tsx:10-13` | Giriş yapmış ama CUSTOMER olmayan kullanıcı da `/auth/signin`'e atılıyor (yanlış hedef, küçük). |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7` + `app/customer/layout.tsx:19-21` | Şablon `%s \| Müşteri alanı` olduğundan sekme başlığı "Veri Yılanı \| QRateX \| Müşteri alanı" olur (çift ek). |
| 3 | Masaüstü sayfa başlığı (`DashboardPageHeading`) | ÇALIŞIYOR | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Mobilde gizli (`hidden sm:flex`). Başlık ve açıklama `GameShell` idle ekranında farklı metinle ikinci kez tekrar ediliyor (`game-shell.tsx:181-184`). |
| 4 | Neon kabuk (ızgara, köşe aksanları, glow) | ÇALIŞIYOR | `game-shell.tsx:97-129` | |
| 5 | Başlangıç ekranı: zıplayan emoji, başlık, açıklama | ÇALIŞIYOR | `game-shell.tsx:165-184` | Emoji animasyonu `repeat: Infinity`. |
| 6 | Başlangıç ipucu şeridi (`startHint`) | ÇALIŞIYOR | `lib/minigame-copy.ts:170-177`, `game-shell.tsx:185-188` | |
| 7 | "🐍 Yılanı Sür" butonu → `POST /api/customer/games/data-snake/start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79`, `start/route.ts:20-94` | |
| 8 | Yükleniyor durumları (başlatma / sonuç gönderme) | ÇALIŞIYOR | `game-shell.tsx:147-162` | Gönderim sırasında oyun alanı anında kayboluyor (bkz. #53). |
| 9 | Haftalık turnuva kartı (sıralama, ödül havuzu 500/300/150) | KISMİ | `game-tournament.tsx:53-181`, `tournament/route.ts:28-39`, `lib/tournament-core.ts:13` | Bu oyunda yalnız 30 skorla kazananlar listeye girer, hepsi eşit → sıralama belirsiz (bulgu B3). Açık temada metin kontrastı bozuk (B7). |
| 10 | Turnuva geri sayımı | KISMİ | `game-tournament.tsx:77-82, 118` | Dakikada bir yerel azaltma; 0'a düşünce "Kapanıyor" yazıp veriyi yenilemiyor. |
| 11 | Geçen haftanın ödülünü "Ödülü al" | KISMİ | `game-tournament.tsx:84-97, 123-140`, `tournament/route.ts:128-199` | Atomik tek-claim doğru; ama eşit skorlarda GET ve POST farklı sıra hesaplayabilir. Toast `lib/admin-toast` üzerinden "Basarili: " / "Dikkat: " önekiyle (Türkçe karaktersiz, admin dili) müşteriye gösteriliyor (`lib/admin-toast.ts:16-19`). |
| 12 | Tüm zamanlar liderlik tablosu | BOZUK | `leaderboard/route.ts:47-57`, `game-leaderboard.tsx:24-113` | Yalnız `status: 'completed'` sayılıyor; data-snake'te kayıp = `failed` → tabloya sadece 30 yapanlar girer, hepsi 30 → anlamsız, sırası belirsiz. `take: 100` nedeniyle "N oyuncu" 100'de tıkanır. |
| 13 | Liderlik boş / hata durumu | KISMİ | `game-leaderboard.tsx:40, 55-61` | Ağ/500 hatası sessizce yutulur ve "Henüz skor yok — ilk rekoru sen kır!" gösterilir (yanıltıcı). |
| 14 | HUD: anlık skor | ÇALIŞIYOR | `data-snake-game.tsx:323-326` | `aria-live` yok. |
| 15 | HUD: "Hedef: 12" | SAHTE | `data-snake-game.tsx:327` | Eşik oyunda hiçbir şeyi belirlemiyor; ödül için 30'a ulaşmak gerekiyor (B1). |
| 16 | HUD: hız çarpanı | ÇALIŞIYOR | `data-snake-game.tsx:156, 188, 328-330` | 1.0x → 2.0x. |
| 17 | Canvas oyun döngüsü (RAF + sabit adım) | ÇALIŞIYOR | `data-snake-game.tsx:288-305` | StrictMode çift döngü guard'ı var (`:298-300`). |
| 18 | Kademeli hızlanma (her yemde -4 ms, min 70 ms) | ÇALIŞIYOR | `data-snake-game.tsx:17-18, 156` | |
| 19 | Yem yerleştirme (dolu hücreden kaçınır) | ÇALIŞIYOR | `data-snake-game.tsx:66-73` | |
| 20 | Duvar ve kuyruk çarpışması | ÇALIŞIYOR | `data-snake-game.tsx:170-181` | Kuyruk ucu hücresine girişe doğru izin veriliyor. |
| 21 | Yön kuyruğu (3'lük tampon, 180° dönüş engeli) | ÇALIŞIYOR | `data-snake-game.tsx:75-80, 160-163` | |
| 22 | Klavye: oklar + WASD | KISMİ | `data-snake-game.tsx:83-98` | `window` seviyesinde dinler; oyun sırasında üst bardaki arama kutusuna (`DashboardHeader showSearch`) "w/a/s/d" yazılamaz, yazılırsa yılan döner. |
| 23 | Dokunmatik swipe (canvas üzerinde) | ÇALIŞIYOR | `data-snake-game.tsx:101-128` | 18 px eşik, `touchmove` kaydırmayı engelliyor. |
| 24 | Mobil D-pad | KISMİ | `data-snake-game.tsx:346-353, 360-371` | Glif etiketli ("▲") ama `aria-label` yok; `onClick` (pointerdown değil); `sm:hidden` → 640 px üstü dokunmatik tabletlerde D-pad yok. |
| 25 | Kontrol ipucu "12+ paket = ödül" | SAHTE | `data-snake-game.tsx:354` | Gerçek kural: ölmeden 30 paket (B1). |
| 26 | Yem nabız/parlama efekti | KISMİ | `data-snake-game.tsx:239-246` | Nabız `lastStepRef` (yalnız adımda güncellenir) ile hesaplandığı için akıcı değil, kademeli atlıyor. |
| 27 | Yeme "pop" halka efekti | ÇALIŞIYOR | `data-snake-game.tsx:189, 274-285` | |
| 28 | Her 5 pakette kilometre taşı (fanfar + titreşim + ekran sarsıntısı) | ÇALIŞIYOR | `data-snake-game.tsx:190-205` | |
| 29 | Ses efektleri (Web Audio) | KISMİ | `data-snake-game.tsx:59-60, 171, 177, 191-194`, `lib/game-sounds.ts:83-87` | Ölümde `sfxHit` iki kez çalıyor (adım içinde + `endGame` içinde); sessize alma düğmesi yok. |
| 30 | Haptik geri bildirim | ÇALIŞIYOR | `lib/game-sounds.ts:158-165` | |
| 31 | Azaltılmış hareket desteği | KISMİ | `data-snake-game.tsx:30-32, 195`, `game-shell.tsx:13-16`, `app/globals.css:824-831`, `components/providers.tsx:232` | Uygulama tercihi (`reduce-animations`) yalnız CSS animasyonlarını ve sarsıntı/konfetiyi kapatıyor; framer-motion sonsuz animasyonları (emoji, nabız halkası, dönen konik ışık, trofe sallanması) yalnız OS tercihine bakıyor. Tersine OS tercihi sarsıntı/konfetiyi kapatmıyor. |
| 32 | 30 pakette kazanma | ÇALIŞIYOR | `data-snake-game.tsx:206-210`, `lib/minigame-config.ts:276` | |
| 33 | Ölüm = kayıp (ödül yok) | BOZUK | `data-snake-game.tsx:169-181`; değişiklik `dd9eb6c` | Diğer oyunlar oyun-sonu anında `score >= rewardThreshold` ile kazanç verir (örn. `review-stack-game.tsx:97`); burada eşik devre dışı kalmış (B1). |
| 34 | Sonuç ekranı (🏆/💀, varyantlı başlık, skor) | KISMİ | `game-shell.tsx:222-272`, `lib/minigame-copy.ts:174` | Kayıp başlığı rastgele seçiliyor: duvara çarpan "Kuyruğa Çarptın 🐍" görebiliyor (ölüm nedeni hiç iletilmiyor). |
| 35 | Ödül rozeti / ödülsüz not | BOZUK | `game-shell.tsx:274-294` | 20 paket yiyip ölen oyuncuya "Ödül için 12 skor gerekiyordu" deniyor — skor zaten 12'nin üstünde (B1). |
| 36 | Ödül konfetisi | ÇALIŞIYOR | `game-shell.tsx:19-31, 86-94` | |
| 37 | Ödül / seri / başarım toast'ları | ÇALIŞIYOR | `lib/use-mini-game.ts:112-125` | |
| 38 | "Bugün oynandı" kilit ekranı | KISMİ | `game-shell.tsx:308-331`, `lib/use-mini-game.ts:64-68` | Yalnız "Oyna"ya basınca öğreniliyor (ön kontrol yok); kayıp (`failed`) oturumlar kilitlenmiyor. |
| 39 | "Günde 1 hak" kuralı | BOZUK | `start/route.ts:56-74`, `complete/route.ts:98-108` | Kayıp sonrası yeniden oynatıyor ama sonuç her zaman 409 "Oyun zaten tamamlandı"; yarıda yenilenen aktif oturum ise sınırsız tekrar deneme veriyor (B2). |
| 40 | Sunucu ödül doğrulaması (cap, min süre, atomik claim) | KISMİ | `complete/route.ts:61, 81-87, 97-108` | Atomiklik doğru; ama skor ve `won` tamamen istemciden geliyor, tek koruma 10 sn (B5). |
| 41 | Günlük seri bonusu | ÇALIŞIYOR | `complete/route.ts:115-150` | Atomik `GameStreakClaim`. |
| 42 | Yeni başarım tespiti | ÇALIŞIYOR | `complete/route.ts:90-94, 196-215` | Tüm geçmişi iki kez tarıyor (B9). |
| 43 | Uygulama içi bildirim (ödül + başarım) | ÇALIŞIYOR | `complete/route.ts:185-212` | |
| 44 | Admin override'ın (başlık, renk, eşik, maxScore) oyunda uygulanması | BOZUK | `data-snake-game.tsx:11, 206, 311-319, 327, 354`; `use-mini-game.ts:70, 137`; `start/route.ts:96-102` | Sunucu `config` döndürüyor, hook saklıyor, bileşen hiç okumuyor; registry sabitleri kullanılıyor (B4). |
| 45 | Admin'in pasifleştirdiği oyun | KISMİ | `start/route.ts:34-39` | Sayfa yine açılıyor, yalnız "Oyna"ya basınca 403 toast. |
| 46 | HiDPI (retina) canvas ölçekleme | EKSİK | `data-snake-game.tsx:337-343` | `devicePixelRatio` kullanılmıyor → bulanık çizim. |
| 47 | Duraklatma / sekme gizlenince duraklatma | EKSİK | `data-snake-game.tsx:288-297` | Telefon çağrısı / bildirim sonrası yılan anında devam ediyor. |
| 48 | Başlangıç geri sayımı (3-2-1) | EKSİK | `data-snake-game.tsx:130-154` | Faz `playing` olur olmaz yılan hareket ediyor. |
| 49 | Oyun içinde kişisel rekor / haftalık sıra göstergesi | EKSİK | — | Liderlik verisi var ama HUD'a taşınmıyor. |
| 50 | Sonuç sonrası CTA (Oyun Merkezi'ne dön, sıradaki oyun, paylaş) | EKSİK | `game-shell.tsx:222-305` | Sonuç ekranı çıkmaz sokak. |
| 51 | Ekran okuyucu desteği (canvas açıklaması, `aria-live` skor, sonuç duyurusu) | EKSİK | `data-snake-game.tsx:323-343` | |
| 52 | Sonuç gönderimi başarısızsa yeniden deneme | EKSİK | `lib/use-mini-game.ts:126-132` | Hata durumunda sessionId sıfırlanıyor, buton yok. |
| 53 | Ölüm anının gösterilmesi (donmuş kare / çarpma vurgusu) | EKSİK | `game-shell.tsx:134-143`, `data-snake-game.tsx:52` | `submitting` fazında canvas anında unmount oluyor; oyuncu nereye çarptığını göremiyor. |

**Durum sayımı:** ÇALIŞIYOR 24 · KISMİ 14 · BOZUK 5 · SAHTE 2 · EKSİK 8 (toplam 53)

---

## Bulgular

### B1 — Ödül eşiği ölü; ekrandaki kural yalan söylüyor
- **Önem:** kritik · **Kategori:** işlevsellik / ürün kuralı · **Efor:** S
- **Kanıt:** `components/customer/games/data-snake-game.tsx:169-181` (her ölüm `endGame(false)`), `:206-209` (yalnız `score >= DEF.maxScore` → `endGame(true)`), `:327` ("Hedef: 12"), `:354` ("12+ paket = ödül"); `app/api/customer/games/[game]/complete/route.ts:86` (`eligible = won && !tooFast`); `components/customer/games/game-shell.tsx:290-293` (ödülsüz not); `lib/minigame-config.ts:276-277` (maxScore 30, eşik 12). Davranış `dd9eb6c` commit'inde "kaybederken ödül verme bug'ı" düzeltmesi olarak değiştirilmiş.
- **Sorun:** Sunucu ödülü yalnız `won === true` olduğunda veriyor; bu oyunda `won` sadece 30. pakette true oluyor. Dolayısıyla `rewardThreshold = 12` hiçbir koşulu etkilemiyor. Oyuncuya üç farklı yerde "12 yeterli" deniyor; 25 paket yiyip duvara çarpan biri "Ödül için 12 skor gerekiyordu" notuyla eli boş kalıyor. Bu, sadakat ürününde güveni doğrudan zedeler ("hile yapıyorlar" algısı). Ayrıca kardeş oyunlar (`review-stack-game.tsx:97`, `data-miner-game.tsx:125`, `combo-tap-game.tsx:114`) oyun sonunda `score >= rewardThreshold` ile kazanç verirken data-snake bu sözleşmeden sapıyor.
- **Öneri:** Önce ürün kararını netleştirin; iki tutarlı seçenek var:
  1. *Eşik modeli (önerilen):* Snake doğası gereği "ölene kadar oyna" türüdür. Ölümde `endGame(scoreRef.current >= threshold)` kullanın; 💀 ekranı tutarlılığı için `won` yerine sonuç modelini zenginleştirin: `outcome: 'cleared' | 'survived-threshold' | 'failed'`. GameShell başlığı "Çarptın ama 18 paketle ödülü kaptın!" gibi iki boyutlu bir sonuç gösterebilsin. Sunucuda `won` yerine `computeEffectiveReward(score)` belirleyici olsun (zaten eşik kontrolü var), `won` yalnız sunum için kalsın.
  2. *Hayatta kalma modeli:* Ödül gerçekten 30'a bağlıysa eşiği registry'de 30'a çekin, HUD'daki "Hedef"i `maxScore`'dan okuyun, ipucu ve `rewardMissNote` metnini "Ödül için 30 paketi ölmeden topla" yapın.
  Her iki durumda da HUD/ipucu/not metinleri tek kaynaktan (sunucunun döndürdüğü `config`) üretilmeli (bkz. B4).

### B2 — "Günde 1 hak" iki yönden kırık: kayıp sonrası sahte tekrar, yarıda bırakmada sınırsız deneme
- **Önem:** kritik · **Kategori:** veri bütünlüğü / ekonomi · **Efor:** M
- **Kanıt:** `app/api/customer/games/[game]/start/route.ts:56-74` (yalnız `status === 'completed'` kilitler; `active` ve `failed` için aynı `sessionId` + `canPlay: true` döner); `complete/route.ts:98-108` (`updateMany where status:'active'` → `failed` oturumda `count 0` → 409 "Oyun zaten tamamlandı"); `complete/route.ts:101` (kayıp → `failed`); `app/api/customer/games/status/route.ts:33` (hub yalnız `completed`'i "oynandı" sayar); `lib/use-mini-game.ts:98-99, 126-128`.
- **Sorun:**
  - *Kayıp sonrası:* Oyuncu ölür → oturum `failed`. Sayfayı yenileyip "Yılanı Sür"e basınca start ucu aynı oturumu "oynanabilir" döndürüyor, oyuncu bir tur daha oynuyor, sonunda complete 409 dönüyor ve kullanıcı kırmızı "Oyun zaten tamamlandı" toast'ı görüyor; kazansa bile ödül yok. Hub da bu oyunu "bugün oynandı" göstermiyor. Bu, kırık ve kafa karıştırıcı bir döngü.
  - *Yarıda bırakma:* Oturum `active` iken sayfa yenilenirse aynı oturum yeniden açılıyor; oyuncu ölmek üzereyken sekmeyi yenileyerek 30'a ulaşana kadar sınırsız deneyebiliyor. "Günde 1 hak" vaadi fiilen uygulanmıyor ve beceriye bağlı ödül, sabra bağlı hale geliyor.
- **Öneri:** Oturum yaşam döngüsünü açık bir durum makinesine çevirin: `active → completed | failed | abandoned`. Start ucu `failed`'ı da kilitli saysın (`alreadyPlayed: true, outcome: 'failed'`), hub `status` ucu da `in: ['completed','failed']` dönsün. Aktif oturumun yeniden açılmasına ya izin vermeyin ya da bunu açık bir "devam et" akışıyla yapın: oturuma `attempt` sayacı ekleyip ikinci açılışta önceki denemeyi `abandoned` sayın (ödülsüz). Kilit ekranı kayıpta da tutarlı olsun ("Bugün 18 paketle bitirdin — yarın tekrar"). İstemci tarafında ise sayfa açılışında `GET status` ile ön kontrol yapılıp "Oyna" butonu yerine doğrudan kilit/sonuç kartı gösterilsin (#38).

### B3 — Liderlik tablosu ve haftalık turnuva bu oyunda anlamsız; turnuva ödülü belirsiz sıraya göre dağıtılıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ekonomi · **Efor:** M
- **Kanıt:** `app/api/customer/games/[game]/leaderboard/route.ts:47-53`, `app/api/customer/tournament/route.ts:28-39` (her ikisi `status: 'completed'`, `orderBy _max.starsCollected desc`, ikincil sıralama yok); `complete/route.ts:61` (skor `maxScore=30`'a sıkıştırılır); `data-snake-game.tsx:206` (kazanç yalnız 30'da); `tournament/route.ts:62-97` (GET sırası) ve `:145-153` (POST sırası ayrı sorguyla yeniden hesaplanıyor); `lib/tournament-core.ts:13` (500/300/150 puan).
- **Sorun:** B1 nedeniyle `completed` olan her data-snake oturumunun skoru tam 30. Tüm zamanlar tablosu "herkes 30" listesine dönüşüyor; haftalık turnuvada ilk 3'ü (500/300/150 puan) belirleyen şey, eşit değerler arasında Postgres'in tanımsız sıralaması. GET ile POST ayrı sorgu çalıştırdığı için kullanıcı "Geçen hafta 2. oldun — Ödülü al" görüp butona bastığında "Geçen hafta ödül kazanmadın" yanıtı alabilir (canlıda doğrulanmadı; SQL semantiği gereği mümkün). Ayrıca liderlik ucu `take: 100` ile kesildiği için "N oyuncu" 100'de takılıyor, 100. sıranın altındaki kullanıcı kendi sırasını göremiyor.
- **Öneri:** (1) B1 çözülünce skor dağılımı açılır; yine de tüm sıralama sorgularına deterministik eşitlik bozucu ekleyin: önce skor, sonra daha erken `completedAt` (ilk ulaşan kazanır), sonra `userId`. Prisma `groupBy` bunu desteklemediği için `$queryRaw` ile `MAX(starsCollected)`, `MIN(completedAt) FILTER (WHERE starsCollected = max)` hesaplayan tek sorgu yazın. (2) Liderlik `failed` oturumlardaki skoru da saymalı (Snake'te "en iyi skor" ölümle biter). (3) Turnuva kapanışında sırayı bir kez `TournamentResult` tablosuna dondurun (cron ile, fail-closed); GET ve POST bu donmuş sonucu okusun → ödül ve gösterim aynı kaynaktan gelir. (4) `totalPlayers` için ayrı `count(distinct userId)`, kendi sıram için `COUNT(*) WHERE best > myBest` kullanın.

### B4 — Admin override istemcide yok sayılıyor
- **Önem:** yüksek · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `app/api/customer/games/[game]/start/route.ts:71, 82, 96-102` (config döner); `lib/use-mini-game.ts:70, 137` (saklanır ve dışa verilir); `components/customer/games/data-snake-game.tsx:11, 206, 311-321, 327, 354` (yalnız `getMiniGame('data-snake')` registry sabitleri); `lib/minigame-config-effective.ts:40-57` (admin başlık, açıklama, emoji, renk, eşik, maxScore, ödül değiştirebilir).
- **Sorun:** Admin panelinden eşik 8'e veya maxScore 20'ye çekilirse sunucu buna göre ödül hesaplar ama oyun hâlâ "Hedef: 12" gösterir ve kazanmayı 30'da tetikler; admin başlık/renk değiştirse de oyun sayfası eski değerleri gösterir (hub `status` ucundan güncel değerleri alırken). İki ekran arasında tutarsızlık ve "panel çalışmıyor" algısı.
- **Öneri:** Etkin yapılandırmayı sayfa sunucu bileşeninde `getEffectiveMiniGame('data-snake')` ile okuyup (60 sn cache'li) bileşene prop olarak geçin; `enabled === false` ise sayfada "Bu oyun şu an kapalı" durumu render edin (#45). Hook'un `config`'i yalnız doğrulama için kalsın. Bu, tüm 20 oyun için tek noktadan çözülmeli (bkz. Çakışmalar).

### B5 — Skor ve sonuç tamamen istemciye güveniyor
- **Önem:** yüksek · **Kategori:** güvenlik / ekonomi · **Efor:** L
- **Kanıt:** `lib/use-mini-game.ts:92-96` (istemci `score`, `won`, `durationSec` gönderir); `app/api/customer/games/[game]/complete/route.ts:15-22, 61, 81-87` (tek kontrol: skor cap'i ve sunucu tarafı ≥10 sn).
- **Sorun:** Oturum açmış bir kullanıcı start'ı çağırıp 10 sn bekledikten sonra `{"score":30,"won":true,"durationSec":11}` göndererek 160 puan + 80 XP + seri bonusu alabilir; aynı şey 20 oyunun hepsinde tekrarlanabilir. 30 paket, 140→70 ms adım hızıyla gerçekçi olarak en az ~15-20 sn sürer; 10 sn eşiği bu oyun için bile gevşek. Bu sistem genelinde bir zayıflık; points_credited olayıyla hız dedektörüne görünür ama engellenmiyor.
- **Öneri:** Oyun başına makul "skor/süre" üst sınırı ekleyin (data-snake için skor başına en az ~0,5 sn; yani 30 skor için ≥15 sn) ve registry'ye `minSecPerPoint` alanı olarak koyun. Orta vadede deterministik tohumlu tekrar oynatma doğrulaması: start ucu `seed` döndürür, yem konumları bu tohumla üretilir, istemci yön değişikliği olay günlüğünü (`[{tick, dir}]`, birkaç yüz bayt) gönderir, sunucu aynı simülasyonu çalıştırıp skoru yeniden hesaplar. Snake bunun için ideal bir adaydır (saf, ızgara tabanlı, ucuz simülasyon).

### B6 — Mobil/erişilebilirlik: D-pad, canvas ve skor ekran okuyucuya kapalı; tablette D-pad yok
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil · **Efor:** S
- **Kanıt:** `data-snake-game.tsx:346-353` (`sm:hidden`), `:360-371` (`aria-label` yok, `onClick`, `touch-action` yok), `:323-331` (`aria-live` yok), `:337-343` (canvas'ta `role`/`aria-label` yok).
- **Sorun:** Ekran okuyucu düğmeleri "siyah yukarı üçgen" olarak okur; skor değişimi ve oyun sonu duyurulmaz. 640 px üstü dokunmatik tabletlerde (iPad dikey 768 px) D-pad kaybolur, yalnız swipe kalır. `onClick` dokunmatikte pointerdown'a göre gecikmelidir; hızlanan bir oyunda bu gecikme ölümcül.
- **Öneri:** D-pad'i `pointer: coarse` medya sorgusuna göre gösterin (genişliğe göre değil), `onPointerDown` + `touch-action: manipulation` kullanın, her düğmeye "Yukarı/Sola/Aşağı/Sağa" `aria-label` verin. Canvas'a `role="img"` ve "Veri Yılanı oyun alanı" etiketi, skor satırına `aria-live="polite"` (yalnız kilometre taşlarında duyurarak) ekleyin. Klavye dinleyicisini `window` yerine odaklanabilir oyun konteynerine bağlayıp `input/textarea` hedeflerini yok sayın (#22).

### B7 — Turnuva kartı açık temada okunamaz; müşteriye admin toast önekleri sızıyor
- **Önem:** orta · **Kategori:** görsel / dil · **Efor:** S
- **Kanıt:** `components/customer/games/game-shell.tsx:97-104` (kabuk her temada koyu arka plan, metin rengi tanımlamıyor); `components/customer/games/game-tournament.tsx:134, 164, 166, 176-177` (renk sınıfı olmayan metinler tema `foreground`'unu miras alır), `:46, 102, 116, 143, 151` (`text-muted-foreground`, `bg-muted/40`, `bg-primary/10` tema token'ları); `:6` (`@/lib/admin-toast`), `lib/admin-toast.ts:16-19` ("Basarili: ", "Dikkat: ").
- **Sorun:** Açık temada `foreground` koyu olduğu için turnuva satırlarındaki isimler, "Sen", skorlar ve bekleyen ödül başlığı koyu lacivert zeminde koyu metin olarak çiziliyor (kod okumasıyla tespit; ekran görüntüsüyle doğrulanmadı). Ödül alınca müşteri "Basarili: 🏆 2. oldun — +300 puan!" görür: Türkçe karaktersiz ve admin paneline özgü bir önek.
- **Öneri:** GameShell'i kendi içinde koyu bir "sahne" olarak tanımlayın: kökte `className="dark"` veya yerel CSS değişkenleriyle (`--foreground`, `--muted-foreground`) koyu paleti sabitleyin ki içindeki shadcn token'ları doğru renge çözülsün. Turnuva bileşeni müşteri tarafında doğrudan `sonner` kullansın (diğer oyun toast'larıyla aynı ton).

### B8 — Hareket tercihleri tutarsız; ses yalnızca "animasyonları azalt" ile kapanıyor
- **Önem:** orta · **Kategori:** erişilebilirlik / UX · **Efor:** S
- **Kanıt:** `components/providers.tsx:232` (`MotionConfig reducedMotion="user"` → yalnız OS tercihi); `app/globals.css:824-831` (`reduce-animations` yalnız CSS animasyonlarını etkiler); `game-shell.tsx:173-177, 195-200, 232-243, 245-251` (framer `repeat: Infinity`); `data-snake-game.tsx:30-32`, `lib/game-sounds.ts:10-13` (ses = hareket tercihi).
- **Sorun:** Uygulama ayarından "Animasyonları azalt"ı açan kullanıcı yine sürekli zıplayan emoji, nabız halkası, dönen ışık halkası görür. OS'ta hareket azaltma açık olan kullanıcı ise sarsıntı ve konfeti görür. Sesi kapatmak isteyen kullanıcının tek yolu tüm animasyonları kapatmak; oyun içi sessize alma düğmesi yok.
- **Öneri:** Tek bir `useReducedMotionPreference()` hook'u yazın (OS + `html.reduce-animations` birleşimi) ve hem `MotionConfig`'e (`reducedMotion={pref ? 'always' : 'never'}`) hem canvas efektlerine verin. Sesi bağımsız bir tercih yapın (`game-sound-muted`, localStorage + profil); HUD'a 🔊/🔇 düğmesi ekleyin.

### B9 — Ölüm anı görünmüyor, duraklatma ve geri sayım yok, ölümde ses iki kez çalıyor
- **Önem:** orta · **Kategori:** UX / oyun hissi · **Efor:** M
- **Kanıt:** `game-shell.tsx:134-143` (yalnız `playing` iken children), `lib/use-mini-game.ts:89` (`submitting`'e geçiş anında); `data-snake-game.tsx:130-154` (geri sayım yok), `:288-297` (`visibilitychange` yok); `:171, 177` + `:59-60` (çift `sfxHit`).
- **Sorun:** Oyuncu çarptığı anda tahta kayboluyor ve spinner beliriyor; nereye/neden öldüğünü göremiyor, rastgele "Kuyruğa çarptın" başlığı da yanlış olabiliyor (#34). Oyun "Oyna"ya basar basmaz başlıyor; mobilde parmak D-pad'e gidene kadar yılan 1-2 hücre ilerlemiş oluyor. Bildirim/çağrı sonrası oyun duraklamadan devam ediyor. Ölüm sesi iki kez üst üste çalıyor (iki kat ses yüksekliği).
- **Öneri:** Ölümde ~700 ms "donmuş kare": çarpan hücrede kırmızı titreşim, yılan gövdesi soluklaşır, ardından `finish` çağrılır; ölüm nedenini (`wall`/`self`) sonuç modeline ekleyip başlık varyantını ona göre seçin. 3-2-1 sayacı (reduce-motion'da tek "Hazır?" kartı), `visibilitychange`/`blur`'da otomatik duraklatma + "Devam" kartı. `sfxHit`'i yalnız `endGame` içinde çağırın.

### B10 — Tamamlama ucu her çağrıda kullanıcının tüm oyun geçmişini iki kez tarıyor
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `complete/route.ts:90-94, 199`; `lib/game-achievement-stats.ts:17-20` (sınırsız `findMany`).
- **Sorun:** Aktif bir oyuncu yılda ~20 oyun × 365 gün ≈ 7.000 satır; her tamamlamada iki kez çekilip bellekte işleniyor. Şu an küçük ama doğrusal büyüyor.
- **Öneri:** "Önce" istatistiğini çağırmak yerine tek sorgudan türetin: sonrasını hesaplayın, bu oturumun katkısını çıkararak öncesini bulun; ya da istatistikleri `GameStats` özet satırında artımlı tutun.

### B11 — Küçük tutarlılık sorunları
- **Önem:** düşük · **Kategori:** UX / dil · **Efor:** S
- **Kanıt ve sorun:**
  - Sekme başlığı çift ek alıyor: `page.tsx:7` + `app/customer/layout.tsx:19-21`.
  - Başlık/açıklama iki kez ve iki farklı metinle gösteriliyor: `page.tsx:17-20` ("Duvara ve kuyruğuna çarpma. Günde 1 hak!") ve `game-shell.tsx:181-184` (registry açıklaması).
  - Sıfırlama saati "00:00 (UTC)" (`game-shell.tsx:323`, `start/route.ts:10-12`): Türkiye'deki tüketici için gerçek sıfırlama 03:00. Kullanıcı yerel saatiyle düşünür.
  - Liderlik hatası "Henüz skor yok" diye gösteriliyor (`game-leaderboard.tsx:40, 55-61`).
  - Giriş yapmış dealer/admin rolü `/auth/signin`'e yönlendiriliyor (`page.tsx:11-12`).
  - Canvas HiDPI ölçeklenmiyor (`data-snake-game.tsx:337-343`): retina ekranlarda bulanık.
- **Öneri:** Sayfa başlığını yalnız `title: 'Veri Yılanı'` yapın; çift başlığı kaldırıp GameShell'i tek başlık kaynağı yapın; sıfırlama zamanını "Yeni hakkın 03:00'te (x saat y dk sonra)" şeklinde yerel saat + geri sayımla gösterin (ya da dayKey'i `Europe/Istanbul`'a taşıyın; bu ekonomi genelinde bir karar, seri hesabı da etkilenir); canvas'ı `width = W * dpr` ile çizip `ctx.scale(dpr, dpr)` uygulayın.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kişisel rekor ve "rekoru geçtin" anı** (Duolingo / mobil arcade standardı): HUD'da "En iyin: 22" ve rekor geçildiği anda kısa bir parlama; sonuç ekranında önceki rekorla kıyas. Veri zaten leaderboard ucunda (`me.score`) mevcut.
2. **İlerleme odaklı sonuç kartı** (Starbucks Rewards / Spotify Wrapped hissi): "Bu hafta 3 oyun oynadın, 2 gündür serin sürüyor, turnuvada 7.'sin — 4 puan daha 3.'lüğe taşır". Şu an sonuç ekranı yalnız skor + "yarın gel".
3. **Sonraki adım yönlendirmesi**: "Oyun Merkezi'ne dön", "Bugün oynamadığın 4 oyun var", "Puanlarını ödüllere harca" CTA'ları. Sonuç ekranı çıkmaz sokak.
4. **Duraklatma, geri sayım, ses aç/kapat**: her ciddi mobil oyunda temel kontroller.
5. **Paylaşılabilir skor kartı**: Web Share API ile "Veri Yılanı'nda 27 paket! #QRateX" görseli (canvas'tan PNG). Referral sistemine bağlanabilir.
6. **Hata/çevrimdışı dayanıklılığı**: sonuç gönderilemezse yerel kuyruğa alıp tekrar gönderme (next-pwa zaten var); "Sonucun kaydediliyor, bağlantı gelince gönderilecek" durumu.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Oyuncu sayfayı açtığında *bugünkü durumunu* anında görür (oynandı mı, serisi kaç gün, turnuvada kaçıncı, rekoru kaç); bir dokunuşla 3-2-1 sonrası oyuna girer; oyun boyunca hedefe ne kadar kaldığını hisseder; ölümde ne olduğunu görür; sonuçta ne kazandığını ve bir sonraki adımı net bilir. Kural tek ve dürüst: "12 paketten sonra ölsen de ödül senin; 30'a ulaşırsan Efsane bonusu."

**Yerleşim (mobil öncelikli):**
- *Üst şerit (lobi):* sol: emoji + başlık; sağ: "Seri 🔥 4" ve "Yeni hak 03:00'te" çipleri. Altında üç küçük istatistik kartı: *En iyin*, *Bu hafta sıran*, *Ödül eşiği*. Bugün oynandıysa birincil buton yerine "Bugünkü sonucun" kartı.
- *Oyun alanı:* tam genişlik kare canvas (mobilde `min(100vw-32px, 60dvh)`; masaüstünde 480-560 px), HiDPI. Üstte ince ilerleme çubuğu: 0 → eşik (12, ödül kilidi açılır, kilit ikonu açılma mikro-animasyonu) → 30 (Efsane). Sağ üstte 🔊 ve ⏸ düğmeleri.
- *Kontroller:* `pointer: coarse` cihazlarda başparmak bölgesinde D-pad (pointerdown), masaüstünde klavye ipucu.
- *Sonuç:* ölüm donmuş karesi → kart yukarı kayar: skor, rekor kıyası, kazanılan puan/XP (sayaç animasyonu), seri, turnuva sırası değişimi ("12. → 7. ↑"), iki CTA: "Oyun Merkezi" ve "Sıradaki oyun".
- *Lobi altı:* turnuva ve tüm zamanlar sekmeli tek kart (iki ayrı liste yerine), "Sen" satırı her zaman sabit.

**Motion / 3B (ölçülü):**
- 3B gereksiz; canvas 2B kimliği doğru. Yemde akıcı nabız (`performance.now()` tabanlı), yılan başında yön yönlü göz kayması, eşik geçildiğinde tahta çerçevesinde tek seferlik yeşil dalga, 30'da kısa konfeti.
- framer-motion yalnız lobi/sonuç kart geçişlerinde; sonsuz döngüler (zıplayan emoji, dönen konik ışık) ya kaldırılsın ya da birleşik reduce-motion hook'una bağlansın.
- Reduce-motion'da: sarsıntı/konfeti/nabız kapalı, geri sayım tek kart, ses ayrı tercih.

**Veri / API değişiklikleri:**
- `GET /api/customer/games/[game]/state` (yeni, tek çağrı): `{ config (etkin), today: { status, score, outcome } | null, personalBest, streak, weeklyRank, nextResetAt }` → lobi tek istekle dolar, "Oyna"ya basmadan kilit bilinir. Sayfa sunucu bileşeninde de önceden çekilebilir.
- `start`: `failed`/`abandoned` kilitli; yanıt `seed` içerir; aktif oturumun yeniden açılması `attempt` sayacıyla izlenir.
- `complete`: gövde `{ sessionId, inputs: [{t, dir}], cause }`; sunucu tohumla simüle edip skoru hesaplar; ödül `computeEffectiveReward(serverScore)` ile, `won` sunuma bırakılır; yanıt `personalBestBefore`, `weeklyRankBefore/After` döndürür.
- Sıralama: `$queryRaw` ile deterministik eşitlik bozucu; turnuva kapanışında `TournamentResult` dondurma (cron, fail-closed); `failed` oturum skorları liderliğe dahil.
- `MiniGameSession`'a `outcome`, `deathCause`, `attempt` alanları (canlı Neon şemasında migration, dikkatli).

---

## Çakışmalar / birleştirme önerisi

- **Sayfa sarmalayıcısı kopya:** `app/customer/games/*/page.tsx` altındaki 21 oyun klasörü (data-snake ve pacman dahil) aynı kalıbı tekrar ediyor: oturum kontrolü + `DashboardPageHeading` + tek bileşen. Bunları tek bir dinamik rota `app/customer/games/[game]/page.tsx` altında birleştirin: registry'den `getEffectiveMiniGame(params.game)` okuyun (404 / kapalı durumu burada), `next/dynamic` ile oyun bileşenini `gameType → import()` haritasından yükleyin, `generateStaticParams` ile mevcut URL'leri koruyun. Böylece B4 (override), B11 (başlık tekrarı, metadata) ve "kapalı oyun" durumu tek yerde çözülür. `pacman`'ın ayrı API'si olduğu için haritada özel durum olarak kalabilir.
- **Mekanik çakışması:** Data-snake, Oyun Merkezi'ndeki diğer "hayatta kal / topla" oyunlarıyla (pacman: labirentte toplama, frost-catcher: düşenleri yakalama) tematik olarak yakın ama mekanik olarak ayrı; kaldırılması veya birleştirilmesi gerekmiyor. Klasik Snake tanınırlığı yüksek, giriş bariyeri düşük bir oyun; korunmalı.
- **Ödül kuralı uyumu:** Ödül kuralı (B1) diğer oyunlarla aynı sözleşmeye (`oyun sonu skoru >= eşik → ödül`) çekilmeli; `dd9eb6c` ile aynı şekilde değiştirilen network-defender, spam-breaker ve data-miner oyunları da aynı açıdan yeniden denetlenmeli (bu raporun kapsamı dışında, doğrulanmadı).

---

## Doğrulama (şüpheci inceleme)

Yöntem: iddiaların her biri kod yeniden okunarak çürütülmeye çalışıldı (istemci bileşeni, `useMiniGame` hook'u, generic `start`/`complete`/`status` route'ları, `computeEffectiveReward`, registry, `GameShell`, turnuva route'u ve `tournament-core`). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Ödül eşiği devre dışı (12+ yiyip ölen ödül alamıyor, ekran 12'yi yeterli gösteriyor) — **DOĞRULANDI**
- `components/customer/games/data-snake-game.tsx:169-181`: duvar/kuyruk çarpması her durumda `endGame(false)`; `:206-209`: `won=true` yalnızca `scoreRef.current >= DEF.maxScore` (30, `lib/minigame-config.ts:276`) iken.
- `app/api/customer/games/[game]/complete/route.ts:86`: `eligible = won && !tooFast` → `won=false` iken `computeEffectiveReward` hiç çağrılmıyor; eşik kontrolü (`lib/minigame-config-effective.ts:112`, `s >= rewardThreshold`) yalnızca won=true yolunda çalışıyor ve o yolda skor her zaman 30 olduğundan eşik (12, `lib/minigame-config.ts:277`) fiilen ölü.
- Kullanıcıya gösterilen ise tersi: HUD'da `Hedef: 12` (`data-snake-game.tsx:327`), alt ipucunda `12+ paket = ödül` (`:354`); `lib/minigame-copy.ts:170-177` data-snake için `rewardMissNote` tanımlamadığından `GameShell` varsayılanı `Ödül için 12 skor gerekiyordu` (`components/customer/games/game-shell.tsx:290-293`) basılıyor.
- Yeniden üretim: oyunu başlat, 25 paket ye, duvara çarp → 💀 ekranı "Ödül için 12 skor gerekiyordu" der, puan/XP 0. Kardeş oyun `review-stack-game.tsx:97` oyun sonunda `score >= rewardThreshold` kullanıyor; data-snake bu sözleşmeden sapıyor.
- Not: `:169` yorumu ("ölüm = kayıp, ödül YOK") bunun bilinçli olduğunu gösteriyor; ama o hâlde ekrandaki eşik vaadi yanlış. Ya ödül kuralı `endGame(score >= threshold)` yapılmalı ya da UI'dan eşik vaadi kaldırılıp "30'a ulaş" dili kullanılmalı. İkisi aynı anda doğru olamaz.

### 2. Kayıp (failed) oturum kilitlenmiyor, tamamlama 409; aktif oturumla sınırsız tekrar — **DOĞRULANDI**
- `app/api/customer/games/[game]/start/route.ts:56-73`: yalnızca `status === 'completed'` kilitleniyor; `failed` ve `active` için aynı `sessionId` ile `canPlay: true` dönüyor.
- `complete/route.ts:73` yalnızca `completed`'ı reddediyor; `failed` oturum geçiyor, ardından `:98-99` `updateMany where status:'active'` → `count 0` → `:177-181` 409 "Oyun zaten tamamlandı". `useMiniGame.finish` (`lib/use-mini-game.ts:98-99, 126-128`) bunu hata toast'ı olarak gösterip sonucu ödülsüz yazar.
- `status/route.ts:33` yalnızca `completed` sayıyor → hub, ölen kullanıcıyı "bugün oynanmadı" gösterip tekrar davet ediyor.
- Yeniden üretim (a, UX): oyna ve öl (failed) → sayfayı yenile → "Yılanı Sür" yine aktif → oyna, 30'a ulaş → "Oyun zaten tamamlandı" hata toast'ı, ödül yok. Kullanıcı bir oyunu boşuna oynatılmış olur.
- Yeniden üretim (b, ekonomi): oynarken kötü gidiyorsa ölmeden sekmeyi kapat/yenile (ya da `complete` isteğini devtools'ta blokla/çevrimdışı ol) → oturum `active` kalır → `start` aynı oturumu verir → 30'a ulaşana kadar sınırsız deneme. Sunucu süre kontrolü `startedAt`'ten ölçüldüğü için (`complete/route.ts:81`) engel oluşturmaz. "Günde 1 hak" fiilen "günde 1 kazanç" olur.
- Etki sınırlı (günde en fazla bir ödül), ama sayfadaki "Günde 1 hak!" vaadi (`app/customer/games/data-snake/page.tsx:19`) uygulanmıyor ve failed yolu kullanıcıyı yanıltıyor.

### 3. Turnuva ödülü eşit skorlar arasında tanımsız sıraya göre dağıtılıyor — **DOĞRULANDI** (GET/POST farkı kısmı: belirsiz)
- `app/api/customer/tournament/route.ts:29-35`: `groupBy` yalnızca `_max.starsCollected desc` ile sıralanıyor, eşitlik bozucu yok.
- Data-snake'te `completed` oturum yalnızca `won=true` ile oluşuyor (`complete/route.ts:101`) ve dürüst istemci `won=true`'yu yalnızca skor 30'da gönderiyor (`data-snake-game.tsx:206`); skor `maxScore`'a kırpılıyor (`complete/route.ts:61`). Sonuç: haftanın tüm kazananları tam 30 ile eşit; ilk 3 (500/300/150, `lib/tournament-core.ts:13`) anlamlı bir kritere değil Postgres'in tanımsız satır sırasına göre seçiliyor.
- Yeniden üretim: bir haftada 5 kullanıcı data-snake'i kazanır → hepsi 30 → sıralama aynı skor içinde keyfî → 3'ü 950 puanı paylaşır, 2'si hiçbir şey alamaz; lider tablosunda da aynı skorla farklı "sıra/ödül" görünür. `GameShell` turnuvayı her oyunda gösterdiği için (`game-shell.tsx:212`) bu canlı akışta.
- GET (`:83-94`) ile POST (`:145-153`) arasında sıranın değişip "Ödülü al" sonrası "Geçen hafta ödül kazanmadın" alınması SQL semantiği gereği mümkün ama aynı veri ve plan ile pratikte genellikle aynı sırayı üretir; canlıda doğrulanmadı → bu alt iddia belirsiz. Asıl kusur (keyfî ödül dağıtımı) kesin.
- Öneri: eşitlik bozucu (`MIN(completedAt)` — önce ulaşan kazanır) ile `$queryRaw` sıralaması; kalıcı adalet için hafta kapanışında sonucu `TournamentResult` olarak dondurmak; data-snake'te skoru ölümde de kaydedip (failed skorları dahil) sıralamayı anlamlı hâle getirmek.

### 4. Skor/won istemciden güvenilir kabul ediliyor; 10 sn sonra sahte gövdeyle tam ödül — **DOĞRULANDI** (etki günde oyun başına bir ödülle sınırlı)
- `complete/route.ts:15-22` gövdede `score`, `durationSec`, `won` istemciden geliyor; `:61` yalnızca `maxScore`'a kırpma, `:82-83` yalnızca `minDurationSec` (data-snake için 10, `lib/minigame-config.ts:280`) kontrolü; oynanışa dair hiçbir sunucu kanıtı (girdi kaydı, tohum, olay akışı) yok.
- Yeniden üretim: oturum açıkken tarayıcı konsolunda `fetch('/api/customer/games/data-snake/start',{method:'POST'})` → dönen `sessionId` ile ≥10 sn sonra `fetch('/api/customer/games/data-snake/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,score:30,durationSec:11,won:true})})` → 160 puan + 80 XP + (günün ilk ödülüyse) seri bonusu. `creditPointsAndXp` (`lib/points-wallet.ts:27-43`) ve route içinde cap uygulanmıyor; `points_credited` olayı (`complete/route.ts:162-171`) yalnızca görünürlük sağlıyor. Registry'deki tüm generic oyunlar için aynı; günde oyun başına bir kez → kullanıcı başına günlük birkaç bin puan basılabilir.
- Not: istemci-taraflı oyunlarda tam önleme ancak sunucu-taraflı yeniden oynatma (tohum + girdi kaydı ile deterministik simülasyon) ile mümkün; bu raporun "Veri / API değişiklikleri" bölümündeki `seed` + `inputs` önerisi doğru yön. Kısa vadede: oyun puanlarına günlük toplam cap (`lib/points-caps` deseni) ve velocity dedektörünün oyun kategorisinde fail-closed çalışması.

**Özet:** 4 iddianın 4'ü de doğrulandı. #3'ün "GET ve POST farklı sıra hesaplayabilir" alt iddiası canlıda doğrulanmadı (belirsiz); keyfî eşitlik dağıtımı ise koddan kesin.
