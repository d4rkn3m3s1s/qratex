# /customer/games/review-stack

**Amaç:** Müşterinin günde bir kez oynadığı, Tetris benzeri "Yorum İstifi" mini oyunu. Düşen tetromino bloklarını dizip satır temizleyerek skor toplar; skor eşiği (16) geçilirse sunucu 170 puan + 85 XP verir. Haftalık turnuva ve tüm zamanlar liderlik tablosu da bu sayfada gösterilir.

**Genel puan: 5,5 / 10** · **Karar: koru-iyileştir**

Oynanış çekirdeği (ghost parça, lock delay, wall kick, n² puanlama, ses ve haptik) sağlam ve keyifli. Sorunlar oyunun etrafındaki sistemde: "günde 1 hak" kuralı iki yönden bozuk, skor tamamen istemcinin beyanına dayanıyor, admin ayarları istemci tarafında yok sayılıyor, ayrıca mobil, tablet ve erişilebilirlik desteği zayıf. Bunlar sayfaya özgü değil, ortak altyapıdan (`useMiniGame`, `GameShell`, generic start/complete API) geliyor. O yüzden düzeltmenin kaldıracı 21 oyunun tamamını etkiliyor.

İncelenen dosyalar:
- `app/customer/games/review-stack/page.tsx`
- `components/customer/games/review-stack-game.tsx`
- `components/customer/games/game-shell.tsx`
- `components/customer/games/game-leaderboard.tsx`
- `components/customer/games/game-tournament.tsx`
- `lib/use-mini-game.ts`
- `lib/minigame-config.ts`
- `lib/minigame-config-effective.ts`
- `lib/minigame-copy.ts`
- `lib/game-sounds.ts`
- `lib/admin-toast.ts`
- `lib/tournament-core.ts`
- `lib/points-caps.ts`
- `app/api/customer/games/[game]/start/route.ts`
- `app/api/customer/games/[game]/complete/route.ts`
- `app/api/customer/games/[game]/leaderboard/route.ts`
- `app/api/customer/games/status/route.ts`
- `app/api/customer/tournament/route.ts`
- `prisma/schema.prisma` (MiniGameSession, satır 493-513)
- `components/dashboard/page-heading.tsx`
- `components/providers.tsx`
- `app/layout.tsx`

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Oynanış tam çalışıyor. Buna karşılık günlük hak kuralı bozuk, admin override'ı yok sayılıyor ve skor doğrulaması yok. |
| UX | 5/10 | Sonuç ekranı çıkmaz sokak (CTA yok). "Bugün oynadın" bilgisi ancak butona basınca geliyor. Duraklatma, sonraki parça ve kişisel rekor yok. |
| Görsel | 6/10 | Neon canvas estetiği tutarlı. Ancak canvas 198×352 px'te sabit kalıyor, masaüstünde küçük ve retina ekranda bulanık; "yorum" teması bloklara hiç yansımıyor. |
| Mimari | 5/10 | Ortak hook ve kabuk iyi bir soyutlama. Fakat sunucu config'i dönüyor ve istemci kullanmıyor; `game` nesnesi her render'da yeni oluşup tüm callback zincirini yeniden yaratıyor. |
| Performans | 7/10 | Tek canvas ve rAF hafif. Her blokta her karede `shadowBlur` düşük uçta pahalı. Her tamamlamada başarım istatistikleri iki kez hesaplanıyor. |
| Erişilebilirlik + Mobil | 4/10 | Dokunmatik kontroller `sm:hidden` olduğu için tablette oyun oynanamıyor. Butonlarda aria-label yok, canvas'ın metin alternatifi yok, işletim sisteminin hareket azaltma ayarı JS efektlerinde dikkate alınmıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum ve rol koruması | KISMİ | `app/customer/games/review-stack/page.tsx:10-13` | CUSTOMER dışındaki giriş yapmış kullanıcı (ör. işletme) "giriş yap" sayfasına atılıyor. Bu yanıltıcı; kendi paneline yönlendirilmeli. |
| 2 | Masaüstü sayfa başlığı + açıklama | ÇALIŞIYOR | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Mobilde `hidden sm:flex` ile gizli. Başlık ve açıklama GameShell idle ekranında bir kez daha tekrarlanıyor. |
| 3 | Metadata başlığı | ÇALIŞIYOR | `page.tsx:7` | "QRateX" yazımı, marka yazımıyla tutarlı mı doğrulanmadı. |
| 4 | Segment loading/error sınırları | ÇALIŞIYOR | `app/customer/loading.tsx`, `app/customer/error.tsx` (dosyalar mevcut) | Oyuna özel bir iskelet yok. |
| 5 | Idle tanıtım ekranı (emoji animasyonu, başlık, açıklama, ipucu) | KISMİ | `game-shell.tsx:165-188`, `review-stack-game.tsx:349-360` | Başlık, emoji, açıklama ve accent statik `DEF`'ten geliyor. Admin'in `MiniGameConfig` override'ı (`minigame-config-effective.ts:52-55`) bu sayfada görünmüyor. |
| 6 | "🧱 İstifle" başlat CTA | ÇALIŞIYOR | `game-shell.tsx:201-207`, `use-mini-game.ts:54-79` | `primeAudio()` ile ses bağlamı ilk etkileşimde açılıyor. |
| 7 | Günde 1 hak kuralı | BOZUK | `start/route.ts:56-73`, `complete/route.ts:73-78, 98-108` | Kayıptan sonra oturum `failed` oluyor. Start bunu "yarım oturum" sayıp yeniden oynatıyor, complete ise 409 dönüyor. Yarıda bırakıp sayfayı yenileyen kullanıcı da sınırsız deneme hakkı kazanıyor (Bulgu 1 ve 2). |
| 8 | "Bugünün oyununu oynadın" kilit ekranı | KISMİ | `game-shell.tsx:73, 307-332`, `use-mini-game.ts:64-67` | Kilit ancak "İstifle"ye basınca öğreniliyor; sayfa yüklenirken durum sorgulanmıyor. `failed` oturumlarda kilit hiç gösterilmiyor. |
| 9 | Admin'in oyunu pasifleştirmesi | KISMİ | `start/route.ts:34-39` | Sayfa yine tam render ediliyor. Kullanıcı ancak butona basınca "Bu oyun şu anda kullanılamıyor" toast'ını görüyor. |
| 10 | Haftalık turnuva paneli | KISMİ | `game-tournament.tsx:108-181`, `tournament/route.ts:28-39` | `text-muted-foreground`, `bg-primary/10` ve renksiz satırlar koyu neon kabuk içinde. Açık temada okunamaz olma riski var (görsel doğrulanmadı). Eşit skorlarda sıra belirsiz (Bulgu 6). |
| 11 | Turnuva geri sayımı | ÇALIŞIYOR | `game-tournament.tsx:77-82, 116-119` | Dakika çözünürlüğünde. |
| 12 | Geçen haftanın ödülünü talep etme | ÇALIŞIYOR | `game-tournament.tsx:84-97`, `tournament/route.ts:128-193` | Atomik tek seferlik talep doğru kurulmuş. Ancak toast `@/lib/admin-toast` üzerinden gidiyor ve müşteriye "Basarili: 🏆 …" (ş ve ı eksik, admin tonu) gösteriliyor (`admin-toast.ts:16-17`). |
| 13 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx:30-61`, `leaderboard/route.ts:47-80` | Ağ veya 500 hatası sessizce yutuluyor ve "Henüz skor yok — ilk rekoru sen kır!" görünüyor; yanıltıcı boş durum. Yalnız kazanılmış (`completed`) oturumlar sayılıyor, ilk 100 dışındaki kullanıcının sırası `null`. |
| 14 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | |
| 15 | HUD: canlı skor | ÇALIŞIYOR | `review-stack-game.tsx:363-365` | |
| 16 | HUD: "Hedef" | KISMİ | `review-stack-game.tsx:366` | Statik `DEF.rewardThreshold` kullanılıyor; sunucudaki etkin eşik (`use-mini-game.ts:70`, `config`) yok sayılıyor. |
| 17 | HUD: temizlenen satır sayacı | ÇALIŞIYOR | `review-stack-game.tsx:367-369` | |
| 18 | Canvas oyun alanı (9×16) | KISMİ | `review-stack-game.tsx:12-16, 376-382` | 198×352 px'te sabit. `devicePixelRatio` ölçeklemesi yok, retina ekranda bulanık. `max-w-full` yalnız küçültüyor, masaüstünde büyütmüyor. |
| 19 | Parça üretimi | KISMİ | `review-stack-game.tsx:90-101` | Saf `Math.random`. 7'li torba (7-bag) olmadığı için aynı parça art arda gelebiliyor ya da I parçası uzun süre hiç gelmeyebiliyor. |
| 20 | Yerçekimi (620 ms sabit) | ÇALIŞIYOR | `review-stack-game.tsx:17, 329-335` | Hız artışı ya da seviye yok (bkz. #53). |
| 21 | Lock delay (bir tur tolerans) | ÇALIŞIYOR | `review-stack-game.tsx:182-197` | |
| 22 | Sola/sağa hareket | ÇALIŞIYOR | `review-stack-game.tsx:153-164` | |
| 23 | Döndürme + wall kick | KISMİ | `review-stack-game.tsx:41-49, 211-225` | Pivot her zaman ilk hücre. O kare her döndürmede bir sütun sola kayıyor (matematik aşağıda). T parçası çıkıntı üzerinden dönüyor. Ters yönde döndürme yok. |
| 24 | Soft drop | ÇALIŞIYOR | `review-stack-game.tsx:167-178` | Yere değince lock delay olmadan hemen kilitliyor; bu kasıtlı. |
| 25 | Hard drop | ÇALIŞIYOR | `review-stack-game.tsx:199-209` | `lastDropRef.current = 0` yüzünden yeni parça bir sonraki karede anında bir kademe iniyor (küçük yan etki). |
| 26 | Ghost (gölge) parça | ÇALIŞIYOR | `review-stack-game.tsx:306-315` | |
| 27 | Satır temizleme + n² puan (1/4/9/16) | ÇALIŞIYOR | `review-stack-game.tsx:113-148` | |
| 28 | Satır temizleme flaşı | ÇALIŞIYOR | `review-stack-game.tsx:317-326` | Kare başına `t -= 0.12` olduğu için 120 Hz ekranda iki kat hızlı sönüyor. |
| 29 | Ekran sarsıntısı (WAAPI) | KISMİ | `review-stack-game.tsx:19-21, 132-140` | Yalnız uygulama içindeki `reduce-animations` sınıfına bakıyor; OS `prefers-reduced-motion` dikkate alınmıyor. |
| 30 | Ses efektleri | KISMİ | `review-stack-game.tsx:9, 110, 125-130`, `game-sounds.ts:10-13` | Sesi kapatmanın tek yolu "animasyonları azalt" tercihi. Ayrı bir ses düğmesi yok. |
| 31 | Haptik geri bildirim | ÇALIŞIYOR | `review-stack-game.tsx:111, 127, 130`, `game-sounds.ts:158` | iOS Safari Vibration API'yi desteklemiyor (platform kısıtı). |
| 32 | Oyun sonu (tepeye ulaşma) | KISMİ | `review-stack-game.tsx:95-98, 107-109` | Kilitlenen parçanın tahta üstünde (`r < 0`) kalan hücreleri sessizce siliniyor; oyun bitmiyor (lock-out kontrolü yok). |
| 33 | maxScore'a ulaşınca otomatik zafer | ÇALIŞIYOR | `review-stack-game.tsx:145-148` | Statik `DEF.maxScore` kullanılıyor. |
| 34 | Klavye kontrolleri (oklar, WASD, boşluk) | KISMİ | `review-stack-game.tsx:228-241` | `window` seviyesinde dinleniyor ve odak başka bir input'tayken bile ok ve boşluk tuşlarını yutuyor. Caps Lock açıkken WASD çalışmıyor. WASD ipucu metninde yok. |
| 35 | Mobil yön butonları (◀ ↻ ▼ ▶) | KISMİ | `review-stack-game.tsx:385-389, 405-416` | `sm:hidden` yüzünden 640 px üstü dokunmatik cihazda (iPad) kontrol yok. Basılı tutunca tekrarlamıyor, swipe jesti yok, `aria-label` yok, `touch-manipulation` yok. |
| 36 | "⏬ Sert Düşür" butonu | ÇALIŞIYOR | `review-stack-game.tsx:390-397` | |
| 37 | Kontrol ipucu metni | KISMİ | `review-stack-game.tsx:399` | Mobilde de klavye ipucu (⌨️) gösteriliyor, 10 px ve %40 opaklıkta (düşük kontrast). |
| 38 | Sonucu sunucuya gönderme | ÇALIŞIYOR | `use-mini-game.ts:82-135` | |
| 39 | Sunucuda ödül doğrulaması | KISMİ | `complete/route.ts:15-22, 61, 80-87` | Yalnız üst sınır ve minimum süre kontrol ediliyor. Skor ve `won` tamamen istemci beyanı (Bulgu 3). |
| 40 | Sonuç ekranı (🏆/💀, başlık varyantı, skor) | ÇALIŞIYOR | `game-shell.tsx:222-272`, `minigame-copy.ts:178-185` | "Dizilen" etiketi aslında satır puanını gösteriyor; anlam kayıyor. |
| 41 | Konfeti (ödül kazanınca) | ÇALIŞIYOR | `game-shell.tsx:19-31, 86-94` | |
| 42 | Ödül kaçırma notu | KISMİ | `game-shell.tsx:289-294` | Eşik statik `DEF`'ten geliyor. |
| 43 | Toast'lar (ödül, seri, başarım) | ÇALIŞIYOR | `use-mini-game.ts:112-125` | Sonuç kartıyla aynı bilgiyi tekrarlıyor (gürültü). |
| 44 | Günlük seri bonus XP'si | ÇALIŞIYOR | `complete/route.ts:117-150` | Atomik `gameStreakClaim` ile korunuyor. |
| 45 | Yeni başarım tespiti | ÇALIŞIYOR | `complete/route.ts:90-94, 196-215` | `computeAchievementStats` her tamamlamada iki kez çalışıyor (önce ve sonra). |
| 46 | Uygulama içi bildirim kaydı | ÇALIŞIYOR | `complete/route.ts:185-194` | Transaction dışında; başarısız olursa 500 dönüyor ama ödül yine de verilmiş oluyor (Bulgu 9). |
| 47 | Sonuç ekranında liderlik | ÇALIŞIYOR | `game-shell.tsx:299-303` | Yeniden mount olduğu için taze veri çekiyor. |
| 48 | Duraklat / devam et | EKSİK | — | Arka plana geçince rAF duruyor ama açık bir duraklatma, onay ya da geri sayım yok. |
| 49 | Sonraki parça önizlemesi | EKSİK | — | Tür standardı. |
| 50 | Hold (parça sakla) | EKSİK | — | |
| 51 | Sonuç sonrası CTA (Oyun Merkezi'ne dön, sıradaki oyun, paylaş) | EKSİK | `game-shell.tsx:222-305` | Sonuç ekranında hiç buton yok; çıkmaz sokak. |
| 52 | Kişisel rekor / geçmiş | EKSİK | — | Yalnız liderlikte "me" satırı var. |
| 53 | Zorluk ilerlemesi (seviye ve hızlanma) | EKSİK | `review-stack-game.tsx:17` | |
| 54 | Ekran okuyucu desteği (canvas açıklaması, canlı skor duyurusu) | EKSİK | `review-stack-game.tsx:376-382` | Canvas'ta `role`, `aria-label` ya da `aria-live` yok. |

**Durum özeti:** 28 ÇALIŞIYOR · 18 KISMİ · 1 BOZUK · 0 SAHTE · 7 EKSİK (toplam 54)

---

## Bulgular

### 1. KRİTİK · Veri bütünlüğü / UX · Kaybedilen oyun yeniden oynatılıyor ama sonucu asla kaydedilmiyor

- **Kanıt:**
  - `complete/route.ts:101`: kayıpta `status: won ? 'completed' : 'failed'` yazılıyor.
  - `start/route.ts:57`: yalnız `existing.status === 'completed'` kilitliyor. `failed` oturum aşağıdaki "yarım kalan aktif oturum" dalına düşüyor (`:69-73`) ve aynı `sessionId` ile `canPlay: true` dönüyor.
  - `complete/route.ts:73`: `failed`, `completed`'a eşit olmadığı için bu kontrol geçiliyor.
  - `complete/route.ts:98-108`: `updateMany({ where: { status: 'active' } })` 0 satır güncelliyor ve route 409 "Oyun zaten tamamlandı" dönüyor.
  - `status/route.ts:33`: hub yalnız `completed` oturumları "oynandı" sayıyor.
- **Sorun:** Kullanıcı kaybedip sonuç ekranında "Yarın tekrar dene" yazısını görüyor. Sayfayı yenileyince ya da hub'dan geri gelince oyun hâlâ "oynanmamış" görünüyor ve "İstifle" çalışıyor. Kullanıcı 2-3 dakika oynuyor, bitirdiğinde kırmızı "Oyun zaten tamamlandı" toast'ı alıyor ve skoru hiçbir yere yazılmıyor. Kurallar sistemin içinde birbirini çeliştiriyor ve bu güven kaybettiren bir deneyim.
- **Öneri:** Günlük hakkı tek kaynaktan, açık bir durum makinesiyle yönetin: `active → completed | failed | abandoned`. Start route `failed` durumunu da "bugün oynandı" saymalı (`status in ('completed','failed')`) ve `alreadyPlayed: true, lastResult` dönmeli. Hub `status/route.ts` aynı kümeyi kullanmalı. Bu kontrol bir `lib/minigame-day.ts` yardımcısına alınıp start, complete, status ve hub tarafından ortak kullanılmalı. Ürün kararı olarak kayıp sonrası ödülsüz "pratik modu" isteniyorsa ayrı bir uç ve ayrı bir UI ile açıkça sunulmalı (bkz. Yeniden tasarım).
- **Efor:** S

### 2. KRİTİK · Güvenlik (oyun ekonomisi) · Yenileyerek sınırsız deneme; "günde 1 hak" atlatılabiliyor

- **Kanıt:**
  - `start/route.ts:69-73`: `active` oturum tekrar başlatılabiliyor ve aynı `sessionId` dönüyor.
  - `use-mini-game.ts:69-72`: istemci her start'ta sıfır tahtayla yeni bir oyun açıyor.
  - Sayfa kapanırken ya da yenilenirken complete çağrılmıyor (beforeunload yok).
- **Sorun:** Oyun kötü giderken (ör. skor eşiğin altındayken tahta doluyorsa) sayfayı yenileyen kullanıcı oturumu `active` bırakıyor ve yeniden oynuyor. Eşiğe ulaşana kadar bu sonsuz tekrarlanabiliyor. Sunucu süresi ilk `startedAt`'ten ölçüldüğü için `minDurationSec` engeli de sonraki denemelerde fiilen ortadan kalkıyor.
- **Öneri:** Start'ta `active` oturum bulunursa yeniden kullanılmamalı. Oturum `abandoned` olarak işaretlenip `failed` gibi sayılmalı, ya da her start'ta `attempt` sayacı artırılıp 1'den büyük değerler reddedilmeli. Gerçek ağ kopmalarına karşı tolerans isteniyorsa kısa bir "yeniden bağlanma" penceresi (ör. 60 sn ve aynı tarayıcı nonce'u) tanımlanabilir. İstemcide `pagehide` olayında `navigator.sendBeacon` ile `abandon` bildirilmeli.
- **Efor:** S-M

### 3. YÜKSEK · Güvenlik (puan basma) · Skor ve "won" tamamen istemci beyanı; oyun puanlarında tavan yok

- **Kanıt:**
  - `complete/route.ts:15-22`: `score` ve `won` doğrudan body'den alınıyor.
  - `complete/route.ts:61`: yalnız üst sınıra sıkıştırma yapılıyor.
  - `complete/route.ts:82-87`: yalnız süre kontrolü var.
  - `lib/points-caps.ts:16-27`: günlük ve haftalık tavanlar yalnız `category: 'feedback'` için geçerli; oyun puanları (`category: 'game'`) tavana tabi değil.
  - `tournament/route.ts:28-39`: turnuva sıralaması da aynı beyan edilen skorla yapılıyor.
- **Sorun:** Oturum çerezine sahip herkes start isteği atıp 12 sn bekleyerek `{score:40, won:true, durationSec:13}` gönderebiliyor ve 170 puan alıyor. 21 oyunun hepsinde bu desen geçerli, yani günde birkaç bin puan oynamadan basılabiliyor. Üstüne her oyunun haftalık turnuvasında 40 tam skorla 500/300/150 puanlık ödüller ele geçirilebiliyor. Hafızadaki ekonomi kurallarıyla ("her puan basan yol…") doğrudan çelişiyor. `points_credited` olayı yazıldığı için durum görünür, ama tavan uygulanmıyor.
- **Öneri:**
  1. **Kısa vade (S):** `capGamePoints` ekleyin (`category:'game'` için günlük ve haftalık tavan, `points-caps.ts` desenini izleyerek) ve complete transaction'ı içinde uygulayın. Turnuva skorunu kazanılmış ödüle değil, eşiği aşan oturumlara ve `durationSec` uyumuna bağlayın.
  2. **Orta vade (M-L):** Deterministik tekrar oynatma (replay) doğrulaması. Start, sunucuda bir `seed` üretsin. Parça dizisi bu seed'den (7-bag PRNG) çıksın. İstemci complete'te kompakt bir girdi günlüğü göndersin (`[tick, action]`). Sunucu, aynı saf oyun motorunu (`lib/games/review-stack-engine.ts`, hem istemci hem sunucu kullanır) çalıştırıp skoru kendisi hesaplasın. Tetris benzeri ayrık bir oyun için bu hem ucuz hem kesin bir çözüm.
  3. Skorun girdi sayısına ve süreye oranı makul değilse velocity dedektörüne işaret gönderilsin.
- **Efor:** S (tavan) + L (replay)

### 4. YÜKSEK · Mimari / doğruluk · Admin'in oyun ayarları (eşik, maxScore, başlık, renk) istemcide yok sayılıyor

- **Kanıt:**
  - `use-mini-game.ts:70`: `config` sunucudan alınıp state'e yazılıyor.
  - `use-mini-game.ts:137`: döndürülüyor, ama `review-stack-game.tsx` hiç kullanmıyor. `:97`, `:145`, `:357`, `:366` ve `:399` satırları statik `DEF` kullanıyor.
  - `minigame-config-effective.ts:44-55`: override birleştirmesi burada yapılıyor.
  - `complete/route.ts:86`: `eligible = won && !tooFast`.
  - `components/customer/games/*-game.tsx` içinde `game.config` kullanan hiçbir oyun yok (grep boş döndü).
- **Sorun:**
  - Admin eşiği 16'dan 10'a indirirse istemci 10-15 skor için `won=false` gönderiyor ve sunucu ödülü reddediyor; indirim fiilen çalışmıyor.
  - Eşik yükseltilirse istemci 16'da 🏆 "kazandın" gösteriyor, sunucu 0 puan veriyor. Kullanıcı "Kazandın ama ödül eşiğini geçemedin" gibi çelişkili bir mesaj görüyor.
  - `maxScore` artırılırsa oyun yine 40'ta bitiyor.
  - Başlık, emoji ve renk override'ları bu sayfada görünmüyor; hub ise override'ı gösteriyor (`status/route.ts:40-48`). İki yerde iki farklı isim çıkıyor.
- **Öneri:**
  1. Sayfayı server component olarak etkin config'le besleyin: `page.tsx` içinde `getEffectiveMiniGame('review-stack')` çağrılsın, `enabled` false ise "şu an kapalı" durumu render edilsin, değilse `<ReviewStackGame def={effective} />` geçilsin.
  2. "Kazanma" kararı istemcide verilmesin. İstemci yalnız skoru göndersin, `won` sunucuda `score >= rewardThreshold` olarak hesaplansın.
  3. Bu değişiklik `GameShell`'e bir `def` prop'u olarak taşınırsa 21 oyun birden düzelir.
- **Efor:** M

### 5. YÜKSEK · Mobil / erişilebilirlik · Tablette (≥640 px dokunmatik) oyun oynanamıyor

- **Kanıt:** `review-stack-game.tsx:385`: `grid … sm:hidden`. Canvas'ta `touch-none` var (`:380`) ama hiçbir dokunma işleyicisi yok.
- **Sorun:** iPad veya Android tablette (768 px ve üstü) yön butonları gizleniyor, klavye de yok. Parça kendiliğinden düşüyor ama kullanıcı hiçbir şey yapamıyor ve oyun kaybediliyor; buna günlük hak da gidiyor (Bulgu 1 nedeniyle sonucu da kaydedilmiyor). Kontrollerin görünürlüğü ekran genişliğine değil, giriş yöntemine bağlı olmalı.
- **Öneri:**
  - Görünürlüğü `@media (pointer: coarse)` ya da `(hover: none)` sorgusuna bağlayın (Tailwind'de `[@media(pointer:coarse)]:grid`).
  - Canvas üzerine Pointer Events tabanlı bir jest katmanı ekleyin: yatay sürükleme hücre hücre hareket, dokunma döndürme, aşağı fırlatma sert düşürme, yavaş aşağı sürükleme soft drop.
  - Butonlara basılı tutunca otomatik tekrar (DAS/ARR: 170 ms gecikme, 50 ms tekrar) ekleyin.
  - Butonlara `touch-manipulation` verin (`app/globals.css:593` sınıfı mevcut); hızlı ardışık dokunuşlarda iOS çift dokunma zoom riski var (`app/layout.tsx:134-135`, userScalable açık; doğrulanmadı).
- **Efor:** M

### 6. ORTA · Doğruluk / ekonomi · Turnuvada eşit skorlarda sıra belirsiz; ilk 3 ödülü birden fazla kişiye gidebilir

- **Kanıt:**
  - `tournament/route.ts:29-35`: yalnız `orderBy: { _max: { starsCollected: 'desc' } }`, ikincil sıralama yok.
  - `:145-148`: ödül talebinde sıra yeniden hesaplanıyor.
  - Skor üst sınırı 40 (`minigame-config.ts:291`) olduğu için tavanda eşitlik kaçınılmaz.
- **Sorun:** Postgres eşit değerlerin sırasını garanti etmiyor. 3. ve 4. sıradaki iki kullanıcı (ikisi de 40) farklı anlarda talep ederse her biri kendini `idx < 3` görebilir. Bu durumda ilk 3 için 3'ten fazla ödül çıkabilir (doğrulanmadı ama sorgudan çıkarılabilir). Aynı belirsizlik liderlikte görsel "zıplama" da yaratıyor.
- **Öneri:** Deterministik eşitlik bozucu ekleyin: önce en yüksek skor, eşitlikte o skora ilk ulaşma zamanı (`min(completedAt)`, ham SQL ya da iki aşamalı sorguyla), en son `userId`. Daha sağlam çözüm: hafta kapanınca bir cron sıralamayı `TournamentResult` tablosuna dondursun, talep de oradan okusun.
- **Efor:** M

### 7. ORTA · UX · Sonuç ekranı çıkmaz sokak; "bugün oynandı" bilgisi geç geliyor

- **Kanıt:** `game-shell.tsx:222-305`: sonuç ekranında buton yok. `:73` ve `use-mini-game.ts:46-48`: kilit durumu yalnız start çağrısıyla öğreniliyor.
- **Sorun:** Oyun bitince kullanıcının tek seçeneği tarayıcının geri tuşu. Ödül anı (Duolingo ve Starbucks'ın en güçlü olduğu yer) bir sonraki aksiyona bağlanmıyor. Bugün oynamış kullanıcı yine parlayan "İstifle" CTA'sını görüyor, basınca kilidi öğreniyor; vaat edip sonra geri çekmek gibi.
- **Öneri:**
  - Sayfa server component'ında bugünün oturum durumunu çekip (`miniGameSession.findUnique` userId+gameType+dayKey) `initialState` olarak geçin. Kilit ekranı ilk boyamada gelsin ve sonraki sıfırlamaya kalan süreyi canlı geri sayımla göstersin ("03:00'te yenilenir"; UTC yerine kullanıcının yerel saati).
  - Sonuç ekranına birincil CTA olarak "Sıradaki oyun" ekleyin (hub'daki oynanmamış ilk oyun), ikincil olarak "Oyun Merkezi". Paylaşılabilir skor kartı da opsiyonel.
- **Efor:** S-M

### 8. ORTA · Oynanış · Döndürme pivotu hatalı: O parçası her döndürmede kayıyor, T asimetrik dönüyor

- **Kanıt:** `review-stack-game.tsx:41-49`: pivot `cells[0]`. O = `[[0,0],[1,0],[0,1],[1,1]]`, pivot (0,0) etrafında döndürülünce `(0,0),(0,1),(-1,0),(-1,1)` çıkıyor, yani bir sütun sola. T'nin ilk hücresi çıkıntı `[1,0]`.
- **Sorun:** Tür oyuncularının kas hafızasıyla çelişiyor. Kare dönerken sola yürüyor, T çıkıntı etrafında savruluyor. Duvar dibinde wall kick bunu bazen maskeliyor, bazen de beklenmedik konumlar üretiyor.
- **Öneri:** Saf bir oyun motoru modülüne (Bulgu 3'teki `review-stack-engine`) SRS'ye yakın bir döndürme sistemi koyun: parça başına 4 rotasyon durumu tablosu, O için döndürme no-op, I ve JLSTZ için standart kick tabloları. Saf motor birim testle doğrulanabilir.
- **Efor:** M

### 9. ORTA · Hata yönetimi · Ödül verildikten sonra başarısız olabilen adım 500 döndürüyor

- **Kanıt:** `complete/route.ts:185-194`: `notification.create` transaction dışında ve try/catch'siz. Herhangi bir hata `:230-237` catch'ine düşüp 500 dönüyor. Bu noktada puanlar `:154` ile zaten verilmiş durumda.
- **Sorun:** DB anlık hata verirse kullanıcı "Oyun tamamlanamadı" toast'ı ve ödülsüz sonuç görüyor (`use-mini-game.ts:126-128`), oysa puan hesabına geçmiş. Destek talebine dönüşen tipik bir "puanım gelmedi / geldi mi?" belirsizliği.
- **Öneri:** Bildirimi transaction içine taşıyın (turnuva route'u bunu zaten yapıyor, `tournament/route.ts:172-179`) ya da `after()` ile ve try/catch içinde çalıştırın. Başarılı ödül yanıtı yan etkilerden bağımsız olmalı.
- **Efor:** S

### 10. ORTA · Görsel / tema · Turnuva bileşeni koyu neon kabukta tema token'ları kullanıyor; dil ve ton karışık

- **Kanıt:**
  - `game-tournament.tsx:116, 143, 151, 159-166`: `text-muted-foreground`, `bg-primary/10`, renksiz satırlar.
  - `game-shell.tsx:97-104`: sabit koyu arka plan.
  - Uygulama açık temayı destekliyor (`components/providers.tsx:223-225`, `defaultTheme="system"`).
  - `game-tournament.tsx:6` ve `lib/admin-toast.ts:16-19`: "Basarili: " / "Dikkat: " ön ekleri.
- **Sorun:** Açık temada turnuva satırları koyu zemin üstünde koyu metin olarak okunamaz hale gelebilir (sınıflardan çıkarım, ekran görüntüsüyle doğrulanmadı). Müşteri toast'ında admin ön eki ve Türkçe karaktersiz "Basarili" görünüyor. API hata metinleri de karışık ("Unauthorized" İngilizce, `start/route.ts:44`, `use-mini-game.ts:62` üzerinden toast'a düşüyor).
- **Öneri:** GameShell içinde kullanılacak bir "oyun yüzeyi" token seti tanımlayın (`--game-fg`, `--game-muted`, `--game-surface`) ve turnuva ile liderliği bu token'larla yazın. Müşteri bileşenlerinde `sonner`'ı doğrudan kullanın. API hata mesajlarını Türkçe bir sözlüğe bağlayın.
- **Efor:** S

### 11. DÜŞÜK · Görsel / performans · Canvas DPR ölçeklemesi yok; her blok her karede shadowBlur

- **Kanıt:**
  - `review-stack-game.tsx:376-382`: `width={W} height={H}` (198×352), DPR yok.
  - `:285-296`: her blokta `shadowBlur = 8`.
  - `:329-338`: 60/120 fps boyunca sürekli çiziliyor.
  - `:324`: flaş kare başına sönüyor (fps'e bağımlı).
- **Sorun:** Retina telefonda bloklar bulanık. Masaüstünde oyun alanı ekranın küçük bir köşesinde kalıyor. Düşük uç Android'de tam tahtada (144 blok) shadowBlur kare süresini artırabilir (ölçülmedi).
- **Öneri:**
  - Kapsayıcı genişliğine göre `CELL` hesaplayın (`ResizeObserver`); canvas'ı `width = cssW * dpr` boyutunda kurup `ctx.scale(dpr, dpr)` uygulayın.
  - Yerleşmiş blokları değiştikçe offscreen canvas'a bir kez çizin, her karede yalnız aktif parçayı, ghost'u ve efektleri çizin.
  - Animasyonları `dt` (geçen süre) tabanlı yapın.
- **Efor:** M

### 12. DÜŞÜK · Erişilebilirlik · Glif butonlar, canvas ve hareket azaltma

- **Kanıt:**
  - `review-stack-game.tsx:386-389, 405-416`: "◀ ↻ ▼ ▶" etiketli butonlarda `aria-label` yok.
  - `:376`: canvas'ın metin alternatifi yok.
  - `:19-21` ve `game-shell.tsx:13-16`: yalnız uygulama sınıfı kontrol ediliyor; OS `prefers-reduced-motion` JS efektlerinde (WAAPI sarsıntı, konfeti) dikkate alınmıyor. Framer tarafı `MotionConfig reducedMotion="user"` ile korunuyor (`components/providers.tsx:232`).
  - `:399`: 10 px, `text-white/40` ipucu metni.
  - `page.tsx:18`: h1 içinde emoji ("tuğla" diye okunuyor).
- **Öneri:**
  - Butonlara "Sola kaydır / Döndür / Yumuşak düşür / Sağa kaydır" etiketleri verin.
  - Canvas'a `role="img"` ve dinamik `aria-label` ekleyin; skor ve satır temizleme için `aria-live="polite"` bölgesi koyun.
  - `reducedMotion()` yardımcısını `matchMedia('(prefers-reduced-motion: reduce)')` ile birleştiren ortak bir yardımcıya taşıyın.
  - İpucu metnini en az 12 px ve AA kontrastına çekin.
- **Efor:** S

### 13. DÜŞÜK · Mimari · `game` nesnesi her render'da yeni; callback zinciri ve klavye dinleyicisi sürekli yeniden kuruluyor

- **Kanıt:**
  - `use-mini-game.ts:137`: her render'da yeni nesne literali dönüyor.
  - `review-stack-game.tsx:71-81`: `endGame` bağımlılığı `[game]`.
  - Zincir: `spawn` → `lockAndClear` → `softDrop`/`hardDrop`.
  - `:228-241`: klavye effect'i her skor değişiminde söküp yeniden takılıyor.
  - `:345`: rAF döngüsü `eslint-disable` ile ilk render'ın closure'unu tutuyor.
- **Sorun:** Bugün ref'ler sayesinde davranışsal bir hata yok. Ancak döngü eski closure'ları, butonlar yeni closure'ları çağırıyor. İleride state'e bağımlı bir mantık eklenirse sessiz bir "stale closure" hatası doğacak.
- **Öneri:** Hook'tan `useMemo` ile kararlı nesne döndürün ya da `endGame` yalnız `game.finish`'e bağımlı olsun (zaten `useCallback`). Oyun mantığını saf motora taşıyınca React tarafı yalnız render ve girdi köprüsü olarak kalır.
- **Efor:** S

### 14. DÜŞÜK · Oynanış · Lock-out kontrolü yok; tahta üstünde kalan hücreler siliniyor

- **Kanıt:** `review-stack-game.tsx:107-109`: `if (c.r >= 0 && c.r < ROWS)` dışında kalan hücreler yok sayılıyor.
- **Sorun:** Kısmen tavanın üstünde kilitlenen bir parça yarım "kayboluyor" ve oyun devam ediyor. Kural tutarsızlığı oluşuyor.
- **Öneri:** Kilitlenen hücrelerden herhangi biri `r < 0` ise oyunu bitirin (standart lock-out).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Ödülsüz pratik modu ve kayıptan sonra "tekrar dene":** Duolingo'nun "pratik" mantığı. Günlük ödül hakkı bittikten sonra oyun puansız oynanabilmeli. Bugün kayıp sonrası tek seçenek "yarın gel". Bu hem etkileşim süresini öldürüyor hem de Bulgu 1'deki kafa karışıklığını doğuruyor.
2. **Sonraki parça önizlemesi + hold + duraklat:** Tür standardı (Tetris benzeri her oyun). Olmadan oyun şansa dayalı hissettiriyor ve skor becerinin göstergesi olmaktan çıkıyor.
3. **Kişisel rekor, geçmiş ve gelişim:** Spotify Wrapped ve Revolut mantığı. "Bu hafta en iyin 22, geçen haftadan +6" gibi bir kişisel grafik ya da rozet, ödül kadar güçlü bir geri dönüş motivasyonu yaratıyor.
4. **Sonuç anını bir sonraki aksiyona bağlama:** Starbucks ve Duolingo'da her kazanım ekranının bir "sonraki adım"ı var: sıradaki oyun, seri hedefi, puanla alınabilecek ödül önerisi ("Bu puanla X kafede kahve alabilirsin"). Burada sonuç ekranı boşa çıkıyor.
5. **Arkadaş / squad liderliği ve paylaşılabilir skor kartı:** Uygulamada `squads` modülü var (`app/customer/squads`), ama oyun liderliği yalnız global. Arkadaş içi sıralama, kalabalık global tablodan çok daha motive edici.
6. **"Yorum" temasının oynanışa yansıması:** Ürün kimliğiyle bağ. Bloklar jenerik tetromino; "Yorum İstifi" adı dışında QR ve geri bildirim ürünüyle bağ yok. Örneğin satır temizlenince "onaylandı ✓" damgası veya bloklarda yıldız ikonları kullanılabilir; ya da kullanıcının son yorum yaptığı işletmelerin renkleri bloklara verilebilir. Ölçülü bir dokunuş yeterli.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "30 saniyede içeri, 3 dakika akış, 5 saniyede kutlama ve sonraki adım." Kullanıcı sayfaya geldiği an bugünkü durumunu biliyor: oynanabilir mi, oynandıysa skoru ne, sıfırlanmaya ne kadar kaldı. Oyun alanı ekranın asıl kahramanı. Sonuç anı ödülü somut bir sonraki aksiyona bağlıyor.

**Yerleşim:**

- **Mobil (birincil):**
  1. Üstte ince bir durum şeridi: bugünün hakkı, seri 🔥, hedef ilerleme çubuğu (skor/eşik).
  2. Ortada tam genişlikte, DPR uyumlu canvas. Sağ üstte küçük "Sıradaki" ve "Hold" önizlemeleri.
  3. Altta başparmak bölgesinde jest ve butonları birlikte sunan bir kontrol çubuğu: basılı tutunca tekrar, `pointer: coarse` olan her cihazda görünür.
  4. Turnuva ve liderlik oyun sırasında gizli. Lobide ise iki sekmeli bir kart: "Bu hafta" ve "Tüm zamanlar".
- **Masaüstü:** Üç kolon. Solda kişisel istatistikler ve rekor, ortada büyük oyun alanı (`CELL` kapsayıcıya göre ölçeklenir), sağda sıradaki/hold ve canlı turnuva sırası. Sayfa başlığındaki açıklama ile GameShell idle metni tek kaynağa indirilmeli (şu an iki kez yazılıyor).
- **Durumlar:** Sunucudan gelen `initialState` ile şu dört durum ilk boyamada ayrışmalı: `available`, `played(won/lost, score)`, `disabled`, `error`. Liderlik hatası "Henüz skor yok" yerine "Yüklenemedi, tekrar dene" göstermeli.

**Motion / 3D (ölçülü):**
- 3D gerekmiyor; bu tür 2D netlik ister. Mevcut neon dil korunmalı.
- Satır temizlemede 120 ms'lik "onay damgası" süpürmesi (soldan sağa ışık) ve temizlenen satır sayısına göre ölçeklenen hafif sarsıntı kullanılabilir. Tetris (4 satır) için tek seferlik kısa bir parçacık patlaması yeterli.
- Sonuç ekranında puan sayacı 0'dan ödüle doğru saymalı (framer `animate` ile sayı tween'i) ve ardından seri alevi yanmalı. Bu, mevcut toast yığınının yerini almalı; toast'lar yalnız ekran dışı bilgi için kalmalı.
- Tüm efektler `prefers-reduced-motion` ve uygulama tercihine ortak bir yardımcıyla bağlanmalı. Ses için ayrı bir aç/kapa düğmesi eklenmeli (localStorage'da tutulur).

**Veri ve API değişiklikleri:**
1. **`lib/games/review-stack-engine.ts` (saf):** seed'li 7-bag, SRS döndürme, lock-out, puanlama ve `replay(seed, inputs) → score`. İstemci ve sunucu aynı modülü kullanır; birim testlenir.
2. **`POST /api/customer/games/[game]/start`:** `seed` ve `attempt` döner. `active` oturum yeniden verilmez; `failed` ve `abandoned` kilit sayılır. Oyun için `practice: true` modu ödülsüz ayrı oturum açar.
3. **`POST …/complete`:** body `{ sessionId, inputs }` olur. `won` ve `score` sunucuda hesaplanır. Bildirim transaction içinde yazılır; `capGamePoints` uygulanır.
4. **`page.tsx` (server):** `getEffectiveMiniGame` + bugünün oturumu + kişisel rekor çekilir; `enabled` ve `initialState` client bileşene prop olarak geçer. Rol uyuşmazlığında kullanıcı kendi paneline yönlendirilir.
5. **Turnuva:** deterministik eşitlik bozucu ve hafta kapanışında dondurulan sonuç tablosu.

---

## Çakışmalar / birleştirme önerisi

- **Kaldırılmamalı.** Sayfa, Oyun Merkezi'nin (`/customer/games`, `components/customer/games/games-hub.tsx:87`) bir alt rotası. Kendi başına ayrı bir amacı var (tek bir oyun) ve URL ile doğrudan erişilebilir olması doğru.
- **Mimari tekrar:** 21 oyun sayfası birebir aynı iskeleti kopyalıyor (`page.tsx`: oturum kontrolü + `DashboardPageHeading` + `<XGame/>`). Ayrıca 21 bileşenin hiçbiri sunucu config'ini kullanmıyor. Önerim: tek bir dinamik rota `app/customer/games/[game]/page.tsx` ve bir `GAME_COMPONENTS` haritası (`next/dynamic`, `ssr:false`). Etkin config, `enabled` kontrolü ve `initialState` bu tek rotada çözülür; oyun bileşeni yalnız oynanışı yazar. Bu, Bulgu 1, 4 ve 7'yi tüm oyunlar için tek seferde kapatır.
- **İçerik çakışması (ürün kararı):** "Yorum İstifi" (blok dizme) mekanik olarak `trust-merge` (2048) ve `signal-pipe` ile aynı "bulmaca" kümesinde. 21 oyunluk katalog ödül ekonomisini sulandırıyor ve her biri günde 170 civarında puan basma yüzeyi ekliyor. Katalogu kullanım verisine göre (PostHog oyun başına günlük aktif kullanıcı) budayıp haftalık döngüsel bir "öne çıkan oyunlar" setine geçmek, hem ekonomiyi hem bakım yükünü rahatlatır. Bu oyun mekanik olarak katalogun en sağlamlarından biri, bu yüzden korunması önerilir.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu (start/complete/status rotaları, `lib/use-mini-game.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-config.ts`, `components/customer/games/review-stack-game.tsx`, `components/customer/games/game-shell.tsx`, `lib/points-caps.ts`, turnuva rotası). Kod çalıştırılmadı, DB'ye dokunulmadı.

### 1. Kaybedilen (failed) oturum yeniden başlatılabiliyor, complete 409 dönüyor — **DOĞRULANDI**
- `complete/route.ts:101` kayıpta `status: 'failed'` yazıyor. `start/route.ts:57` yalnız `'completed'` durumunu kilitliyor; `failed` kayıt `:69-73` dalına düşüp aynı `sessionId` ile `canPlay: true` dönüyor.
- `complete/route.ts:73` yalnız `'completed'`ı reddettiği için `failed` oturum geçiyor, ama `:98-99` `updateMany({ status: 'active' })` 0 satır güncelliyor ve `:177-181` 409 "Oyun zaten tamamlandı" dönüyor. `use-mini-game.ts:98-99,127` bunu hata toast'ına çeviriyor.
- `status/route.ts:33` yalnız `completed` saydığı için hub oyunu "bugün oynanmadı" gösteriyor.
- **Yeniden üretim:** Oyunu 16'nın altında skorla bitir (tepeye ulaş → `review-stack-game.tsx:97` `won=false`). Sayfayı yenile → "Başla" butonu çıkar (`game-shell.tsx:165`, faz `idle`), oyun sıfırdan açılır. 30 puan yapsan bile bitişte 409 toast'ı alırsın ve ödül gelmez. Puan basma açığı değil, ama "günde 1 hak" kuralı tutarsız uygulanıyor ve kullanıcı boşa oynuyor. Generic rota olduğu için `[game]` üzerinden geçen tüm oyunlarda aynı sonuç oluşur.

### 2. Aktif oturumun yeniden verilmesiyle günde 1 hak sınırsız denemeye dönüşüyor — **DOĞRULANDI**
- `start/route.ts:69-73` `active` oturumu koşulsuz yeniden veriyor; `use-mini-game.ts:69-72` yeni `startTimeRef` ile `playing`e geçiyor ve `review-stack-game.tsx:253-264` tahtayı/skoru sıfırlıyor.
- `complete/route.ts:81-83` `serverElapsedSec`'i ilk `startedAt`'ten ölçüyor; ikinci denemede bu süre zaten büyük olduğu için sunucu tarafı süre kontrolü fiilen devre dışı kalıyor. İstemcinin `durationSec`'i ise yeni başlangıçtan ölçülüyor ve gerçek oyunda 12 sn'yi kolayca geçiyor.
- **Yeniden üretim:** Oyun kötü giderken, tepeye ulaşmadan (yani `endGame` → `finish` tetiklenmeden) sekmeyi yenile ya da kapat-aç. Oturum `active` kaldığı için yeni tahta açılır. Bu, 16 skoru geçene kadar sınırsız tekrarlanır; en iyi deneme hem 170 puanı hem turnuva skorunu (`starsCollected`) kazanır.

### 3. Skor ve `won` istemci beyanı; oyun ve turnuva puanlarında tavan yok — **DOĞRULANDI (nüansla)**
- `complete/route.ts:15-22,59` `score` ve `won` doğrudan body'den geliyor. Sunucu yalnız `maxScore`'a sıkıştırıyor (`:61`) ve `computeEffectiveReward` eşiğe bakıyor (`minigame-config-effective.ts:107-116`). Oyun durumunun sunucuda yeniden hesaplanması yok.
- **Yeniden üretim:** Müşteri oturum çereziyle `POST /api/customer/games/review-stack/start` → 12 sn bekle → `POST …/complete` `{sessionId, score:40, durationSec:12, won:true}` → 170 puan + 85 XP (`minigame-config.ts:290-294`). Turnuvada `weeklyRanking` (`tournament/route.ts:28-39`) bu `starsCollected=40` değerini sıralamaya alır. Az oyunculu haftada ilk 3'e girip POST ile `prizeForRank` ödülünü talep etmek mümkün.
- **Nüans:** "Tavan yok" ifadesi kısmen abartılı. `@@unique([userId, gameType, dayKey])` oyun başına günde 1 ödülü sınırlıyor. Günlük üst sınır kabaca registry `rewardPoints` toplamı kadar (23 kayıt, yaklaşık 3250 puan/gün). Kategori bazlı (`game`/`tournament`) bir günlük/haftalık tavan ise gerçekten yok: `lib/points-caps.ts:13-64` yalnız `category: 'feedback'`e uygulanıyor. Ayrıca turnuvada `maxScore`'da eşitlik olunca `groupBy … orderBy _max desc` sırası deterministik değil. İstemci tarafı oyunlarda bu doğal bir sınırlama, ama puanlar ödüle çevrilebildiği için gerçek ekonomik risk taşıyor.

### 4. Admin eşik override'ı istemcide yok sayılıyor — **DOĞRULANDI (admin override varsa)**
- `review-stack-game.tsx:11` statik `DEF = getMiniGame('review-stack')` kullanıyor. `won` kararı `:97` (`DEF.rewardThreshold`), bitiş `:145` (`DEF.maxScore`), ekrandaki hedef `:357,366,399` hep statik değerden geliyor. `use-mini-game.ts:70` sunucu `config`'ini state'e koyuyor ama hiçbir oyun bileşeni kullanmıyor (`components/customer/games` altında `config.rewardThreshold/maxScore` kullanımı yok). Admin `app/admin/games/page.tsx` + `app/api/admin/games/route.ts` üzerinden `rewardThreshold`/`maxScore` düzenleyebiliyor.
- **Yeniden üretim (eşik düşürüldü, ör. 16→10):** Oyuncu 12 skorla tepeye ulaşır → istemci `won=false` gönderir → `complete/route.ts:86` `eligible=false` → ödül 0, oturum `failed`. Ekranda da "Hedef: 16" yazar. **Eşik yükseltildi (16→25):** 20 skorda istemci kazandı sesi/animasyonu verir, sunucu 0 ödül döner (`use-mini-game.ts:114-115` "eşiği geçemedin" toast'ı). **`maxScore` 60'a yükseltildi:** istemci 40'ta oyunu bitirir (`:145`), kullanıcı override edilen tavana hiç ulaşamaz. `maxScore` düşürülürse sunucu sıkıştırdığı için zararsızdır.
- Override satırı yoksa davranış doğrudur; hata yalnız admin bu alanları değiştirdiğinde ortaya çıkar.
