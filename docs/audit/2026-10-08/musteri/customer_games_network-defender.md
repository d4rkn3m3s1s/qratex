# /customer/games/network-defender

**Amaç:** Müşteri panelindeki 20+ mini oyundan biri. Oyuncu 11 düğümlük bir ağda yayılan "kötü amaçlı sinyali" düğümlere dokunarak temizler; 50 saniyede eşik skoruna (8) ulaşır ve 6 düğümün enfekte olmasını engellerse günlük ödül (150 puan + 75 XP) kazanır. Bu oyun haftalık turnuvaya ve tüm zamanların liderlik tablosuna da yazılır.

**Genel puan:** 3.8 / 10
**Karar:** **yeniden inşa.** GameShell, useMiniGame ve sunucu tarafındaki ödül hattı sağlam, onlar kalabilir. Ancak oyunun çekirdeğini oluşturan `network-defender-game.tsx` üç ayrı yapısal hata içeriyor: graf kimlik/indeks uyuşmazlığı, düğümleri yanlış yere koyan transform ezilmesi ve yeniden tohumlama olmadığı için kilitlenen oyun döngüsü. Oyun tasarımı da kendi içinde çelişiyor: "savunucu" temasına karşın en iyi strateji enfeksiyonu yaymak. Bu bileşen yamayla düzelmez, sıfırdan yazılmalı.

> Yöntem: Salt okuma. Sayfa, bileşenler, hook'lar, API route'ları, Prisma şeması ve `node_modules/framer-motion` kaynağı (v11.18.2) satır satır okundu. Tarayıcıda çalıştırılmadı; görsel sonuçlar kod okumasından çıkarıldı ve ilgili yerlerde öyle belirtildi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Graf yanlış kuruluyor: merkez bağlantıları yok ve bir düğüm yalıtık kalıyor. İkinci mount'ta hiç kenar oluşmuyor. Enfeksiyon temizlenince oyun 50 saniye boyunca donuk kalıyor. Ödül hattı ise doğru çalışıyor. |
| UX | 4/10 | Kazanma koşulu (eşik 8, süre ya da 15'e ulaşma) oyundan önce anlatılmıyor. Kombo hiç sıfırlanmıyor, kayıp ekranı yanlış sebep gösteriyor, "tekrar / merkeze dön" CTA'sı yok. |
| Görsel | 5/10 | Neon kabuk ve FX katmanı iyi. Ama düğümler kenar uçlarından 15–20 px kaymış görünüyor (framer transform ezilmesi). 🟢 emojisi renkli dairenin içinde gereksiz tekrar. |
| Mimari | 4/10 | Modül seviyesinde `_seq` kullanılıyor. Kenarlar indeksle, düğümler kimlikle tutuluyor. State nesneleri yerinde mutasyona uğruyor. Sunucu config'i yok sayılıyor (statik `DEF`). Ölü import var. |
| Performans | 7/10 | Küçük DOM ve 200 ms tick sorun değil. FxLayer'ın rAF döngüsü parçacık yokken de dönüyor. Turnuva ve liderlik uçları önbelleksiz groupBy çalıştırıyor. |
| Erişilebilirlik + mobil | 3/10 | Düğüm butonlarında aria-label yok. Temiz düğümler odaklanabiliyor ama dokununca hiçbir şey olmuyor. 10–11 px düşük kontrastlı metinler var. Mobilde h1 yok. Ses kapatma yok. SVG `<animate>` azaltılmış hareket tercihine uymuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu taraflı rol kontrolü (CUSTOMER) | ÇALIŞIYOR | `app/customer/games/network-defender/page.tsx:10-13` | Başka rolde oturum açmış kullanıcı da `/auth/signin`'e atılıyor; "yanlış panel" mesajı yok. |
| 2 | Sekme başlığı (metadata) | KISMİ | `page.tsx:7` + `app/customer/layout.tsx:18-21` | Şablonla birleşince "Ağ Savunucusu \| QRateX \| Müşteri alanı" oluyor; marka iki kez geçiyor. |
| 3 | Sayfa başlığı ve açıklaması (DashboardPageHeading) | KISMİ | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex` olduğu için mobilde hiç görünmüyor. Masaüstünde GameShell başlığıyla aynı bilgiyi tekrarlıyor. Statik metin, admin override'ını yansıtmıyor. |
| 4 | Admin "oyun pasif" kontrolü (sayfa seviyesinde) | KISMİ | `page.tsx` (kontrol yok), `app/api/customer/games/[game]/start/route.ts:34-39` | Pasif oyunun sayfası açılıyor; kullanıcı ancak "Oyna"ya basınca 403 toast'ı görüyor. |
| 5 | Neon kabuk, ızgara ve köşe aksanları | ÇALIŞIYOR | `components/customer/games/game-shell.tsx:96-129` | |
| 6 | Başlangıç ekranı: yüzen emoji, başlık, açıklama | KISMİ | `game-shell.tsx:165-184`, `network-defender-game.tsx:16,227-229` | Statik `DEF` okunuyor; admin'in title/emoji/accent override'ı oyunda görünmüyor (hub'da görünüyor). |
| 7 | Başlangıç ipucu şeridi | KISMİ | `lib/minigame-copy.ts:123`, `game-shell.tsx:185-188` | Ödül eşiği (8), süre (50 sn) ve kayıp sınırı (6) yazmıyor. |
| 8 | "🌐 Ağı Savun" başlat butonu ve nabız halkası | ÇALIŞIYOR | `game-shell.tsx:189-208`, `minigame-copy.ts:122` | |
| 9 | Oturum başlatma (start API) ve "günde 1 hak" | KISMİ | `start/route.ts:56-73` | `failed` oturum "aktif" gibi geri dönüyor; sınırsız tekrar oynanabiliyor (Bulgu 4). |
| 10 | Yükleniyor durumu (starting/submitting) | ÇALIŞIYOR | `game-shell.tsx:146-162` | |
| 11 | Başlatma hatası toast'ı | ÇALIŞIYOR | `lib/use-mini-game.ts:74-77` | |
| 12 | Haftalık turnuva paneli (sıralama, geri sayım, ödül havuzu) | KISMİ | `components/customer/games/game-tournament.tsx:108-180` | Açık temada metin rengi yanlış miras alınıyor. Hata durumunda panel sessizce kayboluyor (`:106`). Skor yanında "⭐" var ama skor düğüm sayısı. |
| 13 | Turnuva "Ödülü al" butonu | KISMİ | `game-tournament.tsx:84-97,123-140`, `app/api/customer/tournament/route.ts:145-161` | Beraberlikte sıra deterministik değil, aynı sıra ödülü iki kişiye verilebilir (Bulgu 5). Toast'ta admin öneki "Basarili:" çıkıyor. |
| 14 | Tüm zamanlar liderlik tablosu | KISMİ | `game-leaderboard.tsx:30-113`, `leaderboard/route.ts:47-83` | Hata gelince "Henüz skor yok" gösteriyor. `take:100` yüzünden "oyuncu" sayısı en fazla 100. maxScore=15 olduğu için tablo hızla 15'lerle doluyor ve beraberlikler rastgele sıralanıyor. |
| 15 | Ağ grafiği oluşturma (11 düğüm + kenarlar) | BOZUK | `network-defender-game.tsx:31-51` | Kenarlar indeksle (0..10), düğümler `++_seq` kimliğiyle tutuluyor (Bulgu 1). |
| 16 | Kenar çizimi (SVG) ve "tehlike" nabzı | BOZUK | `network-defender-game.tsx:223,274-295` | Merkez kolları (spoke) hiç çizilmiyor. İkinci mount'ta hiçbir kenar çizilmiyor. |
| 17 | Düğüm konumlandırma (merkezleme) | BOZUK | `network-defender-game.tsx:301-313`; framer `build-styles.mjs:43-54`, `use-props.mjs:27-28` | `style.transform: translate(-50%,-50%)` framer tarafından `none`/`scale(...)` ile eziliyor (Bulgu 2). |
| 18 | Başlangıç enfeksiyonu (seed) | KISMİ | `network-defender-game.tsx:111-112` | 1/9 olasılıkla yalıtık düğüm seçiliyor ve enfeksiyon hiç yayılmıyor. |
| 19 | Zamanla hızlanan enfeksiyon yayılımı | KISMİ | `network-defender-game.tsx:117-156` | Yeniden tohumlama yok; her şey temizlenince oyun duruyor (Bulgu 3). |
| 20 | Düğüm temizleme dokunuşu | ÇALIŞIYOR | `network-defender-game.tsx:180-209` | Yalnız enfekte düğümde etkili. Temiz düğüm de buton ve odaklanabilir ama dokunulunca hiçbir şey yapmıyor. |
| 21 | Skor ve her 4. temizlemede +1 bonus | KISMİ | `network-defender-game.tsx:186-190` | Bonus "kombo"ya bağlı, ama kombo hiç kırılmıyor (#22). |
| 22 | 🔥 Kombo göstergesi | SAHTE | `network-defender-game.tsx:186-187,245-247` | `comboRef` yalnız artıyor, sıfırlayan kod yok. Gösterilen değer aslında "toplam temizlenen". |
| 23 | Enfekte sayacı (x/6) | ÇALIŞIYOR | `network-defender-game.tsx:240-242` | |
| 24 | Geri sayım (50 sn) | KISMİ | `network-defender-game.tsx:158-170` | Sekme gizlenince duraklamıyor. Süre `Date.now()` ile aktığı için geri dönen kullanıcı oyunu bitmiş buluyor. |
| 25 | Karantina şarj barı ve butonu | ÇALIŞIYOR | `network-defender-game.tsx:212-221,253-266` | aria-label ve durum duyurusu yok. Etiket büyük/küçük harf tutarsız ("karantina" / "KARANTİNA!"). |
| 26 | Karantina etkisi (yayılımı 3,5 sn durdurma) | ÇALIŞIYOR | `network-defender-game.tsx:126,215` | Teknik olarak doğru, ama oyun tasarımıyla çelişiyor (Bulgu 3). |
| 27 | Kayıp koşulu (6 enfekte düğüm) | ÇALIŞIYOR | `network-defender-game.tsx:145-149` | |
| 28 | Kazanma (süre sonunda eşik ya da maxScore'a erken ulaşma) | KISMİ | `network-defender-game.tsx:168,206` | Statik `DEF` kullanılıyor; sunucunun etkin config'i (`game.config`) yok sayılıyor (Bulgu 7). |
| 29 | FX: burst / ring / floatText / shockwave | ÇALIŞIYOR | `network-defender-game.tsx:139-143,193-204,219-220`; `fx-layer.tsx:170-230` | `reduce-animations` sınıfına uyuyor. |
| 30 | Ses efektleri (Web Audio) | KISMİ | `network-defender-game.tsx:11,138,191,201,217`; `lib/game-sounds.ts:115-120` | Her yayılımda `sfxWarn` çalıyor (0,7–1,4 sn'de bir bip). Ses kapatma yok. `sfxCollectStar` import edilmiş ama kullanılmıyor. |
| 31 | Dokunsal geri bildirim (haptic) | ÇALIŞIYOR | `network-defender-game.tsx:192,218`; `game-sounds.ts:158-165` | |
| 32 | Alt ipucu satırı | KISMİ | `network-defender-game.tsx:329` | 11 px `text-white/50`, kontrastı düşük. |
| 33 | Sonuç gönderme (complete API), atomik ödül | ÇALIŞIYOR | `complete/route.ts:96-175` | Tek-claim, `points_credited` olayı ve seri claim'i doğru. |
| 34 | Ödül, seri bonusu ve başarım toast'ları | ÇALIŞIYOR | `use-mini-game.ts:111-125` | |
| 35 | Sonuç ekranı (trofe/💀, varyant başlık) | ÇALIŞIYOR | `game-shell.tsx:222-267`, `minigame-copy.ts:125-126` | |
| 36 | Sonuç skoru etiketi ("Temizlenen düğüm") | KISMİ | `minigame-copy.ts:127`, `game-shell.tsx:269-272` | Skor kombo bonusunu da içeriyor; 12 düğüm temizleyen "15" görüyor. |
| 37 | Ödül kartı ve eşik altı notu | KISMİ | `game-shell.tsx:274-294` | Enfeksiyon yüzünden kaybeden 10 skorlu oyuncuya "Ödül için 8 skor gerekiyordu" yazıyor; sebep yanlış. |
| 38 | Kazanma konfetisi | ÇALIŞIYOR | `game-shell.tsx:19-31,86-94` | |
| 39 | Sonuç ekranında liderlik tablosu | ÇALIŞIYOR | `game-shell.tsx:299-303` | |
| 40 | "Bugün oynandı" kilit ekranı | KISMİ | `game-shell.tsx:307-332` | "00:00 (UTC)" yazıyor; Türkiye için 03:00 yerel saati gösterilmeli. |
| 41 | Kaybedince hub'da "oynandı" rozeti | BOZUK | `app/api/customer/games/status/route.ts:33` | Yalnız `completed` sayılıyor; kaybedilen oyun hub'da hâlâ "oynanabilir" görünüyor. |
| 42 | Tekrar oyna / Oyun Merkezi'ne dön / sıradaki oyun CTA'sı | EKSİK | `game-shell.tsx:222-305` | Sonuç ekranından çıkış ancak sidebar ile mümkün. |
| 43 | Nasıl oynanır / ilk oyun öğreticisi | EKSİK | — | Mekanik ilk kez oynayana açıklanmıyor. |
| 44 | Duraklatma / sekme görünürlüğünde dondurma | EKSİK | — | `visibilitychange` dinleyicisi yok. |
| 45 | Ses aç/kapat | EKSİK | `game-sounds.ts:10-13` | Ses yalnız "animasyonları azalt" tercihiyle kapanıyor (iki ayrı ihtiyaç birbirine bağlanmış). |
| 46 | Klavye / ekran okuyucu ile oynanabilirlik | EKSİK | `network-defender-game.tsx:301-323` | Düğümlerde aria-label ve durum bilgisi yok; canlı bölge (aria-live) yok. |
| 47 | Azaltılmış hareket desteği (oyun içi) | KISMİ | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`), `network-defender-game.tsx:291` | Framer ölçeklemesi OS tercihine uyuyor, ama SVG `<animate>` ve uygulama içi `reduce-animations` ayarı düğüm nabzını durdurmuyor. |
| 48 | Kişisel en iyi skor / dünkü sonuç / ilerleme | EKSİK | — | Yalnız liderlikte "Sen" satırı var. |

**Durum özeti:** ÇALIŞIYOR 17 · KISMİ 20 · BOZUK 4 · SAHTE 1 · EKSİK 6 (toplam 48)

---

## Bulgular

### 1. KRİTİK · Hata · Graf kimlik/indeks uyuşmazlığı: merkez kolları yok, bir düğüm yalıtık, ikinci mount'ta hiç kenar yok
- **Kanıt:** `components/customer/games/network-defender-game.tsx:31` (`let _seq = 0;` modül seviyesinde), `:38` (`id: ++_seq`), `:46-49` (kenarlar **indeksle**: `edges.push([0, i])`, `[i, 1 + (i % (NODE_COUNT - 1))]`), `:131-134` (yayılım kenarları **id** ile eşliyor), `:223,275-277` (çizim `nodeById(a)` ile id arıyor).
- **Sorun:**
  - **İlk mount (_seq=0):** Düğüm id'leri 1..11, kenar uçları 0..10. Var olmayan `id=0` nedeniyle 10 merkez kolunun hiçbiri çizilmiyor ve yayılımda kullanılmıyor. Kalan `[i, i+1]` kenarları id uzayında bir kayma yaratıyor: merkez düğüm (id 1) halkanın bir parçası gibi davranıyor, 11. düğüm (id 11, indeks 10) hiçbir kenarda yer almıyor ve tamamen yalıtık kalıyor.
  - **Tohum:** İndeks 2..10 arasından seçiliyor (`:111`). Yalıtık düğüm 1/9 (yaklaşık %11) olasılıkla seçiliyor ve o zaman enfeksiyon hiç yayılmıyor. Bu durumda en yüksek skor 1 olur, oyun **kazanılamaz** ve günlük hak `failed` olarak yanar.
  - **İkinci mount:** `_seq` 11'den devam ediyor, id'ler 12..22 oluyor ve hiçbir kenar eşleşmiyor. Ne çizgi ne yayılım var, oyun tamamen kırık. Bu durum client-side navigasyonla geri dönüldüğünde (Bulgu 4'teki tekrar akışı), açık bırakılan PWA'da ertesi gün oynandığında ve dev ortamında `reactStrictMode: true` (`next.config:258`) yüzünden her zaman yaşanıyor (efekt iki kez çalışıyor).
- **Profesyonel öneri:** Graf **saf ve deterministik** bir fonksiyonla (`buildGraph(seed)`) üretilmeli. Kenarlar ya düğüm id'leriyle ya da tamamen indeksle tutulmalı, ikisi karışmamalı. Modül seviyesindeki sayaç kaldırılmalı; id = indeks yeterli, React key için `round-${roundId}-${i}` kullanılabilir. `buildGraph` için birim testi yazılmalı: her düğümün derecesi en az 2 olmalı, graf bağlı olmalı ve 1000 rastgele tohumda yalıtık düğüm çıkmamalı. Mevcut halka+merkez topolojisi yerine her oturumda değişen, Poisson-disk yerleşimli ve bağlılığı garanti edilmiş (minimum spanning tree + 2–3 ek kenar) bir topoloji tekrar oynanabilirliği artırır.
- **Efor:** M

### 2. YÜKSEK · Görsel/Hata · Framer `animate={{scale}}` inline `translate(-50%,-50%)`'i eziyor; düğümler kenar uçlarından kayık
- **Kanıt:** `network-defender-game.tsx:305-306` (`animate={infected ? { scale: [...] } : { scale: 1 }}`), `:313` (`transform: 'translate(-50%, -50%)'`). Framer v11.18.2: `node_modules/framer-motion/dist/es/render/html/use-props.mjs:27-28` önce ham stili kopyalıyor, sonra motion stilini `Object.assign` ile üzerine yazıyor. `build-styles.mjs:43-54` transform değeri varsa `style.transform = buildTransform(...)` atıyor ve `scale:1` için sonuç `"none"` oluyor (`build-transform.mjs:56-58`).
- **Sorun:** Bütün düğümler sol-üst köşeleri koordinata gelecek şekilde çiziliyor. Normal düğüm 15 px, merkez 20 px sağa-aşağı kayıyor. SVG çizgileri düğüm merkezine değil köşesine bağlanıyor ve "ağ" görüntüsü bozuluyor. Enfekte düğüm nabız atarken de translate kaybolduğu için öteleme düzelmiyor. (Kod okumasıyla doğrulandı, tarayıcıda görülmedi. Hafızadaki "framer inline transform'u ezer" tuzağıyla da aynı.)
- **Profesyonel öneri:** Konumlandırmayı framer'ın kendi transform kanalına taşıyın: `style={{ left, top, x: '-50%', y: '-50%' }}`. Alternatif olarak dış `div` konumlandırsın, içteki `Motion.span` ölçeklensin. Daha iyisi, düğümleri SVG içinde `<g transform>` + `<circle>` olarak çizmek ve dokunma alanını görünmez 44 px `<circle>` ile genişletmek; böylece çizgi ve düğüm aynı koordinat sisteminde olur ve kayma imkânsızlaşır.
- **Efor:** S

### 3. YÜKSEK · Oyun tasarımı/Hata · Yeniden tohumlama yok: kuralı uygulayan oyuncu cezalandırılıyor, en iyi strateji "savunmamak"
- **Kanıt:** `network-defender-game.tsx:128-129` (`if (infected.length > 0)`; enfekte yoksa hiçbir şey olmuyor, yeni enfeksiyon da başlatılmıyor), `:168` (süre sonunda `score >= 8` gerekiyor), `:329` ("☣️ Enfekteyi temizle").
- **Sorun:** İpucuna uyan oyuncu ilk enfeksiyonu hemen temizliyor. Ağda enfeksiyon kalmadığı için 49 saniye boyunca hiçbir şey olmuyor, skor 1'de kalıyor ve oyuncu **kaybediyor**. Kazanmanın tek yolu enfeksiyonu bilerek yaşatıp "çiftlik" yapmak, yani tema ("Savunucu") ile mekanik çelişiyor. Karantina (yayılımı durdurur) bu durumda puan kaynağını kesen bir **ceza** gibi çalışıyor. Kombo hiç kırılmadığı için (`:186`, sıfırlama yok) beceri ifadesi de yok.
- **Profesyonel öneri:** Oyun döngüsü yeniden tasarlanmalı:
  1. Enfeksiyon **dış kaynaktan** dalgalar halinde gelsin: her N saniyede rastgele bir "giriş noktası" (uç düğüm) enfekte olsun ve dalga sıklığı zamanla artsın.
  2. Skor, temizlenen düğümle birlikte "ağın sağlıklı kaldığı süre" ile çarpılsın: Duolingo'daki "kusursuz ders" bonusu gibi, savunmayı ödüllendiren bir metrik.
  3. Kombo, X ms içinde art arda temizlemeyle artsın ve bir yayılım gerçekleşince sıfırlansın.
  4. Karantina "yayılımı durdur" değil "seçili düğümü 5 sn bağışık yap" gibi taktik bir araç olsun.

  Kural metni, eşik ve kazanma koşulu başlangıç ekranında 3 maddelik bir "Nasıl oynanır" kartıyla gösterilmeli.
- **Efor:** L

### 4. YÜKSEK · Güvenlik/Ekonomi (sistem geneli) · Kaybedilen oturum "aktif" gibi geri dönüyor; sınırsız tekrar ve sayfa yenilemeyle "kazanana kadar dene" açığı var
- **Kanıt:** `app/api/customer/games/[game]/start/route.ts:56-73`: yalnız `status === 'completed'` engelleniyor; `failed` oturum "Yarım kalan aktif oturum" yorumuyla `canPlay:true` ve aynı `sessionId` ile dönüyor. `complete/route.ts:98-108` yalnız `status:'active'` kaydı güncelliyor, böylece `failed` oturumda `count=0` ve 409 "Oyun zaten tamamlandı" dönüyor. `status/route.ts:33` hub'da yalnız `completed` sayıyor.
- **Sorun:**
  - **(a) Kayıptan sonra:** Hub oyunu "oynanabilir" gösteriyor. Kullanıcı tekrar oynuyor ama sonuç her zaman 409 ile reddediliyor. Kazansa bile sonuç ekranında "Ağ Temizlendi!" başlığıyla birlikte kırmızı hata toast'ı görüyor (`use-mini-game.ts:126-128`). Client-side navigasyonla gelindiyse Bulgu 1 yüzünden graf da tamamen kırık oluyor.
  - **(b) Oyun ortasında:** Kaybedeceğini gören kullanıcı sayfayı yenileyince oturum `active` kaldığı için aynı oturum tekrar dönüyor. Böylece "günde 1 hak" fiilen "kazanana kadar sınırsız deneme"ye dönüşüyor. Günlük ödül tavanı korunuyor (tek-claim), ama eşik ve turnuva rekabeti anlamsızlaşıyor: turnuva skorları da sınırsız denemeyle şişiyor.
- **Profesyonel öneri:**
  - `start` yalnız `status === 'active'` ise oturumu geri versin; `failed` ve `completed` ikisi de `alreadyPlayed` olsun. Hub `status` ucu da `status in ('completed','failed')` saysın.
  - Yenileme açığı için oturuma `attempt` sayacı ve `lastStartedAt` eklensin. `start` her çağrıda sayacı artırsın, `active` oturum yeniden açılınca bir önceki deneme "abandoned/failed" sayılsın ya da yalnız 1 kez "kaldığın yerden" hakkı tanınsın. Bu değişiklik generic olduğu için 20 oyunun tamamını düzeltir.
- **Efor:** M

### 5. YÜKSEK · Ekonomi/Veri bütünlüğü (sistem geneli) · Turnuva beraberliği deterministik değil; aynı sıranın ödülü birden fazla kişiye verilebilir
- **Kanıt:** `app/api/customer/tournament/route.ts:28-39` (`orderBy: { _max: { starsCollected: 'desc' } }`, ikincil sıralama yok), `:145-147` (POST sırayı yeniden hesaplıyor), `:157-160` (`createMany ... skipDuplicates`). `prisma/schema.prisma:1088` tekil kısıt `@@unique([userId, gameType, weekKey])`; `(gameType, weekKey, rank)` için tekil kısıt **yok**.
- **Sorun:** Bu oyunda `maxScore=15` (`lib/minigame-config.ts:192`), Bulgu 4'teki sınırsız deneme de eklenince haftanın zirvesinde birden fazla 15 skoru çok olası. Postgres eşit değerlerde sıra garantisi vermediği için A kullanıcısının POST'unda A 1. sırada, B'nin POST'unda B 1. sırada hesaplanabilir; ikisi de 500 puan alır. Ödül havuzu sınırsız basılmış olur ve bu "puan basan her yol" invariant'ını ihlal ediyor. Tersine, GET'te "ödül bekliyor" görünen kullanıcı POST'ta "Geçen hafta ödül kazanmadın" alabilir.
- **Profesyonel öneri:** Sıralamaya deterministik ikincil anahtar ekleyin: ilk ulaşma zamanı (`MIN(completedAt)` where skor = max), sonra `userId`. Sıra kapanışta **bir kez** dondurulsun: haftalık cron'un `TournamentResult(gameType, weekKey, rank, userId)` tablosunu `@@unique([gameType, weekKey, rank])` ile yazması gerekiyor; claim yalnız bu tablodan okusun. Beraberlik politikası (ortak 1. ve ödül bölüşümü ya da erken ulaşan kazanır) kullanıcıya açıkça yazılsın. Ayrıca bu oyunun `maxScore`'u ayrıştırıcı bir skora (süre/sağlık çarpanlı) çıkarılmalı.
- **Efor:** M

### 6. ORTA · Erişilebilirlik/Görsel · Turnuva paneli açık temada okunamıyor ve admin toast'ı kullanıyor
- **Kanıt:** `game-tournament.tsx:134` (`<p className="text-sm font-bold">` renk sınıfı yok), `:164` (isim satırı renk sınıfı yok), `:46,116,151,174` (`text-muted-foreground`, `bg-muted/40` tema token'ları). GameShell arka planı sabit koyu (`game-shell.tsx:101-102`). `:6` `toast` `@/lib/admin-toast`'tan geliyor; o da "Basarili: " / "Dikkat: " önekini ekliyor (`lib/admin-toast.ts:14-19`, ASCII, Türkçe karaktersiz).
- **Sorun:** Açık temada `foreground` koyu olduğu için koyu neon zemin üzerinde koyu metin çıkıyor. "Geçen hafta 1. oldun!" ödül çağrısı ve sıralama isimleri neredeyse görünmez. (Kod okumasıyla çıkarıldı, görsel doğrulanmadı.) Müşteri "Basarili: 🏆 1. oldun" gibi admin tonunda ve imla hatalı bir mesaj görüyor. Liderlik bileşeni `text-white/..` kullanırken turnuva tema token'ları kullanıyor; aynı kart içinde iki ayrı renk sistemi var.
- **Profesyonel öneri:** Oyun kabuğu bir `data-theme="dark"` alanı olarak işaretlensin (`className="dark"` ya da CSS değişken kapsamı); içindeki tüm bileşenler kabuğun koyu paletini kullansın. Turnuva sonner'ın düz `toast`'una geçsin. Liderlik ve turnuva tek bir "Sıralama" bileşeninde sekmeli birleştirilsin ("Bu hafta / Tüm zamanlar").
- **Efor:** S

### 7. ORTA · Mimari · Client statik registry'yi kullanıyor; admin override'ları (eşik, maxScore, başlık, renk) oyunda yok sayılıyor
- **Kanıt:** `network-defender-game.tsx:16` (`const DEF = getMiniGame(...)!`), `:168,206,227-234` DEF kullanıyor. `use-mini-game.ts:70,137` sunucudan `config` alıp döndürüyor, ama bileşen `game.config`'i hiç kullanmıyor. Sunucu `lib/minigame-config-effective.ts:44-56` override uyguluyor.
- **Sorun:** Admin eşiği 5'e düşürürse client 7 skorda `won=false` gönderir; sunucu `eligible = won && ...` (`complete/route.ts:86`) olduğu için ödül vermez, oysa sunucu eşiği geçilmişti. Eşik 10'a çıkarsa client 8'de "kazandın" der, sunucu ödül vermez ve kullanıcı "Kazandın ama eşiği geçemedin" toast'ını görür. maxScore değişirse oyun yine 15'te erken biter. Hub'da admin'in verdiği başlık/emoji/renk, oyun sayfasında eskisiyle görünür.
- **Profesyonel öneri:** Sayfa server component olduğu için `getEffectiveMiniGame('network-defender')` ile etkin tanım sunucuda alınıp bileşene prop olarak geçilsin (pasifse `notFound()` ya da "şu an kapalı" ekranı gösterilsin, böylece #4 de çözülür). Daha doğru çözüm: `won` kararını client'tan tamamen kaldırmak. Client yalnız ham olayları/skoru göndersin, kazanma ve ödül kararını sunucu versin.
- **Efor:** S

### 8. ORTA · UX · Sonuç ekranı yanlış sebep söylüyor, skor etiketi yanlış ve çıkış yolu yok
- **Kanıt:** `game-shell.tsx:290-293` (`rewardMissNote` tanımsız olduğu için "Ödül için 8 skor gerekiyordu"; kayıp sebebi gösterilmiyor), `minigame-copy.ts:127` (`scoreLabel: 'Temizlenen düğüm'`) ile `network-defender-game.tsx:188-189` (skor bonus içeriyor), `game-shell.tsx:222-305` (CTA yok).
- **Sorun:** 10 skor yapıp ağ çöktüğü için kaybeden oyuncuya "8 skor gerekiyordu" deniyor, bu kafa karıştırıcı ve haksız hissettiriyor. "Temizlenen düğüm: 15" aslında 12 temizleme. Sonuç ekranından sonra kullanıcı çıkmaz sokakta kalıyor; Duolingo tarzı "sıradaki" akışı yok.
- **Profesyonel öneri:** `finish` bir `reason` (`'infected' | 'timeout' | 'maxScore'`) ve istatistik nesnesi döndürsün (temizlenen, en yüksek kombo, en uzun sağlıklı süre, kullanılan karantina). Sonuç ekranı "Wrapped" mini-kartı gibi 3 metrik ve "dünkü/en iyi skoruna göre +X" göstersin. Altta iki CTA olsun: "Oyun Merkezi'ne dön" ve "Bugün oynamadığın oyun: Sinyal Bağla →" (hub `status` verisinden).
- **Efor:** M

### 9. ORTA · Erişilebilirlik · Düğümler ekran okuyucu ve klavye için anlamsız; temiz düğümler boş tab durağı
- **Kanıt:** `network-defender-game.tsx:301-323` (aria-label yok, `disabled` yok, içerik yalnız emoji), `:253-266` (karantina butonunda erişilebilir ad yalnız "karantina", durum duyurusu yok), `:249` (süre canlı bölge değil), `page-heading.tsx:21` (mobilde h1 yok).
- **Sorun:** Klavye kullanıcısı 11 düğüm arasında tab'la geziyor; hangisinin enfekte olduğunu ancak "☣️ biohazard" emoji okunuşundan anlayabiliyor ve temiz düğümler hiçbir şey yapmıyor. Dokunma hedefleri 30 px; 44 px önerisinin altında. 10–11 px `text-white/50` metinler (`:263,329`) WCAG AA kontrastını karşılamıyor (doğrulanmadı, `white/50` koyu zemin üzerinde sınırda).
- **Profesyonel öneri:** Düğüm `aria-label="Düğüm 4, enfekte"`, temiz düğüm `aria-disabled` olsun ve roving tabindex ile yalnız enfekte düğümler arasında ok tuşlarıyla gezilsin. Kısayol tuşları eklensin: Q = karantina, Space = en yakın enfekte. `aria-live="polite"` bölgesi "Yeni enfeksiyon: düğüm 7, 3/6" duyursun. Görünmez 44 px dokunma alanı eklensin. Mobilde görsel olarak gizli bir `h1` (sr-only) bulunsun.
- **Efor:** M

### 10. ORTA · UX/Performans · Sekme gizlenince oyun duraklamıyor; ses kapatma yok; uyarı bipi çok sık
- **Kanıt:** `network-defender-game.tsx:114,159-160` (süre `Date.now()` ile akıyor, `visibilitychange` yok), `:138` (her yayılımda `sfxWarn`), `game-sounds.ts:10-13` (ses yalnız `reduce-animations` ile kapanıyor), `fx-layer.tsx:79-159` (parçacık yokken de rAF ile `clearRect` yapılıyor).
- **Sorun:** Bildirime bakmak için uygulamadan çıkan mobil kullanıcı döndüğünde oyunu kaybetmiş ya da süresi dolmuş buluyor; günlük hak yanıyor. 50 saniye boyunca 0,7–1,4 sn'de bir kare dalga bip sesi rahatsız edici ve toplu taşımada sessize almak mümkün değil.
- **Profesyonel öneri:** `document.visibilityState === 'hidden'` olduğunda oyunu duraklatın: kalan süreyi ve yayılım zamanlayıcısını dondurun, dönüşte "Devam et" katmanı gösterin. Sunucu tarafındaki `minDurationSec` bundan etkilenmez. GameShell başlığına kalıcı (localStorage) bir ses aç/kapat düğmesi ekleyin ve ses tercihini hareket tercihinden ayırın. Yayılım sesi her olayda değil, eşik yaklaşınca (4/6, 5/6) yükselen bir "alarm" katmanı olsun. FxLayer parçacık listesi boşken rAF'ı durdursun.
- **Efor:** S

### 11. DÜŞÜK · Mimari · State nesneleri yerinde mutasyona uğruyor, `useCallback`'ler etkisiz, ölü import var
- **Kanıt:** `network-defender-game.tsx:112,137,185` (`seed.state = ...`, `t.state = ...`, `target.state = 'clean'`; dizi kopyalanıyor ama nesneler aynı), `:82-92` (`[game]` bağımlılığı; `useMiniGame` her render'da yeni nesne döndürüyor (`use-mini-game.ts:137`), bu yüzden `endGame` ve `cleanNode` her render'da yeniden oluşuyor), `:177` (`eslint-disable react-hooks/exhaustive-deps`), `:11` (`sfxCollectStar` kullanılmıyor).
- **Sorun:** Bugün çalışıyor, ama `React.memo`'lu bir düğüm bileşenine geçildiğinde güncellemeler kaybolur. Oyun mantığı render döngüsüyle iç içe ve test edilemiyor.
- **Profesyonel öneri:** Oyun mantığı saf bir `reducer`/motor modülüne (`lib/games/network-defender/engine.ts`: `step(state, dt, rng)`, `tap(state, nodeId)`) çıkarılsın. React yalnız render etsin; RNG tohumlanabilir olsun. Böylece Bulgu 1 ve 3 birim testle korunur ve ileride sunucu taraflı "replay doğrulama" (olay günlüğünü sunucuda yeniden oynatma) mümkün olur.
- **Efor:** M

### 12. DÜŞÜK · Tutarlılık · Liderlik hata durumu "boş", toplam 100'de kesiliyor, UTC sıfırlama ve çift marka başlığı
- **Kanıt:** `game-leaderboard.tsx:40,55-60` (hata `catch(() => {})` ile yutulup "Henüz skor yok" gösteriliyor), `leaderboard/route.ts:52,83` (`take:100` → `totalPlayers` en fazla 100; 100. sıranın altındaki kullanıcı sırasını göremiyor), `game-shell.tsx:323` ("00:00 (UTC)"), `page.tsx:7`.
- **Profesyonel öneri:** Hata için ayrı bir "Liderlik yüklenemedi · Tekrar dene" durumu gösterilsin. Toplam oyuncu `count(distinct userId)` ile alınsın, kullanıcının sırası `COUNT(*) WHERE best > myBest` ile hesaplansın. Sıfırlama saati kullanıcının yerel saatinde gösterilsin ("Gece 03:00'te yenilenir"). Metadata `title: 'Ağ Savunucusu'` olsun; şablon markayı zaten ekliyor.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **İlk oyun öğreticisi ve "Nasıl oynanır" kartı (Duolingo):** Etkileşimli 10 saniyelik bir tanıtım ("şuna dokun → yayılımı gör → karantinayı dene"). Eşik, süre ve kayıp sınırı oyundan önce görünmeli.
2. **Kişisel ilerleme ve rekor (Duolingo/Spotify Wrapped):** "Kişisel rekorun 13 · dün 9", rekor kırılınca özel kutlama ve haftalık oyun özeti kartı (paylaşılabilir görsel).
3. **Sonuç sonrası akış (Starbucks Rewards "next reward"):** "Bugün 3/20 oyun oynadın · Sonraki ödüle 450 puan" ilerleme çubuğu ve "sıradaki oyun" CTA'sı.
4. **Oyun içi duraklatma, ses kontrolü ve haptik tercihi (Revolut/Monzo mobil his):** Sekme değişiminde otomatik duraklatma, kalıcı ses/titreşim anahtarı.
5. **Zorluk ilerlemesi / seviye (Duolingo lig):** Seri günü arttıkça düğüm sayısı ve yayılım hızı artan seviyeler; turnuva haftası için sabit tohumlu "haftanın ağı" (herkes aynı haritada yarışır, rekabet adil olur).
6. **Erişilebilir oyun modu:** Klavye/ekran okuyucu ile oynanabilir, yüksek kontrastlı ve hareket azaltılmış varyant (renk + şekil + etiket).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 50 saniyelik, "son saniyede kurtardım" hissi veren bir **gerilim yönetimi** oyunu. Oyuncu kuralı 5 saniyede anlıyor, ilk 10 saniyede kombo yapıyor, son 10 saniyede ağ kırmızıya dönerken karantinayı doğru anda patlatıyor. Sonuç ekranı "neden kazandım/kaybettim" sorusunu tek bakışta yanıtlıyor ve bir sonraki oyuna yönlendiriyor.

**Yerleşim (mobil önce, 360–400 px):**
1. **Üst HUD şeridi (sabit):** Solda ağ sağlığı halkası (11 düğümden kaçı temiz; renk yeşil→sarı→kırmızı), ortada skor ve kombo çarpanı (×1/×2/×3, kırılınca sarsılır), sağda dairesel süre göstergesi.
2. **Arena (kare, tam genişlik):** Düğümler ve kenarlar tek bir SVG koordinat sisteminde. Kenarlarda enfeksiyonun **hangi yönde ilerlediğini** gösteren akış animasyonu (stroke-dashoffset), yani oyuncuya bir sonraki hedefi önceden okuma şansı. Yayılım öncesinde hedef düğümde 400 ms'lik "uyarı halkası" (telegraph); beceri bu okumaya dayanıyor.
3. **Alt aksiyon çubuğu:** Büyük (56 px) karantina butonu, şarj halkası ve klavye kısayolu ipucu (Q).
4. **Lobi (idle):** Kahraman kart (emoji + başlık + 3 maddelik kural + ödül rozeti "8 skor = 150 puan"), altında sekmeli "Bu hafta / Tüm zamanlar" sıralaması ve kişisel rekor çipi.
5. **Sonuç:** Kayıp ya da kazanma sebebi başlığı, 3 metrik (temizlenen, en yüksek kombo, sağlıklı süre), rekor karşılaştırması, ödül kartı, iki CTA.

**Motion / 3D (ölçülü):**
- 3D gereksiz; SVG + mevcut FxLayer yeterli ve hafif. three.js eklemek mobilde pil ve bundle maliyeti getirir, oyuna değer katmaz.
- Framer yalnız HUD geçişleri ve sonuç kartı için kullanılsın. Düğüm nabzı CSS `@keyframes` ile yapılsın ve `prefers-reduced-motion` ile `.reduce-animations` altında tamamen kapansın. SVG `<animate>` kaldırılsın.
- Kombo kırılmasında 120 ms'lik küçük HUD sarsıntısı, karantinada arenaya kısa mor tarama çizgisi. Bunlar mevcut `shockwave` yerine geçmeli, üstüne eklenmemeli.

**Veri / API değişiklikleri:**
- `start`: yalnız `active` oturumu geri ver; `failed` olanı kilitle; `attempt` sayacı ekle (Bulgu 4).
- `complete`: `won` alanı kaldırılsın; sunucu skora ve `reason`'a bakarak karar versin. İsteğe bağlı olarak sıkıştırılmış olay günlüğü (`events: [t, nodeId][]`) gönderilsin ve sunucu tohumlu motorla yeniden oynatıp skoru doğrulasın (bu oyun deterministik motorla buna çok uygun).
- Sayfa: `getEffectiveMiniGame` sunucuda okunup prop olarak geçilsin; pasifse kapalı ekranı gösterilsin.
- Turnuva: kapanışta donan `TournamentResult` tablosu + `@@unique([gameType, weekKey, rank])` + deterministik beraberlik kuralı (Bulgu 5).
- Yeni hafif uç `GET /api/customer/games/network-defender/me`: kişisel rekor, dünkü skor, toplam oynama. Sonuç ve lobi kartını besler; Redis'te 60 sn önbelleklenebilir.

---

## Çakışmalar / birleştirme önerisi

- **Mekanik çakışma:** `troll-slayer`, `bot-hunter`, `spam-defense`, `guardian-of-trust` ve `combo-tap` aynı "beliren hedefe dokun ve yok et" çekirdeğini paylaşıyor. `network-defender`'ın **ayırt edici** tarafı graf üzerinde yayılım (bulaşma/strateji). Bu yüzden kaldırılmamalı, ama Bulgu 3'teki yeniden tasarımla bu farkı gerçekten öne çıkarmalı. Aksi halde yirmi oyunluk vitrinde "bir başka dokun-yok et" olarak kaybolur.
- **Tema çakışması:** `signal-pipe` ("Sinyal Bağla") aynı ağ/sinyal evrenini kullanıyor. İki oyun hub'da bir "Ağ Operasyonları" koleksiyonu altında gruplanabilir: biri bağlantı kurar, diğeri savunur. Birleştirme (tek sayfa) önerilmiyor; mekanikler farklı.
- **Bileşen tekrarı:** `GameLeaderboard` ve `GameTournament` ayrı ayrı veri çekiyor ve farklı renk sistemleri kullanıyor. Bunlar tek bir `GameRankings` sekmeli bileşende birleşmeli (sistem geneli, 20 oyunu etkiler).
- **Sistem geneli kök neden:** Bulgu 1'deki modül seviyesi `_seq` deseni 10 oyun bileşeninde daha var (`bot-hunter`, `combo-tap`, `data-miner`, `memory-match`, `mind-thief`, `review-detective`, `speed-order`, `trust-merge`, `truth-vs-fake`). Bunlarda id/indeks karışıklığı olup olmadığı **doğrulanmadı**; ilgili oyun denetimlerinde ayrıca kontrol edilmeli.

---

## Doğrulama (şüpheci inceleme)

Üç KRİTİK/YÜKSEK iddia kod baştan okunarak çürütülmeye çalışıldı (salt okunur; DB, build, test çalıştırılmadı).

### 1. Graf kimlik/indeks uyuşmazlığı oyunu kırıyor — **DOĞRULANDI** (StrictMode kısmı hariç)

- Kanıt: `components/customer/games/network-defender-game.tsx:31` modül seviyesi `let _seq = 0;`, `:38` `id: ++_seq`, `:46-49` kenarlar **dizi indeksiyle** (`[0, i]`, `[i, 1 + (i % 10)]`) kuruluyor; `:131-134` yayılım ve `:223/:275-277` çizim ise kenar uçlarını **id** ile eşliyor.
- İlk çalıştırmada id'ler 1..11, kenar uçları 0..10. `id=0` yok → 10 merkez kolunun tamamı ölü (`nodeById(0)` undefined, `:277` çizilmiyor, yayılımda hedef bulunamıyor). Kalan kenarlar id 1..10 arasında bir halka; görsel merkez düğüm (indeks 0 = id 1) yalnızca iki dış düğüme bağlı görünüyor. İndeks 10'daki düğüm (id 11) hiçbir kenarda yok.
- Tohum `:111` indeks 2..10 → 1/9 olasılıkla id 11 (yalıtık) seçiliyor. Yeniden üretim: oyunu başlat, tohum yalıtık düğüme düşerse onu temizle → skor 1, enfekte düğüm kalmıyor (`:129` boş), 50 sn sonra `:168` `endGame(1 >= 8)` = kayıp → `complete` `status='failed'` yazar (`complete/route.ts:101`), günlük ödül hakkı yanar.
- İkinci `buildGraph` aynı JS modül ömründe çağrılırsa id'ler 12..22 olur ve **hiçbir** kenar eşleşmez: enfeksiyon asla yayılmaz, en fazla 1 puan. Somut tetikleyiciler: (a) oyun ortasında client-side navigasyonla çıkıp geri dönmek (oturum `active` kaldığı için `start/route.ts:69-73` `canPlay:true` döner), (b) kaybedip aynı sekmede client-side dönüp tekrar başlatmak (`failed` → yine `canPlay:true`), (c) açık PWA sekmesinde ertesi gün oynamak. Tam sayfa yenileme modülü sıfırladığı için o yolda sorun yok.
- Çürütülen alt iddia: `reactStrictMode: true` (`next.config` :258) bunu tetiklemez. Efekt `[playing]` bağımlı ve mount anında `playing=false` olduğu için erken dönüyor (`:95`); `playing` true'ya geçişi bir güncelleme olduğundan StrictMode çift çağrısı yapılmıyor.
- Öneri: kenarları indeks yerine üretilen `nodes[i].id` ile kur (ya da id'yi yerel ve deterministik yap: `id: i`), `_seq`'i kaldır. Tohumu kenar derecesi > 0 olan düğümlerden seç ve `buildGraph` için "her düğümün en az 2 kenarı var + merkez bağlı" birim testi ekle.

### 2. `failed` oturum yeniden başlatılabiliyor, sonuç her zaman 409; yenileme ile sınırsız deneme — **DOĞRULANDI**

- Kanıt: `app/api/customer/games/[game]/start/route.ts:56-73` yalnız `completed` engelliyor; `failed` ve `active` oturum aynı `sessionId` ile `canPlay:true` dönüyor. `complete/route.ts:73` yalnız `completed`'ı 409'lıyor, ardından `:98-108` `updateMany where status:'active'` → `failed` oturumda `count=0` → `:177-182` 409 "Oyun zaten tamamlandı". `app/api/customer/games/status/route.ts:33` hub rozetini yalnız `completed` ile basıyor, yani kaybeden kullanıcı oyunu hub'da "oynanmadı" görür.
- Yeniden üretim A (UX): oyunu kaybet → sayfayı yenile → "Oyna" çalışır, 50 sn oyna, kazan → `use-mini-game.ts` `finish` 409'u toast hatası olarak gösterir; ödül yok, harcanan oyun boşa.
- Yeniden üretim B (kural ihlali): enfeksiyon 5/6'ya yaklaşınca, `endGame(false)` gönderilmeden sayfayı yenile → `start` aynı `active` oturumu döndürür → yeniden oyna; kazanana kadar tekrarla. `startedAt` ilk oluşturmadan kaldığı için `minDurationSec` kontrolü (`complete/route.ts:81-83`) engel olmaz.
- Etki sınırı: puan **çift basılmıyor** (oturum başına tek `active→completed` geçişi atomik). Ancak "günde 1 hak" fiilen "ilk gönderime kadar sınırsız deneme" oluyor; turnuvada (`tournament/route.ts:31` yalnız `completed`) en iyi skorlar şişiyor ve dürüst oyuncu dezavantajlı. Generic `[game]` uçlarını kullanan tüm oyunları etkiler.
- Öneri: `start`'ta `failed` için `canPlay:false, alreadyPlayed:true` dön; `active` oturumu geri vermek yerine "yarıda bırakılmış = kayıp" say (ör. `startedAt + ROUND_MS + tolerans` geçmişse `failed`'a çevir, değilse yeni deneme açmadan reddet ya da deneme sayacı `attempts` ekle ve 1 ile sınırla). Hub `status` ucu `completed|failed` ikisini de "bugün oynandı" saymalı.

### 3. Turnuva ödülü beraberlikte aynı sıra için birden fazla kullanıcıya verilebilir — **BELİRSİZ**

- Kanıt doğru: `app/api/customer/tournament/route.ts:29-35` `orderBy: { _max: { starsCollected: 'desc' } }` beraberlik kırıcısı yok; `:145-147` POST sırayı her çağrıda yeniden hesaplıyor; `prisma/schema.prisma:1088` yalnız `@@unique([userId, gameType, weekKey])`, `rank` için tekil kısıt yok. `maxScore=15` (`lib/minigame-config.ts:192`) olduğu için zirvede beraberlik çok olası.
- Çürütme denemesi: önceki haftanın verisi kapanmış ve pratikte değişmiyor (`completedAt < isoWeekStart`); aynı plan + aynı veri üzerinde Postgres'in sıralama çıktısı çoğu zaman tekrarlanabilir. İki ayrı POST'un aynı kullanıcıyı farklı sıraya koyması, beraberlerin göreli sırasının sorgular arasında değişmesine (paralel agregasyon, plan değişimi, heap düzeni) bağlı; bu Postgres tarafından **garanti edilmiyor** ama kod okumasıyla gerçekleştiği de kanıtlanamıyor. Canlı DB'ye dokunulmadığı için doğrulanmadı. Ek bir yol: önceki haftadan sıralamada üstte olan bir kullanıcı silinirse (`onDelete: Cascade`, `schema.prisma:504`) alttakiler bir basamak kayar ve daha önce talep edilmiş bir sıra ikinci kez verilebilir; bu da nadir.
- Kesin olan sorun (daha düşük önem): beraberlikte ödül **keyfi** dağıtılıyor; 15 puanla eşit olan 4 kullanıcıdan biri ödülsüz, diğer üçü 500/…/… alıyor ve hangisinin hangi sırayı aldığı oyuncuya açıklanamaz.
- Öneri: deterministik beraberlik kuralı (eşitlikte skora ilk ulaşma zamanı `min(completedAt)`, sonra `userId`) ve haftayı kapanışta `TournamentResult` tablosuna dondurup `@@unique([gameType, weekKey, rank])` ile sıra başına tek ödül garantisi. POST yeniden hesaplamak yerine dondurulmuş sonucu okumalı.

---

## Uygulama (Dalga 2)

**Karar uygulandı: oyun EMEKLİ** (yol haritası §7.3 #16 KALDIR; `lib/games/registry` `RETIRED_GAMES`). `app/customer/games/network-defender/page.tsx` artık tek satırlık sunucu bileşeni: `permanentRedirect` ile Oyna merkezine (`/customer/games?emekli=network-defender`, mevcut sorgu parametreleri korunur — `lib/play-hub/retired.ts`). Hub bu parametreyle tek seferlik, dürüst bir "Ağ Savunucusu artık oynanmıyor; geçmiş skorların ve puanların korunuyor" notu gösterir. Oyun kartı hub kataloğunda hiçbir koşulda yer almaz (`buildHubCatalog` emekli kimlikleri dışlar; test: `__tests__/lib/play-hub.test.ts`). Bileşen kodu ve geçmiş `MiniGameSession` verisi silinmedi (registry kuralı: geri alınabilir, arşiv).


### Özellik envanteri — yeni durum

| # | Özellik | Eski | Yeni durum |
|---|---|---|---|
| 1 | Sunucu taraflı rol kontrolü (CUSTOMER) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 2 | Sekme başlığı (metadata) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 3 | Sayfa başlığı ve açıklaması (DashboardPageHeading) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 4 | Admin "oyun pasif" kontrolü (sayfa seviyesinde) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 5 | Neon kabuk, ızgara ve köşe aksanları | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 6 | Başlangıç ekranı: yüzen emoji, başlık, açıklama | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 7 | Başlangıç ipucu şeridi | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 8 | "🌐 Ağı Savun" başlat butonu ve nabız halkası | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 9 | Oturum başlatma (start API) ve "günde 1 hak" | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 10 | Yükleniyor durumu (starting/submitting) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 11 | Başlatma hatası toast'ı | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 12 | Haftalık turnuva paneli (sıralama, geri sayım, ödül havuzu) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 13 | Turnuva "Ödülü al" butonu | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 14 | Tüm zamanlar liderlik tablosu | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 15 | Ağ grafiği oluşturma (11 düğüm + kenarlar) | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 16 | Kenar çizimi (SVG) ve "tehlike" nabzı | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 17 | Düğüm konumlandırma (merkezleme) | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 18 | Başlangıç enfeksiyonu (seed) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 19 | Zamanla hızlanan enfeksiyon yayılımı | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 20 | Düğüm temizleme dokunuşu | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 21 | Skor ve her 4. temizlemede +1 bonus | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 22 | 🔥 Kombo göstergesi | SAHTE | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 23 | Enfekte sayacı (x/6) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 24 | Geri sayım (50 sn) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 25 | Karantina şarj barı ve butonu | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 26 | Karantina etkisi (yayılımı 3,5 sn durdurma) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 27 | Kayıp koşulu (6 enfekte düğüm) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 28 | Kazanma (süre sonunda eşik ya da maxScore'a erken ulaşma) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 29 | FX: burst / ring / floatText / shockwave | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 30 | Ses efektleri (Web Audio) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 31 | Dokunsal geri bildirim (haptic) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 32 | Alt ipucu satırı | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 33 | Sonuç gönderme (complete API), atomik ödül | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 34 | Ödül, seri bonusu ve başarım toast'ları | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 35 | Sonuç ekranı (trofe/💀, varyant başlık) | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 36 | Sonuç skoru etiketi ("Temizlenen düğüm") | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 37 | Ödül kartı ve eşik altı notu | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 38 | Kazanma konfetisi | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 39 | Sonuç ekranında liderlik tablosu | ÇALIŞIYOR | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 40 | "Bugün oynandı" kilit ekranı | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 41 | Kaybedince hub'da "oynandı" rozeti | BOZUK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 42 | Tekrar oyna / Oyun Merkezi'ne dön / sıradaki oyun CTA'sı | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 43 | Nasıl oynanır / ilk oyun öğreticisi | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 44 | Duraklatma / sekme görünürlüğünde dondurma | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 45 | Ses aç/kapat | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 46 | Klavye / ekran okuyucu ile oynanabilirlik | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 47 | Azaltılmış hareket desteği (oyun içi) | KISMİ | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |
| 48 | Kişisel en iyi skor / dünkü sonuç / ilerleme | EKSİK | KALDIRILDI — oyun emekli; sayfa Oyna merkezine kalıcı yönlenir |

Toplam 48 satır KALDIRILDI. Gerekçe: §7.3 portföy kararı (tavan 12; iyi oynayan kaybediyordu; portföy tavanı nedeniyle emekli). Bu nedenle oyun içi bulgular (mekanik, animasyon, erişilebilirlik) düzeltilmedi; yüzey artık oynanmıyor.

### Bulgular

- Oyuna özgü bulguların tümü: **KAPANDI (yüzey kaldırıldı)** — oyun sayfası artık oyunu çizmiyor.
- Ortak bulgular başka yerde kapandı: "kaybedilen oyun tekrar başlatılıp 409" ve "yenileyerek sınırsız deneme" (oyun motoru, `lib/game-session` — `failed`/yarım = oynandı); hub'ın kaybedilen oyunu "oynanmamış" göstermesi (Oyna merkezi üç durumlu kart); turnuva eşitlik kırıcı (`lib/game-tournament`).

### Kalanlar

- Sunucu kuralı (`lib/minigame-config`) henüz `hidden: true` DEĞİL: hafta ortasında gizlemek turnuva rotasyonunu kaydırıyor (ölçüldü: W40 ödül oyunu `data-snake` → `trust-merge`, W41 `review-stack` → `signal-pipe`). Turnuva sahibiyle hafta sınırında (Pazartesi 00:00 UTC) ya da aday listesi dondurulduktan sonra gizlenmeli. O zamana dek doğrudan API çağrısıyla sıralı deneme açılabilir (eski, zayıf doğrulama; günlük oyun puanı tavanı 600 sınırlar).
