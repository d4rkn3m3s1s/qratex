# /customer/games/truth-vs-fake

**Amaç:** Müşteriye günde bir kez oynanan, Tinder tarzı "kartı sola/sağa kaydır: bu yorum sahte mi gerçek mi?" mekanikli, 45 saniyelik (doğru cevaplarla uzayan) bir refleks/ayırt etme oyunu sunmak; eşik (12) geçilirse 140 puan + 70 XP, ayrıca haftalık turnuva ve tüm zamanların liderlik tablosuyla oyunlaştırma döngüsünü beslemek. Marka açısından ikinci bir amacı da var: kullanıcıya "sahte yorumu tanıma" refleksini kazandırmak (Qratex'in güven vaadi).

**Genel puan: 4.5/10** · **Karar: birleştir** (`/customer/games/review-detective` ile aynı beceriyi ve neredeyse aynı içerik havuzunu ölçüyor; sunucudan beslenen ortak bir "sahte yorum" içerik motoru üzerinde, bu oyun o motorun "hızlı kaydırma" modu olarak yeniden kurulmalı)

Okunan dosya zinciri:
- `app/customer/games/truth-vs-fake/page.tsx` (24 satır, sunucu bileşeni)
- `app/customer/layout.tsx`, `components/dashboard/page-heading.tsx`, `components/providers.tsx` (global `LazyMotion` + `MotionConfig reducedMotion="user"`)
- `components/customer/games/truth-vs-fake-game.tsx` (oyunun tamamı, 381 satır)
- `components/customer/games/game-shell.tsx`, `fx-layer.tsx`, `game-leaderboard.tsx`, `game-tournament.tsx`
- `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/tournament-core.ts`, `lib/admin-toast.ts`, `lib/points-caps.ts`, `lib/points-velocity.ts`, `lib/accessibility-prefs.ts`
- API: `app/api/customer/games/[game]/start/route.ts`, `.../[game]/complete/route.ts`, `.../[game]/leaderboard/route.ts`, `app/api/customer/tournament/route.ts`, (dolaylı, hub) `app/api/customer/games/status/route.ts`
- Prisma: `MiniGameSession` (`prisma/schema.prisma:493-513`), `MiniGameConfig` (`:521+`), `GameStreakClaim` (`:1066-1074`), `TournamentRewardClaim` (`:1079-1091`), `AnalyticsEvent`, `Notification`
- Kütüphane doğrulaması: `node_modules/framer-motion` sürüm 11.18.2 (`dist/cjs/index.js:5207-5225`, `:5418-5438`, `:10210-10260`)

> Not: Hiçbir komut/dev server/test çalıştırılmadı (canlı Neon riski). Tüm bulgular kod okumasıyla; çalışma zamanında doğrulanamayanlar açıkça "doğrulanmadı" diye işaretlendi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Ana döngü (başlat → kaydır → bitir → ödül) uçtan uca bağlı; ama kaybedilen oyun aynı gün yeniden açılıp 409 ile reddediliyor, çift tıklama aynı kartı iki kez sayıyor, admin override'ları istemcide yok sayılıyor ve uçuş animasyonu paylaşılan `x` değerini bir sonraki karta taşıyor olabilir (doğrulanmadı). |
| UX | 4/10 | Kaydırma mekaniği sezgisel ve tatmin edici; ancak 12 cümlelik havuz, kendini ele veren "sahte" metinler, yanlışa ceza olmaması (rastgele basma kazandırıyor), oyun içinde hedefin görünmemesi ve öğretici geri bildirimin yokluğu oyunu birkaç turda anlamsızlaştırıyor. |
| Görsel | 6/10 | Neon/cyberpunk kabuk, 3B kart yığını, altın/bomba kart dili ve parçacık efektleri tutarlı ve "oyun" hissi veriyor; ama 10 px düşük kontrastlı metinler, sabit 270 px kart ve koyu kabuk içinde tema token'lı (açık temada koyu gri) turnuva bileşeni cilayı bozuyor. |
| Mimari | 4/10 | Ortak `useMiniGame`/`GameShell`/generic API iyi bir iskelet; fakat skor ve `won` tamamen istemci beyanı, cevap anahtarı istemci bundle'ında, içerik bileşene gömülü ve `review-detective` ile kopyalanmış, sunucunun döndürdüğü efektif config kullanılmıyor, turnuvada eşitlik kırıcı yok. |
| Performans | 6/10 | Hafif DOM oyunu; ama sürükleme için tam `motion` bundle'ı senkron içe aktarılıyor (global LazyMotion tasarrufunu bu rotada deliyor), `FxLayer` boşta bile 60 fps rAF döngüsü çeviriyor ve `endGame`/`judge` her render'da yeniden yaratılıyor. |
| Erişilebilirlik + mobil | 3/10 | Klavye ile oynanamıyor, karar butonlarında `aria-label` yok, skor/sonuç için `aria-live` yok, yüzen geri bildirimler yalnız canvas'ta, OS "hareketi azalt" tercihi parçacıkları kapatmıyor, ses ayrı kapatılamıyor, 320 px ekranda 270 px kart taşıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum + rol kontrolü | ÇALIŞIYOR | `app/customer/games/truth-vs-fake/page.tsx:10-13` | Rolü CUSTOMER olmayan, oturum açmış kullanıcı (bayi/admin) da `/auth/signin`'e atılıyor; doğru hedef rolün kendi paneli olurdu. |
| 2 | Sayfa başlığı + açıklama (`DashboardPageHeading`) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` → mobilde sayfanın `h1`'i hiç yok. Metin sabit kodlu; admin başlık override'ı yansımıyor. "Günde 1 hak!" vaadi kaybedilen oyunda tutmuyor (bkz. #12). |
| 3 | Sekme başlığı (metadata) | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:18-21` | Layout şablonu `%s | Müşteri alanı` ekliyor → "Gerçek mi Sahte mi \| QRateX \| Müşteri alanı" çift sonek. |
| 4 | Başlangıç ekranı (emoji, başlık, açıklama) | KISMİ | `truth-vs-fake-game.tsx:200-211`, `game-shell.tsx:165-184` | `DEF` statik registry'den (`minigame-config.ts:86-99`); admin'in `MiniGameConfig` ile değiştirdiği başlık/açıklama/emoji/renk bu sayfada görünmüyor (hub'da görünüyor → tutarsızlık). |
| 5 | Oyuna özel ipucu şeridi | ÇALIŞIYOR | `lib/minigame-copy.ts:60-62`, `game-shell.tsx:185-188` | "45 saniye, sağa-sola kaydır…" |
| 6 | "⚖️ Kararı Ver" başlat butonu + nabız halkası | ÇALIŞIYOR | `game-shell.tsx:189-208` | Bugün zaten oynandıysa bu, ancak tıklandıktan sonra öğreniliyor (ön kontrol yok). |
| 7 | Haftalık turnuva paneli (sıralama + geri sayım + ödül havuzu) | KISMİ | `game-tournament.tsx:53-181`, `app/api/customer/tournament/route.ts:28-39` | Eşitlik kırıcı yok (bkz. Bulgu 4); koyu kabukta `text-muted-foreground`/`bg-primary/10` tema token'ları açık temada düşük kontrast. |
| 8 | Geçen haftanın turnuva ödülünü talep et | KISMİ | `game-tournament.tsx:84-97`, `tournament/route.ts:128-193` | Atomik tek-claim doğru; ama sıralama belirsizliği GET ve POST arasında farklı sonuç verebilir. Toast `lib/admin-toast.ts` ile "Basarili: " (ş/ı'sız, admin dili) önekiyle çıkıyor. |
| 9 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx:24-113`, `[game]/leaderboard/route.ts:47-80` | `maxScore=20` tavanı kolay erişilebilir → tablo 20'lerle doyuyor, ayırt edici değil; `take: 100` → "toplam oyuncu" 100'de kesiliyor, 100'ün dışındaki kullanıcı kendi sırasını göremiyor. |
| 10 | Yükleniyor durumları (başlatılıyor / kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:146-162`, `use-mini-game.ts:56,89` | |
| 11 | Günde 1 hak kilidi (tamamlanmış oturum) | ÇALIŞIYOR | `[game]/start/route.ts:56-67`, `game-shell.tsx:307-332` | Yalnız `status==='completed'` için. |
| 12 | Kaybedilen oyundan sonra aynı gün tekrar oynama | BOZUK | `[game]/complete/route.ts:101`, `[game]/start/route.ts:56-73`, `use-mini-game.ts:97-99,126-128` | `failed` oturum "yarım kalan" sayılıp yeniden açılıyor; 45 sn oynandıktan sonra `updateMany(status:'active')` 0 döner → 409 "Oyun zaten tamamlandı" hata toast'ı. Bkz. Bulgu 2. |
| 13 | Yarıda bırakılan oturumu sürdürme | KISMİ | `[game]/start/route.ts:69-73` | Aynı `sessionId` döner; ama oyun yenilenerek sınırsız kez baştan oynanabilir (kötü gidiyorsa sayfayı yenile) → "günde 1 hak" fiilen "günde 1 kayıt". |
| 14 | HUD: skor (her değişimde ölçek animasyonu) | ÇALIŞIYOR | `truth-vs-fake-game.tsx:215-217` | |
| 15 | HUD: kombo rozeti (≥2) | ÇALIŞIYOR | `truth-vs-fake-game.tsx:218-231` | |
| 16 | HUD: kalan süre (deadline tabanlı, 200 ms tik) | ÇALIŞIYOR | `truth-vs-fake-game.tsx:99-109,232-234` | Saat sapmasına dayanıklı; sekme gizlenince durmuyor (bkz. #44). |
| 17 | Oyun içinde ödül hedefi/ilerleme göstergesi | EKSİK | `truth-vs-fake-game.tsx:214-235` | Eşik (12) oyun sırasında hiçbir yerde görünmüyor; yalnız kaybedince sonuç ekranında söyleniyor (`game-shell.tsx:291-292`). |
| 18 | Kart destesi / içerik üretimi | SAHTE | `truth-vs-fake-game.tsx:26-51` | 6 sahte + 6 gerçek sabit cümle, `Math.random` ile yerine koymalı çekim; aynı kart art arda gelebilir. Cevap anahtarı (`fake`) istemci state'inde. Bkz. Bulgu 5-6. |
| 19 | Altın kart (çift puan) | ÇALIŞIYOR | `truth-vs-fake-game.tsx:47-49,135-137,311-315` | |
| 20 | Bomba kartı (yanlışta −4 sn) | ÇALIŞIYOR | `truth-vs-fake-game.tsx:163-170,316-318` | |
| 21 | Kombo milestone (her 5 doğruda +1 + fanfar + konfeti) | ÇALIŞIYOR | `truth-vs-fake-game.tsx:136,149-154` | |
| 22 | Doğru cevapta +1,2 sn süre bonusu | ÇALIŞIYOR | `truth-vs-fake-game.tsx:16,141,148` | |
| 23 | Yanlış cevap cezası | KISMİ | `truth-vs-fake-game.tsx:159-177` | Skordan düşüş yok, yalnız kombo sıfırlanıyor (bomba hariç süre cezası da yok) → okumadan rastgele basmak kârlı. Bkz. Bulgu 6. |
| 24 | Kaydırarak karar (drag, ±90 px eşik) | KISMİ | `truth-vs-fake-game.tsx:190-197,266-284` | Çalışıyor; fakat paylaşılan `x` MotionValue uçuş animasyonuyla ±520'ye sürülüp sıfırlanmıyor (doğrulanmadı, Bulgu 1). |
| 25 | Sürüklerken SAHTE/GERÇEK damgaları | ÇALIŞIYOR | `truth-vs-fake-game.tsx:72-73,323-334` | Bulgu 1 doğrulanırsa sonraki kartta damga açık kalır. |
| 26 | Kart uçuş animasyonu | KISMİ | `truth-vs-fake-game.tsx:179-185,272-281` | `setTimeout(240)` ile animasyon süresi (0,24 sn) yarışıyor; animasyon `x` değerini kalıcı bırakıyor. |
| 27 | Butonlarla karar (✕ = sahte, ✓ = gerçek) | BOZUK | `truth-vs-fake-game.tsx:124-126,358-377` | Uçuş sırasında butonlar kilitlenmiyor; 240 ms içinde ikinci tık aynı `top` kartını tekrar puanlıyor ve desteden iki kart atıyor. `aria-label` yok. Bkz. Bulgu 3. |
| 28 | Klavye ile oynama (← / →) | EKSİK | dosyada `onKeyDown`/`keydown` yok | |
| 29 | Arka kart 3B yığını | ÇALIŞIYOR | `truth-vs-fake-game.tsx:338-350` | |
| 30 | Arena kenar flaşı (yeşil/kırmızı) | ÇALIŞIYOR | `truth-vs-fake-game.tsx:244-250` | |
| 31 | Parçacık / şok dalgası / yüzen metin (`FxLayer`) | KISMİ | `fx-layer.tsx:73-164,166-255` | Yalnız uygulama içi `reduce-animations` sınıfına bakıyor; OS `prefers-reduced-motion` bu sınıfı set etmiyor (`lib/accessibility-prefs.ts`). Yüzen "Yanlış", "−4s" metinleri yalnız canvas'ta → ekran okuyucuya görünmez. |
| 32 | Ses efektleri + haptik | KISMİ | `lib/game-sounds.ts:10-13,155-164` | Ses yalnız "animasyonları azalt" açıksa susuyor; oyun içinde sessize alma düğmesi yok. |
| 33 | `maxScore`'a ulaşınca erken bitiş | KISMİ | `truth-vs-fake-game.tsx:155-158` | Statik `DEF.maxScore` kullanılıyor; admin override'ı yok sayılıyor. |
| 34 | Sonuç gönderimi (sunucu cap + min süre + atomik claim) | ÇALIŞIYOR | `[game]/complete/route.ts:59-108` | Ödül sunucuda hesaplanıyor; ama skor istemci beyanı (Bulgu 5). |
| 35 | Ödül toast'ı + bildirim + seri bonusu + yeni başarım | ÇALIŞIYOR | `use-mini-game.ts:112-125`, `complete/route.ts:111-215` | Aynı ödül hem sonuç kartında hem toast'ta hem bildirimde → üçlü geri bildirim. |
| 36 | Sonuç ekranı (kupa/kurukafa, varyant başlık, skor, ödül) | KISMİ | `game-shell.tsx:221-305`, `minigame-copy.ts:63-66` | Skor etiketi "Doğru karar" ama skor altın ×2 ve milestone +1 içeriyor → sayı doğru karar sayısı değil. "Oyun merkezine dön / başka oyun" CTA'sı yok. |
| 37 | Ödülde konfeti | ÇALIŞIYOR | `game-shell.tsx:19-31,86-94` | `reduce-animations` saygılı. |
| 38 | Gönderim hatasında yeniden deneme | EKSİK | `use-mini-game.ts:126-132` | Ağ hatasında sonuç "ödülsüz" gibi gösterilip `sessionId` siliniyor; 15 puan yapan kullanıcı "Ödül için 12 skor gerekiyordu" görüyor. |
| 39 | Kilit ekranı "Her gün 00:00 (UTC) sıfırlanır" | KISMİ | `game-shell.tsx:322-324`, `[game]/start/route.ts:10-12` | Türkiye için 03:00; TR saatiyle gece 00:00-03:00 arası oynayan önceki güne yazılıyor. |
| 40 | Admin'in oyunu pasifleştirmesi | KISMİ | `[game]/start/route.ts:34-39`, `page.tsx` (kontrol yok) | Sayfa normal render oluyor; "Oyna"ya basınca 403 hata toast'ı. |
| 41 | Admin eşik/maxScore override'ının istemciye yansıması | BOZUK | `use-mini-game.ts:70,137` (config dönüyor), `truth-vs-fake-game.tsx:107,155,208` (DEF kullanılıyor) | Bkz. Bulgu 7. |
| 42 | Öğretici geri bildirim ("neden sahteydi?") | EKSİK | — | Oyunun marka amacı için en kritik eksik. |
| 43 | Ekran okuyucu canlı bölgesi (`aria-live`) | EKSİK | dosyada `aria-*` yok | |
| 44 | Sekme gizlenince duraklatma | EKSİK | `truth-vs-fake-game.tsx:102-109` | `visibilitychange` dinlenmiyor; bildirime bakan kullanıcının süresi akıyor. |
| 45 | Çok dillilik (i18n) | EKSİK | `page.tsx:7,18-19`, `truth-vs-fake-game.tsx:26-41,228,255-258` | Uygulama `t(locale, …)` altyapısına sahip (`layout.tsx:15-16`) ama oyun tamamen TR sabit. |
| 46 | Oyun merkezine / sonraki oyuna geçiş | EKSİK | `game-shell.tsx:221-305` | Sonuç ekranı çıkmaz sokak; mobilde başlık da gizli olduğundan bağlam kayboluyor. |

**Durum özeti:** ÇALIŞIYOR 18 · KISMİ 16 · BOZUK 3 · SAHTE 1 · EKSİK 8 (toplam 46)

---

## Bulgular

### 1. [Yüksek — doğrulanırsa kritik] Hata · Paylaşılan `x` MotionValue uçuş animasyonundan sonra sıfırlanmıyor; bir sonraki kart ±520 px kaymış ve 20° dönük doğabilir
- **Kanıt:** `truth-vs-fake-game.tsx:70-73` (tek `x` değeri, `rotate`/opaklıklar ondan türüyor), `:180` (`x.set(0)` uçuştan ÖNCE), `:269` (`style={{ x, rotate }}`), `:272-279` (`animate={{ x: flyOut.dir * 520 }}`), `:182-185` (240 ms sonra kart değişiyor, `x` sıfırlanmıyor). framer-motion 11.18.2: style'a verilen dış MotionValue görsel öğeye bağlanır (`node_modules/framer-motion/dist/cjs/index.js:5207-5216`, `element.addValue(key, nextValue)`), `animate` bu değeri sürer; unmount değerleri durdurmaz/sıfırlamaz (`:5418-5438`); sürükleme modülü mount'ta konumu kısıtlara çekmez (`:10210-10260`).
- **Sorun:** Okumaya göre her karardan sonra yeni üst kart aynı `x` (≈±460-520) ile mount ediliyor → dar ekranda arena dışında (görünmez), geniş ekranda kenarda yarı görünür, 20° dönük ve "GERÇEK"/"SAHTE" damgası tam opak. Oyuncu kartı göremeden butonla karar veriyor olabilir. **Çalıştırılarak doğrulanmadı**; proje hafızasındaki headless Chrome görsel tezgâhıyla (bkz. "Görsel 3B doğrulama tezgâhı") 3 karar sonrası ekran görüntüsüyle teyit edilmeli.
- **Öneri:** Uçuşu paylaşılan `x`'e değil karta özgü bir animasyona bağla: üst kartı `AnimatePresence` + `exit={{ x: dir*520, rotate: dir*35, opacity: 0 }}` ile çıkar (`custom` prop'uyla yön), `x` değerini kart başına `useMotionValue` ile oluşturan küçük bir `<SwipeCard>` bileşenine taşı; böylece `setTimeout(240)` yarışı da kalkar (çıkış `onExitComplete` ile desteyi ilerletir). Alternatif minimum düzeltme: kart değişiminde `x.jump(0)`.
- **Efor:** S (düzeltme) / M (SwipeCard refaktörü)

### 2. [Yüksek] Hata · Kaybedilen oyun aynı gün yeniden açılıyor, 45 sn oynatılıp 409 hatasıyla bitiyor
- **Kanıt:** `complete/route.ts:101` (`status: won ? 'completed' : 'failed'`), `start/route.ts:56-73` (yalnız `completed` kilitleniyor, `failed` "yarım kalan aktif oturum" gibi `canPlay:true` + aynı `sessionId` döner), `complete/route.ts:98-108,177-181` (`updateMany where status:'active'` → 0 → 409), `use-mini-game.ts:97-99,126-128` (409 → hata toast'ı + ödülsüz sonuç). Hub da `failed`'i "oynanmadı" sayıyor (`status/route.ts:33`).
- **Sorun:** Skoru 12'nin altında kalan her kullanıcı (oyunun "kayıp" tanımı bu, `truth-vs-fake-game.tsx:107`) hub'da oyunu hâlâ açık görüyor, tekrar "Kararı Ver"e basıyor, tam bir tur oynuyor ve sonunda "Dikkat/Oyun zaten tamamlandı" hatası alıyor. Bu hem güven kırıcı bir hata hem de "Günde 1 hak" vaadiyle çelişiyor.
- **Öneri:** Kural tek yerde net olmalı: (a) "günde 1 deneme" ise `start` hem `completed` hem `failed`'i `alreadyPlayed` saymalı ve kilit ekranı kaybı da göstermeli (`lockedNote`: "Bugünkü davayı kaybettin, yarın yeni dosyalar"); (b) "ödülsüz pratik serbest" isteniyorsa `start` `failed` için `mode:'practice'` döndürmeli, `useMiniGame` pratik modunda `complete` çağırmadan yerel sonuç göstermeli. Ürün açısından (b) Duolingo'nun "pratik" mantığına daha yakın ve tutundurucu. `status` API'si de aynı kuralı kullanmalı (`playedToday` + `failedToday`).
- **Efor:** S

### 3. [Yüksek] Hata · Uçuş sırasında butonlar kilitli değil; çift tıklama aynı kartı iki kez puanlıyor ve desteden görülmemiş bir kartı atıyor
- **Kanıt:** `truth-vs-fake-game.tsx:126` (koruma yalnız `runningRef` ve `top`), `:179-185` (deste 240 ms sonra ilerliyor, o ana kadar `top` aynı kart), `:268` (sürükleme `flyOut` iken kapanıyor ama) `:359-377` (butonlarda `disabled`/kilit yok).
- **Sorun:** Hızlı çift tık/çift dokunma: aynı kart iki kez doğru sayılır (+2 skor, +2,4 sn, kombo +2), iki `setTimeout` desteyi iki kart ilerletir. Mobilde istemsiz çift dokunma yaygın; skor adil değil ve turnuvayı/ödülü doğrudan etkiliyor.
- **Öneri:** Kart kimliğine bağlı tek-sefer kilit: `judgingRef = useRef<number|null>(null)`; `judge` başında `if (judgingRef.current === top.id) return; judgingRef.current = top.id;` ve butonlara `disabled={!!flyOut}`. Bulgu 1'deki `AnimatePresence` refaktörüyle birlikte "karar → çıkış → yeni kart" tek bir durum makinesine (`'ready' | 'exiting'`) indirgenmeli.
- **Efor:** S

### 4. [Yüksek] Veri bütünlüğü / ekonomi · Turnuva sıralamasında eşitlik kırıcı yok; 20 puan tavanında ilk 3 ödülü belirsiz ve 3'ten fazla kişiye verilebilir
- **Kanıt:** `tournament/route.ts:28-39` (`groupBy ... orderBy: { _max: { starsCollected: 'desc' } }`, ikincil sıralama yok), `:86-96` (GET'te "bekleyen ödül" kendi sırasına göre), `:145-160` (POST'ta sıra YENİDEN hesaplanıyor, claim unique'i yalnız `userId+gameType+weekKey`), `lib/tournament-core.ts:13` (500/300/150 puan), `minigame-config.ts:94` (`maxScore: 20`).
- **Sorun:** Bu oyunda 20'ye ulaşmak kolay (süre bonusu + altın kart + yanlışa ceza yok + Bulgu 3/5). Haftanın birden fazla oyuncusu 20'de eşitlenince Postgres eşit anahtarlar için kararlı sıra garanti etmez; her kullanıcı kendi POST'unda farklı bir sıralama görebilir → aynı hafta için 3'ten fazla kullanıcı ödül alabilir ya da ödül gösterilen kullanıcı POST'ta "Geçen hafta ödül kazanmadın" alabilir. (Belirsiz sıralama Postgres davranışına dayanır; canlıda tekrar üretilmedi.)
- **Öneri:** (1) Belirleyici eşitlik kırıcı: aynı en iyi skorda daha erken `completedAt` kazanır (groupBy yerine `DISTINCT ON (userId) ORDER BY starsCollected DESC, completedAt ASC` ile ham sorgu veya `_min.completedAt` ile ikinci anahtar). (2) Ödülü talep anında hesaplamak yerine hafta kapanışında bir kez "dondur": `TournamentResult(weekKey, gameType, rank, userId)` tablosuna yazan cron (proje zaten cron-job.org altyapısına sahip); claim yalnız bu tablodan okur. (3) Bu oyun için skor tavanını kaldırıp skoru "doğru sayısı × doğruluk × hız" gibi ayırt edici bir metriğe çevir (Bulgu 6).
- **Efor:** M

### 5. [Yüksek] Güvenlik / ekonomi · Skor ve `won` tamamen istemci beyanı; cevap anahtarı istemci bundle'ında
- **Kanıt:** `truth-vs-fake-game.tsx:26-51` (sahte/gerçek bayrağı istemcide üretiliyor), `use-mini-game.ts:92-96` (`{ sessionId, score, durationSec, won }` gönderiliyor), `complete/route.ts:61,82-87` (sunucu yalnız `maxScore` cap'i ve `minDurationSec=8` kontrolü yapıyor). `lib/points-caps.ts:13-64` tavanları yalnız `category:'feedback'` sayıyor; oyun puanları (`category:'game'`, `complete/route.ts:163-170`) tavana tabi değil (yalnız `points-velocity.ts` görüyor). `complete/route.ts:159-161` yorumu "caps da görsün" diyor, gerçekte görmüyor.
- **Sorun:** Bir betik `start` → 9 sn bekle → `complete {score:20, won:true, durationSec:9}` ile hiç oynamadan her gün 140 puan + 70 XP + seri bonusu + haftalık turnuva birinciliği alabilir. Bu oyun özelinde ek olarak, istemci her kartın doğru cevabını zaten bildiği için "yardımcı" eklentilerle mükemmel skor trivial.
- **Öneri:** Sunucu-otoriter tur modeli: `start` yanıtında sunucu, oturuma bağlı imzalı bir deste (`cards: {id, text, special}[]`, cevaplar YOK) döndürsün ve cevap anahtarını `MiniGameSession`'a (yeni `payload Json` alanı) yazsın; istemci `complete`'e skor değil karar günlüğü (`[{cardId, judgedFake, tMs}]`) göndersin; sunucu skoru kendisi hesaplasın, insanüstü tepki sürelerini (<150 ms) ve tutarsız zaman damgalarını reddetsin. Ek olarak oyun kategorisi için günlük puan tavanı (`capGamePoints`) ve `points-caps` yorumunun düzeltilmesi. Bu desen tek oyunla sınırlı olmamalı, generic API'de opsiyonel "server-authoritative" sözleşme olarak kurulmalı.
- **Efor:** L

### 6. [Orta] UX / oyun tasarımı · İçerik 12 cümle, sahteler kendini ele veriyor, yanlışa ceza yok → oyun beceri ölçmüyor
- **Kanıt:** `truth-vs-fake-game.tsx:26-41` (6+6 cümle; "AI tarafından üretildiği belli olan kusursuz aşırı genel yorum", "Mükemmel! … (hiç detay yok)" gibi kendini anlatan metinler; emoji yalnız sahtelerde), `:45-50` (yerine koymalı rastgele çekim, art arda aynı kart), `:159-177` (yanlışta skor cezası yok), `:16,141` (her doğruya +1,2 sn).
- **Sorun:** İkinci turda tüm havuz ezberleniyor; ilk turda bile metinlerin kendisi cevabı söylüyor. Yanlışa ceza olmadığından okumadan hızlı basmak (≈%50 isabet, her isabet +1,2 sn) eşiğe ulaştırıyor. Sonuç: ödül beceriye değil oynama süresine bağlı; Qratex'in "sahte yorumu tanıma" eğitim amacı hiç gerçekleşmiyor.
- **Öneri:** (1) İçeriği koddan çıkar: `MiniGameContent` (gameType, text, isFake, signals[], difficulty, locale, active) tablosu + admin'de içerik yönetimi; başlangıç için 150+ el yazımı, nüanslı cümle (kısa ama gerçek, uzun ama sahte, rakip kötüleme, aşırı spesifik reklam vb.), `review-detective` ile ortak havuz. (2) Zorluk eğrisi: ilk kartlar bariz, sonra nüanslı. (3) Yanlışta −1 skor ve/veya −2 sn; çok hızlı (<400 ms) kararlara "okumadın" uyarısı ve kombo kırılması. (4) Destede tekrar yok (oturum başına karıştırılmış, tekrarsız örnek).
- **Efor:** M (içerik + mekanik) / L (admin içerik yönetimi dahil)

### 7. [Orta] Mimari · Admin override'ları (eşik, maxScore, başlık, renk, enabled) bu sayfada yok sayılıyor
- **Kanıt:** `use-mini-game.ts:47,70,137` (sunucu `config` döndürüyor ve hook dışa veriyor), `truth-vs-fake-game.tsx:13,107,155,201-211` (her yerde statik `DEF`), `lib/minigame-config-effective.ts:40-57` (admin `rewardThreshold`, `maxScore`, `title`, `accent`… ezebiliyor), `start/route.ts:96-102` (`publicConfig`).
- **Sorun:** Admin eşiği 10'a indirirse istemci 11 skoru `won:false` gönderir → oturum `failed`, ödül yok (sunucu eşiği geçildiği halde). Eşiği 15'e çıkarırsa istemci 12'de "kazandın" der, sunucu ödül vermez ("Kazandın ama ödül eşiğini geçemedin"). `maxScore` düşürülürse oyun erken bitmez; artırılırsa istemci 20'de keser. Görsel override'lar hub'da görünüp oyun sayfasında görünmüyor. `enabled:false` oyun sayfası açılıyor ve başlatmada 403 veriyor.
- **Öneri:** Sayfayı sunucu bileşeninde `getEffectiveMiniGame('truth-vs-fake')` ile besle (pasifse "Bu oyun şu an kapalı" boş durumu + hub'a dön), efektif tanımı prop olarak `TruthVsFakeGame`'e geçir; eşik/maxScore oyun içinde `game.config ?? def` kullansın. Daha doğrusu: `won` bayrağını istemciden tamamen kaldır, sunucu skora göre belirlesin (Bulgu 5 ile birlikte). Build-time DB fail-safe kuralı gereği helper try/catch'li olmalı (zaten `loadOverrides` catch'li).
- **Efor:** S-M

### 8. [Orta] Erişilebilirlik · Klavye ile oynanamıyor, butonlar isimsiz, geri bildirim yalnız görsel/canvas
- **Kanıt:** `truth-vs-fake-game.tsx:359-377` (yalnız ikonlu `motion.button`, `aria-label` yok), dosyada `keydown`/`aria-live` yok; `:147,170,175` (geri bildirim `FxLayer` canvas'ına çiziliyor), `:321` (`text-[10px] text-white/30`), `fx-layer.tsx:44-47` (yalnız `reduce-animations` sınıfı), `lib/accessibility-prefs.ts` (OS tercihi sınıfı set etmiyor), `providers.tsx:232` (`MotionConfig reducedMotion="user"` yalnız framer dönüşümlerini kapsar).
- **Sorun:** Ekran okuyucu kullanıcısı "düğme, düğme" duyuyor; doğru/yanlış, skor, kalan süre, bomba cezası duyurulmuyor. Klavye kullanıcısı Tab ile butonlara gelebilse de ←/→ kısayolu yok. OS'te "hareketi azalt" açık kullanıcı şok dalgaları/konfeti görmeye devam ediyor. Kırmızı/yeşil ayrımı ikonla desteklense de damga/etiketler yalnız renkle ayrışıyor.
- **Öneri:** `aria-label="Sahte"` / `"Gerçek"` + görünür metin etiketli butonlar; `window` düzeyinde ←/→ (ve A/D) dinleyicisi; kart `role="group"` + `aria-roledescription="yorum kartı"`, metni okunabilir; `aria-live="polite"` görsel olarak gizli bölge ("Doğru, skor 7, 32 saniye"); `FxLayer` `reduced()` fonksiyonuna `matchMedia('(prefers-reduced-motion: reduce)')` ekle (tüm oyunlara yayılır); 10 px metinleri ≥12 px ve ≥4.5:1 kontrasta çek.
- **Efor:** S-M

### 9. [Orta] UX · Oyun içinde hedef görünmüyor, sonuç ekranı çıkmaz sokak, skor etiketi yanıltıcı
- **Kanıt:** `truth-vs-fake-game.tsx:214-235` (HUD'da eşik yok), `game-shell.tsx:269-272` + `minigame-copy.ts:65` ("Doğru karar: N" — ama `truth-vs-fake-game.tsx:135-138` altın ×2 ve milestone +1 ekliyor), `game-shell.tsx:221-305` (sonraki adım CTA'sı yok), `page-heading.tsx:21` (mobilde başlık yok).
- **Sorun:** Oyuncu 12'ye ne kadar yakın olduğunu bilmiyor (Duolingo/Starbucks'ta ilerleme çubuğu motivasyonun ana kaynağı). "Doğru karar: 15" gerçekte 11 doğru olabilir. Oyun bitince kullanıcıyı hub'a, diğer oyunlara veya puanını harcayacağı ödüllere yönlendiren hiçbir şey yok.
- **Öneri:** HUD'a eşik işaretli ince ilerleme çubuğu ("12'de ödül") ve eşik geçildiğinde tek seferlik "Ödül kilidi açıldı" mikro-anı; sonuç ekranında doğru/yanlış/isabet oranı/en uzun kombo ayrı istatistikler (`scoreLabel` → "Skor", altına "11/14 doğru"); CTA'lar: "Oyun Merkezi", "Bugünün diğer oyunları (N kaldı)", "Puanlarını kullan". Bunlar `GameShell`'e opsiyonel `stats` ve `nextActions` prop'ları olarak eklenmeli.
- **Efor:** M

### 10. [Orta] UX · Gönderim hatası ödül kaybı gibi gösteriliyor, yeniden deneme yok
- **Kanıt:** `use-mini-game.ts:126-132` (hata → `rewarded:false` sonuç + `sessionIdRef=null` + `phase='done'`), `game-shell.tsx:289-293` ("Ödül için 12 skor gerekiyordu…").
- **Sorun:** Mobil ağda kopan bir istek, eşiği geçmiş kullanıcıya "eşiği geçemedin" mesajı gösteriyor; oturum sunucuda `active` kaldığı için ödül aslında kurtarılabilir ama arayüz yolu kapatıyor.
- **Öneri:** `phase:'submit-error'` durumu: "Sonuç gönderilemedi — Tekrar dene" butonu; skor/oturum `sessionStorage`'da tutulup sayfa yenilense bile tekrar gönderilebilsin (sunucu atomik claim sayesinde idempotent). Hata türünü ayırt et: 409 → "Bugün zaten kaydedildi", ağ → yeniden dene.
- **Efor:** S

### 11. [Düşük] Performans · Tam `motion` bundle'ı senkron; `FxLayer` boşta sürekli rAF; callback'ler her render'da yeniden yaratılıyor
- **Kanıt:** `truth-vs-fake-game.tsx:4` (oyun klasöründe `motion` içe aktaran tek dosya; diğerleri `m as Motion`), `providers.tsx:241` (`LazyMotion features={domAnimation}` — `domAnimation` sürükleme içermez, bu yüzden `motion` burada işlevsel olarak gerekli), `fx-layer.tsx:79-158` (parçacık yokken de her kare `clearRect` + rAF), `use-mini-game.ts:137` (her render yeni nesne) → `truth-vs-fake-game.tsx:87,187` (`endGame`/`judge` bağımlılıkları sürekli değişiyor).
- **Sorun:** Bu rota global code-split kazancını deliyor; mobilde boşta pil tüketimi; gereksiz yeniden yaratma küçük ama 200 ms tikli bir bileşende render sayısını büyütüyor.
- **Öneri:** Bu rotada `m` + yerel `<LazyMotion features={() => import('framer-motion').then(m => m.domMax)}>` (yalnız sürükleme isteyen oyun async `domMax` yükler). `FxLayer` döngüsünü yalnız parçacık varken çalıştır (boşalınca `cancelAnimationFrame`, yeni efekt gelince başlat). `useMiniGame` dönüşünü `useMemo` ile sabitle veya `game.finish`'i ref'ten çağır.
- **Efor:** S

### 12. [Düşük] Mobil · Sabit 270 px kart ve 420 px arena dar ekranda taşıyor
- **Kanıt:** `truth-vs-fake-game.tsx:15,241,283,342`, `game-shell.tsx:98` (`p-4`), `layout.tsx:36` (`pl-[max(0.75rem,…)]`).
- **Sorun:** 320 px genişlikte kullanılabilir alan ≈264 px < 270 px kart → kenarlar kırpılıyor; 420 px sabit yükseklik + 6,5 rem alt bar kısa ekranlarda butonları katlamanın altına itebiliyor.
- **Öneri:** Kartı `width: min(270px, 100% - 2rem)` + `aspect-ratio: 1`, arenayı `height: clamp(360px, 60dvh, 460px)`; butonları arenanın dışına, başparmak bölgesine (alt, tam genişlik iki büyük hedef) taşı.
- **Efor:** S

### 13. [Düşük] Dil / tutarlılık · Karışık mesajlar ve kalite sorunları
- **Kanıt:** `page.tsx:19` ("Günde 1 hak!") vs. kayıp sonrası tekrar açılma (Bulgu 2); `page.tsx:7` + `layout.tsx:20` (çift başlık soneki); `game-tournament.tsx:6` + `lib/admin-toast.ts:17-19` ("Basarili: ", "Dikkat: " — Türkçe karaktersiz admin önekleri müşteriye); `game-shell.tsx:323` ("00:00 (UTC)"); `truth-vs-fake-game.tsx:38` ("Pizza hamuru incedir" — anlamsız kip); açıklama metni üç yerde üç farklı biçimde (sayfa başlığı, `DEF.description`, `startHint`).
- **Öneri:** Müşteri tarafında `sonner`'ın düz `toast`'ını kullan; reset saatini kullanıcının saat diliminde göster ("Yeni hak 03:00'te" + geri sayım) ya da gün anahtarını `Europe/Istanbul`'a taşı (lib/timezone tek kaynak); başlık/açıklamayı tek kaynaktan (efektif config) besle; metadata'yı yalnız "Gerçek mi Sahte mi" yap.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Öğretici "neden" anı (Duolingo açıklamaları):** Yanlış cevapta 1-2 saniyelik "Bu sahteydi çünkü: aşırı ünlem + hiç somut detay yok" kartı; oyun sonunda "Bugün öğrendiğin 3 sahte yorum işareti" özeti. Qratex'in güven misyonunu oyunla bağlayan tek gerçek değer önerisi.
2. **İlerleme ve hedef görünürlüğü (Starbucks yıldız çubuğu):** Oyun içi eşik çubuğu, "kişisel rekorun 17 — 3 kaldı" göstergesi, kişisel en iyi skor rozeti.
3. **Pratik modu / ödülsüz tekrar (Duolingo practice):** Günlük ödüllü hak bittikten sonra ödülsüz ama istatistikli pratik; bugünkü hatalı (ödülsüz 409) akışın doğru karşılığı.
4. **Paylaşılabilir sonuç kartı (Spotify Wrapped):** "Bugün 14/15 sahteyi yakaladım — Keskin Göz" görseli; referral sistemine bağlanabilir.
5. **Sesi kapatma + dokunsal ayar ve tam klavye/ekran okuyucu desteği (Revolut/Monzo erişilebilirlik çıtası).**
6. **Arkadaş/şehir liderliği ve adil turnuva:** Tüm zamanlar tablosu yerine haftalık + arkadaşlar sekmesi, eşitlikte zaman bazlı sıralama, haftalık sonuç bildirimi ("Turnuvada 2. oldun, ödülünü al").

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60 saniyelik, okumayı ödüllendiren, her oyunda kullanıcıya bir şey öğreten "Sahte Yorum Avı — Hızlı Mod". Hissiyat: Tinder kaydırması + Duolingo geri bildirimi + Wrapped tarzı paylaşılabilir kapanış. Ödül, kaba hızdan değil isabet × hız dengesinden gelir.

**Yerleşim (mobil öncelikli):**
- Üst: kompakt HUD — sol skor, orta eşik işaretli ilerleme çubuğu ("12'de ödül"), sağ dairesel süre halkası; kombo yalnız ≥3'te küçük alev rozeti.
- Orta: tek kart, genişliğe uyumlu (`min(320px, 100%)`, kare), içinde yorum metni, yıldız sayısı ve (varsa) "mekân türü" bağlamı — gerçek yorumu sahteden ayıran ipuçlarını okutmak için kart metni 15-16 px.
- Alt (başparmak bölgesi): iki büyük, metinli buton "✕ Sahte" / "✓ Gerçek" + klavye ipucu (← / →).
- Yanlış cevapta kart çevrilip arka yüzünde 1,5 sn'lik "neden" etiketi (çipler: "Aşırı ünlem", "Detay yok", "Link/reklam", "Tekrar eden kelime"); doğru cevapta yalnız hafif onay.
- Sonuç: isabet oranı halkası, doğru/yanlış, en uzun kombo, "bugün öğrendiğin işaretler" çipleri, ödül kartı, CTA'lar (Oyun Merkezi · Diğer oyunlar · Paylaş · Pratik yap).

**Motion / 3B (yerinde ve ölçülü):**
- Kart kaydırma: kart başına MotionValue, `AnimatePresence` çıkışı, yay fiziği (stiffness ~300, damping ~30); arka yığın 2 kartla sınırlı. 3B yalnız kart çevirme (rotateY 180°) için — "neden" arka yüzü; three.js gerekmez.
- Efekt bütçesi: doğru = küçük halka; milestone = tek şok dalgası; altın kart = kenar parıltısı. Konfeti yalnız ödül anında. `prefers-reduced-motion` ve uygulama tercihinde çevirme yerine çapraz solma, parçacık yok.
- Ses: ayrı sessize alma düğmesi (HUD'da), tercih `localStorage`'da.

**Veri / API değişiklikleri:**
- `MiniGameContent` tablosu (gameType[] veya ortak `fake-review` havuzu, text, isFake, signals String[], difficulty, locale, active) + admin içerik yönetimi; `review-detective` ile paylaşılır.
- `POST /api/customer/games/truth-vs-fake/start` → oturuma bağlı, tekrarsız, zorluk sıralı deste (cevapsız); cevap anahtarı `MiniGameSession.payload` (yeni `Json?` alanı) içinde.
- `POST …/complete` → `{ sessionId, decisions: [{cardId, judgedFake, tMs}] }`; sunucu skoru, isabeti, `won`'u hesaplar; insanüstü hız/zaman tutarsızlığı reddi; yanıtta her kart için `signals` döner (sonuç ekranı öğretici özeti için).
- `start`: `failed` → `alreadyPlayed` (veya `mode:'practice'`); sayfa sunucu bileşeninde efektif config + `playedToday` ön yükleme → ilk boyamada doğru durum (Oyna / Kilitli / Kapalı).
- Turnuva: belirleyici eşitlik kırıcı (`completedAt ASC`) + hafta kapanışında `TournamentResult` dondurma cron'u; claim yalnız oradan.
- Oyun puanları için günlük tavan (`capGamePoints`) ve `points-caps` yorumunun düzeltilmesi.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/review-detective` ile doğrudan çakışma:** İkisi de "yorum metnini oku, sahte/gerçek ayır" becerisini ölçüyor; içerik havuzları neredeyse aynı tarzda ve ayrı ayrı bileşene gömülü (`truth-vs-fake-game.tsx:26-41` ↔ `review-detective-game.tsx:25-41+`). Kardeş rapor (`customer_games_review-detective.md`) da aynı birleştirme kararını veriyor. **Öneri:** Tek bir "Sahte Yorum Avı" oyunu, iki mod: *Hızlı Mod* (bu sayfanın kaydırma mekaniği) ve *Dedektif Modu* (review-detective'in "dosyadan sahteyi bul" mekaniği); ortak içerik motoru ve ortak öğretici geri bildirim. Ekonomi açısından günde tek ödüllü hak (iki ayrı ödül yerine) — aynı beceriye iki kez ödeme yapılması da ortadan kalkar.
- **Tematik yakınlık (birleştirme değil, konumlandırma):** `/customer/games/word-spot` ("Sahteyi Yakala" — kelime ızgarasında farklı olanı bul) ve `/customer/games/bot-hunter` (sahte profil) aynı "sahteyi bul" anlatısını kullanıyor; hub'da 20 oyun içinde 4'ünün aynı vaatle görünmesi seçim yorgunluğu yaratıyor. Hub'da "Güven Becerileri" altında tek kartta toplanıp diğerleri refleks/bulmaca kategorilerine ayrılmalı.
- **Kaldırma önerilmiyor:** Kaydırma mekaniği mobilde en doğal ve en "Qratex'e özgü" oyun mekaniği; birleşik oyunun hızlı modu olarak korunmaya değer.

---

## Doğrulama (şüpheci inceleme)

> Yöntem: her iddia çürütülmeye çalışılarak çağıran/çağrılan kod baştan okundu (`app/api/customer/games/[game]/{start,complete}/route.ts`, `app/api/customer/games/status/route.ts`, `lib/use-mini-game.ts`, `components/customer/games/{truth-vs-fake-game,game-shell}.tsx`, `app/api/customer/tournament/route.ts`, `lib/tournament-core.ts`, `lib/points-caps.ts`, `lib/points-velocity.ts`, `lib/minigame-config(-effective).ts`, `prisma/schema.prisma` MiniGameSession, `node_modules/framer-motion@11.18.2` cjs kaynağı). Hiçbir şey çalıştırılmadı; DB'ye dokunulmadı.

### 1. Kaybedilen oyun (failed) aynı gün yeniden başlatılabiliyor, tamamlamada 409 — **DOĞRULANDI**
- `complete/route.ts:101` kaybedilen oyunu `status:'failed'` yapar. `start/route.ts:56-73` yalnız `completed`'i kilitler; `failed` oturum için `canPlay:true` + **aynı** `sessionId` döner (yorum "yarım kalan aktif oturum" diyor ama `failed`'i ayırt etmiyor).
- `complete/route.ts:73` yalnız `completed`'i reddeder → `failed` geçer; `:98-99` `updateMany where status:'active'` 0 satır → `:107-108` `credited:false` → `:177-181` **409 "Oyun zaten tamamlandı"**. `use-mini-game.ts:98-99,126-128` bunu hata toast'ı olarak gösterir.
- `status/route.ts:33` yalnız `completed`'i "bugün oynandı" sayar → hub kartı oynanmamış görünür.
- Yeniden üretim: 45 sn'de 12'nin altında skor yap → sonuç ekranı "Yarın tekrar dene" der → sayfayı yenile → "Oyna" aktif → tam tur oyna (12+ yapsan bile) → "Oyun zaten tamamlandı" hata toast'ı, ödül yok. Puan sızıntısı yok (ödül verilmiyor), ama kullanıcı 45+ sn emeği boşa harcıyor ve hub yanlış durum gösteriyor. Düzeltme: `start`'ta `existing.status !== 'active'` → `alreadyPlayed:true`; status route'unda `status in ['completed','failed']`.

### 2. Çift tık/dokunma aynı kartı iki kez puanlıyor — **DOĞRULANDI**
- `truth-vs-fake-game.tsx:126` koruma yalnız `runningRef` + `top`; `top` deste güncellenene kadar (`:182-185`, 240 ms sonra) değişmez. `flyOut` yalnız sürüklemeyi kapatır (`:268`); butonlarda (`:359-377`) `disabled`/kilit yok.
- 240 ms içindeki ikinci tık: `comboRef`+1, `scoreRef`+gain, `deadlineRef`+1200 ms (`:131-141`), `x.set(0)` kartı ortaya geri ışınlar, ikinci `setTimeout` desteden **ikinci kartı da** atar (görülmemiş kart puanlanmadan kaybolur).
- Yeniden üretim: doğru olduğundan emin olunan kartta ✓/✕ butonuna hızla iki kez bas → skor +2, kombo +2, süre +2,4 sn. Bilinçli kullanımla skor iki katına çıkar; eşik (12) ve turnuva sıralaması (`starsCollected`) doğrudan etkilenir. Düzeltme: `judgingRef` kilidi (judge girişinde set, deste ilerleyince bırak) + butonlarda `disabled={!!flyOut}`.

### 3. Turnuvada eşitlik kırıcı yok; ödül belirsiz, 3'ten fazla kişiye verilebilir — **DOĞRULANDI (kısmen: "3'ten fazla" kısmı olası, kanıtlanmadı)**
- `tournament/route.ts:29-35` `groupBy` yalnız `_max.starsCollected desc`; ikincil sıralama yok. `maxScore:20` (`lib/minigame-config.ts:94`) ve oyun `scoreRef >= maxScore`'da bitiyor (`truth-vs-fake-game.tsx:155-157`) → başarılı her oyuncu 20'de tavanlanır; çift tık (iddia 2) ve istemci beyanı (iddia 4) bunu daha da kolaylaştırır.
- Kesin olan: 20'de eşitlenen N>3 oyuncudan hangi 3'ünün 500/300/150 alacağı Postgres'in eşit anahtarlar için döndürdüğü keyfi sıraya bağlı — aynı skoru yapan kullanıcılar ödülsüz kalır, kural kullanıcıya açıklanamaz. Ayrıca `take:100` (`:34`) 100'den fazla eşitlikte kullanıcıyı listeden tamamen düşürebilir.
- Olası ama kanıtlanmamış: geçen haftanın verisi statik (MiniGameSession'ı güncelleyen başka yol yok; yalnız iki `complete` route'u `updateMany` yapıyor), aynı plan genelde aynı sırayı üretir; ancak SQL bunu garanti etmez (plan değişimi, paralel agregasyon). GET (`:83-96`) ve POST (`:145-148`) sırayı her istekte yeniden hesapladığından farklı isteklerde farklı kullanıcılar ilk 3'te görünebilir; unique yalnız `(userId, gameType, weekKey)` (`:157-160`) → toplam ödül 3 kişiyle sınırlı değil. Canlıda yeniden üretilmedi.
- Düzeltme: belirleyici sıralama (skor desc, o skora ilk ulaşma `completedAt` asc, `userId` asc) + hafta kapanışında sonucu donduran `TournamentResult` kaydı; claim yalnız dondurulmuş sıradan.

### 4. Skor/won istemci beyanı, cevap anahtarı istemcide; oyun puanları günlük tavana tabi değil — **DOĞRULANDI (tavan kısmı abartılı)**
- `complete/route.ts:59-61,82-87`: sunucu yalnız `score`'u `maxScore`'a kırpar, `won` bayrağını olduğu gibi kabul eder, tek kontrol ≥8 sn süre (`minDurationSec:8`). `computeEffectiveReward` (`lib/minigame-config-effective.ts:107-116`) yalnız eşiğe bakar. Cevap anahtarı (`fake` alanı) istemcide üretilir (`truth-vs-fake-game.tsx:44-51`).
- Yeniden üretim (tarayıcı konsolu, oturum açık): `POST /api/customer/games/truth-vs-fake/start` → 9 sn bekle → `POST …/complete {sessionId, score:20, durationSec:9, won:true}` → 140 puan + 70 XP + (günün ilkiyse) seri XP, haftalık turnuvada 20 skor. Oynamadan, beceri gerektirmeden.
- Tavan kısmı: `lib/points-caps.ts:17-27,37-47` gerçekten yalnız `category:'feedback'` sayar; `complete/route.ts:159-161` yorumu ("caps … oyun ekonomisini de görsün") yanlış. Ancak "tavansız" ifadesi abartılı: `@@unique([userId, gameType, dayKey])` (`prisma/schema.prisma:506`) her oyunu günde 1 ödülle sınırlar ve `lib/points-velocity.ts:17` `points_credited`'i izler. Yani asıl sorun limitsiz basım değil, **ödülün beceriden bağımsız alınabilmesi** ve turnuva ödülünün (500 puan) hileyle kapılabilmesi.
- Düzeltme: sunucu-otoriter deste (start'ta kartlar + cevap anahtarı oturumda saklanır), complete'te karar listesi alınıp skor/won sunucuda hesaplanır, insanüstü tepki süresi reddi; yanıltıcı yorum düzeltilir.

### 5. Paylaşılan `x` MotionValue uçuştan sonra sıfırlanmıyor — **DOĞRULANDI (kod okumasıyla; çalıştırılarak doğrulanmadı)**
- Zincir framer-motion 11.18.2 kaynağında izlendi: `style={{ x }}` dış MotionValue'yu `updateMotionValuesFromProps` → `element.addValue('x', x)` ile kaydeder (`dist/cjs/index.js:5207-5216`); `animateTarget` her anahtar için `visualElement.getValue(key)` çağırır (`:3523`), bu da `this.values.get('x')` = **aynı dış MotionValue**'yu döndürür (`:5627-5637`) ve `value.start(...)` ile onu ±520'ye sürer. `unmount()` (`:5418-5437`) değeri durdurmaz/sıfırlamaz.
- Bileşende: `x.set(0)` uçuştan **önce** çağrılıyor (`truth-vs-fake-game.tsx:180`), 240 ms sonra `setDeck`+`setFlyOut(null)` aynı batch'te eski kartı söküp yeni üst kartı aynı `x` ile bağlıyor (`:182-185, :269`); yeni kartta `initial={false}` ve `animate={}` (`:272-284`) → hiçbir şey x'i 0'a çekmiyor. Sonuç: yeni üst kart `translateX(±520px)`, `rotate` ±20° (useTransform varsayılan clamp), ilgili damga opaklığı 1. Kart 270 px genişlikte ve arena `overflow-hidden` → arena genişliği ~770 px'in altındaki her ekranda (tüm telefonlar dahil) üst kart görünmez; oyuncu yalnız metinsiz arka yığını görür ve kartı ancak bir sonraki butona bastığında `x.set(0)` ile 240 ms'lik uçuş sırasında görebilir.
- Neden "belirsiz" değil: zincirin her halkası kaynakta okundu ve çelişen bir sıfırlama yolu bulunamadı (drag özelliği mount'ta yalnız ref-kısıtı ölçer, `didUpdate` dinleyicisi yalnız sürükleme sırasında x'e dokunur). Yine de bir tarayıcıda ilk kaydırmadan sonra üst kartın konumu gözle teyit edilmeli (projedeki headless Chrome tezgâhı uygun).
- Etki: çekirdek oyun döngüsü ilk karttan sonra bozuk; kullanıcı kör tahminle oynuyor (bu, iddia 1'deki "eşik altı kalma" oranını da büyük olasılıkla artırıyor). Düzeltme: üst kartı ayrı bileşen yapıp kart başına kendi `useMotionValue`'su + `AnimatePresence` `exit` ile uçuş; en azından deste ilerlerken `x.jump(0)`.

| # | İddia | Karar |
|---|---|---|
| 1 | failed oturum yeniden açılıp 409 veriyor | Doğrulandı |
| 2 | Çift tık çift puan | Doğrulandı |
| 3 | Turnuva eşitlik kırıcı yok | Doğrulandı (">3 kişi" kısmı olası, kanıtlanmadı) |
| 4 | İstemci-otoriter skor / tavan | Doğrulandı (tavan kısmı abartılı; günde 1 hak sınırı var) |
| 5 | Paylaşılan x MotionValue sıfırlanmıyor | Doğrulandı (kod okuması; çalıştırılmadı) |

## Uygulama (Dalga 2)

Bu oyun **Sahte Avcısı** (`/customer/games/fake-hunter`) amiral oyununun **Kaydır** aşaması olarak yeniden kuruldu; eski rota `/customer/games/truth-vs-fake` sorgu parametrelerini koruyarak `/customer/games/fake-hunter?mod=kaydir`'e kalıcı yönlenir, eski bileşen silindi.

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
