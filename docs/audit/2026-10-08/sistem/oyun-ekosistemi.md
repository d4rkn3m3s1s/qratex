# Oyun Ekosistemi — Sistem Geneli Denetim (2026-10-08)

> Kapsam: `app/customer/games/**` (21 oyun sayfası + hub), `components/customer/games/*` (20 registry oyunu + ortak kabuk/efekt/liderlik/turnuva/başarım bileşenleri), `components/customer/pacman-game.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config*.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/game-achievement*.ts`, `lib/tournament-core.ts`, `app/api/customer/games/**`, `app/api/customer/tournament`, `app/api/admin/games`, `app/admin/games`, ilgili Prisma modelleri (`MiniGameSession`, `MiniGameConfig`, `GameStreakClaim`, `TournamentRewardClaim`).
> Yöntem: salt okunur kod incelemesi. Kod çalıştırılmadı, oyunlar tarayıcıda oynanmadı. "Doğrulanmadı" işaretli maddeler okuma ile kesinleştirilemeyen çıkarımlardır.

---

## 1. Özet

**Puan: 4/10**

Qratex'in oyun katmanı **mimari iskelet olarak sağlam** başlamış: tek bir kayıt defteri (`MINI_GAMES`), generic `start/complete` API'si, `@@unique([userId, gameType, dayKey])` ile günlük hak, atomik `updateMany(status:'active')` ile tek-sefer ödül, `points_credited` görünürlüğü, admin override katmanı ve ortak `GameShell`/`FxLayer`/ses motoru var. Bu, 21 oyunu tek kişinin hızla çıkarabilmesini sağlamış.

Ancak ürün seviyesinde dört büyük sorun var:

1. **Hile koruması fiilen yok.** Skor ve `won` bayrağı tamamen istemciden geliyor; sunucu yalnızca `maxScore` ile kırpıyor ve minimum süreye bakıyor. 21 oyunun hepsinde ödül, basit bir script ile ~12 saniyede alınabilir. Günlük oyun ödülü (~3.250 puan) hiçbir tavana tabi değil. Bu puanın, en temel davranış olan geri bildirime konan günlük 500 puanlık tavanın 6,5 katı olduğu düşünülürse ve puanlar fiziksel/kupon ödüllere çevrilebiliyorsa, bu doğrudan **ekonomik bir açık**.
2. **"Günde 1 hak" modeli bozuk.** Sayfa yenilenince aktif oturum tekrar veriliyor, bu da sınırsız deneme demek. Kaybedilen (`failed`) oyunlar ise tekrar başlatılabiliyor ama sonunda 409 hatası veriyor; oyuncu bir turu boşuna oynamış oluyor.
3. **Oyunların bir kısmı bozuk ya da tasarım olarak çelişkili.** `speed-order` tek bir hatadan sonra kilitleniyor (soft-lock). `network-defender`'da iyi oynayan oyuncu kaybediyor. `bot-hunter`'da süre dolunca oyuncunun işaretlemeleri yok sayılıyor. `lucky-wheel` "doğru anda durdur" diyor ama tamamen rastgele. `troll-slayer`'da kaybetme koşulu yok. `data-miner`'da `maxScore`'a hiç ulaşılamıyor.
4. **Portföy tekrarlı ve sığ.** 21 oyunun 5'i aynı "sahteyi bul" mekaniği, 4'ü "merkeze gelen hedefe dokun", 2'si "düşeni yakala". Ortak bir oyun motoru (fixed-step döngü, duraklatma, DPR, giriş soyutlaması, ses ayarı) yok; her oyun kendi rAF döngüsünü, kendi zamanlayıcısını ve kendi hatalarını taşıyor. Admin override'ları (eşik, maxScore, başlık) oyun bileşenlerine hiç ulaşmıyor.

Sonuç olarak sistem "çok sayıda oyun" hedefine ulaşmış ama **"güvenilir, adil ve tekrar oynanabilir bir casual portföy"** hedefinin uzağında. Önerilen yön: önce ekonomiyi kapatmak (tavan + sunucu tarafı puanlama), ardından portföyü 21 oyundan **10–12 güçlü oyuna** indirip ortak bir motorun üzerine yeniden kurmak ve pratik/sıralı mod ayrımını getirmek.

---

## 2. Mevcut durum haritası

### 2.1 Katmanlar

| Katman | Dosya | Rol |
|---|---|---|
| Kayıt defteri | `lib/minigame-config.ts:71-355` | 20 oyunun `maxScore/rewardThreshold/rewardPoints/rewardXp/minDurationSec` değerleri. Pacman ayrı sabit (`:6-18`). |
| Admin override | `lib/minigame-config-effective.ts:412-430`, `prisma MiniGameConfig` | Registry + DB birleşimi, `unstable_cache` 60 sn. |
| İstemci yaşam döngüsü | `lib/use-mini-game.ts` | `start()` → `/start`, `finish(score, won)` → `/complete`, toast'lar. |
| Ortak kabuk | `components/customer/games/game-shell.tsx` | idle / playing / result / locked ekranları; turnuva ve liderlik gömülü. |
| Efekt / ses | `fx-layer.tsx`, `lib/game-sounds.ts` | Canvas parçacık katmanı; Web Audio sentez sesleri; `navigator.vibrate`. |
| Metin kişiliği | `lib/minigame-copy.ts` | Oyun başına CTA, kazanma/kaybetme başlık varyantları. |
| API | `app/api/customer/games/[game]/{start,complete,leaderboard}`, `status`, `streak`, `achievements`, `pacman/{start,complete}`, `app/api/customer/tournament` | |
| Admin | `app/admin/games/page.tsx`, `app/api/admin/games/route.ts` | Aç/kapa, ödül/eşik/görsel override, 30 günlük istatistik. |
| Sayfalar | `app/customer/games/<oyun>/page.tsx` × 21 + `page.tsx` (hub) | Her biri aynı CUSTOMER gate + başlık + bileşen. |

### 2.2 Veri akışı (bugünkü)

```
[Oyna] → useMiniGame.start() → POST /api/customer/games/:g/start
          └─ MiniGameSession(active) oluştur / mevcut aktif oturumu döndür
[oynanış tamamen istemcide] → skor & won istemcide hesaplanır (registry DEF ile)
[bitiş] → POST /complete {sessionId, score, durationSec, won}
          └─ clamp(score, maxScore) + minDuration + won → sabit ödül
          └─ tx: session → completed|failed, creditPointsAndXp, points_credited, streak claim
          └─ notification, başarım farkı (2× tam oturum taraması)
Liderlik / turnuva: MiniGameSession.starsCollected üzerinde groupBy (cache yok)
```

### 2.3 Oyun envanteri ve hızlı değerlendirme

| # | Oyun | Mekanik ailesi | Giriş | Durum / ana sorun | Karar |
|---|---|---|---|---|---|
| 1 | pacman (Yıldız Avı) | Arcade labirent | Klavye + swipe | Ayrı kod yolu; liderlik, turnuva, seri ve admin desteği yok | **Yeniden inşa** (ortak motora taşı) |
| 2 | mind-thief | Dokun-sınıflandır + 3B boss | Dokunma | Görsel olarak güçlü; state updater içinde yan etki var | **Koru + cila** |
| 3 | truth-vs-fake | Kaydır-sınıflandır | Drag + buton | Çift tıklamayla aynı kart iki kez puanlanıyor; içerik havuzu 6+6 | **Amiral oyun olarak yeniden inşa** (sunucu puanlı içerik) |
| 4 | bot-hunter | Sahteyi bul | Dokunma | Süre dolunca işaretlemeler yok sayılıyor; botlar emoji/isimden belli | **Birleştir** (Sahte Avcısı) |
| 5 | review-detective | Sahteyi bul | Dokunma | Açıklamadaki "ipucu" mekaniği yok; sahte metinler karikatür | **Birleştir** |
| 6 | word-spot | Farklı olanı bul | Dokunma | "Hızlanan turlar" yok (sabit 5,5 sn); 10 kelime çifti | **Birleştir** |
| 7 | spam-defense | Merkeze gelen hedef | Pointer | Her karede `setState` (60 render/sn) | **Birleştir** (Savunma) |
| 8 | troll-slayer | Merkeze gelen hedef | Pointer | **Kaybetme koşulu yok**; hareket kare hızına bağlı | **Birleştir** |
| 9 | network-defender | Yayılmayı durdur | Dokunma | **İyi oynayan kaybeder** (enfeksiyon bir kez tohumlanıyor) | **Yeniden inşa** |
| 10 | combo-tap | Beliren hedefe dokun | Dokunma | mind-thief'in sade kopyası | **Kaldır** |
| 11 | guardian-of-trust | Düşeni yakala | Pointer | frost-catcher ile aynı aile | **frost-catcher ile birleştir** |
| 12 | frost-catcher | Düşeni yakala | Pointer | En iyi yazılmış canvas oyunu (DPR, dt, reduced mode) | **Koru** (aile şablonu) |
| 13 | data-miner | Kutu aç (şans) | Dokunma | Bilgi yok, saf şans; `maxScore 20` ulaşılamaz (maks. 12) | **Kaldır** veya gerçek Mayın Tarlası olarak yeniden inşa |
| 14 | lucky-wheel | Çark (şans) | Buton | "Doğru anda durdur" yok, saf RNG; `/api/gamification/spin` ile çakışıyor | **Kaldır** |
| 15 | memory-match | Hafıza | Dokunma | Sabit 8 emoji, kolay, seviye yok | **Yeniden inşa** (seviyeli) ya da kaldır |
| 16 | speed-order | Schulte tablosu | Dokunma | **Tek hatadan sonra tur kilitleniyor** | **Düzelt** ya da kaldır |
| 17 | data-snake | Snake klonu | Klavye + swipe + D-pad | Sağlam; açıklamadaki "bot duvarları" yok | **Koru + seviye** |
| 18 | review-stack | Tetris klonu | Klavye + mobil buton | ≥640 px dokunmatik cihazda kontrol yok (iPad) | **Koru + giriş düzeltmesi** |
| 19 | trust-merge | 2048 klonu | Klavye + swipe | Süresiz; skor birimi (karo) diğerlerinden farklı → başarım bozuluyor | **Koru** |
| 20 | signal-pipe | Boru bulmacası | Dokunma | Süre ve hamle sınırı yok, zorluk artmıyor → garanti ödül | **Koru + seviye/süre** |
| 21 | spam-breaker | Breakout klonu | Pointer + touch | Alt-adımlı fizik, iyi | **Koru** |

> Not: 11, 12, 17, 18, 19 ve 21 numaralı oyunlarda mekanik derinliği yalnızca kod okumasıyla değerlendirildi; oynanış hissi (zorluk eğrisi, kontrol hassasiyeti) **doğrulanmadı**.

---

## 3. Bulgular (önem sırasıyla)

### KRİTİK

#### K1. Sunucu ödülü tamamen istemcinin bildirdiği skora ve `won` bayrağına dayanıyor

- **Kanıt:**
  - `app/api/customer/games/[game]/complete/route.ts:15-22`: gövde yalnızca `{sessionId, score, durationSec, won}`.
  - `:61`: `clampedScore = min(game.maxScore, score)`.
  - `:81-87`: tek kontrol `won && !tooFast`.
  - `lib/use-mini-game.ts:95`: istemci skoru ve `won` değerini doğrudan gönderiyor.
  - Pacman'de de aynı durum: `app/api/customer/games/pacman/complete/route.ts:12-18`.
- **Sorun:** Tarayıcı konsolundan `POST /start` → `minDurationSec` kadar bekle (8–12 sn) → `POST /complete {score: maxScore, won: true}` dizisiyle 21 oyunun hepsinde ödül alınabiliyor. İstekler paralel gönderilirse bu ~12 saniye sürüyor. Liderlik tablosu ve turnuva da aynı `starsCollected` değerinden beslendiği için hileciler tabloların tepesini `maxScore` ile dolduruyor. Kimseye görünmeyen bir yerde rakam şişmiyor; bu doğrudan ödül mağazasına akıyor (`Reward.type: physical|coupon`, `prisma/schema.prisma:680-690`).
- **Öneri (katmanlı):**
  1. **Sunucu puanlamalı oyunlar (sınıflandırma ailesi: truth-vs-fake, review-detective, bot-hunter, word-spot, mind-thief içerikleri).** `start` cevabı, etiketsiz içerik paketi döndürür (`items: [{id, text}]`). Doğru etiketler yalnızca sunucuda tutulur (Redis'te `session:{id}:answers`, TTL 10 dk). İstemci `complete` isteğinde `answers: [{id, verdict, tMs}]` gönderir. Skoru **sunucu hesaplar**. Bu ailede hile böylece kökten kapanır.
  2. **Deterministik bulmacalar (memory-match, speed-order, signal-pipe, trust-merge, data-snake, review-stack).** `start` bir `seed` ve HMAC imzalı `sessionToken` döndürür. Oyun seed'li PRNG ile (ör. mulberry32) üretilir. `complete` isteği sıkıştırılmış bir **girdi kaydı** taşır (`[tMs, action]`). Sunucu saf oyun mantığını (paylaşılan `lib/games/<oyun>/sim.ts`) tekrar oynatıp skoru yeniden hesaplar. Bunun için oyun mantığının React'tan ayrılması gerekir (bkz. Bölüm 4).
  3. **Gerçek zamanlı aksiyon oyunları (spam-breaker, frost-catcher, spam-defense…).** Tam replay maliyetliyse **makullük kontrolleri** uygulanır: saniye başına skor üst sınırı (`score / durationSec ≤ k`), periyodik "checkpoint" ping'leri (her 5 sn'de bir skor + nonce; sunucu monoton artışı ve zamanlamayı denetler), oyun başına skor dağılımında z-skoru > 3 olanların `needsReview` olarak işaretlenmesi.
  4. Hepsi için: ödül eşiği **istemcinin `won` bayrağına değil**, sunucunun hesapladığı ya da doğruladığı skora bağlanır. `won` yalnızca kozmetik olur.
- **Efor:** XL (aileye göre: sınıflandırma M, deterministik L, aksiyon M).

#### K2. Oyun puanı tavansız; çekirdek davranışın (geri bildirim) 6,5 katı faucet

- **Kanıt:** Registry ödülleri toplam 3.100 puan, pacman ile 3.250 puan/gün (`lib/minigame-config.ts:82-352`, `:13`). `lib/points-caps.ts:12-13` yalnızca `category: 'feedback'` için 500/gün ve 2.000/hafta tavan uyguluyor. Oyun `complete` route'u bir tavan uygulamıyor (`complete/route.ts:153-171`); yorumda "caps görsün diye" yazılmış ama `capFeedbackPoints` çağrısı yok. Admin ekonomi simülatörü (`app/api/admin/economy-sim/route.ts`) oyunları ve turnuvaları hiç hesaba katmıyor.
- **Ek etki:** `lib/points-velocity.ts:8` eşiği 24 saatte 500 puan. Dürüstçe 4 oyun kazanan bir kullanıcı (4×150) genel liderlikte `needsReview` olarak işaretleniyor (`app/api/leaderboard/route.ts:131-137`). Yani sistem aynı anda hem hileye açık hem de dürüst oyuncuyu şüpheli gösteriyor.
- **Öneri:**
  - `lib/points-caps.ts`'e `capGamePoints(userId, points, tx)` eklenmeli (ör. günlük 450, haftalık 2.000 ve azalan getiri: günün 1. ödüllü oyunu %100, 2.–3. %60, 4.+ yalnız XP). Bu `complete` transaction'ı içinde çağrılmalı.
  - Velocity eşiği kategori bazlı olmalı. `getSuspiciousUserIds` oyun kategorisini ayrı eşikle değerlendirmeli ya da hariç tutmalı.
  - `economy-sim`'e "günlük aktif oyuncu × ortalama ödüllü oyun" ve "turnuva havuzu" girdileri eklenmeli.
  - Puan/XP ayrışması netleşmeli: oyunlar ağırlıklı olarak **XP + kozmetik** (rozet, avatar çerçevesi) vermeli, mağazaya çevrilebilir puanı ise sınırlı vermeli.
- **Efor:** M.

#### K3. "Günde 1 hak" iki yönden bozuk: yenileyince sınırsız deneme, kaybedince bozuk tekrar

- **Kanıt:**
  - `app/api/customer/games/[game]/start/route.ts:56-73`: mevcut oturum `completed` değilse ("yarım kalan aktif oturum") aynı `sessionId` tekrar veriliyor. `failed` durumu da bu dala düşüyor.
  - `complete/route.ts:73-78` yalnızca `completed` için 409 dönüyor. `:97-108` ise `updateMany where status:'active'` kullanıyor, bu yüzden `failed` oturum `count === 0` döner ve 409 "Oyun zaten tamamlandı" ile sonuçlanır.
  - Hub yalnızca `status:'completed'` olanları "Bitti" gösteriyor (`app/api/customer/games/status/route.ts:32-34`), dolayısıyla kaybedilen oyun hub'da tekrar "Oyna" olarak görünüyor.
- **Senaryo A (istismar):** Oyuncu kötü giden bir oyunda bitişten önce sayfayı yeniler. Oturum hâlâ `active` olduğu için yeni bir deneme alır. Bu kazanana kadar sınırsız tekrar demek. Turnuva ve liderlik açısından da "en iyi skor" sınırsız denemeyle kovalanabiliyor.
- **Senaryo B (UX hatası):** Oyuncu kaybeder ve ertesi ziyarette hub'da oyunu yine "Oyna" olarak görür. Oyunu sonuna kadar oynar, sonunda kırmızı "Oyun zaten tamamlandı" toast'ı alır ve skoru kaydedilmez.
- **Öneri:** Ürün kararı netleştirilmeli: **"Pratik modu (sınırsız, ödülsüz) + Sıralı deneme (günde N, ödüllü)"**.
  - Sıralı deneme `start` anında **harcanmalı** (`attemptsUsed` sayacı, `MiniGameAttempt` tablosu ya da session'a `attemptNo`). Yarım kalan deneme "kayıp" sayılmalı (TTL: `startedAt + roundMs + tolerans` sonrası cron ile ya da bir sonraki `start`'ta `failed`'a çekilir).
  - `failed` oturum için `start` cevabı `alreadyPlayed: true` olmalı. Hub `playedToday` listesi `status IN (completed, failed)` ile beslenmeli, kazanıldı/kaybedildi rozetleri ayrı gösterilmeli.
  - Pratik modu `start`'a hiç gitmez ya da `mode:'practice'` ile oturum açar. Liderlik ve turnuvaya ise yalnızca sıralı denemeler girer.
- **Efor:** M.

#### K4. Turnuva: rakipsiz ödül, eşitlik belirsizliği, 20 paralel ödül havuzu

- **Kanıt:**
  - `app/api/customer/tournament/route.ts:28-39`: sıralama `orderBy _max.starsCollected desc`. Eşitlik için ikincil sıralama yok.
  - `:143-153`: POST, sıralamayı yeniden hesaplıyor; ödül tekilliği yalnızca `(userId, gameType, weekKey)` üzerinden (`prisma/schema.prisma:1088`). **Aynı sıraya** iki kullanıcının ödül alması engellenmiyor.
  - Minimum katılımcı kontrolü yok: haftada tek oyuncunun oynadığı bir oyunda o oyuncu 500 puan alıyor.
  - `lib/tournament-core.ts:13`: 1./2./3. için 500/300/150. 20 oyunun her biri için ayrı turnuva var, toplam haftalık 19.000 puan havuzu.
- **Sorun:** Skorlar `maxScore` ile kırpıldığı için tepede eşitlik kaçınılmaz (ör. bot-hunter `maxScore: 10`). PostgreSQL eşit değerlerde sıra garantisi vermez. İki kullanıcının ayrı isteklerde kendini 1. görüp ikisinin de 500 alması **olası (doğrulanmadı — veri bağımlı)**. K1 ile birleşince turnuvalar hileciler arasında paylaşılan bir havuza dönüşüyor.
- **Öneri:**
  - Turnuvayı **oyun başına değil, haftalık tek "Öne Çıkan Oyun"** üzerinden yürütmek (rotasyonlu). Havuz tek, görünürlük yüksek, ekonomi kontrol edilebilir olur.
  - Sıralama anahtarı `(bestScore desc, achievedAt asc)` olmalı. Hafta kapanınca sıralama **bir kez** `TournamentResult` tablosuna dondurulmalı (cron). Claim bu dondurulmuş sonuçtan yapılmalı; kalıcı sonuç tablosu `@@unique([gameType, weekKey, rank])` ile korunmalı.
  - `minParticipants` (ör. 10) altında ödül havuzu küçültülmeli ya da XP/kozmetiğe çevrilmeli.
  - Ödül claim'i yalnız "geçen hafta" ile sınırlı (`:80-97`), oyuncu o hafta oyun sayfasını açmazsa ödül kayboluyor. Dondurulmuş sonuçtan otomatik kredi ve bildirim üretilmeli.
- **Efor:** M.

### YÜKSEK

#### Y1. Admin override'ları oyunlara ulaşmıyor; registry ile sunucu birbirinden kopuyor

- **Kanıt:** 20 oyunun 20'si eşik ve tavan için `const DEF = getMiniGame('<oyun>')!` (registry) kullanıyor. Örnekler: `mind-thief-game.tsx:24,233,271`, `trust-merge-game.tsx:180-202`. `game.config` (sunucunun `start` cevabında gönderdiği effective config, `lib/use-mini-game.ts:70`) **hiçbir oyunda okunmuyor**. Başlık, emoji ve açıklama da `DEF`'ten geliyor (`GameShell title={DEF.title}`). Sayfa başlıkları ise her `page.tsx` içinde ayrıca sabit yazılmış (ör. `app/customer/games/mind-thief/page.tsx:17-19`).
- **Sorun:**
  - Admin eşiği yükseltirse istemci "Kazandın" der ama sunucu ödül vermez.
  - Admin eşiği düşürürse istemci yeni eşiği bilmediği için `won:false` gönderir ve ödül yine verilmez (sunucu `won && …` şartı arıyor).
  - `maxScore` artırılırsa oyun registry tavanında kendini bitirir.
  - Görsel override'lar yalnızca hub kartında görünür.
  - `app/api/admin/games/route.ts:181-191`: yalnız `rewardThreshold` gönderilince DB'deki mevcut `maxScore` override'ı yerine registry `maxScore`'u ile kıyaslanıyor. Bu, eşiğin effective maksimumu aşmasına izin verebiliyor.
- **Öneri:**
  - `useMiniGame` effective config'i (başlık, eşik, max, süre, ödül) tek kaynak olarak sunmalı. Oyun bileşenleri `DEF` yerine `game.def` kullanmalı.
  - Sayfa başlıkları `generateMetadata` + `getEffectiveMiniGame` ile üretilmeli. 21 `page.tsx` tek bir dinamik `app/customer/games/[game]/page.tsx` + `GAME_COMPONENTS` haritası (`next/dynamic`) ile değiştirilmeli.
  - Eşik bilgisi sunucuda kalmalı; K1 uygulanınca `won` zaten kozmetik olur.
  - Admin PATCH doğrulaması "mevcut override ∪ yeni alanlar ∪ registry" üzerinden effective değerle yapılmalı.
- **Efor:** M.

#### Y2. Bozuk / çelişkili oynanış: 6 oyunda doğrulanmış mantık hatası

| Oyun | Kanıt | Hata | Önerilen düzeltme |
|---|---|---|---|
| speed-order | `speed-order-game.tsx:121` doğru dokunuşta hücre listeden siliniyor; `:153` yanlışta `nextRef = 1` | 1 numaralı hücre silindiği için yanlış bir dokunuştan sonra tur **asla tamamlanamaz** (soft-lock), süre bitene kadar kilitli kalır. | Hata cezası "sıra başa döner" yerine "−2 sn + titreşim" olmalı. Ya da silinen hücreler geri yüklenmeli. |
| network-defender | `network-defender-game.tsx:112` enfeksiyon yalnız bir kez tohumlanıyor; `:128-137` yayılım yalnız mevcut enfekte düğümden | Oyuncu ilk kırmızı düğümü hemen temizlerse enfeksiyon biter, skor 1'de kalır, eşik 8'e ulaşılamaz. **İyi oynayan kaybeder.** | Dalga sistemi: her N saniyede yeni tohum ve tohum sayısı zamanla artar. Skor "kurtarılan düğüm × süre" olmalı. |
| bot-hunter | `bot-hunter-game.tsx:170-179` zamanlayıcı efekti `[scanKey, playing]` bağımlılığıyla `resolveRound`'u eski kapanışla yakalıyor | Süre dolunca değerlendirme, oyuncunun **işaretlemelerinden önceki** `profiles` ile yapılıyor; her zaman "Bot kaçtı" sonucu ve can kaybı. Yalnız "Tara & Onayla" butonu doğru çalışıyor. | `profilesRef` kullanılmalı ya da zamanlayıcı `resolveRoundRef.current()` çağırmalı. |
| truth-vs-fake | `truth-vs-fake-game.tsx:124-186`, butonlar `:362,:371` uçuş sırasında devre dışı değil; kart 240 ms sonra değişiyor (`:182-185`) | Hızlı çift dokunuşla aynı kart iki kez puanlanıyor ve desteden iki kart düşüyor. | `judgingRef` kilidi eklenmeli; butonlar `disabled={!!flyOut}` olmalı. |
| troll-slayer | `troll-slayer-game.tsx` içinde can veya çekirdek hasarı yok; troller merkeze yürüyüp duruyor (`:230-236`) | Kaybetme koşulu yok, risk yok. Açıklamadaki "hayatta kal" vaadi karşılanmıyor. | Merkezde HP'li çekirdek olmalı; trol temasında hasar alması gerekir. |
| data-miner | `data-miner-game.tsx:28-31,36`: 6×1 + 2×3 = en fazla 12 puan; registry `maxScore: 20` (`lib/minigame-config.ts:150`) | Tavana ulaşılamıyor. Oyun bilgi vermeyen saf şans; eşik 10/12 tamamen kumar. | Kaldırılmalı ya da sayı ipuçlu gerçek Mayın Tarlası olarak yeniden yazılmalı. |

- **Efor:** S–M (oyun başına S; network-defender ve troll-slayer için M).

#### Y3. Açıklama ile mekanik arasında tutarsızlık (güven kaybı)

- `lucky-wheel`: "Çarkı doğru anda durdur!" (`lib/minigame-config.ts:245`, `lib/minigame-copy.ts:156`). Kodda durdurma yok; `spin()` rastgele hız veriyor (`lucky-wheel-game.tsx:79`) ve sürtünmeyle duruyor. Saf RNG. Ayrıca sistemde ayrı bir günlük çark var (`app/api/gamification/spin/route.ts`).
- `review-detective`: "Süre daraldıkça ipuçları azalır" (`lib/minigame-config.ts:119`). İpucu mekaniği yok (`review-detective-game.tsx` içinde tek "ipucu" geçişi `:190`'daki hata metni).
- `word-spot`: "hızlanan turlarda" (`lib/minigame-config.ts:259`). Tur süresi sabit `ROUND_TIME_MS = 5500` (`word-spot-game.tsx:16`) ve ızgara hep 3×3.
- `data-snake`: "Bot duvarlarından… kaç" (`lib/minigame-config.ts:273`). Engel ya da duvar nesnesi yok (`data-snake-game.tsx` içinde wall/obstacle yok; yalnız kenar ve kuyruk çarpışması **doğrulanmadı**).
- Hub: "Her hafta yeni mini oyunlar ekleniyor!" (`games-hub.tsx:238-243`). Kodda böyle bir süreç yok.
- **Öneri:** Açıklamalar mekaniği birebir anlatmalı. Şans tabanlı oyunlar ya kaldırılmalı ya da açıkça "şans" diye etiketlenip **çevrilebilir puan vermemeli**. Puanların ödüle dönüştüğü bir sistemde saf şans oyunu hem ürün güvenilirliği hem de **şans oyunu mevzuatı** açısından risklidir (hukuki değerlendirme önerilir, doğrulanmadı).
- **Efor:** S.

#### Y4. Ortak oyun motoru yok: döngü, zaman, duraklatma, DPR ve giriş her oyunda ayrı yazılmış

- **Kanıt:**
  - **Kare hızına bağlı hareket:** `troll-slayer-game.tsx:234-235` (dt yok), `lucky-wheel-game.tsx` `angle += vel` (dt yok). Birçok oyunda parçacık güncellemesi de dt'siz (`spam-defense-game.tsx:235`, `guardian-of-trust-game.tsx:172`). 120 Hz ekranda bu oyunlar 2 kat hızlı oynanıyor.
  - **DPR:** yalnız `frost-catcher-game.tsx:160-163` ve `fx-layer` / `boss-3d` DPR uyguluyor. Diğer 8 canvas oyunu Retina ekranda bulanık.
  - **Duraklatma / görünürlük:** hiçbir oyunda `visibilitychange` yok (grep: 0 sonuç). Sekme değişince `setInterval`/`setTimeout` tabanlı oyunlar (mind-thief, network-defender, combo-tap) arka planda can kaybettiriyor ya da süre bitiyor.
  - **Her karede React state:** `spam-defense-game.tsx:200,323` (`setShieldPct`, `setTimeLeft` her rAF'te), `guardian-of-trust-game.tsx:235`, `troll-slayer-game.tsx:293`. Düşük donanımlı telefonda saniyede 60 React render'ı demek.
  - **State updater içinde yan etki** (`reactStrictMode: true`, `next.config.*:258`): `memory-match-game.tsx:87-117` (skor artırımı, ses, `setTimeout`), `speed-order-game.tsx` tur tamamlama bloğu, `mind-thief-game.tsx:185-191` (`loseLife` updater içinde). Geliştirmede çift sayım ya da çift can kaybı yaşanıyor ve React'in saflık sözleşmesi ihlal ediliyor.
  - **Giriş:** review-stack mobil kontrolleri `sm:hidden` (`review-stack-game.tsx:385`) ve swipe desteği yok, dolayısıyla ≥640 px dokunmatik cihazda (iPad) oynanamaz. data-snake ve trust-merge D-pad'leri de `sm:hidden` ama swipe desteği var. Basılı tutunca tekrarlama (auto-repeat) hiçbir yerde yok.
- **Öneri:** `lib/games/engine/` altında küçük bir motor kurulmalı:
  - `useGameLoop({ update(dtFixed), render(alpha) })`: sabit adım (1/60) ile birikim döngüsü; `visibilitychange` ve `blur` ile otomatik duraklatma; duraklatma menüsü (`GameShell` içinde "Devam / Yeniden başlat (pratik) / Çık").
  - `createCanvas(W, H)`: DPR ölçekleme, `ResizeObserver`, pointer → mantıksal koordinat dönüşümü.
  - `useInput()`: klavye, swipe, pointer ve sanal D-pad için tek soyutlama. Sanal kontroller `pointer: coarse` medya sorgusuyla gösterilmeli, genişliğe göre değil. Basılı tutma tekrarı eklenmeli.
  - `useHudStore` (zustand ya da ref + 10 Hz throttle): HUD güncellemeleri kareden ayrılmalı.
  - `rng(seed)`: K1'deki replay doğrulamasının ön koşulu.
- **Efor:** L.

#### Y5. Pacman ayrı bir ada: ortak kabuk, liderlik, turnuva, seri, başarım ve admin dışında

- **Kanıt:** `components/customer/pacman-game.tsx` (709 satır) `GameShell` kullanmıyor. `pacman/complete` streak, başarım ve bildirim akışının yalnız bir kısmını içeriyor (`app/api/customer/games/pacman/complete/route.ts:71-99`; streak claim ve başarım farkı yok). Turnuva `getEffectiveMiniGame` pacman için `null` döndüğünden pacman'i desteklemiyor (`tournament/route.ts:50-53`). Hub'da kart sabit kodlu (`games-hub.tsx:25-32`), admin panelinde yok.
- **Ek hata:** `pacman/complete` oturumun `gameType`'ını doğrulamıyor (`route.ts:45-49`: yalnız `userId`). Başka bir oyunun aktif oturum ID'si pacman kuralıyla (5 sn min süre, 150 puan) kapatılabiliyor. Etkisi sınırlı (o oyunun günlük hakkı harcanıyor) ama tutarsız.
- **Öneri:** Pacman registry'ye `gameType: 'pacman'` satırı olarak taşınmalı (skor = yıldız). Özel route'lar silinmeli, generic route kullanılmalı. Bileşen ortak motor ve `GameShell` üzerine alınmalı.
- **Efor:** M.

#### Y6. Liderlik, turnuva ve başarım sorguları ölçeklenmiyor; cache yok

- **Kanıt:**
  - `[game]/leaderboard/route.ts:47-53`: tüm zamanlar `groupBy` (oyun başına tüm `completed` oturumlar).
  - `tournament/route.ts:62,83`: her GET'te 2 haftalık `groupBy`.
  - `GameShell` liderliği idle ekranında ve sonuç ekranında ayrı ayrı mount ediyor (`game-shell.tsx:210-216, 299-303`), dolayısıyla her oyun açılışında 3 ağır sorgu çalışıyor.
  - `complete/route.ts:90-94` ve `:199` `computeAchievementStats`'ı **iki kez** çağırıyor. Bu fonksiyon kullanıcının **tüm** oturum geçmişini çekiyor (`lib/game-achievement-stats.ts:17-20`).
  - Proje Upstash Redis cache kullanıyor ama bu uçlar cache'lenmemiş.
- **Öneri:**
  - Liderlik için Redis **sorted set**: `ZADD lb:{game}:all GT score userId` ve `lb:{game}:{weekKey}`. `complete` anında güncellenir; okuma `ZREVRANGE` + `ZREVRANK` ile O(log n). DB gerçek kaynak olarak kalır, saatlik uzlaştırma cron'u çalışır.
  - Başarım istatistikleri için kullanıcı başına `UserGameStats` sayaç satırı (`totalWins`, `totalPlays`, `distinctGames`, `longestStreak`) tutulmalı ve `complete` tx'inde artırılmalı. Böylece tüm geçmiş taraması kalkar.
- **Efor:** M.

### ORTA

#### O1. Başarım metrikleri farklı skor birimlerini karıştırıyor

- **Kanıt:** `lib/game-achievement-stats.ts:26`: `bestScore = max(starsCollected)` tüm oyunlarda. `trust-merge` skoru karo değeri (`maxScore: 2048`, `lib/minigame-config.ts:304`). Tek bir 64 karosu "Skor Avcısı 40+" başarımını açıyor (`lib/game-achievements.ts:34`). bot-hunter (`max 10`) ile bu başarım hiç açılamıyor.
- `explorer-5`: "5 farklı oyun **oyna**" diyor ama `distinctGames` yalnız `completed` (kazanılmış) oturumları sayıyor (`game-achievement-stats.ts:25`).
- **Öneri:** Skor normalize edilmeli (`normalized = score / effectiveMax`, 0–100) ya da başarımlar oyun bazlı tanımlanmalı ("Kar Ustası: frost-catcher'da 40+"). Ödüllü başarımlar kozmetik kazanımlarla (çerçeve, unvan) eşlenmeli.
- **Efor:** S.

#### O2. İçerik havuzları çok küçük → tekrar oynanabilirlik düşük ve eğitici değer zayıf

- **Kanıt:**
  - truth-vs-fake 6 sahte + 6 gerçek (`truth-vs-fake-game.tsx:26-41`).
  - review-detective 10 gerçek + 6 sahte (`review-detective-game.tsx:25-44`).
  - mind-thief 8 + 8.
  - word-spot 10 kelime çifti (`word-spot-game.tsx:19-30`).
  - bot-hunter'da botlar `🤖` avatar ve `promo_bot_5` gibi isimlerle ilk bakışta belli (`bot-hunter-game.tsx:27-30`).
  - Sahte metinler "MÜKEMMEL!!! EN İYİSİ!!!" gibi karikatürler, ilk oyunda ezberleniyor.
- **Öneri:** Qratex'in asıl varlığı gerçek yorum verisi. Anonimleştirilmiş ve onaylı yorumlardan + AI ile üretilmiş "zor sahte" örneklerden **zorluk etiketli bir içerik havuzu** (`GameContentItem {id, text, label, difficulty, locale, source}`) kurulmalı. İçerik `start` cevabıyla sunucudan gelmeli (K1 ile aynı akış, hile koruması da sağlar). Zorluk oyuncunun geçmiş doğruluk oranına göre ayarlanmalı (Elo benzeri `skillRating`). Bu, oyunlara **ürüne bağlı anlam** kazandırır: "sahte yorumu tanıma" becerisi gerçekten öğretilir.
- **Efor:** L.

#### O3. Ses ve haptik ayarı "animasyonları azalt" tercihine bağlanmış

- **Kanıt:** `lib/game-sounds.ts:10-13`: `muted()` = `reduce-animations` sınıfı. Bağımsız ses kapatma, ses seviyesi ya da titreşim anahtarı yok. iOS Safari `navigator.vibrate` desteklemiyor (haptik sessizce boşa düşer, sorun değil ama tasarımda ses/görsel geri bildirim tek başına yeterli olmalı).
- **Öneri:** `GameShell` başlığına kalıcı (`localStorage` + kullanıcı ayarı) 🔊/🔇 ve titreşim anahtarı konmalı. `AudioContext` için master `GainNode` eklenmeli. Müzik katmanı isteğe bağlı olmalı. "Animasyonları azalt" yalnız görsel efektleri kapatmalı.
- **Efor:** S.

#### O4. Zorluk eğrisi ve ödül eşikleri dengesiz

- **Kanıt:** signal-pipe süresiz ve hamle sınırsız, 5×5 sabit (`signal-pipe-game.tsx`: zamanlayıcı yok; `:233` yalnız "çevirme" sayacı). Sabırlı her oyuncu 160 puanı garanti alıyor. trust-merge'de süre yok, "Bitir & Ödülü Al" butonu var. memory-match 8 çift için 28 hamle hakkı tanıyor. Buna karşılık data-miner ve lucky-wheel saf şansa dayanıyor. Ödüller 120–170 puan arasında, zorluktan bağımsız.
- **Öneri:** Her oyun için **telemetriye dayalı hedef kazanma oranı** (ör. sıralı denemede %35–50) tanımlanmalı. Admin panelinde oyun başına kazanma oranı, medyan skor ve süre dağılımı gösterilmeli. Ödül sabit değil kademeli olmalı (bronz/gümüş/altın yıldız: 1/2/3 eşik). Bulmacalara seviye ilerlemesi eklenmeli (signal-pipe 4×4 → 7×7, kilitli hücreler, hamle hedefi).
- **Efor:** M.

#### O5. Admin paneli yanlış ve eksik ölçüyor

- **Kanıt:** `app/api/admin/games/route.ts:35-39` "Bugün" sayısı yalnız `status:'completed'` olanları sayıyor; kaybedilen oyunlar görünmüyor. Kazanma oranı, terk oranı, skor dağılımı, şüpheli oturum (min süreye yakın + `maxScore`) ve turnuva yönetimi yok. Oyunlarda ürün analitiği (PostHog `game_start/game_end/abandon`) yok; `components/customer/games` içinde capture çağrısı bulunamadı.
- **Öneri:** `/admin/games/[gameType]` detay sayfası açılmalı: huni (sayfa → başla → bitir → ödül), kazanma oranı, skor histogramı, ortalama süre, şüpheli oturum listesi, turnuva sonuçları. `useMiniGame` içine PostHog event'leri eklenmeli.
- **Efor:** M.

#### O6. Gün sınırı UTC: Türkiye'de sıfırlama 03:00'te

- **Kanıt:** `start/route.ts:10-12`, `status/route.ts:10-12`, `streak/route.ts`, `complete/route.ts:118` `toISOString().slice(0,10)`. Kabuk metni "Her gün 00:00 (UTC) sıfırlanır" diyor (`game-shell.tsx:323`).
- **Sorun:** Kullanıcı açısından gece 00:00–03:00 arası "dün" sayılıyor. Seri gece yarısından sonra oynayan için kırılabiliyor. Ayrıca `dayKey` üretimi 5 farklı yerde kopyalanmış.
- **Öneri:** `lib/timezone` altında tek bir `gameDayKey(now, 'Europe/Istanbul')` fonksiyonu olmalı ve tüm uçlar onu kullanmalı. UI geri sayımı "Yeni hak: 3 sa 12 dk" şeklinde gösterilmeli.
- **Efor:** S.

#### O7. Erişilebilirlik ve i18n sıfır

- **Kanıt:** `components/customer/games/*.tsx` içinde `aria-label`/`role` kullanımı 0. Canvas oyunlarının metinsel alternatifi yok. Tüm oyun metinleri Türkçe sabit kodlu; `messages/en.json` mevcut ama oyunlar çevrilmiyor. Renk tek ayırt edici (kırmızı/yeşil kartlar, `mind-thief-game.tsx:303-324`); renk körlüğü modu yok.
- **Öneri:** Butonlara `aria-label` ve canlı bölge (`aria-live="polite"`) ile skor/can duyurusu eklenmeli. Renk + ikon + desen birlikte kullanılmalı. Oyun metinleri `minigame-copy` → `messages/*` taşınmalı.
- **Efor:** M.

### DÜŞÜK

- **D1.** `complete` route `game.enabled` kontrol etmiyor (`complete/route.ts:35-41`). Admin kapatmadan önce açılmış oturumlar kapanabilir. Pacman route'larında da enabled kavramı yok.
- **D2.** `start` route'unda eşzamanlı iki istek `create` yarışında P2002 → 500 dönebilir (`start/route.ts:76-79`). Bunun yerine `upsert` ya da P2002 yakalanıp mevcut oturumu döndürmek gerekir.
- **D3.** `loadOverrides` DB hatasında `{}` döndürüp 60 sn cache'liyor (`minigame-config-effective.ts:79-82`). Kesinti anında admin'in kapattığı oyunlar 60 sn boyunca tekrar açılıyor. Hata durumu cache'lenmemeli.
- **D4.** Hub, status yanıtı gelene kadar registry listesini (kapalı oyunlar dahil) gösteriyor (`games-hub.tsx:75-81`). Status hata verirse kapalı oyunlar kalıcı görünüyor. Bunun yerine sunucu bileşeninde effective liste ile SSR yapılmalı.
- **D5.** `truth-vs-fake` yalnız bu dosyada tam `motion` import ediyor (`truth-vs-fake-game.tsx:4`). Drag için gerekli ama global `LazyMotion` (`components/providers.tsx:241`, domAnimation) stratejisinin dışında kalıyor. `domMax`'ı yalnız bu sayfada `LazyMotion` ile yüklemek daha tutarlı olur.
- **D6.** `mind-thief` kartlarında `style.transform: translate(-50%,-50%) translateZ(..)` ile framer `animate={{scale, y}}` birlikte kullanılıyor (`mind-thief-game.tsx:426-434`). Framer inline transform'u kendi değerleriyle yazdığından merkezleme ve derinlik kayabilir (proje hafızasındaki "framer inline transform ezer" tuzağı). **Görsel olarak doğrulanmadı.**
- **D7.** `memory-match`: son hamle bir eşleşmeyse `MAX_MOVES` kontrolü yapılmıyor (`memory-match-game.tsx:87-104`); oyun bir sonraki hatalı hamleye kadar sürüyor.

---

## 4. Hedef mimari ve tasarım önerisi

### 4.1 İlkeler

1. **Sunucu otoritesi:** ödül ve sıralama sunucunun hesapladığı ya da doğruladığı skordan türetilir. İstemci yalnız girdi ve kanıt sunar.
2. **İki mod:** *Pratik* (sınırsız, ödülsüz, anında yeniden başlat) ve *Sıralı* (günde N deneme, ödüllü, liderlik ve turnuvaya girer). Tekrar oynanabilirlik pratikten, ekonomi sıralıdan gelir.
3. **Az ama derin portföy:** 10–12 oyun, her biri seviye/zorluk ilerlemesi ve haftalık değişen bir modifikatörle.
4. **Ürüne bağlı anlam:** oyunlar Qratex'in değer önerisini (güvenilir yorum, sahte tespiti, mekân keşfi) pekiştirmeli.

### 4.2 Bileşen ve veri akışı

```
lib/games/
  registry.ts            ← GameDefinition (tip, mod, skor birimi, doğrulama stratejisi, ödül kademeleri)
  engine/
    loop.ts              ← sabit adımlı döngü, pause/visibility
    canvas.ts            ← DPR + ResizeObserver + koordinat dönüşümü
    input.ts             ← keyboard/swipe/pointer/virtual-dpad (pointer:coarse)
    rng.ts               ← seed'li PRNG
    audio.ts             ← master gain, mute/volume tercihi, haptik anahtarı
  <oyun>/
    sim.ts               ← SAF oyun mantığı (React'sız) — istemci + sunucu ortak
    view.tsx             ← çizim + giriş bağlama
  verify/
    server-scored.ts     ← sınıflandırma oyunları: etiketler sunucuda
    replay.ts            ← deterministik oyunlar: seed + input log → sim → skor
    plausibility.ts      ← aksiyon oyunları: skor/sn sınırı + checkpoint
components/games/
  GameShell.tsx          ← mod seçimi, pause menüsü, ses/haptik anahtarı, öğretici overlay, sonuç + paylaşım kartı
  HUD.tsx                ← throttled store'dan beslenir
app/customer/games/[game]/page.tsx  ← tek dinamik sayfa, generateMetadata(effective)
```

**API sözleşmesi (sıralı mod):**

- `POST /api/games/:g/attempts` → `{attemptId, seed, token(HMAC: userId|g|attemptId|seed|exp), content?(etiketsiz), config(effective)}`. Deneme bu anda **harcanır**.
- `POST /api/games/:g/attempts/:id/checkpoint` (aksiyon oyunları, isteğe bağlı) → `{tMs, score, nonce}`.
- `POST /api/games/:g/attempts/:id/complete` → `{token, inputLog | answers | checkpoints, clientScore}` → sunucu `verifiedScore` hesaplar, `|clientScore − verifiedScore|` farkını loglar (hile sinyali), ödülü `capGamePoints` ile kredi eder, Redis liderliğini günceller.
- `GET /api/games/:g/leaderboard?scope=all|week|friends` → Redis ZSET.
- `GET /api/games/featured` → haftanın öne çıkan oyunu + turnuva durumu.

**Veri modeli eklemeleri:**

- `MiniGameAttempt` (mevcut `MiniGameSession`'ın evrimi): `mode`, `attemptNo`, `seed`, `verifiedScore`, `clientScore`, `verification`, `flags`.
- `UserGameStats` (sayaçlar).
- `GameContentItem` (içerik havuzu).
- `TournamentResult` (dondurulmuş sıralama, `@@unique([gameType, weekKey, rank])`).

### 4.3 Hedef portföy (10–12 oyun)

| Rol | Oyun | Kaynak |
|---|---|---|
| **Amiral (ürünle bağlantılı)** | **Sahte Avcısı**: truth-vs-fake + review-detective + bot-hunter + word-spot tek oyunda 4 mod (Kaydır, Dosya, Profil, Kelime); sunucu puanlı, Elo zorluk | Birleştir + yeniden inşa |
| Aksiyon | **Zihin Hırsızı** (3B boss, öfke modu) | Koru + cila |
| Aksiyon | **Çekirdek Savunması**: spam-defense + troll-slayer; çekirdek HP, dalgalar, yükseltmeler | Birleştir |
| Aksiyon | **Kar Tanesi Yakala** (+ guardian'ın "iyi/kötü" ayrımı modifikatör olarak) | Birleştir |
| Arcade klasik | Yıldız Avı (pacman), Veri Yılanı, Yorum İstifi, Spam Kırıcı | Motora taşı + seviyeler |
| Bulmaca | Güven Birleştir (2048), **Sinyal Bağla** (seviyeli + süreli) | Koru + seviye |
| Bulmaca (yeni) | **Günün Kelimesi**: Wordle tarzı Türkçe, herkese aynı bulmaca, paylaşılabilir sonuç kartı; tamamen sunucu doğrulamalı | Yeni |
| Casual (yeni) | **Eşleştir-3**: casual tutundurmanın en güçlü türü; Qratex rozet ikonlarıyla; seviye haritası | Yeni |
| Sosyal (yeni) | **Mekân Bilgi Yarışması**: dealer'ın sponsorlu soruları, kategoriye göre, async düello ("arkadaşının skorunu geç") | Yeni |
| Kaldır | lucky-wheel (şans + günlük çarkla çakışma), data-miner (saf şans), combo-tap (mind-thief kopyası), memory-match (seviyeli değilse), speed-order (düzeltilmezse) | — |
| Yeniden inşa | network-defender → "Salgın Durdur" (dalga tabanlı, düğüm karantina stratejisi) ya da kaldır | — |

**Meta katman:** tek bir "Oyun Pasosu" (sezonluk XP yolu, kozmetik ödüller), oyunlar arası günlük görevler ("2 farklı oyunda 1 yıldız al"), arkadaş/squad liderliği (mevcut `/customer/squads` ile entegre), paylaşılabilir sonuç kartı (OG image).

---

## 5. Adım adım geçiş planı

### Faz 0: Kanamayı durdur (1 sprint, yüksek öncelik)

1. `capGamePoints` (günlük/haftalık tavan + azalan getiri), `complete` ve `pacman/complete` tx'ine eklenir. Velocity eşiği kategori bazlı yapılır. (K2, S–M)
2. `start`: `failed` durumu `alreadyPlayed` sayılır. Hub `completed|failed` gösterir. Yarım kalan deneme "harcanmış" kabul edilir (bir sonraki `start`'ta `active` + süre aşımı → `failed`). (K3, S)
3. Turnuva: `minParticipants`, `(score desc, completedAt asc)` sıralaması, geçici olarak tek "öne çıkan oyun" turnuvası. Diğer 19 turnuvanın ödülü XP'ye çevrilir. (K4, S–M)
4. `pacman/complete` → `gameType` kontrolü. `complete` → `enabled` kontrolü. `start` → P2002 yakalama. (Y5-ek, D1, D2, S)
5. Bozuk oyun düzeltmeleri: speed-order soft-lock, bot-hunter eski kapanış, truth-vs-fake çift puan, network-defender yeniden tohumlama, troll-slayer çekirdek HP. lucky-wheel ve data-miner admin'den **pasife** alınır. (Y2, Y3, S–M)
6. Yanıltıcı açıklamalar düzeltilir. "Her hafta yeni oyun" kaldırılır. (Y3, S)

### Faz 1: Tek kaynak ve gözlemlenebilirlik (1 sprint)

7. `useMiniGame` effective config'i bileşenlere verir. `DEF` kullanımı kaldırılır. Tek dinamik `[game]/page.tsx`. Admin PATCH doğrulaması düzeltilir. (Y1, M)
8. PostHog oyun event'leri + admin oyun detay sayfası (kazanma oranı, histogram, şüpheli oturumlar). Ekonomi simülatörüne oyun ve turnuva eklenir. (O5, K2, M)
9. Liderlik ve turnuva için Redis ZSET. `UserGameStats` sayaçları. Başarım normalizasyonu. (Y6, O1, M)
10. `gameDayKey('Europe/Istanbul')` tekilleştirilir. (O6, S)

### Faz 2: Ortak motor ve sunucu otoritesi (2–3 sprint)

11. `lib/games/engine` (loop/canvas/input/rng/audio) + `GameShell` v2 (pause, mod seçimi, ses/haptik anahtarı, öğretici). (Y4, O3, L)
12. Sınıflandırma ailesi: `GameContentItem` havuzu + sunucu puanlı `attempts` API'si. Sahte Avcısı birleşik oyunu çıkar. Eski 4 oyun yönlendirilir. (K1, O2, L)
13. Deterministik oyunlar için `sim.ts` ayrıştırma + replay doğrulama (önce memory/speed-order/signal-pipe/trust-merge, sonra snake/stack). (K1, L)
14. Aksiyon oyunları için checkpoint + makullük doğrulaması. (K1, M)
15. Pratik modu tüm oyunlarda açılır. (K3, S; motor sonrası)

### Faz 3: Portföy yenileme ve meta (2+ sprint)

16. Birleştirmeler: Çekirdek Savunması, Kar Tanesi + Muhafız. Pacman motora taşınır. combo-tap, lucky-wheel ve data-miner kaldırılır (rotalar hub'a 308 yönlendirme). (L)
17. Yeni oyunlar: Günün Kelimesi → Eşleştir-3 → Mekân Bilgi Yarışması (dealer sponsorluğu ile gelir kanalı). (XL)
18. Oyun Pasosu, çapraz oyun günlük görevleri, squad liderliği, paylaşım kartı. (L)
19. Erişilebilirlik ve i18n geçişi (aria, renk-körü modu, `messages/*`). (O7, M)

**Başarı ölçütleri:** sıralı denemede oyun başına %35–50 kazanma oranı; D7 oyun geri dönüşü; oyun kaynaklı puanın toplam puan üretimindeki payı < %25; `|clientScore − verifiedScore| > 0` oranı (hile sinyali) izlenip < %1; liderlik uçlarında p95 < 100 ms.
