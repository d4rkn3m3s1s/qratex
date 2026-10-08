# /customer/games/combo-tap

**Amaç:** Müşteri panelindeki 20 mini oyundan biri olan "Kombo Yıldız". 30 saniyelik refleks turunda beliren yıldızlara dokunup kombo yapılır, bombalardan kaçılır; skor ödül eşiğini (16) geçerse günde bir kez 150 puan + 75 XP, ayrıca günlük seri bonusu, başarım ve haftalık turnuva sıralaması kazanılır.

**Genel puan:** 5/10 · **Karar:** yeniden tasarla. Çekirdek döngü çalışıyor ve oyun hissi iyi. Buna karşın günlük hak kuralı iki yönden kırık (yenileyerek sınırsız tekrar deneme ve kaybettikten sonra boşa oynatma), skor tavanı (30) liderlik tablosunu ve turnuvayı anlamsız kılıyor, hedefler görsel olarak merkezlenmiyor ve oyunun kimliği diğer "dokun-yok et" oyunlarıyla çakışıyor. Skor modeli ve oyunun kimliği yeniden ele alınmalı.

İncelenen dosyalar:
- `app/customer/games/combo-tap/page.tsx`
- `components/customer/games/combo-tap-game.tsx`
- `components/customer/games/game-shell.tsx`
- `components/customer/games/fx-layer.tsx`
- `components/customer/games/game-leaderboard.tsx`
- `components/customer/games/game-tournament.tsx`
- `lib/use-mini-game.ts`
- `lib/minigame-config.ts`
- `lib/minigame-config-effective.ts`
- `lib/minigame-copy.ts`
- `lib/game-sounds.ts`
- `lib/admin-toast.ts`
- `lib/tournament-core.ts`
- `lib/points-wallet.ts`
- `app/api/customer/games/[game]/start|complete|leaderboard/route.ts`
- `app/api/customer/games/status/route.ts`
- `app/api/customer/tournament/route.ts`
- `app/customer/layout.tsx`
- `components/providers.tsx`
- `prisma/schema.prisma` (`MiniGameSession`, `MiniGameConfig`, `GameStreakClaim`, `TournamentRewardClaim`)
- `node_modules/framer-motion` 11.18.2: transform derleme mantığı

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oynanış, ödül ve seri akışı çalışıyor. Günlük hak kuralı ise iki yönden kırık, çıkış animasyonundaki hedefler ikinci kez puan veriyor ve sonuç ekranındaki etiket yanlış. |
| UX | 5/10 | Akış net ve geri bildirim zengin. Aynı açıklama üç kez tekrarlanıyor, "bugün oynadın" bilgisi ancak butona basınca geliyor, toast'lar üst üste biniyor ve hub'a dönüş yolu yok. |
| Görsel | 6/10 | Neon kabuk ve partikül efektleri canlı. Hedefler `translate(-50%,-50%)` ezildiği için merkezlenmiyor (dar ekranda kırpılıyor), turnuva bloğu açık temada okunmuyor. |
| Mimari | 6/10 | Registry, generic API ve ortak kabuk iyi kurulmuş. İstemci admin override'ını yok sayıp statik `DEF` kullanıyor, durum güncelleyicinin (updater) içinde yan etki var, `setTimeout`'lar temizlenmiyor. |
| Performans | 7/10 | Hafif DOM oyunu. FxLayer'ın RAF döngüsü boşta da 60 fps dönüyor. `complete` her çağrıda başarım istatistiğini iki kez hesaplıyor. |
| Erişilebilirlik + mobil | 3/10 | Klavye ve ekran okuyucu için hiçbir yol yok (aria-label ve aria-live yok). Sekme arka plana geçince süre işlemeye devam ediyor. Ses yalnızca "animasyonları azalt" ile kapanıyor. 10 px'lik ipucu metni düşük kontrastlı. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı yetki kontrolü (yalnızca CUSTOMER) | KISMİ | `app/customer/games/combo-tap/page.tsx:10-13` | Giriş yapmış bir BUSINESS/ADMIN kullanıcısı da `/auth/signin`'e atılıyor. "Yetkin yok" yerine giriş ekranı açılıyor, kafa karıştırıcı. |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s \| Müşteri alanı` olduğu için sonuç "Kombo Yıldız \| QRateX \| Müşteri alanı" oluyor, çift sonek. |
| 3 | Masaüstü sayfa başlığı (`DashboardPageHeading`) | ÇALIŞIYOR | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Yalnızca `sm` ve üstünde görünüyor. Açıklama metni kabuktaki metinle tekrar ediyor (bkz. #6). |
| 4 | Giriş ekranı: süzülen emoji animasyonu | ÇALIŞIYOR | `game-shell.tsx:173-180` | Sonsuz döngü. `MotionConfig reducedMotion="user"` y dönüşümünü kapatır, filter animasyonu sürer. |
| 5 | Oyun başlığı ve açıklaması | KISMİ | `combo-tap-game.tsx:167-169`, `page.tsx:18-19` | Statik registry'den geliyor. Admin'in `MiniGameConfig` başlık/emoji/renk override'ı bu sayfaya yansımıyor (hub'a yansıyor: `status/route.ts:40-48`). |
| 6 | Başlangıç ipucu şeridi (`startHint`) | ÇALIŞIYOR | `game-shell.tsx:185-188`, `lib/minigame-copy.ts:130-133` | "Beliren yıldızlara hızla dokun, komboyu kaçırma!" cümlesi `page.tsx:19`, `minigame-config.ts:203` ve burada, yani üç kez yazıyor. |
| 7 | Başlat düğmesi (nabız halkalı) | KISMİ | `game-shell.tsx:189-208` | Bugün oynamış kullanıcıya da "Refleksi Test Et" gösteriyor. Kilit ekranı ancak tıklandıktan sonra geliyor (`use-mini-game.ts:48,64-67`). |
| 8 | Haftalık turnuva: geri sayım | ÇALIŞIYOR | `game-tournament.tsx:77-82,116-119` | Dakika çözünürlüğünde. Son dakikada "Kapanıyor" yazıyor. |
| 9 | Turnuva: geçen haftanın ödülünü al | KISMİ | `game-tournament.tsx:84-97,123-140`, `tournament/route.ts:128-193` | Ödül tek seferlik ve atomik veriliyor. Ancak müşteri arayüzünde `@/lib/admin-toast` kullanıldığı için toast "Basarili: …" / "Dikkat: …" ön ekiyle (ASCII, ş eksik) çıkıyor. Eşitlik sorunu için bkz. B3. |
| 10 | Turnuva ödül havuzu (500/300/150) | ÇALIŞIYOR | `game-tournament.tsx:143-147`, `lib/tournament-core.ts:13` | — |
| 11 | Turnuva bu haftanın sıralaması | KISMİ | `game-tournament.tsx:150-170` | Renkler tema token'larıyla verilmiş (`text-muted-foreground`, renksiz `truncate`) ama zemin hep koyu. Açık temada isimler koyu zemin üstünde koyu yazı oluyor. Skor tavanı yüzünden sıralama eşitlerle dolu. |
| 12 | Turnuvada kendi sıram (ilk 10 dışındaysam) | ÇALIŞIYOR | `game-tournament.tsx:173-179` | — |
| 13 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx:24-112`, `leaderboard/route.ts:47-80` | Skor 30'da kırpılıyor (`complete/route.ts:61`), tepe eşitlerle dolu, ikincil sıralama yok. Ağ hatasında "Henüz skor yok" yazıyor (`:40`, `:55-60`), yani hata boş durum gibi görünüyor. |
| 14 | Liderlikte kendi sıram | KISMİ | `leaderboard/route.ts:52,76-80` | `take: 100` olduğu için 100. sıradan sonraki oyuncunun sırası `null` dönüyor. "N oyuncu" sayısı da en fazla 100 gösterebiliyor. |
| 15 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | `combo-tap` için `loadingStart` metni yok, varsayılan metin gösteriliyor. |
| 16 | Oturum açma ve günlük tek hak (`/start`) | KISMİ | `start/route.ts:51-83` | Tamamlanmamış `active` oturum yeniden döndürülüyor. Oyunu bitirmeden sayfayı yenileyen kullanıcı aynı gün sınırsız deneme yapabiliyor (B1). |
| 17 | "Bugün oynadın" kilit ekranı | KISMİ | `game-shell.tsx:308-332`, `start/route.ts:57` | Yalnızca `completed` durumunda kilitleniyor. `failed` (kaybedilmiş) oturum hiç kilitlenmiyor. Metin "Her gün 00:00 (UTC) sıfırlanır" diyor, bu da TR saatiyle 03:00 demek. |
| 18 | Skor göstergesi (her puanda büyüyüp küçülme) | ÇALIŞIYOR | `combo-tap-game.tsx:180-182` | `key={score}` her puanda yeniden mount ediyor. Basit bir iş, sorun değil. |
| 19 | Kombo rozeti (≥3x, alev) | ÇALIŞIYOR | `combo-tap-game.tsx:183-189` | — |
| 20 | Süre sayacı | KISMİ | `combo-tap-game.tsx:108-116,190` | `Date.now()` tabanlı. Sekme gizlenince durmuyor, `setInterval` kısıldığı için hedef de çıkmıyor; tur boşa yanıyor. Son 5 saniye için bir aciliyet işareti yok. |
| 21 | Hedef üretimi (620 ms, en fazla 7 hedef) | ÇALIŞIYOR | `combo-tap-game.tsx:76-107` | `prev.slice(-6)` en eski hedefi sessizce siliyor. Bu kombo sıfırlamıyor, tutarlı. |
| 22 | Zorluk artışı (TTL 1500 ms'den 700 ms'ye) | ÇALIŞIYOR | `combo-tap-game.tsx:82` | — |
| 23 | Altın hedef (%8, +5 jackpot) | ÇALIŞIYOR | `combo-tap-game.tsx:81,83,145` | — |
| 24 | Bomba (%22, komboyu sıfırlar) | ÇALIŞIYOR | `combo-tap-game.tsx:79,131-139` | Puan cezası yok, yalnızca kombo kaybı. Tasarım tercihi. |
| 25 | Hedeflerin konumlanması (merkezleme) | BOZUK | `combo-tap-game.tsx:204-213` + framer `useStyle`/`buildHTMLStyles` (`node_modules/framer-motion/dist/cjs/m.js:991,1285-1293`) | `scale`/`rotate` animasyonu olan `Motion.button`'da inline `transform:'translate(-50%,-50%)'` framer'ın ürettiği transform tarafından eziliyor. Hedef sol üst köşesinden oturuyor (B4). |
| 26 | TTL halkası (kalan ömür) | ÇALIŞIYOR | `combo-tap-game.tsx:224-230` | — |
| 27 | Dokunma puanlaması + 5'te bir +2 kombo bonusu | BOZUK | `combo-tap-game.tsx:126-163,198-233` | `AnimatePresence` çıkış animasyonu sürerken düğme DOM'da kalıyor ve `onClick` hâlâ çalışıyor. Aynı yıldıza hızlı ikinci dokunuş veya süresi dolmuş yıldıza dokunuş tekrar puan veriyor (B2). |
| 28 | Kaçırılan iyi hedef komboyu sıfırlar | ÇALIŞIYOR | `combo-tap-game.tsx:94-104` | Yan etki (`comboRef`, `setCombo`) `setTargets` updater'ının içinde. StrictMode'da iki kez çalışır. Kalıp hatalı ama sonuç idempotent. |
| 29 | FX katmanı (burst/ring/floatText/shockwave/confetti) | KISMİ | `combo-tap-game.tsx:130,136-158`, `fx-layer.tsx` | Efektler `toPx(t.x,t.y)` noktasında, yani hedefin mantıksal merkezinde çıkıyor. Görsel merkez ise #25 yüzünden 28 px sağ altta. RAF döngüsü boşta da dönüyor (`fx-layer.tsx:79-159`). |
| 30 | Ses efektleri + titreşim | KISMİ | `combo-tap-game.tsx:57-58,134-135,148-149,156`, `lib/game-sounds.ts:10-13,158-160` | Çalışıyor. Ancak ses yalnızca "Animasyonları azalt" tercihiyle kapanıyor, ayrı bir ses düğmesi yok. |
| 31 | Arena içi açıklama satırı | ÇALIŞIYOR | `combo-tap-game.tsx:235-237` | 10 px, `text-white/40`, düşük kontrast. Dar ekranda hedeflerin altında kalabiliyor. |
| 32 | Skor 30'a ulaşınca erken bitiş | ÇALIŞIYOR | `combo-tap-game.tsx:160` | 28 puandayken altın hedef gelirse 33 gönderiliyor, sunucu 30'a kırpıyor. |
| 33 | Kazanma kararı (istemcide eşik) | KISMİ | `combo-tap-game.tsx:13,114`, `use-mini-game.ts:70` | Statik `DEF.rewardThreshold` kullanılıyor. `/start`'ın döndürdüğü `config` (admin override) bu bileşende hiç okunmuyor (B5). |
| 34 | Sonuç gönderimi: ödül, seri, başarım, bildirim (`/complete`) | ÇALIŞIYOR | `complete/route.ts:96-229` | Atomik claim, `points_credited` ve `GameStreakClaim` doğru. Bildirim transaction dışında: hata olursa puan yazılmış olsa da 500 dönüyor (B8). |
| 34b | Kaybettikten sonra aynı gün tekrar oynama | BOZUK | `complete/route.ts:101,98-109`, `start/route.ts:57,69-73` | Kaybedilen oturum `failed` oluyor. `/start` bunu "devam edilebilir" sayıp tekrar oynatıyor, `/complete` ise `status:'active'` aradığı için 409 "Oyun zaten tamamlandı" dönüyor. Kullanıcı 30 saniye oynayıp hata görüyor (B1). |
| 35 | Sonuç ekranı: kupa/kurukafa + rastgele başlık | ÇALIŞIYOR | `game-shell.tsx:222-267`, `minigame-copy.ts:134-135` | — |
| 36 | Sonuç ekranındaki skor etiketi | BOZUK | `minigame-copy.ts:136`, `game-shell.tsx:270` | Etiket "Kombo: 18" diyor ama gösterilen değer kombo değil toplam skor. Yanlış veri izlenimi veriyor. |
| 37 | Ödül hapı / eşik notu | ÇALIŞIYOR | `game-shell.tsx:274-294` | Not, eşiği statik `DEF`'ten alıyor (bkz. #33). |
| 38 | Ödülde konfeti | ÇALIŞIYOR | `game-shell.tsx:86-94` | `reduce-animations` sınıfına uyuyor. OS seviyesindeki `prefers-reduced-motion` tercihine uymuyor. |
| 39 | Toast'lar (ödül, seri, başarım) | ÇALIŞIYOR | `use-mini-game.ts:112-125` | Sonuç kartıyla aynı bilgiyi tekrar ediyor. 3–4 toast üst üste binebiliyor. |
| 40 | Uygulama içi bildirim kaydı | ÇALIŞIYOR | `complete/route.ts:185-212` | — |
| 41 | Sonuç ekranında liderlik tablosu | ÇALIŞIYOR | `game-shell.tsx:299-303` | Yeniden mount olunca tazeleniyor. Turnuvadaki yeni sıra ise sonuç ekranında gösterilmiyor. |
| 42 | Azaltılmış hareket desteği | KISMİ | `providers.tsx:232`, `fx-layer.tsx:44-47`, `game-sounds.ts:10-13` | İki ayrı sistem var: OS tercihi yalnızca framer dönüşümlerini, uygulama tercihi yalnızca FX/ses/konfetiyi kapatıyor. Tutarsız. |
| 43 | Klavye / ekran okuyucu erişimi | EKSİK | `combo-tap-game.tsx:200-222` | Hedeflerde `aria-label` yok. Skor ve süre için `aria-live` yok. Alternatif bir giriş yolu yok. |
| 44 | Sekme gizlenince duraklatma | EKSİK | `combo-tap-game.tsx:64-124` | `visibilitychange` dinlenmiyor. |
| 45 | Hub'a dönüş / "sıradaki oyun" geçişi | EKSİK | `page.tsx:16-22`, `game-shell.tsx:295-303` | Sonuç ekranından başka bir oyuna geçmenin yolu yok. |
| 46 | Kişisel rekor / geçmiş | EKSİK | — | "En iyi skorun" bilgisi yalnızca 10. sıradan sonra dolaylı yoldan görünüyor. |
| 47 | Admin'in kapattığı oyunun ele alınması | KISMİ | `start/route.ts:34-39` | Sayfa yine açılıyor. Kullanıcı ancak başlata basınca "Bu oyun şu anda kullanılamıyor" toast'ını görüyor. |
| 48 | Sonucu paylaşma | EKSİK | — | — |
| 49 | 3-2-1 hazırlık sayacı | EKSİK | `combo-tap-game.tsx:107` | Başlata basar basmaz 620 ms içinde ilk hedef çıkıyor. |
| 50 | Deneme / pratik modu | EKSİK | — | Günde tek hak varken öğrenme turu yok. |

**Sayım:** ÇALIŞIYOR 24 · KISMİ 16 · BOZUK 4 · SAHTE 0 · EKSİK 7 (toplam 51)

---

## Bulgular

### B1. Günlük tek hak kuralı iki yönden kırık
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / ekonomi
- **Kanıt:**
  - `app/api/customer/games/[game]/start/route.ts:56-73`: yalnızca `completed` kilitliyor, `active` VE `failed` için aynı `sessionId` ile `canPlay:true` dönüyor.
  - `complete/route.ts:98-109`: `updateMany where status:'active'`, sayı 0 ise 409.
  - `complete/route.ts:101`: kaybedilen oyun `status: 'failed'`.
  - `status/route.ts:33`: hub yalnızca `completed` olanı "oynandı" sayıyor.
- **Sorun:**
  1. **Sınırsız tekrar deneme:** Kullanıcı başlatır, gidişat kötüyse 30 saniye dolmadan sayfayı yeniler. Oturum `active` kaldığı için `/start` aynı oturumu verir. Kazanana kadar tekrar edilebilir. `startedAt` eski kaldığı için süre kontrolü de engel olmuyor.
  2. **Kaybedene boşa oyun:** Turu bitirip kaybeden kullanıcı (`failed`) hub'da "oynanmadı" görünür, başlat düğmesi çalışır ve 30 saniye oynatılır. Gönderimde 409 + "Oyun zaten tamamlandı" toast'ı ve 0 ödüllü sonuç çıkar. Hem güven hem zaman kaybı.
- **Profesyonel öneri:** Günlük hakkı durum makinesiyle netleştirin.
  - `/start`, `active` oturum için tekrar başlatmaya izin vermesin. Ya "devam et" yerine "bu deneme yandı" kabul edilsin ve oturum `abandoned` olarak kapansın, ya da (Duolingo'nun "can" modeli gibi) açıkça ikinci bir deneme hakkı tanımlansın.
  - `failed` ve `abandoned` da kilit sayılsın. `/start` yanıtı `{ canPlay:false, reason:'lost'|'completed'|'abandoned', lastScore }` dönsün.
  - Hub'daki `status` sorgusu `status in ('completed','failed','abandoned')` olsun.
  - Sayfa sunucu bileşeninde (`page.tsx`) bugünkü oturum önceden okunup `GameShell`'e `initialLockState` geçilsin. Böylece kilit ekranı tıklamadan görünür.
- **Efor:** M

### B2. Çıkış animasyonundaki hedefe dokunmak tekrar puan veriyor
- **Önem:** yüksek · **Kategori:** oyun bütünlüğü / hata
- **Kanıt:**
  - `combo-tap-game.tsx:198-233`: `AnimatePresence` ve `exit={{ scale: 0, opacity: 0 }}` ile, `stiffness 320 / damping 16` yaylı geçiş (az sönümlü, yaklaşık 0,4–0,6 sn).
  - `combo-tap-game.tsx:126-129`: `tap()` yalnızca `runningRef`'e bakıyor, hedefin hâlâ yaşayıp yaşamadığını kontrol etmiyor.
- **Sorun:** `AnimatePresence`, çıkan çocuğu son prop'larıyla (`onClick` dahil) animasyon bitene kadar DOM'da tutar. Bir yıldıza hızlı çift dokunuş iki kez +1 ve kombo artışı verir. Süresi dolup sönmekte olan yıldıza dokunuş da puan sayar. Bombaya çift dokunuş komboyu iki kez sıfırlar (zararsız). Ödül eşiği (16) yapay biçimde kolaylaşıyor, liderlikte eşitlik artıyor. (Kod okumasıyla tespit edildi, cihazda tıklanarak doğrulanmadı.)
- **Profesyonel öneri:** Hedef yaşam döngüsünü tek bir kaynakta tutun.
  - `aliveRef = new Set<number>()`: `spawn`'da ekleyin, `tap`/TTL'de `delete(t.id)` ile atomik olarak "tüketin". `tap` başında `if (!aliveRef.current.delete(t.id)) return;` olsun.
  - Çıkış sırasında `pointerEvents:'none'` için `exit={{ ..., pointerEvents: 'none' }}` verin ya da `onPointerDown` kullanın.
  - TTL zamanlayıcılarını bir Map'te tutup cleanup'ta `clearTimeout` edin (şu an `combo-tap-game.tsx:94` sızıyor).
- **Efor:** S

### B3. Skor tavanı (30) liderliği ve turnuvayı anlamsızlaştırıyor; turnuva ödülü belirsiz dağılıyor
- **Önem:** yüksek · **Kategori:** ekonomi / oyun tasarımı
- **Kanıt:**
  - `lib/minigame-config.ts:207` (`maxScore: 30`), `combo-tap-game.tsx:160` (30'da erken bitiş), `complete/route.ts:61` (kırpma).
  - `tournament/route.ts:29-35` ve `leaderboard/route.ts:47-53`: `orderBy: { _max: { starsCollected: 'desc' } }`, ikincil anahtar yok.
  - `tournament/route.ts:145-147`: claim sırasında sıra yeniden hesaplanıyor.
  - `lib/tournament-core.ts:13`: 500/300/150 puan.
- **Sorun:** İyi her oyuncu 30'da duruyor. Haftalık sıralamada 30'a ulaşan N kişi arasındaki sırayı Postgres'in belirsiz grup sırası belirliyor. GET ile POST farklı sıra üretebilir: kullanıcı "1. oldun" kartını görüp claim'de 400 alabilir. Daha kötüsü, sıra istekten isteğe değişirse 3'ten fazla kullanıcı ilk 3 ödülünü talep edebilir. `TournamentRewardClaim` unique anahtarı `(userId, gameType, weekKey)`, yani sıra başına değil kullanıcı başına. Bu bir puan basma açığı. (Belirsiz sıralama SQL semantiğinden çıkarıldı, canlıda gözlenmedi.)
- **Profesyonel öneri:**
  - **Skor modeli:** `maxScore` anti-cheat tavanı olarak kalsın ama oyunun doğal tavanının çok üstünde olsun (ör. 30 sn × hedef/sn × kombo ile yaklaşık 120). Erken bitiş kaldırılsın.
  - **Sıralama:** "en iyi skor DESC, sonra o skora ilk ulaşma zamanı (`completedAt`) ASC, sonra `userId`" kuralıyla deterministik yapılsın. `groupBy` yerine `DISTINCT ON (userId)` ile `$queryRaw` ya da `MiniGameBest` gibi bir materyalize tablo kullanılabilir.
  - **Turnuva ödülü:** Hafta kapanınca bir cron işi sıralamayı bir kez dondurup `TournamentResult(weekKey, gameType, rank UNIQUE)` satırlarına yazsın. Claim bu dondurulmuş tablodan yapılsın. Bu, mevcut "cron fail-closed / tek-claim" ilkesiyle de uyumlu.
- **Efor:** M

### B4. Hedefler merkezlenmiyor: framer, inline `translate(-50%,-50%)`'i eziyor
- **Önem:** orta · **Kategori:** görsel / hata
- **Kanıt:**
  - `combo-tap-game.tsx:204-213`: `initial={{ scale: 0, rotate: -30 }}` ile `style={{ transform: 'translate(-50%, -50%)' }}` birlikte kullanılıyor.
  - framer-motion 11.18.2 `useStyle` (`m.js:1285-1293`): önce ham `style` kopyalanıyor, ardından `buildHTMLStyles` dönüşüm değerlerinden ürettiği `transform`'u (`m.js:991-994`) üzerine yazıyor.
  - Projenin kendi ölçülmüş tuzak notu da aynı davranışı söylüyor: "framer inline transform … ezer".
- **Sorun:** 56 px'lik yıldız (x%, y%) noktasına sol üst köşesinden oturuyor. Sonuçlar:
  1. Patlama, halka ve yazı efektleri yıldızın 28 px sol üstünde çıkıyor (`toPx` merkezi varsayıyor).
  2. `x` en fazla %88 olduğu için, yaklaşık 317 px genişliğindeki mobil arenada (375 px ekran, layout `pl/pr 0.75rem` ve kabuk `p-4`) sağdaki yıldız yaklaşık 18 px kırpılıyor (`overflow-hidden`).
  3. Alt satırdaki ipucu metniyle çakışma artıyor.

  Aynı kalıp `network-defender-game.tsx:313`, `speed-order-game.tsx:207` ve `mind-thief-game.tsx:433`'te de var.
- **Profesyonel öneri:** Konumlamayı ve animasyonu katmanlara ayırın. Dış `div` saf CSS ile `absolute left/top + -translate-x-1/2 -translate-y-1/2` yapsın, içteki `Motion.button` yalnızca scale/rotate animasyonu yapsın. Alternatif: framer'ın `x:'-50%', y:'-50%'` değerlerini `initial`/`animate`'e katmak. Konum aralığını yarıçap kadar içeri alın (`x ∈ [r, W−r]`, piksel tabanlı). Ortak bir `<ArenaTarget>` bileşeni dört oyunu birden düzeltir. Düzeltmeyi görsel doğrulama tezgâhında (headless Chrome) ölçerek kapatın.
- **Efor:** S

### B5. İstemci, admin override'ını yok sayıyor; yanlış `won` bayrağı ödülü kesebilir
- **Önem:** orta · **Kategori:** mimari / veri bütünlüğü
- **Kanıt:**
  - `combo-tap-game.tsx:13,114,160,174`: `DEF = getMiniGame(...)` statik registry'den.
  - `use-mini-game.ts:70`: `config` saklanıyor ama bileşen okumuyor.
  - `complete/route.ts:86`: `eligible = won && !tooFast`.
  - `complete/route.ts:101`: `won=false` olursa `failed`.
- **Sorun:**
  - Admin `rewardThreshold`'u 12'ye indirirse 14 puan yapan oyuncu istemcide `won=false` gönderir. Sunucu eşiği geçmiş olsa bile ödül vermez ve oturumu `failed` yapar.
  - Eşik 20'ye çıkarılırsa 17 puanlık "Kusursuz Ritim! 🏆" ekranı ve "ödül eşiğini geçemedin" toast'ı aynı anda görünür.
  - Başlık, emoji ve renk override'ları da sayfaya yansımıyor.
- **Profesyonel öneri:**
  - `won` kararını sunucuya taşıyın. İstemci yalnızca skor ve olay günlüğü göndersin, sunucu `won = clampedScore >= effective.rewardThreshold` hesaplayıp yanıtta dönsün.
  - Sayfa sunucu bileşeni `getEffectiveMiniGame('combo-tap')` ile etkin tanımı alıp `ComboTapGame`'e prop olarak geçsin. `enabled=false` ise "bakımda" durumu SSR'da gösterilsin (#47).
- **Efor:** S–M

### B6. Skor tamamen istemciden geliyor: script ile günlük ödül ve turnuva toplanabiliyor (sistem geneli)
- **Önem:** yüksek · **Kategori:** güvenlik / ekonomi
- **Kanıt:**
  - `complete/route.ts:15-22`: `score` ve `won` istemciden geliyor.
  - `complete/route.ts:80-87`: tek savunma `minDurationSec: 8` (`minigame-config.ts:211`).
  - `lib/points-wallet.ts:27-43`: oyun kredisinde günlük tavan yok.
- **Sorun:** `POST /start`, 8 saniye bekleme ve `POST /complete {score:30, won:true, durationSec:30}` dizisi her gün 150 puan + 75 XP + seri XP'si veriyor ve turnuvada 30 ile zirveye eşitliyor. 19 registry oyunu için bu, kullanıcı başına günde yaklaşık 2.850 puan demek. `points_credited` olayı velocity dedektörüne görünür (`complete/route.ts:162-171`), yani tespit edilebilir ama önlenmiyor.
- **Profesyonel öneri:**
  - Oyuna özgü ucuz bir doğrulama: sunucu `/start`'ta tohum (seed) üretsin, istemci hedef dizisini bu tohumla üretsin (deterministik PRNG) ve `complete`'te dokunma günlüğünü (hedef id, ms) göndersin. Sunucu günlüğü yeniden oynatıp skoru kendisi hesaplasın, insan üstü tepki sürelerini (<120 ms) reddetsin.
  - Bunun yanında tüm oyunlar için kullanıcı başına günlük oyun puanı tavanı (`lib/points-caps`) uygulansın.
- **Efor:** L

### B7. Turnuva bloğu açık temada okunmuyor ve yönetici toast'ı kullanıyor
- **Önem:** orta · **Kategori:** görsel / dil
- **Kanıt:**
  - `game-tournament.tsx:6`: `import { toast } from '@/lib/admin-toast'`.
  - `lib/admin-toast.ts:17,19`: `'Basarili: '`, `'Dikkat: '`.
  - `game-tournament.tsx:116,134,143,151,164`: renk ya tema token'ı ya da hiç verilmemiş.
  - `game-shell.tsx:97-104`: zemin her zaman `rgba(6,4,16,0.98)`.
- **Sorun:** Açık temada `body` rengi koyu olduğu için "Geçen hafta X. oldun!" ve sıralama isimleri koyu zemin üstünde koyu metin olarak çıkıyor. Müşteri toast'ları Türkçe karakter içermeyen yönetici ön ekiyle görünüyor ("Basarili: 🏆 1. oldun"). Ayrıca `GameLeaderboard` `text-white/*` kullanıyor, turnuva token kullanıyor; aynı kart içinde iki ayrı görsel dil var.
- **Profesyonel öneri:** `GameShell` içi için bir "arena teması" token seti (`--arena-fg`, `--arena-muted`, `--arena-accent`) tanımlayın, kabuk kökünde `text-white` + `dark` bağlamı zorlansın. `GameTournament` ve `GameLeaderboard` tek bir `ArenaRankList` bileşeninde birleşsin. Toast `sonner`'dan doğrudan alınsın.
- **Efor:** S

### B8. Ödül verildikten sonra bildirim hatası 500 döndürüyor
- **Önem:** düşük · **Kategori:** hata yönetimi
- **Kanıt:** `complete/route.ts:185-194`: `notification.create` transaction dışında ve try bloğunda değil. Hata olursa `:230-237` 500 döner. İstemci (`use-mini-game.ts:126-128`) "0 ödül" sonucu gösterir.
- **Sorun:** Puan yazılmış olduğu hâlde kullanıcı hata ve ödülsüz sonuç görür. Tekrar denemede 409 alır.
- **Profesyonel öneri:** Bildirimi transaction içine alın ya da `after()` ile ve try/catch içinde, best-effort olarak çalıştırın. Yanıt her zaman transaction sonucuna dayansın.
- **Efor:** S

### B9. Sonuç etiketi yanlış: "Kombo" denip skor gösteriliyor
- **Önem:** orta · **Kategori:** UX / yanlış veri
- **Kanıt:** `minigame-copy.ts:136` (`scoreLabel: 'Kombo'`), `game-shell.tsx:270-271` (`result.score`).
- **Sorun:** Oyuncunun en yüksek kombosu hiç saklanmıyor. "Kombo: 18" gerçekte toplam puan. Oyunun asıl başarı ölçüsü (en uzun seri) görünmüyor.
- **Profesyonel öneri:** Etiket "Skor" olsun. `maxCombo`, isabet oranı ve altın sayısı istemcide tutulup sonuç kartında "Spotify Wrapped" tarzında üç istatistik olarak gösterilsin. Bunlar `MiniGameSession`'a `meta Json` alanıyla kaydedilsin (kişisel rekor ve başarımlar için de gerekli).
- **Efor:** S

### B10. Kilit bilgisi geç geliyor, metinler tekrar ediyor, toast'lar üst üste biniyor
- **Önem:** orta · **Kategori:** UX
- **Kanıt:**
  - `use-mini-game.ts:48`: `alreadyPlayed` false başlıyor.
  - `page.tsx:19`, `minigame-config.ts:203`, `minigame-copy.ts:132`: aynı cümle üç kez.
  - `use-mini-game.ts:112-125`: ödül, seri ve N başarım toast'ı ayrı ayrı.
  - `game-shell.tsx:323`: "00:00 (UTC)".
- **Sorun:** Bugün oynamış kullanıcı parlayan "Refleksi Test Et" düğmesine basıp ancak sonra kilit görüyor. Sonuç kartı zaten ödülü gösterirken 3–4 toast ekranı kaplıyor. Sıfırlama saati TR kullanıcısına yanlış (gerçekte 03:00).
- **Profesyonel öneri:**
  - Kilit durumu SSR'da gelsin (B1 ile birlikte).
  - Toast'lar kaldırılıp seri ve başarımlar sonuç kartına adım adım açılan "ödül kuyruğu" olarak eklensin: önce puan, sonra seri alevi, sonra başarım rozeti (Duolingo'nun ders sonu ekranı gibi).
  - "Yeni hak: 3 sa 12 dk sonra" gibi yerel saatli bir geri sayım gösterilsin.
  - Gün anahtarı ürün kararıyla `Europe/Istanbul`'a taşınabilir.
- **Efor:** M

### B11. Erişilebilirlik ve arka plan davranışı
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil
- **Kanıt:**
  - `combo-tap-game.tsx:200-222`: aria yok.
  - `combo-tap-game.tsx:107-116`: `visibilitychange` yok.
  - `combo-tap-game.tsx:235`: 10 px `text-white/40`.
  - `game-sounds.ts:10-13`: ses yalnızca `reduce-animations` ile kapanıyor.
- **Sorun:** Ekran okuyucu "düğme, yıldız" duyar ama skor ve süre değişimini duymaz. Klavye kullanıcısı hareketli hedeflere ulaşamaz. Telefon kilitlenir ya da sekme değişirse tur yanar (günlük tek hak). Toplu taşımada oynayan kullanıcı sesi kapatmak için animasyonları kapatmak zorunda.
- **Profesyonel öneri:**
  - Arena `role="application"` + `aria-label`, hedefler `aria-label="Yıldız, +1"` / `"Bomba"`.
  - `aria-live="polite"` bir bölgede 5 saniyede bir skor ve süre özeti.
  - Erişilebilirlik modu: hedefler sabit 3×3 ızgarada çıksın, 1–9 tuşlarıyla vurulsun, TTL uzasın.
  - `document.hidden` olduğunda tur duraklasın; sunucu süre kontrolü duraklamayı tolere etsin.
  - `GameShell` başlığına ayrı bir 🔇 ses düğmesi (localStorage).
  - İpucu metni en az 12 px ve `white/60`.
- **Efor:** M

### B12. Küçük teknik borçlar
- **Önem:** düşük · **Kategori:** mimari / performans
- **Kanıt ve sorun:**
  - `combo-tap-game.tsx:94-104`: updater içinde yan etki.
  - `combo-tap-game.tsx:94`: TTL `setTimeout`'ları temizlenmiyor.
  - `combo-tap-game.tsx:123`: `exhaustive-deps` susturulmuş.
  - `fx-layer.tsx:79-159`: parçacık yokken de RAF ile temizleme yapılıyor.
  - `complete/route.ts:90-94,199`: `computeAchievementStats` istek başına iki kez çalışıyor (aynı DB yükü iki kat).
  - `start/route.ts:44`: `'Unauthorized'` İngilizce hata metni toast olarak kullanıcıya düşebiliyor.
  - `page.tsx:7`: başlık çift sonek alıyor.
- **Profesyonel öneri:**
  - Oyun döngüsünü tek bir `requestAnimationFrame` saatine bağlayan bir `useArenaLoop` hook'u yazın (spawn, TTL ve süre aynı saatten). Zamanlayıcı sızıntısı ve StrictMode sorunları birlikte kalkar.
  - FxLayer parçacık bitince RAF'ı durdursun, `burst` çağrısında yeniden başlatsın.
  - Başarım farkını transaction içinde yalnızca etkilenen sayaçlar üzerinden hesaplayın.
  - Metadata `title: 'Kombo Yıldız'` olsun.
- **Efor:** M

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kişisel rekor ve ilerleme:** "En iyi: 27 · Bu hafta: 22 · Son 7 gün" mini grafiği. Duolingo/Strava'da her seans kişisel bir ölçüyle karşılaştırılır. Şu an yalnızca küresel tablo var.
2. **Bir sonraki adım:** Sonuç ekranında "Sıradaki oyun: Kar Tanesi Yakala (bugün oynamadın)" önerisi ve hub'a dönüş. Starbucks/Duolingo seans sonunda bir sonraki eylemi önerir. Şu an çıkmaz sokak.
3. **Paylaşılabilir sonuç kartı:** Spotify Wrapped tarzında maxCombo, isabet oranı ve haftalık sıra içeren, `next/og` ile üretilmiş görsel ve davet linki (referral ile bağlanabilir).
4. **Isınma ve öğretici:** İlk girişte 10 saniyelik ödülsüz pratik ve 3-2-1 hazırlık sayacı. Günde tek hak varken öğrenme maliyeti oyuncuya yazılmasın.
5. **Ses ve titreşim tercihleri:** Kabukta ayrı ses ve titreşim düğmeleri (Monzo/Revolut'ta haptik ayrı yönetilir).
6. **Sosyal ve arkadaş sıralaması:** Turnuvada "arkadaşların" ve "şehrin" sekmeleri. Squads ve referral sistemi mevcut, bağlanmamış.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60 saniyelik, markaya ait bir "refleks ritüeli". Kullanıcı sayfaya girdiğinde durumunu anında görür: oynanabilir, kilitli (yeni hakka kalan süre) ya da bakımda. Oyun 3-2-1 ile başlar. Akıcı ve adil bir turdan sonra sonuç kartı ödülleri sırayla açar: puan, seri alevi, başarım, haftalık sıra değişimi ("↑ 4 sıra"). Ardından bir sonraki oyun önerilir.

**Kimlik (çakışmayı çözmek için):** Oyunu Qratex anlatısına bağlayın: **"Yıldız Puanı"**. Beliren kartlar ⭐⭐⭐⭐⭐ (gerçek yorum), 💣 yerine "1★ spam bot" ve altın hedef yerine "Doğrulanmış yorum ✓" olur. Mekanik aynı kalır ama oyun artık "dokun-yok et" kalabalığından ayrılır ve ürünün değer önerisini (güvenilir yorum) pekiştirir.

**Yerleşim (mobil öncelikli):**
- Üst şerit: sol skor, orta kombo ölçer (5'e dolan halka, dolunca ×2 parlaması), sağ süre halkası (son 5 sn kırmızı nabız).
- Arena: tam genişlik, yükseklik `min(60dvh, 460px)`, konumlar piksel tabanlı ve yarıçap kadar içeride.
- Giriş ekranı:
  - Kahraman bölümü: tek cümlelik açıklama (tekrarsız).
  - Başlat CTA'sı.
  - Kişisel rekor çipi.
  - Sekmeli bir "Sıralama" kartı: Bu hafta (ödüllü), Tüm zamanlar, Arkadaşlar.
- Sonuç ekranı: üç istatistik kartı (skor, maxCombo, isabet %), ödül kuyruğu, "Paylaş" ve "Sıradaki oyun" düğmeleri.

**Motion / 3D (yerinde ve ölçülü):**
- 3D gereksiz. DOM ve tek canvas FX katmanı doğru seçim.
- Hedef doğuşu ve TTL halkası korunsun. Konumlama dış katmanda saf CSS olsun (B4).
- Kombo ×2 anında arena kenarında kısa bir renk dalgası (`box-shadow` geçişi). Ekran sarsıntısı yalnızca bombada ve 120 ms.
- Sonuç kuyruğunda `stagger` 120 ms.
- `prefers-reduced-motion` ve uygulama tercihi tek bir `useReducedFx()` hook'unda birleşsin. Hem framer'a (`MotionConfig`) hem FxLayer/konfeti/sese uygulansın.

**Veri / API değişiklikleri:**
1. `MiniGameSession` için:
   - `status` değerlerine `abandoned` eklensin.
   - `meta Json?` alanı eklensin (maxCombo, hits, misses, goldens).
   - `seed String?` alanı eklensin.
2. `POST /start`:
   - Mevcut `active` oturumu `abandoned` yapsın (ya da açık bir ikinci hak politikası uygulasın).
   - Yanıta `seed`, `effectiveConfig` ve `lockState` eklensin.
3. `POST /complete`:
   - `won`'u sunucu hesaplasın.
   - Dokunma günlüğünü yeniden oynatıp skoru doğrulasın.
   - Bildirimi `after()` ile göndersin.
4. `GET /api/customer/games/combo-tap/me`: kişisel rekor ve son 7 gün (Upstash cache, 60 sn).
5. Sıralama: deterministik (skor DESC, `completedAt` ASC). Haftalık sonuç cron ile `TournamentResult`'a dondurulsun, claim oradan yapılsın.
6. `page.tsx`: `getEffectiveMiniGame` + bugünkü oturum SSR'da okunsun, `enabled=false` ise bakım ekranı gösterilsin. Statik public sayfa olmadığı için build-time DB guard gerekmez ama `try/catch` ile "durum bilinmiyor → oynanabilir" varsayılanı eklensin.

---

## Çakışmalar / birleştirme önerisi

- **Mekanik çakışma:**
  - `troll-slayer` (dokun-yok et arenası, kombo; `minigame-config.ts:171-175`)
  - `frost-catcher` (kombo + altın kristal; `:340-344`)
  - `network-defender` (düğümlere dokun; `:185-189`)
  - `speed-order` (dokunma refleksi; `:227-231`)

  Kombo Yıldız bunların en basit ve markadan en kopuk olanı.
- **Öneri:** Bu sayfayı kaldırmak yerine yukarıdaki "Yıldız Puanı" kimliğiyle yeniden konumlandırın. Hub'da (`games-hub.tsx`) oyunları "Refleks", "Zekâ", "Strateji" kategorilerine ayırın, refleks kategorisinde en fazla 3 oyun kalsın. Kimlik değişmeyecekse `combo-tap` ile `frost-catcher` tek bir "Yakala" oyununun iki teması olarak birleştirilebilir (ortak motor, farklı görünüm). Bu, 20 oyunluk bakım yükünü de azaltır.
- **Paylaşılan bileşenlerdeki sorunlar tüm oyunları etkiliyor:** `GameShell`, `GameTournament`, `GameLeaderboard`, `useMiniGame` ve generic `/start`–`/complete` uçlarındaki B1, B3, B5, B6, B7 ve B10 bulguları 19 registry oyununun tamamında geçerli. Düzeltmeler oyun bazında değil, bu ortak katmanda yapılmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddiayı çürütmek için ilgili kod baştan okundu: route'lar, `useMiniGame`, `GameShell`, `minigame-config-effective`, `points-wallet`, `points-caps`, Prisma şeması ve kurulu `framer-motion@11.18.2` kaynağı. Kod değiştirilmedi, DB'ye dokunulmadı, cihazda çalıştırılmadı.

### 1. Günlük tek hak atlatılabiliyor, kaybeden tekrar oynayıp 409 alıyor: **DOĞRULANDI**

- `app/api/customer/games/[game]/start/route.ts:56-73` yalnızca `status === 'completed'` durumunu kilitliyor. `active` ve `failed` oturumlar için `canPlay: true` ile aynı `sessionId` dönüyor. Satır 69'daki yorum bunun bilinçli tasarım olduğunu söylüyor ("tekrar başlatılabilir").
- **Senaryo A, sınırsız deneme:** Oyuncu turu başlatır. 25. saniyede skoru 16'nın altındaysa sayfayı yeniler. `/complete` hiç çağrılmadığı için oturum `active` kalır ve "Başla" yeniden aynı oturumu verir. Oyuncu bunu 16'yı geçene kadar tekrarlayabilir. Sunucunun süre kontrolü (`complete/route.ts:81`) ilk `startedAt` değerine baktığı için de engel olmaz. Ödül yine günde bir kez verilir, ama "günde 1 hak" fiilen "kazanana kadar dene" oluyor.
- **Senaryo B, kaybedeni yanıltma:**
  1. Oyuncu 16'nın altında bitirir. `won=false` gider, oturum `failed` olur (`complete/route.ts:101`).
  2. Oyuncu sayfayı yeniler. Hook durumu sıfırlanır ve idle ekranı gelir.
  3. Başla'ya basar. `/start`, `failed` oturum için `canPlay: true` döner ve oyuncu 30 saniye oynar.
  4. `/complete` çağrısındaki `updateMany where status:'active'` 0 satır günceller. Satır `:177-181` 409 "Oyun zaten tamamlandı" döner. Oyuncu bu turu kazanmış olsa bile ödül alamaz ve hata toast'ı görür.
- `app/api/customer/games/status/route.ts:33` yalnızca `completed` sayıyor. Bu yüzden hub kaybedilmiş oyunu "oynanmadı" gösteriyor ve kullanıcıyı Senaryo B'ye yönlendiriyor.
- **Öneri:**
  - `/start`, `failed` durumunu da kilitlemeli ve `alreadyPlayed: true` dönmeli.
  - Yarım kalan `active` oturum için iki seçenek var. Birincisi: `startedAt + ROUND_MS + tolerans` geçmişse oturum sunucuda `failed` yapılır. İkincisi: ikinci `/start` çağrısında oturum yakılır, hak tüketilir.
  - Hub sorgusu `status in ['completed','failed']` olmalı.

### 2. Çıkış animasyonundaki hedef tıklanabilir, çift dokunuş çift puan veriyor: **DOĞRULANDI (önem orta/düşük)**

- `components/customer/games/combo-tap-game.tsx:198-233`: `AnimatePresence` çıkan `Motion.button`'ı son render'daki props'larla, yani aynı `onClick={() => tap(t)}` ile DOM'da tutuyor. Kurulu `framer-motion@11.18.2` kaynağında çıkış sırasında `pointer-events` kapatan bir mekanizma yok. Tek `pointerEvents` ataması `projection/node/create-projection-node.mjs:1258-1352` içinde ve yalnızca layout projeksiyonu için.
- `tap` fonksiyonu (`:126-129`) yalnızca `runningRef` değerine bakıyor. İkinci çağrıda `setTargets(filter)` etkisiz kalıyor, ama `comboRef` ve `scoreRef` artışı (`:141-147`) yeniden çalışıyor. Altın hedefe ikinci dokunuş +5 daha veriyor.
- **Gerçekçi pencere:** Çıkış yayı (stiffness 320, damping 16, ζ≈0,45) ölçeği yaklaşık 0,13 saniyede 1'den 0'a indiriyor ve hit alanı hızla küçülüyor. Çok hızlı bir çift dokunuş ya da iki parmakla dokunuş ~100 ms içinde ikinci puanı alabilir. TTL'i dolup sönmekte olan yıldız da aynı kısa pencerede puan veriyor.
- Etki gerçek ama sınırlı. Sunucu skoru zaten doğrulamadığı için (madde 4) bu, güvenlik açığından çok bir oyun adaleti ve his sorunu. Cihazda doğrulanmadı.
- **Öneri:**
  - Hedef başına bir "tüketildi" kümesi tutulsun (`consumedRef: Set<number>`) ve `tap` fonksiyonunun başında kontrol edilsin.
  - Exit hedefine `pointerEvents: 'none'` eklensin.

### 3. Turnuvada eşitlik sırası belirsiz, ödül 3'ten fazla kişiye gidebilir: **BELİRSİZ**

- **Doğrulanan kısım:** `app/api/customer/tournament/route.ts:29-35` sıralamayı yalnızca `_max.starsCollected desc` ile yapıyor, ikincil anahtar yok. Combo-tap skoru 30'da kırpılıyor (`complete/route.ts:61`, `lib/minigame-config.ts:206`) ve oyun 30'da otomatik bitiyor (`combo-tap-game.tsx:160`). Bu yüzden 30'da eşitlik çok olası ve 500/300/150 ödüllerinin kime gideceği keyfi. Bu bir adalet hatası.
- **Doğrulanamayan kısım:** "GET ve POST farklı sıra üretir, 3'ten fazla kişi talep eder" iddiası.
  - Kapanmış haftanın verisi statik. Aynı plan altında Postgres'in sıralaması pratikte genelde tekrarlanabilir. Plan değişirse ya da paralel aggregate devreye girerse sıra değişebilir, ama bu garanti değil ve gözlenmedi.
  - Unique anahtar gerçekten kullanıcı başına (`(userId, gameType, weekKey)`, `prisma/schema.prisma:1088`), sıra başına değil. Sıra bir şekilde kayarsa 4. bir kişi de ödül talep edebilir.
  - Eşitlikten daha somut ama nadir bir yol var: ilk 3'ten biri hesabını silerse oturumları da silinir (`MiniGameSession onDelete: Cascade`, `schema.prisma:504`) ve 4. sıradaki kişi 3. sıraya çıkar.
- **Öneri:**
  - Sıralama deterministik olsun: skor DESC, sonra ilk ulaşma `completedAt` ASC, sonra `userId`.
  - Hafta kapanınca sonuç bir cron ile `TournamentResult` tablosuna dondurulsun ve claim oradan yapılsın.
  - `@@unique([gameType, weekKey, rank])` ile sıra başına tek ödül DB seviyesinde garanti edilsin.

### 4. Skor ve `won` istemciden alınıyor, script ile ödül ve turnuva zirvesi alınabiliyor: **DOĞRULANDI**

- `complete/route.ts:15-22` `score`, `won` ve `durationSec` değerlerini istemciden alıyor. Tek savunmalar şunlar: `maxScore` kırpması (`:61`) ve sunucu `startedAt` değerine göre `minDurationSec=8` kontrolü (`:81-83`).
- Puan kredisinde günlük ya da toplam tavan yok (`lib/points-wallet.ts:27-43`). `lib/points-caps.ts` yalnızca geri bildirim puanını sınırlıyor (`capFeedbackPoints`, `:57`). `points_credited` olayı (`complete/route.ts:162-171`) yalnızca sonradan tespit için kullanılıyor.
- **Senaryo:** Oturum çerezi olan kullanıcı `POST /api/customer/games/combo-tap/start` çağırır ve 8 saniye bekler. Ardından `POST .../complete {sessionId, score:30, won:true, durationSec:30}` gönderir. Sonuç olarak:
  - 150 puan ve 75 XP alır.
  - Seri XP'si alır.
  - Haftalık turnuvada 30 ile tepe skora çıkar ve madde 3'teki eşitlik havuzuna girer.
- Generic uçtan geçen tüm registry oyunlarında aynı yol çalışıyor. İddiadaki ~2.850 puan/gün rakamı, 19 oyunun hepsinin 150 puan verdiği varsayımına dayanıyor. Her oyunun puanı tek tek kontrol edilmedi.
- **Öneri:**
  - `/start` bir tohum (seed) üretsin ve hedef dizisi bu tohumdan deterministik türetilsin.
  - İstemci her dokunuşu (zaman damgası ve hedef id) kaydetsin. `/complete` bu günlüğü yeniden oynatarak skoru ve `won` değerini kendisi hesaplasın.
  - Oyun kaynaklı günlük puan tavanı eklensin (`points-caps` içinde `capGamePoints`).
  - Velocity dedektörü eşik aşımında ödülü bekletsin, böylece önleyici bir kontrol olsun.

### 5. İstemci statik eşikle `won` hesaplıyor, admin override'ında ödül haksızca reddediliyor: **DOĞRULANDI**

- `combo-tap-game.tsx:13,114`: `won = scoreRef.current >= DEF.rewardThreshold` ve `DEF` statik registry değeri (16).
- `useMiniGame` `/start` yanıtındaki `config` değerini saklıyor (`lib/use-mini-game.ts:70`), ama combo-tap bunu hiç okumuyor.
- `GameShell`'e de `DEF.rewardThreshold` geçiliyor (`:174`). Bu yüzden "Ödül için X skor gerekiyordu" metni de eski değeri gösteriyor (`game-shell.tsx:292`).
- Admin eşiği gerçekten değiştirebiliyor: `app/admin/games/page.tsx:287`, `app/api/admin/games/route.ts:144,182-195`. Değişiklik `getEffectiveMiniGame` üzerinden sunucuya yansıyor (`lib/minigame-config-effective.ts:49,112`).
- **Senaryo A, eşik 10'a düşürülür:** Oyuncu 12 yapar. İstemci `won=false` gönderir. Sunucuda `eligible = won && !tooFast` (`complete/route.ts:86`) false olur, oturum `failed` yapılır (`:101`) ve ödül verilmez. Eşiği geçen oyuncu haksız yere kaybeder.
- **Senaryo B, eşik 20'ye yükseltilir:** Oyuncu 18 yapar. İstemci `won=true` gönderir, sunucu ödülü 0 hesaplar. Ekranda aynı anda "Kazandın" başlığı ve "Kazandın ama ödül eşiğini geçemedin" toast'ı görünür (`use-mini-game.ts:114-116`). Alttaki not hâlâ 16 diyor.
- **Öneri:**
  - `won` sunucuda effective eşikten hesaplansın. İstemcinin gönderdiği `won` yalnızca bilgi amaçlı kalsın.
  - Ara çözüm olarak oyun bileşeni `game.config?.rewardThreshold ?? DEF.rewardThreshold` ve effective `maxScore` değerini kullansın, `GameShell`'e de effective değer geçilsin.
  - Bu desen oyun bazında değil, 19 oyunun ortak katmanında düzeltilmeli.
