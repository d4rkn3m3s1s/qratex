# /customer/games/guardian-of-trust

**Amaç** · Oyun Merkezi'ndeki 21 mini oyundan biri olan "Güven Muhafızı": yukarıdan düşen olumlu yorum (😊👍⭐) ve bozuk yorum (💢🤬👎☠️) emojilerinin aktığı 360×440 canvas üzerinde kalkanı yatay kaydırıp bozuk yorumları engelleyen, 50 saniyelik, 3 canlı bir yakalama/savunma oyunu. Günde 1 hak; 14 skor eşiğini geçip kazanınca 160 puan + 80 XP, günlük seri XP'si, başarımlar, tüm zamanlar liderliği ve haftalık turnuva (ilk 3'e 500/300/150 puan) ile Qratex'in "güven" anlatısını oyunlaştırmayı hedefliyor.

**Genel puan: 5/10** · **Karar: yeniden tasarla**

Sayfanın kendisi 24 satırlık ince bir sunucu bileşeni; asıl yük ortak altyapıda (`GameShell`, `useMiniGame`, generic `start/complete/leaderboard`, `tournament` uçları) ve 331 satırlık canvas oyununda. Ortak altyapı genel olarak özenli (atomik tek-claim, `points_credited` görünürlüğü, seri bonusu yarış koruması), ancak üç ciddi sorun var: (1) skor tamamen istemciden geliyor ve `tooFast` olsa bile oturum `completed` yazılıyor; haftalık turnuva bu skorlara para (puan) ödüyor ve eşitlikleri kırmıyor → **puan basma yolu**; (2) kaybedilen (`failed`) oturum ertesi `start` çağrısında "aktif" gibi geri veriliyor → kaybeden oyuncu için "günde 1 hak" kırık, tam oyun oynatılıp sonunda 409 hatası gösteriliyor; (3) oyunun çekirdek mekaniği yanlış kurulmuş: çarpışma yalnızca imleç/parmak hareket ettiğinde kontrol ediliyor (sabit duran kalkan hiçbir şeyi engellemiyor) ve "olumlu yorumları koru" fantezisi mekanikte yok (iyi yorumlar oyuncudan bağımsız, pasif puan getiriyor).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oyun döngüsü, HUD, ödül/seri/başarım zinciri çalışıyor; ama çarpışma modeli kırık, kaybedenlerde günlük kilit yok, admin override'ları istemciye yansımıyor. |
| UX | 5/10 | Başlangıç→oyun→sonuç akışı net ve tatmin edici; fakat oyun fantezisi ile mekanik uyuşmuyor, eğitim 11px tek satır, oyun sonu ani kesiliyor, hub'a dönüş/sonraki adım yok, 409 hatası kafa karıştırıcı. |
| Görsel | 6/10 | Neon çerçeve, kalkan dalgası ve parçacıklar şık; ancak kalkan ile "büyük kalkan" power-up'ı aynı 🛡️ ikonunu kullanıyor, canvas retina'da bulanık, turnuva bileşeni açık temada koyu zemine koyu yazı basıyor. |
| Mimari | 6/10 | Registry + generic hook + paylaşılan kabuk iyi bir desen; ama istemci `DEF` registry sabitini kullanıyor, sunucunun döndürdüğü `config` hiç okunmuyor; ödül/turnuva skor doğrulaması yok. |
| Performans | 7/10 | Tek canvas + rAF, ref tabanlı durum, düşük render baskısı; zayıf noktalar: `complete` her çağrıda kullanıcının TÜM oturumlarını iki kez çekiyor, liderlik/turnuva uçları önbelleksiz. |
| Erişilebilirlik + Mobil | 4/10 | Dokunmatik `touch-none` ve haptik iyi; ama klavye kontrolü yok, canvas'ın `aria-label`'ı yok, HUD `aria-live` değil, parmak kalkanın üstünü kapatıyor, OS `prefers-reduced-motion` canvas/konfetiye uygulanmıyor, ses kapatma yok. |

---

## Özellik envanteri

Durum: ÇALIŞIYOR / KISMİ / BOZUK / SAHTE / EKSİK

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (yalnız CUSTOMER) | KISMİ | `proxy.ts:50-75`, `app/customer/games/guardian-of-trust/page.tsx:10-13` | Proxy doğru korur; sayfa içi yedek `redirect('/auth/signin')` var olmayan rotaya gider (giriş sayfası `/auth/login`, `lib/auth.ts:65`). Aynı kalıp 22 sayfada. |
| 2 | Metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | `'Güven Muhafızı \| QRateX'` + layout şablonu `%s \| Müşteri alanı` → "Güven Muhafızı \| QRateX \| Müşteri alanı" çift sonek; marka "QRateX" yazımı diğer yerlerdeki "Qratex" ile tutarsız. |
| 3 | Masaüstü sayfa başlığı + açıklama | ÇALIŞIYOR | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` → mobilde görünmez (bilinçli). Başlık/açıklama sabit kodlu; admin override'ı yansımaz. |
| 4 | Neon oyun kabuğu (ızgara, köşe aksanları, glow) | ÇALIŞIYOR | `components/customer/games/game-shell.tsx:97-129` | Sabit koyu zemin; tema bağımsız. |
| 5 | Başlangıç ekranı: yüzen emoji, başlık, açıklama, ipucu çipi | KISMİ | `game-shell.tsx:165-188`, `guardian-of-trust-game.tsx:11,289-300` | Çalışıyor ama `DEF = getMiniGame(...)` registry sabiti; admin `MiniGameConfig` ile değiştirilen başlık/açıklama/emoji/renk oyun sayfasına yansımaz (hub'a yansır, `status/route.ts:40-48`). |
| 6 | Başlat CTA "✨ Kalkanı Kaldır" + nabız halkası | ÇALIŞIYOR | `game-shell.tsx:189-208`, `lib/minigame-copy.ts:105` | `primeAudio()` ile ses bağlamı hazırlanıyor (`use-mini-game.ts:55`). |
| 7 | "Günde 1 hak" kilidi | BOZUK | `app/api/customer/games/[game]/start/route.ts:56-73`, `[game]/complete/route.ts:101`, `[game]/complete/route.ts:98-108` | Kaybedilen oyun `failed` yazılıyor; `start` yalnız `completed`'i kilitliyor, `failed` oturumu "yarım kalan" diye geri veriyor → oyuncu tam oyunu tekrar oynuyor, sonunda `complete` 409 "Oyun zaten tamamlandı" döner. |
| 8 | "Bugün oynadın" kilit ekranı | KISMİ | `game-shell.tsx:73,308-332`, `use-mini-game.ts:64-67` | Yalnız Başlat'a basınca öğreniliyor (ön kontrol yok); kaybedenlerde hiç görünmüyor (#7). "00:00 (UTC)" bilgisi TR kullanıcısı için 03:00 demek. |
| 9 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | — |
| 10 | Haftalık turnuva geri sayımı | ÇALIŞIYOR | `components/customer/games/game-tournament.tsx:77-82,116-119` | Dakikalık yerel azaltma; sunucu `endsInMs` kaynağı. |
| 11 | Turnuva ödül havuzu (🥇🥈🥉) | ÇALIŞIYOR | `game-tournament.tsx:143-147`, `lib/tournament-core.ts:13` | 500/300/150 sabit. |
| 12 | Turnuva canlı sıralaması | KISMİ | `app/api/customer/tournament/route.ts:28-39`, `game-tournament.tsx:150-170` | Skor tavanı 25 olduğu için eşitlikler kaçınılmaz ve `orderBy` ikincil anahtar içermiyor; açık temada satır yazıları koyu zemine koyu (bkz. B6). |
| 13 | Geçen hafta ödülünü talep et butonu | KISMİ | `tournament/route.ts:80-97,143-181`, `game-tournament.tsx:84-97,123-140` | Atomik tek-claim doğru; ama sıralama deterministik değil (GET'te "ödülün var", POST'ta "kazanmadın" olabilir) ve sahte skorla elde edilebilir (B1). |
| 14 | Turnuvada "kendi sıram" satırı | ÇALIŞIYOR | `game-tournament.tsx:173-179`, `tournament/route.ts:77-78` | İlk 100 içindeyse. |
| 15 | Tüm zamanlar liderliği | KISMİ | `[game]/leaderboard/route.ts:47-84`, `game-leaderboard.tsx:24-96` | `take: 100` → "{total} oyuncu" 100'de takılır, 100 dışındaki oyuncunun sırası `null`; `image` döndürülüyor ama kullanılmıyor. |
| 16 | Liderlik boş durumu | ÇALIŞIYOR | `game-leaderboard.tsx:55-61` | "İlk rekoru sen kır!" |
| 17 | HUD: can kalpleri | ÇALIŞIYOR | `guardian-of-trust-game.tsx:303-307` | Etiketsiz ikonlar. |
| 18 | HUD: skor | ÇALIŞIYOR | `guardian-of-trust-game.tsx:309` | — |
| 19 | HUD: kombo göstergesi (≥3) | ÇALIŞIYOR | `guardian-of-trust-game.tsx:310-312` | Kombo yalnız pasif iyi-yorum inişlerinden artıyor (#24). |
| 20 | HUD: süre sayacı | ÇALIŞIYOR | `guardian-of-trust-game.tsx:235,314` | — |
| 21 | Canvas oyun döngüsü (rAF, spawn, giderek hızlanma) | ÇALIŞIYOR | `guardian-of-trust-game.tsx:101-238` | `dt` 40ms'ye kırpılmış, spawn aralığı 1000→520ms. |
| 22 | Kalkan kontrolü (pointer) | KISMİ | `guardian-of-trust-game.tsx:248-258,322-323` | Kalkan imleci izliyor ama çarpışma yalnız `pointermove/pointerdown` olayında hesaplanıyor (B3). |
| 23 | Bozuk yorumu engelleme (+1, kalkan dalgası, ses) | KISMİ | `guardian-of-trust-game.tsx:260-267` | Sabit tutulan kalkan bozuk yorumu engellemez, içinden geçer. |
| 24 | Olumlu yorumu "koruma" (+1, kombo, her 5'te +1 bonus) | KISMİ | `guardian-of-trust-game.tsx:141-152,278-281` | Mekanik pasif: iyi yorum oyuncu hiçbir şey yapmasa da yere iner ve puan verir; bozuk yorum iyi yorumu "enfekte" etmez. Açıklamadaki fantezi (`lib/minigame-config.ts:160-161`) oynanışta yok. |
| 25 | Bozuk yorum yere inince can kaybı + kombo sıfırlama | ÇALIŞIYOR | `guardian-of-trust-game.tsx:153-162` | Haptik + kırmızı patlama. |
| 26 | Power-up: büyük kalkan (6 sn, menzil 44→64) | ÇALIŞIYOR | `guardian-of-trust-game.tsx:268-272,214-221,255` | İkonu (🛡️) oyuncunun kalkanıyla aynı (`:112` ve `:224`); kalan süre göstergesi yok. |
| 27 | Power-up: yavaşlatma (4 sn, ×0.45) | KISMİ | `guardian-of-trust-game.tsx:134,273-277` | Düşüş yavaşlıyor ama spawn hızı yavaşlamıyor (`:131-132`) → ekranda yığılma; süre göstergesi yok. |
| 28 | Parçacık + kalkan dalgası efektleri | ÇALIŞIYOR | `guardian-of-trust-game.tsx:66-73,168-201,226-232` | Yalnız uygulama içi `reduce-animations` sınıfına uyuyor; OS `prefers-reduced-motion` dikkate alınmıyor. |
| 29 | Ses efektleri (Web Audio) | ÇALIŞIYOR | `lib/game-sounds.ts:8-56`, `guardian-of-trust-game.tsx:9,59-60,149,151,264,270` | Dosyasız sentez, paket maliyeti yok. |
| 30 | Haptik geri bildirim | ÇALIŞIYOR | `lib/game-sounds.ts:158-165` | `reduce-animations`'ta susar. |
| 31 | Kazanma/kaybetme koşulları | KISMİ | `guardian-of-trust-game.tsx:152,162,234,283` | Mantık tutarlı; ama eşik/tavan `DEF`'ten okunuyor, admin override edilirse istemci "kazandın" der, sunucu ödül vermez (B5). |
| 32 | Sonuç gönderimi + sunucu ödül hesabı | ÇALIŞIYOR | `use-mini-game.ts:82-133`, `[game]/complete/route.ts:59-175` | Atomik `updateMany` guard'ı çift ödülü önler; skor tavana sıkıştırılır. Skorun kendisi doğrulanmaz (B1). |
| 33 | Sonuç ekranı: trofe/💀 animasyonu, varyant başlık | ÇALIŞIYOR | `game-shell.tsx:78-84,222-267`, `lib/minigame-copy.ts:107-108` | — |
| 34 | Skor rozeti ("Korunan") | ÇALIŞIYOR | `game-shell.tsx:269-272`, `lib/minigame-copy.ts:109` | — |
| 35 | Ödül kartı / eşik notu | KISMİ | `game-shell.tsx:274-294`, `guardian-of-trust-game.tsx:297` | Not `DEF.rewardThreshold` (14) gösteriyor; sunucu `config.rewardThreshold` döndürse de kullanılmıyor (`use-mini-game.ts:70`, `config` hiçbir yerde okunmuyor). |
| 36 | Konfeti kutlaması | ÇALIŞIYOR | `game-shell.tsx:19-31,86-94` | — |
| 37 | Ödül / seri / başarım toast'ları | ÇALIŞIYOR | `use-mini-game.ts:112-125` | 3-4 toast art arda yığılabiliyor. |
| 38 | Günlük oyun serisi bonusu (XP) | ÇALIŞIYOR | `[game]/complete/route.ts:115-150` | `GameStreakClaim` unique ile yarış korumalı. |
| 39 | Yeni başarım tespiti | ÇALIŞIYOR | `[game]/complete/route.ts:89-94,196-215`, `lib/game-achievement-stats.ts:16-40` | Her tamamlamada kullanıcının tüm oturumları iki kez çekiliyor (P1). |
| 40 | Ödül bildirimi (Notification) | KISMİ | `[game]/complete/route.ts:185-194` | Transaction dışında ve try/catch'siz: başarısız olursa ödül verilmiş ama istemci "Oyun tamamlanamadı" görür. |
| 41 | Sonuç ekranında liderlik | ÇALIŞIYOR | `game-shell.tsx:299-303` | Yeni mount → taze veri. |
| 42 | Canvas mount retry guard | ÇALIŞIYOR | `guardian-of-trust-game.tsx:75-83` | Proje desenine uygun. |
| 43 | Yarım kalan oturumu sürdürme | KISMİ | `start/route.ts:69-73` | Aynı `sessionId` döner ama `startedAt` eski kalır; sayfadan çıkıp dönen oyuncu sınırsız deneme yapabilir (yalnız son sonuç sayılır). |
| 44 | Admin pasifleştirme | KISMİ | `start/route.ts:33-39` | Sayfa yine açılır, oyuncu ancak Başlat'a basınca 403 toast'ı görür; sayfa düzeyinde "oyun kapalı" durumu yok. |
| 45 | Nasıl oynanır / eğitim | KISMİ | `guardian-of-trust-game.tsx:328` | Yalnız oyun sırasında, 11px `text-white/50` tek satır; ilk oyun öncesi gösterim yok. |
| 46 | Turnuva talep toast'ı | KISMİ | `game-tournament.tsx:6,90,93`, `lib/admin-toast.ts` | Müşteri bileşeni admin toast sarmalayıcısını kullanıyor → "Basarili: …" / "Dikkat: …" Türkçe karaktersiz önek. |
| 47 | Oyun sonu anı (game over karesi) | KISMİ | `game-shell.tsx:134-143`, `use-mini-game.ts:89` | `submitting` olunca canvas anında kaldırılıyor; son kare/"kalkan çöktü" anı yok. |
| 48 | Sekme gizlenince duraklatma | EKSİK | `guardian-of-trust-game.tsx:98,130,234` | Süre `Date.now()` ile akıyor; `visibilitychange` dinlenmiyor, duraklat düğmesi yok. |
| 49 | Klavye kontrolü | EKSİK | `guardian-of-trust-game.tsx:318-326` | Yalnız pointer. Kardeş oyunlarda var (`spam-breaker-game.tsx:121-140`, `review-stack-game.tsx:232-240`). |
| 50 | Ekran okuyucu desteği (canvas etiketi, `aria-live` HUD) | EKSİK | `guardian-of-trust-game.tsx:302-326` | — |
| 51 | Hub'a dönüş / "sıradaki oyun" CTA | EKSİK | `game-shell.tsx:222-305` | Sonuç ekranında yalnız "yarın gel" metni. |
| 52 | Retina (DPR) canvas ölçekleme | EKSİK | `guardian-of-trust-game.tsx:318-321` | 360×440 sabit backing store, CSS ile büyütülüyor → 2-3× ekranda bulanık emoji/çizgi. |
| 53 | Ses aç/kapa + liderlik/turnuva hata durumu | EKSİK | `lib/game-sounds.ts:10-13`, `game-leaderboard.tsx:40,55-61`, `game-tournament.tsx:69,106` | Ses yalnız a11y tercihine bağlı; liderlik hatası "Henüz skor yok" gibi görünür, turnuva hatasında bileşen sessizce kaybolur. |

**Sayım:** ÇALIŞIYOR 27 · KISMİ 19 · BOZUK 1 · SAHTE 0 · EKSİK 6 (toplam 53)

---

## Bulgular

### B1 · KRİTİK · Ekonomi/Güvenlik · Haftalık turnuva ödülü istemci skoruna güveniyor, `tooFast` oturumlar da sıralamaya giriyor
- **Kanıt:** `lib/use-mini-game.ts:95` (skor + `won` istemciden), `app/api/customer/games/[game]/complete/route.ts:61` (yalnız tavana sıkıştırma), `:82-87` (`tooFast` yalnız oyun ödülünü sıfırlıyor), `:101` (`status: won ? 'completed' : 'failed'` — `tooFast` olsa da `completed`), `app/api/customer/tournament/route.ts:31` (sıralama `status: 'completed'` + `starsCollected`), `:156-171` (500/300/150 puan kredisi).
- **Sorun:** Herhangi bir müşteri `start` sonrası hiç oynamadan `POST /complete {score: 25, won: true, durationSec: 0}` gönderebilir. Oyun ödülü `tooFast` yüzünden verilmez ama oturum `completed`, `starsCollected=25` olarak yazılır → tüm zamanlar liderliğinin ve haftalık turnuvanın tepesine çıkar; hafta kapanınca `POST /api/customer/tournament` ile 500 puan talep eder. 21 oyunun her biri için aynı yol açık (haftada oyun başına 950 puan havuz). `minDurationSec` korumasının amacı tam olarak bunu durdurmaktı ve turnuva bu korumayı by-pass ediyor. Oyun kredileri `points-caps` ile sınırlanmıyor (yalnız `points_credited` görünürlüğü var, `complete/route.ts:159-171`).
- **Öneri:** (1) Hemen: `complete` içinde `eligible` olmayan oturumları `completed` değil ayrı bir durumla (`flagged`/`failed`) yaz; liderlik ve turnuva sorgularına `rewardPoints > 0` veya `eligible=true` koşulu ekle. (2) Orta vade: sunucu tarafı oynanış doğrulaması — `start` bir `seed` döndürsün, istemci spawn'ları bu seed'le deterministik üretsin, `complete` olay günlüğünü (engellenen/indirilen damla id'leri + zaman damgaları, sıkıştırılmış) göndersin; sunucu aynı seed'le simülasyonu yeniden oynayıp skoru doğrulasın. En azından skor/süre makullük sınırı (bu oyunda saniyede en fazla ~1.2 puan) ve `velocity` dedektörüne turnuva claim'lerinin girmesi. (3) Turnuva ödülünü otomatik değil, "kapanış cron'u + şüpheli skor incelemesi" ile dağıt.
- **Efor:** M (acil yama S, seed+replay doğrulaması L)

### B2 · YÜKSEK · Veri bütünlüğü · Turnuva sıralamasında eşitlik kırılmıyor; ödül talebi deterministik değil
- **Kanıt:** `tournament/route.ts:29-35` (`orderBy: { _max: { starsCollected: 'desc' } }`, ikincil anahtar yok), `lib/minigame-config.ts:164` (`maxScore: 25`), `guardian-of-trust-game.tsx:152,283` (25'te oyun biter).
- **Sorun:** Bu oyunda iyi bir oyuncu 25'e ulaşınca oyun biter; yani her hafta birden çok oyuncu 25'te eşitlenir. Postgres eşit değerlerde sıra garantisi vermez → GET'te "Geçen hafta 2. oldun, ödülün bekliyor" gösterilip aynı kullanıcının POST'unda "Geçen hafta ödül kazanmadın" (`:148-153`) dönebilir; ya da iki ayrı istekte farklı kişiler ilk 3'e girip ikisi de talep edebilir (her biri kendi claim'ini yaratır, toplam ödül 3'ü aşar).
- **Öneri:** Sıralama anahtarını tekilleştir: skor desc → skora ilk ulaşılan zaman asc (`completedAt` min) → `userId`. Bunu groupBy yerine `ROW_NUMBER()` ile tek SQL'de yap ve hafta kapanışında **dondurulmuş** bir `TournamentResult` tablosuna yaz; GET ve POST aynı donmuş tabloyu okusun. Ayrıca skor tavanını (25) kaldırıp süre/hayatta kalma bazlı açık uçlu skora geç ki tepe dağılsın.
- **Efor:** M

### B3 · YÜKSEK · İşlevsellik (oyun mekaniği) · Çarpışma yalnız pointer olayında; sabit kalkan bozuk yorumu engellemiyor
- **Kanıt:** `guardian-of-trust-game.tsx:248-258` (yakınlık/çarpışma yalnız `moveShield` içinde), `:322-323` (yalnız `onPointerMove`/`onPointerDown`), `:126-166` (rAF döngüsünde kalkan çarpışması yok, yalnız zemin kontrolü).
- **Sorun:** Oyuncu kalkanı bozuk yorumun altına koyup beklerse yorum kalkanın içinden geçer, zemine iner ve can götürür. Masaüstünde imleç canvas dışına çıkınca da aynı. Bu, oyunun temel sözünü ("kalkanla engelle") bozan, oyuncunun "haksızlık" hissedeceği bir hata. Ayrıca çarpışma "kalkan merkezine mesafe" (`hypot`) ile hesaplanıyor, çizilen yay (`:221`) ile birebir değil.
- **Öneri:** Çarpışmayı her karede döngü içinde yap (kalkan yayının yatay aralığı × kalkan çizgisinin y bandı, önceki/sonraki kare y'si arasında süpürme testiyle — hızlı damlalar tünellemesin). Pointer olayları yalnız `shieldRef.x` hedefini güncellesin; kalkan hedefe yumuşak takip (lerp) ile gitsin.
- **Efor:** S

### B4 · YÜKSEK · İşlevsellik/UX · Kaybedilen oyunda "günde 1 hak" kırık; oyuncu tam oyun oynayıp 409 hatası alıyor
- **Kanıt:** `[game]/complete/route.ts:101` (kayıp → `failed`), `[game]/start/route.ts:56-73` (yalnız `completed` kilitlenir, diğer her durum "yarım kalan aktif oturum" diye döndürülür), `[game]/complete/route.ts:98-108,177-181` (`status: 'active'` olmayan oturum → 409), `use-mini-game.ts:98-99,126-128` (hata toast'ı + sahte "boş" sonuç), `status/route.ts:33` (hub yalnız `completed`'i "oynandı" sayar).
- **Sorun:** 3 canı bitiren ya da eşiğin altında kalan oyuncu sayfayı yenileyince hub'da oyun hâlâ "oynanabilir" görünür, Başlat çalışır, 50 sn oynar, sonunda kırmızı "Oyun zaten tamamlandı" toast'ı ve ödülsüz sonuç ekranı görür. Ekonomik sızıntı yok ama güven kırıcı bir deneyim, üstelik bu ürünün adı "Güven Muhafızı". Aynı hata tüm generic oyunlarda geçerli.
- **Öneri:** `start`'ta `existing.status !== 'active'` ise kilit dön (`alreadyPlayed: true`, son skor/ödül ile); `status` ucunda `playedToday` için `in: ['completed','failed']` kullan. Sayfa açılışında (SSR'da veya ilk render'da) günün durumunu önceden çek ki kilit ekranı Başlat'a basmadan görünsün.
- **Efor:** S

### B5 · ORTA · Mimari · İstemci registry sabitini kullanıyor, admin override'ları oyun sayfasına yansımıyor
- **Kanıt:** `guardian-of-trust-game.tsx:11` (`DEF = getMiniGame(...)`), `:152,234,283,290-300` (`DEF.maxScore`, `DEF.rewardThreshold`, `DEF.title/accent`), `use-mini-game.ts:70` (`config` set edilir ama bileşende kullanılmaz), `lib/minigame-config-effective.ts:40-56` (admin eşik/tavan/başlık/renk ezebilir), `page.tsx:18-19` (sabit başlık/açıklama).
- **Sorun:** Admin `rewardThreshold`'u 18'e çıkarırsa oyun 14'te "Kazandın" der, sunucu ödül vermez, sonuç ekranı "Ödül için 14 skor gerekiyordu" yazar — yanlış bilgi. `maxScore` artırılırsa istemci 25'te oyunu keser. Başlık/emoji/renk değişikliği hub'da görünür ama oyun sayfasında eski kalır.
- **Öneri:** Sayfayı sunucu bileşeni olarak `getEffectiveMiniGame('guardian-of-trust')` ile besle; etkin tanımı (`enabled` dahil) prop olarak `GuardianOfTrustGame`'e geçir; pasifse sayfa düzeyinde "Bu oyun şu an kapalı" durumu göster. Tüm oyun bileşenleri için `useMiniGame` tek kaynak olsun (`effective` def'i hook döndürsün).
- **Efor:** S

### B6 · ORTA · Görsel/Erişilebilirlik · Turnuva bileşeni tema token'ları kullanıyor, sabit koyu kabukta açık temada okunmuyor
- **Kanıt:** `game-shell.tsx:97-104` (tema bağımsız koyu arka plan), `game-tournament.tsx:46,116,143,151,159-166,174-177` (`text-muted-foreground`, `bg-primary/10`, renk sınıfı olmayan satırlar), `app/globals.css` body `text-foreground`.
- **Sorun:** Açık temada turnuva satırlarındaki oyuncu adları ve "Geçen hafta X. oldun!" metni body'nin koyu `foreground` rengini miras alıp neredeyse siyah zemine basılıyor; `muted-foreground` gri de düşük kontrastlı. (Koddan çıkarım; ekran görüntüsüyle doğrulanmadı.) Aynı kabukta `GameLeaderboard` ise `text-white/…` kullanıyor → iki komşu tablo farklı görsel dil konuşuyor.
- **Öneri:** Oyun kabuğunu açıkça `dark` bağlamına al (kabuk köküne `className="dark"` + `text-white`) ya da turnuva bileşenini kabuğun `--game-accent`/`--game-fg` değişkenleriyle yeniden stillendir. Turnuva ve liderliği tek bir "Sıralama" bileşeninde sekmeli birleştir (Bu hafta / Tüm zamanlar).
- **Efor:** S

### B7 · ORTA · Oyun tasarımı/UX · "Olumlu yorumları koru" fantezisi mekanikte yok; puanın yarısı pasif
- **Kanıt:** `lib/minigame-config.ts:160-161`, `page.tsx:19`, `guardian-of-trust-game.tsx:141-152` (iyi yorum oyuncudan bağımsız iner, puan verir), `:278-281` (kalkanla iyi yoruma dokunmanın etkisi yok), `:106-108` (iyi/bozuk %45/%45).
- **Sorun:** Bozuk yorumlar iyi yorumlara hiçbir şey yapmaz; iyi yorumu "korumak" için yapılacak bir şey yoktur. 50 sn'de ~30 iyi yorum zaten kendiliğinden düşer, yani yeterince uzun hayatta kalan herkes tavana (25) yaklaşır → beceri ayrışmıyor, liderlik ve turnuva doyuyor (B2). Kombo da pasif inişlerle büyüyor; "kombo ustası" hissi oyuncunun eylemine bağlı değil.
- **Öneri:** Mekaniği fantezisine bağla: (a) bozuk yorum bir iyi yorumun yakınından geçerse onu "enfekte" edip kırmızıya çevirsin (oyuncu önce bozuğu engellemeli), (b) iyi yorum kalkana değerse "onaylanır" ve kombo artar (aktif toplama), (c) bozuk engelleme kombosu ayrı çarpan versin, (d) skor tavanı yerine süre + çarpanla açık uçlu skor. Zorluk eğrisini 3 dalga (ısınma / yoğunlaşma / "troll baskını") olarak kurgula.
- **Efor:** M

### B8 · ORTA · Erişilebilirlik/Mobil · Klavye yok, canvas etiketsiz, parmak kalkanı kapatıyor, OS hareket tercihi canvas'a uygulanmıyor
- **Kanıt:** `guardian-of-trust-game.tsx:318-326` (yalnız pointer, `aria-label` yok), `:302-315` (HUD `aria-live` değil), `:253` (kalkan doğrudan parmağın x'inde, `FLOOR-26` y'si parmağın altında), `:23-25` ve `lib/game-sounds.ts:10-13` (yalnız `.reduce-animations` sınıfı; `components/providers.tsx:232` `MotionConfig reducedMotion="user"` sadece framer animasyonlarını kapsar), `game-shell.tsx:19-20` (konfeti de yalnız sınıfa bakar).
- **Sorun:** Klavye/switch kullanıcısı oynayamaz (kardeş oyunlar `spam-breaker`, `review-stack`, `data-snake` klavye destekliyor). Ekran okuyucu oyunun ne olduğunu, can/skor değişimini duymaz. Mobilde parmak kalkanın tam üstünde durduğu için oyuncu kalkanı ve yaklaşan damlayı göremez. OS'te "hareketi azalt" açık olan kullanıcı parçacık/konfeti/titreşimi yine alır.
- **Öneri:** ←/→ ve A/D ile kalkan hareketi (sabit hız + hızlanma), Space ile duraklat; canvas'a `role="img"` + dinamik `aria-label`, HUD'a `aria-live="polite"` özet ("2 can, 11 puan, 23 saniye"). Göreli sürükleme kontrolü: parmağın canvas'ın herhangi bir yerinde yatay hareketi kalkanı kaydırsın (parmak kalkanın altında olmak zorunda kalmasın). `reduced()` yardımcısını `matchMedia('(prefers-reduced-motion: reduce)')` ile birleştiren ortak bir `useReducedMotion` fonksiyonu yap ve tüm oyunlarda kullan.
- **Efor:** M

### B9 · ORTA · Performans · `complete` her çağrıda kullanıcının tüm oyun geçmişini iki kez çekiyor; liderlik/turnuva önbelleksiz
- **Kanıt:** `[game]/complete/route.ts:90-94,199` → `lib/game-achievement-stats.ts:17-20` (sınırsız `findMany`), `[game]/leaderboard/route.ts:47-53` ve `tournament/route.ts:62,83` (her görüntülemede 2-3 `groupBy`), `game-shell.tsx:210-216,299-303` (aynı sayfa ziyaretinde liderlik iki kez çekilir).
- **Sorun:** Düzenli oyuncu yılda ~21 oyun × 365 gün = 7.000+ satır; her tamamlamada iki kez taşınır. Liderlik/turnuva verisi tüm kullanıcılar için aynı olduğu halde her istekte yeniden hesaplanıyor, projede Upstash Redis katmanı varken.
- **Öneri:** Başarım istatistiklerini `UserGameStats` gibi artımlı bir özet tablosunda tut (tamamlamada aynı tx içinde güncellenir) ya da en azından `groupBy` ile sayımları DB'de yap. Liderlik/turnuva üst-10'unu `gameType+weekKey` anahtarıyla 30-60 sn Redis'te tut, `complete`'te ilgili anahtarı geçersiz kıl; kişisel sıra ayrı hafif sorgu olsun.
- **Efor:** M

### B10 · DÜŞÜK · Hata yönetimi · Ödül bildirimi transaction dışında; hata olursa ödül verilmiş ama istemci "tamamlanamadı" görür
- **Kanıt:** `[game]/complete/route.ts:185-194` (try/catch yok), `:230-237` (genel 500), `use-mini-game.ts:126-128`.
- **Sorun:** Puan kredisi commit edildikten sonra `notification.create` atarsa yanıt 500 olur; kullanıcı "Oyun tamamlanamadı" toast'ı ve 0 ödüllü sonuç ekranı görür ama puanı aslında yatmıştır. Ayrıca `beforeUnlocked` hesabı (`:90-94`) korumasız; patlarsa oyun hiç tamamlanamaz.
- **Öneri:** Bildirimi tx içine al ya da başarım bloğu gibi try/catch ile sar (veya `after()` ile arka plana at); `beforeUnlocked` hesabını da kritik yoldan çıkar.
- **Efor:** S

### B11 · DÜŞÜK · Tutarlılık/Dil · Kırık yönlendirme, çift başlık soneki, admin toast öneki, UTC sıfırlama
- **Kanıt:** `page.tsx:12` (`/auth/signin` rotası yok; giriş `/auth/login`), `page.tsx:7` + `app/customer/layout.tsx:18-21`, `game-tournament.tsx:6` + `lib/admin-toast.ts` ("Basarili:", "Dikkat:"), `game-shell.tsx:323` + `start/route.ts:10-12` (gün UTC'de, TR'de 03:00).
- **Sorun:** Küçük ama birikince "özensiz" hissi veren tutarsızlıklar; özellikle Türkçe karaktersiz toast önekleri ve "00:00 (UTC)" ifadesi son kullanıcıya teknik/yabancı geliyor.
- **Öneri:** Yönlendirmeyi `/auth/login`'e düzelt (veya proxy zaten koruduğu için kaldır); metadata'yı yalnız `'Güven Muhafızı'` yap; müşteri bileşenlerinde `sonner`'ı doğrudan kullan; gün sınırını `Europe/Istanbul` ile hesapla ya da arayüzde "Her gece 03:00'te yenilenir" + geri sayım göster.
- **Efor:** S

### B12 · DÜŞÜK · Görsel · Retina bulanıklığı, ikon çakışması, ani oyun sonu
- **Kanıt:** `guardian-of-trust-game.tsx:318-321` (DPR ölçekleme yok), `:112` ve `:224` (power-up ve oyuncu kalkanı ikisi de 🛡️), `game-shell.tsx:134` + `use-mini-game.ts:89` (bitince canvas anında kalkar).
- **Sorun:** Telefonlarda emojiler ve neon çizgiler bulanık; "büyük kalkan" power-up'ı oyuncunun kendi kalkanıyla karıştırılıyor (talimat satırında da iki kez 🛡️ var, `:328`); son can gittiğinde ekran bir kare bile durmadan yükleniyor ekranına geçiyor.
- **Öneri:** `canvas.width = W * dpr` + `ctx.setTransform(dpr,…)`; power-up için ayrı bir glif (💠 veya kalkan+artı), kalan süreyi kalkan etrafında azalan halka ile göster; oyun sonunda 600-800 ms'lik "kalkan çatlar / altın dalga" kapanış animasyonu, sonra sonuç ekranına geçiş.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kişisel rekor ve gelişim geri bildirimi** — Duolingo/Spotify Wrapped gibi "Önceki en iyin 18 → bugün 22, yeni rekor!", "Bu hafta turnuvada 7.'den 3.'lüğe çıktın" anı. Sonuç ekranı yalnız bugünkü skoru gösteriyor; `leaderboard` ucu zaten `me.score` döndürüyor ama karşılaştırma yapılmıyor.
2. **Pratik modu** — Günlük hak bittikten (veya ilk oyundan önce) ödülsüz, sınırsız deneme. Hem öğrenmeyi hem sayfada kalma süresini artırır; ödül ekonomisine dokunmaz (sunucuya hiç gitmez veya `practice: true`).
3. **İlk oyun eğitimi (onboarding)** — 3 adımlı etkileşimli öğretici: "kaydır → bozuğu engelle → power-up topla". Şu an tek satır 11px metin var.
4. **Paylaşım ve sosyal halka** — Revolut/Spotify tarzı skor kartı (görsel) paylaşımı, arkadaşa meydan okuma (referral sistemiyle bağlanabilir), squad içi sıralama.
5. **Duraklatma, ses kontrolü ve klavye** — Her ciddi mobil oyunda standart; burada yok.
6. **Sezon/etkinlik bağı ve ödül görünürlüğü** — Starbucks Rewards gibi "Bu oyun bugün 2× yıldız" etkinlik bandı ve kazanılan puanın cüzdana/ödüle ne kadar yaklaştırdığını gösteren ilerleme ("Ücretsiz kahveye 340 puan kaldı").

---

## Yeniden tasarım vizyonu

**Hedef deneyim.** 60 saniyelik, adil, beceriye dayalı bir "güven kalkanı" oyunu: oyuncunun her eylemi skoru etkiler, kayıp anları "benim hatam" diye okunur, bitişte kişisel gelişim ve bir sonraki adım netleşir. Qratex'in anlatısı (sahte/bozuk yorumlar gerçek yorumları zehirler, sen engellersin) mekaniğin kendisi olur.

**Yerleşim (mobil öncelikli, tek sütun).**
1. **Lobi kartı:** Oyun adı + 1 cümle, bugünkü durum (Oynanabilir / Oynandı – skorun 21 / Yenilenmeye 5 sa 12 dk), kişisel rekor, "Oyna" ve "Pratik" butonları. Durum sayfa açılırken sunucudan gelir (SSR), Başlat'a basmayı beklemez.
2. **İlk kez oynayana öğretici overlay** (atlanabilir, bir kez).
3. **Oyun alanı:** Tam genişlik canvas (DPR ölçekli), üstte kompakt HUD (can / skor / çarpan / süre halkası), power-up süreleri kalkan çevresinde halka. Parmak alanı kalkanın altında değil, canvas'ın tamamı göreli sürükleme yüzeyi. Sağ üstte duraklat + ses ikonları.
4. **Sonuç sahnesi:** 700 ms kapanış animasyonu → skor sayacı (0'dan sayarak), "Yeni rekor!" rozeti, ödül + seri + başarım tek birleşik kartta (toast yağmuru yerine), turnuva sırası değişimi ("↑ 4 sıra"), CTA'lar: "Pratik yap", "Sıradaki oyun: Troll Avcısı", "Paylaş".
5. **Sıralama:** Tek bileşen, iki sekme (Bu hafta / Tüm zamanlar), kendi satırın her zaman sabit görünür, eşitlikte "ilk ulaşan" kuralı açıkça yazılı, ödül havuzu ve kapanış geri sayımı başlıkta.

**Motion/3D (ölçülü).** Bu oyun için three.js gereksiz; 2D canvas doğru tercih. Hareket bütçesi oyun içinde kalmalı: kalkan dalgası, enfeksiyon yayılması (iyi yorumun kırmızıya dönmesi), çarpan yükselince ince ekran sarsıntısı (≤4 px, reduced-motion'da kapalı). Lobi'deki sürekli yüzen emoji + nabız halkası + filtre animasyonu üçlüsünü ikiye indir; sonuç ekranında konfeti yalnız rekor/ödül anında. Tüm efektler ortak `useReducedMotion` (OS + uygulama tercihi) ile kapanır.

**Veri/API değişiklikleri.**
- `GET /api/customer/games/[game]/state` (veya sayfada SSR): etkin config + bugünkü oturum durumu (`active|completed|failed`, skor, ödül) + kişisel rekor + bu haftaki sıra. `GuardianOfTrustGame` registry yerine bunu kullanır.
- `start`: `failed` da kilitler; `seed` ve `startedAt` döndürür; isteğe bağlı `mode: 'practice'` (DB'ye yazmaz).
- `complete`: olay günlüğü + seed ile sunucu tarafı yeniden oynatma/makullük doğrulaması; `tooFast`/doğrulanamayan oturum `flagged` durumuna gider ve sıralamalara girmez; bildirim tx içinde veya `after()`.
- Turnuva: hafta kapanışında cron ile dondurulmuş `TournamentResult` (deterministik `ROW_NUMBER` sıralama), talep yalnız buradan okunur; üst-10 Redis önbelleği.
- Başarım: artımlı `UserGameStats` özeti.

---

## Çakışmalar / birleştirme önerisi

- **Mekanik çakışma:** `frost-catcher` ("gökten düşen kar tanelerini eldivenle yakala, kombo yap", `lib/minigame-config.ts:340-344`) ve `spam-breaker` ("kalkanı kaydır… çekirdeği koru", `:325-329`) ile aynı "alt kenarda yatay kaydırılan tutucu + yukarıdan düşen nesne" çekirdeğini paylaşıyor; `spam-defense` ve `mind-thief` de "bozuk/spam'ı engelle, gerçeğe dokunma" temasını işliyor. 21 oyunluk katalogda bu, oyuncuya "aynı oyunun farklı kostümü" hissi verir ve günlük oyun başına ödül (160 puan) toplam ekonomiyi şişirir.
- **Öneri:** Sayfayı kaldırmak yerine **farklılaştır**: Güven Muhafızı'nı B7'deki "enfeksiyon/koruma" mekaniğiyle (iyi yorumu aktif onaylama + bozuğun iyi yorumu zehirlemesi) kataloğun tek "triage/öncelik" oyunu yap; `frost-catcher` saf yakalama/refleks olarak kalsın. Bu yapılmayacaksa `guardian-of-trust` ve `frost-catcher` tek oyunda (tema varyantlı) birleştirilmeli ve günlük ödül tek kez verilmeli.
- **Bileşen düzeyi birleştirme:** `GameLeaderboard` ve `GameTournament` iki ayrı görsel dil ve iki ayrı ağ isteğiyle aynı kabukta duruyor; tek sekmeli "Sıralama" bileşeninde birleştirilmeli. `shortName` fonksiyonu iki route'ta kopya (`[game]/leaderboard/route.ts:11-16`, `tournament/route.ts:20-25`) → `lib/` altına taşınmalı.
- Bulgular B1, B2, B4, B5, B9, B10 generic altyapıda olduğu için **tüm 20 generic oyun sayfasını** etkiler; düzeltme tek yerde yapılıp hepsine yayılır.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod değiştirilmedi, DB'ye dokunulmadı. Okunan dosyalar: `app/api/customer/games/[game]/start/route.ts`, `[game]/complete/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/tournament-core.ts`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `components/customer/games/guardian-of-trust-game.tsx`, `components/customer/games/game-tournament.tsx`, `prisma/schema.prisma` (MiniGameSession).

### 1. Turnuva ödülü sahte skorla basılabiliyor — **DOĞRULANDI**
- `complete/route.ts:59-61`: skor ve `won` istemciden gelir, yalnızca `maxScore`'a (25, `lib/minigame-config.ts:164`) sıkıştırılır.
- `complete/route.ts:82-87`: `tooFast` yalnız oyun ödülünü sıfırlar; `:101-102` oturum yine `status: won ? 'completed' : 'failed'` ve `starsCollected: clampedScore` ile yazılır.
- `tournament/route.ts:31` sıralama yalnız `status='completed'` ve `_max.starsCollected` üzerinden; `:156-171` ilk 3'e 500/300/150 puan kredisi. `components/customer/games/game-tournament.tsx:87,123` talep butonunu gösterir.
- **Yeniden üretim:** Müşteri `POST /api/customer/games/guardian-of-trust/start` → dönen `sessionId` ile hemen `POST .../complete {sessionId, score:25, durationSec:0, won:true}`. Yanıt `rewarded:false, tooFast:true` döner, ama oturum `completed/25` olarak kaydedilir ve haftalık sıralamada maksimum skora eşitlenir. Hafta kapanınca `POST /api/customer/tournament?game=guardian-of-trust` ilk 3'teyse puanı basar.
- **Not (kapsam düzeltmesi):** Asıl kök neden `minDurationSec` by-pass'ı değil, skorun istemci-otoriter olması. Saldırgan 10 sn bekleyip aynı isteği gönderirse oyun ödülünü (160 puan) da alır; `tooFast` yolu yalnız "oynamadan sıralamaya girme"yi kolaylaştırır. Ödül kesin değildir: 25'te eşitlenen meşru oyuncular varsa sırayı eşitlik bozma belirler (bkz. #2). Yine de sıfır oyunla turnuva tepesine eşitlenip 500 puanlık havuza girmek mümkündür; 21 oyunun hepsinde aynı altyapı geçerlidir. `lib/points-caps.ts` yalnız `feedback` kategorisini sınırlar (`:23,:43`), oyun/turnuva kredisi sınırsızdır.
- **Öneri:** `tooFast`/makul olmayan oturumlar `flagged` durumuna yazılmalı ve sıralamadan dışlanmalı; kalıcı çözüm seed + olay günlüğü ile sunucu tarafı makullük doğrulaması (skor/süre oranı üst sınırı: bu oyunda 25 puan ≈ 35-40 sn altında fiziksel olarak zor).

### 2. Turnuva sıralaması eşitlikte deterministik değil — **DOĞRULANDI (çoklu talep kısmı teorik)**
- `tournament/route.ts:29-35`: `groupBy ... orderBy: { _max: { starsCollected: 'desc' } }, take: 100` — ikincil sıralama anahtarı yok. Postgres, eşit değerlerde satır sırasını garanti etmez.
- Oyun 25'te zorla bitiyor (`guardian-of-trust-game.tsx:152,283`) ve iyi yorumlar kendiliğinden yere inip puan verdiği için (`:142-148`) yetenekli oyuncuların 25'te yığılması gerçekçi. Bu durumda ilk 3 ödülünü kimin alacağı keyfidir — "ilk ulaşan" gibi açık bir kural yoktur; bu tek başına bir adalet/güven hatasıdır.
- GET (`:83`) ve POST (`:145`) sırayı ayrı sorgularla yeniden hesaplar. Kapanmış haftanın verisi sabit olduğundan (yeni `completedAt` o pencereye düşemez) pratikte aynı plan aynı sırayı büyük olasılıkla üretir; "GET ödül var, POST yok" ya da toplamda 3'ten fazla talep senaryosu kodda mümkün ama deterministik olarak yeniden üretilemedi → bu alt iddia **doğrulanmadı / teorik**. Ayrıca 100'den fazla kullanıcı 25'te eşitlenirse `take: 100` meşru oyuncuları listeden atabilir.
- **Öneri:** Hafta kapanışında cron ile `ROW_NUMBER() OVER (ORDER BY best DESC, firstReachedAt ASC, userId)` hesaplanıp dondurulmuş `TournamentResult` tablosuna yazılmalı; GET/POST yalnız buradan okumalı. Eşitlik kuralı UI'da açıkça yazılmalı.

### 3. Kaybedilen oyunda günde 1 hak kilidi kırık — **DOĞRULANDI**
- `complete/route.ts:101`: kayıp → `status:'failed'`.
- `start/route.ts:56-73`: yalnız `completed` kilitlenir; `failed` oturum "yarım kalan aktif" gibi `canPlay:true` + aynı `sessionId` ile geri döner.
- `status/route.ts:33`: hub yalnız `completed` sayar → kaybedilen oyun "oynanabilir" görünür.
- `complete/route.ts:73` yalnız `completed`'ı reddeder, ama `:98-99` `updateMany where status:'active'` → `count:0` → `:177-181` 409 "Oyun zaten tamamlandı". `use-mini-game.ts:126-128` bunu hata toast'ı + ödülsüz sonuç olarak gösterir.
- **Yeniden üretim:** Oyuncu 3 canını kaybeder → sayfayı yeniler → Başlat çalışır, 50 sn oynar, 25'e ulaşsa bile sonunda "Oyun zaten tamamlandı" hatası alır. Ekonomik sızıntı yok (puan basılmaz), ama kullanıcıya boşa oyun oynatan güven kırıcı akış; tüm generic oyunlarda geçerli.
- **Öneri:** `start` `failed`'ı da `alreadyPlayed` ile kilitlemeli; hub `status in ['completed','failed']` saymalı (ya da ürün kararıyla kayıpta ikinci hak verilecekse yeni oturum oluşturan açık bir "rövanş" akışı tasarlanmalı).

### 4. Oyun çarpışması yalnız pointer olayında hesaplanıyor — **DOĞRULANDI**
- `guardian-of-trust-game.tsx:248-258`: kalkan–düşen çarpışması yalnız `moveShield` içinde; bu fonksiyon yalnız `onPointerMove`/`onPointerDown` ile çağrılıyor (`:322-323`).
- Oyun döngüsü (`:126-166`) yalnız düşüşü ve tabana inişi işler; kalkan çarpışması kontrolü yoktur.
- **Yeniden üretim:** Masaüstünde fareyi kalkanın hizasında sabit tut (veya mobilde parmağı kaldırmadan sabit bekle — dokunmatikte sabit parmak `pointermove` üretmez). Bozuk yorum (💢) kalkanın içinden geçer, `FLOOR`'a ulaşır ve can götürür (`:153-162`). Oyuncu ancak fareyi sürekli kıpırdatarak engelleyebilir; bu, oyunun temel vaadini bozar ve "haksızlık" hissi yaratır.
- **Öneri:** Çarpışma testi `loop` içine taşınmalı (her karede `shieldRef.current.x` ile yarıçap kontrolü); `moveShield` yalnız konumu güncellemeli. Böylece aynı kare içinde hem engelleme hem iyi yorum geçişi tutarlı hesaplanır ve `endGame(true)` tek yerden tetiklenir.

## Uygulama (Dalga 2)

Güven Muhafızı ayrı oyun olarak emekliye ayrıldı; iyi/kötü ayrımı Kar Tanesi Yakala'ya modifikatör olarak birleşti (§7.3 #9). Ayrıntı: `customer_games_frost-catcher.md` → "Uygulama (Dalga 2)".

- `/customer/games/guardian-of-trust` → `/customer/games/frost-catcher` kalıcı yönlendirme (sorgu korunur); `lib/minigame-config.ts`'te `hidden: true` + gerekçe (veri silinmedi). Eski bileşen silindi.
- **Kapanan bulgular:** B1 (ödül/turnuva skoru artık sunucu replay'inden; istemci beyanı yalnız `score_mismatch` sinyali), B3 (çarpışma her mantık adımında simülasyonda — sabit duran eldiven de yakalar/engeller), B5 (eşik/tavan etkin `config`'ten), B7 ("koru" fantezisi: kara buz = sahte yorum yakalanmamalı, Güven Kalkanı bir darbeyi emer; puan aktif yakalamadan), B8 (klavye, aria'lı canvas, sanal düğmeler + oyun alanının her yerinde kaydırma → parmak eldiveni kapatmaz, azaltılmış hareket), B11 (kırık yönlendirme/başlık soneki giderildi — sayfa dinamik rotada), B12 (DPR'lı motor yüzeyi, ikon/biçim ayrımı, bitişte kısa nefes sonra sonuç).
- **Kalan (sahiplik dışı):** B2 turnuva eşitlik kırma, B4 günde 1 hak durum makinesi, B6 turnuva bileşeni teması, B9 `complete` sorgu maliyeti/önbellek, B10 ödül bildirimi transaction dışı — platform/`GameHost`/turnuva sahiplerinde.
- **Turnuva tuzağı:** guardian-of-trust'ı gizlemek `featuredGameTypeForWeek` aday listesini kaydırır; hafta sınırında yayınlanmalı (turnuva sahibiyle koordine).
