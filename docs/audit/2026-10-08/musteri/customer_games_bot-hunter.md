# /customer/games/bot-hunter

**Amaç:** Müşterinin günde 1 kez oynadığı, 10 turda 6 profilden "bot" olanları işaretleyip gerçek kullanıcıları koruduğu mini oyun; eşik (6/10) aşılırsa 150 puan + 75 XP, ayrıca günlük seri bonusu, başarımlar, tüm zamanlar liderliği ve haftalık turnuva (ilk 3'e 500/300/150 puan).

**Genel puan: 5/10** · **Karar: yeniden tasarla** (kabuk/ekonomi altyapısı korunur; oynanış çekirdeği ve paylaşılan oturum yaşam döngüsü yeniden kurgulanmalı)

Dosyalar: `app/customer/games/bot-hunter/page.tsx`, `components/customer/games/bot-hunter-game.tsx`, `components/customer/games/game-shell.tsx`, `components/customer/games/fx-layer.tsx`, `components/customer/games/game-leaderboard.tsx`, `components/customer/games/game-tournament.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `app/api/customer/games/[game]/{start,complete,leaderboard}/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma:493` (MiniGameSession).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Mutlu yol çalışıyor; ancak süre dolunca otomatik değerlendirme bayat state ile yapılıyor, kaybeden kullanıcı için "günde 1 hak" kilidi bozuk, yarıda bırakıp yeniden başlatarak sınırsız deneme mümkün. |
| UX | 5/10 | Akış net ve hızlı, ama oyun 2 saniyede çözülebilecek kadar bariz (robot emojisi = bot), sonuç ekranından çıkış yolu yok, kaybedince çelişkili mesajlar. |
| Görsel | 7/10 | Neon radar, holografik kart, FX katmanı tutarlı ve etkileyici; radar süpürmesi framer inline transform yüzünden merkezden kayık render ediliyor. |
| Mimari | 5/10 | Registry + generic API + ortak kabuk iyi fikir; fakat skor/kazanma tamamen istemcide üretilip sunucuya "güven bana" diye gönderiliyor, admin override'ları bu sayfada yok sayılıyor. |
| Performans | 7/10 | Hafif DOM oyunu; sürekli dönen rAF döngüsü, 6 kart × backdrop-blur ve sonsuz radar animasyonu düşük uçlu mobilde gereksiz yük. |
| Erişilebilirlik + mobil | 3/10 | Süre ayarlanamıyor/duraklatılamıyor (WCAG 2.2.1), kartlarda `aria-pressed`/durum etiketi yok, 9–10px düşük kontrastlı metin, uygulama içi "animasyonları azalt" framer animasyonlarını durdurmuyor, ses kapatma yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum + rol kontrolü | ÇALIŞIYOR | `app/customer/games/bot-hunter/page.tsx:10-13` | CUSTOMER değilse `/auth/signin`'e atar; `callbackUrl` yok, giriş yapmış bayi/admin de "giriş" ekranına düşer. |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | `title: 'Bot Avcısı \| QRateX'` + layout template `%s \| Müşteri alanı` → "Bot Avcısı \| QRateX \| Müşteri alanı" çift sonek; marka "QRateX" yazımı tutarsız. |
| 3 | Masaüstü sayfa başlığı (DashboardPageHeading) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Mobilde `hidden`; masaüstünde GameShell başlığıyla çift başlık; açıklama registry açıklamasından farklı ikinci bir kopya. |
| 4 | Admin override (başlık/açıklama/emoji/renk/eşik) | BOZUK | `bot-hunter-game.tsx:13,188-198`, `lib/minigame-config-effective.ts:40-56` | Sayfa statik `getMiniGame()` kullanıyor; admin'in `MiniGameConfig` override'ı sadece hub'da ve sunucu ödül hesabında geçerli. Eşik değişirse istemci "kazandın" der, sunucu ödül vermez. |
| 5 | Neon kabuk çerçevesi (ızgara, köşe aksanları) | ÇALIŞIYOR | `game-shell.tsx:97-129` | |
| 6 | Başlangıç ekranı (emoji, başlık, açıklama, ipucu şeridi) | ÇALIŞIYOR | `game-shell.tsx:165-188`, `lib/minigame-copy.ts:68-76` | Oyuna özel kişilik metni var. |
| 7 | "🛰️ Taramayı Başlat" CTA → `POST /start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79` | Hata toast'ı ile idle'a döner. |
| 8 | Günde 1 hak kilidi | BOZUK | `app/api/customer/games/[game]/start/route.ts:56-73`, `complete/route.ts:98-108` | Yalnız `completed` kilitliyor; `failed` ve yarım `active` oturum yeniden oynatılıyor (bkz. Bulgu 1, 2). |
| 9 | "Bugün zaten oynandı" kilit ekranı | KISMİ | `game-shell.tsx:73,308-331`, `use-mini-game.ts:64-67` | Sadece CTA'ya basıldıktan sonra öğreniliyor; sayfa açılışında durum çekilmiyor; kaybedene hiç gösterilmiyor. |
| 10 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | "Radar kalibre ediliyor…" kopyası var. |
| 11 | Haftalık turnuva paneli (sıralama, ödül havuzu) | KISMİ | `game-tournament.tsx:53-181`, `app/api/customer/tournament/route.ts:28-39` | 10 puan tavanında eşitlik kırıcı yok → ödül sırası belirsiz (Bulgu 4); tema token'ları (`text-muted-foreground`, `bg-primary/10`, `text-yellow-600`) koyu neon kabukta kontrastı belirsiz. |
| 12 | Turnuva geri sayımı | ÇALIŞIYOR | `game-tournament.tsx:77-82,116-119` | Dakikalık yerel azaltma; görsel amaçlı. |
| 13 | Geçen hafta ödülünü talep et | ÇALIŞIYOR | `game-tournament.tsx:84-97`, `tournament/route.ts:128-181` | Sunucu sırayı yeniden hesaplar, atomik tek-claim + `points_credited`. Müşteri bileşeni `@/lib/admin-toast` import ediyor (`game-tournament.tsx:6`). |
| 14 | Tüm zamanlar liderliği | KISMİ | `game-leaderboard.tsx:24-112`, `leaderboard/route.ts:47-80` | Skor tavanı 10 olduğundan tablo hızla 10'larla doyar; eşitlikte sıra belirsiz; ağ hatasında "Henüz skor yok — ilk rekoru sen kır!" yanıltıcı boş durum gösterir (`game-leaderboard.tsx:40,55-60`). |
| 15 | HUD — can kalpleri | ÇALIŞIYOR | `bot-hunter-game.tsx:202-210` | Ekran okuyucuya can sayısı söylenmiyor. |
| 16 | HUD — tur sayacı | ÇALIŞIYOR | `bot-hunter-game.tsx:212` | |
| 17 | HUD — kombo göstergesi (≥2) | ÇALIŞIYOR | `bot-hunter-game.tsx:213-215` | |
| 18 | HUD — skor (pop animasyonu) | ÇALIŞIYOR | `bot-hunter-game.tsx:217-219` | |
| 19 | Radar süpürme animasyonu | KISMİ | `bot-hunter-game.tsx:231-240` | Framer `animate={{rotate}}` inline `transform` yazar, Tailwind 3 `-translate-x-1/2 -translate-y-1/2`'yi ezer → radar sağ-alta kayık (Bulgu 7). |
| 20 | Tarama süresi ilerleme çubuğu | ÇALIŞIYOR | `bot-hunter-game.tsx:243-252` | Sadece görsel; sayısal süre/erişilebilir metin yok. |
| 21 | Tur üretimi (6 profil, 1–3 bot, karıştırma) | KISMİ | `bot-hunter-game.tsx:33-58` | Botlar robot emojisi + `promo_bot_5` gibi adlarla anında belli; insanlarda ad ile handle uyuşmuyor (`:46` `HUMAN_NAMES[i % …]`). Oyunun "tespit" katmanı fiilen yok (Bulgu 5). |
| 22 | Profil kartını işaretle / kaldır | ÇALIŞIYOR | `bot-hunter-game.tsx:181-184,267` | `aria-pressed` yok, odak halkası yok. |
| 23 | "✓ Tara & Onayla" butonu | ÇALIŞIYOR | `bot-hunter-game.tsx:318-326` | `lockRef` + `disabled` çift tıklamayı engelliyor. |
| 24 | Süre dolunca otomatik değerlendirme | BOZUK | `bot-hunter-game.tsx:172-179,126-130` | Bayat closure: zamanlayıcı turun başındaki (hiç işaretsiz) `profiles` ile değerlendirir; kullanıcının işaretleri yok sayılır, mesaj her zaman "Bot kaçtı!" (Bulgu 3). |
| 25 | Tur değerlendirme (mükemmel / yanlış suçlama / bot kaçtı) | ÇALIŞIYOR | `bot-hunter-game.tsx:130-166` | Yalnız manuel onayda doğru. |
| 26 | Gerçek kimlik ifşası (kırmızı/yeşil çerçeve, rozet) | ÇALIŞIYOR | `bot-hunter-game.tsx:273,292-309` | Neden bot olduğunu açıklamıyor. |
| 27 | Kombo bonusu (her 3 mükemmel turda +1) | ÇALIŞIYOR | `bot-hunter-game.tsx:137-151` | Oyuncuya kural hiçbir yerde anlatılmıyor. |
| 28 | Zorluk artışı (tur süresi 6,5 sn → 4 sn) | ÇALIŞIYOR | `bot-hunter-game.tsx:171` | Bot sayısı/ipuçları zorlaşmıyor, sadece süre. |
| 29 | Erken bitiş (skor = maxScore) | ÇALIŞIYOR | `bot-hunter-game.tsx:152-155` | Taşma (11) bu kural setinde 10 turda matematiksel olarak oluşmuyor. |
| 30 | Oyun sonu "kazandı" hesabı | KISMİ | `bot-hunter-game.tsx:94-95` | Can biterse skor ≥6 olsa bile kayıp; sonuç ekranı "Ödül için 6 skor gerekiyordu" diyor (Bulgu 6). |
| 31 | FX katmanı (burst, ring, floatText, shockwave, konfeti) | ÇALIŞIYOR | `fx-layer.tsx:166-255`, `bot-hunter-game.tsx:144-165` | `reduce-animations` sınıfında kapanıyor. rAF döngüsü parçacık yokken de dönüyor (`fx-layer.tsx:79-158`). |
| 32 | Ses efektleri | ÇALIŞIYOR | `lib/game-sounds.ts:10-31`, `bot-hunter-game.tsx:11` | Yalnız "animasyonları azalt" ile susuyor; bağımsız ses aç/kapa yok. |
| 33 | Haptik titreşim | ÇALIŞIYOR | `lib/game-sounds.ts:157-165` | |
| 34 | `POST /complete` ödül doğrulama | KISMİ | `complete/route.ts:59-87` | Sunucu yalnız tavan + min süre (8 sn) kontrolü yapıyor; skor ve `won` istemcinin beyanı (Bulgu 2). |
| 35 | Atomik tek-claim + `points_credited` olayı | ÇALIŞIYOR | `complete/route.ts:97-171` | Ekonomi invariant'larına uyuyor. |
| 36 | Günlük seri bonusu (+10 XP, her 3. gün +30) | ÇALIŞIYOR | `complete/route.ts:115-150` | `GameStreakClaim` unique ile yarışsız. |
| 37 | Yeni başarım tespiti + bildirim | ÇALIŞIYOR | `complete/route.ts:90-94,196-215` | Önce/sonra iki kez tam istatistik hesabı (maliyetli). |
| 38 | Ödül bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194` | |
| 39 | Sonuç ekranı (trofe, rastgele başlık, skor, ödül rozeti) | ÇALIŞIYOR | `game-shell.tsx:222-305` | Eşik notu statik registry değerini gösterir. |
| 40 | Ödül konfetisi | ÇALIŞIYOR | `game-shell.tsx:19-31,86-94` | |
| 41 | Toast'lar (ödül, seri, başarım, hata) | ÇALIŞIYOR | `use-mini-game.ts:112-127` | Hata durumunda toast + "ödülsüz" sonuç birlikte çıkıyor; yanlış ödül notu (Bulgu 1). |
| 42 | "Her gün 00:00 (UTC) sıfırlanır" bilgisi | KISMİ | `game-shell.tsx:323`, `start/route.ts:10-12` | Türkiye için 03:00; kullanıcıya yerel saatle söylenmiyor. |
| 43 | Pasif (admin kapattı) oyun | KISMİ | `start/route.ts:34-39` | Sayfa yine render edilir, ancak CTA'dan sonra 403 toast'ı. Sayfa seviyesinde "bu oyun kapalı" durumu yok. |
| 44 | Global hata / yükleniyor sınırları | ÇALIŞIYOR | `app/customer/error.tsx`, `app/customer/loading.tsx` | Oyuna özel değil. |
| 45 | Sonuçtan sonra yönlendirme (Oyun Merkezi'ne dön / sıradaki oyun) | EKSİK | `game-shell.tsx:222-305` | Sonuç ve kilit ekranında hiçbir buton yok; mobilde başlık da gizli olduğundan çıkmaz sokak. |
| 46 | Duraklat / sekme değişince bekle | EKSİK | `bot-hunter-game.tsx:172-179` | `visibilitychange` dinlenmiyor; sekmeden çıkan oyuncu can kaybeder. |
| 47 | Nasıl oynanır / ipucu öğreticisi | EKSİK | `bot-hunter-game.tsx:327-329` | Tek satır 10px metin. |
| 48 | Ses aç/kapa düğmesi | EKSİK | `lib/game-sounds.ts:10-13` | |
| 49 | Yarıda bırakma uyarısı / oturumu kayıp sayma | EKSİK | `start/route.ts:69-73` | Sonuç: sınırsız yeniden deneme. |
| 50 | i18n (EN) | EKSİK | `bot-hunter-game.tsx:27-30,146,165,325-328`, `lib/minigame-copy.ts:68-76` | Layout i18n kullanırken oyun tamamen sabit Türkçe; `labelKey: 'bot_hunter_game'` mesaj dosyalarında yok. |

Durum sayımı: ÇALIŞIYOR 30 · KISMİ 11 · BOZUK 3 (#4, #8, #24) · SAHTE 0 · EKSİK 6 (toplam 50 satır).

> Not: #21 tamamen rastgele/istemci üretimi olsa da "sahte veri" değil, oyun içeriğidir; bu yüzden SAHTE değil KISMİ işaretlendi.

---

## Bulgular

### 1. Kaybeden oyuncu için "günde 1 hak" kilidi bozuk; ikinci oyun 409 ile biter
- **Önem:** yüksek · **Kategori:** hata / veri tutarlılığı · **Efor:** S
- **Kanıt:** `complete/route.ts:101` kayıpta `status: 'failed'` yazar. `start/route.ts:56-73` yalnız `status === 'completed'` için `alreadyPlayed` döndürür; aksi halde "yarım kalan aktif oturum" diyerek **aynı** `sessionId` ile `canPlay: true` döner. `complete/route.ts:98-108` ise `where: { status: 'active' }` ile claim eder → `count 0` → `409 'Oyun zaten tamamlandı'`. `status/route.ts:33` hub'da da yalnız `completed` sayıldığından kaybeden oyuncu hub'da "oynanmadı" görür.
- **Sorun:** Kaybeden kullanıcı aynı gün tekrar oynayabiliyor; 10 tur emek verip sonunda kırmızı hata toast'ı alıyor. Bu ikinci denemede kazanırsa `use-mini-game.ts:128` sonucu `rewarded:false` ile kurduğu için ekranda "Ödül için 6 skor gerekiyordu" yazar — oyuncu 6+ yapmış olsa bile. Kilit ekranı (`game-shell.tsx:308`) kaybedene hiç gösterilmez.
- **Öneri:** Oturum durum makinesini netleştirin: `active → completed | failed | abandoned`. `start` tarafında "bugün terminal durumda bir oturum var mı" (`status in ['completed','failed']`) kontrolü yapılmalı ve `alreadyPlayed` + önceki sonuç (`starsCollected`, `rewardPoints`, `won`) döndürülmeli; kilit ekranı bu veriyle "Bugünkü sonucun: 4/10 — yarın 03:00'te yeni hak" şeklinde zenginleştirilmeli. Hub'ın `playedToday` sorgusu da aynı terminal küme ile hizalanmalı. Bu değişiklik generic API'de olduğundan 20 oyunun tamamını düzeltir.

### 2. Skor ve "kazandı" bilgisi istemci beyanı; yarıda bırakıp yeniden başlatarak sınırsız deneme
- **Önem:** yüksek · **Kategori:** güvenlik / ekonomi · **Efor:** L
- **Kanıt:** Turlar, bot bayrakları ve skor tamamen istemcide (`bot-hunter-game.tsx:33-58,130-141`). `complete/route.ts:15-22,59-87` gelen `score` ve `won`'u yalnız `maxScore` tavanına ve `minDurationSec=8` sınırına göre kontrol eder. `start/route.ts:69-73` aktif oturumu her çağrıda aynen geri verir.
- **Sorun:** (a) Herhangi bir oturumlu müşteri `POST /start` → 8 sn bekle → `POST /complete {score:10, won:true, durationSec:9}` ile her gün 150 puan + 75 XP + seri XP alır; aynı desen 20 oyunda ~3.000 puan/gün demektir ve aynı sahte 10'luk skor haftalık turnuvada ilk 3'e (500/300/150 puan) girer. (b) Script bile gerekmeden: oyun kötü giderken sayfayı yenileyen oyuncu aynı `active` oturumla sıfırdan başlar; `complete` çağrılana kadar sınırsız deneme hakkı vardır. "Günde 1 hak" vaadi fiilen geçersiz.
- **Öneri:** İki katmanlı çözüm: (1) **Yeniden başlatma = kayıp**: `start` mevcut `active` oturumu bulursa onu `abandoned` olarak kapatıp `alreadyPlayed` döndürmeli (ya da en fazla 1 "bağlantı koptu" toleransı, `resumeCount` alanıyla). (2) **Sunucu otoriteli tur üretimi**: `start` yanıtında tohum (seed) + tur başına profil listesi (bot bayrağı olmadan) üretip Redis'te (Upstash, TTL ~5 dk) saklayın; istemci her turun sonunda `{round, flaggedIds, ts}` olay günlüğü gönderir veya `complete`'te toplu günlük yollar; sunucu skoru kendi tohumundan yeniden hesaplar, tur süre sınırlarını zaman damgalarıyla doğrular. Bu oyun ayrık turlu olduğu için sunucu doğrulaması ucuz ve tam yapılabilir — bu, oyun ailesi için referans uygulama olur. `points_credited` + velocity dedektörü (mevcut) ikinci savunma hattı olarak kalır.

### 3. Süre dolunca otomatik değerlendirme bayat state kullanıyor
- **Önem:** yüksek · **Kategori:** hata (oynanış) · **Efor:** S
- **Kanıt:** `bot-hunter-game.tsx:172-179` efekt yalnız `[scanKey, playing]` bağımlılığıyla kurulur (eslint uyarısı susturulmuş, `:178`). Zamanlayıcı içindeki `resolveRound`, turun ilk render'ındaki closure'dır ve `profiles` o anda tamamen `flagged:false`'tur (`:50`). `resolveRound` (`:130-131`) bu bayat listeyle değerlendirir.
- **Sorun:** Oyuncu tüm botları doğru işaretlemiş ama "Onayla"ya yetişememişse yine can kaybeder; yanlışlıkla insan işaretlemiş olsa bile mesaj her zaman "Bot kaçtı! -1" çıkar (`:165`, `noFalsePositive` bayatta hep `true`). Aynı anda ekrandaki ifşa (`:273`) güncel state'i gösterdiği için kullanıcı "doğru işaretlediğim halde can gitti" çelişkisini görür. Kuralın "süre dolarsa otomatik onay" mı yoksa "süre dolarsa kayıp" mı olduğu belirsiz.
- **Öneri:** Kuralı ürün olarak sabitleyin (önerim: süre dolunca **mevcut işaretlerle otomatik onay**, ama "Onayla" ile erken bitirene süre bonusu). Teknik olarak `profilesRef` tutup `resolveRound`'u ref üzerinden okuyun veya değerlendirmeyi `setProfiles(prev => …)` içinde yapın; zamanlayıcıyı `useEffect` + bayat closure yerine tur başlangıç zamanı (`roundStartedAt`) ve tek bir `requestAnimationFrame`/interval sayacına bağlayın. Tur mantığını saf bir `reduceRound(state, action)` fonksiyonuna taşımak (useReducer) hem bu hata sınıfını kapatır hem de Bulgu 2'deki sunucu tarafı yeniden hesaplamayla aynı kodu paylaşmayı sağlar.

### 4. Turnuva ve liderlikte eşitlik kırıcı yok; ödül sırası belirsiz
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ekonomi · **Efor:** M
- **Kanıt:** `tournament/route.ts:29-38` ve `leaderboard/route.ts:47-53` yalnız `_max.starsCollected desc` ile sıralar. `lib/minigame-config.ts:108` `maxScore: 10`. Ödüller `lib/tournament-core.ts:13` `{1:500, 2:300, 3:150}`.
- **Sorun:** 10/10 yapan her oyuncu tavanda eşitlenir; ilk 3'ün kim olacağı Postgres'in grup sırasına kalır ve `GET` ile `POST` arasında bile değişebilir (oyuncu "Geçen hafta 2. oldun" görür, talep ettiğinde 400 alabilir). Gerçek puan dağıtan bir sıralamada deterministik olmayan sonuç kabul edilemez. Ayrıca kayıp (`failed`) oturumlar sıralamaya hiç girmez.
- **Öneri:** Skoru tek boyutlu tavanlı sayıdan **bileşik skora** çevirin: doğruluk + kalan süre + kombo (ör. 0–1000). `MiniGameSession`'a `scoreDetail Json` / `durationMs Int` ekleyip eşitlikte "daha kısa süre, sonra daha erken `completedAt`" kuralını uygulayın; turnuva haftası kapanırken sonuçları `TournamentResult` tablosuna **dondurun** (snapshot) ki GET ve POST aynı sıralamayı okusun.

### 5. Oyunun "tespit" katmanı yok: botlar emoji ve adla anında belli
- **Önem:** orta · **Kategori:** ürün / oynanış tasarımı · **Efor:** L
- **Kanıt:** `bot-hunter-game.tsx:27-30` bot avatarları 🤖👾🛸📡, adları `promo_bot_5`, `free_gift_x`; insanlar 🧑👩 ve "Ayşe K.". İnsan handle'ı `HUMAN_NAMES[i % len]` ile seçildiği için ad ile uyuşmuyor (`:46`). Zorluk yalnız süre kısalması (`:171`).
- **Sorun:** 6/10 ödül eşiği beceri gerektirmiyor; 150 puanlık günlük ödül neredeyse garanti. Qratex'in değer önerisi (sahte yorum/bot tespiti) ile bağ kurabilecek eğitici bir an boşa gidiyor. Ad–handle uyuşmazlığı ise "insan" kartlarını da şüpheli gösteriyor, istemeden kural karmaşası yaratıyor.
- **Öneri:** Profil kartlarını **sinyal tabanlı** yapın: hesap yaşı, yorum sayısı, son 24 saatteki gönderi hızı, profil fotoğrafı var/yok, yorum metni örneği (jenerik/kopya), takipçi oranı. Avatarlar nötr (baş harf/illüstrasyon) olsun; botların bir kısmı insan gibi görünsün, bazı insanlar "yeni hesap" gibi şüpheli dursun. Turlar ilerledikçe sinyal sayısı azalsın/ince farklar artsın. İfşa anında "Neden bot? → 3 dakikada 40 yorum" gibi tek satırlık açıklama gösterin (Duolingo'nun doğru/yanlış sonrası açıklama deseni). Profil havuzu sunucuda üretilirse (Bulgu 2) aynı veri hem anti-cheat hem içerik için kullanılır.

### 6. Can bitince skor eşiği geçilse bile kayıp + çelişkili mesaj
- **Önem:** orta · **Kategori:** UX / kural netliği · **Efor:** S
- **Kanıt:** `bot-hunter-game.tsx:95` `won = score >= threshold && lives > 0`; `game-shell.tsx:290-293` ödülsüz durumda "Ödül için 6 skor gerekiyordu" yazar; `use-mini-game.ts:114-116` kazanıp ödülsüz kalanda "eşiği geçemedin" toast'ı (oysa sebep `tooFast` veya admin eşiği olabilir — `complete/route.ts:226` `tooFast` döndürüyor ama istemci okumuyor).
- **Sorun:** Oyuncu 7 skor yapıp 3. canını son turda kaybederse "6 skor gerekiyordu" mesajıyla karşılaşır; ödülsüzlük nedeni yanlış anlatılır.
- **Öneri:** `complete` yanıtına makine-okunur `outcome` alanı ekleyin (`rewarded | below_threshold | out_of_lives | too_fast | disabled`) ve sonuç ekranı mesajını bundan türetin. Kural kartında "3 can + 6 temiz tur" açıkça yazılsın.

### 7. Radar süpürmesi merkezden kayık render ediliyor
- **Önem:** orta · **Kategori:** görsel hata · **Efor:** S
- **Kanıt:** `bot-hunter-game.tsx:231-240` `className="… left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"` + `animate={{ rotate: 360 }}`. Proje Tailwind 3.4 (`package.json:140`) — translate sınıfları `transform` özelliğine yazılır; framer-motion 11 dönme animasyonunda element'e inline `transform: rotate(...)` basar ve sınıftaki translate'i ezer (projede daha önce ölçülerek kayda geçmiş tuzak). Görsel olarak headless tarayıcıda **doğrulanmadı**; kod düzeyinde mekanizma kesin.
- **Sorun:** 260px'lik radarın sol-üst köşesi arenanın merkezine oturur; süpürme sağ-alt çeyreği tarar, 2 sütunlu mobil ızgarada kartların bir kısmının üstünden geçerken diğer kısmı hiç "taranmaz".
- **Öneri:** Konumlamayı framer'a bırakın (`style={{ x: '-50%', y: '-50%' }}` veya dış sarmalayıcıda konumlama + iç elemanda rotate). Radar boyutunu sabit 260px yerine arena boyutuna göre (`inset-[-20%]` + `aspect-square`) ölçekleyin.

### 8. Erişilebilirlik: süre ayarlanamıyor, kart durumları duyurulmuyor, okunaksız metin
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** M
- **Kanıt:** Tur süresi sabit 4–6,5 sn, duraklatma yok (`bot-hunter-game.tsx:171-179`); kart `Motion.button`'ında `aria-pressed`/`aria-label` yok (`:259-281`); handle `text-[9px] text-white/40` (`:298`), ipucu `text-[10px] text-white/40` (`:327`); HUD canlar yalnız renkli ikon (`:204-208`); uygulama içi "animasyonları azalt" (`globals.css:825-831`) yalnız CSS transition'larını kısar — framer'ın JS animasyonları (`:238-239` sonsuz radar, `game-shell.tsx:175-176` yüzen emoji) durmaz; `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) yalnız OS tercihini dinler.
- **Sorun:** WCAG 2.2.1 (Timing Adjustable) ihlali; ekran okuyucu kullanıcısı hangi kartı işaretlediğini ve kaç canı kaldığını bilemez; mobilde 9px metin okunmuyor; uygulamadaki erişilebilirlik ayarı oyunda yarım uygulanıyor.
- **Öneri:** "Rahat mod" seçeneği (süre ×2, ödül aynı ama turnuvaya girmez) ekleyin; kartlara `aria-pressed={p.flagged}` ve `aria-label="Ayşe K., @ayse, bot olarak işaretli"` verin; tur sonucunu `aria-live="polite"` bölgesiyle duyurun; minimum 12px metin ve WCAG AA kontrast; `reduce-animations` sınıfını `MotionConfig reducedMotion="always"` ile bağlayan küçük bir sarmalayıcı (ör. `useAppReducedMotion`) yazıp tüm oyun kabuğuna uygulayın.

### 9. Admin override'ları bu sayfada yok sayılıyor
- **Önem:** orta · **Kategori:** mimari / tutarlılık · **Efor:** S
- **Kanıt:** `bot-hunter-game.tsx:13` `getMiniGame('bot-hunter')!` statik registry; `use-mini-game.ts:70` `config` alınıyor ama `bot-hunter-game.tsx` hiç kullanmıyor; sayfa başlığı ve açıklaması `page.tsx:18-19`'da sabit. `lib/minigame-config-effective.ts:44-56` başlık/açıklama/emoji/renk/eşik override'larını destekliyor.
- **Sorun:** Admin eşiği 8'e çekerse istemci 6'da "kazandın" der, sunucu ödül vermez ve ekran "6 gerekiyordu" yazar; admin başlığı/rengi değiştirirse hub yeni, oyun sayfası eski kimliği gösterir.
- **Öneri:** `page.tsx` sunucu bileşeninde `getEffectiveMiniGame('bot-hunter')` çağırıp (60 sn `unstable_cache` zaten var) sonucu prop olarak `BotHunterGame`'e geçin; `enabled === false` ise sayfada "Bu oyun şu an kapalı" durumu render edin; `generateMetadata` ile başlığı override'dan üretin. Oynanış eşiği istemcide yalnız gösterim içindir, karar sunucuda kalır.

### 10. Sonuç/kilit ekranında çıkış yok; günlük durum sayfa açılışında bilinmiyor
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi · **Efor:** S
- **Kanıt:** `game-shell.tsx:222-305` ve `:308-331` yalnız liderlik içerir, buton yok; `page-heading.tsx:21` başlık mobilde gizli; `use-mini-game.ts:46-48` başlangıç `phase='idle'`, `alreadyPlayed=false` — durum ancak CTA'ya basınca öğrenilir.
- **Sorun:** Bugün oynamış kullanıcı yine "▶ Taramayı Başlat"ı görür, basınca kilit ekranına düşer (boş vaat). Sonuçtan sonra Oyun Merkezi'ne veya sıradaki oynanmamış oyuna geçiş yolu yok; Duolingo/Starbucks'ın "sıradaki görev" momentumu kayboluyor.
- **Öneri:** Sayfa sunucu bileşeninde bugünkü oturumu (`findUnique userId_gameType_dayKey`) okuyup `initialStatus` prop'u geçin; kilitliyse doğrudan "bugünkü sonucun + geri sayım (yerel saatle)" ekranını gösterin. Sonuç ekranına "Sıradaki oyun: X (+160 puan)" ve "Oyun Merkezi" CTA'ları ekleyin (`/api/customer/games/status` verisiyle oynanmamış ilk oyunu önerin).

### 11. Sekme değişince oyun duraklamıyor
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `bot-hunter-game.tsx:167,172-179` zincirleme `setTimeout`'lar; `visibilitychange` dinleyicisi yok. Bileşen unmount olduğunda `setTimeout(nextRound, 1200)` ve `setTimeout(() => endGame(true), 600)` temizlenmiyor (`:153,167`).
- **Sorun:** Bildirime bakmak için uygulamadan çıkan mobil kullanıcı turları ve canlarını kaybeder. Unmount sonrası `endGame` tetiklenip `complete` isteği atılabilir.
- **Öneri:** Tek bir oyun saati (`useGameClock`) ile `document.hidden` iken duraklatın, geri dönüşte 3-2-1 sayacı gösterin; tüm zamanlayıcıları ref'te tutup cleanup'ta temizleyin. Bu, ortak kabuğa eklenirse tüm oyunlar kazanır.

### 12. Liderlik hata durumunu "boş" gibi gösteriyor; küçük tutarlılık sorunları
- **Önem:** düşük · **Kategori:** hata yönetimi / tutarlılık · **Efor:** S
- **Kanıt:** `game-leaderboard.tsx:40` `catch(() => {})` → `:55-60` "Henüz skor yok — ilk rekoru sen kır!"; `game-tournament.tsx:6` müşteri bileşeni `@/lib/admin-toast` kullanıyor, `use-mini-game.ts:4` ise `sonner`; `page.tsx:7` + `layout.tsx:20` çift başlık soneki; `game-shell.tsx:323` "00:00 (UTC)".
- **Sorun:** Ağ hatası "kimse oynamadı" gibi okunuyor; iki farklı toast kaynağı stil/yığın tutarsızlığı riski; Türk kullanıcı için sıfırlama saati yanlış anlaşılıyor.
- **Öneri:** Liderlik/turnuva verisini tek bir SWR anahtarına (`/api/customer/games/bot-hunter/lobby`) toplayıp hata/yeniden dene durumunu ayrı render edin; toast'ı tek kaynakta birleştirin; sıfırlama saatini `Intl.DateTimeFormat` ile yerel saate çevirip geri sayım olarak gösterin; metadata'da yalnız `title: 'Bot Avcısı'` bırakın.

### 13. Performans: boşta dönen rAF ve ağır kompozisyon
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `fx-layer.tsx:79-158` parçacık olmasa da her karede `clearRect` ile döner; `bot-hunter-game.tsx:270` 6 kartta `backdrop-blur-sm` + çoklu `boxShadow`, altında sürekli dönen `conic-gradient` (`:231-240`); `complete/route.ts:90-94,199` `computeAchievementStats` iki kez tam çalışıyor.
- **Sorun:** Düşük uçlu Android'de sürekli GPU kompozisyonu ve pil tüketimi; `complete` gecikmesi sonuç ekranının açılmasını yavaşlatıyor.
- **Öneri:** FX döngüsünü parçacık kuyruğu boşken durdurup `burst` çağrısında yeniden başlatın; kartlarda `backdrop-blur`'u kaldırıp düz yarı saydam zemin kullanın; başarım hesaplamasını `after()` ile yanıttan sonra yapıp sonucu bildirim/sonraki lobi çağrısında gösterin veya tek "önce" hesabı + bu oturumun delta'sıyla türetin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Öğrenme anı (Duolingo):** Her ifşada "neden bot?" açıklaması ve oyun sonunda "bugün öğrendiğin 3 bot sinyali" kartı — Qratex'in güven/sahte yorum misyonuna bağlanır.
2. **Kişisel en iyi + ilerleme (Duolingo/Spotify Wrapped):** "Kişisel rekorun 8 → bugün 9", haftalık doğruluk yüzdesi, toplam yakalanan bot sayacı; sonuç ekranında paylaşılabilir mini kart ("Bu hafta 47 bot avladım").
3. **Sıradaki görev momentumu (Starbucks Rewards):** Sonuç ekranında "bugün 3 oyun daha açık, +480 puan potansiyeli" ve tek dokunuşla sıradaki oyun.
4. **Pratik / rahat mod:** Ödülsüz sınırsız antrenman (beceri kazanımı) + daha uzun süreli erişilebilir mod; günlük ödüllü deneme ayrı kalır.
5. **Ses/titreşim ayarı ve duraklatma (Revolut/Monzo mobil his):** HUD'da ses ikonu, sekme değişiminde otomatik duraklatma, oyun içi "çık" onayı.
6. **Arkadaş/lig bağlamı:** Tüm zamanlar tablosu yerine lig/arkadaş sıralaması ve "bir üstündeki oyuncuya 1 puan" hedefi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60–90 saniyelik, gerçekten beceri isteyen bir "güven analisti" anı. Oyuncu bitirdiğinde hem ödül hem de "artık sahte hesabı nasıl tanırım" bilgisi kazanmış olmalı.

**Yerleşim (mobil öncelikli):**
- **Lobi:** Üstte bugünkü durum kartı (oynanabilir / bugünkü sonucun + yerel saatle geri sayım), altında tek büyük CTA, "Nasıl oynanır" (3 adımlı, bir kez gösterilen bottom-sheet), haftalık turnuva ve kişisel rekor sekmeleri (liderlik + turnuva aynı sekmeli kartta, ikisi alt alta değil).
- **Oyun:** Üstte ince HUD (can, tur, kombo, ses, duraklat); ortada 2×3 profil kartı — her kartta nötr avatar + 3–4 sinyal çipi (hesap yaşı, gönderi hızı, metin örneği); altta yapışkan "Onayla" butonu, süre çubuğu butonun kenarına entegre.
- **Tur sonu:** 1,2 sn'lik ifşa + en belirleyici sinyalin altı çizili açıklaması.
- **Sonuç:** Skor, doğruluk %, kişisel rekor farkı, ödül/çıktı nedeni (`outcome`), "sıradaki oyun" ve "Oyun Merkezi" CTA'ları, paylaşılabilir kart.

**Motion/3D (ölçülü):** Radar süpürmesini tek, doğru merkezlenmiş, düşük opaklıklı bir arka plan öğesi olarak tutun; kart girişlerinde mevcut yay animasyonu yeterli. Three.js gerekmez — bu oyunun değeri okunabilirlik ve karar hızında; 3D kart eğimi (`rotateY` hover) dokunmatikte anlamsız, kaldırılabilir. İfşada bot kartı için kısa "glitch" (CSS clip-path, 200 ms) + insan kartı için yeşil onay nabzı yeterli. `reduce-animations` ve OS tercihi tek kaynaktan framer'a bağlanmalı.

**Veri/API değişiklikleri:**
- `POST /api/customer/games/bot-hunter/start` → `{ sessionId, seed, rounds: ProfilePublic[][] (bot bayrağı yok), roundTimeMs[] }`; gizli cevap anahtarı Redis'te `minigame:{sessionId}` (TTL 10 dk).
- `POST …/complete` → `{ sessionId, events: [{round, flaggedIds, submittedAtMs}] }`; sunucu skor + bileşik skor + `outcome` hesaplar.
- `MiniGameSession`'a `durationMs`, `scoreDetail Json`, `status` için `abandoned` değeri; `start` terminal-durum kontrolü (`completed|failed|abandoned`).
- Turnuva için haftalık snapshot tablosu ve deterministik eşitlik kırıcı.
- Sayfa sunucu bileşeni: `getEffectiveMiniGame` + bugünkü oturum durumu → `initialStatus`, `config` prop'ları; `generateMetadata`.
- Oyun mantığını saf `botHunterEngine.ts` (useReducer + sunucuda yeniden hesaplama için aynı modül) olarak ayırın.

---

## Çakışmalar / birleştirme önerisi

- **Tematik çakışma:** `/customer/games/truth-vs-fake` (gerçek/sahte yorum ayır), `/customer/games/review-detective` (sahte yorumu bul), `/customer/games/word-spot` (sahte olanı bul) ve `/customer/games/spam-defense` (botlara ateş) ile aynı "sahteyi ayıkla" fantezisini paylaşıyor (`lib/minigame-config.ts:87-133,255-259`). 20 oyunluk katalogda bu dört-beş oyunun mekanikleri farklı olsa da anlatısı aynı; hub'da kullanıcıya fark hissettirmiyor.
- **Öneri:** Bot Avcısı'nı kaldırmak yerine **"profil/hesap düzeyi"** tespitine konumlandırın (Truth vs Fake = yorum metni, Review Detective = dosya/vaka, Bot Avcısı = hesap davranışı). Hub'da bu üçünü "Güven Akademisi" koleksiyonu altında gruplayıp ortak bir "güven analisti" ilerleme çubuğu (haftalık doğruluk) ile bağlamak, kopyalık hissini değer zincirine çevirir.
- **Platform düzeyi:** Bulgu 1, 2, 4, 9, 10, 11 generic altyapıda (`use-mini-game.ts`, `game-shell.tsx`, `[game]/start|complete`, turnuva) — tek seferde düzeltilip tüm mini oyunlara yayılmalı; bu sayfa ayrı bir yama almamalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (salt okunur; DB/sunucu/test çalıştırılmadı). Okunan dosyalar: `app/customer/games/bot-hunter/page.tsx`, `components/customer/games/bot-hunter-game.tsx`, `components/customer/games/game-shell.tsx`, `lib/use-mini-game.ts`, `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/tournament-core.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/points-wallet.ts`, `prisma/schema.prisma` (`MiniGameSession`).

### 1. Yarıda bırak-yeniden başlat ile sınırsız deneme + istemci beyanlı skor — **DOĞRULANDI**

- `start/route.ts:56-73`: mevcut oturum `completed` değilse (yani `active`) aynı `sessionId` ile `canPlay:true` döner; deneme sayacı ya da "başlatıldı" kilidi yok.
- `complete/route.ts:15-22, 59-61, 81-87`: sunucu yalnız `score`'u `maxScore`'a (10) sıkıştırır, `won` bayrağına ve `durationSec`'e güvenir; tek sunucu kontrolü `startedAt`'tan bu yana ≥ `minDurationSec` (8 sn). Oyunun tur/profil/bot bilgisi tamamen istemcide üretiliyor (`bot-hunter-game.tsx:33-58`) ve değerlendiriliyor (`:126-168`); sunucu cevabı bilmiyor.
- `creditPointsAndXp` (`lib/points-wallet.ts:27-43`) herhangi bir günlük üst sınır uygulamıyor; `points_credited` olayı yalnız görünürlük için yazılıyor.
- Turnuva (`tournament/route.ts:28-35`) `starsCollected` maksimumunu `status:'completed'` ile sıralıyor; yani beyan edilen 10 doğrudan tavan skordur.

**Yeniden üretim:** Oturum açık müşteri: `POST /api/customer/games/bot-hunter/start` → 9 sn bekle → `POST …/complete {sessionId, score:10, durationSec:9, won:true}` → 150 puan + 75 XP + seri XP; haftalık turnuvada tavan skor. Script olmadan da: oyun kötü giderken (ör. 2 can gitti) sekme yenilenir → `phase='idle'` → "Oyna" → aynı `active` oturum döner, oyun sıfırdan başlar; kaybetmeden önce yenilendikçe deneme sınırsız. Not: bir kez kaybedip `complete` gönderilirse oturum `failed` olur ve bu kaçış kapanır (bkz. iddia 2) — yani sınırsızlık "bitirmeden yenileme" ile geçerli.

### 2. Kaybeden oyuncu (failed) aynı gün tekrar oynatılıyor, sonunda 409 — **DOĞRULANDI**

- `complete/route.ts:101`: kaybedende `status:'failed'` yazılır.
- `start/route.ts:57`: yalnız `completed` kilitlenir; `failed` için `:69-73` yorumdaki "yarım kalan aktif oturum" varsayımıyla aynı `sessionId` + `canPlay:true` döner (şema `prisma/schema.prisma:498` `active | completed | failed`).
- `complete/route.ts:73` yalnız `completed`'ı 409'lar; `failed` geçer, ardından `:98-108` `updateMany where status:'active'` → `count 0` → `:177-181` 409 "Oyun zaten tamamlandı".
- `use-mini-game.ts:98-99,126-128` hatayı toast'lar ve `rewarded:false, won` ile sonuç kurar → `game-shell.tsx:290-293` "Ödül için 6 skor gerekiyordu" (gerçek neden 409 iken yanıltıcı). Kilit ekranı (`game-shell.tsx:73`) hiç görünmez çünkü `alreadyPlayed` hiç true olmaz.
- Hub: `status/route.ts:33` yalnız `completed` sayar → kaybeden için kart "bugün oynanmadı" görünür.

**Yeniden üretim:** Bugün Bot Avcısı'nda 3 canı kaybet → sonuç ekranı → sayfayı yenile → "Oyna" yine açılır, 10 tur oynanır (kazanılsa bile) → "Oyun zaten tamamlandı" hata toast'ı + "ödül eşiği" metni; kullanıcı emeği boşa gider. Düzeltme: `start`'ta terminal durum kümesi (`completed|failed`) kilitlenmeli, hub da aynı kümeyi "bugün oynandı" saymalı.

### 3. Süre dolunca otomatik değerlendirme bayat state ile — **DOĞRULANDI**

- `bot-hunter-game.tsx:172-179`: zamanlayıcı efekti yalnız `[scanKey, playing]` ile yeniden kurulur (eslint uyarısı `:178`'de susturulmuş). Efekt, `nextRound` içindeki `setProfiles(buildRound())` + `setScanKey` (`:100,103`) toplu render'ından sonra çalışır; o render'daki `resolveRound` closure'ı yeni turun profillerini **tamamı `flagged:false`** (`:50`) olarak yakalar.
- Oyuncunun `toggleFlag`'leri (`:181-184`) `profiles` state'ini değiştirir ve `resolveRound`'u yeniden oluşturur, ama efekt yeniden kurulmadığı için zamanlayıcı eski closure'ı çağırır (`:175`).
- Eski closure'da en az bir bot var (`buildRound` `botCount ≥ 1`, `:34`) ve hiçbiri işaretli değil → `botsCorrect=false`, `noFalsePositive=true` → her zaman can kaybı ve mesaj her zaman "Bot kaçtı! -1" (`:165`). İfşa ise güncel state'i render eder (`:273-308`), işaretli kartlar ekranda doğru görünür.

**Yeniden üretim:** Bir turda tüm botları doğru işaretle, "Tara & Onayla"ya basmadan süre çubuğunun dolmasını bekle → doğru işaretlemeye rağmen can gider, "Bot kaçtı!" yazar. Tersine yanlışlıkla insan işaretlenmişse de mesaj yine "Bot kaçtı!" olur. Düzeltme: profilleri `profilesRef` ile ayna tutmak ya da değerlendirmeyi `setProfiles(prev => …)`/reducer içinde güncel değerle yapmak; daha iyisi `botHunterEngine` reducer'ına taşımak.

### 4. Turnuva ödül sıralamasında deterministik eşitlik kırıcı yok — **DOĞRULANDI** (adalet hatası kesin; GET/POST tutarsızlığı teorik)

- `tournament/route.ts:29-35`: `groupBy` `orderBy` yalnız `_max.starsCollected desc`, `take:100`; ikincil anahtar yok. Postgres eşit satırları belirli bir sırada döndürmeyi garanti etmez (HashAggregate + top-N sort kararsızdır).
- Skor tavanı 10 (`lib/minigame-config.ts:108`); dürüst oyunda bile kombo bonusuyla 8 mükemmel turda 10'a ulaşılır (`bot-hunter-game.tsx:138-155`), iddia 1 ile ise trivial. Dolayısıyla 10'da çok sayıda eşitlik beklenir; ilk 3 ödülü (`lib/tournament-core.ts:13`, 500/300/150) eşitler arasında keyfi dağılır, 4.+ eşitler ödülsüz kalır.
- GET (`:83-96`) ve POST (`:145-153`) sıralamayı ayrı sorgularla yeniden hesaplar; kapanmış haftanın verisi değişmese de plan/fiziksel satır sırası değişirse aynı kullanıcı GET'te "2." görüp POST'ta 400 alabilir. Bu kısım plan değişikliğine bağlı olduğundan kod okumasıyla kesin üretilemez — teorik.

**Yeniden üretim (adalet):** Geçen hafta 4+ kullanıcı Bot Avcısı'nda 10 skorla tamamladı → ödül alan 3 kişi DB'nin döndürdüğü rastgele sıraya göre belirlenir; aynı skoru daha önce yapan kullanıcı ödülsüz kalabilir. Düzeltme: eşitlikte en erken `completedAt` (ilk ulaşan) gibi deterministik bir ikincil anahtar + hafta kapanışında sıralamayı `TournamentWeekSnapshot` tablosuna dondurup GET/POST'un aynı anlık görüntüyü okuması; ayrıca iddia 1 kapanmadan turnuva ödülü fiilen tavan-skor çekilişidir.
