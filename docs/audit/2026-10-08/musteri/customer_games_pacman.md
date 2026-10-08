# /customer/games/pacman

**Amaç:** Müşteriye günde 1 hakla oynanan, QRatex temalı Pacman benzeri bir arcade oyunu ("Yıldız Avı") sunmak; 5 yıldızın tamamını toplayana sunucuda doğrulanan 150 puan + 75 XP vermek. Oyun Merkezi'ndeki (`/customer/games`) 20 oyundan ilki ve tek "eski nesil" (registry dışı) oyun.

**Genel puan: 3.8 / 10** · **Karar: BİRLEŞTİR.** Oyun motorunu (canvas oynanışı) koruyup sayfayı ortak mini oyun çatısına (`useMiniGame` + `GameShell` + generic `[game]` API + `MINI_GAMES` registry) taşı. Pacman'e özel API ve yaşam döngüsü kaldırılmalı.

> Özet: Görsel olarak sistemin en "oyun gibi" sayfalarından biri. Fakat **ödül döngüsü kod okumasıyla bozuk görünüyor**. `sessionId` eski bir closure'da kaldığı için sonuç sunucuya **hiç gönderilmiyor**. Kullanıcı "Kazandın! 🎉" görüyor ama vaat edilen 150 puan + 75 XP hesabına geçmiyor. Bunun üstüne kayıp anında oyun döngüsü durmuyor, oyunun hızı ekranın tazeleme hızına bağlı ve ödül uç noktası başka oyunun oturumunu kabul ediyor. Canlı veritabanına dokunulmadığı için bu bulgu üretim verisiyle **doğrulanmadı**; yalnızca kod okumasıyla kesinleştirildi (aşağıda adım adım).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | **2/10** | Oynanış çalışıyor ama asıl değer önerisi (ödül) istemcide bozuk: `complete` çağrısı stale closure yüzünden hiç yapılmıyor, kayıp anında döngü durmuyor. |
| UX | **4/10** | "Bugün oynadın mı" bilgisi ancak "Oyna"ya basınca öğreniliyor, sonuç ekranında sonraki adım yok, "Yenile" butonu işe yaramıyor, ödül geri bildirimi hiç gelmiyor. |
| Görsel | **6/10** | Neon labirent, dönen yıldızlar, parçacıklar ve sarsıntı iyi bir arcade hissi veriyor. Ama canvas DPR'a ölçeklenmediği için retina ekranda bulanık; diğer 19 oyunun `GameShell` çerçevesiyle de tutarsız. |
| Mimari | **3/10** | Kendi start/complete route'ları, kendi config'i ve kendi yaşam döngüsü olan çatallanmış bir yol. Seri bonusu, başarım, liderlik, admin aç-kapa, kişilik metinleri gibi sonradan eklenen hiçbir platform özelliği buraya ulaşmamış. |
| Performans | **5/10** | Her karede ~93 duvar hücresi `shadowBlur` ile iki kez path'leniyor. Kayıptan sonra rAF döngüsü sonsuza kadar sürüyor. Fizik kare başına hesaplandığı için 120 Hz ekranda oyun 2 kat hızlı. |
| Erişilebilirlik + Mobil | **3/10** | Canvas'ta ve D-pad'de ARIA yok, sonuç için `aria-live` yok, "animasyonları azalt" tercihi yalnızca sesi kısıyor (sarsıntı ve parçacıklar sürüyor). Tablette D-pad yok, mobilde sayfa başlığı gizli. |

---

## Özellik envanteri

Durum: ÇALIŞIYOR / KISMİ / BOZUK / SAHTE / EKSİK. Bileşen yolu kısaltması: `PG` = `components/customer/pacman-game.tsx`, `CR` = `app/api/customer/games/pacman/complete/route.ts`, `SR` = `app/api/customer/games/pacman/start/route.ts`.

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa yetki kontrolü (CUSTOMER rolü) | KISMİ | `app/customer/games/pacman/page.tsx:10-13`; `proxy.ts:52-73` | Asıl koruma proxy'de. Sayfadaki `redirect('/auth/signin')` **var olmayan bir route'a** gidiyor (giriş sayfası `/auth/login`, bkz. `lib/auth.ts:65`, `app/(auth)/auth/login`). Proxy'yi atlayan bir durumda 404'e düşer. |
| 2 | Sekme başlığı (metadata) | KISMİ | `page.tsx:7`; `app/customer/layout.tsx:17-21` | `'Yıldız Avı \| QRateX'` + layout şablonu `%s \| Müşteri alanı` → "Yıldız Avı \| QRateX \| Müşteri alanı" (çift ek). Marka yazımı da tutarsız: "QRateX" ve "QRatex" (`page.tsx:19`). |
| 3 | Başlık + açıklama (DashboardPageHeading) | ÇALIŞIYOR | `page.tsx:17-20`; `components/dashboard/page-heading.tsx:21` | `hidden sm:flex`: mobilde hiç görünmüyor. Başlıktaki 🎮 emojisi hub kartındaki 👾 ile tutarsız (`games-hub.tsx:30`). |
| 4 | HUD: yıldız sayacı x/5 | ÇALIŞIYOR | `PG:594-596`, `PG:399` | |
| 5 | HUD: skor | KISMİ | `PG:597-599`, `PG:396-398`, `PG:456-457` | Skor hesaplanıyor ama sunucuya gönderilmiyor, saklanmıyor, kıyaslanmıyor. Tamamen kozmetik. |
| 6 | HUD: power geri sayımı (sn) | ÇALIŞIYOR | `PG:375`, `PG:600-604` | `setPowerLeft` her karede çağrılıyor; React aynı değerde bail-out ettiği için zararsız. |
| 7 | HUD: "kaç!" ipucu | ÇALIŞIYOR | `PG:605-607` | Statik metin. |
| 8 | Neon labirent çizimi | ÇALIŞIYOR | `PG:166-184` | Statik içerik her karede yeniden çiziliyor (bkz. Bulgu 9). |
| 9 | Dönen yıldızlar + toplama | ÇALIŞIYOR | `PG:201-224`, `PG:391-404` | |
| 10 | Kombo çarpanı | KISMİ | `PG:395-396` | `comboRef` hiç sıfırlanmıyor. "Kombo" aslında yıldız sırası çarpanı (100, 200, …, 500). Kullanıcı kombo olduğunu göremiyor; görsel karşılığı yok. |
| 11 | Power pellet → korkmuş hayaletler + son 1.6 sn yanıp sönme | ÇALIŞIYOR | `PG:406-417`, `PG:270-273` | |
| 12 | Power bitiyor sesi | ÇALIŞIYOR | `PG:376-379` | |
| 13 | Hayalet yeme (+300, eve ışınlama) | ÇALIŞIYOR | `PG:452-464` | |
| 14 | Power sırasında dokunulmazlık (korkmamış hayalete çarpınca bir şey olmaz) | ÇALIŞIYOR | `PG:465` | Kullanıcıya hiçbir yerde anlatılmıyor (HUD'da yalnızca Shield ikonu var). |
| 15 | Hayalet yapay zekâsı (açgözlü + rastgele, U dönüşü engeli) | ÇALIŞIYOR | `PG:425-446` | Zorluk sabit; seviye veya ilerleme yok. |
| 16 | Çarpışmada kayıp → oyunu sonlandırma | **BOZUK** | `PG:466-469`, `PG:483-484`, `PG:309` | Kayıp dalında `return` yok. Döngü kendini yeniden planlıyor, oyun arka planda sürüyor (Bulgu 2). |
| 17 | 5 yıldızda kazanma tespiti | ÇALIŞIYOR | `PG:419-422` | İstemci tarafında. |
| 18 | Parçacık efektleri | ÇALIŞIYOR | `PG:125-140`, `PG:473-481` | |
| 19 | Ekran sarsıntısı | KISMİ | `PG:153-157` | `reduce-animations` ve `prefers-reduced-motion` hiç kontrol edilmiyor. |
| 20 | Web Audio ses efektleri | ÇALIŞIYOR | `lib/game-sounds.ts:10-31` | "Animasyonları azalt" açıkken susuyor. Ayrı bir ses aç/kapa kontrolü yok (#47). |
| 21 | Klavye (ok tuşları + WASD) | KISMİ | `PG:529-550` | Yalnızca küçük harf `w/a/s/d` eşleniyor; CapsLock veya Shift açıkken WASD çalışmıyor. Dinleyici `window`'da ve `preventDefault` yapıyor: oyun sürerken üst bardaki aramaya "w/a/s/d" yazılamıyor. |
| 22 | Dokunmatik kaydırma (swipe) | ÇALIŞIYOR | `PG:553-578` | Yalnızca canvas üzerinde, 18 px eşikli. |
| 23 | Mobil D-pad | KISMİ | `PG:664-673` | Yalnızca `<640px` (`sm:hidden`): dokunmatik tabletlerde (iPad) D-pad yok ve "Ok tuşları / WASD" ipucu gösteriliyor (`PG:675-677`). Butonlarda `aria-label` yok; ekran okuyucu "▲" okuyor. |
| 24 | Oyunu başlatma (POST start) | ÇALIŞIYOR | `PG:487-526`, `SR:18-73` | Yarım kalan `active` oturumu yeniden döndürüyor. |
| 25 | Günde 1 hak kontrolü | KISMİ | `SR:35-53`, `CR:75` | Yalnızca `completed` engelliyor. Kaybedilen (`failed`) oturum yeniden "oynanabilir" dönüyor, sonunda 409 alınıyor (Bulgu 3). Ayrıca durum bilgisi ancak "Oyna"ya basınca öğreniliyor (#46). |
| 26 | Sonucu sunucuya gönderme (POST complete) | **BOZUK** | `PG:307-343`, `PG:372-486`, `PG:500-521` | Stale closure yüzünden `sessionId` her zaman `null`, `fetch` hiç yapılmıyor (Bulgu 1). |
| 27 | Sunucu tarafı ödül doğrulama | KISMİ | `CR:62-68`, `lib/minigame-config.ts:17,21-30` | Atomik claim doğru (`CR:71-83`). Ama doğrulama yalnızca "won=true + 5 yıldız + ≥5 sn"; BFS ile hesaplanan fiziksel alt sınır ~10.6 sn. `gameType` kontrolü de yok (Bulgu 4, 5). |
| 28 | `points_credited` anti-fraud olayı | ÇALIŞIYOR | `CR:90-95` | `sessionId` loglanmıyor (generic route'ta var: `[game]/complete/route.ts:168`). |
| 29 | Ödül bildirimi (Notification) | KISMİ | `CR:108-118` | Route doğru ama Bulgu 1 yüzünden UI'dan hiç tetiklenmiyor. |
| 30 | Sonuç katmanı (Kazandın / Yakalandın / Oyun bitti + skor + mesaj) | KISMİ | `PG:634-658` | `resultMsg` yalnızca `complete` yanıtında doluyor, o da hiç gelmiyor. Kullanıcı ödül durumunu hiç görmüyor. |
| 31 | Yükleniyor durumları (starting / submitting spinner) | KISMİ | `PG:633`, `PG:639-641` | `submitting` spinner'ı Bulgu 1 yüzünden hiç görünmüyor. |
| 32 | Hata yönetimi (toast) | KISMİ | `PG:324-325`, `PG:492-500`, `SR:23`, `CR:39` | `res.json()` için catch yok: HTML 5xx dönerse "Unexpected token <" toast'ı çıkar. 401'de İngilizce "Unauthorized", zod hatasında İngilizce teknik mesaj kullanıcıya sızıyor. |
| 33 | "Yenile" butonu | SAHTE | `PG:680-684` | `window.location.reload()` sayfayı boşta durumuna döndürüyor. "Oyna"ya basınca yine "zaten oynadın" geliyor. Hiçbir değer üretmiyor. |
| 34 | Ödül vaadi metni "5 yıldız = 150 puan + 75 XP" | KISMİ | `PG:627`; `SR:75-81` | Sabit kodlu. Start'ın döndürdüğü `config` hiç okunmuyor; sunucu değeri değişirse metin yalan söyler. |
| 35 | Oyuna özel kişilik metinleri (`GAME_COPY.pacman`) | SAHTE | `lib/minigame-copy.ts:43-50` | Tanımlı ama `PacmanGame` hiç kullanmıyor: ölü kod. |
| 36 | Kare hızından bağımsız hareket | **BOZUK** | `PG:93-94`, `PG:367-368`, `PG:484` | Hız "piksel/kare". 120/144 Hz ekranda oyuncu ve hayaletler 2-2.4 kat hızlı. Power süresi (`performance.now`) ise gerçek zamanlı; denge cihaza göre değişiyor. |
| 37 | Günlük seri (streak) bonus XP'si | EKSİK | `CR` (yok) ve `[game]/complete/route.ts:111-150` karşılaştırması | Diğer 19 oyun +10/+40 XP seri bonusu veriyor, Pacman vermiyor. Ama `status='completed'` olduğu için seri sayımına dahil (`streak/route.ts:39`). |
| 38 | Başarım tespiti + bildirimi | EKSİK | `[game]/complete/route.ts:89-94,196-215` | Pacman route'unda yok. |
| 39 | Liderlik tablosu + turnuva | EKSİK | `components/customer/games/game-shell.tsx:8-9` | `[game]/leaderboard` `getEffectiveMiniGame('pacman')` için `null` döner (`lib/minigame-config-effective.ts:99-100`). |
| 40 | Admin aç/kapa + ödül override | EKSİK | `SR` (enabled kontrolü yok); `games-hub.tsx:83-84` | Pacman hub'da hep görünüyor, admin panelinde yok. |
| 41 | Duraklat / sekme gizlenince durdurma | EKSİK | `PG` (visibilitychange yok) | Sekme değişince rAF durur ama power süresi akmaya devam eder. Duraklatma butonu yok. |
| 42 | Retina (DPR) keskinliği | EKSİK | `PG:611-616` | `width={544} height={374}` sabit; CSS ile ölçekleniyor, yüksek DPI'da bulanık. |
| 43 | Erişilebilir metin alternatifi | EKSİK | `PG:611-617`, `PG:618-660` | Canvas'ta `role`/`aria-label` yok, sonuç katmanında `aria-live` yok, odak yönetimi yok. |
| 44 | Sonuç sonrası "sonraki adım" (hub'a dön / sıradaki oyun) | EKSİK | `PG:634-658` | Kullanıcı çıkmaza giriyor. |
| 45 | Kutlama (konfeti / ödül animasyonu) | EKSİK | `game-shell.tsx:18-30` (diğer oyunlarda var) | |
| 46 | Sayfa açılışında "bugün oynandı mı" ön kontrolü | EKSİK | `PG:99-106` (başlangıç `idle`) | Hak bitmiş kullanıcıya önce "Oyna ▶" ve ödül vaadi gösteriliyor. |
| 47 | Ses aç/kapa kontrolü | EKSİK | `PG` | Yalnızca global "animasyonları azalt" ile susuyor. |
| 48 | Unmount'ta rAF temizliği | ÇALIŞIYOR | `PG:580-584` | |
| 49 | Gün sınırı | KISMİ | `SR:10-12` | `dayKey` UTC. Türkiye'de hak 03:00'te yenileniyor; "Yarın tekrar gel" metni 00:00-03:00 arasında yanıltıcı. |

**Sayım:** ÇALIŞIYOR 18 · KISMİ 15 · BOZUK 3 · SAHTE 2 · EKSİK 11 · **Toplam 49**

---

## Bulgular

### 1. [KRİTİK · Hata/Veri] Sonuç sunucuya hiç gönderilmiyor: ödül asla verilmiyor (stale closure)
- **Kanıt:**
  - `PG:307-343`: `finishGame = useCallback(async (won) => { … if (!sessionId) return; … fetch(...complete) }, [sessionId])`
  - `PG:372-486`: `loop = useCallback(() => { … finishGame(true/false) … rafRef.current = requestAnimationFrame(loop); }, [draw, finishGame, …])`
  - `PG:487-521`: `startGame` (memo'suz, ilk render'ın closure'ı) içinde `setSessionId(json.sessionId)` ve hemen ardından `requestAnimationFrame(loop)`.
- **Sorun:** "Oyna"ya basan `startGame`, `sessionId === null` olan render'ın closure'ında çalışıyor. `setSessionId` yeni bir render planlar ama `startGame`'in elindeki `loop`, eski `finishGame`'i (sessionId=null) tutuyor. `loop` kendini de aynı closure'dan yeniden planladığı (`requestAnimationFrame(loop)`) için oyun boyunca hep bu eski fonksiyon dönüyor. Sonuç olarak `finishGame` 315. satırda `return` ediyor: **`/api/customer/games/pacman/complete` hiç çağrılmıyor.**
  - Kullanıcı "Kazandın! 🎉" görüyor ama puan/XP yazılmıyor, bildirim gelmiyor, `resultMsg` boş kalıyor.
  - Oturum DB'de `active` kalıyor: hub'da "bugün oynandı" işareti çıkmıyor (`status/route.ts:33`), seriye ve başarıma sayılmıyor.
  - Aynı desen ilk commit'ten beri var (`git show 1bd5167`: `finishGame [sessionId]` + `requestAnimationFrame(loop)`). Diğer oyunların hook'u bu tuzağı `sessionIdRef` ile bilinçli olarak çözmüş (`lib/use-mini-game.ts:50,69,84`).
  - Canlı veri okunmadığından (kural gereği) etki üretimde ölçülmedi. Doğrulamak için salt-okunur sorgu önerisi: `MiniGameSession` tablosunda `gameType='pacman'` satırlarının `status` dağılımı. Hipotez: neredeyse tamamı `active`.
- **Profesyonel öneri:** Kısa vadede `sessionId`'yi ref'e taşı. Asıl çözüm Pacman'i `useMiniGame('pacman')` hook'una geçirmek; hook zaten ref tabanlı, `finish(score, won)` API'si hazır. Oyun döngüsünü `useEffect` içinde kur, döngü dışı her şeyi ref'ten oku (callback ref deseni). Regresyon için bir RTL testi ekle: sahte rAF + `fetch` mock ile "5 yıldız toplandı → complete'e sessionId ile POST atıldı".
- **Efor:** S (hotfix) / M (hook'a geçiş)

### 2. [YÜKSEK · Hata/Performans] Kayıp anında oyun döngüsü durmuyor: ses spam'i, durum çakışması, sonsuz rAF
- **Kanıt:** `PG:466-469` (kayıpta `void finishGame(false)` çağrılıyor, ardından `return` yok) → `PG:474-484` (parçacık güncelle, çiz, `requestAnimationFrame(loop)`). `PG:309`'daki `cancelAnimationFrame` senkron çağrıldığı için o anda çalışan karenin id'sini iptal ediyor, yani etkisiz. Kazanma dalında ise `return` var (`PG:421`).
- **Sorun:**
  - Kayıptan sonra döngü sonsuza kadar sürüyor. Hayalet oyuncuyla çakıştıkça `finishGame(false)` her karede yeniden çağrılıyor: üst üste binen 0.5 sn'lik sawtooth `sfxHit` tonları (`lib/game-sounds.ts:83-87`), sürekli `setState('lost')`, CPU ve pil tüketimi.
  - Klavye dinleyicisi kalkmış olsa da oyuncu son yönünde hareket etmeyi sürdürüyor. Kalan yıldızlara ulaşırsa `finishGame(true)` "Yakalandın!" ekranını "Kazandın! 🎉" ile değiştiriyor ve kazanma fanfarı çalıyor.
  - Bulgu 1 düzeltildiğinde etki büyür: her kare için bir `POST /complete` gider, ilki `failed` yazar, gerisi 409 toast'u üretir.
- **Profesyonel öneri:** Döngüye tek bir `phaseRef` (`'playing' | 'ended'`) koy. Sonuç tespit edildiği anda `phaseRef='ended'` yap, döngüden **hemen** `return` et ve bir daha planlama. `finishGame`'i idempotent yap (`finishedRef` guard). Ses ve görsel kapanışı "son kare dondurma + 400 ms yavaşlatma" gibi kasıtlı bir bitiş animasyonuna bağla.
- **Efor:** S

### 3. [YÜKSEK · Hata/Mantık, sistem geneli] Kaybedilen oturum "tekrar oynanabilir" dönüyor, sonuç her seferinde 409 alıyor
- **Kanıt:** `CR:75` kayıpta `status: 'failed'` yazıyor. `SR:35-53` yalnızca `existing.status === 'completed'` için `alreadyPlayed` dönüyor, `failed` oturumu `canPlay: true` + aynı `sessionId` ile geri veriyor. `CR:55` yalnızca `completed`'i reddediyor, `CR:72-83` ise `status:'active'` filtresiyle 0 satır güncelleyip **409 "Oyun zaten tamamlandı"** dönüyor. Aynı desen generic yolda da var: `[game]/start/route.ts:57` ve `[game]/complete/route.ts:101`. Yani 19 oyunun tamamını etkiliyor.
- **Sorun:** Ödül sızıntısı yok (atomik guard doğru), ama UX kırık. Kaybeden kullanıcı sayfayı yenileyince "Oyna" ile yeniden oynuyor, tam oyun bitiminde hata toast'u alıyor. "Günde 1 hak" kuralı arayüzde tutarsız davranıyor.
- **Profesyonel öneri:** Ürün kararını netleştir:
  - (a) "Günde 1 deneme": start, `status !== 'active'` olan her oturumda `alreadyPlayed: true, lastResult: {won, stars}` dönsün. Hub'daki `status` uç noktası da `completed` ve `failed`'i birlikte "oynandı" saysın; streak yalnızca `completed`'i saymaya devam etsin.
  - (b) "Günde 1 ödül, sınırsız deneme": `failed` oturumu `active`'e çevirip `startedAt`'i sıfırlayan bir `retry` alanı ekle ve `attempts` sayacı tut.

  Kararı tek bir yardımcıda (`lib/minigame-session.ts: resolveTodaySession`) uygula ki pacman ve generic route aynı mantığı kullansın.
- **Efor:** M

### 4. [YÜKSEK · Güvenlik/Ekonomi] Ödül doğrulaması yalnızca istemci beyanına dayanıyor; minimum süre fiziksel alt sınırın yarısı
- **Kanıt:** `CR:12-18,62-68`: ödül için `won === true`, `starsCollected === 5`, `serverElapsedSec >= 5` yeterli. `lib/minigame-config.ts:17`: `minDurationSec: 5`. BFS ile hesaplanan en kısa rota başlangıç (7,7) → 5 yıldız = **45 hücre**. 60 Hz'de oyuncu hızı 2.4 px/kare × 60 / 34 px ≈ 4.24 hücre/sn, yani **≈10.6 sn** (köşe hizalaması hariç, kaba alt sınır). 120 Hz ekranda (Bulgu 6) ≈5.3 sn.
- **Sorun:** `POST start` → 5 sn bekle → `POST complete {won:true, starsCollected:5, durationSec:5}` ile oynamadan her gün 150 puan + 75 XP alınabilir. `points_credited` olayı yazıldığı için velocity dedektörü görür (`CR:91-95`), ama 150 puanlık tek kredi 500/24s eşiğinin altında kalıyor. Bu sorun diğer oyunlarda da var; Pacman'de en azından deterministik bir harita olduğu için düzeltmesi kolay.
- **Profesyonel öneri:** Pacman deterministik ve küçük bir harita; **sunucu tarafı replay doğrulaması** yapılabilir. İstemci, oyuncunun hücre bazlı yön değişikliklerini zaman damgasıyla (`[{t, dir}]`, tipik olarak <100 olay) gönderir. Sunucu sabit adımlı (fixed-timestep) simülasyonla aynı motoru koşturup yıldızların gerçekten toplandığını, yolun duvarlardan geçmediğini ve sürenin fiziksel sınırla tutarlı olduğunu doğrular. Hayalet rastgeleliği için start'ta `seed` ver. Kısa vadede `minDurationSec`'i hesaplanan alt sınıra (≥11 sn) çek ve Bulgu 6'yı düzelt ki süre cihazdan bağımsız olsun.
- **Efor:** L (replay) / S (eşik)

### 5. [ORTA · Güvenlik/Veri bütünlüğü] `pacman/complete` oturumun oyun türünü kontrol etmiyor
- **Kanıt:** `CR:45-54` yalnızca `userId` eşleşmesine bakıyor; `select` içinde `gameType` yok. Generic route bunu yapıyor: `[game]/complete/route.ts:65-67` (`gameSession.gameType !== game.gameType` → 404).
- **Sorun:** Kullanıcı başka bir oyunun (ör. `data-snake`) aktif oturum id'sini Pacman'in complete'ine gönderip Pacman ödülünü (150 + 75) alabilir; o oyunun oturumu da `completed` olarak işaretlenir. Admin'in pasifleştirdiği bir oyunun önceden açılmış aktif oturumu da bu yoldan ödüllendirilebilir. Ek puan kazancı sınırlı (oyunlar arası ödüller benzer), ama veri bütünlüğünü bozuyor (yanlış `gameType`'a yanlış skor) ve admin kapamasını deliyor.
- **Profesyonel öneri:** Kısa vadede `where: { id: sessionId, userId, gameType: 'pacman', status: 'active' }` ile claim et. Kalıcı çözüm Pacman'e özel route'ları silip generic `[game]` route'una taşımak (Bulgu 7).
- **Efor:** S

### 6. [ORTA · Hata/Oynanış] Oyun hızı ekran tazeleme hızına bağlı
- **Kanıt:** `PG:93-94` (`SPEED_PLAYER = 2.4`, `SPEED_GHOST = 1.7`, "piksel/kare"); `PG:367-368` delta-time yok; `PG:484` rAF.
- **Sorun:** 120 Hz iPhone/iPad Pro ve 144 Hz monitörlerde her şey 2-2.4 kat hızlı. Power süresi (`POWER_MS`, `performance.now`) gerçek zamanlı kaldığı için güçlendirme sırasında katedilen mesafe de değişiyor. Zorluk cihaza göre değişiyor, adil değil, anti-cheat süre eşiklerini de anlamsızlaştırıyor (Bulgu 4). Sekme arka plandayken rAF duruyor ama power süresi akıyor.
- **Profesyonel öneri:** Sabit adımlı simülasyon (ör. 60 tick/sn accumulator) + render interpolasyonu kullan. Aynı adım fonksiyonu sunucu replay doğrulamasında da kullanılabilir (Bulgu 4 ile sinerji). `visibilitychange`'te otomatik duraklat.
- **Efor:** M

### 7. [ORTA · Mimari] Çatallanmış eski yol: platform özelliklerinin hiçbiri Pacman'e ulaşmamış
- **Kanıt:** Pacman'e özel `SR`, `CR` ve `MINIGAME` sabiti (`lib/minigame-config.ts:6-30`); generic yorum "pacman hariç tüm oyunlar buradan geçer" (`[game]/start/route.ts:16`). Hub'da Pacman sabit kodlu bir kart (`games-hub.tsx:25-32,83-84`). Kullanılmayan `GAME_COPY.pacman` (`lib/minigame-copy.ts:43-50`). Start'ın döndürdüğü `config` okunmuyor, ödül metni sabit (`PG:627`).
- **Sorun:** Seri bonusu, başarımlar, liderlik, turnuva, konfeti, kişilik metinleri, admin aç-kapa/override ve oyun türü doğrulaması diğer 19 oyuna eklenmiş, Pacman'e eklenmemiş. Her platform iyileştirmesi Pacman'i atlıyor ve aynı hatalar (Bulgu 1, 5) yalnızca burada yaşıyor. Ekip için bakım yükü, kullanıcı için tutarsız deneyim.
- **Profesyonel öneri:**
  1. `MINI_GAMES`'e `{ gameType:'pacman', maxScore:5, rewardThreshold:5, rewardPoints:150, rewardXp:75, minDurationSec:11 }` satırını ekle (skor birimi = yıldız; DB alanı zaten `starsCollected`).
  2. Bileşeni `components/customer/games/pacman-game.tsx`'e taşı; `useMiniGame` + `GameShell` + `FxLayer` ile sar. Canvas yalnızca `phase==='playing'` iken render edilsin.
  3. `app/api/customer/games/pacman/*` route'larını ve `MINIGAME`/`computeMinigameReward`'ı sil, test dosyasını (`__tests__/lib/minigame-config.test.ts`) generic'e çevir.
  4. Hub'daki `PACMAN` sabitini kaldır.

  Şema değişikliği gerekmiyor; `gameType` default'u zaten `'pacman'` (`prisma/schema.prisma:496`).
- **Efor:** M

### 8. [ORTA · UX] Hak durumu önceden bilinmiyor, sonuç ekranı çıkmaz sokak, "Yenile" işe yaramıyor
- **Kanıt:** Başlangıç durumu sabit `'idle'` (`PG:99`); hak bitmiş olsa da "Oyna ▶" + "5 yıldız = 150 puan" gösteriliyor (`PG:620-631`). Sonuç katmanında hiçbir CTA yok (`PG:634-658`). "Yenile" `window.location.reload()` yapıyor ve kullanıcı aynı döngüye geri dönüyor (`PG:680-684`).
- **Sorun:** Kullanıcı önce heveslenip sonra "zaten oynadın" ile karşılaşıyor (negatif sürpriz). Oyun bitince bir sonraki aksiyon (diğer oyunlar, ödül dükkânı, seri durumu) önerilmiyor. Duolingo/Starbucks'ın "bir sonraki adım" ilkesine aykırı.
- **Profesyonel öneri:** Sayfayı server component'te `MiniGameSession` (bugün, bu kullanıcı, pacman) ile ön-yükle ve `initialStatus` prop'u geç: `{ playedToday, lastResult, resetsAt }`. Hak bitmişse kilitli ekranda "Sonraki tura kalan süre" geri sayımı (`resetsAt`), bugünkü sonuç kartı, "Bugünün diğer oyunları (x/20 tamamlandı)" listesi ve seri durumu göster. "Yenile" butonunu kaldır.
- **Efor:** M

### 9. [ORTA · Performans] Statik labirent her karede `shadowBlur` ile yeniden çiziliyor
- **Kanıt:** `PG:166-184`: 93 duvar hücresinin her biri için iki `roundRect` path, `fill` ve `shadowBlur=8` ile `stroke`, saniyede 60 kez. Canvas'ta `shadowBlur` CPU'da Gauss bulanıklığı demek. Ayrıca yıldız, pellet, oyuncu ve hayaletler için ek `shadowBlur`'lar var.
- **Sorun:** Düşük segment Android cihazlarda kare düşmesi ve pil tüketimi. Bulgu 6 ile birleşince kare düşmesi oyunu yavaşlatıyor bile.
- **Profesyonel öneri:** Labirenti mount'ta bir kez `OffscreenCanvas`/gizli canvas'a (DPR ölçekli) çiz, her karede `drawImage` ile bas. Parıltıyı `shadowBlur` yerine önceden render edilmiş glow sprite'larıyla yap. Canvas'ı `devicePixelRatio`'ya göre ölçekle (Bulgu 11).
- **Efor:** S

### 10. [ORTA · Erişilebilirlik] Ekran okuyucu ve azaltılmış hareket desteği yok
- **Kanıt:** Bileşende hiç `aria-*`/`role` yok (grep boş). Canvas etiketsiz (`PG:611-616`); D-pad butonları yalnızca "▲◀▼▶" glifleri (`PG:667-671`); sonuç katmanı `aria-live` değil (`PG:619`). Sarsıntı ve parçacıklar `reduce-animations` sınıfını kontrol etmiyor (`PG:153-157`). Ses ise kontrol ediyor (`lib/game-sounds.ts:10-13`), `GameShell` de konfeti için ediyor (`game-shell.tsx:13-16,20`).
- **Sorun:** Vestibüler hassasiyeti olan kullanıcıda ekran sarsıntısı (10 px'e kadar, `PG:467`) rahatsızlık yaratır. Ekran okuyucu kullanıcısı oyunun durumunu (yıldız, kazanma/kaybetme, ödül) öğrenemez.
- **Profesyonel öneri:** `useReducedMotion()` (framer-motion) veya `reduce-animations` kontrolüyle sarsıntıyı kapat, parçacık sayısını %70 azalt, yıldız dönüşünü durdur. Canvas'a `role="img" aria-label="Yıldız Avı labirenti"` ver ve oyun durumu için görsel olarak gizli bir `aria-live="polite"` bölge ekle ("3/5 yıldız", "Power aktif, 6 saniye", "Kazandın, 150 puan eklendi"). D-pad butonlarına `aria-label="Yukarı"` vb. ekle. Sonuç katmanı açılınca odağı birincil CTA'ya taşı.
- **Efor:** S

### 11. [DÜŞÜK · Mobil/Görsel] Retina bulanıklığı, tablet kontrolü ve mobilde başlık eksikliği
- **Kanıt:** Sabit canvas çözünürlüğü `PG:611-616`; D-pad `sm:hidden` (`PG:665`); masaüstü ipucu `hidden sm:block` (`PG:675`); başlık `hidden sm:flex` (`page-heading.tsx:21`).
- **Sorun:** 3x DPR telefonda 544 px canvas ~336 CSS px'e sıkışıyor ve bulanıklaşıyor. 768 px+ dokunmatik tablette D-pad yok ama "Ok tuşları / WASD" yazıyor. Mobilde sayfanın kimliği ancak oyun katmanında görünüyor.
- **Profesyonel öneri:** DPR ölçekleme yap. Kontrol tipini ekran genişliğine göre değil `(pointer: coarse)` media query'sine göre göster. D-pad'i başparmak bölgesine (canvas altı, sabit yükseklik) koy, `haptic()` geri bildirimi ekle. Mobilde canvas'ın üstüne kompakt bir başlık ve hak çipi koy.
- **Efor:** S

### 12. [DÜŞÜK · Hata yönetimi/Dil] Teknik ve İngilizce hata mesajları kullanıcıya sızıyor
- **Kanıt:** `PG:324-325` ve `PG:492-493` `res.json()` için catch yok; `SR:23`/`CR:30` `'Unauthorized'`; `CR:39` zod'un İngilizce varsayılan mesajı; toast `e.message`'ı aynen gösteriyor (`PG:336`, `PG:523`).
- **Profesyonel öneri:** `useMiniGame`'deki `res.json().catch(() => ({}))` desenini kullan. API'de hata kodlarını (`code: 'UNAUTHORIZED'`) TR mesaj haritasına bağla, kullanıcıya yalnızca TR ve insanca metin göster.
- **Efor:** S

### 13. [DÜŞÜK · Hata] Var olmayan giriş route'una yönlendirme ve çift sekme başlığı
- **Kanıt:** `page.tsx:12` `redirect('/auth/signin')`; giriş sayfası `/auth/login` (`lib/auth.ts:65`, `app/(auth)/auth/login`). Bu sorun 22 sayfada tekrarlanıyor. `page.tsx:7` metadata başlığında marka var, layout şablonu da ekliyor (`app/customer/layout.tsx:19-20`).
- **Profesyonel öneri:** Ortak bir `requireCustomer()` sunucu yardımcısı yaz (doğru `/auth/login?callbackUrl=` ile) ve 22 sayfada onu kullan. Metadata'yı `{ title: 'Yıldız Avı' }` yap.
- **Efor:** S

### 14. [DÜŞÜK · Ürün] Gün sınırı UTC, iletişim yerel saate göre
- **Kanıt:** `SR:10-12` `toISOString().slice(0,10)`; metin "Yarın yeni bir hak için tekrar gel" (`PG:654`).
- **Profesyonel öneri:** `dayKey`'i `Europe/Istanbul` (veya kullanıcının saat dilimi) ile üret. Bu tüm oyunları ve streak'i etkiler; tek bir `lib/day-key.ts` yardımcısına taşı. Kilitli ekranda net yenilenme saatini göster.
- **Efor:** S (kod) / M (geçiş günü veri tutarlılığı)

---

## Eksik özellikler (kıyas ürünlerle)

1. **Ödül geri bildirimi ve kutlama anı** (Starbucks Stars, Duolingo XP patlaması): Kazanınca puanın cüzdana "akması", güncel bakiye, seviye çubuğunun dolması, konfeti. Şu an hiçbiri yok, üstelik ödül hiç yazılmıyor.
2. **Seri ve "bugünün görevleri" bağlamı** (Duolingo streak): Oyun sayfasında seri durumu, bugünkü oyun ilerlemesi (x/20) ve "seriyi koru" mesajı. Generic oyunlarda toast olarak var, Pacman'de yok.
3. **Sosyal kıyas** (Duolingo ligleri): Günlük/haftalık liderlik (en kısa sürede 5 yıldız, en yüksek skor), arkadaş/klan sıralaması. Altyapı (`GameLeaderboard`, `GameTournament`) hazır ama Pacman bağlı değil.
4. **Kişisel rekor ve ilerleme**: "En iyi süre", "Toplam yenilen hayalet", oyuna özel başarımlar ("Hayalet Avcısı: tek power'da 3 hayalet"). Skor zaten hesaplanıyor ama atılıyor.
5. **Duraklat / devam et ve ses kontrolü** (her mobil oyunun standardı): Sekme değişiminde otomatik duraklatma, sessize alma butonu.
6. **Adil zorluk ve tekrar oynanabilirlik**: Günlük değişen labirent/seed ("Günün Labirenti", Wordle modeli) ve paylaşılabilir sonuç kartı (Spotify Wrapped tarzı "Bugün 12.4 sn'de 5 yıldız 🌟").

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı sayfaya girdiği anda üç şeyi bilmeli: bugünkü hakkının durumu, ne kazanacağı ve serisi. Oyun 60-90 saniyelik, her cihazda aynı hızda, sonu net ve ödülü anında hissedilen bir "günlük ritüel" olmalı (Wordle + Duolingo). Bittiğinde ödül cüzdana akar, kişisel rekor ve sıralama görünür, sonraki oyun önerilir.

**Yerleşim (mobil öncelikli):**
1. **Üst şerit:** Oyun adı + hak çipi ("Bugün 1 hak" / "Yarın 03:00'te yenilenir"), seri alevi (🔥 n), kişisel rekor.
2. **Oyun alanı (`GameShell`):** DPR-keskin canvas, oyun içi HUD canvas'ın üstüne kompakt bindirilmiş (yıldız pip'leri, power halkası, süre). Sağ üstte duraklat ve ses ikonları.
3. **Kontrol bölgesi:** `pointer: coarse` cihazlarda başparmak bölgesinde D-pad + haptik; masaüstünde klavye ipucu.
4. **Sonuç kartı:** Kazan/kaybet varyant başlığı (`GAME_COPY.pacman`), süre, skor, kişisel rekor farkı, ödül sayacının bakiyeye akışı, seri bonusu, yeni başarım rozetleri. CTA'lar: "Sıradaki oyun" (bugün oynanmamış ilk oyun), "Oyun Merkezi", "Sonucu paylaş".
5. **Alt bölüm:** Pacman liderlik tablosu (bugün / hafta, "en hızlı 5 yıldız") ve turnuva kartı.

**Motion/3D (ölçülü):** Three.js gereksiz; 2D canvas bu oyun için doğru araç. Motion yalnızca anlam taşıyan anlarda olsun:
- Yıldız toplanınca HUD pip'inin dolması (framer-motion `layout` + spring).
- Kazanınca 300 ms "freeze frame" ve ardından konfeti (accent sarı).
- Puan sayacının mevcut bakiyeden yeni bakiyeye sayması.
- Kayıpta kısa kırmızı vinyet.

Sarsıntı, parçacık ve yıldız dönüşü `useReducedMotion()` ile kapanmalı. Statik labirent önceden render edilmeli ve ışıma sprite ile yapılmalı.

**Veri/API değişiklikleri:**
- Pacman'i `MINI_GAMES` registry'sine ekle. Pacman'e özel route'ları ve `MINIGAME` sabitini kaldır. `useMiniGame('pacman')` ile generic start/complete'i kullan (oyun türü doğrulaması, streak, başarım ve admin override bedavaya gelir).
- Start yanıtına `seed` ve `resetsAt` ekle. Kaybedilen oturum politikasını netleştir (Bulgu 3) ve ortak `resolveTodaySession` yardımcısında uygula.
- Complete gövdesine opsiyonel `inputLog` (yön olayları) ekle. Pacman için sunucu tarafı deterministik replay doğrulayıcısı (`lib/games/pacman-sim.ts`) yaz; aynı sabit adımlı simülasyonu istemcide de kullan.
- Sayfayı server component'te bugünkü oturumla ön-yükle (`initialStatus`), ayrıca client fetch'e gerek kalmasın.
- `dayKey`'i `Europe/Istanbul`'a taşı (tüm oyunlar ve streak için tek yardımcı).
- `points_credited` olayına `sessionId` ekle.

---

## Çakışmalar / birleştirme önerisi

- **`app/api/customer/games/pacman/start` ve `…/pacman/complete`** ile **`app/api/customer/games/[game]/start` ve `…/[game]/complete`** aynı işi yapıyor. Pacman'e özel kopyalar generic'in eski ve daha zayıf sürümü (oyun türü kontrolü, streak, başarım, admin kapatma yok). Pacman kopyaları kaldırılıp generic'e **birleştirilmeli**.
- **`components/customer/pacman-game.tsx`** (`components/customer/` kökünde), diğer 19 oyunun `components/customer/games/*-game.tsx` + `GameShell` + `useMiniGame` desenini tekrar etmek yerine kendi kabuğunu yazıyor. Oynanış motoru korunmalı, kabuk ve yaşam döngüsü ortak çatıya taşınmalı.
- **`games-hub.tsx`'teki sabit kodlu `PACMAN` kartı**, registry'den beslenen kartlarla çakışıyor ve admin override'ını atlıyor. Registry'ye taşınınca bu sabit silinmeli.
- **`lib/minigame-copy.ts`'teki `GAME_COPY.pacman`** şu an ölü. Birleştirmeyle `GameShell`'e `copy` olarak bağlanınca canlanır.
- Tür olarak **`/customer/games/data-snake`** (ızgara tabanlı, yön kontrollü arcade) ile örtüşüyor ama oynanış farklı (kaçış/toplama ve büyüme). İkisi ayrı oyun olarak kalabilir; **kaldırma önerilmiyor**.

---

## Doğrulama (şüpheci inceleme)

Yöntem: `components/customer/pacman-game.tsx`, `app/api/customer/games/pacman/{start,complete}/route.ts`, generic `app/api/customer/games/[game]/{start,complete}/route.ts`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `app/customer/games/pacman/page.tsx` ve `prisma/schema.prisma` (`MiniGameSession`, satır 493-513) baştan okundu. Her iddia çürütülmeye çalışıldı. Veritabanına dokunulmadı; üretim etkisi ölçülmedi, yalnızca kod okumasıyla karar verildi. 4. iddiadaki BFS hesabı scratchpad'de saf hesaplama ile yeniden yapıldı (DB/proje betiği yok).

### 1. Stale closure: sonuç sunucuya hiç gönderilmiyor — **DOĞRULANDI**
- `startGame` (`pacman-game.tsx:487`) memoize edilmemiş düz fonksiyon; tıklandığı render'daki `loop`'u yakalar. "Oyna" düğmesi yalnızca `state === 'idle'` iken görünür (`:620-631`), o render'da `sessionId` her zaman `null`.
- `setSessionId(json.sessionId)` (`:500`) yeni bir render planlar ama `:521`'deki `requestAnimationFrame(loop)` eski closure'daki `loop`'u kullanır. `loop` (`:372-485`) kendini `:484`'te kendi closure'ındaki `loop` bağıyla yeniden planlar (useCallback ilk oluşturulduğu render'daki kendisini gösterir), dolayısıyla yeni render'daki `loop`/`finishGame` hiçbir zaman devreye girmez.
- Bu closure'daki `finishGame` (`:307-343`, deps `[sessionId]`) `sessionId = null` görür ve `:315`'te `return` eder. `fetch('/api/customer/games/pacman/complete')` hiç çalışmaz; `setState('done')` da çağrılmaz.
- Çürütme denemesi: başka bir yol `rafRef`'e yeni `loop` atıyor mu? Hayır; tek atama noktaları `:484` ve `:521`. Yeniden başlatma (ikinci tıklama) da yok; overlay `done/won/lost`'ta Oyna düğmesi göstermiyor.
- Yeniden üretim: Müşteri olarak `/customer/games/pacman` → Oyna → 5 yıldızı topla. Ekranda "Kazandın! 🎉" görünür, ağ sekmesinde `/complete` isteği yoktur; bakiye değişmez, bildirim gelmez, `MiniGameSession` satırı `active` kalır. Ertesi deneme (sayfa yenile) aynı aktif oturumu döndürür (`start/route.ts:48-52`), yani "günde 1 hak" da fiilen uygulanmaz ama hiçbiri ödüllenmez.
- Not: Bu bulgu nedeniyle üretimde `gameType='pacman'` ve `status='completed'` olan her satır büyük olasılıkla arayüz dışından (doğrudan API) üretilmiştir; salt-okunur bir dağılım sorgusu bunu teyit eder (çalıştırılmadı).

### 2. Kayıpta rAF döngüsü durmuyor — **DOĞRULANDI**
- Kayıp dalı (`:465-469`) `finishGame(false)` çağırır ama `return` etmez; forEach biter, `:483-484` `draw()` ve `requestAnimationFrame(loop)` çalışır. `:309`'daki `cancelAnimationFrame(rafRef.current)` o anda yürüyen karenin (zaten tetiklenmiş) id'sini iptal eder, etkisizdir; ardından `:484` yeni id yazar. Kazanma dalında `:421` `return` olduğu için döngü orada durur.
- Sonuç: Kayıptan sonra döngü sonsuza dek sürer (CPU/batarya). Klavye ve dokunmatik dinleyicileri `state !== 'playing'` olduğu için kalkar (`:529-578`), ama oyuncu son yönünde duvara kadar ilerlemeye devam eder; hayaletler kovalamayı sürdürür ve her çakışma karesinde `finishGame(false)` → `sfxHit()` + `setState('lost')` tekrarlanır (ses spam'i).
- "Ekran 'Kazandın'a dönebilir" kısmı mümkün ama nadir: girdi kesildiği için oyuncu yalnızca son yönündeki düz hatta kalan yıldız varsa onu toplayabilir; 5. yıldız toplanırsa `finishGame(true)` → `setState('won')`. Bulgu 1 düzeltildiğinde her çakışma karesi bir `POST /complete` atar: ilki `failed` yazar, sonrakiler `updateMany` sayısı 0 → 409 toast'u üretir (`complete/route.ts:71-83,101-105`).
- Yeniden üretim: Oyna → bir hayalete çarp → "Yakalandın!" görünürken ses tekrar tekrar çalar; DevTools Performance'ta rAF karelerinin sürdüğü görülür.

### 3. `failed` oturum start'ta `canPlay:true` dönüyor, sonunda kaçınılmaz 409 — **DOĞRULANDI** (generic oyunlarda bugün canlı; Pacman'de Bulgu 1 yüzünden şu an gizli)
- Generic: `[game]/complete/route.ts:101` kayıpta `status: 'failed'` yazar. `[game]/start/route.ts:57-77` yalnızca `completed`'ı engeller, `failed` satırı için aynı `sessionId` ile `canPlay:true` döner. Kullanıcı tekrar oynar; complete'te `:73` kontrolü (`completed` değil) geçer ama `:98-108` `where: { status: 'active' }` 0 satır döner → 409 "Oyun zaten tamamlandı" (`useMiniGame` `:126-128` bunu toast olarak gösterir).
- Ekonomi açısından sızıntı yok (atomik guard doğru), ama kural arayüzde tutarsız: kaybeden kullanıcıya "tekrar oyna" izni veriliyor, sonra emeği hata ile reddediliyor.
- Pacman: `pacman/complete/route.ts:75` aynı deseni taşır, `pacman/start/route.ts:35-53` aynı açığı bırakır. Ancak arayüz `/complete`'i hiç çağırmadığı için (Bulgu 1) Pacman'de `failed` satırı yalnızca doğrudan API ile oluşur; Bulgu 1 düzeltilince aynı hata Pacman'e de taşınır.
- Yeniden üretim (generic, örn. `data-snake`): Oyna → kaybet → sayfayı yenile → Oyna (izin verilir) → oyunu bitir → "Oyun zaten tamamlandı" toast'u.
- Öneri: Politika tek yerde kararlaştırılmalı (kayıp = günün hakkı bitti, ya da kayıpta N deneme hakkı). Ortak bir `resolveTodaySession` yardımcısı `failed`'ı da `alreadyPlayed` (veya `attemptsLeft`) olarak döndürmeli; start ve complete bu yardımcıyı paylaşmalı.

### 4. Oynamadan ödül alınabiliyor (istemci beyanı + 5 sn eşiği) — **DOĞRULANDI** (etki sınırlı: hesap başına günde 150 puan + 75 XP)
- `pacman/complete/route.ts:12-18` gövdedeki `won`, `starsCollected`, `durationSec` değerlerini doğrular ama gerçekliğini doğrulamaz; `:63-68` yalnızca sunucu süresi ≥ `MINIGAME.minDurationSec` (= 5, `lib/minigame-config.ts:17`) ve beyan edilen süre ≥ 5 şartını arar.
- BFS hesabı bağımsız olarak tekrarlandı: başlangıç (7,7) → 5 yıldızı toplayan en kısa tur **45 hücre**; `SPEED_PLAYER = 2.4` px/kare, `CELL = 34` px → 60 Hz'de ≈ **10.6 sn**. Fizik kare başına adım attığı için (`:367-368`, delta time yok) 120 Hz ekranda ≈ 5.3 sn, 144 Hz'de ≈ 4.4 sn; yani eşik hem botu durdurmuyor hem yüksek Hz'de meşru oyuncuyu bile `tooFast` yapabilir.
- Yeniden üretim: Oturum çerezi ile `POST /api/customer/games/pacman/start` → `sessionId` al → 5 sn bekle → `POST /api/customer/games/pacman/complete` `{sessionId, won:true, starsCollected:5, durationSec:5}` → 150 puan + 75 XP. `@@unique([userId, gameType, dayKey])` nedeniyle hesap başına günde bir kez.
- Paradoks: Bulgu 1 yüzünden meşru oyuncu hiç ödül alamazken bu yolu kullanan herkes alır.
- Not: İstemci tarafı oyunlarda tam güven mümkün değil; makul hedef girdi günlüğü (`inputLog`) + sunucuda deterministik sabit adımlı replay doğrulaması ve eşiğin fiziksel alt sınıra (≈ 10 sn, sabit adımlı simülasyonla) çekilmesidir. Çoklu hesap ile ölçeklenme riski velocity/caps katmanına bırakılmamalı.

### 5. `pacman/complete` başka oyunun oturumunu kabul ediyor — **DOĞRULANDI** (etki orta-düşük; iddiadaki "admin'in kapattığı oyun" gerekçesi kısmen çürütüldü)
- `pacman/complete/route.ts:45-54` oturumu yalnızca `id` + `userId` ile bulur, `gameType` seçmez ve kontrol etmez; `:72-73` `updateMany` de `gameType` filtrelemez. Generic route `[game]/complete/route.ts:65-67` bu kontrolü yapar.
- Somut kazanç: Kullanıcı generic bir oyunun (örn. `frost-catcher`, 120 puan) aktif oturum id'sini Pacman complete'e gönderirse 150 puan + 75 XP alır; ayrıca o oyunun admin override'ları (`lib/minigame-config-effective.ts:40-55`: `rewardPoints`, `rewardThreshold`, `minDurationSec` — admin ödülü 0'a bile çekebilir) ve 8-12 sn'lik `minDurationSec` tamamen atlanır, Pacman'in sabit 150/5 sn değerleri uygulanır. Oturum yanlış oyunun skoruyla `completed` olur, `points_credited` olayı `game:'pacman'` ile yanlış etiketlenir (`:93`), istatistik/lider tablosu bozulur.
- Sınır: Her oturum yine yalnızca bir kez claim edilebilir (atomik guard), dolayısıyla günlük toplam oturum sayısı artmaz; kazanç oturum başına fark kadardır.
- Kısmen çürütülen kısım: "Admin'in kapattığı oyunun önceden açılmış oturumu bu yoldan ödüllendirilebilir" — doğru ama Pacman'e özgü değil; generic `[game]/complete/route.ts` de `game.enabled` kontrolü yapmıyor (yalnızca start yapıyor, `[game]/start/route.ts:35-40`). Yani kapatılmış oyunun aktif oturumu generic route'tan da kapanabilir; Pacman yolu yalnızca ödül miktarını farklılaştırır.
- Yeniden üretim: `POST /api/customer/games/frost-catcher/start` → `sessionId` → 5 sn bekle → `POST /api/customer/games/pacman/complete` `{sessionId, won:true, starsCollected:5, durationSec:5}` → 150 puan.
- Öneri: Kısa vadede Pacman complete'e `gameType === MINIGAME.gameType` kontrolü ve `updateMany` `where`'ine `gameType` eklenmeli; asıl çözüm Pacman'i registry'ye alıp generic route'lara birleştirmek (yukarıdaki birleştirme önerisi). Generic complete'e de `enabled` kontrolü eklenmeli.

### Özet

| # | İddia | Karar |
|---|---|---|
| 1 | Stale closure, ödül hiç kredilenmiyor | Doğrulandı (kritik, işlevsel) |
| 2 | Kayıpta rAF döngüsü durmuyor | Doğrulandı (yüksek) |
| 3 | `failed` oturum → `canPlay:true` → 409 | Doğrulandı (orta; generic oyunlarda canlı, Pacman'de gizli) |
| 4 | İstemci beyanı + 5 sn eşiği ile sahte ödül | Doğrulandı (yüksek, hesap başına günde 150 ile sınırlı) |
| 5 | `gameType` kontrolü yok | Doğrulandı (orta-düşük; "kapalı oyun" gerekçesi Pacman'e özgü değil) |
