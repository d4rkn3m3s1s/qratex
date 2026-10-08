# /dealer/scan

**Amaç:** Bayi/işletme kasasında müşterinin fiziksel Qratex kartındaki QR'ı (veya manuel token'ı) okuyup müşteriyi tanımak, ardından bir "tüketim" (ziyaret/satın alma) kaydı oluşturmak. Bu kayıt; müşteriye bildirim, pasif puan (squad dahil), happy-hour/sezon çarpanı, ısı haritası, ziyaret görevleri ve en önemlisi **ConsumptionReview** (tüketime bağlı doğrulanmış yorum, karakter rozetinin tek kaynağı) hunisinin **başlangıç noktasıdır**. Sistemdeki "gerçek ziyaret → doğrulanmış geri bildirim" döngüsünün kapısı bu sayfadır.

**Genel puan: 4/10** · **Karar: yeniden tasarla** (akış değerli ve sunucu tarafı büyük ölçüde sağlam; ancak birincil yol olan kamera taraması üretimde fiilen kapalı, istemci tarafında birkaç kapanış (stale closure) hatası var ve sayfa bir "kasa aracı" gibi değil, genel bir pano sayfası gibi tasarlanmış).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Kamera, site genelindeki `Permissions-Policy: camera=()` başlığı yüzünden üretimde açılamıyor; kamera çevirme ve aynı kodu tekrar okuma engeli kapanış hatası yüzünden bozuk; elle token girme yolu çalışıyor. |
| UX | 4/10 | Kasa akışı için gereksiz adımlar (hero, ayrı dialog, kategori→ürün iki seviye), mobilde sonuç kartı kaydırma gerektiriyor, iptal edilen form sonraki müşteriye taşınıyor. |
| Görsel | 6/10 | Panel tasarım diliyle (DashboardPageHero, kart cam efekti, emerald vurgu) tutarlı ve temiz; ancak sabit `text-slate-500/600`, `text-emerald-400` gibi tema dışı renkler var ve tarama çerçevesi gerçek qrbox ile hizalı değil. |
| Mimari | 4/10 | 738 satırlık tek istemci bileşen, `any` kaçakları, html5-qrcode'a verilen geri çağrıda eski state, puan basan yolda transaction ve `points_credited` olayı yok, `after()` yerine ateşle-unut. |
| Performans | 6/10 | html5-qrcode ve Tesseract dinamik import ile doğru yükleniyor; fakat tarama başarısında saniyede ~10 tekrarlı istek, her bip için kapatılmayan yeni `AudioContext`, kayıt sonrası gereksiz tekrar tarama var. |
| Erişilebilirlik + mobil | 4/10 | İkon butonlarda `aria-label` yok (yalnız `title` ya da hiçbiri), `Label`'lar `htmlFor` ile bağlı değil, sonuç için `aria-live` yok, tam ekran kamera katmanında Esc/odak kapanı yok, panodaki "Kart tara" butonu mobilde gizli. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (hero) | ÇALIŞIYOR | app/dealer/scan/page.tsx:352-358 | Kasa aracında dikey alan harcıyor. |
| 2 | Segment metadata | ÇALIŞIYOR | app/dealer/scan/layout.tsx:4-6 | |
| 3 | Rol erişimi (sayfa DEALER, API DEALER/ADMIN) | ÇALIŞIYOR | proxy.ts:50-73; app/api/dealer/cards/scan/[token]/route.ts:20 | ADMIN API'yi çağırabilir ama sayfaya proxy'den giremez; tutarsız ama zararsız. |
| 4 | Kategori listesini mount'ta yükleme | KISMİ | page.tsx:97-126 | Hata yalnızca `console.error`; kullanıcıya hiçbir durum gösterilmiyor. |
| 5 | Kamerayı aç (html5-qrcode) | BOZUK | next.config.js:339-340 (`camera=()`), proxy.ts:17; page.tsx:188-235 | Tüm yollara uygulanan Permissions-Policy kamerayı belgeden tamamen yasaklıyor; `getUserMedia` reddedilir. 2026-05-12'den (77a7126) beri böyle. Canlı tarayıcıda test edilmedi, başlık + spesifikasyonla doğrulandı. |
| 6 | Kamera hata mesajları | KISMİ | page.tsx:225-233 | "Tarayıcı ayarlarından izin verin" yanıltıcı: politika sunucu başlığından geldiği için kullanıcı ne yaparsa yapsın açılmaz. html5-qrcode string ile reddettiğinde `err.name` tanımsız kalır (doğrulanmadı). |
| 7 | Kamera açılırken yükleniyor/çift tık koruması | KISMİ | page.tsx:418 | Buton `disabled` olmuyor; iki hızlı tık iki tarayıcı başlatır, `scannerRef` üzerine yazılır, ilki kapatılamaz (kamera ışığı açık kalır). |
| 8 | Tam ekran kamera katmanı | KISMİ | page.tsx:362 | Yorum "mobilde tam ekran" diyor ama `fixed inset-0 z-40` masaüstünde de geçerli; Esc ile kapanmıyor, gövde kaydırması kilitlenmiyor, güvenli alan boşluğu yok, mobil menü FAB'ı `z-50` (components/dashboard/sidebar.tsx:738) üstte kalıyor. |
| 9 | Tarama çerçevesi animasyonu | ÇALIŞIYOR | page.tsx:392-403 | Tüm alanı çevreleyen dekoratif kenarlık; gerçek 250×250 `qrbox` (page.tsx:210) ile hizalı değil. |
| 10 | "Tarama aktif" göstergesi | ÇALIŞIYOR | page.tsx:444-457 | |
| 11 | Kamerayı kapat | ÇALIŞIYOR | page.tsx:237-248, 424 | |
| 12 | Kamera çevir (ön/arka) | BOZUK | page.tsx:250-255 | `setTimeout(() => startCamera())` önceki render'ın `startCamera`'sını çağırır; o kapanış eski `facingMode`'u görür. Her basış bir adım geriden gelir, ilk basış aynı kamerayı yeniden açar. |
| 13 | Ses aç/kapat | KISMİ | page.tsx:83, 431-438 | Tercih kalıcı değil; html5-qrcode'a verilen eski geri çağrı yüzünden kamera açıkken sesi kapatmak o oturumda etkisiz (bkz. #15). |
| 14 | Bip sesi | KISMİ | page.tsx:140-159 | Her bipte yeni `AudioContext` oluşturuluyor ve hiç `close()` edilmiyor; dokunsal geri bildirim (`navigator.vibrate`) yok. |
| 15 | Aynı kodu 3 sn tekrar okuma engeli | BOZUK | page.tsx:171-186, 214-217 | `onScanSuccess`, `scanner.start` anında yakalanır; içindeki `lastScannedCode` hep `null` kalır. html5-qrcode her karede geri çağrıyı tetiklediği için (node_modules/html5-qrcode/esm/html5-qrcode.js:543) saniyede ~10 istek, toast ve `SCANNED` denetim kaydı oluşur. |
| 16 | URL'den token çıkarma | ÇALIŞIYOR | page.tsx:161-169 | `/c/TOKEN` ve düz token destekleniyor. |
| 17 | Manuel token girişi (+Enter) | KISMİ | page.tsx:463-480, 294-298 | Buton `scanning` iken kilitli ama Enter tuşunda koruma yok (çift istek); başarılı taramadan sonra token input'ta açık kalıyor. |
| 18 | "Kart doğrulanıyor" katmanı | ÇALIŞIYOR | page.tsx:405-412 | |
| 19 | Kart tarama API'si | ÇALIŞIYOR | app/api/dealer/cards/scan/[token]/route.ts:30-125 | Kart + müşteri + bu bayideki son 5 tüketim + sayım. |
| 20 | Tarama denetim kaydı (`SCANNED`) | KISMİ | route.ts:86-98 | Çalışıyor ama #15 ve #38 yüzünden şişiyor; IP olarak ham `x-forwarded-for` yazılıyor (`getClientIp` yerine). |
| 21 | Kart durumu hataları (yok/aktif değil/bloklu) | KISMİ | page.tsx:271-281; route.ts:62-83 | Toast yerelleştirilmiş, fakat panel içindeki hata metni sunucudan gelen sabit Türkçe string (EN arayüzde dil karışıyor). |
| 22 | Hata kartı + "Tekrar dene" | KISMİ | page.tsx:499-515, 343-348 | "Tekrar dene" yalnızca durumu temizliyor, kamerayı yeniden açmıyor; kamera hatada kapanmadığı için (#15) aynı hatalı QR sürekli istek atıyor ve hata kartı tam ekran katmanın arkasında kalıyor. |
| 23 | Müşteri kimlik kartı (avatar, ad, e-posta, seviye, puan) | ÇALIŞIYOR | page.tsx:525-552 | E-posta tam ve maskesiz gösteriliyor (kasa ekranında omuz üstü sızıntı). |
| 24 | "Toplam tüketim" (bu bayide) | ÇALIŞIYOR | page.tsx:556-559; route.ts:111-116 | |
| 25 | "Son 5 tüketim" sayacı | KISMİ | page.tsx:560-563 | Değer her zaman `min(toplam, 5)`; bilgi taşımıyor. |
| 26 | Son tüketimler listesi | KISMİ | page.tsx:567-579 | 5 gelir, 3 gösterilir; tutar ve yorum durumu yok; `formatRelativeTime` yerel parametresiz çağrıldığı için EN arayüzde Türkçe (lib/utils.ts:33-36). |
| 27 | "Tüketim ekle" butonu | ÇALIŞIYOR | page.tsx:583-589 | |
| 28 | Sıfırla (yeni tarama) butonu | ÇALIŞIYOR | page.tsx:590-592 | Yalnız ikon; `aria-label`/`title` yok. |
| 29 | Boş durum | ÇALIŞIYOR | page.tsx:596-612 | |
| 30 | Dialog: kategori seçimi | KISMİ | page.tsx:636-654; app/api/dealer/categories/route.ts:20-34 | `_count.products` başka bayilerin ve pasif ürünleri de sayıyor (global kategoride rakip ürün sayısı sızıyor, sayılar listedekiyle tutmuyor); kategori yoksa yönlendirme yok. |
| 31 | Dialog: ürün seçimi | BOZUK | page.tsx:108-114, 638, 657-686 | Kategori değişince `selectedProduct` sıfırlanmıyor: görünmeyen eski ürün kaydediliyor. Ürün istekleri iptal edilmediği için hızlı kategori değişiminde eski yanıt yenisini ezebiliyor. |
| 32 | Fiyatı tutara otomatik doldurma | KISMİ | page.tsx:663-665, 675-679 | Fiyat 0 ise doldurmuyor; `{product.price && …}` fiyat 0'da ekrana çıplak "0" basıyor. |
| 33 | Tutar alanı | KISMİ | page.tsx:691-696; lib/validations.ts:274 | Üst sınır yok (sunucu `nonnegative` dışında kontrol etmiyor); `inputMode="decimal"` yok; virgül girişi bazı tarayıcılarda boş değere düşüyor. |
| 34 | Fişten tutar okuma (Tesseract OCR) | KISMİ | components/ocr/receipt-amount-scanner.tsx | Dosya input'u (`capture`) Permissions-Policy'den etkilenmez, çalışması beklenir (canlıda doğrulanmadı). Metinler sabit Türkçe (99, 102, 136-141); "TOPLAM 1.250" gibi ondalıksız TR binlik biçimi 1,25 olarak okunuyor (satır 36-48, yalnız nokta varsa `parseFloat`). |
| 35 | Not alanı | ÇALIŞIYOR | page.tsx:703-708 | İstemcide `maxLength` yok; 500 üstü sunucuda 400 döner. |
| 36 | Kaydet (POST /api/dealer/consumptions) | KISMİ | page.tsx:300-334; app/api/dealer/consumptions/route.ts:129-363 | Kayıt, denetim, bildirim, puan ayrı ayrı yazılıyor (transaction yok); ortada hata olursa istemci hata görür, tekrar dener → çift kayıt. |
| 37 | İptal | KISMİ | page.tsx:713 | `resetForm()` çağrılmıyor; ürün/tutar/not bir sonraki müşterinin dialoguna taşınıyor. `resetScan` (343-348) de formu temizlemiyor. |
| 38 | Kayıt sonrası kartı tazeleme | KISMİ | page.tsx:327-328 | Tam tekrar tarama: kart kısa süre kayboluyor, ikinci "X bulundu!" toast'ı çıkıyor, fazladan `SCANNED` denetim kaydı yazılıyor. |
| 39 | Müşteriye uygulama içi bildirim | ÇALIŞIYOR | consumptions/route.ts:254-268 | Bildirim metni sabit Türkçe. |
| 40 | Pasif puan + squad puanı | KISMİ | consumptions/route.ts:275-320 | `points_credited` olayı yazılmıyor → hız/tavan dedektörü (lib/points-velocity.ts) bu yolu görmüyor; ham `increment`, seviye/XP güncellenmiyor. |
| 41 | Happy hour + sezon çarpanı | ÇALIŞIYOR | consumptions/route.ts:285-301 | |
| 42 | Isı haritası + ziyaret görevi tetikleme | KISMİ | consumptions/route.ts:323-337 | `import().then()` ile ateşle-unut; projede başka yerlerde kullanılan `after()` (ör. app/api/feedbacks/route.ts:1) yok, serverless'te yanıt sonrası iş kaybolabilir. |
| 43 | Hız sınırı (kart+bayi, 5/dk) | ÇALIŞIYOR | consumptions/route.ts:194-216 | DB tabanlı atomik sayaç. |
| 44 | Ürün sahiplik kontrolü | KISMİ | consumptions/route.ts:222-245 | Bayi/global kontrolü var; `isActive` ve kategori tutarlılığı kontrol edilmiyor. |
| 45 | Unmount'ta kamera temizliği | KISMİ | page.tsx:100-105, 205-206 | Başlatma başarısız olunca ref dolu kalıyor; html5-qrcode `stop()` taramıyorken **senkron** `throw` ediyor (html5-qrcode.js:227-228), `.catch` bunu yakalamaz. #5 nedeniyle her kamera denemesinden sonra sayfadan çıkmak bu yolu tetikler (etkisi doğrulanmadı). |
| 46 | Mobil yerleşim | KISMİ | page.tsx:360; app/dealer/dealer-dashboard-client.tsx:385-391 | Mobilde sonuç kartı tarayıcı kartının altında, otomatik kaydırma yok; panodaki "Kart tara" kısayolu `hidden sm:inline-flex` ile mobilde gizli. |
| 47 | Erişilebilirlik | KISMİ | page.tsx:428-438, 461-467, 590, 637-702 | İkon butonlarda `aria-label` yok, `Label`'lar input'a bağlı değil, sonuç `aria-live` ile duyurulmuyor. |
| 48 | Azaltılmış hareket | KISMİ | components/providers.tsx:232; page.tsx:396-399 | `MotionConfig reducedMotion="user"` dönüşümleri kapatır ama sonsuz opaklık döngüsü sürer. |
| 49 | Çok dillilik | KISMİ | messages/tr.json, en.json (`dealerScan` tam); OCR, API hataları, göreli zaman, para birimi biçimi (lib/utils.ts:77-82, sabit `tr-TR`) | Sayfa anahtarları eksiksiz, çevre bileşenler değil. |
| 50 | Personel (STAFF) ile tarama | EKSİK | proxy.ts:50-55; route.ts:20 | Kasada çalışan personel bu sayfaya giremez, API de STAFF'ı reddeder; işletme sahibi kimlik bilgisi paylaşmak zorunda. |
| 51 | Hızlı hazır ayarlar (tek dokunuşla kayıt) | EKSİK | app/api/dealer/quick-presets/route.ts; prisma `QuickScanPreset` | API ve model hazır, hiçbir arayüz kullanmıyor. |
| 52 | Çevrimdışı kuyruk | EKSİK | app/api/dealer/offline-sync/route.ts | API hazır, sayfa kullanmıyor; bağlantı yoksa kayıt kayboluyor. |
| 53 | Yanlış kaydı geri alma/düzeltme | EKSİK | app/api/dealer/consumptions/ (yalnız route.ts, DELETE/PATCH yok) | Basılan puan geri alınamıyor. |
| 54 | Ödül/kupon kullanımı (redeem) | EKSİK | page.tsx genelinde yok | Müşteri tanındığı anda kullanılabilir ödülü göstermek sadakat ürünlerinin çekirdeği. |
| 55 | Şüpheli aktivite kontrolü | EKSİK | lib/security.ts:12-66 (`checkSuspiciousActivity`, hiçbir yerde çağrılmıyor) | Hızlı tarama/olağandışı tutar eşikleri ölü kod. |
| 56 | Bugünkü kayıtlar / oturum özeti | EKSİK | — | Kasiyer son işlemleri aynı ekranda göremiyor; /dealer/consumptions'a gitmek gerekiyor. |

**Durum özeti:** ÇALIŞIYOR 18 · KISMİ 27 · BOZUK 4 · SAHTE 0 · EKSİK 7 (toplam 56).

---

## Bulgular

### 1. Kamera taraması üretimde fiilen kapalı
- **Önem:** kritik · **Kategori:** işlevsellik / yapılandırma · **Efor:** S
- **Kanıt:** next.config.js:323-340 `source: '/:path*'` → `Permissions-Policy: camera=(), microphone=(), …`; proxy.ts:17 aynı başlığı API yanıtlarına da koyuyor. page.tsx:191-221 kamerayı `getUserMedia` üzerinden açan html5-qrcode'u başlatıyor.
- **Sorun:** `camera=()` boş izin listesi, kamerayı kendi origin'i dahil tüm belgede yasaklar. Sayfanın adı ve birincil işlevi "QR'ı kameraya gösterin" olduğu hâlde kasiyer yalnızca token'ı elle yazarak ilerleyebiliyor. Kullanıcıya "tarayıcı ayarlarından izin verin" deniyor (page.tsx:228); bu yönlendirme sorunu çözemez. Aynı başlık /customer/scan (müşteri QR tarayıcısı, aynı kütüphane) sayfasını da etkiliyor olmalı. Değişiklik 77a7126 (2026-05-12) commit'inden geliyor.
- **Öneri:** Başlığı `camera=(self)` yapın (mikrofon kapalı kalabilir). Daha da iyisi kamerayı yalnız gereken rotalara açın: next.config `headers()` içinde `/dealer/scan` ve `/customer/scan` için `camera=(self)`, diğer her şey için `camera=()`. Not: Next `headers()` aynı anahtarı birden çok kuralla eşlerse sonuncu kazanır; sıralamayı ve proxy.ts'teki kopyayı birlikte düzenleyin. Ardından kamera açılış hatalarını `NotAllowedError` / `NotReadableError` (başka uygulama kullanıyor) / `OverconstrainedError` / güvenli olmayan bağlam olarak ayırın. Bu yapılandırmanın gerilemesini önlemek için başlık değerini doğrulayan küçük bir test ekleyin.

### 2. Puan basan tüketim yolu fraud dedektörüne görünmez ve atomik değil
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü (puan ekonomisi) · **Efor:** M
- **Kanıt:** app/api/dealer/consumptions/route.ts:275-320 `prisma.user.update({ points: { increment } })`; dosyada `points_credited` yok (`grep points_credited app/api/dealer` boş). Kayıt (231), denetim (237), bildirim (255) ve puan (305-319) ayrı çağrılar. Tutarın üst sınırı yok: lib/validations.ts:274.
- **Sorun:** Proje değişmezi "puan kredileyen her yol aynı transaction'da `analyticsEvent { event: 'points_credited' }` yazmalı" (lib/points-velocity.ts:17, 51 yalnız bu olaya bakıyor). Bu yol yazmadığı için kötü niyetli ya da hatalı bir bayi + müşteri ikilisi kart başına dakikada 5 kayıtla (her biri baseXP tavanında 50 pasif puan × happy-hour × sezon çarpanı) saatte binlerce puan basabilir ve hız dedektörü hiçbir şey görmez. Ayrıca adımlar transaction dışında: puan güncellemesi hata verirse kayıt oluşmuş ama istemci 500 görmüş olur, kasiyer tekrar dener, çift kayıt ve çift bildirim oluşur. Sınırsız `amount` (ör. 1e12) ROI, ısı haritası ve gelir analitiğini de kirletir.
- **Öneri:** Tüketim oluşturmayı tek `prisma.$transaction` içinde topla: consumption + cardAuditLog + (varsa) squad/user increment + `analyticsEvent({ event: 'points_credited', category: 'consumption', data: { points, consumptionId, dealerId } })`. Bildirim ve ısı haritası/ziyaret görevi `after()` içine taşınsın. `amount` için makul bir üst sınır (ör. 100 000) ve `lib/security.ts`'teki `UNUSUAL_AMOUNT` eşiğini aşan kayıtlar için `reportSuspiciousActivity`. İsteğe `Idempotency-Key` başlığı (istemci kayıt başına UUID üretir) ekleyip `Consumption` üzerinde benzersiz anahtar tutarak ağ tekrarlarını tek kayda indirin. Kullanıcı başına günlük pasif-puan tavanı için mevcut `lib/points-caps.ts`'e bu kategoriyi ekleyin.

### 3. Tarama geri çağrısı eski state'e bağlı: tekrar okuma engeli ve ses ayarı çalışmıyor, istek fırtınası
- **Önem:** yüksek · **Kategori:** hata / performans · **Efor:** S
- **Kanıt:** page.tsx:171-186 (`useCallback` bağımlılıkları `lastScannedCode`, `playBeep`), page.tsx:214-217 geri çağrı `scanner.start` anında bir kez veriliyor; html5-qrcode her başarılı karede çağırıyor (node_modules/html5-qrcode/esm/html5-qrcode.js:536-552). Hata yolunda kamera durdurulmuyor (page.tsx:271-281, `stopCamera` yalnız başarıda, 285).
- **Sorun:** Kütüphanenin elindeki fonksiyon ilk render'ın kapanışı; `lastScannedCode` hep `null`, `soundEnabled` hep başlangıç değeri. QR kadrajda kaldıkça saniyede ~10 `GET /api/dealer/cards/scan/...`, her biri bir `SCANNED` denetim kaydı, toast ve bip üretir. Geçersiz/bloklu kartta kamera hiç kapanmadığı için bu fırtına kart çekilene kadar sürer; hata kartı da tam ekran katmanın arkasında kalır.
- **Öneri:** Kilidi state değil `useRef` ile tutun (`inFlightRef`, `lastCodeRef`, `soundRef`). Geri çağrının ilk satırında `if (inFlightRef.current) return;`, ardından `scanner.pause(true)` ile görüntüyü dondurun; sonuç başarılıysa `stop()`, hatalıysa hata katmanını kamera görüntüsünün üstünde gösterip 1,5 sn sonra `resume()`. Geri çağrıyı ref üzerinden yönlendirin (`const handlerRef = useRef(onScanSuccess); handlerRef.current = onScanSuccess;` ve kütüphaneye `(t) => handlerRef.current(t)` verin).

### 4. Kamera çevirme bir adım geriden geliyor
- **Önem:** orta · **Kategori:** hata · **Efor:** S
- **Kanıt:** page.tsx:250-255; `startCamera` page.tsx:215'te `facingMode` state'ini okuyor.
- **Sorun:** `setTimeout(() => startCamera(), 500)` çağrısı bu render'ın `startCamera`'sını kullanıyor; içindeki `facingMode` henüz değişmemiş değer. İlk basış aynı kamerayı yeniden açıyor. Ön kamerayla müşterinin telefonundaki dijital kartı okumak isteyen tablet kasalarında özellik kullanılamıyor. Ayrıca 500 ms'lik sabit gecikme ve kapanış sırasında "Kamerayı aç" butonunun görünmesi titreşim yaratıyor.
- **Öneri:** `startCamera(mode)` parametre alsın; `switchCamera` hesaplanan yeni modu doğrudan geçsin. Daha iyisi `Html5Qrcode.getCameras()` ile cihaz listesini alıp `deviceId` ile seçim sunun ve son seçimi `localStorage`'da tutun. Sabit `setTimeout` yerine `await stop()` sonrasında başlatın.

### 5. Dialogda kategori değişince eski ürün sessizce kaydediliyor
- **Önem:** orta · **Kategori:** veri bütünlüğü / UX · **Efor:** S
- **Kanıt:** page.tsx:638 (`onValueChange={setSelectedCategory}`), page.tsx:108-114 (ürünler yeniden çekiliyor ama `selectedProduct` korunuyor), page.tsx:310 (`productId: selectedProduct`). `fetchProducts` (128-138) iptal edilmiyor.
- **Sorun:** Kasiyer "Kahve > Latte" seçip kategoriyi "Tatlı" yapınca Select boş görünür ama submit Latte'yi gönderir; tüketim analitiği ve ürün bazlı yorum eşleşmesi yanlış ürüne yazılır. Hızlı kategori değişiminde eski istek geç dönerse liste yanlış kategoriye ait olur.
- **Öneri:** Kategori değişiminde `setSelectedProduct('')` ve fiyattan gelen `amount`'u sıfırlayın; ürün çekimini `AbortController` ile iptal edilebilir yapın ya da tüm ürünleri bir kez çekip istemcide filtreleyin (en fazla 500, `products` route zaten `take: 500`). Uzun vadede kategori→ürün iki seviyeli seçim yerine aranabilir tek "ürün seç" komut kutusu (cmdk) önerilir (bkz. vizyon).

### 6. İptal edilen form bir sonraki müşteriye taşınıyor
- **Önem:** orta · **Kategori:** UX / veri bütünlüğü · **Efor:** S
- **Kanıt:** page.tsx:713 `onClick={() => setShowConsumptionForm(false)}`, page.tsx:620 `onOpenChange={setShowConsumptionForm}`; `resetForm` yalnız başarılı kayıtta (325); `resetScan` (343-348) formu temizlemiyor.
- **Sorun:** Yoğun kasada bir önceki müşterinin tutarı ve ürünü yeni müşterinin dialogunda hazır gelir; dikkatsiz bir "Kaydet" yanlış tutarla kayıt ve puan üretir.
- **Öneri:** Form state'ini `scannedCard.id`'ye bağlı tek bir reducer'da tutun; kart değiştiğinde veya dialog kapandığında sıfırlansın. Dialog açılışında başlık altında "Müşteri: Ad S." etiketi ile bağlamı güçlendirin.

### 7. Müşteri e-postası kasa ekranında açık; kartı gören her bayi müşteri PII'sine erişiyor
- **Önem:** orta · **Kategori:** gizlilik · **Efor:** S
- **Kanıt:** app/api/dealer/cards/scan/[token]/route.ts:35-43 (`email: true`), page.tsx:540.
- **Sorun:** `PhysicalCard` platform genelinde geçerli (bayiye bağlı değil, prisma `PhysicalCard` modelinde `dealerId` yok); token'ı bilen herhangi bir bayi, müşteriyle hiç ilişkisi olmasa bile ad, e-posta, puan ve seviye görür. Kasa ekranında tam e-posta omuz üstü okunabilir. Manuel token alanı, fiziksel olarak orada olmayan bir müşteri için de kayıt açmaya izin veriyor. (Not: token 21 karakter / 55'li alfabe, lib/utils.ts:195-206; tahmin edilerek numaralandırılamaz.)
- **Öneri:** Tarama yanıtından e-postayı çıkarın ya da maskeleyin (`f***@g***.com`); kasiyerin müşteriyi tanıması için ad + avatar + "bu işletmede N. ziyaret" yeterli. Manuel token yolunu ayrı bir yetki/ayar arkasına alın veya müşterinin uygulamasında gösterilen kısa ömürlü (60 sn) dinamik koda geçin (bkz. eksikler).

### 8. Fiş OCR'ı TR binlik biçimini yanlış okuyor ve yerelleştirilmemiş
- **Önem:** orta · **Kategori:** hata / i18n · **Efor:** S
- **Kanıt:** components/ocr/receipt-amount-scanner.tsx:36-48 (yalnız nokta varsa doğrudan `parseFloat`), 99, 102, 136-141 (sabit Türkçe metinler).
- **Sorun:** "TOPLAM *1.250" → 1,25 TL. Tutar input'a ön-doldurulduğu ve kasiyer onaylayacağı için zarar sınırlı, ama güven kırıcı. EN arayüzde buton ve hata metinleri Türkçe.
- **Öneri:** Yalnız nokta içeren ve noktadan sonra tam 3 hane olan sayıları binlik ayırıcı say (`/^\d{1,3}(\.\d{3})+$/`). OCR sonucunu sessizce yazmak yerine "Okunan: 1.250,00 TL. Kullan?" onay çipi gösterin. Metinleri `useAppT` üzerinden `dealerScan.ocr*` anahtarlarına taşıyın.

### 9. Kayıt sonrası tam tekrar tarama ve zayıf geri bildirim
- **Önem:** düşük · **Kategori:** UX / veri gürültüsü · **Efor:** S
- **Kanıt:** page.tsx:323-328; page.tsx:263-265 (`setScannedCard(null)`), 284 (ikinci toast).
- **Sorun:** Başarılı kayıttan sonra kart bir anlığına kayboluyor, "X bulundu!" toast'ı tekrar çıkıyor ve denetim günlüğüne sahte bir `SCANNED` düşüyor. Asıl önemli bilgi (kazanılan puan, müşteriye yorum daveti gitti mi) gösterilmiyor.
- **Öneri:** POST yanıtına `{ consumption, pointsAwarded, multiplier, customerVisitCount }` ekleyin ve istemcide kartı yerinde güncelleyin (optimistic). Başarı anını tek, net bir onay katmanıyla gösterin (bkz. vizyon) ve "Yeni müşteri" ana eylemine dönün.

### 10. Ateşle-unut yan işler serverless'te kaybolabilir
- **Önem:** düşük · **Kategori:** güvenilirlik · **Efor:** S
- **Kanıt:** consumptions/route.ts:323-337; karşılaştırma app/api/feedbacks/route.ts:1, app/api/customer/consumptions/[id]/review/route.ts:1 (`after` kullanıyor).
- **Sorun:** Isı haritası kovası ve ziyaret görevi ilerlemesi yanıt döndükten sonra fonksiyon dondurulursa yazılmayabilir; müşteri görevi tamamlanmamış görür.
- **Öneri:** Proje desenine uyun: `after(async () => { … })`.

### 11. Bileşen mimarisi ve tip güvenliği
- **Önem:** düşük · **Kategori:** mimari · **Efor:** M
- **Kanıt:** page.tsx:50 (`recentConsumptions: any[]`), 75 (`useRef<any>`), 143, 225 (`err: any`); kullanılmayan importlar `History`, `X` (page.tsx:15, 18); `fetchCategories`/`fetchProducts` effect bağımlılığı dışında; unmount temizliği senkron `throw`'u yakalamıyor (page.tsx:102-104, html5-qrcode.js:227-228); `playBeep` her seferinde yeni `AudioContext` (page.tsx:143).
- **Sorun:** Tek dosyada kamera yaşam döngüsü, API, form ve sunum iç içe; kapanış hatalarının (#3, #4) kök nedeni bu.
- **Öneri:** `useQrScanner({ onDecode, facingMode })` kancası (ref tabanlı kilit, pause/resume, güvenli stop: `if (scanner.isScanning) await scanner.stop()`), `useCardLookup` (SWR mutation), `<ConsumptionComposer>` bileşeni ve `ScanResponse`/`ConsumptionDTO` tipleri (`lib/types` altında, API ile paylaşılan). Tek bir paylaşılan `AudioContext` ref'i.

### 12. Erişilebilirlik ve mobil boşlukları
- **Önem:** düşük · **Kategori:** a11y / mobil · **Efor:** S
- **Kanıt:** page.tsx:428-438 (yalnız `title`), 470-480 ve 590-592 (etiketsiz ikon butonlar), 461 ve 637-702 (`Label` `htmlFor`'suz), 498-614 (`aria-live` yok), 362 (tam ekran katmanda Esc/odak kapanı yok), dealer-dashboard-client.tsx:385-391 (mobilde gizli kısayol), 396-399 ve 450-454 (sonsuz döngüler).
- **Öneri:** İkon butonlara `aria-label`, `Label htmlFor` + `id`; sonuç bölgesine `role="status" aria-live="polite"`; kamera katmanını Radix Dialog/Sheet üzerinde kurun (odak kapanı + Esc bedavaya gelir); panoda mobilde "Kart tara" birincil eylem olsun; `useReducedMotion()` ile döngüleri tamamen kapatın.

---

## Eksik özellikler (kıyas: Square Loyalty, Toast Loyalty, Medallia/Qualtrics işlem tetikli anket, Google Business Profile)

1. **Personel modu (STAFF ile tarama):** Square/Toast'ta kasiyer kendi PIN'iyle işlem açar ve işlem çalışana atfedilir. Qratex'te ekip modülü ve `STAFF` rolü var ama tarama yalnızca DEALER. Tüketime `staffId` alanı eklenip hem ekip performansı hem fraud izi için kullanılmalı.
2. **Tanınma anında ödül/kupon kullanımı:** Square Loyalty müşteri tanındığı anda "kullanılabilir ödül" gösterir ve tek dokunuşla düşer. Burada puan ve seviye yalnızca rozet olarak duruyor.
3. **Tek dokunuşla hazır ürünler ve son kullanılanlar:** `QuickScanPreset` API'si hazır, kullanılmıyor. Toast/Square POS'un ızgara düzenli "favori ürün" tuşlarına karşılık gelir.
4. **Geri alma / düzeltme penceresi:** Square'de iade, Toast'ta void. Kayıttan sonra 2–5 dk içinde "Geri al" (puanı da ters kayıtla düşen) olmalı.
5. **Çevrimdışı kuyruk:** `offline-sync` API'si hazır; bağlantı koptuğunda kayıt IndexedDB'de bekleyip senkronlanmalı (PWA zaten açık).
6. **Dinamik (dönen) müşteri kodu:** Statik token yerine müşteri uygulamasında 30–60 sn geçerli imzalı kod; ekran görüntüsüyle uzaktan kayıt ve puan sahtekârlığını keser.
7. **İşlem tetikli geri bildirim kontrolü:** Medallia/Qualtrics işlemden sonra anketi zamanlar. Burada bildirim hemen gidiyor; bayi "30 dk sonra yorum daveti gönder" gecikmesini ve kanalı (push/e-posta) seçemiyor, davetin durumu da görünmüyor.
8. **Vardiya / gün özeti:** Bugünkü tarama sayısı, toplam tutar, yorum daveti dönüşümü; kasiyerin son 10 işlemi aynı ekranda.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Kasa modu". Tablet ya da telefonda tek elle, 3 saniyede: tara → müşteriyi tanı → tek dokunuşla ürünü seç → onayla → sıradaki. Pano sayfası değil, POS benzeri bir araç.

**Yerleşim**
- **Mobil/tablet dikey:** Üstte sürekli açık, ekranın %55'i kadar kamera alanı (gerçek qrbox köşe işaretleriyle hizalı vizör, fener/zoom düğmesi, kamera seçici). Altta yükselen bir "müşteri çekmecesi" (bottom sheet): tarama başarılı olunca kamera donar (`pause`), çekmece yukarı kayar; ad, avatar, "bu işletmede 7. ziyaret · son: 3 gün önce", kullanılabilir ödül rozeti, maskeli iletişim. Çekmecenin altında hazır ürün ızgarası (QuickScanPreset + son kullanılanlar), aranabilir ürün komut kutusu, tutar (sayısal klavye, OCR çipi), tek büyük "Kaydet" butonu. Kayıttan sonra çekmece kapanır, kamera kendiliğinden devam eder.
- **Masaüstü/yatay tablet:** Sol sütun kamera + manuel kod, orta sütun müşteri ve kayıt oluşturucu, sağ sütun "bugün" akışı (son işlemler, geri al düğmesi, gün toplamları). Hero kaldırılır, yerine ince bir araç çubuğu (vardiyadaki personel, çevrimdışı kuyruk sayacı, ses/titreşim tercihi) gelir.
- **Kamera izni yoksa:** Vizör yerine "Kod yaz veya müşteriden 6 haneli kodu iste" alanı birincil olur; sayfa kamerasız da tam işlevli kalır.

**Motion (ölçülü):** 3B gerek yok; burada hız ve netlik önemli. Önerilenler: tarama anında vizör köşelerinin 150 ms içinde merkeze "kilitlenmesi" + `navigator.vibrate(30)` + tek bip; başarı onayında puan rozetinin kısa bir sayaç animasyonu ("+12 puan", 400 ms); çekmece için yay (spring) geçişi. Tüm sonsuz döngüler (`opacity` nabız) kaldırılsın veya `useReducedMotion` ile kapatılsın; azaltılmış harekette yalnızca anlık durum değişimi kalsın.

**Veri/API değişiklikleri**
- `GET /api/dealer/cards/scan/[token]` → yanıt: `{ customer: { displayName, avatar, maskedContact }, visit: { countHere, lastAt }, rewards: [...], reviewPending: n }`; e-posta çıkarılsın; `requireAuth(['DEALER','STAFF'])` + STAFF için bağlı bayi kimliğinin çözümlenmesi (`resolveDealerId(session)`); bayi+IP başına okuma hız sınırı; `SCANNED` kaydı aynı kart+bayi için 60 sn içinde tekilleştirilsin; `getClientIp`.
- `POST /api/dealer/consumptions` → tek transaction, `points_credited`, `Idempotency-Key`, `amount` üst sınırı, `staffId`, `after()` yan işleri; yanıt `pointsAwarded` ve güncel müşteri özeti dönsün.
- Yeni `DELETE /api/dealer/consumptions/[id]` (yalnız oluşturandan ve N dakika içinde; puanı ters kayıtla düşer, denetim kaydı yazar).
- `GET /api/dealer/categories` → `_count` yalnız `{ isActive: true, OR: [{ dealerId: null }, { dealerId }] }` ürünleri saysın.
- next.config.js / proxy.ts → `/dealer/scan` ve `/customer/scan` için `camera=(self)`.
- İstemci: SWR ile kategori+ürün tek seferlik önbellek; `useQrScanner` kancası; çevrimdışıyken `offline-sync` kuyruğu.

---

## Çakışmalar / birleştirme önerisi

- **/dealer/consumptions:** Bu sayfanın ürettiği kayıtların listesi. Ayrı kalmalı (geçmiş/denetim görünümü), ancak "bugün" akışının kısa bir kopyası ve geri alma eylemi kasa moduna gömülmeli; /dealer/consumptions satırlarından "bu müşteriyi tekrar kaydet" kısayolu bu sayfaya derin bağlantı versin.
- **/dealer/products:** Kasa modundaki hazır ürün ızgarası ve QuickScanPreset yönetimi için ayar kaynağı; preset düzenleme ürünler sayfasına eklenmeli, kasa ekranında yalnızca kullanım olmalı.
- **/customer/scan:** Ad benzer ama amaç farklı (müşteri işletme QR'ını tarar). Birleştirilmemeli; ancak aynı `useQrScanner` kancasını paylaşmalı ve aynı Permissions-Policy düzeltmesinden etkilenir.
- **/staff (field):** Personel paneli şu an tarama içermiyor. Kasa modu STAFF'a açıldığında /staff panosuna giriş noktası olarak eklenmeli; ayrı bir personel tarama sayfası yazılmamalı.
- **Karar:** Sayfa kaldırılmamalı, birleştirilmemeli; "Kasa modu" olarak yeniden tasarlanmalı. Sistemdeki doğrulanmış geri bildirim hunisinin girişi olduğu için önceliği yüksek.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; canlı tarayıcı/DB testi yapılmadı. Satır numaraları 2026-10-08 çalışma ağacına göredir.

### 1. Permissions-Policy `camera=()` kamera taramasını engelliyor — **DOĞRULANDI**

- `next.config.js:324` `source: '/:path*'` + `next.config.js:339-340` → `camera=(), microphone=(), ...`; `proxy.ts:17` aynı başlığı `/dealer/:path*` için tekrar set ediyor (`proxy.ts:124` matcher). Projede `camera=(self)` veren başka bir yer yok (vercel.json/netlify.toml'da Permissions-Policy yok).
- Spesifikasyona göre boş allowlist `()` özelliği kendi origin dahil tüm belgeler için kapatır; Chromium tabanlı tarayıcılarda (Android Chrome, Edge, masaüstü Chrome) `getUserMedia` → `NotAllowedError` ile reddedilir ve izin istemi hiç açılmaz. `page.tsx:227-228` bu hatayı "izin reddedildi" mesajına çeviriyor; kullanıcı tarayıcı ayarlarından izin verse bile düzelmez — mesaj yanıltıcı.
- Yeniden üretim: Android Chrome ile bayi hesabıyla `/dealer/scan` → "Kamerayı aç" → izin istemi çıkmadan izin-reddedildi toast'ı. Aynı durum `/customer/scan` için de geçerli (aynı kütüphane, aynı başlık).
- Not: Başlığı uygulamayan tarayıcılarda (ör. Firefox'un Permissions-Policy başlığını desteklemediği bilinir) kamera açılabilir — bu tarayıcı bazlı ayrım canlıda doğrulanmadı. Manuel token girişi geri dönüş yolu olarak çalışır.
- Düzeltme yönü: genel kuralda `camera=()` kalsın, `/dealer/scan` ve `/customer/scan` (ve fiş OCR'ı kamera açıyorsa onun sayfası) için hem `next.config.js` headers'ında daha özel bir `source` girdisi hem `proxy.ts` `addSecurityHeaders` içinde yol bazlı `camera=(self)` verilmeli; iki kaynak birbirini ezdiği için ikisi birlikte değiştirilmeli ve bir e2e testi (`page.evaluate(() => document.permissionsPolicy?.allowsFeature('camera'))` veya yanıt başlığı kontrolü) ile korunmalı.

### 2. Tüketim POST'u `points_credited` yazmadan ve transaction dışında puan basıyor — **DOĞRULANDI**

- `app/api/dealer/consumptions/route.ts:240` consumption.create, `:268` cardAuditLog.create, `:284` notification.create, `:335-350` puan artışı — dört ayrı çağrı, ortak transaction yok. Dosyada `points_credited` geçmiyor; `lib/points-velocity.ts:14-19` ve `lib/points-caps.ts` yalnız bu olaya baktığından bu yol hız/tavan dedektörlerine görünmez (proje değişmezi #3 ihlali).
- Miktar: `amount ≥ 100` ise `baseXP` tavanı 1000 (`:304-306`) → pasif puan 50 × happy-hour çarpanı × sezon çarpanı. Hız sınırı kart+bayi başına 5/dk (`:22-23`, `:191`) → çarpansız tek kartla saatte ~300 kayıt ≈ 15.000 puan.
- Saldırgan modeli gerçekçi: `lib/validations.ts:39` kayıtta `role: 'DEALER'` seçilebiliyor (`app/api/auth/register/route.ts:40,62`), tek engel e-posta doğrulaması (`lib/auth.ts:165`). Kart sahibi kendi kart token'ını bilir. Yeniden üretim: aynı kişi bir CUSTOMER (aktif kart) + bir DEALER hesabı açar, `POST /api/dealer/consumptions {cardToken, amount: 100}` isteğini her 12 sn'de bir atar → saatte ~15.000 puan, `isSuspiciousPoints` false döner, liderlik tablosunda bayrak çıkmaz.
- `amount` üst sınırsız (`lib/validations.ts:274`): puan tavanlı olduğu için puan etkisi yok, ama `amount` ham haliyle Consumption'a, audit log'a ve `recordHeatmapHit`'e (`:357`) gidiyor → gelir/ısı haritası analitiği kirlenebilir (doğrulandı, etki analitikle sınırlı).
- Kısmi hata: consumption.create başarılı olup notification/puan adımı patlarsa 500 döner (`:383`), istemci `page.tsx:318-319` hata gösterir, bayi elle tekrar dener → ikinci Consumption kaydı. Otomatik tekrar deneme yok; senaryo makul ama nadir (hız sınırı yine geçerli).
- Düzeltme yönü: consumption + audit + notification + user/squad increment + `analyticsEvent.create({event:'points_credited', category:'consumption', data:{points, consumptionId}})` tek `prisma.$transaction` içinde; günlük tüketim-puanı tavanı `points-caps` deseniyle; `Idempotency-Key` başlığı (veya istemci tarafı UUID'si üzerinde unique) ile çift kayıt engeli; `amount` için makul üst sınır (ör. bayi bazlı yapılandırılabilir) ve aynı müşteri-bayi çiftinde yüksek frekansa admin uyarısı.

### 3. html5-qrcode geri çağrısı eski kapanışla çalışıyor, tekrar okuma engeli bozuk — **DOĞRULANDI** (şu an #1 nedeniyle Chromium'da tetiklenemez)

- `page.tsx:171-186` `onScanSuccess`, `lastScannedCode` state'ine bağımlı `useCallback`; ama `scanner.start(..., onScanSuccess, ...)` (`page.tsx:214-217`) callback'i yalnız başlatma anında bir kez verir. Kütüphane (html5-qrcode 2.3.8) her başarılı karede aynı fonksiyon referansını çağırır (`node_modules/html5-qrcode/esm/html5-qrcode.js:543`, `scanContext`) ve async callback'i beklemez; `foreverScan` `fps:10` ile setTimeout döngüsünde devam eder. Kapanıştaki `lastScannedCode` başlatma anındaki değerde (`null`) donar → `page.tsx:173` koşulu hiç tutmaz; `setLastScannedCode` yeni render'ı etkiler, eski kapanışı değil.
- Sonuç: QR kadrajda kaldıkça ~10/sn `GET /api/dealer/cards/scan/[token]` + bip. Başarılı yolda kamera ancak ilk fetch dönünce durur (`page.tsx:285`), bu arada uçuşta olan istek sayısı kadar `SCANNED` CardAuditLog yazılır (`app/api/dealer/cards/scan/[token]/route.ts:85-89`; bu uçta hız sınırı yok). Hata yolunda (`page.tsx:271-281`) `stopCamera` çağrılmadığı için geçersiz/bloklu/aktive edilmemiş kartta istek ve hata toast'ı kart kadrajdan çekilene kadar sürer (bu yolda audit log yazılmaz, yalnız istek + DB okuma fırtınası).
- Yeniden üretim (kamera düzeltildikten sonra veya başlığı uygulamayan tarayıcıda): `/dealer/scan` → kamerayı aç → BLOCKED bir kartın QR'ını 3 sn tut → ağ sekmesinde ~30 GET ve ~30 hata toast'ı; aktif kartta 2-5 adet SCANNED audit kaydı.
- Düzeltme yönü: tekrar-okuma kilidini state yerine `useRef` ile tut (`lastCodeRef`, `inFlightRef`), callback'te ilk iş `scanner.pause(true)` çağır ve işlem bitince başarıda `stop`, hatada kısa bekleme sonrası `resume`; bu mantık `useQrScanner` kancasına taşınıp `/customer/scan` ile paylaşılmalı. Sunucu tarafında scan GET'ine bayi başına hafif hız sınırı ve aynı kart+bayi için kısa pencere içinde SCANNED audit tekilleştirmesi eklenmeli.
