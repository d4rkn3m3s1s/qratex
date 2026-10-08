# /customer/games/speed-order

**Amaç:** Müşterinin günde bir kez oynadığı "Hız Sıralama" mini oyunu (Schulte tablosu benzeri): ekrandaki 1..N rakamlarına 45 saniye içinde sırayla dokunup tur tamamlamak; 7+ tur → 150 puan + 75 XP, seri bonusu, başarım, haftalık turnuva ve tüm zamanlar liderliği.

**Genel puan: 5/10** · **Karar: koru-iyileştir** (oyun döngüsü küçük ve tek bileşende; ama oyunu kilitleyen bir hata, bozuk konumlandırma ve "günde 1 hak" kuralının delinmesi düzeltilmeden canlıda kalmamalı)

İncelenen dosyalar: `app/customer/games/speed-order/page.tsx`, `app/customer/layout.tsx`, `components/customer/games/speed-order-game.tsx`, `components/customer/games/game-shell.tsx`, `components/customer/games/fx-layer.tsx`, `components/customer/games/game-leaderboard.tsx`, `components/customer/games/game-tournament.tsx`, `components/dashboard/page-heading.tsx`, `lib/use-mini-game.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/minigame-copy.ts`, `lib/game-sounds.ts`, `lib/admin-toast.ts`, `lib/tournament-core.ts`, `lib/game-achievement-stats.ts`, `app/api/customer/games/[game]/start|complete|leaderboard/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `prisma/schema.prisma` (MiniGameSession), `node_modules/framer-motion` 11.18.2 (`render/html/use-props.mjs`, `render/html/utils/build-styles.mjs`).

> Not: Kod salt okunarak incelendi; dev server/tarayıcı çalıştırılmadı (canlı DB kuralı). Tarayıcıda ölçülmemiş bulgular "kod okumasıyla doğrulandı" diye işaretlendi.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | İlk doğru dokunuştan sonra yapılan tek bir yanlış dokunuş turu çözülemez hâle getiriyor (oyun kilitleniyor); "günde 1 hak" sayfa yenilemeyle aşılıyor, kaybedilen oyun ise tekrar başlatılıp 409 ile reddediliyor. |
| UX | 5/10 | Kurgu anlaşılır ve hızlı; ama "parlayan kutu = sıradaki" ipucu oyunu düşünmeden dokunmaya indiriyor, geri sayım/duraklatma/tekrar dene/sonraki oyun akışı yok, aynı açıklama 3 kez tekrarlanıyor. |
| Görsel | 6/10 | Neon kabuk, parçacık katmanı ve ses/titreşim geri bildirimi tutarlı; ancak framer-motion inline `transform` çakışması kutuları yarım kutu kaydırıyor, mobilde sağ sütunu kırpıyor. |
| Mimari | 6/10 | Paylaşılan GameShell/useMiniGame/registry deseni temiz ve sunucu ödülü kendisi hesaplıyor; ama setState updater'ı içinde yan etki, istemcinin statik eşiği admin override'ını yok sayıyor, skor tamamen istemciye güveniliyor. |
| Performans | 7/10 | Hafif DOM oyunu, tek rAF canvas; tamamlamada başarım istatistiği tüm geçmişten iki kez okunuyor ve takip edilmeyen setTimeout'lar oyun bitince ses çalabiliyor. |
| Erişilebilirlik + mobil | 4/10 | Butonlar odaklanabilir ama hiçbir durum (sıra, süre, "Sıra yanlış!") ekran okuyucuya duyurulmuyor; hata geri bildirimi yalnızca canvas yazısı + renk; ses kapatma yok; 420px sabit arena küçük telefonlarda kaydırma gerektiriyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sunucu tarafı oturum/rol kontrolü (CUSTOMER değilse yönlendirme) | ÇALIŞIYOR | `app/customer/games/speed-order/page.tsx:10-13` | ADMIN/DEALER kullanıcı kendi paneline değil `/auth/signin`'e atılıyor (oturum açıkken giriş sayfası anlamsız). |
| 2 | Sayfa `<title>` metadata | KISMİ | `page.tsx:7`, `app/customer/layout.tsx:19-22` | Layout şablonu `%s | Müşteri alanı`; sayfa başlığı zaten `| QRateX` içeriyor → "Hız Sıralama \| QRateX \| Müşteri alanı". Marka yazımı "QRateX" vs "Qratex" tutarsız. Admin başlık override'ı yansımıyor. |
| 3 | Masaüstü sayfa başlığı + açıklama (DashboardPageHeading) | ÇALIŞIYOR | `page.tsx:17-20`, `components/dashboard/page-heading.tsx:21` | Mobilde gizli (`hidden sm:flex`). Açıklama GameShell açıklaması ve startHint ile neredeyse aynı metin (3 kez tekrar). |
| 4 | Neon oyun kabuğu (ızgara arka plan, köşe aksanları, glow) | ÇALIŞIYOR | `game-shell.tsx:97-129` | Tüm oyunlarla ortak; tema (açık/koyu) bağımsız hep koyu. |
| 5 | Başlangıç ekranı: yüzen emoji, başlık, açıklama, ipucu şeridi | ÇALIŞIYOR | `game-shell.tsx:165-188`, `lib/minigame-copy.ts:146-153` | Emoji `filter: brightness` sonsuz animasyonu reduced-motion'da da sürer (filter transform değil). |
| 6 | "⚡ Sıralamaya Başla" CTA → `POST /api/customer/games/speed-order/start` | ÇALIŞIYOR | `game-shell.tsx:201-207`, `lib/use-mini-game.ts:54-79`, `start/route.ts:20-94` | Ses context'i ilk dokunuşta hazırlanıyor (`primeAudio`). |
| 7 | "Bugün oynandı" ön bilgisi (sayfa açılırken) | EKSİK | `lib/use-mini-game.ts:48` (yalnız start yanıtıyla set ediliyor) | Kullanıcı oyunu bitirmiş olsa bile CTA görünür; ancak tıklayınca kilit ekranı çıkar. `/api/customer/games/status` mevcut ama burada kullanılmıyor. |
| 8 | Yükleniyor durumları (başlatılıyor / sonuç kaydediliyor) | ÇALIŞIYOR | `game-shell.tsx:147-162` | |
| 9 | Başlatma hatası → toast + idle'a dönüş | ÇALIŞIYOR | `lib/use-mini-game.ts:74-77` | Admin oyunu kapattıysa sayfa yine açılır, yalnız CTA'dan sonra 403 toast'ı gelir (`start/route.ts:34-39`). |
| 10 | Haftalık turnuva paneli (geri sayım, ödül havuzu 500/300/150, ilk 10, "Sen" satırı) | KISMİ | `game-tournament.tsx:53-181`, `tournament/route.ts:47-120`, `lib/tournament-core.ts:13` | Eşit skorlarda sıralama belirsiz (bkz. B5); skor "⭐" ile gösteriliyor ama bu oyunda birim "tur"; koyu kabukta `text-muted-foreground` düşük kontrast; geri sayım dakikada bir. |
| 11 | Geçen hafta ödülünü talep et ("Ödülü al →") | KISMİ | `game-tournament.tsx:84-97,123-140`, `tournament/route.ts:128-193` | Atomik tek-claim doğru; ama müşteri toast'ı `@/lib/admin-toast` kullanıyor → "Basarili: 🏆 1. oldun…" / "Dikkat: …" (ASCII, admin önekli) (`lib/admin-toast.ts:14-19`). |
| 12 | Tüm zamanlar liderlik tablosu (ilk 10 + kendi sıram) | KISMİ | `game-leaderboard.tsx:24-113`, `leaderboard/route.ts:47-80` | `take: 100` → 100. sıranın altındaki oyuncu "sıram" satırını hiç görmez, `totalPlayers` 100'de tavan; eşitlik kırıcı yok; hata durumunda "Henüz skor yok" yanıltıcı mesajı (`game-leaderboard.tsx:40,55-60`). |
| 13 | HUD: Tur sayacı | ÇALIŞIYOR | `speed-order-game.tsx:175` | |
| 14 | HUD: "Sıradaki: N" | ÇALIŞIYOR | `speed-order-game.tsx:176-178` | Yanlış dokunuştan sonra var olmayan "1"i gösterir (bkz. B1). |
| 15 | HUD: Skor (tamamlanan tur) | ÇALIŞIYOR | `speed-order-game.tsx:180` | Ödül eşiğine (7) ilerleme gösterilmiyor. |
| 16 | HUD: Kalan süre (45 sn, `Date.now` tabanlı) | ÇALIŞIYOR | `speed-order-game.tsx:99-108,181` | Son 10 sn için görsel/işitsel aciliyet yok. |
| 17 | Tahta üretimi (3 sütun ızgara + jitter + karıştırma) | ÇALIŞIYOR | `speed-order-game.tsx:25-43` | |
| 18 | Zorluk artışı (tur başına +1 kutu, en fazla 9) | KISMİ | `speed-order-game.tsx:84` | 5. turdan sonra zorluk sabitleniyor; 6–12. turlar aynı; hız/dikkat dağıtıcı/ters sıra gibi ikinci eksen yok. |
| 19 | Kutu giriş/çıkış/dokunma animasyonu ve ortalama | BOZUK | `speed-order-game.tsx:198-207`; framer `use-props.mjs:21-29`, `build-styles.mjs:43-46` | Inline `transform: translate(-50%,-50%)` framer'ın ürettiği `scale/rotate` transform'u ile eziliyor → kutular yarım kutu (28px) sağ-aşağı kayıyor. Kod okumasıyla doğrulandı (bkz. B3). |
| 20 | "Sıradaki" kutunun parlaması + nabız halkası | ÇALIŞIYOR | `speed-order-game.tsx:192,209-220` | Oyunun bilişsel çekirdeğini (sayıyı arama) ortadan kaldırıyor (bkz. B8). |
| 21 | Doğru dokunuş: kutuyu kaldır, ses, titreşim, kıvılcım + halka | ÇALIŞIYOR | `speed-order-game.tsx:120-127` | Efekt koordinatı kutunun merkezi değil sol-üst köşesi (B3 nedeniyle). |
| 22 | Tur tamamlama: skor +1, fanfar, konfeti, "Tur tamam! +1", yeni tur | KISMİ | `speed-order-game.tsx:129-145` | Yan etkiler `setCells` updater'ı içinde (saf olmayan updater); StrictMode'da (next.config `reactStrictMode: true`) dev'de çift skor/çift tur; takip edilmeyen `setTimeout` (bkz. B6). |
| 23 | Yanlış dokunuş cezası ("Sıra yanlış!", ses, şok dalgası, sıra başa) | BOZUK | `speed-order-game.tsx:146-155` | Sıra 1'e dönüyor ama kaldırılmış kutular geri gelmiyor → tur çözülemez, süre bitene kadar kilit (bkz. B1). |
| 24 | Çıkış animasyonundaki kutuya ikinci dokunuş | BOZUK | `speed-order-game.tsx:190-197,121` | AnimatePresence çıkışı sırasında buton tıklanabilir; hızlı çift dokunuş "yanlış sıra" sayılıp B1 kilidini tetikler. |
| 25 | Süre bitince oyunu bitir (`won = score >= 7`) | KISMİ | `speed-order-game.tsx:104-107` | Eşik istemcide statik `DEF.rewardThreshold`; admin override'ı (`minigame-config-effective.ts:49`) ve start'tan dönen `config` (`use-mini-game.ts:70`) kullanılmıyor. |
| 26 | Maksimum skora (12) ulaşınca erken bitiş | ÇALIŞIYOR | `speed-order-game.tsx:138-139` | `maxScore` da statik; admin düşürürse sunucu sessizce kırpar. |
| 27 | Sonuç gönderimi `POST …/complete` + sunucu ödülü | ÇALIŞIYOR | `use-mini-game.ts:82-133`, `complete/route.ts:59-175` | Atomik tek-claim, cap, min süre, `points_credited` olayı doğru. Skor tamamen istemciye güveniliyor (bkz. B4). |
| 28 | Kaybedilen oyunun kaydı (`status: 'failed'`) ve sonrası | BOZUK | `complete/route.ts:101`, `start/route.ts:56-73`, `status/route.ts:33` | `failed` oturum "yarım kalmış aktif" sanılıp tekrar başlatılıyor; 45 sn oynatılıp `complete` 409 "Oyun zaten tamamlandı" ile reddediliyor; hub da bunu "oynanmadı" gösteriyor (bkz. B2). |
| 29 | "Günde 1 hak" kuralı | BOZUK | `start/route.ts:69-73` | Bitirmeden sayfayı yenileyen kullanıcı aynı oturumla sınırsız yeniden oynar; kötü gidiyorsa yenileyip tekrar dener (bkz. B2). |
| 30 | Sonuç ekranı: kupa/kurukafa, varyantlı başlık, "Sıra: N", ödül rozeti veya eşik notu | ÇALIŞIYOR | `game-shell.tsx:222-304`, `minigame-copy.ts:146-153` | "Sıra" etiketi tur sayısı için muğlak; süre, doğruluk, kişisel rekor, eşik farkı yok. |
| 31 | Ödül kazanınca tam ekran konfeti | ÇALIŞIYOR | `game-shell.tsx:19-31,86-94` | `reduce-animations` sınıfına bakıyor; işletim sistemi `prefers-reduced-motion`'ına bakmıyor. |
| 32 | Ödül / seri / başarım toast'ları | ÇALIŞIYOR | `use-mini-game.ts:112-125` | Ödül hem toast hem kartta hem bildirimde (3 kanal) — ayrıca konfeti. |
| 33 | Günlük seri bonus XP (+10, her 3 günde +30) | ÇALIŞIYOR | `complete/route.ts:115-150` | `GameStreakClaim` unique ile atomik. |
| 34 | Yeni başarım tespiti + bildirim | ÇALIŞIYOR | `complete/route.ts:90-94,196-215`, `lib/game-achievement-stats.ts:16-20` | Tüm oturum geçmişi her tamamlamada iki kez okunuyor (sınırsız `findMany`). |
| 35 | Ödül bildirimi (Notification) | ÇALIŞIYOR | `complete/route.ts:185-194` | Transaction dışında; başarısız olursa 500 döner ama ödül zaten verilmiş olur (istemci "Oyun tamamlanamadı" görür). |
| 36 | "Bugünün oyununu oynadın" kilit ekranı + UTC sıfırlama notu | KISMİ | `game-shell.tsx:307-331` | Yalnız CTA'ya basınca görünür; "00:00 (UTC)" Türkiye için 03:00 demek — kullanıcı diline çevrilmemiş. |
| 37 | Ses efektleri (Web Audio) | ÇALIŞIYOR | `lib/game-sounds.ts:15-31,68-145` | Sessize alma düğmesi EKSİK; ses yalnız "animasyonları azalt" ile kapanıyor (`game-sounds.ts:10-13`). |
| 38 | Titreşim (haptic) | ÇALIŞIYOR | `lib/game-sounds.ts:158-165` | iOS Safari `navigator.vibrate` desteklemez (sessizce geçer). |
| 39 | Parçacık katmanı (FxLayer canvas) | ÇALIŞIYOR | `fx-layer.tsx:49-263` | Oyun bitince de rAF döngüsü bileşen unmount olana kadar sürer (boşken ucuz). |
| 40 | Azaltılmış hareket | KISMİ | `components/providers.tsx:232` (`MotionConfig reducedMotion="user"`), `fx-layer.tsx:44-47`, `game-shell.tsx:13-16` | Framer transform animasyonları OS ayarına uyuyor; canvas/konfeti/ses yalnız uygulama içi `reduce-animations` sınıfına bakıyor. |
| 41 | Klavye ile oynama | KISMİ | `speed-order-game.tsx:194-197` | Butonlar Tab ile gezilebilir ama odak sırası DOM sırası (rastgele konum ≠ görsel sıra); odak halkası stili yok; rakam tuşlarıyla oynama yok. |
| 42 | Ekran okuyucu duyuruları (sıra, süre, hata, tur) | EKSİK | `speed-order-game.tsx:174-183,152` | `aria-live` yok; "Sıra yanlış!" yalnız canvas'ta çiziliyor. |
| 43 | Oyun içi alt ipucu metni | ÇALIŞIYOR | `speed-order-game.tsx:226-228` | `text-[10px] text-white/40` — okunabilirlik/kontrast düşük. |
| 44 | Başlamadan 3-2-1 geri sayım | EKSİK | `speed-order-game.tsx:91-108` | Süre, ilk tahta yay animasyonuyla girerken anında akmaya başlar. |
| 45 | Duraklatma / sekme gizlenince davranış | EKSİK | `speed-order-game.tsx:99-108` | Süre arka planda akar (bu anti-hile için kabul edilebilir) ama kullanıcıya bildirilmez. |
| 46 | Tekrar oyna (pratik modu, ödülsüz) / sonraki oyuna geç / hub'a dön | EKSİK | `game-shell.tsx:295-303` | Sonuç ekranı çıkmaz sokak. |
| 47 | Admin görsel override'ları (başlık/emoji/renk/açıklama) | EKSİK | `speed-order-game.tsx:13,162-165` | Hub override'ı gösterir (`status/route.ts:41-49`) ama oyun sayfası statik registry'yi kullanır → hub ile sayfa farklı ad/renk gösterebilir. |
| 48 | Gönderim başarısız olunca yeniden deneme | EKSİK | `use-mini-game.ts:126-131` | Ağ hatasında skor kaybolur, `sessionIdRef` sıfırlanır; sonuç ekranı "ödül yok" der. |

**Durum sayıları:** ÇALIŞIYOR 26 · KISMİ 10 · BOZUK 5 · SAHTE 0 · EKSİK 7 (toplam 48 özellik).

---

## Bulgular

### B1 — KRİTİK · Hata · Yanlış dokunuş turu kilitliyor (oyun çözülemez hâle geliyor)
- **Kanıt:** `components/customer/games/speed-order-game.tsx:121` doğru dokunuşta kutuyu `cells`'ten siler; `:147-154` yanlış dokunuşta yalnızca `nextRef.current = 1; setNext(1)` yapar, tahtayı yeniden kurmaz.
- **Sorun:** Örn. 1-2-3'e dokunup sonra 6'ya basan oyuncu için `next=1` olur ama 1, 2, 3 kutuları artık yoktur. Kalan her kutu (4..N) `n !== 1` olduğundan her dokunuş yine "Sıra yanlış!" verir; hiçbir kutu parlamaz (`isNext` hiç eşleşmez, `:192`). Tur, 45 sn süre bitene kadar kilitlenir; oyuncu büyük olasılıkla eşiğin altında kalır ve günlük hakkını kaybeder. Bu, oyundaki en olası hata (hızlı oyunda yanlış dokunuş) olduğu için neredeyse her oyunu etkiler. Ek olarak #24: AnimatePresence çıkışı süren kutuya hızlı ikinci dokunuş (`:190-197`) da "yanlış sıra" sayılıp aynı kilidi tetikler.
- **Öneri:** Ceza modelini tasarım kararı olarak netleştir ve state'i tek kaynaktan yönet: (a) **önerilen** — yanlış dokunuşta sıra sıfırlanmasın, bunun yerine zaman cezası (−2 sn) + kombo kırılması + kutu sarsılması; ya da (b) sıra 1'e dönüyorsa tahtayı aynı yerleşimle geri getir (silinen kutular `tapped` bayrağıyla görünür kalsın, yeniden etkinleşsin). Kutuları silmek yerine `cells` içinde `state: 'idle' | 'done'` tut; çıkışta `pointer-events: none` ver veya `tap` içinde `cell.n < nextRef.current` ise yok say (çift dokunuş koruması). Oyun mantığını saf bir reducer'a (`useReducer` + `speedOrderReducer(state, action)`) taşı ve Jest ile "yanlış dokunuştan sonra tur hâlâ tamamlanabilir" testini yaz.
- **Efor:** S

### B2 — YÜKSEK · Veri/İş kuralı · "Günde 1 hak" iki yönden bozuk: yenileyerek sınırsız tekrar + kaybedilen oyunun tekrar başlatılıp 409'la reddedilmesi
- **Kanıt:** `app/api/customer/games/[game]/complete/route.ts:101` kayıpta `status: 'failed'` yazar. `app/api/customer/games/[game]/start/route.ts:57` yalnızca `'completed'`'ı kilitli sayar; `:69-73` diğer her durumu (ör. `failed`) "yarım kalan aktif oturum" diye aynı `sessionId` ile yeniden açar. `complete/route.ts:73` yalnız `completed`'ı reddeder, `:98-108` `status: 'active'` olmayan oturumda `count === 0` → 409 "Oyun zaten tamamlandı". `app/api/customer/games/status/route.ts:33` hub'da yalnız `completed`'ı "oynandı" gösterir.
- **Sorun:** (1) Kaybeden kullanıcı hub'da oyunu hâlâ oynanmamış görür, sayfayı açar, start başarılı döner, 45 sn oynar ve sonunda kırmızı "Oyun zaten tamamlandı" toast'ı ile hiçbir şey alamaz — güven kırıcı bir deneyim. (2) Oyunu bitirmeden sayfayı yenileyen kullanıcı aynı `active` oturumla sınırsız deneme yapar; kötü giden oyunu yenileyip baştan alabilir. Ödül günde bir kez sınırlı kaldığı için doğrudan puan basma yok, ama "günde 1 hak" vaadi (`page.tsx:19`) yanlış, liderlik/turnuva ise sınırsız denemeyle şişirilebilir. Ayrıca `startedAt` ilk start'ta kaldığından ikinci denemede sunucu süre kontrolü anlamsızlaşır.
- **Öneri:** Oturum yaşam döngüsünü durum makinesi olarak tanımla: `active → completed | failed | abandoned`. start'ta `failed` da kilitli sayılsın (`status in ['completed','failed']`). Yarım kalan `active` oturum yeniden açılırken ya (a) "terk edildi = kayıp" olarak kapatılsın, ya da (b) `attempt` sayacı ve `startedAt` güncellemesiyle en fazla 1 yeniden bağlanma izni verilsin (ağ kopması için). status API'sı `playedToday`'i `completed|failed` üzerinden dönsün ve sayfa açılışında bu bilgi CTA'dan önce gösterilsin. Leaderboard/turnuva yalnız ilk denemenin skorunu kullanmalı.
- **Efor:** M

### B3 — YÜKSEK · Görsel/Hata · framer-motion inline `transform` çakışması kutuları kaydırıyor, mobilde sağ sütunu kırpıyor
- **Kanıt:** `speed-order-game.tsx:198-207` aynı `Motion.button` üzerinde `initial/animate/exit/whileTap` ile `scale/rotate` canlandırıyor ve `style={{ transform: 'translate(-50%, -50%)' }}` veriyor. framer-motion 11.18.2'de `use-props.mjs:21-29` önce ham `style.transform`'u kopyalıyor, sonra `buildHTMLStyles` (`build-styles.mjs:43-46`) `scale/rotate`'ten ürettiği `transform`'u üstüne yazıyor; `'transform'` anahtarı `transformProps` kümesinde olmadığı için ham değer korunmaz. Kod okumasıyla doğrulandı; tarayıcıda ölçülmedi. Proje hafızasındaki "framer inline transform Tailwind'i ezer" tuzağıyla aynı sınıf.
- **Sorun:** Kutular merkezlenmek yerine sol-üst köşeleri (x%, y%) noktasına oturuyor → 28px sağ-aşağı kayma. Sağ sütun x=77–87% (`:34`); ~320px genişlikteki mobil arenada %87 + 56px > genişlik → kutu `overflow-hidden` ile kırpılıyor (yaklaşık sağ sütun kutularının yarısı). Alt sıra (y≈80–84%) alt ipucu metninin üstüne biniyor. Parçacık/halka efektleri (`toPx`, `:119`) kutunun merkezinde değil köşesinde patlıyor.
- **Öneri:** Konumlandırmayı canlandırılan elemandan ayır: dış `div` mutlak konum + `-translate-x-1/2 -translate-y-1/2` (framer'sız), içte `Motion.button` scale/rotate. Ya da framer'ın `x: '-50%', y: '-50%'` değerlerini `style`'da motion değeri olarak ver. Yerleşimi yüzde yerine arena ölçüsüne göre güvenli kenar boşluğuyla (`pad = cellSize/2 + 8px`) hesapla; `ResizeObserver` ile arena boyutu değişince yeniden ölçekle. Görsel doğrulamayı proje hafızasındaki headless Chrome tezgâhıyla 360/390/768px'de yap.
- **Efor:** S

### B4 — YÜKSEK · Güvenlik/Ekonomi · Skor ve "kazandı" tamamen istemciden geliyor; turnuva ödülü sahte skorla hedeflenebilir
- **Kanıt:** `lib/use-mini-game.ts:92-96` `{score, durationSec, won}` gönderir; `complete/route.ts:61,82-87` yalnız cap (12) ve `minDurationSec: 8` (`lib/minigame-config.ts:238`) uygular. `tournament/route.ts:28-39` haftalık sıralamayı bu `starsCollected` ile yapar, ilk 3'e 500/300/150 puan (`lib/tournament-core.ts:13`).
- **Sorun:** Oturum açmış bir kullanıcı start'tan 8 sn sonra `{score:12, won:true, durationSec:9}` göndererek hem günlük 150 puanı hem tüm zamanlar/haftalık zirveyi alabilir. Gerçek oyunda 12 tur = ~98 dokunuş + 11×400ms geçiş; 8–9 sn'de imkânsız. Bu oyun için sunucu süre alt sınırı oyun tasarımıyla uyumsuz (oyun zaten 45 sn sürüyor). Not: bu, tüm registry oyunlarını etkileyen sistemik bir sorun; sömürü canlıda denenmedi (doğrulanmadı), ancak kod yolu açık.
- **Öneri:** Oyun başına makullük modeli ekle: speed-order için `minDurationSec` skordan türetilsin (`minMsForScore(score) = Σ tur_kutu_sayısı × 150ms + (score-1)×400ms`), ve `durationSec < 45` iken yalnızca `score === maxScore` kabul edilsin. Daha iyisi: istemci her turun bitiş zaman damgalarını (`roundEndsAt[]`) gönderisin; sunucu `startedAt`'e göre monotonluk, tur başı en kısa süre ve toplam süre tutarlılığını doğrulasın. Turnuvada ilk 3 ödülü için anomali eşiği (ör. kişisel ortalamadan 3σ sapma) aşan skorları `points_credited` velocity dedektörüne (zaten var) işaretle ve claim'i manuel incelemeye düşür.
- **Efor:** M

### B5 — ORTA · Veri/Adalet · Eşit skorda turnuva ve liderlik sırası belirsiz; ödül rastgele dağılıyor
- **Kanıt:** `tournament/route.ts:29-35` ve `leaderboard/route.ts:47-53` yalnız `_max.starsCollected desc` ile sıralar, ikincil anahtar yok. Bu oyunda tamamlanan (kazanılan) skorlar yalnızca 7..12 aralığında (`minigame-config.ts:234-235`, `won = score >= 7`).
- **Sorun:** 6 olası değerli dar skor aralığında eşitlik neredeyse kesin; 500/300/150 puanlık ödülün kime gideceğini Postgres'in deterministik olmayan grup sırası belirler. GET ile POST farklı sıra üretebilir: kullanıcı "Geçen hafta 3. oldun" kartını görüp "Ödülü al"a bastığında "Geçen hafta ödül kazanmadın" alabilir (`tournament/route.ts:83-96` vs `:145-153`).
- **Öneri:** Skoru tek boyutlu olmaktan çıkar: `MiniGameSession`'a `durationMs` (veya `scoreDetail Json`) ekle; sıralama `score desc, durationMs asc, completedAt asc` olsun. Speed-order için asıl ölçüt "12 turu kaç saniyede bitirdin" / "45 sn'de kaç rakam" olmalı (bkz. vizyon). Hafta kapanışında sıralamayı bir kez dondurup (`TournamentResult` tablosu, cron) claim'i bu dondurulmuş sonuca bağla.
- **Efor:** M

### B6 — ORTA · Mimari/Hata · `setCells` updater'ı içinde yan etki; StrictMode'da çift skor, takipsiz zamanlayıcılar
- **Kanıt:** `speed-order-game.tsx:129-145` updater içinde `scoreRef.current += 1`, `setScore`, ses, efekt ve `setTimeout(startRound|endGame)` çağırıyor. `next.config` `reactStrictMode: true` (`next.config.*:258`). `:139,141` zamanlayıcılar saklanmıyor/temizlenmiyor.
- **Sorun:** React updater'ları saf olmalıdır; dev StrictMode'da çift çağrılır → yerelde tur başına +2 skor ve iki `startRound` (tur atlaması), bu da geliştiricinin gördüğü davranışı üretimden farklılaştırır ve hataları gizler. Updater içinden `setScore` çağrısı React uyarısı üretir. Süre bitimine 400 ms kala tamamlanan turda `startRound` oyun bittikten sonra çalışır ve "submitting" ekranında `sfxPowerUp` sesi çalar; bileşen unmount olsa da zamanlayıcı yaşar.
- **Öneri:** Tur tamamlama kontrolünü updater dışına al: kalan kutu sayısını ref'te tut (`remainingRef`) ya da reducer'dan dönen yeni state'e göre `useEffect`'te tepki ver. Tüm zamanlayıcıları `timeoutsRef` içinde topla ve `endGame`/cleanup'ta temizle; `startRound` başında `if (!runningRef.current) return`.
- **Efor:** S

### B7 — ORTA · Mimari/Tutarlılık · İstemci statik registry kullanıyor; admin override'ları (eşik, cap, başlık, renk, aktiflik) sayfaya yansımıyor
- **Kanıt:** `speed-order-game.tsx:13,106,138,162-170` statik `DEF`; `use-mini-game.ts:70` sunucudan gelen `config` saklanıyor ama bileşen `game.config`'i hiç okumuyor. `lib/minigame-config-effective.ts:40-56` admin override'ı birleştiriyor; hub override'lı başlık/rengi gösteriyor (`status/route.ts:41-49`). `page.tsx` `enabled` kontrolü yapmıyor.
- **Sorun:** Admin eşiği 9'a çıkarırsa oyuncu 7 turda "Kazandın" ekranı + "eşiği geçemedin" toast'ı gibi çelişkili sonuç alır; eşiği düşürürse 7'nin altında kalan ama ödül hak eden oyuncu `won=false` gönderip ödülü kaçırır (sunucu `eligible = won && …`, `complete/route.ts:86`). Hub'da farklı ad/renkle görünen oyun sayfada eski haliyle açılır; kapalı oyun sayfası açılır, CTA 403 verir.
- **Öneri:** Sayfayı server component olarak `getEffectiveMiniGame('speed-order')` ile besle: `enabled=false` ise "Bu oyun şu an kapalı" boş durumu + hub'a dön; aksi halde etkin tanımı (title/emoji/accent/threshold/maxScore) prop olarak `SpeedOrderGame`'e geçir. `won`'u istemcide hesaplamayı bırak — sunucu `eligible`'ı skordan kendisi türetsin (`won` alanını yalnız "oyun normal bitti mi" için kullan). Bu düzeltme registry'deki tüm oyunlara aynı desenle uygulanabilir.
- **Efor:** M

### B8 — ORTA · UX/Oyun tasarımı · "Parlayan kutu = sıradaki" ipucu oyunun beceri çekirdeğini yok ediyor; zorluk 5. turda düzleşiyor
- **Kanıt:** `speed-order-game.tsx:192,209-220` sıradaki kutu beyaz gradyan + 26px glow + sonsuz nabızla işaretleniyor; `:227` ipucu metni bunu açıkça söylüyor. `:84` kutu sayısı 9'da tavan.
- **Sorun:** Schulte tablosunun özü görsel tarama ve çalışma belleğidir; sıradaki rakam işaretlendiğinde oyun "parlayana dokun" refleks oyununa döner ve `combo-tap` (Kombo Yıldız) ile aynı mekaniğe çöker. 6–12. turlar özdeş olduğundan 45 sn'nin ikinci yarısı tekrara dönüşür; "Hız" adı ölçülmeyen bir metrik vaat eder.
- **Öneri:** İpucunu yalnız ilk tur(lar)da veya 3 sn hareketsizlikten sonra "yardım" olarak göster; zorluk eğrisini çok eksenli kur: kutu sayısı (5→16, 4×4 ızgara), dikkat dağıtıcılar (renk/boyut farkı), tur 8+'da ters sıra (N→1) veya harf-rakam karışık (1-A-2-B), tur süre bonusu. Skoru "tamamlanan rakam + hız bonusu" yap ki eşitlik azalsın (B5) ve ustalık hissedilsin.
- **Efor:** M

### B9 — ORTA · Erişilebilirlik · Durum değişiklikleri duyurulmuyor, hata yalnız canvas ve renkle bildiriliyor, ses kapatılamıyor
- **Kanıt:** `speed-order-game.tsx:174-183` HUD'da `aria-live` yok; `:152` "Sıra yanlış!" yalnız canvas'a çiziliyor (`fx-layer.tsx:116-125`); sıradaki kutu yalnız renk/parıltıyla ayırt ediliyor (`:209-210`). `lib/game-sounds.ts:10-13` ses yalnız `reduce-animations` sınıfıyla kapanıyor; arayüzde sessize alma yok. Odak sırası DOM sırası, görsel sıra ile ilgisiz; özel odak stili yok. `:226` ipucu `text-[10px] text-white/40`.
- **Sorun:** Ekran okuyucu kullanıcısı tur/süre/hatayı bilemez; renk körü kullanıcı için (cyan üstüne beyaz gradyan) ayrım zayıf; toplu taşımada oynayan kullanıcı sesi kapatamaz (Duolingo/Revolut'ta standart). Kontrast WCAG AA'nın altında.
- **Öneri:** HUD'a `role="status" aria-live="polite"` bölge ("Tur 3, sıradaki 4, 32 saniye") ve hatalar için `aria-live="assertive"` kısa metin ekle; her butona `aria-label="Rakam 4"`, sıradakiye `aria-current="true"`. Rakam tuşlarıyla (1–9) oynama + görünür odak halkası. GameShell'e kalıcı (localStorage + kullanıcı tercihi) "Ses açık/kapalı" ve "Titreşim" anahtarı; `game-sounds.ts` bu tercihi okusun. `prefers-reduced-motion` medya sorgusunu da `reduced()`'a dahil et.
- **Efor:** M

### B10 — DÜŞÜK · UX/Mobil · Sabit 420px arena, geri sayım yok, sonuç ekranı çıkmaz sokak
- **Kanıt:** `speed-order-game.tsx:15,188` sabit yükseklik; `game-shell.tsx:131` `min-h-[460px]`; `app/customer/layout.tsx:43` mobil alt boşluk `6.5rem`. `:91-108` süre anında başlıyor. `game-shell.tsx:295-303` sonuç ekranında yalnız liderlik var, aksiyon yok.
- **Sorun:** 640–700px yüksekliğindeki telefonlarda üst bar + HUD + arena + alt navigasyon tek ekrana sığmayabilir; oyuncu oynarken sayfayı kaydırır. Süre, oyuncu tahtayı daha görmeden akmaya başlar. Sonuçtan sonra "sıradaki oyun", "hub'a dön", "paylaş" yok — oturum burada ölür.
- **Öneri:** Oyun sırasında tam ekran "odak modu" (`100dvh`, header/bottom-nav gizli, `touch-action: manipulation`, `overscroll-behavior: contain`); arena yüksekliğini `min(420px, 100dvh - HUD - safe-area)` ile hesapla. 3-2-1 geri sayım (süre geri sayım bitince başlasın). Sonuç ekranına "Bugün oynamadığın 3 oyun" önerisi, "Oyun Merkezi'ne dön" ve "Ödülsüz pratik" butonları.
- **Efor:** M

### B11 — DÜŞÜK · Dil/Tutarlılık · Müşteri bileşeninde admin toast'ı, çift başlık soneki, UTC dili, kopyalanan metin
- **Kanıt:** `game-tournament.tsx:6` `toast` → `lib/admin-toast.ts:14-19` "Bilgi: / Basarili: / Dikkat: " öneki (Türkçe karakter yok). `page.tsx:7` + `layout.tsx:21` → "Hız Sıralama | QRateX | Müşteri alanı". `game-shell.tsx:323` "Her gün 00:00 (UTC) sıfırlanır". `page.tsx:19`, `minigame-config.ts:231`, `minigame-copy.ts:148` aynı talimatı üç kez söylüyor; `minigame-copy.ts:148` düz `'`, diğerleri tipografik `’`.
- **Sorun:** Müşteri "Basarili: 🏆 1. oldun" gibi bozuk Türkçe ve admin tonu görür; sekme başlığı uzun ve tekrarlı; UTC kullanıcıya anlamsız (TR için 03:00).
- **Öneri:** Müşteri tarafında doğrudan `sonner` kullan; metadata'yı `{ title: 'Hız Sıralama' }` yap; sıfırlama saatini kullanıcının yerel saatine çevir ("Yeni hak bu gece 03:00'te" + canlı geri sayım). Sayfa açıklamasını kısa bir değer önerisine indir, talimat yalnız oyun kabuğunda kalsın.
- **Efor:** S

### B12 — DÜŞÜK · Performans · Tamamlamada tüm oyun geçmişi iki kez okunuyor; bildirim transaction dışında
- **Kanıt:** `complete/route.ts:90-94` ve `:199` iki kez `computeAchievementStats`; `lib/game-achievement-stats.ts:17-20` kullanıcının tüm `completed|failed` oturumlarını sınırsız çekiyor. `complete/route.ts:186-193` ödül bildirimi transaction sonrası, hata 500'e dönüşüyor.
- **Sorun:** Oyun geçmişi büyüdükçe her tamamlama doğrusal maliyetli iki sorgu yapar (her gün 20 oyun × aylar). Bildirim yazımı başarısız olursa puan verilmiş olmasına rağmen istemci "Oyun tamamlanamadı" görür ve ödül ekranı gösterilmez.
- **Öneri:** "Önce" durumunu tek sorgu + bu oturumun etkisini bellekte uygulayarak türet (ikinci sorguya gerek yok) ya da başarım sayaçlarını `UserGameStats` özet satırında artımlı tut. Bildirimleri `after()` ile (proje zaten kullanıyor) yanıt sonrası yaz ve hatayı yut.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Kişisel rekor ve ilerleme hissi (Duolingo):** sonuç ekranında "En iyin: 9 tur / 38,2 sn — bugün +1", eşiğe ilerleme çubuğu (7 tur hedefi) HUD'da canlı; yeni rekorda ayrı kutlama.
2. **Hız metriği ve paylaşılabilir sonuç kartı (Spotify Wrapped):** "45 sn'de 61 rakam · ortalama 0,74 sn/rakam · Türkiye'de ilk %12" kartı, görsel olarak paylaşılabilir (OG görsel uç noktası).
3. **Ödülsüz pratik modu + 3-2-1 geri sayım:** günlük ödüllü hak bittikten sonra da beceri gelişimi; ödüllü oyunu bozmayan ayrı mod (Duolingo "practice").
4. **Ses/titreşim tercihleri ve odak modu (Revolut/Monzo mobil his):** tam ekran oyun, güvenli alan, ses kapatma, haptic seviyesi.
5. **Sonraki adım akışı (Starbucks Rewards "next reward"):** "Bugün 3 oyun daha oynanabilir · toplam +450 puan potansiyeli", hub'a ve sıradaki oyuna tek dokunuş.
6. **Arkadaş/ekip karşılaştırması ve rövanş:** squads modülüyle (`/customer/squads`) "ekibinden en hızlı" tablosu; adil eşitlik kırıcı (süre) ile.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** 60 saniyelik, tek elle oynanan, "bir tane daha" dedirten bir dikkat/hız testi. Oyuncu ne yaptığını ilk 2 saniyede anlar, hatasında cezalandırılır ama kilitlenmez, sonunda ölçülebilir bir kişisel ilerleme ve paylaşılabilir bir sonuç görür.

**Yerleşim (mobil öncelikli):**
- **Lobi kartı:** üstte büyük "Bugünün hakkı: hazır / kullanıldı (yeni hak 03:00'te, canlı geri sayım)" durumu (sayfa açılışında status'tan, CTA'dan önce). Altında kişisel rekor şeridi (en iyi tur + en iyi süre), ardından tek birincil CTA. Turnuva ve liderlik bir sekme kontrolüyle ("Bu hafta / Tüm zamanlar") — iki ayrı uzun liste yerine.
- **Odak modu:** CTA'ya basınca tam ekran (`100dvh`), üstte ince ilerleme çubuğu (süre), solda "Tur 4", ortada büyük "Sıradaki 6", sağda eşik halkası (4/7). 3-2-1 geri sayım. Arena kare ızgara (4×4'e kadar), kutular eşit ve güvenli kenar boşluklu; konum framer'dan ayrık.
- **Hata:** kutu yatay sallanır + −2 sn rozeti süre çubuğundan kopar; sıra sıfırlanmaz; kombo sayacı kırılır.
- **Sonuç:** skor kartı (tur, toplam rakam, ort. sn/rakam, doğruluk %), eşiğe göre ödül rozeti, kişisel rekor farkı, "Paylaş", "Pratik yap", "Sıradaki oyun".

**Motion / 3D (ölçülü):** 3D gereksiz; bu oyun okunabilirlik ve tepki gecikmesine dayanır. Framer yalnız: kutu giriş (stagger 20ms, yay), doğru dokunuşta 120ms "pop" + mevcut canvas kıvılcımı (kutunun gerçek merkezinde), hata sarsılması, tur geçişinde ızgaranın 200ms "shuffle" çapraz geçişi. Sonsuz nabız yalnız yardım modunda. `prefers-reduced-motion` ve uygulama içi tercih: tüm transform animasyonları opaklık geçişine, konfeti statik rozete düşer; ses ayrı tercihle yönetilir.

**Veri / API değişiklikleri:**
- `MiniGameSession`'a `durationMs Int?`, `attempt Int @default(1)`, `detail Json?` (tur bitiş zaman damgaları, hata sayısı) ekle; `status` için `abandoned` durumu.
- `start`: `completed|failed` kilitli; `active` yeniden açılırken `attempt` artar, 1'den fazlasına izin yok (veya terk = kayıp).
- `complete`: `won` istemciden ödül kararı olarak alınmaz; sunucu skordan türetir. Speed-order için tur zaman damgalarıyla makullük doğrulaması (B4). Sıralama `score desc, durationMs asc`.
- Sayfa server component'i `getEffectiveMiniGame` + bugünkü oturum durumunu (tek sorgu) prop olarak verir; istemci ilk boyamada doğru lobiyi gösterir (flicker yok, ekstra fetch yok).
- Oyun mantığı saf reducer (`lib/games/speed-order-engine.ts`) + Jest testleri: kilit yok, çift dokunuş korumalı, skor/süre hesabı deterministik (seed'li tahta).
- Turnuva kapanışında sonuç dondurma (cron, `TournamentResult`), claim buna bağlı.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/games/combo-tap` (Kombo Yıldız):** "beliren hedefe hızla dokun" mekaniği; speed-order'da sıradaki kutu parladığı sürece iki oyun neredeyse aynı refleks oyunu (B8). Birleştirme önerilmez — speed-order'ı gerçek Schulte/tarama oyununa dönüştürmek (ipucunu kaldırmak, ızgarayı büyütmek) ayrımı netleştirir. Aynı accent rengi (`#22d3ee`) `truth-vs-fake` ile de paylaşılıyor (`minigame-config.ts:93,233`); hub'da ayırt edilebilirlik için farklı renk seçilmeli.
- **Lobi içi turnuva + liderlik (`GameTournament` + `GameLeaderboard`)** her oyunun sayfasında tekrar ediyor ve `/customer/leaderboard` ile kavramsal olarak örtüşüyor. Oyun sayfasında tek bir sekmeli "Sıralama" bileşeni, genel sayfada ise oyunlar arası özet kalmalı.
- **`/customer/games` hub'ı:** bu sayfa hub'ın alt sayfası olarak doğru konumda; ancak "bugün oynandı" bilgisi hub'da var, burada yok — aynı veri kaynağı (status) sayfa sunucusunda da kullanılmalı.
- Kaldırma önerilmez: küçük, bağımsız ve düzeltilmesi ucuz bir oyun; B1–B3 düzeltildiğinde koleksiyona değer katar.

---

## Doğrulama (şüpheci inceleme)

Üç iddia da kod baştan okunarak çürütülmeye çalışıldı (`components/customer/games/speed-order-game.tsx`, `lib/use-mini-game.ts`, `app/api/customer/games/[game]/start|complete/route.ts`, `app/api/customer/games/status/route.ts`, `app/api/customer/tournament/route.ts`, `lib/tournament-core.ts`, `lib/minigame-config.ts`, `lib/minigame-config-effective.ts`, `lib/points-wallet.ts`, `proxy.ts`). Kod çalıştırılmadı, veritabanına dokunulmadı.

### 1. Yanlış dokunuştan sonra tur çözülemez hâle geliyor (soft-lock) — **DOĞRULANDI**
- Doğru dokunuşta kutu tahtadan silinir (`speed-order-game.tsx:121`). Yanlış dokunuşta yalnızca `nextRef.current = 1; setNext(1);` yapılır (`:153-154`); tahta yeniden kurulmaz, silinen kutular geri gelmez.
- Sonuç: 1 numaralı kutu artık yok. Kalan her kutu için `cell.n === nextRef.current` (`:120`) yanlış olur; her dokunuş yine "Sıra yanlış!" verir. `isNext = c.n === next` (`:192`) hiçbir kutuda doğru değildir, yani parlayan kutu da kalmaz. Tur ancak `ROUND_MS` (45 sn) dolunca `endGame` ile kapanır (`:104-106`).
- Yeniden üretim: Tur 1'de (5 kutu) 1, 2, 3'e dokun, sonra 5'e dokun. Ekranda 4 ve 5 kalır, "Sıradaki: 1" yazar, hiçbir dokunuş kabul edilmez. Kalan süre boşa gider. Skor eşiğin (7) altındaysa oyun kayıpla biter.
- Çift dokunuş varyantı da makul: `AnimatePresence` çıkış animasyonu sırasında DOM'da kalan butonun `onClick={() => tap(c)}` kapanışı (`:197`) yaşamaya devam eder. Silinmekte olan kutuya ikinci kez dokunulunca `c.n < nextRef.current` olduğu için ceza dalına düşülür ve aynı kilit oluşur. Bu varyant tarayıcıda denenmedi, kod okumasına göre yüksek olasılıkla gerçek.
- Öneri: Oyun mantığını saf bir reducer'a taşıyın (`lib/games/speed-order-engine.ts`: `{board, next, mistakes, roundStartedAt}`). Ceza "sırayı sıfırla" yerine "−2 sn + kombo kırılması" olsun. Sıfırlama illa istenirse silinmiş kutular da geri yüklenmeli (`buildBoard` tekrar çağrılır ya da kutular `hit:true` ile tutulup yeniden açılır). Çıkış animasyonundaki kutulara `pointer-events:none` verin veya `tap` içinde `cell.n < nextRef.current` durumunu yok sayın. Reducer için Jest testi yazın: "yanlış dokunuştan sonra her zaman tıklanabilir bir `next` kutusu bulunur".

### 2. Kaybedilen oyun tekrar başlatılabiliyor ama 409 ile reddediliyor; sayfa yenilenince günlük hak sınırsız — **DOĞRULANDI**
- `complete` kaybı `status: 'failed'` olarak yazar (`complete/route.ts:101`). `start` yalnızca `existing.status === 'completed'` durumunu kilitler (`start/route.ts:57`). Diğer her durumda aynı `sessionId` ile `canPlay: true` döner (`:69-73`). Hub'daki `status` uç noktası da yalnızca `completed` olanları "bugün oynandı" sayar (`status/route.ts:33`).
- Kayıp sonrası yeniden oynama: `complete` çağrısında `:73` kontrolü `failed` durumunu geçirir. Ama atomik `updateMany({ where: { status: 'active' } })` (`:98-99`) 0 satır günceller, `credited:false` (`:107-108`) olur ve `:177-181` 409 "Oyun zaten tamamlandı" döner. Kullanıcı 45 saniyelik bir turu oynar ve sonunda hata toast'ı görür (`use-mini-game.ts:98-99,127`). Bu boşa harcanmış ve yanıltıcı bir deneyimdir. Puan basılmadığı için bir ekonomi açığı yok.
- Yenileme ile sınırsız deneme: oturum `active` iken sayfa yenilenirse ya da sekme kapatılırsa `start` aynı aktif oturumu yeniden verir (`start/route.ts:69-73`). `startedAt` değişmez, deneme sayacı da yok. `speed-order` oyunu yalnızca süre dolunca veya 12 turda `finish` çağırır (`speed-order-game.tsx:104-106,138-139`). Dolayısıyla kötü giden turu bitmeden yenileyen oyuncu, iyi bir tur yakalayana kadar sınırsız deneyebilir. Sonra bunu ödül ve turnuva skoru olarak gönderir. "Günde 1 hak" vaadi ve haftalık sıralamanın adaleti fiilen bozulur.
- Yeniden üretim: (a) Oyunu başlat, 45 sn boyunca 7 turun altında kal; hub'a dön, kart hâlâ "oynanmadı" görünür; yeniden başlat ve oyna; sonunda 409 alırsın. (b) Oyunu başlat, Tur 2'de sayfayı yenile; yeniden başlat; aynı oturum açılır. Bu döngü sınırsızdır.
- Öneri: `start` içinde `failed` (ve ileride `abandoned`) durumunu da kilitleyin, hub `status` sorgusunu `status in ['completed','failed']` yapın. `MiniGameSession`'a `attempt Int @default(1)` ekleyin. `active` oturum yeniden açılırken `attempt` artırılsın ve 1'i aşınca oturum `abandoned` (kayıp) sayılsın. Bunun yerine, terk edilen oturumu `startedAt + ROUND_MS + tolerans` geçtiğinde sunucuda kayıp sayan bir kural da kullanılabilir. İstemci `beforeunload`/`visibilitychange` ile en iyi çabayla bir "terk" bildirimi göndersin. Asıl güvence sunucu kuralıdır.

### 3. İstemcinin bildirdiği skora körü körüne güveniliyor; turnuva ödülü sahte skorla hedeflenebilir — **DOĞRULANDI**
- `complete` yalnızca şunları kontrol eder: zod şeması (`complete/route.ts:15-22`), `maxScore`'a sıkıştırma (`:61`), `won` bayrağı ve `minDurationSec` (`:82-86`). `speed-order` için `maxScore: 12`, `rewardThreshold: 7`, `rewardPoints: 150`, `rewardXp: 75`, `minDurationSec: 8` (`minigame-config.ts:234-238`). `computeEffectiveReward` skor ≥ eşik ise sabit ödül verir (`minigame-config-effective.ts:107-116`). `creditPointsAndXp` içinde tavan (cap) yok. Bu uçlarda hız sınırı (rate limit) da yok (grep ile bakıldı, sonuç boş). `proxy.ts` yalnızca CORS ve başlık işi yapıyor.
- Turnuva sıralaması doğrudan `starsCollected` (yani istemcinin bildirdiği skor) üzerinden `_max` ile yapılır (`tournament/route.ts:28-39`). Eşitlik kırıcı yok. POST "gerçek sırayı yeniden hesaplar" ama yine aynı güvenilmeyen skordan hesaplar (`:139-142`). Ödüller 500/300/150 (`tournament-core.ts:13`).
- Yeniden üretim (kod okumasına dayanır, canlıda denenmedi): oturum açmış bir CUSTOMER `POST /api/customer/games/speed-order/start` çağırır, 9 sn bekler, ardından `POST .../complete` ile `{sessionId, score:12, durationSec:9, won:true}` gönderir. Sonuç: 150 puan + 75 XP + seri bonusu, haftalık turnuvada 12 (azami) skor. Gerçek oyunda 12 tur en az 5+6+7+8+9+9×7 = 98 doğru dokunuş ve 11×400 ms tur geçişi ister. Bu, 9 sn'de fiziksel olarak imkânsızdır. Birden çok hile hesabı 12'de eşitlenirse ilk 3, `groupBy` sırasına göre belirsiz biçimde dağılır.
- Not: Sorun sistemiktir (generic `[game]/complete` tüm oyunlara hizmet ediyor). Günlük tek oturum kuralı tekrarı sınırlar ama tek seferlik sahte skoru engellemez.
- Öneri: `won` istemciden alınmasın, sunucu skordan türetsin. Oyun başına makullük modeli olsun: speed-order için gereken asgari süre ≈ Σ(tur başına kutu × asgari tepki süresi ~150 ms) + tur geçişleri. Daha sağlamı, istemci tur bitiş zaman damgalarını (`detail Json`) göndersin ve sunucu monotonluk ile asgari aralığı doğrulasın. Seed'i sunucu `start`'ta üretsin (deterministik tahta), dokunuş günlüğü sunucuda yeniden oynatılsın. Turnuva sıralaması `score desc, durationMs asc` olsun. Hafta kapanışında aykırı skorlar (ör. teorik alt sınırın altında süre) `points_credited` ve velocity dedektörüne işaretlensin. Ödül claim'i manuel incelemeye düşebilsin.
