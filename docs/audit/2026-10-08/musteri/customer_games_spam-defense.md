# /customer/games/spam-defense

**Amaç:** Müşterinin günde bir kez oynayabildiği, merkezdeki "Qratex Çekirdeği"ne dört kenardan yürüyen spam botlarını dokunarak vurduğu, şarjlı kalkan dalgası ve boss botlar içeren 50 saniyelik canvas savunma oyunu. Eşik (30 skor) geçilirse 170 puan + 85 XP, ayrıca seri bonusu, başarım, tüm zamanlar liderliği ve haftalık turnuva (ilk 3'e 500/300/150 puan) var.

**Genel puan:** 5/10 · **Karar:** birleştir (Troll Avcısı Arena ile aynı oyun döngüsü; tek bir "Arena Savunması" oyununda mod olarak birleştirilmeli, birleştirme sırasında aşağıdaki hatalar giderilmeli)

İncelenen dosyalar: `app/customer/games/spam-defense/page.tsx`, `app/customer/layout.tsx`, `components/customer/games/spam-defense-game.tsx`, `components/customer/games/game-shell.tsx`, `components/customer/games/game-leaderboard.tsx`, `components/customer/games/game-tournament.tsx`, `components/dashboard/page-heading.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/game-achievement-stats.ts`, `lib/points-wallet.ts`, `lib/tournament-core.ts`, `lib/admin-toast.ts`, `lib/accessibility-prefs.ts`, `app/api/customer/games/[game]/{start,complete,leaderboard}/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma` (`MiniGameSession`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Oyun döngüsü, ödül, seri, turnuva uçtan uca çalışıyor; ama kaybeden kullanıcı aynı gün tekrar oynayıp 409 ile duvara çarpıyor, kalkan dalgası çoklu hasar veriyor, admin ayarları istemcide yok sayılıyor. |
| UX | 5/10 | Akış anlaşılır fakat "bugün oynadın" bilgisi ancak butona basınca geliyor, sonuç ekranında sonraki adım yok, kalkan mekaniği 11px dipnotla anlatılıyor, çekirdek çevresinde ölü dokunma bölgesi var. |
| Görsel | 5/10 | Neon kabuk tutarlı ama oyun alanı emoji + düz daireden ibaret, DPR ölçeklemesi olmadığı için retina ekranda bulanık; Troll Avcısı ve Spam Kırıcı ile görsel olarak neredeyse aynı. |
| Mimari | 5/10 | Ortak `useMiniGame`/`GameShell`/generic API iyi bir temel; ancak istemci skor/sonucu otoriter, sunucunun döndürdüğü `config` kullanılmıyor, oyun mantığı 270 satırlık tek `useEffect` içinde. |
| Performans | 6/10 | Tek canvas ve rAF hafif; fakat her karede birden çok `shadowBlur`, her bot için emoji `fillText`, her karede `setShieldPct` ile React yeniden çizimi düşük uçlu Android'de kare düşürür. |
| Erişilebilirlik + Mobil | 3/10 | Canvas'ta rol/etiket yok, klavye alternatifi yok, sistem `prefers-reduced-motion` yok sayılıyor, sarsıntı/nabız azaltılmış harekette kapanmıyor, ses ayrı kapatılamıyor; mobilde dokunma çalışıyor ama hedefler küçülüyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum + `CUSTOMER` rol kontrolü | ÇALIŞIYOR | `app/customer/games/spam-defense/page.tsx:10-13` | Rol yoksa `/auth/signin`'e yönlendirir. |
| 2 | Sayfa `<title>` metadata | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s \| Müşteri alanı` ekliyor → "Spam Savunması \| QRateX \| Müşteri alanı" (çift sonek, marka yazımı "QRateX" vs "Qratex"). |
| 3 | Sayfa başlığı + açıklama (`DashboardPageHeading`) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Sabit kodlu; admin override'ı (başlık/açıklama/emoji) yok sayar; mobilde `hidden sm:flex` ile gizli; masaüstünde GameShell başlık/açıklamasıyla tekrar ediyor. |
| 4 | Başlangıç ekranı (emoji, başlık, açıklama, ipucu şeridi) | KISMİ | `game-shell.tsx:165-188`, `spam-defense-game.tsx:346-357` | Statik `DEF`'ten okur; `/api/customer/games/status` admin override'larını hub'a verir ama bu sayfa vermez → hub kartı ile oyun sayfası farklı başlık/renk gösterebilir. |
| 5 | "🛡️ Savunmaya Geç" başlat butonu → `POST /start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79` | Hata durumunda toast + `idle`'a dönüş var. |
| 6 | Sayfa açılırken "bugün oynandı" ön kontrolü | EKSİK | `lib/use-mini-game.ts:46-48` (başlangıç `idle`, `alreadyPlayed=false`) | Kilit bilgisi ancak butona basıp sunucu turu sonrası gelir; hub bu bilgiyi zaten biliyor (`status/route.ts:31-35`). |
| 7 | Admin tarafından kapatılmış oyun için sayfa davranışı | EKSİK | `start/route.ts:34-38` | Sayfa normal açılır, liderlik/turnuva görünür; yalnızca başlatınca "Bu oyun şu anda kullanılamıyor" toast'ı. |
| 8 | "Günde 1 hak" kuralı | BOZUK | `start/route.ts:56-73`, `complete/route.ts:98-108`, `status/route.ts:33` | Kaybedilen oyun `failed` olur; start yalnız `completed`'ı kilitler → kullanıcı aynı gün yeniden oynar, sonunda 409 "Oyun zaten tamamlandı" alır. Aktif oturumda sayfa yenilenirse sınırsız deneme. |
| 9 | Yükleniyor durumları (başlatılıyor / sonuç kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162`, `lib/minigame-copy.ts:89` | "Kalkanlar yükseliyor…" kişiselleştirilmiş metin. |
| 10 | Canvas mount retry guard + oyun döngüsü | ÇALIŞIYOR | `spam-defense-game.tsx:131-141`, `:326-331` | Cleanup'ta rAF iptal ediliyor. |
| 11 | Bot doğma + zamanla artan hız/sıklık | ÇALIŞIYOR | `spam-defense-game.tsx:159-194` | Hız `dt` tabanlı; doğma aralığı 900→380 ms. |
| 12 | Boss bot (14 sn'de bir, 5 HP, 3 puan) | ÇALIŞIYOR | `spam-defense-game.tsx:196`, `:172`, `:76` | |
| 13 | Dayanıklı bot (2 HP) + HP barı | ÇALIŞIYOR | `spam-defense-game.tsx:171-177`, `:306-310` | HP yalnızca renkle de kodlanıyor. |
| 14 | Dokun → en yakın botu vur + lazer efekti | KISMİ | `spam-defense-game.tsx:103-129` | Çekirdeğin 52 px çevresine dokunuş her zaman kalkana yönlenir (`:107-110`); kalkan şarjlı değilse dokunuş hiçbir şey yapmaz → çekirdeğe yapışan botlar vurulamaz. |
| 15 | Kalkan dalgası (çekirdeğe dokun) | BOZUK | `spam-defense-game.tsx:88-100`, `:209-219`, `:298` | Anında tüm botlara 1 hasar + genişleyen dalga ~3 kez daha vurur (bayrak her karede sıfırlanıyor); yorum "menzildeki botlara 1 hasar" diyor. Dalga hızı kare hızına bağlı. |
| 16 | Kalkan şarj çubuğu HUD | ÇALIŞIYOR | `spam-defense-game.tsx:198-200`, `:370-381` | Her karede `setShieldPct` (~11 render/sn). Metin tutarsız: "kalkan" / "HAZIR!". |
| 17 | Can HUD (3 kalp) | ÇALIŞIYOR | `spam-defense-game.tsx:359-364` | aria yok. |
| 18 | Skor HUD | KISMİ | `spam-defense-game.tsx:365` | Ödül eşiğine (30) ilerleme göstergesi yok; oyuncu ödüle ne kadar kaldığını bilmiyor. |
| 19 | Süre sayacı (50 sn) | KISMİ | `spam-defense-game.tsx:192`, `:322-323` | `Date.now()` tabanlı; sekme arka plana geçince süre akar ama botlar durur; duraklatma yok. |
| 20 | Çekirdeğe çarpma → can kaybı, sarsıntı, ses, titreşim | ÇALIŞIYOR | `spam-defense-game.tsx:223-233` | |
| 21 | Kazanma / kaybetme kararı | KISMİ | `spam-defense-game.tsx:82`, `:322` | Sabit `DEF.maxScore`/`DEF.rewardThreshold` kullanır, sunucunun döndürdüğü `game.config` yok sayılır. Süre bitip skor < 30 ise çekirdek sağlam olsa da "Çekirdek Düştü 💥" başlığı çıkar. |
| 22 | Parçacık efektleri (azaltılmış harekette kapalı) | ÇALIŞIYOR | `spam-defense-game.tsx:64-71` | |
| 23 | Ekran sarsıntısı / çekirdek nabzı / kalkan halkası titreşimi | KISMİ | `spam-defense-game.tsx:239-242`, `:274`, `:276-282` | `reduce-animations` açıkken de çalışıyor; sistem `prefers-reduced-motion` hiç okunmuyor. |
| 24 | Ses efektleri | KISMİ | `spam-defense-game.tsx:9`, `lib/game-sounds.ts:10-13` | Ayrı ses kapatma düğmesi yok; ses yalnızca "animasyonları azalt" tercihiyle kapanıyor. |
| 25 | Titreşim (haptic) | ÇALIŞIYOR | `lib/game-sounds.ts:158-159` | iOS Safari `navigator.vibrate` desteklemez (platform kısıtı). |
| 26 | Retina / `devicePixelRatio` ölçekleme | EKSİK | `spam-defense-game.tsx:384-391` | Sabit 360×420 arka tampon, CSS ile büyütülüyor → 2x/3x ekranda bulanık. |
| 27 | Oyun içi talimat satırı | KISMİ | `spam-defense-game.tsx:393` | 11px, `text-white/50`; kalkan mekaniğinin tek açıklaması bu. |
| 28 | Sonucun sunucuya gönderilmesi + ödül hesaplama | KISMİ | `complete/route.ts:59-87` | Ödül sunucuda hesaplanıyor ama skor ve `won` tamamen istemci beyanı; tek doğrulama 10 sn alt sınır (oyun 50 sn). |
| 29 | Sonuç ekranı (varyant başlık, skor, ödül rozeti) | KISMİ | `game-shell.tsx:222-304` | Eşik metni statik `DEF`'ten; `tooFast` ve 409 durumlarında "Ödül için 30 skor gerekiyordu" gibi yanıltıcı metin. |
| 30 | Konfeti kutlaması | ÇALIŞIYOR | `game-shell.tsx:86-94` | Azaltılmış harekette kapalı. |
| 31 | Ödül / seri / başarım toast'ları | KISMİ | `lib/use-mini-game.ts:112-125` | Aynı anda 3+ toast + konfeti; seri ve başarımlar sonuç ekranında hiç görünmüyor. |
| 32 | Günlük seri bonusu | ÇALIŞIYOR | `complete/route.ts:117-149` | Atomik `GameStreakClaim`. |
| 33 | Yeni başarım tespiti + bildirim | ÇALIŞIYOR | `complete/route.ts:90-94`, `:196-215` | Kullanıcının tüm oturumları iki kez taranıyor (`game-achievement-stats.ts:17-20`). |
| 34 | Ödül bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194` | Transaction dışında. |
| 35 | Sonuç gönderim hatası | KISMİ | `lib/use-mini-game.ts:126-128` | "Tekrar gönder" yok; ağ hatasında kazanılmış skor kaybolur, ekran ödülsüz sonuç gösterir. |
| 36 | Kilitli ekran ("Bugünün oyununu oynadın") | KISMİ | `game-shell.tsx:308-331` | "Her gün 00:00 (UTC) sıfırlanır" — Türkiye'de 03:00; geri sayım yok. |
| 37 | Tüm zamanlar liderlik tablosu | KISMİ | `leaderboard/route.ts:47-53`, `game-leaderboard.tsx:40`, `:55` | Skor 60'ta tavan → üst sıralar eşitlenir, sıralama belirsiz; fetch hatası "Henüz skor yok" boş durumuna düşer. |
| 38 | "Benim sıram" satırı | KISMİ | `leaderboard/route.ts:52`, `:76-80` | `take: 100` → 100. sıranın altındakiler için `me=null`; `totalPlayers` da 100'de kesilir. |
| 39 | Haftalık turnuva (canlı sıralama + geri sayım + ödül havuzu) | KISMİ | `game-tournament.tsx:221-293`, `tournament/route.ts:47-120` | Koyu kabuk içinde tema token'ları (`text-muted-foreground`, `bg-primary/10`, `text-yellow-600`) → açık temada düşük kontrast; skor "⭐" ile gösteriliyor, oysa birim "vuruş". Yalnız başlangıç ekranında. |
| 40 | Geçen hafta turnuva ödülü talebi | KISMİ | `game-tournament.tsx:119`, `:197-210`, `lib/admin-toast.ts:16-19` | Müşteri bileşeni `admin-toast` kullanıyor → "Basarili: 🏆 …" / "Dikkat: …" (Türkçe karaktersiz önek). Sunucu tarafı atomik ve doğru. |
| 41 | Sonuçtan sonra aksiyon (hub'a dön, sıradaki oyun, puanlarım) | EKSİK | `game-shell.tsx:295-303` | Yalnızca "Yeni dalga yarın…" metni; çıkış noktası yok. |
| 42 | Klavye / ekran okuyucu desteği | EKSİK | `spam-defense-game.tsx:384-391` | Canvas'ta `role`, `aria-label`, `tabIndex`, klavye kontrolü yok; HUD için `aria-live` yok. |
| 43 | Duraklatma / sekme görünürlüğü yönetimi | EKSİK | `spam-defense-game.tsx:188-325` | `visibilitychange` dinlenmiyor. |
| 44 | Kişisel rekor / "Yeni rekor!" anı | EKSİK | `lib/use-mini-game.ts:101-110` | Sonuç nesnesinde önceki en iyi skor yok. |
| 45 | Çok dillilik (en) | EKSİK | `spam-defense-game.tsx:379`, `:393`, `lib/minigame-copy.ts:86-94` | `messages/en.json` var ama oyun metinleri sabit Türkçe; `labelKey: 'spam_defense_game'` hiçbir mesaj dosyasında yok (ölü alan). |

**Durum sayımı:** ÇALIŞIYOR 16 · KISMİ 19 · BOZUK 2 · SAHTE 0 · EKSİK 8 (toplam 45)

---

## Bulgular

### 1. "Günde 1 hak" kaybedenlerde kırık: tekrar oynatıyor, sonra 409 ile ödülü siliyor
- **Önem:** yüksek · **Kategori:** hata / veri bütünlüğü · **Efor:** S
- **Kanıt:** `complete/route.ts:101` (`status: won ? 'completed' : 'failed'`), `start/route.ts:56-73` (yalnız `existing.status === 'completed'` kilitler; aksi hâlde "Yarım kalan aktif oturum" diye aynı `sessionId` döner), `complete/route.ts:98-108` (`updateMany where status:'active'` → `count 0` → 409), `status/route.ts:33` (hub yalnız `completed` sayar).
- **Sorun:** Kullanıcı kaybeder (oturum `failed`), sayfayı yenileyip "Savunmaya Geç"e basar. Sunucu `canPlay:true` döner, kullanıcı 50 saniye oynar, bu kez 30+ skorla kazanır; complete 409 döner, `use-mini-game.ts:126-128` toast.error + ödülsüz sonuç gösterir. Hub da oyunu "oynanmadı" gösterip kullanıcıyı buna davet eder. Ayrıca aktif oturumda (kötü giden oyunda) sayfa yenilenirse oturum `active` kaldığı için sınırsız yeniden deneme mümkün: "günde 1 hak" gerçekte "bitirene kadar sınırsız deneme".
- **Profesyonel öneri:** Günlük hak durumunu tek bir durum makinesine bağlayın: `start` `failed`'ı da kilitlemeli (veya ürün kararı olarak "kaybedene 1 ek hak" isteniyorsa bunu açık bir `attempts` sayacıyla yönetmeli). `MiniGameSession`'a `attempt`/`abandonedAt` ekleyip `active` oturumun yeniden başlatılmasında `startedAt`'i sıfırlamak yerine "terk edildi → hak yandı" kuralı uygulayın. `status` API'si `completed|failed` döndürmeli; sayfa ilk render'da bu durumu okuyup doğrudan kilit ekranını göstermeli. Bu düzeltme generic route'ta olduğu için 21 oyunun hepsini düzeltir.

### 2. Skor ve "kazandı" bilgisi tamamen istemci beyanı — puan, liderlik ve turnuva ödülü sahtelenebilir
- **Önem:** yüksek · **Kategori:** güvenlik / puan ekonomisi · **Efor:** L
- **Kanıt:** `complete/route.ts:15-22` (skor `0..10000`, `won` boolean istemciden), `:61` (yalnızca `maxScore`'a sıkıştırma), `:81-86` (tek kontrol: `minDurationSec`=10, `lib/minigame-config.ts:140`), `leaderboard/route.ts:47-53` ve `tournament/route.ts:28-35` (aynı `starsCollected` değeriyle sıralama), `lib/tournament-core.ts:13` (ilk 3'e 500/300/150 puan).
- **Sorun:** Oyun 50 sn sürüyor ve 60 skora ulaşmak gerçekçi olarak 30+ sn istiyor; oysa `start` sonrası 10 sn bekleyip `{score:60, won:true, durationSec:10}` gönderen bir istek 170 puan + 85 XP alır, tüm zamanlar tablosunda tavana oturur ve haftalık turnuvanın ilk 3'ü için tam skorla yarışır (eşitlikte sıra belirsiz). `points_credited` olayı yazılıyor (`:162-171`) ama kredilemeden önce bir tavan/hız kontrolü bu route'ta uygulanmıyor (redeem tarafında uygulanıp uygulanmadığı doğrulanmadı).
- **Profesyonel öneri:** (a) Kısa vadede `minDurationSec`'i oyunun fiziksel alt sınırına çekin (spam-defense için ≥ 30 sn) ve skor/süre oranı için makul bir tavan ekleyin (ör. skor ≤ 1.6 × geçen saniye). (b) Orta vadede "olay günlüğü" deseni: istemci her vuruşu/kill'i `(t, enemyId, hp)` olarak tamponlayıp complete'te göndersin, sunucu `start`'ta verdiği `seed` ile aynı bot doğma dizisini deterministik olarak üretip günlüğün tutarlılığını doğrulasın (ör. bot doğmadan öldürülemez, 60 öldürme için gereken minimum süre). (c) Turnuva ödülünü yalnız doğrulanmış oturumlara bağlayın ve eşitlikte `completedAt` ile deterministik sıra uygulayın. (d) Oyun kaynaklı puan için günlük toplam tavanı `creditPointsAndXp` çağrısından önce zorlayın.

### 3. Kalkan dalgası her bota tasarlanandan 3-4 kat hasar veriyor
- **Önem:** orta · **Kategori:** hata / oyun dengesi · **Efor:** S
- **Kanıt:** `spam-defense-game.tsx:95-99` (anında tüm botlara 1 hasar, menzil kontrolü yok), `:209-219` (dalga her karede 9 px büyür, `|d - r| < 16` bandındaki bota vurur), `:298` (`_w` bayrağı her karede sıfırlanıyor).
- **Sorun:** 32 px'lik bant 9 px/kare hızla geçtiği için dalga aynı bota ~3 ardışık karede vurur; buna anında verilen 1 hasar eklenir. Sonuç: 5 HP'li boss bile çoğu zaman tek kalkanla ölür, kalkan "ekran temizleyici"ye dönüşür, beceri eğrisi düzleşir. Kod yorumu (`:94` "menzilindeki tüm botlara 1 hasar") davranışla çelişiyor. Ayrıca dalga/parçacık/lazer ömrü kare tabanlı, botlar `dt` tabanlı → 120 Hz ekranda dalga iki kat hızlı.
- **Profesyonel öneri:** Hasarı tek kaynaktan verin: ya anlık (menzil kontrollü) ya dalga; dalga için bayrağı bot nesnesine değil dalgaya bağlayın (`wave.hit: Set<Enemy>`). Tüm zaman tabanlı değerleri `dt`'ye çevirin (`wv.r += 0.56 * dt`). `_w` için tip kaçağını (`as Enemy & { _w?: boolean }`) `Enemy` tipine alan ekleyerek kaldırın.

### 4. Admin ayarları (eşik, tavan, başlık, renk) bu sayfada yok sayılıyor
- **Önem:** orta · **Kategori:** mimari / yanlış veri · **Efor:** S
- **Kanıt:** `spam-defense-game.tsx:11` (`const DEF = getMiniGame(...)` statik), `:82` ve `:322` (kazanma kararı `DEF`'ten), `:347-354` (GameShell'e `DEF.title/emoji/accent/rewardThreshold`), `lib/use-mini-game.ts:70`, `:137` (`config` dönüyor ama oyunda kullanılmıyor), `lib/minigame-config-effective.ts:40-56` (admin override birleştirmesi), `page.tsx:17-20` (sabit başlık).
- **Sorun:** Admin eşiği 40'a çekerse istemci 30'da "kazandın" der, sunucu ödül vermez, sonuç ekranı "Ödül için 30 skor gerekiyordu" der (yanlış sayı). Admin `maxScore`'u 40'a indirirse oyun 60'a kadar sürer ama sunucu 40'a kırpar; 100'e çıkarırsa oyun yine 60'ta biter. Hub kartı override'lı başlık/rengi, oyun sayfası registry'yi gösterir.
- **Profesyonel öneri:** Sayfayı server component'te `getEffectiveMiniGame('spam-defense')` ile besleyin (`enabled=false` ise `notFound()` veya "bakımda" ekranı), etkin tanımı ve bugünkü oturum durumunu (`completed|failed|active|none`) prop olarak `SpamDefenseGame`'e geçin. `useMiniGame` başlangıç durumunu bu prop'tan alsın; oyun ve GameShell yalnızca bu tanımı okusun.

### 5. Çekirdek çevresinde "ölü dokunma bölgesi"
- **Önem:** orta · **Kategori:** UX / oynanış · **Efor:** S
- **Kanıt:** `spam-defense-game.tsx:107-110` (çekirdeğe < 52 px dokunuş → `fireShield()` ve `return`), `:89` (şarjlı değilse sessizce döner), `:223` (çarpışma yarıçapı `CORE_R + e.r` = 47/52/60).
- **Sorun:** Oyunun en kritik anı — bot çekirdeğe değmek üzereyken — oyuncunun refleksle botun iç kenarına dokunması kalkana yönlenir; kalkan doluyken istem dışı harcanır, boşken hiçbir şey olmaz. Oyuncu "vurdum ama saymadı" hisseder.
- **Profesyonel öneri:** Öncelik sırası: önce dokunma noktasında bot var mı bak, yoksa çekirdeğe yakınsa kalkan. Daha iyisi kalkanı ayrı, başparmak erişimli bir HUD düğmesine (ve klavyede Space'e) taşıyın; çekirdeğe dokunma da alternatif kalsın. Şarjsızken dokunulunca kısa "şarj oluyor" geri bildirimi (halka titremesi + ses) verin.

### 6. Sayfa kilit ve kapalı durumu ilk yüklemede bilmiyor
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** `lib/use-mini-game.ts:46-48` (`phase='idle'`, `alreadyPlayed=false`), `game-shell.tsx:165-219` (idle'da CTA), `start/route.ts:34-38` (kapalı oyun → 403 toast).
- **Sorun:** Bugün oynamış kullanıcı nabız atan "Savunmaya Geç" butonunu görür, basar, spinner sonrası kilit ekranı gelir: boşa umut + gereksiz istek. Kapalı oyunda da sayfa tam açılır.
- **Profesyonel öneri:** Bulgu 4'teki server-side ön yükleme ile çözülür; ek olarak kilit ekranında yerel saat diliminde "Yeni hakkın 03:00'te — 5 sa 12 dk" geri sayımı ve "Başka bir oyuna geç" önerisi gösterin.

### 7. Sonuç ekranı ödül anını boşa harcıyor ve bazen yanlış konuşuyor
- **Önem:** orta · **Kategori:** UX / oyunlaştırma · **Efor:** M
- **Kanıt:** `game-shell.tsx:274-303` (yalnız puan rozeti + "yarın gel"), `lib/use-mini-game.ts:112-125` (seri ve başarımlar yalnız toast), `complete/route.ts:226` (`tooFast` dönüyor, istemci okumuyor), `use-mini-game.ts:126-128` (hata → ödülsüz sonuç), `lib/minigame-copy.ts:91` (kaybetme başlıkları "Çekirdek Düştü" — süre bitimi kaybında da).
- **Sorun:** Duolingo/Starbucks'ta en değerli an olan "ödül anı" burada üst üste binen 3-4 toast ile geçiyor; seri, yeni başarım, kişisel rekor, eşiğe ne kadar kaldığı, turnuvadaki yeni sıra sonuç ekranında yok. Sonraki adım (hub, sıradaki oyun, puan cüzdanı) yok. Ağ hatası ile "eşik altı" aynı görünüyor.
- **Profesyonel öneri:** Sonuç ekranını adım adım açılan bir "özet kartı"na çevirin: skor sayacı (sayarak artan) → eşik çubuğu dolumu → ödül → seri ateşi → yeni başarım rozeti → haftalık sıra değişimi ("↑ 4 sıra"). `complete` yanıtına `previousBest`, `weeklyRankBefore/After`, `nextResetAt` ekleyin. Hata durumunda "Sonuç gönderilemedi — Tekrar dene" (aynı `sessionId` ile idempotent) gösterin. Altına "Oyun Merkezi'ne dön" ve "Bugün oynamadığın: X" CTA'ları koyun. Toast'ları sonuç ekranı görünürken bastırın.

### 8. Erişilebilirlik: canvas klavye ve ekran okuyucuya kapalı, azaltılmış hareket yarım
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** M
- **Kanıt:** `spam-defense-game.tsx:384-391` (role/aria/tabIndex yok, yalnız `onPointerDown`), `:359-381` (HUD için `aria-live` yok, kalp sayısı yalnız renk), `:25-27` + `lib/accessibility-prefs.ts:18-22` (yalnız uygulama içi sınıf; sistem `prefers-reduced-motion` okunmuyor), `:239-242` ve `:274` (sarsıntı/nabız azaltılmış harekette de aktif), `lib/game-sounds.ts:10-13` (ses yalnız "animasyonları azalt" ile kapanıyor).
- **Sorun:** Klavye kullanıcısı oyunu başlatabilir ama oynayamaz; ekran okuyucu yalnız "canvas" duyar. İşletim sisteminde hareket azaltma açık kullanıcı sarsıntı ve yanıp sönen halka görür. Ses için ayrı kapatma yok — toplu taşımada oynayan kullanıcı sesi kapatmak için animasyonları da kapatmak zorunda.
- **Profesyonel öneri:** Canvas'a `role="application"` + `aria-label` + `aria-describedby` (kurallar), klavye şeması (oklarla nişangâh / Tab ile en yakın hedef, Space kalkan) ekleyin; HUD'u `aria-live="polite"` ile can/kalkan durumunu duyuracak şekilde işaretleyin; HP'yi renk yanında şekil/çerçeve kalınlığıyla da kodlayın. `reduced()` yardımcılarını tek bir `useReducedMotion()` hook'una toplayın (uygulama tercihi VEYA `matchMedia('(prefers-reduced-motion: reduce)')`) ve sarsıntı/nabız/konfetiyi buna bağlayın. Ses ve titreşim için ayrı "Ses: açık/kapalı" tercihi ekleyip GameShell başlığında kalıcı bir düğme olarak sunun.

### 9. Retina bulanıklığı ve kare başına pahalı çizim
- **Önem:** düşük · **Kategori:** görsel / performans · **Efor:** M
- **Kanıt:** `spam-defense-game.tsx:384-389` (DPR yok), `:256`, `:268`, `:279`, `:290`, `:300` (her karede çok sayıda `shadowBlur`), `:293-294`, `:303-304` (her bot için emoji `fillText`), `:245-249` (ızgara her karede 26 çizgi), `:198-200` (her karede `setShieldPct` → React render).
- **Sorun:** 3x ekranlı telefonda oyun alanı belirgin bulanık; `shadowBlur` canvas'ta en pahalı işlemlerden biri ve düşük uçlu Android'de 40+ botlu son saniyelerde kare düşer. Emoji glif görünümü platforma göre değişir.
- **Profesyonel öneri:** Arka tamponu `W*dpr × H*dpr` yapıp `ctx.scale(dpr,dpr)`; bot/çekirdek/ızgarayı açılışta `OffscreenCanvas` sprite'larına bir kez çizip `drawImage` ile basın (parıltı sprite'a gömülü). HUD state'ini yalnız tam yüzde değiştiğinde veya 10 Hz'de güncelleyin; daha iyisi HUD'u da ref + doğrudan DOM yazımıyla sürün.

### 10. Liderlik ve turnuva tavanda yığılıyor, hata durumunu boş durum gibi gösteriyor
- **Önem:** düşük · **Kategori:** veri / UX · **Efor:** M
- **Kanıt:** `lib/minigame-config.ts:136` (`maxScore: 60`), `spam-defense-game.tsx:82` (60'ta oyun biter), `leaderboard/route.ts:47-53` (`take: 100`, eşitlikte ikincil sıralama yok), `game-leaderboard.tsx:40`, `:55` (hata → "Henüz skor yok — ilk rekoru sen kır!"), `game-tournament.tsx:219` (hata → hiçbir şey), `game-tournament.tsx:279` ("⭐" birimi).
- **Sorun:** İyi oyuncuların hepsi 60'ta durduğu için tablonun tepesi eşit skorlardan oluşur ve sıra belirsizdir; turnuvada bu doğrudan 500/300/150 puanı belirler. Hata ile boş tablo ayırt edilemez.
- **Profesyonel öneri:** Skoru tavansız bir "dayanıklılık" metriğine çevirin (60'ta bitirmek yerine süre sonuna kadar oynat, ödül eşiği ayrı kalsın) veya ikincil sıralama olarak "60'a ulaşma süresi"ni saklayın (`MiniGameSession.durationMs`). Hata için ayrı durum + "Yeniden dene" ekleyin; birimi oyunun `scoreLabel`'ından okuyun.

### 11. Müşteri bileşeninde admin toast'ı ve tema token'ı karmaşası
- **Önem:** düşük · **Kategori:** tutarlılık / dil · **Efor:** S
- **Kanıt:** `game-tournament.tsx:119` (`import { toast } from '@/lib/admin-toast'`), `lib/admin-toast.ts:16-19` ("Basarili: ", "Dikkat: " önekleri), `game-tournament.tsx:229`, `:264`, `:273`, `:287` (`text-muted-foreground`, `bg-primary/10`, `bg-muted/40` — sabit koyu `GameShell` zemini üzerinde, `game-shell.tsx:101-102`).
- **Sorun:** Müşteri "Basarili: 🏆 1. oldun — +500 puan!" görür (Türkçe karaktersiz, yönetici dili). Açık temada gri metin neredeyse siyah zemine düşer; liderlik bileşeni `text-white/..` kullanırken turnuva tema token'ı kullanır → aynı kabukta iki farklı görsel dil.
- **Profesyonel öneri:** `sonner` toast'ını doğrudan kullanın; GameShell içi bileşenler için `--game-fg`, `--game-muted` gibi kabuğa özel CSS değişkenleri tanımlayıp hem liderliği hem turnuvayı bunlara bağlayın.

### 12. Sekme arka plana geçince süre akıyor, duraklatma yok
- **Önem:** düşük · **Kategori:** oynanış · **Efor:** S
- **Kanıt:** `spam-defense-game.tsx:155`, `:192` (`Date.now() - startedAt`), `:189` (`dt` 40 ms'de kırpılıyor → botlar durur).
- **Sorun:** Bildirim veya arama nedeniyle uygulamadan çıkan kullanıcı döndüğünde süresini kaybetmiş bulur; tek günlük hak bununla yanabilir.
- **Profesyonel öneri:** Oyun saatini `dt` toplamıyla tutun (duvar saati yerine), `visibilitychange`'te otomatik duraklatıp "Devam et" katmanı gösterin; sunucu `minDurationSec` kontrolü zaten duvar saatinden bağımsız kalır.

### 13. Sayfa düzeyi küçük tutarsızlıklar
- **Önem:** düşük · **Kategori:** tutarlılık · **Efor:** S
- **Kanıt:** `page.tsx:7` + `app/customer/layout.tsx:18-21` (çift başlık soneki), `page.tsx:18` (h1 içinde emoji — ekran okuyucu "kalkan" diye okur), `page.tsx:19` vs `lib/minigame-config.ts:132-133` (aynı açıklamanın iki kopyası), `game-shell.tsx:323` ("00:00 (UTC)"), `spam-defense-game.tsx:379` ("kalkan" küçük harf / "HAZIR!" büyük harf), `lib/minigame-copy.ts:92` ("Vuruş" etiketi ama skor = öldürme, boss = 3).
- **Profesyonel öneri:** Metadata'da yalnız `title: 'Spam Savunması'` bırakın; emojiyi `aria-hidden` span'e alın; tüm oyun metinlerini tek kaynaktan (registry + copy) türetin; skor etiketini "Skor" veya "Temizlenen bot" yapın.

---

## Eksik özellikler (kıyas ürünlerle)

- **İlerleme hedefi ve "neredeyse oldu" anı (Duolingo):** Oyun sırasında ödül eşiğine dolan bir çubuk (0/30), eşik geçildiğinde oyun içi kutlama; kaybedince "2 bot daha!" gibi yakın kaçış geri bildirimi.
- **Kişisel rekor ve geçmiş (Spotify Wrapped / Duolingo):** Önceki en iyi skor, son 7 günün skor eğrisi, "Yeni rekor!" anı; haftalık "Bu hafta 1.240 bot temizledin" özeti.
- **Sonraki aksiyon zinciri (Starbucks Rewards):** Sonuç ekranında "Puanın: 2.340 → 2.510, ödüle 90 puan kaldı" ve "Oyun Merkezi'nde bugün 3 oyun daha var" CTA'sı.
- **Ses/titreşim kontrolü ve duraklatma (her mobil oyun standardı):** Kalıcı ses düğmesi, otomatik duraklatma, "Devam et" katmanı.
- **Paylaşılabilir sonuç kartı (Spotify Wrapped):** Skor + seri + turnuva sırasını içeren, Web Share API ile paylaşılabilen görsel kart (referral sistemiyle bağlanabilir).
- **Öğretici ilk oyun (Duolingo):** İlk girişte 10 saniyelik etkileşimli eğitim (bota dokun → kalkanı dene), ödülsüz pratik modu; günlük hak buna harcanmaz.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Bir dakikalık, net hedefli, her gün geri dönülen savunma ritüeli." Kullanıcı sayfaya girdiğinde ne durumda olduğunu (bugün hak var mı, seri kaç gün, ödüle ne kadar) hemen görür; oyun sırasında yalnız oyuna odaklanır; bitişte ödül anı sırayla açılır ve bir sonraki adıma yönlendirilir.

**Yerleşim (mobil öncelikli):**
1. **Lobi kartı:** Solda çekirdek görseli, sağda üç küçük istatistik (Kişisel rekor · Seri 🔥 · Bu hafta sıran). Altında tek birincil CTA; hak yoksa CTA yerine yerel saatli geri sayım ve "Başka oyun" önerisi. Turnuva ve tüm zamanlar tablosu iki sekmeli tek bir "Sıralama" bileşeninde (şu anki iki ayrı, farklı stilli blok yerine).
2. **Oyun alanı:** Tam genişlik canvas (DPR'li), üstte ince HUD şeridi: kalpler · ödül eşiği çubuğu (0/30 → altın) · süre halkası. Alt-sağda başparmak erişimli kalkan düğmesi (şarj halkası düğmenin kendisinde). Sol üstte ses ve duraklat ikonları.
3. **Sonuç sahnesi:** Sırayla açılan kartlar: skor sayacı → eşik dolumu → ödül → seri → başarım → sıra değişimi; altta "Oyun Merkezi" ve "Paylaş".

**Motion / 3D (ölçülü):** Çekirdek, projede zaten var olan three.js birikimiyle (fasetli taş, eşikli bloom — `memory/originkit-components.md`) küçük bir 3B kristal olarak lobide yavaşça dönebilir; oyun alanında ise 2B canvas'ta kalmalı (performans). Oyun içi hareketin tamamı canvas'ta; framer-motion yalnız lobi ↔ oyun ↔ sonuç geçişleri ve sonuç kartlarının sıralı açılışı için. Sarsıntı ve nabız ortak `useReducedMotion()`'a bağlı olmalı; azaltılmış harekette sarsıntı yerine kısa kırmızı kenar parlaması.

**Veri / API değişiklikleri:**
- `page.tsx` server component: `getEffectiveMiniGame` + bugünkü oturum durumu + kişisel rekor → istemciye prop (bulgu 4, 6).
- `start`: `failed` da kilitler; `seed` döndürür; aktif oturumun yeniden başlatılmasını "terk" sayar (bulgu 1).
- `complete`: olay günlüğü doğrulaması, oyuna özgü süre/skor oranı tavanı, yanıtında `previousBest`, `weeklyRankBefore/After`, `nextResetAt`; idempotent yeniden gönderim (bulgu 2, 7).
- `MiniGameSession`: `durationMs` (eşitlik bozma), isteğe bağlı `attempt`.
- Liderlik/turnuva: eşitlikte `durationMs`/`completedAt` ile deterministik sıra; hata durumu ayrı.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/troll-slayer` (Troll Avcısı Arena) — güçlü çakışma.** Aynı çekirdek döngü: kenarlardan gelen düşmanlara dokun → en yakını vur (`troll-slayer-game.tsx:110-111` vs `spam-defense-game.tsx:112-117`), boss = 3 puan (`troll-slayer-game.tsx:89`, `:136` vs `spam-defense-game.tsx:76`), şarjlı ekran temizleme yeteneği (öfke ulti `troll-slayer-game.tsx:76-79` vs kalkan `spam-defense-game.tsx:88-100`), aynı mor boss rengi, aynı 360×420 canvas, aynı sayfa iskeleti. Kullanıcı açısından iki oyun aynı hissi veriyor ve günlük 2 ayrı ödül hakkı yaratıyor.
- **`/customer/games/spam-breaker` (Spam Kırıcı) — isim/tema çakışması.** Mekanik farklı (breakout) ama aynı "Spam" adı, aynı `#ef4444` vurgu rengi ve aynı "çekirdeği koru" anlatısı (`lib/minigame-config.ts:131-136` vs `:327-330`) → hub'da ayırt etmek zor.
- **`/customer/games/guardian-of-trust` ve `/customer/games/network-defender`** "koru/savun" temasını paylaşıyor; mekanikleri yeterince farklı, birleştirme gerekmez ama hub'da tema kümelemesi düşünülmeli.

**Öneri:** Spam Savunması ve Troll Avcısı Arena'yı tek bir "Arena Savunması" oyununda iki mod olarak birleştirin: "Çekirdek" modu (merkez savunma + kalkan, bu sayfanın kimliği) ve "Arena" modu (kombo + öfke ultisi). Tek `gameType`, tek günlük hak, mod seçimi lobide; ortak motor (`useCanvasGame` hook'u: DPR, dt saati, duraklatma, sprite önbelleği, azaltılmış hareket) diğer canvas oyunlarına da (spam-breaker, frost-catcher, guardian-of-trust) yayılabilir. Spam Kırıcı'nın adı ve vurgu rengi ayrışacak şekilde değiştirilmeli. Birleştirme yapılmayacaksa en azından 1, 2 ve 4. bulgular generic route/hook düzeyinde düzeltilmeli; bu düzeltmeler 21 oyunun hepsini etkiler.

---

## Doğrulama (şüpheci inceleme)

İncelenen dosyalar: `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/tournament-core.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/use-mini-game.ts`, `components/customer/games/spam-defense-game.tsx`, `components/customer/games/game-shell.tsx`, `app/api/admin/games/route.ts`. Kod salt okunur incelendi; hiçbir komut/DB işlemi çalıştırılmadı.

### 1. Kaybedilen (failed) oyun aynı gün yeniden başlatılabiliyor, sonra 409; aktif oturum yenilemeyle sınırsız deneme — **DOĞRULANDI**

- `complete` kaybı `status: won ? 'completed' : 'failed'` olarak yazar (`complete/route.ts:101`).
- `start` yalnız `existing.status === 'completed'` durumunu kilitler (`start/route.ts:57`); `failed` ve `active` için aynı `sessionId` ile `canPlay: true` döner (`start/route.ts:69-73`).
- İkinci denemede `complete`: `:73` yalnız `completed`ı 409'lar, `failed` geçer; ancak `updateMany({ where: { id, status: 'active' } })` 0 satır döner (`:98-108`) → `credited: false` → 409 "Oyun zaten tamamlandı" (`:177-182`). İstemci `use-mini-game.ts:98-99,126-128` ile hata toast'ı + ödülsüz sonuç gösterir.
- Hub `status` yalnız `completed` sayar (`status/route.ts:33`) → kaybedilen oyun "bugün oynanmadı" görünür ve kullanıcıyı tekrar oynamaya davet eder.
- Yeniden üretim: (a) 50 sn oyna, 3 can kaybet → `endGame(false)` (`spam-defense-game.tsx:232`) → `failed`. (b) Sayfayı yenile, "Başla" → oyun açılır, 30+ skorla kazan → 409, ödül yok, emek boşa. (c) Ayrı senaryo: canlar bitmeden sekmeyi yenile → `active` oturum aynen döner, `startedAt` sıfırlanmaz; oyuncu kaybetmek üzereyken yenileyerek kazanana dek deneyebilir → "günde 1 hak" fiilen "kazanana dek sınırsız deneme". Ödül tek kez verildiği için ekonomi zararı yok; zarar adalet (liderlik/turnuvada tekrar-dene avantajı) ve kayıp sonrası kırık UX.
- Not: `lib/game-achievement-stats.ts:18` `failed`ı "oynanmış" sayıyor; yani sistemin geri kalanı da `failed`ı günlük hakkın tüketilmesi olarak modelliyor — `start`taki istisna tutarsız.

### 2. İstemci-otoriter skor/won: sahte complete ile 170 puan + liderlik tavanı + turnuva ödülü — **DOĞRULANDI** (şiddet notuyla)

- Sunucu yalnızca `score`u `game.maxScore`a kırpar (`complete/route.ts:61`) ve `minDurationSec` (10 sn) alt sınırını hem sunucu süresine hem istemci süresine uygular (`:81-83`); `won` doğrudan istemciden alınır (`:21`, `:86`). Olay günlüğü/iz/oran doğrulaması yok.
- Yeniden üretim: oturum açık müşteri `POST /api/customer/games/spam-defense/start` → `sessionId`; 10 sn bekle; `POST .../complete` gövdesi `{"sessionId":"…","score":60,"durationSec":10,"won":true}` → `eligible=true`, `computeEffectiveReward` 60 ≥ 30 → 170 puan + 85 XP + seri bonusu (`:117-158`), `starsCollected=60`.
- Turnuva: `weeklyRanking` yalnız `completed` oturumların `_max.starsCollected` değerine göre sıralar (`tournament/route.ts:28-35`), eşitlikte deterministik sıra kuralı yok; POST bu sıraya göre 500/300/150 puan verir (`:145-163`, `tournament-core.ts:13`). Sahte 60'la tavana oturmak, ödül tablosuna giriş için yeterli; tavanda eşitlik oluşursa sıra veritabanının keyfî düzenine kalır.
- Şiddet notu: günlük oyun ödülü açısından sahtekârın kazancı, usta bir oyuncunun meşru alabileceği tavanla (günde 1 × 170) aynıdır — ekonomi "sınırsız basım" değil. Asıl gerçek zarar rekabetçi yüzeyler (liderlik, haftalık turnuva 950 puan/hafta/oyun havuzu) ve meşru oyuncunun adalet algısıdır. Bu açık generic route'ta olduğu için tüm registry oyunlarını etkiler.

### 3. Admin override'ları istemcide yok sayılıyor — **DOĞRULANDI** (admin override koşuluna bağlı)

- Bileşen statik registry tanımını kullanır: `const DEF = getMiniGame('spam-defense')!` (`spam-defense-game.tsx:11`); oyun bitişi `DEF.maxScore` (`:82`), kazanma kararı `DEF.rewardThreshold` (`:322`), sonuç metni eşiği `DEF.rewardThreshold` (`:354` → `game-shell.tsx:292`). Hook sunucunun döndürdüğü etkin `config`i saklar (`use-mini-game.ts:70`) ve döndürür (`:137`) ama bileşen onu hiç okumaz.
- Admin bu alanları gerçekten ezebilir: `app/api/admin/games/route.ts:143-147,195` (`maxScore`, `rewardThreshold`, `title`, `emoji`, `accent` …); sunucu ödülü bu etkin değerlerle hesaplar (`minigame-config-effective.ts:47-55,107-116`).
- Kullanıcıyı etkileyen somut senaryo (en zararlı yön): admin eşiği 30 → 20'ye düşürür. Oyuncu süre bitiminde 25 skorla bitirir → istemci `won = 25 >= 30 && …` = `false` gönderir (`:322`) → sunucuda `eligible = won && …` = `false` (`complete/route.ts:86`), oturum `failed` olur → oyuncu sunucunun vereceği 170 puanı **kaybeder** ve ekranda "Ödül için 30 skor gerekiyordu" yazar (yanlış eşik).
- Ters yön: eşik 40'a çıkarsa 35 skorla istemci "kazandın" der, sunucu 0 puan verir; hook bunu "Kazandın ama ödül eşiğini geçemedin" toast'ıyla kısmen yumuşatır (`use-mini-game.ts:114-115`) ama sonuç kartı yine 30 yazar.
- `maxScore` farkı: admin düşürürse oyun 60'a kadar sürer, sunucu sessizce kırpar; yükseltirse oyun 60'ta "kazandın"la erken biter. Başlık/emoji/renk override'ları hub'da (`status/route.ts:40-48`) görünür ama bu sayfada (`page.tsx:17-20` sabit başlık, `spam-defense-game.tsx:347-350`) görünmez — tutarsız marka.
- Şiddet: override yapılmadığı sürece tetiklenmez; yapıldığında ise oyuncunun hak ettiği ödülü kaybetmesine yol açtığından YÜKSEK kabul edilebilir. Çözüm yönü: kazanma kararını istemciden kaldırıp sunucuya bırakmak (istemci yalnız skor/olay gönderir, `won` sunucuda `score >= effective.rewardThreshold` ile türetilir) ve bileşenin `game.config` + `page.tsx`'te `getEffectiveMiniGame` ile beslenmesi.
