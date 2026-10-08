# /customer/games/signal-pipe

**Amaç:** Müşterinin günde bir kez oynadığı "boru döndürme" bulmaca oyunu (Pipe Mania / Net tarzı). 5×5 ızgarada hücreleri döndürerek sol üstteki "Kaynak"tan sağ alttaki "Sunucu"ya kesintisiz hat kurulur; her kurulan hat 1 skor, 5+ hat = 160 puan + 80 XP, en fazla 10 hat. Skor tüm zamanlar liderliğine ve **ödüllü haftalık turnuvaya** (1./2./3. = 500/300/150 puan) girer.

**Genel puan: 5.0 / 10** · **Karar: koru-iyileştir** (oyun çekirdeği sağlam ve keyifli; ancak ekonomi/turnuva bütünlüğü, "günde 1 hak" akışı ve oyun tasarımı derinliği ciddi iyileştirme istiyor. Sayfa kabuğu ise 20 oyun sayfasıyla birebir kopya → dinamik rotaya birleştirilmeli.)

Okunan dosyalar: `app/customer/games/signal-pipe/page.tsx`, `app/customer/layout.tsx`, `components/customer/games/signal-pipe-game.tsx`, `components/customer/games/game-shell.tsx`, `components/customer/games/fx-layer.tsx`, `components/customer/games/game-leaderboard.tsx`, `components/customer/games/game-tournament.tsx`, `components/customer/games/games-hub.tsx` (kısmi), `components/dashboard/page-heading.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/accessibility-prefs.ts`, `lib/admin-toast.ts`, `lib/tournament-core.ts`, `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/[game]/leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma` (MiniGameSession, TournamentRewardClaim), `app/globals.css` (reduced-motion), `components/providers.tsx` (MotionConfig).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Bulmaca üretimi, döndürme, BFS akış, seviye geçişi ve ödül akışı çalışıyor; fakat kaybedilen oturumun "tekrar oyna → 409" tuzağı, admin override'larının istemciye yansımaması ve turnuvadaki eşitlik belirsizliği gerçek kusurlar. |
| UX | 4/10 | Zaman/hamle baskısı olmadığı için gerilim yok; kaybetmenin tek yolu erken "Bitir"e basmak; onaysız "Bitir" butonu ızgaranın hemen altında; sonuç ekranı çıkışsız; "zaten oynadın" ancak butona basınca öğreniliyor. |
| Görsel | 6/10 | Neon SVG boru + ışıma + şok dalgası tutarlı ve hoş; ama Kaynak/Sunucu işaretleri 9px emoji, "Sunucu" etiketi yanlış köşede, turnuva kartı tema token'larıyla koyu kabukta açık temada okunaksız kalabilir. |
| Mimari | 5/10 | Ortak hook/kabuk iyi soyutlanmış; ancak skor tamamen istemciye güveniyor, `Cell.locked` ölü alan, `taps` hiçbir yere gitmiyor, sayfa dosyası 20 kopyadan biri, istemci statik registry'yi kullanıyor (sunucunun döndürdüğü `config` yok sayılıyor). |
| Performans | 7/10 | 25 hücrelik hafif DOM/SVG; tek kusur FxLayer'ın parçacık olmasa da sürekli 60fps rAF döngüsü ve her dokunuşta tüm ızgaranın iki kez klonlanması (önemsiz ölçekte). |
| Erişilebilirlik + Mobil | 4/10 | Hücreler `aria-label`'sız 25 adet anonim "düğme", ok tuşu gezintisi yok, durum duyurusu (aria-live) yok, uygulama içi "animasyonları azalt" framer döngülerini durdurmuyor; dokunma hedefleri (~57px) mobilde iyi. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum + CUSTOMER rol kontrolü | ÇALIŞIYOR | `app/customer/games/signal-pipe/page.tsx:10-13` | Rol yanlışsa `/auth/signin`'e yönlendirir (rol yanlış ama girişliyse bile signin'e atması tartışmalı). |
| 2 | Sayfa başlığı + açıklama (DashboardPageHeading) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:20` | Mobilde `hidden sm:flex`; açıklama GameShell açıklamasıyla neredeyse aynı (`lib/minigame-config.ts:314-315`) → masaüstünde iki kez okunuyor. Başlık h1'inde emoji. |
| 3 | Sekme başlığı (metadata) | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s | <panel>` ekliyor → "Sinyal Bağla | QRateX | …" çift marka. |
| 4 | Başlangıç ekranı (emoji, başlık, açıklama, ipucu şeridi) | ÇALIŞIYOR | `game-shell.tsx:165-188`, `lib/minigame-copy.ts:194-201` | Metinler oyuna özel. |
| 5 | "🔧 Hattı Kur" başlat butonu → `POST /api/customer/games/signal-pipe/start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79`, `start/route.ts:20-84` | |
| 6 | Günde 1 hak kuralı | KISMİ | `start/route.ts:56-73`, `complete/route.ts:101`, `complete/route.ts:98-108` | `failed` oturum "yeniden oynanabilir" dönüyor ama complete 409 veriyor (Bulgu #2). |
| 7 | "Bugün oynandın" kilit ekranı | KISMİ | `use-mini-game.ts:64-67`, `game-shell.tsx:308-331` | Yalnızca başlat butonuna basınca öğreniliyor; sayfa açılışında durum sorgulanmıyor. |
| 8 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | |
| 9 | Başlatma/gönderim hata toast'ı | ÇALIŞIYOR | `use-mini-game.ts:74-77`, `126-128` | Hata durumunda istemcinin `won` değeriyle sahte sonuç ekranı çiziliyor (Bulgu #2). |
| 10 | Haftalık turnuva kartı (sıralama, ödül havuzu) | KISMİ | `game-tournament.tsx:53-181`, `app/api/customer/tournament/route.ts:28-39` | Eşitlik belirsiz, tema token'ları koyu kabukta, skor "⭐" ile gösteriliyor. |
| 11 | Turnuva geri sayımı | ÇALIŞIYOR | `game-tournament.tsx:77-82`, `lib/tournament-core.ts:56-58` | Dakikalık hassasiyet; interval her tikte yeniden kuruluyor (önemsiz). |
| 12 | Geçen hafta ödülünü talep ("Ödülü al →") | KISMİ | `game-tournament.tsx:84-97`, `tournament/route.ts:128-193` | Atomik tek-claim var ama sıra her istekte yeniden hesaplanıyor; eşitlikte belirsiz (Bulgu #1). Toast'lar admin önekli ("Basarili: ") (Bulgu #9). |
| 13 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx:24-113`, `leaderboard/route.ts:47-80` | Tavan 10 → tablo hızla 10'larla dolar; eşitlikte belirsiz sıra; ağ hatası "Henüz skor yok — ilk rekoru sen kır" olarak görünüyor (`game-leaderboard.tsx:40,55-60`); `take: 100` → 100. sıradan sonrası kendi sırasını göremiyor. |
| 14 | Skor HUD (çözülen/maks) | ÇALIŞIYOR | `signal-pipe-game.tsx:228-231` | |
| 15 | "Hedef: N hat" göstergesi | KISMİ | `signal-pipe-game.tsx:232`, `13` | Statik registry'den; admin `rewardThreshold` override'ı yansımıyor (Bulgu #4). |
| 16 | Çevirme (dokunuş) sayacı | KISMİ | `signal-pipe-game.tsx:128,177-178,233` | Sayıyor ama hiçbir skora, sıralamaya, yıldıza etkisi yok; sunucuya gönderilmiyor — dekoratif. |
| 17 | "Kaynak" / "Sunucu" etiketleri | KISMİ | `signal-pipe-game.tsx:244-247`, `30-31` | "Sunucu" etiketi ızgaranın SAĞ ÜSTÜNDE, hedef ise SAĞ ALT hücre (4,4) → yanıltıcı mekânsal ipucu. |
| 18 | Kaynak/hedef hücre işaretleri (📡 / 🖥️) | KISMİ | `signal-pipe-game.tsx:270-271` | 9px emoji, köşeden taşacak şekilde negatif ofsetli; giriş/çıkış "ağzı" (dış bağlantı) çizilmiyor. |
| 19 | Seviye üretimi (garantili çözülebilir yol + dallar + karıştırma) | ÇALIŞIYOR | `signal-pipe-game.tsx:38-95` | Yorum "hedefe doğru ağırlıklı" diyor ama seçim tekdüze rastgele (`55-61`); başlangıçta zaten çözülmüş olma kontrolü yok (Bulgu #10). |
| 20 | Hücre döndürme (saat yönü 90°) | ÇALIŞIYOR | `signal-pipe-game.tsx:20-28`, `171-181` | |
| 21 | Akış/enerji hesaplama (BFS) + ışıklandırma | ÇALIŞIYOR | `signal-pipe-game.tsx:98-121`, `251`, `262-266`, `292-308` | Karşılıklı bağlantı kontrolü doğru. |
| 22 | Çözüm algılama + 700 ms sonra yeni seviye | ÇALIŞIYOR | `signal-pipe-game.tsx:186-204` | `lockRef` ile çift sayım engelli. |
| 23 | Boş hücreler (mask=0) | KISMİ | `signal-pipe-game.tsx:39-41`, `255-268` | Tıklanabilir, ses çalar, sayaç artırır ama hiçbir şey yapmaz; görsel olarak "devre dışı" değil. |
| 24 | Kilitli hücre (`Cell.locked`) | SAHTE / ölü | `signal-pipe-game.tsx:18,40` | Tipte ve başlangıçta var, hiçbir yerde okunmuyor — yarım kalmış zorluk mekaniği. |
| 25 | FX: şok dalgası + konfeti (çözümde) | KISMİ | `signal-pipe-game.tsx:194-198`, `fx-layer.tsx` | Klavye ile tetiklenen `click`'te `clientX/Y = 0` → efekt alanın dışına düşer. |
| 26 | Ses efektleri (çevirme, fanfar, kazanma/kaybetme) | ÇALIŞIYOR | `signal-pipe-game.tsx:11,146-147,180,191-192`, `lib/game-sounds.ts` | Ayrı ses kapatma kontrolü yok; yalnızca "animasyonları azalt" ile susuyor (`game-sounds.ts:10-13`). |
| 27 | Titreşim (haptic) | ÇALIŞIYOR | `signal-pipe-game.tsx:181,193`, `game-sounds.ts:158-166` | |
| 28 | "✅ Bitir & Skoru Al (n)" | KISMİ | `signal-pipe-game.tsx:209-212,278-284` | Onaysız; ızgaranın hemen altında; 0 skorla da günün hakkını bitirir (Bulgu #5). |
| 29 | 10. hatta otomatik bitiş | ÇALIŞIYOR | `signal-pipe-game.tsx:199-202` | |
| 30 | Sonuç gönderimi (`POST …/complete`) | KISMİ | `use-mini-game.ts:82-135`, `complete/route.ts:29-229` | Atomik ve tek-kredili; ama skor ve `won` tamamen istemci beyanı (Bulgu #3); `tooFast` yanıtı istemcide okunmuyor. |
| 31 | Ödül / seri bonusu / başarım toast'ları | ÇALIŞIYOR | `use-mini-game.ts:112-125` | |
| 32 | Sonuç ekranı (kupa/💀, başlık varyantı, skor, ödül rozeti) | KISMİ | `game-shell.tsx:222-305` | Çıkış/ilerleme CTA'sı yok (hub'a dön, sıradaki oyun, paylaş); `tooFast` nedeni açıklanmıyor. |
| 33 | Ödül konfetisi | ÇALIŞIYOR | `game-shell.tsx:19-31,86-94` | |
| 34 | Admin "oyunu pasifleştir" saygısı | KISMİ | `start/route.ts:34-39`, `page.tsx` (kontrol yok) | Sayfa ve CTA açık kalır; ancak tıklayınca 403 toast. |
| 35 | Admin görsel override'ları (başlık/açıklama/emoji/renk) | EKSİK | `signal-pipe-game.tsx:13,216-219`, `page.tsx:18` | Sayfa hep statik registry/hard-coded metin kullanır; hub ise override'lı gösterir (`status/route.ts:40-48`) → tutarsızlık. |
| 36 | Süre/hamle baskısı, zorluk eğrisi | EKSİK | `signal-pipe-game.tsx:14` (sabit 5×5), zamanlayıcı yok | Tüm seviyeler aynı boy ve yoğunlukta. |
| 37 | İpucu / geri al / seviyeyi atla | EKSİK | — | |
| 38 | Yarıda kalan oyunun devamı | KISMİ | `start/route.ts:69-73`, `signal-pipe-game.tsx:163-169` | Oturum korunur ama yenilemede ilerleme 0'a döner (istemci durumu kalıcı değil). |
| 39 | Klavye / ekran okuyucu desteği | KISMİ | `signal-pipe-game.tsx:255-272` | Tab ile odaklanabilir düğmeler; `aria-label`, ok tuşu gezintisi, `aria-live` durum duyurusu yok. |
| 40 | Azaltılmış hareket | KISMİ | `components/providers.tsx:232`, `game-shell.tsx:13-16,173-200`, `fx-layer.tsx:44-47` | OS tercihi framer'da uygulanıyor; uygulama içi `reduce-animations` yalnızca FX/ses/konfetiyi kapatıyor, framer sonsuz döngüleri (zıplayan emoji, nabız halkası, dönen konik hale) sürüyor. |
| 41 | Oyun merkezine dönüş / sıradaki oyun | EKSİK | `page.tsx`, `game-shell.tsx` | Sayfada geri bağlantısı veya sonuç sonrası yönlendirme yok. |
| 42 | Sonuç paylaşımı (Wordle tarzı) | EKSİK | — | |

**Durum sayıları:** ÇALIŞIYOR 16 · KISMİ 20 · BOZUK 0 · SAHTE 1 · EKSİK 5 (toplam 42).

---

## Bulgular (önem sırasıyla)

### 1. [YÜKSEK · Veri bütünlüğü / ekonomi] Turnuva sıralaması eşitlikte belirsiz → ilk-3 ödülü rastgele dağılıyor, haftada 3'ten fazla ödül talep edilebilir
- **Kanıt:** `app/api/customer/tournament/route.ts:29-35` (`orderBy: { _max: { starsCollected: 'desc' } }`, ikincil sıralama yok), `:145-148` (POST sırayı her istekte yeniden hesaplar), `prisma/schema.prisma:1088` (`@@unique([userId, gameType, weekKey])` — sıra başına tekillik YOK), `lib/minigame-config.ts:318-319` (signal-pipe `maxScore: 10`).
- **Sorun:** Signal-pipe'ta süre sınırı olmadığı için sabırlı her oyuncu 10'a ulaşır; haftalık tabloda çok sayıda 10 eşitliği oluşur. Postgres'te eşit `MAX` değerlerinin `ORDER BY … LIMIT` sırası tanımsızdır. GET'te "1. oldun, 500 puan seni bekliyor" gören kullanıcı POST'ta 4. hesaplanıp "Geçen hafta ödül kazanmadın" alabilir; ya da farklı isteklerde farklı kullanıcılar kendini 1. görüp **her biri** ayrı ayrı 500 puan alabilir (tekillik yalnızca kullanıcı başına). Bu, "net-sıfır/kontrollü basım" ekonomi ilkesini deler. Gerçek DB davranışı canlıda **doğrulanmadı**; mantık açığı koddan kesin.
- **Öneri:** (a) Haftayı kapatan bir cron ile sıralamayı **anlık görüntü** olarak dondurun (`TournamentResult { gameType, weekKey, rank, userId }`, `@@unique([gameType, weekKey, rank])`); claim yalnızca bu tablodan okusun. (b) Deterministik eşitlik bozucu ekleyin: skor eşitse daha az hamle (`taps`), sonra daha kısa süre, sonra daha erken `completedAt`. Bunun için `MiniGameSession`'a `durationSec Int?`, `moves Int?` alanları gerekir. (c) Tavanı olan oyunlarda (signal-pipe gibi) turnuva metriğini "çözülen hat" yerine "toplam verimlilik puanı" (ör. `Σ(minHamle/hamle)×100`) yapın ki tavan dolmasın. Efor: **M**.

### 2. [YÜKSEK · Hata / UX] Kaybedilen oyun "tekrar oynanabilir" görünüyor, ama tam oyun sonunda 409 "Oyun zaten tamamlandı" ile reddediliyor
- **Kanıt:** `complete/route.ts:101` (`status: won ? 'completed' : 'failed'`), `start/route.ts:56-73` (yalnızca `completed` kilitler; `failed` oturumun id'si `canPlay: true` ile geri döner), `complete/route.ts:98-108` (`updateMany where status: 'active'` → `count 0` → 409), `status/route.ts:33` (hub yalnızca `completed`'ı "oynandı" sayar), `use-mini-game.ts:126-128` (hata yolunda istemcinin `won` değeriyle sonuç ekranı kurulur).
- **Sorun:** Kullanıcı 5'ten az hatla "Bitir"e basar → oturum `failed`. Hub kartı oyunu hâlâ "oynanmamış" gösterir; sayfaya dönüp "Hattı Kur"a bastığında oyun açılır, 10 bulmacayı çözer, sonunda kırmızı "Oyun zaten tamamlandı" toast'ı alır; üstelik `won=true` gönderildiği için sonuç ekranında 🏆 "Sinyal Bağlandı!" ile "Ödül için 5 skor gerekiyordu" yan yana çıkar. Bu, tüm generic oyunları etkileyen sistemik bir tuzaktır ve "günde 1 hak" vaadine güveni sarsar.
- **Öneri:** Tek bir "oturum kapandı" kavramı kullanın: start'ta `status !== 'active'` ise kilitleyin (`alreadyPlayed: true, lastResult: {score, won}`) ve hub'daki `status` ucu da `status in ['completed','failed']` saysın. Alternatif ürün kararı "kaybedince 1 ek hak" ise bunu açıkça modelleyin (`attempt Int` + `@@unique([userId, gameType, dayKey, attempt])`). İstemci hata yolunda `won`'u sahte sonuçla göstermemeli; "Bugünün oyunu zaten kaydedilmiş" kilit ekranına düşmeli. Efor: **S**.

### 3. [YÜKSEK · Güvenlik / ekonomi] Skor ve `won` tamamen istemci beyanı; bulmaca sunucuda doğrulanmıyor
- **Kanıt:** `use-mini-game.ts:92-96` (gövde: `{sessionId, score, durationSec, won}`), `complete/route.ts:59-61,81-87` (yalnızca clamp + `minDurationSec: 10` kontrolü), `signal-pipe-game.tsx:38-95` (seviye `Math.random` ile istemcide üretilir, tohum yok), `complete/route.ts:98-106` (`tooFast` olsa bile `won=true` ise oturum `completed` + skor yazılır → liderlik/turnuvaya girer).
- **Sorun:** Oturum açıp 10 sn bekleyen bir betik `{score:10, won:true, durationSec:10}` göndererek her gün 160 puan + 80 XP alır ve haftalık turnuvada 10'luk eşitlik havuzuna girer (Bulgu #1 ile birleşince 500 puanlık ödül şansı). Daha kısa sürede gönderen bot ödül almasa da `completed` olarak liderliğe ve seri sayımına (`complete/route.ts:133-146`) yazılır.
- **Öneri:** Sinyal Bağla deterministik bir bulmaca olduğu için **tam sunucu doğrulaması** ucuzdur: start yanıtında sunucu bir `seed` üretip oturuma kaydeder; istemci seviyeleri tohumlu PRNG ile (aynı `buildLevel` sunucu/istemci ortak `lib/` modülünde) üretir; complete'te hamle günlüğü (`[[level, x, y], …]`) gönderilir; sunucu aynı tohumla seviyeleri yeniden üretip hamleleri oynatır, çözülen hat sayısını ve hamle sayısını kendisi hesaplar. `won` istemciden alınmaz, sunucuda `score >= threshold`'dan türetilir. `tooFast` oturumlar `completed` yerine `flagged` statüsüne alınıp sıralamalardan dışlanır. Şema: `MiniGameSession.seed String?`, `proof Json?`, `moves Int?`. Efor: **M**.

### 4. [ORTA · Mimari / veri tutarlılığı] Admin override'ları oyun sayfasına yansımıyor; sunucunun döndürdüğü `config` yok sayılıyor
- **Kanıt:** `signal-pipe-game.tsx:13` (`const DEF = getMiniGame('signal-pipe')!` — statik registry), `:199,211,223,232,285` (eşik ve maks DEF'ten), `use-mini-game.ts:70,137` (`config` state'i döner ama bileşen kullanmaz), `lib/minigame-config-effective.ts:40-57` (sunucu override'ı uygular), `page.tsx:18-19` (başlık/açıklama hard-coded).
- **Sorun:** Admin eşiği 7'ye çıkarırsa ekran "Hedef: 5 hat" der; kullanıcı 5'te "Bitir"e basar, `won=true` gider, sunucu ödül vermez ve istemci "Kazandın ama ödül eşiğini geçemedin" toast'ı gösterir — kullanıcı açısından haksızlık. Admin oyunu kapatırsa sayfa açık kalır, CTA 403 verir. Başlık/renk override'ı hub'da görünür ama oyun sayfasında görünmez.
- **Öneri:** `page.tsx`'te `getEffectiveMiniGame('signal-pipe')` ile etkin tanımı sunucuda okuyup bileşene prop olarak geçin (`enabled=false` ise "Bu oyun şu an bakımda" boş durumu + hub'a dön). Oyun içi eşik/maks değerlerini start yanıtındaki `config`'ten okuyun (start öncesi lobi için de prop). Efor: **S**.

### 5. [ORTA · UX] Onaysız "Bitir & Skoru Al" butonu ızgaranın hemen altında; tek yanlış dokunuş günün hakkını yakıyor
- **Kanıt:** `signal-pipe-game.tsx:278-284` (ızgaradan `mt-3` uzaklıkta, tam genişlik, vurgulu renk), `:209-212` (onay yok, 0 skorla da bitirir), `complete/route.ts:101`.
- **Sorun:** Mobilde alt sıradaki hücreleri döndürürken parmak kayıp butona değerse oyun anında biter; 5'in altındaysa 💀 "Hat Koptu" ekranı gelir. Ayrıca oyunda süre sınırı olmadığı için "Bitir" aslında tek kayıp kapısı — oyuncu kendini cezalandırmış olur.
- **Öneri:** Butonu ikincil (outline) yapıp ızgaradan uzaklaştırın (HUD satırına "Bitir" simge butonu); eşik altındayken iki adımlı onay ("Şu an 3 hattın var, ödül için 5 gerekiyor. Yine de bitir?") gösterin; eşik geçildiğinde ana CTA'yı "Ödülü güvenceye al" olarak öne çıkarın. Efor: **S**.

### 6. [ORTA · Oyun tasarımı] Gerilim ve ilerleme yok: süre/hamle sınırı, zorluk eğrisi, beceri ölçüsü yok
- **Kanıt:** `signal-pipe-game.tsx:14` (`SIZE = 5` sabit), `:75-86` (dal sayısı sabit `SIZE`), zamanlayıcı yok; `:16-18` `locked` alanı kullanılmıyor; `:128,233` `taps` yalnızca gösteriliyor; `lib/minigame-copy.ts:198` ("Hat Koptu", "Sinyal Kayboldu" kayıp başlıkları — oyunda kaybetme durumu olmadığı halde).
- **Sorun:** 10 seviyenin hepsi aynı zorlukta; zaman ya da hamle sınırı olmadığı için her oyuncu sonunda 10'a ulaşır → skor ayırt edici değil, liderlik doyar (Bulgu #1'i besler), ikinci gün oynama motivasyonu düşer. Duolingo/Candy Crush tarzı "seviye başına 3 yıldız" gibi bir ustalık katmanı yok.
- **Öneri:** (a) Seviye eğrisi: 1-3 → 5×5, 4-7 → 6×6, 8-10 → 7×7; ilerledikçe `locked` (döndürülemez) hücreler ve "köprü/çift kanal" parçaları. (b) Seviye başına "par" hamle (üretimde karıştırma adedinden hesaplanır) → ≤par: 3 yıldız, ≤1.5×par: 2, aksi 1. (c) Toplam oyun süresi (ör. 120 sn) veya seviye başına sinyal "basınç" göstergesi; süre bitince doğal kayıp durumu oluşur ve kayıp metinleri anlam kazanır. (d) Skor = yıldız toplamı (maks 30) → liderlik doymaz. Ödül eşiğini yıldızlara göre yeniden kalibre edin. Efor: **M**.

### 7. [ORTA · Erişilebilirlik] Izgara ekran okuyucu ve klavye için kullanılamaz
- **Kanıt:** `signal-pipe-game.tsx:255-272` (düğmelerde `aria-label` yok; içerik yalnızca SVG), ızgarada `role="grid"`/ok tuşu yönetimi yok, çözüm/akış değişimi için `aria-live` yok; `:194-196` (klavye `click`'inde `clientX=0` → FX konumu bozuk).
- **Sorun:** VoiceOver/TalkBack 25 kez "düğme" okur; hangi hücrenin hangi yönlere bağlı olduğu, enerjili olup olmadığı bilinmez. Klavye kullanıcısı 25 Tab ile gezer.
- **Öneri:** Roving tabindex ile `role="grid"` + ok tuşları, `Enter/Space` = döndür, `R` = ters döndür. Her hücreye dinamik etiket: "Satır 2, sütun 3: köşe boru, üst ve sağ açık, enerjili". Çözümde `aria-live="polite"` ile "Hat 3/10 bağlandı". FX konumu için `e.detail === 0` ise hücrenin `getBoundingClientRect()` merkezini kullanın. Efor: **S-M**.

### 8. [ORTA · UX] "Bugün oynadın" bilgisi ancak CTA'ya basınca geliyor; sonuç ekranı çıkışsız
- **Kanıt:** `use-mini-game.ts:45-50` (ilk fazı her zaman `idle`), `:64-67`; `game-shell.tsx:165-219` (idle ekranında "Hattı Kur" CTA'sı nabızla çağırıyor); `game-shell.tsx:222-305` (sonuç ekranında hiç düğme yok); `page.tsx` (hub'a dönüş bağlantısı yok).
- **Sorun:** Zaten oynamış kullanıcıya nabız atan "Hattı Kur" gösterip tıklayınca kilit ekranı vermek hayal kırıklığı yaratır. Sonuçtan sonra kullanıcı çıkmaz sokakta kalır; Duolingo/Starbucks'ta görülen "sıradaki görev" akışı yok.
- **Öneri:** `page.tsx` sunucu tarafında bugünün oturumunu (`MiniGameSession` `userId+gameType+dayKey`) okuyup başlangıç fazını belirlesin (`initialState: 'fresh' | 'resume' | 'locked'` + son sonuç). Sonuç ve kilit ekranlarına: "Oyun Merkezi'ne dön", "Bugün oynamadığın sıradaki oyun: X" (status ucundaki `playedToday` ile), "Sonucu paylaş" eylemleri; kilit ekranında yerel saate göre "Yeni hak 03:00'te" geri sayımı (şu an "00:00 (UTC)" yazıyor, `game-shell.tsx:323`). Efor: **S**.

### 9. [DÜŞÜK-ORTA · Dil / tutarlılık] Müşteri turnuva kartı admin toast'ını kullanıyor ("Basarili: ", "Dikkat: ")
- **Kanıt:** `game-tournament.tsx:6` (`import { toast } from '@/lib/admin-toast'`), `lib/admin-toast.ts:16-19` (ASCII "Basarili: " öneki — Türkçe karakter yok).
- **Sorun:** Turnuva ödülü alındığında müşteri "Basarili: 🏆 1. oldun — +500 puan!" görür; yönetim paneli tonu ve hatalı yazım, en duygusal anı (ödül) gölgeliyor.
- **Öneri:** `sonner` toast'ını doğrudan kullanın; ödül talebini toast yerine `GameShell`'in kupa/konfeti diliyle tam ekran mini kutlama olarak gösterin. Efor: **S**.

### 10. [DÜŞÜK-ORTA · Görsel] Turnuva kartı tema token'larıyla koyu oyun kabuğunda; açık temada metin okunaksız olabilir
- **Kanıt:** `game-shell.tsx:97-104` (kabuk her temada koyu, metin rengi tanımsız), `game-tournament.tsx:115,150,166-172` (`text-muted-foreground`, `bg-primary/10`, satır adı metin rengi miras), buna karşın `game-leaderboard.tsx:89` (`text-white/90` açıkça).
- **Sorun:** Açık temada miras alınan koyu `foreground` rengi koyu zemin üzerinde neredeyse görünmez olur; liderlik tablosu ise beyaz → iki tablo görsel olarak tutarsız. Görsel olarak tarayıcıda **doğrulanmadı**; koddan çıkarım.
- **Öneri:** GameShell'e `text-white` + `dark` kapsamı (ör. `className="dark"` sarmalayıcı ile token'ları koyu palete zorlamak) verin; turnuva ve liderliği tek bir `GameRankBoard` bileşeninde birleştirin (sekme: "Bu hafta / Tüm zamanlar"). Skor ekini oyuna göre `copy.scoreUnit` ile yapın ("⭐" yerine "hat"). Efor: **S**.

### 11. [DÜŞÜK · Hata] Seviye başlangıçta zaten çözülmüş olabilir; boş hücreler etkileşimli
- **Kanıt:** `signal-pipe-game.tsx:153-161` (yüklemede `flow.has(DST)` kontrolü yok), `:171-187` (çözüm yalnızca dokunuşta kontrol edilir; mask=0 hücreye dokunmak da tetikler), `:88-93` (karıştırma 0 tur içerebilir).
- **Sorun:** Nadiren karıştırma yolu bozmaz; o durumda oyuncu herhangi bir hücreye (boş olana bile) dokunduğunda bedava hat alır. Boş hücreler ses çalar ve sayaç artırır ama işlevsizdir.
- **Öneri:** `buildLevel` sonunda `computeFlow` hedefi içeriyorsa yeniden karıştırın; ayrıca "par" hesabı için minimum karıştırma adedi garanti edin. Mask=0 hücreleri `disabled` + düşük opaklıkla çizin veya dekoratif "kör boru" parçalarıyla doldurun. Efor: **S**.

### 12. [DÜŞÜK · Erişilebilirlik] Uygulama içi "animasyonları azalt" framer döngülerini durdurmuyor; ses kapatma yok
- **Kanıt:** `components/providers.tsx:232` (`MotionConfig reducedMotion="user"` yalnızca OS tercihini izler), `app/globals.css:824-831` (`.reduce-animations` yalnızca CSS animasyonlarını keser), `game-shell.tsx:173-200,232-256` (framer `repeat: Infinity`), `lib/game-sounds.ts:10-13` (ses yalnızca bu tercihle susar).
- **Öneri:** `MotionConfig`'e uygulama tercihini bağlayın (`reducedMotion={prefs.reduceAnimations ? 'always' : 'user'}`); oyun HUD'una kalıcı bir ses aç/kapa düğmesi (localStorage + `game-sounds` modülünde `setMuted`). Efor: **S**.

### 13. [DÜŞÜK · Mimari / ölü kod] Ölü alanlar ve yanıltıcı yorumlar
- **Kanıt:** `signal-pipe-game.tsx:18,40` (`locked` hiç okunmuyor), `:94,154` (`src/dst` döndürülüyor ama kullanılmıyor), `:138-139` (gereksiz `SRC/DST` takma adları ve `useCallback` bağımlılıkları), `:54` (yorum "ağırlıklı" der, kod tekdüze), `lib/minigame-config.ts:312` (`labelKey: 'signal_pipe_game'` hiçbir mesaj dosyasında yok), `fx-layer.tsx:157-159` (parçacık yokken de sürekli rAF).
- **Öneri:** Bulgu #6 ile `locked`'ı gerçek mekaniğe dönüştürün ya da kaldırın; FxLayer döngüsünü yalnızca parçacık varken çalıştırın (boşalınca `cancelAnimationFrame`, yeni efekt gelince başlat) — mobil pil tasarrufu. Efor: **S**.

### 14. [DÜŞÜK · Mimari] Sayfa dosyası 20 oyun sayfasının birebir kopyası
- **Kanıt:** `app/customer/games/signal-pipe/page.tsx` ile `app/customer/games/trust-merge/page.tsx` aynı iskelet (yalnızca başlık/bileşen farklı); `app/customer/games/` altında 21 klasör.
- **Öneri:** `app/customer/games/[game]/page.tsx` dinamik rotası + `registry → next/dynamic` bileşen haritası; `generateMetadata` etkin tanımdan; `enabled`/bugünkü oturum kontrolü tek yerde. Yeni oyun ekleme maliyeti bir satıra iner, Bulgu #4 ve #8 tek seferde tüm oyunlarda çözülür. Efor: **M**.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Günün bulmacası (ortak tohum) + paylaşılabilir sonuç kartı** — Wordle/Duolingo tarzı: herkes aynı 10 seviyeyi çözer, sonuç "🟦🟦🟨… 34 hamle, 2:41" kartı olarak paylaşılır; turnuva adil, sosyal yayılım ücretsiz.
2. **Seviye yıldızları ve ustalık katmanı** — par hamleye göre 1-3 yıldız, kişisel en iyi, "mükemmel hat" serisi; Spotify Wrapped benzeri haftalık "en verimli bağlantın" özeti.
3. **İpucu ekonomisi** — puanla satın alınan "bir hücreyi doğru yöne çevir" ipucu (Starbucks Rewards'taki puan harcama döngüsünün oyun içi karşılığı; puan havuzundan net düşüş, mint değil).
4. **Akıllı lobi** — sayfa açılışında bugünkü durum, seri (🔥), bu haftaki sıran ve "ödüle 2 hat kaldı" gibi kişiselleştirilmiş hedef; Revolut/Monzo'nun "tek bakışta durum" kartı hissi.
5. **Oturum devamı** — yenileme/arka plana atma sonrası ızgara ve ilerleme korunur (sunucu tohumu + hamle günlüğü ile ücretsiz gelir).
6. **Sonuç sonrası yönlendirme** — "Sıradaki oyun", "Oyun Merkezi", "Ödül kataloğunda bu puanla ne alabilirsin" köprüsü.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 2-3 dakikalık, sakin ama ustalık isteyen günlük bir "akış" bulmacası. Kullanıcı sayfayı açar açmaz bugünkü durumunu görür; her seviyede "sinyal akışı"nın borulardan kaynağa doğru akarak hedefe varmasını izlemenin tatmini yaşanır; günün sonunda paylaşılabilir bir sonuç ve adil bir haftalık sıralama vardır.

**Yerleşim (mobil öncelikli):**
- **Üst şerit (HUD):** Seviye `3/10` · yıldız toplamı · hamle/par (`7/6`) · ince süre çubuğu · ses ve "bitir" simge düğmeleri (sağda, küçük, onaylı).
- **Arena:** Kare ızgara; kaynak sol kenardan dışarı taşan "anten" ağzıyla, hedef sağ kenarda sunucu simgesiyle (etiketler ilgili hücrenin hizasında, köşe emoji yerine 16-20px SVG). Kilitli hücreler cıvatalı metal doku.
- **Alt panel:** "İpucu (20 puan)" ve "Geri al" ikincil düğmeleri; Bitir düğmesi burada değil.
- **Lobi:** Durum kartı (bugün oynandı mı / devam et / başla) + "Bu hafta / Tüm zamanlar" sekmeli tek sıralama + nasıl oynanır 3 kareli mini animasyon.
- **Sonuç:** Yıldız dağılımı, en verimli seviye, ödül rozeti, paylaş kartı, "sıradaki oyun" CTA'sı.

**Motion / 3D (yerinde ve ölçülü):** 3D gereksiz — 2D SVG doğru tercih. Eklenmesi gerekenler: döndürmede 90° yaylı (spring) dönüş animasyonu (şu an anında maske değişiyor, yalnızca `whileTap` sallanması var); akış dolduğunda borular boyunca `stroke-dashoffset` ile kaynaktan hedefe ilerleyen ışık (150-250 ms/hücre); hedefe ulaşınca sunucu simgesinde kısa "nabız" ve mevcut şok dalgası. Konfeti yalnızca ödülde kalsın (seviye başına konfeti fazla). Tüm bunlar `useReducedMotion` + uygulama tercihine bağlı olarak anında duruma geçmeli.

**Veri / API değişiklikleri:**
- `MiniGameSession`'a `seed String?`, `proof Json?`, `moves Int?`, `durationSec Int?` (veya genel `meta Json`).
- `POST /start` → `{ sessionId, seed, config }`; `POST /complete` → `{ sessionId, moveLog }`; sunucu `lib/minigames/signal-pipe-core.ts` (istemciyle paylaşılan saf modül) üzerinden skoru/yıldızı/hamleyi hesaplar, `won`'u kendisi türetir.
- `status` ucu `failed`'ı da "oynandı" saysın; start `failed`'ı kilitlesin.
- Turnuva: hafta kapanışında cron ile `TournamentResult` anlık görüntüsü (`@@unique([gameType, weekKey, rank])`), eşitlik bozucu `(score desc, moves asc, durationSec asc, completedAt asc)`; claim yalnızca anlık görüntüden.
- `page.tsx` → sunucuda `getEffectiveMiniGame` + bugünkü oturum okuması; `enabled=false` boş durumu.

---

## Çakışmalar / birleştirme önerisi

- **Oyun mekaniği çakışması yok:** Signal-pipe, oyun merkezindeki tek "boru/akış" bulmacası; `trust-merge` (2048), `memory-match`, `word-spot` gibi bulmacalardan mekanik olarak ayrışıyor — **kaldırılmamalı**.
- **Sayfa kabuğu çakışması var:** `page.tsx` 20+ oyun sayfasıyla birebir aynı; `app/customer/games/[game]/page.tsx` dinamik rotasına **birleştirilmeli** (Bulgu #14). Bu, etkin yapılandırma, `enabled` kontrolü, bugünkü oturum ve metadata'yı tek yerde çözer.
- **Sıralama bileşenleri çakışması:** `GameTournament` ve `GameLeaderboard` aynı lobi ekranında alt alta, farklı stil/dil ile ("(sen)" vs "Sen", beyaz vs tema token'ı, "⭐" eki) iki ayrı tablo gösteriyor → tek sekmeli `GameRankBoard` bileşenine birleştirilmeli.
- **Sistemik etki:** Bulgu #1, #2, #3, #4 ve #8 generic oyun altyapısında (`use-mini-game`, `[game]/start|complete`, `tournament`) olduğu için düzeltme tüm mini oyunlara aynı anda fayda sağlar; signal-pipe tavanlı skoru nedeniyle turnuva eşitlik sorununu en çok tetikleyen oyunlardan biridir.

---

## Doğrulama (şüpheci inceleme)

Yöntem: kod salt okunur yeniden okundu (`app/api/customer/tournament/route.ts`, `app/api/customer/games/[game]/start|complete/route.ts`, `app/api/customer/games/status/route.ts`, `lib/use-mini-game.ts`, `lib/tournament-core.ts`, `components/customer/games/signal-pipe-game.tsx`, `components/customer/games/game-shell.tsx`, `prisma/schema.prisma`). DB'ye, sunucuya, teste dokunulmadı; canlı Postgres plan davranışı ölçülmedi.

### 1. Turnuva ödülünde eşitlik belirsizliği — **DOĞRULANDI** (kısmen koşullu)

- **Kesin olan kısım:** `weeklyRanking` (`tournament/route.ts:29-35`) yalnızca `_max.starsCollected desc` ile sıralıyor; ikincil anahtar yok. SQL standardı ve Postgres, eşit değerli satırların `ORDER BY ... LIMIT` sırasını garanti etmez. Signal-pipe'ta `maxScore: 10` (`lib/minigame-config.ts:318`), oyunda süre sınırı yok ve hedefe ulaşınca 10'da otomatik bitiyor (`signal-pipe-game.tsx` `solvedRef.current >= DEF.maxScore` → `endGame(true)`), dolayısıyla haftalık en iyi skorda 10'da çok oyunculu eşitlik beklenen durum. Kimin 1-3. sayılacağı **keyfî** (adil olmayan ödül dağılımı) — bu kesin.
- **Koşullu olan kısım (>3 ödül):** `TournamentRewardClaim` yalnızca `@@unique([userId, gameType, weekKey])` (`schema.prisma:1088`); `(gameType, weekKey, rank)` tekilliği veya hafta-başı ödül sayısı sınırı yok. POST sırayı her istekte yeniden hesaplıyor (`route.ts:143-148`) ve claim penceresi bir hafta boyunca açık. Aynı veri üzerinde aynı plan büyük olasılıkla aynı sırayı üretir; ancak hafta içinde tablo büyür, `autovacuum ANALYZE` istatistikleri günceller ve planlayıcı `HashAggregate` ↔ `Sort+GroupAggregate` / paralel toplama arasında geçebilir → eşitler arasındaki sıra değişir. Ayrıca eşitlikten bağımsız deterministik bir yol da var: ilk 3'teki bir kullanıcı hesabını silerse `MiniGameSession` `onDelete: Cascade` (`schema.prisma:504`) ile kaybolur, 4. sıradaki kullanıcı 3.'ye kayar ve o da ödül alır.
- **Yeniden üretim (mantıksal):** W hafta 12 kullanıcı 10'da bitirdi. Pazartesi A/B/C kendini 1-3. görüp 500/300/150 alır. Çarşamba plan değişince D/E/F ilk 3'te görünür ve onlar da talep eder → aynı hafta için 6 ödül (950 yerine 1.900 puan). Ya da GET `pendingReward` gösterir, POST farklı sıra hesaplayıp 400 döner.
- **Not:** Önerilen kapanış-anı anlık görüntü (`TournamentResult`, `@@unique([gameType, weekKey, rank])`) + deterministik eşitlik bozucu doğru çözüm; en azından `ORDER BY max desc, min(completedAt) asc, userId asc` ham sorgu ile sıra deterministik yapılmalı.

### 2. Failed oturum tekrar başlatılabiliyor ama complete 409 dönüyor — **DOĞRULANDI**

- Signal-pipe'ta "Bitir" `endGame(solved >= rewardThreshold)` çağırıyor (`signal-pipe-game.tsx` `giveUp`) → 5'in altında `won=false`. `complete/route.ts:101` oturumu `failed` yapar.
- `status/route.ts:33` yalnızca `status: 'completed'` sayar → hub oyunu "bugün oynanmadı" gösterir. `start/route.ts:56-73` yalnızca `completed`'ı kilitler; `failed` kaydın id'sini `canPlay: true` ile geri verir (yorum "yarım kalan aktif oturum" diyor ama durum kontrol edilmiyor).
- Kullanıcı ikinci kez tam oynar; `complete/route.ts:73` `failed`'ı geçirir, `:98-108` `updateMany where status:'active'` → `count 0` → `:177-181` 409 "Oyun zaten tamamlandı".
- İstemci `use-mini-game.ts:126-128` hata yolunda `won` değerini koruyarak sonuç kurar; `game-shell.tsx` `result.won` ise 🏆 + "Kazandın" başlığı, `rewarded=false` olduğu için de "Ödül için 5 skor gerekiyordu" notunu birlikte gösterir — 10/10 çözen kullanıcıya çelişkili ekran.
- **Yeniden üretim:** Oyunu başlat → 2 hat çöz → "Bitir" → hub'a dön (oynanmamış görünür) → tekrar başla → 10 hattı çöz → kırmızı toast "Oyun zaten tamamlandı" + kupa + "ödül eşiği" metni. Puan basımı yok (ekonomi etkisi yok); etki UX ve güven. Şiddet: orta.

### 3. Skor ve `won` istemci beyanı; sunucu çözümü doğrulamıyor — **DOĞRULANDI**

- `complete/route.ts:59-61` skoru yalnızca `maxScore`'a sıkıştırır; `won` doğrudan gövdeden gelir (`:86`). Seviyeler istemcide üretiliyor (`buildLevel`), sunucuda tohum/hamle kaydı yok. Tek savunma `minDurationSec: 10` (`:81-83`), sunucu saatiyle ölçüldüğü için betik sadece 10 sn bekler.
- **Yeniden üretim:** Oturumlu CUSTOMER: `POST /api/customer/games/signal-pipe/start` → 10 sn bekle → `POST .../complete {sessionId, score:10, durationSec:10, won:true}` → 160 puan + 80 XP (+ günün ilk oyunuysa seri XP'si). Her gün tekrarlanabilir.
- **Daha önemli alt bulgu (kesin):** `tooFast` olsa bile `won=true` ise durum `completed` ve `starsCollected=10` yazılıyor (`:99-105`). `weeklyRanking` yalnızca `status:'completed'` filtreliyor → 0 sn bekleyen betik ödülsüz ama **turnuvaya 10 ile giriyor**; seri hesabı da (`:133-137`) bu günleri sayıyor. Bu, Bulgu 1 ile birleşince her hafta 500/300/150'lik ödül havuzuna oynamadan aday olmayı mümkün kılıyor.
- **Ölçek notu:** Günlük oyun ödülü, gerçek oyuncunun aynı gün alabileceğinin aynısı (oyun başına günde 1 hak, `@@unique([userId, gameType, dayKey])`); yani "sınırsız basım" değil, "oynamadan basım". Yüksek şiddetli kısım turnuva ve tooFast'ın sıralamaya yazılmasıdır. Önerilen tohum + hamle kaydı + paylaşılan saf çekirdek ile sunucu-tarafı doğrulama doğru yön; en kısa vadede `tooFast` oturumlar `failed`/`flagged` yazılmalı ve turnuvadan dışlanmalı.
