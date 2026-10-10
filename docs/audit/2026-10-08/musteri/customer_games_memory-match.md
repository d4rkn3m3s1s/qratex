# /customer/games/memory-match

**Amaç:** Müşteriye günde bir hak verilen, 16 kartlık (8 çift) emoji hafıza oyunu sunmak; 6+ çift bulana sunucuda doğrulanan 150 puan + 75 XP, günlük seri bonusu, başarım, tüm zamanlar liderliği ve haftalık turnuva ödülü vermek.

**Genel puan: 5.2 / 10** · **Karar: koru-iyileştir** (çekirdek oyun döngüsü sağlam ve paylaşılan altyapıya oturuyor; ama "günde 1 hak" kuralı delinebiliyor, kayıp sonrası akış bozuk, skor modeli liderlik/turnuvayı anlamsızlaştırıyor ve açık temada turnuva tablosu görünmüyor; bunlar yeniden inşa gerektirmeden düzeltilebilir.)

İncelenen dosyalar:
- `app/customer/games/memory-match/page.tsx`
- `app/customer/layout.tsx`
- `components/customer/games/memory-match-game.tsx`
- `components/customer/games/game-shell.tsx`, `game-leaderboard.tsx`, `game-tournament.tsx`, `fx-layer.tsx`, `games-hub.tsx`
- `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/admin-toast.ts`, `lib/tournament-core.ts`, `lib/points-caps.ts`
- `app/api/customer/games/[game]/start/route.ts`, `[game]/complete/route.ts`, `[game]/leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`
- `prisma/schema.prisma` (`MiniGameSession` 493-513)
- `components/providers.tsx`, `app/globals.css`, `next.config.*` (`reactStrictMode: true`, satır 258)

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Mutlu yol (başlat, oyna, kazan, ödül al) çalışıyor; ama kayıp sonrası tekrar oynama 409 ile bitiyor, sayfa yenilenerek sınırsız deneme hakkı elde ediliyor, hamle limiti eşleşmelerde aşılabiliyor. |
| UX | 5/10 | "Az hamlede tamamla" vaadi hiçbir yerde ödüllendirilmiyor; oyunun önceden oynanıp oynanmadığı ancak "Kartları Çevir"e basınca anlaşılıyor; bitiş anı spinner'la kesiliyor. |
| Görsel | 6/10 | Neon kabuk, parçacık patlamaları ve yay animasyonu hoş; ama kart çevirme gerçek iki yüzlü kart değil (yüz anında görünüyor, ayna görüntüsüyle dönüyor) ve konumla artan gecikme çevirmeyi tutarsız kılıyor. |
| Mimari | 5/10 | Paylaşılan `useMiniGame`/`GameShell`/generic API iyi bir temel; ama setState updater'ı içinde yan etki, istemcinin admin override'ı yerine statik registry'yi kullanması ve 21 neredeyse aynı `page.tsx` teknik borç. |
| Performans | 7/10 | Hafif bileşen, DOM tabanlı ızgara; FxLayer'ın rAF döngüsü parçacık yokken de oyun boyunca 60/120 fps dönüyor, her tamamlamada başarım istatistikleri iki kez hesaplanıyor. |
| Erişilebilirlik + mobil | 4/10 | Kartlarda `aria-label` ve canlı bölge yok, ekran okuyucu "❔" okuyor; açık temada turnuva satırları siyah zemine siyah yazı; ses ayrı kapatılamıyor; 4 sütunlu ızgara mobilde iyi oturuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum/rol kontrolü (CUSTOMER değilse `/auth/signin`) | ÇALIŞIYOR | `app/customer/games/memory-match/page.tsx:10-13` | Rolü olmayan girişli kullanıcı (ör. DEALER) da signin'e atılıyor; hedef sayfa bilgisi (`callbackUrl`) taşınmıyor. |
| 2 | Sayfa başlığı + açıklama (`DashboardPageHeading`) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` olduğu için mobilde hiç görünmüyor (kabuk zaten başlığı gösteriyor, sorun değil). Başlık/açıklama statik; admin override'ı yansımıyor. |
| 3 | Metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s \| Müşteri alanı` ekliyor → sekmede "Hafıza Eşleştir \| QRateX \| Müşteri alanı" (çift son ek). |
| 4 | Başlangıç ekranı (emoji, başlık, açıklama, ipucu, CTA "🃏 Kartları Çevir") | ÇALIŞIYOR | `game-shell.tsx:165-208`, `lib/minigame-copy.ts:138-145` | Kullanıcı bugünkü hakkını kullanmış olsa bile CTA görünüyor (bkz. #20). |
| 5 | Nabız halkalı CTA mikro-etkileşimi | ÇALIŞIYOR | `game-shell.tsx:189-207` | Global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) dönüşümleri sınırlıyor; `boxShadow` sonsuz animasyonu ise reduced-motion'da da dönüyor (doğrulanmadı). |
| 6 | Oyun başlatma (`POST /api/customer/games/memory-match/start`) | ÇALIŞIYOR | `lib/use-mini-game.ts:54-79`, `start/route.ts:20-94` | Admin pasifleştirdiyse 403 + toast. |
| 7 | Günde 1 hak kuralı | BOZUK | `start/route.ts:56-73` | Yarım kalan `active` oturum aynen geri veriliyor; istemci her seferinde yeni deste kuruyor → sayfa yenilenerek sınırsız deneme. Bkz. Bulgu 1. |
| 8 | Kayıp sonrası yeniden giriş | BOZUK | `start/route.ts:57` (yalnız `completed` kilitler), `complete/route.ts:73,98-108` | `failed` oturum "oynanabilir" dönüyor, oyun sonunda 409 "Oyun zaten tamamlandı". Bkz. Bulgu 2. |
| 9 | Deste üretimi (8 emoji × 2, Fisher-Yates karıştırma) | ÇALIŞIYOR | `memory-match-game.tsx:14,25-32` | Her gün aynı 8 sembol; zorluk/tema çeşitliliği yok. |
| 10 | Kart çevirme etkileşimi + kilit (`lockRef`) | KISMİ | `memory-match-game.tsx:73-126` | Mantık çalışıyor ama skor/ses/zamanlayıcı yan etkileri `setCards` updater'ı içinde (Bulgu 5). |
| 11 | 3B çevirme animasyonu | KISMİ | `memory-match-game.tsx:160-183` | Ön/arka yüz yok (`backfaceVisibility` yok), yüz anında beliriyor; `delay: i*0.02` her çevirmede de uygulanıyor (Bulgu 7). |
| 12 | Eşleşme efekti (burst + halka + konfeti + ses + titreşim) | ÇALIŞIYOR | `memory-match-game.tsx:91-103`, `fx-layer.tsx:169-252` | Klavyeyle (Enter) tetiklenince `clientX/Y=0` → efekt arena dışına düşüyor. |
| 13 | Eşleşmeme: 720 ms sonra kapanma + ses + titreşim | ÇALIŞIYOR | `memory-match-game.tsx:110-121` | |
| 14 | Çift sayacı "x/8 çift" | ÇALIŞIYOR | `memory-match-game.tsx:143-145` | Dev'de StrictMode nedeniyle çift sayabiliyor (Bulgu 5). |
| 15 | Hamle sayacı "x/28 hamle" ve hamle limiti | KISMİ | `memory-match-game.tsx:15,115-117` | Limit yalnız eşleşmeme dalında kontrol ediliyor; ardışık eşleşmelerle "29/28", "30/28" görülebilir (Bulgu 8). |
| 16 | Kazanma (tüm çiftler) → `finish(score, true)` | ÇALIŞIYOR | `memory-match-game.tsx:107` | 500 ms sonra board yerini spinner'a bırakıyor; tamamlanmış ızgara hiç kutlanmıyor. |
| 17 | Hamle bitince eşik kontrolü (6+ çift = "kazandı") | KISMİ | `memory-match-game.tsx:116` | Eşik istemcide statik `DEF.rewardThreshold`; admin override'ı görmüyor (Bulgu 6). |
| 18 | Sonucun sunucuda doğrulanması + ödül (150 puan / 75 XP) | KISMİ | `complete/route.ts:59-108`, `lib/minigame-config-effective.ts:107-116` | Atomik tek-claim doğru; ama skor/won tamamen istemci beyanı, yalnız `≤8` ve `≥8 sn` kontrolü var (Bulgu 3). |
| 19 | Günlük seri bonusu (+10 XP, her 3. gün +30) | ÇALIŞIYOR | `complete/route.ts:115-150` | `GameStreakClaim` unique ile yarış güvenli. |
| 20 | "Bugün oynandı" kilit ekranı | KISMİ | `game-shell.tsx:308-332`, `use-mini-game.ts:64-68` | Sayfa açılışında durum sorgulanmıyor; kilit ancak CTA'ya basınca görünüyor. "00:00 (UTC)" Türkiye için 03:00 demek. |
| 21 | Sonuç ekranı (kupa/kurukafa, varyant başlık, skor, ödül kartı) | ÇALIŞIYOR | `game-shell.tsx:222-305` | Hamle sayısı, süre, kişisel rekor gösterilmiyor. 409/500 hatasında istemci "kazandın" başlığı + "ödül için 6 skor gerekiyordu" çelişkisi üretiyor. |
| 22 | Konfeti kutlaması (ödülde) | ÇALIŞIYOR | `game-shell.tsx:19-31,86-94` | Yalnız uygulama içi "animasyonları azalt" sınıfına bakıyor; OS `prefers-reduced-motion` dikkate alınmıyor. |
| 23 | Ödül/seri/başarım toast'ları | ÇALIŞIYOR | `use-mini-game.ts:112-125` | `tooFast` yanıtı yok sayılıyor; o durumda "eşiği geçemedin" yanlış mesajı çıkabilir. |
| 24 | Ödül bildirimi (Notification) | KISMİ | `complete/route.ts:185-194` | Transaction dışında, try/catch'siz: başarısız olursa puan yazılmış ama istemci 500 "Oyun tamamlanamadı" görür (Bulgu 9). |
| 25 | Yeni başarım tespiti + bildirimi | ÇALIŞIYOR | `complete/route.ts:89-94,196-215` | Her tamamlamada `computeAchievementStats` iki kez çalışıyor (performans). |
| 26 | Tüm zamanlar liderliği (ilk 10 + benim sıram) | KISMİ | `game-leaderboard.tsx:24-113`, `leaderboard/route.ts:47-84` | Skor tavanı 8 → kazananların hepsi 8'de eşit, eşitlik bozucu yok, sıra keyfi (Bulgu 4). `take: 100` → "toplam oyuncu" en fazla 100, 100. sıradan sonra "me" kayboluyor. Hata durumunda "Henüz skor yok" yanlış mesajı. |
| 27 | Haftalık turnuva (geri sayım, ödül havuzu 500/300/150, canlı sıra) | KISMİ | `game-tournament.tsx:53-182`, `tournament/route.ts:28-120`, `lib/tournament-core.ts:13` | Eşitlikte ödül sırası belirsiz (Bulgu 4); açık temada metin görünmüyor (Bulgu 10); skor "8⭐" ile yıldız olarak etiketleniyor. |
| 28 | Geçen hafta ödülünü talep et | KISMİ | `game-tournament.tsx:84-97,123-140`, `tournament/route.ts:128-200` | Atomik claim doğru; ama GET ile POST arasında eşitlik sırası değişirse "2. oldun" denip "ödül kazanmadın" dönebilir. Toast'lar `admin-toast` ile "Basarili:"/"Dikkat:" (Türkçe karaktersiz) önekli. |
| 29 | Yükleniyor durumları (başlatma/gönderme spinner, liderlik/turnuva yükleniyor) | ÇALIŞIYOR | `game-shell.tsx:147-162`, `game-leaderboard.tsx:47-53`, `game-tournament.tsx:99-105` | |
| 30 | Hata durumları | KISMİ | `use-mini-game.ts:74-77,126-128`, `game-leaderboard.tsx:40`, `game-tournament.tsx:69,106` | Başlatma hatası toast; liderlik hatası boş tablo gibi; turnuva hatası tamamen gizleniyor (`return null`). |
| 31 | Ses efektleri (Web Audio) | KISMİ | `lib/game-sounds.ts:10-31,58-62` | Ayrı ses aç/kapa yok; yalnız "animasyonları azalt" açıkken susuyor. `sfxCollectStar(index)` parametresi kullanılmıyor (yorumdaki "pitch yükselir" sahte). |
| 32 | Dokunsal geri bildirim (`navigator.vibrate`) | ÇALIŞIYOR | `lib/game-sounds.ts:155-164` | iOS Safari desteklemiyor (platform sınırı). |
| 33 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232`, `fx-layer.tsx:44-47`, `game-shell.tsx:13-16` | framer dönüşümleri OS tercihine uyuyor; konfeti/FX/ses yalnız uygulama sınıfına bakıyor. |
| 34 | Kart erişilebilirliği (etiket, durum duyurusu) | EKSİK | `memory-match-game.tsx:160-184` | `aria-label`, `aria-pressed`, `aria-live` yok; ekran okuyucu "beyaz soru işareti süsü" okur. |
| 35 | Ana menü/hub entegrasyonu ("bugün oynandı" rozeti) | KISMİ | `games-hub.tsx:47-52,95-96`, `status/route.ts:32-35` | Yalnız `completed` sayılıyor; kaybedilen oyun hub'da "oynanmadı" görünüyor ve tekrar oynamaya davet ediyor (Bulgu 2 ile bağlantılı). |
| 36 | Uluslararasılaştırma | EKSİK | `memory-match-game.tsx:144,147,189`, `lib/minigame-copy.ts:138-145` | Uygulamada `messages/en.json` var, oyun metinleri sabit Türkçe. |
| 37 | Hamle/süreye dayalı performans skoru (yıldız, kişisel rekor) | EKSİK | `complete/route.ts:15-22,102` | Açıklama "en az hamlede" diyor ama hamle ne sunucuya gidiyor ne saklanıyor. |
| 38 | Ses aç/kapa, duraklat, çıkış onayı | EKSİK | — | Oyun içinde hiçbir kontrol yok. |

Toplam: 38 özellik — 16 ÇALIŞIYOR, 16 KISMİ, 2 BOZUK, 0 SAHTE (yalnız `sfxCollectStar` pitch yorumu yanıltıcı), 4 EKSİK.

---

## Bulgular

### 1. "Günde 1 hak" sayfa yenilenerek delinebiliyor — sınırsız deneme
- **Önem:** yüksek · **Kategori:** güvenlik/ekonomi bütünlüğü · **Efor:** M
- **Kanıt:** `app/api/customer/games/[game]/start/route.ts:69-73` (aktif oturum aynen geri verilir), `components/customer/games/memory-match-game.tsx:61-71` (her `playing` girişinde `buildDeck()` yeni deste), `lib/use-mini-game.ts:69-72`.
- **Sorun:** Oturum sunucuda `active` iken kullanıcı oyunu kaybetmek üzereyse (ör. 27. hamlede 4 çift) sayfayı yenileyip "Kartları Çevir"e basınca aynı oturum geri gelir ve hamle sayacı sıfır, deste yeni olarak baştan başlar. Kaybetme durumu yalnızca 28. hamle bittiğinde sunucuya yazıldığı için kullanıcı her zaman kazanana kadar tekrar deneyebilir. Bu, 150 puanlık ödülü pratikte garanti hâle getirir ve "günde 1 hak" vaadini boşa düşürür. Aynı desen generic API'yi kullanan tüm oyunlar için geçerli.
- **Öneri:** Oturuma oyun durumunu sunucuda bağlayın: `start` deste tohumunu (`seed`) üretip `MiniGameSession`'a yazsın (yeni alan `seed`, `attempt`, `lastMoveAt`); aynı gün aktif oturuma yeniden girişte aynı tohum döndürülsün ve istemci önceki hamle durumunu (`/state` uç noktası veya hamle günlüğü) geri yüklesin. Alternatif olarak, aktif oturum "terk edilmiş" sayılsın: ikinci `start` çağrısında oturum `failed` olarak kapatılsın (kullanıcıya "Yarım bıraktığın oyun kayıp sayıldı" uyarısıyla). Ürün kararı: yeniden açma = devam et, sıfırdan değil.

### 2. Kayıp sonrası akış bozuk: hub ve start "oynayabilirsin" diyor, oyun sonunda 409 dönüyor
- **Önem:** yüksek · **Kategori:** işlevsellik/hata · **Efor:** S
- **Kanıt:** `start/route.ts:57` yalnız `existing.status === 'completed'` için kilitliyor; `failed` oturum `canPlay: true` ile `sessionId` döndürüyor (`:69-73`). `complete/route.ts:73` yalnız `completed`'ı reddediyor, `:98-108` `status: 'active'` şartlı `updateMany` 0 satır güncelliyor → `:177-181` 409 "Oyun zaten tamamlandı". `status/route.ts:33` ve `games-hub.tsx:95-96` yalnız `completed`'ı "oynandı" sayıyor.
- **Sorun:** 28 hamlede 6'dan az çift bulan kullanıcının oturumu `failed` olur. Hub'da oyun hâlâ "oynanmadı" görünür; kullanıcı girer, tüm oyunu oynar, sonunda kırmızı hata toast'ı ve `use-mini-game.ts:126-128` fallback'iyle istemcinin kendi `won` değerine göre "Tüm Çiftler Bulundu! 🏆" başlığı + "Ödül için 6 skor gerekiyordu" çelişkisi görür. Bu, ödül veren ürünlerde güveni en hızlı kıran türden bir hata.
- **Öneri:** `start`'ta kilit koşulunu `status !== 'active'` yapın (veya `['completed','failed'].includes`), yanıtta önceki sonucu (`status`, `score`, `rewardPoints`) dönün; `status` uç noktası `playedToday` listesine `failed`'ı da katsın (ayrıca `outcome` alanıyla "kazandı/kaybetti" ayrımı). İstemcide `alreadyPlayed` ekranı bugünkü sonucu ("Bugün 4/8 çift buldun") göstersin. `complete` 409'u ayrı bir durum koduyla (`ALREADY_FINISHED`) dönsün ve istemci bunu hata değil kilit ekranı olarak işlesin.

### 3. Ödül tamamen istemci beyanına dayalı; doğrulama yalnız "≤8 ve ≥8 sn"
- **Önem:** yüksek · **Kategori:** güvenlik/ekonomi · **Efor:** L
- **Kanıt:** `complete/route.ts:15-22` (score, durationSec, won istemciden), `:61` clamp, `:81-87` yalnız süre kontrolü; `lib/minigame-config.ts:220-224` (`maxScore: 8`, `rewardThreshold: 6`, `minDurationSec: 8`). `lib/points-caps.ts` yalnız geri bildirim puanlarını sınırlıyor (`:13,57`); oyun tamamlama bu sınırı çağırmıyor.
- **Sorun:** Oturum açmış herhangi bir müşteri `start` sonrası 8 sn bekleyip `{score:8, durationSec:9, won:true}` POST ederek oyunu oynamadan ödülü alır; tarayıcı konsolundan React state'te kart yüzleri de okunabilir. 21 generic oyun için betikle günde ~3.150 puan basılabilir. `points_credited` olayı (`:162-171`) hız dedektörüne görünürlük sağlıyor ama engellemiyor (dedektörün oyun kategorisini nasıl işlediği doğrulanmadı).
- **Öneri:** Hafıza oyunu sunucuda doğrulanmaya çok uygun: `start` desteyi (veya tohumu) sunucuda üretip yalnız kart sayısını istemciye versin; her çevirme `POST /flip {sessionId, index}` ile sunucudan yüz alsın (Redis'te oturum durumu, 1 saat TTL) ya da istemci hamle günlüğünü (`[[i,j],...]` + zaman damgaları) `complete`'e gönderip sunucu tohumla yeniden oynatsın. Skor ve hamle sayısını sunucu hesaplasın, insan dışı hızlar (ör. 8 hamlede 8 çift, hamleler arası <150 ms) reddedilsin. Ekonomi tarafında oyun puanlarına günlük tavan (`capGamePoints`) eklensin.

### 4. Skor modeli liderliği ve haftalık turnuvayı anlamsızlaştırıyor (herkes 8'de eşit, ödül keyfi)
- **Önem:** yüksek · **Kategori:** ürün/veri doğruluğu · **Efor:** M
- **Kanıt:** Skor = bulunan çift (`memory-match-game.tsx:92,107`), tavan 8 (`minigame-config.ts:220`). Liderlik `_max.starsCollected desc` ile sıralıyor, eşitlik bozucu yok (`leaderboard/route.ts:47-53`); turnuva aynı (`tournament/route.ts:29-35`) ve ilk 3'e 500/300/150 puan veriyor (`tournament-core.ts:13`). Hamle sayısı ve süre hiçbir yerde saklanmıyor (`schema.prisma:493-503`).
- **Sorun:** Oyunu kazanan herkes 8 skorla eşitlenir; Postgres eşitlerin sırasını garanti etmez, dolayısıyla haftalık 950 puanlık ödül havuzu fiilen rastgele dağıtılır ve GET'te "Geçen hafta 2. oldun" gösterilen kullanıcı POST'ta farklı sıraya düşüp "Geçen hafta ödül kazanmadın" alabilir (`tournament/route.ts:84-97` ile `:145-153` ayrı sorgular). Açıklamadaki "en az hamlede" hedefi de ödüllendirilmiyor.
- **Öneri:** Hafıza oyunu için kompozit skor tanımlayın: `score = pairs*1000 - moves*20 - seconds` gibi (veya `pairs` + `moves` + `durationMs` ayrı alanlar). `MiniGameSession`'a `moves Int?`, `durationMs Int?` ekleyin; liderlik `ORDER BY best desc, moves asc, durationMs asc, completedAt asc` ile deterministik olsun. Turnuva ödülü için hafta kapandığında sırayı bir kez dondurun (cron ile `TournamentResult` tablosu) ve claim bu dondurulmuş sıradan okusun. Eşik/ödül mantığı `pairs`'e, sıralama kompozit skora bağlansın.

### 5. setState updater'ı içinde yan etki: skor mutasyonu, ses, efekt, zamanlayıcı
- **Önem:** orta · **Kategori:** mimari/doğruluk · **Efor:** S
- **Kanıt:** `memory-match-game.tsx:87-122` — `setCards((prev) => { scoreRef.current += 1; setPairsFound(...); sfxCollectStar(); fxRef.current?.burst(...); setTimeout(...); ... })`. `next.config` `reactStrictMode: true` (satır 258).
- **Sorun:** React updater fonksiyonlarının saf olmasını bekler; StrictMode'da geliştirmede iki kez çağrılır → dev'de her eşleşme çift sayılır (1 eşleşmede "2/8"), sesler/efektler ikilenir, eşleşmeme zamanlayıcısı iki kez kurulur. Üretimde tıklama olayları senkron şeritte işlendiği için pratik risk düşük, ama gelecekteki eşzamanlı render değişikliklerinde (ör. `startTransition`) skor bozulabilir; ayrıca geliştirmede yanlış davranış testleri yanıltır.
- **Öneri:** Karşılaştırmayı updater dışında, `cardsRef` (veya `flip` içinde mevcut `cards` ile) yapın: önce saf bir reducer (`useReducer` ile `FLIP`, `RESOLVE_MATCH`, `RESOLVE_MISS`, `RESET` eylemleri), yan etkiler (ses, FX, zamanlayıcı, `endGame`) eylem sonrası `useEffect` veya olay işleyicisinde. Zamanlayıcıları ref'te tutup unmount'ta temizleyin (şu an `setTimeout`'lar temizlenmiyor).

### 6. İstemci admin override'ını görmüyor: eşik, başlık, renk, açıklama statik
- **Önem:** orta · **Kategori:** mimari/veri tutarlılığı · **Efor:** S
- **Kanıt:** `memory-match-game.tsx:13` statik `getMiniGame('memory-match')`; `:116` ve `:189` `DEF.rewardThreshold`; `page.tsx:18-19` sabit başlık. Sunucu ise `getEffectiveMiniGame` kullanıyor (`complete/route.ts:35`, `lib/minigame-config-effective.ts:96-103`). `start` yanıtındaki `config` (`start/route.ts:96-101`) `useMiniGame` tarafından tutuluyor (`use-mini-game.ts:70`) ama bileşen hiç okumuyor.
- **Sorun:** Admin eşiği 7'ye çıkarırsa istemci 6 çiftte "kazandın" gönderir, sunucu 0 puanla `completed` yazar; ekranda kupa + "Ödül için 6 skor gerekiyordu" (yanlış eşik) görünür. Admin oyunu pasifleştirirse sayfa yine açılır ve yalnız başlatırken 403 toast'ı alınır.
- **Öneri:** Sayfa sunucu bileşeninde `getEffectiveMiniGame('memory-match')` çağırıp `enabled=false` ise "Bu oyun şu an kapalı" boş durumunu render etsin, değilse effective tanımı prop olarak bileşene geçsin; eşik/başlık/renk tek kaynaktan gelsin. `won` kararını istemciden kaldırın; sunucu `pairs >= threshold` ile kendisi belirlesin.

### 7. Kart çevirme animasyonu gerçek iki yüzlü kart değil; konuma göre gecikme her çevirmede uygulanıyor
- **Önem:** orta · **Kategori:** görsel/motion · **Efor:** S
- **Kanıt:** `memory-match-game.tsx:165-167` — `transition={{ delay: Math.min(i, 10) * 0.02, ... }}` hem giriş hem `rotateY` değişimine uygulanır; `:181-183` yüz içeriği `show` değişir değişmez anında değişiyor, `backfaceVisibility` yok.
- **Sorun:** 10. ve sonraki kartlar her çevirmede 200 ms gecikmeyle dönüyor; bu sürede emoji ayna görüntüsüyle (span'e 180° karşı dönüş uygulanmış) duruyor, ardından kart 90°'den geçerken içerik kenardan görünüyor. Sonuç: "kart çevirme" hissi yerine tutarsız bir sallanma; eşleşmeme 720 ms'lik penceresinin bir kısmı da gecikmeye gidiyor.
- **Öneri:** Klasik iki yüzlü kart yapısı: dış `Motion.div` `rotateY` animasyonu, içinde `absolute inset-0` iki yüz (`backface-visibility: hidden`, arka yüz `rotateY(180deg)`), yüz içeriği DOM'da her zaman var ama arka yüzde gizli (hile kaygısı Bulgu 3'teki sunucu çözümüyle giderilir). Giriş kademelenmesini `variants` + `staggerChildren` ile yalnız ilk montajda uygulayın, çevirme geçişi gecikmesiz (`duration ~0.35`, `ease: [0.2,0.8,0.2,1]`) olsun.

### 8. Hamle limiti eşleşmelerde aşılabiliyor ("29/28 hamle")
- **Önem:** orta · **Kategori:** işlevsellik · **Efor:** S
- **Kanıt:** `memory-match-game.tsx:115-117` limit kontrolü yalnız eşleşmeme dalında; eşleşme dalında (`:91-109`) kontrol yok; `:147` sayaç `moves/MAX_MOVES`.
- **Sorun:** 28. hamle eşleşmeyle biterse oyun devam eder; ardışık eşleşmelerle sayaç 28'i geçer. Kural ve gösterge tutarsız.
- **Öneri:** Hamle çözümlemesi sonrası tek bir `resolveTurn()` içinde "tüm çiftler bulundu mu → kazandı; değilse hamle ≥ limit mi → bitti" sırasıyla kontrol edin. Ürün olarak "kalan hamle" geri sayımı (28 → 0) ve son 5 hamlede uyarı rengi daha anlaşılır.

### 9. Bildirim kaydı transaction dışında ve korumasız: puan yazılır ama kullanıcı hata görür
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `complete/route.ts:185-194` `await prisma.notification.create` try/catch'siz; hata `:230-237` genel catch'e düşer → 500 "Oyun tamamlanamadı". Transaction `:97-175` bu noktada çoktan commit edilmiş.
- **Sorun:** Bildirim tablosunda geçici bir hata (bağlantı, Neon soğuk başlangıç) puan verilmişken kullanıcıya "kaydedilemedi" hatası gösterir; tekrar denemesi 409 döner. Kullanıcı ödülü kaybettiğini düşünür.
- **Öneri:** Bildirimi transaction içine alın ya da `after()` ile yanıttan sonra, hatası yutularak çalıştırın (başarım bildirimi `:198-215` zaten try/catch'li). Yanıtı ödül commit'ine bağlayın.

### 10. Açık temada haftalık turnuva tablosu okunmuyor (koyu zemin üstüne koyu metin)
- **Önem:** orta · **Kategori:** erişilebilirlik/görsel · **Efor:** S
- **Kanıt:** `game-shell.tsx:97-104` sabit koyu arka plan (`rgba(6,4,16,0.98)`), metin rengi tanımlamıyor; `game-tournament.tsx:156-167` satır adları/skorlar renk sınıfı içermiyor (gövde `--foreground`'u miras alır); açık temada `--foreground: 240 10% 10%` (`app/globals.css:13`); `text-muted-foreground` (`240 5% 45%`) ve `text-yellow-600` de koyu zeminde düşük kontrast. Tema varsayılanı `system` (`components/providers.tsx:225`).
- **Sorun:** Açık temadaki kullanıcı turnuva sıralamasında isimleri, skorları ve "Geçen hafta X. oldun!" metnini neredeyse göremez. (Ekran görüntüsüyle doğrulanmadı; kod okumasına göre deterministik.)
- **Öneri:** `GameShell` kökünde `text-white` ve `color-scheme: dark` tanımlayın ya da kabuğu `data-theme="dark"` alt ağacı yapın; `GameTournament` ve `GameLeaderboard`'u aynı "oyun teması" token'larıyla (`--game-fg`, `--game-muted`) yazın, shadcn tema token'larına bağımlılığı kaldırın.

### 11. Kartlar ekran okuyucu ve klavye için anlamsız
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `memory-match-game.tsx:160-184` — `aria-label`, `aria-pressed`, rol/konum bilgisi yok; içerik `'❔'` ya da çıplak emoji; eşleşme/eşleşmeme duyurusu için `aria-live` bölge yok; `:96-101` FX konumu `e.clientX` ile hesaplanıyor (klavyede 0).
- **Sorun:** Ekran okuyucu kullanıcısı "beyaz soru işareti süsü, düğme" x16 duyar; hangi kartı açtığını ve sonucun ne olduğunu bilemez. Klavye ile oynanabilir ama efektler arena dışında patlar.
- **Öneri:** Her karta `aria-label={show ? \`Kart ${i+1}: ${faceName}\` : \`Kart ${i+1}, kapalı\`}` (emoji yerine okunur ad sözlüğü: "yıldız", "roket"…), ızgaraya `role="grid"` + ok tuşu gezinmesi (roving tabindex), görünmez `aria-live="polite"` bölgede "Eşleşme! 3/8" / "Eşleşmedi". FX konumunu olay koordinatı yerine `event.currentTarget.getBoundingClientRect()` merkezinden alın. Odak halkası için `focus-visible:ring-2` ekleyin.

### 12. Hareket/ses tercihleri dağınık: OS reduced-motion konfetiye ulaşmıyor, ses ayrı kapatılamıyor
- **Önem:** düşük · **Kategori:** erişilebilirlik/UX · **Efor:** S
- **Kanıt:** `game-shell.tsx:13-16`, `fx-layer.tsx:44-47`, `lib/game-sounds.ts:10-13` yalnız `html.reduce-animations` sınıfına bakıyor; `prefers-reduced-motion` kontrolü yok. Ses kontrolü UI'da yok; ses yalnız "animasyonları azalt" açıkken susuyor.
- **Sorun:** OS'ta hareket azaltmayı açmış kullanıcı yine canvas-confetti ve parçacık patlamaları görür; toplu taşımada oynayan kullanıcı sesi kapatamaz ya da sesi kapatmak için animasyonları da kapatmak zorunda kalır.
- **Öneri:** Ortak `useMotionPrefs()` (sınıf **veya** `matchMedia('(prefers-reduced-motion: reduce)')`) ve ayrı `useSoundPref()` (localStorage + ayarlar sayfası); `GameShell` başlığına ses aç/kapa ikonu.

### 13. FxLayer rAF döngüsü parçacık yokken de sürekli çalışıyor
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `fx-layer.tsx:79-160` her karede `clearRect` ve `requestAnimationFrame(loop)`; boş liste için durma yok; ömür kare başına azaltılıyor (`p.life -= 1`).
- **Sorun:** Oyun boyunca (dakikalarca) mobilde gereksiz GPU/batarya kullanımı; 120 Hz ekranlarda efektler iki kat hızlı oynar.
- **Öneri:** Parçacık eklendiğinde döngüyü başlat, liste boşalınca durdur; ömrü `dt` (ms) bazlı hesaplayın.

### 14. Bitiş anı kesiliyor ve sonuç ekranı performans bilgisi vermiyor
- **Önem:** düşük · **Kategori:** UX · **Efor:** M
- **Kanıt:** `memory-match-game.tsx:107` (500 ms sonra `finish`), `game-shell.tsx:134` (`playing` false olunca ızgara anında kalkıyor), `:269-272` yalnız "Eşleşme: N".
- **Sorun:** Son çift bulunduğu an kutlanmadan ızgara spinner'a dönüşüyor; sonuç ekranında hamle, süre, kişisel rekor, "dünkünden iyi" gibi bir anlatı yok. Duolingo/Spotify Wrapped tarzı ödül anı kaçıyor.
- **Öneri:** Gönderim sırasında ızgarayı yerinde tutup (overlay spinner), tüm kartları sırayla "parlat" (stagger) ve sonra sonuç kartına geçin. Sonuç kartında 3 yıldız (hamleye göre), süre, kişisel en iyi ve haftalık sıradaki değişim ("+4 sıra") gösterin.

### 15. Turnuva toast'ları yönetici öneki ve Türkçe karaktersiz metinle çıkıyor
- **Önem:** düşük · **Kategori:** dil/tutarlılık · **Efor:** S
- **Kanıt:** `game-tournament.tsx:6` `import { toast } from '@/lib/admin-toast'`; `lib/admin-toast.ts` "Basarili: " / "Dikkat: " öneki ekliyor.
- **Sorun:** Müşteri "Basarili: 🏆 1. oldun — +500 puan!" görür; diğer oyun toast'ları (`use-mini-game.ts:4`) düz `sonner` kullanıyor.
- **Öneri:** Müşteri bileşenlerinde düz `sonner` (veya müşteri toast sarmalayıcısı) kullanın; admin-toast'ı lint kuralıyla `components/customer/**` için yasaklayın.

### 16. Sayfa açılışında "bugün oynandı mı" bilgisi yok; sıfırlama saati UTC
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `use-mini-game.ts:46-48` başlangıç `idle`; kilit yalnız `start` yanıtında (`:64-68`); `game-shell.tsx:323` "Her gün 00:00 (UTC) sıfırlanır"; `start/route.ts:10-12` UTC gün anahtarı.
- **Sorun:** Kullanıcı CTA'ya basıp beklemeden kilit ekranını göremiyor; "00:00 UTC" Türkiye'de 03:00 demek ve kullanıcının hesaplaması gerekiyor.
- **Öneri:** Sayfa sunucu bileşeninde bugünkü oturumu okuyup başlangıç fazını (`idle`/`locked`/`resume`) prop olarak verin; kilit ekranında yerel saate göre geri sayım ("Yeni hak 5 sa 12 dk sonra").

---

## Eksik özellikler (kıyas ürünlerle)

1. **Hamle/süreye dayalı yıldız derecelendirmesi ve kişisel rekor** (Duolingo "mükemmel ders", casual oyun standartları): 3 yıldız = ≤12 hamle, 2 = ≤18, 1 = bitirdi; profilde en iyi hamle/süre. Şu an "en az hamlede" yalnız metin.
2. **Zorluk/tema çeşitliliği ve marka bağlantısı**: her gün aynı 8 emoji. Günlük döngüsel tema (ör. favori mekanların logoları, kategori ikonları, kazanılan rozet maskotları) Qratex'in geri bildirim/ödül evrenine bağ kurar; Starbucks Rewards'ın "oyunlaştırılmış kampanyalar"ı gibi.
3. **Ses aç/kapa, duraklat ve "çık" onayı** (Revolut/Monzo mobil his): tek dokunuşla ses kontrolü, sekme gizlenince otomatik duraklatma (`visibilitychange`).
4. **Sonuç paylaşımı** (Spotify Wrapped, Wordle): "Hafıza Eşleştir · 14 hamle · 0:42 ⭐⭐⭐" kartı, paylaş butonu (Web Share API).
5. **Günlük meydan okuma tohumu** (Wordle tarzı): herkese aynı gün aynı deste → turnuva adil karşılaştırma ve sosyal konuşma yaratır; Bulgu 3'teki sunucu tohumu ile doğal birleşir.
6. **Oyun içi ilerleme göstergesi ve sonraki oyuna yönlendirme**: sonuç ekranında "Bugün 5/22 oyun · sıradaki: Kombo Yıldız" ve hub'a dönüş CTA'sı; şu an sonuç ekranında hiçbir eylem butonu yok (`game-shell.tsx:222-305`).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60-90 saniyelik, adil ve ölçülebilir bir günlük zihin egzersizi. Kullanıcı sayfaya geldiğinde ne olacağını hemen bilir (bugün oynadı mı, kaç saat kaldı, haftalık sırası ne), oyun sırasında akıcı ve dokunsal bir kart hissi alır, bitişte performansını (yıldız, hamle, süre, kişisel rekor, haftalık sıra değişimi) anlatan kısa bir kutlama görür.

**Yerleşim (mobil öncelikli):**
- Üst şerit (sticky, `top: env(safe-area-inset-top)`): geri, oyun adı, ses ikonu, kalan hamle halkası ve kronometre.
- Orta: 4×4 ızgara, kart başına ≥64 px, iki yüzlü kartlar; arka yüzde Qratex monogramı, ön yüzde günün tema ikonu (emoji yerine SVG seti: platformlar arası tutarlılık, `🛡️` gibi varyasyon seçici sorunları ortadan kalkar).
- Alt: "Eşleşme 5/8" ilerleme çubuğu + son hamle geri bildirimi (`aria-live`).
- Lobi: tek kart içinde sekmeli tablo (Bu hafta / Tüm zamanlar / Arkadaşlar), iki ayrı liste yerine; turnuva geri sayımı ve ödül havuzu sekme başlığında.
- Sonuç: yerinde kalan ızgaranın üstüne kayan sonuç kartı (yıldızlar, istatistikler, sıra değişimi, paylaş, "Sıradaki oyun").

**Motion / 3B (ölçülü):**
- Kart çevirme: 350 ms, gecikmesiz, `backface-visibility` ile gerçek iki yüz; eşleşmede 1.06 ölçek "nefes" + kısa ışıltı (mevcut FxLayer burst'ü küçük tutun, konfeti yalnız oyun sonu).
- Seri eşleşme (ardışık 2+): kombo etiketi `floatText` ile ("x2"), artan pitch (şu an kullanılmayan `index` parametresi gerçekten kullanılsın).
- Bitiş: kartların sırayla parlaması (stagger 30 ms) → sonuç kartı yay animasyonu. 3B sahne gereksiz; three.js eklemek bu oyunun ölçeğine aşırı olur.
- Tüm efektler tek `useMotionPrefs()` üzerinden OS ve uygulama tercihine uyar; reduced-motion'da çevirme anlık geçiş + renk değişimi.

**Veri / API değişiklikleri:**
- `MiniGameSession`: `seed String?`, `moves Int?`, `durationMs Int?`, `outcome String?` (won/lost/abandoned). Liderlik ve turnuva için `@@index([gameType, status, completedAt])`.
- `POST /api/customer/games/memory-match/start`: tohum ve (devam ediliyorsa) mevcut durumu döndürür; ikinci başlatma yarım oturumu "devam" eder, sıfırlamaz.
- `POST /api/customer/games/memory-match/complete`: istemciden yalnız hamle günlüğü; sunucu tohumla yeniden oynatır, `pairs/moves/durationMs`'i kendisi hesaplar, `won`'u kendisi belirler. Genel desen: registry'ye `validator?: (seed, log) => Result` alanı eklenip oyun başına isteğe bağlı sunucu doğrulaması.
- Liderlik/turnuva sorgusu: kompozit sıralama + deterministik eşitlik bozucu; turnuva sonucu hafta kapanışında dondurulup `TournamentResult`'a yazılır, claim oradan okur.
- Sayfa sunucu bileşeni: `getEffectiveMiniGame` + bugünkü oturum durumu → istemciye başlangıç durumu olarak verilir (ilk boyamada doğru ekran, ekstra istek yok).
- Ekonomi: oyun puanlarına günlük toplam tavan (`lib/points-caps.ts`'e `capGamePoints`).

---

## Çakışmalar / birleştirme önerisi

- **21 neredeyse özdeş `page.tsx`**: `app/customer/games/*/page.tsx` dosyalarının hepsi 24 satır ve yalnız bileşen/başlık farkı var (ör. `memory-match` ile `combo-tap` diff'i 5 satır). Bunlar tek bir `app/customer/games/[game]/page.tsx` dinamik rotasında birleştirilmeli: registry'ye `component: () => import(...)` eşlemesi, `generateMetadata` effective başlıktan, `enabled=false` → `notFound()` ya da "kapalı" ekranı. Bu, Bulgu 6'yı tüm oyunlar için tek yerde çözer ve yeni oyun eklemeyi "registry + bileşen" ikilisine indirir. URL'ler aynı kalır (`/customer/games/memory-match`), dış bağlantı kırılmaz. (Pacman kendi API'siyle ayrık; dinamik rotada özel durum olarak ele alınabilir.)
- **Lobi içinde iki ayrı liderlik** (`GameTournament` + `GameLeaderboard`, `game-shell.tsx:210-217`): aynı veri kaynağını (MiniGameSession groupBy) iki farklı pencereyle iki kez çekiyor ve alt alta iki tablo gösteriyor. Tek sekmeli `GameBoards` bileşeninde birleştirilmeli; uç noktalar da `GET /api/customer/games/[game]/boards?window=week|all` olarak tekleştirilebilir.
- **Hub ile durum tutarlılığı**: `/customer/games` (hub) ve bu sayfa "bugün oynandı" bilgisini farklı yollardan alıyor (hub `status`, sayfa `start` yan etkisi). Ortak `getTodayGameState(userId)` yardımcısı her iki yerde kullanılmalı.
- Sayfa kaldırılmamalı: hub'daki 22 oyundan bilişsel (hafıza) türdeki tek oyun; refleks oyunlarından (combo-tap, speed-order) ayrışıyor ve günlük tohum + adil skor ile turnuvaya en uygun aday.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunurdur. Hiçbir komut, betik ya da DB sorgusu çalıştırılmadı. Okunan dosyalar: `app/customer/games/memory-match/page.tsx`, `components/customer/games/memory-match-game.tsx`, `lib/use-mini-game.ts`, `components/customer/games/game-shell.tsx`, `components/customer/games/games-hub.tsx`, `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/tournament-core.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/points-caps.ts`, `lib/points-velocity.ts`, `lib/api-http.ts`, `proxy.ts`.

### 1. Günde 1 hak kuralı sayfa yenilemeyle aşılıyor: **DOĞRULANDI (Yüksek)**
- `start/route.ts:69-73`: oturum `completed` değilse aynı `sessionId` ile `canPlay:true` dönüyor. Sunucu tarafında deste, hamle sayısı ya da bulunan çift tutulmuyor.
- `memory-match-game.tsx:61-71`: `playing` true olunca `buildDeck()` yeni karışık deste kuruyor; `movesRef`, `scoreRef` sıfırlanıyor.
- `complete/route.ts:81-83`: süre kontrolü `startedAt`e göre yapılıyor. Yenilemede `startedAt` değişmediği için süre hep büyüyor, yani `tooFast` engeli de devreye girmiyor.
- **Yeniden üretim:** Oyunu başlat. 20. hamlede 3 çift bulunmuşsa (28 hamlede 6 çift yetişmeyecekse) F5'e bas, "Başla"ya tıkla. Aynı oturumla sıfır hamle ve yeni desteyle başlarsın. 6+ çift yapana kadar sınırsız tekrar edebilirsin; 150 puan + 75 XP pratikte garanti. Aynı akış `useMiniGame` kullanan tüm generic oyunlar için geçerli.

### 2. failed oturumda yeniden oynama 409 ile bitiyor: **DOĞRULANDI (Orta, UX ve veri tutarlılığı)**
- `complete/route.ts:101`: kaybedilen oyun `status:'failed'` olarak yazılıyor.
- `status/route.ts:33`: hub yalnız `completed` olanları "bugün oynandı" sayıyor, dolayısıyla kaybedilen oyun hub'da oynanmamış görünüyor.
- `start/route.ts:57,69-73`: yalnız `completed` engelleniyor; `failed` oturum için `canPlay:true` ve aynı `sessionId` dönüyor.
- `complete/route.ts:98-108`: `updateMany` yalnız `status:'active'` olan satırı güncelliyor. Satır `failed` olduğu için 0 satır etkileniyor ve `177-181` 409 "Oyun zaten tamamlandı" dönüyor. (`73`'teki erken 409 yalnız `completed` içindir; buradaki 409 transaction'dan geliyor.)
- `use-mini-game.ts:126-128`: istemci hatayı yakalıyor ama sonucu kendi `won` değeriyle yazıyor. `game-shell.tsx` de `result.won` true ise kupa ve "kazandın" ekranını çiziyor; aynı anda hata toast'ı ve "ödül yok" görünüyor.
- **Yeniden üretim:** 28 hamlede 6'dan az çift bul (oturum `failed` olur). Sayfayı yenile, "Başla"ya bas; oyun açılır. Bu kez 8 çifti bul. Hata toast'ı "Oyun zaten tamamlandı" ile birlikte kupa ekranı çıkar, puan verilmez. Kullanıcı tüm oyunu boşa oynamış olur. Ekonomik zarar yok (puan basılmıyor), ama kural da UI da tutarsız.

### 3. Ödül istemci beyanına dayalı, betikle puan basılabilir: **DOĞRULANDI (Kritik)**
- `complete/route.ts:15-22`: `score`, `durationSec` ve `won` doğrudan istemciden geliyor. `61` yalnız skoru `maxScore`'a kırpıyor. `86-87`: `eligible = won && !tooFast`, ödül de eşiğe göre veriliyor (`minigame-config-effective.ts:107-115`).
- Oyun durumuna dair sunucu kanıtı yok: tohum, hamle günlüğü ya da yeniden oynatma bulunmuyor. Tek sunucu engeli `minDurationSec` (memory-match için 8 sn, `minigame-config.ts:224`).
- `proxy.ts` API'ler için CSRF ya da imza denetimi yapmıyor. Oturum çerezi taşıyan aynı-origin bir `fetch` (tarayıcı konsolu yeterli) isteği geçiriyor.
- `points-caps.ts` yalnız `category:'feedback'` için tavan uyguluyor (`13-14, 57-65`); oyun puanının tavanı yok. `points-velocity.ts` (eşik 500/24 saat) yalnız liderlikte işaretleme yapıyor, krediyi engellemiyor.
- **Yeniden üretim:** Giriş yapmış müşteri olarak konsolda `POST /api/customer/games/memory-match/start` çağır → `sessionId` al. 9 sn bekle, ardından `POST .../complete` ile `{sessionId, score:8, durationSec:9, won:true}` gönder → 150 puan + 75 XP. Aynı işlem `MINI_GAMES` registry'sindeki 20 generic oyunun her birine uygulanabilir.
- **Düzeltme:** İddiadaki "21 generic oyun, ~3150 puan" sayısı küçük bir hata içeriyor. `MINI_GAMES` listesinde 20 generic oyun var ve toplam ödül yaklaşık **3100 puan/gün** (pacman ayrı API'den ek 150). Bulgunun kendisi aynen geçerli.

### 4. Turnuva ödülü eşitlikte keyfi dağıtılıyor; GET/POST sıra tutarsızlığı: **DOĞRULANDI (Yüksek; GET/POST ayrışması olası ama deterministik değil)**
- `tournament/route.ts:28-39`: `groupBy` yalnız `_max.starsCollected desc` ile sıralanıyor; ikincil sıralama anahtarı yok.
- Memory-match'te `completed` oturumların skoru 6, 7 ya da 8 olabiliyor (`memory-match-game.tsx:107,116`; `complete/route.ts:101`). İyi oynayan herkes 8'de topluyor, bulgu 3'le birlikte de 8 skoru herkese açık. Eşitlik yaygın bir durum, istisna değil.
- Postgres eşit satırların sırasını garanti etmez. 500/300/150 puan (`tournament-core.ts:13`) bu keyfi sıraya göre dağıtılıyor (`86-94`, `145-148`). `take:100` sınırı eşitlikte kimin listeye gireceğini de keyfi kılıyor.
- GET (`83-94`) ve POST (`145-153`) sıralamayı ayrı sorgularla yeniden hesaplıyor. Plan ya da paralel yürütme değişirse GET "1. oldun" deyip POST 400 "Geçen hafta ödül kazanmadın" dönebilir. Bu ihtimal kod okumasıyla mümkün görünüyor ama kesin bir tetikleyiciyle üretilemedi. Eşitlikteki keyfi dağıtım ise kesin.
- **Yeniden üretim:** Geçen hafta 5 kullanıcı memory-match'te 8 skorla bitirmiş olsun. Hangi üçünün ödül alacağını yalnız DB'nin satır sırası belirler; kalan iki kişi aynı skorla hiçbir şey alamaz.
- **Düzeltme yönü:** Eşitlik bozucu olarak önce az hamle/kısa süre (bu, veri modelinde `moves`/`durationMs` tutmayı gerektirir), ardından en erken `completedAt` kullanılmalı. Hafta kapanınca sonuç dondurulup claim o kayıttan okunmalı.

### 5. Puan yazıldıktan sonra bildirim hatası 500 döndürüyor: **DOĞRULANDI ama önem ABARTILMIŞ (Düşük-Orta)**
- `complete/route.ts:185-194`: `notification.create` transaction commit edildikten sonra ve try/catch olmadan çalışıyor. Hata dış catch'e (`230-237`) düşüyor; bağlantı hatasında 503, diğer hatalarda 500 dönüyor.
- İstemci (`use-mini-game.ts:126-128`) hata toast'ı gösteriyor ve "ödül yok" sonucu çiziyor, oysa puan zaten kredilenmiş. Kullanıcıyı yanıltan, gerçek bir tutarsızlık.
- **İddiadaki yanlış kısım:** "Tekrar denemesi 409 alır" ifadesi isabetli değil. İstemci otomatik tekrar denemiyor (`finally` içinde `sessionIdRef=null`, 130). Yenilemede `start` `completed` oturumu görüp "zaten oynadınız" ekranını gösteriyor (`start/route.ts:57-67`), 409 dönmüyor.
- Tetikleyici olarak commit'ten hemen sonraki dar pencerede geçici bir DB/pooler hatası gerekiyor. Olasılık düşük; ekonomik zarar yok, puan doğru yazılıyor. Bu yüzden Kritik/Yüksek değil.
- **Düzeltme:** Bildirimi transaction içine alın (tournament POST'ta olduğu gibi, `tournament/route.ts:172`) ya da `after()` ile best-effort yapıp hatayı yutun. Böylece commit sonrası yan etkiler yanıtı bozamaz.

### Özet
| # | İddia | Karar | Önem |
|---|---|---|---|
| 1 | Yenilemeyle sınırsız deneme | Doğrulandı | Yüksek |
| 2 | failed oturumda yeniden oynama → 409 | Doğrulandı | Orta |
| 3 | İstemci beyanlı ödül / betikle puan | Doğrulandı | Kritik |
| 4 | Turnuva eşitliği keyfi | Doğrulandı (GET/POST kısmı olası) | Yüksek |
| 5 | Bildirim hatası 500 | Doğrulandı, önem düşürüldü | Düşük-Orta |

---

## Uygulama (Dalga 2)

**Karar uygulandı: oyun EMEKLİ** (yol haritası §7.3 #18 KALDIR; `lib/games/registry` `RETIRED_GAMES`). `app/customer/games/memory-match/page.tsx` artık tek satırlık sunucu bileşeni: `permanentRedirect` ile Oyna merkezine (`/customer/games?emekli=memory-match`, mevcut sorgu parametreleri korunur — `lib/play-hub/retired.ts`). Hub bu parametreyle tek seferlik, dürüst bir "Hafıza Eşleştir artık oynanmıyor; geçmiş skorların ve puanların korunuyor" notu gösterir; halef: Eşleştir-3 (yapım aşamasında; canlıya çıkınca not ona bağlanır). Oyun kartı hub kataloğunda hiçbir koşulda yer almaz (`buildHubCatalog` emekli kimlikleri dışlar; test: `__tests__/lib/play-hub.test.ts`). Bileşen kodu ve geçmiş `MiniGameSession` verisi silinmedi (registry kuralı: geri alınabilir, arşiv).


### Özellik envanteri — yeni durum

| # | Özellik | Eski | Yeni durum |
|---|---|---|---|
| 1 | Sunucu tarafı oturum/rol kontrolü (CUSTOMER değilse `/auth/signin`) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 2 | Sayfa başlığı + açıklama (`DashboardPageHeading`) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 3 | Metadata başlığı | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 4 | Başlangıç ekranı (emoji, başlık, açıklama, ipucu, CTA "🃏 Kartları Çevir") | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 5 | Nabız halkalı CTA mikro-etkileşimi | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 6 | Oyun başlatma (`POST /api/customer/games/memory-match/start`) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 7 | Günde 1 hak kuralı | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 8 | Kayıp sonrası yeniden giriş | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 9 | Deste üretimi (8 emoji × 2, Fisher-Yates karıştırma) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 10 | Kart çevirme etkileşimi + kilit (`lockRef`) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 11 | 3B çevirme animasyonu | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 12 | Eşleşme efekti (burst + halka + konfeti + ses + titreşim) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 13 | Eşleşmeme: 720 ms sonra kapanma + ses + titreşim | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 14 | Çift sayacı "x/8 çift" | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 15 | Hamle sayacı "x/28 hamle" ve hamle limiti | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 16 | Kazanma (tüm çiftler) → `finish(score, true)` | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 17 | Hamle bitince eşik kontrolü (6+ çift = "kazandı") | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 18 | Sonucun sunucuda doğrulanması + ödül (150 puan / 75 XP) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 19 | Günlük seri bonusu (+10 XP, her 3. gün +30) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 20 | "Bugün oynandı" kilit ekranı | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 21 | Sonuç ekranı (kupa/kurukafa, varyant başlık, skor, ödül kartı) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 22 | Konfeti kutlaması (ödülde) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 23 | Ödül/seri/başarım toast'ları | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 24 | Ödül bildirimi (Notification) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 25 | Yeni başarım tespiti + bildirimi | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 26 | Tüm zamanlar liderliği (ilk 10 + benim sıram) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 27 | Haftalık turnuva (geri sayım, ödül havuzu 500/300/150, canlı sıra) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 28 | Geçen hafta ödülünü talep et | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 29 | Yükleniyor durumları (başlatma/gönderme spinner, liderlik/turnuva yükleniyor) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 30 | Hata durumları | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 31 | Ses efektleri (Web Audio) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 32 | Dokunsal geri bildirim (`navigator.vibrate`) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 33 | Azaltılmış hareket desteği | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 34 | Kart erişilebilirliği (etiket, durum duyurusu) | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 35 | Ana menü/hub entegrasyonu ("bugün oynandı" rozeti) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 36 | Uluslararasılaştırma | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 37 | Hamle/süreye dayalı performans skoru (yıldız, kişisel rekor) | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 38 | Ses aç/kapa, duraklat, çıkış onayı | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |

Toplam 38 satır KALDIRILDI. Gerekçe: §7.3 portföy kararı (tavan 12; sabit 8 emoji, seviyesiz; casual rolünü Eşleştir-3 üstlenir). Bu nedenle oyun içi bulgular (mekanik, animasyon, erişilebilirlik) düzeltilmedi; yüzey artık oynanmıyor.

### Bulgular

- Oyuna özgü bulguların tümü: **KAPANDI (yüzey kaldırıldı)** — oyun sayfası artık oyunu çizmiyor.
- Ortak bulgular başka yerde kapandı: "kaybedilen oyun tekrar başlatılıp 409" ve "yenileyerek sınırsız deneme" (oyun motoru, `lib/game-session` — `failed`/yarım = oynandı); hub'ın kaybedilen oyunu "oynanmamış" göstermesi (Oyna merkezi üç durumlu kart); turnuva eşitlik kırıcı (`lib/game-tournament`).

### Kalanlar

- Sunucu kuralı (`lib/minigame-config`) henüz `hidden: true` DEĞİL: hafta ortasında gizlemek turnuva rotasyonunu kaydırıyor (ölçüldü: W40 ödül oyunu `data-snake` → `trust-merge`, W41 `review-stack` → `signal-pipe`). Turnuva sahibiyle hafta sınırında (Pazartesi 00:00 UTC) ya da aday listesi dondurulduktan sonra gizlenmeli. O zamana dek doğrudan API çağrısıyla sıralı deneme açılabilir (eski, zayıf doğrulama; günlük oyun puanı tavanı 600 sınırlar).
