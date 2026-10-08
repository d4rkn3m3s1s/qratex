# /customer/my-card

**Amaç:** Müşterinin etkinleştirdiği fiziksel/dijital QR kartını (PhysicalCard) göstermek: kasada okutulacak QR, kart durumu, tüketim sayısı, son işlemler, paylaşım ve Apple/Google Wallet'a ekleme. Menüde "Kartım" grubunun ilk sayfası (`components/dashboard/sidebar.tsx:283`).

**Genel puan: 4.5 / 10** · **Karar: yeniden tasarla**

Sayfa "premium kart" hissi hedefliyor ve masaüstünde kısmen başarıyor. Ama sayfanın tek kritik işi olan **telefonda kasaya QR göstermek** bozuk: mobil genişlikte kart içeriği kırpılıyor, QR isim satırının üstüne biniyor. Bunun dışında Wallet butonları büyük olasılıkla hiçbir ortamda çalışmıyor, boş durumdaki "QR tara" akışı kart QR'ını tanımıyor, "Paylaş" da kullanıcının adını ve fotoğrafını herkese açan, süresi dolmayan bir taşıyıcı token'ı yayıyor.

> Yöntem notu: Mobil yerleşim bulgusu tahmine dayanmıyor. Kart DOM'u birebir kopyalandı, projenin kendi Tailwind 3.4.19 CLI'ı ile derlendi (scratchpad, proje dosyalarına dokunulmadı) ve headless Chrome'da ölçüldü. Kod, DB, dev server ve build çalıştırılmadı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Kart listesi, QR büyütme, kopyalama ve kısayollar çalışıyor. Wallet entegrasyonları fiilen sahte, boş durum akışı kırık, hata durumu yok. |
| UX | 4/10 | Asıl nesne (kart/QR), üç tanıtım bloğunun altında kalıyor. Bilgi üç kez tekrarlanıyor (tüketim sayısı, tarih, paylaş, tüketimler linki). Puan, seviye veya ödül ilerlemesi yok. |
| Görsel | 5/10 | Masaüstünde kart estetiği güçlü. Ama 3D tilt, ışık bandı ve "Kart sahibi" etiketi CSS'i üretilmediği için çalışmıyor. Mobilde kart kırpılıyor. |
| Mimari | 5/10 | 800 satırlık tek client bileşen. Veri katmanı yok (SWR/cache yok). API fazla alan sızdırıyor, alan adı sabit kodlanmış, i18n büyük ölçüde atlanmış. |
| Performans | 6/10 | `qrcode` dinamik import edilmiş, bu iyi. Ama fare hareketinde tüm kart yeniden render oluyor, görünmez sonsuz animasyon dönüyor, API'de 3 sıralı sorgu var. |
| Erişilebilirlik + Mobil | 3/10 | Mobilde QR kırpılıyor. Çevrimdışıyken (mekânda zayıf sinyal) kart "yok" görünüyor. 10px %40 beyaz etiketler AA kontrastını karşılamıyor. Dialog açıklaması yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Segment metadata (başlık/açıklama) | ÇALIŞIYOR | `app/customer/my-card/layout.tsx:4-6`, `messages/tr.json:43-44` | Açıklama "seviye sinyalleri" diyor ama sayfada seviye yok. |
| 2 | Yetki (CUSTOMER rolü) | ÇALIŞIYOR | `proxy.ts:53`, `app/api/customer/cards/route.ts:17` | API `customerId: session.user.id` ile filtreliyor, IDOR yok. |
| 3 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:471-486`, `app/customer/loading.tsx` | İskelet gerçek yerleşimle tam örtüşmüyor (kart en sonda). |
| 4 | Hata durumu | BOZUK | `page.tsx:340-374` | `res.ok` kontrol edilmiyor. 403/500/ağ hatasında `cards=[]` kalıyor ve kullanıcı "Henüz kartın yok" görüyor. Yeniden dene butonu yok. |
| 5 | Masaüstü başlık | ÇALIŞIYOR | `page.tsx:490-493`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex`. |
| 6 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:495-500` | Ekranın üstünde gereksiz bir blok daha. |
| 7 | Hero "Üyelik / Tek kart, tüm işletmeler" | ÇALIŞIYOR | `page.tsx:502-515` | Statik pazarlama metni, işlevi yok. |
| 8 | Stat: Kart sayısı | ÇALIŞIYOR | `page.tsx:517`, `route.ts:71` | Pratikte hep 1, bilgi değeri düşük. |
| 9 | Stat: Tüketim | ÇALIŞIYOR | `page.tsx:518`, `route.ts:55-58` | |
| 10 | Stat: "Yorum" | KISMİ | `page.tsx:519`, `route.ts:60-65` | Değer **yorum bekleyen** tüketim sayısı ama etiket sadece "Yorum". Kullanıcı bunu yazdığı yorum sayısı sanır. |
| 11 | "Paylaşım nasıl çalışır?" bilgi kartı | KISMİ | `page.tsx:524-551` | "Kişisel parola içermez" diyerek güven veriyor. Oysa link sahibin adını ve fotoğrafını açık ediyor ve kalıcı bir tüketim kimliği (bkz. B3). |
| 12 | Boş durum + "QR tara" CTA | BOZUK | `page.tsx:553-570` → `app/customer/scan/page.tsx:23-38` | Müşteri tarayıcısı yalnız `/feedback/<kod>` tanıyor. Kart QR'ı (`/c/<token>`) son 8 karaktere kırpılıp QR kodu olarak doğrulanıyor ve "bulunamadı" hatası veriyor. Kartı etkinleştirme yolu kapalı. |
| 13 | Çoklu kart listesi | KISMİ | `page.tsx:572-686`, `route.ts:24-27` | Admin karakter testi sentetik kartları (`blockReason: '[KARAKTER-TEST]'`, `app/api/admin/character-test/route.ts:182-185`) filtrelenmeden kullanıcıya gösteriliyor. |
| 14 | Kart giriş animasyonu (stagger) | ÇALIŞIYOR | `page.tsx:574-579` | Azaltılmış hareket korunuyor. |
| 15 | EMV çip, Wifi (temassız) ikonu, Crown filigranı | SAHTE | `page.tsx:95-107, 206, 221` | NFC/temassız özellik yok. Kredi kartı skeuomorfizmi var olmayan bir yeteneği ima ediyor. |
| 16 | "Signature Member" unvanı | SAHTE | `page.tsx:215-217` | Herkese sabit yazılmış. Kullanıcının `level`/lig/puan verisiyle ilgisi yok. |
| 17 | Kart durum rozeti | ÇALIŞIYOR | `page.tsx:222-230`, `lib/utils.ts:230-249` | Etiketler TR'ye sabit. |
| 18 | Kart üstü tüketim sayısı | ÇALIŞIYOR | `page.tsx:238-241` | |
| 19 | Aktivasyon tarihi | ÇALIŞIYOR | `page.tsx:243-248` | |
| 20 | Kart üstü QR önizleme | BOZUK (mobil) | `page.tsx:174, 235, 251-276` | `aspect-[1.586/1] overflow-hidden` kutu, mobilde dikey yığılan içeriği sığdıramıyor. Ölçüm (headless Chrome, 500px viewport): kart 18–311px, QR butonu 233–376px, alt satır 193–295px. QR alt satırın üstüne biniyor ve kartın dışına taşıp kırpılıyor. |
| 21 | QR'a dokun ve büyüt (dialog) | ÇALIŞIYOR | `page.tsx:252-256, 466-469` | |
| 22 | Kart sahibi adı ve etiketi | KISMİ | `page.tsx:283-284` | `text-white/38` Tailwind 3 opaklık ölçeğinde yok, CSS üretilmiyor. Etiket gövde rengini (açık temada `rgb(10,10,10)`) miras alıyor ve koyu kart üzerinde görünmüyor (ölçüldü). |
| 23 | Maskeli token + göster/gizle | KISMİ | `page.tsx:153-154, 287-299` | "Göster" tam token'ı değil, ilk 12 karakteri ve "…" gösteriyor. Gizli hâl son 8 karakteri gösteriyor. İki hâl farklı parçaları gösterdiği için kafa karıştırıcı. "ID" butonu zaten tam token'ı kopyalıyor. |
| 24 | 3D tilt (fareyle eğilme) | BOZUK | `page.tsx:157, 165-168` | (a) `perspective-[1400px]` Tailwind 3.4'te yardımcı sınıf değil, CSS üretilmiyor (doğrulandı: corePlugins'te "perspective" yok). (b) framer-motion 11.18.2 `useStyle`, memo'lanmış ilk `transform` değerini (`initial y:20`) ham `style.transform`'un üzerine yazıyor (`node_modules/framer-motion/dist/cjs/m.js:1285-1294`). Bu yüzden tilt dizesi DOM'a ulaşmıyor. (b) kod okumasıyla tespit edildi, tarayıcıda doğrulanmadı. |
| 25 | Fare parlaması (glare) | ÇALIŞIYOR | `page.tsx:197-203` | Yalnız masaüstü. Dokunmatik ve jiroskop karşılığı yok. |
| 26 | Yavaş ışık bandı animasyonu | BOZUK | `page.tsx:189-195` | `via-white/12` CSS üretmiyor. Gradyan `transparent→transparent` (ölçüldü: `rgba(0,0,0,0)` iki uç). Görünmez bir eleman sonsuz döngüde animasyon yapıyor. Ayrıca framer `x` animasyonu Tailwind `rotate-[18deg]`'i eziyor. |
| 27 | Azaltılmış hareket desteği | ÇALIŞIYOR | `page.tsx:319, 136, 160, 189, 705` | |
| 28 | "ID" kopyala | KISMİ | `page.tsx:378-381` | `writeText` await edilmiyor, hata yakalanmıyor. İzin reddinde bile "başarılı" toast'ı çıkıyor. Toast öneki ASCII "Basarili:" (`lib/admin-toast.ts`). |
| 29 | "URL" kopyala | KISMİ | `page.tsx:383-387` | Aynı sorun. |
| 30 | Paylaş (Web Share API) | KISMİ | `page.tsx:389-404` | Kullanıcı paylaşım sayfasını iptal edince (`AbortError`) catch, `copyUrl`'i çağırıyor ve yanlış "URL kopyalandı" toast'ı çıkıyor. Paylaşılan içerik gizlilik riski taşıyor (B3). |
| 31 | Kısayol: Tüketimlerim | ÇALIŞIYOR | `page.tsx:611-622` | Her kart için tekrarlanıyor (karta özel değil). |
| 32 | Kısayol: Harcama Özetim | ÇALIŞIYOR | `page.tsx:623-634` | Aynı. |
| 33 | Bilgi kartı: tüketim + tarih | ÇALIŞIYOR | `page.tsx:639-648` | Kart yüzündeki bilginin birebir tekrarı. |
| 34 | Son işlemler listesi | KISMİ | `page.tsx:650-668`, `route.ts:33-34` | UI `slice(0,4)` yapıyor, API `take:3` döndürüyor. Ürün adı alınıyor ama gösterilmiyor. Kazanılan puan, yorum durumu ve satıra tıklama yok. |
| 35 | "Tüm tüketimler" butonu | ÇALIŞIYOR | `page.tsx:671-676` | Kısayol 31 ile aynı hedef. |
| 36 | İkinci "Paylaş" butonu | ÇALIŞIYOR | `page.tsx:677-680` | Aynı kartta üçüncü paylaş yolu (601, 677, dialog 735). |
| 37 | Büyük QR dialog'u | KISMİ | `page.tsx:689-768` | `DialogDescription` yok (Radix a11y uyarısı). QR henüz üretilmediyse boş beyaz kutu gösteriliyor (`715`). Parlaklık ve ekran kilidi (wake lock) yönetimi yok. |
| 38 | Dialog: URL gösterimi + Kopyala | ÇALIŞIYOR | `page.tsx:726-734` | |
| 39 | Dialog: Paylaş | KISMİ | `page.tsx:735-738` | #30 ile aynı. |
| 40 | Apple Wallet'a ekle | SAHTE | `page.tsx:413-440`, `app/api/wallet/apple/route.ts:32-43`, `lib/wallet.ts:211-238` | Sertifika env'leri yoksa 503 dönüyor (yerel `.env`'de dördü de yok; üretim doğrulanmadı). Yapılandırılsa bile `.pkpass` içinde **zorunlu `icon.png` yok** ve iOS paketi geçersiz sayar. `teamIdentifier` env yoksa `'XXXXXXXXXX'` (`lib/wallet.ts:34`). Bu env yapılandırma kontrolüne dahil değil. Buton koşulsuz gösteriliyor. |
| 41 | Google Wallet'a ekle | SAHTE | `page.tsx:442-464`, `app/api/wallet/google/route.ts:85-99` | Env yoksa 200 + `fallbackUrl` dönüyor ve UI "henüz yapılandırılmamış" bilgi toast'ı gösteriyor. JWT yalnız `genericObjects` içeriyor. `genericClasses` tanımı ve sınıfı oluşturan kod yok (`lib/wallet.ts:345-354`); konsolda önceden oluşturulmadıysa kayıt başarısız olur (doğrulanmadı). `window.open` await'ten sonra çağrılıyor ve iOS/Safari'de pop-up engeline takılabilir. |
| 42 | "Yorum bekleyen tüketimler" CTA kartı | KISMİ | `page.tsx:770-798` | `?hasReview=false` derin linki tüketimler sayfasında okunmuyor (`app/customer/consumptions/page.tsx:67`, filtre hep `'all'` başlıyor). En değerli aksiyon sayfanın en altında. |
| 43 | QR hedef alan adı | KISMİ | `page.tsx:41` | `https://demoqratex.vercel.app` sabit kodlanmış. Preview/yerel ortamda üretilen QR canlıya gidiyor. Wallet pass'leri `NEXT_PUBLIC_APP_URL \|\| 'https://qratex.com'` kullanıyor (`lib/wallet.ts:35, 267`), yani iki yerde farklı QR içeriği olabilir. |
| 44 | Çevrimdışı kart erişimi | EKSİK | `next.config.*` runtimeCaching `/api/` hariç (`pathname.startsWith('/api/') return false`) | Mekânda sinyal zayıfken fetch başarısız oluyor ve "Henüz kartın yok" görünüyor. Kart/QR yerel olarak saklanmıyor. |
| 45 | İngilizce (EN) yerelleştirme | KISMİ | `page.tsx` içinde yalnız 3 `t()` çağrısı (`296, 518`) | Yaklaşık 50 sabit TR metin ve İngilizce "Signature Member"/"Digital" sabitleri var. EN kullanıcı karışık dil görüyor. |
| 46 | Puan / seviye / lig / sonraki ödül ilerlemesi | EKSİK | — | Sadakat kartı sayfasında bakiye yok. Wallet pass'leri `points/level` basıyor ama web kartı basmıyor. |
| 47 | Kayıp kart bildir / kartı dondur / token yenile | EKSİK | `app/api/customer/*` içinde kart yönetim ucu yok | Token kalıcı ve müşteri iptal edemiyor. |
| 48 | Ekran parlaklığı / wake lock / "kasada göster" modu | EKSİK | — | |
| 49 | Dinamik (dönen) QR veya kısa ömürlü kasa kodu | EKSİK | — | Statik token ekran görüntüsüyle kopyalanabiliyor. |

**Durum sayımı:** ÇALIŞIYOR 21 · KISMİ 14 · BOZUK 5 · SAHTE 4 · EKSİK 5 (toplam 49).

---

## Bulgular

### B1 — Mobilde kart içeriği kırpılıyor, QR isim satırının üstüne biniyor
- **Önem:** kritik · **Kategori:** işlevsellik / mobil
- **Kanıt:** `page.tsx:174` (`aspect-[1.586/1] ... overflow-hidden`), `page.tsx:235` (`flex-col ... sm:flex-row`), `page.tsx:259-269` (QR 6.5rem). Ölçüm: 500px viewport'ta kart yüksekliği 293px; QR butonu 233→376px (kart alt kenarı 311px). Alt satır 193→295px ile çakışıyor. "Kart sahibi" etiketi ve aktivasyon kutusu üst üste biniyor. 768px'te sorun yok.
- **Sorun:** `overflow:hidden` kutuyu scroll container yapıyor. CSS aspect-ratio'nun "içeriğe göre büyüme" (automatic minimum size) davranışı bu yüzden devre dışı kalıyor. Mobilde içerik ~480px isterken kutu ~230px'e kilitleniyor. Sayfanın temel kullanım anı (telefonda kasaya QR göstermek) en sık kullanılan cihazda bozuk.
- **Öneri:** Kartı iki ayrı nesneye bölün. (1) Yalnızca kimlik ve marka taşıyan, oranı sabit ve içeriği az bir **kart yüzü** (logo, unvan/kademe, isim, maskeli ID). (2) Kartın hemen altında, oranı serbest, tam genişlik bir **"Kasada göster" QR paneli**. Mobilde QR'ı kartın içine sıkıştırmak yerine dokununca tam ekran açılan bir "pay sheet" kullanın. QR kart içinde kalacaksa yalnızca `sm:` ve üstünde gösterin. Kutuya `overflow-hidden` yerine `overflow-clip` + `min-h-fit` yaklaşımı ya da `container query` (`@container`) ile küçük genişlikte kompakt düzen uygulayın. Görsel regresyonu önlemek için 360/390/768px'te Playwright ekran görüntüsü testi ekleyin.
- **Efor:** M

### B2 — Wallet entegrasyonları fiilen sahte, butonlar koşulsuz gösteriliyor
- **Önem:** yüksek · **Kategori:** işlevsellik / güven
- **Kanıt:** `app/api/wallet/apple/route.ts:32-43` (env yoksa 503), `lib/wallet.ts:220-223` (yorum: "placeholder… production'da gerçek görseller okunur"; `icon.png` eklenmiyor), `lib/wallet.ts:34` (`teamIdentifier` varsayılanı `'XXXXXXXXXX'`), `lib/wallet.ts:378-381` (seri numarasında `Date.now()` olduğu için her indirmede yeni pass oluşuyor), `lib/wallet.ts:112-114` (`webServiceURL` yorum satırı, pass güncellenmiyor), `app/api/wallet/google/route.ts:85-99` (yapılandırılmamışken 200 + info toast), `lib/wallet.ts:345-354` (`genericClasses` yok). Yerel `.env`'de Apple ve Google wallet env'lerinin hiçbiri yok. Üretim ortamı doğrulanmadı.
- **Sorun:** Kullanıcı premium bir "Cüzdana ekle" vaadi görüp hata veya "henüz yapılandırılmamış" mesajı alıyor. Sertifikalar eklense bile Apple paketi `icon.png` olmadığı için iOS'ta reddedilir. Pass'teki puan/seviye anlık görüntü olarak donuyor, her indirme Wallet'ta yinelenen kart üretiyor.
- **Öneri:** Kısa vadede sayfa açılışında var olan `POST /api/wallet/{apple,google}` uygunluk uçlarını (`route.ts:139-180`) tek bir `GET /api/wallet/availability` altında birleştirin. Butonları yalnız `configured && hasActiveCard` iken ve platforma göre (iOS'ta Apple, Android'de Google) gösterin. Uzun vadede gerçek bir pass hattı kurun: `public/pass/` altında `icon.png`/`icon@2x.png`/`logo.png`; deterministik `serialNumber = hash(cardId)`; Apple PassKit web service (`/v1/devices/.../registrations`, `authenticationToken`) ve Google `genericClass` + `PATCH` ile puan/seviye değişiminde push güncelleme. Apple indirmesini blob + `a.download` yerine doğrudan navigasyonla (`location.href = '/api/wallet/apple?cardId=…'`) yapın, çünkü iOS Safari'de Wallet'ı yalnız doğru içerik türüyle navigasyon tetikler (doğrulanmadı).
- **Efor:** L

### B3 — "Paylaş", adı ve fotoğrafı açık eden kalıcı bir taşıyıcı token'ı yayıyor
- **Önem:** yüksek · **Kategori:** güvenlik / gizlilik
- **Kanıt:** `page.tsx:389-397` (paylaşım metni "QRateX dijital kartımı inceleyin!"), `app/api/cards/[token]/route.ts:22-73` (kimlik doğrulamasız uç, `customer.id/name/image` döndürüyor), `app/c/[token]/page.tsx:213-226` (sahibin adı ve fotoğrafı herkese gösteriliyor), `app/api/dealer/consumptions/route.ts:141-176` (herhangi bir DEALER yalnız token ile o müşteriye tüketim yazabiliyor; yorumda "Passive puan minting burada"), müşteri tarafında token yenileme veya dondurma ucu yok (`app/api/customer/` listesi).
- **Sorun:** Token hem kimlik hem kasa yetkisi. Sayfa bunu sosyal paylaşıma teşvik ediyor ve "kişisel parola içermez" diyerek riski küçümsüyor (`page.tsx:534`). Link alan herkes kullanıcının tam adını ve fotoğrafını görebiliyor. Token'ı ele geçiren herhangi bir bayi hesabı (veya işbirliği yapan bir bayi) bu karta tüketim ve pasif puan yazabiliyor. Sızan token iptal edilemiyor.
- **Öneri:** (1) Kart paylaşımını kaldırın. Sadakat kartı paylaşılacak bir nesne değil; davet amacı `/customer/referral`'da zaten var. (2) `/api/cards/[token]` yanıtında aktif kartlar için kimlik bilgisi döndürmeyin: sahibin kendisi değilse yalnız `{status:'ACTIVATED'}` dönsün, isim ve foto yalnız oturum sahibine gitsin. (3) Kasa doğrulamasını statik token'dan ayırın: kartın QR'ı kısa ömürlü imzalı bir kod (`HMAC(cardId, 30-60sn pencere)`, TOTP benzeri) taşısın, bayi tüketimi bu kodla yazsın. Statik token yalnız fiziksel kart etkinleştirmede kullanılsın. (4) `POST /api/customer/cards/:id/rotate` ve `/:id/freeze` uçları ve sayfada "Kartımı kaybettim" akışı ekleyin (CardAuditLog'a yazarak). Bu değişiklik puan ekonomisi değişmezlerine (fraud görünürlüğü) dokunduğu için memory'deki "points-economy-invariants" kurallarına göre tasarlanmalı.
- **Efor:** L

### B4 — Boş durum CTA'sı kartı etkinleştiremiyor
- **Önem:** yüksek · **Kategori:** işlevsellik / onboarding
- **Kanıt:** `page.tsx:561-567` → `/customer/scan`. `app/customer/scan/page.tsx:23-38`: `extractCodeFromDecoded` yalnız `/feedback/` kalıbını tanıyor, kart URL'sinin son 8 karakterini QR kodu sanıp `/api/qr-codes/public/` ile doğruluyor ve `customerScan.notFound` hatası veriyor.
- **Sorun:** Kartı olmayan yeni kullanıcı sayfanın önerdiği tek yolu izleyince hata alıyor. Kart etkinleştirme ancak telefonun yerel kamerasıyla `/c/<token>` açılırsa çalışıyor.
- **Öneri:** Müşteri tarayıcısında URL ayrıştırmayı genelleyin: `/c/<token>` görürse `router.push('/c/'+token)` yapsın. Daha iyisi, `my-card` boş durumunu sayfa içinde bir "Kart etkinleştir" akışına çevirin (kamera + elle kod girme → `POST /api/cards/[token]/activate`). Uzun vadede kayıtta otomatik dijital kart verin (bkz. Eksik özellikler); fiziksel kart yalnız isteğe bağlı bağlama olsun.
- **Efor:** S (yönlendirme) / M (sayfa içi akış)

### B5 — Hata ve çevrimdışı durumu "kartın yok" olarak gösteriliyor
- **Önem:** yüksek · **Kategori:** işlevsellik / dayanıklılık
- **Kanıt:** `page.tsx:340-374` (`res.ok` yok, catch yalnız `console.error`), `page.tsx:553` (boş dizi → boş durum), `next.config.*` runtimeCaching'de `/api/` hariç.
- **Sorun:** Kullanıcı kasadayken sinyal düştüğünde veya API 500 verdiğinde kartının silindiğini sanıyor. Bu sayfanın en çok kullanıldığı fiziksel bağlam (mekân içi, zayıf bağlantı) tam olarak bu.
- **Öneri:** Veri çekmeyi `useSWR` (veya projedeki ortak fetch kancası) ile yapın ve `error` / `isLoading` / `data` durumlarını ayırın; hata kartında "Yeniden dene" olsun. Son başarılı kart yanıtını (token + üretilmiş QR data URL'i) IndexedDB/localStorage'da kullanıcı kimliğiyle anahtarlayarak saklayın ve çevrimdışıyken "Son senkron: 2 sa önce" rozetiyle gösterin. Dinamik QR'a geçilirse (B3) çevrimdışı için cihazda imzalanabilen kısa ömürlü bir yedek kod düşünülmeli.
- **Efor:** M

### B6 — 3D tilt ve ışık bandı çalışmıyor; görünmez sonsuz animasyon dönüyor
- **Önem:** orta · **Kategori:** görsel / performans
- **Kanıt:** `page.tsx:157` `perspective-[1400px]` (Tailwind 3.4.19 corePlugins'te yok, derlenmiş CSS'te 0 eşleşme), `page.tsx:191` `via-white/12` (varsayılan opaklık ölçeğinde 12 yok, gradyan `transparent→transparent` olarak ölçüldü), `page.tsx:165-168` ile framer `useStyle` memo'lanmış ilk transform (`m.js:1285-1294`), `page.tsx:130-146` (her `mousemove`'da iki `setState`).
- **Sorun:** Tasarımcının amaçladığı "canlı kart" hissi oluşmuyor. Buna karşılık her kartta görünmez bir eleman sonsuz animasyon yapıyor, fare hareketinde QR görseli dahil tüm kart ağacı yeniden render oluyor.
- **Öneri:** Tilt ve glare'i `useMotionValue` + `useSpring` + `useTransform` ile render'sız yapın (`style={{ rotateX, rotateY }}` motion value olarak verildiğinde framer transform'u kendisi kurar). Perspektifi `style={{ perspective: 1400 }}` ile verin. Mobilde tilt yerine `DeviceOrientation` (izinle, iOS'ta `requestPermission`) ile hafif parallax kullanın ya da hiç kullanmayın. Işık bandını `via-white/[0.12]` ile düzeltin, `animate` yerine yalnız sayfa girişinde tek seferlik "parlama" (shine sweep) yapın. Sonsuz döngüyü kaldırın veya `IntersectionObserver` ile görünürken çalıştırın.
- **Efor:** S

### B7 — Bilgi mimarisi: asıl nesne sayfanın altında, bilgi üç kez tekrarlanıyor
- **Önem:** orta · **Kategori:** UX
- **Kanıt:** Sıra: başlık (`490-500`) → hero + 3 stat (`502-522`) → "Paylaşım nasıl çalışır" (`524-551`) → kart (`581`). Tekrarlar: tüketim sayısı (`240`, `518`, `642`), aktivasyon tarihi (`246`, `646`), Paylaş (`601`, `677`, `735`), tüketimler linki (`611`, `671`). "Yorum yap" CTA'sı en altta (`770`).
- **Sorun:** Mobilde kullanıcı QR'a ulaşmak için yaklaşık iki ekran kaydırıyor. Ölçülebilir tek aksiyon olan "yorum yaz, puan kazan" en dipte kalıyor. Tekrarlar hiyerarşiyi düzleştiriyor.
- **Öneri:** Hedef sıra: **Kart (QR erişimi) → Bakiye ve ilerleme şeridi → Bekleyen aksiyonlar (yorum bekleyen N tüketim) → Son aktivite → Kart yönetimi (cüzdan, kayıp/dondur)**. "Nasıl çalışır" bloğunu ilk ziyarette bir kez gösterilen kapatılabilir bir ipucuna (`localStorage` bayrağı veya onboarding sheet) taşıyın. "Kart" stat'ını kaldırın, "Yorum" stat'ını "Yorum bekliyor" olarak adlandırıp tıklanabilir yapın.
- **Efor:** M

### B8 — Yorum CTA derin linki çalışmıyor
- **Önem:** orta · **Kategori:** işlevsellik
- **Kanıt:** `page.tsx:789` `/customer/consumptions?hasReview=false`. `app/customer/consumptions/page.tsx:67` filtre `useState('all')`, `useSearchParams` kullanılmıyor.
- **Sorun:** Kullanıcı "Yorum yap"a basıyor ama tüm tüketimleri görüyor; bekleyenleri kendisi bulmak zorunda.
- **Öneri:** Tüketimler sayfasında filtreyi URL ile senkronlayın (`useSearchParams` → başlangıç durumu, filtre değişince `router.replace`). Parametre adını UI diliyle hizalayın (`?filter=pending`). Daha iyisi, my-card'da en eski bekleyen tüketim için doğrudan inline "Puanla" kartı gösterin.
- **Efor:** S

### B9 — Kopyala/paylaş hata yönetimi ve yanlış geri bildirim
- **Önem:** orta · **Kategori:** hata yönetimi / UX
- **Kanıt:** `page.tsx:378-387` (`writeText` await ve catch yok), `page.tsx:398-400` (paylaşımda iptal → "kopyalandı" toast'ı), `lib/admin-toast.ts` (müşteri yüzüne "Basarili:" / "Dikkat:" önekleri; Türkçe karakter yok, admin tonu; 26 müşteri dosyası bu toast'ı kullanıyor).
- **Sorun:** Yanlış pozitif geri bildirim ve işlenmeyen promise reddi. Tüketici panelinde "Basarili:" yazımı marka kalitesini düşürüyor.
- **Öneri:** `copyToClipboard(text): Promise<boolean>` yardımcısı yazın (try/catch, gerekirse `execCommand` yedeği) ve toast'ı sonuca göre gösterin. `navigator.share` hatasında `err.name === 'AbortError'` ise sessiz kalın. Müşteri yüzü için önek eklemeyen ayrı bir `customer-toast` (veya doğrudan `sonner`) kullanın.
- **Efor:** S

### B10 — API fazla veri döndürüyor, test kartları sızıyor, sorgular sıralı
- **Önem:** orta · **Kategori:** mimari / güvenlik (veri minimizasyonu) / performans
- **Kanıt:** `app/api/customer/cards/route.ts:24-50`. `include` kullanıldığı için PhysicalCard'ın tüm skaler alanları (`batchId`, `blockReason`, `blockedAt`) ve Consumption'ın tüm alanları (bayi iç notu `note`, `amount`, `dealerId`) dönüyor (`prisma/schema.prisma` PhysicalCard/Consumption). `[KARAKTER-TEST]` sentetik kartları filtrelenmiyor (`app/api/admin/character-test/route.ts:182-185`; tahmin edilebilir token `chartest-<userId8>-…`). Üç sorgu sıralı çalışıyor (`24`, `55`, `60`). Cache yok.
- **Sorun:** Bayinin dahili notu müşteriye gidiyor. Test verisi gerçek kullanıcı arayüzünde görünüyor; tahmin edilebilir token'lı ACTIVATED kart bir saldırı yüzeyi. Gereksiz gecikme var.
- **Öneri:** `select` ile açık bir DTO tanımlayın (`id, status, activatedAt, tokenMasked, consumptionsCount, recent[] {id, createdAt, dealer{businessName,businessLogo}, product{name}, hasReview, pointsEarned}`). `where: { NOT: { blockReason: '[KARAKTER-TEST]' } }` ekleyin ya da test kartlarını ayrı bir bayrakla (`isSynthetic`) işaretleyin. Sorguları `Promise.all` ile paralel çalıştırın; `totalConsumptions`'ı kartların `_count` toplamından türetin. Tam token'ı yalnız QR üretimi için ayrı, kısa ömürlü bir uçtan verin (B3 ile birlikte).
- **Efor:** S

### B11 — Sabit alan adı ve tutarsız QR içeriği
- **Önem:** düşük · **Kategori:** mimari
- **Kanıt:** `page.tsx:41` ve `app/admin/cards/cards-client.tsx:82` `'https://demoqratex.vercel.app'`; `lib/wallet.ts:35, 267, 349` `NEXT_PUBLIC_APP_URL || 'https://qratex.com'`.
- **Sorun:** Alan adı değişikliğinde basılı kartlar ve uygulama farklı yerlere gider. Preview/yerelde canlı QR üretilir.
- **Öneri:** Tek bir `getPublicCardUrl(token)` yardımcısı yazın (`lib/public-app-origin.ts` içinde, `NEXT_PUBLIC_APP_URL` kaynaklı) ve hem web, hem admin, hem wallet bunu kullansın. Basılı kartlar için kalıcı bir kısa alan adı (ör. `q.<marka>/c/…`) ve yönlendirme kuralı belirleyin.
- **Efor:** S

### B12 — Yerelleştirme ve dil karışıklığı
- **Önem:** düşük · **Kategori:** i18n
- **Kanıt:** `page.tsx` içinde yaklaşık 50 sabit TR metin; `"Signature Member"`, `"Digital"` İngilizce sabit (`216`, `304`); `getCardStatusLabel` TR sabit (`lib/utils.ts:230-237`). Uygulama `en` destekliyor (`lib/app-locale.tsx:15-16`). Başlık "Dijital Kartlarım", menü/metadata "Kartım".
- **Öneri:** Tüm metinleri `customerMyCard.*` anahtarlarına taşıyın, `formatDate` / `formatRelativeTime`'ı aktif locale ile çağırın, başlığı menüyle hizalayın.
- **Efor:** S

### B13 — Erişilebilirlik ayrıntıları
- **Önem:** düşük · **Kategori:** a11y
- **Kanıt:** 10px `text-white/40` etiketler koyu zemin üzerinde (≈ 3.6:1, AA 4.5:1 altında): `238, 244, 272`. Dialog'da `DialogDescription` yok (`690-696`). Kart yüzünde semantik yok; "Tüketim 12" ekran okuyucuya bağlamsız okunuyor. Yükleniyor durumunda `aria-busy` yok.
- **Öneri:** Etiketleri en az `text-white/60` ve 11–12px yapın. Kartı `role="group" aria-label="QRateX üyelik kartı, Aktif"` olarak işaretleyin. Dialog'a görünmez açıklama ekleyin. İskelete `aria-busy="true"` ve sr-only "Kartlar yükleniyor" metni ekleyin.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Bakiye ve ilerleme kartın üzerinde (Starbucks Rewards):** Puan bakiyesi, kademe (seviye/lig) ve "sonraki ödüle X puan" halkası kartın kendisinde olmalı. Şu an "Signature Member" sahte bir unvan; gerçek `user.level`/lig verisiyle kademeye göre kart teması (renk/malzeme) değişmeli.
2. **"Kasada göster" modu (Starbucks Pay / Apple Wallet hissi):** Tam ekran QR, ekran parlaklığını artırma ipucu, `navigator.wakeLock` ile ekranın kapanmasını engelleme, dönen kısa ömürlü kod ve geri sayım halkası.
3. **Otomatik dijital kart:** Kayıtta herkese bir dijital kart verilmeli; fiziksel kart isteğe bağlı bağlanabilmeli. Şu an fiziksel kartı olmayan kullanıcının bu sayfada yapabileceği hiçbir şey yok.
4. **Kart güvenliği (Revolut/Monzo):** Kartı dondur/çöz, kayıp bildir, yeni kod üret, son kullanım yerleri ("Bu kart son 7 günde 3 işletmede kullanıldı") ve şüpheli kullanım bildirimi.
5. **Çalışan cüzdan entegrasyonu ve canlı güncelleme:** Wallet pass'inde puan değiştikçe push güncelleme, konum tabanlı bildirim (pass `locations` alanıyla favori işletmelere yaklaşınca kart kilit ekranında).
6. **Bekleyen aksiyonlar ve kart üstü mikro-anlar (Duolingo):** "2 tüketimin puanlanmayı bekliyor, +40 XP", günlük seri durumu ve son kazanılan rozet; satır içi hızlı puanlama.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Telefonu çıkar, tek dokunuşla kasada göster, ne kazandığını gör." Sayfa bir pazarlama tanıtım sayfası değil, bir **cüzdan ekranı** gibi davranmalı: ilk ekranda kart ve QR erişimi, hemen altında bakiye/ilerleme ve bekleyen aksiyon, en altta yönetim.

**Yerleşim (mobil öncelikli):**
1. **Kart yüzü** (oranı sabit, az içerik): marka, kademe adı ve kademe rengi (`level`/lig verisinden), isim, maskeli ID, sağ altta küçük bir "QR" rozeti. Dokununca → 2.
2. **Kasada göster sayfası** (alttan açılan sheet, mobilde tam ekran): büyük QR (dinamik kod + 30 sn halka), "Parlaklığı artırın" ipucu, wake lock, altında maskeli ID ve "Kod çalışmadı mı? Kasiyere söyle: ABCD-1234" yedeği.
3. **Bakiye şeridi:** puan, kademe ilerleme çubuğu, "sonraki ödül" ve seri. Veri `/api/customer/stats`'tan; sayfa API'sine eklenebilir.
4. **Bekleyen aksiyonlar:** en eski 1–2 yorumsuz tüketim için satır içi yıldız seçici ve "Tümü (N)" linki (filtreli).
5. **Son aktivite:** işletme logosu, ürün, kazanılan puan, yorum durumu. Satır tüketim detayına gider.
6. **Kart yönetimi:** Cüzdana ekle (yalnız uygun platform ve yapılandırılmışsa), Dondur/Kayıp bildir, Kod yenile. "Paylaş" kaldırılır.
7. "Nasıl çalışır" tek seferlik kapatılabilir ipucu olur.

**Motion/3D (ölçülü):**
- Kart girişinde tek seferlik "shine sweep" (600–800ms) ve spring ile yerleşme. Sonsuz döngü yok.
- Masaüstünde motion value tabanlı tilt (±4°) ve glare. Mobilde tilt yok; isteğe bağlı, izinli, düşük genlikli jiroskop parallax.
- Kart → QR sheet geçişinde `layoutId` paylaşımlı geçiş: kart büyüyerek QR panele dönüşür. Bu, sayfanın imza anı olabilir.
- Kademe yükseldiğinde kart yüzünde tek seferlik malzeme değişimi (ör. mat → holografik) ve konfeti yerine ince parçacık ışıltısı. Mevcut rozet/karakter sistemiyle görsel dil uyumlu olmalı.
- three.js gerekmiyor: CSS/framer yeterli ve daha hafif. Bu sayfa hız ve güvenilirlik sayfası.
- `useReducedMotion` korunmalı: tüm geçişler opaklıkla sınırlanmalı.

**Veri/API değişiklikleri:**
- `GET /api/customer/cards` → açık DTO (`select`), test kartı filtresi, `Promise.all`, `pointsEarned`/`hasReview` alanları, `balance {points, level, nextRewardAt}` ve `wallet {appleAvailable, googleAvailable}` bayrakları. Kısa TTL'li Redis cache (kullanıcı anahtarlı, tüketim/yorum yazımında invalidasyon).
- `GET /api/customer/cards/:id/pass-code` → kısa ömürlü imzalı kasa kodu (HMAC + zaman penceresi). Bayi `POST /api/dealer/consumptions` bu kodu doğrular; statik token yalnız etkinleştirme için.
- `POST /api/customer/cards/:id/{freeze,unfreeze,rotate}` + `CardAuditLog` kaydı.
- `/api/cards/[token]` → aktif kartta oturum sahibine değilse kimlik bilgisi dönmez.
- İstemci: `useSWR` + IndexedDB'de son kart anlık görüntüsü (çevrimdışı), `copyToClipboard` yardımcısı, tüm metinler i18n anahtarlarında.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/consumptions`:** Bu sayfadaki "Son işlemler" listesi, iki ayrı "Tüketimler" linki ve "Yorum bekleyen" CTA'sı o sayfanın işini kısmen tekrarlıyor. Öneri: my-card yalnız son 3 aktiviteyi ve **bekleyen aksiyonu** göstersin, tam liste ve filtreler tüketimler sayfasında kalsın. Filtre URL senkronu (B8) iki sayfayı bağlar.
- **`/customer/spending-overview`:** Yalnız kısayol olarak bağlı; çakışma yok. "Kartım" grubundaki yeri doğru.
- **`/c/[token]`:** Etkinleştirme ve sahiplik sayfası. Kart sahibi buraya gelirse doğrudan my-card'a yönlenmeli (zaten link var, `app/c/[token]/page.tsx:241`). Kimlik ifşası B3'te ele alındı.
- **`/customer/scan`:** Geri bildirim QR'ı ile kart QR'ını ayırt etmiyor. Tek bir "Tara" girişinin iki tür kodu da yönlendirmesi gerekiyor (B4).
- **`/customer/referral`:** Paylaşım amacının doğru yeri burası; my-card'daki "Paylaş" kaldırılmalı.
- **`/customer` (dashboard):** Dashboard puanı gösteriyor, kartı göstermiyor. Dashboard'a "Kasada göster" kısayolu (my-card'daki QR sheet'i açan) eklenmesi, my-card'ın sadakat kartı ve cüzdan sayfası olarak konumlanmasını güçlendirir. Sayfanın kaldırılması veya başka sayfayla birleştirilmesi önerilmez; **yeniden tasarlanarak "cüzdan ekranı"na dönüştürülmesi** önerilir.

---

## Doğrulama (şüpheci inceleme)

Yöntem: tüm iddialar salt okunur kod okumasıyla yeniden kontrol edildi (sayfa, `app/api/customer/cards`, `app/api/cards/[token]`, `app/c/[token]`, `app/api/dealer/consumptions`, `app/api/wallet/apple`, `lib/wallet.ts`, `lib/api-auth.ts`, `lib/validations.ts`, `proxy.ts`, `next.config` runtimeCaching, Prisma `PhysicalCard`). Yerleşim iddiası için ayrıca sade CSS ile birebir yeniden kurulan bir replika headless Chrome'da ölçüldü. Veritabanına, dev server'a, build'e dokunulmadı.

### 1. Mobilde kart/QR kırpılıyor ve üst üste biniyor — **DOĞRULANDI (kritik)**
- Kart yüzü `aspect-[1.586/1] … overflow-hidden` (`page.tsx:174`). CSS spesifikasyonuna göre aspect-ratio kutusunun içerik tabanlı otomatik min-yüksekliği yalnız `overflow: visible` iken uygulanır; `overflow-hidden` olduğu için kutu içeriğe göre büyümez, oranla sabit kalır.
- İçerik `sm` altında dikey yığılıyor (`:235` `flex-col`, `:251` QR bloğu); orta blok `min-h-0 flex-1` olduğundan küçülüyor, içerik taşıyor ve alttaki `mt-auto` satırının (`:280`) altına giriyor.
- Kendi replika ölçümüm (headless Chrome, 500px pencere; daha dar telefonlarda durum daha kötü): kart 2–295px, QR butonu 217–360px, alt satır 177–279px. QR'ın yarıdan fazlası kırpılıyor, görünen kısmın çoğu alt satırın arkasında; QR'ın üst bölgesine `elementFromPoint` QR butonunu değil alt satırı döndürüyor. Denetçinin ölçümüyle (233–376 / 311 / 193–295) tutarlı.
- Ağırlaştırıcı: "Büyük QR göster" butonu kaldırılmış (`:606`); büyük QR diyaloğunu açmanın TEK yolu bu kırpılan butondaki `onOpenQr` (`:587`). Telefonda kasada QR gösterme işi pratikte bozuk. `sm` (640px) ve üstünde sorun yok.
- Yeniden üretim: 375–639px genişlikte `/customer/my-card` aç → QR önizlemesi kartın alt kenarında kesik, "Kart sahibi" satırı QR'ın üstünde; QR'a dokunmak çoğu noktada diyaloğu açmıyor.
- Öneri: mobilde kart yüzü yalnız kimlik (çip, kademe, isim, son 8 hane) taşısın; QR kart yüzünden çıkarılıp kartın altında/üstünde tam genişlikte, her zaman görünür bir "Kasada göster" yüzeyine (bottom sheet + parlaklık artırma) taşınsın. Kart yüzü için `aspect-ratio` korunacaksa içerik kutuya göre tasarlanmalı (sabit yükseklik bütçesi), aksi halde mobilde `aspect-auto` + `min-h` kullanılmalı.

### 2. Kart token'ı paylaşımla yayılıyor; kimliksiz uç ad+foto döndürüyor; token kalıcı kasa yetkisi — **DOĞRULANDI (yüksek; "kritik" değil)**
- `proxy.ts:105-118`: `/api/*` için kimlik kontrolü yok; `GET /api/cards/[token]` (`route.ts:22-70`) aktif kartta `customer.id`, `name`, `image` döndürüyor, oturum/rate-limit yok. `/c/[token]` bunu herkese gösteriyor (`app/c/[token]/page.tsx:206-223`).
- Sayfa token'ı dışarı yaymaya aktif olarak teşvik ediyor: "Paylaş" iki yerde (`page.tsx:601`, `:677`) ve diyalogda (`:735`), metin "QRateX dijital kartımı inceleyin!" (`:395`); bilgi kutusu "kişisel parola içermez" diyor (`:534`) — teknik olarak doğru ama token'ın kasa yetkisi olduğunu gizliyor.
- `registerSchema` herkese `DEALER` rolünü seçtiriyor (`lib/validations.ts:39`), `requireAuth(['DEALER','ADMIN'])` ek onay istemiyor (`lib/api-auth.ts:52-80`). Token'ı bilen her bayi hesabı `POST /api/dealer/consumptions` ile o müşteriye tüketim, bildirim ve pasif puan yazabiliyor (`route.ts:141-351`); yanıtta müşterinin **e-postası** da dönüyor (`route.ts:250-256`, `:374`) — yorum "ham müşteri ID'si sızdırılmaz" diyor ama e-posta sızıyor.
- Müşteri tarafında token iptal/yenileme ucu yok; `physicalCard` güncellemeleri yalnız admin ve aktivasyon uçlarında (`app/api/admin/cards/[id]/*`, `app/api/cards/[token]/activate`).
- Şiddet kalibrasyonu: token nanoid, tahmin edilemez; fiziksel kartta zaten basılı ve kasada gösterilmek üzere tasarlanmış bir taşıyıcı kimlik. Yazılan tüketimler müşteriye puan kazandırır (zarar değil), rate limit kart+bayi başına var. Gerçek zarar: (a) paylaşılan linkle ad+fotoğraf ifşası, (b) sahte bayi hesabının bildirim spam'i/tüketim geçmişi kirletmesi ve müşteri e-postasını toplaması, (c) müşterinin sızan kodu iptal edememesi. Bu yüzden "yüksek", "kritik" değil.
- Yeniden üretim: Müşteri "Paylaş" ile linki bir gruba atar → gruptaki biri `/c/<token>` açar, oturumsuz ad+foto görür → aynı kişi DEALER olarak kayıt olur, `POST /api/dealer/consumptions {cardToken}` gönderir → müşteriye bildirim düşer, yanıtta müşterinin e-postası gelir.
- Öneri: "Paylaş" kaldırılsın (paylaşım amacı referral sayfasına); `/api/cards/[token]` aktif kartta yalnız oturum sahibine kimlik döndürsün, diğerlerine `{status:'ACTIVATED'}`; bayi yanıtından e-posta çıkarılsın; müşteriye "Kodu yenile / Dondur" (`CardAuditLog`'lu) eklensin; orta vadede kasa için kısa ömürlü HMAC kodu.

### 3. Hata/çevrimdışı durumunda "kartın yok" gösteriliyor — **DOĞRULANDI (yüksek)**
- `fetchCards` `res.ok`'u kontrol etmiyor (`page.tsx:340-343`); 403 (`app/api/customer/cards/route.ts:17-21`, oturum düşmüşse) veya 500 yanıtında `data.success` falsy → `cards` boş kalır; ağ hatasında `catch` yalnız `console.error` (`:371-372`). `loading=false` sonrası `cards.length === 0` dalı (`:553-570`) "Henüz kartın yok" + "QR tara" CTA'sı gösterir.
- `next.config` runtimeCaching `/api/` yollarını açıkça hariç tutuyor (`if (pathname.startsWith('/api/')) return false;`), yani PWA çevrimdışıyken kart verisi için yedek yok.
- Yeniden üretim: DevTools'ta "Offline" → sayfayı yenile (HTML `others` önbelleğinden gelir) → "Henüz kartın yok". Ya da sunucu 500 döndüğünde aynı ekran.
- Öneri: üç ayrı durum (yükleniyor / hata+yeniden dene / gerçekten kart yok); son başarılı kart anlık görüntüsü (token + QR data URL) IndexedDB'de tutulup çevrimdışıyken "son bilinen kart" rozetiyle gösterilsin — QR statik olduğundan kasada çalışmaya devam eder.

### 4. Apple Wallet pass'i yapılandırılsa bile geçersiz — **DOĞRULANDI (orta; bugünkü etki ölü buton)**
- `createPkPass` pakete yalnız `pass.json`, `manifest.json`, `signature` koyuyor (`lib/wallet.ts:220-235`); yorum "icon dosyaları eklenecek" diyor ama eklenmiyor (`:223-225`), `public/pass/` dizini yok. PassKit `icon.png`'yi her pass stili için zorunlu tutar; bu paket iOS'ta "geçersiz pass" olarak reddedilir.
- `teamIdentifier` varsayılanı `'XXXXXXXXXX'` (`lib/wallet.ts:34`) ve route'un yapılandırma kontrolü (`app/api/wallet/apple/route.ts:32-37`) `APPLE_TEAM_IDENTIFIER`'ı kapsamıyor; sertifikalar girilip Team ID unutulursa imza geçerli olsa da pass reddedilir.
- Bugünkü durum: yerel `.env*`'de `APPLE_PASS*` yok (canlı ortam doğrulanmadı). Yapılandırma yoksa uç 503 döndürüyor, UI düğmeyi koşulsuz gösteriyor (`page.tsx:744-753`) ve kullanıcı her basışta hata toast'ı görüyor. Hazır `POST /api/wallet/apple` (uygunluk kontrolü) UI'da kullanılmıyor. Ayrıca `<a download>` blob yöntemi iOS Safari'de pkpass'i Wallet'a doğrudan açmayabilir (doğrulanmadı).
- Şiddet: veri/güvenlik etkisi yok; bugün ölü buton, yapılandırılınca sessiz başarısızlık. "Orta".
- Öneri: `icon.png/@2x/@3x` + `logo.png` paketlensin; Team ID config kontrolüne eklensin; sayfa açılışında `POST /api/wallet/apple` ve Google karşılığı ile `{appleAvailable, googleAvailable}` alınıp yalnız uygun platformda (iOS → Apple, Android → Google) düğme gösterilsin; pkpass doğrudan `window.location` ile uca yönlendirilsin.
