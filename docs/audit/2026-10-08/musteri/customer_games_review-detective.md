# /customer/games/review-detective

**Amaç:** Müşteriye günde bir kez oynanan, "vaka dosyasındaki yorumlardan sahte/yapay olanı bul" temalı, 10 turluk, canlı/süreli bir mini oyun sunmak; eşik geçilirse puan + XP, haftalık turnuva ve tüm zamanlar liderlik tablosu ile oyunlaştırma döngüsünü beslemek.

**Genel puan: 5/10** · **Karar: birleştir** (truth-vs-fake ile aynı beceriyi ve neredeyse aynı içeriği ölçüyor; tek, içerik motoru sunucudan gelen bir "Dedektif" oyununda yeniden tasarlanarak birleştirilmeli)

Dosya zinciri (okunanlar):
- `app/customer/games/review-detective/page.tsx` (24 satır, sunucu bileşeni)
- `app/customer/layout.tsx`, `components/dashboard/page-heading.tsx`
- `components/customer/games/review-detective-game.tsx` (oyunun tamamı, 284 satır)
- `components/customer/games/game-shell.tsx`, `fx-layer.tsx`, `game-leaderboard.tsx`, `game-tournament.tsx`
- `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/tournament-core.ts`, `lib/admin-toast.ts`, `lib/points-caps.ts`
- API: `app/api/customer/games/[game]/start/route.ts`, `.../[game]/complete/route.ts`, `.../[game]/leaderboard/route.ts`, `app/api/customer/tournament/route.ts`, (dolaylı) `app/api/customer/games/status/route.ts`
- Prisma: `MiniGameSession` (`prisma/schema.prisma:493-513`), `MiniGameConfig` (`:521-541`), `TournamentRewardClaim`, `GameStreakClaim`, `AnalyticsEvent`, `Notification`

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Ana oyun döngüsü çalışıyor; ama kaybedilen oyun aynı gün yeniden açılıp sonunda 409 ile reddediliyor, "günde 1 hak" yarım bırakarak delinebiliyor, istemci admin override'larını yok sayıyor ve vaat edilen "ipuçları azalır" mekaniği yok. |
| UX | 5/10 | Tempo, kombo ve hız bonusu keyifli; fakat içerik 16 metinlik havuzdan ibaret ve sahteler BÜYÜK HARF/emoji/tekrarla anında tanınıyor, süre dolduğunda sahte gösterilmiyor, yanlış seçilen kart işaretlenmiyor, oyun sonunda öğretici bir özet yok. |
| Görsel | 6/10 | Amber "vaka dosyası" atmosferi, 3B kart girişi ve parçacık efektleri tutarlı; ancak 10-12 px metinler, üç farklı açıklama metninin tekrarı ve koyu kabukta tema token'lı turnuva bileşeni hiyerarşiyi bozuyor. |
| Mimari | 5/10 | Ortak `useMiniGame`/`GameShell`/generic API iyi bir iskelet; ama skor ve `won` tamamen istemci beyanı, içerik bileşene gömülü, efektif config istemciye ulaşıp kullanılmıyor, turnuva sıralamasında eşitlik kırıcı yok. |
| Performans | 7/10 | Hafif DOM oyunu, ağır bağımlılık yok; tek dikkat noktası `FxLayer`'ın parçacık olmasa da sürekli 60 fps `requestAnimationFrame` döngüsü ve kare-tabanlı (Hz'e bağlı) efekt süresi. |
| Erişilebilirlik + mobil | 3/10 | Kartlar gerçek `button` olsa da sonuç/sayaç/can için hiçbir `aria-live`/etiket yok, klavye seçiminde efektler ekran dışına çiziliyor, ses kapatma yok, sekme değişince süre akmaya devam ediyor, küçük ve düşük kontrastlı metinler var. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum + `CUSTOMER` rol kontrolü, aksi halde `/auth/signin`'e yönlendirme | ÇALIŞIYOR | `page.tsx:10-13` | Rol yanlışsa (ör. DEALER) da signin'e atılıyor; kendi paneline değil. |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:19-22` | Layout şablonu `%s \| <panel>` olduğu için sonuç "Yorum Dedektifi \| QRateX \| <panel>" şeklinde çift sonek; marka "QRateX" yazımı başka yerlerle tutarsız. |
| 3 | Masaüstü sayfa başlığı (`DashboardPageHeading`) | KISMİ | `page.tsx:17-20`, `page-heading.tsx:21` | Başlık/açıklama sabit kodlu; admin'in `MiniGameConfig.title/description` override'ı burada yansımaz. Mobilde gizli (`hidden sm:flex`). |
| 4 | Başlangıç ekranı: zıplayan emoji, başlık, açıklama | KISMİ | `game-shell.tsx:165-184`, `review-detective-game.tsx:199-201` | Statik registry `DEF` kullanılıyor (admin override'ı yok). Açıklamada olmayan mekanik vaat ediliyor (bkz. #35). |
| 5 | "🕵️ Dosyayı Aç" CTA → `POST /api/customer/games/review-detective/start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `use-mini-game.ts:54-79`, `start/route.ts:20-94` | Hata halinde toast + idle'a dönüş doğru. |
| 6 | "Günde 1 hak" kuralı | BOZUK | `start/route.ts:56-73`, `complete/route.ts:98-108`, `complete/route.ts:101` | Kaybedilen oturum `failed` olur; start yalnız `completed`'ı kilitler → kaybeden kullanıcı aynı gün tekrar oynar, sonunda `updateMany where status:'active'` 0 döner → 409 "Oyun zaten tamamlandı". Yarım bırakılan (`active`) oturum sınırsız yeniden başlatılabilir. Ayrıntı: Bulgu 1-2. |
| 7 | "Bugün zaten oynadın" kilit ekranı | KISMİ | `game-shell.tsx:73`, `game-shell.tsx:308-332`, `use-mini-game.ts:64-68` | Sadece CTA'ya basıldıktan sonra görünür; sayfa açılışında oynanma durumu sorgulanmaz. Kaybedilen günde hiç görünmez (#6). |
| 8 | Admin tarafından pasifleştirilmiş oyun | KISMİ | `start/route.ts:34-39`, `page.tsx:9-23` | Sayfa yine tam açılır; kullanıcı "Bu oyun şu anda kullanılamıyor" toast'ını ancak başlata basınca görür. |
| 9 | Haftalık turnuva canlı sıralaması | ÇALIŞIYOR | `game-tournament.tsx:59-75`, `tournament/route.ts:47-120` | Eşit skorlarda sıra belirsiz (#10, Bulgu 4). |
| 10 | Geçen hafta turnuva ödülü talebi ("Ödülü al") | KISMİ | `game-tournament.tsx:84-97`, `tournament/route.ts:128-200`, `tournament/route.ts:29-35` | Atomik tek-claim var; ancak sıralama eşitlik kırıcısız → ödül rastgele dağılır ve GET/POST farklı sıra görebilir. Toast `lib/admin-toast` ile "Basarili: " önekli (Türkçe karakter yok, admin dili) çıkar (`admin-toast.ts:17-18`). |
| 11 | Turnuva geri sayımı | ÇALIŞIYOR | `game-tournament.tsx:31-40`, `:78-82` | Dakikada bir yerel azaltma; kabul edilebilir. |
| 12 | Tüm zamanlar liderlik tablosu (idle, sonuç, kilit ekranında) | KISMİ | `game-leaderboard.tsx:24-113`, `leaderboard/route.ts:47-84` | `maxScore=10` tavanı nedeniyle tepe "10"larla dolar, eşitlik kırıcı yok; `totalPlayers` 100'de tıkanır (`take:100`); ağ hatası "Henüz skor yok — ilk rekoru sen kır!" olarak gösterilir (`:40`, `:55-60`). |
| 13 | HUD — 3 can (kalp) | ÇALIŞIYOR | `review-detective-game.tsx:212-216` | Erişilebilir etiket yok. |
| 14 | HUD — "Dosya x/10" sayaç | ÇALIŞIYOR | `review-detective-game.tsx:218` | |
| 15 | HUD — kombo göstergesi (≥2x, alev) | ÇALIŞIYOR | `review-detective-game.tsx:219-221` | |
| 16 | HUD — skor (büyüteç) | ÇALIŞIYOR | `review-detective-game.tsx:224` | |
| 17 | HUD — tur geri sayımı | KISMİ | `review-detective-game.tsx:104`, `:123-147`, `:225` | Her tur önce "9s" basılır, 200 ms sonra gerçek değere (ör. 6s) atlar; seçim yapıldıktan sonra da sayaç akmaya devam eder. Sekme arka plandayken süre durmaz. |
| 18 | Tur üretimi (`buildRound`) — 1 sahte + 2-5 gerçek, karışık | KISMİ | `review-detective-game.tsx:25-57` | Toplam 10 gerçek + 6 sahte metin; sahteler biçimsel olarak bariz (BÜYÜK HARF, "!!!", emoji, link). 2. günden itibaren ezberlenir. `sort(() => Math.random()-0.5)` yanlı karıştırma. |
| 19 | Zorluk eğrisi: kart sayısı artar, tur süresi 9 s → 5 s | ÇALIŞIYOR | `review-detective-game.tsx:49`, `:123` | |
| 20 | Doğru seçim: +1, hız bonusu (<3,5 s) +1, her 3. komboda +1 | ÇALIŞIYOR | `review-detective-game.tsx:157-176` | |
| 21 | Yanlış seçim: −1 can, kombo sıfırlanır | KISMİ | `review-detective-game.tsx:181-191` | Yanlış seçilen kart görsel olarak işaretlenmez; yalnız gerçek sahte vurgulanır (`:244-271`). |
| 22 | Süre dolumu: −1 can, sonraki tur | KISMİ | `review-detective-game.tsx:131-142` | `picked` null kaldığı için sahte kart hiç açığa çıkmaz; yazılı geri bildirim yok (yalnız ses). Öğrenme fırsatı kaybı. |
| 23 | Sahte kartın açığa çıkması ("⚠ YAPAY / SAHTE") | ÇALIŞIYOR | `review-detective-game.tsx:244-271` | |
| 24 | Parçacık/efekt katmanı (burst, ring, floatText, shockwave, konfeti) | KISMİ | `review-detective-game.tsx:154-190`, `fx-layer.tsx:76-160` | Klavye ile (Enter/Space) seçimde `clientX/Y = 0` → koordinat negatif, efekt ekran dışına çizilir. Döngü parçacık yokken de sürekli çalışır. |
| 25 | Ses efektleri (WebAudio) | ÇALIŞIYOR | `review-detective-game.tsx:11`, `game-sounds.ts:8-31` | Ses yalnız "animasyonları azalt" tercihiyle susar; ayrı ses aç/kapa yok (#39). |
| 26 | Dokunsal geri bildirim (`navigator.vibrate`) | ÇALIŞIYOR | `review-detective-game.tsx:139,167,187`, `game-sounds.ts:159-166` | iOS Safari'de desteklenmez (sessiz geçer). |
| 27 | Skor tavanında erken bitiş | ÇALIŞIYOR | `review-detective-game.tsx:177-180` | Statik `DEF.maxScore` kullanır. |
| 28 | Oyun sonu kazandı/kaybetti hesabı | KISMİ | `review-detective-game.tsx:94-96`, `use-mini-game.ts:70`, `start/route.ts:96-101` | Sunucu `config` (efektif eşik/tavan) döndürür, hook saklar ama bileşen hiç okumaz; admin eşiği değiştirirse istemci ve sunucu farklı karar verir. |
| 29 | Sonuç gönderimi → ödül, seri bonusu, başarım, bildirim (`complete`) | KISMİ | `complete/route.ts:59-229` | Akış atomik ve çift ödülü engelliyor; ancak skor ve `won` tamamen istemci beyanı, oyun puanına günlük tavan yok (Bulgu 3). |
| 30 | Ödül/seri/başarım toast'ları | ÇALIŞIYOR | `use-mini-game.ts:112-125` | |
| 31 | Sonuç ekranı (trofe/kurukafa, varyant başlık, skor etiketi, ödül veya ıska notu, liderlik) | KISMİ | `game-shell.tsx:222-305`, `minigame-copy.ts:77-85` | Skor etiketi "Çözülen dosya" ama skor bonuslu puan (4 dosyada 10 olabilir). Iska notu eşiği statik `DEF`'ten gösterir. 409 hatasında bile `won:true` ise "Dava Çözüldü!" + trofe görünür (`use-mini-game.ts:126-128`). |
| 32 | Ödülde konfeti kutlaması | ÇALIŞIYOR | `game-shell.tsx:19-31`, `:86-94` | `reduce-animations` saygılı. |
| 33 | Ödül/başarım uygulama içi bildirimi | ÇALIŞIYOR | `complete/route.ts:185-212` | |
| 34 | Sabit ipucu satırı ("Aşırı abartı, tekrar ve spam-link sahteyi ele verir") | ÇALIŞIYOR | `review-detective-game.tsx:280` | 10 px, %40 opaklık — okunması zor. |
| 35 | "Süre daraldıkça ipuçları azalır" mekaniği | SAHTE | `minigame-config.ts:119`, `minigame-copy.ts:79`; bileşende karşılığı yok | Kodda ipucu sistemi bulunmuyor; tek "ipucu" sabit satır (#34). Ayrıca yanlış seçimde "Yanlış ipucu! -1" metni (`:190`) bu kavramla karışıyor. |
| 36 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232`, `fx-layer.tsx:171-232`, `game-shell.tsx:13-16` | Framer-motion OS tercihini izler; uygulama içi `reduce-animations` yalnız CSS ve FX'i keser, kartların 3B spring girişi ve sonsuz emoji/trofe animasyonları JS tarafında devam eder. |
| 37 | Ekran okuyucu bildirimleri (doğru/yanlış, kalan süre, can) | EKSİK | `review-detective-game.tsx:211-281` | `aria-live`, `role="timer"`, `aria-label` yok. |
| 38 | Duraklatma / sekme değişiminde süre dondurma | EKSİK | `review-detective-game.tsx:125-147` | `visibilitychange` dinlenmiyor; bildirim/çağrı gelirse can kaybedilir. |
| 39 | Ses aç/kapa kontrolü | EKSİK | `game-sounds.ts:10-13` | |
| 40 | Nasıl oynanır / ilk oyun öğreticisi | EKSİK | — | Puanlama (hız/kombo bonusu) hiçbir yerde anlatılmıyor. |
| 41 | Oyun sonu "dava özeti" (hangi sinyal sahteyi ele verdi, doğru/yanlış dökümü) | EKSİK | `game-shell.tsx:222-305` | Platformun ana değeriyle (güvenilir yorum) bağ kurulmuyor. |
| 42 | Bileşen kaldırılırken zamanlayıcı temizliği | KISMİ | `review-detective-game.tsx:141`, `:178`, `:192` | `setTimeout`'lar iptal edilmiyor; son turda sayfadan çıkılırsa `endGame` → `game.finish` arka planda tetiklenebilir. |
| 43 | Mobil yerleşim (tam genişlik kartlar, dokunmatik) | ÇALIŞIYOR | `review-detective-game.tsx:229-277`, `game-shell.tsx:97-131` | `whileHover` mobilde anlamsız; kart metni 12 px. |
| 44 | Paylaş / sonucu kaydet / arkadaşı davet et | EKSİK | — | Kıyas ürünlerde standart. |

**Durum sayımı:** ÇALIŞIYOR 19 · KISMİ 17 · BOZUK 1 · SAHTE 1 · EKSİK 6 (toplam 44)

---

## Bulgular

### 1. Kaybedilen oyun aynı gün yeniden açılıyor, sonunda 409 ile reddediliyor
- **Önem:** yüksek · **Kategori:** işlevsellik / veri bütünlüğü
- **Kanıt:** `app/api/customer/games/[game]/complete/route.ts:101` (`status: won ? 'completed' : 'failed'`); `app/api/customer/games/[game]/start/route.ts:56-73` (yalnız `completed` kilitlenir, aksi her durumda aynı `sessionId` "yarım kalan aktif oturum" diye döner); `complete/route.ts:98-108` (`updateMany where status:'active'` → `count===0` → 409); `app/api/customer/games/status/route.ts:33` (hub yalnız `completed`'ı "oynandı" sayar); `lib/use-mini-game.ts:126-128`.
- **Sorun:** Kullanıcı kaybedince hub kartı "oynanmadı" görünür, sayfaya döner, "Dosyayı Aç"a basar, 10 tur boyunca oynar ve kazansa bile sonunda "Oyun zaten tamamlandı" hatası alır. Hata yolunda istemci `won` değerini koruduğu için ekranda "Dava Çözüldü! 🏆" ve aynı anda kırmızı hata toast'ı görünür. Bu hem güveni zedeler hem de "günde 1 hak" sözünü çiğner.
- **Öneri:** Günlük hak durumunu tek kaynakta modelleyin: start'ta `status IN ('completed','failed')` ise `alreadyPlayed:true` dönün (kayıp da hakkı tüketir), `active` ise kaldığı yerden devam yerine "oturum süresi doldu" kuralı uygulayın. Status rotası ve hub "bugün oynandı" setini `completed|failed` ile hesaplasın. İstemcide `finish` hata dalında `won`'u sonuç ekranına taşımayın; 409'u "Bugünkü hakkını kullandın" kilit ekranına çevirin. Bu düzeltme generic route'ta olduğu için 20 oyunun hepsini aynı anda onarır.
- **Efor:** S

### 2. "Günde 1 hak" yarım bırakarak sınırsız denemeye dönüşüyor
- **Önem:** yüksek · **Kategori:** oyun ekonomisi / anti-abuse
- **Kanıt:** `start/route.ts:69-73` (aktif oturum aynen geri verilir), `use-mini-game.ts:82-88` (`finish` çağrılmazsa sunucuya hiçbir şey gitmez), `review-detective-game.tsx:81-106`.
- **Sorun:** Kötü giden bir oyunda sayfa yenilenir; oturum `active` kaldığı için yeniden başlatılır. Sunucu süre kontrolü ilk `startedAt`'tan ölçtüğü için engel olmaz. Sonuç: pratikte "kazanana kadar oyna". Turnuva sıralaması da bundan etkilenir.
- **Öneri:** Start'ta oturuma `attempt` sayacı ve `expiresAt` (ör. oyunun azami süresi + tampon) ekleyin; süresi geçmiş `active` oturum start'ta otomatik `failed` (skor 0) olarak kapatılsın. Mümkünse oyun sonunu sunucu tarafında belirleyin (Bulgu 3'teki tur-bazlı doğrulama ile birlikte).
- **Efor:** M

### 3. Skor ve kazanma tamamen istemci beyanı; oyun puanlarına günlük tavan yok
- **Önem:** yüksek · **Kategori:** güvenlik / puan ekonomisi
- **Kanıt:** `complete/route.ts:15-22` (`score`, `durationSec`, `won` gövdeden), `:61` (yalnız `maxScore`'a sıkıştırma), `:82-87` (ödül = `won && !tooFast` + eşik); `lib/points-caps.ts:13-26` (tavanlar yalnız `category:'feedback'` için, oyunlar `category:'game'`); `review-detective-game.tsx:25-57` (cevap anahtarı — `fake:true` — istemci paketinde).
- **Sorun:** Oturum açmış herhangi bir müşteri, start çağırıp 8 sn bekledikten sonra `{score:10, won:true, durationSec:8}` göndererek 150 puan + 75 XP alır; 20 oyunda aynı desenle günde ~3.000 puan ve turnuva tepe sıraları elde edilebilir. Doğru cevap da istemciye gönderildiği için insan "oynasa" bile DevTools ile kopya mümkündür. `points_credited` olayı yazılıyor (görünürlük var) ama engelleme yok.
- **Öneri:** (a) Kısa vadede oyun kategorisi için `points-caps` benzeri günlük tavan (ör. oyunlardan günde X puan) ve velocity eşiği ekleyin. (b) Bu oyun için sunucu-otoriter tur modeli: start, tur dizisini sunucuda üretip `MiniGameSession`'a (veya Redis'e, oturum anahtarlı) yazsın ve istemciye yalnız metin + kart kimliği göndersin; her seçim `POST /round` ile kart kimliği + istemci zamanı olarak gelsin, doğruluk/hız sunucuda hesaplansın; `complete` skoru kendisi toplasın. Detective formatı zaten ayrık turlardan oluştuğu için bu model doğal oturur.
- **Efor:** M (tavan) / L (sunucu-otoriter turlar)

### 4. Turnuva ve liderlik sıralamasında eşitlik kırıcı yok; 10 puan tavanıyla ödül fiilen rastgele
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / puan ekonomisi
- **Kanıt:** `app/api/customer/tournament/route.ts:29-38` (`orderBy: { _max: { starsCollected: 'desc' } }`, ikincil anahtar yok, `take: 100`), `:83-96` ve `:145-148` (GET ve POST sırayı ayrı ayrı yeniden hesaplar), `:157-160` (tekillik `userId+gameType+weekKey` — sıra bazlı değil); `lib/minigame-config.ts:122` (`maxScore: 10`); `leaderboard/route.ts:47-53`.
- **Sorun:** Oyun kolay olduğundan birçok oyuncu haftayı 10 ile bitirir. Postgres eşit değerleri garantili sırada döndürmez; kim 1./2./3. olacağı plan/sayfa düzenine bağlıdır. GET'te "Geçen hafta 3. oldun" görüp POST'ta "Geçen hafta ödül kazanmadın" alınabilir; daha kötüsü farklı isteklerde farklı kullanıcılar aynı sırayı görüp her biri ödülü talep edebilir (talep kısıtı kullanıcı başına, sıra başına değil) → ilk 3 için öngörülenden fazla puan basılabilir (500+300+150 tavanı aşılır). Bu son senaryo kod okumayla olası görülmüştür, canlıda gözlenmedi.
- **Öneri:** Sıralamayı deterministik yapın: `MAX(score) DESC, MIN(completedAt) ASC (ilk ulaşan kazanır), userId ASC`. Prisma `groupBy` bunu iyi ifade etmediği için `$queryRaw` ile tek sorgu kullanın. Hafta kapandığında sonuçları bir `TournamentResult(weekKey, gameType, rank, userId)` tablosuna (cron ile) dondurun; claim bu dondurulmuş tablodan ve `@@unique([gameType, weekKey, rank])` ile yapılsın. Skor tavanı çok düşük oyunlarda turnuva skoruna süre/doğruluk bileşeni ekleyin (ör. `score*1000 - totalReactionMs`).
- **Efor:** M

### 5. İstemci, sunucudan gelen efektif ayarları yok sayıyor
- **Önem:** orta · **Kategori:** mimari / tutarlılık
- **Kanıt:** `review-detective-game.tsx:13` (`const DEF = getMiniGame('review-detective')!` — statik registry), `:95`, `:177`, `:199-207`; `lib/use-mini-game.ts:70`, `:137` (`config` döndürülüyor); `start/route.ts:96-101`; `lib/minigame-config-effective.ts:40-57`; `page.tsx:18-19`.
- **Sorun:** Admin `/admin` oyun ayarlarından eşik, tavan, başlık, açıklama veya rengi değiştirdiğinde bu sayfa eski değerleri gösterir ve eski eşikle `won` hesaplar. Eşik düşürülürse istemci `won:false` yollar, sunucu ödülü vermez; yükseltilirse "Kazandın ama ödül eşiğini geçemedin" ve yanlış sayı gösterilir.
- **Öneri:** Sayfa sunucu bileşeni olduğuna göre `getEffectiveMiniGame('review-detective')`'i `page.tsx`'te çağırıp `enabled=false` ise bilgilendirici bir "geçici olarak kapalı" ekranı gösterin; efektif tanımı `ReviewDetectiveGame`'e prop olarak geçirin; `DashboardPageHeading` başlığını da buradan besleyin. `won` kararı (Bulgu 3 sonrası) zaten sunucuya taşınmalı.
- **Efor:** S

### 6. Vaat edilen "ipuçları azalır" mekaniği yok (sahte vaat)
- **Önem:** orta · **Kategori:** ürün dürüstlüğü / UX
- **Kanıt:** `lib/minigame-config.ts:119`, `lib/minigame-copy.ts:79` (metin), `review-detective-game.tsx:280` (tek, sabit ipucu satırı); bileşende ipucu durumu yok.
- **Sorun:** Oyun girişinde anlatılan mekanik oyunda karşılığını bulmuyor; "Yanlış ipucu! -1" (`:190`) yazısı da "ipucu" kavramını yanlış kullanıyor.
- **Öneri:** Ya metni gerçeğe uyarlayın ("Süre daraldıkça dosya kalınlaşır") ya da mekaniği gerçekten kurun: her kartın arkasında sunucudan gelen 1-2 "sinyal" (ör. "hesap 2 gün önce açıldı", "aynı cümle 14 yorumda geçiyor", "işletmeyle ilgisiz link") olsun; büyüteç ile bir sinyal açmak süreden/puandan yer. Bu, oyunu ezberden çıkarıp gerçek dedektifliğe çevirir.
- **Efor:** S (metin) / M (mekanik)

### 7. İçerik havuzu çok küçük ve sahteler biçimsel olarak bariz
- **Önem:** orta · **Kategori:** oyun tasarımı / içerik
- **Kanıt:** `review-detective-game.tsx:25-44` (10 gerçek, 6 sahte metin, hepsi kodda), `:49-56`; neredeyse aynı havuz `components/customer/games/truth-vs-fake-game.tsx:26-41`.
- **Sorun:** Sahtelerin tamamı BÜYÜK HARF, "!!!", emoji veya "DM at" içeriyor; gerçekler normal cümle. Oyun bir "sınıflandırma" değil, "biçim tanıma" testine dönüşüyor ve 1-2 günde ezberleniyor. Günümüz yapay zekâ üretimi sahte yorumları tam tersine kusursuz, genel ve aşırı dengeli olur; oyun, Qratex'in güvenilir yorum misyonunda yanlış zihinsel model öğretiyor.
- **Öneri:** İçeriği koddan çıkarıp `ReviewCase` gibi bir tabloya (veya admin tarafından yönetilen JSON'a) taşıyın: zorluk seviyesi, sahte türü (spam, teşvikli, yapay zekâ, rakip kötüleme), açıklama ("neden sahte"). Kaynak olarak platformun kendi moderasyonunda işaretlenmiş (anonimleştirilmiş) yorumlar ve gerçekçi yapay zekâ üretimi örnekler kullanılabilir. Günlük oturuma deterministik tohum (`seed = userId+dayKey`) vererek aynı gün herkese benzer zorluk sağlanır, turnuva adil olur.
- **Efor:** L

### 8. Süre dolunca sahte gösterilmiyor, yanlış seçilen kart işaretlenmiyor
- **Önem:** orta · **Kategori:** UX / geri bildirim
- **Kanıt:** `review-detective-game.tsx:131-142` (`picked` set edilmiyor), `:244-271` (yalnız `isFake` vurgulanıyor).
- **Sorun:** Oyuncu neyi kaçırdığını öğrenemiyor; yanlış seçimde hangi kartı seçtiği kırmızıyla belirmiyor. Bu, Duolingo'daki "doğru cevap şuydu" anının eksikliği.
- **Öneri:** Kart durumunu `{ selected, correct, missed }` olarak modelleyin; süre dolumunda sahte kartı "kaçtı" etiketiyle gösterin, yanlış seçilen kartı kırmızı kenar + kısa sallanma ile işaretleyin, altında tek satırlık "neden sahte" açıklaması verin (içerik tablosundan).
- **Efor:** S

### 9. Erişilebilirlik: ekran okuyucu, klavye ve süre kontrolü
- **Önem:** orta · **Kategori:** erişilebilirlik
- **Kanıt:** `review-detective-game.tsx:211-227` (etiketsiz kalpler/sayaç), `:154-156` (klavye tıklamasında `clientX=0`), `:125-147` (`visibilitychange` yok), `:257` (`text-[12px]`), `:271` ve `:280` (`text-[10px]`, `text-white/40`); `game-tournament.tsx:116`, `:143` (koyu kabukta `text-muted-foreground` — açık temada `hsl(240 5% 45%)`, küçük metinde AA altında).
- **Sorun:** Görme engelli kullanıcı doğru/yanlış sonucunu, kalan süreyi ve canları duyamaz. Klavye kullanıcısı seçim yaptığında efekt görünmez. WCAG 2.2.1 (süre ayarlanabilirliği) karşılanmıyor. Mobilde 10-12 px metin okunaksız.
- **Öneri:** HUD'a `role="status" aria-live="polite"` bölgesi; her seçim sonrası "Doğru, sahte yorum bulundu, +2" gibi duyuru; kalplere `aria-label="3 candan 2'si kaldı"`; kartlara `aria-describedby` ile sıra numarası. Klavye olayında koordinatı `e.currentTarget.getBoundingClientRect()` merkezinden hesaplayın. Sekme gizlenince süreyi dondurun; erişilebilirlik tercihinde "süresiz mod" (ödül eşiği aynı, turnuvaya katılmaz) sunun. Metinleri en az 14 px, ipucu satırını %60+ opaklıkta tutun; turnuva bileşenini kabuğun koyu paletine özel token'larla boyayın.
- **Efor:** M

### 10. Sonuç ekranındaki skor etiketi ve metin tutarsızlıkları
- **Önem:** düşük · **Kategori:** içerik / dil
- **Kanıt:** `lib/minigame-copy.ts:83` ("Çözülen dosya"), `review-detective-game.tsx:163` (skor bonuslu); `page.tsx:7` ("QRateX"), `page.tsx:19`, `minigame-config.ts:118-119`, `minigame-copy.ts:79` (üç farklı açıklama aynı ekranda); `game-shell.tsx:323` ("00:00 (UTC)" — TR'de 03:00); `lib/admin-toast.ts:17-18` ("Basarili: ").
- **Sorun:** 4 dosya çözen kullanıcı "Çözülen dosya: 10" görür. Masaüstünde sayfa başlığı + kabuk başlığı + başlangıç ipucu üç kez aynı şeyi farklı söyler. Sıfırlama saati TR kullanıcısına UTC ile anlatılıyor. Müşteri tarafında admin toast yardımcısı kullanıldığı için turnuva ödül toast'ı "Basarili: 🏆 1. oldun" şeklinde ASCII Türkçeyle çıkar.
- **Öneri:** Skor etiketini "Dedektif puanı" yapın ve sonuçta "Çözülen dosya: 4/10 · Hız bonusu: 3 · Kombo: 1" dökümü verin. Sayfa başlığını kaldırıp tek kaynak (efektif tanım) kullanın. Sıfırlama saatini `lib/timezone` ile yerel saate çevirin ("Her gün 03:00'te yenilenir"). Turnuvada `sonner`'ı doğrudan kullanın.
- **Efor:** S

### 11. Zamanlayıcı ve render düzeni küçük hataları
- **Önem:** düşük · **Kategori:** kod kalitesi
- **Kanıt:** `review-detective-game.tsx:104` (her tur `9` basılır) ile `:123`, `:129`; `:141`, `:178`, `:192` (temizlenmeyen `setTimeout`); `:81-90` (`useMiniGame` her render'da yeni nesne döndürdüğü için `endGame`/`nextRound`/`pick` `useCallback`'leri her render'da yeniden oluşur — `lib/use-mini-game.ts:137`); `:50`, `:56` (yanlı `sort` karıştırması); `fx-layer.tsx:78-160` (boşta da 60 fps döngü, kare-tabanlı ömür).
- **Sorun:** Sayaç her tur başında 200 ms "9s" gösterip atlıyor; seçim sonrası sayaç akmaya devam ediyor; sayfa değişiminde bekleyen zamanlayıcılar arka planda `finish` çağırabilir; 120 Hz ekranlarda efektler iki kat hızlı söner.
- **Öneri:** Tur durumunu tek bir `useReducer` makinesine (`idle → reveal → resolving → next`) taşıyın; tüm zamanlayıcıları bir `useRef<Set<number>>`'da toplayıp unmount'ta temizleyin; ilk değeri `Math.ceil(roundTimeMs/1000)` ile basın; `useMiniGame` dönüşünü `useMemo` ile sabitleyin; Fisher-Yates kullanın; `FxLayer` döngüsünü parçacık yokken durdurup `burst` çağrısında yeniden başlatın, ömrü `dt` ile hesaplayın.
- **Efor:** S

### 12. Ses ayrı kontrol edilemiyor
- **Önem:** düşük · **Kategori:** UX / erişilebilirlik
- **Kanıt:** `lib/game-sounds.ts:10-13` (sesi yalnız `reduce-animations` susturur).
- **Sorun:** Toplu taşımada veya ofiste oynayan kullanıcının sesi kapatmak için hareketi de kapatması gerekiyor; iki farklı tercih tek bayrağa bağlanmış.
- **Öneri:** Oyun kabuğuna kalıcı (kullanıcı tercihinde saklanan) bir ses düğmesi ekleyin; `game-sounds` bunu ayrı bir `html.mute-sfx` sınıfı veya store üzerinden okusun.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Öğretici "dava özeti" (Duolingo):** Oyun sonunda her turun kartı, doğru cevap ve "bu yorumu ele veren sinyal" açıklaması; yanlışların "pratik destesi"ne eklenmesi. Qratex'in güvenilir yorum misyonunu oyunla doğrudan bağlar.
2. **Kişisel istatistik ve ilerleme (Duolingo / Spotify Wrapped):** Doğruluk %, ortalama tepki süresi, en uzun kombo, haftalık trend; "Dedektif rütbesi" (Çaylak → Komiser) ve rozetle bağ. Şu an yalnızca tek skor var.
3. **Sayfa açılışında günlük durum (Starbucks Rewards):** "Bugünkü dosyan hazır / yarın 03:00'te yeni dosya" kartı, geri sayım ve seri bilgisi butona basmadan görünmeli.
4. **Paylaşılabilir sonuç kartı (Spotify Wrapped / Wordle):** Tur sonuçlarını emoji ızgarası veya görselle paylaşma; arkadaş davetine bağlanabilir (referral sistemi zaten var).
5. **Arkadaş / şehir liderliği ve adil turnuva:** Eşitlik kırıcılı, aynı tohumla herkese aynı dosya ("günün davası"), arkadaşlar arası sıralama.
6. **Tercihler:** Ses aç/kapa, duraklatma, erişilebilir süresiz mod, oyun içi "nasıl oynanır" katmanı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Günün Davası". Kullanıcı sayfayı açtığında, bugünkü davanın kapalı dosyasını (oynanmışsa sonucunu) görür. Oyun, ezberlenebilir biçim tanımadan çıkıp kısa ama düşündüren bir soruşturmaya dönüşür: her turda 3-5 yorum, bir tanesi sahte; büyüteçle bir "sinyal" açılabilir (süre/puan bedeli). Bitişte Duolingo tarzı özet, ardından seri ve turnuva konumu gelir.

**Yerleşim (mobil öncelikli):**
1. Üst şerit: günlük durum (hazır / tamamlandı + geri sayım), seri alevi, dedektif rütbesi, ses düğmesi.
2. Dosya alanı: kartlar dikey yığında, 15-16 px metin; kart üstünde küçük meta satırı (yıldız, "3 gün önce", kullanıcı rozeti) ki sinyaller gerçekçi olsun. Alt kenarda yatay ilerleme çubuğu süreyi gösterir (sayısal sayaçtan daha az kaygı verici, erişilebilir metin eşlikli).
3. Seçim sonrası: seçilen kart yerinde açılır, "neden" satırı belirir; "Sonraki dosya" otomatik geçişi 1,5 sn veya dokunarak.
4. Sonuç: dava özeti (tur tur), puan dökümü (doğru/hız/kombo), ödül, seri, turnuva sıram ("10. sıradasın, 3. olmak için 0,4 sn daha hızlı ol"), paylaş.
5. Turnuva ve tüm zamanlar liderliği ayrı sekmelerde, oyun alanını aşağı itmeden.

**Motion / 3B (ölçülü):** Mevcut 3B kart girişi korunabilir ama tek seferlik ve kısa (≤250 ms) olmalı; sahte açığa çıkınca "damga" (ölçek + hafif dönüş) ve amber parıltı yeterli. Kombo 3'te şok dalgası iyi; her doğru cevapta konfeti fazla. Başlangıç ekranındaki sonsuz emoji animasyonu ve sonuçtaki sonsuz trofe sallanması `useReducedMotion` + uygulama içi tercihle durdurulmalı. three.js gereksiz; dosya/klasör metaforu CSS 3B ile yeterli ve hafif.

**Veri / API değişiklikleri:**
- `ReviewCase` (id, text, isFake, fakeKind, signals[], difficulty, locale, active) tablosu + admin yönetim ekranı; içerik koddan çıkar.
- `POST /api/customer/games/review-detective/start` → sunucu `seed(userId, dayKey)` ile 10 turu seçer, oturuma (veya Redis'e, TTL'li) yazar, istemciye yalnız `{roundId, cards:[{id,text,meta}]}` döner.
- `POST /api/customer/games/review-detective/round` → `{sessionId, roundId, cardId, clientMs}`; sunucu doğruluk + süre hesaplar, `{correct, fakeId, reason, scoreDelta}` döner.
- `complete` skoru oturumdaki tur kayıtlarından kendisi toplar; `won` istemciden alınmaz.
- Generic start/status: `failed` kayıtları da "bugün oynandı" sayılır; süresi dolan `active` oturumlar kapanır.
- Turnuva: deterministik sıralama + hafta kapanışında dondurulmuş sonuç tablosu + oyun kategorisine günlük puan tavanı.
- Sayfa sunucu bileşeni efektif config'i ve günlük durumu önceden çeker (`getEffectiveMiniGame` + oturum sorgusu), istemciye prop geçer; boş/yükleniyor/kilit durumu ilk boyamada doğru gelir.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/truth-vs-fake`** — Aynı beceri (yorum gerçek mi sahte mi), neredeyse aynı içerik (`truth-vs-fake-game.tsx:26-41` ile `review-detective-game.tsx:25-44` aynı tema ve kalıplar: "harika harika harika", "profilime bakın 🎁", "15 dk bekledik", "pizza hamuru"). Fark yalnız etkileşim biçimi (kaydırma vs. çoktan seçme). **Öneri:** tek bir "Dedektif" oyununda iki mod (Hızlı Karar = kaydırma, Soruşturma = dosyadan seç) olarak birleştirin; ortak `ReviewCase` içerik motorunu paylaşsınlar. Hub'da 20 oyunluk listeyi de sadeleştirir.
- **`/customer/games/word-spot`** ("Sahteyi Yakala"), **`/customer/games/bot-hunter`**, **`/customer/games/mind-thief`** — "sahteyi/botu bul" temasını tekrar eder; doğrudan kopya değil ama konsept yorgunluğu yaratır. Hub'da "Güven Dedektifliği" başlığı altında gruplanması önerilir.
- Bu sayfanın kendi rotası korunabilir (birleşik oyunun varsayılan modu olarak), `truth-vs-fake` rotası yeni oyuna yönlendirilmelidir. Rozet/başarım ve turnuva geçmişi `gameType` bazlı olduğu için birleştirmede `MiniGameSession.gameType` geçmişi için bir eşleme (ör. eski kayıtlar korunur, yeni oyun yeni tip) planlanmalı.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme; kod çalıştırılmadı, veritabanına dokunulmadı. Her iddia çağıran/çağrılan taraflarıyla birlikte baştan okundu.

### 1. Kaybedilen oyun yeniden açılıyor ve tam oynandıktan sonra 409 ile reddediliyor — **DOĞRULANDI**

- `app/api/customer/games/[game]/complete/route.ts:101` kaybı `status: 'failed'` olarak yazıyor.
- `app/api/customer/games/[game]/start/route.ts:56-73` yalnız `existing.status === 'completed'` için `alreadyPlayed` dönüyor; `failed` kayıt "yarım kalan aktif oturum" dalına düşüp aynı `sessionId` ile `canPlay: true` dönüyor.
- `complete/route.ts:73` yalnız `completed` için erken 409 veriyor; `failed` oturum bu kontrolü geçiyor, ardından `:98-108` `updateMany where { status: 'active' }` → `count 0` → `:177-181` 409 "Oyun zaten tamamlandı".
- `app/api/customer/games/status/route.ts:33` hub yalnız `completed` saydığı için kaybedilen oyun hub'da "oynanmadı" görünüyor.
- `lib/use-mini-game.ts:126-128` hata dalında istemcinin `won` değeri sonuç objesine yazılıyor; `components/customer/games/game-shell.tsx:78-80, 255` `result.won` true ise trofe ve `lib/minigame-copy.ts:81` "Dava Çözüldü!" başlığını gösteriyor.

**Yeniden üretim:** Müşteri oyunu oynar, 3 canı biter → `failed`. Sonuç ekranında başlat butonu yok, ama hub'a dönünce kart "oynanmadı" görünür. Tekrar açıp ▶ Oyna'ya basar → start aynı oturumu verir, 10 tur oynar, 10 skorla kazanır → complete 409 döner. Ekranda aynı anda kırmızı "Oyun zaten tamamlandı" toast'ı ile 🏆 "Dava Çözüldü!" kartı görünür; puan verilmez. Puan basımı yok (yalnızca 409), dolayısıyla güvenlik değil **doğruluk/UX hatası**; generic route'u kullanan tüm mini oyunları etkiler (pacman'in kendi route'u `pacman/complete/route.ts:75` aynı `failed` desenini kullanıyor, start tarafı ayrıca kontrol edilmeli). Önem: orta-yüksek (kullanıcı güveni, "hile mi yapıldı" algısı).

### 2. Mini oyun skoru ve kazanma bayrağı istemci beyanı; oyun puanlarına günlük tavan yok — **DOĞRULANDI**

- `complete/route.ts:15-22, 59` `score`, `durationSec`, `won` doğrudan gövdeden alınıyor; `:61` yalnız `maxScore` clamp'i var; `:81-87` ödül koşulu `won && !tooFast` + `lib/minigame-config-effective.ts:107-116` eşik kontrolü. Sunucuda tur/cevap kaydı yok.
- `tooFast` için sunucu kontrolü yalnız `startedAt`'tan geçen süre (`:81-83`); `review-detective` için `minDurationSec: 8` (`lib/minigame-config.ts:126`).
- `lib/points-caps.ts:13-26` tavanlar yalnız `category: 'feedback'` olaylarını sayıyor; oyun olayları `category: 'game'` (`complete/route.ts:167`) ile yazılıyor → tavana girmiyor. `lib/points-velocity.ts:8, 31-34` 24 saatte 500+ puanı yalnızca "şüpheli" işaretliyor, kredilemeyi engellemiyor.
- Doğru cevap (`fake: true`) istemci paketinde (`components/customer/games/review-detective-game.tsx:19-57`), ama zaten sunucu skoru doğrulamadığı için bu ikincil.

**Yeniden üretim:** Oturum açmış müşteri `POST /api/customer/games/review-detective/start` → `sessionId` alır, ≥8 sn bekler, `POST .../complete` gövdesi `{sessionId, score:10, durationSec:8, won:true}` → 150 puan + 75 XP (+ seri XP). Aynı şey generic route'taki ~20 oyun için tekrarlanırsa (ödüller 120-170 arası, `lib/minigame-config.ts`) günde ~3.000 puan, oyun oynamadan. Ayrıca `starsCollected` = 10 yazıldığı için haftalık turnuvada tepe skoru da elde edilir. Önem: yüksek (puan ekonomisi enflasyonu; ödül/indirim kullanımına dönüşüyorsa doğrudan maddi etki).

### 3. Turnuva sıralamasında eşitlik kırıcı yok — **DOĞRULANDI (kısmen; fazla ödeme kısmı belirsiz)**

- `app/api/customer/tournament/route.ts:29-35` `groupBy` + `orderBy: { _max: { starsCollected: 'desc' } }`, ikincil sıralama yok, `take: 100`. Postgres eşit değerlerin sırasını garanti etmez.
- GET (`:83-96`) ve POST (`:145-148`) kapanmış haftanın sırasını ayrı ayrı yeniden hesaplıyor; tekillik `@@unique([userId, gameType, weekKey])` (`prisma/schema.prisma:1088`), sıra bazlı değil.
- `review-detective` için `maxScore: 10` (`lib/minigame-config.ts:122`); 2. bulgu sayesinde 10'a ulaşmak trivial, oyun meşru oynansa bile 10 tavanında eşitlik çok olası.

**Kesin etki (doğrulandı):** Kapanmış haftada 4+ oyuncu 10'da eşitse, kimin ilk 3'e gireceği rastgele (fiziksel/hash sırası) belirlenir; aynı skoru yapan oyuncu ödülsüz kalır ve 500/300/150 dağılımı (hangi oyuncu 1. hangi 3.) keyfidir. Bu adalet hatası kod okumasıyla kesin.

**Belirsiz kısım:** Farklı isteklerde farklı sıralama dönüp havuzun üstünde ödül verilmesi. Kapanmış haftanın verisi donmuş (`completedAt` hep `new Date()`, `complete/route.ts:104`), aynı plan çoğunlukla aynı sırayı üretir; fakat plan değişimi (istatistik güncellemesi, paralel hash aggregate, Neon compute yeniden başlatma) sırayı değiştirebilir. Bu durumda 4. sıradaki eşit oyuncu da talep edip ödül alabilir; canlıda gözlenmedi, garanti edilemez. Öneri: deterministik ikincil anahtar (ör. en iyi skora ilk ulaşma zamanı `MIN(completedAt)` ya da süre) ile ham SQL/`$queryRaw` sıralaması ve hafta kapanışında sonuçları `TournamentResult` tablosuna bir kez dondurup GET/POST'un bu tablodan okuması; eşitlikte ödülü paylaştırma politikası ürün kararı olarak yazılmalı.

## Uygulama (Dalga 2)

Bu oyun **Sahte Avcısı** (`/customer/games/fake-hunter`) amiral oyununun **Dosya** aşaması olarak yeniden kuruldu; eski rota `/customer/games/review-detective` sorgu parametrelerini koruyarak `/customer/games/fake-hunter?mod=dosya`'e kalıcı yönlenir, eski bileşen silindi.

Kapatılanlar:
- **Skor istemci beyanı / cevap anahtarı istemcide** → sınıflandırma doğrulayıcısı (`lib/games/validators/fake-hunter.ts`): tur tohumdan sunucuda kurulur, sıralıda içerik ETİKETSİZ ve açıklamasız gider, kararlar sunucuda puanlanır; tekrarlı/uydurma kimlik, sunucu süresinden sonra cevap ve insanüstü hız (≥ 3 cevap < 400 ms) reddedilir. Jest: `__tests__/lib/fake-hunter-verify.test.ts` (17 test: dürüst oyun ödüllenir, şişirilmiş skor sunucu skoruna iner, kanıtsız/betik/başka tohum reddedilir, "hep sahte de" eşiği geçemez).
- **Sabit 10–12 cümlelik, kendini ele veren içerik** → 122 özgün, gerçekçi Türkçe öğe (`lib/games/content/fake-hunter.server.ts`; 32 Kaydır, 30 Dosya, 30 Kelime, 30 Profil); "temiz görünen sahte" ve "şüpheli görünen gerçek" zor öğeler; pratik/sıralı havuzlar ayrı (pratikle sıralı etiketler kazınamaz). Kelime modunda ele veren cümlenin yeri kimlik karmasıyla dağıtıldı.
- **Yanlışa ceza yok (rastgele basmak kârlı)** → doğru +2, 3'lü seride +1, yanlış/süre dolması −1; her ikili aşamada iki etiket de bulunur.
- **Vaat edilen zorluk ilerlemesi yok** → aşama içinde zorluk kolaydan zora; pratikte sonraki vaka oyuncunun Elo'suna göre seçilir (unvan + seviye değişimi sonuçta).
- **Çift tık aynı kartı iki kez sayıyor / paylaşılan `x` sıfırlanmıyor** → 450 ms karar kilidi; her kart kendi hareket değeriyle anahtarla yeniden kurulur.
- **Süre dolunca bayat state** → süre ref tabanlı, duraklatmada durur, dolunca "timeout" kararı kanıta yazılır.
- **Admin override'ı yok sayılıyor** → eşik/tavan `config`'ten (etkin yapılandırma); başlık/renk kabukta.
- **Öğretici / "neden sahteydi?" yok** → ilk oynayışta 4 adımlı öğretici, her aşama başında açıklama kartı; pratikte her karardan sonra doğru cevap + gerekçe.
- **Klavye/ekran okuyucu yok** → ←/A, →/D, 1–4, Enter, Esc; `aria-live` özet, `role="timer"`, isimli düğmeler, ≥ 44 px hedefler; renk körü güvenli mavi/turuncu + ikon + yazı.
- **Sekme gizlenince süre akıyor / duraklatma yok** → `visibilitychange` ve Esc kabuğu duraklatır; süre durur.
- **Hareket/ses politikası** → ses, titreşim, sarsıntı, parçacık ve konfeti yalnız `fx` (useMotionPolicy + oyuncu tercihi) üzerinden; azaltılmış harekette radar dönmez, kart dönüşü kapalı.
- **Sonuç ekranı çıkmaz sokak** → pratik sonu: skor, yıldız, pratik rekoru, seviye, vaka özeti, paylaş; sıralı sonuç ve "günde 1 hak" kilidi ortak kabukta (`GameHost`/`game-session`).

Kalan açıklar: turnuva eşitlik kırıcı, günlük hak/409 ve ağ hatasında yeniden deneme ortak oyun altyapısının işi (bu oyunun dosyaları dışında). Sıralıda istemci doğruluğu bilemediği için skor beyanı 0 gönderilir → ortak doğrulayıcı `score_mismatch` sinyali yazar (sınıflandırma ailesinde bu sinyal anlamsız; ortak altyapıda ele alınmalı). `?mod=` ipucu şimdilik yalnız yönlendirmede taşınır; oyun her turda dört aşamayı oynatır.
