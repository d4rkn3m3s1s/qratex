# /customer/scan

**Amaç:** Giriş yapmış müşterinin uygulama içinden bir mekânın QR kodunu kamerayla okutması ya da altındaki 8 haneli kodu elle girmesi; kod doğrulanınca müşteri herkese açık geri bildirim sayfasına (`/feedback/[code]`) yönlendirilir. Puan, XP ve rozet döngüsünün **giriş kapısı** budur.

**Genel puan:** 5.4 / 10 · **Karar:** **Yeniden tasarla.** Temel akış çalışıyor ama kamera yaşam döngüsünde gerçek hatalar var. Daha önemlisi sayfa, ürünün en kritik anını (okutma) sıradan bir form gibi sunuyor.

Kapsam: `app/customer/scan/page.tsx` (265 satır), `app/customer/scan/layout.tsx`, `app/customer/layout.tsx`, `components/dashboard/page-heading.tsx`, `components/layout/dashboard-page-hero.tsx` → `components/admin/admin-premium-hero.tsx`, `lib/admin-toast.ts`, `lib/app-locale.ts`, `app/api/qr-codes/public/[code]/route.ts`, `lib/rate-limit.ts`, `lib/utils.ts#generateQRCode`, `app/(public)/feedback/[code]/page.tsx` (yönlendirmenin hedefi), `node_modules/html5-qrcode/esm/html5-qrcode.js` (2.3.8; davranışı kaynaktan doğrulamak için okundu), `prisma/schema.prisma` (`QRCode`, `AnalyticsEvent`), `messages/{tr,en}.json#customerScan`, `components/dashboard/sidebar.tsx`, `public/manifest.json`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Manuel giriş ve mutlu yoldaki kamera okuması çalışıyor. Ancak hata ayrımı yok, kamera başlatılırken bir yarış var, satır içi hata ölü kod ve Enter tuşuyla gönderilemiyor. |
| UX | 4.5/10 | En değerli an (okutma) küçük bir kart içinde, izin rehberi, ışık ve galeri seçeneği yok. Okuma sonrası geri bildirim (yükleme/haptik) yok, ödül bağlamı statik bir pazarlama metni. |
| Görsel | 5.5/10 | Tasarım dilinin hero kabı ve cam kart kullanılmış, tutarlı ama jenerik. Vizör çerçevesi, marka ve "an" hissi yok. |
| Mimari | 5/10 | Tarayıcı mantığı sayfaya gömülü ve `/dealer/scan` ile kopya. Doğrulama iki kez yapılıyor, `admin-toast` müşteri panelinde kullanılıyor, ölü kod var. |
| Performans | 7/10 | `html5-qrcode` yalnızca kamera açılınca dinamik yükleniyor (iyi). Ancak doğrulama için tam QR+bayi+personel verisi çekiliyor ve hedef sayfada aynı çağrı tekrarlanıyor. |
| Erişilebilirlik + mobil | 5/10 | Dokunma hedefleri ≥44px, `touch-manipulation` ve global `MotionConfig reducedMotion="user"` var. Input'un label'ı yok, başlık sırası h1→h3 atlıyor, `aria-live` ve odak yönetimi yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota koruması (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:53`, `proxy.ts:124` | Sayfa client component, yetki proxy katmanında. |
| 2 | Segment metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/scan/layout.tsx:4-6` | `layoutMetadata.customerScan` TR/EN mevcut (`messages/tr.json:29-30`). |
| 3 | Masaüstü sayfa başlığı | ÇALIŞIYOR | `page.tsx:136-139`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex`. |
| 4 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:141-146` | Ayrı bir `<h1>` (sm:hidden). Masaüstü başlığı ile içerik tekrarı var ama aynı anda görünmüyorlar. |
| 5 | "Kamera ile tara" boşta kartı | ÇALIŞIYOR | `page.tsx:174-188` | Statik ikon, başlık, açıklama. |
| 6 | "Kamerayı Aç" butonu | ÇALIŞIYOR | `page.tsx:183`, `page.tsx:80-87` | `cameraOpen` toggle. |
| 7 | Kamera başlatma (dinamik import + arka kamera) | KISMİ | `page.tsx:89-123` | 100 ms `setTimeout` hack'i var. `start()` beklenirken kapatılırsa kamera akışı sızıyor (B-2). |
| 8 | Okunan metinden kod çıkarma | KISMİ | `page.tsx:23-29` | `/feedback/CODE` deseni doğru. Fallback `t.slice(-8)` alakasız QR'ları da kod sanıyor (B-6). |
| 9 | Okunan kodu doğrulayıp yönlendirme | KISMİ | `page.tsx:106-112`, `page.tsx:31-39` | Yükleme durumu ve `catch` yok, ağ hatası sessizce yutuluyor (B-4). |
| 10 | Kamerayı kapat (X ikon) | KISMİ | `page.tsx:160`, `page.tsx:68-78` | `start()` sürerken `isScanning=false` olduğu için akışı durdurmuyor (B-2). |
| 11 | Kamerayı kapat (alt buton) | KISMİ | `page.tsx:170` | 10 ile aynı sorun. |
| 12 | Kamera hatası satır içi mesajı | BOZUK | `page.tsx:119-121` + `page.tsx:76-77` + `page.tsx:167` | `setCameraError(msg)` sonrası `stopCamera()` hatayı `null` yapıp kamera panelini kapatıyor. Mesaj hiç görünmüyor (B-5). |
| 13 | Kamera hatası toast'ı | KISMİ | `page.tsx:118-120` | Ham teknik mesaj veya jenerik metin gösteriliyor. İzin reddi için rehber yok, "Dikkat:" öneki sabit Türkçe. |
| 14 | Okuma vizörü (qrbox 220×220, 6 fps) | ÇALIŞIYOR | `page.tsx:102`, `page.tsx:164-166` | Kütüphanenin varsayılan gölgeli bölgesi, markalı çerçeve yok. |
| 15 | Bileşen unmount'unda kamera temizliği | BOZUK | `page.tsx:124-131` | `stop()` beklenmeden `clear()` çağrılıyor ve kütüphane bunu fırlatıyor (B-1). |
| 16 | "veya" ayırıcı | ÇALIŞIYOR | `page.tsx:193-200` | `bg-background` kabuğun zemini ile uyumsuz olabilir (doğrulanmadı). |
| 17 | Manuel kod alanı (büyük harf, 8 karakter) | KISMİ | `page.tsx:220-229` | Kod formatı ile uyumlu (`lib/utils.ts:170-185`: 8 karakter A-Z0-9). URL yapıştırılınca `maxLength` keser (B-8). Görünür veya aria label yok. |
| 18 | Manuel gönder butonu + spinner | ÇALIŞIYOR | `page.tsx:230-232`, `page.tsx:51-66` | |
| 19 | Enter / klavye "Git" ile gönderme | EKSİK | `page.tsx:218-233` | `<form>` yok, `onKeyDown` yok. |
| 20 | Boş kod doğrulaması | ÇALIŞIYOR | `page.tsx:52-55` | Toast ile. |
| 21 | Hata ayrımı (bulunamadı / süresi dolmuş / iptal / pasif / hız limiti / sunucu) | BOZUK | `page.tsx:31-39`, `page.tsx:60`; API `route.ts:17-29, 72-89` | API ayrı mesajlar dönüyor, sayfa hepsine "QR kod bulunamadı" diyor (B-3). |
| 22 | "Puan kazan" bilgi kartı | KISMİ | `page.tsx:239-257`, `messages/tr.json` `customerScan.earnPointsDesc` | Statik metin. Kullanıcının puanı, serisi ve beklenen ödülü yok. |
| 23 | Giriş animasyonları (stagger) | ÇALIŞIYOR | `page.tsx:150-153, 203-207, 239-243` | `m as Motion`, global `reducedMotion="user"` (`components/providers.tsx:232`). |
| 24 | Tarama analitiği (`qr_scanned`) | KISMİ | `app/api/qr-codes/public/[code]/route.ts:98-110` | Uygulama içi taramada iki kez yazılıyor, `userId` boş, kaynak (in-app / native) ayrımı yok, okuyan kod yok (B-7). |
| 25 | Tarama hız limiti (60/dk/IP) | ÇALIŞIYOR | `route.ts:15-29`, `lib/rate-limit.ts:168, 275-277` | Uygulama içi akışta tarama başına 2 hak tüketiliyor. |
| 26 | i18n (TR/EN) | KISMİ | `messages/tr.json:3113-3131`, `messages/en.json:3113-3131` | Anahtarlar tam. `lib/admin-toast.ts` "Dikkat: " önekini dilden bağımsız ekliyor (B-9). |
| 27 | PWA kısayolu "QR Tara" | ÇALIŞIYOR | `public/manifest.json:70-75` | Kısayol metni yalnızca Türkçe. |
| 28 | Kenar çubuğunda giriş noktası | EKSİK | `components/dashboard/sidebar.tsx:279-315` | Müşteri menüsünde scan yok. Yalnızca dashboard CTA'sı, boş durumlar ve PWA kısayolu var (B-10). |
| 29 | Ön/arka kamera değiştirme | EKSİK | `page.tsx:101` (sabit `environment`) | `/dealer/scan` bunu destekliyor (`app/dealer/scan/page.tsx:84`). |
| 30 | El feneri (torch) | EKSİK | — | Loş restoran/bar ortamı için kritik. |
| 31 | Galeriden QR görseli okuma | EKSİK | — | `html5-qrcode` `scanFile` destekliyor (`html5-qrcode.js` `scanFile`). |
| 32 | Okuma anında haptik/ses/görsel onay | EKSİK | `page.tsx:103-112` | Kamera kapanıyor ve doğrulama sırasında ekran boşta kart durumuna dönüyor. |
| 33 | Kamera izni ön açıklaması ve reddedilince rehber | EKSİK | `page.tsx:116-122` | |
| 34 | Son okutulan mekânlar / tarama geçmişi | EKSİK | — | |
| 35 | Deep link (`?code=`) ile ön doldurma | EKSİK | — | |
| 36 | Çevrimdışı durumu | EKSİK | `page.tsx:31-33` | Çevrimdışıyken manuel yolda jenerik "Dikkat: Hata", kamera yolunda hiçbir şey görünmüyor. |
| 37 | Ölü kod (`scannerRef`, `QrCode` import) | — (ölü kod) | `page.tsx:48`, `page.tsx:164`, `page.tsx:7` | `scannerRef` hiç okunmuyor, `QrCode` ikonu kullanılmıyor. |

**Durum dağılımı:** ÇALIŞIYOR 13 · KISMİ 10 · BOZUK 3 · SAHTE 0 · EKSİK 10 (#37 ölü kod olarak ayrı tutuldu).

---

## Bulgular (önem sırasıyla)

### B-1 · Yüksek · Hata/Kararlılık · Kamera açıkken sayfadan ayrılınca effect cleanup'ı istisna fırlatıyor
- **Kanıt:** `app/customer/scan/page.tsx:126-129`:
  ```ts
  if (html5QrRef.current?.isScanning) {
    html5QrRef.current.stop().catch(() => {});
    html5QrRef.current.clear();   // stop() beklenmeden
  ```
  `node_modules/html5-qrcode/esm/html5-qrcode.js:225-262` içinde `stop()` yalnızca geçişi başlatıyor. Durum `renderedCamera.close()` çözülünce `NOT_STARTED` oluyor. `clearElement()` (`:704-707`) ise `stateManagerProxy.isScanning()` true iken `throw "Cannot clear while scan is ongoing, close it first."` yapıyor.
- **Sorun:** `stopCamera()` ve okuma başarılı yolu ref'i önceden `null` yaptığı için güvenli. Kalan yol, kamera açıkken **unmount**: kullanıcı menüden başka sayfaya geçiyor, geri tuşuna basıyor ya da PWA'da sekme değiştiriyor. Bu durumda cleanup senkron bir string fırlatıyor. React bunu commit fazı hatası olarak üst error boundary'ye (`app/customer/error.tsx`) iletir. Kullanıcının yeni sayfada hata ekranı görmesi olasıdır (React/Next boundary davranışı tarayıcıda yeniden üretilmedi, kütüphane davranışı kaynaktan doğrulandı).
- **Öneri:** Tarayıcı yaşam döngüsünü sayfadan çıkarıp `useQrScanner()` hook'una ya da `<QrScanner>` bileşenine taşıyın. Tek bir `teardown()` fonksiyonu olmalı: `await stop()` → `clear()` → ref `null`, hepsi try/catch içinde ve idempotent. Cleanup bu promise'i fire-and-forget çağırmalı, asla senkron `clear()` çağırmamalı. Aynı bileşen `/dealer/scan` için de kullanılabilir.
- **Efor:** S

### B-2 · Yüksek · Hata/Gizlilik · Kamera başlatılırken kapatılırsa kamera akışı açık kalıyor (sızıntı)
- **Kanıt:** `page.tsx:92-100` (`mounted` yalnızca `start()` öncesinde kontrol ediliyor), `page.tsx:69` ve `page.tsx:126` (`isScanning` bayrağı), `html5-qrcode.js:161-164` (`isScanning = true` yalnızca `onRenderSurfaceReady` içinde set ediliyor).
- **Sorun:** İlk kullanımda `start()` izin diyaloğunda bekliyor. Bu sırada kullanıcı X'e basarsa veya sayfadan ayrılırsa `isScanning` henüz `false` olduğu için `stop()` çağrılmıyor ve ref `null` yapılmıyor. Kullanıcı izni verince `start()` çözülüyor ve video akışı DOM'dan kopmuş bir elemente render ediliyor. Kamera ışığı açık kalıyor ve okuma callback'i arka planda çalışmaya devam ediyor, hatta `router.push` tetikleyebilir. Kullanıcı kamerayı yeniden açarsa ikinci bir `Html5Qrcode` örneği oluşuyor. Sonuç gizlilik algısı açısından da kötü (kod okumayla tespit edildi, cihazda yeniden üretilmedi).
- **Öneri:** `start()` çözüldükten sonra `if (!mounted || cancelledRef.current) await qr.stop()` kontrolü ekleyin. "Başlatılıyor" durumu için ayrı bir state machine kurun (`idle → requesting → scanning → validating → done/error`). Kapat butonu `requesting` durumunda bir iptal bayrağı set etmeli. AbortController benzeri bir iptal belirteci hook içinde tutulmalı.
- **Efor:** S

### B-3 · Yüksek · UX/Doğruluk · Bütün hatalar "QR kod bulunamadı" olarak gösteriliyor
- **Kanıt:** `page.tsx:31-39` (`res.ok` değilse yalnızca `false` dönüyor), `page.tsx:60` ve `page.tsx:110`. API ise ayrı durumlar dönüyor: `app/api/qr-codes/public/[code]/route.ts:17-29` (429 + `Retry-After`), `:78-89` (pasif / süresi dolmuş / iptal edilmiş, her biri ayrı mesaj), `:117-121` (500).
- **Sorun:** Hız limitine takılan, süresi dolmuş bir masa QR'ını okutan ya da sunucu hatası alan kullanıcıya "bulunamadı" deniyor. Kullanıcı kodu yanlış girdiğini sanıp tekrar deniyor ve 429 durumu daha da kötüleşiyor. Ayrıca `res.json()` (`:33`) JSON olmayan bir 502/504 cevabında fırlatıyor. Manuel yolda bu "Dikkat: Hata" olarak görünüyor, kamera yolunda hiç görünmüyor (B-4).
- **Öneri:** API'ye makine-okur bir `reason` alanı ekleyin (`NOT_FOUND | INACTIVE | EXPIRED | REVOKED | RATE_LIMITED`). İstemci bunu i18n anahtarlarına eşlesin. 429 için `Retry-After` ile geri sayımlı bir "biraz bekle" durumu gösterilmeli. Süresi dolmuş veya iptal edilmiş kodda "Bu masa kodu yenilenmiş, garsondan güncel kodu isteyin" gibi eyleme dönük bir mesaj verilmeli. API metinleri şu anda yalnızca Türkçe; istemci tarafında çevrilmeli.
- **Efor:** S

### B-4 · Orta · Hata yönetimi/UX · Kamera okumasından sonra yükleme durumu ve hata yakalama yok
- **Kanıt:** `page.tsx:106-112`: `setCameraOpen(false)` sonrasında `validateAndGo(...).then(...)` çağrılıyor, `catch` yok, `setLoading` yok.
- **Sorun:** Okuma anında kamera kapanıyor ve ekran ağ isteği sürerken "Kamerayı Aç" boşta durumuna dönüyor. Kullanıcı başarılı mı başarısız mı bilmiyor ve tekrar basabiliyor. Çevrimdışıyken veya JSON olmayan bir cevapta `fetch`/`res.json()` reddediyor. Bu yakalanmamış bir promise rejection'a yol açıyor ve kullanıcıya hiçbir mesaj gösterilmiyor.
- **Öneri:** Okuma anında vizörü dondurun (son kare + yeşil çerçeve + haptik `navigator.vibrate(30)`) ve "Mekân doğrulanıyor..." durumu gösterin. Doğrulamayı tek bir `resolveCode()` fonksiyonunda toplayın; bu fonksiyon başarı/hata sonucunu (`{ ok, reason }`) döndürsün ve iki giriş yolu da onu kullansın.
- **Efor:** S

### B-5 · Orta · Hata · Kamera hatası satır içi mesajı ölü kod; izin reddi rehbersiz
- **Kanıt:** `page.tsx:119` `setCameraError(msg)` → `:121` `stopCamera()` → `:76-77` `setCameraOpen(false); setCameraError(null)`. Mesaj zaten yalnızca `cameraOpen` dalında render ediliyor (`:167`).
- **Sorun:** Satır içi hata hiç görünmüyor. Kullanıcı yalnızca kaybolan bir toast görüyor. `html5-qrcode` çoğu hatada `Error` değil string ile reddettiği için (`html5-qrcode.js:153` `reject("videoConstraints ...")`) `msg` çoğunlukla jenerik metne düşüyor. İzin reddi, kamerası olmayan cihaz ve HTTPS olmayan ortam ayrılmıyor.
- **Öneri:** Kalıcı bir "kamera erişimi yok" durum kartı ekleyin. Hata `NotAllowedError`, `NotFoundError` ve `NotReadableError` (başka uygulama kamerayı kullanıyor) olarak sınıflandırılmalı. Her biri için platforma özgü rehber gösterilmeli (iOS Safari → Ayarlar > Safari > Kamera, Android Chrome → site izinleri). Aynı kartta "Kodu elle gir" ve "Galeriden QR seç" alternatifleri öne çıkmalı. İzin istemeden önce tek ekranlık bir ön açıklama (neden kameraya ihtiyaç var) gösterilmeli.
- **Efor:** M

### B-6 · Orta · Doğruluk · Alakasız QR'lar "kod" sanılıp doğrulamaya gönderiliyor ve kamera kapanıyor
- **Kanıt:** `page.tsx:23-29`: fallback `return t.slice(-8)`. `page.tsx:105`: `if (!extracted) return;` boş olmayan her değeri kabul ediyor.
- **Sorun:** Menü linki, Wi-Fi QR'ı ya da Instagram QR'ı okutulursa son 8 karakter API'ye gidiyor, bir hız limiti hakkı harcanıyor, kamera kapanıyor ve "bulunamadı" deniyor. Mekânda masada birden çok QR olması çok yaygın; kullanıcı her seferinde kamerayı yeniden açmak zorunda kalıyor.
- **Öneri:** Yalnızca `/feedback/<8 karakter A-Z0-9>` (host isteğe bağlı) ya da çıplak `^[A-Z0-9]{8}$` kabul edilmeli. Eşleşmeyen QR'da kamera **açık kalmalı** ve vizör altında "Bu bir Qratex kodu değil" yazan 2 sn'lik bir ipucu gösterilmeli. Aynı değer için 2 sn debounce eklenmeli. Desen `lib/utils.ts#generateQRCode` ile tek bir `QR_CODE_PATTERN` sabitinden beslenmeli.
- **Efor:** S

### B-7 · Orta · Veri bütünlüğü/Performans · Uygulama içi taramada doğrulama iki kez yapılıyor; `qr_scanned` olayı çift ve anonim
- **Kanıt:** `page.tsx:32` → `/api/qr-codes/public/:code`, ardından `app/(public)/feedback/[code]/page.tsx:83` aynı uca tekrar istek atıyor. Her çağrı `analyticsEvent.create({ event: 'qr_scanned' })` yazıyor (`route.ts:98-110`, `userId` alanı yok; şemada `AnalyticsEvent.userId` mevcut, `prisma/schema.prisma:1028-1043`). Her çağrı `checkScanRateLimit` hakkı da tüketiyor (`route.ts:15`).
- **Sorun:** Uygulama içi her tarama iki `qr_scanned` satırı, iki rate-limit artışı ve iki Neon roundtrip üretiyor. Doğrulama için bayi ve **aktif personel isim/görsel listesi** de çekiliyor (`route.ts:46-63`), oysa sayfa bunlardan hiçbirini kullanmıyor. Şu an `qr_scanned` okuyan kod yok (repo genelinde grep sonucu tek yazım noktası). Huni analizi eklendiği gün tarama sayıları şişik çıkacak ve "giriş yapmış kullanıcının taraması" ile "native kamera taraması" ayrılamayacak.
- **Öneri:** Hafif bir `HEAD`/`GET ?validate=1` modu (yalnızca durum + `reason`, olay yazmadan) ya da doğrulamayı tamamen atlayıp `/feedback/[code]?src=in_app` ile doğrudan yönlendirme kullanılmalı (hedef sayfa zaten 404 ekranı gösteriyor). Olay yalnızca bir kez, `userId` (session varsa) ve `source: 'in_app_camera' | 'in_app_manual' | 'native'` ile yazılmalı.
- **Efor:** S

### B-8 · Orta · UX · Manuel alan URL yapıştırmayı kesiyor, Enter ile gönderilmiyor, label yok
- **Kanıt:** `page.tsx:225` `maxLength={8}`, `page.tsx:223` yapıştırılan değer büyük harfe çevrilip kesiliyor. `extractCodeFromDecoded` manuel yolda çağrılmıyor (`page.tsx:59`). `<form>`/`onKeyDown` yok (`page.tsx:218-233`). Input'ta yalnızca placeholder var.
- **Sorun:** Linki WhatsApp'tan kopyalayıp yapıştıran kullanıcıda alan "HTTPS://" ile doluyor ve "bulunamadı" hatası alınıyor. Mobil klavyedeki "Git" tuşu hiçbir şey yapmıyor. Ekran okuyucu alanın amacını duyurmuyor.
- **Öneri:** Alanı `<form onSubmit>` içine alın ve `enterKeyHint="go"` ekleyin. Yapıştırma (`onPaste`) sırasında `extractCode()` çalıştırılsın. 8 kutucuklu bir OTP tarzı segmentli giriş (`autocomplete="one-time-code"` yerine `inputMode="text"`, `pattern="[A-Z0-9]{8}"`) ve görünür label kullanılsın. 8. karakter girilince otomatik gönderilsin.
- **Efor:** S

### B-9 · Düşük · Dil karışıklığı · Müşteri panelinde admin toast'ı ve sabit Türkçe önek
- **Kanıt:** `page.tsx:20` `import { toast } from '@/lib/admin-toast'`, `lib/admin-toast.ts:19-21`: `'Dikkat: '` ve `'Basarili: '` (ş harfi eksik) dilden bağımsız ekleniyor. `public/manifest.json:71-73` kısayol metinleri yalnızca Türkçe.
- **Sorun:** İngilizce kullanıcı "Dikkat: QR code not found" görüyor. Müşteri tarafı bir admin yardımcısına bağımlı hale gelmiş.
- **Öneri:** Müşteri panelinde doğrudan `sonner` ya da yerelleştirilmiş bir `customerToast` kullanın. Önekleri ikon ve renkle ifade edin. Manifest kısayolları için `lang`'a göre üretilen bir manifest (route handler) kullanın.
- **Efor:** S

### B-10 · Orta · Bilgi mimarisi · Ürünün ana eylemi müşteri menüsünde yok
- **Kanıt:** `components/dashboard/sidebar.tsx:279-315` müşteri öğeleri arasında `/customer/scan` bulunmuyor. Giriş noktaları yalnızca `components/customer/dashboard/customer-dashboard.tsx:594, 808`, boş durumlar (`app/customer/feedbacks/page.tsx:512`, `app/customer/consumptions/page.tsx:241`, `app/customer/my-card/page.tsx:564`), onboarding (`components/onboarding/onboarding-sheet.tsx:37`) ve PWA kısayolu.
- **Sorun:** Puanın tek kaynağı olan geri bildirim döngüsünün kapısı, 30'a yakın menü öğesinin arasında bile yer almıyor. Mobilde kullanıcı önce dashboard'a dönmek zorunda kalıyor. Starbucks'ta "Scan", Revolut'ta "Pay" alt barın merkez düğmesidir.
- **Öneri:** Mobilde alt navigasyonun ortasına (mevcut sol-alt FAB menü tetikleyicisinin yanına, `sidebar.tsx:738-753`) sabit bir "Tara" FAB'ı konulmalı. Masaüstünde kenar çubuğunun en üstüne birincil buton eklenmeli. `lib/visibility-controls.ts:82` zaten `scan` anahtarını tanıyor; görünürlük kontrolü buradan beslenebilir.
- **Efor:** M

### B-11 · Düşük · Mimari · Tarayıcı kodu `/dealer/scan` ile kopya; ölü kod ve zamanlama hack'i
- **Kanıt:** `app/dealer/scan/page.tsx:191-215` ayrı bir `Html5Qrcode` yaşam döngüsü uyguluyor (kamera değiştirme dahil). `page.tsx:48`/`:164` `scannerRef` okunmuyor, `page.tsx:7` `QrCode` kullanılmıyor. `page.tsx:94` `setTimeout(100)` DOM'un oluşmasını beklemek için konmuş (effect commit sonrası çalıştığı için gereksiz).
- **Öneri:** `components/qr/qr-scanner.tsx` (UI) ve `hooks/use-qr-scanner.ts` (state machine, torch, kamera değiştirme, scanFile, teardown) çıkarılmalı. İki panel bunu paylaşmalı. Ölü kod silinmeli. Destekleyen tarayıcılarda (Chrome Android) yerel `BarcodeDetector` ilk tercih olmalı, `html5-qrcode` fallback olarak yüklenmeli (paket boyutu ve pil açısından kazanç).
- **Efor:** M

### B-12 · Düşük · Erişilebilirlik · Başlık sırası, durum duyurusu ve odak yönetimi
- **Kanıt:** `page.tsx:142` `<h1>` → `page.tsx:179` `<h3>` (h2 yok). Kamera açılıp kapanırken odak taşınmıyor; tetikleyici buton DOM'dan kalkınca odak kayboluyor (`page.tsx:156-188`). `aria-live` bölgesi yok.
- **Öneri:** Kamera paneli açılınca odak "Kapat" butonuna, kapanınca "Kamerayı Aç" butonuna dönmeli. Durum değişiklikleri ("Kamera açık, QR'ı çerçeveye hizalayın", "Mekân doğrulanıyor", hata) `role="status"` içinde duyurulmalı. Başlıklar h2 olmalı. Vizör için `aria-label` verilmeli. Esc ile kapatma desteklenmeli.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Tam ekran, markalı okutma deneyimi (Starbucks/Revolut).** Açılışta doğrudan kamera, köşeli vizör çerçevesi, torch, ön/arka kamera ve "galeriden seç". Okuma anında haptik + çerçevenin yeşile dönmesi + mekân logosuyla doğrulama kartı ("Kahve Durağı · Kadıköy — 50 puan seni bekliyor").
2. **Ödül bağlamı (Duolingo).** Statik "Puan kazan" kartı yerine kişisel veri: bu ziyaretle kazanılacak tahmini puan/XP, seri durumu ("3 günlük serini koru"), bir sonraki rozete kalan geri bildirim. Mevcut gamification uçları bu veriyi zaten sağlıyor (bağlantısı kurulmadı, doğrulanmadı).
3. **Son ziyaret edilen mekânlar / hızlı tekrar.** Kullanıcının son 3-5 geri bildirim verdiği mekânın kartları. Kod girmeden yeniden okutma için değil, "bu mekâna geri dön" ve "bekleme süresi" bilgisi için. Mekân başı gönderim sınırı (`checkFeedbackPerQrRateLimit`, `app/api/feedbacks/route.ts:220`) kullanıcıya önceden gösterilmeli.
4. **İzin akışı.** Kamera izni ön ekranı ve reddedilme durumunda platforma özgü kurtarma.
5. **Deep link / paylaşım.** `/customer/scan?code=XXXX` ile ön doldurma. Native kamerayla okutup giriş yapmış kullanıcının akışı ile uygulama içi akışın birleşmesi (`?src=in_app` atfı).
6. **Çevrimdışı ve zayıf ağ dayanıklılığı.** PWA kurulu olduğu için çevrimdışıyken kod sıraya alınabilir ("Bağlantı gelince göndereceğiz") ya da en azından net bir çevrimdışı durumu gösterilebilir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Masaya oturdum, telefonu çıkardım, 2 saniyede mekânı tanıdı ve beni ödülle karşıladı." Okutma, ürünün kalp atışıdır. Form değil, bir **an** gibi tasarlanmalı.

**Yerleşim (mobil öncelikli):**
1. **Vizör katmanı (ekranın %70'i):** Sayfa açılınca izin önceden verilmişse kamera otomatik başlar (`navigator.permissions.query({name:'camera'})`), verilmemişse tek dokunuşla başlatan bir ön kart gösterilir. Ortada köşeli ve yumuşak nefes alan bir çerçeve, altta "QR'ı çerçeveye hizala". Sağ üstte torch ve kamera değiştirme, sol altta "Galeriden seç".
2. **Alt sayfa (bottom sheet, sürüklenebilir):** Kapalıyken "Kodu elle gir" (8 segmentli giriş). Açıkken son mekânlar ve kişisel ödül şeridi (puan, seri, sıradaki rozet).
3. **Doğrulama anı:** Okumada kare donar, çerçeve yeşile döner, haptik verilir. Sheet yukarı kayar: mekân logosu + adı + "Bu ziyaret ≈ +N puan" + "Geri bildirime başla". Hata durumunda aynı kart `reason`'a göre eyleme dönük metin gösterir; kamera açık kalır.
4. **Masaüstü:** Kamera ikincil kalır (webcam). Manuel giriş ve "telefonunla okut" talimatı birincil olur. İki sütunlu yerleşim: solda giriş, sağda son mekânlar ve ödül özeti.

**Motion/3D (ölçülü):** three.js gereksiz; bu ekranda pil ve kamera önceliklidir. framer-motion ile yalnızca üç an yeterli: vizör çerçevesinde hafif nefes (reduced-motion'da statik), okuma onayında çerçeve rengi ve ölçek "snap"i (150 ms), doğrulama kartının yaylı (spring) girişi. Konfeti ve kutlama geri bildirim gönderildikten sonraya (`/feedback/[code]`) bırakılmalı; burada değil.

**Veri/API değişiklikleri:**
- `GET /api/qr-codes/public/[code]?mode=validate`: olay yazmaz, personel listesi döndürmez, `{ ok, reason, venue: { name, logo } }` döner. Redis'te kısa TTL'li (ör. 60 sn) negatif/pozitif önbellek kullanılabilir.
- `qr_scanned` olayı tek bir noktada, `userId` ve `source` ile yazılmalı (hedef sayfa açıldığında veya geri bildirim başladığında).
- Kişisel ödül şeridi için mevcut müşteri özet ucu yeniden kullanılmalı (yeni uç açmak yerine). "Bu ziyaret ≈ +N" değeri sunucudaki puan kuralından türetilmeli; istemcide sabit yazılmamalı (puan ekonomisi değişmezleri gereği yalnızca gösterim, kredi değil).
- Ortak `hooks/use-qr-scanner.ts` + `components/qr/qr-scanner.tsx` (müşteri ve bayi). Önce `BarcodeDetector`, fallback olarak dinamik `html5-qrcode`. Açık state machine: `idle | requesting | scanning | validating | error`.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/scan`:** Amaç farklı (bayi müşteri kartı/token okutuyor), ancak kamera ve tarayıcı altyapısı kopya (`app/dealer/scan/page.tsx:191-215`). Sayfalar birleştirilmemeli; **tarayıcı bileşeni ve hook'u paylaşılmalı**.
- **`/feedback/[code]` (public):** Bu sayfa scan'in tek hedefi ve doğrulamayı zaten kendisi yapıyor (`app/(public)/feedback/[code]/page.tsx:80-104`). Scan'deki ön doğrulama ya hafif moda indirilmeli ya da kaldırılmalı (B-7). Uzun vadede giriş yapmış müşteri için geri bildirim formu kabuk içinde (`/customer/...`) açılabilir; böylece kullanıcı panelden kopmaz. Şu an hedef sayfadan kabuğa yalnızca bir "Panele git" linki ile dönülüyor (`page.tsx:269`).
- **`/customer/my-card`:** Kendi QR kartını gösterir ve buraya link verir (`app/customer/my-card/page.tsx:564`). Amaç çakışması yok, ama "okut / okutul" iki yönlü eylem tek bir "QR" merkezi altında (sekmeli: "Mekânı okut" / "Kartımı göster") toplanabilir. Starbucks'taki "Scan" ekranı tam olarak bunu yapar. **Öneri:** `/customer/scan` korunup yeniden tasarlansın ve kartı gösterme sekmesini de barındırsın; `my-card` istatistik/paylaşım sayfası olarak kalsın.
- Sayfa **kaldırılmamalı**. Native kamera ile okutma yolu var, ancak uygulama içi giriş, PWA kısayolu ve elle kod girişi için tek giriş noktası bu sayfa.

---

## Doğrulama (şüpheci inceleme)

İnceleme yalnızca kod okumayla yapıldı. Tarayıcıda veya cihazda yeniden üretilmedi. Okunan kaynaklar: `app/customer/scan/page.tsx`, `app/customer/scan/layout.tsx`, `app/customer/layout.tsx`, `app/customer/error.tsx`, `app/error.tsx`, `next.config.js`, `node_modules/html5-qrcode` 2.3.8 (`esm/html5-qrcode.js`, `esm/state-manager.js`, `esm/camera/core-impl.js`), `node_modules/next` 16.1.6 (`dist/client/components/layout-router.js`, `error-boundary.js`, `bfcache.js`).

### B-1 · Kamera açıkken sayfadan ayrılınca cleanup istisnası → **DOĞRULANDI** (etki raporda yazılandan daha geniş)

- Cleanup, `page.tsx:126-129` aralığında `stop()` çağrısını beklemeden aynı tick içinde `clear()` çağırıyor.
- `stop()` (`html5-qrcode.js:225-262`) durumu yalnızca transaction olarak başlatıyor. `NOT_STARTED` geçişi (`toStoppedStateTransaction.execute()`, `:256`) `renderedCamera.close().then(...)` içinde, yani en erken bir microtask sonra oluyor. `close()` (`core-impl.js:250-268`) track'leri Promise executor'ında senkron durduruyor, ama `.then` callback'i yine asenkron çalışıyor.
- `clear()` → `clearElement()` (`html5-qrcode.js:704-707`) `stateManagerProxy.isScanning()` kontrolü yapıyor. Bu kontrol `state !== NOT_STARTED` demek (`state-manager.js`). Durum hâlâ `SCANNING` olduğu için `"Cannot clear while scan is ongoing, close it first."` string'i senkron fırlatılıyor.
- Koşul gerçekçi: `isScanning` alanı (`html5-qrcode.js:163`) video `playing` olayıyla `true` oluyor. Kullanıcı kamera görüntüsünü gördükten sonra kenar çubuğundan başka bir sayfaya geçtiğinde veya geri tuşuna bastığında tetikleniyor.
- **Etki düzeltmesi:** `next.config.js` içinde `cacheComponents` yok. Bu yüzden `bfcache.js:13` → `MAX_BF_CACHE_ENTRIES = 1` ve önceki segment gizli `Activity` içinde tutulmuyor, silinir. `layout-router.js:451-492` her alt segmenti `stateKey` ile key'li bir ağaç olarak, kendi `ErrorBoundary`'siyle birlikte render ediyor. `/customer/scan` → `/customer/dashboard` geçişinde silinen ağaç `scan` segmentidir ve `app/customer/error.tsx` sınırı da onunla birlikte siliniyor. React 19, silinen ağaçtaki passive cleanup hatasını `nearestMountedAncestor`'dan yukarı doğru arar. Buna göre hatayı yakalayacak ilk sınır kök seviyesindeki `app/error.tsx` olmalı (`customer` segmentini saran sınır). Kullanıcı, müşteri kabuğunun (sidebar dahil) yerine tam ekran genel hata sayfası görür. `/feedback/...` gibi kabuk dışı bir hedefe gidişte hata `global-error`'a kadar çıkabilir. Pathname'e göre sıfırlama (`error-boundary.js:75`) bunu engellemiyor: `previousPathname` aynı render'da güncellendiği için, commit sonrası gelen hata güncellemesi yeni pathname ile tutarlı kalıyor. Bu sınır zinciri React iç davranışından çıkarıldı, çalıştırılarak doğrulanmadı.
- Kamera ışığı sönüyor, çünkü track'ler `stop()` içinde senkron durduruluyor. Asıl zarar gezinmenin hata ekranına düşmesi ve her seferinde Sentry'ye bir olay gitmesi (`app/error.tsx` içindeki `Sentry.captureException`).
- **Ek varyant:** Okuma başarılı olduktan sonra (`page.tsx:106-107`) ref, `stop()` çözülene kadar dolu kalıyor. Bu pencerede sayfa terk edilirse cleanup ikinci kez `stop()` çağırır. `failIfTransitionOngoing` (`state-manager.js`) da senkron string fırlatır. Pencere dar ama aynı sonuca götürüyor.
- **Yeniden üretim:** /customer/scan → "Kamerayı aç" → görüntü gelince kenar çubuğundan "Panel"e tıkla → genel hata ekranı (beklenen).

### B-2 · Kamera başlatılırken kapatma/ayrılma ile akış sızıntısı → **DOĞRULANDI**

- `html5QrRef.current` (`page.tsx:99`) `start()` öncesinde atanıyor. `isScanning` ise yalnızca `onRenderSurfaceReady` içinde (`html5-qrcode.js:161-164`), yani video `playing` olduğunda `true` oluyor. Arada `getUserMedia` izni, donanımın ısınması ve ilk kare süresi var. İzin önceden verilmiş olsa bile bu pencere yüzlerce ms ile birkaç saniye sürebiliyor.
- Bu pencerede X'e veya "Kamerayı kapat"a basılırsa `stopCamera` (`page.tsx:69`) `isScanning=false` gördüğü için hiçbir şey yapmıyor. `setCameraOpen(false)` effect cleanup'ını tetikliyor, o da (`page.tsx:126`) aynı nedenle atlıyor. `mounted=false` yalnızca `catch` dalını susturuyor (`page.tsx:117`). Başarılı `start()` sonrasında kontrol edilmiyor.
- İzin/akış geldiğinde `start()` `this.element` olarak yakaladığı ve artık DOM'dan kopmuş `div`e video ekliyor (`html5-qrcode.js:139-144`, `core-impl.js`). Track'ler `stop()` çağrılmadıkça canlı kalıyor ve kamera göstergesi yanık kalıyor. `foreverScan` döngüsü `setTimeout` zinciriyle nesneyi canlı tutuyor. Kopuk video Chrome'da oynatılabildiği için okuma da devam edebilir. Kadraja bir QR girerse success callback'i `router.push('/feedback/...')` ile kullanıcıyı habersiz yönlendirir (`page.tsx:103-111`). Bu ikincil etki, kadrajda QR olmasını gerektiriyor.
- Kamera yeniden açılırsa `page.tsx:98-99` yeni bir örnek oluşturup ref'i ezer. Eski örneği durdurmanın artık hiçbir yolu kalmaz ve iki eşzamanlı `getUserMedia` akışı oluşur. Bazı Android cihazlarda bu `NotReadableError` ile ikinci açılışı da bozabilir (cihazda doğrulanmadı).
- Masaüstü Chrome'da izin balonu modal değil, yani izin beklerken X'e tıklanabiliyor. Mobilde izin önceden verilmişse ısınma penceresi yeterli.
- **Yeniden üretim:** Kamera izni verilmiş bir cihazda "Kamerayı aç"a bas, görüntü gelmeden (≈0,5 sn içinde) "Kamerayı kapat"a bas. UI kapalı görünür ama kamera göstergesi yanık kalır. Sayfa yeniden yüklenene veya sekme kapatılana kadar sönmez.
- **Düzeltme yönü (ikisi için ortak):** Örnek ömrünü tek bir sahibe bağla. Örneğin bir `use-qr-scanner` hook'u, açık bir state machine (`idle | starting | scanning | stopping`) ve `startPromise` saklamalı. Kapatma/unmount `starting` durumundaysa `startPromise.finally(() => qr.stop())` zincirlemeli. `scanning` durumundaysa `await qr.stop()` ve ancak ondan sonra `clear()` çağırmalı. `isScanning` alanı yerine `getState()` kullanmalı. Cleanup'taki her kütüphane çağrısını try/catch'e almalı, çünkü kütüphane Error değil string fırlatıyor. Böylece `stopCamera` ile effect cleanup aynı tek kapatma yolunu kullanır.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/customer/scan` (yeniden yazıldı; emekliye ayrılan rota yok).

**Yeni mimari**
- `app/customer/scan/page.tsx` artık **sunucu bileşeni**: oturum + `?code=` derin linki + ödül özeti (`_server/scan-summary.ts`) ilk render'da; özet hata verirse sıfır yerine görünür uyarı ve "Yeniden yükle".
- İstemci adası `components/customer/m-tara/scan-experience.tsx` (kamera kahramanı, tam ekran vizör, elle giriş, galeri, çözüm kartı). Yan sütun (`scan-aside.tsx`) sunucu bileşeni, istemci JS'i yok. `loading.tsx` aynı ızgarada statik iskelet.
- Kamera yaşam döngüsü ortak `lib/hooks/use-qr-scanner.ts` (D1); sayfada `Html5Qrcode` yaşam döngüsü kodu kalmadı.
- **Yeni ortak çözücü** `lib/qr-resolve.ts` (saf): `/c/<token>` → kart, `/feedback/<kod>` → geri bildirim, düz kod → `plain` (sunucu önce QR, sonra kart dener), diğer her şey → `unknown` (istek atılmaz). Ayrıca `QR_CODE_PATTERN`, `CARD_TOKEN_PATTERN`, `feedbackHref(code, source)`, `cardHref`.
- **Yeni BFF** `POST /api/customer/scan/resolve` (`defineRoute`, yalnız CUSTOMER, zod, 40/dk/kullanıcı): `{ result: venue{status,…} | card{state,…} | unknown }`. `qr_scanned` YAZMAZ, personel listesi çekmez; yalnız `in_app_scan_resolved` (userId + kaynak + sonuç) huni olayı yazar (`after()`).
- Kart aktivasyonu tarama içinden: çözüm kartında "Kartı hesabıma bağla" → mevcut tek doğruluk kaynağı `POST /api/cards/[token]/activate` (koşullu yazma + denetim kaydı); `ALREADY_YOURS`, `ALREADY_ACTIVATED`, `CARD_BLOCKED`, 429 ve 401 ayrı ele alınır.
- Metinler yüzeye özgü `components/customer/m-tara/copy.ts` (TR/EN, uygulama dilini izler); ortak `messages/*.json`'a dokunulmadı. Tarihler Europe/Istanbul gününe göre ("bugün", "dün", "12 Eki").

**Özellik envanteri — yeni durum**

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Rota koruması | ÇALIŞIYOR | Proxy + sunucu sayfasında rol kontrolü (CUSTOMER değilse girişe). BFF `requireAuth(['CUSTOMER'])`. |
| 2 | Segment metadata | ÇALIŞIYOR | `layout.tsx` korundu. |
| 3 | Masaüstü sayfa başlığı | ÇALIŞIYOR | `PageHeader` (QDL): mobilde de görünür, tek `h1`. |
| 4 | Mobil başlık kartı | KALDIRILDI | Tekrarlı ikinci `h1` gereksizdi; tek `PageHeader` her genişlikte görünüyor. |
| 5 | "Kamera ile tara" boşta kartı | ÇALIŞIYOR | Kahraman bölüm: izin durumuna göre (prompt ön açıklaması / reddedildi rehberi / hata) değişen içerik, nefes alan mini vizör (`Ambient`, azaltılmış harekette statik). |
| 6 | "Kamerayı Aç" butonu | ÇALIŞIYOR | Açılırken "Kamera açılıyor…", hata ya da izin reddinde "Tekrar dene". |
| 7 | Kamera başlatma | ÇALIŞIYOR | Ortak kanca: `setTimeout` hilesi yok, açılış sürerken kapatma kamerayı gerçekten kapatır (B-2). İzin önceden verilmişse dokunmatik cihazda kendiliğinden açılır. |
| 8 | Okunan metinden kod çıkarma | ÇALIŞIYOR | `lib/qr-resolve.ts`; `slice(-8)` kaldırıldı (B-6). Kart QR'ı da tanınıyor. |
| 9 | Okunan kodu doğrulayıp yönlendirme | ÇALIŞIYOR | BFF çözümü + "Kod doğrulanıyor…" durumu; hata yakalanıp vizörde gösteriliyor (B-4). Yönlendirme yalnız "Geri bildirime başla" ile, `?src=in_app_<kaynak>` atfıyla. |
| 10 | Kamerayı kapat (X) | ÇALIŞIYOR | Vizörün sol üstünde; Esc ile de kapanır, açılış sürerken de güvenli. |
| 11 | Kamerayı kapat (alt buton) | KALDIRILDI | Tam ekran vizörde tek kapatma (X + Esc) yeterli. Yerine "Kodu elle gir" geldi: kamerayı kapatıp alana odaklanır. |
| 12 | Kamera hatası satır içi mesajı | ÇALIŞIYOR | Kalıcı: hata kodu kahramanda kalıyor (`permission-denied`, `not-found`, `in-use`, `insecure-context`, `unsupported`, `policy-blocked` vb.) (B-5). |
| 13 | Kamera hatası toast'ı | KALDIRILDI | Kaybolan toast yerine kalıcı satır içi durum + platforma özgü izin rehberi (iOS, Android, masaüstü). |
| 14 | Okuma vizörü | ÇALIŞIYOR | Markalı köşeli çerçeve + dış gölge; kütüphanenin gölgesi ve "Scanner paused" yazısı gizli. Okumada çerçeve yeşile döner ve kısa bir "snap" yapar. |
| 15 | Unmount'ta kamera temizliği | ÇALIŞIYOR | Ortak kancanın idempotent kapanışı (B-1). |
| 16 | "veya" ayırıcı | KALDIRILDI | Bölümler kendi başlıklarıyla ayrışıyor; `bg-background` uyumsuzluğu da ortadan kalktı. |
| 17 | Manuel kod alanı | ÇALIŞIYOR | Görünür `label`. Bağlantı yapıştırılınca kod çıkarılıp hemen çözülüyor, `maxLength` kesmesi yok. Eski tireli kodlar (`DEMO-CAFE-001`) ve kart token'ı da kabul ediliyor (B-8). |
| 18 | Manuel gönder butonu + spinner | ÇALIŞIYOR | `aria-busy`. |
| 19 | Enter / "Git" ile gönderme | ÇALIŞIYOR | `<form onSubmit>` + `enterKeyHint="go"`. |
| 20 | Boş kod doğrulaması | ÇALIŞIYOR | Alan altı hata (`role="alert"`), odak alana gider. |
| 21 | Hata ayrımı | ÇALIŞIYOR | `not_found`, `inactive`, `expired`, `revoked`, `archived` + `offline`, `network`, `rate_limited` (saniyeli), `session`, `server`; her biri eyleme dönük metinle (B-3). |
| 22 | "Puan kazan" bilgi kartı | ÇALIŞIYOR | Statik pazarlama metni yerine gerçek veri: bakiye, puan matrisinden taban ve detaylı ödül, bugün kalan tavan (`lib/economy/caps`). Tavana ulaşıldıysa dürüst bilgi. Çözüm kartında da aynı ödül bloğu var. |
| 23 | Giriş animasyonları | ÇALIŞIYOR | `lib/motion` token'ları + `useMotionPolicy`; stagger ≤ 0,12 sn. |
| 24 | Tarama analitiği | ÇALIŞIYOR | Uygulama içi taramada `qr_scanned` artık tek kez yazılıyor (geri bildirim sayfası). Ek olarak `in_app_scan_resolved` (userId + kaynak + sonuç) (B-7). |
| 25 | Tarama hız limiti | ÇALIŞIYOR | BFF 40/dk/kullanıcı; public tarama limiti uygulama içi akışta yalnız bir kez tüketiliyor. |
| 26 | i18n | ÇALIŞIYOR | Yüzey metinleri TR/EN; `admin-toast` ve sabit "Dikkat:" öneki kaldırıldı (B-9). |
| 27 | PWA kısayolu | ÇALIŞIYOR | Değişmedi (manifest sahiplik dışı). |
| 28 | Menüde giriş noktası | ÇALIŞIYOR | Navigasyon kaydında merkez "Tara" sekmesi (navigasyon ajanı, `lib/navigation/registry.ts`) (B-10). |
| 29 | Ön/arka kamera değiştirme | ÇALIŞIYOR | Birden çok kamera varsa vizörde düğme görünür. |
| 30 | El feneri | ÇALIŞIYOR | `MediaStreamTrack` `torch` yeteneği varsa (Android Chrome) çalışır; yoksa düğme hiç gösterilmez. |
| 31 | Galeriden QR okuma | ÇALIŞIYOR | `html5-qrcode.scanFile` (dinamik yükleme); okunamazsa açık mesaj. |
| 32 | Haptik/görsel onay | ÇALIŞIYOR | Okumada titreşim (hareket politikasına bağlı) + yeşil çerçeve; tanınmayan kodda kısa çift titreşim. |
| 33 | İzin ön açıklaması + red rehberi | ÇALIŞIYOR | Permissions API ile `prompt` ve `denied` ayrımı, platforma özgü adımlar, alternatifler (elle giriş, galeri). |
| 34 | Son mekânlar | ÇALIŞIYOR | Son 4 işletme (geri bildirimlerden tekilleştirilmiş), mekân detayına (`/customer/places/[dealerId]`) bağlı; boş durumda dürüst metin. |
| 35 | Deep link `?code=` | ÇALIŞIYOR | Açılışta çözülüyor, alan dolduruluyor, adres temizleniyor. |
| 36 | Çevrimdışı durumu | ÇALIŞIYOR | `navigator.onLine` + fetch hatası ayrımı; net "bağlantı yok" metni. Kuyruğa alma uygulanmadı (aşağıda). |
| 37 | Ölü kod | KALDIRILDI | Sayfa baştan yazıldı. |
| — | **Yeni:** yakınlaştırma (zoom) | ÇALIŞIYOR | Kamera izi `zoom` destekliyorsa vizörde kaydırıcı. |
| — | **Yeni:** kart aktivasyonu | ÇALIŞIYOR | Kart QR'ı → `unused`, `mine`, `taken`, `blocked`, `not_found`. "Bağla" → başarı anı + "Kartıma git". Aktif kartı olmayana "Kartımı okut" ipucu. |
| — | **Yeni:** gizlilik notu | ÇALIŞIYOR | "Görüntü yalnız cihazında işlenir". |

**Kapanan bulgular (12/12):** B-1, B-2 (ortak kanca), B-3, B-4, B-5, B-6, B-7, B-8, B-9, B-10 (navigasyon ajanı + bu sayfa), B-11 (sayfada kopya tarayıcı kodu kalmadı; ortak kanca), B-12 (tek `h1` + `h2` bölümler, `role="status"` vizör durumu, Radix dialog odak tuzağı/Esc/odak dönüşü, vizör `aria-label`).

**Kalanlar**
- Çevrimdışı kod **kuyruğa alma** yapılmadı. Geri bildirim ancak hedef sayfada gönderilebildiği için kuyruğa alınan kod kullanıcıyı yanıltırdı; bunun yerine açık "bağlantı yok" durumu gösteriliyor.
- Geri bildirim sayfası (`/feedback/[code]`, sahiplik dışı) `?src=in_app_*` atfını henüz `/api/qr-codes/public` ve `/api/feedbacks` (`attributionSource`) çağrılarına taşımıyor. Bunu o yüzeyin sahibi yapmalı.
- Mekân başına geri bildirim bekleme süresi gösterilmedi: `checkFeedbackPerQrRateLimit` IP anahtarlı ve sayacı okumak hak tüketiyor (salt-okur sorgu yok).
- `/api/cards/[token]/activate` c_token yüzeyinin ucu; tarama onu yalnız istemci olarak çağırıyor (eski `{code}` gövdesini ve zarf v2 gövdesini okuyabiliyor).
- Görsel doğrulama: dev server ve build bu dalgada yasak olduğundan vizör ekran görüntüsüyle doğrulanmadı. tsc, eslint ve jest (28 test) yeşil.
