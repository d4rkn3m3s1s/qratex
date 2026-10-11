# /customer/games/troll-slayer

**Amaç:** Müşterinin günde bir kez oynayabildiği, 55 saniyelik "Troll Avcısı Arena" canvas oyunu. Arenanın kenarlarından gelip merkeze yürüyen trollere dokunarak onları yok edersin. Oyunda çok canlı troller, her dalga başında çıkan bir boss, %18 kritik vuruş, kombo bonusu ve "öfke" (ulti) çubuğu var. Öfke dolunca tek dokunuşla tüm ekran temizleniyor. 20 skoru geçen oyuncu sunucu tarafında 170 puan + 85 XP alır. Oyun ayrıca günlük oyun serisini, başarımları, haftalık turnuvayı (ilk 3'e 500/300/150 puan) ve tüm zamanların liderlik tablosunu besliyor.

**Genel puan:** 4.5/10 · **Karar:** **birleştir**. Sayfanın mekaniği `spam-defense` oyunuyla neredeyse aynı: merkeze yürüyen düşmanlar, sert düşmanlar, boss ve dalgalar. Tek fark şu: `spam-defense`'te gerçek bir can/çekirdek kaybı var, burada yok. Bu yüzden "hayatta kal" vaadi sahte kalıyor. Öneri, troll-slayer'ı `spam-defense`'in bir "Arena" varyantı/sezon kaplaması olarak birleştirmek ve öfke + kritik vuruş mekaniklerini oraya taşımak. Bu karardan bağımsız olarak aşağıdaki platform seviyesindeki "günde 1 hak" ve anti-cheat hataları **her durumda** düzeltilmeli.

İncelenen dosyalar: `app/customer/games/troll-slayer/page.tsx`, `app/customer/layout.tsx`, `components/customer/games/troll-slayer-game.tsx`, `components/customer/games/game-shell.tsx`, `components/customer/games/game-leaderboard.tsx`, `components/customer/games/game-tournament.tsx`, `components/customer/games/spam-defense-game.tsx` (kıyas için), `components/dashboard/page-heading.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/accessibility-prefs.ts`, `lib/tournament-core.ts`, `app/globals.css`, `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/[game]/leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma` (MiniGameSession).

---

## Puan kartı

| Alan | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oyun döngüsü, ulti, boss ve sunucu ödülü çalışıyor. Ama "hayatta kalma" koşulu hiç yok, kaybettikten sonra tekrar oynanan oyun 409 ile bitiyor ve yarım bırakılan oturum sınırsız deneme hakkı veriyor. |
| UX | 4/10 | Hedef (20 skor) ve ödül (170 puan) hiçbir yerde gösterilmiyor. "Bugün oynadın" bilgisi ancak butona basınca geliyor. Sekme değiştirince oyun anında bitiyor. Merkeze dokunmak her trolü öldürdüğü için strateji tek hamleye iniyor. |
| Görsel | 6/10 | Radyal arena, boss aurası, kıvılcım ve flash efektleri canlı. Ama DPR desteği olmadığı için retina ekranda bulanık görünüyor, troller platforma göre değişen emojiler (🧌 eski cihazlarda kutu olarak çıkabilir) ve kabuğun "neon cyberpunk" ızgarası arena temasıyla çatışıyor. |
| Mimari | 5/10 | Ortak shell, hook ve generic API iyi kurgulanmış. Ancak bileşen sunucunun döndürdüğü etkin `config`'i yok sayıp statik `DEF`'i okuyor. Sayfa başlığı ve açıklama registry'den de kopyalanmış sabit metin. |
| Performans | 6/10 | Tek rAF döngüsü ve ref tabanlı state doğru. Ancak hareket kare hızına bağlı (120 Hz ekranda oyun 2 kat hızlı akıyor) ve her trole her karede `shadowBlur` uygulanıyor. |
| Erişilebilirlik + mobil | 3/10 | Klavyeyle oynanamıyor. Canvas'ın rolü veya etiketi yok, HUD'da `aria-live` yok. OS `prefers-reduced-motion` tercihi okunmuyor, sarsıntı ve ekran flaşı tercih açıkken bile çalışıyor. Mobilde h1 ve "Günde 1 hak!" bilgisi gizleniyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum/rol kontrolü | ÇALIŞIYOR | `app/customer/games/troll-slayer/page.tsx:10-13` | Giriş yapmış bayi/admin de `/auth/signin`'e atılıyor. Kendi paneline yönlendirilmeli. |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s \| Müşteri alanı` → sonuç "Troll Avcısı Arena \| QRateX \| Müşteri alanı" (çift son ek). |
| 3 | Sayfa başlığı + açıklama (DashboardPageHeading) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` → mobilde görünmüyor. Metin registry'den (`lib/minigame-config.ts:173-175`) elle kopyalanmış, admin override'ını görmüyor. |
| 4 | Admin "oyunu pasifleştir" bayrağı | KISMİ | `start/route.ts:34-39`, `page.tsx` | Sayfa yine de render ediliyor. Kullanıcı ancak "Arenaya Çık"a basınca 403 toast'ı görüyor. Sayfa düzeyinde kontrol yok. |
| 5 | Lobi: emoji, başlık, açıklama | KISMİ | `troll-slayer-game.tsx:315-317`, `game-shell.tsx:173-184` | Statik `DEF`'ten geliyor. Admin'in başlık/emoji/renk override'ları bu sayfada uygulanmıyor (hub'da uygulanıyor, `status/route.ts:40-48`). |
| 6 | Lobi ipucu satırı | KISMİ | `game-shell.tsx:187`, `lib/minigame-copy.ts:114` | Oyuna özel `startHint`, varsayılan "Günde 1 hak — kazan, puan + XP kap!" metninin yerini alıyor. Hak bilgisi mobilde hiçbir yerde görünmüyor. Eşik ve ödül miktarı yok. |
| 7 | "⚔️ Arenaya Çık" başlat butonu | ÇALIŞIYOR | `game-shell.tsx:201-207`, `use-mini-game.ts:54-79` | Nabız halkası animasyonu sürekli dönüyor. |
| 8 | Başlatma yükleniyor durumu ("Arena hazırlanıyor…") | ÇALIŞIYOR | `game-shell.tsx:147-162`, `minigame-copy.ts:115` | — |
| 9 | Başlatma hata toast'ı | ÇALIŞIYOR | `use-mini-game.ts:74-77` | 403/500 mesajı toast'a düşüyor, phase `idle`'a dönüyor. |
| 10 | Haftalık turnuva paneli (geri sayım, ilk 3 ödülü, ödülü al) | KISMİ | `game-shell.tsx:212`, `app/api/customer/tournament/route.ts:29-37`, `lib/tournament-core.ts:13` | Skor 40'ta tavan yapıyor (`minigame-config.ts:178`). Tavana ulaşan herkes eşitleniyor ve 500/300/150 puanlık sıralamayı Postgres'in grup sırası belirliyor. |
| 11 | Tüm zamanlar liderlik tablosu | KISMİ | `leaderboard/route.ts:47-80` | Yalnız `completed` sayılıyor, `take: 100` → 100. sıradan sonra "senin sıran" `null` dönüyor. Tavan eşitliği burada da geçerli. |
| 12 | Sayfa açılışında "bugün oynandı mı" bilgisi | EKSİK | `use-mini-game.ts:45-50` | Başlangıç durumu sorgulanmıyor. Oynamış kullanıcı da lobi + "Arenaya Çık" görüyor, kilidi ancak tıklayınca öğreniyor. |
| 13 | "Bugünün oyununu oynadın" kilit ekranı | KISMİ | `game-shell.tsx:308-332`, `start/route.ts:56-68` | Yalnızca `completed` için çalışıyor. "00:00 (UTC)" ifadesi TR saatiyle 03:00 demek. |
| 14 | Canvas mount retry guard | ÇALIŞIYOR | `troll-slayer-game.tsx:152-160` | Üst sınırı olmayan retry var ama shell canvas'ı anında bastığı için pratikte tek kare sürüyor. |
| 15 | HUD: dalga rozeti | ÇALIŞIYOR | `troll-slayer-game.tsx:328` | Dalga geçişinde görsel bir duyuru yok, yalnızca metin değişiyor. |
| 16 | HUD: skor | KISMİ | `troll-slayer-game.tsx:330`, `complete/route.ts:61` | Boss/ulti ile 40'ı aşabiliyor (ör. 43). Sonuç ekranında 43 görünürken sunucu 40'a kırpıp 40 kaydediyor (`use-mini-game.ts:105`). |
| 17 | HUD: kombo göstergesi (≥3) | ÇALIŞIYOR | `troll-slayer-game.tsx:331-333` | — |
| 18 | HUD: 55 sn geri sayım | KISMİ | `troll-slayer-game.tsx:175, 225, 292-293` | Duvar saatine (`Date.now()`) bağlı ve pause yok. Sekme arka plana geçince süre akmaya devam ediyor, dönüldüğünde oyun anında bitiyor. |
| 19 | Öfke (ulti) çubuğu + butonu | ÇALIŞIYOR | `troll-slayer-game.tsx:339-352`, `71-74` | Öldürme başına +10, boss için +25. `role="progressbar"`, `aria-valuenow` ve odak halkası yok. Klavye kısayolu yok. |
| 20 | Ulti etkisi (tüm trolleri yok et, flash, sarsıntı) | ÇALIŞIYOR | `troll-slayer-game.tsx:77-95` | Kombo ve kombo bonusu ulti ölümlerine işlemiyor. Tutarlı ama hiçbir yerde açıklanmıyor. |
| 21 | Dokun-vur (en yakın trol, `r+12` tolerans) | ÇALIŞIYOR | `troll-slayer-game.tsx:105-112, 305-311` | Koordinat ölçekleme doğru (`W / rect.width`). |
| 22 | Boşa vuruş komboyu sıfırlar | ÇALIŞIYOR | `troll-slayer-game.tsx:113-117` | Iskalamada görsel/işitsel geri bildirim yok. |
| 23 | Kritik vuruş (%18, ×2 hasar) | ÇALIŞIYOR | `troll-slayer-game.tsx:120-128` | Saf şans. Beceriyle tetiklenmiyor. |
| 24 | Sert troller (2 HP) + HP çubukları | ÇALIŞIYOR | `troll-slayer-game.tsx:206-215, 270-274` | Sert trol olasılığı zamanla %45'e kadar çıkıyor. |
| 25 | Dalga başı boss | KISMİ | `troll-slayer-game.tsx:186-200, 259-268` | Çalışıyor (HP 4+dalga, 3 puan). Ama giriş anonsu, uyarı göstergesi veya özel ses yok: boss doğarken "isabet" sesi (`sfxHit`, satır 199) çalıyor. |
| 26 | Dalga ilerlemesi (12 sn'de bir) | ÇALIŞIYOR | `troll-slayer-game.tsx:181-185` | 55 sn'de en fazla 5 dalga. |
| 27 | Zorluk eğrisi (doğma hızı + yürüme hızı) | KISMİ | `troll-slayer-game.tsx:222-236` | Doğma hızı `dt`'ye bağlı ama hareket kare başına → 120 Hz ekranda troller 2 kat hızlı (Bulgu 5). |
| 28 | "Mümkün olduğunca uzun hayatta kal" / trollerin "basması" | SAHTE | `troll-slayer-game.tsx:229-236`, `lib/minigame-config.ts:175`, `lib/minigame-copy.ts:117` | Merkeze ulaşan trolün hiçbir sonucu yok: can, çekirdek ya da hasar yok. Troller merkezde birikip salınıyor. "Troller Bastı 💀 / Arena Düştü" başlıkları gerçek bir yenilgiyi anlatmıyor. |
| 29 | Kombo bonusu (her 5 öldürmede +1) | ÇALIŞIYOR | `troll-slayer-game.tsx:134-136` | İpucu satırında (`:364`) anlatılmıyor. |
| 30 | Erken galibiyet (skor ≥ 40 → oyun biter) | KISMİ | `troll-slayer-game.tsx:94, 143` | İyi oynayan oyuncunun turu kesiliyor ve beceri tavanı 40'ta donuyor (Bulgu 7). |
| 31 | Kazanma/eşik kararı (istemci) | KISMİ | `troll-slayer-game.tsx:94, 143, 292, 322`, `use-mini-game.ts:70,137` | Statik `DEF.rewardThreshold`/`maxScore` kullanılıyor. Sunucunun döndürdüğü `config` hiç okunmuyor (Bulgu 4). |
| 32 | Parçacık / sarsıntı / flash efektleri + azaltılmış hareket | KISMİ | `troll-slayer-game.tsx:19-21, 63, 81-82, 98-103, 123, 241-244, 285-289` | Yalnız `burst` kapanıyor. `critSpark`, ekran sarsıntısı ve %60 opak flaş açık kalıyor. OS `prefers-reduced-motion` okunmuyor. |
| 33 | Ses efektleri | ÇALIŞIYOR | `lib/game-sounds.ts:10-17` | Yalnız "animasyonları azalt" tercihiyle kapanıyor. Oyunda ses kapatma düğmesi yok. |
| 34 | Titreşim (haptic) | ÇALIŞIYOR | `lib/game-sounds.ts:158-165` | iOS Safari `navigator.vibrate` desteklemiyor, orada sessizce yok. |
| 35 | Oyun içi ipucu satırı | ÇALIŞIYOR | `troll-slayer-game.tsx:364` | 11 px, `text-white/50` → kontrast düşük. |
| 36 | Sonuç kaydediliyor durumu | ÇALIŞIYOR | `game-shell.tsx:157-159`, `use-mini-game.ts:89` | — |
| 37 | Sunucu tarafı ödül hesabı (cap + eşik, atomik claim) | ÇALIŞIYOR | `complete/route.ts:61, 86-108, 152-173` | `points_credited` olayı yazılıyor, ekonomi değişmezlerine uyuyor. |
| 38 | Anti-cheat (süre + skor) | KISMİ | `complete/route.ts:80-87`, `minigame-config.ts:182` | `minDurationSec: 10`, oysa tur 55 sn. `won` ve `score` istemci beyanı. 10 sn sonra `{score:40, won:true}` kabul ediliyor (Bulgu 2). |
| 39 | Günlük seri bonusu + toast | ÇALIŞIYOR | `complete/route.ts:117-150`, `use-mini-game.ts:118-121` | — |
| 40 | Yeni başarım tespiti + toast + bildirim | ÇALIŞIYOR | `complete/route.ts:89-94, 196-215`, `use-mini-game.ts:123-125` | Her tamamlamada iki kez `computeAchievementStats` çalışıyor (önce/sonra), maliyetli ama doğru. |
| 41 | Ödül bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194` | — |
| 42 | Sonuç ekranı (başlık varyantı, skor, ödül/ıska notu) | KISMİ | `game-shell.tsx:222-305` | Oyun istatistiği yok (öldürme, en iyi kombo, boss, kritik, ulti). `tooFast` yanıtı istemcide okunmuyor (`use-mini-game.ts:101-110`), yanlış "eşiği geçemedin" mesajı çıkabiliyor. |
| 43 | Ödülde konfeti | ÇALIŞIYOR | `game-shell.tsx:19-31, 86-94` | — |
| 44 | Kaybettikten sonra aynı gün tekrar oynama | BOZUK | `complete/route.ts:101, 98-108`, `start/route.ts:56-73` | Kayıp `failed` yazılıyor. `/start` bunu "yarım kalan oturum" sayıp aynı `sessionId` ile `canPlay: true` dönüyor. 55 sn oynandıktan sonra `/complete` 409 "Oyun zaten tamamlandı" veriyor. |
| 45 | Oyun ortasında sayfayı yenileme / terk etme | BOZUK | `start/route.ts:69-73`, `troll-slayer-game.tsx:298-301` | Oturum `active` kalıyor. Kullanıcı kötü giden turu yenileyip kazanana kadar sınırsız deneyebiliyor. Sunucu süresi ilk başlangıçtan ölçüldüğü için `tooFast` de hiç tetiklenmiyor (Bulgu 1). |
| 46 | Duraklatma / görünürlük değişiminde durma | EKSİK | `troll-slayer-game.tsx` (yok) | `visibilitychange` dinlenmiyor (Bulgu 6). |
| 47 | Klavye ile oynanış | EKSİK | `troll-slayer-game.tsx:355-362` | Yalnız `onPointerDown`. |
| 48 | Canvas erişilebilir adı / canlı skor duyurusu | EKSİK | `troll-slayer-game.tsx:327-336, 355-362` | `role`, `aria-label` ve `aria-live` yok. |
| 49 | Yüksek DPI (retina) çizim | EKSİK | `troll-slayer-game.tsx:355-358` | `width={360}` sabit. `frost-catcher-game.tsx:160` DPR kullanıyor, bu oyun kullanmıyor → tutarsız ve bulanık. |
| 50 | Oyun Merkezi'ne dönüş / sıradaki oyun CTA'sı | EKSİK | `game-shell.tsx:222-305` | Sonuç ekranı çıkmaz sokak. |
| 51 | Kişisel rekor karşılaştırması ("yeni rekor!") | EKSİK | `game-shell.tsx:269-272` | Liderlikte "en iyin" var ama sonuçta karşılaştırma yok. |
| 52 | İlk oyun eğitimi (öfke, kritik, boss nasıl işler) | EKSİK | `troll-slayer-game.tsx:364` | Tek satırlık ipucuyla sınırlı. |
| 53 | Troll görselleri (emoji) | KISMİ | `troll-slayer-game.tsx:23, 268` | 🧌 (Unicode 14, 2021) Windows 10 ve eski Android'de kutu olarak çıkabilir. Cihazda doğrulanmadı ama yaygın bilinen bir kısıt. Görünüm platforma göre değişiyor. |
| 54 | i18n `labelKey: 'troll_slayer_game'` | KISMİ | `minigame-config.ts:172`, `messages/tr.json` / `en.json` | Mesaj dosyalarında karşılığı yok → ölü anahtar. Tüm oyun metinleri TR'ye sabit. |
| 55 | Gün sınırı (dayKey) | KISMİ | `start/route.ts:10-12` | UTC gün sınırı TR'de 03:00'e denk geliyor. Gece 00:00-03:00 arasında oynayan kullanıcı "dünün" hakkını kullanıyor. |

**Durum özeti:** ÇALIŞIYOR 24 · KISMİ 20 · BOZUK 2 · SAHTE 1 · EKSİK 8 (toplam 55).

---

## Bulgular

### 1. Yarım bırakılan oturum sınırsız deneme hakkı veriyor, kaybedilen oyunun tekrarı 409 ile bitiyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ekonomi · **Efor:** M
- **Kanıt:** `start/route.ts:56-73`, yalnız `status === 'completed'` için `alreadyPlayed` döndürür. Diğer her durumda (`active` **ve** `failed`) aynı `sessionId` ile `canPlay: true` verir. `complete/route.ts:101` kayıpta `failed` yazar. `complete/route.ts:98-108` claim'i `where: { status: 'active' }` ile yapar ve sayaç 0 ise 409 döner. Bileşenin cleanup'ı (`troll-slayer-game.tsx:298-301`) yalnızca döngüyü durdurur, sunucuya terk bildirmez.
- **Sorun:** (a) Tur kötü giden oyuncu sayfayı yenileyip "Arenaya Çık"a basarsa aynı `active` oturum dönüyor. Kazanana kadar sınırsız deneme var, yani "günde 1 hak" fiilen yok. Bu açık, 170 puan + 85 XP'lik günlük ödülü ve haftalık turnuva sırasını garanti kazanıma çeviriyor. `serverElapsedSec` ilk başlangıçtan ölçüldüğü için süre kontrolü de devreye girmiyor. (b) Dürüstçe kaybeden oyuncu aynı gün tekrar oynayabiliyor, 55 saniye emek verdikten sonra "Oyun zaten tamamlandı" hatasıyla karşılaşıyor. Bu, ürünün en kötü his anlarından biri. (c) Hub'ın `playedToday` sorgusu (`status/route.ts:33`) da yalnız `completed` saydığı için kaybeden oyuncu hub'da "oynanmadı" görüyor.
- **Öneri:** Oturuma gerçek bir durum makinesi kurun: `active → completed | failed | abandoned`. `/start` "bugün terminal durumda oturum var mı" (`status in ('completed','failed','abandoned')`) kontrolünü yapsın. `active` oturum tekrar istendiğinde ise oturumu "yeniden başlat" yerine `abandoned`'a çekip sıfır skorla kapatsın, ya da en azından `startedAt`'ı bir kez kullanılır kılan `attempt` sayacı tutsun (`MiniGameSession.attempts Int`, 1'i geçerse ödül yok). `alreadyPlayed` yanıtı önceki sonucu da taşısın (`starsCollected`, `won`, `rewardPoints`). Kilit ekranı böylece "Bugünkü sonucun: 17 troll — yeni hak 03:00'te" diyebilir. Değişiklik generic API'de olduğu için 20 oyunun tamamını düzeltir.

### 2. Sunucu doğrulaması bu oyunun gerçekliğine göre ayarlanmamış: 10 sn sonra beyan edilen 40 skor kabul ediliyor
- **Önem:** yüksek · **Kategori:** güvenlik / anti-cheat · **Efor:** M
- **Kanıt:** `lib/minigame-config.ts:182` `minDurationSec: 10`. Tur ise sabit 55 sn (`troll-slayer-game.tsx:14`). `complete/route.ts:80-87` yalnızca `serverElapsed >= 10 && durationSec >= 10 && won` kontrolü yapıyor. `won` ve `score` tamamen istemci beyanı (`complete/route.ts:15-22`). Turnuva ödülü 500/300/150 puan (`lib/tournament-core.ts:13`).
- **Sorun:** Oyunun fiziği ilk 10 saniyede en fazla ~10 trol doğuruyor (`every = 1100ms` başlangıç, `troll-slayer-game.tsx:226`). Yani 20 skor ancak ~20+ saniyede, 40 skor ancak turun sonuna doğru mümkün. Buna rağmen tarayıcı konsolundan `POST /start` → 10 sn bekle → `POST /complete {score:40, won:true, durationSec:55}` atan herkes ödülü alıyor, tüm zamanlar tablosunda tavana çıkıyor ve haftalık 500 puanlık turnuva sırasına giriyor. Puan ekonomisi değişmezleri (bkz. points-economy) bu yolu gerçek bir "mint" kanalı yapıyor.
- **Öneri:** (1) Oyun tanımına `roundSec` ve `maxScorePerSec` ekleyin. Sunucu skoru `min(maxScore, floor(serverElapsedSec * maxScorePerSec))` ile ikinci kez sıkıştırsın, zaman aşımıyla biten oyunlarda `serverElapsedSec >= roundSec - tolerans` istesin. (2) `won` beyanını sunucu türetsin: `won = clampedScore >= rewardThreshold`. İstemcinin `won` alanı yalnızca UX için kalsın. (3) Orta vadede hafif bir "olay günlüğü" gönderin: öldürme zaman damgaları (`kills: number[]`, ms) ile sunucu kabaca yeniden oynatsın, öldürmeler arası < 80 ms gibi insan dışı ritimleri reddetsin. Bu üç adım genel bir `validateRun(game, payload, serverElapsed)` yardımcısında toplanırsa tüm canvas oyunlarına uygulanabilir.

### 3. "Hayatta kal" mekaniği sahte, en iyi strateji merkeze dokunmak
- **Önem:** yüksek · **Kategori:** oyun tasarımı / ürün dürüstlüğü · **Efor:** L
- **Kanıt:** Troller sürekli merkeze yürüyor (`troll-slayer-game.tsx:229-236`). Merkeze ulaşınca hiçbir şey olmuyor: can, çekirdek ve kayıp koşulu yok. Tek kayıp yolu 55 sn sonunda skorun 20'nin altında kalması (`:292`). Açıklama ise "mümkün olduğunca uzun hayatta kal" diyor (`minigame-config.ts:175`), kayıp başlıkları da "Troller Bastı 💀 / Arena Düştü" (`minigame-copy.ts:117`). İsabet kontrolü en yakın trolü seçtiği için (`:109-112`), merkezde biriken (en fazla 12, `:227`) trollerin hepsi aynı noktaya art arda dokunarak öldürülüyor.
- **Sorun:** Oyun vaat ettiği gerilimi (baskı, savunma, kayıp riski) vermiyor. Oyuncu birkaç oyunda "ortaya bas" stratejisini keşfedince beceri ifadesi tamamen kayboluyor. Kardeş oyun `spam-defense` aynı kurguyu çekirdek + 3 can ile doğru kuruyor (`spam-defense-game.tsx:14-17, 223-226`). Bu sayfa onun daha zayıf bir kopyası.
- **Öneri:** Ya (tercih) `spam-defense` ile birleştirin, ya da gerçek bir savunma ekseni ekleyin. Merkezde bir "Arena Kalesi" (HP 5) olsun, merkeze ulaşan trol kaleye hasar verip yok olsun, kale düşerse tur `failed` ile bitsin. Merkezde birikmeyi engellemek için trollere merkez yarıçapında saldırı animasyonu verin. Dokunuş hedeflemesine "merkez ölü bölgesi" yerine trolün kendi yarıçapını esas alan katı bir isabet testi koyun (`d < t.r`). Skoru "devrilen troll + hayatta kalınan saniye + kale HP bonusu" olarak yeniden tanımlayın. Böylece metin, başlıklar ve mekanik aynı hikâyeyi anlatır.

### 4. İstemci sunucunun etkin yapılandırmasını yok sayıyor, admin override'ı kazanma kararını bozuyor
- **Önem:** yüksek · **Kategori:** mimari / veri tutarlılığı · **Efor:** S
- **Kanıt:** `use-mini-game.ts:70` `config`'i state'e alıyor ve `:137`'de döndürüyor. Bileşen ise her yerde statik `DEF` kullanıyor: `troll-slayer-game.tsx:11, 94, 143, 292, 315-325`. Sunucu ödülü `getEffectiveMiniGame` ile admin override'ından hesaplıyor (`complete/route.ts:35, 87`, `minigame-config-effective.ts:40-57`). Sayfa başlığı da sabit (`page.tsx:17-20`).
- **Sorun:** Admin eşiği 20 → 25 yaparsa 22 skorlu oyuncu istemcide "Arena Fethedildi!" görüyor (`won=true` → `completed`) ama ödül 0 ve toast "Kazandın ama eşiği geçemedin" diyor. Eşik 20 → 15 düşürülürse 17 skorlu oyuncu istemcide kaybediyor (`won=false` → `failed`) ve sunucu hak ettiği ödülü vermiyor. Sonuç ekranındaki "Ödül için 20 skor gerekiyordu" (`game-shell.tsx:292`) de yanlış sayıyı gösteriyor. Başlık/emoji/renk override'ları hub'da görünüp oyun sayfasında görünmüyor.
- **Öneri:** Sayfayı sunucu bileşeninde `getEffectiveMiniGame('troll-slayer')` ile besleyin: `enabled === false` ise `notFound()` veya "Bu oyun şu an kapalı" boş durumu gösterin, `title/description/emoji/accent/rewardThreshold/maxScore/rewardPoints` değerlerini prop olarak `TrollSlayerGame`'e geçirin. Oyun içi karar ve HUD bu prop'ları (ya da `game.config`'i) okusun. Sunucu tarafında `won`'u türetmek (Bulgu 2) bu ayrışmayı kalıcı olarak kapatır.

### 5. Hareket kare hızına bağlı, 120 Hz cihazlarda oyun iki kat hızlı
- **Önem:** orta · **Kategori:** hata / adalet · **Efor:** S
- **Kanıt:** `troll-slayer-game.tsx:222` `dt` hesaplanıyor ama yalnız doğma birikimine ekleniyor (`:224`). Trol hareketi (`:231-235`), salınım (`t.wob += 0.06`) ve parçacık fiziği (`:238`) kare başına sabit adımla ilerliyor.
- **Sorun:** ProMotion iPhone'larda ve 120 Hz Android'lerde troller ve parçacıklar 2 kat hızlı. 30 fps'e düşen düşük uçlu cihazda ise yarı hızda. Aynı liderlik tablosu ve turnuva için oyuncular farklı zorlukta yarışıyor.
- **Öneri:** Tüm kinematiği `k = dt / 16.67` ile ölçekleyin (`t.x += (cos*sp + cos(wob)*0.6) * k`, `t.wob += 0.06 * k`, `p.life -= k`), ya da sabit 60 Hz mantık adımı + değişken render (accumulator) desenine geçin. Bu deseni ortak bir `useGameLoop(update, render)` hook'una çıkarmak tüm canvas oyunlarındaki aynı hatayı tek yerde kapatır.

### 6. Duvar saatine bağlı tur, pause yok: arka plana geçen oyuncu turunu kaybediyor
- **Önem:** orta · **Kategori:** UX / hata · **Efor:** S
- **Kanıt:** `troll-slayer-game.tsx:175, 225, 292`. `elapsed = Date.now() - startedAt`. `visibilitychange` dinleyicisi yok. Tarayıcı arka planda rAF'ı durduruyor ama `Date.now()` akmaya devam ediyor.
- **Sorun:** Mobilde gelen bir bildirime bakmak için uygulamadan çıkan oyuncu döndüğünde döngünün ilk karesinde `elapsed >= ROUND_MS` → oyun biter, skor 20'nin altındaysa `failed`. Bulgu 1 yüzünden de tekrar denemesi 409 ile sonuçlanır. Günlük tek hakkın bu şekilde kaybolması ciddi bir hayal kırıklığı.
- **Öneri:** Süreyi oyun içi saatle (`playedMs += dt`) tutun. `document.visibilitychange` gizli olduğunda döngüyü durdurun ve "Duraklatıldı — Devam et" katmanı gösterin. Sunucu tarafında makul bir pause payı için `maxDurationSec` (ör. tur + 120 sn) kontrolü ekleyin ki pause ile süre şişirilemesin.

### 7. 40 skor tavanı hem turu erken bitiriyor hem sıralamayı eşitliyor
- **Önem:** orta · **Kategori:** oyun tasarımı / rekabet · **Efor:** M
- **Kanıt:** `minigame-config.ts:178` `maxScore: 40`. `troll-slayer-game.tsx:94, 143` 40'a ulaşınca `endGame(true)`. `leaderboard/route.ts:47-53` ve `tournament/route.ts:29-37` `_max.starsCollected` ile sıralıyor, eşitlik bozucu yok.
- **Sorun:** Usta oyuncu turun ortasında "kazandın" ile kesiliyor, kalan süreyi oynayamıyor. Tavana ulaşan herkes 40'ta eşitlendiğinden haftalık 500/300/150 puanlık ödülün kime gideceği deterministik değil. Oyuncu "geçen hafta 2. oldun" görüp talep ederken sıra değişebiliyor.
- **Öneri:** Ödül eşiği ile skor tavanını ayırın. Tavan yalnızca anti-cheat amaçlı ve gerçekçi üst sınır olsun (ör. 120, Bulgu 2'deki `maxScorePerSec` ile). Tur her zaman sürenin sonuna kadar oynansın. Sıralamaya eşitlik bozucu ekleyin: aynı skorda daha kısa süre / daha erken `completedAt`. Bunun için `MiniGameSession`'a `durationMs` alanı açın ve `orderBy`'ı iki sütunlu yapın.

### 8. Erişilebilirlik ve azaltılmış hareket eksik, fotosensitif risk taşıyan flaş korumasız
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** M
- **Kanıt:** `reduced()` yalnız uygulama içi `html.reduce-animations` sınıfını okuyor (`troll-slayer-game.tsx:19-21`, `lib/accessibility-prefs.ts:18-22`). OS `prefers-reduced-motion` hiçbir yerde okunmuyor (`globals.css:824` "prefers-reduced-motion'dan bağımsız"). Bu tercih açıkken bile `critSpark` (`:98-103`), ekran sarsıntısı (`:123, 241-244`) ve %60 opak tam ekran flaş (`:81, 285-289`) çalışıyor. Canvas'ta `role` ve `aria-label` yok, HUD'da `aria-live` yok (`:327-336, 355-362`). Klavye girdisi yok. Ulti butonunun odak stili ve ilerleme semantiği yok (`:339-352`). İpucu 11 px ve `text-white/50` (`:364`).
- **Sorun:** Vestibüler hassasiyeti olan kullanıcılar ekran sarsıntısıyla, fotosensitif kullanıcılar ardışık flaşlarla karşılaşıyor. Ekran okuyucu ve klavye kullanıcıları oyunu hiç oynayamıyor. "Animasyonları azalt" tercihi sesleri ve titreşimi de kapatıyor (`lib/game-sounds.ts:10-17`), yani hareket ve ses tercihi birbirine karışmış.
- **Öneri:** `reduced()`'ı `matchMedia('(prefers-reduced-motion: reduce)').matches || reduce-animations` yapan ortak bir `useReducedMotion` yardımcısı yazın ve sarsıntı, flaş ve kıvılcımı buna bağlayın. Flaşı azaltılmış modda kenar parlamasına (vignette) çevirin. Ses için ayrı bir "Ses: açık/kapalı" anahtarını HUD'a koyun (localStorage). Klavye modu ekleyin: arena 3×3 bölgeye ayrılsın, numpad/QWE-ASD-ZXC ile bölgedeki en yakın trole vurulsun, `Space` ile ulti tetiklensin. Canvas'a `role="img" aria-label="Troll arenası"` verin, skor/dalga/kalan süre için görsel olarak gizli bir `aria-live="polite"` bölgesi ekleyin (ör. her dalga ve her 10 skor için duyuru). Ulti butonunu `role="progressbar"` + `aria-valuenow` ile semantik yapın ve `focus-visible` halkası ekleyin.

### 9. Oyun öncesi bilgi mimarisi eksik: hak, hedef ve ödül görünmüyor
- **Önem:** orta · **Kategori:** UX · **Efor:** S
- **Kanıt:** Başlangıç durumu sorgulanmıyor (`use-mini-game.ts:45-50`). "Günde 1 hak!" yalnız masaüstü başlığında (`page.tsx:19`, `page-heading.tsx:21` `hidden sm:flex`). Oyuna özel `startHint`, kabuğun varsayılan "Günde 1 hak" ipucunun yerini alıyor (`game-shell.tsx:187`). Eşik (20) ve ödül (170 puan + 85 XP) lobi ve HUD'da yok. `tooFast` yanıtı okunmuyor (`use-mini-game.ts:101-110`).
- **Sorun:** Oyuncu neyi hedeflediğini bilmeden oynuyor, oynadıktan sonra sayfayı açınca yine "Arenaya Çık" görüp kilidi tıklayınca öğreniyor. Duolingo ve Starbucks Rewards gibi ürünlerde hedef ve ödül, aksiyondan önce her zaman görünür ve ilerleme anlık hissettirilir.
- **Öneri:** Sayfa sunucuda bugünkü oturumu (`MiniGameSession` @ `userId+gameType+dayKey`) okusun ve shell'e `initialState: 'available' | 'locked' | 'resumable'` geçirsin. Lobiye üç bilgi çipi ekleyin: "🎯 Hedef 20 troll", "🎁 170 puan + 85 XP", "⏳ Bugün 1 hak · yenilenme 03:00". HUD'da skorun yanında hedef ilerleme halkası olsun (`score/threshold`). Eşik geçildiği an kısa bir "Ödül kilidi açıldı!" mikro kutlaması yapın. Sonuç ekranında `tooFast` için ayrı ve dürüst bir mesaj gösterin.

### 10. Görsel kalite ve performans: DPR yok, her karede `shadowBlur`, platforma bağlı emoji
- **Önem:** düşük · **Kategori:** görsel / performans · **Efor:** M
- **Kanıt:** Canvas 360×420 sabit, DPR ölçeği yok (`troll-slayer-game.tsx:12-13, 355-358`). Karşılaştırma: `frost-catcher-game.tsx:160` DPR kullanıyor. Her trol için her karede `shadowBlur 16-26` (`:263, 266`) ve her karede yeni radyal gradyan (`:248`). Troller sistem emojisi (`:23, 267-268`). 🧌 Unicode 14 olduğu için Windows 10 ve eski Android'de büyük olasılıkla kutu olarak görünür (cihazda doğrulanmadı).
- **Sorun:** Retina ekranlarda bulanık emoji ve kenarlar oluşuyor. Düşük uçlu Android'de 12 trol × gölge bulanıklığı kare düşürüyor. Marka ve sanat yönü platforma bırakılmış: aynı oyun iOS, Android ve Windows'ta farklı görünüyor.
- **Öneri:** Canvas'ı `dpr = min(2, devicePixelRatio)` ile ölçekleyin (`canvas.width = W*dpr; ctx.setTransform(dpr,0,0,dpr,0,0)`). Arka plan gradyanını ve trol gliflerini bir kez offscreen canvas'a önceden çizip (sprite atlas, parlaması dahil) `drawImage` ile basın. Böylece `shadowBlur` döngüden çıkar. Troller için emoji yerine 4 tür + boss'tan oluşan küçük bir SVG/sprite seti tasarlayın (marka renkleriyle tutarlı, hasar karesi olan).

### 11. Küçük tutarsızlıklar ve ölü kod
- **Önem:** düşük · **Kategori:** kalite · **Efor:** S
- **Kanıt ve sorunlar:**
  - Çift başlık son eki: `page.tsx:7` + `layout.tsx:18-21` → "Troll Avcısı Arena | QRateX | Müşteri alanı".
  - Müşteri olmayan giriş yapmış kullanıcı `/auth/signin`'e atılıyor (`page.tsx:11-12`). Rolüne göre kendi paneline yönlendirilmeli.
  - Boss doğarken isabet sesi çalıyor (`troll-slayer-game.tsx:199`). Dalga geçişi sessiz bir metin değişimi (`:182-185`).
  - Gösterilen skor 40'ı aşabiliyor, kaydedilen ise 40 (`:94, 136`, `complete/route.ts:61`). Sonuç ekranı ile liderlik tablosu farklı sayı gösteriyor.
  - `labelKey: 'troll_slayer_game'` (`minigame-config.ts:172`) mesaj dosyalarında yok → ölü anahtar. Oyun metinleri i18n dışı.
  - `endGame` bağımlılığı `[game]` (`troll-slayer-game.tsx:59`). `useMiniGame` her render'da yeni nesne döndürdüğü için `endGame/slash/onPoint` her render'da yeniden yaratılıyor. Döngü efekt anındaki kapanışı kullandığından hata değil ama gereksiz. `game.finish`'e bağlanmalı.
- **Öneri:** Layout şablonuna uyup `title: 'Troll Avcısı Arena'` yazın. Rol yönlendirmesini ortak `redirectToRoleHome(session)` yardımcısına alın. Boss için `sfxBossIntro` + "⚠ BOSS" banner'ı, dalga için 600 ms'lik "DALGA 3" yazısı ekleyin. Skoru istemcide de `min(maxScore, …)` ile gösterin ya da (Bulgu 7 sonrası) tavanı kaldırın. `useMiniGame` dönüşünü `useMemo` ile sabitleyin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Gerçek kayıp/gerilim ekseni (kale HP'si, can).** Her arcade "survival" oyununun temeli bu. Kardeş oyun `spam-defense`'te var, burada yok.
2. **Hedef ve ödülün aksiyondan önce görünmesi + canlı ilerleme halkası.** Starbucks Rewards yıldız ilerlemesi ve Duolingo günlük hedef halkası gibi.
3. **Oyun sonu özet kartı ("Arena Raporu").** Devrilen troll, en uzun kombo, boss sayısı, kritik oranı, ulti kullanımı, kişisel rekora göre fark ve paylaşılabilir görsel. Spotify Wrapped'in mini versiyonu gibi düşünülebilir.
4. **Pause + arka plan güvenliği ve ses anahtarı.** Revolut/Monzo düzeyinde mobil his için uygulamadan çıkıp dönmek oyunu öldürmemeli, ses tek dokunuşla kapanabilmeli.
5. **İlk oynayış eğitimi.** 3 adımlı, atlanabilir bir katman: "dokun = vur", "öfke dolunca ekranı temizle", "boss her dalgada gelir". Duolingo'nun ilk ders akışı gibi.
6. **Sosyal/rekabet katmanında adil sıralama ve sonraki adım.** Eşitlik bozucu, "bir üst sıraya X troll kaldı" göstergesi, sonuç ekranında "Oyun Merkezi'ne dön / sıradaki oyun" CTA'sı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60 saniyelik, adil ve okunur bir "kaleyi savun" arena oyunu. Oyuncu ilk saniyeden ne için oynadığını (20 troll → 170 puan), ne kadar yaklaştığını ve neden kaybettiğini net görsün. Kayıp bir hata mesajıyla değil, anlamlı bir hikâyeyle bitsin ("Kale 41. saniyede düştü — rekoruna 3 troll kaldı").

**Yerleşim (mobil öncelikli, 400 px):**
- **Üst şerit (sticky):** sol tarafta hedef halkası (`skor/eşik`, eşik geçince altın), ortada kale HP'si (5 kalp/kalkan), sağda süre. Altında ince öfke çubuğu (tam genişlik, dolunca nabız atar).
- **Arena:** kare oranlı canvas, merkezde görünür bir kale/çekirdek. Öfke hazır olduğunda kalenin kendisi dokunulabilir ulti düğmesi olsun. Başparmak arenadan ayrılmadan ulti tetiklenir. Ayrı buton masaüstü ve klavye için kalır.
- **Alt:** ses anahtarı + duraklat.
- **Lobi:** üç bilgi çipi (hedef, ödül, hak/yenilenme), "Nasıl oynanır" (ilk oyunda otomatik), turnuva kartı (geri sayım + "ilk 3'e X troll"), liderlik tablosu sekmeli: Bu hafta / Tüm zamanlar / Arkadaşlar.
- **Sonuç:** Arena Raporu kartı (istatistik ızgarası + kişisel rekor farkı), ödül kartı, seri/başarım rozetleri sırayla açılıyor, CTA'lar "Oyun Merkezi" ve "Sıradaki önerilen oyun".

**Motion/3D (yerinde ve ölçülü):**
- Canvas içi efektler kalsın ama sprite önbellekli olsun. Sarsıntı en fazla 4 px, flaş yerine kenar parlaması.
- Boss girişinde 500 ms'lik banner + kısa yavaşlama (hit-stop), dalga geçişinde merkezden yayılan halka.
- Sonuç ekranında framer-motion ile istatistik sayaçları sırayla saysın (stagger 60 ms). Ödül kartı mevcut spring ile gelsin.
- 3D gereksiz: oyun 2D okunurluğa dayanıyor. `boss-3d.tsx` gibi bir WebGL katmanı yalnızca lobide dekoratif boss önizlemesi olarak düşünülebilir ve azaltılmış harekette statik görsele düşmeli.
- Tüm bu efektler tek `useReducedMotion()` (OS + uygulama tercihi) kapısından geçsin.

**Veri/API değişiklikleri:**
- `MiniGameSession`: `durationMs Int?`, `attempts Int @default(1)`, `detail Json?` (kills, bestCombo, bosses, crits, ultis), `status` için `abandoned`.
- `MiniGameDef`: `roundSec`, `maxScorePerSec`, `maxDurationSec`. Skor tavanı ödül eşiğinden ayrılır.
- `/start`: terminal durum kontrolü, `active` oturumun tekrar istenmesinde `abandoned`'a çekme. `alreadyPlayed` yanıtında bugünkü sonuç.
- `/complete`: `won`'u sunucu türetir, skoru süreye göre ikinci kez sıkıştırır, `detail`'i saklar, eşitlik bozucu için `durationMs` yazar.
- Sayfa: sunucu bileşeninde `getEffectiveMiniGame` + bugünkü oturum okunur, `enabled=false` ise boş durum. Tüm metin ve sayılar prop olarak bileşene iner.
- Leaderboard/turnuva: `orderBy [{starsCollected:'desc'},{durationMs:'asc'},{completedAt:'asc'}]`. "Ben" sırası için `take: 100` yerine sayım sorgusu (`count where best > myBest`).

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/spam-defense` ile neredeyse birebir çakışıyor.** İkisinde de düşmanlar kenardan merkeze yürüyor, ikisinde de dokunarak yok ediliyor, sert düşmanlar, boss, dalgalar ve zamanla artan zorluk var (`spam-defense-game.tsx:14-17, 172-179, 223-226`). Fark yalnızca tema (spam botu ↔ troll) ve troll-slayer'ın eklediği öfke/kritik mekanikleri. `spam-defense`'te gerçek can kaybı var, troll-slayer'da yok. **Öneri:** iki oyunu tek motor + iki tema olarak birleştirin. Öfke ve kritik vuruşu `spam-defense`'e taşıyın, "Troll Arenası"nı sezonluk ya da haftalık dönen bir tema/mod olarak sunun. Hub'da 20 oyunun ikisi aynı hissi veriyor, birleşme seçim yorgunluğunu da azaltır.
- **`/customer/games/mind-thief` ve `/customer/games/combo-tap` ile kısmi çakışma.** Mind-thief'te bozuk öğelere dokunma + seviye boss'u, combo-tap'ta dokun-kombo döngüsü var. Bunlar birleştirme gerektirmiyor ama troll-slayer'ın kendine özgü değeri (öfke ulti'si) bu oyunlardan ayrışacak şekilde vurgulanmalı.
- **Kaldırma önerilmiyor:** Oyun, haftalık turnuva ve seri sistemine bağlı ve görsel olarak çekici. Doğru yol, onu birleşik "Arena Savunması" oyununun bir modu olarak korumak.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı. Okunan dosyalar: `app/customer/games/troll-slayer/page.tsx`, `components/customer/games/troll-slayer-game.tsx`, `components/customer/games/game-shell.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/[game]/leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/tournament-core.ts`, `app/api/admin/games/route.ts`, `prisma/schema.prisma` (`MiniGameSession`). Veritabanına dokunulmadı, hiçbir komut çalıştırılmadı.

### 1. Yarım oturum yeniden kullanılıyor; kayıp sonrası tekrar 409 — **DOĞRULANDI**

- `start/route.ts:56-73`: yalnızca `status === 'completed'` kilitliyor. `active` ve `failed` oturumlar için aynı `sessionId` ile `canPlay: true` dönüyor.
- `MiniGameSession.startedAt` yalnızca oluşturmada `@default(now())` alıyor (`schema.prisma:501`), yeniden başlatmada sıfırlanmıyor. Bu yüzden `complete/route.ts:81-83`'teki `serverElapsedSec` ilk başlangıçtan ölçülüyor ve ikinci denemede `tooFast` hiç tetiklenmiyor. İstemci tarafındaki `durationSec` ise her `start()`'ta yeniden ölçülüyor (`use-mini-game.ts:71,90`).
- **Sınırsız deneme senaryosu:** Oyuncu oynar. 50. saniyede skoru 20'nin altındaysa sayfayı yeniler. Bileşenin cleanup'ı (`troll-slayer-game.tsx:298-301`) yalnızca döngüyü durdurur ve `/complete` çağrılmaz. Oturum `active` kalır, oyuncu "Başla"ya basınca aynı oturumla yeniden oynar. Eşik geçilene kadar bu tekrarlanabilir. Sonunda günlük 170 puan + 85 XP alınır, ayrıca `completed` skor haftalık turnuva sıralamasına girer (`tournament/route.ts:28-38`). Hile aracı gerekmez, F5 yeterli.
- **Kayıp sonrası 409 senaryosu:** Oyuncu kaybeder ve `complete/route.ts:101` oturumu `failed` yazar. Hub bunu "bugün oynandı" saymaz, çünkü yalnızca `completed`'a bakar (`status/route.ts:32-35`). Oyuncu sayfaya dönüp "Başla"ya basar, `/start` `canPlay: true` döner, oyuncu 55 sn oynar. Ardından `/complete`'te `status` `completed` olmadığı için 73. satırdaki kontrol geçilir, ama `updateMany({ where: { status: 'active' } })` 0 satır günceller (`complete/route.ts:98-108`) ve 409 "Oyun zaten tamamlandı" döner (177-182). Sonuç: kaybeden her oyuncu tekrar denerse 55 sn boşa oynar ve hata toast'ı görür. Bu deterministik bir UX hatası.
- **Not:** Ekonomik etki günlük tek ödülle sınırlı (`@@unique([userId, gameType, dayKey])`). Asıl sorun "günde 1 hak" kuralının fiilen uygulanmaması ve `failed` durumunun tutarsız ele alınması. Düzeltme önerisi: `/start` `failed` (ve ileride `abandoned`) durumlarını terminal kabul edip `alreadyPlayed` dönsün. Ya da bilinçli olarak tekrar deneme hakkı verilecekse bu, ayrı bir `attempts` sayacıyla, `startedAt` yeniden yazılarak ve `/complete` guard'ı `status IN ('active')` + deneme numarasıyla açıkça modellenmeli. `active` oturumun ikinci kez istenmesi en az "yarıda bırakıldı → kayıp" sayılmalı.

### 2. Anti-cheat oyunun gerçekliğine ayarlı değil — **DOĞRULANDI**

- `lib/minigame-config.ts:178-182`: `maxScore: 40`, `rewardThreshold: 20`, `minDurationSec: 10`. Tur süresi 55 sn (`troll-slayer-game.tsx:14`).
- `complete/route.ts:15-22,59-61,80-87`: sunucu yalnızca `score`'u `maxScore`'a sıkıştırıyor, 10 sn alt sınırını kontrol ediyor ve `won` değerini istemcinin beyanından alıyor. `eligible = won && !tooFast`. Skorun süreyle tutarlılığı (puan/sn tavanı) ve `won`'un sunucuda türetilmesi yok.
- Gerçek oyunda ilk 10 sn'de spawn aralığı yaklaşık 1100→960 ms ve tek seferde en fazla 12 trol var (`troll-slayer-game.tsx:226-227`). 2. dalga ve boss 12. saniyeden önce gelmiyor (181-200). Bu nedenle 10 sn'de 40 skor fiziksel olarak imkânsız (gerçekçi tavan yaklaşık 10-11).
- **Yeniden üretim:** Giriş yapmış bir müşteri tarayıcı konsolundan `POST /api/customer/games/troll-slayer/start` atar, 10 sn bekler, sonra `POST .../complete {sessionId, score:40, durationSec:10, won:true}` gönderir. Sonuç: 170 puan + 85 XP, `status='completed'`, `starsCollected=40`. Bu kayıt tüm zamanlar tablosunda (`leaderboard/route.ts:47-53`) ve haftalık turnuvada (`tournament/route.ts:28-38`) tavan skoru olur, turnuva ilk 3'ü 500/300/150 puan alır (`tournament-core.ts:13`).
- **Ek bulgu (iddiada yok):** `status` değeri `eligible` ile değil yalnızca `won` ile belirleniyor (`complete/route.ts:101`). `tooFast` olsa bile `{won:true, score:40, durationSec:0}` gönderen biri ödül almaz ama `completed` + 40 skorla sıralamaya ve turnuvaya girer. Yani turnuva ödülü 10 sn beklemeden de manipüle edilebilir.
- **Kapsam:** Günlük oyun ödülü kullanıcı başına günde 1 ile sınırlı, ancak turnuva puanı her hafta yeni bir mint yolu. `points_credited` olayı yazıldığı için velocity/caps görünürlüğü var, ama bu engelleme değil. Bu, puan basan bir yol olarak gerçek. Öneri: `won`'u sunucu türetmeli (`score >= rewardThreshold`). `minDurationSec`, troll-slayer için tur süresine (55 sn) ya da `score / elapsed` tavanına bağlanmalı (ör. `maxScorePerSec`). `status` yalnızca `eligible` iken `completed` yazılmalı. Turnuva ve sıralama yalnızca süre-tutarlı oturumları saymalı. Uzun vadede olay günlüğü (öldürme zaman damgaları) ile sunucu tarafı makullük kontrolü yapılmalı.

### 3. İstemci statik registry kullanıyor; admin override'ında karar ve ödül ayrışıyor — **DOĞRULANDI (koşullu)**

- Admin override gerçek ve canlı: `app/api/admin/games/route.ts:140-147` `rewardThreshold`, `maxScore`, `minDurationSec` alanlarını kabul ediyor. `minigame-config-effective.ts:44-58` bunları sunucu tarafında uyguluyor.
- İstemci ise statik `DEF = getMiniGame('troll-slayer')` kullanıyor (`troll-slayer-game.tsx:11`). Kazanma kararı `scoreRef.current >= DEF.rewardThreshold` (292), erken bitiş `>= DEF.maxScore` (94,143), sonuç ekranındaki eşik metni `rewardThreshold={DEF.rewardThreshold}` (322). `/start`'ın döndürdüğü `config` `useMiniGame` içinde state'e yazılıyor (`use-mini-game.ts:70,137`) ama bu bileşende hiç okunmuyor.
- **Senaryo A (eşik 20→25):** 22 skorla tur bitiyor. İstemci `won=true` gönderiyor ve sonuç ekranında "kazandın" başlığı görünüyor. Sunucu `computeEffectiveReward` → 0 hesaplıyor, oturumu `completed` yazıyor. Kullanıcı "Kazandın ama ödül eşiğini geçemedin" toast'ı ve yanlış "Ödül için 20 skor gerekiyordu" metnini görüyor.
- **Senaryo B (eşik 20→15):** 17 skorla istemci `won=false` gönderiyor. Sunucu `eligible=false` → ödül 0, `failed`. Admin'in hak ettirdiği ödül verilmiyor.
- **Senaryo C (maxScore 40→60):** istemci 40'ta oyunu erken bitiriyor, 40 üstü skor hiç üretilemiyor.
- **Koşul:** Hata yalnızca admin bu oyun için `MiniGameConfig` override'ı girdiğinde ortaya çıkar. Canlıda override olup olmadığı DB'ye dokunulmadığı için **doğrulanmadı**. Kod yolu ise kesin. Kritik değil, orta önem. Öneri: oyun bileşenleri `game.config`'ten (yoksa `DEF`'ten) okumalı. Daha iyisi, sayfa sunucu bileşeninde `getEffectiveMiniGame` sonucunu prop olarak indirmeli ve 2. bulgudaki gibi `won` sunucuda türetilip sonuç ekranı sunucu yanıtından çizilmeli. Böylece istemci ile sunucu kararı ayrışamaz.

## Uygulama (Dalga 2)

Bu sayfa **Çekirdek Savunması** (`/customer/games/core-defense`) oyununa birleşti (spam-defense + troll-slayer, §7.3 #6–7). Eski rota sorgu parametrelerini koruyarak kalıcı yönlendirir; eski bileşen dosyası silindi; sunucu satırı `hidden` (+ `hiddenReason`) — tek `gameType`, tek günlük hak.

**Yeni yapı**
- Saf simülasyon `components/customer/games/core-defense/sim.ts` (60 Hz sabit adım, tohumlu RNG, trigonometrisiz → tarayıcı/Node replay birebir): çekirdek canı (10, zırhla artar), 8 dalga (sayı/hız/sıklık artar, 4. ve 8. dalgada boss), spam/trol/boss, kombo, kusursuz dalga bonusu, dalga arası 3 seçenekli yükseltme (8 tür; 12 sn'de seçilmezse ilki), kalkan darbesi (menzildeki her düşmana TEK vuruş + geri itme), kaybetme = çekirdek canı 0, zafer = 8 dalga.
- Bileşen `core-defense-game.tsx` (v2 sözleşmesi; kabuk/mod/duraklatma/oturum GameHost'ta): canvas DPR'lı motor yüzeyi, React state'e karede yazılmaz (HUD 10 Hz), `shadowBlur` yok, ızgara önbellekli; ilk oynayışta öğretici; başparmak erişimli kalkan düğmesi (≥44 px, ilerleme halkası, aria); yükseltme kartları (1-3 tuşları); sonuç özeti (skor, 3 yıldız, cihazdaki en iyi + "yeni rekor", isabet/kombo/dalga, eşiğe kalan, Web Share/pano paylaşımı; sıralıda 12 sn sonra kendiliğinden gönderir).
- Sunucu otoritesi: `lib/games/validators/core-defense.ts` deterministik replay — skor sunucunun; kanıtsız → `proof_missing`, kural dışı girdi / başka tohumun kaydı / beyan edilen adımda bitmemiş oyun → `proof_invalid`, hızlandırılmış betik → `implausible`, şişirilmiş beyan → sunucu skoruna iner (`score_mismatch`). Test: `__tests__/lib/core-defense.test.ts` (17 test).
- Kurallar (`lib/minigame-config.ts`): `maxScore 1200` (yalnız güvenlik tavanı; usta oyun ≈ 900–1000, eşitlik yığılması yok), `rewardThreshold 250` (≈ 5.–6. dalga), `minDurationSec 30`, `maxScorePerSec 12`, `maxDurationSec 600`.
- Erişilebilirlik: Okabe–Ito paleti + her tür ayrı şekil (elmas/boynuzlu kare/altıgen) + can çubuğu uzunluk/sayıyla; canvas `role="application"` + açıklama, `aria-live` duyurular (dalga, hasar, eşik); klavye: Boşluk en tehlikeli hedefe ateş, Q kalkan, 1-3 yükseltme, Esc duraklat. Ses/titreşim/sarsıntı/parçacık yalnız `fx` (hareket politikası + oyuncu tercihi); tam ekran flaş yok.

**Bulgu durumu (11):** kapandı 9 — #2 (replay doğrulama; `won` sunucuda türetilir), #3 (gerçek savunma ekseni: çekirdek canı, çarpan düşman hasar verir ve yok olur, can 0 = kayıp; isabet düşmanın kendi yarıçapıyla), #4 (eşik `config`'ten), #5 (60 Hz sabit adım, 120 Hz'de aynı hız), #6 (oyun saati adım tabanlı, otomatik duraklatma), #7 (tavan ödül eşiğinden ayrı ve oyunu kesmez; tur 8 dalga ya da çekirdek düşene dek), #8 (flaş yok, sarsıntı/parçacık politikaya bağlı, ses ayrı tercih, klavye + aria-live), #10 (DPR, `shadowBlur` yok, emoji yerine çizilmiş şekil seti), #11 (eski sayfa kalktı, boss uyarı sesi + "Dalga N · BOSS" bandı, gösterilen skor = sunucunun yeniden hesapladığı skor). Kısmi 1 — #9: HUD'da eşik ilerleme çubuğu + "Ödül eşiği geçildi" anı eklendi; lobi hak/ödül çipleri ve sunucu ön yükleme GameShell/GameHost'ta. Platformda 1 — #1 (deneme `start`'ta harcanır, `lib/game-session.ts`).
