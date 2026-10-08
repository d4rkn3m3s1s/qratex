# /customer/games/lucky-wheel

**Amaç:** Müşterinin günde bir kez 8 hakla bir çark çevirip (yeşil +3, sarı +1, kırmızı 0) 45 saniye içinde 12 puana ulaşırsa 150 puan + 75 XP kazandığı mini oyun. Oyun Merkezi'ndeki 20+ oyundan biri; ortak `GameShell` + `useMiniGame` + generic `/api/customer/games/[game]/*` altyapısını kullanır.

**Genel puan: 4/10** · **Karar: BİRLEŞTİR** (dashboard'daki sunucu-otoriteli "Günlük Çark" ile tek çark deneyimine indirgenmeli; ya da gerçekten beceri gerektiren bir "doğru anda durdur" oyununa dönüştürülmeli)

> Özet: Görsel kabuk ve ortak altyapı düzgün, ama bu oyun **saf şans** olduğu hâlde sonucu **istemcide** `Math.random()` ile üretiyor ve sunucu yalnızca istemcinin bildirdiği skoru sıkıştırıyor. "Günde 1 hak" kuralı, sayfayı yenileyerek kaybı silmeye izin veriyor; kaybedilen oturumlar ise sınırsız tekrar oynanabiliyor ama sonunda 409 hatası veriyor. Oyunun metinleri olmayan bir beceri mekaniği vaat ediyor. Aynı ürün içinde zaten admin tarafından yönetilen, sunucuda ağırlıklı seçim yapan ayrı bir "Günlük Çark" var.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Oynanış çalışıyor ama günlük hak kuralı delik, kayıp oturumu tekrar oynanıp 409'a düşüyor, admin override'ı (eşik/başlık) sayfaya yansımıyor. |
| UX | 4/10 | Metin olmayan bir "durdurma" becerisi vaat ediyor, süre 8 çevirmeye zar zor yetiyor, "bugün oynadın" bilgisi ancak butona basınca geliyor, sonuç ekranında sonraki adım yok. |
| Görsel | 5/10 | Neon kabuk tutarlı ama çark düz 2D canvas (DPR yok → retina'da bulanık), çivi/tik sesi/yavaşlama gerilimi yok; açık temada turnuva listesi siyah üstüne siyah. |
| Mimari | 3/10 | Şans oyununda istemci-otoriteli sonuç, statik `DEF` ile sunucu effective config'i arasında kayma, 22 neredeyse aynı `page.tsx`, ayrı bir çark motoru ile kopya kavram. |
| Performans | 6/10 | Hafif bundle; ancak rAF döngüsü dönmezken de her karede `shadowBlur`'lu yeniden çizim yapıyor ve fizik kare-hızına bağlı. |
| Erişilebilirlik + mobil | 4/10 | Canvas'ın metin alternatifi yok, sonuçlar `aria-live` değil, OS "azaltılmış hareket" tercihi canvas/konfetide yok sayılıyor, iOS'ta titreşim yok, mobilde sayfa başlığı (`h1`) gizli. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı yetki kontrolü (CUSTOMER değilse `/auth/signin`) | ÇALIŞIYOR | `app/customer/games/lucky-wheel/page.tsx:10-13` | Rol eşleşmezse bayi/admin de signin'e atılıyor; kendi paneline yönlendirme yok (küçük). |
| 2 | Sayfa `metadata.title` | KISMİ | `page.tsx:7` + `app/customer/layout.tsx:18-21` | Şablon `%s \| Müşteri alanı` olduğundan başlık "Şans Çarkı \| QRateX \| Müşteri alanı" olur; marka iki kez. |
| 3 | Sayfa başlığı + açıklama (`DashboardPageHeading`) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Yalnız `sm:` ve üstünde görünür (`hidden sm:flex`) → mobilde `h1` yok. Başlık/emoji/açıklama hemen altında `GameShell` tarafından tekrar ediliyor. |
| 4 | Neon kabuk (ızgara, köşe aksanları, glow) | ÇALIŞIYOR | `components/customer/games/game-shell.tsx:97-129` | Tüm oyunlarla tutarlı. |
| 5 | Başlangıç ekranı: zıplayan emoji, başlık, açıklama | KISMİ | `game-shell.tsx:165-184`, `lucky-wheel-game.tsx:196-199` | Statik `DEF` kullanılıyor; admin'in başlık/açıklama/emoji/renk override'ı bu sayfaya yansımıyor (hub'da yansıyor). |
| 6 | "Çarkı doğru anda durdur" beceri mekaniği | SAHTE | `lib/minigame-config.ts:244-245`, `lib/minigame-copy.ts:156`, `lucky-wheel-game.tsx:76-81` | Durdurma eylemi yok; hız `Math.random()` ile atanıyor ve sürtünmeyle kendiliğinden duruyor. Üç farklı metin (sayfa açıklaması, config açıklaması, startHint) olmayan bir beceriyi vaat ediyor. |
| 7 | Başlat CTA ("🎰 Çarkı Çevir") → `POST /start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79` | |
| 8 | "Bugün oynadın" bilgisinin önceden gösterilmesi | KISMİ | `use-mini-game.ts:64-68` | Durum yalnızca butona basıp start çağrılınca öğreniliyor; kullanıcı önce tam bir "Oyna" ekranı görüyor. |
| 9 | Kilitli ekran ("Bugünün oyununu oynadın" + sıfırlanma saati) | KISMİ | `game-shell.tsx:308-331` | "00:00 (UTC)" Türk kullanıcı için 03:00 demek; yerel saat gösterilmiyor. Kayıp (`failed`) oturumlarda hiç görünmüyor (bkz. #36). |
| 10 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | |
| 11 | Haftalık turnuva kartı (geri sayım, 1-2-3 ödülleri, ilk 10, kendi sıram) | KISMİ | `components/customer/games/game-tournament.tsx:108-180`, `app/api/customer/tournament/route.ts:47-120` | Açık temada satır metinleri renk sınıfı olmadan `text-foreground` (koyu) miras alıyor → koyu kabuk üzerinde okunmaz (`game-tournament.tsx:134,164,166`). Beraberlik kırıcı yok. |
| 12 | Geçen haftanın turnuva ödülünü talep etme | KISMİ | `game-tournament.tsx:84-97`, `tournament/route.ts:128-193` | Atomik tek-claim doğru; ama beraberlikte sıra deterministik değil (bkz. Bulgu 6). Toast `@/lib/admin-toast` ile "Basarili:" önekli. |
| 13 | Tüm zamanlar liderlik tablosu | KISMİ | `components/customer/games/game-leaderboard.tsx:24-112`, `app/api/customer/games/[game]/leaderboard/route.ts:46-80` | Hata olursa "Henüz skor yok" gösteriyor (hata yutuluyor, `:40`). `image` alanı çekiliyor ama kullanılmıyor. 0-20 aralığında çok sayıda beraberlik. |
| 14 | HUD: kalan hak | ÇALIŞIYOR | `lucky-wheel-game.tsx:210` | |
| 15 | HUD: skor | ÇALIŞIYOR | `lucky-wheel-game.tsx:211` | Yalnızca ikon + sayı; ekran okuyucu için etiket yok. |
| 16 | HUD: 45 sn geri sayım | KISMİ | `lucky-wheel-game.tsx:22,181-183` | 60 fps'te bir çevirme ≈4,9-5,4 sn → 8 çevirme ≈40-43 sn; tepki süresiyle 45 sn'ye sığmıyor. Süre dolarsa dönmekte olan çevirmenin sonucu atılıyor. |
| 17 | Canvas çark çizimi | KISMİ | `lucky-wheel-game.tsx:143-179`, `:216` | `devicePixelRatio` ölçeklemesi yok → retina'da bulanık. Dönmüyorken de her karede `shadowBlur`'lu tam çizim. |
| 18 | Dönüş fiziği (başlangıç hızı + sürtünme) | KISMİ | `lucky-wheel-game.tsx:79,108-111` | Kare başına sabit adım (`*0.985`) → kare hızına bağlı: 120 Hz'de 2× hızlı, iOS Düşük Güç (30 fps) modunda 2× yavaş. |
| 19 | İbre altındaki dilimin çözümü | ÇALIŞIYOR | `lucky-wheel-game.tsx:70-74` | Açı normalizasyonu doğru. |
| 20 | "Çevir!" butonu | KISMİ | `lucky-wheel-game.tsx:218-225` | Dönüş sırasında devre dışı/“Dönüyor…” durumu yok; yalnızca `spin()` içindeki guard sessizce yok sayıyor. |
| 21 | Son sonuç metni ("+3 puan!", "Boş — tekrar dene!") | ÇALIŞIYOR | `lucky-wheel-game.tsx:120,133,217` | `aria-live` yok. |
| 22 | Lejant (🟢 +3 · 🟡 +1 · 🔴 boş, eşik) | ÇALIŞIYOR | `lucky-wheel-game.tsx:226` | Eşik statik `DEF.rewardThreshold`; 10px metin, `text-white/40` → düşük kontrast. Olasılık bilgisi yok. |
| 23 | Ses efektleri (Web Audio) | ÇALIŞIYOR | `lucky-wheel-game.tsx:80,123,129,134`, `lib/game-sounds.ts:10-31` | Ayrı bir sessize alma düğmesi yok; ses yalnızca "animasyonları azalt" tercihiyle susuyor. Son çevirme yeşilse `sfxFanfare` + `sfxWin` üst üste çalıyor. |
| 24 | Dokunsal geri bildirim (titreşim) | KISMİ | `lib/game-sounds.ts:158-165` | `navigator.vibrate` iOS Safari'de yok → iPhone kullanıcılarında hiç çalışmaz. |
| 25 | +3'te konfeti | ÇALIŞIYOR | `lucky-wheel-game.tsx:122-127` | OS `prefers-reduced-motion` tercihi yok sayılıyor (yalnız uygulama içi sınıf). |
| 26 | 20 puana ulaşınca erken bitiş | ÇALIŞIYOR | `lucky-wheel-game.tsx:137` | |
| 27 | Oyun sonu kazanma hesabı (`won = score >= threshold`) | KISMİ | `lucky-wheel-game.tsx:138,182` | Statik eşik kullanılıyor; sunucu effective (admin override'lı) eşik kullanıyor → tutarsızlık (Bulgu 4). |
| 28 | `POST /complete` ödül hesaplama | KISMİ | `app/api/customer/games/[game]/complete/route.ts:59-87` | Skor istemciden; sunucu yalnız cap (20) ve minimum süre (8 sn) kontrol ediyor. Şans oyunu için sonuç sunucuda üretilebilirken istemciye güveniliyor (Bulgu 1). |
| 29 | Ödül toast'ı | ÇALIŞIYOR | `use-mini-game.ts:112-116` | "Kazandın ama eşiği geçemedin" dalı bu oyunda (won = eşik) normalde ulaşılamaz ölü kod; yalnız config kaymasında tetiklenir. |
| 30 | Seri (streak) bonus XP toast'ı | ÇALIŞIYOR | `use-mini-game.ts:118-121`, `complete/route.ts:117-149` | Atomik `GameStreakClaim` ile çift bonus engelli. |
| 31 | Yeni başarım toast'ı + bildirim | ÇALIŞIYOR | `complete/route.ts:89-94,196-215` | `computeAchievementStats` iki kez (öncesi/sonrası) kullanıcının tüm oturumlarını okuyor. |
| 32 | Ödül bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194` | Transaction dışında; başarısız olursa ödül verilmiş ama 500 dönebilir. |
| 33 | Sonuç ekranı (kupa/kurukafa, varyant başlık, skor, ödül/eşik notu) | ÇALIŞIYOR | `game-shell.tsx:222-305` | |
| 34 | Ödülde konfeti kutlaması | ÇALIŞIYOR | `game-shell.tsx:87-94` | |
| 35 | Sonuç ekranında sonraki adım (başka oyun, ödül mağazası, paylaş) | EKSİK | `game-shell.tsx:295-303` | Yalnız "yarın gel" metni + liderlik; çıkış/öneri CTA'sı yok. |
| 36 | "Günde 1 hak" kuralının uygulanması | BOZUK | `start/route.ts:56-73`, `complete/route.ts:97-108` | (a) Aktif oturum yenilemeyle aynen geri dönüyor → kaybeden kullanıcı sayfayı yenileyip yeniden çevirir; (b) `failed` oturum "yarım kalan" sayılıp tekrar oynatılıyor, sonunda 409. |
| 37 | Admin "pasif" oyun kontrolü sayfa seviyesinde | EKSİK | `page.tsx:9-23`, `start/route.ts:34-39` | Hub gizliyor, ama doğrudan URL tam sayfayı açıyor; ancak butona basınca hata toast'ı. |
| 38 | Admin override'ın (başlık/eşik/maxScore) oyun içinde kullanılması | BOZUK | `lucky-wheel-game.tsx:16,137-138,196-205`; `use-mini-game.ts:70` | Sunucunun döndürdüğü `config` hook'ta saklanıyor ama bileşen hiç okumuyor. |
| 39 | Oran şeffaflığı (olasılık, beklenen değer) | EKSİK | `lucky-wheel-game.tsx:25-34,226` | Ödüle dönüşen bir şans mekaniğinde oranlar yazılmalı. |
| 40 | Ses aç/kapa kontrolü | EKSİK | `lucky-wheel-game.tsx` (yok) | |
| 41 | Azaltılmış hareket modunda çark animasyonu | EKSİK | `lucky-wheel-game.tsx:106-186` | Tercih açıkken de 5 sn'lik hızlı dönüş oynuyor; kısa/anlık sonuç alternatifi yok. |
| 42 | Canvas için metin alternatifi / canlı bölge | EKSİK | `lucky-wheel-game.tsx:216-217` | `role="img"`/`aria-label` ve `aria-live` yok. |
| 43 | Çivi "tık" sesi / yavaşlama gerilimi / kazanan dilim vurgusu | EKSİK | `lucky-wheel-game.tsx:106-179` | Çark türünün temel his öğeleri. |
| 44 | Çok dilli (EN) metinler | EKSİK | `page.tsx:7,18-19`, `lucky-wheel-game.tsx:120,133,210-226` | Projede `messages/en.json` var; oyun metinleri sabit Türkçe. |

---

## Bulgular

### 1. Şans oyununun sonucu istemcide üretiliyor; sunucu istemcinin skoruna güveniyor
- **Önem:** KRİTİK · **Kategori:** güvenlik / puan ekonomisi · **Efor:** M
- **Kanıt:** `components/customer/games/lucky-wheel-game.tsx:79` (`velRef.current = 0.35 + Math.random() * 0.18`), `:114-119` (skor istemcide toplanıyor), `lib/use-mini-game.ts:92-96` (`{ sessionId, score, durationSec, won }` gönderiliyor), `app/api/customer/games/[game]/complete/route.ts:61,82-87` (yalnız cap=20 ve min 8 sn kontrolü).
- **Sorun:** Oyun hiçbir beceri içermediği için "doğru" sonucu sunucu tek başına üretebilir; buna rağmen sonuç tarayıcıda belirleniyor. Oturum açmış herhangi bir müşteri `/start` çağırıp 8 sn bekledikten sonra `/complete`'e `{"score":20,"won":true,"durationSec":9}` göndererek her gün 150 puan + 75 XP + streak XP alır ve haftalık turnuvada en üst skora (20) çıkıp turnuva ödülüne aday olur. Diğer beceri oyunlarında istemci skoru kaçınılmaz bir uzlaşmadır; şans oyununda değildir. Puan ekonomisi kuralı (puan basan her yol sunucuda doğrulanmalı) bu yolda fiilen sağlanmıyor.
- **Profesyonel öneri:** Sonucu sunucu-otoriteli yap: `/start` (veya ayrı `/spin`) çağrısı, oturum için 8 dilim sonucunu sunucuda `crypto.randomInt` ile üretip `MiniGameSession`'a (ör. `outcomes Json`, `cursor Int`) yazsın. İstemci her "Çevir"de `POST /spin` ile bir sonraki sonucu alsın ve çarkı o dilimde duracak şekilde **hedefe doğru** canlandırsın (bitiş açısını hesapla, ease-out ile oraya dön). `/complete` skoru istemciden almasın; kayıtlı sonuçlardan hesaplasın. Bu, mevcut `/api/gamification/spin` (sunucuda ağırlıklı seçim + idempotency + atomik günlük sayaç, `app/api/gamification/spin/route.ts:28-80`) deseniyle birebir aynı; en temizi bu motoru yeniden kullanmak (bkz. Çakışmalar).

### 2. "Günde 1 hak" kuralı sayfa yenilemeyle aşılıyor (kaybı silip yeniden çevirme)
- **Önem:** KRİTİK · **Kategori:** iş kuralı / ekonomi · **Efor:** S-M
- **Kanıt:** `app/api/customer/games/[game]/start/route.ts:69-73` (tamamlanmamış mevcut oturum aynı `sessionId` ile `canPlay: true` dönüyor), `lucky-wheel-game.tsx:57-65` (`finish` yalnızca oyun sonunda çağrılıyor), `complete/route.ts:81-83` (`serverElapsedSec` ilk `startedAt`'ten ölçülüyor, yeniden başlatmada sıfırlanmıyor).
- **Sorun:** Kullanıcı 3-4 çevirmede kötü gittiğini görünce sayfayı yeniler, "Çarkı Çevir"e basar; sunucu aynı aktif oturumu verir, oyun sıfırdan 8 hakla başlar. Hak, ancak `/complete` gönderilince tükenir. Teknik bilgi gerektirmeyen bu yol, saf şans oyununda %22'lik kazanma oranını birkaç denemeyle ~%100'e çıkarır. Süre kontrolü de işe yaramaz, çünkü sunucu süresi ilk başlangıçtan itibaren birikiyor.
- **Profesyonel öneri:** Sunucu-otoriteli sonuçlarla (Bulgu 1) birlikte, her `/spin` çağrısı hakkı geri alınamaz şekilde tüketsin (`cursor` artışı `updateMany where cursor < 8` ile atomik). Yenileme sonrası istemci, oturumu kaldığı yerden (harcanan haklar, mevcut skor, kalan süre) sunucudan geri yüklesin. Süre sınırı korunacaksa bitiş zamanı (`expiresAt`) sunucuda tutulmalı; süre geçtiyse oturum otomatik `completed` sayılmalı.

### 3. Kaybedilen (`failed`) oturum sınırsız tekrar oynatılıyor ve her seferinde 409 ile bitiyor
- **Önem:** YÜKSEK · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `complete/route.ts:101` (`status: won ? 'completed' : 'failed'`), `start/route.ts:57` (yalnız `'completed'` engelleniyor), `:69-72` ("Yarım kalan aktif oturum" yorumu `failed`'ı da kapsıyor), `complete/route.ts:98-108,177-181` (`status: 'active'` olmayan oturum → 409 "Oyun zaten tamamlandı"), `app/api/customer/games/status/route.ts:33` (hub yalnız `completed`'ı "oynandı" sayıyor).
- **Sorun:** Bu oyunda `won` = eşik geçildi demek; yani kaybeden her kullanıcı (≈%78) `failed` durumunda kalır. Sayfaya dönünce kilit ekranı yerine "Çarkı Çevir" görür, 45 sn oynar, sonunda kırmızı "Dikkat: Oyun zaten tamamlandı" hatası alır. Eşiği geçse bile ödül alamaz, sonuç ekranı ise `won: true` ile kupa gösterip "Ödül için 12 skor gerekiyordu" yazar (`use-mini-game.ts:126-128` + `game-shell.tsx:290-293`). Hub da bu oyunu "bugün oynandı" olarak işaretlemez. Aynı kusur tüm generic oyunlarda ve Pacman'de (`app/api/customer/games/pacman/complete/route.ts:75`) var.
- **Profesyonel öneri:** `start` route'ta `existing.status !== 'active'` olan her oturumu "bugün oynandı" say (`canPlay:false`, `alreadyPlayed:true`, `lastResult` ile birlikte). `status` uç noktası ve streak hesabı için "oynandı" = `completed | failed` olacak şekilde netleştir; "kazandı" bilgisini ayrı bir alanda (`won Boolean`) tut. Kilit ekranında bugünün sonucunu (skor, kazanıldı mı) göster.

### 4. Oyun, admin override'larını yok sayıyor; istemci ile sunucu farklı eşik kullanıyor
- **Önem:** YÜKSEK · **Kategori:** veri tutarlılığı · **Efor:** S
- **Kanıt:** `lucky-wheel-game.tsx:16` (`const DEF = getMiniGame('lucky-wheel')!` — statik registry), `:137-138,182,204,226` (eşik ve maxScore `DEF`'ten), `lib/use-mini-game.ts:70` (sunucu `config`'i saklanıyor ama bileşen okumuyor), `lib/minigame-config-effective.ts:40-56` (sunucu admin override'ını uyguluyor), `app/api/admin/games/route.ts:138-144` (admin eşik/maxScore/başlık düzenleyebiliyor).
- **Sorun:** Admin eşiği 12'den 15'e çıkarırsa oyuncu 13'te "Jackpot!" görür, sunucu 0 ödül verir ve "Kazandın ama ödül eşiğini geçemedin" çıkar. Eşiği 10'a indirirse 11 yapan oyuncuya istemci `won:false` gönderir, sunucu `eligible = won && ...` olduğu için hak ettiği ödülü vermez (`complete/route.ts:86`). Başlık/açıklama/emoji/renk override'ları hub'da görünür, oyun sayfasında görünmez.
- **Profesyonel öneri:** Sayfayı server component olarak `getEffectiveMiniGame('lucky-wheel')` ile besle ve `enabled`, `title`, `accent`, `rewardThreshold`, `maxScore` değerlerini prop olarak geçir. Kısa vadede bileşen `game.config ?? DEF` kullanmalı. Asıl çözüm: `won`'u istemciden almayı bırakıp sunucuda `score >= effective.rewardThreshold` ile hesaplamak.

### 5. Fizik ve süre kare hızına bağlı; 45 sn 8 çevirmeye yetmiyor, cihaza göre adaletsiz
- **Önem:** YÜKSEK · **Kategori:** oynanış adaleti · **Efor:** S
- **Kanıt:** `lucky-wheel-game.tsx:79` (hız 0,35-0,53 rad/kare), `:109-111` (her karede `*0.985`, eşik 0,004), `:22` (`ROUND_MS = 45_000`), `:181-182` (süre dolunca dönen çevirme atılıyor).
- **Sorun:** Durma süresi ≈ ln(0,004/v)/ln(0,985) ≈ 296-323 kare. 60 fps'te 4,9-5,4 sn, yani 8 çevirme salt animasyonla 40-43 sn sürüyor; tepki süresi eklenince çoğu oyuncu 8. hakkı kullanamıyor. Hesapladığım kazanma olasılığı (≥12 puan): 8 çevirmede %22,3, 7'de %12,5, 6'da %5,4. 120 Hz ekranda çevirme 2,5 sn sürer ve 8 hak rahat kullanılır; iOS Düşük Güç modunda (rAF ≈30 fps) ~10 sn sürer, yalnız ~4 hak sığar (%0,4). Ödül olasılığı cihaza göre 50 kat değişiyor.
- **Profesyonel öneri:** Fiziği zamana bağla (`dt` ile `angle += vel*dt`, `vel *= Math.pow(0.985, dt*60)`) ya da Bulgu 1'deki hedefli animasyona geç (sabit 2,5-3 sn ease-out). Süre sınırı bu oyunda gerilim yaratmıyor, yalnızca hak kaybettiriyor; kaldır veya her çevirme için yeterli olacak şekilde hesapla. Süre sınırı kalacaksa, dönmekte olan çevirmenin sonucu sayılmalı.

### 6. Turnuva ve liderlikte beraberlik kırıcı yok; sıralama (ve ödül hakkı) deterministik değil
- **Önem:** ORTA-YÜKSEK · **Kategori:** ekonomi / veri doğruluğu · **Efor:** S
- **Kanıt:** `app/api/customer/tournament/route.ts:29-38` (`orderBy: { _max: { starsCollected: 'desc' } }`, ikincil sıralama yok), `:145-148` (POST, sırayı yeniden hesaplıyor), `[game]/leaderboard/route.ts:47-53`.
- **Sorun:** Skor 0-20 arası birkaç ayrık değerden oluştuğu için (ve kazananların hepsi ≥12 olduğundan) 3. sırada beraberlik sık görülür. Postgres eşit değerleri istediği sırada döndürebilir: GET bir kullanıcıya "Ödülü al" gösterip POST "Geçen hafta ödül kazanmadın" diyebilir. Ayrıca iki ayrı kullanıcının ayrı isteklerinde ikisi de 3. sırada görünürse ikisi de ödül alabilir (tek-claim kullanıcı+hafta başına, sıra başına değil). Doğrulanmadı: üretimde gerçekten gerçekleşti mi bilinmiyor; kod yolu buna açık.
- **Profesyonel öneri:** Beraberliği kuralla çöz: aynı skorda önce ulaşan (en erken `completedAt`) önde. Haftalık sonuçları hafta kapanınca bir cron ile `TournamentResult` tablosuna dondur ve claim'i bu dondurulmuş tabloya karşı yap (sıra başına `@@unique([gameType, weekKey, rank])`). Saf şans oyunu için turnuva ödülü vermeyi ürün olarak da yeniden düşün (bkz. Bulgu 8).

### 7. Oyun metinleri olmayan bir beceriyi vaat ediyor
- **Önem:** ORTA · **Kategori:** UX / güven · **Efor:** S
- **Kanıt:** `lib/minigame-config.ts:244-245` ("Çarkı doğru anda durdur! … riskli dilimlerden kaç"), `lib/minigame-copy.ts:156` (aynı ifade), `app/customer/games/lucky-wheel/page.tsx:19` ("yeşil dilimleri yakala! Riskli kırmızılardan kaç"), `lucky-wheel-game.tsx:76-81` (durdurma eylemi yok).
- **Sorun:** Kullanıcıya kontrol edebileceği bir şey vaat edilip sonuç rastgele bırakılıyor. Bu, "yeniden denersem başarırım" hissini kandırmacaya dönüştürüyor ve güveni zedeliyor. Üç yerde üç farklı açıklama var.
- **Profesyonel öneri:** Ya metni dürüst yap ("Şansını dene: 8 çevirme, 12 puana ulaş"), ya da mekaniği metne uydur. Gerçek beceri için: çark sabit hızda döner, kullanıcı "Durdur"a basar, kısa ve deterministik bir fren mesafesiyle durur. Yeşil dilimler dar, kırmızılar geniş olur ve zorluk her çevirmede artar. Bu durumda istemci skoru yine güvenilmez olur; girdi zaman damgaları sunucuda yeniden oynatılarak doğrulanmalı. Metinler tek kaynaktan (`minigame-copy`) gelmeli; sayfa başlığındaki tekrar kaldırılmalı.

### 8. Ödüle dönüşen saf şans mekaniği: oran şeffaflığı ve hukuki çerçeve
- **Önem:** ORTA · **Kategori:** ürün / uyum · **Efor:** M
- **Kanıt:** `lucky-wheel-game.tsx:25-34` (sabit ağırlıklar), `lib/minigame-config.ts:248-251` (150 puan + 75 XP), turnuva puan ödülü (`tournament/route.ts:156-171`).
- **Sorun:** Kullanıcı ödül mağazasında harcanabilen puanı saf şansla kazanıyor ve oranlar hiçbir yerde yazmıyor. Türkiye'de ödüllü şans/çekiliş mekanikleri için izin rejimi olabilir. Hukuki değerlendirme yapılmadı (**doğrulanmadı**), ancak oranları açıklamak sektörde standart bir uygulama.
- **Profesyonel öneri:** "Oranlar" bilgi kartı ekle (dilim olasılıkları, kazanma ihtimali ≈%22). Şans bileşenini katılım ödülüyle dengele (her çevirmeye küçük XP, kaybedene "teselli" XP'si). Hukuk/uyum ekibine "puan → ödül" zincirinin şans oyunu kapsamına girip girmediğini sor. Turnuvayı şans oyunundan kaldır.

### 9. Açık temada turnuva listesi okunmuyor; müşteri arayüzünde admin toast önekleri
- **Önem:** ORTA · **Kategori:** görsel / dil · **Efor:** S
- **Kanıt:** `game-tournament.tsx:134,164,166,177` (renk sınıfı yok → `body`'nin `text-foreground`'u miras alınıyor, `app/globals.css:98`, açık tema `--foreground: 240 10% 10%` `:13`), `game-shell.tsx:101-102` (kabuk her temada koyu), `game-tournament.tsx:118,143,151` (`text-muted-foreground` = açık temada %45 gri, koyu zeminde düşük kontrast), `game-tournament.tsx:6` (`toast` → `lib/admin-toast.ts:12-20`, "Basarili: " / "Dikkat: " önekleri, Türkçe karakter yok).
- **Sorun:** Açık temadaki müşteri, koyu kabuğun içinde turnuva satırlarındaki isimleri ve skorları neredeyse göremez (kod okumasıyla doğrulandı, ekran görüntüsüyle doğrulanmadı). Turnuva ödülü alırken "Basarili: 🏆 1. oldun" gibi yönetim paneline özgü ve ş/ı'sız bir metin görür.
- **Profesyonel öneri:** `GameTournament`'ı `GameLeaderboard` gibi kabuğun koyu paletine bağla (açık `text-white/…` tonları) ya da kabuğa `dark` kapsamı ver (`className="dark"` + tokenlar) ki iç bileşenler koyu tokenları alsın. Müşteri bileşenlerinde `sonner`'ı doğrudan kullan veya öneksiz bir `customer-toast` yardımcısı yaz.

### 10. Erişilebilirlik: canvas'ın alternatifi yok, sonuçlar duyurulmuyor, OS hareket tercihi yok sayılıyor
- **Önem:** ORTA · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `lucky-wheel-game.tsx:216` (canvas'ta `role`/`aria-label` yok), `:217` (`lastWin` için `aria-live` yok), `:210-212` (HUD etiketsiz), `:12-14` ve `lib/game-sounds.ts:10-13` (yalnız uygulama içi `reduce-animations` sınıfı; `prefers-reduced-motion` kontrol edilmiyor, oysa framer tarafı `MotionConfig reducedMotion="user"` ile OS'a uyuyor, `components/providers.tsx:232`), `:226` (10px, `text-white/40`).
- **Sorun:** Ekran okuyucu kullanıcısı çevirmenin sonucunu ve skoru öğrenemez. OS'ta "hareketi azalt" açık olan kullanıcı yine 5 sn hızlı dönüş ve konfeti görür. Lejant WCAG AA kontrastını karşılamıyor.
- **Profesyonel öneri:** Sonuç satırına `role="status" aria-live="polite"` ekle ("Yeşil, +3 puan. Toplam 9, 5 hak kaldı"). Canvas'a `role="img"` ve güncel durumu anlatan `aria-label` ver. `reducedMotion()` yardımcısını `matchMedia('(prefers-reduced-motion: reduce)')` ile birleştirip ortak bir `lib/motion-prefs.ts`'e taşı; azaltılmış modda dönüşü 300 ms'lik bir geçişe indir ve konfetiyi kapat. Lejantı ≥12px ve ≥4.5:1 kontrasta çıkar.

### 11. Çevir butonu dönüş sırasında aktif görünüyor; sonuçta sonraki adım yok
- **Önem:** DÜŞÜK-ORTA · **Kategori:** UX · **Efor:** S
- **Kanıt:** `lucky-wheel-game.tsx:218-221` (`disabled={spinsLeft <= 0}` yalnızca), `:77` (sessiz guard), `game-shell.tsx:295-303`.
- **Sorun:** Kullanıcı dönüş sırasında butona tekrar tekrar basar ve hiçbir tepki almaz. Oyun bitince yalnız "yarın gel" yazısı kalır; Oyun Merkezi'ne, başka bir oyuna ya da puanı harcayabileceği ödül mağazasına yönlendirme yok.
- **Profesyonel öneri:** `spinning` state'ini UI'a yansıt (buton "Dönüyor…" + `aria-busy`). Sonuç ekranına "Sıradaki oyun" (bugün oynanmamış bir oyun önerisi, `/api/customer/games/status`'tan), "Puanlarımı harca" ve "Oyun Merkezi" CTA'ları ekle.

### 12. Mimari tekrar: 22 neredeyse aynı `page.tsx`; sayfa durum bilgisini sunucuda hazırlamıyor
- **Önem:** DÜŞÜK · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `app/customer/games/*/page.tsx` (ör. `lucky-wheel/page.tsx` ile `app/customer/games/bot-hunter/page.tsx` aynı iskelet), `page.tsx:9-23` (yalnız oturum kontrolü), `use-mini-game.ts:64-68`.
- **Sorun:** Her yeni oyun için kopyala-yapıştır sayfa yazılıyor; `enabled`, "bugün oynandı" ve effective config sunucuda zaten bilinebilirken istemci bunu butona basınca öğreniyor. Metadata başlığı markayı iki kez içeriyor (`page.tsx:7` + `layout.tsx:20`).
- **Profesyonel öneri:** Tek bir `app/customer/games/[game]/page.tsx` yaz: `getEffectiveMiniGame` + bugünkü oturum durumunu sunucuda çek, `notFound()`/pasif ekranı göster, bileşeni bir `GAME_COMPONENTS` haritasından `next/dynamic` ile yükle. `metadata`'yı `generateMetadata` ile `title: game.title` olarak üret.

### 13. Performans: rAF döngüsü boşta da her karede glow'lu tam çizim yapıyor
- **Önem:** DÜŞÜK · **Kategori:** performans / pil · **Efor:** S
- **Kanıt:** `lucky-wheel-game.tsx:142-179` (her karede 8 dilim + `shadowBlur`), `:184` (koşulsuz rAF), `:183` (her karede `setTimeLeft`; React aynı değerde bail-out yapıyor ama çağrı yine de yapılıyor), `:216` (DPR yok).
- **Sorun:** Çark durduğu sürece (çevirmeler arası) de 45 sn boyunca 60 fps `shadowBlur` çizimi yapılıyor; düşük uçlu Android'de ısınma ve pil tüketimi demek. DPR ölçeklemesi olmadığı için retina'da bulanık.
- **Profesyonel öneri:** Çizimi yalnız `spinning` iken ya da durum değişince yap. Statik dilim katmanını bir `OffscreenCanvas`'a önceden render edip yalnızca döndür. Canvas'ı `width = SIZE*dpr` ile ölçekle, `ctx.scale(dpr, dpr)` uygula. Süre göstergesini saniyede bir `setInterval` ile güncelle.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Sunucu-otoriteli, hedefe kilitli çark animasyonu** (Starbucks/McDonald's ödül çarkları, Revolut "spin to win"): sonuç sunucudan gelir, çark o dilimde yavaşlayarak durur. Yavaşlarken her çivide "tık" sesi ve hafif titreşim, son dilim geçişinde gerilim (kısa "neredeyse" kayması) vardır.
2. **Oran şeffaflığı ve kurallar kartı:** dilim olasılıkları, kazanma ihtimali, ödül tablosu; "Nasıl çalışır?" alt sayfası.
3. **İlerleme ve teselli mekaniği** (Duolingo): kaybeden oyuncu da küçük XP alır; "3 gün üst üste çevir → garanti +3 dilimi" gibi şansa bağlı olmayan bir garanti (pity) sayacı.
4. **Bugünün durumu + geri sayım kilit ekranı:** sayfaya girer girmez "Bugün çevirdin: 13 puan, 150 puan kazandın · Yeni hak 02:14:33 sonra (yerel saat)".
5. **Sonuç sonrası akış:** "Sıradaki oyun", "Puanlarımı harca" (ödül mağazası), paylaşılabilir sonuç kartı (Spotify Wrapped tarzı küçük kart).
6. **Kontroller:** ses aç/kapa, azaltılmış hareket modunda anlık sonuç, iOS'ta titreşim yerine görsel "pulse" geri bildirimi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Günün çarkı" ürün genelinde **tek** bir ritüel olmalı. Kullanıcı gün içinde bir kez açar, 3 saniyelik tatmin edici bir dönüş izler, sonucu hemen cüzdanına düşmüş görür ve bir sonraki eyleme (ödül mağazası, başka oyun, geri bildirim) yönlendirilir. Becerinin olmadığı yerde beceri vaat edilmez; bunun yerine oranlar dürüst, katılım ödüllendirilir.

**Yerleşim (mobil öncelikli):**
- Üst: kompakt durum şeridi (bugünkü hak, seri 🔥, cüzdan bakiyesi). Sayfa başlığı ve kabuk başlığı tek bir başlıkta birleşir.
- Orta: tam genişlik çark (max 360px, DPR'li). İbre üstte, merkezde marka logosu (emoji yerine).
- Alt: tek birincil buton ("Çevir" → dönüşte "Dönüyor…" ve devre dışı). Altında "Oranlar" bağlantısı (bottom sheet).
- Sonuç: çark durunca kazanan dilim parlar, alttan sonuç kartı (bottom sheet) açılır: "+25 puan · cüzdanına eklendi" ile birlikte "Ödül mağazası" ve "Sıradaki oyun" CTA'ları.
- Kilitli durum: çark gri ve donuk; üstünde bugünkü sonuç ve yerel saatte bir sonraki hak için geri sayım.
- Turnuva/liderlik: şans oyunundan kaldırılır (veya ayrı bir sekmede yalnızca "seri" sıralaması gösterilir).

**Motion / 3D (ölçülü):**
- Dönüş: zamana bağlı, hedef açıya `cubic-bezier(0.12, 0.8, 0.18, 1)` ile 2,8-3,2 sn. Son 0,5 sn'de çivi tıkları sıklaşır (`sfxClick` + 8 ms titreşim).
- Kazanma: kazanan dilim 1,05 ölçek + glow nabzı (framer `m.div` overlay), büyük ödülde tek konfeti patlaması. Kabuktaki sonsuz döngüler (zıplayan emoji, dönen konik halka) sonuç anında tek seferliğe indirilir.
- 3D gereksiz; çark 2D canvas/SVG'de kalmalı. Projedeki three.js "sürpriz kutusu" bu ekranda kullanılmamalı, aksi hâlde maliyet artar ve odak dağılır.
- Azaltılmış hareket: dönüş yok, 300 ms'lik bir fade ile sonuç dilimi vurgulanır; konfeti ve ses kapalı.

**Veri / API değişiklikleri:**
- Tercihen **mevcut `/api/gamification/spin` motorunu yeniden kullan** (sunucu ağırlıklı seçim `pickSpinPrize`, idempotency, `DailySpin` atomik sayacı, admin "Günlük Çark Kuralları" `app/admin/points-matrix/page.tsx:793-967`). `GET` cevabı ödül listesini ve `canSpin`'i, `POST` cevabı `prizeIndex`'i döndürüyor; istemci yalnızca o dilime animasyon yapar.
- Eğer çok-çevirmeli (8 hak, eşik) format korunacaksa: `MiniGameSession`'a `outcomes Json`, `cursor Int`, `won Boolean`, `expiresAt DateTime` eklenir. `POST /api/customer/games/lucky-wheel/spin` her çağrıda bir hak tüketir (atomik), `/complete` skoru kayıtlı sonuçlardan hesaplar. `start`, `active` dışındaki her oturumu "bugün oynandı" sayar.
- Sayfa server component olur: `getEffectiveMiniGame` + bugünkü oturum + cüzdan bakiyesi tek seferde hazırlanıp prop olarak geçirilir.
- Turnuva için beraberlik kuralı (`completedAt` asc) ve hafta sonu dondurulmuş sonuç tablosu.

---

## Çakışmalar / birleştirme önerisi

- **Müşteri dashboard'undaki "Günlük Çark" (`components/gamification/spin-wheel.tsx`, `components/customer/dashboard/customer-dashboard.tsx:59,172,797`, `app/api/gamification/spin/route.ts`) ile doğrudan çakışma.** İkisi de "günde bir çark çevir, puan kazan" vaat ediyor. Biri sunucu-otoriteli, admin'den yönetiliyor (`points-matrix`), ekonomi simülatöründe hesaba katılıyor (`app/admin/economy-sim/page.tsx:79-130`). Diğeri (bu sayfa) istemci-otoriteli, ayrı ödül tablosuyla çalışıyor ve simülatörde görünmüyor. Kullanıcı açısından "iki ayrı günlük çark" kafa karıştırıcı; ekonomi açısından da günlük puan basma yollarını gereksiz yere ikiye katlıyor.
  - **Öneri:** Tek bir çark. `/customer/games/lucky-wheel`, Günlük Çark'ın tam sayfa, zenginleştirilmiş evi olsun (aynı API, aynı admin kuralları); dashboard'daki kart buraya bağlanan kompakt bir giriş noktası olarak kalsın. Oyun Merkezi'nde "Şans Çarkı" kartı da bu tek deneyime gitsin. Alternatif: bu sayfa gerçek bir beceri oyununa ("Doğru Anda Durdur") dönüştürülüp adı değiştirilsin ve çark görseli Günlük Çark'a bırakılsın.
- **`/customer/games` (Oyun Merkezi):** Hub "bugün oynandı" bilgisini doğru gösteremiyor (`failed` sayılmıyor). Birleştirmeden bağımsız olarak `status` uç noktası düzeltilmeli.
- **`/customer/leaderboard`:** Oyun içi "tüm zamanlar" listesi ile genel liderlik sayfası arasında kavramsal tekrar var. Şans oyunu için oyun içi liderlik kaldırılabilir.
- **Mimari:** 22 ayrı `app/customer/games/<oyun>/page.tsx`, tek bir dinamik `[game]` route'unda birleştirilmeli.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme. Okunan dosyalar: `app/customer/games/lucky-wheel/page.tsx`, `components/customer/games/lucky-wheel-game.tsx`, `components/customer/games/game-shell.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `app/api/customer/games/[game]/start/route.ts`, `app/api/customer/games/[game]/complete/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `app/api/admin/games/route.ts`. Her iddiayı çürütmeye çalıştım; dördü de ayakta kaldı.

### 1. İstemci-otoriteli şans sonucu: sahte skorla günlük 150 puan ve turnuva zirvesi — **DOĞRULANDI**
- Dönüş hızı istemcide `Math.random()` ile üretiliyor (`lucky-wheel-game.tsx:79`), dilim ve skor istemcide hesaplanıyor (`:114-119`). `useMiniGame.finish` `score` ve `won` değerlerini doğrudan gövdeye koyuyor (`lib/use-mini-game.ts:95`).
- Sunucu yalnızca şunları yapıyor: skoru `maxScore`'a sıkıştırmak (`complete/route.ts:61`; lucky-wheel için 20, `lib/minigame-config.ts:248`), `minDurationSec` = 8 sn kontrolü (`complete/route.ts:81-83`) ve `eligible = won && !tooFast` (`:86`). Skoru üreten bir sunucu kaydı yok.
- Turnuva sırası `status: 'completed'` oturumların `_max.starsCollected` değerinden hesaplanıyor (`tournament/route.ts:29-38`). Sahte `{won:true, score:20}` gönderimi `completed` + `starsCollected: 20` yazıyor (`complete/route.ts:101-102`).
- Çürütme denemesi: ödül yollarında bir günlük üst sınır var mı? `lib/points-caps.ts` yalnızca feedback puanını sınırlıyor (`DAILY_FEEDBACK_POINTS_CAP`), oyun puanı bu sınıra girmiyor. `points_credited` olayı yalnızca görünürlük sağlıyor, engellemiyor.
- **Yeniden üretim:** Oturum açmış bir CUSTOMER `POST /api/customer/games/lucky-wheel/start` ile `sessionId` alır, 9 sn bekler, ardından `POST .../complete` ile `{sessionId, score:20, durationSec:9, won:true}` gönderir. Sonuç: 150 puan + 75 XP, günün ilk ödülüyse streak XP (`:117-149`). Haftalık turnuvada da en yüksek skor (20) yazılır. Not: Meşru oyuncu da 20'ye ulaşabildiği için bu, birinciliği garanti etmiyor; sahte gönderim beraberlik düzeyinde zirveye çıkarıyor. Beraberlik sırası tanımsız (`orderBy` yalnızca `_max.starsCollected`).
- Önem: Yüksek. Oyunun beceri bileşeni olmadığı için sonucu sunucuda belirlemek (ağırlıklı seçim, idempotent hak tüketimi) bu açığı tamamen kapatır.

### 2. Günde 1 hak, sayfa yenilemeyle aşılıyor — **DOĞRULANDI**
- `start` yalnızca `completed` oturumu engelliyor. `active` oturum varsa aynı `sessionId` ile `canPlay: true` dönüyor (`start/route.ts:56-73`).
- İstemci yeniden mount olduğunda hakları ve skoru sıfırdan kuruyor (`lucky-wheel-game.tsx:93-104`, `TOTAL_SPINS = 8`). Unmount sırasında `finish` çağrılmıyor ve `beforeunload` gönderimi yok (`:188-191`). Oturum `active` kalıyor.
- `complete` süreyi ilk `startedAt` üzerinden ölçüyor (`complete/route.ts:81`). Bu yalnızca süreyi uzatır, tekrar denemeyi engellemez.
- **Yeniden üretim:** Oyuncu 5-6 çevirmede skorun 12'ye ulaşamayacağını görür ve son çevirme bitmeden sayfayı yeniler (veya geri gidip tekrar girer). "Çarkı Çevir" yeniden çıkar, 8 yeni hak gelir. Bu döngü eşik geçilene kadar sürer, sonra `won:true` ile ödül alınır. Teknik bilgi gerekmez.
- Önem: Yüksek (günlük ekonomi sınırını fiilen kaldırıyor). Hak tüketimi sunucuda (çevirme başına atomik sayaç) yapılmalı.

### 3. `failed` oturumlar "yarım kalan" sayılıyor, tekrar oynanıyor ve sonunda 409 veriyor — **DOĞRULANDI**
- Kayıpta durum `failed` yazılıyor (`complete/route.ts:101`). `start` yalnızca `completed` durumunu "oynandı" sayıyor (`start/route.ts:57`), `failed` oturumu `canPlay: true` ile geri veriyor (`:69-72`).
- İkinci `complete` çağrısında `status === 'completed'` kontrolü `failed`'ı geçiriyor (`complete/route.ts:73`), ardından `updateMany where status:'active'` 0 satır güncelliyor (`:98-108`), sonuç olarak 409 "Oyun zaten tamamlandı" dönüyor (`:177-181`).
- İstemci hata durumunda yine de `result` kuruyor; `won` istemcinin değeri olarak kalıyor (`use-mini-game.ts:126-128`). Kabuk `won` ise 🏆 ve "Jackpot!" türü kazanma başlığını gösteriyor (`game-shell.tsx:255`, `minigame-copy.ts:157`). `rewarded:false` olduğu için lucky-wheel kopyasında `rewardMissNote` tanımlı değil ve varsayılan "Ödül için 12 skor gerekiyordu" metni çıkıyor (`game-shell.tsx:290-292`). Ortaya çelişkili bir mesaj çıkıyor. Hub da yalnızca `completed`'ı sayıyor (`status/route.ts:33`), bu yüzden kart "bugün oynandı" göstermiyor.
- Çürütme denemesi: Ekonomik açık var mı? Yok. `failed` oturum ikinci kez ödül alamıyor (`updateMany` guard'ı). Sorun ekonomik değil; UX ve veri tutarlılığı sorunu. Kaybeden oyuncu her girişte 45 sn boşa oynayıp hata alıyor.
- Yaklaşık %78 kayıp oranı iddiası **doğrulanmadı** (simülasyon çalıştırılmadı). Beklenen skor/çevirme 2/8·3 + 3/8·1 = 1,125, 8 çevirmede ortalama ≈ 9 ve eşik 12. Kaybedenlerin çoğunluk olduğu niteliksel olarak tutarlı.
- Pacman tarafında da `start` yalnızca `completed`'ı engelliyor (`pacman/start/route.ts:36`); aynı kusur orada da var.
- **Yeniden üretim:** Skor < 12 ile bitir (`failed`), sayfayı yenile, "Çarkı Çevir" yeniden çıkar, oyna, sonunda "Oyun zaten tamamlandı" toast'ı ve çelişkili sonuç kartı görünür.

### 4. İstemci statik eşik, sunucu admin override'lı eşik kullanıyor — **DOĞRULANDI (admin override koşuluyla)**
- İstemci `DEF = getMiniGame('lucky-wheel')` statik registry değerini kullanıyor (`lucky-wheel-game.tsx:16`). `won` değeri `DEF.rewardThreshold` ve `DEF.maxScore` ile belirleniyor (`:137-138,182`), UI metni de bu değerleri gösteriyor (`:204,226`). `useMiniGame` sunucunun döndürdüğü `config` değerini state'e yazıyor (`use-mini-game.ts:70`) ama bileşen bunu hiç okumuyor.
- Sunucu `getEffectiveMiniGame` ile admin override'ını uyguluyor (`minigame-config-effective.ts:47-51`) ve `computeEffectiveReward` override'lı eşiği kullanıyor (`:107-116`). Admin bu alanı gerçekten düzenleyebiliyor (`app/api/admin/games/route.ts:144,182-198`).
- **Yeniden üretim (düşürme):** Admin eşiği 10 yapar. Oyuncu 11 skor yapar; istemci `11 >= 12` → `won:false` gönderir; `eligible = false` (`complete/route.ts:86`) ve ödül verilmez. **Yükseltme:** Admin eşiği 15 yapar, oyuncu 13 yapar; istemci `won:true` gönderir, "Jackpot" görünür ama sunucu 0 puan verir ve oturum `completed` yazılır. Ayrıca `maxScore` düşürülürse istemcinin `>= DEF.maxScore` erken bitişi de kayar.
- Önem: Orta-Yüksek. Varsayılan kurulumda tetiklenmiyor; admin paneli bu ayarı sunduğu anda tetikleniyor. Kalıcı çözüm: `won` kavramını istemciden kaldırıp eşik kararını tamamen sunucuya bırakmak. İstemci yalnızca `start` yanıtındaki `config`'i gösterim için kullanmalı.

**Ek gözlem (iddia dışı, doğrulanmadı):** Çark fiziği kare başına sabit adımla işliyor (`velRef *= 0.985`, `lucky-wheel-game.tsx:109-110`). Bu yüzden dönüş süresi ekran yenileme hızına bağlı: 60 Hz'de çevirme başına ≈ 5 sn, 8 çevirme 45 sn'lik `ROUND_MS` sınırına çok yaklaşıyor. Yavaş cihazlarda tur, hak bitmeden süreden dolayı kesilebilir. Cihazda ölçülmedi.
