# /customer/games/trust-merge

**Amaç:** Müşteri panelindeki 20 mini oyundan biri olan "Güven Birleştir". 4×4 tahtada 2048 tarzı bir birleştirme bulmacası: aynı değerdeki karolar kaydırılarak birleştirilir. En yüksek karo ödül eşiğine (256) ulaşırsa günde bir kez 170 puan + 85 XP verilir; ayrıca günlük seri bonusu, başarım, tüm zamanlar liderliği ve haftalık turnuva (500/300/150 puan) sıralaması işler.

**Genel puan:** 5/10 · **Karar:** koru-iyileştir. Çekirdek 2048 mantığı doğru yazılmış (tek hamlede çift birleşme yok, hareket yoksa yeni karo yok, oyun sonu tespiti doğru) ve katalogda mekanik olarak tek. Ancak dört sorun ürünü zayıflatıyor: (1) sıralama yalnızca en yüksek karoya göre yapıldığı için liderlik ve turnuva fiilen dört kademeye (256/512/1024/2048) çöküyor ve eşitlikler ödülü belirsiz dağıtıyor; (2) "Bitir" düğmesi onaysız ve mobilde yön tuşlarının hemen üstünde, tek yanlış dokunuş günün tek hakkını yakıyor; (3) yenilemede tahta kayboluyor ve bu aynı zamanda sınırsız yeniden deneme açığı; (4) skor tamamen istemciden geliyor, oysa 2048 tohumlu RNG + hamle günlüğüyle sunucuda ucuza doğrulanabilecek nadir oyunlardan biri.

İncelenen dosyalar:
- `app/customer/games/trust-merge/page.tsx`
- `components/customer/games/trust-merge-game.tsx`
- `components/customer/games/game-shell.tsx`
- `components/customer/games/fx-layer.tsx`
- `components/customer/games/game-leaderboard.tsx`
- `components/customer/games/game-tournament.tsx`
- `components/dashboard/page-heading.tsx`
- `lib/use-mini-game.ts`
- `lib/minigame-config.ts` (`trust-merge` girdisi `:296-309`)
- `lib/minigame-config-effective.ts`
- `lib/minigame-copy.ts` (`trust-merge` girdisi `:186-193`)
- `lib/game-sounds.ts`
- `lib/admin-toast.ts`
- `lib/tournament-core.ts`
- `app/api/customer/games/[game]/start/route.ts`
- `app/api/customer/games/[game]/complete/route.ts`
- `app/api/customer/games/[game]/leaderboard/route.ts`
- `app/api/customer/games/status/route.ts`
- `app/api/customer/tournament/route.ts`
- `app/customer/layout.tsx`, `components/providers.tsx`
- `prisma/schema.prisma` (`MiniGameSession` `:493-513`, `MiniGameConfig`, `GameStreakClaim`, `TournamentRewardClaim`)

Not: Paylaşılan katmandaki (`GameShell`, `useMiniGame`, generic `/start`–`/complete`, turnuva) bulguların bir kısmı kardeş rapor `customer_games_combo-tap.md` ile ortak. Burada her biri bu oyunun koduyla yeniden doğrulandı ve bu oyuna özgü etkisiyle yazıldı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Oyun mantığı ve ödül akışı çalışıyor; ancak kaybeden kullanıcı aynı gün dakikalarca oynayıp 409 alıyor, yenilemede tahta kayboluyor ve sıralama dört kademeye çöktüğü için liderlik/turnuva anlamsızlaşıyor. |
| UX | 5/10 | Kaydırma hissi iyi; fakat onaysız "Bitir" düğmesi, etiketsiz iki sayı (puan ve en yüksek karo), "rozet/karo/skor" terim karmaşası ve hızlı oyuncunun hamlelerini yutan 130 ms kilit deneyimi bozuyor. |
| Görsel | 6/10 | Isınan renk paleti tema ile uyumlu; ama karolar arka plan hücrelerine 3,5–4 px kaymış oturuyor, birleşen karo kayarak değil anında kayboluyor, 2048 karosunun kontrastı AA altında. |
| Mimari | 5/10 | Registry + generic API iyi kurulmuş; ancak istemci admin override'ını yok sayıyor (`won` kararı yanlış eşikle veriliyor), birleşim puanı hiçbir yere kaydedilmiyor, `game` nesnesine bağlı callback'ler her hamlede dinleyicileri yeniden bağlıyor. |
| Performans | 6/10 | DOM tabanlı 16 karo hafif; ama karo hareketi `left/top` ile (layout) canlandırılıyor ve FxLayer, efektlerin nadir olduğu bu sıra tabanlı oyunda dakikalarca boşta 60 fps RAF döngüsü çeviriyor. |
| Erişilebilirlik + mobil | 3/10 | Mobilde kaydırma ve yön tuşları var; ama tahtanın ekran okuyucu karşılığı yok (rol/aria-live yok), yön tuşları "▲" glifiyle okunuyor, ses yalnızca "animasyonları azalt" ile kapanıyor, ipucu metni 10 px. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı yetki kontrolü (yalnızca CUSTOMER) | KISMİ | `page.tsx:10-13` | Giriş yapmış BUSINESS/ADMIN kullanıcısı da `/auth/signin`'e atılıyor; "yetkin yok" yerine giriş ekranı görünüyor. |
| 2 | Sayfa metadata başlığı | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Şablon `%s \| Müşteri alanı` → "Güven Birleştir \| QRateX \| Müşteri alanı" (çift sonek). |
| 3 | Masaüstü sayfa başlığı + açıklama | KISMİ | `page.tsx:17-20`, `page-heading.tsx:21` | Yalnızca `sm`+ görünüyor. Başlıkta emoji (`🔢`) var; ekran okuyucu "giriş sayıları" diye okur. Açıklama, kabuktaki açıklama ve ipucu şeridiyle aynı cümle (bkz. #5). |
| 4 | Giriş ekranı: süzülen emoji, oyun adı, açıklama | KISMİ | `trust-merge-game.tsx:271-274`, `game-shell.tsx:173-184` | Statik registry'den (`DEF`) geliyor; admin'in `MiniGameConfig` başlık/emoji/renk/açıklama override'ı bu sayfaya yansımıyor (hub'a yansıyor: `status/route.ts:39-48`). |
| 5 | Başlangıç ipucu şeridi (`startHint`) | ÇALIŞIYOR | `minigame-copy.ts:188`, `game-shell.tsx:185-188` | "Aynı … rozetleri kaydırıp birleştir! 2 → 4 → 8…" cümlesi `page.tsx:19`, `minigame-config.ts:300-301` ve burada; üç kez tekrar. |
| 6 | Başlat düğmesi ("🔢 Birleştir", nabız halkası) | KISMİ | `minigame-copy.ts:187`, `game-shell.tsx:189-208` | Bugün oynamış kullanıcıya da gösteriliyor; kilit ekranı ancak tıklamadan sonra geliyor (`use-mini-game.ts:48,64-67`). |
| 7 | Haftalık turnuva: geri sayım ve ödül havuzu | ÇALIŞIYOR | `game-tournament.tsx:116-119,143-147`, `tournament-core.ts:13` | — |
| 8 | Haftalık turnuva sıralaması (ilk 10 + kendi sıram) | KISMİ | `tournament/route.ts:28-39` | Yalnızca `completed` (yani karo ≥ 256) oturumlar sayılıyor ve skor = en yüksek karo; sıralamada yalnızca 4 olası değer var. İkincil anahtar yok, eşitlerin sırası belirsiz (B2). Açık temada koyu-üstüne-koyu metin (`game-tournament.tsx:116,143,151`). |
| 9 | Turnuva: geçen haftanın ödülünü al | KISMİ | `tournament/route.ts:128-193`, `game-tournament.tsx:6`, `admin-toast.ts:17,19` | Claim atomik; ama sıra her istekte yeniden hesaplanıyor (B2) ve müşteri toast'ı "Basarili: / Dikkat:" yönetici ön ekiyle çıkıyor. |
| 10 | Tüm zamanlar liderlik tablosu | KISMİ | `leaderboard/route.ts:47-80`, `game-leaderboard.tsx:31-60` | Aynı dört kademe sorunu; `take: 100` sonrası sıra `null`; ağ hatası "Henüz skor yok" boş durumu gibi görünüyor (`.catch(() => {})`). |
| 11 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | Bu oyun için `loadingStart/loadingSubmit` kişilik metni yok, varsayılan metin. |
| 12 | Oturum açma ve günlük tek hak (`/start`) | KISMİ | `start/route.ts:51-74` | `active` oturum aynı `sessionId` ile tekrar veriliyor; yenileyen kullanıcı yeni rastgele tahtayla sınırsız deneme yapabiliyor (B3). |
| 13 | "Bugün oynadın" kilit ekranı | KISMİ | `game-shell.tsx:308-332`, `start/route.ts:57` | Yalnızca `completed` kilitliyor; `failed` kilitlenmiyor (bkz. #36). "Her gün 00:00 (UTC) sıfırlanır" TR saatiyle 03:00. |
| 14 | Birleşim puanı göstergesi (`TrendingUp`) | KISMİ | `trust-merge-game.tsx:154-156,284-286` | Gösteriliyor ama etiketsiz ve hiçbir yere gönderilmiyor/kaydedilmiyor (`finish` yalnızca `bestRef` alıyor, `:127`). Kullanıcı için anlamı belirsiz bir sayı. |
| 15 | "Hedef karo: 256" göstergesi | KISMİ | `trust-merge-game.tsx:287` | Statik `DEF.rewardThreshold`; admin eşiği değiştirirse yanlış hedef gösterir (B4). |
| 16 | En yüksek karo göstergesi (`Trophy`) | KISMİ | `trust-merge-game.tsx:106,110,259-261,288-290` | Başlangıçta sabit 2; açılışta %10 olasılıkla 4 karosu doğsa da ilk hamleye kadar "2" yazıyor. |
| 17 | 4×4 boş hücre ızgarası | ÇALIŞIYOR | `trust-merge-game.tsx:305-309` | — |
| 18 | Karoların hücrelere hizalanması | KISMİ | `trust-merge-game.tsx:305,316-332` | Izgara `gap-2.5` (10 px) ile, karolar `25% − 7px` + 3,5 px margin ile konumlanıyor; iki sistem farklı. Karo, 1. sütunda hücreden 4 px sağa taşar, 4. sütunda 4 px sola kayar (hesapla doğrulandı, ekranda ölçülmedi). `${t.c * 0}px` ölü telafi kodu. |
| 19 | Karo renk paleti (2 → 2048) | KISMİ | `trust-merge-game.tsx:30-45` | Değer büyüdükçe ısınan tutarlı palet. 2048 karosu `#b8860b` üstünde `#fff8e0` ≈ 3,1:1, 16,8 px kalın metin için AA (4,5:1) altında. |
| 20 | Kaydırma + birleştirme mantığı (`slide`) | ÇALIŞIYOR | `trust-merge-game.tsx:62-100` | Standart 2048 kuralları: bir karo tek hamlede bir kez birleşir (`i += 2`), ileri yönde ters sıralama doğru. |
| 21 | Yeni karo üretimi (%90 → 2, %10 → 4) | ÇALIŞIYOR | `trust-merge-game.tsx:54-59` | İstemcide `Math.random`; sunucuda doğrulanamıyor (B5). |
| 22 | Hareketsiz hamlede yeni karo yok | ÇALIŞIYOR | `trust-merge-game.tsx:147-148` | — |
| 23 | Karo kayma animasyonu (spring, `left/top`) | KISMİ | `trust-merge-game.tsx:318-326` | Layout özelliği canlandırılıyor (transform değil). Birleşip yutulan karo listeden hemen çıkarıldığı ve `exit` tanımlı olmadığı için kayarak değil, eski yerinde anında kayboluyor (`:80-84`, `:313`). |
| 24 | Doğuş animasyonu (scale 0 → 1) | ÇALIŞIYOR | `trust-merge-game.tsx:320` | Kayma ile eşzamanlı başlıyor; klasik 2048'de doğuş kaymadan sonra gelir, okunabilirlik açısından daha iyi. |
| 25 | Birleşme "pop" animasyonu | ÇALIŞIYOR | `trust-merge-game.tsx:322` | — |
| 26 | Klavye kontrolü (oklar + WASD) | KISMİ | `trust-merge-game.tsx:206-221` | Büyük harf (`W/A/S/D`, Caps Lock) eşlenmemiş. Kilit sırasında basılan tuş sessizce yutuluyor (#28). |
| 27 | Dokunmatik kaydırma (24 px eşik) | ÇALIŞIYOR | `trust-merge-game.tsx:224-251,296` | `touch-none` + `touchmove` `preventDefault` ile sayfa kayması engelleniyor. |
| 28 | Hamle kilidi (130 ms) | KISMİ | `trust-merge-game.tsx:146,149,192-194` | Girdi tamponu yok; hızlı oynayan (saniyede 6+ hamle) kullanıcının hamleleri kaybolur. |
| 29 | Mobil yön tuşları (D-pad) | KISMİ | `trust-merge-game.tsx:362-369,375-386` | Çalışıyor; `aria-label` yok, ekran okuyucu "siyah yukarı üçgen" okur. `sm:hidden` olduğundan 640 px+ dokunmatik tabletlerde yok (kaydırma var). |
| 30 | Yeni rekor karo kutlaması (≥ 64: fanfar, şok dalgası, konfeti) | ÇALIŞIYOR | `trust-merge-game.tsx:163-178` | FxLayer `reduce-animations`'a uyuyor (`fx-layer.tsx:44-47`). |
| 31 | Ses efektleri | KISMİ | `trust-merge-game.tsx:154-161`, `game-sounds.ts:59-73` | Birleşmesiz her sıradan hamlede "power-up" sesi (0,28 sn testere dişi sweep) çalıyor; birleşme sesinden uzun ve baskın. Ayrı ses kapatma düğmesi yok. |
| 32 | Titreşim | ÇALIŞIYOR | `trust-merge-game.tsx:158,174`, `game-sounds.ts:158-165` | — |
| 33 | 2048'e ulaşınca otomatik bitiş | ÇALIŞIYOR | `trust-merge-game.tsx:180-186` | "Devam et" seçeneği yok; 400 ms boyunca `runningRef` açık kaldığı için hamle yapılabiliyor (zararsız). |
| 34 | Tahta dolunca oyun sonu (`canMove`) | ÇALIŞIYOR | `trust-merge-game.tsx:132-142,187-191` | — |
| 35 | "Bitir & Ödülü Al" / "Bitir" (kasala) düğmesi | KISMİ | `trust-merge-game.tsx:200-203,349-359` | Onay yok; eşik altında basılırsa oturum `failed` olur ve günün hakkı yanar. Mobilde arena ile D-pad arasında, yanlış dokunmaya açık (B1). |
| 36 | Kaybettikten / erken bitirdikten sonra aynı gün tekrar oynama | BOZUK | `complete/route.ts:98-109`, `start/route.ts:56-73` | `failed` oturum için `/start` `canPlay:true` dönüyor, kullanıcı dakikalarca oynuyor, `/complete` `status:'active'` aradığı için 409 "Oyun zaten tamamlandı" dönüyor (B3). |
| 37 | Kazanma kararı (istemcide eşik) | KISMİ | `trust-merge-game.tsx:13,189,202`, `use-mini-game.ts:70` | `/start`'ın döndürdüğü etkin `config` okunmuyor; `won` statik eşikle hesaplanıyor (B4). |
| 38 | Sonuç gönderimi: ödül, seri, başarım (`/complete`) | ÇALIŞIYOR | `complete/route.ts:96-175` | Atomik claim + `points_credited` + `GameStreakClaim` doğru. Bildirim transaction dışında ve try'sız (`:185-194`); hata olursa puan yazılmış olsa da 500 döner. |
| 39 | Sonuç ekranı: kupa/kurukafa + rastgele başlık | KISMİ | `minigame-copy.ts:189-190`, `game-shell.tsx:78-84` | Kullanıcı eşik altında kendi isteğiyle "Bitir"e basınca da "Hamle Kalmadı / Tahta Doldu" başlığı çıkıyor; yanlış anlatım. |
| 40 | Sonuç skor etiketi ("En yüksek rozet") | ÇALIŞIYOR | `minigame-copy.ts:191`, `game-shell.tsx:269-272` | Değer doğru (en yüksek karo). Terim, oyun içindeki "karo" ile tutarsız. |
| 41 | Ödül hapı / eşik notu | KISMİ | `game-shell.tsx:274-294` | `rewardMissNote` tanımsız → "Ödül için 256 skor gerekiyordu" (karo değil "skor"); eşik statik `DEF`'ten. |
| 42 | Ödülde konfeti | ÇALIŞIYOR | `game-shell.tsx:86-94` | `reduce-animations`'a uyuyor, OS `prefers-reduced-motion`'a uymuyor. |
| 43 | Toast'lar (ödül, seri, başarım) | ÇALIŞIYOR | `use-mini-game.ts:112-125` | Sonuç kartıyla aynı bilgiyi tekrarlıyor; 3–4 toast üst üste binebiliyor. |
| 44 | Uygulama içi bildirim kaydı | ÇALIŞIYOR | `complete/route.ts:185-212` | — |
| 45 | Sonuç ve kilit ekranında liderlik tablosu | ÇALIŞIYOR | `game-shell.tsx:299-303,326-330` | Turnuvadaki yeni sıra sonuç ekranında gösterilmiyor. |
| 46 | Alt ipucu satırı | ÇALIŞIYOR | `trust-merge-game.tsx:370` | 10 px, `text-white/40`; düşük kontrast. |
| 47 | Azaltılmış hareket desteği | KISMİ | `providers.tsx:232`, `fx-layer.tsx:44-47`, `game-shell.tsx:13-16` | OS tercihi yalnızca framer'ı, uygulama tercihi yalnızca FX/ses/konfetiyi etkiliyor; iki ayrı sistem. |
| 48 | Ekran okuyucu / klavye-dışı erişim | EKSİK | `trust-merge-game.tsx:293-346` | Tahtada `role="grid"`/`aria-label` yok; hamle sonrası `aria-live` duyurusu yok; kör kullanıcı tahtayı bilemez. |
| 49 | Yenilemede tahtanın korunması | EKSİK | `trust-merge-game.tsx:253-267` | Tahta yalnızca bellekte; yanlışlıkla yenileme 5–10 dakikalık oyunu siler (B3). |
| 50 | Sunucu tarafı skor doğrulama | EKSİK | `complete/route.ts:15-22,59-61,80-87` | Skor ve `won` istemciden; 2 kuvveti olup olmadığı bile kontrol edilmiyor; `minDurationSec: 12` (`minigame-config.ts:308`) 256'ya gerçekçi süreyle ilgisiz (B5). |
| 51 | Kişisel rekor (en iyi puan / karo) | EKSİK | — | Klasik 2048'in "BEST" kutusu yok; yalnızca küresel tabloda dolaylı. |
| 52 | Geri al (undo) / ipucu | EKSİK | — | Tasarım tercihi olabilir; ödüllü günlük modda bile tek "geri al" jetonu yaygın bir kalıp. |
| 53 | Hub'a dönüş / "sıradaki oyun" | EKSİK | `page.tsx:16-22`, `game-shell.tsx:295-303` | Sonuç ekranı çıkmaz sokak. |
| 54 | Sonucu paylaşma | EKSİK | — | — |
| 55 | Admin'in kapattığı oyunun ele alınması | KISMİ | `start/route.ts:34-39` | Sayfa açılıyor; kullanıcı ancak başlata basınca "Bu oyun şu anda kullanılamıyor" görüyor. |

**Sayım:** ÇALIŞIYOR 21 · KISMİ 26 · BOZUK 1 · SAHTE 0 · EKSİK 7 (toplam 55)

---

## Bulgular

### B1. Onaysız "Bitir" düğmesi tek dokunuşta günün tek hakkını yakıyor
- **Önem:** yüksek · **Kategori:** UX / veri bütünlüğü
- **Kanıt:**
  - `trust-merge-game.tsx:200-203`: `cashOut` doğrudan `endGame(best >= threshold)` çağırıyor; onay yok.
  - `trust-merge-game.tsx:349-359`: düğme arena ile D-pad arasında (`mt-3`), tam genişlik (`max-w-[340px]`), eşik altındayken de tıklanabilir.
  - `trust-merge-game.tsx:362-369`: D-pad hemen altında, `mt-3`.
  - `complete/route.ts:101`: `won=false` → `status:'failed'`; `start/route.ts:56-73` ile birleşince bu gün için ödül imkânı biter.
- **Sorun:** 2048 uzun soluklu bir oyun (256'ya ulaşmak en az ~115 hamle). Mobilde kullanıcı başparmağıyla D-pad'e basarken bir üstteki "Bitir"e değerse, onay olmadan oyun kayıpla kapanır. Eşik altındaki "Bitir (henüz 256 karo yok)" düğmesinin ürün değeri de belirsiz: kayıpla bitirmenin kullanıcıya bir faydası yok.
- **Profesyonel öneri:**
  - Eşik altında düğmeyi tamamen gizleyin ya da devre dışı bırakın ("256'ya X adım kaldı" ilerleme çubuğuna dönüştürün). Eşik geçildiğinde düğme ortaya çıksın.
  - Eşik üstünde de "uzun bas" (600 ms dolum halkası) ya da iki aşamalı onay ("Bitir → Emin misin? Daha yükseğe çıkabilirsin") kullanın; Revolut'un "basılı tut ve onayla" kalıbı.
  - Düğmeyi D-pad'den uzağa, skor şeridinin sağına (üst) taşıyın; kontrol bölgesi yalnızca yön girdisine ayrılsın.
- **Efor:** S

### B2. Sıralama yalnızca en yüksek karoya göre: liderlik ve turnuva dört kademeye çöküyor, ödül belirsiz dağılıyor
- **Önem:** yüksek · **Kategori:** ekonomi / oyun tasarımı
- **Kanıt:**
  - `trust-merge-game.tsx:126-127`: sunucuya `bestRef` (en yüksek karo) gönderiliyor; birleşim puanı (`scoreRef`) atılıyor.
  - `leaderboard/route.ts:47-53` ve `tournament/route.ts:29-35`: `where status:'completed'`, `orderBy _max.starsCollected desc`, ikincil anahtar yok.
  - `complete/route.ts:101`: `completed` yalnızca `won=true` iken; `won` = karo ≥ 256 (`trust-merge-game.tsx:189,202`). Yani tabloya girebilecek değerler yalnızca 256, 512, 1024, 2048.
  - `tournament/route.ts:141-147`: claim sırasında geçen haftanın sırası yeniden hesaplanıyor; `TournamentRewardClaim` tekilliği kullanıcı başına, sıra başına değil.
- **Sorun:** Pratikte oyuncuların çoğu 256 veya 512'de toplanır. Haftalık turnuvada 512'ye ulaşan N kişi arasında ilk 3'ü Postgres'in belirsiz grup sırası belirler; GET'te "1. oldun" gören kullanıcı POST'ta 400 alabilir, sıralama isteklere göre değişirse 3'ten fazla kişi ilk 3 ödülünü (500/300/150) talep edebilir (SQL semantiğinden çıkarım; canlıda gözlenmedi). Liderlik tablosu da oyuncuya ilerleme hissi vermiyor: "512" yapan 40 kişi aynı satırda.
- **Profesyonel öneri:**
  - 2048'in doğal sıralama ölçüsü **birleşim puanı**dır (klasik "SCORE"). Sıralama anahtarı puan olsun, en yüksek karo ödül eşiği ve başarım için kalsın. `MiniGameSession`'a `meta Json?` (ör. `{ mergeScore, maxTile, moves }`) ekleyin ya da `starsCollected` = puan, `meta.maxTile` = karo yapın; ödül hesabı `meta.maxTile` üzerinden.
  - Sıralama deterministik olsun: puan DESC → `completedAt` ASC → `userId`. `groupBy` yerine `DISTINCT ON (userId)` ile `$queryRaw`.
  - Turnuva ödülü hafta kapanınca cron ile dondurulup `TournamentResult(weekKey, gameType, rank UNIQUE)` tablosuna yazılsın; claim bu tablodan yapılsın (proje ilkesi: atomik tek-claim, cron fail-closed).
  - Kayıp oturumların puanı da (eşik altı) kişisel istatistik için saklanabilir; liderlik yalnızca `completed` kalsın.
- **Efor:** M

### B3. Günlük tek hak iki yönden kırık: yenilemede tahta kayboluyor (ve yeniden çekiliyor), kaybedene boşa oyun oynatılıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / UX
- **Kanıt:**
  - `start/route.ts:56-73`: yalnızca `completed` kilitli; `active` ve `failed` için `canPlay:true` + aynı `sessionId`.
  - `trust-merge-game.tsx:253-267`: tahta her `playing` girişinde sıfırdan, `Math.random` ile kuruluyor; hiçbir yerde saklanmıyor.
  - `complete/route.ts:98-109`: `updateMany where status:'active'` → `failed` oturum için 0 → 409 "Oyun zaten tamamlandı".
  - `status/route.ts:32-33`: hub yalnızca `completed` olanı "oynandı" sayıyor.
- **Sorun:**
  1. **Dürüst kullanıcı kaybı:** Yanlışlıkla yenileme, PWA'nın arka plandan yeniden yüklenmesi ya da sekme kapanması 5–10 dakikalık tahtayı siler.
  2. **Açık:** Aynı mekanizma kötü bir başlangıcı "yeniden çekmeye" yarar: kullanıcı tahta kötü gidince yeniler, yeni rastgele tahtayla aynı oturuma devam eder; `startedAt` eski kaldığı için süre kontrolü de engel değil. Günlük tek hak fiilen sınırsız.
  3. **Boşa oyun:** Eşik altında biten (`failed`) oturumdan sonra hub kartı "oynanmadı" görünür, başlat çalışır; kullanıcı yeni bir tahtada dakikalarca oynayıp sonunda 409 ve 0 ödüllü sonuç görür. 2048'in uzunluğu bu hatayı diğer oyunlardan çok daha pahalı yapıyor.
- **Profesyonel öneri:**
  - Sunucu `/start`'ta bir **tohum (seed)** üretip oturuma yazsın; istemci karo doğuşlarını bu tohumlu PRNG (ör. mulberry32) ile üretsin. Böylece yenilemede aynı tahta gelir, "yeniden çekme" anlamsızlaşır.
  - Tahta durumu (hamle dizisi) `sessionStorage`'a ve periyodik olarak sunucuya (`PATCH /games/trust-merge/progress`, ör. her 20 hamlede) yazılsın; yenilemede "Kaldığın yerden devam et" ile geri yüklensin. Hamle dizisi + tohum, tahtayı birebir yeniden üretir.
  - `failed` (ve yeni `abandoned`) durumları da kilit sayılsın; `/start` yanıtı `{ canPlay:false, reason:'lost'|'completed', lastScore }` dönsün, hub sorgusu `status in (...)` olsun.
  - Sayfa sunucu bileşeni bugünkü oturumu önceden okuyup `GameShell`'e `initialLockState` geçsin; kilit tıklamadan önce görünsün.
- **Efor:** M

### B4. İstemci admin override'ını yok sayıyor; yanlış `won` bayrağı hak edilen ödülü kesebiliyor
- **Önem:** orta · **Kategori:** mimari / veri bütünlüğü
- **Kanıt:**
  - `trust-merge-game.tsx:13`: `DEF = getMiniGame('trust-merge')!` (statik registry).
  - `trust-merge-game.tsx:180,189,202,278,287,353,358,370`: eşik ve tavan hep `DEF`'ten.
  - `use-mini-game.ts:69-70`: `/start`'ın etkin `config`'i saklanıyor ama bileşen okumuyor.
  - `complete/route.ts:86-87,101`: `eligible = won && !tooFast`; `won=false` → `failed`.
  - `minigame-config-effective.ts:40-57`: admin `rewardThreshold`, `maxScore`, başlık, emoji, renk ezebiliyor.
- **Sorun:** Admin eşiği 128'e indirirse 128'e ulaşan oyuncu istemcide `won=false` gönderir; sunucu eşiği geçmiş olsa bile ödül vermez ve oturumu `failed` yapar. Eşik 512'ye çıkarılırsa 256'da "✅ Bitir & Ödülü Al" düğmesi parlar, basan kullanıcı kupa ekranı ve "ödül eşiğini geçemedin" toast'ını aynı anda görür. `maxScore` 1024'e düşürülürse oyun 2048'i bekler ama sunucu 1024'e kırpar.
- **Profesyonel öneri:** `won` kararını sunucuya taşıyın: istemci yalnızca hamle günlüğü/puan göndersin, sunucu `won = maxTile >= effective.rewardThreshold` hesaplayıp yanıtta dönsün. `page.tsx` sunucu bileşeni `getEffectiveMiniGame('trust-merge')` ile etkin tanımı alıp `TrustMergeGame`'e prop geçsin; `enabled=false` ise bakım ekranı SSR'da gösterilsin.
- **Efor:** S–M

### B5. Skor tamamen istemciden geliyor; 2048 ise sunucuda ucuza doğrulanabilir
- **Önem:** yüksek · **Kategori:** güvenlik / ekonomi
- **Kanıt:**
  - `complete/route.ts:15-22,59-61`: `score` 0–10000 tamsayı, `won` boolean, istemciden; yalnızca `maxScore`'a kırpılıyor. 2'nin kuvveti olup olmadığı bile kontrol edilmiyor.
  - `complete/route.ts:80-87`: tek savunma süre; `minigame-config.ts:308`: `minDurationSec: 12`.
  - `minigame-config.ts:306-307`: 170 puan + 85 XP (katalogdaki en yüksek ödüllerden).
- **Sorun:** `POST /start`, 12 saniye bekleme, `POST /complete {score:2048, won:true, durationSec:12}` her gün 170 puan + 85 XP verir ve kullanıcıyı tüm zamanlar ve haftalık turnuvada zirveye taşır (turnuvada +500 puan). Oysa 256 karosuna ulaşmak tahtadaki toplamın ≥ 256 olmasını, yani en az ~60 (hepsi 4 doğsa) ve gerçekçi olarak ~115 hamle gerektirir; 2048 için ~930+ hamle. 12 saniyelik eşik bu oyun için anlamsız.
- **Profesyonel öneri:**
  - 2048 deterministik bir oyundur: **tohum + hamle dizisi** (`'ULDR…'`, 2 bit/hamle; 1000 hamle ≈ 250 bayt) sunucuya gönderilsin, sunucu aynı `slide` + PRNG mantığını (paylaşılan saf modül `lib/games/trust-merge-core.ts`) çalıştırıp puanı ve en yüksek karoyu **kendisi** hesaplasın. İstemci kodu ile sunucu aynı çekirdeği kullanır; hile yapmak için oyunu gerçekten oynamak gerekir.
  - Ek makullük kontrolü: `hamle sayısı × 80 ms ≤ sunucu süresi` (insan üstü hız reddi).
  - Kısa vadeli yama: `score` 2'nin kuvveti olmalı ve `minDurationSec` karo değerine göre ölçeklensin (ör. `maxTile / 4` saniye).
  - Sistem geneli: oyunlar için kullanıcı başına günlük puan tavanı (`lib/points-caps`).
- **Efor:** M (bu oyun için; çekirdek zaten saf fonksiyon)

### B6. Karo hareketi görsel olarak "2048" hissini veremiyor: hizasızlık, anında kaybolan karo, eşzamanlı doğuş
- **Önem:** orta · **Kategori:** görsel / motion
- **Kanıt:**
  - `trust-merge-game.tsx:305`: arka plan ızgarası `gap-2.5` (10 px).
  - `trust-merge-game.tsx:316-332`: karo `left = c·25%`, `width = 25% − 7px`, `margin 3.5px`. Hücre başlangıcı `c·25% + 2,5c px`; karo başlangıcı `c·25% + 3,5 px` → sütun 0'da +3,5 px, sütun 3'te −4 px kayma. `${t.c * 0}px` (`:323-324`) ölü, telafi edilmemiş kod.
  - `trust-merge-game.tsx:80-84`: birleşmede ikinci karo diziden düşürülüyor; `AnimatePresence` içinde `exit` yok (`:313-341`) → yutulan karo eski yerinde anında kayboluyor.
  - `trust-merge-game.tsx:150-152`: yeni karo, kayma ile aynı render'da ekleniyor.
- **Sorun:** Klasik 2048'in tatmini "iki karonun aynı hücreye kayıp tek karoya dönüşmesi"dir. Burada biri kayıyor, diğeri yok oluyor; yeni karo da kayma sırasında beliriyor, göz hamleyi takip edemiyor. Hücre ile karo arasındaki 4 px'lik kayma, tahtanın kenarlarında boş hücre parlamasının bir tarafta görünmesine yol açıyor (hesapla doğrulandı; ekranda ölçülmedi, görsel doğrulama tezgâhında ölçülmeli).
- **Profesyonel öneri:**
  - Konumu piksel tabanlı tek bir sistemle hesaplayın: `cell = (W − 3·gap)/4`, `x = c·(cell + gap)`; karo `transform: translate3d(x, y, 0)` ile hareket etsin (`Motion` `x/y`), `left/top` değil (layout yerine compositor).
  - Birleşme iki fazlı olsun: (1) her iki karo hedef hücreye kayar (120 ms, `ease-out`), (2) yutulan karo `exit` ile kaybolur, birleşen karo `scale [1, 1.15, 1]` yapar ve yeni değeri alır. Bunun için `slide` birleşen karonun `mergedFrom: [idA, idB]` bilgisini döndürsün.
  - Yeni karo 100 ms gecikmeyle (`transition.delay`) doğsun.
  - `prefers-reduced-motion`'da süreler 0'a insin, yalnızca renk değişimi kalsın.
- **Efor:** M

### B7. Girdi modeli hızlı oyuncuyu cezalandırıyor ve her hamlede dinleyiciler yeniden bağlanıyor
- **Önem:** orta · **Kategori:** UX / mimari
- **Kanıt:**
  - `trust-merge-game.tsx:146,192-194`: kilit açıkken gelen hamle `return` ile atılıyor; kuyruk yok.
  - `trust-merge-game.tsx:119-130`: `endGame` bağımlılığı `[game]`; `use-mini-game.ts:137` her render'da yeni nesne döndürüyor → `endGame` ve ona bağlı `doMove` (`:196`) her render'da yeniden oluşuyor → klavye (`:206-221`) ve dokunma (`:224-251`) effect'leri her hamlede söküp yeniden kuruluyor.
  - `trust-merge-game.tsx:209-212`: yalnızca küçük harf `w/a/s/d`.
- **Sorun:** Deneyimli 2048 oyuncuları saniyede 6–10 hamle yapar; 130 ms kilit bu hamlelerin bir kısmını sessizce yutar ve "tuş tepki vermiyor" hissi yaratır. Dinleyici yeniden bağlama şu an zararsız ama kırılgan: bir jest sırasında render olursa yeni `touchend` dinleyicisi `sx/sy = 0` ile yanlış yön hesaplar.
- **Profesyonel öneri:** Tek elemanlı bir girdi tamponu (son basılan yön) tutun; kilit açılınca tampondaki hamleyi uygulayın. `endGame` bağımlılığını kararlı `game.finish`'e indirin (ya da `useEffectEvent` benzeri bir ref kalıbı). Klavye eşlemesini `e.key.toLowerCase()` ve `e.code` (`KeyW` …) üzerinden yapın; Türkçe klavyede de çalışır.
- **Efor:** S

### B8. Terim ve metin karmaşası: "rozet", "karo", "skor" aynı şeyi anlatıyor; kendi isteğiyle bitirene "Hamle Kalmadı" deniyor
- **Önem:** orta · **Kategori:** UX / dil
- **Kanıt:**
  - `page.tsx:19`, `minigame-config.ts:300-301`, `minigame-copy.ts:188,191`: "rozet", "En yüksek rozet".
  - `trust-merge-game.tsx:287,358,370`: "Hedef karo", "256 karo", "karosuna".
  - `game-shell.tsx:291-292`: `rewardMissNote` yok → "Ödül için 256 **skor** gerekiyordu".
  - `minigame-copy.ts:190`: `loseTitles: ['Tahta Doldu', 'Hamle Kalmadı', 'Rozetler Sıkıştı']`, `cashOut` (`trust-merge-game.tsx:200-203`) ile de gösteriliyor.
  - `trust-merge-game.tsx:284-290`: iki sayı (puan ve en yüksek karo) etiketsiz.
- **Sorun:** Qratex'te "rozet" gerçek bir ürün kavramı (karakter rozeti koleksiyonu, `/customer/badges`). Oyunda sayılı karolara "rozet" denmesi kullanıcıya bu oyunun rozet kazandırdığını düşündürebilir. Oyun içi şeritte hangi sayının ödülü belirlediği anlaşılmıyor.
- **Profesyonel öneri:** Tek bir sözlük seçin: "karo" (oyun nesnesi) + "puan" (birleşim toplamı) + "güven seviyesi" (anlatı). Karolara anlatı katmanı vermek isteniyorsa değerleri "Güven seviyesi 8" gibi etiketleyin, "rozet" kelimesini kullanmayın. Üst şerit iki etiketli istatistik kartı olsun: `PUAN 1.284` · `EN İYİ KARO 128 / 256` (eşiğe ilerleme çubuğu ile). `trust-merge` için `rewardMissNote` ("256 karosuna ulaşamadın; en iyin 128 oldu") ve `cashOut` için ayrı bir sonuç başlığı tanımlayın; `finish` bir `reason: 'board_full'|'cash_out'|'max_tile'` taşısın.
- **Efor:** S

### B9. Sıra tabanlı oyunda gereksiz sürekli çizim ve layout animasyonu
- **Önem:** düşük · **Kategori:** performans / mobil pil
- **Kanıt:**
  - `fx-layer.tsx:79-158`: parçacık olmasa da her karede `clearRect` ve `requestAnimationFrame` (koşulsuz `:157`).
  - `trust-merge-game.tsx:163-178`: FX yalnızca yeni rekor karo ≥ 64'te tetikleniyor (oyun başına ~3–5 kez).
  - `trust-merge-game.tsx:321-325`: `left/top` animasyonu.
- **Sorun:** 2048 oturumu 5–15 dakika sürer; bu süre boyunca boş bir canvas saniyede 60 kez temizleniyor. Mobilde pil ve ısınma maliyeti var; layout animasyonu düşük uçlu Android'de takılmaya açık.
- **Profesyonel öneri:** FxLayer parçacık listesi boşalınca RAF'ı durdursun, `burst/shockwave/confettiAt` çağrısında yeniden başlatsın (tüm oyunlara fayda). Karo hareketi transform'a taşınsın (B6).
- **Efor:** S

### B10. Erişilebilirlik: tahtanın metin karşılığı yok, kontrast ve ses kontrolü zayıf
- **Önem:** orta · **Kategori:** erişilebilirlik
- **Kanıt:**
  - `trust-merge-game.tsx:293-346`: tahta ve karolar yalnızca görsel `div`; rol/aria yok.
  - `trust-merge-game.tsx:375-386`: D-pad düğmeleri `aria-label`'sız, içerik "▲◀▼▶".
  - `trust-merge-game.tsx:41,334`: 2048 karosu ≈ 3,1:1 kontrast, 16,8 px.
  - `trust-merge-game.tsx:370`: 10 px `text-white/40`.
  - `game-sounds.ts:10-13,158-160`: ses ve titreşim yalnızca `reduce-animations` ile kapanıyor.
- **Sorun:** Sıra tabanlı ve zamansız olduğu için 2048, erişilebilir yapılabilecek en uygun oyunlardan biri; şu an ekran okuyucu kullanıcısı tahtayı hiç algılayamıyor.
- **Profesyonel öneri:**
  - Tahta `role="grid"` + `aria-label="Güven Birleştir tahtası, 4 x 4"`, her hücre `role="gridcell"` + `aria-label="Satır 2 sütun 3: 64"` (boşsa "boş").
  - Her hamle sonrası `aria-live="polite"` bölgede kısa özet: "Sola kaydırdın. 32 + 32 birleşti → 64. Puan 1.284."
  - D-pad'e `aria-label="Yukarı kaydır"` vb.
  - 2048 karosu için daha koyu bir altın (`#8a6508`) ya da koyu metin.
  - `GameShell` başlığında ayrı ses ve titreşim düğmeleri (localStorage).
  - İpucu metni en az 12 px, `white/60`.
- **Efor:** M

### B11. Paylaşılan katmanda kalan sorunlar (bu sayfayı da etkiliyor)
- **Önem:** düşük–orta · **Kategori:** hata yönetimi / görsel / dil
- **Kanıt ve sorun:**
  - `complete/route.ts:185-194`: ödül bildirimi transaction dışında, try'sız; hata olursa puan yazılmış hâlde 500 → istemci "0 ödül" gösterir (`use-mini-game.ts:126-128`), tekrar denemede 409.
  - `game-tournament.tsx:6` + `admin-toast.ts:17,19`: müşteri toast'ı "Basarili: …" ön ekiyle (ş eksik).
  - `game-tournament.tsx:116,143,151`: `text-muted-foreground` her zaman koyu olan kabuk zemininde (`game-shell.tsx:101-102`); açık temada okunmuyor.
  - `game-leaderboard.tsx:31-41`: fetch hatası yutuluyor, "Henüz skor yok" boş durumu gösteriliyor.
  - `start/route.ts:44`: `'Unauthorized'` İngilizce metin toast'a düşebilir (`use-mini-game.ts:62,75`).
  - `game-shell.tsx:323`: "00:00 (UTC)".
- **Profesyonel öneri:** Bildirim `after()` ile best-effort; toast doğrudan `sonner`'dan; kabuk için `--arena-fg/--arena-muted` token seti; liderlikte ayrı hata durumu + "Tekrar dene"; hata metinleri Türkçe; sıfırlama saati yerel saatle ve geri sayımla ("Yeni hak: 3 sa 12 dk").
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kişisel rekor ve ilerleme:** Klasik 2048'in "BEST" kutusu ve Duolingo'nun "kişisel en iyi" vurgusu. "En iyi puanın 4.120 · bugün 2.880 · en iyi karo 512" ve son 7 günün mini grafiği. Şu an kullanıcının kendine karşı ölçüsü yok.
2. **Kaldığın yerden devam:** Uzun oturumlu bir oyunda yenilemeye dayanıklı kayıt (tohum + hamle dizisi). Mobil uygulamalarda (Monzo/Revolut hissi) arka plana alınan oturum asla kaybolmaz.
3. **Geri al jetonu:** Günlük modda tek "geri al" hakkı ya da puanla satın alınan jeton (puan ekonomisinde harcama kanalı; escrow/net-sıfır ilkesine uygun tasarlanmalı).
4. **Bir sonraki adım ve paylaşım:** Sonuç ekranında "Sıradaki oyun" önerisi ve Spotify Wrapped tarzı paylaşılabilir kart (puan, en iyi karo, hamle sayısı, haftalık sıra; `next/og`), referral linkiyle.
5. **Günlük meydan okuma (Wordle modeli):** Herkese aynı tohum → aynı başlangıç ve karo dizisi; "bugünün tahtasında herkes arasında %12'lik dilimdesin" karşılaştırması. Tohum altyapısı (B3/B5) bunu bedavaya getirir ve turnuvayı adil kılar.
6. **Ses/titreşim tercihleri ve öğretici:** Ayrı ses düğmesi; ilk girişte 3 hamlelik etkileşimli öğretici (ödülsüz).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Günün Güven Tahtası": 5–10 dakikalık, sakin ama tatmin edici bir günlük bulmaca ritüeli. Kullanıcı sayfaya girdiğinde durumunu anında görür (oynanabilir / devam eden tahta / bugün tamamlandı + yeni hakka kalan süre). Herkes aynı tohumla oynar; sonuç kartı kişisel rekorla ve topluluk dağılımıyla kıyaslar, ödülleri sırayla açar.

**Yerleşim (mobil öncelikli):**
- Üst şerit (sticky, `top: env(safe-area-inset-top)`): `PUAN` · `EN İYİ KARO` + 256'ya ilerleme halkası · `REKORUN`. Eşik geçildiğinde halka dolar ve sağ üstte "Bitir & ödülü al" (uzun bas) belirir.
- Tahta: tam genişlik, `min(92vw, 420px)` kare, piksel tabanlı konumlama.
- Alt bölge yalnızca girdi: kaydırma alanı tahtanın kendisi; D-pad isteğe bağlı (ayarlarda "yön tuşlarını göster"), "Bitir" asla burada değil.
- Giriş ekranı: tek cümlelik açıklama (tekrarsız), "Devam et" / "Başla" CTA'sı, kişisel rekor çipi, sekmeli sıralama kartı (Bu hafta – ödüllü / Tüm zamanlar / Bugünün tahtası).
- Sonuç ekranı: üç istatistik (puan, en iyi karo, hamle), ödül kuyruğu (puan → seri alevi → başarım → haftalık sıra değişimi "↑ 4"), "Paylaş" ve "Sıradaki oyun".

**Motion / 3D (yerinde ve ölçülü):**
- 3D gerekmez; DOM + transform doğru araç. Projede three.js yetkinliği var ama bu oyun için yük ve pil maliyeti haklı değil.
- İki fazlı birleşme (kay → birleş-pop), 100 ms gecikmeli doğuş, 120 ms `ease-out` kayma (B6).
- Rekor karoda (≥ 128) yalnızca karonun etrafında kısa bir ışıma halkası; tam ekran şok dalgası + konfeti yalnızca eşik (256) ve 2048 anında.
- Ses: sıradan hamlede çok kısa, düşük "tık"; birleşmede değerle yükselen ton; power-up sweep kaldırılsın.
- `prefers-reduced-motion` ve uygulama tercihi tek `useReducedFx()` hook'unda birleşsin; framer (`MotionConfig`), FxLayer, konfeti ve ses aynı kaynaktan beslensin.

**Veri / API değişiklikleri:**
1. `lib/games/trust-merge-core.ts`: saf `slide`, `spawn(seed, step)`, `replay(seed, moves) → { score, maxTile, over }`. İstemci ve sunucu aynı modülü kullanır; Jest ile birim testi kolay.
2. `MiniGameSession`: `seed String?`, `meta Json?` (`{ mergeScore, maxTile, moves, endReason }`), `status` değerlerine `abandoned`.
3. `POST /start`: tohum üretir, yanıtta `seed`, etkin `config`, `lockState`, varsa `resume: { moves }` döner. `failed/abandoned` da kilit sayılır.
4. `PATCH /api/customer/games/trust-merge/progress`: hamle dizisini periyodik kaydeder (rate-limit'li, yalnızca `active` oturum, sahiplik kontrolü).
5. `POST /complete`: `{ sessionId, moves }` alır; sunucu `replay` ile puanı ve karoyu hesaplar, `won`'u kendisi belirler, hız makullüğünü kontrol eder; bildirim `after()` ile.
6. Sıralama: `mergeScore DESC, completedAt ASC, userId`; haftalık sonuç cron ile `TournamentResult`'a dondurulur, claim oradan.
7. `GET /api/customer/games/trust-merge/me`: kişisel rekor + son 7 gün (Upstash cache 60 sn).
8. `page.tsx`: `getEffectiveMiniGame` + bugünkü oturum SSR'da; `try/catch` ile "durum bilinmiyor → oynanabilir" varsayılanı.

---

## Çakışmalar / birleştirme önerisi

- **Mekanik çakışma yok:** 20 oyunluk katalogda (`minigame-config.ts:73-344`) başka birleştirme/2048 oyunu yok. `review-stack` (Tetris tarzı istif) ve `signal-pipe` (boru bulmacası) ile birlikte "Strateji/Bulmaca" kategorisinin çekirdeği. Kaldırılmamalı.
- **Kavramsal çakışma:** "Güven rozeti" söylemi `/customer/badges` (karakter rozeti koleksiyonu) ile karışıyor (B8). Oyun içi terimler rozet sisteminden ayrılmalı ya da gerçekten bağlanmalı (ör. 2048'e ulaşmak gerçek bir "Güven Ustası" karakter rozeti kilidi açar; o zaman terim tutarlı hâle gelir).
- **Hub'da kategori:** `games-hub.tsx` oyunları "Refleks / Zekâ / Strateji" kategorilerine ayırmalı; bu oyun "Strateji"de, "Günün Tahtası" etiketiyle öne çıkarılmalı (günlük meydan okuma modeli için en uygun oyun).
- **Paylaşılan katman:** B2 (sıralama/turnuva), B3 (günlük hak), B4 (override), B5 (istemci skoru), B9 (FxLayer RAF) ve B11, `GameShell`, `useMiniGame`, generic `/start`–`/complete`, `GameLeaderboard`, `GameTournament` ve `FxLayer` üzerinden 19 registry oyununun tamamında geçerli. Düzeltmeler oyun bazında değil ortak katmanda yapılmalı; bu oyuna özgü olanlar B1, B6, B7, B8 ve B5'teki hamle-günlüğü doğrulaması.

---

## Doğrulama (şüpheci inceleme)

Yöntem: İddiaların her biri çürütülmeye çalışıldı. Okunan kod: `app/customer/games/trust-merge/page.tsx`, `components/customer/games/trust-merge-game.tsx`, `components/customer/games/game-shell.tsx`, `lib/use-mini-game.ts`, `app/api/customer/games/[game]/start/route.ts`, `.../complete/route.ts`, `.../leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/tournament-core.ts`, `lib/points-wallet.ts`, `prisma/schema.prisma` (`MiniGameSession`, `TournamentRewardClaim`). Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. Günlük tek hak yenilemeyle aşılıyor (tahta yeniden çekme) — **DOĞRULANDI**

- `start/route.ts:56-73`: Bugünün oturumu `completed` değilse (yani `active` ya da `failed`) aynı `sessionId` ile `canPlay: true` dönüyor; yeni oturum açılmıyor, `startedAt` değişmiyor.
- `trust-merge-game.tsx:253-267`: `playing` her `true` olduğunda tahta `addRandom` (`Math.random`, satır 57-58) ile sıfırdan kuruluyor; ilerleme hiçbir yerde saklanmıyor.
- `use-mini-game.ts:71`: İstemci süresi her `start()`'ta sıfırlanıyor; sunucu süresi (`complete/route.ts:81`) ise eski `startedAt`'ten ölçüldüğü için yenilemede **daha da kolay** geçiliyor (yalnızca alt sınır var, üst sınır yok).
- Yeniden üretim: Oyunu başlat → tahta kötü giderse `endGame` tetiklenmeden (tahta kilitlenmeden, "Bitir"e basmadan) sayfayı yenile → "Oyna" → aynı oturum, yeni rastgele tahta. 256 karoya ulaşana kadar tekrar et; `complete` `status:'active'` olduğu için ödülü verir. Dürüst kullanıcı tarafında da yanlışlıkla yenileme ilerlemeyi siler (yeniden başlatma bedava olduğu için ceza yok ama emek kaybı gerçek).
- Not: Bulgu B5 (istemci skoru) varken pratik etkisi sınırlı, çünkü hile yapmak isteyen doğrudan skor uydurabilir; yine de B5 düzeltilse bile (sunucu replay) bu açık "tohum sabitlenmezse" yaşamaya devam eder. Doğru çözüm: `start` oturuma bir `seed` yazsın, `active` oturum için aynı `seed` + kaydedilmiş hamleleri (`resume`) döndürsün; tahta istemcide tohumdan deterministik üretilsin.

### 2. Kaybeden / eşik altında "Bitir"e basan kullanıcıya aynı gün oyun yeniden açılıyor, sonunda 409 — **DOĞRULANDI**

- `trust-merge-game.tsx:187-189` ve `200-203`: Eşik altı bitişte `won=false` gönderiliyor.
- `complete/route.ts:101`: `won=false` → `status: 'failed'`.
- `start/route.ts:57`: Yalnızca `completed` kilit sayılıyor; `failed` oturumda `canPlay: true` + aynı `sessionId` dönüyor (`70-73`).
- `status/route.ts:33`: Hub yalnızca `completed`'ları "bugün oynandı" sayıyor; `failed` oyun hub'da açık görünüyor.
- `complete/route.ts:98-109`: `updateMany where status:'active'` → `failed` satırda `count=0` → `177-181` 409 "Oyun zaten tamamlandı". (Satır 73'teki ön kontrol yalnızca `completed`'ı yakaladığı için 409'a buradan düşülür.)
- `use-mini-game.ts:98-99, 126-128`: 409 hata toast'ı + 0 ödüllü sonuç kartı.
- Yeniden üretim: Oyna → "Bitir (henüz 256 karo yok)" → sonuç ekranı (yeniden başlat düğmesi yok, `game-shell.tsx` sonuç bölümü) → sayfayı yenile ya da hub'dan tekrar gir → "Oyna" çalışır → 10 dk oyna, 512'ye ulaş → "Bitir & Ödülü Al" → "Oyun zaten tamamlandı" hatası, 0 puan. Kullanıcının gerçek emeği kayboluyor ve arayüz "Günde 1 hak" vaadiyle çelişiyor. Ortak katmanda olduğu için tüm registry oyunlarında geçerli.
- Çözüm: `start` `failed`'ı (ileride `abandoned`'ı) da kilit saysın ve `alreadyPlayed` dönsün; `status` endpoint'i "bugün oynandı"yı `status IN (completed, failed)` ile hesaplasın; `complete` `failed` satır için 409 yerine anlamlı bir "bugünün hakkı kullanıldı" kodu döndürsün.

### 3. İstemci skoru doğrulanmıyor: script ile günlük 170 puan + sıralama zirvesi — **DOĞRULANDI**

- `complete/route.ts:15-22`: `score` 0..10000 tamsayı, `won` boolean, `durationSec` istemciden; hiçbir oyun kanıtı (hamle dizisi, tohum) yok.
- `complete/route.ts:61`: Yalnızca `maxScore`'a (2048, `minigame-config.ts:304`) sıkıştırılıyor; 2'nin kuvveti olma kontrolü yok.
- `complete/route.ts:81-83`: Tek savunma `minDurationSec: 12` (`minigame-config.ts:308`); sunucu süresi `startedAt`'ten ölçülüyor, 12 sn beklemek yeterli.
- `minigame-config-effective.ts:107-116`: Eşik (256) geçilince sabit 170 puan + 85 XP.
- `points-wallet.ts:27-73`: `creditPointsAndXp` herhangi bir tavan uygulamıyor; yalnızca `points_credited` olayı (görünürlük) yazılıyor, engelleme yok.
- `leaderboard/route.ts` (groupBy `_max.starsCollected`) ve `tournament/route.ts:28-39`: Uydurulan 2048 doğrudan tüm-zamanlar ve haftalık sıralamaya giriyor; `tournament-core.ts:13` ilk sıra 500 puan.
- Yeniden üretim (oturum çerezli tarayıcı konsolu): `POST /api/customer/games/trust-merge/start` → 12+ sn bekle → `POST .../complete {sessionId, score:2048, won:true, durationSec:12}` → 170 puan + 85 XP + seri XP; skor 2048 olarak sıralamaya yazılır. Her gün tekrarlanabilir.
- Nüans: Dürüst bir oyuncu da 2048'e ulaşırsa skor eşit olur, bu durumda "1. sıra" garantisi değil, eşitler arasında belirsiz sıra (bkz. iddia 4). "~115 hamle" tahmini makul (256 karo toplamı için ~116 doğuş gerekir, her hamle bir doğuş) ama ölçülmedi.

### 4. Turnuva ödülü eşit skorlarda belirsiz dağıtılıyor — **DOĞRULANDI (kısmen; ">3 kişi ödül alır" kısmı doğrulanmadı)**

- `tournament/route.ts:28-35`: `orderBy: { _max: { starsCollected: 'desc' } }` tek anahtar; ikincil sıralama (ör. `MIN(completedAt)`, `userId`) yok. Postgres eşit değerler arasında sıra garanti etmez.
- `trust-merge-game.tsx:126-127, 187-189, 200-202` + `complete/route.ts:101`: Bu oyunda yalnızca `won=true` → `completed` olur; `won` ancak en büyük karo ≥ 256 iken mümkün. Dürüst oyuncular için tabloya girebilen değerler yalnızca {256, 512, 1024, 2048}; eşitlik olağan durum.
- `tournament/route.ts:84-95` (GET) ve `141-147` (POST): Sıra her çağrıda yeniden hesaplanıyor; dondurulmuş bir hafta sonucu tablosu yok.
- Kesin olan kısım: Örneğin geçen hafta 5 oyuncu 1024'te eşitse, ödüllerin (500/300/150) kime gideceği tamamen sorgu planının ürettiği iç sıraya bağlı; eşit skorlu iki oyuncu hiçbir şey alamıyor ve kurallı bir eşitlik bozma ölçütü kullanıcıya gösterilmiyor. Bu adalet sorunu koddan kesin.
- Doğrulanmayan kısım: Aynı kapanmış hafta için iki ayrı sorgunun eşitleri farklı sırada döndürmesi (dolayısıyla 3'ten fazla claim ya da GET'te "1. oldun" görüp POST'ta 400 alma) teorik olarak mümkün (top-N heapsort kararsız, paralel tarama/plan değişimi/kullanıcı silinmesi girdi sırasını değiştirir) ama küçük tabloda aynı planla pratikte genellikle tutarlıdır; canlıda gözlenmedi. `TournamentRewardClaim` unique'i (`schema.prisma:1088`) yalnızca kişi başına tekrarı engeller, toplam kazanan sayısını sınırlamaz.
- Çözüm: Sıralamaya deterministik ikincil anahtar (`MIN(completedAt) ASC`, ardından `userId`) eklenmeli (Prisma `groupBy` bunu desteklemediği için `$queryRaw` ya da `_min.completedAt` ile uygulama tarafında ikinci sıralama); hafta kapanışında sonuç cron ile `TournamentResult` gibi bir tabloya dondurulup claim yalnızca oradan yapılmalı; arayüzde eşitlik kuralı açıkça yazılmalı. Bu oyun için ayrıca sıralama skoru karo değeri yerine birleşme puanı olmalı ki eşitlik seyrekleşsin.

### Özet

| # | İddia | Karar |
|---|---|---|
| 1 | Yenilemeyle tahta yeniden çekme | Doğrulandı |
| 2 | `failed` oturumda yeniden oynatıp 409 | Doğrulandı |
| 3 | İstemci skoru doğrulanmıyor | Doğrulandı |
| 4 | Turnuva eşitlik belirsizliği | Doğrulandı (adalet kısmı kesin; ">3 ödül" kısmı doğrulanmadı) |

## Uygulama (Dalga 2)

Oyun ortak motora (v2 sözleşmesi, `/customer/games/[game]` dinamik rotası) taşındı. Kimlik aynı (`trust-merge`), bu yüzden eski statik `app/customer/games/trust-merge/page.tsx` dinamik rotayı gölgelememesi için silindi; eski bileşen `components/customer/games/trust-merge-game.tsx` kaldırıldı.

**Dosyalar:** `components/customer/games/trust-merge/sim.ts` (saf, tohumlu simülasyon) · `components/customer/games/trust-merge/trust-merge-game.tsx` (v2 bileşen) · `lib/games/validators/trust-merge.ts` + `lib/games/registry/trust-merge.server.ts` (deterministik replay doğrulayıcısı) · `lib/games/registry/trust-merge.ts` (v2, pratik açık) · `lib/minigame-config.ts` (yalnız `trust-merge` satırı) · `lib/minigame-copy.ts` (yalnız `trust-merge` metinleri) · `__tests__/lib/trust-merge.test.ts` (16 test).

**Skor normalizasyonu (§7.3 #14):** skor artık en yüksek karo değil, klasik 2048 **birleşim puanı**. Eşik 1.500 puan (≈ 256 karosu), tavan 10.000 (admin override sınırı içinde; ≈ 1024 karosu), `minDurationSec` 15, `maxScorePerSec` 150. Liderlik/turnuva artık 4 kademeye çökmez; `bestScorePct` başarımları diğer oyunlarla aynı birimde ölçülür (tek 64 karosu artık rozet açmaz — testli). En yüksek karo yalnız HUD/yıldız/kilometre taşı göstergesi.

**Kapatılan bulgular (9):**
- B1 — "Bitir" üst şeride taşındı (D-pad'den uzak), 700 ms **basılı tut ve onayla**; eşik altındaysa aria/etiket uyarır.
- B2 (oyun tarafı) — sıralama birimi ince taneli birleşim puanı; eşitlikte ikincil anahtar ve turnuva dondurma paylaşılan katmanın işi (aşağıda).
- B3 — tohum sunucudan (yenilemede aynı tohum); sıralıda girdi kaydı tohum anahtarlı sessionStorage'a yazılır, yenilemede tahta **aynı noktadan** geri kurulur; bitmiş oyun da özet ekranına geri yüklenir (yeniden deneme yok).
- B4 — eşik/tavan `config`'ten (admin override); `won` kozmetik, karar sunucuda.
- B5 — sunucu tohum + kayıtla replay eder; etkisiz hamle, insan üstü hız (hamle arası ≥ 5 adım), başka tohum, bitmemiş oyun, hızlandırılmış betik reddedilir; şişirilmiş beyan sunucu skoruna iner.
- B6 — karolar ve arka plan hücreleri tek formülle konumlanır (hizasızlık yok), `transform` ile kayar; yutulan karo hedefe kayıp söner, birleşen karo kaymadan sonra "pop", yeni karo gecikmeli doğar; azaltılmış harekette süreler 0.
- B7 — tek elemanlı girdi tamponu (hızlı hamle yutulmaz), `e.code` eşlemesi (Caps Lock / Türkçe klavye), dinleyiciler kararlı (motor kancaları).
- B8 — tek sözlük: "karo" + "puan"; "rozet" kaldırıldı; etiketli HUD (Puan · En iyi karo · Hamle) + eşiğe ilerleme çubuğu; `rewardMissNote`, ayrı "Oyunu bitirdin / Hamle kalmadı" başlıkları.
- B9 / B10 — boşta RAF yok (FxLayer kullanılmıyor; döngü yalnız 60 Hz sayaç); ekran okuyucu tablosu + hamle başına `aria-live` özeti; D-pad `aria-label`'lı ve `useCoarsePointer` ile (iPad dahil); AA kontrastlı palet (2048 mor/beyaz), ipucu metni ≥ 12 px; ses/titreşim/sarsıntı/konfeti `fx` politikası + oyuncu tercihi üzerinden (kabuk ayarları).

**Ek özellikler:** ilk oynayışta öğretici, Pratik/Sıralı mod, duraklat/devam (Esc/P, sekme gizlenince), zorluk eğrisi (en yüksek karo büyüdükçe 4 doğma olasılığı %10 → %15 → %20), kilometre taşı kutlamaları (64…4096), sonuç ekranı (puan, kişisel en iyi, en yüksek karo, hamle, 0–3 yıldız, paylaş, sıralıda 15 sn otomatik gönderim).

**Envanterde kapanan maddeler (22):** #14, #15, #16, #18, #19, #23, #24, #26, #28, #29, #31, #33, #35, #37, #39, #40, #41, #46, #48, #49, #50, #51, #54 (çoğu yukarıdaki bulgularla).

**Kalan açıklar:**
- B2'nin paylaşılan kısmı (liderlik/turnuva eşitlik ikincil anahtarı, haftalık sonucu dondurma `TournamentResult`) ve B11 (bildirim try, toast ön eki, liderlik hata durumu, UTC metni) turnuva/kabuk sahiplerinin.
- #52 Geri al jetonu: ekonomi tasarımı (escrow/net-sıfır) gerektirir; eklenmedi.
- **Admin dikkat:** canlı `MiniGameConfig` satırında `trust-merge` için eski birimle (ör. `rewardThreshold: 256`, `maxScore: 2048`) override varsa yeni birimde eşik bedavaya düşer / tavan kırpar — admin oyun ayarlarından temizlenmeli (DB'ye bağlanılmadı, doğrulanamadı).
- Eski kayıtlar (karo birimi skorlar) tüm zamanlar liderliğinde yeni puanlarla karışır; tarihli kesim ya da sezon sıfırlaması liderlik sahibinin kararı.
