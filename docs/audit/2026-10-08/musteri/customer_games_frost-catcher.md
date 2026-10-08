# /customer/games/frost-catcher

**Amaç:** Müşterinin günde bir kez oynayabildiği, "Buzul Krallığı" temalı, 40 saniyelik canvas yakalama oyunu. Düşen kar tanelerini alttaki eldivenle yakalarsın, nadir çıkan altın kristal +5 puan verir. 22 skoru geçen oyuncu sunucu tarafında 120 puan + 60 XP alır. Oyun ayrıca günlük oyun serisini, başarımları, haftalık turnuvayı ve tüm zamanların liderlik tablosunu besliyor.

**Genel puan:** 5/10 · **Karar:** **birleştir** (mekanik `guardian-of-trust`'ın sade bir alt kümesi; tek başına durmasının ürün değeri düşük, sezonluk "Buzul" kaplaması olarak oraya taşınmalı). Bu karardan bağımsız olarak, aşağıdaki platform seviyesindeki "günde 1 hak" hataları **her durumda** düzeltilmeli.

İncelenen dosyalar: `app/customer/games/frost-catcher/page.tsx`, `app/customer/layout.tsx`, `components/customer/games/frost-catcher-game.tsx`, `components/customer/games/game-shell.tsx`, `components/customer/games/game-leaderboard.tsx`, `components/customer/games/game-tournament.tsx`, `components/dashboard/page-heading.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/admin-toast.ts`, `lib/tournament-core.ts`, `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/[game]/leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma` (MiniGameSession, MiniGameConfig, GameStreakClaim).

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oyun döngüsü ve sunucu ödülü çalışıyor. Ama kaybedilen oyun sonrasında yeniden oynanabiliyor ve bu ikinci oyunun sonucu 409 ile reddediliyor; yarım bırakılan oturum da sınırsız tekrar deneme imkânı veriyor. |
| UX | 5/10 | Hedef (22 skor) ve ödül (120 puan) oyun öncesinde de oyun sırasında da gösterilmiyor. "Bugün oynadın" bilgisi ancak butona basınca öğreniliyor. Kombo göstergesi ("7x") gerçek kuralı yansıtmıyor. |
| Görsel | 6/10 | Canvas sahnesi (gradyan gökyüzü, parlayan buz şeridi, parçacıklar) temiz. Ancak kabuk "neon cyberpunk" (mor ızgara, köşe aksanları), oyun "buzul" temalı; ikisi çatışıyor. Eldiven bir emoji ve platforma göre farklı görünüyor. |
| Mimari | 5/10 | Ortak shell, hook ve generic API iyi kurgulanmış. Ancak bileşen statik registry'yi (`DEF`) okuyor, sunucunun döndürdüğü etkin `config`'i yok sayıyor. Admin override'ı yapılınca istemci ile sunucu ayrışıyor. |
| Performans | 6/10 | Tek rAF döngüsü ve ref tabanlı state doğru. Ancak her karede gradyan oluşturuluyor, DPR 3'e kadar çıkan bir backing store'da tanecik başına `shadowBlur` uygulanıyor; düşük uçlu Android'de kare düşürür. |
| Erişilebilirlik + mobil | 3/10 | Klavyeyle oynanamıyor. Canvas'ın rolü veya etiketi yok, HUD'da `aria-live` yok. OS `prefers-reduced-motion` tercihi okunmuyor. Mobilde h1 gizleniyor ve "günde 1 hak" açıklaması da onunla birlikte kayboluyor. Ses kapatma düğmesi yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum/rol kontrolü (CUSTOMER değilse yönlendirme) | ÇALIŞIYOR | `app/customer/games/frost-catcher/page.tsx:10-13` | Giriş yapmış bayi/admin de `/auth/signin`'e atılıyor. Doğru panele yönlendirilmeli. |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s \| Müşteri alanı` olduğu için sonuç "Kar Tanesi Yakala \| QRateX \| Müşteri alanı" oluyor (çift son ek). |
| 3 | Sayfa başlığı + açıklama (DashboardPageHeading) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` → mobilde hiç görünmüyor. Sayfadaki tek "Günde 1 hak!" bilgisi de bunun içinde. |
| 4 | Başlık/açıklama metni tutarlılığı | KISMİ | `page.tsx:19` ve `lib/minigame-config.ts:343-344` | İki farklı açıklama üst üste görünüyor. Registry'deki "buzu eritme" ifadesinin oyunda karşılığı bir mekanik yok. |
| 5 | Admin görsel override'ı (başlık/emoji/renk) | BOZUK | `frost-catcher-game.tsx:35,407-410`, `lib/minigame-config-effective.ts:52-55` | Bileşen statik `DEF` kullanıyor. Admin başlığı veya rengi değiştirirse hub'da yeni hâli, bu sayfada eski hâli görünür. |
| 6 | Admin "oyun kapalı" bayrağı | KISMİ | `start/route.ts:34-39`, `use-mini-game.ts:74-77` | Sayfa açılıyor ve "Oyna" butonu görünüyor. Basınca yalnızca hata toast'ı çıkıyor. Kalıcı bir "bu oyun şu an kapalı" ekranı yok. |
| 7 | Başlangıç ekranı (emoji, başlık, açıklama, ipucu şeridi) | ÇALIŞIYOR | `game-shell.tsx:165-188`, `lib/minigame-copy.ts:210-219` | `startHint`, varsayılan "Günde 1 hak — kazan, puan + XP kap!" metnini eziyor. Bu yüzden ödül/limit bilgisi kayboluyor. |
| 8 | "Eldiveni Tak" başlat butonu | KISMİ | `game-shell.tsx:201-207`, `use-mini-game.ts:54-79` | Butonda devre dışı/kilit koruması yok. Çıkış animasyonu sırasında çift tıklama mümkün (bkz. B5). |
| 9 | Önceden "bugün oynandı" durumunu gösterme | EKSİK | `game-shell.tsx:73`, `use-mini-game.ts:64-67` | Kilit ekranı ancak start POST'u yapıldıktan sonra çıkıyor. Sayfa açılışında durum sorgusu yapılmıyor. |
| 10 | Yükleniyor durumu (başlatılıyor/kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162`, `minigame-copy.ts:213` | `loadingSubmit` için oyuna özel metin yok, varsayılan kullanılıyor. |
| 11 | Haftalık turnuva kartı (başlangıç ekranında) | KISMİ | `game-shell.tsx:210-212`, `game-tournament.tsx` | Çalışıyor. Ancak 60 skor tavanında beraberlik çok olası (B6). Puan birimi "⭐" (`game-tournament.tsx:166`) bu oyuna uymuyor. |
| 12 | Turnuva geri sayımı | KISMİ | `game-tournament.tsx:77-82` | Dakikada bir yerelde azalıyor. 0'a inince yeniden veri çekmiyor ve "Kapanıyor" yazısında kalıyor. |
| 13 | Geçen hafta ödülünü talep ("Ödülü al") | ÇALIŞIYOR | `game-tournament.tsx:84-97,123-140` | Toast metni `lib/admin-toast.ts:17` üzerinden "Basarili: …" önekiyle çıkıyor (ş yok, admin dili). |
| 14 | Tüm zamanlar liderlik tablosu | ÇALIŞIYOR | `game-leaderboard.tsx`, `leaderboard/route.ts:47-80` | Yalnızca `completed` oturumlar sayılıyor. Hata durumu boş durumla aynı görünüyor (`catch(() => {})`, satır 40). |
| 15 | Liderlikte isim gizleme ("Mehmet Y.") | ÇALIŞIYOR | `leaderboard/route.ts:11-16` | Avatar (`image`) dönüyor ama hiç kullanılmıyor. |
| 16 | HUD: 3 can (kalp) | ÇALIŞIYOR | `frost-catcher-game.tsx:420-431` | Erişilebilir metin yok. Can kaybında görsel bir vurgu (sarsılma/kırmızı flaş) yok. |
| 17 | HUD: skor | KISMİ | `frost-catcher-game.tsx:433-435` | Ödül eşiğine (22) ilerleme gösterilmiyor. |
| 18 | HUD: kombo göstergesi ("Nx") | SAHTE | `frost-catcher-game.tsx:241,436-441` | "7x" bir çarpan izlenimi veriyor. Gerçekte her 5. yakalamada yalnızca +1 ekstra veriliyor. |
| 19 | HUD: geri sayım | ÇALIŞIYOR | `frost-catcher-game.tsx:385,443-445` | Son 5 saniyede görsel veya sesli bir uyarı yok. |
| 20 | Canvas oyun döngüsü (rAF, DPR ölçekleme, mount retry) | ÇALIŞIYOR | `frost-catcher-game.tsx:148-395` | `dt` 40 ms ile sınırlanmış, temizleme doğru. |
| 21 | Kar tanesi üretimi + zamanla zorlaşma | ÇALIŞIYOR | `frost-catcher-game.tsx:181-213` | Spawn aralığı 820→430 ms, hız +1.8. `spawnAcc = 0` artık süreyi atıyor (küçük sapma). |
| 22 | Altın kristal (%9, +5) | ÇALIŞIYOR | `frost-catcher-game.tsx:185,228-236` | Kaçırılınca ceza yok, açıklamayla tutarlı. |
| 23 | Eldiven kontrolü (fare/dokunmatik, pointer) | ÇALIŞIYOR | `frost-catcher-game.tsx:398-403,452-456` | `touch-none` doğru. Pointer capture yok: parmak canvas dışına kayınca kontrol kopuyor. |
| 24 | Klavye kontrolü (← →) | EKSİK | `frost-catcher-game.tsx:452-462` | `tabIndex`, `onKeyDown` yok. Klavye kullanıcısı oynayamıyor. |
| 25 | Yakalama/kaçırma tespiti, can kaybı, kombo sıfırlama | ÇALIŞIYOR | `frost-catcher-game.tsx:227-277` | |
| 26 | Erken bitiş: maxScore'a ulaşınca kazan | KISMİ | `frost-catcher-game.tsx:252-255` | İstemci statik `maxScore=60` kullanıyor. Admin değiştirirse sunucu skoru farklı tavana kırpar. |
| 27 | Süre sonu kazanma kararı (eşik + can) | KISMİ | `frost-catcher-game.tsx:381-383` | Statik `rewardThreshold` kullanılıyor (bkz. B3). |
| 28 | Parçacık patlamaları | ÇALIŞIYOR | `frost-catcher-game.tsx:131-146,284-290,370-378` | |
| 29 | Ses efektleri (Web Audio) | KISMİ | `frost-catcher-game.tsx:9-16`, `lib/game-sounds.ts:10-13` | Ayrı bir sessize alma kontrolü yok. Ses yalnızca "animasyonları azalt" açıksa kapanıyor. `sfxCollectStar` içe aktarılmış ama kullanılmıyor (ölü import, satır 10). |
| 30 | Dokunsal titreşim (haptic) | ÇALIŞIYOR | `frost-catcher-game.tsx:235,245,268` | iOS Safari'de `navigator.vibrate` yok, sessizce geçiliyor. |
| 31 | Azaltılmış hareket (uygulama tercihi) | KISMİ | `frost-catcher-game.tsx:58-63,179,191,194` | Yalnızca `html.reduce-animations` sınıfı okunuyor. OS `prefers-reduced-motion` dikkate alınmıyor. |
| 32 | Sonucu sunucuya gönderme (`game.finish`) | ÇALIŞIYOR | `frost-catcher-game.tsx:118-129`, `use-mini-game.ts:82-135` | `finishedRef` ile tek gönderim garantileniyor. |
| 33 | Sunucu ödül hesabı (cap + minimum süre + atomik claim) | ÇALIŞIYOR | `complete/route.ts:61,81-87,97-108` | Puan ekonomisi kuralına uyuyor (`points_credited` olayı satır 162-171). |
| 34 | Günlük seri bonusu (+10 XP, 3. günde +30) | ÇALIŞIYOR | `complete/route.ts:115-150` | Atomik `GameStreakClaim`. Seri bu sayfada hiç gösterilmiyor; yalnızca toast'ta. |
| 35 | Yeni başarım tespiti + toast + bildirim | ÇALIŞIYOR | `complete/route.ts:89-94,196-215`, `use-mini-game.ts:123-125` | İstek başına başarım istatistiği iki kez hesaplanıyor (önce/sonra), ağır olabilir. |
| 36 | Ödül bildirimi (Notification kaydı) | ÇALIŞIYOR | `complete/route.ts:185-194` | |
| 37 | Sonuç ekranı (kupa/kafatası, varyant başlık, skor, ödül rozeti) | KISMİ | `game-shell.tsx:222-305` | 409 hatasında "kazandın" başlığı ile "ödül yok" metni yan yana çıkıyor (B1). Sonraki oyun veya hub'a dönüş CTA'sı yok. |
| 38 | Konfeti (ödül kazanınca) | ÇALIŞIYOR | `game-shell.tsx:19-31,87-94` | `reduce-animations`'a uyuyor. |
| 39 | "Bugün zaten oynandı" kilit ekranı | KISMİ | `game-shell.tsx:308-331` | Yalnızca `completed` oturumda çıkıyor. "00:00 (UTC)" ifadesi Türk kullanıcı için 03:00 demek ve jargon. |
| 40 | Günde 1 hak kuralı | BOZUK | `start/route.ts:56-73`, `complete/route.ts:98-108`, `status/route.ts:33` | Kaybedilen (`failed`) oturum hiçbir yerde "oynandı" sayılmıyor. Yarım bırakılan `active` oturum sınırsız yeniden başlatılabiliyor (B1, B2). |
| 41 | Oyun dışı/hata durumu (start/complete hatası) | KISMİ | `use-mini-game.ts:74-77,126-128` | Yalnızca toast gösteriliyor, kalıcı bir hata ve tekrar dene durumu yok. |
| 42 | Sekme gizlenince duraklatma | EKSİK | `frost-catcher-game.tsx:176,207` | Süre `Date.now()` ile akıyor. Sekme değişince döngü durur ama süre durmaz; dönüşte oyun bitmiş olabilir. |
| 43 | Oyun içi duraklat düğmesi | EKSİK | — | |
| 44 | Oyun öncesi eğitim / 3-2-1 geri sayım | EKSİK | — | Oyun `playing` olur olmaz başlıyor. |
| 45 | Hub'a geri dönüş / sonraki oyun bağlantısı | EKSİK | `page.tsx:15-23` | Mobilde yalnızca alt menü ile dönülebiliyor. |
| 46 | Kişisel rekor ("en iyin: 34") oyun içinde | EKSİK | — | Liderlik API'si `me.score` döndürüyor ama oyunda kullanılmıyor. |
| 47 | Sonuç paylaşımı | EKSİK | — | |

**Durum sayımı:** ÇALIŞIYOR 23 · KISMİ 15 · BOZUK 2 · SAHTE 1 · EKSİK 6 (toplam 47)

---

## Bulgular

### B1 — Kaybedilen oyun "oynanmamış" sayılıyor; ikinci oyunun sonucu 409 ile reddediliyor ve sonuç ekranı çelişkili bilgi gösteriyor
- **Önem:** kritik · **Kategori:** işlevsellik / veri bütünlüğü · **Efor:** M
- **Kanıt:** `app/api/customer/games/[game]/complete/route.ts:101` (kaybedince `status: 'failed'`), `start/route.ts:56-73` (yalnızca `completed` reddediliyor, diğer her durumda **aynı sessionId** `canPlay:true` ile geri dönüyor), `complete/route.ts:98-108` (`updateMany where status:'active'` → `failed` oturumda `count=0` → 409 "Oyun zaten tamamlandı"), `status/route.ts:33` (hub yalnızca `completed`'i "oynandı" sayıyor), `use-mini-game.ts:126-128` (hata yakalanınca istemcinin `won` değeriyle sonuç kuruluyor).
- **Sorun:** Oyuncu kaybediyor ve sayfayı yeniliyor (ya da hub'a dönüyor; hub da "oynandı" işareti koymuyor). "Eldiveni Tak"a basınca sunucu oynamasına izin veriyor. 40 saniye oynuyor, belki 40 skorla kazanıyor. Complete çağrısı 409 dönüyor, kırmızı toast çıkıyor ve sonuç ekranında "Buzul Ustası! 🏆" başlığının altında "Ödül için 22 skor gerekiyordu" yazıyor. Kullanıcı açısından bu "kazandım ama sistem ödülümü yedi" demek. Destek talebi ve güven kaybı üretir. Sorun bu oyuna özgü değil: generic route üzerinden çalışan 20 oyunun hepsini etkiliyor.
- **Öneri:** "Günün hakkı" tek bir durum makinesi olmalı: `active → completed | failed`. **Her iki** son durum da "hak kullanıldı" sayılmalı.
  1. Start route `existing.status !== 'active'` ise `alreadyPlayed:true` dönsün ve `lastResult` (skor, won, ödül) da eklensin.
  2. Status route'u `status: { in: ['completed','failed'] }` ile çalışsın. Hub hem "kazandın" hem "denedin" rozetini ayırt edebilsin.
  3. Hook 409 aldığında sahte bir sonuç kurmasın. Sunucudan gelen gerçek sonucu göstersin (complete route 409 yanıtına mevcut oturumun `starsCollected/rewardPoints`'ini eklesin).
  4. Hata durumunda başlık "Sonuç kaydedilemedi" olsun; kupa ikonu ve kazanma başlığı gösterilmesin.

### B2 — Yarım bırakılan oturum sınırsız yeniden deneme veriyor (fiilen "günde 1 hak" yok)
- **Önem:** yüksek · **Kategori:** güvenlik / ekonomi · **Efor:** M
- **Kanıt:** `start/route.ts:69-73` ("Yarım kalan aktif oturum: aynısını döndür (tekrar başlatılabilir)"), `frost-catcher-game.tsx:390-393` (unmount olunca sadece döngü duruyor, sonuç gönderilmiyor).
- **Sorun:** Oyun kötü gidiyorsa oyuncu sayfayı yeniliyor ve aynı `active` oturumla sıfırdan başlıyor. Bunu kazanana kadar istediği kadar tekrarlayabiliyor. Ödül günde bir kez verildiği için puan basımı ikiye katlanmıyor. Ama kural bozuluyor ve haftalık turnuva skoru (500/300/150 puan ödüllü) "en iyi denemenin" skoru oluyor. Bu da dürüst oyuncuyu dezavantajlı bırakıyor.
- **Öneri:** Oturuma bir `attempt` sayacı ve `lastHeartbeatAt` alanı ekleyin. Start route aktif bir oturumu tekrar döndürdüğünde (a) en fazla 1 yeniden bağlanmaya izin versin ve (b) tekrarda oturumu "terk edildi = kayıp" olarak kapatıp `failed` yazsın. İstemcide `pagehide`/`visibilitychange` ile `navigator.sendBeacon('/complete', {won:false, abandoned:true})` gönderilsin. Kullanıcıya baştan dürüstçe söylensin: "Sayfadan ayrılırsan hakkın yanar."

### B3 — İstemci statik registry'yi kullanıyor; admin override'ında oyun ile sunucu farklı kurallarla çalışıyor
- **Önem:** yüksek · **Kategori:** mimari / veri tutarlılığı · **Efor:** S
- **Kanıt:** `frost-catcher-game.tsx:35` (`getMiniGame('frost-catcher')!` statik), `:252` (statik `DEF.maxScore`), `:382` (statik `DEF.rewardThreshold`), `:414` (shell'e statik eşik), `use-mini-game.ts:70,137` (sunucu `config`'i döndürülüyor ama bileşen okumuyor), `lib/minigame-config-effective.ts:47-51` (sunucu override'ı uyguluyor).
- **Sorun:** Admin eşiği 22'den 30'a çıkarsın. İstemci 25 skorda `won:true` gönderir, sunucu ödül vermez, oyuncu "Kazandın ama ödül eşiğini geçemedin" toast'ı ile kupa ekranı görür, ekranda da "Ödül için 22 skor gerekiyordu" yazar. Tersi durumda, eşik düşürülürse istemci 22'nin altındaki skoru `won:false` olarak gönderir ve oyuncu hak ettiği ödülü kaybeder. Aynı şekilde `maxScore` düşürülürse oyun 60'a kadar sürer, ama turnuva ve liderlik skoru sunucu tarafında kırpılır.
- **Öneri:** "Kazandı mı?" kararını **sunucuya** taşıyın: `won` yalnızca bilgi olarak gelsin, sunucu `clampedScore >= rewardThreshold` ile kendisi karar versin. İstemci `game.config` (start yanıtı) varsa onu, yoksa registry'yi kullansın. Bunu `useMiniGame` içinde `effectiveDef` olarak birleştirip tüm oyunlara tek seferde yayın. Sayfa server component olduğundan `getEffectiveMiniGame('frost-catcher')` çağrılıp başlık, renk ve eşik prop olarak da geçirilebilir. `enabled=false` ise sayfa doğrudan "kapalı" ekranını render etsin.

### B4 — Oyun kuralları, hedef ve ödül oyuncuya söylenmiyor; kombo göstergesi yanıltıcı
- **Önem:** yüksek · **Kategori:** UX · **Efor:** S
- **Kanıt:** `minigame-copy.ts:212` (`startHint` varsayılan "Günde 1 hak — kazan, puan + XP kap!" metnini eziyor, `game-shell.tsx:187`), `page-heading.tsx:21` (mobilde başlık ve açıklama gizli), `frost-catcher-game.tsx:433-435` (yalnızca ham skor gösteriliyor), `:241` (kombo = her 5'te +1), `:436-441` ("{combo}x").
- **Sorun:** Mobil kullanıcı (ana kitle bu) oyuna başlamadan önce ne kazanacağını (120 puan + 60 XP), hedefi (22) ve tek hakkı olduğunu hiçbir yerde görmüyor. Oyun sırasında hedefe ne kadar kaldığını bilmiyor; 21'de bittiğinde "neden ödül yok?" diye kalıyor. "7x" etiketi oyuncuya puanının 7 katına çıktığını düşündürüyor, ama gerçekte her yakalama yine 1 puan.
- **Öneri:** Başlangıç ekranına üç maddelik bir "kural kartı" eklensin (Duolingo ders öncesi kartı gibi): 🎯 Hedef 22 · 🎁 120 puan + 60 XP · ⏳ Günde 1 hak. Değerler start/effective config'ten okunmalı. HUD'daki skor, eşiğe kadar dolan ince bir ilerleme çubuğuna dönüşsün; eşik geçildiğinde çubuk altına dönüp "Ödül kilidi açıldı ✓" mikro animasyonu oynasın. Kombo için ya gerçek bir çarpan uygulansın (ör. kombo 5+ iken ×2) ya da gösterge "Seri 7 · sonraki bonus 3 yakalama sonra" biçimine çevrilsin. Eşiğe göre puan dengesi sunucuda `maxScore` ile yeniden ayarlanmalı.

### B5 — Başlat butonunda çift tıklama yarışı: P2002 → 500 → oyun ortasında `idle`'a dönme (doğrulanmadı, kod okumasına göre olası)
- **Önem:** orta · **Kategori:** hata / yarış koşulu · **Efor:** S
- **Kanıt:** `game-shell.tsx:145,165-207` (`AnimatePresence mode="wait"` çıkış animasyonu süresince buton DOM'da kalıyor ve tıklanabiliyor, `disabled` yok), `use-mini-game.ts:54-79` (devam eden istek koruması yok), `start/route.ts:51-79` (findUnique → create; `@@unique([userId,gameType,dayKey])` ihlali yakalanmıyor → 500), `use-mini-game.ts:74-76` (hata → `setPhase('idle')`).
- **Sorun:** İki eşzamanlı POST'un ikisi de `existing=null` görürse ikincisi P2002 ile 500 döner. Bu yanıt birinciden sonra gelirse oyun canvas'ı kaybolur ve "Oyun başlatılamadı" toast'ı çıkar.
- **Öneri:** Hook'a `inFlightRef` koruması eklensin ve buton `phase !== 'idle'` iken `disabled` olsun. Start route'ta `create` yerine `upsert`, ya da P2002 yakalayıp mevcut oturumu dönme yaklaşımı kullanılsın (complete route'taki streak claim deseniyle aynı).

### B6 — Turnuva ve liderlik, istemcinin bildirdiği ve 60'ta tavan yapan skora göre sıralanıyor; beraberlik çözülmüyor
- **Önem:** orta · **Kategori:** ekonomi / adalet · **Efor:** M
- **Kanıt:** `complete/route.ts:15-22,61` (skor istemciden geliyor, yalnızca `maxScore` ile kırpılıyor), `frost-catcher-game.tsx:252-255` (60'a ulaşınca oyun bitiyor; bu yüzden en iyi oyuncular hep 60'ta birikir), `tournament/route.ts:28-39` (`orderBy _max desc`, ikincil sıralama anahtarı yok), `lib/tournament-core.ts:13` (500/300/150 puan ödül).
- **Sorun:** (a) Bir betik `start` → 10 sn bekle → `complete {score:60, won:true}` ile her hafta tavan skoru yapabilir. Sunucu yalnızca minimum süreye bakıyor. (b) Dürüst oyuncular da 60'ta biriktiğinde ilk 3, Postgres'in döndürdüğü rastgele sıraya göre belirleniyor ve puan ödülü buna göre dağılıyor.
- **Öneri:** İkincil sıralama anahtarı eklensin: aynı skorda **daha kısa süre** (`completedAt - startedAt`) ya da **daha erken ulaşma** öne geçsin. Tavanı kaldırıp skor sınırını süre ve spawn hızından türetilen gerçekçi bir üst sınıra çevirin: sunucu, 40 sn'de üretilebilecek kar tanesi sayısını tohumlu RNG ile hesaplasın. Asıl çözüm **sunucu tohumlu oyun**: start yanıtı bir `seed` döndürsün, istemci spawn dizisini bu seed ile üretsin, complete yanıtına yakalanan tanelerin indeks listesi eklensin, sunucu bu listeyi aynı seed ile yeniden oynatıp skoru doğrulasın. Turnuva ödülü olan bir oyunda bu yatırım yerinde olur.

### B7 — Erişilebilirlik: klavye ile oynanamıyor, canvas ve HUD ekran okuyucuya kapalı, OS hareket tercihi okunmuyor
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** M
- **Kanıt:** `frost-catcher-game.tsx:452-462` (canvas'ta `tabIndex`, `role`, `aria-label`, `onKeyDown` yok), `:420-445` (kalp, skor ve süre için `aria-live` veya `sr-only` metin yok), `:58-63` ve `lib/game-sounds.ts:10-13` (yalnızca `reduce-animations` sınıfı okunuyor; `prefers-reduced-motion` yok, oysa `components/customer/mystery-bar.tsx:58` gibi yerler okuyor), `page-heading.tsx:21` (mobilde h1 yok).
- **Sorun:** Klavye veya switch kullanıcısı oyunu hiç oynayamıyor. Ekran okuyucu kullanıcı canını ve skorunu duymuyor. OS'ta "hareketi azalt" açık olan biri bütün parıltı ve salınım efektlerini görmeye devam ediyor.
- **Öneri:** Canvas'a `role="application"`, `aria-label="Kar Tanesi Yakala oyun alanı. Sol ve sağ ok tuşlarıyla eldiveni hareket ettir."` ve `tabIndex={0}` eklensin. ←/→ tuşları basılı tutulduğunda (keydown/keyup ile hız vektörü) `gloveXRef` sabit hızla kaysın. Oyun başlayınca canvas'a otomatik focus verilsin. HUD'a `sr-only` + `aria-live="polite"` ile "Can 2, skor 14, kalan 12 saniye" özetleri eklensin; sıklık can kaybı ve eşik geçişi gibi olaylarla sınırlansın. `reduced()` yardımcısı ortak bir `useReducedMotion` kancasına taşınsın: sınıf **veya** media query. Bu, tüm 20 oyuna tek PR ile yayılabilir.

### B8 — Performans: her karede gradyan oluşturma, tanecik başına `shadowBlur`, DPR 3'e kadar backing store
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** `frost-catcher-game.tsx:160-163` (DPR ≤ 3 → 1080×1380 piksel), `:295-300` (her karede `createLinearGradient`), `:307-349,357-364` (her kar tanesi ve eldiven için `shadowBlur` 10-18).
- **Sorun:** Canvas 2D'de `shadowBlur` her çizimde bir Gauss bulanıklığı demek. Oyunun sonuna doğru ekranda 15-20 tane, DPR 3'te düşük uçlu Android'de 60 fps altına iner. Gradyan da gereksiz yere her karede yeniden oluşturuluyor. Ayrıca CSS `background` (satır 459) zaten bir gradyan çiziyor; canvas üstüne yeniden boyanıyor.
- **Öneri:** Arka plan ve zemin şeridi tek seferlik bir offscreen canvas'a (ya da CSS'e) taşınsın. Kar tanesi ve kristal sprite'ları glow dahil açılışta offscreen canvas'a önceden çizilip `drawImage` ile basılsın. DPR üst sınırı 2'ye çekilsin. Bu üçü birlikte kare maliyetini kabaca bir büyüklük mertebesi düşürür (ölçülmedi, tahmin).

### B9 — Dil ve metin tutarsızlıkları: admin toast öneki, UTC jargonu, yanlış birim, sahte mekanik
- **Önem:** düşük · **Kategori:** içerik / dil · **Efor:** S
- **Kanıt:** `game-tournament.tsx:6` (`@/lib/admin-toast` müşteri bileşeninde) → `lib/admin-toast.ts:17,19` ("Basarili: ", "Dikkat: ": Türkçe karakter yok, admin tonu), `game-shell.tsx:323` ("Her gün 00:00 (UTC) sıfırlanır"), `start/route.ts:10-12` (gün anahtarı UTC → TR'de 03:00), `game-tournament.tsx:166,177` (skor birimi "⭐"), `minigame-config.ts:344` ("buzu eritme" mekaniği yok), `page.tsx:7` (çift son ekli başlık).
- **Sorun:** Müşteri "Basarili: 🏆 1. oldun" gibi bozuk bir metin görüyor. "UTC" son kullanıcı için anlamsız. Gece 00:30'da oynayan biri "dün"ün hakkını kullanmış oluyor; 02:59'a kadar yeni hak açılmıyor.
- **Öneri:** Müşteri bileşenleri `sonner`'ı doğrudan kullansın. Sıfırlama, gün anahtarı `Europe/Istanbul` (ya da kullanıcı saat dilimi) ile hesaplanıp "Yeni hak: 4 sa 12 dk sonra" biçiminde canlı geri sayım olarak gösterilsin. Turnuva birimi oyun kopyasından (`scoreLabel`/ikon) gelsin. Registry açıklamasından "buzu eritme" çıkarılsın ya da mekanik olarak eklensin (ör. eldivenin üstünde biriken buz).

### B10 — Ölü kod ve küçük teknik borç
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `frost-catcher-game.tsx:10` (`sfxCollectStar` kullanılmıyor), `:394` (`eslint-disable react-hooks/exhaustive-deps`: `endGame` ve `burst` bağımlılıktan çıkarılmış; şu an güvenli çünkü `game.finish` stabil, ama kırılgan), `:210-211` (`spawnAcc = 0` ile artık süre atılıyor; `spawnAcc -= every` olmalı), `minigame-config.ts:341` (`labelKey: 'frost_catcher_game'` hiçbir i18n dosyasında yok; tüm oyunlarda ölü alan), `leaderboard/route.ts:63,70` (`image` dönüyor ama bileşen kullanmıyor), `use-mini-game.ts:84-88` (`sessionId` yoksa `done` + `result=null` + `alreadyPlayed=false` → shell boş bir 460 px kutu gösterir).
- **Öneri:** Kullanılmayan import ve alanları temizleyin. `endGame`'i `useEffectEvent` tarzı bir ref deseniyle sabitleyip eslint istisnasını kaldırın. Boş durum için hook'a açık bir `phase:'error'` ekleyin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Oyun öncesi durum ve teşvik kartı (Starbucks Rewards "bonus star challenge" gibi):** Hedef, ödül, kalan hak ve "yeni hak X saat sonra" sayacı sayfa açılır açılmaz `GET /status?game=frost-catcher` ile gösterilmeli. Bugün oynandıysa doğrudan son sonuç ve geri sayım görünmeli.
2. **Kişisel rekor ve "rekorunu kır" anı (Duolingo/arcade):** Oyun içinde "En iyin: 34" çizgisi, rekor geçildiğinde kısa bir "Yeni rekor!" patlaması, sonuç ekranında önceki rekora göre fark ("+6").
3. **3-2-1 sayımı ve ilk oyuna özel 5 sn eğitim katmanı:** Eldiveni kaydırma ipucu animasyonu, altın kristalin tanıtımı. Dokunmatikte "parmağını buraya koy" hayalet eli.
4. **Duraklatma ve sekme değişiminde otomatik duraklatma:** `visibilitychange` ile süre dondurulmalı. Mobilde bildirim veya arama geldiğinde hak yanmamalı.
5. **Ses kontrolü:** HUD'da 🔇 düğmesi, `localStorage`'da kalıcı. Spotify/Revolut seviyesindeki uygulamalar sesi animasyon tercihinden bağımsız yönetir.
6. **Sonuç ekranında devam akışı ve paylaşım:** "Sıradaki oyun" önerisi (bugün oynanmamış en yakın oyun), hub'a dön, seri durumu ("🔥 5 gün – yarın 6"), Wrapped tarzı tek kartlık paylaşılabilir görsel (skor + rozet).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Oyuncu, sayfayı açtığı ilk saniyede üç soruya cevap almalı: *Bugün oynayabilir miyim? Ne kazanırım? Ne yapmam lazım?* Oyun 40 saniyelik sıkı bir "flow" anı olmalı. Sonuç ekranı ise ekonomiye (puan, seri, turnuva) bağlanan tatmin edici bir kapanış sunmalı. Duolingo'nun ders sonu ekranı gibi: önce ödül, sonra seri, sonra sıradaki adım.

**Yerleşim (mobil öncelikli):**
1. **Üst şerit:** ← Oyunlar · oyun adı · 🔇. Mobilde de görünür ve h1 bu şeritte.
2. **Durum kartı (idle):** Büyük oyun önizlemesi (canvas'ın ilk karesi, yavaş kar yağışı) + üç küçük çip (🎯 22 · 🎁 120p + 60 XP · ⏳ 1 hak / yeni hak 4 sa sonra) + tek birincil CTA. Turnuva ve liderlik, bu kartın altında **sekmeli** tek bir panel olsun ("Bu hafta / Tüm zamanlar"). Şu an alt alta iki ayrı liste var ve CTA'nın görünürlüğünü azaltıyor.
3. **Oyun (playing):** Tam genişlikte canvas. HUD üstte tek satır: kalpler · eşik ilerleme çubuğu (skor/22) · süre halkası. Kombo, eldivenin hemen üstünde canvas içinde yüzen bir sayaç olarak gösterilsin; göz HUD'a kaçmasın.
4. **Sonuç (done):** Ödül rozeti ilk sırada (puan sayacı 0'dan 120'ye yükselsin), ardından seri ve başarım rozetleri sırayla. Altında "Rekorun", "Turnuvadaki yerin: 7. → 4." ve iki CTA: "Sıradaki oyun" / "Oyunlara dön".

**Motion/3D önerisi (ölçülü):**
- 3D gerekmez. Bu bir refleks oyunu, three.js eklemek paket boyutu ve pil maliyeti getirir, değer katmaz.
- Kabuktaki "cyberpunk" ızgarası ve köşe aksanları bu oyunda `accent`'e göre değil **temaya göre** değişmeli. `GameShell`'e bir `skin` prop'u (ör. `'neon' | 'glacier'`) eklenip buzul oyununda soğuk gradyan ve hafif don dokusu kullanılmalı. Uygulamada zaten var olan `components/ui/backgrounds/ice-kingdom.tsx` paletiyle hizalanabilir.
- framer-motion yalnızca kabuk geçişlerinde (idle → playing → result) ve sonuç sayacında kullanılsın. Oyun içi her şey canvas'ta kalsın (mevcut ayrım doğru).
- Can kaybında canvas'a 120 ms kırmızı vinyet + 4 px sarsıntı; eşik geçişinde ilerleme çubuğu "altına dönme" efekti. İkisi de `reduce-animations` / `prefers-reduced-motion` açıkken kapanmalı.
- Eldiven emojisi (`🧤`, platforma göre farklı render) yerine canvas'ta çizilmiş, temaya uyan bir eldiven veya sepet sprite'ı.

**Veri/API değişiklikleri:**
- `GET /api/customer/games/[game]/state` (yeni): `{ enabled, config: {maxScore, rewardThreshold, rewardPoints, rewardXp}, today: {status, score, rewardPoints} | null, personalBest, nextResetAt, streak }`. Sayfa server component'te bunu doğrudan Prisma ile hesaplayıp prop olarak geçirsin; ilk boyamada doğru ekran gelsin, ekstra round-trip olmasın.
- Start: `failed`/`completed` → `alreadyPlayed`. `active` → en fazla 1 yeniden bağlanma, sonrasında `failed`. P2002 güvenli `upsert`. Yanıta `seed` eklensin.
- Complete: `won` sunucuda hesaplansın. 409 yanıtında mevcut sonuç dönsün. İsteğe bağlı `catches: number[]` ile tohumlu yeniden oynatma doğrulaması.
- `dayKey` ve `nextResetAt` Europe/Istanbul ile hesaplansın (tüm oyun API'lerinde ve streak'te aynı yardımcı kullanılsın).
- Turnuva sıralamasına ikincil anahtar eklensin (süre veya `completedAt`).

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/guardian-of-trust` ile güçlü çakışma.** Guardian da "yukarıdan düşen nesneleri alttaki kalkanla yakala / koru" mekaniğini kullanıyor (`components/customer/games/guardian-of-trust-game.tsx:16-19`: `W=360`, 3 can, `FLOOR`, `DropKind = 'good' | 'bad' | 'slow' | 'big'`). Frost Catcher bunun tehlike ve güç-yükseltme içermeyen sade bir alt kümesi: aynı canvas iskeleti, aynı can/kombo/parçacık kodu, hemen hemen aynı süre. 21 oyunluk bir katalogda bu iki oyun oyuncuya "aynı oyunu iki kez oynuyorum" hissi verir ve günlük ödül havuzunu (120p + 60XP) aynı beceri için iki kez açar.
- **Öneri:** Frost Catcher, Guardian of Trust'ın **sezonluk kaplaması** olarak birleştirilsin. Ortak bir `FallingCatcherEngine` (spawn, fizik, yakalama, HUD) çıkarılsın; "Güven Muhafızı" ve "Buzul" (`lib/seasonal-concept-options.ts` / `ice-kingdom` arka planıyla aynı sezon) bu motoru farklı tema ve nesne setiyle kullansın. Kış sezonunda hub'da Guardian kartı "❄️ Buzul Sürümü" olarak görünsün. Alternatif olarak iki oyun ayrı kalacaksa Frost Catcher'a ayırt edici bir mekanik verilmeli: ör. **"buz eritme"** (registry açıklamasında vaat edilen; eldivene biriken buz ağırlaşıp yavaşlatır, ateş kristali eritir) ya da rüzgâr yönü değişimi. Aksi hâlde kaldırılması daha temiz olur.
- **Platform seviyesindeki not:** B1, B2, B3, B5 ve B7 bu sayfaya özgü değil. Generic `[game]` route'ları, `useMiniGame` ve `GameShell` üzerinden **tüm mini oyunları** etkiliyor. Bunlar tek bir "mini oyun platformu sağlamlaştırma" işinde birlikte ele alınmalı.

---

## Doğrulama (şüpheci inceleme)

Üç iddia da kod baştan okunarak çürütülmeye çalışıldı (start/complete route'ları, `lib/use-mini-game.ts`, `components/customer/games/game-shell.tsx`, `lib/minigame-config-effective.ts`, `app/api/admin/games/route.ts`, `app/api/customer/tournament/route.ts`). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Kaybedilen (`failed`) oturum yeniden başlatılabiliyor, sonucu 409 ile reddediliyor — **DOĞRULANDI**

- `app/api/customer/games/[game]/complete/route.ts:101` kayıpta durumu `'failed'` yapıyor.
- `app/api/customer/games/[game]/start/route.ts:57` yalnızca `'completed'` durumunu kilitliyor; `'failed'` satırı `:69-73` dalına düşüp aynı `sessionId` ile `canPlay: true` dönüyor.
- Sayfa açılışında ön kontrol yok: `useMiniGame` `phase='idle'` ile başlıyor (`lib/use-mini-game.ts:46`), `GameShell` başlat butonunu `phase === 'idle'` iken gösteriyor (`game-shell.tsx:165,202`). Hub'daki `status` route'u da yalnızca `completed` sayıyor (`status/route.ts:33`), dolayısıyla kaybedilen oyun hub'da "oynandı" görünmüyor.
- İkinci oyunun sonunda complete: `:73` kontrolü `'failed'` için geçiyor, `:98-99` `updateMany({ where: { status: 'active' } })` 0 satır güncelliyor, `:177-181` 409 "Oyun zaten tamamlandı" dönüyor.
- İstemci `catch` dalında (`lib/use-mini-game.ts:126-128`) kırmızı toast gösteriyor ve sonucu **istemcinin `won` değeriyle** kuruyor. `GameShell` `result.won` ise `winTitles` varyantlarından birini (ör. "Buzul Ustası! ❄️", `lib/minigame-copy.ts:214`) ve kupa gösteriyor, `rewarded:false` olduğu için de "Ödül için 22 skor gerekiyordu" (`game-shell.tsx:292`) yazıyor.
- **Yeniden üretim:** Oyunu 3 canı kaybederek bitir → sayfayı yenile → "❄️ Eldiveni Tak" → 40 sn oyna, 22+ skor yap → kırmızı "Oyun zaten tamamlandı" toast'ı, aynı anda kupa ve "Ödül için 22 skor gerekiyordu" görünür. Puan basımı yok, ekonomi güvenli. Sorun UX ve tutarlılıkla ilgili: kullanıcı haksızlığa uğradığını düşünür ve destek talebi açar. Başlık metni rastgele varyant olduğu için "Buzul Ustası" her seferinde çıkmaz, bu küçük bir ayrıntı. Generic route'u kullanan tüm mini oyunlar etkileniyor (pacman'in kendi route'u var).
- **Düzeltme yönü:** start route'unda `'failed'` da `alreadyPlayed` sayılmalı. Hub `status` sorgusu `status in ['completed','failed']` olmalı. 409 yanıtı kayıtlı sonucu (`status`, `starsCollected`, `rewardPoints`) dönmeli; istemci bu durumda kendi `won` değerini değil sunucu kaydını göstermeli.

### 2. Aktif (yarım) oturum sınırsız yeniden başlatılabiliyor — **DOĞRULANDI**

- `start/route.ts:69-73` `active` oturum için her çağrıda aynı `sessionId`'yi `canPlay: true` ile dönüyor. Deneme sayacı ya da `startedAt` sıfırlama yok.
- Bileşen unmount olunca (`frost-catcher-game.tsx:390-393`) yalnızca rAF döngüsü durduruluyor, `finish` çağrılmıyor. Oturum `active` kalıyor.
- Turnuva sıralaması `status: 'completed'` oturumlardaki `_max.starsCollected` değerini kullanıyor (`app/api/customer/tournament/route.ts:29-34`). Kötü giden denemeyi yenileyerek terk edip yalnızca iyi denemeyi göndermek mümkün. Bu, "günde 1 hak" kuralını ve haftalık turnuva adaletini bozuyor.
- **Bağlam (şiddeti dengeleyen not):** Skor ve `won` zaten istemciden geliyor (`complete/route.ts:59,86`). Kötü niyetli kullanıcı yenileme döngüsüne gerek duymadan doğrudan `{score: maxScore, won: true}` POST edebilir (yalnızca `minDurationSec=10` engeli var). Bu açık asıl hile vektörü değil, ama **dürüst ve yarı dürüst oyuncunun** kolayca kullanabileceği bir adalet açığı. Ödül günlük tek seferlik olduğu için puan basımı katlanmıyor (`updateMany ... status:'active'` atomik).
- **Yeniden üretim:** Başlat → canlar düşerken F5 → tekrar "Eldiveni Tak" → aynı oturumla sıfırdan oyna. Kazanana kadar tekrarla. Gönderilen tek skor turnuvaya girer.
- **Düzeltme yönü:** `MiniGameSession`'a `attempts` alanı eklenmeli. İkinci `start`'ta `active` oturum en fazla bir kez (bağlantı kopması toleransı) devam ettirilmeli, sonrakinde `failed`'a çekilmeli. Alternatif: unmount ve `pagehide` olayında `navigator.sendBeacon` ile mevcut skorla `won:false` gönderilmeli. Sunucu tarafında skor makullük kontrolü (süre × maksimum yakalama hızı) eklenmeli.

### 3. Kazanma kararı istemcide statik registry eşiğiyle veriliyor — **DOĞRULANDI (admin override koşullu)**

- `frost-catcher-game.tsx:35` `DEF = getMiniGame('frost-catcher')`, yani statik registry kullanılıyor (`maxScore: 60`, `rewardThreshold: 22`, `lib/minigame-config.ts:349-350`). `:252` `DEF.maxScore`, `:382` `DEF.rewardThreshold` ile `won` hesaplanıyor. `:414` `GameShell`'e de `DEF.rewardThreshold` geçiyor. `useMiniGame` sunucu config'ini `setConfig` ile saklıyor (`lib/use-mini-game.ts:70`) ama bileşen `game.config`'i okumuyor.
- Admin eşiği gerçekten ezebiliyor: `app/api/admin/games/route.ts:144,182-196` (yalnızca eşik ≤ maxScore koşulu var). Sunucu ödülü effective değerden hesaplıyor (`minigame-config-effective.ts:49,107-115`) ama `eligible = won && !tooFast` (`complete/route.ts:86`) olduğu için istemcinin `won` kararı kapı görevi görüyor.
- **Senaryo A (eşik düşürüldü, ör. 22→15):** Oyuncu süre dolduğunda 18 skor yapar. İstemci `won = 18 >= 22 = false` gönderir, sunucu ödül vermez ve oturumu `failed` yapar. Oyuncu hak ettiği 120p+60XP'yi kaybeder ve turnuvaya da giremez (yalnızca `completed` sayılıyor).
- **Senaryo B (eşik yükseltildi, ör. 22→30):** 25 skorla istemci `won:true` gönderir, sunucu 0 puan verir. Kupa ekranı ve "Kazandın ama ödül eşiğini geçemedin" görünür. Alt metin yanlış eşiği gösterir ("22 skor gerekiyordu").
- **maxScore override'ı:** Admin maxScore'u düşürürse istemci 60'a kadar devam eder, sunucu skoru kırpar. Yükseltirse oyun 60'ta erken biter. İkisi de tutarsız.
- Override satırı yoksa (varsayılan durum) davranış tutarlıdır. Etki, admin'in bu oyun için eşik veya maxScore override'ı girmesine bağlıdır. Canlı DB'de override olup olmadığı kontrol edilmedi.
- **Düzeltme yönü:** `won` sunucuda `clampedScore >= game.rewardThreshold` (ve oyuna özgü kayıp koşulu) ile hesaplanmalı. İstemci yalnızca bitiş nedenini (`timeout`, `lives`, `maxScore`) bildirmeli. Bileşen eşik ve maxScore için `game.config ?? DEF` kullanmalı; `GameShell`'e de effective eşik geçmeli.
